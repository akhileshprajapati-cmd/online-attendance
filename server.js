require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET .env file me kam se kam 32 characters ka hona chahiye.");
}

const DEPARTMENTS = [
    "BA", "BSC", "BCOM", "BCA",
    "BBA", "MA", "MSC", "MCOM"
];

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   DATABASE MODELS
========================= */

const userSchema = new mongoose.Schema({
    name: { type: String, default: "" },
    username: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: {
        type: String,
        enum: ["teacher", "principal", "admin"],
        required: true
    },
    department: {
        type: String,
        enum: [...DEPARTMENTS, null],
        default: null
    },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const classSchema = new mongoose.Schema({
    department: {
        type: String,
        enum: DEPARTMENTS,
        required: true
    },
    semester: { type: String, required: true },
    section: {
        type: String,
        enum: ["A", "B", "C", "D"],
        default: "A"
    },
    subject: { type: String, required: true },
    teacherName: { type: String, trim: true, default: "" },
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true });

const CollegeClass = mongoose.model("CollegeClass", classSchema);

const studentSchema = new mongoose.Schema({
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CollegeClass",
        required: true
    },
    roll: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, default: "" },
    passwordHash: { type: String, default: "" }
}, { timestamps: true });

studentSchema.index({ classId: 1, roll: 1 }, { unique: true });

const Student = mongoose.model("Student", studentSchema);

const attendanceSchema = new mongoose.Schema({
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "CollegeClass",
        required: true
    },
    date: { type: String, required: true },
    marks: [{
        studentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student"
        },
        status: {
            type: String,
            enum: ["P", "A"],
            required: true
        }
    }],
    markedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    }
}, { timestamps: true });

attendanceSchema.index({ classId: 1, date: 1 }, { unique: true });

const Attendance = mongoose.model("Attendance", attendanceSchema);

const teacherAttendanceSchema = new mongoose.Schema({
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    status: { type: String, enum: ["P", "A"], required: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });
teacherAttendanceSchema.index({ teacherId: 1, date: 1 }, { unique: true });
const TeacherAttendance = mongoose.model("TeacherAttendance", teacherAttendanceSchema);

/* =========================
   AUTHENTICATION
========================= */

function createToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function setLoginCookie(res, token) {
    res.cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
}

async function auth(req, res, next) {
    try {
        const token = req.cookies.token || (req.headers.authorization || "").replace("Bearer ", "");
        if (!token) return res.status(401).json({ message: "Please login first." });
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.id || !decoded.role) return res.status(401).json({ message: "Invalid session. Please login again." });
        if (decoded.role === "student") {
            const student = await Student.findById(decoded.id);
            if (!student || /^\[INACTIVE\]/.test(student.name)) {
                res.clearCookie("token");
                return res.status(401).json({ message: "Student account is archived or unavailable. Please contact the college." });
            }
        } else {
            const user = await User.findById(decoded.id);
            if (!user || user.isActive === false || user.role !== decoded.role) {
                res.clearCookie("token");
                return res.status(401).json({ message: "Your account is deactivated or unavailable. Please contact the administrator." });
            }
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Session expired or invalid. Please login again." });
    }
}

function allow(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Access denied." });
        }
        next();
    };
}

function validDateRange(from, to) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (from && !datePattern.test(from)) return false;
    if (to && !datePattern.test(to)) return false;
    if (from && to && from > to) return false;

    return true;
}

function getDateRange(req) {
    return {
        from: req.query.from || "",
        to: req.query.to || ""
    };
}

/* =========================
   CLASS ACCESS
========================= */

async function accessibleClass(req, res, next) {
    try {
        const item = await CollegeClass.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ message: "Class not found." });
        }

        if (req.user.role === "teacher") {
            if (
                String(item.teacherId) !== String(req.user.id) ||
                item.department !== req.user.department
            ) {
                return res.status(403).json({ message: "This class does not belong to you." });
            }
        }

        req.collegeClass = item;
        next();
    } catch {
        res.status(400).json({ message: "Invalid class ID." });
    }
}

/* =========================
   LOGIN ROUTES
========================= */

