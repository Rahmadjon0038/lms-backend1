const express = require('express');
const router = express.Router();
const { adminAddStudentToGroup, studentJoinByCode } = require('../controllers/groupController');
const { protect } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   - name: Groups
 *     description: Guruhlar va studentlarni guruhga biriktirish operatsiyalari
 */

/**
 * @swagger
 * /api/groups/admin/join-student:
 *   post:
 *     summary: Admin tomonidan studentni guruhga qo'shish
 *     tags: [Groups]
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
 *             properties:
 *               student_id:
 *                 type: integer
 *                 description: Foydalanuvchi (student) ning ID raqami
 *                 example: 1
 *               group_id:
 *                 type: string
 *                 format: uuid
 *                 description: Guruhning UUID raqami
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       201:
 *         description: Student guruhga muvaffaqiyatli qo'shildi
 *       400:
 *         description: Student allaqachon guruhda mavjud yoki xato ma'lumot
 *       401:
 *         description: Avtorizatsiya xatosi
 */
router.post('/admin/join-student', protect, adminAddStudentToGroup);

/**
 * @swagger
 * /api/groups/student/join:
 *   post:
 *     summary: Student o'zi maxsus kod orqali guruhga qo'shilishi
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - unique_code
 *             properties:
 *               unique_code:
 *                 type: string
 *                 description: Guruhning maxsus taklif kodi
 *                 example: "MATH101-XYZ"
 *     responses:
 *       201:
 *         description: Guruhga muvaffaqiyatli qo'shildi
 *       404:
 *         description: Bunday kodli guruh topilmadi
 *       400:
 *         description: Guruh faol emas yoki student allaqachon qo'shilgan
 */
router.post('/student/join', protect, studentJoinByCode);

module.exports = router;
