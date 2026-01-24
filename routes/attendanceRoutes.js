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
  getGroupLessons,
  deleteLesson
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
 *           description: Guruh ID
 *           example: 43
 *         name:
 *           type: string
 *           description: Guruh nomi
 *           example: "Frontend 1"
 *         unique_code:
 *           type: string
 *           description: Guruh kodi
 *           example: "GR-B4D9AB"
 *         subject_name:
 *           type: string
 *           description: Fan nomi
 *           example: "IT"
 *         teacher_name:
 *           type: string
 *           description: O'qituvchi ismi
 *           example: "Rahmadjon Abdullayev"
 *         students_count:
 *           type: integer
 *           description: Guruhdagi jami studentlar soni
 *           example: 2
 *         class_start_date:
 *           type: string
 *           format: date-time
 *           description: Darslar boshlangan sana
 *           example: "2026-01-22T19:00:00.000Z"
 *         schedule:
 *           type: object
 *           description: Dars jadvali
 *           properties:
 *             days:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["Seshanba", "Payshanba", "Shanba"]
 *             time:
 *               type: string
 *               example: "18:00-20:00"
 *         room_number:
 *           type: string
 *           description: Xona raqami
 *           example: "2"
 *     
 *     LessonStudent:
 *       type: object
 *       properties:
 *         student_id:
 *           type: integer
 *           example: 23
 *         name:
 *           type: string
 *           example: "Mirjalol"
 *         surname:
 *           type: string
 *           example: "Abdusalomov"
 *         phone:
 *           type: string
 *           example: "+998901234567"
 *         attendance_status:
 *           type: string
 *           enum: [keldi, kelmadi, kechikdi, inactive]
 *           example: "kelmadi"
 *         group_status:
 *           type: string
 *           enum: [active, stopped, finished]
 *           example: "active"
 *         group_status_description:
 *           type: string
 *           enum: [Faol, Nofaol, Bitirgan]
 *           example: "Faol"
 *         can_mark_attendance:
 *           type: boolean
 *           description: Davomat o'zgartirish mumkinmi
 *           example: true
 *     
 *     AttendanceRecord:
 *       type: object
 *       required:
 *         - student_id
 *         - status
 *       properties:
 *         student_id:
 *           type: integer
 *           description: Student ID
 *           example: 23
 *         status:
 *           type: string
 *           enum: [keldi, kelmadi, kechikdi]
 *           description: Davomat holati
 *           example: "keldi"
 */

/**
 * @swagger
 * /api/attendance/groups:
 *   get:
 *     summary: Attendance uchun guruhlar ro'yxati
 *     description: |
 *       Darslar uchun guruhlar ro'yxatini olish. 
 *       Teacher faqat o'z guruhlarini ko'radi.
 *       Admin barcha guruhlarni ko'radi va filter ishlatishi mumkin.
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: teacher_id
 *         schema:
 *           type: integer
 *         description: O'qituvchi ID bo'yicha filter (faqat admin uchun)
 *         example: 35
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *         description: Fan ID bo'yicha filter
 *         example: 2
 *     responses:
 *       200:
 *         description: Guruhlar muvaffaqiyatli olindi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Guruhlar muvaffaqiyatli olindi"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AttendanceGroup'
 *       403:
 *         description: Ruxsat yo'q
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
                   example: "Sizda bu amalni bajarish huquqi yo'q"
 */
router.get('/groups', protect, roleCheck(['admin', 'teacher']), getGroupsForAttendance);

