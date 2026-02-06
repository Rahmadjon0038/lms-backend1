const express = require('express');
const router = express.Router();
const snapshotController = require('../controllers/snapshotController');
const { protect } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     MonthlySnapshot:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Snapshot ID
 *         month:
 *           type: string
 *           description: Month in YYYY-MM format
 *         student_id:
 *           type: integer
 *           description: Student ID
 *         group_id:
 *           type: integer
 *           description: Group ID
 *         student_name:
 *           type: string
 *           description: Student name
 *         student_surname:
 *           type: string
 *           description: Student surname
 *         group_name:
 *           type: string
 *           description: Group name
 *         monthly_status:
 *           type: string
 *           enum: [active, stopped, finished]
 *           description: Monthly status
 *         payment_status:
 *           type: string
 *           enum: [paid, partial, unpaid, inactive]
 *           description: Payment status
 *         required_amount:
 *           type: number
 *           description: Required payment amount
 *         paid_amount:
 *           type: number
 *           description: Paid amount
 *         debt_amount:
 *           type: number
 *           description: Debt amount
 *         attendance_percentage:
 *           type: number
 *           description: Attendance percentage
 */

/**
 * @swagger
 * /api/snapshots/create:
 *   post:
 *     summary: Create monthly snapshot for specific month
 *     tags: [Monthly Snapshots]
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
 *                 description: Month in YYYY-MM format
 *                 example: "2024-01"
 *     responses:
 *       200:
 *         description: Snapshot created successfully
 *       400:
 *         description: Invalid month format or snapshot already exists
 *       403:
 *         description: Only admin can create snapshots
 */
router.post('/create', protect, snapshotController.createMonthlySnapshot);

/**
 * @swagger
 * /api/snapshots/create-for-new:
 *   post:
 *     summary: Create snapshots for new students added after initial snapshot
 *     tags: [Monthly Snapshots]
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
 *                 description: Month in YYYY-MM format
 *                 example: "2025-01"
 *             required:
 *               - month
 *     responses:
 *       200:
 *         description: Snapshots created successfully for new students
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 count:
 *                   type: integer
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post('/create-for-new', protect, snapshotController.createSnapshotForNewStudents);

/**
 * @swagger
 * /api/snapshots/new-students-notification:
 *   get:
 *     summary: Get notification about new students added after snapshot creation
 *     tags: [Monthly Snapshots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^\d{4}-\d{2}$
 *         example: "2026-01"
 *         description: Month in YYYY-MM format
 *     responses:
 *       200:
 *         description: New students notification
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
 *                     count:
 *                       type: number
 *                     new_students:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           student_name:
 *                             type: string
 *                           group_name:
 *                             type: string
 *                           joined_at:
 *                             type: string
 *                           has_started:
 *                             type: boolean
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.get('/new-students-notification', protect, snapshotController.getNewStudentsNotification);

/**
 * @swagger
 * /api/snapshots/export:
 *   get:
 *     summary: Export student payment information to Excel
 *     tags: [Monthly Snapshots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *           pattern: ^\d{4}-\d{2}$
 *         example: "2026-01"
 *         description: Month in YYYY-MM format
 *       - in: query
 *         name: group_id
 *         schema:
 *           type: integer
 *         description: Filter by group ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, stopped, finished]
 *         description: Filter by monthly status
 *       - in: query
 *         name: payment_status
 *         schema:
 *           type: string
 *           enum: [paid, partial, unpaid, inactive]
 *         description: Filter by payment status
 *       - in: query
 *         name: teacher_id
 *         schema:
 *           type: integer
 *         description: Filter by teacher ID
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *         description: Filter by subject ID
 *     responses:
 *       200:
 *         description: Excel file download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No data found for export
 */
router.get('/export', protect, snapshotController.exportSnapshotsToExcel);

/**
 * @swagger
 * /api/snapshots:
 *   get:
 *     summary: Get monthly snapshots with filters
 *     tags: [Monthly Snapshots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *         description: Month in YYYY-MM format
 *       - in: query
 *         name: group_id
 *         schema:
 *           type: integer
 *         description: Filter by group ID
 *       - in: query
 *         name: teacher_id
 *         schema:
 *           type: integer
 *         description: Filter by teacher ID (shows all groups of this teacher)
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *         description: Filter by subject ID (shows all groups of this subject)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, stopped, finished]
 *         description: Filter by monthly status
 *       - in: query
 *         name: payment_status
 *         schema:
 *           type: string
 *           enum: [paid, partial, unpaid, inactive]
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: List of snapshots
 *       400:
 *         description: Invalid month format
 */
router.get('/', protect, snapshotController.getMonthlySnapshots);

