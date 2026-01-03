const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const {
    getStudentsForPayment,
    setMonthlyRequirement,
    addPayment,
    getStudentPayments,
    getMonthlyPayments,
    getGroupPayments,
    getAllPayments,
    deletePayment,
    getFinancialReport
} = require('../controllers/paymentController');

/**
 * @swagger
 * components:
 *   schemas:
 *     MonthlyFee:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         student_id:
 *           type: integer
 *         group_id:
 *           type: integer
 *         month_name:
 *           type: string
 *           example: "2026-01"
 *         required_amount:
 *           type: number
 *           description: Shu oy uchun to'lashi kerak bo'lgan summa
 *         paid_amount:
 *           type: number
 *           description: Shu oyga to'lagan summa
 *         status:
 *           type: string
 *           enum: [paid, partial, unpaid]
 *     Payment:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         student_id:
 *           type: integer
 *         group_id:
 *           type: integer
 *         month_name:
 *           type: string
 *           example: "2026-01"
 *         amount:
 *           type: number
 *         payment_method:
 *           type: string
 *           enum: [cash, card, transfer]
 *         note:
 *           type: string
 *         created_by:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/payments/students-list:
 *   get:
 *     summary: To'lov qilish uchun studentlar ro'yxati (ADMIN)
 *     description: Har bir student uchun oy bo'yicha to'lash kerak/to'langan summalarni ko'rsatadi
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month_name
 *         schema:
 *           type: string
 *         example: "2026-01"
 *         description: Oy (default - joriy oy)
 *       - in: query
 *         name: group_id
 *         schema:
 *           type: integer
 *         description: Guruh bo'yicha filter
 *     responses:
 *       200:
 *         description: Studentlar ro'yxati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 month:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 students:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       student_id:
 *                         type: integer
 *                       student_name:
 *                         type: string
 *                       phone:
 *                         type: string
 *                       group_name:
 *                         type: string
 *                       teacher_name:
 *                         type: string
 *                       default_price:
 *                         type: number
 *                       required_amount:
 *                         type: number
 *                       paid_amount:
 *                         type: number
 *                       status:
 *                         type: string
 *                       debt:
 *                         type: number
 */
router.get('/students-list', protect, roleCheck(['admin']), getStudentsForPayment);

/**
 * @swagger
 * /api/payments/set-requirement:
 *   post:
 *     summary: Studentning oylik to'lov summasini belgilash (ADMIN)
 *     description: Har bir student uchun har bir oyda qancha to'lashi kerakligini belgilash
 *     tags: [Payments]
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
 *               - month_name
 *               - required_amount
 *             properties:
 *               student_id:
 *                 type: integer
 *                 example: 5
 *               month_name:
 *                 type: string
 *                 example: "2026-01"
 *               required_amount:
 *                 type: number
 *                 example: 500000
 *     responses:
 *       200:
 *         description: To'lov summasi belgilandi
 */
router.post('/set-requirement', protect, roleCheck(['admin']), setMonthlyRequirement);

/**
 * @swagger
 * /api/payments/add:
 *   post:
 *     summary: Studentning to'lovini qo'shish (ADMIN)
 *     description: Student to'lov qilganda summasini yozib qo'yish. Avtomatik monthly_fees yangilanadi.
 *     tags: [Payments]
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
 *               - month_name
 *               - amount
 *             properties:
 *               student_id:
 *                 type: integer
 *                 example: 5
 *               month_name:
 *                 type: string
 *                 example: "2026-01"
 *               amount:
 *                 type: number
 *                 example: 500000
 *               payment_method:
 *                 type: string
 *                 enum: [cash, card, transfer]
 *                 default: cash
 *               note:
 *                 type: string
 *                 example: "Yanvar oyi to'lovi"
 *     responses:
 *       201:
 *         description: To'lov qo'shildi va monthly_fees yangilandi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *                 monthly_summary:
 *                   $ref: '#/components/schemas/MonthlyFee'
 *       400:
 *         description: Noto'g'ri ma'lumot
 *       404:
 *         description: Student topilmadi
 */
router.post('/add', protect, roleCheck(['admin']), addPayment);

/**
 * @swagger
 * /api/payments/student/{student_id}:
 *   get:
 *     summary: Studentning to'lov tarixi va oylik ma'lumotlari
 *     description: Barcha oylar bo'yicha to'lash kerak/to'lagan summalari va to'lovlar tarixi
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month_name
 *         schema:
 *           type: string
 *         example: "2026-01"
 *         description: Agar ko'rsatilsa - faqat shu oy
 *     responses:
 *       200:
 *         description: Student to'lovlari va oylik ma'lumotlari
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 student:
 *                   type: object
 *                 monthly_fees:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MonthlyFee'
 *                 payments:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Payment'
 *                 total_debt:
 *                   type: number
 */
router.get('/student/:student_id', protect, getStudentPayments);

/**
 * @swagger
 * /api/payments/month/{month_name}:
 *   get:
 *     summary: Oylik to'lovlar hisoboti (ADMIN)
 *     description: Barcha studentlar uchun oylik to'lash kerak/to'lagan summalar va statistika
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: month_name
 *         required: true
 *         schema:
 *           type: string
 *         example: "2026-01"
 *     responses:
 *       200:
 *         description: Oylik hisobot va statistika
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 month:
 *                   type: string
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     total_students:
 *                       type: integer
 *                     total_required:
 *                       type: number
 *                     total_paid:
 *                       type: number
 *                     paid_count:
 *                       type: integer
 *                     partial_count:
 *                       type: integer
 *                     unpaid_count:
 *                       type: integer
 *                 students:
 *                   type: array
 */
router.get('/month/:month_name', protect, roleCheck(['admin']), getMonthlyPayments);

/**
 * @swagger
 * /api/payments/group/{group_id}:
 *   get:
 *     summary: Guruh to'lovlari (FAQAT ADMIN)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: group_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month_name
 *         schema:
 *           type: string
 *         example: "2026-01"
 *     responses:
 *       200:
 *         description: Guruh to'lovlari
 */
router.get('/group/:group_id', protect, roleCheck(['admin']), getGroupPayments);

/**
 * @swagger
 * /api/payments/all:
 *   get:
 *     summary: Barcha to'lovlar (filter bilan) (FAQAT ADMIN)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month_name
 *         schema:
 *           type: string
 *       - in: query
 *         name: payment_method
 *         schema:
 *           type: string
 *           enum: [cash, card, transfer]
 *       - in: query
 *         name: student_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: group_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Barcha to'lovlar
 */
router.get('/all', protect, roleCheck(['admin']), getAllPayments);

/**
 * @swagger
 * /api/payments/{payment_id}:
 *   delete:
 *     summary: To'lovni o'chirish (FAQAT ADMIN)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: payment_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: To'lov o'chirildi
 *       404:
 *         description: To'lov topilmadi
 */
router.delete('/:payment_id', protect, roleCheck(['admin']), deletePayment);

/**
 * @swagger
 * /api/payments/report/financial:
 *   get:
 *     summary: Moliyaviy hisobot (Dashboard) (FAQAT ADMIN)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Moliyaviy hisobot
 */
router.get('/report/financial', protect, roleCheck(['admin']), getFinancialReport);

module.exports = router;
