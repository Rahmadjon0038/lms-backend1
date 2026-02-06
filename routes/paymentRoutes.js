const express = require('express');
const router = express.Router();
const {
  getMyPayments
} = require('../controllers/paymentController');

// Auth middleware
const { protect } = require('../middlewares/authMiddleware');

/**
 * ===================================================================
 * SNAPSHOT-BASED SISTEMA
 * ===================================================================
 * 
 * ESLATMA: To'lov va chegirma endi snapshot orqali amalga oshiriladi:
 * - POST /api/snapshots/make-payment
 * - POST /api/snapshots/discount  
 * - GET /api/snapshots?month=2026-02
 * 
 */

/**
 * @swagger
 * /api/payments/my:
 *   get:
 *     summary: Talabaning o'z to'lov ma'lumotlari (snapshot asosida)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *         description: YYYY-MM format
 *     responses:
 *       200:
 *         description: O'z to'lov ma'lumotlari
 */
router.get('/my', protect, getMyPayments);

module.exports = router;