/**
 * @swagger
 * /api/snapshots/available:
 *   get:
 *     summary: Get list of available snapshot months
 *     tags: [Monthly Snapshots]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available snapshot months with statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       month:
 *                         type: string
 *                       student_count:
 *                         type: integer
 *                       active_count:
 *                         type: integer
 *                       paid_count:
 *                         type: integer
 *                       total_required:
 *                         type: number
 *                       total_paid:
 *                         type: number
 *                       created_at:
 *                         type: string
 *                       updated_at:
 *                         type: string
 */
router.get('/available', protect, snapshotController.getAvailableSnapshots);

/**
 * @swagger
 * /api/snapshots/summary:
 *   get:
 *     tags: [Monthly Snapshots]
 *     summary: Get monthly snapshot summary with debt and discount info
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *         description: Month in YYYY-MM format
 *     responses:
 *       200:
 *         description: Monthly summary statistics
 */
router.get('/summary', protect, snapshotController.getMonthlySnapshotSummary);

/**
 * @swagger
 * /api/snapshots/make-payment:
 *   post:
 *     tags: [Monthly Snapshots]
 *     summary: Make payment through snapshot system
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
 *               - amount
 *             properties:
 *               student_id:
 *                 type: integer
 *                 description: Student ID
 *                 example: 3
 *               group_id:
 *                 type: integer
 *                 description: Group ID
 *                 example: 1
 *               month:
 *                 type: string
 *                 description: Month in YYYY-MM format
 *                 example: "2026-02"
 *               amount:
 *                 type: number
 *                 description: Payment amount
 *                 example: 300000
 *               payment_method:
 *                 type: string
 *                 description: Payment method
 *                 example: "cash"
 *                 default: "cash"
 *               description:
 *                 type: string
 *                 description: Payment description
 *                 example: "Fevral oyi uchun to'lov"
 *     responses:
 *       200:
 *         description: Payment successful
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Snapshot not found
 */
router.post('/make-payment', protect, snapshotController.makeSnapshotPayment);

/**
 * @swagger
 * /api/snapshots/discount:
 *   post:
 *     tags: [Monthly Snapshots]
 *     summary: Give discount through snapshot system
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
 *               - discount_type
 *               - discount_value
 *             properties:
 *               student_id:
 *                 type: integer
 *                 description: Student ID
 *                 example: 3
 *               group_id:
 *                 type: integer
 *                 description: Group ID
 *                 example: 1
 *               month:
 *                 type: string
 *                 description: Month in YYYY-MM format
 *                 example: "2026-02"
 *               discount_type:
 *                 type: string
 *                 enum: [percent, amount]
 *                 description: Discount type
 *                 example: "percent"
 *               discount_value:
 *                 type: number
 *                 description: Discount value (percent or amount)
 *                 example: 20
 *               description:
 *                 type: string
 *                 description: Discount reason
 *                 example: "Yaxshi talaba uchun chegirma"
 *     responses:
 *       200:
 *         description: Discount applied successfully
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Snapshot not found
 */
router.post('/discount', protect, snapshotController.giveSnapshotDiscount);

/**
 * @swagger
 * /api/snapshots/reset-payment:
 *   post:
 *     tags: [Monthly Snapshots]
 *     summary: Reset all payment data for a student in specific month
 *     description: Clears all payment transactions, discounts, and resets snapshot data. Admin only.
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
 *                 description: Student ID
 *                 example: 1
 *               group_id:
 *                 type: integer
 *                 description: Group ID
 *                 example: 1
 *               month:
 *                 type: string
 *                 format: YYYY-MM
 *                 description: Month in YYYY-MM format
 *                 example: "2024-12"
 *     responses:
 *       200:
 *         description: Payment data reset successfully
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
 *                   example: "To'lov ma'lumotlari muvaffaqiyatli tozalandi"
 *                 data:
 *                   type: object
 *                   properties:
 *                     student:
 *                       type: string
 *                       example: "John Doe"
 *                     group:
 *                       type: string
 *                       example: "Math Group A"
 *                     month:
 *                       type: string
 *                       example: "2024-12"
 *                     reset_summary:
 *                       type: object
 *                       properties:
 *                         discounts_deactivated:
 *                           type: integer
 *                         transactions_deleted:
 *                           type: integer
 *                         snapshot_reset:
 *                           type: boolean
 *                         new_status:
 *                           type: string
 *                           example: "unpaid"
 *                         debt_amount:
 *                           type: number
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Snapshot not found
 */
router.post('/reset-payment', protect, snapshotController.resetStudentPayment);

