const express = require('express');
const pool = require('./config/db'); // Baza ulanishini chaqirish
require('dotenv').config();
const { swaggerUi, specs } = require('./config/swagger');
const cors = require('cors');
const { createUserTable } = require('./models/userModel'); // Jadval yaratish funksiyasini chaqirish

const app = express();

// Middleware: JSON formatdagi ma'lumotlarni qabul qilish
app.use(express.json());
app.use(cors());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

/**
 * @swagger
 * /:
 *   get:
 *     summary: API Status va ma'lumotlar
 *     description: Server holati va yangi tizim haqida ma'lumot
 *     responses:
 *       200:
 *         description: Server ishlayapti
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "LMS API v3.0 - Monthly Snapshot tizimi bilan"
 *                 currentTime:
 *                   type: string
 *                 version:
 *                   type: string
 *                   example: "3.0.0"
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Monthly Snapshot", "Attendance Integration", "Enhanced Payments"]
 */
// Oddiy test yo'nalishi
app.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({
            status: "LMS API v3.0 - Monthly Snapshot tizimi bilan yangilangan",
            currentTime: result.rows[0].now,
            version: "3.0.0",
            features: [
                "Monthly Snapshot System",
                "Attendance-Payment Integration", 
                "Enhanced Monthly Status Management",
                "Improved Student Management",
                "Advanced Reporting"
            ],
            api_docs: "http://localhost:5001/api-docs",
            main_endpoints: {
                payments: "/api/payments/monthly",
                snapshots: "/api/snapshots",
                attendance: "/api/attendance",
                groups: "/api/groups",
                students: "/api/students"
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Baza bilan ulanishda xato!");
    }
});

const userRoute = require('./routes/userRoutes');
const groupRoute = require('./routes/groupRoutes');
const studentRoutes = require('./routes/studentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const subjectRoutes = require('./routes/subjectRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const roomRoutes = require('./routes/roomRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const snapshotRoutes = require('./routes/snapshotRoutes');
const teacherGuideRoutes = require('./routes/teacherGuideRoutes');
const adminGuideRoutes = require('./routes/adminGuideRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const teacherSalaryRoutes = require('./routes/teacherSalaryRoutes');
const { createGroupTables } = require('./models/groupModel');
const { createStudentAdditionalTables } = require('./models/studentModel');
const { createTeacherSubjectTables } = require('./models/teacherSubjectModel');
const { createRoomTable } = require('./models/roomModel');
const { createLessonsTable, createAttendanceTable } = require('./models/attendanceModel');
const { createGuideTables } = require('./models/guideModel');
const { createExpenseTable } = require('./models/expenseModel');
const { createTeacherSalaryTables } = require('./models/teacherSalaryModel');
const { createPaymentTables } = require('./scripts/createPaymentTables');
const createGroupMonthlySettingsTable = require('./scripts/createGroupMonthlySettingsTable');
const { createMonthlySnapshotTable } = require('./scripts/createMonthlySnapshot');

// Middleware-lar ostidan qo'shing
app.use('/api/users', userRoute);
app.use('/api/groups', groupRoute);
app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/snapshots', snapshotRoutes);
app.use('/api/teacher/guides', teacherGuideRoutes);
app.use('/api/admin/guides', adminGuideRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/teacher-salary', teacherSalaryRoutes);

// 
console.log("JWT_SECRET tekshiruvi:", process.env.JWT_SECRET);

// createGroupTables ichiga vaqtincha qo'shib qo'ysang bo'ladi
// Serverni portga ulash va jadvalni yaratish
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server ${PORT}-portda ishga tushdi...`);
    console.log(`Swagger: http://localhost:${PORT}/api-docs/`);

    // Server yonganda jadvalni tekshirish va yaratish
    try {
        await pool.waitForDbReady();
        const dbIdentity = await pool.query(`
            SELECT
                current_database() AS database_name,
                current_user AS db_user,
                inet_server_addr()::text AS server_addr,
                inet_server_port() AS server_port
        `);
        console.log("🧭 DB ulanish ma'lumoti:", dbIdentity.rows[0]);

        const setupSteps = [
            ['rooms', createRoomTable],
            ['users', createUserTable],
            ['groups', createGroupTables],
            ['students_extra', createStudentAdditionalTables],
            ['teacher_subjects', createTeacherSubjectTables],
            ['lessons', createLessonsTable],
            ['attendance', createAttendanceTable],
            ['guides', createGuideTables],
            ['center_expenses', createExpenseTable],
            ['group_monthly_settings', createGroupMonthlySettingsTable],
            ['payments', createPaymentTables],
            ['monthly_snapshots', createMonthlySnapshotTable],
            ['teacher_salary_v2', createTeacherSalaryTables]
        ];

        for (const [stepName, setupFn] of setupSteps) {
            try {
                await setupFn();
            } catch (stepError) {
                stepError.message = `[setup:${stepName}] ${stepError.message}`;
                throw stepError;
            }
        }

        const requiredTables = [
            'rooms',
            'users',
            'groups',
            'student_groups',
            'subjects',
            'teacher_subjects',
            'lessons',
            'attendance',
            'center_expenses',
            'group_monthly_settings',
            'monthly_snapshots'
        ];

        const existingTableRows = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        `);
        const existingTables = new Set(existingTableRows.rows.map(r => r.table_name));
        const missingTables = requiredTables.filter(t => !existingTables.has(t));

        if (missingTables.length > 0) {
            throw new Error(`Majburiy jadvallar topilmadi: ${missingTables.join(', ')}`);
        }

        console.log("✅ Dastlabki DB sozlash bosqichlari muvaffaqiyatli yakunlandi.");
    } catch (error) {
        console.error("❌ Dastlabki sozlashda xatolik:", error.message);
        process.exit(1);
    }
});
