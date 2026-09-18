const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/homeworkController');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');

const teacherOrAdmin = roleCheck(['teacher', 'admin', 'super_admin']);
// English-manager statistikalarni kuzatuv sahifasida uy vazifasini ko'radi,
// lekin yoza/o'chira olmaydi — faqat GET ruxsat etiladi.
const managerViewer = roleCheck(['english-manager', 'admin', 'super_admin', 'teacher']);
const managerOrAdmin = roleCheck(['english-manager', 'admin', 'super_admin']);

// Studentning o'z uyga vazifalari — boshqa student/students routes kabi
// faqat token'dan aniqlanadi, alohida rol tekshiruvi shart emas.
router.get('/student/my-homework', protect, ctrl.getMyHomework);
router.get('/student/my-homework-months', protect, ctrl.getMyHomeworkMonths);

router.get('/manager/lessons-with-homework', protect, managerOrAdmin, ctrl.getManagerHomeworkList);

router.get('/groups/:groupId', protect, managerViewer, ctrl.getGroupHomeworkList);
router.post('/lessons/:lessonId', protect, teacherOrAdmin, ctrl.saveLessonHomework);
router.put('/lessons/:lessonId', protect, teacherOrAdmin, ctrl.saveLessonHomework);
router.get('/lessons/:lessonId', protect, managerViewer, ctrl.getLessonHomework);
router.delete('/lessons/:lessonId', protect, teacherOrAdmin, ctrl.deleteLessonHomework);

module.exports = router;
