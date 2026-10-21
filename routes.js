const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { Student, Teacher, Admin, Attendance, Subject } = require("./models");
const { JWT_SECRET, JWT_EXPIRES_IN } = require("./config");
const auth = require("./middleware");

const router = express.Router();

/* ============================================================
   FILE UPLOAD (student photos)
============================================================ */
const photoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "public/uploads/photos")),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage: photoStorage });

/* ============================================================
   HELPERS
============================================================ */
const signToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const todayDate = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const nowTime = () => new Date().toTimeString().slice(0, 8); // HH:MM:SS

// Generates a QR (base64 data URL) that encodes only the student's roll number
const generateStudentQR = async (roll) => {
  const payload = JSON.stringify({ id: roll });
  return QRCode.toDataURL(payload, { width: 300, margin: 2 });
};

/* ============================================================
   AUTH ROUTES
============================================================ */

// ---------- Student Login ----------
router.post("/auth/student/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const student = await Student.findOne({ email: email?.toLowerCase() });
    if (!student) return res.status(400).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, student.password);
    if (!match) return res.status(400).json({ message: "Invalid email or password" });

    const token = signToken({ id: student._id, role: "student", name: student.name });
    res.json({ token, role: "student", name: student.name, id: student._id });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ---------- Teacher Login ----------
router.post("/auth/teacher/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const teacher = await Teacher.findOne({ email: email?.toLowerCase() });
    if (!teacher) return res.status(400).json({ message: "Invalid email or password" });

    const match = await bcrypt.compare(password, teacher.password);
    if (!match) return res.status(400).json({ message: "Invalid email or password" });

    const token = signToken({ id: teacher._id, role: "teacher", name: teacher.name });
    res.json({ token, role: "teacher", name: teacher.name, id: teacher._id });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// ---------- Admin Login ----------
router.post("/auth/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(400).json({ message: "Invalid username or password" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(400).json({ message: "Invalid username or password" });

    const token = signToken({ id: admin._id, role: "admin", username: admin.username });
    res.json({ token, role: "admin", username: admin.username, id: admin._id });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* ============================================================
   STUDENT ROUTES  (auth: student)
============================================================ */

// Profile
router.get("/student/profile", auth("student"), async (req, res) => {
  const student = await Student.findById(req.user.id).select("-password");
  if (!student) return res.status(404).json({ message: "Student not found" });
  res.json(student);
});

// Attendance history + percentage (optionally filter by subject)
router.get("/student/attendance", auth("student"), async (req, res) => {
  const { subject } = req.query;
  const filter = { studentId: req.user.id };
  if (subject) filter.subject = subject;

  const records = await Attendance.find(filter).sort({ date: -1, time: -1 });

  // Percentage: distinct subjects worked out per subject + overall
  const subjects = [...new Set(records.map((r) => r.subject))];
  const bySubject = subjects.map((subj) => {
    const subjRecords = records.filter((r) => r.subject === subj);
    const present = subjRecords.filter((r) => r.status === "Present").length;
    return { subject: subj, total: subjRecords.length, present, percentage: subjRecords.length ? ((present / subjRecords.length) * 100).toFixed(1) : "0.0" };
  });

  const totalPresent = records.filter((r) => r.status === "Present").length;
  const overallPercentage = records.length ? ((totalPresent / records.length) * 100).toFixed(1) : "0.0";

  res.json({ history: records, bySubject, overallPercentage, totalClasses: records.length, totalPresent });
});

// Download / view QR ID card data
router.get("/student/qrcard", auth("student"), async (req, res) => {
  const student = await Student.findById(req.user.id).select("-password");
  if (!student) return res.status(404).json({ message: "Student not found" });

  // Regenerate QR on the fly if missing
  if (!student.qrCode) {
    student.qrCode = await generateStudentQR(student.roll);
    await student.save();
  }

  res.json({
    name: student.name,
    roll: student.roll,
    branch: student.branch,
    semester: student.semester,
    college: student.college,
    photo: student.photo,
    qrCode: student.qrCode,
  });
});

/* ============================================================
   TEACHER ROUTES  (auth: teacher)
============================================================ */

// Profile (includes subjects list for the dropdown)
router.get("/teacher/profile", auth("teacher"), async (req, res) => {
  const teacher = await Teacher.findById(req.user.id).select("-password");
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });
  res.json(teacher);
});

