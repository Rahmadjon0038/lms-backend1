const pool = require('../config/db');

const MAX_HOMEWORK = 10;
const MAX_VOCABULARY = 10;
const MAX_ATTENDANCE = 5;
const MAX_PARTICIPATION = 10;
const MAX_TOTAL = MAX_HOMEWORK + MAX_VOCABULARY + MAX_ATTENDANCE + MAX_PARTICIPATION;
const TEACHER_STATS_DEBUG = String(process.env.TEACHER_STATS_DEBUG || '').toLowerCase() === 'true';

const debugTeacherStats = (label, payload = {}) => {
  if (!TEACHER_STATS_DEBUG) return;
  console.log(`[teacher-stats] ${label}`, payload);
};

const asInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampScore = (value, max) => {
  const score = asInt(value, 0);
  if (score < 0) return 0;
  if (score > max) return max;
  return score;
};

const normalizeFeedback = (percent) => {
  if (percent >= 80) return 'PERFECT';
  if (percent >= 60) return 'GOOD';
  return 'BAD';
};

const formatMonthKey = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const raw = String(value).trim();
    return /^\d{4}-\d{2}$/.test(raw) ? raw : raw.slice(0, 7);
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
};

const canTeacherMutateToday = (lessonDate, now = new Date()) => {
  if (!lessonDate) return false;
  const lesson = new Date(lessonDate);
  if (Number.isNaN(lesson.getTime())) return false;
  const sameDay =
    lesson.getFullYear() === now.getFullYear() &&
    lesson.getMonth() === now.getMonth() &&
    lesson.getDate() === now.getDate();
  if (!sameDay) return false;
  const deadline = new Date(lesson);
  deadline.setHours(23, 59, 59, 999);
  return now.getTime() <= deadline.getTime();
};

const getLessonContext = async (lessonId, branchId) => {
  const result = await pool.query(
    `
      SELECT
        l.id AS lesson_id,
        l.group_id,
        l.teacher_id AS lesson_teacher_id,
        l.subject_id AS lesson_subject_id,
        l.branch_id,
        l.date AS lesson_date,
        l.start_time AS lesson_start_time,
        l.end_time AS lesson_end_time,
        g.name AS group_name,
        g.teacher_id AS group_teacher_id,
        g.subject_id AS group_subject_id,
        g.branch_id AS group_branch_id,
        COALESCE(ls.name, gs.name, '') AS subject_name,
        COALESCE(u.name, gu.name, '') AS teacher_name,
        COALESCE(u.surname, gu.surname, '') AS teacher_surname
      FROM lessons l
      JOIN groups g ON g.id = l.group_id AND g.branch_id = $2
      LEFT JOIN subjects ls ON ls.id = l.subject_id
      LEFT JOIN subjects gs ON gs.id = g.subject_id
      LEFT JOIN users u ON u.id = l.teacher_id
      LEFT JOIN users gu ON gu.id = g.teacher_id
      WHERE l.id = $1
      LIMIT 1
    `,
    [lessonId, branchId]
  );

  return result.rows[0] || null;
};

const buildReportPayload = (row) => ({
  id: row.id,
  lesson_id: row.lesson_id,
  lesson_label: row.lesson_label || row.report_data?.lesson_label || '',
  group_name: row.group_name || row.report_data?.group_name || '',
  teacher_name: row.teacher_name || row.report_data?.teacher_name || '',
  subject_name: row.subject_name || row.report_data?.subject_name || '',
  report_month: row.report_month || '',
  lesson_date: row.lesson_date || row.report_data?.lesson_date || '',
  lesson_start_time: row.lesson_start_time || '',
  lesson_end_time: row.lesson_end_time || '',
  created_at: row.created_at,
  updated_at: row.updated_at,
  rows: Array.isArray(row.report_data?.rows) ? row.report_data.rows : [],
});

const normalizeRows = (rows = []) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      student_id: asInt(row.student_id),
      student_name: String(row.student_name || '').trim(),
      homework: clampScore(row.homework, MAX_HOMEWORK),
      vocabulary: clampScore(row.vocabulary, MAX_VOCABULARY),
      attendance: clampScore(row.attendance, MAX_ATTENDANCE),
      participation: clampScore(row.participation, MAX_PARTICIPATION),
    }))
    .filter((row) => row.student_id > 0);
};

