const express = require('express');
const router = express.Router();
const { registerStudent, registerTeacher, loginStudent, getProfile, refreshAccessToken, getAllTeachers } = require('../controllers/userController');
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
 *     summary: Yangi studentni ro'yxatdan o'tkazish
 *     tags: [Users]
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
 *     responses:
 *       201:
 *         description: Student muvaffaqiyatli yaratildi
 *       400:
 *         description: Username band yoki ma'lumotlar xato
 */
router.post('/register', registerStudent);

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
 *               subject:
 *                 type: string
 *                 example: "Web Dasturlash"
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-05"
 *                 description: "Teacher ishni boshlagan sanasi"
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
 *       401:
 *         description: Avtorizatsiya xatosi (Access Token yo'q, xato yoki muddati o'tgan)
 */
router.get('/profile', protect, getProfile);

/**
 * @swagger
 * /api/users/teachers:
 *   get:
 *     summary: Barcha teacherlarni olish
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
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

module.exports = router;
