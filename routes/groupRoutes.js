const express = require('express');
const router = express.Router();

const groupCtrl = require('../controllers/groupController');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');

/**
 * @swagger
 * tags:
 *   - name: Groups
 *     description: Guruh boshqaruvi va talabalarni guruhlash (Integer ID)
 */

/**
 * @swagger
 * /api/groups/create:
 *   post:
 *     summary: Yangi guruh yaratish (Faqat Admin)
 *     tags: [Groups]
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
 *                 example: "Node.js Backend"
 *               teacher_id:
 *                 type: integer
 *                 example: 2
 *               start_date:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-10"
 *               schedule:
 *                 type: object
 *                 example: {"days": ["Mon", "Wed"], "time": "18:00-20:00"}
 *               price:
 *                 type: number
 *                 example: 1000000
 *     responses:
 *       201:
 *         description: Guruh muvaffaqiyatli yaratildi
 */
router.post('/create', protect, roleCheck(['admin']), groupCtrl.createGroup);

/**
 * @swagger
 * /api/groups/{id}:
 *   patch:
 *     summary: Guruhni tahrirlash (Bloklash, o'qituvchi yoki nomini o'zgartirish)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_active:
 *                 type: boolean
 *               teacher_id:
 *                 type: integer
 *               name:
 *                 type: string
 *               schedule:
 *                 type: object
 *               price:
 *                 type: number
 *                 example: 1000000
 *     responses:
 *       200:
 *         description: Guruh yangilandi
 */
router.patch('/:id', protect, roleCheck(['admin']), groupCtrl.updateGroup);

/**
 * @swagger
 * /api/groups/admin/join-student:
 *   post:
 *     summary: Admin tomonidan talabani guruhga qo'shish
 *     tags: [Groups]
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
 *             properties:
 *               student_id:
 *                 type: integer
 *               group_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Talaba guruhga qo'shildi
 */
router.post(
  '/admin/join-student',
  protect,
  roleCheck(['admin']),
  groupCtrl.adminAddStudentToGroup
);

/**
 * @swagger
 * /api/groups/{group_id}/remove-student/{student_id}:
 *   delete:
 *     summary: Talabani guruhdan chiqarib yuborish (Admin)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: group_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Talaba muvaffaqiyatli chiqarildi
 */
router.delete(
  '/:group_id/remove-student/:student_id',
  protect,
  roleCheck(['admin']),
  groupCtrl.removeStudentFromGroup
);

/**
 * @swagger
 * /api/groups:
 *   get:
 *     summary: Barcha guruhlarni ko'rish va filtrlar bo'yicha qidirish
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: teacher_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Guruhlar ro'yxati qaytdi
 */
router.get('/', protect, groupCtrl.getAllGroups);

/**
 * @swagger
 * /api/groups/{id}:
 *   get:
 *     summary: Guruh ma'lumotlari va undagi talabalar ro'yxati
 *     tags: [Groups]
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
 *         description: Batafsil ma'lumot
 */
router.get('/:id', protect, groupCtrl.getGroupById);



/**
 * @swagger
 * /api/groups/{id}:
 *   delete:
 *     summary: Guruhni butunlay o'chirish (Faqat Admin)
 *     tags: [Groups]
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
 *         description: Guruh muvaffaqiyatli o'chirildi
 *       404:
 *         description: Guruh topilmadi
 */
router.delete(
  '/:id',
  protect,
  roleCheck(['admin']),
  groupCtrl.deleteGroup
);


module.exports = router;
