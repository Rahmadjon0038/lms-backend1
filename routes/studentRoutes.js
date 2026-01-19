const express = require("express");
const router = express.Router();
const studentController = require("../controllers/studentController");
const { protect } = require("../middlewares/authMiddleware");
const { roleCheck } = require("../middlewares/roleMiddleware");

/**
 * @swagger
 * tags:
 *   name: Students
 *   description: Studentlarni boshqarish APIlari
 */

/**
 * @swagger
 * /api/students/all:
 *   get:
 *     summary: Studentlarni teacher, group, subject, status bo'yicha filtrlab olish (ADMIN)
 *     description: Admin uchun barcha studentlar ro'yxatini filter bilan olish. Har xil parametrlar orqali filter qilish mumkin.
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: teacher_id
 *         required: false
 *         schema:
 *           type: integer
 *         description: O'qituvchi IDsi bo'yicha filter
 *       - in: query
 *         name: group_id
 *         required: false
 *         schema:
 *           type: integer
 *         description: Guruh IDsi bo'yicha filter
 *       - in: query
 *         name: subject_id
 *         required: false
 *         schema:
 *           type: integer
 *         description: Fan IDsi bo'yicha filter
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [active, inactive, blocked, graduated, dropped_out]
 *         description: Student holati - active (Faol), inactive (To'xtatilgan), blocked (Bloklangan), graduated (Bitirgan), dropped_out (Bitimasdan chiqib ketgan)
 *       - in: query
 *         name: unassigned
 *         required: false
 *         schema:
 *           type: string
 *           enum: [true]
 *         description: Hali guruhga biriktirilmagan studentlarni ko'rsatish uchun 'true' qiymat berish kerak
 *     responses:
 *       200:
 *         description: Muvaffaqiyatli ro'yxat qaytdi
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   name:
 *                     type: string
 *                     example: Ali
 *                   surname:
 *                     type: string
 *                     example: Valiyev
 *                   phone:
 *                     type: string
 *                     example: "+998901234567"
 *                   phone2:
 *                     type: string
 *                     example: "+998912345678"
 *                   status:
 *                     type: string
 *                     enum: [active, inactive, blocked, graduated, dropped_out]
 *                     example: "active"
 *                     description: Student holati
 *                   registration_date:
 *                     type: string
 *                     format: date-time
 *                   group_name:
 *                     type: string
 *                     example: "Inglis tili beginner"
 *                   subject_name:
 *                     type: string
 *                     nullable: true
 *                   required_amount:
 *                     type: number
 *                     example: 500000
 *                   teacher_name:
 *                     type: string
 *                     example: "Rahmadjon Abdullayev"
 *                   paid_amount:
 *                     type: number
 *                     example: 0
 *       401:
 *         description: Token kerak (unauthorized)
 *       403:
 *         description: Faqat admin uchun
 *       500:
 *         description: Server xatosi
 */
router.get("/all", protect, roleCheck(['admin']), studentController.getAllStudents);

/**
 * @swagger
 * /api/students/{student_id}/status:
 *   patch:
 *     summary: Student statusini o'zgartirish (FAQAT ADMIN)
 *     description: |
 *       Student holatini o'zgartirish - faollashtirish, to'xtatish, bloklash, bitirish va boshqalar.
 *       
 *       **Mavjud statuslar:**
 *       - `active` - Faol (guruhga biriktirilishi mumkin)
 *       - `inactive` - O'qishni to'xtatgan (vaqtincha)
 *       - `blocked` - Bloklangan (admin tomonidan)

 *       - `graduated` - Kursni muvaffaqiyatli bitirgan
 *       - `dropped_out` - O'qishdan bitimasdan chiqib ketgan
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Student ID
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
 *                 enum: [active, inactive, blocked, graduated, dropped_out]
 *                 description: |
 *                   Student holati:
 *                   - active: Faol
 *                   - inactive: To'xtatilgan
 *                   - blocked: Bloklangan
 *                   - graduated: Bitirgan
 *                   - dropped_out: Bitimasdan chiqib ketgan
 *                 example: "active"
 *     responses:
 *       200:
 *         description: Student statusi muvaffaqiyatli o'zgartirildi
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
 *                   example: "Student hozir o'qimoqda"
 *                 status_description:
 *                   type: string
 *                   example: "O'qimoqda"
 *                 student:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 25
 *                     name:
 *                       type: string
 *                       example: "Akmal"
 *                     surname:
 *                       type: string
 *                       example: "Karimov"
 *                     username:
 *                       type: string
 *                       example: "akmal_karimov"
 *                     status:
 *                       type: string
 *                       enum: [active, inactive, blocked, graduated, dropped_out]
 *                       example: "active"
 *                     group_id:
 *                       type: integer
 *                       example: 3
 *                     group_name:
 *                       type: string
 *                       example: "English Beginner"
 *                     course_status:
 *                       type: string
 *                       example: "in_progress"
 *                 previous_status:
 *                   type: string
 *                   example: "active"
 *                   description: Avvalgi status
 *       400:
 *         description: Noto'g'ri status yoki ma'lumotlar
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Status faqat 'active', 'inactive', 'blocked', 'graduated' yoki 'dropped_out' bo'lishi mumkin"
 *                 valid_statuses:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["active", "inactive", "blocked", "graduated", "dropped_out"]
 *       404:
 *         description: Student topilmadi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Student topilmadi"
 *       500:
 *         description: Server xatosi
 */
