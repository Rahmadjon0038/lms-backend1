const pool = require('../config/db');
const { notifyUser } = require('./notificationController');
const telegramBotService = require('../services/telegramBotService');

const asInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatStoredDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

// Postgres DATE ustuni node-pg orqali Node serverining LOKAL vaqt zonasida
// "yarim tunda" turgan JS Date obyekti sifatida qaytadi. Buni `.toISOString()`
// bilan formatlasak (UTC'ga o'tkazadi), server vaqt zonasi UTC'dan oldinda
// bo'lganda (masalan Asia/Tashkent, +5) sana BIR KUNGA ORQAGA surilib qoladi.
// Shuning uchun UTC emas, obyektning LOKAL yil/oy/kun komponentlaridan
// foydalanamiz — ular bazadagi haqiqiy sanaga mos keladi.
const formatDateOnly = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Ustoz faqat bugungi yoki o'tgan darslar uchun uyga vazifa yubora oladi —
// statistika (teacherStatisticsController) bilan bir xil qoida.
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
        g.name AS group_name,
        g.teacher_id AS group_teacher_id,
        g.subject_id AS group_subject_id,
        g.branch_id AS group_branch_id,
        COALESCE(ls.name, gs.name, '') AS subject_name,
        TRIM(COALESCE(u.surname, gu.surname, '') || ' ' || COALESCE(u.name, gu.name, '')) AS teacher_name
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

  const row = result.rows[0];
  if (!row) return null;
  return { ...row, lesson_date: formatDateOnly(row.lesson_date) };
};

// Dars sanasida guruhda haqiqatda o'qigan (kelib-ketmagan) o'quvchilar ro'yxati.
const getLessonStudentIds = async (groupId, lessonDate, branchId) => {
  const result = await pool.query(
    `
      SELECT DISTINCT sg.student_id
      FROM student_groups sg
      WHERE sg.group_id = $1
        AND sg.branch_id = $3
        AND DATE(sg.joined_at) <= $2::date
        AND (sg.left_at IS NULL OR DATE(sg.left_at) > $2::date)
    `,
    [groupId, lessonDate, branchId]
  );

  return result.rows.map((row) => row.student_id);
};

// Homework ustuni statistika (teacherStatisticsController) tomonidan
// boshqariladi: teacher "Uy vazifasi" ustuniga ball qo'ysa (0 dan katta),
// student buni bajargan hisoblanadi; 0 qo'yilsa — bajarmagan; hisobot hali
// yuborilmagan bo'lsa — hali baholanmagan.
const homeworkStatusFromScore = (score) => {
  if (score === null || score === undefined) return 'pending';
  return score > 0 ? 'done' : 'not_done';
};

const buildHomeworkPayload = (row) => {
  const homeworkScore =
    row.homework_score === null || row.homework_score === undefined
      ? null
      : asInt(row.homework_score, 0);

  return {
    id: row.id,
    lesson_id: row.lesson_id,
    group_id: row.group_id,
    group_name: row.group_name || '',
    subject_name: row.subject_name || '',
    lesson_date: formatDateOnly(row.lesson_date),
    homework_text: row.homework_text,
    homework_score: homeworkScore,
    homework_max: row.homework_max === null || row.homework_max === undefined ? null : asInt(row.homework_max, 0),
    homework_status: homeworkStatusFromScore(homeworkScore),
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_at_label: formatStoredDateTime(row.created_at),
    updated_at_label: formatStoredDateTime(row.updated_at),
  };
};

