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
 *               - subject_id
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Node.js Backend"
 *               subject_id:
 *                 type: integer
 *                 example: 1
 *                 description: "Fan (Subject) ID - majburiy"
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
 *               status:
 *                 type: string
 *                 enum: [draft, active]
 *                 default: draft
 *                 example: "draft"
 *                 description: "Guruh holati - draft (tayyorgarlik) yoki active (faol)"
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
 *               subject_id:
 *                 type: integer
 *                 example: 2
 *                 description: "Fan (Subject) ID"
 *     responses:
 *       200:
 *         description: Guruh yangilandi
 */
router.patch('/:id', protect, roleCheck(['admin']), groupCtrl.updateGroup);

/**
 * @swagger
 * /api/groups/{id}/status:
 *   patch:
 *     summary: Guruh statusini o'zgartirish (draft -> active -> blocked)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Guruh ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [draft, active, blocked]
 *                 description: |
 *                   - draft: Yangi guruh, studentlar yig'ilmoqda
 *                   - active: Darslar boshlangan, faol guruh  
 *                   - blocked: Bloklangan guruh
 *                 example: "active"
 *     responses:
 *       200:
 *         description: Guruh statusi o'zgartirildi
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
 *                   example: "Guruh faollashtirildi (darslar boshlandi)"
 *                 group:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     status:
 *                       type: string
 *                     teacher_id:
 *                       type: integer
 *                     start_date:
 *                       type: string
 *                       format: date
 *       400:
 *         description: Noto'g'ri status
 *       404:
 *         description: Guruh topilmadi
 */
router.patch('/:id/status', protect, roleCheck(['admin']), groupCtrl.updateGroupStatus);

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
 *         description: Student allaqachon guruhda yoki student faol emas. Faqat faol (active) statusdagi studentlarni qo'shish mumkin
 *       404:
 *         description: Guruh topilmadi
 */
router.post(
  '/admin/join-student',
  protect,
  roleCheck(['admin']),
  groupCtrl.adminAddStudentToGroup
);

