require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const DEPARTMENTS = ["BA", "BSC", "BCOM", "BCA", "BBA", "MA", "MSC", "MCOM"];
const userSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["teacher", "principal", "admin"], required: true },
  department: { type: String, enum: [...DEPARTMENTS, null], default: null },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });
const User = mongoose.models.User || mongoose.model("User", userSchema);
async function upsertAccount({ name, username, password, role, department = null }) {
  if (!username || !password) return;
  if (String(password).length < 12) throw new Error(`${role} password must be at least 12 characters.`);
  const normalized = String(username).trim().toLowerCase();
  const passwordHash = await bcrypt.hash(String(password), 12);
  const existing = await User.findOne({ username: normalized });
  if (existing && existing.role !== role) throw new Error(`Username ${normalized} is already used by another role.`);
  await User.findOneAndUpdate({ username: normalized }, { $set: { name: name || role, username: normalized, passwordHash, role, department, isActive: true } }, { upsert: true, new: true, runValidators: true });
  console.log(`${role} account updated: ${normalized}`);
}
async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI is missing in .env");
  await mongoose.connect(uri);
  await upsertAccount({ name: process.env.ADMIN_NAME || "System Admin", username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD, role: "admin" });
  await upsertAccount({ name: process.env.PRINCIPAL_NAME || "Principal", username: process.env.PRINCIPAL_USERNAME, password: process.env.PRINCIPAL_PASSWORD, role: "principal" });
  const teachers = JSON.parse(process.env.DEPARTMENT_TEACHERS || "[]");
  for (const t of teachers) {
    const department = String(t.department || "").toUpperCase();
    if (!DEPARTMENTS.includes(department)) { console.log("Skipped invalid teacher department:", t.username || "(no username)"); continue; }
    await upsertAccount({ name: t.name || `${department} Teacher`, username: t.username, password: t.password, role: "teacher", department });
  }
  await mongoose.disconnect();
  console.log("Seed complete. Existing classes, students and attendance were not deleted.");
}
run().catch(async e => { console.error(e.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
