const express = require('express');
const router = express.Router();
const { createOrUpdateAdminSalary, getAdminSalaryList } = require('../controllers/adminSalaryController');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');

/**
 * @swagger
 * /api/admin-salary/pay:
 *   post:
 *     summary: Admin oyligini berish yoki yangilash (Faqat super adminlar uchun)
 *     tags: [AdminSalary]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - admin_id
 *               - month_name
 *               - amount
 *             properties:
 *               admin_id:
 *                 type: integer
 *                 example: 12
 *               month_name:
 *                 type: string
 *                 example: "2026-03"
 *               amount:
 *                 type: number
 *                 example: 2500000
 *               description:
 *                 type: string
 *                 example: "Mart oyi oyligi"
 *     responses:
 *       201:
 *         description: Admin oyligi saqlandi
 *       200:
 *         description: Admin oyligi yangilandi
 */
router.post('/pay', protect, roleCheck(['super_admin']), createOrUpdateAdminSalary);

/**
 * @swagger
 * /api/admin-salary:
 *   get:
 *     summary: Admin oyliklari ro'yxati (Faqat super adminlar uchun)
 *     tags: [AdminSalary]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: admin_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month_name
 *         schema:
 *           type: string
 *           example: "2026-03"
 *     responses:
 *       200:
 *         description: Admin oyliklari ro'yxati
 */
router.get('/', protect, roleCheck(['super_admin']), getAdminSalaryList);

module.exports = router;
