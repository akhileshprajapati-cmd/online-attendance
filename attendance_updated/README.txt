MOHD HASAN PG COLLEGE - ATTENDANCE MANAGEMENT SYSTEM

FILES
- server.js: Node/Express backend with existing teacher/student/principal features, Admin endpoints and separate teacher attendance.
- seed.js: creates/updates Admin, Principal and teacher login accounts from .env.
- public/index.html, public/style.css, public/app.js: existing frontend plus Admin and Principal teacher-attendance interface.
- public/admin.js: Admin dashboard and Principal teacher attendance screen.

SETUP
1. Install Node.js LTS and MongoDB Community Server, or use a MongoDB Atlas connection string.
2. Open this folder in VS Code.
3. Copy .env.example to a new file named .env.
4. In .env, set MONGO_URI and replace ALL sample passwords and JWT_SECRET with your own values. Passwords must be at least 12 characters. Do not share .env.
5. Open terminal in this folder and run: npm install
6. Run: npm run seed
7. Run: npm start
8. Open: http://localhost:3001

IMPORTANT
- Seed updates login accounts only; it does not delete existing classes, students or attendance.
- Teacher/student/class archive operations preserve historical attendance.
- Admin delete actions are soft-delete/archive for user/class/student records; selected attendance-record delete endpoints are permanent.
- Keep a MongoDB backup before production use. Test with demo records first.
- Existing login credentials continue to work unless their username/password is changed in .env and npm run seed is run.


DEPARTMENT CLASS ATTENDANCE WORKFLOW
- Use Department Login (the existing department teacher account credentials).
- A department account sees only classes belonging to its own department/account.
- Create a class using its class/subject name, semester and section.
- Select a class from My Department Classes. The selected class opens its own student list.
- Add students inside that selected class, choose the attendance date, mark Present/Absent, then Save Attendance.
- Attendance is saved against the selected class only. Students continue to see only their own attendance.
- Principal can take teacher attendance across active department teachers. A blank-department or placeholder “College Teacher” account is excluded from that list.

DATA SAFETY
- This update does not reset, drop, or delete any MongoDB collection. Keep your existing .env file locally; it is intentionally not included in this ZIP.

Department login: choose your department from the dropdown and enter that department password. No username is required. Run npm run seed after configuring .env to create/update the department accounts.


ARCHIVE / ACTIVATE UPDATE
- Admin can activate previously deactivated teacher and principal accounts.
- Archived students appear in a separate Archived Students panel.
- Restore Student removes the archive marker and preserves attendance records.
- Archived students cannot log in; restored students can log in again.

IMPORTANT SECURITY
- The .env.example values are sample values only. Create your own .env and change every sample password and JWT_SECRET before use.
- Do not upload or share your .env file.