exports.saveLessonHomework = async (req, res) => {
  try {
    const lessonId = asInt(req.params.lessonId);
    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'lessonId noto\'g\'ri' });
    }

    const homeworkText = String(req.body?.homework_text || '').trim();
    if (!homeworkText) {
      return res.status(400).json({ success: false, message: 'Uyga vazifa matni bo\'sh bo\'lmasligi kerak' });
    }

    const lesson = await getLessonContext(lessonId, req.user.branch_id || 1);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Dars topilmadi' });
    }

    const effectiveTeacherId = lesson.lesson_teacher_id || lesson.group_teacher_id;
    if (
      req.user.role === 'teacher' &&
      effectiveTeacherId &&
      effectiveTeacherId !== req.user.id
    ) {
      return res.status(403).json({ success: false, message: 'Bu dars sizga biriktirilmagan' });
    }

    if (req.user.role === 'teacher' && !canTeacherMutateLesson(lesson.lesson_date)) {
      return res.status(403).json({ success: false, message: 'Bu dars uchun uyga vazifa yopilgan' });
    }

    const branchId = lesson.group_branch_id || lesson.branch_id || req.user.branch_id || 1;

    const inserted = await pool.query(
      `
        INSERT INTO lesson_homework_assignments (
          lesson_id, group_id, teacher_id, subject_id, branch_id,
          lesson_date, homework_text, created_by, updated_by, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, CURRENT_TIMESTAMP)
        ON CONFLICT (lesson_id)
        DO UPDATE SET
          homework_text = EXCLUDED.homework_text,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `,
      [
        lessonId,
        lesson.group_id,
        effectiveTeacherId || null,
        lesson.lesson_subject_id || lesson.group_subject_id || null,
        branchId,
        lesson.lesson_date,
        homeworkText,
        req.user.id,
        req.user.id,
      ]
    );

    const homeworkRow = inserted.rows[0];
    const studentIds = await getLessonStudentIds(lesson.group_id, lesson.lesson_date, branchId);
    const lessonDateLabel = formatDateOnly(lesson.lesson_date);
    const subjectLabel = lesson.subject_name ? `${lesson.subject_name} — ${lesson.group_name}` : lesson.group_name;

    for (const studentId of studentIds) {
      try {
        await notifyUser({
          userId: studentId,
          type: 'homework',
          title: 'Uyga vazifa',
          body: homeworkText,
          pushTitle: 'Yangi uyga vazifa',
          pushBody: homeworkText,
          branchId,
          data: {
            route: '/notification-detail',
            type: 'homework',
            title: 'Uyga vazifa',
            body: homeworkText,
            lesson_id: String(lessonId),
            lesson_date: lessonDateLabel,
            group_id: String(lesson.group_id),
            group_name: lesson.group_name || '',
            subject_name: lesson.subject_name || '',
          },
          createdBy: req.user.id,
        });
      } catch (notificationError) {
        console.warn(`⚠️ Uyga vazifa notification yuborilmadi (student_id=${studentId}): ${notificationError.message}`);
      }
    }

    // Telegram guruhga darhol (real-time) forward — ixtiyoriy, muvaffaqiyatsiz
    // bo'lsa ham asosiy oqim (uyga vazifa saqlash) buzilmasin.
    try {
      const caption = `📝 Uyga vazifa\n👨‍🏫 ${lesson.teacher_name || 'Noma\'lum'}\n📚 ${lesson.group_name}${
        lesson.subject_name ? ` • ${lesson.subject_name}` : ''
      }\n📅 ${lessonDateLabel}\n\n${homeworkText}`;
      await telegramBotService.sendHomeworkMessage({
        teacherId: effectiveTeacherId,
        teacherName: lesson.teacher_name || '',
        groupId: lesson.group_id,
        groupName: lesson.group_name || '',
        lessonId,
        branchId,
        text: caption,
        reportMonth: lessonDateLabel.slice(0, 7),
      });
    } catch (telegramError) {
      console.warn(`⚠️ Telegramga uyga vazifa yuborilmadi: ${telegramError.message}`);
    }

    return res.json({
      success: true,
      message: 'Uyga vazifa yuborildi',
      data: buildHomeworkPayload({ ...homeworkRow, group_name: lesson.group_name, subject_name: lesson.subject_name }),
    });
  } catch (error) {
    console.error('Uyga vazifa saqlashda xatolik:', error);
    return res.status(500).json({ success: false, message: 'Uyga vazifa saqlanmadi', error: error.message });
  }
};

exports.getLessonHomework = async (req, res) => {
  try {
    const lessonId = asInt(req.params.lessonId);
    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'lessonId noto\'g\'ri' });
    }

    const result = await pool.query(
      `
        SELECT h.*, g.name AS group_name, COALESCE(s.name, '') AS subject_name
        FROM lesson_homework_assignments h
        JOIN groups g ON g.id = h.group_id
        LEFT JOIN subjects s ON s.id = h.subject_id
        WHERE h.lesson_id = $1 AND h.branch_id = $2
        LIMIT 1
      `,
      [lessonId, req.user.branch_id || 1]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, data: null });
    }

    return res.json({ success: true, data: buildHomeworkPayload(result.rows[0]) });
  } catch (error) {
    console.error('Uyga vazifani olishda xatolik:', error);
    return res.status(500).json({ success: false, message: 'Uyga vazifa topilmadi', error: error.message });
  }
};