app.post("/api/auth/login", async (req, res) => {
    try {
        const department = String(req.body.department || "").trim().toUpperCase();
        const password = String(req.body.password || "");

        if (!DEPARTMENTS.includes(department) || !password) {
            return res.status(400).json({ message: "Please choose a department and enter its password." });
        }

        // One department account is selected by department; username is not required.
        const teacher = await User.findOne({
            role: "teacher",
            isActive: { $ne: false },
            department
        }).sort({ createdAt: 1 });

        if (!teacher || !(await bcrypt.compare(password, teacher.passwordHash))) {
            return res.status(401).json({ message: "Invalid teacher login details." });
        }

        const token = createToken({
            id: teacher._id,
            role: teacher.role,
            department: teacher.department
        });

        setLoginCookie(res, token);

        res.json({
            message: "Login successful.",
            user: {
                id: teacher._id,
                name: teacher.name,
                role: teacher.role,
                department: teacher.department
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Login error." });
    }
});

app.post("/api/auth/principal-login", async (req, res) => {
    try {
        const { username, password } = req.body;

        const principal = await User.findOne({
            username: String(username || "").trim().toLowerCase(),
            role: "principal",
            isActive: { $ne: false }
        });

        if (!principal || !(await bcrypt.compare(password || "", principal.passwordHash))) {
            return res.status(401).json({ message: "Invalid principal login details." });
        }

        const token = createToken({
            id: principal._id,
            role: "principal",
            department: null
        });

        setLoginCookie(res, token);

        res.json({
            message: "Login successful.",
            user: {
                id: principal._id,
                name: principal.name,
                username: principal.username,
                role: "principal"
            }
        });
    } catch {
        res.status(500).json({ message: "Principal login error." });
    }
});

app.post("/api/auth/admin-login", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim().toLowerCase();
        const password = String(req.body.password || "");
        const admin = await User.findOne({ username, role: "admin", isActive: { $ne: false } });
        if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
            return res.status(401).json({ message: "Invalid admin login details." });
        }
        setLoginCookie(res, createToken({ id: admin._id, role: "admin", department: null }));
        res.json({ message: "Admin login successful.", user: { id: admin._id, name: admin.name, username: admin.username, role: "admin" } });
    } catch (error) { res.status(500).json({ message: "Admin login error." }); }
});

app.post("/api/auth/student-login", async (req, res) => {
    try {
        const { department, semester, section, name, roll } = req.body;
        const cleanName = String(name || "").trim();
        const cleanRoll = String(roll || "").trim();
        if (!department || !semester || !cleanName || !cleanRoll) {
            return res.status(400).json({ message: "Department, semester, student name and roll number are required." });
        }
        const escapedName = cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const classes = await CollegeClass.find({
            department,
            semester,
            section: section || "A"
        });

        const classIds = classes.map(c => c._id);

        const matchingStudents = await Student.find({
            classId: { $in: classIds },
            roll: cleanRoll,
            $and: [
                { name: { $regex: "^" + escapedName + "$", $options: "i" } },
                { name: { $not: /^\[INACTIVE\]/ } }
            ]
        });

        if (matchingStudents.length !== 1) {
            return res.status(401).json({
                message: matchingStudents.length > 1
                    ? "Student is linked to multiple classes. Please contact the college."
                    : "Student details not found."
            });
        }

        const student = matchingStudents[0];

        const token = createToken({
            id: student._id,
            role: "student",
            classId: student.classId
        });

        setLoginCookie(res, token);

        res.json({
            message: "Student login successful.",
            user: {
                id: student._id,
                name: student.name,
                roll: student.roll,
                role: "student",
                classId: student.classId
            }
        });
    } catch {
        res.status(500).json({ message: "Student login error." });
    }
});

app.get("/api/auth/me", auth, async (req, res) => {
    if (req.user.role === "student") {
        const student = await Student.findById(req.user.id);

        if (!student) {
            return res.status(401).json({ message: "Student account not found." });
        }

        return res.json({
            user: {
                id: student._id,
                name: student.name,
                roll: student.roll,
                role: "student",
                classId: student.classId
            }
        });
    }

    const user = await User.findById(req.user.id).select("-passwordHash");

    if (!user) {
        return res.status(401).json({ message: "Account not found." });
    }

    res.json({ user });
});