/**
 * @swagger
 * /api/attendance/lessons/create:
 *   post:
 *     summary: Yangi dars yaratish
 *     description: |
 *       Ma'lum sana uchun yangi dars yaratish.
 *       Dars yaratilganda guruhdagi barcha studentlar uchun davomat yozuvlari avtomatik yaratiladi.
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
 *                 description: Guruh ID
 *                 example: 43
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Dars sanasi (YYYY-MM-DD formatda)
 *                 example: "2026-01-24"
 *           example:
 *             group_id: 43
 *             date: "2026-01-24"
 *     responses:
 *       200:
 *         description: Dars muvaffaqiyatli yaratildi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Dars muvaffaqiyatli yaratildi"
 *                 data:
 *                   type: object
 *                   properties:
 *                     lesson_id:
 *                       type: integer
 *                       example: 25
 *                     group_id:
 *                       type: integer
 *                       example: 43
 *                     date:
 *                       type: string
 *                       format: date
 *                       example: "2026-01-24"
 *                     students_count:
 *                       type: integer
 *                       example: 2
 *       400:
 *         description: Shu sana uchun dars allaqachon yaratilgan yoki noto'g'ri ma'lumot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Shu sana uchun dars allaqachon yaratilgan"
 *                 lesson_id:
 *                   type: integer
 *                   example: 24
 *       403:
 *         description: Guruhda dars yaratish huquqi yo'q
 *       404:
 *         description: Guruh topilmadi yoki darslar boshlanmagan
 */
router.post('/lessons/create', protect, roleCheck(['admin', 'teacher']), createLesson);

/**
 * @swagger
 * /api/attendance/lessons/{lesson_id}/students:
 *   get:
 *     summary: Dars uchun studentlar ro'yxati
 *     description: |
 *       Ma'lum dars uchun barcha studentlar ro'yxatini olish.
 *       Har bir student uchun ism-familiya, telefon raqami, davomat holati ko'rsatiladi.
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
 *         example: 24
 *     responses:
 *       200:
 *         description: Studentlar ro'yxati olindi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Studentlar muvaffaqiyatli olindi"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/LessonStudent'
 *       404:
 *         description: Dars topilmadi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Dars topilmadi"
 */
router.get('/lessons/:lesson_id/students', protect, roleCheck(['admin', 'teacher']), getLessonStudents);

/**
 * @swagger
 * /api/attendance/mark:
 *   post:
 *     summary: Davomat belgilash
 *     description: |
 *       Dars uchun studentlar davomatini belgilash.
 *       Bir nechta studentning davomat holatini bir vaqtda o'zgartirish mumkin.
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
 *                 description: Dars ID
 *                 example: 24
 *               attendance_data:
 *                 type: array
 *                 description: Studentlar davomat ma'lumotlari
 *                 items:
 *                   $ref: '#/components/schemas/AttendanceRecord'
 *           example:
 *             lesson_id: 24
 *             attendance_data:
 *               - student_id: 23
 *                 status: "keldi"
 *               - student_id: 46
 *                 status: "kechikdi"
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
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Davomat belgilari muvaffaqiyatli saqlandi"
 *                 updated_count:
 *                   type: integer
 *                   description: O'zgartirilgan yozuvlar soni
 *                   example: 2
 *       400:
 *         description: Noto'g'ri ma'lumot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Attendance data talab qilinadi"
 *       404:
 *         description: Dars topilmadi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Dars topilmadi"
 */
router.post('/mark', protect, roleCheck(['admin', 'teacher']), markAttendance);

/**
 * @swagger
 * /api/attendance/groups/{group_id}/monthly:
 *   get:
 *     summary: Oylik davomat jadvali
 *     description: |
 *       Ma'lum guruh uchun oylik davomat jadvalini ko'rish.
 *       Jadvalda barcha darslar va studentlar uchun davomat holatlari ko'rsatiladi.
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
 *         example: 43
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *           pattern: "^[0-9]{4}-[0-9]{2}$"
 *         description: Oy (YYYY-MM formatda)
 *         example: "2026-01"
 *     responses:
 *       200:
 *         description: Oylik davomat jadvali olindi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Oylik davomat jadvali muvaffaqiyatli olindi"
 *                 data:
 *                   type: object
 *                   properties:
 *                     group_info:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 43
 *                         name:
 *                           type: string
 *                           example: "Node js asoslari 16"
 *                         teacher_name:
 *                           type: string
 *                           example: "Rahmadjon Abdullayev"
 *                         month:
 *                           type: string
 *                           example: "2026-01"
 *                     students:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           student_id:
 *                             type: integer
 *                             example: 23
 *                           name:
 *                             type: string
 *                             example: "Mirjalol"
 *                           surname:
 *                             type: string
 *                             example: "Abdusalomov"
 *                           attendance_records:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 date:
 *                                   type: string
 *                                   format: date
 *                                   example: "2026-01-24"
 *                                 status:
 *                                   type: string
 *                                   enum: [keldi, kelmadi, kechikdi]
 *                                   example: "keldi"
 *       400:
 *         description: Noto'g'ri oy formati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Month parameter talab qilinadi (YYYY-MM format)"
 *       404:
 *         description: Guruh topilmadi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Guruh topilmadi"
 */
