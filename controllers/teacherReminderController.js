const { runDailyTeacherReminders } = require('../services/teacherReminderService');

// Har kuni soat 19:00 (Asia/Tashkent) da avtomatik ishga tushadigan
// eslatmani qo'lda ham (test/ops maqsadida) ishga tushirish uchun.
exports.triggerDailyReminders = async (req, res) => {
  try {
    const result = await runDailyTeacherReminders();
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Teacher reminder ishga tushirishda xatolik:', error);
    return res.status(500).json({ success: false, message: 'Eslatma yuborilmadi', error: error.message });
  }
};