app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ message: "Logged out successfully." });
});

/* =========================
   CLASS ROUTES
========================= */

app.get("/api/classes", auth, async (req, res) => {
    try {
        let filter = {};

        if (req.user.role === "teacher") {
            filter.teacherId = req.user.id;
            filter.department = req.user.department;
        } else if (req.user.role === "principal") {
            if (req.query.department) filter.department = req.query.department;
            if (req.query.semester) filter.semester = req.query.semester;
            if (req.query.section) filter.section = req.query.section;
        } else {
            filter._id = req.user.classId;
        }

        const classes = await CollegeClass.find(filter).sort({
            department: 1,
            semester: 1,
            section: 1
        });

        res.json({ classes });
    } catch {
        res.status(500).json({ message: "Could not load classes." });
    }
});

app.post("/api/classes", auth, allow("teacher"), async (req, res) => {
    try {
        const { semester, section, subject, teacherName } = req.body;

        if (!semester || !subject || !String(teacherName || "").trim()) {
            return res.status(400).json({ message: "Semester, subject and teacher name are required." });
        }

        const newClass = await CollegeClass.create({
            department: req.user.department,
            semester,
            section: section || "A",
            subject,
            teacherName: String(teacherName).trim(),
            teacherId: req.user.id
        });

        res.status(201).json({
            message: "Class created.",
            class: newClass
        });
    } catch {
        res.status(500).json({ message: "Could not create class." });
    }
});

/* =========================
   STUDENT MANAGEMENT
========================= */

app.get("/api/classes/:id/students", auth, accessibleClass, async (req, res) => {
    const students = await Student.find({
        classId: req.params.id,
        name: { $not: /^\[INACTIVE\]/ }
    }).sort({ roll: 1 });

    res.json({ students });
});

app.post("/api/classes/:id/students", auth, allow("teacher"), accessibleClass, async (req, res) => {
    try {
        const { name, roll, email } = req.body;

        if (!name || !roll) {
            return res.status(400).json({ message: "Student name and roll number are required." });
        }

        const student = await Student.create({
            classId: req.params.id,
            name: name.trim(),
            roll: String(roll).trim(),
            email: email || ""
        });

        res.status(201).json({
            message: "Student added.",
            student
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: "This roll number already exists in this class." });
        }
        res.status(500).json({ message: "Could not add student." });
    }
});

app.post("/api/classes/:id/students/bulk", auth, allow("teacher"), accessibleClass, async (req, res) => {
    try {
        const list = req.body.students;

        if (!Array.isArray(list) || !list.length) {
            return res.status(400).json({ message: "Student list is empty." });
        }

        const records = list
            .filter(s => s.name && s.roll)
            .map(s => ({
                classId: req.params.id,
                name: String(s.name).trim(),
                roll: String(s.roll).trim(),
                email: s.email || ""
            }));

        const result = await Student.insertMany(records, { ordered: false });

        res.json({
            message: "Students imported.",
            added: result.length
        });
    } catch {
        res.status(400).json({ message: "Some students could not be imported. Check duplicate roll numbers." });
    }
});

app.delete("/api/students/:id", auth, allow("teacher"), async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);

        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        const item = await CollegeClass.findById(student.classId);

        if (!item || String(item.teacherId) !== String(req.user.id)) {
            return res.status(403).json({ message: "Access denied." });
        }

        // Student is marked inactive; historical attendance is preserved.
        if (!student.name.startsWith("[INACTIVE]")) {
            student.name = "[INACTIVE] " + student.name;
            await student.save();
        }

        res.json({ message: "Student marked inactive. Old attendance is preserved." });
    } catch {
        res.status(500).json({ message: "Could not update student." });
    }
});

/* =========================
   ATTENDANCE ROUTES
========================= */

app.get("/api/classes/:id/attendance/:date", auth, allow("teacher", "principal"), accessibleClass, async (req, res) => {
    try {
        const attendance = await Attendance.findOne({
            classId: req.params.id,
            date: req.params.date
        });

        res.json({ attendance });
    } catch {
        res.status(500).json({ message: "Could not load attendance." });
    }
});

