const mongoose = require("mongoose");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/smartAttendance";
const JWT_SECRET = process.env.JWT_SECRET || "smart_attendance_super_secret_key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected:", MONGO_URI);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
};

module.exports = { connectDB, JWT_SECRET, JWT_EXPIRES_IN };
