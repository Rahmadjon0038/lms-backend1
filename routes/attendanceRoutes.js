const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const {
  getGroupsForAttendance,
  createOrGetTodaysLesson,
  saveLessonAttendance,
  getMonthlyAttendanceGrid,
  getGroupLessons,
  markAttendanceByGroupDate
} = require('../controllers/attendanceController');

/**
 * @swagger
 * components:
 *   schemas:
 *     Lesson:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         group_id:
 *           type: integer
 *         date:
 *           type: string
 *           format: date
 *         students:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/StudentAttendance'
 *     
 *     StudentAttendance:
 *       type: object
 *       properties:
 *         student_id:
 *           type: integer
 *         name:
 *           type: string
 *         surname:
 *           type: string
 *         status:
 *           type: string
 *           enum: [present, absent]
 *           description: "present=kelgan, absent=kelmagan"
 */

/**
 * @swagger
 * /api/attendance/groups:
 *   get:
 *     summary: Davomat uchun guruhlar ro'yxati
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Guruhlar ro'yxati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       subject_name:
 *                         type: string
 *                       teacher_name:
 *                         type: string
 *                       students_count:
 *                         type: integer
 */
router.get('/groups', protect, roleCheck(['admin', 'teacher']), getGroupsForAttendance);

/**
 * @swagger
 * /api/attendance/lesson/{group_id}:
 *   post:
 *     summary: Bugungi kun uchun dars yaratish yoki ochish (New Attendance tugmasi)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: group_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Guruh ID
 *     responses:
 *       200:
 *         description: Dars ma'lumotlari va talabalar ro'yxati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Lesson'
 *       403:
 *         description: Ruxsat yo'q
 *       404:
 *         description: Guruh topilmadi
 */
router.post('/lesson/:group_id', protect, roleCheck(['admin', 'teacher']), createOrGetTodaysLesson);

/**
 * @swagger
 * /api/attendance/save:
 *   put:
 *     summary: Dars davomatini saqlash
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lesson_id:
 *                 type: integer
 *                 description: Dars ID
 *               attendance_data:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     student_id:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       enum: [present, absent]
 *                 description: "Talabalarning attendance ma'lumotlari"
 *     responses:
 *       200:
 *         description: Davomat muvaffaqiyatli saqlandi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Noto'g'ri ma'lumot
 *       403:
 *         description: Ruxsat yo'q
 *       404:
 *         description: Dars topilmadi
 */
router.put('/save', protect, roleCheck(['admin', 'teacher']), saveLessonAttendance);

/**
 * @swagger
 * /api/attendance/monthly/{group_id}:
 *   get:
 *     summary: Guruh uchun oylik davomat jadvali ko'rish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: group_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Guruh ID
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *         description: "Oy (YYYY-MM format). Masalan: 2026-01"
 *         example: "2026-01"
 *     responses:
 *       200:
 *         description: Oylik davomat jadvali
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     group:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         subject_name:
 *                           type: string
 *                         teacher_name:
 *                           type: string
 *                     lesson_dates:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: date
 *                       description: "Oy ichidagi barcha dars kunlari"
 *                     students:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           student_id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           surname:
 *                             type: string
 *                           daily_attendance:
 *                             type: object
 *                             description: "Kunlar bo'yicha davomat (present/absent/null)"
 *                     month:
 *                       type: string
 *                       example: "2026-01"
 *       403:
 *         description: Ruxsat yo'q
 *       404:
 *         description: Guruh topilmadi
 */
router.get('/monthly/:group_id', protect, roleCheck(['admin', 'teacher']), getMonthlyAttendanceGrid);

/**
 * @swagger
 * /api/attendance/lessons/{group_id}:
 *   get:
 *     summary: Guruhning barcha darslarini ko'rish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: group_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Guruh ID
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: "Boshlang'ich sana"
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: "Tugash sanasi"
 *     responses:
 *       200:
 *         description: Darslar ro'yxati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         description: "Dars ID"
 *                       date:
 *                         type: string
 *                         format: date
 *                       total_students:
 *                         type: integer
 *                       present_count:
 *                         type: integer
 *                       absent_count:
 *                         type: integer
 *       403:
 *         description: Ruxsat yo'q
 *       404:
 *         description: Guruh topilmadi
 */
router.get('/lessons/:group_id', protect, roleCheck(['admin', 'teacher']), getGroupLessons);

/**
 * @swagger
 * /api/attendance/mark-simple:
 *   put:
 *     summary: Oddiy davomat belgilash (lesson_id kerak emas)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               group_id:
 *                 type: integer
 *                 description: Guruh ID
 *               date:
 *                 type: string
 *                 format: date
 *                 description: "Dars sanasi (YYYY-MM-DD)"
 *                 example: "2026-01-21"
 *               attendance_data:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     student_id:
 *                       type: integer
 *                     status:
 *                       type: string
 *                       enum: [present, absent]
 *                 description: "Talabalarning davomat ma'lumotlari"
 *     responses:
 *       200:
 *         description: Davomat muvaffaqiyatli saqlandi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     lesson_id:
 *                       type: integer
 *                     group_id:
 *                       type: integer
 *                     date:
 *                       type: string
 *                     updated_count:
 *                       type: integer
 *       400:
 *         description: Noto'g'ri ma'lumot
 *       403:
 *         description: Ruxsat yo'q
 *       404:
 *         description: Guruh topilmadi
 */
router.put('/mark-simple', protect, roleCheck(['admin', 'teacher']), markAttendanceByGroupDate);


module.exports = router;