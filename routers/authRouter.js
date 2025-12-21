const express = require('express');
const router = express.Router();
const userController = require('../controllers/authControllers');

/**
 * @swagger
 * /api/users/add:
 *   post:
 *     summary: Admin tomonidan yangi foydalanuvchi (student) qo'shish
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
 *               - role
 *             properties:
 *               username:
 *                 type: string
 *                 example: "student_001"
 *               password:
 *                 type: string
 *                 example: "123456"
 *               role:
 *                 type: string
 *                 example: "student"
 *               email:
 *                 type: string
 *                 nullable: true
 *                 example: null
 *               createdBy:
 *                 type: string
 *                 example: "admin_01"
 *     responses:
 *       201:
 *         description: Foydalanuvchi muvaffaqiyatli yaratildi
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
 *       400:
 *         description: Username allaqachon mavjud yoki xato ma'lumot yuborildi
 *       500:
 *         description: Serverda xatolik yuz berdi
 */
router.post('/add', userController.addUserByAdmin);
/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Tizimga kirish (Login)
 *     tags: [Auth]
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
 *                 example: "student_001"
 *               password:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Muvaffaqiyatli kirildi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 role:
 *                   type: string
 */
router.post('/login', userController.loginUser);


module.exports = router;