app.put("/api/classes/:id/attendance/:date", auth, allow("teacher", "admin"), accessibleClass, async (req, res) => {
    try {
        const { marks } = req.body;

        if (!Array.isArray(marks)) {
            return res.status(400).json({ message: "Attendance marks are required." });
        }

        const cleanMarks = marks.map(m => ({
            studentId: m.studentId,
            status: m.status === "P" ? "P" : "A"
        }));

        const attendance = await Attendance.findOneAndUpdate(
            {
                classId: req.params.id,
                date: req.params.date
            },
            {
                $set: {
                    marks: cleanMarks,
                    markedBy: req.user.id
                }
            },
            {
                new: true,
                upsert: true,
                runValidators: true
            }
        );

        res.json({
            message: "Attendance saved.",
            attendance
        });
    } catch {
        res.status(500).json({ message: "Could not save attendance." });
    }
});

/* =========================
   REPORT GENERATOR
   Date range is inclusive.
========================= */

async function getReport(classId, from, to) {
    const students = await Student.find({
        classId,
        name: { $not: /^\[INACTIVE\]/ }
    }).sort({ roll: 1 });

    const query = { classId };

    if (from || to) {
        query.date = {};
        if (from) query.date.$gte = from;
        if (to) query.date.$lte = to;
    }

    const attendanceDays = await Attendance.find(query).sort({ date: 1 });

    const dates = attendanceDays.map(day => day.date);

    const studentRows = students.map(student => {
        let present = 0;
        let total = 0;

        const dailyMarks = dates.map(date => {
            const day = attendanceDays.find(d => d.date === date);

            const mark = day.marks.find(
                m => String(m.studentId) === String(student._id)
            );

            const status = mark ? mark.status : "A";

            total++;

            if (status === "P") present++;

            return {
                date,
                status
            };
        });

        return {
            studentId: student._id,
            name: student.name,
            roll: student.roll,
            present,
            total,
            absent: total - present,
            percent: total ? Number((present / total * 100).toFixed(2)) : 0,
            dailyMarks
        };
    });

    return {
        dates,
        students: studentRows,
        totalStudents: students.length,
        totalAttendanceDays: dates.length,
        from: from || (dates[0] || ""),
        to: to || (dates[dates.length - 1] || "")
    };
}

app.get("/api/classes/:id/report", auth, allow("teacher", "principal"), accessibleClass, async (req, res) => {
    try {
        const { from, to } = getDateRange(req);

        if (!validDateRange(from, to)) {
            return res.status(400).json({ message: "Invalid date range." });
        }

        const report = await getReport(req.params.id, from, to);

        res.json({
            class: req.collegeClass,
            ...report
        });
    } catch {
        res.status(500).json({ message: "Could not generate report." });
    }
});

/* =========================
   PRINCIPAL OVERVIEW
========================= */

app.get("/api/principal/overview", auth, allow("principal"), async (req, res) => {
    try {
        const [classCount, studentCount, attendanceDays] = await Promise.all([
            CollegeClass.countDocuments(),
            Student.countDocuments({ name: { $not: /^\[INACTIVE\]/ } }),
            Attendance.countDocuments()
        ]);

        res.json({
            classCount,
            studentCount,
            attendanceDays
        });
    } catch {
        res.status(500).json({ message: "Could not load overview." });
    }
});

/* =========================
   STUDENT ATTENDANCE
========================= */

