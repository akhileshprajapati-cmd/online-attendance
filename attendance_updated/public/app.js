"use strict";

/* =========================
   GLOBAL VARIABLES
========================= */

const $ = id => document.getElementById(id);

const departments = [
    "BA", "BSC", "BCOM", "BCA",
    "BBA", "MA", "MSC", "MCOM"
];

const semesters = [
    "1st Semester",
    "2nd Semester",
    "3rd Semester",
    "4th Semester",
    "5th Semester",
    "6th Semester"
];

let currentUser = null;
let activeClass = null;
let students = [];
let marks = {};
let teacherReportData = null;
let principalReportData = null;
let studentReportData = null;
let principalClasses = [];

/* =========================
   API HELPER
========================= */

async function api(url, options = {}) {
    const response = await fetch("/api" + url, {
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

/* =========================
   COMMON HELPERS
========================= */

function showMessage(message, error = false) {
    const box = $("messageBox");
    box.textContent = message;
    box.classList.remove("hidden", "error");

    if (error) box.classList.add("error");

    setTimeout(() => box.classList.add("hidden"), 3500);
}

function showView(viewId) {
    [
        "loginView",
        "adminView",
        "teacherView",
        "principalView",
        "studentView"
    ].forEach(id => $(id).classList.add("hidden"));

    $(viewId).classList.remove("hidden");
}

function today() {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000)
        .toISOString()
        .slice(0, 10);
}

function setDefaultDates() {
    const currentDate = today();

    [
        "attendanceDate",
        "teacherTo",
        "principalTo",
        "studentTo"
    ].forEach(id => {
        if ($(id)) $(id).value = currentDate;
    });

    [
        "teacherFrom",
        "principalFrom",
        "studentFrom"
    ].forEach(id => {
        if ($(id)) {
            const d = new Date();
            d.setMonth(d.getMonth() - 1);
            const offset = d.getTimezoneOffset();
            $(id).value = new Date(d.getTime() - offset * 60000)
                .toISOString().slice(0, 10);
        }
    });
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function fillSelect(id, values, firstText = "Select") {
    const select = $(id);
    if (!select) return;

    select.innerHTML =
        `<option value="">${escapeHTML(firstText)}</option>` +
        values.map(value =>
            `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`
        ).join("");
}

function fillDepartments() {
    fillSelect("teacherDepartment", departments, "Select Department");
    fillSelect("studentDepartment", departments, "Select Department");
    fillSelect("pDepartment", departments, "All Departments");
}

function fillSemesters() {
    fillSelect("studentSemester", semesters, "Select Semester");
    fillSelect("classSemester", semesters, "Select Semester");
    fillSelect("pSemester", semesters, "All Semesters");
}

function dateQuery(fromId, toId) {
    const from = $(fromId).value;
    const to = $(toId).value;

    if (from && to && from > to) {
        throw new Error("From Date cannot be after To Date.");
    }

    const params = new URLSearchParams();

    if (from) params.set("from", from);
    if (to) params.set("to", to);

    return params.toString();
}

function formatDate(date) {
    if (!date) return "-";
    const parts = date.split("-");
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function logout() {
    api("/auth/logout", { method: "POST" })
        .catch(() => {})
        .finally(() => {
            currentUser = null;
            window.currentUser = null;
            activeClass = null;
            showView("loginView");
            showMessage("Logged out successfully.");
        });
}

/* =========================
   THEME
========================= */

function setTheme(dark) {
    document.body.classList.toggle("dark", dark);
    $("themeBtn").textContent = dark ? "Light Mode" : "Dark Mode";
    localStorage.setItem("attendanceTheme", dark ? "dark" : "light");
}

$("themeBtn").addEventListener("click", () => {
    setTheme(!document.body.classList.contains("dark"));
});

if (localStorage.getItem("attendanceTheme") === "dark") {
    setTheme(true);
}

/* =========================
   LOGIN FORMS
========================= */

$("loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        const data = await api("/auth/login", {
            method: "POST",
            body: JSON.stringify({
                department: $("teacherDepartment").value,
                password: $("teacherPassword").value
            })
        });

        currentUser = data.user;
        window.currentUser = currentUser;
        await openTeacherDashboard();
        $("loginForm").reset();
        showMessage("Teacher login successful.");
    } catch (error) {
        showMessage(error.message, true);
    }
});

