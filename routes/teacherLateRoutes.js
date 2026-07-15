const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherLateController');
const { protectAdmin } = require('../middlewares/authMiddleware');

// Tanlangan oy uchun barcha o'qituvchilar + kechikishlari
router.get('/months/:month_name/teachers', protectAdmin, ctrl.getMonthLateByTeachers);

// Kechikish qo'shish / o'chirish
router.post('/', protectAdmin, ctrl.createLateRecord);
router.delete('/:id', protectAdmin, ctrl.deleteLateRecord);

module.exports = router;