exports.getGroupHomeworkList = async (req, res) => {
  try {
    const groupId = asInt(req.params.groupId);
    if (!groupId) {
      return res.status(400).json({ success: false, message: 'groupId noto\'g\'ri' });
    }

    const { month } = req.query;
    const params = [groupId, req.user.branch_id || 1];
    let monthClause = '';
    if (month) {
      params.push(month);
      monthClause = `AND TO_CHAR(h.lesson_date, 'YYYY-MM') = $3`;
    }

    const result = await pool.query(
      `
        SELECT h.*, g.name AS group_name, COALESCE(s.name, '') AS subject_name
        FROM lesson_homework_assignments h
        JOIN groups g ON g.id = h.group_id
        LEFT JOIN subjects s ON s.id = h.subject_id
        WHERE h.group_id = $1 AND h.branch_id = $2 ${monthClause}
        ORDER BY h.lesson_date DESC
      `,
      params
    );

    return res.json({ success: true, data: result.rows.map(buildHomeworkPayload) });
  } catch (error) {
    console.error('Guruh uyga vazifalarini olishda xatolik:', error);
    return res.status(500).json({ success: false, message: 'Uyga vazifalar topilmadi', error: error.message });
  }
};

// Studentning o'zi a'zo bo'lgan guruhlarga yuborilgan uyga vazifalar —
// mobil ilova bosh sahifadagi "Uyga vazifa" kartasi va "Barchasini ko'rish"
// sahifasi shundan foydalanadi. `homework_score`/`homework_max` shu lesson
// uchun statistika hisobotidagi "Uy vazifasi" ustunidan (agar bo'lsa) olinadi.
exports.getMyHomework = async (req, res) => {
  try {
    const studentId = req.user.id;
    const limit = Math.min(Math.max(asInt(req.query.limit, 20), 1), 200);
    const month = String(req.query.month || '').trim();
    const branchId = req.user.branch_id || 1;

    const params = [studentId, branchId];
    let monthClause = '';
    if (/^\d{4}-\d{2}$/.test(month)) {
      params.push(month);
      monthClause = `AND TO_CHAR(h.lesson_date, 'YYYY-MM') = $${params.length}`;
    }
    params.push(limit);

    const result = await pool.query(
      `
        SELECT
          h.*,
          g.name AS group_name,
          COALESCE(s.name, '') AS subject_name,
          (
            SELECT COALESCE(
              (elem->>'homework')::int,
              (elem->'values'->>'homework')::int
            )
            FROM teacher_lesson_statistics_reports r,
                 jsonb_array_elements(COALESCE(r.report_data->'rows', '[]'::jsonb)) elem
            WHERE r.lesson_id = h.lesson_id
              AND (elem->>'student_id')::int = $1
            LIMIT 1
          ) AS homework_score,
          (
            SELECT (col->>'max_value')::int
            FROM teacher_lesson_statistics_reports r,
                 jsonb_array_elements(COALESCE(r.report_data->'columns', '[]'::jsonb)) col
            WHERE r.lesson_id = h.lesson_id
              AND col->>'key' = 'homework'
            LIMIT 1
          ) AS homework_max
        FROM lesson_homework_assignments h
        JOIN groups g ON g.id = h.group_id
        JOIN student_groups sg
          ON sg.group_id = h.group_id
         AND sg.student_id = $1
         AND DATE(sg.joined_at) <= h.lesson_date
         AND (sg.left_at IS NULL OR DATE(sg.left_at) > h.lesson_date)
        LEFT JOIN subjects s ON s.id = h.subject_id
        WHERE h.branch_id = $2 ${monthClause}
        ORDER BY h.lesson_date DESC, h.created_at DESC
        LIMIT $${params.length}
      `,
      params
    );

    return res.json({ success: true, data: result.rows.map(buildHomeworkPayload) });
  } catch (error) {
    console.error('Student uyga vazifalarini olishda xatolik:', error);
    return res.status(500).json({ success: false, message: 'Uyga vazifalar topilmadi', error: error.message });
  }
};