$("principalLoginForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        const data = await api("/auth/principal-login", {
            method: "POST",
            body: JSON.stringify({
                username: $("principalUsername").value.trim(),
                password: $("principalPassword").value
            })
        });

        currentUser = data.user;
        window.currentUser = currentUser;
        await openPrincipalDashboard();
        $("principalLoginForm").reset();
        showMessage("Principal login successful.");
    } catch (error) {
        showMessage(error.message, true);
    }
});

$("studentLoginForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        const data = await api("/auth/student-login", {
            method: "POST",
            body: JSON.stringify({
                department: $("studentDepartment").value,
                semester: $("studentSemester").value,
                section: $("studentSection").value,
                name: $("studentName").value.trim(),
                roll: $("studentRoll").value.trim()
            })
        });

        currentUser = data.user;
        window.currentUser = currentUser;
        await openStudentDashboard();
        $("studentLoginForm").reset();
        showMessage("Student login successful.");
    } catch (error) {
        showMessage(error.message, true);
    }
});

document.querySelectorAll(".logoutBtn").forEach(button => {
    button.addEventListener("click", logout);
});

/* =========================
   TEACHER DASHBOARD
========================= */

async function openTeacherDashboard() {
    showView("teacherView");

    $("teacherWelcome").textContent =
        `${currentUser.name || currentUser.username} | Department: ${currentUser.department}`;

    await loadTeacherClasses();
}

