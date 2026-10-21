// Run once to create the first Admin account: npm run seed:admin
const bcrypt = require("bcrypt");
require("dotenv").config();
const { connectDB } = require("./config");
const { Admin } = require("./models");

(async () => {
  await connectDB();

  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  const existing = await Admin.findOne({ username });
  if (existing) {
    console.log(`Admin "${username}" already exists. Nothing to do.`);
    process.exit(0);
  }

  const hashed = await bcrypt.hash(password, 10);
  await Admin.create({ username, password: hashed });

  console.log(`✅ Admin created — username: "${username}", password: "${password}"`);
  console.log("Change this password after first login (via DB) for real use.");
  process.exit(0);
})();