// List of all subjects (for dropdown, in case teacher takes any subject)
router.get("/teacher/subjects", auth("teacher"), async (req, res) => {
  const subjects = await Subject.find().sort({ name: 1 });
  res.json(subjects);
});

// Scan QR -> mark attendance
// body: { qrValue: '{"id":"ST101"}', subject: "Data Structures" }
router.post("/teacher/scan", auth("teacher"), async (req, res) => {
  try {
    const { qrValue, subject } = req.body;
    if (!qrValue || !subject) {
      return res.status(400).json({ message: "qrValue and subject are required" });
    }

    let parsed;
    try {
      parsed = JSON.parse(qrValue);
    } catch {
      return res.status(400).json({ message: "Invalid QR code format" });
    }

    const roll = parsed.id;
    const student = await Student.findOne({ roll });
    if (!student) return res.status(404).json({ message: "Student not recognized" });

    const date = todayDate();
    const time = nowTime();

    // Duplicate check (unique index also guards this at DB level)
    const existing = await Attendance.findOne({ studentId: student._id, subject, date });
    if (existing) {
      return res.status(409).json({
        message: `Attendance already marked for ${student.name} (${student.roll}) in ${subject} today`,
        student: { name: student.name, roll: student.roll },
      });
    }

    const record = await Attendance.create({
      studentId: student._id,
      teacherId: req.user.id,
      subject,
      date,
      time,
      status: "Present",
    });

    res.status(201).json({
      message: `Attendance marked for ${student.name} (${student.roll})`,
      record,
      student: { name: student.name, roll: student.roll, branch: student.branch, semester: student.semester },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Duplicate scan — attendance already recorded today" });
    }
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Today's attendance for a subject
router.get("/teacher/today", auth("teacher"), async (req, res) => {
  const { subject } = req.query;
  if (!subject) return res.status(400).json({ message: "subject query param required" });

  const records = await Attendance.find({ subject, date: todayDate() })
    .populate("studentId", "name roll branch semester")
    .sort({ time: -1 });

  res.json(records);
});

// Export attendance as CSV for a subject/date
router.get("/teacher/export", auth("teacher"), async (req, res) => {
  const { subject, date } = req.query;
  if (!subject) return res.status(400).json({ message: "subject query param required" });

  const filter = { subject, date: date || todayDate() };
  const records = await Attendance.find(filter).populate("studentId", "name roll branch semester").sort({ time: 1 });

  let csv = "Roll,Name,Branch,Semester,Subject,Date,Time,Status\n";
  records.forEach((r) => {
    csv += `${r.studentId?.roll || ""},${r.studentId?.name || ""},${r.studentId?.branch || ""},${r.studentId?.semester || ""},${r.subject},${r.date},${r.time},${r.status}\n`;
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="attendance_${subject}_${filter.date}.csv"`);
  res.send(csv);
});

/* ============================================================
   ADMIN ROUTES  (auth: admin)
============================================================ */

/* ---------- Students CRUD ---------- */

router.get("/admin/students", auth("admin"), async (req, res) => {
  const students = await Student.find().select("-password").sort({ createdAt: -1 });
  res.json(students);
});

router.post("/admin/students", auth("admin"), upload.single("photo"), async (req, res) => {
  try {
    const { name, roll, email, password, branch, semester, college } = req.body;
    if (!name || !roll || !email || !password || !branch || !semester) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const qrCode = await generateStudentQR(roll);
    const photo = req.file ? `/uploads/photos/${req.file.filename}` : "";

    const student = await Student.create({
      name, roll, email: email.toLowerCase(), password: hashed,
      branch, semester, college: college || undefined, photo, qrCode,
    });

    const { password: _pw, ...safe } = student.toObject();
    res.status(201).json(safe);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Roll number or email already exists" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/admin/students/:id", auth("admin"), upload.single("photo"), async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    } else {
      delete updates.password;
    }
    if (req.file) updates.photo = `/uploads/photos/${req.file.filename}`;

    // If roll number changes, regenerate the QR code
    if (updates.roll) {
      updates.qrCode = await generateStudentQR(updates.roll);
    }

    const student = await Student.findByIdAndUpdate(req.params.id, updates, { new: true }).select("-password");
    if (!student) return res.status(404).json({ message: "Student not found" });
    res.json(student);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.delete("/admin/students/:id", auth("admin"), async (req, res) => {
  const student = await Student.findByIdAndDelete(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });
  await Attendance.deleteMany({ studentId: student._id });
  res.json({ message: "Student deleted" });
});

// Regenerate / fetch QR card for any student (admin)
router.get("/admin/students/:id/qrcard", auth("admin"), async (req, res) => {
  const student = await Student.findById(req.params.id).select("-password");
  if (!student) return res.status(404).json({ message: "Student not found" });

  student.qrCode = await generateStudentQR(student.roll);
  await student.save();
  res.json(student);
});

/* ---------- Teachers CRUD ---------- */

router.get("/admin/teachers", auth("admin"), async (req, res) => {
  const teachers = await Teacher.find().select("-password").sort({ createdAt: -1 });
  res.json(teachers);
});

router.post("/admin/teachers", auth("admin"), async (req, res) => {
  try {
    const { name, email, password, subjects } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Missing required fields" });

    const hashed = await bcrypt.hash(password, 10);
    const teacher = await Teacher.create({
      name, email: email.toLowerCase(), password: hashed,
      subjects: Array.isArray(subjects) ? subjects : (subjects ? subjects.split(",").map((s) => s.trim()) : []),
    });

    const { password: _pw, ...safe } = teacher.toObject();
    res.status(201).json(safe);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Email already exists" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.put("/admin/teachers/:id", auth("admin"), async (req, res) => {
  const updates = { ...req.body };
  if (updates.password) updates.password = await bcrypt.hash(updates.password, 10);
  else delete updates.password;
  if (updates.subjects && !Array.isArray(updates.subjects)) {
    updates.subjects = updates.subjects.split(",").map((s) => s.trim());
  }
  const teacher = await Teacher.findByIdAndUpdate(req.params.id, updates, { new: true }).select("-password");
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });
  res.json(teacher);
});

router.delete("/admin/teachers/:id", auth("admin"), async (req, res) => {
  const teacher = await Teacher.findByIdAndDelete(req.params.id);
  if (!teacher) return res.status(404).json({ message: "Teacher not found" });
  res.json({ message: "Teacher deleted" });
});

/* ---------- Subjects ---------- */

router.get("/admin/subjects", auth("admin"), async (req, res) => {
  const subjects = await Subject.find().sort({ name: 1 });
  res.json(subjects);
});

// Public-ish (any logged in role) list of subjects — used by teacher dropdown too
router.get("/subjects", auth(), async (req, res) => {
  const subjects = await Subject.find().sort({ name: 1 });
  res.json(subjects);
});

router.post("/admin/subjects", auth("admin"), async (req, res) => {
  try {
    const { name, branch, semester } = req.body;
    if (!name) return res.status(400).json({ message: "Subject name required" });
    const subject = await Subject.create({ name, branch, semester });
    res.status(201).json(subject);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: "Subject already exists" });
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

router.delete("/admin/subjects/:id", auth("admin"), async (req, res) => {
  const subject = await Subject.findByIdAndDelete(req.params.id);
  if (!subject) return res.status(404).json({ message: "Subject not found" });
  res.json({ message: "Subject deleted" });
});

/* ---------- Branches (derived from students, kept simple) ---------- */

router.get("/admin/branches", auth("admin"), async (req, res) => {
  const branches = await Student.distinct("branch");
  res.json(branches);
});

/* ---------- Attendance (view all / reset) ---------- */

router.get("/admin/attendance", auth("admin"), async (req, res) => {
  const { subject, date, branch } = req.query;
  const filter = {};
  if (subject) filter.subject = subject;
  if (date) filter.date = date;

  let records = await Attendance.find(filter)
    .populate("studentId", "name roll branch semester")
    .populate("teacherId", "name")
    .sort({ date: -1, time: -1 });

  if (branch) records = records.filter((r) => r.studentId?.branch === branch);

  res.json(records);
});

// Reset attendance — all records, or scoped by subject/date if provided
router.delete("/admin/attendance/reset", auth("admin"), async (req, res) => {
  const { subject, date } = req.query;
  const filter = {};
  if (subject) filter.subject = subject;
  if (date) filter.date = date;

  const result = await Attendance.deleteMany(filter);
  res.json({ message: "Attendance reset", deletedCount: result.deletedCount });
});

module.exports = router;
