const express = require('express');
const router = express.Router();
const { registerStudent, registerTeacher, loginStudent, getProfile, refreshAccessToken, getAllTeachers, setTeacherOnLeave, terminateTeacher, reactivateTeacher, deleteTeacher, patchTeacher, updateTeacherInfo } = require('../controllers/userController');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: Foydalanuvchilarni boshqarish (Register, Login, Profile, Token Refresh)
 */

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Yangi studentni ro'yxatdan o'tkazish (Faqat adminlar uchun)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - surname
 *               - username
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Ali
 *               surname:
 *                 type: string
 *                 example: Valiyev
 *               username:
 *                 type: string
 *                 example: ali777
 *               password:
 *                 type: string
 *                 example: parol123
 *               phone:
 *                 type: string
 *                 example: "+998901234567"
 *               phone2:
 *                 type: string
 *                 example: "+998912345678"
 *               father_name:
 *                 type: string
 *                 example: Abdulla
 *               father_phone:
 *                 type: string
 *                 example: "+998901111111"
 *               address:
 *                 type: string
 *                 example: "Tashkent shahar, Chilonzor tumani"
 *               age:
 *                 type: integer
 *                 example: 20
 *     responses:
 *       201:
 *         description: Student muvaffaqiyatli yaratildi
 *       400:
 *         description: Username band yoki ma'lumotlar xato
 */
router.post('/register', protect, roleCheck(['admin']), registerStudent);

/**
 * @swagger
 * /api/users/register-teacher:
 *   post:
 *     summary: Yangi teacher yaratish (Faqat adminlar uchun)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - surname
 *               - username
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Alijon
 *               surname:
 *                 type: string
 *                 example: Murodov
 *               username:
 *                 type: string
 *                 example: teacher01
 *               password:
 *                 type: string
 *                 example: parol123
 *               phone:
 *                 type: string
 *                 example: "+998901234567"
 *               phone2:
 *                 type: string
 *                 example: "+998912345678"
 *               subject_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3]
 *                 description: "Fan ID lari (kamida bitta kerak) - subjects jadvalidagi fan ID lari"
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-05"
 *                 description: "Teacher ishni boshlagan sanasi"
 *               certificate:
 *                 type: string
 *                 example: "Web Development Certificate"
 *                 description: "Teacher sertifikati"
 *               age:
 *                 type: integer
 *                 example: 28
 *                 description: "Teacher yoshi"
 *               has_experience:
 *                 type: boolean
 *                 example: true
 *                 description: "Tajribasi bormi yo'qmi"
 *               experience_years:
 *                 type: integer
 *                 example: 3
 *                 description: "Necha yillik tajriba (has_experience=true bo'lsa)"
 *               experience_place:
 *                 type: string
 *                 example: "IT Academy, Google"
 *                 description: "Qayerda tajriba to'plagan"
 *               available_times:
 *                 type: string
 *                 example: "09:00-18:00"
 *                 description: "Qaysi vaqtlarda ishlay oladi"
 *               work_days_hours:
 *                 type: string
 *                 example: "Dushanba-Juma: 09:00-18:00, Shanba: 09:00-13:00"
 *                 description: "Ish kunlari va soatlari"
 *     responses:
 *       201:
 *         description: Teacher muvaffaqiyatli yaratildi
 *       400:
 *         description: Username band yoki ma'lumotlar xato
 *       403:
 *         description: Faqat adminlar teacher yarata oladi
 */
router.post('/register-teacher', protect, roleCheck(['admin', 'super_admin']), registerTeacher);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Tizimga kirish (Access va Refresh Token olish)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: ali777
 *               password:
 *                 type: string
 *                 example: parol123
 *     responses:
 *       200:
 *         description: Muvaffaqiyatli login, tokenlar qaytariladi
 *       401:
 *         description: Username yoki parol xato
 */
router.post('/login', loginStudent);

/**
 * @swagger
 * /api/users/refresh:
 *   post:
 *     summary: Refresh Token yordamida yangi Access Token olish
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Login vaqtida berilgan Refresh Token
 *     responses:
 *       200:
 *         description: Yangi Access Token muvaffaqiyatli yaratildi
 *       403:
 *         description: Refresh Token yaroqsiz yoki muddati o'tgan
 */
