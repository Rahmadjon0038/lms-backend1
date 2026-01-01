const express = require("express");
const router = express.Router();
const studentController = require("../controllers/studentController");
const { protect } = require("../middlewares/authMiddleware");
const { roleCheck } = require("../middlewares/roleMiddleware");

/**
 * @swagger
 * /api/students/make-student:
 *   post:
 *     summary: Mavjud userni student qilish va guruhga biriktirish
 *     tags: [Students]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user_id
 *             properties:
 *               user_id:
 *                 type: integer
 *                 example: 1001
 *               group_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: User student qilindi va guruhga biriktirildi
 */
router.post('/make-student', protect, roleCheck(['admin']), studentController.makeUserStudent);

/**
 * @swagger
 * components:
 *   schemas:
 *     StudentCreate:
 *       type: object
 *       required:
 *         - name
 *         - surname
 *         - username
 *         - password
 *       properties:
 *         name:
 *           type: string
 *           description: Studentning ismi
 *           example: Alijon
 *         surname:
 *           type: string
 *           description: Studentning familiyasi
 *           example: Murodov
 *         username:
 *           type: string
 *           description: Tizimga kirish uchun login (unique)
 *           example: alijon123
 *         password:
 *           type: string
 *           description: Maxfiy parol
 *           example: password123
 *         phone:
 *           type: string
 *           description: Telefon raqami
 *           example: "+998901234567"
 *         phone2:
 *           type: string
 *           description: Qo‘shimcha telefon raqami
 *           example: "+998931112233"
 *         group_id:
 *           type: integer
 *           nullable: true
 *           description: Biriktiriladigan guruh IDsi (ixtiyoriy)
 *           example: 1
 */

/**
 * @swagger
 * tags:
 *   name: Students
 *   description: Studentlarni boshqarish APIlari
 */

/**
 * @swagger
 * /api/students/all:
 *   get:
 *     summary: Studentlarni oy, teacher, group bo'yicha filtrlab olish
 *     tags: [Students]
 *     parameters:
 *       - in: query
 *         name: month
 *         required: false
 *         schema:
 *           type: string
 *           enum: [all, "01", "02", "03", "11", "12"]
 *         description: Oy raqami yoki 'all' (barcha oylar uchun)
 *       - in: query
 *         name: teacher_id
 *         required: false
 *         schema:
 *           type: integer
 *         description: O'qituvchi IDsi bo'yicha filter
 *       - in: query
 *         name: group_id
 *         required: false
 *         schema:
 *           type: integer
 *         description: Guruh IDsi bo'yicha filter
 *     responses:
 *       200:
 *         description: Muvaffaqiyatli ro'yxat qaytdi
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   name:
 *                     type: string
 *                     example: Alijon
 *                   surname:
 *                     type: string
 *                     example: Murodov
 *                   group_name:
 *                     type: string
 *                     example: Frontend-01
 *                   paid_amount:
 *                     type: number
 *                     example: 600000
 *       500:
 *         description: Server xatosi
 */
router.get("/all", studentController.getAllStudents);

module.exports = router;
