const pool = require('../config/db');

const isValidDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isValidMonth = (v) => /^\d{4}-\d{2}$/.test(v);

const getTodayDate = () => new Date().toISOString().slice(0, 10);
const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const monthStartToDate = (monthStr) => `${monthStr}-01`;

const getMonthEndDate = (monthStr) => {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
};

const countMonthsInclusive = (fromMonth, toMonth) => {
  const [fy, fm] = fromMonth.split('-').map(Number);
  const [ty, tm] = toMonth.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
};

const getAdminDailyStats = async (req, res) => {
  const client = await pool.connect();

  try {
    const today = getTodayDate();
    const qFrom = req.query.from;
    const qTo = req.query.to;

    let fromDate = qFrom && isValidDate(qFrom) ? qFrom : addDays(today, -6);
    let toDate = qTo && isValidDate(qTo) ? qTo : today;

    if (fromDate > toDate) {
      return res.status(400).json({
        success: false,
        message: '`from` sanasi `to` dan katta bo\'lishi mumkin emas',
        errors: { from: qFrom, to: qTo },
      });
    }

    const rangeDays = Math.floor((new Date(`${toDate}T00:00:00Z`) - new Date(`${fromDate}T00:00:00Z`)) / 86400000) + 1;
    if (rangeDays > 92) {
      return res.status(400).json({
        success: false,
        message: 'Kunlik filter maksimal 92 kun bo\'lishi mumkin',
        errors: { max_days: 92 },
      });
    }

    const result = await client.query(
      `WITH days AS (
         SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
       ),
       daily_payments AS (
         SELECT DATE(created_at AT TIME ZONE 'Asia/Tashkent') AS day,
                COUNT(*)::int AS payments_count,
                COALESCE(SUM(amount), 0)::numeric AS payments_amount
         FROM payment_transactions
         WHERE DATE(created_at AT TIME ZONE 'Asia/Tashkent') BETWEEN $1::date AND $2::date
         GROUP BY 1
       ),
       daily_students AS (
         SELECT DATE(joined_at) AS day,
                COUNT(DISTINCT student_id)::int AS new_students_count
         FROM student_groups
         WHERE DATE(joined_at) BETWEEN $1::date AND $2::date
         GROUP BY 1
       ),
       daily_lessons AS (
         SELECT l.date::date AS day,
                COUNT(DISTINCT l.id)::int AS lessons_count,
                COUNT(a.id)::int AS attendance_marks_count
         FROM lessons l
         LEFT JOIN attendance a ON a.lesson_id = l.id
         WHERE l.date::date BETWEEN $1::date AND $2::date
         GROUP BY 1
       )
       SELECT d.day::text AS date,
              COALESCE(p.payments_count, 0)::int AS payments_count,
              COALESCE(p.payments_amount, 0)::float AS payments_amount,
              COALESCE(s.new_students_count, 0)::int AS new_students_count,
              COALESCE(ls.lessons_count, 0)::int AS lessons_count,
              COALESCE(ls.attendance_marks_count, 0)::int AS attendance_marks_count
       FROM days d
       LEFT JOIN daily_payments p ON p.day = d.day
       LEFT JOIN daily_students s ON s.day = d.day
       LEFT JOIN daily_lessons ls ON ls.day = d.day
       ORDER BY d.day ASC`,
      [fromDate, toDate]
    );

    const points = result.rows;

    const summary = points.reduce((acc, row) => ({
      total_payments_count: acc.total_payments_count + row.payments_count,
      total_payments_amount: acc.total_payments_amount + Number(row.payments_amount || 0),
      total_new_students: acc.total_new_students + row.new_students_count,
      total_lessons: acc.total_lessons + row.lessons_count,
      total_attendance_marks: acc.total_attendance_marks + row.attendance_marks_count,
    }), {
      total_payments_count: 0,
      total_payments_amount: 0,
      total_new_students: 0,
      total_lessons: 0,
      total_attendance_marks: 0,
    });

    const chart = {
      labels: points.map((p) => p.date),
      series: {
        payments_amount: points.map((p) => Number(p.payments_amount || 0)),
        payments_count: points.map((p) => p.payments_count),
        new_students_count: points.map((p) => p.new_students_count),
        lessons_count: points.map((p) => p.lessons_count),
      },
    };

    return res.json({
      success: true,
      data: {
        period: {
          from: fromDate,
          to: toDate,
          days: points.length,
        },
        summary,
        chart,
        points,
      },
    });
  } catch (error) {
    console.error('❌ Kunlik statistika xatoligi:', error);
    return res.status(500).json({
      success: false,
      message: 'Kunlik statistikani olishda xatolik',
      errors: { detail: error.message },
    });
  } finally {
    client.release();
  }
};

