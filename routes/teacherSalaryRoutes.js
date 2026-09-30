const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/teacherSalaryController');
const { protect, protectAdmin } = require('../middlewares/authMiddleware');

// Teacher salary foizi
router.put('/settings/:teacher_id', protectAdmin, ctrl.upsertTeacherSalarySettings);
router.get('/settings/:teacher_id', protect, ctrl.getTeacherSalarySettings);

// Guruh darajasidagi oylik foizi
router.put('/group-settings/:teacher_id/:group_id', protectAdmin, ctrl.upsertTeacherGroupSalarySettings);

// Guruh boshqa teacherga o'tkazilganda, dars sonini qo'lda to'g'rilash
router.put('/group-lessons/:teacher_id/:group_id', protectAdmin, ctrl.upsertTeacherGroupMonthLessons);

// Avans
router.post('/advances', protectAdmin, ctrl.createTeacherAdvance);
router.get('/advances', protect, ctrl.getTeacherAdvances);

// Berildi (yangi nom)
router.post('/given', protectAdmin, ctrl.createTeacherSalaryGiven);
router.get('/given', protect, ctrl.getTeacherSalaryGivenList);

// Legacy alias (eski frontendlar uchun)
router.post('/payouts', protectAdmin, ctrl.createTeacherSalaryPayout);
router.get('/payouts', protect, ctrl.getTeacherSalaryPayouts);

// Summary va close
router.get('/months/:month_name/teachers/:teacher_id', protect, ctrl.getTeacherMonthSummary);
router.post('/months/:month_name/teachers/:teacher_id/close', protectAdmin, ctrl.closeTeacherMonth);
router.post('/months/:month_name/teachers/:teacher_id/reset-payouts', protectAdmin, ctrl.resetTeacherMonthPayouts);
router.post('/months/:month_name/teachers/:teacher_id/reset-advances', protectAdmin, ctrl.resetTeacherMonthAdvances);
router.get('/months/:month_name/teachers', protectAdmin, ctrl.getAllTeachersMonthSummary);
router.get('/months/:month_name/simple-list', protectAdmin, ctrl.getSimpleTeacherSalaryList);

module.exports = router;
