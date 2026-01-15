const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const {
    getTeacherGroups,
    getGroupAttendance,
    updateStudentAttendance,
    getAttendanceStats,
    getPoorAttendanceStudents,
    getAllGroupsAttendance,
    getAllStudentsAttendance
} = require('../controllers/attendanceController');

/**
 * @swagger
 * components:
 *   schemas:
 *     Attendance:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         student_id:
 *           type: integer
 *         group_id:
 *           type: integer
 *         teacher_id:
 *           type: integer
 *         month_name:
 *           type: string
 *           example: "2026-01"
 *         daily_records:
 *           type: array
 *           items:
 *             type: integer
 *             enum: [0, 1]
 *           description: Kunlik davomat [1=kelgan, 0=kelmagan]
 *           example: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1]
 *         total_classes:
 *           type: integer
 *           description: Jami darslar soni
 *         attended_classes:
 *           type: integer
 *           description: Qatnashgan darslar soni
 *         attendance_percentage:
 *           type: number
 *           description: Davomat foizi
 */

/**
 * @swagger
 * /api/attendance/teacher/groups:
 *   get:
 *     summary: O'qituvchining o'z guruhlarini ko'rish (TEACHER)
 *     description: Teacher o'z guruhlari ro'yxatini va har guruhda nechta student borligini ko'radi
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: O'qituvchi guruhlari
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 teacher_id:
 *                   type: integer
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       group_id:
 *                         type: integer
 *                       group_name:
 *                         type: string
 *                       subject_name:
 *                         type: string
 *                       students_count:
 *                         type: integer
 */
router.get('/teacher/groups', protect, roleCheck(['teacher']), getTeacherGroups);

/**
 * @swagger
 * /api/attendance/group/{group_id}:
 *   get:
 *     summary: Guruh studentlarining davomat ma'lumotlari
 *     description: Teacher o'z guruhining yoki Admin istalgan guruhning studentlari davomatini ko'radi
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: group_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month_name
 *         schema:
 *           type: string
 *         example: "2026-01"
 *         description: Oy (default - joriy oy)
 *     responses:
 *       200:
 *         description: Guruh davomat ma'lumotlari
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 month:
 *                   type: string
 *                 group:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     group_name:
 *                       type: string
 *                     subject_name:
 *                       type: string
 *                     teacher_name:
 *                       type: string
 *                 students:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       student_id:
 *                         type: integer
 *                       student_name:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       phone2:
 *                         type: string
 *                       father_name:
 *                         type: string
 *                       father_phone:
 *                         type: string
 *                       address:
 *                         type: string
 *                       daily_records:
 *                         type: string
 *                         description: JSON array string
 *                       total_classes:
 *                         type: integer
 *                       attended_classes:
 *                         type: integer
 *                       attendance_percentage:
 *                         type: number
 */
router.get('/group/:group_id', protect, roleCheck(['teacher', 'admin']), getGroupAttendance);

/**
 * @swagger
 * /api/attendance/student/{student_id}:
 *   put:
 *     summary: Student davomatini yangilash
 *     description: Teacher o'z guruhining yoki Admin istalgan studentning davomatini yangilaydi
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - month_name
 *               - daily_records
 *             properties:
 *               month_name:
 *                 type: string
 *                 example: "2026-01"
 *               daily_records:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   enum: [0, 1]
 *                 example: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1]
 *                 description: Oyning har kuniga 1 (kelgan) yoki 0 (kelmagan)
 *               total_classes:
 *                 type: integer
 *                 example: 12
 *                 description: Shu oyda jami o'tilgan darslar soni
 *     responses:
 *       200:
 *         description: Davomat yangilandi
 *       403:
 *         description: Ruxsat yo'q
 *       404:
 *         description: Student topilmadi
 */
router.put('/student/:student_id', protect, roleCheck(['teacher', 'admin']), updateStudentAttendance);

