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
 *     summary: Studentlarni teacher, group, status bo'yicha filtrlab olish
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

module.exports = router;
