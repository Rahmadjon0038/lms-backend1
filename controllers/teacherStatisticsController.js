const pool = require('../config/db');
const { notifyUser } = require('./notificationController');
const { getEnglishTeacherClause } = require('../utils/englishTeachers');

const MAX_HOMEWORK = 10;
const MAX_VOCABULARY = 10;
const MAX_ATTENDANCE = 5;
const MAX_PARTICIPATION = 10;
const MAX_TOTAL = MAX_HOMEWORK + MAX_VOCABULARY + MAX_ATTENDANCE + MAX_PARTICIPATION;

// Fixed catalog of report column types teachers can pick from. Every student/parent
// facing surface must show `label_uz` regardless of what the teacher selected/typed,
// so the report stays understandable no matter which subject/teacher it came from.
// Adding a new type only requires appending an entry here — no DB migration needed.
const COLUMN_CATALOG = [
  { key: 'homework', label_uz: 'Uy vazifasi', label_en: 'Homework', label_ru: 'Домашнее задание', default_max_value: MAX_HOMEWORK, locked: false },
  { key: 'vocabulary', label_uz: 'So\'z boyligi', label_en: 'Vocabulary', label_ru: 'Словарный запас', default_max_value: MAX_VOCABULARY, locked: false },
  { key: 'attendance', label_uz: 'Davomat', label_en: 'Attendance', label_ru: 'Посещаемость', default_max_value: MAX_ATTENDANCE, locked: true },
  { key: 'participation', label_uz: 'Faollik', label_en: 'Participation', label_ru: 'Активность', default_max_value: MAX_PARTICIPATION, locked: false },
  { key: 'word_memorization', label_uz: 'So\'z yodlash', label_en: 'Vocabulary memorization', label_ru: 'Заучивание слов', default_max_value: 10, locked: false },
  { key: 'sentence_building', label_uz: 'Gap tuzish', label_en: 'Sentence building', label_ru: 'Составление предложений', default_max_value: 10, locked: false },
  { key: 'listening', label_uz: 'Tinglab tushunish', label_en: 'Listening', label_ru: 'Аудирование', default_max_value: 10, locked: false },
  { key: 'speaking', label_uz: 'Nutq', label_en: 'Speaking', label_ru: 'Устная речь', default_max_value: 10, locked: false },
  { key: 'reading', label_uz: 'O\'qish', label_en: 'Reading', label_ru: 'Чтение', default_max_value: 10, locked: false },
  { key: 'writing', label_uz: 'Yozish', label_en: 'Writing', label_ru: 'Письмо', default_max_value: 10, locked: false },
  { key: 'spelling', label_uz: 'Imlo', label_en: 'Spelling', label_ru: 'Орфография', default_max_value: 10, locked: false },
  { key: 'test', label_uz: 'Test natijasi', label_en: 'Test', label_ru: 'Тест', default_max_value: 10, locked: false },
];
const COLUMN_CATALOG_BY_KEY = new Map(COLUMN_CATALOG.map((entry) => [entry.key, entry]));

const DEFAULT_REPORT_COLUMN_KEYS = ['homework', 'vocabulary', 'attendance', 'participation'];
const DEFAULT_REPORT_COLUMNS = DEFAULT_REPORT_COLUMN_KEYS.map((key) => {
  const entry = COLUMN_CATALOG_BY_KEY.get(key);
  return { key: entry.key, label: entry.label_uz, max_value: entry.default_max_value };
});
const DEFAULT_COLUMN_BY_KEY = new Map(
  DEFAULT_REPORT_COLUMNS.map((column) => [column.key, column])
);
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

const titleCaseFromKey = (value) =>
  String(value || '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const normalizeColumnKey = (value, fallbackPrefix = 'column') => {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return raw || `${fallbackPrefix}_${Date.now()}`;
};

const cloneDefaultColumns = () =>
  DEFAULT_REPORT_COLUMNS.map((column, index) => ({
    key: column.key,
    label: column.label,
    max_value: column.max_value,
    enabled: true,
    order: index,
  }));

