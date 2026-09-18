const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherStatisticsController');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');

const teacherOrAdmin = roleCheck(['teacher', 'admin', 'super_admin']);
const managerOrAdmin = roleCheck(['english-manager', 'admin', 'super_admin']);
const managerViewer = roleCheck(['english-manager', 'admin', 'super_admin', 'teacher']);

router.get('/column-catalog', protect, teacherOrAdmin, ctrl.getColumnCatalog);
router.get('/manager/teachers', protect, managerOrAdmin, ctrl.getEnglishManagerTeachers);
router.get('/manager/reports', protect, managerOrAdmin, ctrl.getManagerDailyStatistics);
router.get('/manager/months', protect, managerOrAdmin, ctrl.getEnglishManagerAvailableMonths);
router.get('/groups/:groupId/reports', protect, teacherOrAdmin, ctrl.getGroupStatisticsReports);
router.post('/lessons/:lessonId', protect, teacherOrAdmin, ctrl.saveLessonStatistics);
router.put('/lessons/:lessonId', protect, teacherOrAdmin, ctrl.saveLessonStatistics);
router.get('/lessons/:lessonId', protect, managerViewer, ctrl.getLessonStatistics);
router.delete('/lessons/:lessonId', protect, teacherOrAdmin, ctrl.deleteLessonStatistics);

// Mobil ilova statistikani saqlagach, jadval skrinshotini shu orqali
// Telegram guruhga forward qilish uchun yuboradi (ixtiyoriy, qo'shimcha oqim).
router.post(
  '/lessons/:lessonId/telegram-screenshot',
  protect,
  teacherOrAdmin,
  ctrl.uploadReportScreenshotMiddleware,
  ctrl.uploadReportScreenshot
);

module.exports = router;
