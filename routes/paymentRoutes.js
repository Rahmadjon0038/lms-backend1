const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middlewares/authMiddleware');
const {
  getMonthlyPayments,
  makePayment, 
  getStudentPaymentHistory,
  giveDiscount,
  getPaymentFilters,
  clearStudentPayments,
  exportMonthlyPayments,
  getMyPayments,
  getMyPaymentHistory,
  getMyDiscounts
} = require('../controllers/paymentController');

/**
 * @swagger
 * components:
 *   schemas:
 *     StudentPayment:
 *       type: object
 *       properties:
 *         student_id:
 *           type: integer
 *           description: Talaba ID si
 *         name:
 *           type: string
 *           description: Talaba ismi
 *         surname:
 *           type: string
 *           description: Talaba familiyasi  
 *         phone:
 *           type: string
 *           description: Telefon raqami
 *         father_name:
 *           type: string
 *           description: Otasining ismi
 *         father_phone:
 *           type: string
 *           description: Otasining telefoni
 *         group_name:
 *           type: string
 *           description: Guruh nomi
 *         subject_name:
 *           type: string
 *           description: Fan nomi
 *         teacher_name:
 *           type: string
 *           description: O'qituvchi ism-familiyasi
 *         required_amount:
 *           type: number
 *           description: To'lashi kerak bo'lgan summa (chegirma hisobga olingan)
 *         paid_amount:
 *           type: number  
 *           description: To'lagan summasi
 *         payment_status:
 *           type: string
 *           enum: [paid, partial, unpaid]
 *           description: To'lov holati
 *         debt_amount:
 *           type: number
 *           description: Qarz summasi
 * 
 *     PaymentTransaction:
 *       type: object
 *       properties:
 *         student_id:
 *           type: integer
 *         amount:
 *           type: number
 *         month:
 *           type: string
 *           format: YYYY-MM
 *         payment_method:
 *           type: string
 *           enum: [cash, card, transfer]
 *         description:
 *           type: string
 * 
 *     StudentDiscount:
 *       type: object
 *       properties:
 *         student_id:
 *           type: integer
 *         discount_type:
 *           type: string
 *           enum: [percent, amount]
 *         discount_value:
 *           type: number
 *           description: Foiz (1-100) yoki aniq summa
 *         months:
 *           type: integer
 *           description: Necha oyga (null = cheksiz)
 *         description:
 *           type: string
 */

/**
 * @swagger
 * /api/payments/monthly:
 *   get:
 *     summary: Oylik to'lov ro'yxati
 *     description: Faqat aktiv talabalarning oylik to'lovi. Teacher faqat o'z talabalarini ko'ra oladi
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: "2026-01"
 *         description: Qaysi oy uchun (default = joriy oy)
 *       - in: query
 *         name: teacher_id
 *         schema:
 *           type: integer
 *         description: O'qituvchi bo'yicha filtr (faqat admin uchun)
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *         description: Fan bo'yicha filtr
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [paid, partial, unpaid]
 *         description: To'lov holati bo'yicha filtr
 *     responses:
 *       200:
 *         description: Muvaffaqiyatli
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
 *                   properties:
 *                     month:
 *                       type: string
 *                     students:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/StudentPayment'
 *                     stats:
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
 *                         total_expected:
 *                           type: number
 *                         total_collected:
 *                           type: number
 *                         total_debt:
 *                           type: number
 */
router.get('/monthly', protect, getMonthlyPayments);

/**
 * @swagger
 * /api/payments/pay:
 *   post:
 *     summary: To'lov qilish
 *     description: Talaba uchun to'lov qabul qilish. Bo'lib-bo'lib to'lash mumkin
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
 *               - amount
 *               - month
 *             properties:
 *               student_id:
 *                 type: integer
 *               amount:
 *                 type: number
 *                 minimum: 0.01
 *               month:
 *                 type: string
 *                 format: YYYY-MM
 *                 description: Qaysi oy uchun to'lov (masalan 2026-02). MAJBURIY!
 *               payment_method:
 *                 type: string
 *                 enum: [cash, card, transfer]
 *                 default: cash
 *               description:
 *                 type: string
 *                 description: To'lov haqida izoh
 *     responses:
 *       200:
 *         description: To'lov muvaffaqiyatli qabul qilindi
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
 *                   properties:
 *                     student_name:
 *                       type: string
 *                     group_name:
 *                       type: string
 *                     month:
 *                       type: string
 *                     paid_amount:
 *                       type: number
 *                     required_amount:
 *                       type: number
 *                     remaining:
 *                       type: number
 *                     status:
 *                       type: string
 *                     processed_by:
 *                       type: string
 */
