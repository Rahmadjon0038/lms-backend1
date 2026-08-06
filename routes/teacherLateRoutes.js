const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherLateController');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');

// Tanlangan oy uchun barcha o'qituvchilar + kechikishlari
router.get('/months/:month_name/teachers', protect, roleCheck(['admin', 'super_admin', 'english-manager']), ctrl.getMonthLateByTeachers);

// Kechikish qo'shish / o'chirish
router.post('/', protect, roleCheck(['admin', 'super_admin', 'english-manager']), ctrl.createLateRecord);
router.delete('/:id', protect, roleCheck(['admin', 'super_admin', 'english-manager']), ctrl.deleteLateRecord);

module.exports = router;