// NOTE: Student kod orqali qo'shilish API'si olib tashlandi
// Admin tomonidan boshqariladi

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
 *         description: O'qituvchi bo'yicha filter
 *       - in: query
 *         name: subject_id
 *         schema:
 *           type: integer
 *         description: Fan (Subject) bo'yicha filter
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Faol/nofaol guruhlar bo'yicha filter
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, active, blocked]
 *         description: |
 *           Guruh statusiga ko'ra filter:
 *           - draft: Yangi guruhlar (studentlar yig'ilmoqda)
 *           - active: Faol guruhlar (darslar boshlangan)
 *           - blocked: Bloklangan guruhlar
 *     responses:
 *       200:
 *         description: Guruhlar ro'yxati qaytdi
 */
router.get('/', protect, groupCtrl.getAllGroups);

/**
 * @swagger

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
 *         description: Student faol emas, noto'g'ri ma'lumot yoki guruh faol emas. Faqat faol (active) statusdagi studentlarni o'tkazish mumkin
 *       404:
 *         description: Student yoki guruh topilmadi
 */
/**
 * @swagger
 * /api/groups/fix-all-students:
 *   post:
 *     summary: Barcha studentlarda course status nomuvofiqliklarini tuzatish
 *     description: Tizimda barcha studentlarni tekshirib, course_status va guruh holati orasidagi nomuvofiqliklarni avtomatik tuzatadi
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tuzatish jarayoni yakunlandi
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
 *                   example: "5 ta studentning course statusi tuzatildi"
 *                 fixed_count:
 *                   type: integer
 *                   example: 5
 *                 total_issues_found:
 *                   type: integer
 *                   example: 5
 *                 fixed_students:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.post('/fix-all-students', protect, roleCheck(['admin']), groupCtrl.fixAllStudentCourseStatuses);

/**
 * @swagger
 * /api/groups/fix-student-status:
 *   post:
 *     summary: Student course statusini tuzatish (nomuvofiqliklarni hal qilish)
 *     description: Student ma'lumotlarida course_status, guruh holati va sanalar orasidagi nomuvofiqliklarni avtomatik tuzatadi
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
 *             properties:
 *               student_id:
 *                 type: integer
 *                 example: 17
 *                 description: Tuzatiladigan student ID
 *     responses:
 *       200:
 *         description: Student ma'lumotlari tuzatildi yoki tuzatish kerak bo'lmadi
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
 *                   example: "Student ma'lumotlari tuzatildi"
 *                 fixes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Course status 'in_progress' ga o'zgartirildi", "Course start date belgilandi"]
 *                 before:
 *                   type: object
 *                 after:
 *                   type: object
 *       404:
 *         description: Student topilmadi
 */
router.post('/fix-student-status', protect, roleCheck(['admin']), groupCtrl.fixStudentCourseStatus);

router.post(
  '/change-student-group',
  protect,
  roleCheck(['admin']),
  groupCtrl.changeStudentGroup
);

/**
 * @swagger
 * /api/groups/newly-created:
 *   get:
 *     summary: Yangi ochilgan guruhlar ro'yxati (draft holatida)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Yangi ochilgan guruhlar ro'yxati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       unique_code:
 *                         type: string
 *                       status:
 *                         type: string
 *                         example: "draft"
 *                       subject_name:
 *                         type: string
 *                       teacher_name:
 *                         type: string
 *                       student_count:
 *                         type: integer
 *                       can_start_class:
 *                         type: boolean
 *                         description: "Dars boshlash mumkinligi"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 */
router.get('/newly-created', protect, roleCheck(['admin']), groupCtrl.getNewlyCreatedGroups);

/**
 * @swagger
 * /api/groups/{id}/start-class:
 *   patch:
 *     summary: Darsni boshlash (draft -> active + avtomatik start_date)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Guruh ID
 *     responses:
 *       200:
 *         description: Dars muvaffaqiyatli boshlandi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Darslar muvaffaqiyatli boshlandi!"
 *                 group:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "active"
 *                     class_start_date:
 *                       type: string
 *                       format: date-time
 *                     class_status:
 *                       type: string
 *                       example: "started"
 *                     student_count:
 *                       type: integer
 *       400:
 *         description: Guruh draft holatida emas yoki studentlar yo'q
 *       404:
 *         description: Guruh topilmadi
 */
router.patch('/:id/start-class', protect, roleCheck(['admin']), groupCtrl.startGroupClass);

/**
 * @swagger
 * /api/groups/swap-schedules:
 *   post:
 *     summary: Teacher guruhlarining jadvallarini almashtirish
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
 *               - group1_id
 *               - group2_id
 *             properties:
 *               group1_id:
 *                 type: integer
 *                 example: 28
 *                 description: "Birinchi guruh ID"
 *               group2_id:
 *                 type: integer
 *                 example: 29
 *                 description: "Ikkinchi guruh ID"
 *     responses:
 *       200:
 *         description: Jadvallar muvaffaqiyatli almashtirildi
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
 *                   example: "Guruhlar jadvallari muvaffaqiyatli almashtirildi"
 *                 changes:
 *                   type: object
 *                   properties:
 *                     group1:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         old_schedule:
 *                           type: object
 *                         new_schedule:
 *                           type: object
 *                     group2:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         old_schedule:
 *                           type: object
 *                         new_schedule:
 *                           type: object
 *       400:
 *         description: Xatolik (bir xil teacher bo'lishi shart)
 *       404:
 *         description: Guruh topilmadi
 */
router.post('/swap-schedules', protect, roleCheck(['admin']), groupCtrl.swapGroupSchedules);

/**
 * @swagger
 * /api/groups/teacher-schedule/{teacher_id}:
 *   get:
 *     summary: Teacher guruhlarining barcha jadvallarini ko'rish
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: teacher_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Teacher ID
 *     responses:
 *       200:
 *         description: Teacher jadvali
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 teacher_id:
 *                   type: integer
 *                   example: 31
 *                 teacher_name:
 *                   type: string
 *                   example: "Rahmadjon Abdullayev"
 *                 total_groups:
 *                   type: integer
 *                   example: 2
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                 schedule_by_day:
 *                   type: object
 *                   example:
 *                     "Seshanba": [{"id": 28, "name": "Frontend 1", "schedule": {"days": ["Seshanba"], "time": "14:00-16:00"}}]
 *       400:
 *         description: Teacher ID noto'g'ri
 *       404:
 *         description: Teacher topilmadi
 */
router.get('/teacher-schedule/:teacher_id', protect, roleCheck(['admin']), groupCtrl.getTeacherScheduleOverview);

module.exports = router;
