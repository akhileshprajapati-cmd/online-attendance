# MH PG College Attendance Management System

A Node.js + Express + MongoDB attendance application for Mohd Hasan PG College, Jaunpur. This package keeps the supplied application's API, MongoDB models, authentication routes and existing dashboard scripts, and refreshes the login experience with the supplied visual direction and student illustration.

## Requirements

- Node.js 18 or newer
- MongoDB (local or hosted)
- npm

## Setup

1. Extract the ZIP and open the `attendance_updated` folder in VS Code.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and set `MONGO_URI`, a unique `JWT_SECRET` (at least 32 characters), and the account credentials you intend to seed.
4. Seed only the optional initial admin/principal/department accounts:

   ```bash
   npm run seed
   ```

   The seed script does not delete classes, students or attendance. Supplying an existing username updates that account's password and details, so use this only when intended.
5. Start the server:

   ```bash
   npm start
   ```

6. Open `http://localhost:3001`.

## Login types

- Department: select a department and enter its configured department password.
- Principal: use the principal username and password.
- Student: enter department, semester, section, name and roll number matching the stored student/class record.
- Admin: use the admin username and password.

Authentication is performed by the existing Express API; this UI does not simulate login. Access control is enforced by server middleware and role checks.

## PWA / Chrome install

The app includes a web manifest, 192px/512px icons, Apple touch icon, service worker and offline fallback. Serve over HTTPS in production (localhost is supported for development). Chrome only displays its native install prompt when the browser's installability conditions are met. Private `/api/` responses are deliberately excluded from the service-worker cache. Offline mode does not provide offline login or attendance writes.

## Deployment

Set `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production`, and `PORT` in your hosting provider's environment settings. Use HTTPS. Do not upload `.env`, expose secrets in frontend files, or commit credentials.

## Important notes / verification limits

- The original database models and API endpoints were retained; no migration or destructive database reset runs at startup.
- The provided project uses one `teacher` account per department for the Department login. It does not currently model a separate department credential collection and teacher staff accounts independently.
- The supplied backend does not contain a protected full-system-reset endpoint; this package does not add a destructive reset operation that could unintentionally erase department access accounts.
- Live authentication, database writes, reports and role permissions require a configured MongoDB instance and valid seeded credentials. Those credentials/database were not supplied for end-to-end testing.
- The student and login UI assets are local. The existing dashboard's chart/export integrations still load their libraries from CDNs and therefore need internet access for those library features.