router.post('/refresh', refreshAccessToken);

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Foydalanuvchi profil ma'lumotlarini olish
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Foydalanuvchi ma'lumotlari
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 name:
 *                   type: string
 *                   example: Ali
 *                 surname:
 *                   type: string
 *                   example: Valiyev
 *                 username:
 *                   type: string
 *                   example: ali777
 *                 role:
 *                   type: string
 *                   example: student
 *                 status:
 *                   type: string
 *                   example: active
 *                 phone:
 *                   type: string
 *                   example: "+998901234567"
 *                 phone2:
 *                   type: string
 *                   example: "+998912345678"
 *                 father_name:
 *                   type: string
 *                   example: Abdulla
 *                 father_phone:
 *                   type: string
 *                   example: "+998901111111"
 *                 address:
 *                   type: string
 *                   example: "Tashkent shahar, Chilonzor tumani"
 *                 age:
 *                   type: integer
 *                   example: 20
 *                 subject:
 *                   type: string
 *                   example: "Web Dasturlash"
 *                   description: "Teacher uchun fan nomi"
 *                 start_date:
 *                   type: string
 *                   format: date
 *                   example: "2025-01-05"
 *                   description: "Teacher ishni boshlagan sanasi"
 *                 end_date:
 *                   type: string
 *                   format: date
 *                   nullable: true
 *                   example: null
 *                   description: "Teacher ishni tugatgan sanasi"
 *                 certificate:
 *                   type: string
 *                   example: "Web Development Certificate"
 *                   description: "Teacher sertifikati"
 *                 has_experience:
 *                   type: boolean
 *                   example: true
 *                   description: "Tajribasi bormi yo'qmi"
 *                 experience_years:
 *                   type: integer
 *                   example: 3
 *                   description: "Necha yillik tajriba"
 *                 experience_place:
 *                   type: string
 *                   example: "IT Academy, Google"
 *                   description: "Qayerda tajriba to'plagan"
 *                 available_times:
 *                   type: string
 *                   example: "09:00-18:00"
 *                   description: "Qaysi vaqtlarda ishlay oladi"
 *                 work_days_hours:
 *                   type: string
 *                   example: "Dushanba-Juma: 09:00-18:00, Shanba: 09:00-13:00"
 *                   description: "Ish kunlari va soatlari"
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Avtorizatsiya xatosi (Access Token yo'q, xato yoki muddati o'tgan)
 */
router.get('/profile', protect, getProfile);

/**
 * @swagger
 * /api/users/teachers:
 *   get:
 *     summary: Barcha teacherlarni olish (fan bo'yicha filter bilan)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: subject_id
 *         required: false
 *         schema:
 *           type: integer
 *         description: Fan IDsi bo'yicha filter
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [active, inactive, blocked]
 *         description: Teacher holati bo'yicha filter
 *     responses:
 *       200:
 *         description: Teacherlar ro'yxati muvaffaqiyatli olindi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Teacherlar muvaffaqiyatli olindi"
 *                 teachers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1001
 *                       name:
 *                         type: string
 *                         example: "Alijon"
 *                       surname:
 *                         type: string
 *                         example: "Murodov"
 *                       subject:
 *                         type: string
 *                         example: "Web Dasturlash"
 *                       status:
 *                         type: string
 *                         example: "Faol"
 *                       isActive:
 *                         type: boolean
 *                         example: true
 *                       startDate:
 *                         type: string
 *                         format: date
 *                         example: "2025-01-05"
 *                       endDate:
 *                         type: string
 *                         format: date
 *                         nullable: true
 *                         example: null
 *                       registrationDate:
 *                         type: string
 *                         example: "2025-12-10"
 *                       phone:
 *                         type: string
 *                         example: "+998 90 123 45 67"
 *                       phone2:
 *                         type: string
 *                         example: "+998 93 111 22 33"
 *                       certificate:
 *                         type: string
 *                         example: "Web Development Certificate"
 *                       age:
 *                         type: integer
 *                         example: 28
 *                       hasExperience:
 *                         type: boolean
 *                         example: true
 *                       experienceYears:
 *                         type: integer
 *                         example: 3
 *                       experiencePlace:
 *                         type: string
 *                         example: "IT Academy, Google"
 *                       availableTimes:
 *                         type: string
 *                         example: "09:00-18:00"
 *                       workDaysHours:
 *                         type: string
 *                         example: "Dushanba-Juma: 09:00-18:00, Shanba: 09:00-13:00"
 *                       groupCount:
 *                         type: integer
 *                         example: 2
 *                 total:
 *                   type: integer
 *                   example: 5
 *       401:
 *         description: Avtorizatsiya xatosi
 *       403:
 *         description: Faqat admin va super_admin ko'ra oladi
 *       500:
 *         description: Server xatosi
 */
