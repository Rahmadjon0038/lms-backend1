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
                COUNT(*)::int AS payments_count
         FROM payment_transactions
         WHERE DATE(created_at AT TIME ZONE 'Asia/Tashkent') BETWEEN $1::date AND $2::date
         GROUP BY 1
       ),
       daily_students AS (
         SELECT DATE(created_at AT TIME ZONE 'Asia/Tashkent') AS day,
                COUNT(*)::int AS new_students_count
         FROM users
         WHERE role = 'student'
           AND DATE(created_at AT TIME ZONE 'Asia/Tashkent') BETWEEN $1::date AND $2::date
         GROUP BY 1
       ),
       daily_expenses AS (
         SELECT expense_date::date AS day,
                COUNT(*)::int AS expenses_count,
                COALESCE(SUM(amount), 0)::numeric AS expenses_amount
         FROM center_expenses
         WHERE expense_date::date BETWEEN $1::date AND $2::date
         GROUP BY 1
       )
       SELECT d.day::text AS date,
              COALESCE(p.payments_count, 0)::int AS payments_count,
              COALESCE(s.new_students_count, 0)::int AS new_students_count,
              COALESCE(e.expenses_count, 0)::int AS expenses_count,
              COALESCE(e.expenses_amount, 0)::float AS expenses_amount
       FROM days d
       LEFT JOIN daily_payments p ON p.day = d.day
       LEFT JOIN daily_students s ON s.day = d.day
       LEFT JOIN daily_expenses e ON e.day = d.day
       ORDER BY d.day ASC`,
      [fromDate, toDate]
    );

    const points = result.rows;

    const summary = points.reduce((acc, row) => ({
      payments_count: acc.payments_count + Number(row.payments_count || 0),
      new_students_count: acc.new_students_count + Number(row.new_students_count || 0),
      expenses_count: acc.expenses_count + Number(row.expenses_count || 0),
      expenses_amount: acc.expenses_amount + Number(row.expenses_amount || 0),
    }), {
      payments_count: 0,
      new_students_count: 0,
      expenses_count: 0,
      expenses_amount: 0,
    });

    const chart = {
      labels: points.map((p) => p.date),
      series: {
        payments_count: points.map((p) => p.payments_count),
        new_students_count: points.map((p) => p.new_students_count),
        expenses_count: points.map((p) => p.expenses_count),
        expenses_amount: points.map((p) => Number(p.expenses_amount || 0)),
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
                COUNT(*)::int AS payments_count
         FROM payment_transactions
         WHERE month BETWEEN $3 AND $4
         GROUP BY 1
       ),
       monthly_students AS (
         SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') AS month,
                COUNT(*)::int AS new_students_count
         FROM users
         WHERE role = 'student'
           AND TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') BETWEEN $3 AND $4
         GROUP BY 1
       ),
       monthly_expenses AS (
         SELECT month,
                COUNT(*)::int AS expenses_count,
                COALESCE(SUM(amount), 0)::numeric AS expenses_amount
         FROM center_expenses
         WHERE month BETWEEN $3 AND $4
         GROUP BY 1
       ),
       monthly_debt AS (
         SELECT month,
                COUNT(*) FILTER (WHERE debt_amount > 0)::int AS debtors_count,
                COALESCE(SUM(CASE WHEN debt_amount > 0 THEN debt_amount ELSE 0 END), 0)::numeric AS debt_amount
         FROM monthly_snapshots
         WHERE month BETWEEN $3 AND $4
         GROUP BY 1
       )
       SELECT m.month,
              COALESCE(p.payments_count, 0)::int AS payments_count,
              COALESCE(s.new_students_count, 0)::int AS new_students_count,
              COALESCE(e.expenses_count, 0)::int AS expenses_count,
              COALESCE(e.expenses_amount, 0)::float AS expenses_amount,
              COALESCE(d.debtors_count, 0)::int AS debtors_count,
              COALESCE(d.debt_amount, 0)::float AS debt_amount
       FROM months m
       LEFT JOIN monthly_payments p ON p.month = m.month
       LEFT JOIN monthly_students s ON s.month = m.month
       LEFT JOIN monthly_expenses e ON e.month = m.month
       LEFT JOIN monthly_debt d ON d.month = m.month
       ORDER BY m.month ASC`,
      [fromDate, toDate, fromMonth, toMonth]
    );

    const points = result.rows;

    const summary = points.reduce((acc, row) => ({
      payments_count: acc.payments_count + Number(row.payments_count || 0),
      new_students_count: acc.new_students_count + Number(row.new_students_count || 0),
      expenses_count: acc.expenses_count + Number(row.expenses_count || 0),
      expenses_amount: acc.expenses_amount + Number(row.expenses_amount || 0),
      debtors_count: acc.debtors_count + Number(row.debtors_count || 0),
      debt_amount: acc.debt_amount + Number(row.debt_amount || 0),
    }), {
      payments_count: 0,
      new_students_count: 0,
      expenses_count: 0,
      expenses_amount: 0,
      debtors_count: 0,
      debt_amount: 0,
    });

    const currentMonthPoint = points.find((p) => p.month === toMonth) || {
      debtors_count: 0,
      debt_amount: 0,
    };

    const statusDistResult = await client.query(
      `SELECT
         COUNT(CASE WHEN payment_status = 'paid' THEN 1 END)::int AS paid_count,
         COUNT(CASE WHEN payment_status = 'partial' THEN 1 END)::int AS partial_count,
         COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END)::int AS unpaid_count
       FROM monthly_snapshots
       WHERE month = $1`,
      [toMonth]
    );

    const statusDist = statusDistResult.rows[0] || {};
    const paidCount = Number(statusDist.paid_count || 0);
    const partialCount = Number(statusDist.partial_count || 0);
    const unpaidCount = Number(statusDist.unpaid_count || 0);
    const totalTransactions = paidCount + partialCount + unpaidCount;
    const toPercent = (count) => (totalTransactions > 0 ? Number(((count * 100) / totalTransactions).toFixed(1)) : 0);

    const chart = {
      labels: points.map((p) => p.month),
      series: {
        payments_count: points.map((p) => p.payments_count),
        new_students_count: points.map((p) => p.new_students_count),
        expenses_count: points.map((p) => p.expenses_count),
        expenses_amount: points.map((p) => Number(p.expenses_amount || 0)),
        debtors_count: points.map((p) => Number(p.debtors_count || 0)),
        debt_amount: points.map((p) => Number(p.debt_amount || 0)),
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
        current_month: {
          month: toMonth,
          payments_count: Number((points.find((p) => p.month === toMonth) || {}).payments_count || 0),
          new_students_count: Number((points.find((p) => p.month === toMonth) || {}).new_students_count || 0),
          expenses_count: Number((points.find((p) => p.month === toMonth) || {}).expenses_count || 0),
          expenses_amount: Number((points.find((p) => p.month === toMonth) || {}).expenses_amount || 0),
          debtors_count: Number(currentMonthPoint.debtors_count || 0),
          debt_amount: Number(currentMonthPoint.debt_amount || 0),
        },
        summary,
        chart,
        payment_status_distribution: {
          month: toMonth,
          total_transactions: totalTransactions,
          items: [
            { status: 'paid', label: "To'langan", count: paidCount, percentage: toPercent(paidCount) },
            { status: 'partial', label: "Qisman to'langan", count: partialCount, percentage: toPercent(partialCount) },
            { status: 'unpaid', label: "To'lanmagan", count: unpaidCount, percentage: toPercent(unpaidCount) },
          ],
          chart: {
            labels: ['paid', 'partial', 'unpaid'],
            series: {
              count: [paidCount, partialCount, unpaidCount],
              percentage: [toPercent(paidCount), toPercent(partialCount), toPercent(unpaidCount)],
            },
          },
        },
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

const getAdminOverviewStats = async (req, res) => {
  const client = await pool.connect();

  try {
    const currentMonth = getCurrentMonth();

    const [overallResult, admissionsTrendResult] = await Promise.all([
      client.query(
        `SELECT
           (SELECT COUNT(*) FROM groups WHERE status = 'active' AND class_status = 'started')::int AS active_groups_count,
           (SELECT COUNT(*) FROM users WHERE role = 'teacher' AND status = 'active')::int AS active_teachers_count,
           (SELECT COUNT(*) FROM subjects)::int AS subjects_count`
      ),
      client.query(
        `WITH months AS (
           SELECT to_char(m, 'YYYY-MM') AS month
           FROM generate_series(
             date_trunc('month', CURRENT_DATE) - interval '11 months',
             date_trunc('month', CURRENT_DATE),
             interval '1 month'
           ) AS m
         ),
         admissions AS (
           SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') AS month, COUNT(*)::int AS admissions_count
           FROM users
           WHERE role = 'student'
             AND created_at >= date_trunc('month', CURRENT_DATE) - interval '11 months'
           GROUP BY 1
         )
         SELECT m.month, COALESCE(a.admissions_count, 0)::int AS admissions_count
         FROM months m
         LEFT JOIN admissions a ON a.month = m.month
         ORDER BY m.month`
      ),
    ]);

    const overall = overallResult.rows[0] || {};

    return res.json({
      success: true,
      data: {
        period: {
          current_month: currentMonth,
        },
        overall: {
          active_groups_count: Number(overall.active_groups_count || 0),
          active_teachers_count: Number(overall.active_teachers_count || 0),
          subjects_count: Number(overall.subjects_count || 0),
        },
        charts: {
          admissions_monthly_last_12: {
            labels: admissionsTrendResult.rows.map((r) => r.month),
            series: {
              admissions_count: admissionsTrendResult.rows.map((r) => Number(r.admissions_count || 0)),
            },
          },
        },
      },
    });
  } catch (error) {
    console.error('❌ Admin overview statistika xatoligi:', error);
    return res.status(500).json({
      success: false,
      message: 'Admin overview statistikani olishda xatolik',
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
  getAdminOverviewStats,
  getDebtorStudents,
  getSuperAdminStats,
};
