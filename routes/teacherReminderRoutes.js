const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherReminderController');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');

// Har kuni 19:00 (Asia/Tashkent) da avtomatik ishlaydigan hisobot/uyga vazifa
// eslatmasini qo'lda (test yoki zarurat tug'ilganda) ishga tushirish.
router.post('/run', protect, roleCheck(['admin', 'super_admin']), ctrl.triggerDailyReminders);

module.exports = router;
