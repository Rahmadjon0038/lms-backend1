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
 *     summary: Barcha studentlar ro'yxati har birining barcha guruhlari bilan (ADMIN)
 *     description: |
 *       Admin uchun barcha studentlar ro'yxatini filter bilan olish. 
 *       Har bir student uchun barcha guruhlaridagi status ma'lumotlari ko'rsatiladi.
 *       Yangi student group status tizimi: active (Faol), stopped (Nofaol), finished (Bitirgan)
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
 *           enum: [active, inactive, blocked]
 *         description: Student holati (users table)
 *       - in: query
 *         name: group_status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [active, stopped, finished]
 *         description: Student guruh holati - active (Faol), stopped (Nofaol), finished (Bitirgan)
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
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 25
 *                     by_group_status:
 *                       type: object
 *                       properties:
 *                         active:
 *                           type: integer
 *                           example: 15
 *                         stopped:
 *                           type: integer
 *                           example: 5
 *                         finished:
 *                           type: integer
 *                           example: 3
 *                         unassigned:
 *                           type: integer
 *                           example: 2
 *                 students:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: Ali
 *                       surname:
 *                         type: string
 *                         example: Valiyev
 *                       phone:
 *                         type: string
 *                         example: "+998901234567"
 *                       phone2:
 *                         type: string
 *                         example: "+998912345678"
 *                       student_status:
 *                         type: string
 *                         enum: [active, inactive, blocked]
 *                         example: "active"
 *                         description: Student holati (users table)
 *                       registration_date:
 *                         type: string
 *                         format: date-time
 *                       group_id:
 *                         type: integer
 *                         example: 5
 *                       group_name:
 *                         type: string
 *                         example: "Inglis tili beginner"
 *                       group_status:
 *                         type: string
 *                         enum: [active, stopped, finished]
 *                         example: "active"
 *                         description: Student guruh holati
 *                       group_status_description:
 *                         type: string
 *                         example: "Faol"
 *                         description: Status tavsifi
 *                       teacher_name:
 *                         type: string
 *                         example: "Rahmadjon Abdullayev"
 *                       subject_name:
 *                         type: string
 *                         example: "Inglis tili"
 *                       price:
 *                         type: number
 *                         example: 400000
 *                       group_joined_at:
 *                         type: string
 *                         format: date-time
 *                         description: Guruhga qo'shilgan sana
 *                       group_left_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         description: Guruhni tark etgan sana
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
 * /api/students/{student_id}/groups/{group_id}/status:
 *   patch:
 *     summary: Student guruh statusini o'zgartirish (FAQAT ADMIN)
 *     description: |
 *       Studentning faqat bitta guruhdagi statusini o'zgartirish. Boshqa guruhlarga ta'sir qilmaydi.
 *       Agar student guruhda bo'lmasa, uni guruhga qo'shib status beradi.
 *       
 *       **Mavjud statuslar:**
 *       - `active` - Faol (guruhda darsga qatnashmoqda)
 *       - `stopped` - Nofaol (vaqtincha to'xtatgan)
 *       - `finished` - Bitirgan (guruhni muvaffaqiyatli yakunlagan)
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Student IDsi
 *       - in: path
 *         name: group_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Guruh IDsi
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
 *                 enum: [active, stopped, finished]
 *                 description: Yangi status
 *                 example: "active"
 *           examples:
 *             faol:
 *               summary: Studentni faol qilish
 *               value:
 *                 status: "active"
 *             nofaol:
 *               summary: Studentni nofaol qilish  
 *               value:
 *                 status: "stopped"
 *             bitirgan:
 *               summary: Student guruhni bitirdi
 *               value:
 *                 status: "finished"
 *     responses:
 *       200:
 *         description: Guruh statusi muvaffaqiyatli o'zgartirildi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 status_description:
 *                   type: string
 *                 student_group:
 *                   type: object
 *                 previous_status:
 *                   type: string
 *                 group_name:
 *                   type: string
 *                 student_name:
 *                   type: string
 *             example:
 *               success: true
 *               message: "Alisher Valiyev \"Python asoslari\" guruhini bitirdi"
 *               status_description: "Bitirgan"
 *               student_group:
 *                 student_id: 15
 *                 group_id: 3
 *                 status: "finished"
 *                 left_at: "2026-01-24T10:30:00.000Z"
 *               previous_status: "active"
 *               group_name: "Python asoslari"
 *               student_name: "Alisher Valiyev"
 *       400:
 *         description: Noto'g'ri status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 valid_statuses:
 *                   type: array
 *                   items:
 *                     type: string
 *             example:
 *               message: "Status faqat 'active', 'stopped' yoki 'finished' bo'lishi mumkin"
 *               valid_statuses: ["active", "stopped", "finished"]
 *       404:
 *         description: Student ushbu guruhda topilmadi
 *       500:
 *         description: Server xatosi
 */
router.patch("/:student_id/groups/:group_id/status", protect, roleCheck(['admin']), studentController.updateStudentGroupStatus);

/**
 * @swagger
 * /api/students/{student_id}/groups:
 *   get:
 *     summary: Student qatnashayotgan barcha guruhlarni ko'rish (ADMIN)
 *     description: Studentning barcha guruhlardagi status holatini ko'rish. Qaysi guruhni bitirgan, qaysi birida hali faol ekanligini aniqlash uchun.
 *     tags: [Students]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: student_id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Student IDsi
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
 *                 message:
 *                   type: string
 *                 student:
 *                   type: object
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       student_group_id:
 *                         type: integer
 *                       group_status:
 *                         type: string
 *                         enum: [active, stopped, finished]
 *                       joined_at:
 *                         type: string
 *                         format: date-time
 *                       left_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       group_id:
 *                         type: integer
 *                       group_name:
 *                         type: string
 *                       subject_name:
 *                         type: string
 *                       teacher_name:
 *                         type: string
 *                       teacher_surname:
 *                         type: string
 *                 total_groups:
 *                   type: integer
 *                 active_groups:
 *                   type: integer
 *                 finished_groups:
 *                   type: integer
 *                 stopped_groups:
 *                   type: integer
 *             example:
 *               success: true
 *               message: "Student guruhlar ro'yxati"
 *               student:
 *                 id: 15
 *                 name: "Alisher"
 *                 surname: "Valiyev"
 *                 username: "alisher_v"
 *               groups:
 *                 - student_group_id: 1
 *                   group_status: "finished"
 *                   joined_at: "2025-09-01T00:00:00.000Z"
 *                   left_at: "2026-01-24T10:30:00.000Z"
 *                   group_id: 3
 *                   group_name: "Python asoslari"
 *                   subject_name: "Python"
 *                   teacher_name: "Jamshid"
 *                   teacher_surname: "Karimov"
 *                 - student_group_id: 2
 *                   group_status: "active"
 *                   joined_at: "2026-01-01T00:00:00.000Z"
 *                   left_at: null
 *                   group_id: 5
 *                   group_name: "JavaScript pro"
 *                   subject_name: "JavaScript"
 *                   teacher_name: "Nilufar"
 *                   teacher_surname: "Tosheva"
 *               total_groups: 2
 *               active_groups: 1
 *               finished_groups: 1
 *               stopped_groups: 0
 *       404:
 *         description: Student topilmadi
 *       500:
 *         description: Server xatosi
 */
router.get("/:student_id/groups", protect, roleCheck(['admin']), studentController.getStudentGroups);

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
