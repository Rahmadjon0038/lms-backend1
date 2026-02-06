# Copilot Instructions for lms-backend

## Project Overview
- This is a Node.js/Express backend for an LMS (Learning Management System) for an education center.
- Data is stored in a PostgreSQL database, with connection and table setup in `config/db.js`.
- Main entry point: `server.js`. All API routes are mounted under `/api/*`.
- API documentation is available via Swagger at `/api-docs` (see `config/swagger.js`).

## Key Components
- **controllers/**: All business logic controllers (student, payment, attendance, group, etc.)
- **models/**: Database models and table creation logic
- **routes/**: All API route definitions
- **middlewares/authMiddleware.js**: Provides JWT-based authentication and login attempt blocking. Use `protect` for general auth, `protectAdmin` for admin-only routes.
- **scripts/**: Database migration and utility scripts

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

## Payment System (YANGI TIZIM)
- **MUHIM:** To'lov tizimi attendance jadvalidagi `monthly_status` ga bog'langan
- Har oylik to'lovlar mustaqil boshqariladi
- Talabani bir oyga to'xtatish boshqa oylarga ta'sir qilmaydi
- To'lovlar faqat `monthly_status = 'active'` bo'lgan talabalar uchun qabul qilinadi
- To'liq ma'lumot: `PAYMENT_API.md`

## Attendance System
- Har oy uchun alohida `monthly_status` mavjud: `active`, `stopped`, `finished`
- Bu status to'lov tizimida ishlatiladi
- Talabani bir oyga to'xtatish: `monthly_status = 'stopped'`
- To'liq ma'lumot: attendance controller va routes

## Extending Functionality
- To add monthly reports or admin features, extend relevant controllers and secure with `protectAdmin`.
- For student self-profile, use endpoints in `/api/students/me` or `/api/payments/my`.
- For admin student list/reporting, add query params for month filtering and PATCH/PUT for updates.
- Always consider monthly_status when working with payments and attendance.

## Example Files
- `controllers/paymentController.js`: Payment system with monthly_status integration
- `controllers/attendanceController.js`: Attendance with monthly status
- `middlewares/authMiddleware.js`: See `protect` and `protectAdmin` for securing endpoints.
- `PAYMENT_API.md`: Complete payment API documentation

## Migration Scripts
- `scripts/migratePaymentsToMonthlyStatus.js`: Updates payment system to new monthly_status structure
- Run migrations before deploying new payment system

---
For more, see code comments, Swagger docs, and PAYMENT_API.md. Keep new endpoints consistent with existing patterns.
