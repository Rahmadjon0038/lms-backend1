const express = require('express');
const router = express.Router();
const {
  addRoom,
  getRooms,
  getRoomDetails,
  updateRoom,
  deleteRoom,
  checkAvailability
} = require('../controllers/roomController');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');

/**
 * @swagger
 * tags:
 *   name: Rooms
 *   description: Xonalarni boshqarish API
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Room:
 *       type: object
 *       required:
 *         - room_number
 *         - capacity
 *       properties:
 *         id:
 *           type: integer
 *           description: Xona ID
 *         room_number:
 *           type: string
 *           description: Xona raqami
 *         capacity:
 *           type: integer
 *           description: Sig'im (nechta o'quvchi sig'adi)
 *         has_projector:
 *           type: boolean
 *           description: Proyektor bormi
 *         description:
 *           type: string
 *           description: Xona haqida qo'shimcha ma'lumot
 *         is_available:
 *           type: boolean
 *           description: Xona mavjudmi
 *         created_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/rooms:
 *   post:
 *     summary: Yangi xona qo'shish (Admin)
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - room_number
 *               - capacity
 *             properties:
 *               room_number:
 *                 type: string
 *                 example: "101"
 *               capacity:
 *                 type: integer
 *                 example: 20
 *               has_projector:
 *                 type: boolean
 *                 example: true
 *               description:
 *                 type: string
 *                 example: "Kompyuter xonasi"
 *     responses:
 *       201:
 *         description: Xona muvaffaqiyatli qo'shildi
 *       400:
 *         description: Noto'g'ri ma'lumotlar
 *       401:
 *         description: Autentifikatsiya xatosi
 *       403:
 *         description: Ruxsat yo'q (faqat Admin)
 */
router.post('/', protect, roleCheck(['admin']), addRoom);

/**
 * @swagger
 * /api/rooms:
 *   get:
 *     summary: Barcha xonalarni olish
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_available
 *         schema:
 *           type: boolean
 *         description: Faqat mavjud xonalar (true) yoki mavjud bo'lmaganlar (false)
 *       - in: query
 *         name: has_projector
 *         schema:
 *           type: boolean
 *         description: Proyektor bor xonalar (true) yoki yo'q (false)
 *     responses:
 *       200:
 *         description: Xonalar ro'yxati
 *       401:
 *         description: Autentifikatsiya xatosi
 */
router.get('/', protect, getRooms);

/**
 * @swagger
 * /api/rooms/{id}:
 *   get:
 *     summary: Bitta xonaning ma'lumotlarini olish
 *     tags: [Rooms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Xona ID
 *     responses:
 *       200:
 *         description: Xona ma'lumotlari
 *       404:
 *         description: Xona topilmadi
 */
router.get('/:id', protect, getRoomDetails);

/**
 * @swagger
 * /api/rooms/{id}:
 *   put:
 *     summary: Xona ma'lumotlarini yangilash (Admin)
 *     tags: [Rooms]
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
 *               room_number:
 *                 type: string
 *               capacity:
 *                 type: integer
 *               has_projector:
 *                 type: boolean
 *               description:
 *                 type: string
 *               is_available:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Xona yangilandi
 *       404:
 *         description: Xona topilmadi
 */
router.put('/:id', protect, roleCheck(['admin']), updateRoom);

/**
 * @swagger
 * /api/rooms/{id}:
 *   delete:
 *     summary: Xonani o'chirish (Admin)
 *     tags: [Rooms]
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
 *         description: Xona o'chirildi
 *       404:
 *         description: Xona topilmadi
 */
router.delete('/:id', protect, roleCheck(['admin']), deleteRoom);

/**
 * @swagger
 * /api/rooms/{id}/check-availability:
 *   post:
 *     summary: Xonaning berilgan vaqtda bo'shligini tekshirish
 *     tags: [Rooms]
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
 *             required:
 *               - days
 *               - time
 *             properties:
 *               days:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Dushanba", "Chorshanba", "Juma"]
 *               time:
 *                 type: string
 *                 example: "14:00-16:00"
 *     responses:
 *       200:
 *         description: Mavjudlik ma'lumotlari
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 available:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 conflictGroup:
 *                   type: object
 *                   description: Agar xona band bo'lsa, to'qnashgan guruh ma'lumotlari
 */
router.post('/:id/check-availability', protect, checkAvailability);

module.exports = router;
