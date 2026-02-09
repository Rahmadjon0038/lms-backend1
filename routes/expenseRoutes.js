const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const expenseController = require('../controllers/expenseController');

const router = express.Router();

router.use(protect);
router.use(roleCheck(['admin', 'super_admin']));

/**
 * @swagger
 * tags:
 *   - name: Expenses
 *     description: O'quv markazi rasxodlari (sodda)
 */

/**
 * @swagger
 * /api/expenses:
 *   post:
 *     summary: Rasxod qo'shish (reason + amount)
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 *   get:
 *     summary: Tanlangan oy rasxodlari ro'yxati
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.post('/', expenseController.createExpense);
router.get('/', expenseController.getExpenses);

/**
 * @swagger
 * /api/expenses/summary:
 *   get:
 *     summary: Bugungi va tanlangan oy rasxod summalari
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/summary', expenseController.getExpenseSummary);

/**
 * @swagger
 * /api/expenses/{id}:
 *   put:
 *     summary: Rasxodni yangilash
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   delete:
 *     summary: Rasxodni o'chirish
 *     tags: [Expenses]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.put('/:id', expenseController.updateExpense);
router.delete('/:id', expenseController.deleteExpense);

module.exports = router;