const normalizeColumns = (columns) => {
  const source = Array.isArray(columns) && columns.length > 0 ? columns : cloneDefaultColumns();
  const usedKeys = new Set();

  const normalized = source.map((item, index) => {
    const baseKey = normalizeColumnKey(
      item?.key || item?.field || item?.name || item?.label || `column_${index + 1}`,
      'column'
    );
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${baseKey}_${suffix}`;
      suffix += 1;
    }
    usedKeys.add(key);

    const catalogEntry = COLUMN_CATALOG_BY_KEY.get(baseKey);
    const defaultColumn = DEFAULT_COLUMN_BY_KEY.get(baseKey);
    // Catalog keys always render in Uzbek, no matter what label the client sent —
    // this is what guarantees parents/students understand the report regardless
    // of the subject/language the teacher picked the column in.
    const label = catalogEntry
      ? catalogEntry.label_uz
      : String(item?.label || item?.title || item?.name || '').trim() ||
        defaultColumn?.label ||
        titleCaseFromKey(key);
    const maxValue = clampScore(
      item?.max_value ?? item?.maxValue ?? item?.max ?? defaultColumn?.max_value ?? catalogEntry?.default_max_value ?? 10,
      1000
    );

    return {
      key,
      label,
      max_value: maxValue,
      enabled: item?.enabled !== false,
      order: asInt(item?.order, index),
    };
  });

  normalized.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return String(a.key).localeCompare(String(b.key));
  });

  return normalized.map((column, index) => ({ ...column, order: index }));
};

const defaultRowValueForKey = (row, key) => {
  const defaultColumn = DEFAULT_COLUMN_BY_KEY.get(key);
  if (!defaultColumn) return undefined;
  return row?.[key];
};

const normalizeReportRow = (row, columns = []) => {
  const source = row && typeof row === 'object' ? row : {};
  const valuesSource =
    source.values && typeof source.values === 'object' && !Array.isArray(source.values)
      ? source.values
      : {};

  const normalizedColumns = Array.isArray(columns) && columns.length > 0 ? columns : cloneDefaultColumns();
  const values = {};

  normalizedColumns.forEach((column) => {
    const rawValue =
      valuesSource[column.key] ??
      source[column.key] ??
      defaultRowValueForKey(source, column.key);
    values[column.key] = clampScore(rawValue, column.max_value);
  });

  return {
    student_id: asInt(source.student_id),
    student_name: String(source.student_name || '').trim(),
    values,
  };
};

const normalizeFeedback = (percent) => {
  if (percent >= 80) return 'PERFECT';
  if (percent >= 60) return 'GOOD';
  return 'BAD';
};

const isEnglishSubjectName = (value) => {
  const text = String(value || '').trim().toLowerCase();
  return text.includes('english') || text.includes('ingliz');
};

const formatStoredDateTime = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
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

const buildMonthRange = (startMonth, endMonth) => {
  if (!/^\d{4}-\d{2}$/.test(String(startMonth || ''))) return [];
  if (!/^\d{4}-\d{2}$/.test(String(endMonth || ''))) return [];

  const [startYear, startMon] = String(startMonth).split('-').map(Number);
  const [endYear, endMon] = String(endMonth).split('-').map(Number);
  const cursor = new Date(Date.UTC(startYear, startMon - 1, 1));
  const end = new Date(Date.UTC(endYear, endMon - 1, 1));
  const months = [];

  while (cursor.getTime() <= end.getTime()) {
    months.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
};

const canTeacherMutateLesson = (lessonDate, now = new Date()) => {
  if (!lessonDate) return false;
  const lesson = new Date(lessonDate);
  if (Number.isNaN(lesson.getTime())) return false;
  const deadline = new Date(now);
  deadline.setHours(23, 59, 59, 999);
  return lesson.getTime() <= deadline.getTime();
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
        g.schedule AS group_schedule,
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

const normalizeRows = (rows = [], columns = []) => {
  if (!Array.isArray(rows)) return [];
  const normalizedColumns = normalizeColumns(columns);
  return rows
    .map((row) => normalizeReportRow(row, normalizedColumns))
    .filter((row) => row.student_id > 0);
};

const buildRowsWithTotals = (rows = [], columns = []) => {
  const normalizedColumns = normalizeColumns(columns);
  const enabledColumns = normalizedColumns.filter((column) => column.enabled !== false);
  const maxTotal = enabledColumns.reduce((sum, column) => sum + column.max_value, 0);

  return rows.map((item) => {
    const total = enabledColumns.reduce(
      (sum, column) => sum + clampScore(item.values[column.key], column.max_value),
      0
    );
    const percent = Math.round(maxTotal === 0 ? 0 : (total / maxTotal) * 100);
    const rowPayload = {
      student_id: item.student_id,
      student_name: item.student_name,
      values: item.values,
      total,
      percent,
      feedback: normalizeFeedback(percent),
    };

    normalizedColumns.forEach((column) => {
      rowPayload[column.key] = clampScore(item.values[column.key], column.max_value);
    });

    return rowPayload;
  });
};

const buildReportPayload = (row) => {
  let reportData = {};
  if (row.report_data && typeof row.report_data === 'object' && !Array.isArray(row.report_data)) {
    reportData = row.report_data;
  } else if (typeof row.report_data === 'string' && row.report_data.trim().length > 0) {
    try {
      const parsed = JSON.parse(row.report_data);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        reportData = parsed;
      }
    } catch {
      reportData = {};
    }
  }
  const columns = normalizeColumns(reportData.columns || row.columns || []);
  const rows = normalizeRows(reportData.rows || [], columns);
  const rowsWithTotals = buildRowsWithTotals(rows, columns);

  return {
    id: row.id,
    lesson_id: row.lesson_id,
    total: asInt(row.total ?? reportData.total ?? 0),
    percent: asInt(row.percent ?? reportData.percent ?? 0),
    feedback: String(
      row.feedback || reportData.feedback || normalizeFeedback(asInt(row.percent ?? reportData.percent ?? 0))
    ).toUpperCase(),
    lesson_label: row.lesson_label || reportData.lesson_label || '',
    group_name: row.group_name || reportData.group_name || '',
    teacher_name: row.teacher_name || reportData.teacher_name || '',
    subject_name: row.subject_name || reportData.subject_name || '',
    report_month: row.report_month || '',
    lesson_date: row.lesson_date || reportData.lesson_date || '',
    lesson_start_time: row.lesson_start_time || reportData.lesson_start_time || '',
    lesson_end_time: row.lesson_end_time || reportData.lesson_end_time || '',
    lesson_time:
      row.lesson_time ||
      reportData.lesson_time ||
      `${row.lesson_start_time || reportData.lesson_start_time || ''}${
        row.lesson_end_time || reportData.lesson_end_time
          ? `-${row.lesson_end_time || reportData.lesson_end_time}`
          : ''
      }`.trim(),
    group_schedule: row.group_schedule || reportData.group_schedule || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_at_label: row.created_at_label || formatStoredDateTime(row.created_at),
    updated_at_label: row.updated_at_label || formatStoredDateTime(row.updated_at),
    report_data: reportData,
    columns,
    rows: rowsWithTotals,
  };
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

    const { rows = [], columns = [], group_name, lesson_label } = req.body || {};
    const normalizedColumns = normalizeColumns(columns);
    const normalizedRows = buildRowsWithTotals(normalizeRows(rows, normalizedColumns), normalizedColumns);
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
      !canTeacherMutateLesson(lesson.lesson_date)
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
      lesson_date: lesson.lesson_date?.toISOString?.().slice(0, 10) || lesson.lesson_date || '',
      lesson_start_time: lesson.lesson_start_time || '',
      lesson_end_time: lesson.lesson_end_time || '',
      group_schedule: lesson.group_schedule || null,
      columns: normalizedColumns,
      rows: normalizedRows,
    };

    const enabledColumns = normalizedColumns.filter((column) => column.enabled !== false);
    const maxTotal = enabledColumns.reduce((sum, column) => sum + column.max_value, 0);
    const totals = normalizedRows.reduce(
      (acc, row) => {
        acc.total += row.total;
        return acc;
      },
      { total: 0 }
    );
    const rowsCount = normalizedRows.length || 1;
    const averageTotal = Math.round(totals.total / rowsCount);
    const averagePercent = Math.round(maxTotal === 0 ? 0 : (averageTotal / maxTotal) * 100);
    const reportFieldValue = (key) =>
      Math.round(
        normalizedRows.reduce((sum, row) => sum + clampScore(row.values?.[key], 1000), 0) /
          rowsCount
      );

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
        reportFieldValue('homework'),
        reportFieldValue('vocabulary'),
        reportFieldValue('attendance'),
        reportFieldValue('participation'),
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

    // Har bir o'quvchiga hisobot kelgani haqida push bildirishnoma —
    // fanidan qat'iy nazar (English yoki boshqa fan), teacher hisobot
    // yuborsa student/ota-ona tarafga xabar boradi.
    const lessonDateLabel = lesson.lesson_date?.toISOString?.().slice(0, 10) || lesson.lesson_date || '';
    for (const row of normalizedRows) {
      if (!row.student_id) continue;
      try {
        await notifyUser({
          userId: row.student_id,
          type: 'report',
          title: 'Dars hisoboti',
          body: `${lesson.group_name}: ${row.total} ball (${row.percent}%)`,
          pushTitle: 'Yangi dars hisoboti',
          pushBody: `${lesson.group_name}: ${row.total} ball (${row.percent}%)`,
          data: {
            route: '/notification-detail',
            type: 'report',
            lesson_id: String(lessonId),
            lesson_date: lessonDateLabel,
            report_month: reportMonth,
            group_id: String(lesson.group_id),
            group_name: lesson.group_name || '',
            subject_name: lesson.subject_name || '',
            teacher_name: reportData.teacher_name || '',
            total: String(row.total),
            percent: String(row.percent),
            feedback: row.feedback || '',
          },
          createdBy: req.user.id,
        });
      } catch (notificationError) {
        console.warn(`⚠️ Report notification yuborilmadi (student_id=${row.student_id}): ${notificationError.message}`);
      }
    }

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

    const englishClause =
      req.user.role === 'english-manager'
        ? `
          AND LOWER(COALESCE(s.name, '')) LIKE '%english%'
          AND LOWER(COALESCE(gs.name, '')) LIKE '%english%'
        `
        : '';

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
          COALESCE(s.name, '') AS subject_name,
          COALESCE(gs.name, '') AS group_subject_name
        FROM teacher_lesson_statistics_reports r
        JOIN lessons l ON l.id = r.lesson_id
        JOIN groups g ON g.id = r.group_id
        LEFT JOIN subjects gs ON gs.id = g.subject_id
        LEFT JOIN users u ON u.id = r.teacher_id
        LEFT JOIN subjects s ON s.id = r.subject_id
        WHERE r.lesson_id = $1
          AND g.branch_id = $2
          ${englishClause}
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
      !canTeacherMutateLesson(existing.rows[0].lesson_date)
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
          LOWER(COALESCE(s.name, '')) LIKE '%english%'
          OR LOWER(COALESCE(s.name, '')) LIKE '%ingliz%'
        )
        AND (
          LOWER(COALESCE(gs.name, '')) LIKE '%english%'
          OR LOWER(COALESCE(gs.name, '')) LIKE '%ingliz%'
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
          r.report_data,
          r.created_at,
          r.updated_at,
          TO_CHAR(r.created_at, 'DD.MM.YYYY HH24:MI') AS created_at_label,
          TO_CHAR(r.updated_at, 'DD.MM.YYYY HH24:MI') AS updated_at_label,
          g.name AS group_name,
          g.schedule AS group_schedule,
          COALESCE(u.surname, '') AS teacher_surname,
          COALESCE(u.name, '') AS teacher_name,
          COALESCE(s.name, '') AS subject_name,
          COALESCE(gs.name, '') AS group_subject_name
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
      data: result.rows.map((row) => {
        const payload = buildReportPayload({
          ...row,
          lesson_time: `${row.lesson_start_time || ''}${row.lesson_end_time ? `-${row.lesson_end_time}` : ''}`.trim(),
        });

        return {
          ...payload,
          group_id: row.group_id,
          teacher_id: row.teacher_id,
          status: 'sent',
          can_view: true,
          lesson_time: payload.lesson_time || `${row.lesson_start_time || ''}${row.lesson_end_time ? `-${row.lesson_end_time}` : ''}`.trim(),
          group_schedule: row.group_schedule || payload.group_schedule,
          teacher_name: [row.teacher_surname, row.teacher_name]
            .filter((part) => String(part || '').trim().length > 0)
            .join(' ')
            .trim(),
          subject_name: row.group_subject_name || row.subject_name || payload.subject_name,
          created_at_label: row.created_at_label || formatStoredDateTime(row.created_at),
          updated_at_label: row.updated_at_label || formatStoredDateTime(row.updated_at),
        };
      }),
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
          u.phone,
          COALESCE((
            SELECT COUNT(DISTINCT g.id)
            FROM groups g
            JOIN subjects gs ON gs.id = g.subject_id
            WHERE g.teacher_id = u.id
              AND g.branch_id = u.branch_id
              AND (
                LOWER(COALESCE(gs.name, '')) LIKE '%english%'
                OR LOWER(COALESCE(gs.name, '')) LIKE '%ingliz%'
              )
          ), 0) AS groups_count,
          COALESCE((
            SELECT COUNT(DISTINCT sg.student_id)
            FROM student_groups sg
            JOIN groups g ON g.id = sg.group_id
            JOIN subjects gs ON gs.id = g.subject_id
            WHERE g.teacher_id = u.id
              AND g.branch_id = u.branch_id
              AND sg.status = 'active'
              AND (
                LOWER(COALESCE(gs.name, '')) LIKE '%english%'
                OR LOWER(COALESCE(gs.name, '')) LIKE '%ingliz%'
              )
          ), 0) AS students_count,
          COALESCE((
            SELECT COUNT(DISTINCT r.id)
            FROM teacher_lesson_statistics_reports r
            JOIN groups g ON g.id = r.group_id
            JOIN subjects gs ON gs.id = g.subject_id
            JOIN subjects rs ON rs.id = r.subject_id
            WHERE g.teacher_id = u.id
              AND g.branch_id = u.branch_id
              AND COALESCE(NULLIF(r.report_month, ''), TO_CHAR(r.lesson_date::date, 'YYYY-MM')) = $2
              AND (
                LOWER(COALESCE(gs.name, '')) LIKE '%english%'
                OR LOWER(COALESCE(gs.name, '')) LIKE '%ingliz%'
              )
              AND (
                LOWER(COALESCE(rs.name, '')) LIKE '%english%'
                OR LOWER(COALESCE(rs.name, '')) LIKE '%ingliz%'
              )
          ), 0) AS reports_count,
          (
            SELECT MAX(r.created_at)
            FROM teacher_lesson_statistics_reports r
            JOIN groups g ON g.id = r.group_id
            JOIN subjects gs ON gs.id = g.subject_id
            JOIN subjects rs ON rs.id = r.subject_id
            WHERE g.teacher_id = u.id
              AND g.branch_id = u.branch_id
              AND COALESCE(NULLIF(r.report_month, ''), TO_CHAR(r.lesson_date::date, 'YYYY-MM')) = $2
              AND (
                LOWER(COALESCE(gs.name, '')) LIKE '%english%'
                OR LOWER(COALESCE(gs.name, '')) LIKE '%ingliz%'
              )
              AND (
                LOWER(COALESCE(rs.name, '')) LIKE '%english%'
                OR LOWER(COALESCE(rs.name, '')) LIKE '%ingliz%'
              )
          ) AS last_report_at
        FROM users u
        WHERE u.role = 'teacher'
          AND u.branch_id = $1
          ${getEnglishTeacherClause('u')}
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
        phone: row.phone || '',
        groups_count: Number(row.groups_count || 0),
        students_count: Number(row.students_count || 0),
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

exports.getEnglishManagerAvailableMonths = async (req, res) => {
  try {
    const branchId = req.user?.branch_id || 1;
    const currentMonth = new Date().toISOString().slice(0, 7);

    const result = await pool.query(
      `
        SELECT
          MIN(COALESCE(NULLIF(r.report_month, ''), TO_CHAR(r.lesson_date::date, 'YYYY-MM'))) AS first_month,
          MAX(COALESCE(NULLIF(r.report_month, ''), TO_CHAR(r.lesson_date::date, 'YYYY-MM'))) AS last_month
        FROM teacher_lesson_statistics_reports r
        JOIN groups g ON g.id = r.group_id
        LEFT JOIN subjects s ON s.id = r.subject_id
        LEFT JOIN subjects gs ON gs.id = g.subject_id
        WHERE g.branch_id = $1
          AND (
            LOWER(COALESCE(s.name, '')) LIKE '%english%'
            OR LOWER(COALESCE(s.name, '')) LIKE '%ingliz%'
          )
          AND (
            LOWER(COALESCE(gs.name, '')) LIKE '%english%'
            OR LOWER(COALESCE(gs.name, '')) LIKE '%ingliz%'
          )
      `,
      [branchId]
    );

    const firstMonth = result.rows[0]?.first_month || currentMonth;
    const months = buildMonthRange(firstMonth, currentMonth);

    return res.json({
      success: true,
      data: months.length ? months : [currentMonth],
    });
  } catch (error) {
    console.error('English manager available months olishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Oylar yuklanmadi',
      error: error.message,
    });
  }
};

exports.getColumnCatalog = async (req, res) => {
  res.json({ success: true, data: COLUMN_CATALOG });
};

// Reused by studentController so the parent/student-facing report response
// gets the same Uzbek-enforced column labels and computed totals as the
// teacher-facing one, instead of duplicating this logic.
exports.buildReportPayload = buildReportPayload;
