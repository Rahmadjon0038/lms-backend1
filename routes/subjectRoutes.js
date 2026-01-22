const express = require('express');
const router = express.Router();

const subjectCtrl = require('../controllers/subjectController');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');

/**
 * @swagger
 * tags:
 *   - name: Subjects
 *     description: Fanlar (kurslar) boshqaruvi
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Subject:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Fan ID
 *         name:
 *           type: string
 *           description: Fan nomi
 */

/**
 * @swagger
 * /api/subjects/for-teacher:
 *   get:
 *     summary: Teacher registratsiyasi uchun fanlar ro'yxati
 *     description: Teacher ro'yxatdan o'tishdan oldin qaysi fanlar mavjudligini ko'rish uchun. Har bir fan uchun active guruhlar, dars jadvali va boshqa ma'lumotlar ham qaytariladi.
 *     tags: [Subjects]
 *     responses:
 *       200:
 *         description: Mavjud fanlar ro'yxati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 subjects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: "Ingliz tili"
 *                       teachers_count:
 *                         type: integer
 *                         example: 3
 *                       groups_count:
 *                         type: integer
 *                         example: 2
 *                       description:
 *                         type: string
 *                         example: "Ingliz tili fani (3 ta teacher, 2 ta active guruh)"
 *                       groups:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             group_id:
 *                               type: integer
 *                               example: 5
 *                             group_name:
 *                               type: string
 *                               example: "Beginner A1"
 *                             schedule:
 *                               type: object
 *                               description: "Dars jadvali (JSONB format)"
 *                               example: {"monday": "09:00-11:00", "wednesday": "09:00-11:00", "friday": "09:00-11:00"}
 *                             class_start_date:
 *                               type: string
 *                               format: date
 *                               example: "2025-01-15"
 *                             status:
 *                               type: string
 *                               example: "active"
 *                             price:
 *                               type: number
 *                               example: 450000
 *                             teacher_name:
 *                               type: string
 *                               example: "John Smith"
 */
router.get('/for-teacher', subjectCtrl.getSubjectsForTeacher);

/**
 * @swagger
 * /api/subjects:
 *   get:
 *     summary: Barcha fanlarni olish
 *     tags: [Subjects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Fanlar ro'yxati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 subjects:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       groups_count:
 *                         type: integer
 *                       students_count:
 *                         type: integer
 */
router.get('/', protect, subjectCtrl.getAllSubjects);

/**
 * @swagger
 * /api/subjects/create:
 *   post:
 *     summary: Yangi fan yaratish (Admin)
 *     tags: [Subjects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Matematika"
 *     responses:
 *       201:
 *         description: Fan yaratildi
 *       403:
 *         description: Faqat admin yarata oladi
 */
router.post('/create', protect, roleCheck(['admin', 'super_admin']), subjectCtrl.createSubject);

/**
 * @swagger
 * /api/subjects/{id}:
 *   put:
 *     summary: Fanni tahrirlash (Admin)
 *     tags: [Subjects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Fan yangilandi
 *       404:
 *         description: Fan topilmadi
 */
router.put('/:id', protect, roleCheck(['admin', 'super_admin']), subjectCtrl.updateSubject);

/**
 * @swagger
 * /api/subjects/{id}:
 *   delete:
 *     summary: Fanni o'chirish (Admin)
 *     tags: [Subjects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Fan o'chirildi
 *       400:
 *         description: Fan bilan bog'liq guruhlar mavjud
 *       404:
 *         description: Fan topilmadi
 */
router.delete('/:id', protect, roleCheck(['admin', 'super_admin']), subjectCtrl.deleteSubject);

/**
 * @swagger
 * /api/subjects/{id}/stats:
 *   get:
 *     summary: Fan statistikasi
 *     tags: [Subjects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Fan statistikasi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 subject:
 *                   $ref: '#/components/schemas/Subject'
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total_groups:
 *                       type: integer
 *                     total_students:
 *                       type: integer
 *                     total_teachers:
 *                       type: integer
 *                     active_groups:
 *                       type: integer
 *                     draft_groups:
 *                       type: integer
 *                     blocked_groups:
 *                       type: integer
 */
router.get('/:id/stats', protect, subjectCtrl.getSubjectStats);

module.exports = router;