async function loadTeacherClasses() {
    try {
        const data = await api("/classes");
        const container = $("teacherClasses");

        container.innerHTML = "";

        if (!data.classes.length) {
            container.innerHTML = "<p>No classes created yet.</p>";
            return;
        }

        data.classes.forEach(item => {
            const card = document.createElement("div");
            card.className = "class-card";

            card.innerHTML = `
                <h4>${escapeHTML(item.subject)}</h4>
                <p>Department: ${escapeHTML(item.department)}</p>
                <p>Semester: ${escapeHTML(item.semester)}</p>
                <p>Section: ${escapeHTML(item.section)}</p>
                <p>Teacher: ${escapeHTML(item.teacherName || currentUser.name || "Not specified")}</p>
                <button type="button">Open Class</button>
            `;

            card.querySelector("button").addEventListener("click", () => {
                selectClass(item);
            });

            container.appendChild(card);
        });
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function selectClass(item) {
    activeClass = item;
    marks = {};
    // Clear the previous class report before loading another class.
    const reportBox = $("teacherReport");
    if (reportBox) reportBox.innerHTML = "";
    teacherReportData = null;

    $("teacherClassPanel").classList.remove("hidden");

    $("activeClassTitle").textContent =
        `${item.subject} - ${item.department} - ${item.semester} - Section ${item.section}`;

    $("attendanceClassInfo").textContent =
        `Selected class: ${item.subject}`;

    await loadStudents();
    await loadAttendance();
}

async function loadStudents() {
    if (!activeClass) return;

    try {
        const data = await api(`/classes/${activeClass._id}/students`);
        students = data.students;
        renderStudents();
    } catch (error) {
        showMessage(error.message, true);
    }
}

function renderStudents() {
    const container = $("studentList");
    const search = $("studentSearch").value.toLowerCase();

    const filtered = students.filter(student =>
        student.name.toLowerCase().includes(search) ||
        student.roll.toLowerCase().includes(search)
    );

    $("emptyStudentsMessage").textContent =
        filtered.length ? "" : "No students found.";

    container.innerHTML = filtered.map(student => {
        const status = marks[student._id] || "A";

        return `
            <div class="student-row">
                <div class="student-info">
                    <strong>${escapeHTML(student.name)}</strong>
                    <small>Roll: ${escapeHTML(student.roll)}</small>
                </div>

                <button
                    class="status-btn ${status === "P" ? "present" : "absent"}"
                    data-id="${student._id}"
                    type="button">
                    ${status === "P" ? "Present" : "Absent"}
                </button>

                <button
                    class="remove-btn"
                    data-remove="${student._id}"
                    type="button">
                    Remove
                </button>
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-id]").forEach(button => {
        button.addEventListener("click", () => {
            const id = button.dataset.id;
            marks[id] = marks[id] === "P" ? "A" : "P";
            renderStudents();
        });
    });

    container.querySelectorAll("[data-remove]").forEach(button => {
        button.addEventListener("click", () => {
            removeStudent(button.dataset.remove);
        });
    });
}

$("studentSearch").addEventListener("input", renderStudents);

async function removeStudent(id) {
    if (!confirm("Mark this student inactive? Old attendance will be preserved.")) {
        return;
    }

    try {
        await api(`/students/${id}`, { method: "DELETE" });
        await loadStudents();
        showMessage("Student marked inactive.");
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function loadAttendance() {
    if (!activeClass) return;

    const date = $("attendanceDate").value;

    if (!date) {
        showMessage("Please select attendance date.", true);
        return;
    }

    try {
        const data = await api(
            `/classes/${activeClass._id}/attendance/${date}`
        );

        marks = {};

        if (data.attendance) {
            data.attendance.marks.forEach(mark => {
                marks[mark.studentId] = mark.status;
            });
        } else {
            students.forEach(student => {
                marks[student._id] = "A";
            });
        }

        renderStudents();
    } catch (error) {
        showMessage(error.message, true);
    }
}

$("loadAttendanceBtn").addEventListener("click", loadAttendance);

$("showStudentsBtn").addEventListener("click", loadStudents);

$("saveAttendanceBtn").addEventListener("click", async () => {
    if (!activeClass) {
        showMessage("Please select a class first. Select a class to view only its students and mark attendance.", true);
        return;
    }

    try {
        const date = $("attendanceDate").value;

        const attendanceMarks = students.map(student => ({
            studentId: student._id,
            status: marks[student._id] || "A"
        }));

        await api(`/classes/${activeClass._id}/attendance/${date}`, {
            method: "PUT",
            body: JSON.stringify({ marks: attendanceMarks })
        });

        showMessage(`Attendance saved successfully for ${activeClass.subject}.`);
    } catch (error) {
        showMessage(error.message, true);
    }
});

$("createClassForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
        await api("/classes", {
            method: "POST",
            body: JSON.stringify({
                semester: $("classSemester").value,
                section: $("classSection").value,
                subject: $("classSubject").value.trim(),
                teacherName: $("classTeacherName").value.trim()
            })
        });

        $("createClassForm").reset();
        await loadTeacherClasses();
        showMessage("Class created successfully.");
    } catch (error) {
        showMessage(error.message, true);
    }
});

$("addStudentForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!activeClass) {
        showMessage("Please select a class first. Select a class to view only its students and mark attendance.", true);
        return;
    }

    try {
        await api(`/classes/${activeClass._id}/students`, {
            method: "POST",
            body: JSON.stringify({
                name: $("newStudentName").value.trim(),
                roll: $("newStudentRoll").value.trim(),
                email: $("newStudentEmail").value.trim()
            })
        });

        $("addStudentForm").reset();
        await loadStudents();
        showMessage("Student added successfully.");
    } catch (error) {
        showMessage(error.message, true);
    }
});

/* =========================
   REPORT TABLE
========================= */

function renderTeacherReport(data, targetId) {
    const container = $(targetId);

    if (!data || !data.students) {
        container.innerHTML = "<p>No report available.</p>";
        return;
    }

    if (!data.dates.length) {
        container.innerHTML = "<p>No saved attendance found for this date range.</p>";
        return;
    }

    let html = `
        <h3>Attendance Report</h3>
        <p>From: ${formatDate(data.from)} | To: ${formatDate(data.to)}</p>
        <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Roll</th>
                    <th>Student Name</th>
    `;

    data.dates.forEach(date => {
        html += `<th>${formatDate(date)}</th>`;
    });

    html += `
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Total</th>
                    <th>Percentage</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.students.forEach(student => {
        html += `
            <tr>
                <td>${escapeHTML(student.roll)}</td>
                <td>${escapeHTML(student.name)}</td>
        `;

        student.dailyMarks.forEach(mark => {
            html += `<td>${mark.status}</td>`;
        });

        html += `
                <td>${student.present}</td>
                <td>${student.absent}</td>
                <td>${student.total}</td>
                <td>${student.percent}%</td>
            </tr>
        `;
    });

    html += "</tbody></table></div>";

    container.innerHTML = html;
}

async function loadTeacherReport() {
    if (!activeClass) {
        showMessage("Please select a class first. Select a class to view only its students and mark attendance.", true);
        return;
    }

    try {
        const query = dateQuery("teacherFrom", "teacherTo");

        const data = await api(
            `/classes/${activeClass._id}/report${query ? "?" + query : ""}`
        );

        teacherReportData = data;
        renderTeacherReport(data, "teacherReport");
    } catch (error) {
        showMessage(error.message, true);
    }
}

$("teacherReportBtn").addEventListener("click", loadTeacherReport);

/* =========================
   PRINCIPAL DASHBOARD
========================= */

async function openPrincipalDashboard() {
    showView("principalView");

    $("principalWelcome").textContent =
        `Welcome ${currentUser.name || currentUser.username}`;

    await loadPrincipalOverview();
    await loadPrincipalClasses();
}

async function loadPrincipalOverview() {
    try {
        const data = await api("/principal/overview");

        $("pClassCount").textContent = data.classCount;
        $("pStudentCount").textContent = data.studentCount;
        $("pAttendanceDays").textContent = data.attendanceDays;
    } catch (error) {
        showMessage(error.message, true);
    }
}

async function loadPrincipalClasses() {
    try {
        const params = new URLSearchParams();

        if ($("pDepartment").value) {
            params.set("department", $("pDepartment").value);
        }

        if ($("pSemester").value) {
            params.set("semester", $("pSemester").value);
        }

        if ($("pSection").value) {
            params.set("section", $("pSection").value);
        }

        const query = params.toString();

        const data = await api("/classes" + (query ? "?" + query : ""));
        principalClasses = data.classes;

        const container = $("principalClassRows");
        container.innerHTML = "";

        $("principalNoClass").textContent =
            principalClasses.length ? "" : "No classes found.";

        principalClasses.forEach(item => {
            const card = document.createElement("div");
            card.className = "class-card";

            card.innerHTML = `
                <h4>${escapeHTML(item.subject)}</h4>
                <p>Department: ${escapeHTML(item.department)}</p>
                <p>Semester: ${escapeHTML(item.semester)}</p>
                <p>Section: ${escapeHTML(item.section)}</p>
                <p>Teacher: ${escapeHTML(item.teacherName || currentUser.name || "Not specified")}</p>
                <button type="button">View Report</button>
            `;

            card.querySelector("button").addEventListener("click", () => {
                selectPrincipalClass(item);
            });

            container.appendChild(card);
        });

        $("principalReportPanel").classList.add("hidden");
    } catch (error) {
        showMessage(error.message, true);
    }
}

let selectedPrincipalClass = null;

function selectPrincipalClass(item) {
    selectedPrincipalClass = item;

    $("principalReportPanel").classList.remove("hidden");

    $("principalReportTitle").textContent =
        `${item.department} | ${item.semester} | Section ${item.section} | ${item.subject}`;

    loadPrincipalReport();
}

async function loadPrincipalReport() {
    if (!selectedPrincipalClass) return;

    try {
        const query = dateQuery("principalFrom", "principalTo");

        const data = await api(
            `/classes/${selectedPrincipalClass._id}/report${query ? "?" + query : ""}`
        );

        principalReportData = data;
        renderTeacherReport(data, "principalReport");
    } catch (error) {
        showMessage(error.message, true);
    }
}

$("filterClassesBtn").addEventListener("click", loadPrincipalClasses);
$("principalReportBtn").addEventListener("click", loadPrincipalReport);

/* =========================
   STUDENT DASHBOARD
========================= */

async function openStudentDashboard() {
    showView("studentView");

    $("studentWelcome").textContent =
        `${currentUser.name} | Roll Number: ${currentUser.roll}`;

    await loadStudentReport();
}

async function loadStudentReport() {
    try {
        const query = dateQuery("studentFrom", "studentTo");

        const data = await api(
            `/student/my-attendance${query ? "?" + query : ""}`
        );

        studentReportData = data;

        $("myPresent").textContent = data.present;
        $("myTotal").textContent = data.total;
        $("myPercent").textContent = data.percent + "%";

        if (!data.history.length) {
            $("studentHistory").innerHTML =
                "<p>No saved attendance found for this date range.</p>";
            return;
        }

        let html = `
            <p>Subject: ${escapeHTML(data.class.subject)}</p>
            <p>Department: ${escapeHTML(data.class.department)}</p>
            <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.history.forEach(item => {
            html += `
                <tr>
                    <td>${formatDate(item.date)}</td>
                    <td>${item.status === "P" ? "Present" : "Absent"}</td>
                </tr>
            `;
        });

        html += "</tbody></table></div>";

        $("studentHistory").innerHTML = html;
    } catch (error) {
        showMessage(error.message, true);
    }
}

$("studentReportBtn").addEventListener("click", loadStudentReport);

/* =========================
   EXCEL EXPORT
========================= */

function downloadExcel(data, filename, type) {
    if (!data) {
        showMessage("Please show the report first.", true);
        return;
    }

    if (typeof XLSX === "undefined") {
        showMessage("Excel library load nahi hui. Internet connection check karein.", true);
        return;
    }

    let rows = [];

    if (type === "student") {
        rows.push(["Date", "Status"]);

        data.history.forEach(item => {
            rows.push([
                item.date,
                item.status === "P" ? "Present" : "Absent"
            ]);
        });

        rows.push([]);
        rows.push(["Present", data.present]);
        rows.push(["Absent", data.absent]);
        rows.push(["Total", data.total]);
        rows.push(["Percentage", data.percent + "%"]);
    } else {
        const header = [
            "Roll Number",
            "Student Name",
            ...data.dates,
            "Present",
            "Absent",
            "Total",
            "Percentage"
        ];

        rows.push(header);

        data.students.forEach(student => {
            rows.push([
                student.roll,
                student.name,
                ...student.dailyMarks.map(mark =>
                    mark.status === "P" ? "Present" : "Absent"
                ),
                student.present,
                student.absent,
                student.total,
                student.percent + "%"
            ]);
        });
    }

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");

    XLSX.writeFile(workbook, filename + ".xlsx");
}

/* =========================
   PDF EXPORT
========================= */

function downloadPDF(data, filename, type, title) {
    if (!data) {
        showMessage("Please show the report first.", true);
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        showMessage("PDF library load nahi hui. Internet connection check karein.", true);
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("landscape", "mm", "a4");

    pdf.setFontSize(16);
    pdf.text(title, 14, 15);

    pdf.setFontSize(9);

    let head = [];
    let body = [];

    if (type === "student") {
        pdf.text(
            `Present: ${data.present} | Absent: ${data.absent} | Total: ${data.total} | Percentage: ${data.percent}%`,
            14,
            22
        );

        head = [["Date", "Status"]];

        body = data.history.map(item => [
            item.date,
            item.status === "P" ? "Present" : "Absent"
        ]);
    } else {
        pdf.text(
            `From: ${data.from || "-"} | To: ${data.to || "-"}`,
            14,
            22
        );

        head = [[
            "Roll",
            "Student",
            ...data.dates,
            "Present",
            "Absent",
            "Total",
            "%"
        ]];

        body = data.students.map(student => [
            student.roll,
            student.name,
            ...student.dailyMarks.map(mark => mark.status),
            student.present,
            student.absent,
            student.total,
            student.percent + "%"
        ]);
    }

    pdf.autoTable({
        head,
        body,
        startY: 28,
        theme: "grid",
        styles: {
            fontSize: 7,
            cellPadding: 2
        },
        headStyles: {
            fillColor: [36, 87, 214]
        },
        horizontalPageBreak: true
    });

    pdf.save(filename + ".pdf");
}

/* =========================
   PRINT REPORT
========================= */

function printReport(data, type, title) {
    if (!data) {
        showMessage("Please show the report first.", true);
        return;
    }

    const reportId = type === "teacher"
        ? "teacherReport"
        : type === "principal"
            ? "principalReport"
            : "studentHistory";

    const report = $(reportId);

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
        showMessage("Please allow pop-ups to print the report.", true);
        return;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${escapeHTML(title)}</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    padding: 20px;
                    color: #111;
                }
                h2 { text-align: center; }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    margin-top: 20px;
                }
                th, td {
                    border: 1px solid #777;
                    padding: 7px;
                    font-size: 11px;
                    text-align: left;
                }
                th {
                    background: #e5e7eb;
                }
                @media print {
                    body { padding: 5px; }
                }
            </style>
        </head>
        <body>
            <h2>${escapeHTML(title)}</h2>
            ${report.innerHTML}
        </body>
        </html>
    `);

    printWindow.document.close();

    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
    };
}

/* =========================
   EXPORT BUTTONS
========================= */

$("teacherExcelBtn").addEventListener("click", () => {
    downloadExcel(
        teacherReportData,
        "Teacher_Attendance_Report",
        "teacher"
    );
});

$("teacherPdfBtn").addEventListener("click", () => {
    downloadPDF(
        teacherReportData,
        "Teacher_Attendance_Report",
        "teacher",
        "Teacher Attendance Report"
    );
});

$("teacherPrintBtn").addEventListener("click", () => {
    printReport(
        teacherReportData,
        "teacher",
        "Teacher Attendance Report"
    );
});

$("principalExcelBtn").addEventListener("click", () => {
    downloadExcel(
        principalReportData,
        "Principal_Attendance_Report",
        "principal"
    );
});

$("principalPdfBtn").addEventListener("click", () => {
    downloadPDF(
        principalReportData,
        "Principal_Attendance_Report",
        "principal",
        "Principal Attendance Report"
    );
});

$("principalPrintBtn").addEventListener("click", () => {
    printReport(
        principalReportData,
        "principal",
        "Principal Attendance Report"
    );
});

$("studentExcelBtn").addEventListener("click", () => {
    downloadExcel(
        studentReportData,
        "Student_Attendance_Report",
        "student"
    );
});

$("studentPdfBtn").addEventListener("click", () => {
    downloadPDF(
        studentReportData,
        "Student_Attendance_Report",
        "student",
        "Student Attendance Report"
    );
});

$("studentPrintBtn").addEventListener("click", () => {
    printReport(
        studentReportData,
        "student",
        "Student Attendance Report"
    );
});

/* =========================
   INITIALIZATION
========================= */

async function restoreSession() {
    try {
        const data = await api("/auth/me");
        currentUser = data.user;
        window.currentUser = currentUser;

        if (currentUser.role === "teacher") {
            await openTeacherDashboard();
        } else if (currentUser.role === "admin") {
            await window.openAdminDashboard();
        } else if (currentUser.role === "principal") {
            await openPrincipalDashboard();
        } else if (currentUser.role === "student") {
            await openStudentDashboard();
        }
    } catch {
        showView("loginView");
    }
}

fillDepartments();
fillSemesters();
setDefaultDates();
restoreSession();