router.post('/pay', protectAdmin, makePayment);

/**
 * @swagger
 * /api/payments/student/{student_id}/history:
 *   get:
 *     summary: Talaba to'lov tarixi
 *     description: Talaba o'z tarixini ko'rishi uchun yoki admin boshqa talaba tarixini ko'rishi uchun
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Talaba ID si
 *     responses:
 *       200:
 *         description: To'lov tarixi
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
 *                     student:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         surname:
 *                           type: string
 *                         group_name:
 *                           type: string
 *                     payments:
 *                       type: array
 *                       description: Oylik to'lovlar
 *                     transactions:
 *                       type: array
 *                       description: Barcha tranzaksiyalar
 */
router.get('/student/:student_id/history', protect, getStudentPaymentHistory);

/**
 * @swagger
 * /api/payments/discount:
 *   post:
 *     summary: Talabaga chegirma berish
 *     description: Talaba uchun foizli yoki summali chegirma yaratish (ma'lum bir oy uchun)
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
 *               - discount_type
 *               - discount_value
 *               - month
 *             properties:
 *               student_id:
 *                 type: integer
 *               discount_type:
 *                 type: string
 *                 enum: [percent, amount]
 *               discount_value:
 *                 type: number
 *                 description: Foiz (1-100) yoki aniq summa
 *               month:
 *                 type: string
 *                 format: YYYY-MM
 *                 description: Qaysi oy uchun chegirma (masalan 2026-02). MAJBURIY!
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chegirma muvaffaqiyatli berildi
 */
router.post('/discount', protectAdmin, giveDiscount);

/**
 * @swagger
 * /api/payments/filters:
 *   get:
 *     summary: Filter uchun ma'lumotlar
 *     description: Teacher va subject ro'yxati, to'lov statuslari
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Filter ma'lumotlari
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
 *                     teachers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                     subjects:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                     statuses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           value:
 *                             type: string
 *                           label:
 *                             type: string
 */
router.get('/filters', protect, getPaymentFilters);

/**
 * @swagger
 * /api/payments/clear-student:
 *   post:
 *     summary: Student to'lov ma'lumotlarini tozalash
 *     description: Admin uchun - student'ning barcha to'lov, tranzaksiya va chegirma ma'lumotlarini o'chirish
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
 *               - confirm
 *             properties:
 *               student_id:
 *                 type: integer
 *                 example: 34
 *                 description: Tozalanishi kerak bo'lgan student ID'si
 *               confirm:
 *                 type: boolean
 *                 example: true
 *                 description: Tasdiqlash parametri (true bo'lishi shart)
 *     responses:
 *       200:
 *         description: Student ma'lumotlari muvaffaqiyatli tozalandi
 *       403:
 *         description: Faqat adminlar uchun
 *       404:
 *         description: Student topilmadi
 *       400:
 *         description: Parametrlar xato
 */
router.post('/clear-student', protectAdmin, clearStudentPayments);

/**
 * @swagger
 * /api/payments/monthly/export:
 *   get:
 *     summary: Oylik to'lov hisobotini Excel formatida yuklab olish
 *     description: Talabalarning oylik to'lov hisobotini Excel fayl sifatida export qilish
 *     tags:
 *       - To'lovlar
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *         description: Oy (YYYY-MM formatda). Agar berilmasa, joriy oy ishlatiladi
 *         example: "2026-01"
 *       - in: query
 *         name: teacher_id
 *         schema:
 *           type: integer
 *         description: O'qituvchi ID (faqat admin uchun)
 *         example: 123
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *         description: Fan ID
 *         example: 5
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [paid, partial, unpaid]
 *         description: To'lov holati bo'yicha filter
 *         example: "unpaid"
 *     responses:
 *       200:
 *         description: Excel fayl muvaffaqiyatli yuklanadi
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Huquq yo'q
 *       404:
 *         description: Ma'lumotlar topilmadi
 */