// Studentning uyga vazifalari mavjud bo'lgan oylar ro'yxati — "Barchasini
// ko'rish" sahifasidagi oy filtri shundan foydalanadi.
exports.getMyHomeworkMonths = async (req, res) => {
  try {
    const studentId = req.user.id;
    const result = await pool.query(
      `
        SELECT DISTINCT TO_CHAR(h.lesson_date, 'YYYY-MM') AS month
        FROM lesson_homework_assignments h
        JOIN student_groups sg
          ON sg.group_id = h.group_id
         AND sg.student_id = $1
         AND DATE(sg.joined_at) <= h.lesson_date
         AND (sg.left_at IS NULL OR DATE(sg.left_at) > h.lesson_date)
        WHERE h.branch_id = $2
        ORDER BY month DESC
      `,
      [studentId, req.user.branch_id || 1]
    );

    return res.json({ success: true, data: result.rows.map((row) => row.month) });
  } catch (error) {
    console.error('Uyga vazifa oylarini olishda xatolik:', error);
    return res.status(500).json({ success: false, message: 'Oylar topilmadi', error: error.message });
  }
};

// English-manager statistika sahifasidagi HAR BIR dars kartochkasida (hatto
// ochilmagan/kengaytirilmagan holatda ham) uyga vazifa berilgan-berilmaganini
// ko'rsatish uchun — shu oy uchun uyga vazifasi bor darslarning lesson_id
// ro'yxatini bitta so'rovda qaytaradi. `teacherStatisticsController`dagi
// `getManagerDailyStatistics` bilan bir xil "English" fan filtri qo'llaniladi,
// shu bilan ikkala ro'yxat (reportlar va uyga vazifalar) mos keladi.
exports.getManagerHomeworkList = async (req, res) => {
  try {
    const month = String(req.query.month || '').trim();
    const monthFilter = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
    const teacherId = req.query.teacher_id ? asInt(req.query.teacher_id) : null;
    const groupId = req.query.group_id ? asInt(req.query.group_id) : null;
    const branchId = req.user.branch_id || 1;

    const params = [branchId, monthFilter];
    let where = `
      WHERE g.branch_id = $1
        AND TO_CHAR(h.lesson_date, 'YYYY-MM') = $2
        AND (
          LOWER(COALESCE(s.name, '')) LIKE '%english%'
          OR LOWER(COALESCE(s.name, '')) LIKE '%ingliz%'
        )
        AND (
          LOWER(COALESCE(gs.name, '')) LIKE '%english%'
          OR LOWER(COALESCE(gs.name, '')) LIKE '%ingliz%'
        )
    `;

    if (teacherId) {
      params.push(teacherId);
      where += ` AND h.teacher_id = $${params.length}`;
    }
    if (groupId) {
      params.push(groupId);
      where += ` AND h.group_id = $${params.length}`;
    }

    const result = await pool.query(
      `
        SELECT h.lesson_id
        FROM lesson_homework_assignments h
        JOIN groups g ON g.id = h.group_id
        LEFT JOIN subjects s ON s.id = h.subject_id
        LEFT JOIN subjects gs ON gs.id = g.subject_id
        ${where}
      `,
      params
    );

    return res.json({ success: true, data: result.rows.map((row) => row.lesson_id) });
  } catch (error) {
    console.error('Manager uyga vazifalar ro\'yxatini olishda xatolik:', error);
    return res.status(500).json({ success: false, message: 'Uyga vazifalar topilmadi', error: error.message });
  }
};

exports.deleteLessonHomework = async (req, res) => {
  try {
    const lessonId = asInt(req.params.lessonId);
    if (!lessonId) {
      return res.status(400).json({ success: false, message: 'lessonId noto\'g\'ri' });
    }

    const existing = await pool.query(
      `SELECT * FROM lesson_homework_assignments WHERE lesson_id = $1 AND branch_id = $2`,
      [lessonId, req.user.branch_id || 1]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Uyga vazifa topilmadi' });
    }

    const homework = existing.rows[0];
    if (req.user.role === 'teacher' && homework.teacher_id && homework.teacher_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu uyga vazifa sizga tegishli emas' });
    }

    await pool.query(`DELETE FROM lesson_homework_assignments WHERE id = $1`, [homework.id]);

    return res.json({ success: true, message: 'Uyga vazifa o\'chirildi' });
  } catch (error) {
    console.error('Uyga vazifani o\'chirishda xatolik:', error);
    return res.status(500).json({ success: false, message: 'Uyga vazifa o\'chirilmadi', error: error.message });
  }
};