/**
 * @swagger
 * /api/attendance/stats:
 *   get:
 *     summary: Oylik davomat statistikasi (ADMIN)
 *     description: Barcha yoki malum guruh uchun davomat statistikasini ko'rish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month_name
 *         schema:
 *           type: string
 *         example: "2026-01"
 *       - in: query
 *         name: group_id
 *         schema:
 *           type: integer
 *         description: Malum guruh uchun filter
 *     responses:
 *       200:
 *         description: Davomat statistikasi
 */
router.get('/stats', protect, roleCheck(['admin']), getAttendanceStats);

/**
 * @swagger
 * /api/attendance/poor-attendance:
 *   get:
 *     summary: Ko'p dars qoldirayotgan studentlar (ADMIN)
 *     description: Belgilangan foizdan kam davomat qilayotgan studentlarni topish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month_name
 *         schema:
 *           type: string
 *         example: "2026-01"
 *       - in: query
 *         name: threshold
 *         schema:
 *           type: integer
 *         example: 60
 *         description: Foiz chegarasi (default 60%)
 *     responses:
 *       200:
 *         description: Yomon davomat studentlar ro'yxati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 month:
 *                   type: string
 *                 threshold:
 *                   type: integer
 *                 count:
 *                   type: integer
 *                 students:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       student_id:
 *                         type: integer
 *                       student_name:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       father_name:
 *                         type: string
 *                       father_phone:
 *                         type: string
 *                       group_name:
 *                         type: string
 *                       subject_name:
 *                         type: string
 *                       teacher_name:
 *                         type: string
 *                       attendance_percentage:
 *                         type: number
 *                       missed_classes:
 *                         type: integer
 */
router.get('/poor-attendance', protect, roleCheck(['admin']), getPoorAttendanceStudents);

/**
 * @swagger
 * /api/attendance/all-groups:
 *   get:
 *     summary: Barcha guruhlar davomati (ADMIN)
 *     description: Barcha guruhlarning davomat statistikasini ko'rish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month_name
 *         schema:
 *           type: string
 *         example: "2026-01"
 *     responses:
 *       200:
 *         description: Barcha guruhlar davomati
 */
router.get('/all-groups', protect, roleCheck(['admin']), getAllGroupsAttendance);

/**
 * @swagger
 * /api/attendance/all-students:
 *   get:
 *     summary: Barcha studentlar davomati (filter bilan) (ADMIN)
 *     description: Admin uchun barcha studentlarni ko'rish va ularning davomatini boshqarish. Subject, teacher va search filterlari bilan.
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month_name
 *         schema:
 *           type: string
 *         example: "2026-01"
 *         description: Oy (default - joriy oy)
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *         example: 1
 *         description: Fan bo'yicha filter
 *       - in: query
 *         name: teacher_id
 *         schema:
 *           type: integer
 *         example: 3
 *         description: O'qituvchi bo'yicha filter
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         example: "Akmal"
 *         description: Ism, familiya yoki telefon raqami bo'yicha qidiruv
 *     responses:
 *       200:
 *         description: Barcha studentlar davomat ma'lumotlari
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 month:
 *                   type: string
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total_students:
 *                       type: integer
 *                     students_with_attendance:
 *                       type: integer
 *                     average_percentage:
 *                       type: number
 *                     good_attendance:
 *                       type: integer
 *                     poor_attendance:
 *                       type: integer
 *                 filters:
 *                   type: object
 *                   properties:
 *                     subject_id:
 *                       type: integer
 *                     teacher_id:
 *                       type: integer
 *                     search:
 *                       type: string
 *                 count:
 *                   type: integer
 *                 students:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       student_id:
 *                         type: integer
 *                       student_name:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       phone2:
 *                         type: string
 *                       father_name:
 *                         type: string
 *                       father_phone:
 *                         type: string
 *                       address:
 *                         type: string
 *                       group_name:
 *                         type: string
 *                       subject_name:
 *                         type: string
 *                       teacher_name:
 *                         type: string
 *                       daily_records:
 *                         type: string
 *                         description: JSON array string
 *                       total_classes:
 *                         type: integer
 *                       attended_classes:
 *                         type: integer
 *                       attendance_percentage:
 *                         type: number
 */
router.get('/all-students', protect, roleCheck(['admin']), getAllStudentsAttendance);

module.exports = router;