router.patch("/:student_id/status", protect, roleCheck(['admin']), studentController.updateStudentStatus);

/**
 * @swagger
 * /api/students/my-groups:
 *   get:
 *     summary: Student o'zi qatnashayotgan guruhlarni olish
 *     description: Faqat o'zi login bo'lgan student o'zi qatnashayotgan guruhlar ro'yxatini ko'ra oladi
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Student guruhlar ro'yxati
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
 *                   example: "Sizning guruhlaringiz ro'yxati"
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       group_id:
 *                         type: integer
 *                       group_name:
 *                         type: string
 *                       unique_code:
 *                         type: string
 *                       start_date:
 *                         type: string
 *                         format: date
 *                       schedule:
 *                         type: object
 *                       price:
 *                         type: number
 *                       is_active:
 *                         type: boolean
 *                       joined_at:
 *                         type: string
 *                         format: date-time
 *                       student_status:
 *                         type: string
 *                         enum: [active, stopped, finished]
 *                       teacher_name:
 *                         type: string
 *                       subject_name:
 *                         type: string
 *       401:
 *         description: Ruxsat berilmadi (token kerak)
 */
router.get("/my-groups", protect, studentController.getMyGroups);

/**
 * @swagger
 * /api/students/{student_id}:
 *   delete:
 *     summary: Studentni butunlay o'chirish (FAQAT ADMIN)
 *     description: Student va uning barcha ma'lumotlari o'chiriladi
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Student ID
 *     responses:
 *       200:
 *         description: Student o'chirildi
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
 *                   example: "Student va uning barcha ma'lumotlari o'chirildi"
 *                 deletedStudent:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     surname:
 *                       type: string
 *                     username:
 *                       type: string
 *       404:
 *         description: Student topilmadi
 */
router.delete("/:student_id", protect, roleCheck(['admin']), studentController.deleteStudent);

/**
 * @swagger
 * /api/students/my-group-info/{group_id}:
 *   get:
 *     summary: Student aniq bir guruh haqida batafsil ma'lumot olish (o'z guruhdashlari bilan)
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: group_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Guruh ID
 *     responses:
 *       200:
 *         description: Student guruh ma'lumotlari
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 student:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     group:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         status:
 *                           type: string
 *                         classStatus:
 *                           type: string
 *                           enum: [not_started, started, finished]
 *                         classStartDate:
 *                           type: string
 *                           format: date
 *                         plannedStartDate:
 *                           type: string
 *                           format: date
 *                         price:
 *                           type: number
 *                           description: Guruh narxi
 *                         teacher:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             name:
 *                               type: string
 *                             phone:
 *                               type: string
 *                               description: Teacher telefon raqami
 *                             phone2:
 *                               type: string
 *                               description: Teacher 2-telefon raqami
 *                         classmates:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                                 description: Guruhdasining ismi va familiyasi
 *                         totalClassmates:
 *                           type: integer
 *                           description: Guruhdashlari soni
 *                     displayStatus:
 *                       type: string
 *                       example: "Darslar 2025-01-15 da boshlandi"
 *       403:
 *         description: Siz bu guruhga a'zo emassiz
 *       404:
 *         description: Student yoki guruh topilmadi
 */
router.get("/my-group-info/:group_id", protect, studentController.getMyGroupInfo);

module.exports = router;