const getAdminMonthlyStats = async (req, res) => {
  const client = await pool.connect();

  try {
    const currentMonth = getCurrentMonth();
    const qFrom = req.query.from_month;
    const qTo = req.query.to_month;

    let fromMonth = qFrom && isValidMonth(qFrom) ? qFrom : `${currentMonth.slice(0, 4)}-01`;
    let toMonth = qTo && isValidMonth(qTo) ? qTo : currentMonth;

    if (fromMonth > toMonth) {
      return res.status(400).json({
        success: false,
        message: '`from_month` `to_month` dan katta bo\'lishi mumkin emas',
        errors: { from_month: qFrom, to_month: qTo },
      });
    }

    const monthsCount = countMonthsInclusive(fromMonth, toMonth);
    if (monthsCount > 24) {
      return res.status(400).json({
        success: false,
        message: 'Oylik filter maksimal 24 oy bo\'lishi mumkin',
        errors: { max_months: 24 },
      });
    }

    const fromDate = monthStartToDate(fromMonth);
    const toDate = getMonthEndDate(toMonth);

    const result = await client.query(
      `WITH months AS (
         SELECT to_char(m, 'YYYY-MM') AS month
         FROM generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), interval '1 month') AS m
       ),
       monthly_payments AS (
         SELECT month,
                COUNT(*)::int AS payments_count,
                COALESCE(SUM(amount), 0)::numeric AS payments_amount
         FROM payment_transactions
         WHERE month BETWEEN $3 AND $4
         GROUP BY 1
       ),
       monthly_students AS (
         SELECT TO_CHAR(joined_at, 'YYYY-MM') AS month,
                COUNT(DISTINCT student_id)::int AS new_students_count
         FROM student_groups
         WHERE TO_CHAR(joined_at, 'YYYY-MM') BETWEEN $3 AND $4
         GROUP BY 1
       ),
       monthly_lessons AS (
         SELECT TO_CHAR(l.date, 'YYYY-MM') AS month,
                COUNT(DISTINCT l.id)::int AS lessons_count,
                COUNT(a.id)::int AS attendance_marks_count
         FROM lessons l
         LEFT JOIN attendance a ON a.lesson_id = l.id
         WHERE TO_CHAR(l.date, 'YYYY-MM') BETWEEN $3 AND $4
         GROUP BY 1
       )
       SELECT m.month,
              COALESCE(p.payments_count, 0)::int AS payments_count,
              COALESCE(p.payments_amount, 0)::float AS payments_amount,
              COALESCE(s.new_students_count, 0)::int AS new_students_count,
              COALESCE(ls.lessons_count, 0)::int AS lessons_count,
              COALESCE(ls.attendance_marks_count, 0)::int AS attendance_marks_count
       FROM months m
       LEFT JOIN monthly_payments p ON p.month = m.month
       LEFT JOIN monthly_students s ON s.month = m.month
       LEFT JOIN monthly_lessons ls ON ls.month = m.month
       ORDER BY m.month ASC`,
      [fromDate, toDate, fromMonth, toMonth]
    );

    const points = result.rows;

    const summary = points.reduce((acc, row) => ({
      total_payments_count: acc.total_payments_count + row.payments_count,
      total_payments_amount: acc.total_payments_amount + Number(row.payments_amount || 0),
      total_new_students: acc.total_new_students + row.new_students_count,
      total_lessons: acc.total_lessons + row.lessons_count,
      total_attendance_marks: acc.total_attendance_marks + row.attendance_marks_count,
    }), {
      total_payments_count: 0,
      total_payments_amount: 0,
      total_new_students: 0,
      total_lessons: 0,
      total_attendance_marks: 0,
    });

    const chart = {
      labels: points.map((p) => p.month),
      series: {
        payments_amount: points.map((p) => Number(p.payments_amount || 0)),
        payments_count: points.map((p) => p.payments_count),
        new_students_count: points.map((p) => p.new_students_count),
        lessons_count: points.map((p) => p.lessons_count),
      },
    };

    return res.json({
      success: true,
      data: {
        period: {
          from_month: fromMonth,
          to_month: toMonth,
          months: points.length,
        },
        summary,
        chart,
        points,
      },
    });
  } catch (error) {
    console.error('❌ Oylik statistika xatoligi:', error);
    return res.status(500).json({
      success: false,
      message: 'Oylik statistikani olishda xatolik',
      errors: { detail: error.message },
    });
  } finally {
    client.release();
  }
};

