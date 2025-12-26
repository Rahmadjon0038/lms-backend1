const express = require('express');
const router = express.Router();
const { registerStudent, loginStudent, getProfile, refreshAccessToken } = require('../controllers/userController');
const { protect } = require('../middlewares/authMiddleware');

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

module.exports = router;