router.get('/teachers', protect, roleCheck(['admin', 'super_admin']), getAllTeachers);

/**
 * @swagger
 * /api/users/teachers/{teacherId}/leave:
 *   patch:
 *     summary: Teacher'ni dam olishga chiqarish
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Teacher ID
 *     responses:
 *       200:
 *         description: Teacher dam olishga chiqarildi
 *       404:
 *         description: Teacher topilmadi
 *       400:
 *         description: Teacher allaqachon dam olish holatida
 */
router.patch('/teachers/:teacherId/leave', protect, roleCheck(['admin']), setTeacherOnLeave);

/**
 * @swagger
 * /api/users/teachers/{teacherId}/terminate:
 *   patch:
 *     summary: Teacher'ni ishdan boshatish
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Teacher ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               terminationDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-15"
 *                 description: Ishdan boshatish sanasi (ko'rsatilmasa, bugungi sana)
 *     responses:
 *       200:
 *         description: Teacher ishdan boshatildi
 *       404:
 *         description: Teacher topilmadi
 *       400:
 *         description: Teacher allaqachon ishdan boshatilgan
 */
router.patch('/teachers/:teacherId/terminate', protect, roleCheck(['admin']), terminateTeacher);

/**
 * @swagger
 * /api/users/teachers/{teacherId}/reactivate:
 *   patch:
 *     summary: Teacher'ni qayta faollashtirish (dam olish/ishdan boshatishdan)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Teacher ID
 *     responses:
 *       200:
 *         description: Teacher qayta faollashtirildi
 *       404:
 *         description: Teacher topilmadi
 *       400:
 *         description: Teacher allaqachon faol holatda
 */
router.patch('/teachers/:teacherId/reactivate', protect, roleCheck(['admin']), reactivateTeacher);

/**
 * @swagger
 * /api/users/teachers/{teacherId}:
 *   delete:
 *     summary: Teacher'ni butunlay o'chirish
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Teacher ID
 *     responses:
 *       200:
 *         description: Teacher butunlay o'chirildi
 *       404:
 *         description: Teacher topilmadi
 *       400:
 *         description: Teacher'ga bog'langan guruhlar mavjud
 */
router.delete('/teachers/:teacherId', protect, roleCheck(['admin']), deleteTeacher);

// Teacher ma'lumotlarini qisman yangilash (eski endpoint)
router.patch('/teachers/:teacherId', protect, roleCheck(['admin']), patchTeacher);

/**
 * @swagger
 * /api/users/teachers/{teacherId}/update:
 *   patch:
 *     summary: Teacher ma'lumotlarini yangilash (sodda endpoint)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacherId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               surname:
 *                 type: string
 *               phone:
 *                 type: string
 *               phone2:
 *                 type: string
 *               subject_ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *               certificate:
 *                 type: string
 *               age:
 *                 type: integer
 *               has_experience:
 *                 type: boolean
 *               experience_years:
 *                 type: integer
 *               experience_place:
 *                 type: string
 *               available_times:
 *                 type: string
 *               work_days_hours:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Error
 *       404:
 *         description: Not Found
 */
router.patch('/teachers/:teacherId/update', protect, roleCheck(['admin']), updateTeacherInfo);

module.exports = router;