/**
 * @swagger
 * /api/snapshots/transactions:
 *   get:
 *     tags: [Monthly Snapshots]
 *     summary: Get transaction history through snapshot system
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: student_id
 *         schema:
 *           type: integer
 *         description: Filter by student ID
 *       - in: query
 *         name: group_id
 *         schema:
 *           type: integer
 *         description: Filter by group ID
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *         description: Filter by month (YYYY-MM format)
 *     responses:
 *       200:
 *         description: Transaction history
 */
router.get('/transactions', protect, snapshotController.getSnapshotTransactions);

/**
 * @swagger
 * /api/snapshots/attendance:
 *   get:
 *     tags: [Monthly Snapshots]
 *     summary: Get student attendance for specific month and group
 *     description: Retrieve detailed attendance information for a student in a specific group and month
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: student_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Student ID
 *         example: 1
 *       - in: query
 *         name: group_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Group ID
 *         example: 1
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *           format: YYYY-MM
 *         description: Month in YYYY-MM format
 *         example: "2024-12"
 *     responses:
 *       200:
 *         description: Student attendance data retrieved successfully
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
 *                   example: "Davomat ma'lumotlari muvaffaqiyatli olindi"
 *                 data:
 *                   type: object
 *                   properties:
 *                     student_info:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         surname:
 *                           type: string
 *                         phone:
 *                           type: string
 *                     group_info:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         subject:
 *                           type: string
 *                         teacher:
 *                           type: string
 *                     month:
 *                       type: string
 *                       example: "2024-12"
 *                     monthly_status:
 *                       type: string
 *                       enum: [active, stopped, finished]
 *                     attendance_statistics:
 *                       type: object
 *                       properties:
 *                         total_lessons:
 *                           type: integer
 *                         attended_lessons:
 *                           type: integer
 *                         missed_lessons:
 *                           type: integer
 *                         attendance_percentage:
 *                           type: number
 *                         status:
 *                           type: string
 *                     attendance_breakdown:
 *                       type: object
 *                       properties:
 *                         present:
 *                           type: integer
 *                         absent:
 *                           type: integer
 *                         late:
 *                           type: integer
 *                         excused:
 *                           type: integer
 *                     daily_attendance:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           lesson_date:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [present, absent, late, excused]
 *                           formatted_date:
 *                             type: string
 *                           lesson_time:
 *                             type: string
 *                           marked_at:
 *                             type: string
 *       400:
 *         description: Invalid parameters
 *       403:
 *         description: Access denied (teachers can only view their own groups)
 *       404:
 *         description: Attendance data not found for specified month
 */
router.get('/attendance', protect, snapshotController.getStudentAttendance);

/**
 * @swagger
 * /api/snapshots/{id}:
 *   put:
 *     summary: Update monthly snapshot
 *     tags: [Monthly Snapshots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Snapshot ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               monthly_status:
 *                 type: string
 *                 enum: [active, stopped, finished]
 *                 description: New monthly status
 *               required_amount:
 *                 type: number
 *                 description: New required amount
 *               paid_amount:
 *                 type: number
 *                 description: New paid amount
 *               attendance_percentage:
 *                 type: number
 *                 description: New attendance percentage
 *     responses:
 *       200:
 *         description: Snapshot updated successfully
 *       403:
 *         description: Only admin can update snapshots
 *       404:
 *         description: Snapshot not found
 */
router.put('/:id', protect, snapshotController.updateMonthlySnapshot);

/**
 * @swagger
 * /api/snapshots/{month}:
 *   delete:
 *     summary: Delete all snapshots and related data for specific month
 *     description: Completely removes all data for specified month including snapshots, payment transactions, and discounts. This is a destructive operation. Admin only.
 *     tags: [Monthly Snapshots]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *           format: YYYY-MM
 *         description: Month in YYYY-MM format
 *         example: "2024-12"
 *     responses:
 *       200:
 *         description: All data for the month deleted successfully
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
 *                   example: "2024-12 oy uchun barcha ma'lumotlar tozalandi"
 *                 deleted_summary:
 *                   type: object
 *                   properties:
 *                     transactions_deleted:
 *                       type: integer
 *                       description: Number of payment transactions deleted
 *                     discounts_deleted:
 *                       type: integer
 *                       description: Number of discounts deleted
 *                     multi_month_discounts_deactivated:
 *                       type: integer
 *                       description: Number of multi-month discounts deactivated
 *                     snapshots_deleted:
 *                       type: integer
 *                       description: Number of snapshots deleted
 *                     total_deleted:
 *                       type: integer
 *                       description: Total number of records deleted
 *       400:
 *         description: Invalid month format
 *       403:
 *         description: Only admin can delete snapshots
 */
router.delete('/:month', protect, snapshotController.deleteMonthlySnapshot);

module.exports = router;