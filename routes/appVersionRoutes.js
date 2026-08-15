const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { protectSuperAdmin } = require('../middlewares/roleMiddleware');
const {
  checkVersion,
  listVersions,
  updateVersion,
} = require('../controllers/appVersionController');

const router = express.Router();

/**
 * @swagger
 * /api/app/version-check:
 *   get:
 *     summary: Mobil ilova versiyasini tekshirish
 *     description: Ilova ochilganda chaqiriladi (login shart emas) — joriy build_number platform bo'yicha eng so'nggi versiya bilan solishtiriladi
 *     tags: [App]
 *     parameters:
 *       - in: query
 *         name: platform
 *         required: true
 *         schema:
 *           type: string
 *           enum: [android, ios]
 *       - in: query
 *         name: build_number
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Versiya holati
 */
router.get('/version-check', checkVersion);

// Faqat super admin: versiya sozlamalarini boshqarish
router.get('/versions', protect, protectSuperAdmin, listVersions);
router.patch('/versions/:platform', protect, protectSuperAdmin, updateVersion);

module.exports = router;