router.get('/monthly/export', protect, exportMonthlyPayments);

// ============================================================================
// TALABA UCHUN ENDPOINT LAR
// ============================================================================

/**
 * @swagger
 * /api/payments/my:
 *   get:
 *     summary: Talabaning o'z oylik to'lov ma'lumotlarini olish
 *     tags: [Student Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *         description: Oy (YYYY-MM formatda, ixtiyoriy)
 *         example: '2026-01'
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
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     month:
 *                       type: string
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           group_id:
 *                             type: integer
 *                           group_name:
 *                             type: string
 *                           subject_name:
 *                             type: string
 *                           teacher_name:
 *                             type: string
 *                           original_price:
 *                             type: string
 *                           discount_amount:
 *                             type: string
 *                           paid_amount:
 *                             type: string
 *                           payment_status:
 *                             type: string
 *                             enum: [paid, partial, unpaid]
 *                           remaining_amount:
 *                             type: string
 *                           discount_description:
 *                             type: string
 *                           last_payment_date:
 *                             type: string
 *                             format: date-time
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total_groups:
 *                           type: integer
 *                         total_original_amount:
 *                           type: number
 *                         total_discount_amount:
 *                           type: number
 *                         total_required_amount:
 *                           type: number
 *                         total_paid_amount:
 *                           type: number
 *                         total_remaining_amount:
 *                           type: number
 *                         overall_status:
 *                           type: string
 *                           enum: [paid, partial, unpaid]
 *       403:
 *         description: Faqat talabalar uchun
 *       400:
 *         description: Noto'g'ri parametr
 */
router.get('/my', protect, getMyPayments);

/**
 * @swagger
 * /api/payments/my/history:
 *   get:
 *     summary: To'lov tarixi olish (Talaba, Admin, Super Admin)
 *     description: |
 *       Talaba o'z to'lov tarixini ko'radi.
 *       Admin va Super Admin student_id parametri orqali istalgan talabaning tarixini ko'ra oladi.
 *     tags: [Student Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: group_id
 *         schema:
 *           type: integer
 *         description: Aniq guruh uchun filter (ixtiyoriy)
 *       - in: query
 *         name: student_id
 *         schema:
 *           type: integer
 *         description: Talaba IDsi (faqat admin va super admin uchun)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nechta yozuv qaytarish (ixtiyoriy)
 *     responses:
 *       200:
 *         description: To'lov tarixi muvaffaqiyatli olindi
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
 *                   properties:
 *                     payments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           month:
 *                             type: string
 *                           amount:
 *                             type: string
 *                           payment_method:
 *                             type: string
 *                           description:
 *                             type: string
 *                           payment_date:
 *                             type: string
 *                             format: date-time
 *                           group_name:
 *                             type: string
 *                           subject_name:
 *                             type: string
 *                           received_by:
 *                             type: string
 *                     total_count:
 *                       type: integer
 *       403:
 *         description: Faqat talabalar uchun
 */
router.get('/my/history', protect, getMyPaymentHistory);

/**
 * @swagger
 * /api/payments/my/discounts:
 *   get:
 *     summary: Talabaning o'z chegirma ma'lumotlarini olish
 *     tags: [Student Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chegirma ma'lumotlari muvaffaqiyatli olindi
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
 *                   properties:
 *                     discounts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           start_month:
 *                             type: string
 *                           end_month:
 *                             type: string
 *                           discount_type:
 *                             type: string
 *                             enum: [percent, amount]
 *                           discount_value:
 *                             type: string
 *                           description:
 *                             type: string
 *                           is_active:
 *                             type: boolean
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           group_name:
 *                             type: string
 *                           subject_name:
 *                             type: string
 *                           discount_display:
 *                             type: string
 *                     total_count:
 *                       type: integer
 *       403:
 *         description: Faqat talabalar uchun
 */
router.get('/my/discounts', protect, getMyDiscounts);

module.exports = router;