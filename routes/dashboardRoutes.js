const express = require('express');
const router = express.Router();
const { protect, protectAdmin } = require('../middlewares/authMiddleware');
const { protectSuperAdmin } = require('../middlewares/roleMiddleware');
const {
  getAdminDailyStats,
  getAdminMonthlyStats,
  getAdminOverviewStats,
  getDebtorStudents,
  getAdmissionsStatistics,
  markAdmissionFollowup,
  getRemovedStudents,
  getSuperAdminStats,
  getSystemStartMonth,
} = require('../controllers/dashboardController');

/**
 * @swagger
 * /api/dashboard/stats/daily:
 *   get:
 *     summary: Admin kunlik statistika (chart uchun)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *         description: Boshlanish sanasi (YYYY-MM-DD). Default so'nggi 7 kun
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *         description: Tugash sanasi (YYYY-MM-DD). Default bugun
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/stats/daily', protect, protectAdmin, getAdminDailyStats);

/**
 * @swagger
 * /api/dashboard/stats/monthly:
 *   get:
 *     summary: Admin oylik statistika (chart uchun)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from_month
 *         schema:
 *           type: string
 *           example: "2026-01"
 *         description: Boshlanish oyi (YYYY-MM). Default joriy yil boshi
 *       - in: query
 *         name: to_month
 *         schema:
 *           type: string
 *           example: "2026-02"
 *         description: Tugash oyi (YYYY-MM). Default joriy oy
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/stats/monthly', protect, protectAdmin, getAdminMonthlyStats);

/**
 * @swagger
 * /api/dashboard/stats/overview:
 *   get:
 *     summary: Admin umumiy overview statistikasi (kunlik+oylik+umumiy+chart)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/stats/overview', protect, protectAdmin, getAdminOverviewStats);

/**
 * @swagger
 * /api/dashboard/debtors:
 *   get:
 *     summary: Qarzdor talabalar ro'yxati
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/debtors', protect, protectAdmin, getDebtorStudents);

/**
 * @swagger
 * /api/dashboard/admissions-statistics:
 *   get:
 *     summary: Oylik qabul statistikasi
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: "2026-08"
 *         description: Oy (YYYY-MM). Default joriy oy
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/admissions-statistics', protect, protectAdmin, getAdmissionsStatistics);
router.post('/admissions-statistics/followup', protect, protectAdmin, markAdmissionFollowup);

/**
 * @swagger
 * /api/dashboard/removed-students:
 *   get:
 *     summary: Joriy oyda guruhdan chiqarilgan talabalar ro'yxati
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: "2026-08"
 *         description: Oy (YYYY-MM). Default joriy oy
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/removed-students', protect, protectAdmin, getRemovedStudents);

/**
 * @swagger
 * /api/dashboard/super-admin:
 *   get:
 *     summary: Super Admin statistikasi
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *           example: "2026-02"
 *         description: KPI uchun asosiy oy (YYYY-MM). Default joriy oy
 *       - in: query
 *         name: from_month
 *         schema:
 *           type: string
 *           example: "2025-03"
 *         description: Trend boshlanish oyi (YYYY-MM). Default month dan 11 oy oldin
 *       - in: query
 *         name: to_month
 *         schema:
 *           type: string
 *           example: "2026-02"
 *         description: Trend tugash oyi (YYYY-MM). Default month
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/super-admin', protect, protectSuperAdmin, getSuperAdminStats);

// Tizim ish boshlagan oy — oy filtrlarining boshlanish nuqtasi
router.get('/system-start', protect, getSystemStartMonth);

module.exports = router;
