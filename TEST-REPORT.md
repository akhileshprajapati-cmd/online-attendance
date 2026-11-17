# Build / QA report

Date: 17 November 2026

## Checks executed

- `node --check server.js` — passed.
- `node --check seed.js` — passed.
- `node --check public/app.js` — passed.
- `node --check public/admin.js` — passed.
- `node --check public/ui.js` — passed.
- HTML parsed with Python's `HTMLParser` — passed; no duplicate element IDs found.
- Student illustration and PWA icon files verified present in the package.
- Existing backend route declarations and original dashboard scripts retained.

## Not executed / requires owner environment

- Live Department, Principal, Student and Admin login.
- MongoDB CRUD, attendance persistence, calculations and report data correctness.
- Role-isolation / authorization integration tests.
- Reset behavior (no reset endpoint was added because existing teacher accounts also serve as department login accounts).
- Browser-based responsive, console and native PWA install testing.

These require a reachable MongoDB database, real credentials, and a browser test environment. No claim is made that these end-to-end checks passed.
