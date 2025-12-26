# Copilot Instructions for lms-backend

## Project Overview
- This is a Node.js/Express backend for an LMS (Learning Management System) for an education center.
- Data is stored in a PostgreSQL database, with connection and table setup in `config/db.js` and `models/studentsModel.js`.
- Main entry point: `server.js`. All API routes are mounted under `/api/students`.
- API documentation is available via Swagger at `/api-docs` (see `config/swagger.js`).

## Key Components
- **controllers/studentController.js**: Handles student registration, login, token refresh, and student list endpoints.
- **models/studentsModel.js**: Handles DB logic for students, including table creation, user creation, and queries.
- **middlewares/authMiddleware.js**: Provides JWT-based authentication and login attempt blocking. Use `protect` for general auth, `protectAdmin` for admin-only routes.
- **routers/studentRouter.js**: Defines all student-related API endpoints and applies authentication middleware.

## Authentication & Authorization
- JWT tokens are required for most endpoints. Use the `protect` middleware to secure routes.
- Admin-only actions should use the `protectAdmin` middleware (currently not applied in router, add as needed).
- Students can only access their own profile data (implement endpoint if missing).

## Developer Workflows
- **Start server (dev mode):** `npm run dev` (uses nodemon, entry: `server.js`)
- **Database:** Tables are auto-created on server start via `Student.init()`.
- **API Docs:** Visit `http://localhost:5000/api-docs` for Swagger UI.

## Project Conventions
- All business logic is in controllers; DB logic in models; routing in routers.
- Use async/await for all DB and controller logic.
- Error messages are user-friendly and mostly in Uzbek.
- Logging is minimal; improve by adding structured logs for errors and key actions.

## Extending Functionality
- To add monthly reports or admin features, extend `studentController.js` and secure with `protectAdmin`.
- For student self-profile, add a `/me` endpoint using the JWT token to identify the user.
- For admin student list/reporting, add query params for month filtering and PATCH/PUT for updates.

## Example Files
- `controllers/studentController.js`: See login, register, and getStudents patterns.
- `middlewares/authMiddleware.js`: See `protect` and `protectAdmin` for securing endpoints.
- `routers/studentRouter.js`: See how routes and middleware are wired.

---
For more, see code comments and Swagger docs. Keep new endpoints consistent with existing patterns.
