const pool = require('../config/db');

const MONTH_RE = /^\d{4}-\d{2}$/;

const isValidMonth = (v) => MONTH_RE.test(v);
const toNum = (v) => Number(v || 0);
const round2 = (v) => Number(toNum(v).toFixed(2));

const canAccessTeacherData = (reqUser, teacherId) => {
  if (!reqUser) return false;
  if (reqUser.role === 'admin' || reqUser.role === 'super_admin') return true;
  return reqUser.role === 'teacher' && Number(reqUser.id) === Number(teacherId);
};

const getTeacherWithPercent = async (client, teacherId) => {
  const res = await client.query(
    `SELECT
       u.id,
       u.name,
       u.surname,
       COALESCE(tss.salary_percentage, 50)::numeric AS salary_percentage
     FROM users u
     LEFT JOIN teacher_salary_settings tss ON tss.teacher_id = u.id
     WHERE u.id = $1 AND u.role = 'teacher'`,
    [teacherId]
  );

  return res.rows[0] || null;
};

const buildOpenMonthSummary = async (client, teacherId, monthName) => {
  const teacher = await getTeacherWithPercent(client, teacherId);
  if (!teacher) {
    throw new Error("O'qituvchi topilmadi");
  }

  const [snapshotRes, advancesRes, closedRes] = await Promise.all([
    client.query(
      `SELECT
         COUNT(*)::int AS total_students,
         COUNT(*) FILTER (WHERE COALESCE(ms.paid_amount, 0) > 0)::int AS paid_students,
         COUNT(*) FILTER (WHERE COALESCE(ms.paid_amount, 0) <= 0 AND COALESCE(ms.debt_amount, 0) > 0)::int AS unpaid_students,
         COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0)::numeric AS total_collected
       FROM monthly_snapshots ms
       JOIN groups g ON g.id = ms.group_id
       WHERE g.teacher_id = $1
         AND ms.month = $2
         AND COALESCE(ms.monthly_status, 'active') = 'active'`,
      [teacherId, monthName]
    ),
    client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total_advances
       FROM teacher_advances
       WHERE teacher_id = $1 AND month_name = $2`,
      [teacherId, monthName]
    ),
    client.query(
      `SELECT is_closed, closed_at, close_revenue, close_expected_salary, close_balance
       FROM teacher_monthly_salaries
       WHERE teacher_id = $1 AND month_name = $2`,
      [teacherId, monthName]
    ),
  ]);

  const stat = snapshotRes.rows[0] || {};
  const totalCollected = toNum(stat.total_collected);
  const totalAdvances = toNum(advancesRes.rows[0]?.total_advances);
  const salaryPercentage = toNum(teacher.salary_percentage);
  const expectedSalary = round2((totalCollected * salaryPercentage) / 100);
  const finalSalary = round2(expectedSalary - totalAdvances);

  const upsert = await client.query(
    `INSERT INTO teacher_monthly_salaries (
       teacher_id,
       month_name,
       salary_percentage,
       collected_revenue,
       expected_salary,
       total_advances,
       net_salary,
       balance,
       total_students,
       paid_students,
       unpaid_students,
       carry_from_previous,
       gross_salary,
       total_payouts,
       partial_students,
       fully_paid_students,
       recalculated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10,
       0, $5, 0, 0, $9, CURRENT_TIMESTAMP
     )
     ON CONFLICT (teacher_id, month_name)
     DO UPDATE SET
       salary_percentage = EXCLUDED.salary_percentage,
       collected_revenue = EXCLUDED.collected_revenue,
       expected_salary = EXCLUDED.expected_salary,
       total_advances = EXCLUDED.total_advances,
       net_salary = EXCLUDED.net_salary,
       balance = EXCLUDED.balance,
       total_students = EXCLUDED.total_students,
       paid_students = EXCLUDED.paid_students,
       unpaid_students = EXCLUDED.unpaid_students,
       carry_from_previous = 0,
       gross_salary = EXCLUDED.gross_salary,
       total_payouts = 0,
       partial_students = 0,
       fully_paid_students = EXCLUDED.fully_paid_students,
       recalculated_at = CURRENT_TIMESTAMP
     RETURNING is_closed, closed_at, close_revenue, close_expected_salary, close_balance`,
    [
      teacherId,
      monthName,
      salaryPercentage,
      totalCollected,
      expectedSalary,
      totalAdvances,
      finalSalary,
      toNum(stat.total_students),
      toNum(stat.paid_students),
      toNum(stat.unpaid_students),
    ]
  );

  const persisted = upsert.rows[0] || closedRes.rows[0] || {};

  return {
    teacher: {
      id: teacher.id,
      name: teacher.name,
      surname: teacher.surname,
    },
    month_name: monthName,
    salary_percentage: salaryPercentage,
    total_collected: totalCollected,
    expected_salary: expectedSalary,
    total_advances: totalAdvances,
    final_salary: finalSalary,
    total_students: toNum(stat.total_students),
    paid_students: toNum(stat.paid_students),
    unpaid_students: toNum(stat.unpaid_students),
    is_closed: Boolean(persisted.is_closed),
    closed_at: persisted.closed_at || null,
    close_revenue: persisted.close_revenue != null ? toNum(persisted.close_revenue) : null,
    close_expected_salary:
      persisted.close_expected_salary != null ? toNum(persisted.close_expected_salary) : null,
    close_balance: persisted.close_balance != null ? toNum(persisted.close_balance) : null,
  };
};

const getClosedSummary = async (client, teacherId, monthName) => {
  const teacher = await getTeacherWithPercent(client, teacherId);
  if (!teacher) {
    throw new Error("O'qituvchi topilmadi");
  }

  const monthly = await client.query(
    `SELECT
       salary_percentage,
       total_students,
       paid_students,
       unpaid_students,
       total_advances,
       is_closed,
       closed_at,
       close_revenue,
       close_expected_salary,
       close_balance
     FROM teacher_monthly_salaries
     WHERE teacher_id = $1 AND month_name = $2`,
    [teacherId, monthName]
  );

  if (!monthly.rows.length) return null;

  const row = monthly.rows[0];
  if (!row.is_closed) return null;

  return {
    teacher: {
      id: teacher.id,
      name: teacher.name,
      surname: teacher.surname,
    },
    month_name: monthName,
    salary_percentage: toNum(row.salary_percentage),
    total_collected: toNum(row.close_revenue),
    expected_salary: toNum(row.close_expected_salary),
    total_advances: toNum(row.total_advances),
    final_salary: toNum(row.close_balance),
    total_students: toNum(row.total_students),
    paid_students: toNum(row.paid_students),
    unpaid_students: toNum(row.unpaid_students),
    is_closed: true,
    closed_at: row.closed_at,
    close_revenue: toNum(row.close_revenue),
    close_expected_salary: toNum(row.close_expected_salary),
    close_balance: toNum(row.close_balance),
  };
};

exports.upsertTeacherSalarySettings = async (req, res) => {
  const teacherId = Number(req.params.teacher_id);
  const percentage = Number(req.body.salary_percentage);

  if (!teacherId || Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (Number.isNaN(percentage) || percentage < 0 || percentage > 100) {
    return res.status(400).json({
      success: false,
      message: 'salary_percentage 0 dan 100 gacha bo\'lishi kerak',
    });
  }

  const client = await pool.connect();
  try {
    const teacher = await client.query(
      `SELECT id, name, surname FROM users WHERE id = $1 AND role = 'teacher'`,
      [teacherId]
    );

    if (!teacher.rows.length) {
      return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }

    const result = await client.query(
      `INSERT INTO teacher_salary_settings (teacher_id, salary_percentage, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (teacher_id)
       DO UPDATE SET salary_percentage = EXCLUDED.salary_percentage, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [teacherId, percentage]
    );

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Teacher foizini saqlashda xatolik',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

exports.getTeacherSalarySettings = async (req, res) => {
  const teacherId = Number(req.params.teacher_id);

  if (!teacherId || Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (!canAccessTeacherData(req.user, teacherId)) {
    return res.status(403).json({ success: false, message: 'Ruxsat yo\'q' });
  }

  try {
    const result = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.surname,
         COALESCE(tss.salary_percentage, 50)::numeric AS salary_percentage
       FROM users u
       LEFT JOIN teacher_salary_settings tss ON tss.teacher_id = u.id
       WHERE u.id = $1 AND u.role = 'teacher'`,
      [teacherId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Teacher foizini olishda xatolik',
      error: error.message,
    });
  }
};

exports.createTeacherAdvance = async (req, res) => {
  const teacherId = Number(req.body.teacher_id);
  const monthName = req.body.month_name;
  const amount = Number(req.body.amount);
  const description = req.body.description || null;

  if (!teacherId || Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  if (Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'amount 0 dan katta bo\'lishi kerak' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teacher = await getTeacherWithPercent(client, teacherId);
    if (!teacher) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }

    const closedCheck = await client.query(
      `SELECT is_closed
       FROM teacher_monthly_salaries
       WHERE teacher_id = $1 AND month_name = $2`,
      [teacherId, monthName]
    );

    if (closedCheck.rows[0]?.is_closed) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Bu oy yopilgan. Avans qo\'shib bo\'lmaydi',
      });
    }

    const ins = await client.query(
      `INSERT INTO teacher_advances (teacher_id, amount, month_name, description, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [teacherId, amount, monthName, description, req.user.id]
    );

    const summary = await buildOpenMonthSummary(client, teacherId, monthName);

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Avans saqlandi',
      data: {
        advance: ins.rows[0],
        summary,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('createTeacherAdvance error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Avans saqlashda xatolik',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

exports.getTeacherAdvances = async (req, res) => {
  const monthName = req.query.month_name;
  let teacherId = req.query.teacher_id ? Number(req.query.teacher_id) : null;

  if (monthName && !isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  if (teacherId && Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (req.user.role === 'teacher') {
    teacherId = Number(req.user.id);
  }

  const params = [];
  const where = [];

  if (teacherId) {
    params.push(teacherId);
    where.push(`ta.teacher_id = $${params.length}`);
  }

  if (monthName) {
    params.push(monthName);
    where.push(`ta.month_name = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT
         ta.*,
         CONCAT(u.name, ' ', u.surname) AS teacher_name
       FROM teacher_advances ta
       JOIN users u ON u.id = ta.teacher_id
       ${whereSql}
       ORDER BY ta.created_at DESC`,
      params
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Avanslar ro\'yxatini olishda xatolik',
      error: error.message,
    });
  }
};

exports.getTeacherMonthSummary = async (req, res) => {
  const teacherId = Number(req.params.teacher_id);
  const monthName = req.params.month_name;

  if (!teacherId || Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  if (!canAccessTeacherData(req.user, teacherId)) {
    return res.status(403).json({ success: false, message: 'Ruxsat yo\'q' });
  }

  const client = await pool.connect();
  try {
    const closed = await getClosedSummary(client, teacherId, monthName);
    if (closed) {
      return res.json({ success: true, data: closed });
    }

    const summary = await buildOpenMonthSummary(client, teacherId, monthName);
    return res.json({ success: true, data: summary });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Oylik summary olishda xatolik',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

exports.closeTeacherMonth = async (req, res) => {
  const teacherId = Number(req.params.teacher_id);
  const monthName = req.params.month_name;

  if (!teacherId || Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const already = await client.query(
      `SELECT is_closed
       FROM teacher_monthly_salaries
       WHERE teacher_id = $1 AND month_name = $2
       FOR UPDATE`,
      [teacherId, monthName]
    );

    if (already.rows[0]?.is_closed) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Bu oy allaqachon yopilgan',
      });
    }

    const summary = await buildOpenMonthSummary(client, teacherId, monthName);

    await client.query(
      `UPDATE teacher_monthly_salaries
       SET is_closed = true,
           closed_at = CURRENT_TIMESTAMP,
           closed_by = $3,
           close_revenue = $4,
           close_expected_salary = $5,
           close_balance = $6,
           balance = $6
       WHERE teacher_id = $1 AND month_name = $2`,
      [
        teacherId,
        monthName,
        req.user.id,
        summary.total_collected,
        summary.expected_salary,
        summary.final_salary,
      ]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Oylik yopildi',
      data: {
        ...summary,
        is_closed: true,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({
      success: false,
      message: 'Oylikni yopishda xatolik',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

exports.getAllTeachersMonthSummary = async (req, res) => {
  const monthName = req.params.month_name;

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  const client = await pool.connect();
  try {
    const teachers = await client.query(
      `SELECT id
       FROM users
       WHERE role = 'teacher' AND status = 'active'
       ORDER BY id`
    );

    const items = [];
    for (const t of teachers.rows) {
      const closed = await getClosedSummary(client, t.id, monthName);
      if (closed) {
        items.push(closed);
        continue;
      }

      const open = await buildOpenMonthSummary(client, t.id, monthName);
      items.push(open);
    }

    return res.json({
      success: true,
      data: {
        month_name: monthName,
        total_teachers: items.length,
        total_salary: round2(items.reduce((acc, i) => acc + toNum(i.final_salary), 0)),
        teachers: items,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Teacherlar oyliklarini olishda xatolik',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

exports.getSimpleTeacherSalaryList = async (req, res) => {
  const monthName = req.params.month_name;

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  try {
    const result = await pool.query(
      `WITH monthly_collected AS (
         SELECT
           g.teacher_id,
           COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0)::numeric AS total_collected
         FROM monthly_snapshots ms
         JOIN groups g ON g.id = ms.group_id
         WHERE ms.month = $1
           AND COALESCE(ms.monthly_status, 'active') = 'active'
         GROUP BY g.teacher_id
       ),
       monthly_advances AS (
         SELECT
           teacher_id,
           COALESCE(SUM(amount), 0)::numeric AS total_advances
         FROM teacher_advances
         WHERE month_name = $1
         GROUP BY teacher_id
       ),
       teacher_student_status AS (
         SELECT
           g.teacher_id,
           ms.student_id,
           MAX(ms.student_name) AS student_name,
           MAX(ms.student_surname) AS student_surname,
           COALESCE(SUM(COALESCE(ms.required_amount, 0)), 0)::numeric AS total_required_amount,
           COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0)::numeric AS total_paid_amount,
           CASE
             WHEN COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0) <= 0 THEN 'unpaid'
             WHEN COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0) >= COALESCE(SUM(COALESCE(ms.required_amount, 0)), 0)
               THEN 'paid'
             ELSE 'partial'
           END AS payment_state
         FROM monthly_snapshots ms
         JOIN groups g ON g.id = ms.group_id
         WHERE ms.month = $1
           AND COALESCE(ms.monthly_status, 'active') = 'active'
         GROUP BY g.teacher_id, ms.student_id
       ),
       teacher_students_agg AS (
         SELECT
           tss.teacher_id,
           COUNT(*) FILTER (WHERE tss.payment_state = 'paid')::int AS paid_students_count,
           COUNT(*) FILTER (WHERE tss.payment_state = 'partial')::int AS partial_students_count,
           COUNT(*) FILTER (WHERE tss.payment_state = 'unpaid')::int AS unpaid_students_count,
           COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'student_id', tss.student_id,
                 'name', tss.student_name,
                 'surname', tss.student_surname,
                 'full_name', CONCAT(COALESCE(tss.student_name, ''), ' ', COALESCE(tss.student_surname, '')),
                 'payment_state', tss.payment_state,
                 'required_amount', tss.total_required_amount,
                 'paid_amount', tss.total_paid_amount
               )
               ORDER BY tss.student_name, tss.student_surname
             ),
             '[]'::json
           ) AS students
         FROM teacher_student_status tss
         GROUP BY tss.teacher_id
       )
       SELECT
         u.id AS teacher_id,
         CONCAT(u.name, ' ', u.surname) AS teacher_name,
         COALESCE(tss.salary_percentage, 50)::numeric AS salary_percentage,
         COALESCE(mc.total_collected, 0)::numeric AS live_total_collected,
         COALESCE(ma.total_advances, 0)::numeric AS total_advances,
         COALESCE(tsa.paid_students_count, 0)::int AS paid_students_count,
         COALESCE(tsa.partial_students_count, 0)::int AS partial_students_count,
         COALESCE(tsa.unpaid_students_count, 0)::int AS unpaid_students_count,
         COALESCE(tsa.students, '[]'::json) AS students,
         COALESCE(tms.is_closed, false) AS is_closed,
         tms.close_revenue,
         tms.close_expected_salary,
         tms.close_balance
       FROM users u
       LEFT JOIN teacher_salary_settings tss ON tss.teacher_id = u.id
       LEFT JOIN monthly_collected mc ON mc.teacher_id = u.id
       LEFT JOIN monthly_advances ma ON ma.teacher_id = u.id
       LEFT JOIN teacher_students_agg tsa ON tsa.teacher_id = u.id
       LEFT JOIN teacher_monthly_salaries tms
         ON tms.teacher_id = u.id
        AND tms.month_name = $1
       WHERE u.role = 'teacher' AND u.status = 'active'
       ORDER BY teacher_name ASC`,
      [monthName]
    );

    const teachers = result.rows.map((row) => {
      const salaryPercentage = toNum(row.salary_percentage);
      const totalAdvances = toNum(row.total_advances);
      const isClosed = Boolean(row.is_closed);

      const totalCollected = isClosed
        ? toNum(row.close_revenue != null ? row.close_revenue : row.live_total_collected)
        : toNum(row.live_total_collected);

      const expectedSalary = isClosed
        ? toNum(
            row.close_expected_salary != null
              ? row.close_expected_salary
              : round2((totalCollected * salaryPercentage) / 100)
          )
        : round2((totalCollected * salaryPercentage) / 100);

      const finalSalary = isClosed
        ? toNum(row.close_balance != null ? row.close_balance : expectedSalary - totalAdvances)
        : round2(expectedSalary - totalAdvances);

      return {
        teacher_id: toNum(row.teacher_id),
        teacher_name: row.teacher_name,
        month_name: monthName,
        paid_students_count: toNum(row.paid_students_count),
        partial_students_count: toNum(row.partial_students_count),
        unpaid_students_count: toNum(row.unpaid_students_count),
        total_collected: totalCollected,
        salary_percentage: salaryPercentage,
        expected_salary: expectedSalary,
        total_advances: totalAdvances,
        final_salary: finalSalary,
        is_closed: isClosed,
        can_give_advance: !isClosed,
        students: Array.isArray(row.students) ? row.students : [],
      };
    });

    return res.json({
      success: true,
      data: {
        month_name: monthName,
        total_teachers: teachers.length,
        total_collected: round2(teachers.reduce((sum, t) => sum + toNum(t.total_collected), 0)),
        total_expected_salary: round2(teachers.reduce((sum, t) => sum + toNum(t.expected_salary), 0)),
        total_advances: round2(teachers.reduce((sum, t) => sum + toNum(t.total_advances), 0)),
        total_final_salary: round2(teachers.reduce((sum, t) => sum + toNum(t.final_salary), 0)),
        teachers,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Sodda teacher oylik ro\'yxatini olishda xatolik',
      error: error.message,
    });
  }
};
