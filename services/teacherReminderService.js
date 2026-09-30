const pool = require('../config/db');
const { notifyUser } = require('../controllers/notificationController');

// Kun bo'yicha (bugungi kun uchun) tugagan, lekin ustoz statistika hisoboti
// VA/YOKI uyga vazifa yubormagan darslarni topadi. Har bir ustoz uchun
// shunday guruhlar bo'lsa — bitta push bildirishnoma yuboriladi (guruhlar
// ro'yxati bitta xabarda), aks holda hech narsa yuborilmaydi.
const findIncompleteLessonsByTeacher = async () => {
  const result = await pool.query(`
    SELECT
      COALESCE(l.teacher_id, g.teacher_id) AS teacher_id,
      l.branch_id,
      g.name AS group_name,
      BOOL_OR(NOT EXISTS (
        SELECT 1 FROM teacher_lesson_statistics_reports r WHERE r.lesson_id = l.id
      )) AS missing_report,
      BOOL_OR(NOT EXISTS (
        SELECT 1 FROM lesson_homework_assignments h WHERE h.lesson_id = l.id
      )) AS missing_homework
    FROM lessons l
    JOIN groups g ON g.id = l.group_id
    WHERE l.date = CURRENT_DATE
      AND COALESCE(l.is_holiday, false) = false
      AND l.end_time IS NOT NULL
      AND l.end_time <= CURRENT_TIME
      AND COALESCE(l.teacher_id, g.teacher_id) IS NOT NULL
    GROUP BY COALESCE(l.teacher_id, g.teacher_id), l.branch_id, g.name
    HAVING BOOL_OR(NOT EXISTS (
        SELECT 1 FROM teacher_lesson_statistics_reports r WHERE r.lesson_id = l.id
      )) OR BOOL_OR(NOT EXISTS (
        SELECT 1 FROM lesson_homework_assignments h WHERE h.lesson_id = l.id
      ))
    ORDER BY g.name
  `);

  const byTeacher = new Map();
  for (const row of result.rows) {
    const teacherId = row.teacher_id;
    if (!byTeacher.has(teacherId)) {
      byTeacher.set(teacherId, { branchId: row.branch_id, groups: [] });
    }
    byTeacher.get(teacherId).groups.push({
      name: row.group_name,
      missingReport: row.missing_report,
      missingHomework: row.missing_homework,
    });
  }

  return byTeacher;
};

// Har bir guruh uchun aynan NIMA yuborilmaganini ko'rsatadi — hisobot
// yuborilib, faqat uyga vazifa yuborilmagan bo'lsa, xabarda ham faqat
// shu aytilishi kerak (aks holda o'qituvchi ikkalasi ham so'ralyapti deb
// chalkashib qoladi).
const describeMissingGroups = (groups) => {
  return groups
    .map(({ name, missingReport, missingHomework }) => {
      if (missingReport && missingHomework) {
        return `${name} (hisobot va uyga vazifa)`;
      }
      if (missingReport) {
        return `${name} (hisobot)`;
      }
      return `${name} (uyga vazifa)`;
    })
    .join(', ');
};

// Bugungi kun uchun bitta marta yuborilishini kafolatlash uchun (agar
// vazifa bir necha marta ishga tushirilsa ham) — dedupe_key sifatida
// ishlatiladi.
const getTodayDateKey = async () => {
  const result = await pool.query('SELECT CURRENT_DATE::text AS today');
  return result.rows[0]?.today || new Date().toISOString().slice(0, 10);
};

const runDailyTeacherReminders = async () => {
  const [byTeacher, todayKey] = await Promise.all([
    findIncompleteLessonsByTeacher(),
    getTodayDateKey(),
  ]);

  let notifiedCount = 0;
  const errors = [];

  for (const [teacherId, info] of byTeacher.entries()) {
    if (info.groups.length === 0) continue;

    const groupList = describeMissingGroups(info.groups);
    const title = 'Hisobot va uyga vazifa yuborilmagan';
    const body = `${groupList} guruhlariga yuborilmagan. Iltimos, yuboring.`;

    try {
      await notifyUser({
        userId: teacherId,
        type: 'teacher_reminder',
        title,
        body,
        pushTitle: title,
        pushBody: body,
        branchId: info.branchId,
        data: {
          route: '/notification-detail',
          type: 'teacher_reminder',
          title,
          body,
          group_names: groupList,
          dedupe_key: `teacher-daily-reminder-${todayKey}`,
        },
      });
      notifiedCount += 1;
    } catch (error) {
      console.warn(`⚠️ Teacher reminder yuborilmadi (teacher_id=${teacherId}): ${error.message}`);
      errors.push({ teacherId, message: error.message });
    }
  }

  console.log(`📋 Teacher daily reminder: ${notifiedCount} ta ustozga bildirishnoma yuborildi (${todayKey}).`);

  return {
    date: todayKey,
    teachersChecked: byTeacher.size,
    notifiedCount,
    errors,
  };
};

module.exports = { runDailyTeacherReminders };
