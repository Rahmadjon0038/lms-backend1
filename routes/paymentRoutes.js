const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middlewares/authMiddleware');
const {
  getMonthlyPayments,
  makePayment, 
  getStudentPaymentHistory,
  clearStudentPaymentsByMonth,
  createMonthlyGroupSnapshot,
  giveDiscount,
  getPaymentFilters,
  exportMonthlyPayments,
  getMyPayments,
  getMyPaymentHistory,
  getMyDiscounts
} = require('../controllers/paymentController');

/**
 * @swagger
 * components:
 *   schemas:
 *     PaymentInfo:
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
 *         group_name:
 *           type: string
 *         subject_name:
 *           type: string
 *         teacher_name:
 *           type: string
 *         required_amount:
 *           type: number
 *         paid_amount:
 *           type: number
 *         payment_status:
 *           type: string
 *           enum: [paid, partial, unpaid]
 *         debt_amount:
 *           type: number
 *         last_payment_date:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/payments/monthly:
 *   get:
 *     summary: Oylik to'lovlar ro'yxati
 *     description: Barcha talabalarning oylik to'lov holatlarini ko'rsatadi
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           format: YYYY-MM
 *         description: Qaysi oy uchun ma'lumot kerak (default joriy oy)
 *     responses:
 *       200:
 *         description: To'lov ma'lumotlari muvaffaqiyatli olindi
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
 *                     month:
 *                       type: string
 *                     students:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PaymentInfo'
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_students:
 *                           type: integer
 *                         paid:
 *                           type: integer
 *                         partial:
 *                           type: integer
 *                         unpaid:
 *                           type: integer
 *                         total_required:
 *                           type: number
 *                         total_paid:
 *                           type: number
 */
router.get('/monthly', protect, getMonthlyPayments);

/**
 * @swagger
 * /api/payments/pay:
 *   post:
 *     summary: To'lov qilish
 *     description: Talaba uchun to'lov amalga oshirish (faqat admin)
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
 *               - group_id
 *               - amount
 *             properties:
 *               student_id:
 *                 type: integer
 *                 description: Talaba ID
 *               group_id:
 *                 type: integer
 *                 description: Guruh ID
 *               amount:
 *                 type: number
 *                 description: To'lov summasi
 *               payment_method:
 *                 type: string
 *                 enum: [cash, card, transfer]
 *                 default: cash
 *                 description: To'lov usuli
 *               description:
 *                 type: string
 *                 description: Qo'shimcha izoh
 *     responses:
 *       200:
 *         description: To'lov muvaffaqiyatli amalga oshirildi
 */
router.post('/pay', protectAdmin, makePayment);

/**
 * @swagger
 * /api/payments/student/{student_id}/history:
 *   get:
 *     summary: Talabaning to'lov tarixi
 *     description: Bitta talabaning barcha to'lovlarini ko'rsatadi
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Talaba ID
 *     responses:
 *       200:
 *         description: To'lov tarixi muvaffaqiyatli olindi
 */
router.get('/student/:student_id/history', protect, getStudentPaymentHistory);

/**
 * @swagger
 * /api/payments/clear-student-month:
 *   post:
 *     summary: Talabaning oylik to'lovlarini to'liq tozalash
 *     description: |
 *       Muayyan talabaning muayyan oy va guruh uchun BARCHA to'lov ma'lumotlarini butunlay tozalaydi:
 *       - To'lov summasi (student_payments)
 *       - To'lov tranzaksiyalari (payment_transactions) 
 *       - Chegirmalar (student_discounts)
 *       
 *       ⚠️ Bu amal qaytarib bo'lmaydi! (faqat admin)
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
 *               - group_id
 *               - month
 *             properties:
 *               student_id:
 *                 type: integer
 *                 description: Talaba ID
 *                 example: 50
 *               group_id:
 *                 type: integer
 *                 description: Guruh ID
 *                 example: 87
 *               month:
 *                 type: string
 *                 format: YYYY-MM
 *                 description: Qaysi oy uchun tozalash (masalan 2026-02). MAJBURIY!
 *                 example: "2026-02"
 *     responses:
 *       200:
 *         description: Barcha ma'lumotlar muvaffaqiyatli tozalandi
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
 *                   example: "Bekzod Karimovning 2026-02 oy uchun barcha to'lov ma'lumotlari tozalandi"
 *                 data:
 *                   type: object
 *                   properties:
 *                     student_info:
 *                       type: object
 *                       properties:
 *                         student_id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         surname:
 *                           type: string
 *                         group_name:
 *                           type: string
 *                         group_id:
 *                           type: integer
 *                     deleted_counts:
 *                       type: object
 *                       properties:
 *                         transactions:
 *                           type: integer
 *                           description: O'chirilgan tranzaksiyalar soni
 *                         payments:
 *                           type: integer
 *                           description: O'chirilgan to'lov qaydlari soni
 *                         discounts:
 *                           type: integer
 *                           description: O'chirilgan chegirmalar soni
 *                     total_deleted:
 *                       type: integer
 *                       description: Jami o'chirilgan yozuvlar soni
 *       400:
 *         description: Noto'g'ri parametrlar
 *       403:
 *         description: Ruxsat yo'q (faqat admin)
 *       404:
 *         description: Talaba yoki guruh topilmadi
 */
router.post('/clear-student-month', protectAdmin, clearStudentPaymentsByMonth);

// Chegirma berish
router.post('/discount', protectAdmin, giveDiscount);

// Filter ma'lumotlari
router.get('/filters', protect, getPaymentFilters);

// Export qilish
router.get('/export', protect, exportMonthlyPayments);

// Talabaning o'z to'lovlari
router.get('/my-payments', protect, getMyPayments);

// Talabaning o'z tarixini ko'rish
router.get('/my-history', protect, getMyPaymentHistory);

// Talabaning o'z tarixini ko'rish (parametrlar bilan)
router.get('/my/history', protect, getMyPaymentHistory);

// Talabaning chegirmalarini ko'rish
router.get('/my-discounts', protect, getMyDiscounts);

/**
 * @swagger
 * /api/payments/create-monthly-snapshot:
 *   post:
 *     summary: Oylik guruh snapshot yaratish
 *     description: Har oy boshlanganda barcha guruhlar uchun historical snapshot yaratish (faqat admin)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               month:
 *                 type: string
 *                 format: YYYY-MM
 *                 description: Qaysi oy uchun snapshot (masalan 2026-02). Agar berilmasa hozirgi oy
 *     responses:
 *       200:
 *         description: Snapshot muvaffaqiyatli yaratildi
 */
router.post('/create-monthly-snapshot', protectAdmin, createMonthlyGroupSnapshot);

module.exports = router;