router.get('/groups/:group_id/monthly', protect, roleCheck(['admin', 'teacher']), getMonthlyAttendance);

/**
 * @swagger
 * /api/attendance/groups/{group_id}/lessons:
 *   get:
 *     summary: Guruh uchun yaratilgan darslar ro'yxati
 *     description: |
 *       Ma'lum guruh uchun yaratilgan barcha darslar ro'yxatini ko'rish.
 *       Har bir dars uchun sana, studentlar soni va davomat statistikasi ko'rsatiladi.
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
 *         example: 43
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           pattern: "^[0-9]{4}-[0-9]{2}$"
 *         description: Oy bo'yicha filter (YYYY-MM formatda). Agar berilmasa, barcha darslar qaytariladi
 *         example: "2026-01"
 *     responses:
 *       200:
 *         description: Darslar ro'yxati muvaffaqiyatli olindi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Darslar ro'yxati muvaffaqiyatli olindi"
 *                 data:
 *                   type: object
 *                   properties:
 *                     group_info:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 43
 *                         name:
 *                           type: string
 *                           example: "Node js asoslari 16"
 *                         teacher_name:
 *                           type: string
 *                           example: "Rahmadjon Abdullayev"
 *                     lessons:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             description: Dars ID
 *                             example: 24
 *                           lesson_date:
 *                             type: string
 *                             format: date
 *                             description: Dars sanasi
 *                             example: "2026-01-24"
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             description: Dars yaratilgan vaqt
 *                             example: "2026-01-24T10:30:00.000Z"
 *                           students_count:
 *                             type: integer
 *                             description: Jami studentlar soni
 *                             example: 2
 *                           present_count:
 *                             type: integer
 *                             description: Kelgan studentlar soni
 *                             example: 1
 *                           absent_count:
 *                             type: integer
 *                             description: Kelmagan studentlar soni
 *                             example: 0
 *                           late_count:
 *                             type: integer
 *                             description: Kechikgan studentlar soni
 *                             example: 1
 *       403:
 *         description: Guruhga kirish huquqi yo'q
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Bu guruhda dars yaratish huquqingiz yo'q"
 *       404:
 *         description: Guruh topilmadi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Guruh topilmadi"
 */
router.get('/groups/:group_id/lessons', protect, roleCheck(['admin', 'teacher']), getGroupLessons);

/**
 * @swagger
 * /api/attendance/lessons/{lesson_id}:
 *   delete:
 *     summary: Darsni o'chirish
 *     description: |
 *       Ma'lum darsni va unga tegishli barcha davomat yozuvlarini o'chirish.
 *       Teacher faqat o'z darsini o'chira oladi, Admin barcha darslarni.
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lesson_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: O'chiriladigan dars ID
 *         example: 24
 *     responses:
 *       200:
 *         description: Dars muvaffaqiyatli o'chirildi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Dars muvaffaqiyatli o'chirildi"
 *                 lesson_id:
 *                   type: integer
 *                   description: O'chirilgan dars ID
 *                   example: 24
 *       403:
 *         description: Darsni o'chirish huquqi yo'q
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Sizda bu darsni o'chirish huquqi yo'q"
 *       404:
 *         description: Dars topilmadi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Dars topilmadi"
 */
router.delete('/lessons/:lesson_id', protect, roleCheck(['admin', 'teacher']), deleteLesson);

module.exports = router;
