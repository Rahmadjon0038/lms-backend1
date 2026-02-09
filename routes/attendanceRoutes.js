const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const {
  getGroupsForAttendance,
  createLesson,
  getLessonStudents,
  markAttendance,
  getMonthlyAttendance,
  updateStudentMonthlyStatus,
  getGroupLessons,
  updateLessonDate,
  deleteLesson,
  exportMonthlyAttendance
} = require('../controllers/attendanceController');

/**
 * @swagger
 * /api/attendance/groups:
 *   get:
 *     summary: Guruhlar ro'yxati
 *     description: Davomat uchun guruhlar ro'yxatini olish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: teacher_id
 *         in: query
 *         schema:
 *           type: integer
 *       - name: subject_id
 *         in: query
 *         schema:
 *           type: integer
 *       - name: status_filter
 *         in: query
 *         schema:
 *           type: string
 *           enum: [active, blocked, all]
 *     responses:
 *       200:
 *         description: Guruhlar ro'yxati
 */
router.get('/groups', protect, roleCheck(['admin', 'teacher']), getGroupsForAttendance);

/**
 * @swagger
 * /api/attendance/lessons:
 *   post:
 *     summary: Yangi dars yaratish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - group_id
 *               - date
 *             properties:
 *               group_id:
 *                 type: integer
 *                 example: 1
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-02-05"
 *     responses:
 *       200:
 *         description: Dars yaratildi
 */
router.post('/lessons', protect, roleCheck(['admin', 'teacher']), createLesson);

/**
 * @swagger
 * /api/attendance/lessons/{lesson_id}/students:
 *   get:
 *     summary: Dars uchun studentlar ro'yxati
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: lesson_id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Studentlar ro'yxati
 */
router.get('/lessons/:lesson_id/students', protect, roleCheck(['admin', 'teacher']), getLessonStudents);

/**
 * @swagger
 * /api/attendance/lessons/{lesson_id}/mark:
 *   put:
 *     summary: Davomat belgilash
 *     description: Attendance ID orqali davomat belgilash
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: lesson_id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               attendance_records:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - attendance_id
 *                     - status
 *                   properties:
 *                     attendance_id:
 *                       type: integer
 *                       example: 1
 *                       description: Attendance yozuvi ID
 *                     status:
 *                       type: string
 *                       enum: [keldi, kelmadi, kechikdi]
 *                       example: "keldi"
 *           example:
 *             attendance_records:
 *               - attendance_id: 1
 *                 status: "keldi"
 *               - attendance_id: 2
 *                 status: "kelmadi"
 *     responses:
 *       200:
 *         description: Davomat belgilandi
 */
router.put('/lessons/:lesson_id/mark', protect, roleCheck(['admin', 'teacher']), markAttendance);

/**
 * @swagger
 * /api/attendance/groups/{group_id}/monthly:
 *   get:
 *     summary: Guruhning oylik davomati
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: group_id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *       - name: month
 *         in: query
 *         schema:
 *           type: string
 *           example: "2026-02"
 *     responses:
 *       200:
 *         description: Oylik davomat
 */
router.get('/groups/:group_id/monthly', protect, roleCheck(['admin', 'teacher']), getMonthlyAttendance);

/**
 * @swagger
 * /api/attendance/student/monthly-status:
 *   put:
 *     summary: Student oylik statusini o'zgartirish
 *     description: Har oy uchun mustaqil status. Masalan, fevral - stopped, mart - active
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - student_id
 *               - group_id
 *               - month
 *               - monthly_status
 *             properties:
 *               student_id:
 *                 type: integer
 *                 example: 2
 *               group_id:
 *                 type: integer
 *                 example: 1
 *               month:
 *                 type: string
 *                 example: "2026-02"
 *               monthly_status:
 *                 type: string
 *                 enum: [active, stopped, finished]
 *                 example: "stopped"
 *     responses:
 *       200:
 *         description: Status yangilandi
 */
router.put('/student/monthly-status', protect, roleCheck(['admin']), updateStudentMonthlyStatus);

/**
 * @swagger
 * /api/attendance/groups/{group_id}/lessons:
 *   get:
 *     summary: Guruh darslarini ko'rish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: group_id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *       - name: month
 *         in: query
 *         schema:
 *           type: string
 *           example: "2026-02"
 *     responses:
 *       200:
 *         description: Darslar ro'yxati
 */
router.get('/groups/:group_id/lessons', protect, roleCheck(['admin', 'teacher']), getGroupLessons);

/**
 * @swagger
 * /api/attendance/lessons/{lesson_id}/date:
 *   put:
 *     summary: Dars sanasini o'zgartirish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: lesson_id
 *         in: path
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
 *               - date
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-02-20"
 *     responses:
 *       200:
 *         description: Sana muvaffaqiyatli yangilandi
 */
router.put('/lessons/:lesson_id/date', protect, roleCheck(['admin', 'teacher']), updateLessonDate);

/**
 * @swagger
 * /api/attendance/lessons/{lesson_id}:
 *   delete:
 *     summary: Darsni o'chirish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: lesson_id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Dars o'chirildi
 */
router.delete('/lessons/:lesson_id', protect, roleCheck(['admin', 'teacher']), deleteLesson);

/**
 * @swagger
 * /api/attendance/groups/{group_id}/monthly/export:
 *   get:
 *     summary: Oylik davomatni Excel formatida eksport qilish
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: group_id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         description: Guruh ID raqami
 *       - name: month
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\\d{4}-\\d{2}$'
 *           example: "2026-02"
 *         description: Oy (YYYY-MM formatida)
 *     responses:
 *       200:
 *         description: Excel fayl
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Noto'g'ri parametr
 *       403:
 *         description: Ruxsat yo'q
 *       404:
 *         description: Ma'lumot topilmadi
 */
router.get('/groups/:group_id/monthly/export', protect, roleCheck(['admin', 'teacher']), exportMonthlyAttendance);

module.exports = router;
