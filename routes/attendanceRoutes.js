const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const {
  getGroupsForAttendance,
  createTodaysLesson,
  getLessonStudents,
  saveAttendance,
  getMonthlyAttendance
} = require('../controllers/attendanceController');

/**
 * @swagger
 * components:
 *   schemas:
 *     AttendanceGroup:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         subject_name:
 *           type: string
 *         teacher_name:
 *           type: string
 *         students_count:
 *           type: integer
 *         schedule:
 *           type: object
 *     
 *     LessonStudent:
 *       type: object
 *       properties:
 *         student_id:
 *           type: integer
 *         name:
 *           type: string
 *         surname:
 *           type: string
 *         phone:
 *           type: string
 *         status:
 *           type: string
 *           enum: [keldi, kelmadi, kechikdi]
 *     
 *     AttendanceRecord:
 *       type: object
 *       properties:
 *         student_id:
 *           type: integer
 *         status:
 *           type: string
 *           enum: [keldi, kelmadi, kechikdi]
 */

/**
 * @swagger
 * /api/attendance/groups:
 *   get:
 *     summary: ADMIN va TEACHER uchun guruhlar ro'yxati
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Guruhlar ro'yxati muvaffaqiyatli olindi
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
 *                     $ref: '#/components/schemas/AttendanceGroup'
 */
router.get('/groups', protect, roleCheck(['admin', 'teacher']), getGroupsForAttendance);

/**
 * @swagger
 * /api/attendance/groups/{group_id}/create-lesson:
 *   post:
 *     summary: Bugungi kun uchun dars yaratish
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
 *         description: Dars muvaffaqiyatli yaratildi
 *       400:
 *         description: Bugungi kun uchun dars allaqachon mavjud
 *       403:
 *         description: Guruhga kirish huquqi yo'q (teacher uchun)
 */
router.post('/groups/:group_id/create-lesson', protect, roleCheck(['admin', 'teacher']), createTodaysLesson);

/**
 * @swagger
 * /api/attendance/lessons/{lesson_id}/students:
 *   get:
 *     summary: Dars uchun studentlar ro'yxati va davomat holati
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lesson_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Dars ID
 *     responses:
 *       200:
 *         description: Studentlar ro'yxati muvaffaqiyatli olindi
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
 *                     lesson_id:
 *                       type: integer
 *                     group_id:
 *                       type: integer
 *                     group_name:
 *                       type: string
 *                     date:
 *                       type: string
 *                       format: date
 *                     students:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/LessonStudent'
 */
router.get('/lessons/:lesson_id/students', protect, roleCheck(['admin', 'teacher']), getLessonStudents);

/**
 * @swagger
 * /api/attendance/save:
 *   post:
 *     summary: Davomat belgilash/saqlash
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
 *               - lesson_id
 *               - attendance_data
 *             properties:
 *               lesson_id:
 *                 type: integer
 *               attendance_data:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/AttendanceRecord'
 *     responses:
 *       200:
 *         description: Davomat muvaffaqiyatli saqlandi
 *       400:
 *         description: Noto'g'ri ma'lumotlar
 *       403:
 *         description: Guruhga kirish huquqi yo'q (teacher uchun)
 */
router.post('/save', protect, roleCheck(['admin', 'teacher']), saveAttendance);

/**
 * @swagger
 * /api/attendance/groups/{group_id}/monthly:
 *   get:
 *     summary: Oylik davomat jadvali
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
 *           pattern: ^\d{4}-\d{2}$
 *           example: "2026-01"
 *         description: Oy (YYYY-MM formatida)
 *     responses:
 *       200:
 *         description: Oylik davomat jadvali muvaffaqiyatli olindi
 *       403:
 *         description: Guruhga kirish huquqi yo'q (teacher uchun)
 */
router.get('/groups/:group_id/monthly', protect, roleCheck(['admin', 'teacher']), getMonthlyAttendance);

module.exports = router;
