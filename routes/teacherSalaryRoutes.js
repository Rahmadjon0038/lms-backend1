const express = require('express');
const router = express.Router();
const teacherSalaryController = require('../controllers/teacherSalaryController');
const { protect, protectAdmin } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * components:
 *   schemas:
 *     TeacherSalarySettings:
 *       type: object
 *       properties:
 *         teacher_id:
 *           type: integer
 *           description: O'qituvchi ID si
 *         base_percentage:
 *           type: number
 *           description: Asosiy foiz (studentlardan tushgan pulldan)
 *         bonus_percentage:
 *           type: number
 *           description: Qo'shimcha foiz
 *         experience_bonus_threshold:
 *           type: integer
 *           description: Qo'shimcha foiz qancha oydan keyin
 *         experience_bonus_rate:
 *           type: number
 *           description: Tajriba uchun qo'shimcha foiz
 *     TeacherAdvance:
 *       type: object
 *       properties:
 *         teacher_id:
 *           type: integer
 *           description: O'qituvchi ID si
 *         amount:
 *           type: number
 *           description: Avans summasi
 *         month_name:
 *           type: string
 *           description: Oy nomi (YYYY-MM)
 *         description:
 *           type: string
 *           description: Izoh
 */

/**
 * @swagger
 * /api/teacher-salary/settings:
 *   post:
 *     summary: O'qituvchi maosh sozlamalarini belgilash
 *     tags: [Teacher Salary]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TeacherSalarySettings'
 *     responses:
 *       200:
 *         description: Sozlamalar muvaffaqiyatli belgilandi
 *       400:
 *         description: Noto'g'ri parametrlar
 *       401:
 *         description: Ruxsat yo'q
 */
router.post('/settings', protectAdmin, teacherSalaryController.setTeacherSalarySettings);

/**
 * @swagger
 * /api/teacher-salary/advance:
 *   post:
 *     summary: O'qituvchiga avans berish
 *     tags: [Teacher Salary]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TeacherAdvance'
 *     responses:
 *       200:
 *         description: Avans muvaffaqiyatli berildi
 *       400:
 *         description: Noto'g'ri parametrlar
 *       404:
 *         description: O'qituvchi topilmadi
 */
router.post('/advance', protectAdmin, teacherSalaryController.giveTeacherAdvance);

/**
 * @swagger
 * /api/teacher-salary/calculate:
 *   post:
 *     summary: O'qituvchi oylik maoshini hisoblash
 *     tags: [Teacher Salary]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teacher_id:
 *                 type: integer
 *               month_name:
 *                 type: string
 *                 description: YYYY-MM format
 *     responses:
 *       200:
 *         description: Maosh muvaffaqiyatli hisoblandi
 */
router.post('/calculate', protectAdmin, teacherSalaryController.calculateMonthlySalary);

/**
 * @swagger
 * /api/teacher-salary/calculate-all:
 *   post:
 *     summary: Barcha o'qituvchilar oylik maoshini hisoblash
 *     tags: [Teacher Salary]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               month_name:
 *                 type: string
 *                 description: YYYY-MM format
 *     responses:
 *       200:
 *         description: Barcha o'qituvchilar maoshi hisoblandi
 */
router.post('/calculate-all', protectAdmin, teacherSalaryController.calculateAllTeachersSalary);

/**
 * @swagger
 * /api/teacher-salary/pay:
 *   post:
 *     summary: O'qituvchi maoshini to'lash
 *     tags: [Teacher Salary]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teacher_id:
 *                 type: integer
 *               month_name:
 *                 type: string
 *                 description: YYYY-MM format
 *               payment_amount:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Maosh muvaffaqiyatli to'landi
 */
router.post('/pay', protectAdmin, teacherSalaryController.payTeacherSalary);

/**
 * @swagger
 * /api/teacher-salary/report/{teacher_id}:
 *   get:
 *     summary: O'qituvchi oylik hisobot
 *     tags: [Teacher Salary]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacher_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month_name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: O'qituvchi hisoboti
 */
router.get('/report/:teacher_id', protect, teacherSalaryController.getTeacherMonthlySalary);

/**
 * @swagger
 * /api/teacher-salary/report-all:
 *   get:
 *     summary: Barcha o'qituvchilar oylik hisoboti
 *     tags: [Teacher Salary]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month_name
 *         required: true
 *         schema:
 *           type: string
 *           description: YYYY-MM format
 *     responses:
 *       200:
 *         description: Barcha o'qituvchilar hisoboti
 */
router.get('/report-all', protectAdmin, teacherSalaryController.getAllTeachersSalaryReport);

/**
 * @swagger
 * /api/teacher-salary/check-debts:
 *   get:
 *     summary: O'tgan oydan qarzlarni tekshirish
 *     tags: [Teacher Salary]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month_name
 *         required: true
 *         schema:
 *           type: string
 *           description: Joriy oy (YYYY-MM format)
 *     responses:
 *       200:
 *         description: Qarzlar haqida ma'lumot
 */
router.get('/check-debts', protectAdmin, teacherSalaryController.checkPreviousDebts);

/**
 * @swagger
 * /api/teacher-salary/detailed-report/{teacher_id}:
 *   get:
 *     summary: O'qituvchi tafsili hisoboti (guruhlar, studentlar bilan)
 *     tags: [Teacher Salary]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacher_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: month_name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tafsili hisobot
 */
router.get('/detailed-report/:teacher_id', protect, teacherSalaryController.getDetailedTeacherReport);

/**
 * @swagger
 * /api/teacher-salary/auto-calculate:
 *   post:
 *     summary: Avtomatik hisoblash (test uchun)
 *     tags: [Teacher Salary]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               month_name:
 *                 type: string
 *                 description: YYYY-MM format
 *     responses:
 *       200:
 *         description: Avtomatik hisoblash natijasi
 */
router.post('/auto-calculate', protectAdmin, teacherSalaryController.autoCalculateSalaries);

module.exports = router;