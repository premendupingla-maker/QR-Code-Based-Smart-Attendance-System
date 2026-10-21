const mongoose = require("mongoose");
const { Schema } = mongoose;

/* ---------------- Student ---------------- */
const studentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    roll: { type: String, required: true, unique: true, trim: true }, // this is the value encoded in the QR
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // hashed
    branch: { type: String, required: true },
    semester: { type: String, required: true },
    college: { type: String, default: "ABC College of Engineering" },
    photo: { type: String, default: "" },   // relative path e.g. /uploads/photos/xxx.jpg
    qrCode: { type: String, default: "" },  // base64 data URL of the generated QR image
  },
  { timestamps: true }
);

/* ---------------- Teacher ---------------- */
const teacherSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // hashed
    subjects: [{ type: String }], // subjects this teacher can take attendance for
  },
  { timestamps: true }
);

/* ---------------- Admin ---------------- */
const adminSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true }, // hashed
  },
  { timestamps: true }
);

/* ---------------- Attendance ---------------- */
const attendanceSchema = new Schema(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    subject: { type: String, required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD" - used for duplicate-scan prevention
    time: { type: String, required: true }, // "HH:MM:SS"
    status: { type: String, default: "Present" },
  },
  { timestamps: true }
);

// One attendance record per student, per subject, per day
attendanceSchema.index({ studentId: 1, subject: 1, date: 1 }, { unique: true });

/* ---------------- Subject ---------------- */
const subjectSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    branch: { type: String, default: "" },
    semester: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = {
  Student: mongoose.model("Student", studentSchema),
  Teacher: mongoose.model("Teacher", teacherSchema),
  Admin: mongoose.model("Admin", adminSchema),
  Attendance: mongoose.model("Attendance", attendanceSchema),
  Subject: mongoose.model("Subject", subjectSchema),
};
