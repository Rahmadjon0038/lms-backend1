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
 *     summary: Admin tomonidan talabani guruhga qo'shish (guruh ma'lumotlari avtomatik yoziladi)
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
 *                 example: 5
 *               group_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Student guruhga qo'shildi va guruh ma'lumotlari yozildi
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
 *                   example: "Student guruhga qo'shildi"
 *                 updatedFields:
 *                   type: object
 *                   properties:
 *                     group_name:
 *                       type: string
 *                       example: "Inglis tili beginner"
 *                     teacher_name:
 *                       type: string
 *                       example: "Rahmadjon Abdullayev"
 *                     required_amount:
 *                       type: number
 *                       example: 500000
 *       400:
 *         description: Bu student allaqachon guruhda
 *       404:
 *         description: Guruh topilmadi
 */
router.post(
  '/admin/join-student',
  protect,
  roleCheck(['admin']),
  groupCtrl.adminAddStudentToGroup
);

/**
 * @swagger
 * /api/groups/join:
 *   post:
 *     summary: Student kod orqali guruhga qo'shilishi
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
 *               - unique_code
 *             properties:
 *               unique_code:
 *                 type: string
 *                 description: Guruhning unikal kodi
 *                 example: "GR-A1B2C3"
 *     responses:
 *       201:
 *         description: Guruhga muvaffaqiyatli qo'shildingiz
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
 *                   example: "Guruhga muvaffaqiyatli qo'shildingiz"
 *                 groupInfo:
 *                   type: object
 *                   properties:
 *                     group_name:
 *                       type: string
 *                       example: "Inglis tili beginner"
 *                     teacher_name:
 *                       type: string
 *                       example: "Rahmadjon Abdullayev"
 *                     price:
 *                       type: number
 *                       example: 500000
 *       400:
 *         description: Siz allaqachon bu guruhdasiz yoki guruh bloklangan
 *       404:
 *         description: Bunday kodli guruh mavjud emas
 */
router.post('/join', protect, groupCtrl.studentJoinByCode);

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
 * /api/groups/{id}/view:
 *   get:
 *     summary: Student guruhni ko'rishi (guruh tavsifotlari, teacher ma'lumotlari va guruhdashlari ismi)
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
 *         description: Guruh tavsifotlari, teacher telefon raqamlari va guruhdashlari
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 group:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Node.js Backend"
 *                     start_date:
 *                       type: string
 *                       format: date
 *                       example: "2025-01-10"
 *                     schedule:
 *                       type: object
 *                       example: {"days": ["Mon", "Wed"], "time": "18:00-20:00"}
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     teacher_name:
 *                       type: string
 *                       example: "Anvar Karimov"
 *                     teacher_phone:
 *                       type: string
 *                       example: "+998901234567"
 *                     teacher_phone2:
 *                       type: string
 *                       example: "+998907654321"
 *                 members:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: "Ali"
 *                       surname:
 *                         type: string
 *                         example: "Valiyev"
 *                 totalMembers:
 *                   type: integer
 *                   example: 15
 *       404:
 *         description: Guruh topilmadi
 */
router.get('/:id/view', protect, groupCtrl.getGroupViewForStudent);

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
 *         description: Guruh ma'lumotlari, teacher telefon raqamlari va talabalar
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 group:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     teacher_name:
 *                       type: string
 *                       example: "Anvar Karimov"
 *                     teacher_phone:
 *                       type: string
 *                       example: "+998901234567"
 *                     teacher_phone2:
 *                       type: string
 *                       example: "+998907654321"
 *                 students:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       surname:
 *                         type: string
 *                       phone:
 *                         type: string
 */
router.get('/:id', protect, groupCtrl.getGroupById);



/**
 * @swagger
 * /api/groups/my-group:
 *   get:
 *     summary: Student o'z guruhini va guruh a'zolarini ko'rishi
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Guruh ma'lumotlari, teacher telefon raqamlari va a'zolar ro'yxati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 groupInfo:
 *                   type: object
 *                   properties:
 *                     group_id:
 *                       type: integer
 *                       example: 1
 *                     group_name:
 *                       type: string
 *                       example: "Inglis tili beginner"
 *                     teacher_name:
 *                       type: string
 *                       example: "Rahmadjon Abdullayev"
 *                     teacher_phone:
 *                       type: string
 *                       example: "+998901234567"
 *                     teacher_phone2:
 *                       type: string
 *                       example: "+998907654321"
 *                     required_amount:
 *                       type: number
 *                       example: 500000
 *                     schedule:
 *                       type: object
 *                       example: {"days": ["Mon", "Wed"], "time": "18:00-20:00"}
 *                 members:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                         example: "Aziz"
 *                       surname:
 *                         type: string
 *                         example: "Karimov"
 *                       type: object
 *                       example: {"days": ["Mon", "Wed"], "time": "18:00-20:00"}
 *                     start_date:
 *                       type: string
 *                       format: date
 *                       example: "2025-01-10"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                 totalMembers:
 *                   type: integer
 *                   example: 15
 *       404:
 *         description: Siz hali hech qaysi guruhga qo'shilmagansiz
 */

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

/**
 * @swagger
 * /api/groups/change-student-group:
 *   post:
 *     summary: Studentni boshqa guruhga o'tkazish (Faqat Admin)
 *     description: Student bir guruhdan boshqa guruhga ko'chiriladi. Eski guruhdan o'chirib, yangi guruhga qo'shadi.
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
 *               - new_group_id
 *             properties:
 *               student_id:
 *                 type: integer
 *                 example: 5
 *                 description: O'tkaziladigan student ID
 *               new_group_id:
 *                 type: integer
 *                 example: 3
 *                 description: Yangi guruh ID
 *     responses:
 *       200:
 *         description: Student guruhdan guruhga ko'chirildi
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
 *                   example: "Ali Valiyev guruhdan guruhga ko'chirildi"
 *                 previous_group:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                 new_group:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     teacher_name:
 *                       type: string
 *                 updated_student:
 *                   type: object
 *       400:
 *         description: Noto'g'ri ma'lumot yoki guruh faol emas
 *       404:
 *         description: Student yoki guruh topilmadi
 */
router.post(
  '/change-student-group',
  protect,
  roleCheck(['admin']),
  groupCtrl.changeStudentGroup
);


module.exports = router;