const getDebtorStudents = async (req, res) => {
  const client = await pool.connect();

  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { limit = 50 } = req.query;

    const debtorsList = await client.query(
      `WITH student_discounts_calc AS (
         SELECT
           sd.student_id,
           sd.group_id,
           SUM(
             CASE sd.discount_type
               WHEN 'percent' THEN (sd.discount_value / 100.0) * g.price
               WHEN 'amount' THEN sd.discount_value
               ELSE 0
             END
           ) as total_discount_amount
         FROM student_discounts sd
         JOIN groups g ON sd.group_id = g.id
         WHERE sd.is_active = true
           AND sd.start_month <= $1
           AND (sd.end_month IS NULL OR sd.end_month >= $1)
         GROUP BY sd.student_id, sd.group_id
       )
       SELECT
         u.id,
         u.name || ' ' || u.surname as student_name,
         u.phone,
         g.name as group_name,
         s.name as subject_name,
         g.price as original_price,
         COALESCE(sdc.total_discount_amount, 0) as discount_amount,
         GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) as required_amount,
         COALESCE(sp.paid_amount, 0) as paid_amount,
         (GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) - COALESCE(sp.paid_amount, 0)) as debt_amount,
         TO_CHAR(sp.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date
       FROM student_groups sg
       JOIN users u ON sg.student_id = u.id
       JOIN groups g ON sg.group_id = g.id
       JOIN subjects s ON g.subject_id = s.id
       LEFT JOIN student_discounts_calc sdc ON sg.student_id = sdc.student_id
                                             AND sg.group_id = sdc.group_id
       LEFT JOIN student_payments sp ON sg.student_id = sp.student_id
                                     AND sp.month = $1
                                     AND sp.group_id = sg.group_id
       WHERE sg.status = 'active'
         AND g.status = 'active'
         AND g.class_status = 'started'
         AND COALESCE(sp.paid_amount, 0) < GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0)
       ORDER BY debt_amount DESC
       LIMIT $2`,
      [currentMonth, limit]
    );

    return res.json({
      success: true,
      data: {
        month: currentMonth,
        total_debtors: debtorsList.rows.length,
        students: debtorsList.rows.map((row) => ({
          id: row.id,
          student_name: row.student_name,
          phone: row.phone,
          group_name: row.group_name,
          subject_name: row.subject_name,
          original_price: parseFloat(row.original_price),
          discount_amount: parseFloat(row.discount_amount),
          required_amount: parseFloat(row.required_amount),
          paid_amount: parseFloat(row.paid_amount),
          debt_amount: parseFloat(row.debt_amount),
          last_payment_date: row.last_payment_date || 'Hech qachon',
        })),
      },
    });
  } catch (error) {
    console.error('❌ Qarzdor talabalar ro\'yxati xatoligi:', error);
    return res.status(500).json({
      success: false,
      message: 'Qarzdor talabalar ro\'yxatini olishda xatolik yuz berdi',
      errors: { detail: error.message },
    });
  } finally {
    client.release();
  }
};

const getSuperAdminStats = async (req, res) => {
  const client = await pool.connect();

  try {
    const currentMonth = new Date().toISOString().slice(0, 7);

    const monthlyPayments = await client.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount
       FROM payment_transactions
       WHERE month = $1`,
      [currentMonth]
    );

    const activeStudents = await client.query(
      `SELECT COUNT(DISTINCT sg.student_id) as count
       FROM student_groups sg
       JOIN groups g ON sg.group_id = g.id
       WHERE sg.status = 'active' AND g.status = 'active' AND g.class_status = 'started'`
    );

    const activeGroups = await client.query(
      `SELECT COUNT(*) as count
       FROM groups
       WHERE status = 'active' AND class_status = 'started'`
    );

    const activeTeachers = await client.query(
      `SELECT COUNT(DISTINCT teacher_id) as count
       FROM groups
       WHERE status = 'active' AND class_status = 'started'`
    );

    return res.json({
      success: true,
      data: {
        current_month: currentMonth,
        monthly_revenue: parseFloat(monthlyPayments.rows[0].total_amount),
        monthly_payments_count: parseInt(monthlyPayments.rows[0].count, 10),
        active_students: parseInt(activeStudents.rows[0].count, 10),
        active_groups: parseInt(activeGroups.rows[0].count, 10),
        active_teachers: parseInt(activeTeachers.rows[0].count, 10),
      },
    });
  } catch (error) {
    console.error('❌ Super admin stats xatoligi:', error);
    return res.status(500).json({
      success: false,
      message: 'Super admin statistikalarini olishda xatolik',
      errors: { detail: error.message },
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAdminDailyStats,
  getAdminMonthlyStats,
  getDebtorStudents,
  getSuperAdminStats,
};
