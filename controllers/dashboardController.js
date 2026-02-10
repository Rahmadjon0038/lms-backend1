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

const shiftMonth = (monthStr, delta) => {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

const toNumber = (v) => Number(v || 0);

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
    const qMonth = req.query.month;
    const currentMonth = qMonth && isValidMonth(qMonth) ? qMonth : getCurrentMonth();
    const [monthlyResult, subjectsResult, overallResult] = await Promise.all([
      client.query(
        `WITH monthly_revenue AS (
           SELECT COALESCE(SUM(amount), 0)::numeric AS total_revenue
           FROM payment_transactions
           WHERE month = $1
         ),
         monthly_expenses AS (
           SELECT COALESCE(SUM(amount), 0)::numeric AS total_expenses
           FROM center_expenses
           WHERE month = $1
         ),
         monthly_new_students AS (
           SELECT COUNT(*)::int AS new_students_count
           FROM users
           WHERE role = 'student'
             AND TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') = $1
         ),
         monthly_discounts AS (
           SELECT COALESCE(SUM(CASE WHEN COALESCE(discount_amount, 0) > 0 THEN discount_amount ELSE 0 END), 0)::numeric AS total_discounts
           FROM monthly_snapshots
           WHERE month = $1
         ),
         teacher_base AS (
           SELECT
             u.id AS teacher_id,
             COALESCE(tss.salary_percentage, 50)::numeric AS salary_percentage
           FROM users u
           LEFT JOIN teacher_salary_settings tss ON tss.teacher_id = u.id
           WHERE u.role = 'teacher' AND u.status = 'active'
         ),
         teacher_revenue AS (
           SELECT
             g.teacher_id,
             COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0)::numeric AS total_collected
           FROM monthly_snapshots ms
           JOIN groups g ON g.id = ms.group_id
           WHERE ms.month = $1
             AND COALESCE(ms.monthly_status, 'active') = 'active'
           GROUP BY g.teacher_id
         ),
         teacher_salary_calc AS (
           SELECT
             tb.teacher_id,
             (COALESCE(tr.total_collected, 0) * tb.salary_percentage / 100.0)::numeric AS expected_salary
           FROM teacher_base tb
           LEFT JOIN teacher_revenue tr ON tr.teacher_id = tb.teacher_id
         ),
         teacher_salary_monthly AS (
           SELECT COALESCE(SUM(expected_salary), 0)::numeric AS total_teacher_salary
           FROM teacher_salary_calc
         )
         SELECT
           (SELECT total_revenue FROM monthly_revenue)::float AS total_revenue,
           (SELECT total_teacher_salary FROM teacher_salary_monthly)::float AS total_teacher_salary,
           (SELECT total_expenses FROM monthly_expenses)::float AS total_expenses,
           (SELECT new_students_count FROM monthly_new_students)::int AS new_students_count,
           (SELECT total_discounts FROM monthly_discounts)::float AS total_discounts`,
        [currentMonth]
      ),
      client.query(
        `WITH students_by_subject AS (
           SELECT
             g.subject_id,
             COUNT(DISTINCT sg.student_id)::int AS total_students_count
           FROM groups g
           LEFT JOIN student_groups sg ON sg.group_id = g.id AND sg.status = 'active'
           WHERE g.status = 'active'
             AND g.class_status = 'started'
           GROUP BY g.subject_id
         ),
         revenue_by_subject AS (
           SELECT
             g.subject_id,
             COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0)::numeric AS total_revenue
           FROM monthly_snapshots ms
           JOIN groups g ON g.id = ms.group_id
           WHERE ms.month = $1
             AND COALESCE(ms.monthly_status, 'active') = 'active'
           GROUP BY g.subject_id
         )
         SELECT
           s.id AS subject_id,
           s.name AS subject_name,
           COALESCE(sb.total_students_count, 0)::int AS total_students_count,
           COALESCE(rb.total_revenue, 0)::float AS total_revenue
         FROM subjects s
         LEFT JOIN students_by_subject sb ON sb.subject_id = s.id
         LEFT JOIN revenue_by_subject rb ON rb.subject_id = s.id
         ORDER BY total_revenue DESC, total_students_count DESC, s.name ASC`,
        [currentMonth]
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE role = 'student')::int AS total_students_count,
           (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'finished')::int AS finished_students_count,
           (SELECT COUNT(*) FROM users WHERE role = 'student' AND status NOT IN ('active', 'finished'))::int AS inactive_students_count,
           (SELECT COUNT(*) FROM users WHERE role = 'teacher')::int AS total_teachers_count`
      ),
    ]);

    const monthly = monthlyResult.rows[0] || {};
    const subjects = subjectsResult.rows || [];
    const overall = overallResult.rows[0] || {};

    const totalRevenue = toNumber(monthly.total_revenue);
    const totalTeacherSalary = toNumber(monthly.total_teacher_salary);
    const totalExpenses = toNumber(monthly.total_expenses);
    const totalDiscounts = toNumber(monthly.total_discounts);
    const netProfit = totalRevenue - totalTeacherSalary - totalExpenses - totalDiscounts;

    return res.json({
      success: true,
      data: {
        monthly: {
          current_month: currentMonth,
          total_revenue: totalRevenue,
          total_teacher_salary: totalTeacherSalary,
          total_expenses: totalExpenses,
          new_students_count: toNumber(monthly.new_students_count),
          total_discounts: totalDiscounts,
          net_profit: netProfit,
        },
        subjects: subjects.map((row) => ({
          subject_id: row.subject_id,
          subject_name: row.subject_name,
          total_students_count: toNumber(row.total_students_count),
          total_revenue: toNumber(row.total_revenue),
        })),
        overall: {
          total_students_count: toNumber(overall.total_students_count),
          finished_students_count: toNumber(overall.finished_students_count),
          inactive_students_count: toNumber(overall.inactive_students_count),
          total_teachers_count: toNumber(overall.total_teachers_count),
        },
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
