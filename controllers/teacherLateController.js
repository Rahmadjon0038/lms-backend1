const pool = require('../config/db');

const isValidMonth = (m) => /^\d{4}-\d{2}$/.test(String(m || ''));
const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

// Tanlangan oy uchun BARCHA o'qituvchilar + ularning shu oydagi kechikish yozuvlari.
// Kechikishi yo'q teacherlar ham ro'yxatda chiqadi (total 0 bilan).
exports.getMonthLateByTeachers = async (req, res) => {
  const monthName = req.params.month_name;

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: "month_name YYYY-MM formatda bo'lishi kerak" });
  }

  try {
    const result = await pool.query(
      `SELECT
         u.id AS teacher_id,
         NULLIF(TRIM(COALESCE(u.surname, '') || ' ' || COALESCE(u.name, '')), '') AS teacher_name,
         u.phone,
         COALESCE(agg.total_minutes, 0)::int AS total_minutes,
         COALESCE(agg.total_count, 0)::int AS total_count,
         COALESCE(agg.records, '[]'::json) AS records
       FROM users u
       LEFT JOIN LATERAL (
         SELECT
           SUM(r.minutes)::int AS total_minutes,
           COUNT(*)::int AS total_count,
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id', r.id,
               'late_date', TO_CHAR(r.late_date, 'YYYY-MM-DD'),
               'minutes', r.minutes,
               'description', r.description,
               'created_at', r.created_at
             )
             ORDER BY r.late_date DESC, r.id DESC
           ) AS records
         FROM teacher_late_records r
         WHERE r.teacher_id = u.id
           AND TO_CHAR(r.late_date, 'YYYY-MM') = $1
       ) agg ON true
       WHERE u.role = 'teacher'
       ORDER BY u.surname NULLS LAST, u.name NULLS LAST, u.id`,
      [monthName]
    );

    return res.json({
      success: true,
      data: {
        month_name: monthName,
        teachers: result.rows,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Kechikishlarni olishda xatolik',
      error: error.message,
    });
  }
};

// Yangi kechikish yozuvi qo'shish.
exports.createLateRecord = async (req, res) => {
  const teacherId = Number(req.body.teacher_id);
  const minutes = Number(req.body.minutes);
  const lateDate = req.body.late_date;
  const description =
    req.body.description !== undefined && req.body.description !== null && String(req.body.description).trim() !== ''
      ? String(req.body.description).trim()
      : null;

  if (!teacherId || Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: "teacher_id noto'g'ri" });
  }
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return res.status(400).json({ success: false, message: "minutes musbat son bo'lishi kerak" });
  }
  if (!isValidDate(lateDate)) {
    return res.status(400).json({ success: false, message: "late_date YYYY-MM-DD formatda bo'lishi kerak" });
  }

  try {
    const teacher = await pool.query(`SELECT id FROM users WHERE id = $1 AND role = 'teacher'`, [teacherId]);
    if (!teacher.rows.length) {
      return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }

    const ins = await pool.query(
      `INSERT INTO teacher_late_records (teacher_id, late_date, minutes, description, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [teacherId, lateDate, Math.round(minutes), description, req.user.id]
    );

    return res.json({ success: true, message: "Kechikish qo'shildi", data: ins.rows[0] });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Kechikishni saqlashda xatolik',
      error: error.message,
    });
  }
};

// Kechikish yozuvini o'chirish.
exports.deleteLateRecord = async (req, res) => {
  const id = Number(req.params.id);

  if (!id || Number.isNaN(id)) {
    return res.status(400).json({ success: false, message: "id noto'g'ri" });
  }

  try {
    const del = await pool.query(`DELETE FROM teacher_late_records WHERE id = $1 RETURNING *`, [id]);
    if (!del.rows.length) {
      return res.status(404).json({ success: false, message: 'Yozuv topilmadi' });
    }
    return res.json({ success: true, message: "O'chirildi", data: del.rows[0] });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "O'chirishda xatolik",
      error: error.message,
    });
  }
};
