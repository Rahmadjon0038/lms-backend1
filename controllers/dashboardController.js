const pool = require('../config/db');
const { getScopedBranchId } = require('../utils/branch');

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
    const branchId = getScopedBranchId(req);
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
           AND branch_id = $3
         GROUP BY 1
       ),
       daily_students AS (
         SELECT DATE(created_at AT TIME ZONE 'Asia/Tashkent') AS day,
                COUNT(*)::int AS new_students_count
         FROM users
         WHERE role = 'student'
           AND branch_id = $3
           AND DATE(created_at AT TIME ZONE 'Asia/Tashkent') BETWEEN $1::date AND $2::date
         GROUP BY 1
       ),
       daily_expenses AS (
         SELECT expense_date::date AS day,
                COUNT(*)::int AS expenses_count,
                COALESCE(SUM(amount), 0)::numeric AS expenses_amount
         FROM center_expenses
         WHERE expense_date::date BETWEEN $1::date AND $2::date
           AND branch_id = $3
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
      [fromDate, toDate, branchId]
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

    const dailyPaymentTotalResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::float AS total_amount
       FROM payment_transactions
       WHERE DATE(created_at AT TIME ZONE 'Asia/Tashkent') = $1::date
         AND branch_id = $2`,
      [toDate, branchId]
    );

    const dailyPaymentsResult = await client.query(
      `SELECT
         pt.id as payment_id,
         pt.student_id,
         u.name,
         u.surname,
         u.username,
         u.status as student_status,
         u.phone,
         u.phone2,
         u.father_name,
         u.father_phone,
         u.address,
         u.age,
         u.subject,
         u.subject_id,
         u.group_id as student_group_id,
         u.group_name as student_group_name,
         u.teacher_id as student_teacher_id,
         u.teacher_name as student_teacher_name,
         u.course_status,
         TO_CHAR(u.course_start_date AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') as course_start_date,
         TO_CHAR(u.course_end_date AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') as course_end_date,
         g.id as group_id,
         g.name as group_name,
         s.name as subject_name,
         CONCAT(t.name, ' ', t.surname) as teacher_name,
         pt.created_by as admin_id,
         CONCAT(admin_user.name, ' ', admin_user.surname) as admin_full_name,
         admin_user.username as admin_username,
         pt.amount::float as amount,
         pt.payment_method,
         TO_CHAR(pt.created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') as payment_time
       FROM payment_transactions pt
       JOIN users u ON u.id = pt.student_id AND u.branch_id = pt.branch_id
       JOIN groups g ON g.id = pt.group_id AND g.branch_id = pt.branch_id
       LEFT JOIN subjects s ON s.id = g.subject_id
       LEFT JOIN users t ON t.id = g.teacher_id
       LEFT JOIN users admin_user ON admin_user.id = pt.created_by
       WHERE DATE(pt.created_at AT TIME ZONE 'Asia/Tashkent') = $1::date
         AND pt.branch_id = $2
       ORDER BY pt.created_at DESC`,
      [toDate, branchId]
    );

    const dailyNewStudentsResult = await client.query(
      `SELECT
         users.id as student_id,
         users.name,
         users.surname,
         users.username,
         users.status as student_status,
         users.phone,
         users.phone2,
         users.father_name,
         users.father_phone,
         users.address,
         users.age,
         users.subject,
         users.subject_id,
         s.name as subject_name,
         g.subject_id as group_subject_id,
         sg.name as group_subject_name,
         group_id as student_group_id,
         group_name as student_group_name,
         users.teacher_id as student_teacher_id,
         users.teacher_name as student_teacher_name,
         users.course_status,
         TO_CHAR(users.course_start_date AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') as course_start_date,
         TO_CHAR(users.course_end_date AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') as course_end_date,
         TO_CHAR(users.created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') as created_time
       FROM users
       LEFT JOIN subjects s ON s.id = users.subject_id
       LEFT JOIN groups g ON g.id = users.group_id
       LEFT JOIN subjects sg ON sg.id = g.subject_id
       WHERE users.role = 'student'
         AND users.branch_id = $2
         AND DATE(users.created_at AT TIME ZONE 'Asia/Tashkent') = $1::date
       ORDER BY users.created_at DESC`,
      [toDate, branchId]
    );

    const dailyNewStudents = dailyNewStudentsResult.rows;
    const groupedNewStudentsMap = new Map();
    for (const row of dailyNewStudents) {
      const subjectName =
        row.subject_name ||
        row.group_subject_name ||
        row.subject ||
        'Noma\'lum fan';
      const subjectId = row.subject_id || row.group_subject_id || null;
      const key = `${subjectId ?? 'null'}:${subjectName}`;
      if (!groupedNewStudentsMap.has(key)) {
        groupedNewStudentsMap.set(key, {
          subject_id: subjectId,
          subject_name: subjectName,
          count: 0,
          students: [],
        });
      }
      const group = groupedNewStudentsMap.get(key);
      group.count += 1;
      group.students.push(row);
    }

    const newStudentsGrouped = Array.from(groupedNewStudentsMap.values()).sort((a, b) =>
      String(a.subject_name).localeCompare(String(b.subject_name), 'uz')
    );

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
        daily: {
          date: toDate,
          payments_total_amount: Number(dailyPaymentTotalResult.rows[0]?.total_amount || 0),
          payments: dailyPaymentsResult.rows,
          new_students_grouped: newStudentsGrouped,
        },
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
    const branchId = getScopedBranchId(req);
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
       monthly_students AS (
         SELECT TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') AS month,
                COUNT(*)::int AS new_students_count
         FROM users
         WHERE role = 'student'
           AND branch_id = $5
           AND TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') BETWEEN $3 AND $4
         GROUP BY 1
       ),
       monthly_expenses AS (
         SELECT month,
                COUNT(*)::int AS expenses_count,
                COALESCE(SUM(amount), 0)::numeric AS expenses_amount
         FROM center_expenses
         WHERE month BETWEEN $3 AND $4
           AND branch_id = $5
         GROUP BY 1
       )
       SELECT m.month,
              COALESCE(s.new_students_count, 0)::int AS new_students_count,
              COALESCE(e.expenses_count, 0)::int AS expenses_count,
              COALESCE(e.expenses_amount, 0)::float AS expenses_amount
       FROM months m
       LEFT JOIN monthly_students s ON s.month = m.month
       LEFT JOIN monthly_expenses e ON e.month = m.month
       ORDER BY m.month ASC`,
      [fromDate, toDate, fromMonth, toMonth, branchId]
    );

    const points = result.rows;

    const summary = points.reduce((acc, row) => ({
      new_students_count: acc.new_students_count + Number(row.new_students_count || 0),
      expenses_count: acc.expenses_count + Number(row.expenses_count || 0),
      expenses_amount: acc.expenses_amount + Number(row.expenses_amount || 0),
    }), {
      new_students_count: 0,
      expenses_count: 0,
      expenses_amount: 0,
    });

    const statusDistResult = await client.query(
      `SELECT
         COUNT(CASE WHEN payment_status = 'paid' THEN 1 END)::int AS paid_count,
         COUNT(CASE WHEN payment_status = 'partial' THEN 1 END)::int AS partial_count,
         COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END)::int AS unpaid_count
       FROM monthly_snapshots
       WHERE month = $1 AND branch_id = $2`,
      [toMonth, branchId]
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
        new_students_count: points.map((p) => p.new_students_count),
        expenses_count: points.map((p) => p.expenses_count),
        expenses_amount: points.map((p) => Number(p.expenses_amount || 0)),
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
          new_students_count: Number((points.find((p) => p.month === toMonth) || {}).new_students_count || 0),
          expenses_count: Number((points.find((p) => p.month === toMonth) || {}).expenses_count || 0),
          expenses_amount: Number((points.find((p) => p.month === toMonth) || {}).expenses_amount || 0),
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
    const branchId = getScopedBranchId(req);
    const currentMonth = getCurrentMonth();

    const [overallResult, admissionsTrendResult] = await Promise.all([
      client.query(
        `SELECT
           (SELECT COUNT(*) FROM groups WHERE status = 'active' AND class_status = 'started' AND branch_id = $1)::int AS active_groups_count,
           (SELECT COUNT(*) FROM users WHERE role = 'teacher' AND status = 'active' AND branch_id = $1)::int AS active_teachers_count,
           (SELECT COUNT(*) FROM subjects WHERE branch_id = $1)::int AS subjects_count`,
        [branchId]
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
             AND branch_id = $1
             AND created_at >= date_trunc('month', CURRENT_DATE) - interval '11 months'
           GROUP BY 1
         )
         SELECT m.month, COALESCE(a.admissions_count, 0)::int AS admissions_count
         FROM months m
         LEFT JOIN admissions a ON a.month = m.month
         ORDER BY m.month`,
        [branchId]
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
    const branchId = getScopedBranchId(req);
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
           AND sd.branch_id = $3
           AND g.branch_id = $3
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
       JOIN users u ON sg.student_id = u.id AND u.branch_id = $3
       JOIN groups g ON sg.group_id = g.id AND g.branch_id = $3
       JOIN subjects s ON g.subject_id = s.id AND s.branch_id = $3
       LEFT JOIN student_discounts_calc sdc ON sg.student_id = sdc.student_id
                                             AND sg.group_id = sdc.group_id
       LEFT JOIN student_payments sp ON sg.student_id = sp.student_id
                                     AND sp.month = $1
                                     AND sp.group_id = sg.group_id
                                     AND sp.branch_id = $3
       WHERE sg.status = 'active'
         AND sg.branch_id = $3
         AND g.status = 'active'
         AND g.class_status = 'started'
         AND COALESCE(sp.paid_amount, 0) < GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0)
       ORDER BY debt_amount DESC
       LIMIT $2`,
      [currentMonth, limit, branchId]
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

const getRemovedStudents = async (req, res) => {
  try {
    const branchId = getScopedBranchId(req);
    const { month } = req.query;
    const currentMonth = isValidMonth(month) ? month : getCurrentMonth();
    const monthStart = `${currentMonth}-01`;

    const result = await pool.query(
      `SELECT
         sg.id,
         sg.student_id,
         sg.group_id,
         TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') as left_date,
         TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as left_at,
         COALESCE(
           (
             SELECT COUNT(DISTINCT l.date)
             FROM attendance a
             JOIN lessons l
               ON l.id = a.lesson_id
              AND l.branch_id = sg.branch_id
             WHERE a.student_id = sg.student_id
               AND a.group_id = sg.group_id
               AND a.branch_id = sg.branch_id
               AND a.status IN ('keldi', 'present')
               AND TO_CHAR(l.date, 'YYYY-MM') = $2
               AND (
                 l.date < COALESCE((sg.left_at AT TIME ZONE 'Asia/Tashkent')::date, CURRENT_DATE)
                 OR (
                   l.date = COALESCE((sg.left_at AT TIME ZONE 'Asia/Tashkent')::date, CURRENT_DATE)
                   AND COALESCE(l.start_time, '00:00:00'::time) <= COALESCE((sg.left_at AT TIME ZONE 'Asia/Tashkent')::time, CURRENT_TIME)
                 )
               )
           ),
           0
         )::int as attended_days_before_removal,
         u.name as student_name,
         u.surname as student_surname,
         u.phone as student_phone,
         g.name as group_name,
         s.name as subject_name,
         CONCAT(t.name, ' ', t.surname) as teacher_name
       FROM student_groups sg
       JOIN users u ON u.id = sg.student_id AND u.branch_id = sg.branch_id
       JOIN groups g ON g.id = sg.group_id AND g.branch_id = sg.branch_id
       LEFT JOIN subjects s ON s.id = g.subject_id AND s.branch_id = g.branch_id
       LEFT JOIN users t ON t.id = g.teacher_id AND t.branch_id = g.branch_id
       WHERE sg.branch_id = $1
         AND sg.status IN ('removed', 'stopped')
         AND TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') = $2
       ORDER BY sg.left_at DESC, u.surname ASC, u.name ASC`,
      [branchId, currentMonth]
    );

    return res.json({
      success: true,
      data: {
        month: currentMonth,
        total: result.rowCount,
        students: result.rows,
      },
    });
  } catch (error) {
    console.error('Removed students stats xatoligi:', error);
    return res.status(500).json({
      success: false,
      message: 'Guruhdan chiqarilgan talabalar ro\'yxatini olishda xatolik',
      errors: { detail: error.message },
    });
  }
};

const getAdmissionsStatistics = async (req, res) => {
  try {
    const branchId = getScopedBranchId(req);
    const { month } = req.query;
    const currentMonth = isValidMonth(month) ? month : getCurrentMonth();
    const monthStart = `${currentMonth}-01`;

    const admissionsQuery = `
        WITH admissions AS (
         SELECT
             u.id,
             u.name,
             u.surname,
             u.phone,
             u.created_at,
             TO_CHAR(u.created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS admission_date,
             'admission'::text AS record_type,
             u.admitted_by,
             COALESCE(
               NULLIF(BTRIM(u.admitted_by_name), ''),
               CONCAT_WS(' ', admin_u.name, admin_u.surname),
               'Noma''lum'
             ) AS admitted_by_name,
             u.followup_status,
             u.followup_note,
             u.followup_at,
             u.followup_by,
             u.followup_by_name,
             COALESCE(NULLIF(BTRIM(u.unassigned_reason), ''), 'Yangi qo''shilgan') AS unassigned_reason,
             u.subject_id,
             COALESCE(s.name, '') AS subject_name,
             u.group_id,
             u.group_name,
             u.teacher_id,
             u.teacher_name,
             u.course_status,
             u.course_start_date,
             u.course_end_date
           FROM users u
           LEFT JOIN users admin_u
             ON admin_u.id = u.admitted_by
            AND admin_u.branch_id = u.branch_id
           LEFT JOIN subjects s
             ON s.id = u.subject_id
            AND s.branch_id = u.branch_id
           WHERE u.role = 'student'
             AND u.branch_id = $1
             AND TO_CHAR(u.created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') = $2
         ),
         removed_memberships AS (
         SELECT DISTINCT ON (sg.student_id, sg.group_id)
            u.id,
            u.name,
            u.surname,
            u.phone,
             sg.left_at AS created_at,
             TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS admission_date,
             u.admitted_by,
             COALESCE(
               NULLIF(BTRIM(u.admitted_by_name), ''),
               CONCAT_WS(' ', admin_u.name, admin_u.surname),
               'Noma''lum'
             ) AS admitted_by_name,
             COALESCE(NULLIF(BTRIM(sg.left_reason), ''), NULLIF(BTRIM(u.unassigned_reason), ''), 'Sabab ko''rsatilmagan') AS unassigned_reason,
             sg.group_id,
             g.name AS group_name,
             g.teacher_id,
             CONCAT_WS(' ', t.name, t.surname) AS teacher_name,
             u.course_status,
             u.course_start_date,
             u.course_end_date,
             TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS removed_at
           FROM student_groups sg
           JOIN users u
             ON u.id = sg.student_id
            AND u.branch_id = sg.branch_id
           LEFT JOIN users admin_u
             ON admin_u.id = u.admitted_by
            AND admin_u.branch_id = u.branch_id
           JOIN groups g
             ON g.id = sg.group_id
            AND g.branch_id = sg.branch_id
           LEFT JOIN users t
             ON t.id = g.teacher_id
            AND t.branch_id = sg.branch_id
           WHERE sg.branch_id = $1
             AND sg.status IN ('removed', 'stopped', 'finished')
             AND sg.left_at IS NOT NULL
             AND TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') = $2
           ORDER BY sg.student_id, sg.group_id, sg.left_at DESC NULLS LAST, sg.id DESC
         ),
         active_memberships AS (
           SELECT DISTINCT ON (sg.student_id)
             sg.student_id,
             sg.group_id,
             sg.status AS membership_status,
             TO_CHAR(sg.joined_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS joined_date,
             g.name AS active_group_name,
             COALESCE(s.name, '') AS active_subject_name,
             CONCAT_WS(' ', t.name, t.surname) AS active_teacher_name
           FROM student_groups sg
           JOIN groups g
             ON g.id = sg.group_id
            AND g.branch_id = sg.branch_id
           LEFT JOIN subjects s
             ON s.id = g.subject_id
           LEFT JOIN users t
             ON t.id = g.teacher_id
            AND t.branch_id = sg.branch_id
           WHERE sg.branch_id = $1
             AND sg.status = 'active'
           ORDER BY sg.student_id, sg.joined_at DESC NULLS LAST, sg.id DESC
         ),
         closed_memberships AS (
           SELECT DISTINCT ON (sg.student_id)
             sg.student_id,
             sg.group_id,
             sg.status AS membership_status,
             TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS left_at,
             g.name AS closed_group_name,
             COALESCE(s.name, '') AS closed_subject_name,
             CONCAT_WS(' ', t.name, t.surname) AS closed_teacher_name
           FROM student_groups sg
           JOIN groups g
             ON g.id = sg.group_id
            AND g.branch_id = sg.branch_id
           LEFT JOIN subjects s
             ON s.id = g.subject_id
           LEFT JOIN users t
             ON t.id = g.teacher_id
            AND t.branch_id = sg.branch_id
          WHERE sg.branch_id = $1
             AND sg.status IN ('removed', 'stopped', 'finished')
             AND sg.left_at IS NOT NULL
             AND TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') = $2
          ORDER BY sg.student_id, sg.left_at DESC NULLS LAST, sg.id DESC
         )
         SELECT
           a.id,
           a.name,
           a.surname,
           a.phone,
           a.admission_date,
          a.created_at,
          a.record_type,
          a.admitted_by,
          a.admitted_by_name,
          a.followup_status,
          a.followup_note,
          a.followup_at,
          a.followup_by,
          a.followup_by_name,
          a.unassigned_reason,
          a.subject_id,
          a.subject_name,
          a.group_id,
          a.group_name,
          a.teacher_id,
          a.teacher_name,
          a.course_status,
           a.course_start_date,
           a.course_end_date,
           am.group_id AS active_group_id,
           am.active_group_name,
           am.active_subject_name,
           am.active_teacher_name,
           am.membership_status AS active_membership_status,
           am.joined_date AS active_joined_date,
           cm.group_id AS closed_group_id,
           cm.closed_group_name,
           cm.closed_subject_name,
           cm.closed_teacher_name,
           cm.membership_status AS closed_membership_status,
           cm.left_at AS closed_left_at
        FROM admissions a
         LEFT JOIN active_memberships am ON am.student_id = a.id
         LEFT JOIN closed_memberships cm ON cm.student_id = a.id
      `;

    const groupJoinsQuery = `
        WITH group_joins AS (
          SELECT DISTINCT ON (sg.student_id, sg.group_id)
            CONCAT(sg.student_id, '-join-', sg.group_id, '-', TO_CHAR(sg.joined_at AT TIME ZONE 'Asia/Tashkent', 'YYYYMMDDHH24MI')) AS id,
            u.name,
            u.surname,
            u.phone,
            sg.joined_at AS created_at,
            TO_CHAR(sg.joined_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS admission_date,
            'group_join'::text AS record_type,
            sg.joined_by AS admitted_by,
            COALESCE(
              NULLIF(BTRIM(sg.joined_by_name), ''),
              CONCAT_WS(' ', join_admin.name, join_admin.surname),
              'Noma''lum'
            ) AS admitted_by_name,
            u.followup_status,
            u.followup_note,
            u.followup_at,
            u.followup_by,
            u.followup_by_name,
            COALESCE(NULLIF(BTRIM(u.unassigned_reason), ''), 'Guruhga biriktirilgan') AS unassigned_reason,
            sg.group_id,
            g.name AS group_name,
            COALESCE(s.name, '') AS subject_name,
            g.teacher_id,
            CONCAT_WS(' ', t.name, t.surname) AS teacher_name,
            u.course_status,
            u.course_start_date,
            u.course_end_date,
            TO_CHAR(sg.joined_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS joined_at,
            EXISTS (
              SELECT 1
              FROM student_groups prev
              WHERE prev.student_id = sg.student_id
                AND prev.branch_id = sg.branch_id
                AND prev.group_id = sg.group_id
                AND prev.status IN ('removed', 'stopped', 'finished')
                AND prev.left_at IS NOT NULL
                AND prev.left_at < sg.joined_at
            ) AS is_rejoined
          FROM student_groups sg
          JOIN users u
            ON u.id = sg.student_id
           AND u.branch_id = sg.branch_id
          LEFT JOIN users join_admin
            ON join_admin.id = sg.joined_by
           AND join_admin.branch_id = sg.branch_id
          JOIN groups g
            ON g.id = sg.group_id
           AND g.branch_id = sg.branch_id
          LEFT JOIN subjects s
            ON s.id = g.subject_id
          LEFT JOIN users t
            ON t.id = g.teacher_id
           AND t.branch_id = sg.branch_id
          WHERE sg.branch_id = $1
            AND sg.status = 'active'
            AND sg.joined_at IS NOT NULL
            AND TO_CHAR(sg.joined_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') = $2
            AND u.created_at < $3::date
          ORDER BY sg.student_id, sg.group_id, sg.joined_at DESC NULLS LAST, sg.id DESC
        )
        SELECT
          g.id,
          g.name,
          g.surname,
          g.phone,
          g.admission_date,
          g.created_at,
          g.record_type,
          g.admitted_by,
          g.admitted_by_name,
          g.followup_status,
          g.followup_note,
          g.followup_at,
          g.followup_by,
          g.followup_by_name,
          g.unassigned_reason,
          g.group_id,
          g.group_name,
          g.subject_name,
          g.teacher_id,
          g.teacher_name,
          g.course_status,
          g.course_start_date,
          g.course_end_date,
          g.is_rejoined,
          NULL::int AS active_group_id,
          NULL::text AS active_group_name,
          NULL::text AS active_subject_name,
          NULL::text AS active_teacher_name,
          NULL::text AS active_membership_status,
          NULL::text AS active_joined_date,
          g.group_id AS closed_group_id,
          g.group_name AS closed_group_name,
          g.subject_name AS closed_subject_name,
          g.teacher_name AS closed_teacher_name,
          'active'::text AS closed_membership_status,
          g.joined_at AS closed_left_at
        FROM group_joins g
        ORDER BY created_at DESC, surname ASC, name ASC`;

    const removedQuery = `
        WITH removed_memberships AS (
          SELECT DISTINCT ON (sg.student_id, sg.group_id)
            u.id,
            u.name,
            u.surname,
            u.phone,
            sg.left_at AS created_at,
            TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS admission_date,
            'removed'::text AS record_type,
            u.admitted_by,
            COALESCE(
              NULLIF(BTRIM(u.admitted_by_name), ''),
              CONCAT_WS(' ', admin_u.name, admin_u.surname),
              'Noma''lum'
            ) AS admitted_by_name,
            sg.left_by,
            COALESCE(
              NULLIF(BTRIM(sg.left_by_name), ''),
              CONCAT_WS(' ', left_admin.name, left_admin.surname)
            ) AS left_by_name,
            sg.followup_status,
            sg.followup_note,
            sg.followup_at,
            sg.followup_by,
            sg.followup_by_name,
            COALESCE(NULLIF(BTRIM(sg.left_reason), ''), NULLIF(BTRIM(u.unassigned_reason), ''), 'Sabab ko''rsatilmagan') AS unassigned_reason,
            sg.group_id,
            g.name AS group_name,
            COALESCE(s.name, '') AS subject_name,
            g.teacher_id,
            CONCAT_WS(' ', t.name, t.surname) AS teacher_name,
            u.course_status,
            u.course_start_date,
            u.course_end_date,
            TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD HH24:MI') AS removed_at
          FROM student_groups sg
          JOIN users u
            ON u.id = sg.student_id
           AND u.branch_id = sg.branch_id
          LEFT JOIN users admin_u
            ON admin_u.id = u.admitted_by
           AND admin_u.branch_id = u.branch_id
          LEFT JOIN users left_admin
            ON left_admin.id = sg.left_by
           AND left_admin.branch_id = sg.branch_id
          JOIN groups g
            ON g.id = sg.group_id
           AND g.branch_id = sg.branch_id
          LEFT JOIN subjects s
            ON s.id = g.subject_id
          LEFT JOIN users t
            ON t.id = g.teacher_id
           AND t.branch_id = sg.branch_id
          WHERE sg.branch_id = $1
            AND sg.status IN ('removed', 'stopped', 'finished')
            AND sg.left_at IS NOT NULL
            AND TO_CHAR(sg.left_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') = $2
            AND NOT EXISTS (
              SELECT 1
              FROM student_groups sg_rejoin
              WHERE sg_rejoin.student_id = sg.student_id
                AND sg_rejoin.branch_id = sg.branch_id
                AND sg_rejoin.status = 'active'
                AND sg_rejoin.joined_at IS NOT NULL
                AND sg_rejoin.joined_at > sg.left_at
            )
          ORDER BY sg.student_id, sg.group_id, sg.left_at DESC NULLS LAST, sg.id DESC
        )
         SELECT
          r.id,
          r.name,
          r.surname,
          r.phone,
          r.admission_date,
          r.created_at,
          r.record_type,
          r.admitted_by,
          r.admitted_by_name,
          r.left_by,
          r.left_by_name,
          r.followup_status,
          r.followup_note,
          r.followup_at,
          r.followup_by,
          r.followup_by_name,
          r.unassigned_reason,
          r.group_id,
          r.group_name,
          r.subject_name,
          r.teacher_id,
          r.teacher_name,
          r.course_status,
          r.course_start_date,
          r.course_end_date,
          NULL::int AS active_group_id,
          NULL::text AS active_group_name,
          NULL::text AS active_subject_name,
          NULL::text AS active_teacher_name,
          NULL::text AS active_membership_status,
          NULL::text AS active_joined_date,
          r.group_id AS closed_group_id,
          r.group_name AS closed_group_name,
          NULL::text AS closed_subject_name,
          r.teacher_name AS closed_teacher_name,
          'removed'::text AS closed_membership_status,
          r.removed_at AS closed_left_at
        FROM removed_memberships r
         ORDER BY created_at DESC, surname ASC, name ASC`;

    const [admissionsResult, groupJoinsResult, removedResult, adminsResult] = await Promise.all([
      pool.query(admissionsQuery, [branchId, currentMonth]),
      pool.query(groupJoinsQuery, [branchId, currentMonth, monthStart]),
      pool.query(removedQuery, [branchId, currentMonth]),
      pool.query(
        `SELECT
           u.id,
           CONCAT_WS(' ', u.name, u.surname) AS admin_name
         FROM users u
         WHERE u.role = 'admin'
           AND u.branch_id = $1
           AND COALESCE(u.status, 'active') = 'active'
         ORDER BY admin_name ASC
         LIMIT 3`,
        [branchId]
      ),
    ]);

    const callReasonPattern = /(chaqir|gaplash|qayta|aloqa|bog'lan|boglan|telefon|muloqot|kelmadi|kelmay)/i;
    const resolvedReasonPattern = /(hal bo'ldi|hal qilindi|qabul qilindi|o'qiydi|o'qimoqda|guruhga biriktir|biriktirilgan|qo'shil|qo'shildi|davom etadi|qoladi)/i;
    const newReasonPattern = /(yangi|qo'shil|qabul)/i;

    const classifyAdmission = (row) => {
      const reasonText = String(row.unassigned_reason || '').trim();
      const followupStatus = String(row.followup_status || '').trim();
      const isRemovedRecord = String(row.record_type || '').toLowerCase() === 'removed';
      const isGrouped = Boolean(row.active_group_id || row.active_group_name) || row.course_status === 'in_progress';
      const isRemoved = isRemovedRecord || Boolean(row.closed_group_id || row.closed_group_name) || ['removed', 'stopped', 'finished', 'dropped', 'completed'].includes(String(row.course_status || '').toLowerCase());
      const isCalled = followupStatus === 'called_unresolved' || followupStatus === 'called_resolved' || callReasonPattern.test(reasonText);
      const isCalledResolved = isCalled && resolvedReasonPattern.test(reasonText);
      const isCalledUnresolved = followupStatus === 'called_unresolved' || (isCalled && !resolvedReasonPattern.test(reasonText));
      const isNew = !isGrouped && !isRemoved && newReasonPattern.test(reasonText);

      let status = 'unresolved';
      if (isRemoved) {
        status = 'removed';
      } else if (isGrouped) {
        status = 'grouped';
      } else if (isCalledResolved) {
        status = 'called_resolved';
      } else if (isCalledUnresolved) {
        status = 'called_unresolved';
      } else if (isNew) {
        status = 'new';
      }

        return {
        id: row.id,
        name: `${row.name} ${row.surname}`.trim(),
        phone: row.phone || '',
        date: row.admission_date,
        record_type: row.record_type || 'admission',
        admitted_by: row.admitted_by,
        admin_name: isRemovedRecord
          ? row.left_by_name || 'Noma\'lum'
          : row.admitted_by_name || 'Noma\'lum',
        admin_id: isRemovedRecord ? row.left_by || row.admitted_by || null : row.admitted_by || null,
        group_id: row.group_id || row.active_group_id || row.closed_group_id || null,
        active_group_id: row.active_group_id || row.group_id || null,
        closed_group_id: row.closed_group_id || row.group_id || null,
        followup_status: followupStatus || null,
        followup_note: row.followup_note || null,
        followup_at: row.followup_at || null,
        followup_by: row.followup_by || null,
        followup_by_name: row.followup_by_name || null,
        status,
        group: row.active_group_name || row.group_name || row.closed_group_name || null,
        subject: row.active_subject_name || row.subject_name || row.closed_subject_name || null,
        teacher: row.active_teacher_name || row.teacher_name || row.closed_teacher_name || null,
        is_rejoined: Boolean(row.is_rejoined),
        note:
          status === 'grouped'
            ? 'Guruhga biriktirilgan'
            : status === 'removed'
              ? 'Guruhdan chiqarilgan'
              : status === 'called_unresolved'
                ? 'Gaplashildi, hal bo\'lmadi'
                : status === 'called_resolved'
                  ? 'Gaplashildi, hal bo\'ldi'
                : status === 'new'
                  ? 'Yangi kelgan'
                  : 'Hali guruh tanlanmagan',
        reason: reasonText,
        current_status: row.course_status || 'not_started',
        subject_id: row.subject_id || null,
        removed_by: isRemovedRecord ? row.left_by || null : null,
        removed_by_name: isRemovedRecord ? row.left_by_name || null : null,
      };
    };

    const summarize = (items) => {
      const grouped = items.filter((item) => item.status === 'grouped').length;
      const unresolved = items.filter((item) => item.status === 'unresolved').length;
      const removed = items.filter((item) => item.status === 'removed').length;
      const calledUnresolved = items.filter((item) => item.status === 'called_unresolved').length;
      const calledResolved = items.filter((item) => item.status === 'called_resolved').length;
      const newCount = items.filter((item) => item.status === 'new').length;

      return {
        total: items.length,
        grouped,
        unresolved,
        calledUnresolved,
        calledResolved,
        removed,
        new: newCount,
        unassigned: unresolved + calledUnresolved,
      };
    };

    const mergedById = new Map();

    const mergeRow = (row) => {
      if (!row?.id) return;
      const key = `${String(row.record_type || 'unknown')}:${String(row.id)}:${String(row.group_id || '')}:${String(row.created_at || '')}`;
      const prev = mergedById.get(key);
      const prevPriority = prev?.record_type === 'removed' ? 2 : 1;
      const nextPriority = row.record_type === 'removed' ? 2 : 1;

      if (!prev) {
        mergedById.set(key, row);
        return;
      }

      if (nextPriority > prevPriority) {
        mergedById.set(key, row);
        return;
      }

      if (nextPriority === prevPriority) {
        const prevTs = new Date(prev.created_at || 0).getTime();
        const nextTs = new Date(row.created_at || 0).getTime();
        if (Number.isFinite(nextTs) && nextTs >= prevTs) {
          mergedById.set(key, row);
        }
      }
    };

    (admissionsResult.rows || []).forEach(mergeRow);
    (groupJoinsResult?.rows || []).forEach(mergeRow);
    (removedResult.rows || []).forEach(mergeRow);

    const students = Array.from(mergedById.values()).map(classifyAdmission);
    const admissionsOnly = students.filter((item) => item.record_type === 'admission');
    const summary = summarize(admissionsOnly);

    const admins = (adminsResult.rows || []).map((admin) => {
      const admittedItems = admissionsOnly.filter((student) => Number(student.admin_id) === Number(admin.id));
      const adminSummary = summarize(admittedItems);
      return {
        id: admin.id,
        name: admin.admin_name,
        ...adminSummary,
      };
    });

    return res.json({
      success: true,
      data: {
        month: currentMonth,
        summary,
        admins,
        students,
      },
    });
  } catch (error) {
    console.error('Qabul statistikasi xatoligi:', error);
    return res.status(500).json({
      success: false,
      message: 'Qabul statistikalarini olishda xatolik yuz berdi',
      errors: { detail: error.message },
    });
  }
};

const markAdmissionFollowup = async (req, res) => {
  const client = await pool.connect();

  try {
    const branchId = getScopedBranchId(req);
    const studentId = Number(req.body?.student_id);
    const groupIdRaw = req.body?.group_id;
    const groupId = groupIdRaw === undefined || groupIdRaw === null || groupIdRaw === ''
      ? null
      : Number(groupIdRaw);
    const status = String(req.body?.status || 'called_unresolved').trim();
    const note = String(req.body?.note || '').trim() || null;

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'student_id noto\'g\'ri',
      });
    }

    if (!['called_unresolved', 'called_resolved'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status noto\'g\'ri',
      });
    }

    const adminName = [req.user?.name, req.user?.surname].filter(Boolean).join(' ').trim() || 'Noma\'lum';

    let resolvedGroupId = Number.isInteger(groupId) && groupId > 0 ? groupId : null;
    if (!resolvedGroupId) {
      const membershipLookup = await client.query(
        `SELECT group_id
           FROM student_groups
          WHERE student_id = $1
            AND branch_id = $2
          ORDER BY left_at DESC NULLS LAST, joined_at DESC NULLS LAST, id DESC
          LIMIT 1`,
        [studentId, branchId]
      );
      const lookupGroupId = Number(membershipLookup.rows[0]?.group_id);
      if (Number.isInteger(lookupGroupId) && lookupGroupId > 0) {
        resolvedGroupId = lookupGroupId;
      }
    }

    const userResult = await client.query(
      `UPDATE users
       SET followup_status = $1,
           followup_note = $2,
           followup_at = NOW(),
           followup_by = $3,
           followup_by_name = $4
       WHERE id = $5
         AND branch_id = $6
       RETURNING id, followup_status, followup_note, followup_at, followup_by, followup_by_name`,
      [status, note, req.user.id, adminName, studentId, branchId]
    );

    let membershipResult = { rowCount: 0, rows: [] };

    if (resolvedGroupId) {
      membershipResult = await client.query(
        `UPDATE student_groups
         SET followup_status = $1,
             followup_note = $2,
             followup_at = NOW(),
             followup_by = $3,
             followup_by_name = $4
        WHERE student_id = $5
          AND group_id = $6
          AND branch_id = $7
         RETURNING id, student_id, group_id, followup_status, followup_note, followup_at, followup_by, followup_by_name`,
        [status, note, req.user.id, adminName, studentId, resolvedGroupId, branchId]
      );
    }

    return res.json({
      success: true,
      data: {
        user: userResult.rows[0] || null,
        membership: membershipResult.rows[0] || null,
      },
    });
  } catch (error) {
    console.error('Gaplashilgan holatini belgilashda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Gaplashilgan holatini saqlashda xatolik yuz berdi',
      errors: { detail: error.message },
    });
  } finally {
    client.release();
  }
};

// Tizim ish boshlagan oy (bazadagi eng birinchi foydalanuvchi/guruh sanasi) —
// mobil ilovadagi oy filtrlarini shu oydan boshlash uchun
const getSystemStartMonth = async (req, res) => {
  try {
    const branchId = getScopedBranchId(req);
    const result = await pool.query(`
      SELECT TO_CHAR(
        LEAST(
          COALESCE((SELECT MIN(created_at) FROM users WHERE branch_id = $1), CURRENT_TIMESTAMP),
          COALESCE((SELECT MIN(created_at) FROM groups WHERE branch_id = $1), CURRENT_TIMESTAMP)
        ),
        'YYYY-MM'
      ) AS start_month
    `, [branchId]);
    return res.json({
      success: true,
      data: { start_month: result.rows[0]?.start_month || null },
    });
  } catch (error) {
    console.error('System start month xatoligi:', error);
    return res.status(500).json({
      success: false,
      message: 'Boshlanish oyini olishda xatolik',
      error: error.message,
    });
  }
};

const getSuperAdminStats = async (req, res) => {
  const client = await pool.connect();

  try {
    const branchId = getScopedBranchId(req);
    const qMonth = req.query.month;
    const currentMonth = qMonth && isValidMonth(qMonth) ? qMonth : getCurrentMonth();
    const [monthlyResult, subjectsResult, overallResult, studentsResult, expenseCategoriesResult] = await Promise.all([
      client.query(
        `WITH monthly_revenue AS (
           SELECT COALESCE(SUM(amount), 0)::numeric AS total_revenue
           FROM payment_transactions
           WHERE month = $1
             AND branch_id = $2
         ),
         monthly_expenses AS (
           SELECT COALESCE(SUM(amount), 0)::numeric AS total_expenses
           FROM center_expenses
           WHERE month = $1
             AND branch_id = $2
         ),
         monthly_new_students AS (
           SELECT COUNT(*)::int AS new_students_count
           FROM users
           WHERE role = 'student'
             AND branch_id = $2
             AND TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM') = $1
         ),
         monthly_discounts AS (
           SELECT COALESCE(SUM(CASE WHEN COALESCE(discount_amount, 0) > 0 THEN discount_amount ELSE 0 END), 0)::numeric AS total_discounts
           FROM monthly_snapshots
           WHERE month = $1
             AND branch_id = $2
         ),
         teacher_salary_monthly AS (
           -- Faqat YOPILGAN (oylik oldi deb belgilangan) teacher oyliklari.
           -- Taxminiy % hisob emas: /admin/teachers-payments sahifasida
           -- "oylikni yopish" qilinganda teacher_monthly_salaries jadvaliga
           -- is_closed = true bo'lib yoziladi — shu summa ko'rsatiladi.
           SELECT COALESCE(
             SUM(COALESCE(tms.close_expected_salary, tms.expected_salary, 0)),
             0
           )::numeric AS total_teacher_salary
           FROM teacher_monthly_salaries tms
           WHERE tms.month_name = $1
             AND tms.branch_id = $2
             AND tms.is_closed = true
         ),
         admin_salary_monthly AS (
           -- Adminlarga shu oy uchun to'langan oyliklar
           SELECT COALESCE(SUM(amount), 0)::numeric AS total_admin_salary
           FROM admin_salary_payouts
           WHERE month_name = $1
             AND branch_id = $2
         )
         SELECT
           (SELECT total_revenue FROM monthly_revenue)::float AS total_revenue,
           (SELECT total_teacher_salary FROM teacher_salary_monthly)::float AS total_teacher_salary,
           (SELECT total_admin_salary FROM admin_salary_monthly)::float AS total_admin_salary,
           (SELECT total_expenses FROM monthly_expenses)::float AS total_expenses,
           (SELECT new_students_count FROM monthly_new_students)::int AS new_students_count,
           (SELECT total_discounts FROM monthly_discounts)::float AS total_discounts`,
        [currentMonth, branchId]
      ),
      client.query(
         `WITH students_by_subject AS (
           SELECT
             g.subject_id,
             COUNT(*)::int AS total_students_count
           FROM student_groups sg
           JOIN users student_user
             ON student_user.id = sg.student_id
            AND student_user.role = 'student'
            AND student_user.branch_id = sg.branch_id
           JOIN groups g ON g.id = sg.group_id AND g.branch_id = sg.branch_id
           WHERE sg.status = 'active'
             AND sg.branch_id = $2
             AND g.subject_id IS NOT NULL
           GROUP BY g.subject_id
         ),
         revenue_by_subject AS (
           SELECT
             g.subject_id,
             COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0)::numeric AS total_revenue,
             -- Yig'ilishi kerak bo'lgan summa (chegirma hisobga olingan) —
             -- to'lov progres chizig'i shu ikkisining nisbatidan chiziladi
             COALESCE(SUM(GREATEST(COALESCE(ms.required_amount, 0) - COALESCE(ms.discount_amount, 0), 0)), 0)::numeric AS total_required
           FROM monthly_snapshots ms
           JOIN groups g ON g.id = ms.group_id AND g.branch_id = $2
           WHERE ms.month = $1
             AND ms.branch_id = $2
             AND COALESCE(ms.monthly_status, 'active') = 'active'
           GROUP BY g.subject_id
         ),
         teacher_student_counts AS (
           SELECT
             g.subject_id,
             g.teacher_id,
             CONCAT_WS(' ', u.surname, u.name) AS teacher_name,
             COUNT(*)::int AS total_students_count
           FROM student_groups sg
           JOIN users student_user
             ON student_user.id = sg.student_id
            AND student_user.role = 'student'
            AND student_user.branch_id = sg.branch_id
           JOIN groups g ON g.id = sg.group_id AND g.branch_id = sg.branch_id
           LEFT JOIN users u ON u.id = g.teacher_id AND u.branch_id = $2
           WHERE sg.status = 'active'
             AND sg.branch_id = $2
             AND g.teacher_id IS NOT NULL
           GROUP BY g.subject_id, g.teacher_id, u.surname, u.name
         ),
         teacher_revenue AS (
           SELECT
             g.subject_id,
             g.teacher_id,
             COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0)::numeric AS total_revenue,
             COALESCE(SUM(GREATEST(COALESCE(ms.required_amount, 0) - COALESCE(ms.discount_amount, 0), 0)), 0)::numeric AS total_required
           FROM monthly_snapshots ms
           JOIN groups g ON g.id = ms.group_id AND g.branch_id = $2
           WHERE ms.month = $1
             AND ms.branch_id = $2
             AND COALESCE(ms.monthly_status, 'active') = 'active'
             AND g.status = 'active'
             AND g.class_status = 'started'
             AND g.teacher_id IS NOT NULL
           GROUP BY g.subject_id, g.teacher_id
         ),
         teacher_subject_stats AS (
           SELECT
             tsc.subject_id,
             tsc.teacher_id,
             tsc.teacher_name,
             tsc.total_students_count,
             COALESCE(tr.total_revenue, 0)::numeric AS total_revenue,
             COALESCE(tr.total_required, 0)::numeric AS total_required
           FROM teacher_student_counts tsc
           LEFT JOIN teacher_revenue tr
             ON tr.subject_id = tsc.subject_id
            AND tr.teacher_id = tsc.teacher_id
         ),
         teachers_by_subject AS (
           SELECT
             subject_id,
             json_agg(
               json_build_object(
                 'teacher_id', teacher_id,
                 'teacher_name', teacher_name,
                 'total_students_count', total_students_count,
                 'total_revenue', total_revenue,
                 'total_required', total_required
               )
               ORDER BY teacher_name
             ) AS teachers
           FROM teacher_subject_stats
           GROUP BY subject_id
         )
         SELECT
           s.id AS subject_id,
           s.name AS subject_name,
           COALESCE(sb.total_students_count, 0)::int AS total_students_count,
           COALESCE(rb.total_revenue, 0)::float AS total_revenue,
           COALESCE(rb.total_required, 0)::float AS total_required,
           COALESCE(json_array_length(tb.teachers), 0)::int AS teachers_count,
           COALESCE(tb.teachers, '[]'::json) AS teachers
         FROM subjects s
         LEFT JOIN students_by_subject sb ON sb.subject_id = s.id
         LEFT JOIN revenue_by_subject rb ON rb.subject_id = s.id
         LEFT JOIN teachers_by_subject tb ON tb.subject_id = s.id
         WHERE s.branch_id = $2
         ORDER BY total_revenue DESC, total_students_count DESC, s.name ASC`,
        [currentMonth, branchId]
      ),
      client.query(
        `SELECT
           (SELECT COUNT(*) FROM users WHERE role = 'student' AND status = 'finished' AND branch_id = $1)::int AS finished_students_count,
           (SELECT COUNT(*) FROM users WHERE role = 'student' AND status NOT IN ('active', 'finished') AND branch_id = $1)::int AS inactive_students_count,
           (SELECT COUNT(*) FROM users WHERE role = 'teacher' AND branch_id = $1)::int AS total_teachers_count`,
        [branchId]
      ),
      // Talabalar tafsiloti — admin panel students sahifasi bilan AYNAN bir xil
      // hisob: bitta talaba ikkita guruhda o'qisa u ikki marta sanaladi
      // (davomat va oylik to'lovlar jadvali ham shunday yuritiladi).
      client.query(
        `SELECT
           (SELECT COUNT(*)
              FROM users u
              LEFT JOIN student_groups sg ON sg.student_id = u.id AND sg.branch_id = u.branch_id
             WHERE u.role = 'student'
               AND u.branch_id = $2)::int AS total_students,
           (SELECT COUNT(*)
              FROM student_groups sg
              JOIN users u ON u.id = sg.student_id AND u.role = 'student' AND u.branch_id = sg.branch_id
             WHERE sg.status = 'active'
               AND sg.branch_id = $2)::int AS active_students,
           (SELECT COUNT(*)
              FROM student_groups sg
              JOIN users u ON u.id = sg.student_id AND u.role = 'student' AND u.branch_id = sg.branch_id
             WHERE sg.status = 'stopped'
               AND sg.branch_id = $2)::int AS stopped_students,
           (SELECT COUNT(*)
              FROM student_groups sg
              JOIN users u ON u.id = sg.student_id AND u.role = 'student' AND u.branch_id = sg.branch_id
             WHERE sg.status = 'finished'
               AND sg.branch_id = $2)::int AS finished_students,
           (SELECT COUNT(*)
              FROM users u
             WHERE u.role = 'student'
               AND u.branch_id = $2
               AND NOT EXISTS (
                 SELECT 1 FROM student_groups sg2 WHERE sg2.student_id = u.id AND sg2.branch_id = u.branch_id
               ))::int AS unassigned_students,
           (SELECT COUNT(*)
              FROM monthly_snapshots ms
             WHERE ms.month = $1
               AND ms.branch_id = $2)::int AS snapshot_students,
           (SELECT COUNT(*)
              FROM student_groups sg
              JOIN users u ON u.id = sg.student_id AND u.role = 'student' AND u.branch_id = sg.branch_id
              JOIN groups g ON g.id = sg.group_id AND g.branch_id = sg.branch_id
             WHERE sg.status = 'active'
               AND sg.branch_id = $2)::int AS active_attendance_students`,
        [currentMonth, branchId]
      ),
      // Rasxodlar kategoriyalar kesimida (kategoriyasiz rasxodlar "Boshqa")
      client.query(
        `SELECT
           COALESCE(ec.name, 'Boshqa') AS category_name,
           COALESCE(SUM(ce.amount), 0)::float AS total
         FROM center_expenses ce
         LEFT JOIN expense_categories ec ON ec.id = ce.category_id AND ec.branch_id = ce.branch_id
         WHERE ce.month = $1
           AND ce.branch_id = $2
         GROUP BY COALESCE(ec.name, 'Boshqa')
         ORDER BY total DESC`,
        [currentMonth, branchId]
      ),
    ]);

    const monthly = monthlyResult.rows[0] || {};
    const subjects = subjectsResult.rows || [];
    const overall = overallResult.rows[0] || {};
    const studentsRow = studentsResult.rows[0] || {};
    const totalStudentsFromSubjects = subjects.reduce(
      (sum, row) => sum + toNumber(row.total_students_count),
      0
    );

    const totalRevenue = toNumber(monthly.total_revenue);
    const totalTeacherSalary = toNumber(monthly.total_teacher_salary);
    const totalAdminSalary = toNumber(monthly.total_admin_salary);
    const totalExpenses = toNumber(monthly.total_expenses);
    const totalDiscounts = toNumber(monthly.total_discounts);
    const netProfit =
      totalRevenue - totalTeacherSalary - totalAdminSalary - totalExpenses - totalDiscounts;

    return res.json({
      success: true,
      data: {
        monthly: {
          current_month: currentMonth,
          total_revenue: totalRevenue,
          total_teacher_salary: totalTeacherSalary,
          total_admin_salary: totalAdminSalary,
          total_expenses: totalExpenses,
          new_students_count: toNumber(monthly.new_students_count),
          total_discounts: totalDiscounts,
          net_profit: netProfit,
          expenses_by_category: (expenseCategoriesResult.rows || []).map((row) => ({
            category_name: row.category_name,
            total: toNumber(row.total),
          })),
        },
        subjects: subjects.map((row) => ({
          subject_id: row.subject_id,
          subject_name: row.subject_name,
          total_students_count: toNumber(row.total_students_count),
          total_revenue: toNumber(row.total_revenue),
          total_required: toNumber(row.total_required),
          teachers_count: toNumber(row.teachers_count),
          teachers: Array.isArray(row.teachers)
            ? row.teachers
            : (() => {
                try {
                  return row.teachers ? JSON.parse(row.teachers) : [];
                } catch {
                  return [];
                }
              })(),
        })),
        overall: {
          total_students_count: totalStudentsFromSubjects,
          finished_students_count: toNumber(overall.finished_students_count),
          inactive_students_count: toNumber(overall.inactive_students_count),
          total_teachers_count: toNumber(overall.total_teachers_count),
        },
        students: {
          total_students: toNumber(studentsRow.total_students),
          active_students: toNumber(studentsRow.active_students),
          stopped_students: toNumber(studentsRow.stopped_students),
          finished_students: toNumber(studentsRow.finished_students),
          unassigned_students: toNumber(studentsRow.unassigned_students),
          snapshot_students: toNumber(studentsRow.snapshot_students),
          active_attendance_students: toNumber(studentsRow.active_attendance_students),
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
  getRemovedStudents,
  getAdmissionsStatistics,
  markAdmissionFollowup,
  getSuperAdminStats,
  getSystemStartMonth,
};