app.get("/api/student/my-attendance", auth, allow("student"), async (req, res) => {
    try {
        const { from, to } = getDateRange(req);

        if (!validDateRange(from, to)) {
            return res.status(400).json({ message: "Invalid date range." });
        }

        const student = await Student.findById(req.user.id);

        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        const item = await CollegeClass.findById(student.classId);

        if (!item) {
            return res.status(404).json({ message: "Class not found." });
        }

        const query = { classId: student.classId };

        if (from || to) {
            query.date = {};
            if (from) query.date.$gte = from;
            if (to) query.date.$lte = to;
        }

        const days = await Attendance.find(query).sort({ date: 1 });

        let present = 0;

        const history = days.map(day => {
            const mark = day.marks.find(
                m => String(m.studentId) === String(student._id)
            );

            const status = mark ? mark.status : "A";

            if (status === "P") present++;

            return {
                date: day.date,
                status
            };
        });

        const total = history.length;

        res.json({
            student: {
                name: student.name,
                roll: student.roll
            },
            class: item,
            from,
            to,
            present,
            absent: total - present,
            total,
            percent: total ? Number((present / total * 100).toFixed(2)) : 0,
            history
        });
    } catch {
        res.status(500).json({ message: "Could not load student attendance." });
    }
});


/* =========================
   ADMIN: FULL MANAGEMENT
========================= */
app.get("/api/admin/summary", auth, allow("admin"), async (req, res) => {
    const [teachers, students, classes, days, principals] = await Promise.all([
        User.countDocuments({ role: "teacher", isActive: { $ne: false } }),
        Student.countDocuments({ name: { $not: /^\[INACTIVE\]/ } }),
        CollegeClass.countDocuments({ subject: { $not: /^\[INACTIVE\]/ } }),
        Attendance.countDocuments(), User.countDocuments({ role: "principal", isActive: { $ne: false } })
    ]);
    res.json({ teachers, students, classes, attendanceDays: days, principals });
});
app.get("/api/admin/users", auth, allow("admin"), async (req, res) => {
    const users = await User.find({ $or: [{ role: "principal" }, { role: "teacher", department: { $in: DEPARTMENTS }, name: { $ne: "College Teacher" } }] }).select("-passwordHash").sort({ role: 1, department: 1, name: 1 });
    res.json({ users });
});
app.post("/api/admin/teachers", auth, allow("admin"), async (req, res) => {
    try {
        const { name, department } = req.body;
        if (!name || !String(name).trim() || !DEPARTMENTS.includes(department)) {
            return res.status(400).json({ message: "Teacher name and valid department are required." });
        }
        const base = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "teacher";
        let username;
        do { username = `${department.toLowerCase()}_${base}_${crypto.randomBytes(3).toString("hex")}`; }
        while (await User.exists({ username }));
        const hiddenPassword = crypto.randomBytes(24).toString("hex");
        const user = await User.create({
            name: String(name).trim(),
            username,
            passwordHash: await bcrypt.hash(hiddenPassword, 12),
            role: "teacher",
            department,
            isActive: true
        });
        res.status(201).json({ message: "Teacher added to attendance roster.", user: { id: user._id, name: user.name, username: user.username, role: user.role, department: user.department } });
    } catch (e) {
        res.status(500).json({ message: "Could not add teacher." });
    }
});
app.put("/api/admin/users/:id", auth, allow("admin"), async (req, res) => {
    try {
        const user = await User.findById(req.params.id); if (!user || !["teacher", "principal"].includes(user.role)) return res.status(404).json({ message: "Account not found." });
        if (req.body.name !== undefined) user.name = String(req.body.name).trim();
        if (req.body.username !== undefined) user.username = String(req.body.username).trim().toLowerCase();
        if (user.role === "teacher" && req.body.department !== undefined) { if (!DEPARTMENTS.includes(req.body.department)) return res.status(400).json({ message: "Invalid department." }); user.department = req.body.department; }
        if (req.body.password) { if (String(req.body.password).length < 12) return res.status(400).json({ message: "Password must be at least 12 characters." }); user.passwordHash = await bcrypt.hash(String(req.body.password), 12); }
        if (req.body.isActive !== undefined) user.isActive = Boolean(req.body.isActive);
        await user.save(); res.json({ message: "Account updated." });
    } catch (e) { res.status(e.code === 11000 ? 409 : 500).json({ message: e.code === 11000 ? "Username already exists." : "Could not update account." }); }
});
app.delete("/api/admin/users/:id", auth, allow("admin"), async (req, res) => {
    const user = await User.findById(req.params.id); if (!user || !["teacher", "principal"].includes(user.role)) return res.status(404).json({ message: "Account not found." });
    user.isActive = false; await user.save(); res.json({ message: "Account deactivated. Historical records are preserved." });
});
app.put("/api/admin/users/:id/activate", auth, allow("admin"), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user || !["teacher", "principal"].includes(user.role)) return res.status(404).json({ message: "Account not found." });
        user.isActive = true;
        await user.save();
        res.json({ message: "Account activated successfully." });
    } catch (error) { res.status(500).json({ message: "Could not activate account." }); }
});
app.get("/api/admin/classes", auth, allow("admin"), async (req, res) => {
    const classes = await CollegeClass.find().populate("teacherId", "name username department").sort({ department: 1, semester: 1 }); res.json({ classes });
});
app.put("/api/admin/classes/:id", auth, allow("admin"), async (req, res) => {
    const item = await CollegeClass.findById(req.params.id); if (!item) return res.status(404).json({ message: "Class not found." });
    for (const key of ["department", "semester", "section", "subject"]) if (req.body[key] !== undefined) item[key] = req.body[key];
    if (req.body.teacherId) { const t = await User.findOne({ _id: req.body.teacherId, role: "teacher", isActive: { $ne: false } }); if (!t) return res.status(400).json({ message: "Active teacher not found." }); item.teacherId = t._id; }
    await item.save(); res.json({ message: "Class updated." });
});
app.delete("/api/admin/classes/:id", auth, allow("admin"), async (req, res) => {
    const item = await CollegeClass.findById(req.params.id); if (!item) return res.status(404).json({ message: "Class not found." });
    if (!item.subject.startsWith("[INACTIVE]")) item.subject = "[INACTIVE] " + item.subject; await item.save(); res.json({ message: "Class archived; attendance history preserved." });
});
app.get("/api/admin/students", auth, allow("admin"), async (req, res) => {
    const students = await Student.find({ name: { $not: /^\[INACTIVE\]/ } }).populate({ path: "classId", populate: { path: "teacherId", select: "name" } }).sort({ name: 1 }); res.json({ students });
});
app.put("/api/admin/students/:id", auth, allow("admin"), async (req, res) => {
    const st = await Student.findById(req.params.id); if (!st) return res.status(404).json({ message: "Student not found." });
    for (const k of ["name", "roll", "email"]) if (req.body[k] !== undefined) st[k] = String(req.body[k]).trim(); await st.save(); res.json({ message: "Student updated." });
});
app.delete("/api/admin/students/:id", auth, allow("admin"), async (req, res) => {
    const st = await Student.findById(req.params.id); if (!st) return res.status(404).json({ message: "Student not found." });
    if (!st.name.startsWith("[INACTIVE]")) st.name = "[INACTIVE] " + st.name; await st.save(); res.json({ message: "Student archived; attendance history preserved." });
});
app.get("/api/admin/archived-students", auth, allow("admin"), async (req, res) => {
    try {
        const students = await Student.find({ name: /^\[INACTIVE\]/ })
            .populate({ path: "classId", populate: { path: "teacherId", select: "name" } })
            .sort({ updatedAt: -1 });
        res.json({ students });
    } catch (error) { res.status(500).json({ message: "Could not load archived students." }); }
});
app.post("/api/admin/students/:id/restore", auth, allow("admin"), async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ message: "Student not found." });
        if (/^\[INACTIVE\]\s*/.test(student.name)) student.name = student.name.replace(/^\[INACTIVE\]\s*/, "");
        await student.save();
        res.json({ message: "Student restored successfully. Previous attendance history is preserved." });
    } catch (error) {
        console.error("Student restore error:", error);
        if (error.code === 11000) return res.status(409).json({ message: "This roll number is already in use in this class." });
        res.status(500).json({ message: "Could not restore student." });
    }
});
app.get("/api/admin/attendance", auth, allow("admin"), async (req, res) => {
    const q = {}; if (req.query.from || req.query.to) { q.date = {}; if (req.query.from) q.date.$gte = req.query.from; if (req.query.to) q.date.$lte = req.query.to; }
    const records = await Attendance.find(q).populate("classId").populate("markedBy", "name").sort({ date: -1 }).limit(1000); res.json({ records });
});
app.get("/api/principal/teachers", auth, allow("principal"), async (req, res) => {
    const teachers = await User.find({ role: "teacher", isActive: { $ne: false }, department: { $in: ["BA","BSC","BCOM","BCA","BBA","MA","MSC","MCOM"] }, name: { $ne: "College Teacher" } }).select("name username department").sort({ department: 1, name: 1 }); res.json({ teachers });
});
app.get("/api/principal/teacher-attendance/:date", auth, allow("principal"), async (req, res) => {
    const records = await TeacherAttendance.find({ date: req.params.date }).populate("teacherId", "name department username"); res.json({ records });
});
app.get("/api/principal/teachers/:id/history", auth, allow("principal"), async (req, res) => {
    // Attendance history must always be fetched fresh; do not let browsers reuse an older teacher's response.
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    try {
        const teacher = await User.findOne({ _id: req.params.id, role: "teacher", department: { $in: DEPARTMENTS } }).select("name department username");
        if (!teacher) return res.status(404).json({ message: "Teacher not found." });
        const query = { teacherId: teacher._id };
        if (req.query.from || req.query.to) {
            query.date = {};
            if (req.query.from) query.date.$gte = req.query.from;
            if (req.query.to) query.date.$lte = req.query.to;
        }
        const records = await TeacherAttendance.find(query).sort({ date: -1 });
        const present = records.filter(r => r.status === "P").length;
        const absent = records.length - present;
        res.json({ teacher, records, present, absent, total: records.length, percent: records.length ? Number((present / records.length * 100).toFixed(1)) : 0 });
    } catch {
        res.status(500).json({ message: "Could not load teacher history." });
    }
});
app.put("/api/principal/teacher-attendance/:date", auth, allow("principal"), async (req, res) => {
    try {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date) || !Array.isArray(req.body.records)) return res.status(400).json({ message: "Valid date and records are required." });
        const ops = req.body.records.map(r => ({ updateOne: { filter: { teacherId: r.teacherId, date: req.params.date }, update: { $set: { status: r.status === "P" ? "P" : "A", markedBy: req.user.id } }, upsert: true } }));
        if (ops.length) await TeacherAttendance.bulkWrite(ops); res.json({ message: "Teacher attendance saved." });
    } catch (e) { res.status(500).json({ message: "Could not save teacher attendance." }); }
});
app.get("/api/admin/teacher-attendance", auth, allow("admin"), async (req, res) => {
    const records = await TeacherAttendance.find().populate("teacherId", "name department").populate("markedBy", "name").sort({ date: -1 }).limit(2000); res.json({ records });
});

