const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middlewares/authMiddleware');
const { protectSuperAdmin } = require('../middlewares/roleMiddleware');
const { 
  getDashboardStats, 
  getDebtorStudents,
  getSuperAdminStats 
} = require('../controllers/dashboardController');

// ============================================================================
// ADMIN DASHBOARD ROUTES
// ============================================================================

/**
 * @swagger
 * components:
 *   schemas:
 *     DashboardStats:
 *       type: object
 *       properties:
 *         summary:
 *           type: object
 *           properties:
 *             today_payments:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 15
 *                 amount:
 *                   type: number
 *                   example: 4500000
 *             monthly_payments:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                   example: 245
 *                 amount:
 *                   type: number
 *                   example: 73500000
 *             active_students:
 *               type: integer
 *               example: 320
 *             today_new_students:
 *               type: integer
 *               example: 3
 *             debtor_students:
 *               type: integer
 *               example: 45
 *             today_attendance:
 *               type: object
 *               properties:
 *                 total_lessons:
 *                   type: integer
 *                   example: 12
 *                 present:
 *                   type: integer
 *                   example: 85
 *                 absent:
 *                   type: integer
 *                   example: 5
 *                 late:
 *                   type: integer
 *                   example: 2
 *         details:
 *           type: object
 *           properties:
 *             top_paying_groups:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   group_name:
 *                     type: string
 *                   subject_name:
 *                     type: string
 *                   payment_count:
 *                     type: integer
 *                   total_amount:
 *                     type: number
 */

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Admin dashboard uchun umumiy statistikalar
 *     description: Qabulxonada ishlaydigan admin uchun kerakli barcha statistikalar
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistikalari muvaffaqiyatli olindi
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
 *                   $ref: '#/components/schemas/DashboardStats'
 *       401:
 *         description: Avtorizatsiya talab qilinadi
 *       403:
 *         description: Faqat adminlar kirish huquqiga ega
 *       500:
 *         description: Server xatoligi
 */
router.get('/stats', protect, protectAdmin, getDashboardStats);

/**
 * @swagger
 * /api/dashboard/debtors:
 *   get:
 *     summary: Qarzdor talabalar ro'yxati
 *     description: Joriy oyda to'lovini to'lamagan yoki kam to'lagan talabalar ro'yxati
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Qaytariladigan natijalar soni
 *     responses:
 *       200:
 *         description: Qarzdor talabalar ro'yxati muvaffaqiyatli olindi
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
 *                       example: "2026-01"
 *                     total_debtors:
 *                       type: integer
 *                       example: 45
 *                     students:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           student_name:
 *                             type: string
 *                           phone:
 *                             type: string
 *                           group_name:
 *                             type: string
 *                           subject_name:
 *                             type: string
 *                           original_price:
 *                             type: number
 *                           discount_amount:
 *                             type: number
 *                           required_amount:
 *                             type: number
 *                           paid_amount:
 *                             type: number
 *                           debt_amount:
 *                             type: number
 *                           last_payment_date:
 *                             type: string
 *       401:
 *         description: Avtorizatsiya talab qilinadi
 *       403:
 *         description: Faqat adminlar kirish huquqiga ega
 *       500:
 *         description: Server xatoligi
 */
router.get('/debtors', protect, protectAdmin, getDebtorStudents);

/**
 * @swagger
 * /api/dashboard/super-admin:
 *   get:
 *     summary: Super Admin dashboard - to'liq statistikalar
 *     description: Faqat super admin uchun - moliyaviy hisobotlar, daromad, rasxod, sof foyda
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Super Admin dashboard muvaffaqiyatli olindi
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
 *                     financial_summary:
 *                       type: object
 *                       properties:
 *                         monthly_revenue:
 *                           type: number
 *                         total_expenses:
 *                           type: number
 *                         teacher_salaries:
 *                           type: number
 *                         other_expenses:
 *                           type: number
 *                         net_profit:
 *                           type: number
 *                         profit_margin:
 *                           type: string
 *                     operational_summary:
 *                       type: object
 *                     detailed_analytics:
 *                       type: object
 *       401:
 *         description: Avtorizatsiya talab qilinadi
 *       403:
 *         description: Faqat super adminlar kirish huquqiga ega
 *       500:
 *         description: Server xatoligi
 */
router.get('/super-admin', protect, protectSuperAdmin, getSuperAdminStats);

module.exports = router;