const buildRowsWithTotals = (rows) => {
  return rows.map((row) => {
    const total =
      row.homework + row.vocabulary + row.attendance + row.participation;
    const percent = Math.round((MAX_TOTAL === 0 ? 0 : (total / MAX_TOTAL) * 100));
    return {
      ...row,
      total,
      percent,
      feedback: normalizeFeedback(percent),
    };
  });
};

exports.saveLessonStatistics = async (req, res) => {
  try {
    const lessonId = asInt(req.params.lessonId);
    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'lessonId noto\'g\'ri' });
    }

    debugTeacherStats('save:start', {
      lessonId,
      userId: req.user?.id,
      role: req.user?.role,
      branchId: req.user?.branch_id,
    });

    const { rows = [], group_name, lesson_label } = req.body || {};
    const normalizedRows = buildRowsWithTotals(normalizeRows(rows));
    if (normalizedRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Kamida bitta o\'quvchi uchun statistika kiritilishi kerak',
      });
    }

    const lesson = await getLessonContext(lessonId, req.user.branch_id || 1);
    if (!lesson) {
      debugTeacherStats('save:lesson-not-found', {
        lessonId,
        branchId: req.user?.branch_id,
      });
      return res.status(404).json({ success: false, message: 'Dars topilmadi' });
    }

    const effectiveTeacherId = lesson.lesson_teacher_id || lesson.group_teacher_id;
    if (
      req.user.role === 'teacher' &&
      effectiveTeacherId &&
      effectiveTeacherId !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: 'Bu dars sizga biriktirilmagan',
      });
    }

    if (
      req.user.role === 'teacher' &&
      !canTeacherMutateToday(lesson.lesson_date)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Bu dars uchun statistika yopilgan',
      });
    }

    const reportMonth = formatMonthKey(lesson.lesson_date);
    const reportBranchId = lesson.group_branch_id || lesson.branch_id || req.user.branch_id || 1;
    const reportData = {
      lesson_id: lessonId,
      lesson_label:
        lesson_label ||
        `${lesson.lesson_date?.toISOString?.().slice(0, 10) || lesson.lesson_date} • ${lesson.group_name}`,
      group_name: group_name || lesson.group_name,
      teacher_name: [lesson.teacher_surname, lesson.teacher_name]
        .filter((part) => String(part || '').trim().length > 0)
        .join(' ')
        .trim(),
      subject_name: lesson.subject_name,
      rows: normalizedRows,
    };

    const totals = normalizedRows.reduce(
      (acc, row) => {
        acc.homework += row.homework;
        acc.vocabulary += row.vocabulary;
        acc.attendance += row.attendance;
        acc.participation += row.participation;
        acc.total += row.total;
        return acc;
      },
      { homework: 0, vocabulary: 0, attendance: 0, participation: 0, total: 0 }
    );
    const rowsCount = normalizedRows.length || 1;
    const averageTotal = Math.round(totals.total / rowsCount);
    const averagePercent = Math.round((averageTotal / MAX_TOTAL) * 100);

    const inserted = await pool.query(
      `
        INSERT INTO teacher_lesson_statistics_reports (
          lesson_id,
          group_id,
          teacher_id,
          subject_id,
          branch_id,
          report_month,
          lesson_date,
          lesson_start_time,
          lesson_end_time,
          homework,
          vocabulary,
          attendance,
          participation,
          total,
          percent,
          feedback,
          report_data,
          created_by,
          updated_by,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::time, $9::time, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, CURRENT_TIMESTAMP)
        ON CONFLICT (lesson_id)
        DO UPDATE SET
          group_id = EXCLUDED.group_id,
          teacher_id = EXCLUDED.teacher_id,
          subject_id = EXCLUDED.subject_id,
          branch_id = EXCLUDED.branch_id,
          report_month = EXCLUDED.report_month,
          lesson_date = EXCLUDED.lesson_date,
          lesson_start_time = EXCLUDED.lesson_start_time,
          lesson_end_time = EXCLUDED.lesson_end_time,
          homework = EXCLUDED.homework,
          vocabulary = EXCLUDED.vocabulary,
          attendance = EXCLUDED.attendance,
          participation = EXCLUDED.participation,
          total = EXCLUDED.total,
          percent = EXCLUDED.percent,
          feedback = EXCLUDED.feedback,
          report_data = EXCLUDED.report_data,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
      [
        lessonId,
        lesson.group_id,
        effectiveTeacherId || null,
        lesson.lesson_subject_id || lesson.group_subject_id || null,
        reportBranchId,
        reportMonth,
        lesson.lesson_date,
        lesson.lesson_start_time,
        lesson.lesson_end_time,
        Math.round(totals.homework / rowsCount),
        Math.round(totals.vocabulary / rowsCount),
        Math.round(totals.attendance / rowsCount),
        Math.round(totals.participation / rowsCount),
        averageTotal,
        averagePercent,
        normalizeFeedback(averagePercent),
        JSON.stringify(reportData),
        req.user.id,
        req.user.id,
      ]
    );

    debugTeacherStats('save:success', {
      lessonId,
      reportId: inserted.rows[0]?.id,
      branchId: inserted.rows[0]?.branch_id,
      groupId: inserted.rows[0]?.group_id,
      teacherId: inserted.rows[0]?.teacher_id,
      reportMonth,
    });

    return res.json({
      success: true,
      message: 'Statistika saqlandi',
      data: buildReportPayload(inserted.rows[0]),
    });
  } catch (error) {
    console.error('Statistika saqlashda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Statistika saqlanmadi',
      error: error.message,
    });
  }
};

exports.getLessonStatistics = async (req, res) => {
  try {
    const lessonId = asInt(req.params.lessonId);
    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'lessonId noto\'g\'ri' });
    }

    const report = await pool.query(
      `
        SELECT
          r.*,
          l.date AS lesson_date,
          l.start_time AS lesson_start_time,
          l.end_time AS lesson_end_time,
          g.name AS group_name,
          COALESCE(u.surname, '') AS teacher_surname,
          COALESCE(u.name, '') AS teacher_name,
          COALESCE(s.name, '') AS subject_name
        FROM teacher_lesson_statistics_reports r
        JOIN lessons l ON l.id = r.lesson_id
        JOIN groups g ON g.id = r.group_id
        LEFT JOIN users u ON u.id = r.teacher_id
        LEFT JOIN subjects s ON s.id = r.subject_id
        WHERE r.lesson_id = $1
          AND g.branch_id = $2
        LIMIT 1
      `,
      [lessonId, req.user.branch_id || 1]
    );

    if (report.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Statistika topilmadi' });
    }

    return res.json({ success: true, data: buildReportPayload(report.rows[0]) });
  } catch (error) {
    console.error('Statistika o\'qishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Statistika o\'qilmadi',
      error: error.message,
    });
  }
};

exports.deleteLessonStatistics = async (req, res) => {
  try {
    const lessonId = asInt(req.params.lessonId);
    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'lessonId noto\'g\'ri' });
    }

    const context = await getLessonContext(lessonId, req.user.branch_id || 1);
    if (!context) {
      return res.status(404).json({ success: false, message: 'Dars topilmadi' });
    }

    const existing = await pool.query(
      `
        SELECT r.id, r.lesson_date
        FROM teacher_lesson_statistics_reports r
        JOIN groups g ON g.id = r.group_id
        WHERE r.lesson_id = $1
          AND g.branch_id = $2
        LIMIT 1
      `,
      [lessonId, req.user.branch_id || 1]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Statistika topilmadi' });
    }

    const effectiveTeacherId = context.lesson_teacher_id || context.group_teacher_id;
    if (
      req.user.role === 'teacher' &&
      effectiveTeacherId &&
      effectiveTeacherId !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: 'Bu dars sizga biriktirilmagan',
      });
    }

    if (
      req.user.role === 'teacher' &&
      !canTeacherMutateToday(existing.rows[0].lesson_date)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Bu statistika endi o\'chirilmaydi',
      });
    }

    await pool.query(
      `
        DELETE FROM teacher_lesson_statistics_reports
        WHERE lesson_id = $1
          AND EXISTS (
            SELECT 1
            FROM groups g
            WHERE g.id = teacher_lesson_statistics_reports.group_id
              AND g.branch_id = $2
          )
      `,
      [lessonId, req.user.branch_id || 1]
    );

    return res.json({ success: true, message: 'Statistika o\'chirildi' });
  } catch (error) {
    console.error('Statistika o\'chirishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Statistika o\'chirilmadi',
      error: error.message,
    });
  }
};

exports.getGroupStatisticsReports = async (req, res) => {
  try {
    const groupId = asInt(req.params.groupId);
    const month = String(req.query.month || '').trim();
    if (!groupId) {
      return res.status(400).json({ success: false, message: 'groupId noto\'g\'ri' });
    }

    const monthFilter = /^\d{4}-\d{2}$/.test(month)
      ? month
      : new Date().toISOString().slice(0, 7);

    const result = await pool.query(
      `
        SELECT
          r.*,
          l.date AS lesson_date,
          l.start_time AS lesson_start_time,
          l.end_time AS lesson_end_time,
          g.name AS group_name,
          COALESCE(u.surname, '') AS teacher_surname,
          COALESCE(u.name, '') AS teacher_name,
          COALESCE(s.name, '') AS subject_name
        FROM teacher_lesson_statistics_reports r
        JOIN lessons l ON l.id = r.lesson_id
        JOIN groups g ON g.id = r.group_id
        LEFT JOIN users u ON u.id = r.teacher_id
        LEFT JOIN subjects s ON s.id = r.subject_id
        WHERE r.group_id = $1
          AND COALESCE(NULLIF(r.report_month, ''), TO_CHAR(r.lesson_date::date, 'YYYY-MM')) = $2
          AND g.branch_id = $3
        ORDER BY r.lesson_date ASC, r.lesson_start_time ASC
      `,
      [groupId, monthFilter, req.user.branch_id || 1]
    );

    return res.json({
      success: true,
      data: result.rows.map(buildReportPayload),
    });
  } catch (error) {
    console.error('Guruh statistikalarini olishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Statistikalar yuklanmadi',
      error: error.message,
    });
  }
};

exports.getManagerDailyStatistics = async (req, res) => {
  try {
    const month = String(req.query.month || '').trim();
    const teacherId = req.query.teacher_id ? asInt(req.query.teacher_id) : null;
    const groupId = req.query.group_id ? asInt(req.query.group_id) : null;

    const monthFilter = /^\d{4}-\d{2}$/.test(month)
      ? month
      : new Date().toISOString().slice(0, 7);

    const params = [req.user.branch_id || 1, monthFilter];
    let where = `
      WHERE g.branch_id = $1
        AND COALESCE(NULLIF(r.report_month, ''), TO_CHAR(r.lesson_date::date, 'YYYY-MM')) = $2
        AND (
          LOWER(COALESCE(s.name, gs.name, '')) LIKE '%english%'
          OR LOWER(COALESCE(s.name, gs.name, '')) LIKE '%ingliz%'
        )
    `;

    debugTeacherStats('manager:reports:start', {
      branchId: req.user?.branch_id,
      month: monthFilter,
      teacherId,
      groupId,
      role: req.user?.role,
    });

    if (teacherId) {
      params.push(teacherId);
      where += ` AND r.teacher_id = $${params.length}`;
    }

    if (groupId) {
      params.push(groupId);
      where += ` AND r.group_id = $${params.length}`;
    }

    const result = await pool.query(
      `
        SELECT
          r.id,
          r.lesson_id,
          r.group_id,
          r.teacher_id,
          r.report_month,
          r.lesson_date,
          r.lesson_start_time,
          r.lesson_end_time,
          r.total,
          r.percent,
          r.feedback,
          r.created_at,
          r.updated_at,
          g.name AS group_name,
          COALESCE(u.surname, '') AS teacher_surname,
          COALESCE(u.name, '') AS teacher_name,
          COALESCE(s.name, gs.name, '') AS subject_name
        FROM teacher_lesson_statistics_reports r
        JOIN groups g ON g.id = r.group_id
        LEFT JOIN users u ON u.id = r.teacher_id
        LEFT JOIN subjects s ON s.id = r.subject_id
        LEFT JOIN subjects gs ON gs.id = g.subject_id
        ${where}
        ORDER BY r.lesson_date DESC, r.lesson_start_time DESC, r.id DESC
      `,
      params
    );

    debugTeacherStats('manager:reports:success', {
      branchId: req.user?.branch_id,
      month: monthFilter,
      count: result.rows.length,
    });

    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        lesson_id: row.lesson_id,
        lesson_date: row.lesson_date,
        lesson_time: `${row.lesson_start_time || ''}${row.lesson_end_time ? `-${row.lesson_end_time}` : ''}`.trim(),
        group_id: row.group_id,
        group_name: row.group_name,
        teacher_id: row.teacher_id,
        teacher_name: [row.teacher_surname, row.teacher_name]
          .filter((part) => String(part || '').trim().length > 0)
          .join(' ')
          .trim(),
        subject_name: row.subject_name,
        report_month: row.report_month,
        total: row.total,
        percent: row.percent,
        feedback: row.feedback,
        status: 'sent',
        can_view: true,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    });
  } catch (error) {
    console.error('Manager statistikalarini olishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Statistikalar yuklanmadi',
      error: error.message,
    });
  }
};

exports.getEnglishManagerTeachers = async (req, res) => {
  try {
    const month = String(req.query.month || '').trim();
    const monthFilter = /^\d{4}-\d{2}$/.test(month)
      ? month
      : new Date().toISOString().slice(0, 7);

    debugTeacherStats('manager:teachers:start', {
      branchId: req.user?.branch_id,
      month: monthFilter,
      role: req.user?.role,
    });

    const result = await pool.query(
      `
        SELECT
          u.id AS teacher_id,
          u.name,
          u.surname,
          COALESCE(COUNT(DISTINCT g.id), 0) AS groups_count,
          COALESCE(COUNT(DISTINCT r.id), 0) AS reports_count,
          MAX(r.created_at) AS last_report_at
        FROM users u
        JOIN teacher_subjects ts ON ts.teacher_id = u.id AND ts.branch_id = u.branch_id
        JOIN subjects s ON s.id = ts.subject_id AND s.branch_id = ts.branch_id
        LEFT JOIN groups g
          ON g.teacher_id = u.id
          AND g.subject_id = ts.subject_id
          AND g.branch_id = u.branch_id
        LEFT JOIN teacher_lesson_statistics_reports r
          ON r.teacher_id = u.id
          AND COALESCE(NULLIF(r.report_month, ''), TO_CHAR(r.lesson_date::date, 'YYYY-MM')) = $2
          AND (
            LOWER(COALESCE(s.name, '')) LIKE '%english%'
            OR LOWER(COALESCE(s.name, '')) LIKE '%ingliz%'
          )
        WHERE u.role = 'teacher'
          AND u.branch_id = $1
          AND (
            LOWER(COALESCE(s.name, '')) LIKE '%english%'
            OR LOWER(COALESCE(s.name, '')) LIKE '%ingliz%'
          )
        GROUP BY u.id, u.name, u.surname
        ORDER BY u.surname ASC, u.name ASC
      `,
      [req.user.branch_id || 1, monthFilter]
    );

    debugTeacherStats('manager:teachers:success', {
      branchId: req.user?.branch_id,
      month: monthFilter,
      count: result.rows.length,
    });

    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        teacher_id: row.teacher_id,
        teacher_name: [row.surname, row.name]
          .filter((part) => String(part || '').trim().length > 0)
          .join(' ')
          .trim(),
        groups_count: Number(row.groups_count || 0),
        reports_count: Number(row.reports_count || 0),
        last_report_at: row.last_report_at,
      })),
    });
  } catch (error) {
    console.error('English teacherlar ro\'yxatini olishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Teacherlar yuklanmadi',
      error: error.message,
    });
  }
};