app.put("/api/admin/teacher-attendance/:id", auth, allow("admin"), async (req, res) => {
    const record = await TeacherAttendance.findById(req.params.id); if (!record) return res.status(404).json({ message: "Record not found." });
    if (!["P", "A"].includes(req.body.status)) return res.status(400).json({ message: "Status must be P or A." });
    record.status = req.body.status; await record.save(); res.json({ message: "Teacher attendance updated." });
});
app.delete("/api/admin/teacher-attendance/:id", auth, allow("admin"), async (req, res) => {
    const record = await TeacherAttendance.findByIdAndDelete(req.params.id); if (!record) return res.status(404).json({ message: "Record not found." }); res.json({ message: "Teacher attendance record deleted." });
});
app.delete("/api/admin/attendance/:classId/:date", auth, allow("admin"), async (req, res) => {
    const record = await Attendance.findOneAndDelete({ classId: req.params.classId, date: req.params.date }); if (!record) return res.status(404).json({ message: "Attendance record not found." }); res.json({ message: "Attendance record deleted." });
});

/* =========================
   ERROR HANDLING
========================= */

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "Something went wrong on the server." });
});

/* =========================
   DATABASE CONNECTION
========================= */

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDB connected successfully.");

        // Existing records are not deleted or reset.
        await CollegeClass.updateMany(
            { section: { $exists: false } },
            { $set: { section: "A" } }
        );

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Server startup error:", error.message);
        process.exit(1);
    }
}

startServer();
