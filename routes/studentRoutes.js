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
 *     summary: Studentlarni teacher, group, subject, status bo'yicha filtrlab olish
 *     tags: [Students]
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
 *           enum: [active, inactive, blocked]
 *         description: Student holati (active - faol, inactive - to'xtatgan, blocked - bloklangan)
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
 *                     example: "active"
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
 *       500:
 *         description: Server xatosi
 */
router.get("/all", studentController.getAllStudents);

/**
 * @swagger
 * /api/students/{student_id}/status:
 *   patch:
 *     summary: Student statusini o'zgartirish (FAQAT ADMIN)
 *     description: Studentni faollashtirish, o'qishni to'xtatish yoki bloklash
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
 *                 enum: [active, inactive, blocked]
 *                 description: active - faol, inactive - o'qishni to'xtatgan, blocked - bloklangan
 *                 example: "inactive"
 *     responses:
 *       200:
 *         description: Student statusi o'zgartirildi
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
 *                   example: "Student o'qishni to'xtatdi (inactive)"
 *                 student:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     surname:
 *                       type: string
 *                     status:
 *                       type: string
 *       400:
 *         description: Noto'g'ri status
 *       404:
 *         description: Student topilmadi
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
