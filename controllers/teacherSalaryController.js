const pool = require('../config/db');
const { getScopedBranchId } = require('../utils/branch');

const MONTH_RE = /^\d{4}-\d{2}$/;

const isValidMonth = (v) => MONTH_RE.test(v);
const toNum = (v) => Number(v || 0);
const round2 = (v) => Number(toNum(v).toFixed(2));
const PAYOUT_TYPE_REGULAR = 'regular';
const PAYOUT_TYPE_POST_CLOSE = 'post_close';
// Teacher tushumi faqat real tushgan to'lovdan: paid_amount asosida.
// To'lov bo'lmasa, oylik hisobga olinmaydi.
const SALARY_BASE_EXPR = `COALESCE(ms.paid_amount, 0)`;
const EFFECTIVE_REQUIRED_SQL = `
  GREATEST(
    COALESCE(MAX(ms.group_price), 0)
      - GREATEST(
          COALESCE(MAX(ms.discount_amount), 0),
          COALESCE(MAX(ad.center_discount_amount), 0) + COALESCE(MAX(ad.teacher_discount_amount), 0)
        ),
    0
  )
`;

const canAccessTeacherData = (reqUser, teacherId) => {
  if (!reqUser) return false;
  if (reqUser.role === 'admin' || reqUser.role === 'super_admin') return true;
  return reqUser.role === 'teacher' && Number(reqUser.id) === Number(teacherId);
};

const getTeacherWithPercent = async (client, teacherId, branchId) => {
  const res = await client.query(
    `SELECT
       u.id,
       u.name,
       u.surname,
       u.phone,
       u.phone2,
       u.father_name,
       u.father_phone,
       u.address,
       u.age,
       COALESCE(tss.salary_percentage, 50)::numeric AS salary_percentage
     FROM users u
     LEFT JOIN teacher_salary_settings tss ON tss.teacher_id = u.id AND tss.branch_id = u.branch_id
     WHERE u.id = $1 AND u.role = 'teacher' AND u.branch_id = $2`,
    [teacherId, branchId]
  );

  return res.rows[0] || null;
};

const getTeacherMonthlyStudentSummary = async (client, teacherId, monthName, branchId) => {
  const res = await client.query(
    `WITH active_discounts AS (
       SELECT
         sd.student_id,
         sd.group_id,
         COALESCE(
           SUM(
             CASE
               WHEN COALESCE(sd.discount_scope, 'center') = 'center' THEN
                 CASE
                   WHEN sd.discount_type = 'percent' THEN ROUND((ms.group_price * sd.discount_value / 100), 2)
                   ELSE sd.discount_value
                 END
               ELSE 0
             END
           ),
           0
         )::numeric AS center_discount_amount,
         COALESCE(
           SUM(
             CASE
               WHEN COALESCE(sd.discount_scope, 'center') = 'teacher' THEN
                 CASE
                   WHEN sd.discount_type = 'percent' THEN ROUND((ms.group_price * sd.discount_value / 100), 2)
                   ELSE sd.discount_value
                 END
               ELSE 0
             END
           ),
           0
         )::numeric AS teacher_discount_amount
       FROM student_discounts sd
       JOIN monthly_snapshots ms
         ON ms.student_id = sd.student_id
        AND ms.group_id = sd.group_id
        AND ms.month = $2
        AND ms.branch_id = $3
       WHERE sd.branch_id = $3
         AND sd.is_active = true
         AND (sd.start_month IS NULL OR sd.start_month <= $2)
         AND (sd.end_month IS NULL OR sd.end_month >= $2)
       GROUP BY sd.student_id, sd.group_id
     ),
     teacher_student_status AS (
       SELECT
         g.teacher_id,
         ms.student_id,
         ms.group_id,
         MAX(g.subject_id) AS subject_id,
         MAX(subj.name) AS subject_name,
         MAX(ms.student_name) AS student_name,
         MAX(ms.student_surname) AS student_surname,
         MAX(ms.group_name) AS group_name,
         MAX(COALESCE(ms.student_phone, su.phone)) AS student_phone,
         MAX(su.phone2) AS student_phone2,
         MAX(COALESCE(ms.student_father_name, su.father_name)) AS student_father_name,
         MAX(COALESCE(ms.student_father_phone, su.father_phone)) AS student_father_phone,
         MAX(su.address) AS student_address,
         MAX(su.age) AS student_age,
         COALESCE(MAX(ms.group_price), 0)::numeric AS base_amount,
         COALESCE(MAX(ms.discount_amount), 0)::numeric AS snapshot_discount_amount,
         COALESCE(MAX(ad.center_discount_amount), 0)::numeric AS center_discount_amount,
         COALESCE(MAX(ad.teacher_discount_amount), 0)::numeric AS teacher_discount_amount,
         COALESCE(SUM(COALESCE(ms.required_amount, 0)), 0)::numeric AS total_required_amount,
         COALESCE(SUM(COALESCE(ms.discount_amount, 0)), 0)::numeric AS total_discount_amount,
         COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0)::numeric AS total_paid_amount,
         (
           COALESCE(MAX(ms.group_price), 0)
             - ${EFFECTIVE_REQUIRED_SQL}
         )::numeric AS effective_discount_amount,
         ${EFFECTIVE_REQUIRED_SQL}::numeric AS effective_required_amount,
         CASE
           WHEN ${EFFECTIVE_REQUIRED_SQL} <= 0 THEN 'paid'
           WHEN COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0) <= 0 THEN 'unpaid'
           WHEN COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0) >= ${EFFECTIVE_REQUIRED_SQL} THEN 'paid'
           ELSE 'partial'
         END AS payment_state
       FROM monthly_snapshots ms
       JOIN groups g ON g.id = ms.group_id
       LEFT JOIN subjects subj ON subj.id = g.subject_id AND subj.branch_id = g.branch_id
       LEFT JOIN users su ON su.id = ms.student_id
       LEFT JOIN active_discounts ad
         ON ad.student_id = ms.student_id
        AND ad.group_id = ms.group_id
       WHERE g.teacher_id = $1
         AND ms.month = $2
         AND ms.branch_id = $3
         AND g.branch_id = $3
         AND COALESCE(ms.monthly_status, 'active') = 'active'
        GROUP BY g.teacher_id, ms.student_id, ms.group_id, ad.center_discount_amount, ad.teacher_discount_amount
     ),
     teacher_students_agg AS (
       SELECT
         tss.teacher_id,
         COUNT(*)::int AS total_students,
         COUNT(*) FILTER (WHERE tss.payment_state = 'paid')::int AS paid_students_count,
         COUNT(*) FILTER (WHERE tss.payment_state = 'partial')::int AS partial_students_count,
         COUNT(*) FILTER (WHERE tss.payment_state = 'unpaid')::int AS unpaid_students_count,
         COALESCE(SUM(tss.base_amount), 0)::numeric AS total_collected,
         COALESCE(SUM(tss.total_paid_amount), 0)::numeric AS actual_collected,
         COALESCE(SUM(tss.center_discount_amount), 0)::numeric AS center_discount_total,
         COALESCE(SUM(tss.teacher_discount_amount), 0)::numeric AS teacher_discount_total,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'student_id', tss.student_id,
               'group_id', tss.group_id,
               'group_name', tss.group_name,
               'subject_id', tss.subject_id,
               'subject_name', tss.subject_name,
               'name', tss.student_name,
               'surname', tss.student_surname,
               'full_name', CONCAT(COALESCE(tss.student_name, ''), ' ', COALESCE(tss.student_surname, '')),
               'phone', tss.student_phone,
               'phone2', tss.student_phone2,
               'father_name', tss.student_father_name,
               'father_phone', tss.student_father_phone,
               'address', tss.student_address,
               'age', tss.student_age,
               'payment_state', tss.payment_state,
               'base_amount', tss.base_amount,
               'effective_required_amount', tss.effective_required_amount,
               'center_discount_amount', tss.center_discount_amount,
               'teacher_discount_amount', tss.teacher_discount_amount,
               'discount_amount', tss.total_discount_amount,
               'required_amount', tss.total_required_amount,
               'original_required_amount', tss.total_required_amount,
               'paid_amount', tss.total_paid_amount
             )
             ORDER BY tss.student_name, tss.student_surname, tss.group_name
           ),
           '[]'::json
         ) AS students
       FROM teacher_student_status tss
       GROUP BY tss.teacher_id
     )
     SELECT * FROM teacher_students_agg`,
    [teacherId, monthName, branchId]
  );

  const row = res.rows[0] || {};
  const students = Array.isArray(row.students) ? row.students : [];
  return {
    total_students: toNum(row.total_students),
    paid_students_count: toNum(row.paid_students_count),
    partial_students_count: toNum(row.partial_students_count),
    unpaid_students_count: toNum(row.unpaid_students_count),
    total_collected: toNum(row.total_collected),
    actual_collected: toNum(row.actual_collected),
    center_discount_total: toNum(row.center_discount_total),
    teacher_discount_total: toNum(row.teacher_discount_total),
    students,
  };
};

const buildOpenMonthSummary = async (client, teacherId, monthName, branchId) => {
  const teacher = await getTeacherWithPercent(client, teacherId, branchId);
  if (!teacher) {
    throw new Error("O'qituvchi topilmadi");
  }

  const [studentSummary, advancesRes, payoutsRes, closedRes] = await Promise.all([
    getTeacherMonthlyStudentSummary(client, teacherId, monthName, branchId),
    client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total_advances
       FROM teacher_advances
       WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3`,
      [teacherId, monthName, branchId]
    ),
    client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total_given
       FROM teacher_salary_payouts
       WHERE teacher_id = $1
         AND month_name = $2
         AND branch_id = $3
         AND COALESCE(payout_type, '${PAYOUT_TYPE_REGULAR}') = '${PAYOUT_TYPE_REGULAR}'`,
      [teacherId, monthName, branchId]
    ),
    client.query(
      `SELECT is_closed, closed_at, close_revenue, close_expected_salary, close_balance
       FROM teacher_monthly_salaries
       WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3`,
      [teacherId, monthName, branchId]
    ),
  ]);

  const totalCollected = toNum(studentSummary.total_collected);
  const actualCollected = toNum(studentSummary.actual_collected);
  const teacherDiscountTotal = toNum(studentSummary.teacher_discount_total);
  const totalAdvances = toNum(advancesRes.rows[0]?.total_advances);
  const totalGiven = toNum(payoutsRes.rows[0]?.total_given);
  const salaryPercentage = toNum(teacher.salary_percentage);
  const expectedGross = round2((actualCollected * salaryPercentage) / 100);
  const expectedNet = round2(expectedGross - teacherDiscountTotal - totalAdvances);
  const finalSalary = round2(expectedGross - teacherDiscountTotal - totalAdvances - totalGiven);

  const upsert = await client.query(
    `INSERT INTO teacher_monthly_salaries (
       teacher_id,
       month_name,
       salary_percentage,
       collected_revenue,
       expected_salary,
       total_advances,
       net_salary,
       total_payouts,
       balance,
       total_students,
       paid_students,
       unpaid_students,
       carry_from_previous,
       gross_salary,
       partial_students,
       fully_paid_students,
       branch_id,
       recalculated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $11, $7, $8, $9, $10,
       0, $5, 0, $9, $12, CURRENT_TIMESTAMP
     )
     ON CONFLICT (teacher_id, month_name)
     DO UPDATE SET
       salary_percentage = EXCLUDED.salary_percentage,
       collected_revenue = EXCLUDED.collected_revenue,
       expected_salary = EXCLUDED.expected_salary,
       total_advances = EXCLUDED.total_advances,
       net_salary = EXCLUDED.net_salary,
       total_payouts = EXCLUDED.total_payouts,
       balance = EXCLUDED.balance,
       total_students = EXCLUDED.total_students,
       paid_students = EXCLUDED.paid_students,
       unpaid_students = EXCLUDED.unpaid_students,
       carry_from_previous = 0,
       gross_salary = EXCLUDED.gross_salary,
       partial_students = 0,
       fully_paid_students = EXCLUDED.fully_paid_students,
       recalculated_at = CURRENT_TIMESTAMP
     RETURNING is_closed, closed_at, close_revenue, close_expected_salary, close_balance`,
    [
      teacherId,
      monthName,
      salaryPercentage,
      totalCollected,
      expectedGross,
      totalAdvances,
      finalSalary,
      toNum(studentSummary.total_students),
      toNum(studentSummary.paid_students_count),
      toNum(studentSummary.unpaid_students_count),
      totalGiven,
      branchId,
    ]
  );

  const persisted = upsert.rows[0] || closedRes.rows[0] || {};

  return {
    teacher: {
      id: teacher.id,
      name: teacher.name,
      surname: teacher.surname,
      phone: teacher.phone || null,
      phone2: teacher.phone2 || null,
      father_name: teacher.father_name || null,
      father_phone: teacher.father_phone || null,
      address: teacher.address || null,
      age: teacher.age != null ? toNum(teacher.age) : null,
    },
    month_name: monthName,
    salary_percentage: salaryPercentage,
    total_collected: totalCollected,
    actual_collected: actualCollected,
    center_discount_total: toNum(studentSummary.center_discount_total),
    teacher_discount_total: teacherDiscountTotal,
    expected_salary: expectedNet,
    expected_salary_gross: expectedGross,
    total_advances: totalAdvances,
    total_given: totalGiven,
    final_salary: finalSalary,
    total_students: toNum(studentSummary.total_students),
    paid_students: toNum(studentSummary.paid_students_count),
    partial_students: toNum(studentSummary.partial_students_count),
    unpaid_students: toNum(studentSummary.unpaid_students_count),
    can_give: finalSalary > 0,
    is_closed: Boolean(persisted.is_closed),
    closed_at: persisted.closed_at || null,
    close_revenue: persisted.close_revenue != null ? toNum(persisted.close_revenue) : null,
    close_expected_salary:
      persisted.close_expected_salary != null ? toNum(persisted.close_expected_salary) : null,
    close_balance: persisted.close_balance != null ? toNum(persisted.close_balance) : null,
    post_close_collected_revenue: 0,
    post_close_expected_salary: 0,
    post_close_given: 0,
    post_close_available: 0,
    post_close_can_give: false,
    students: studentSummary.students,
  };
};

const getClosedSummary = async (client, teacherId, monthName, branchId) => {
  const teacher = await getTeacherWithPercent(client, teacherId, branchId);
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
       total_payouts,
       is_closed,
       closed_at,
       close_revenue,
       close_expected_salary,
       close_balance
     FROM teacher_monthly_salaries
     WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3`,
    [teacherId, monthName, branchId]
  );

  if (!monthly.rows.length) return null;

  const row = monthly.rows[0];
  if (!row.is_closed) return null;

  const [studentSummary, payoutsRegularRes, payoutsPostCloseRes] = await Promise.all([
    getTeacherMonthlyStudentSummary(client, teacherId, monthName, branchId),
    client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total_given
       FROM teacher_salary_payouts
       WHERE teacher_id = $1
         AND month_name = $2
         AND branch_id = $3
         AND COALESCE(payout_type, '${PAYOUT_TYPE_REGULAR}') = '${PAYOUT_TYPE_REGULAR}'`,
      [teacherId, monthName, branchId]
    ),
    client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS post_close_given
       FROM teacher_salary_payouts
       WHERE teacher_id = $1
         AND month_name = $2
         AND branch_id = $3
         AND COALESCE(payout_type, '${PAYOUT_TYPE_POST_CLOSE}') = '${PAYOUT_TYPE_POST_CLOSE}'`,
      [teacherId, monthName, branchId]
    ),
  ]);

  const salaryPercentage = toNum(teacher.salary_percentage);
  const closeExpected = toNum(row.close_expected_salary);
  const closeRevenue = toNum(row.close_revenue);
  const liveCollected = toNum(studentSummary.total_collected);
  const teacherDiscountTotal = toNum(studentSummary.teacher_discount_total);
  const postCloseCollectedRevenue = round2(Math.max(liveCollected - closeRevenue, 0));
  const postCloseExpectedGross = round2((postCloseCollectedRevenue * salaryPercentage) / 100);
  const postCloseGiven = toNum(payoutsPostCloseRes.rows[0]?.post_close_given);
  const postCloseAvailable = round2(postCloseExpectedGross - postCloseGiven);
  const totalGiven = toNum(payoutsRegularRes.rows[0]?.total_given ?? row.total_payouts);

  return {
    teacher: {
      id: teacher.id,
      name: teacher.name,
      surname: teacher.surname,
      phone: teacher.phone || null,
      phone2: teacher.phone2 || null,
      father_name: teacher.father_name || null,
      father_phone: teacher.father_phone || null,
      address: teacher.address || null,
      age: teacher.age != null ? toNum(teacher.age) : null,
    },
    month_name: monthName,
    salary_percentage: salaryPercentage,
    total_collected: closeRevenue,
    actual_collected: toNum(studentSummary.actual_collected),
    center_discount_total: toNum(studentSummary.center_discount_total),
    teacher_discount_total: teacherDiscountTotal,
    expected_salary: round2(closeExpected - teacherDiscountTotal - toNum(row.total_advances)),
    expected_salary_gross: closeExpected,
    total_advances: toNum(row.total_advances),
    total_given: totalGiven,
    final_salary: toNum(row.close_balance != null ? row.close_balance : round2(closeExpected - teacherDiscountTotal - toNum(row.total_advances) - totalGiven)),
    total_students: toNum(row.total_students),
    paid_students: toNum(row.paid_students),
    unpaid_students: toNum(row.unpaid_students),
    can_give: toNum(row.close_balance) > 0,
    is_closed: true,
    closed_at: row.closed_at,
    close_revenue: closeRevenue,
    close_expected_salary: closeExpected,
    close_balance: toNum(row.close_balance),
    post_close_collected_revenue: postCloseCollectedRevenue,
    post_close_expected_salary: postCloseExpectedGross,
    post_close_given: postCloseGiven,
    post_close_available: postCloseAvailable,
    post_close_can_give: postCloseAvailable > 0,
    students: studentSummary.students,
  };
};

exports.upsertTeacherSalarySettings = async (req, res) => {
  const teacherId = Number(req.params.teacher_id);
  const percentage = Number(req.body.salary_percentage);
  const branchId = getScopedBranchId(req);

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
      `SELECT id, name, surname FROM users WHERE id = $1 AND role = 'teacher' AND branch_id = $2`,
      [teacherId, branchId]
    );

    if (!teacher.rows.length) {
      return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }

    const result = await client.query(
      `INSERT INTO teacher_salary_settings (teacher_id, salary_percentage, updated_at, branch_id)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3)
       ON CONFLICT (teacher_id)
       DO UPDATE SET salary_percentage = EXCLUDED.salary_percentage, branch_id = EXCLUDED.branch_id, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [teacherId, percentage, branchId]
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
  const branchId = getScopedBranchId(req);

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
       LEFT JOIN teacher_salary_settings tss ON tss.teacher_id = u.id AND tss.branch_id = u.branch_id
       WHERE u.id = $1 AND u.role = 'teacher' AND u.branch_id = $2`,
      [teacherId, branchId]
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
  const branchId = getScopedBranchId(req);

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

    const teacher = await getTeacherWithPercent(client, teacherId, branchId);
    if (!teacher) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }

    const closedCheck = await client.query(
      `SELECT is_closed
       FROM teacher_monthly_salaries
       WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3`,
      [teacherId, monthName, branchId]
    );

    if (closedCheck.rows[0]?.is_closed) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Bu oy yopilgan. Avans qo\'shib bo\'lmaydi',
      });
    }

    const ins = await client.query(
      `INSERT INTO teacher_advances (teacher_id, amount, month_name, description, created_by, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [teacherId, amount, monthName, description, req.user.id, branchId]
    );

    const summary = await buildOpenMonthSummary(client, teacherId, monthName, branchId);

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
  const branchId = getScopedBranchId(req);

  if (monthName && !isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  if (teacherId && Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (req.user.role === 'teacher') {
    teacherId = Number(req.user.id);
  }

  const params = [branchId];
  const where = [];
  where.push(`ta.branch_id = $${params.length}`);
  where.push('u.branch_id = ta.branch_id');

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

exports.createTeacherSalaryGiven = async (req, res) => {
  const teacherId = Number(req.body.teacher_id);
  const monthName = req.body.month_name;
  const description = req.body.description || null;
  const branchId = getScopedBranchId(req);

  if (!teacherId || Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  if (req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== '') {
    return res.status(400).json({
      success: false,
      message: 'amount yuborilmaydi. Berildi tugmasi qolgan summani to\'liq beradi',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teacher = await getTeacherWithPercent(client, teacherId, branchId);
    if (!teacher) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }

    const closed = await getClosedSummary(client, teacherId, monthName, branchId);
    const live = closed || (await buildOpenMonthSummary(client, teacherId, monthName, branchId));
    const isClosed = Boolean(closed);
    const available = isClosed ? toNum(live.post_close_available) : toNum(live.final_salary);

    if (available <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'To\'lash uchun mavjud balans yo\'q',
        data: { available_balance: available },
      });
    }

    const givenAmount = available;

    const ins = await client.query(
      `INSERT INTO teacher_salary_payouts (teacher_id, month_name, amount, payout_type, description, created_by, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        teacherId,
        monthName,
        givenAmount,
        isClosed ? PAYOUT_TYPE_POST_CLOSE : PAYOUT_TYPE_REGULAR,
        description,
        req.user.id,
        branchId,
      ]
    );

    const refreshedClosed = await getClosedSummary(client, teacherId, monthName, branchId);
    const refreshedOpen = refreshedClosed || (await buildOpenMonthSummary(client, teacherId, monthName, branchId));

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: isClosed
        ? 'Oy yopilgandan keyingi yig\'ilgan summa to\'liq berildi'
        : 'Teacherga mavjud yig\'ilgan summa to\'liq berildi',
      data: {
        given: ins.rows[0],
        summary: refreshedOpen,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({
      success: false,
      message: 'Teacherga berilgan to\'lovni saqlashda xatolik',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

exports.getTeacherSalaryGivenList = async (req, res) => {
  const monthName = req.query.month_name;
  let teacherId = req.query.teacher_id ? Number(req.query.teacher_id) : null;
  const branchId = getScopedBranchId(req);

  if (monthName && !isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  if (teacherId && Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (req.user.role === 'teacher') {
    teacherId = Number(req.user.id);
  }

  const params = [branchId];
  const where = [];
  where.push(`tsp.branch_id = $${params.length}`);
  where.push('u.branch_id = tsp.branch_id');

  if (teacherId) {
    params.push(teacherId);
    where.push(`tsp.teacher_id = $${params.length}`);
  }

  if (monthName) {
    params.push(monthName);
    where.push(`tsp.month_name = $${params.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT
         tsp.*,
         COALESCE(tsp.payout_type, '${PAYOUT_TYPE_REGULAR}') AS payout_type,
         CONCAT(u.name, ' ', u.surname) AS teacher_name,
         CONCAT(cu.name, ' ', cu.surname) AS created_by_name,
         COALESCE(tss.salary_percentage, 50)::numeric AS salary_percentage
       FROM teacher_salary_payouts tsp
       JOIN users u ON u.id = tsp.teacher_id
       LEFT JOIN teacher_salary_settings tss ON tss.teacher_id = u.id AND tss.branch_id = tsp.branch_id
       LEFT JOIN users cu ON cu.id = tsp.created_by
       ${whereSql}
       ORDER BY tsp.created_at DESC`,
      params
    );

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Berilgan to\'lovlar ro\'yxatini olishda xatolik',
      error: error.message,
    });
  }
};

exports.getTeacherMonthSummary = async (req, res) => {
  const teacherId = Number(req.params.teacher_id);
  const monthName = req.params.month_name;
  const branchId = getScopedBranchId(req);

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
    const closed = await getClosedSummary(client, teacherId, monthName, branchId);
    if (closed) {
      return res.json({ success: true, data: closed });
    }

    const summary = await buildOpenMonthSummary(client, teacherId, monthName, branchId);
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
  const branchId = getScopedBranchId(req);

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
       WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3
       FOR UPDATE`,
      [teacherId, monthName, branchId]
    );

    if (already.rows[0]?.is_closed) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Bu oy allaqachon yopilgan',
      });
    }

    const summary = await buildOpenMonthSummary(client, teacherId, monthName, branchId);

    // Admin qo'lda kiritgan yakuniy oylik summasi (ixtiyoriy).
    // Yuborilmasa — avvalgidek hisoblangan qiymat ishlatiladi.
    const overrideRaw = req.body?.expected_salary;
    const overrideNum = Number(overrideRaw);
    const hasOverride =
      overrideRaw !== undefined &&
      overrideRaw !== null &&
      overrideRaw !== '' &&
      Number.isFinite(overrideNum) &&
      overrideNum >= 0;

    const computedExpected =
      summary.expected_salary_gross != null ? summary.expected_salary_gross : summary.expected_salary;
    const closeExpected = hasOverride ? round2(overrideNum) : computedExpected;
    const closeBalance = hasOverride ? round2(overrideNum) : summary.final_salary;

    await client.query(
      `UPDATE teacher_monthly_salaries
       SET is_closed = true,
           closed_at = CURRENT_TIMESTAMP,
           closed_by = $3,
           close_revenue = $4,
           close_expected_salary = $5,
           close_balance = $6,
           balance = $6
       WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $7`,
      [
        teacherId,
        monthName,
        req.user.id,
        summary.actual_collected,
        closeExpected,
        closeBalance,
        branchId,
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
  const branchId = getScopedBranchId(req);

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  const client = await pool.connect();
  try {
    // Faqat tanlangan oyga (yoki undan avvalgi oyga) ishga kelgan o'qituvchilar.
    // "Qaysi oyda kelgan" — ishni boshlagan sana (start_date), agar u yo'q bo'lsa
    // tizimga qo'shilgan sana (created_at). Shu oydan boshlab ro'yxatda ko'rinadi.
    const teachers = await client.query(
      `SELECT id
       FROM users
       WHERE role = 'teacher'
         AND branch_id = $2
         AND to_char(COALESCE(start_date, created_at::date), 'YYYY-MM') <= $1
       ORDER BY id`,
      [monthName, branchId]
    );

    const items = [];
    for (const t of teachers.rows) {
      const closed = await getClosedSummary(client, t.id, monthName, branchId);
      const summary = closed || (await buildOpenMonthSummary(client, t.id, monthName, branchId));

      // O'quvchisi yo'q o'qituvchilar ro'yxatda ko'rsatilmaydi.
      const studentCount = Array.isArray(summary.students) ? summary.students.length : 0;
      if (studentCount <= 0) continue;

      items.push(summary);
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
  const branchId = getScopedBranchId(req);

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  try {
    const result = await pool.query(
      `WITH monthly_collected AS (
         SELECT
           g.teacher_id,
           COALESCE(SUM(${SALARY_BASE_EXPR}), 0)::numeric AS total_collected
         FROM monthly_snapshots ms
         JOIN groups g ON g.id = ms.group_id
         WHERE ms.month = $1
           AND ms.branch_id = $2
           AND g.branch_id = $2
           AND COALESCE(ms.monthly_status, 'active') = 'active'
         GROUP BY g.teacher_id
       ),
       monthly_advances AS (
         SELECT
           teacher_id,
           COALESCE(SUM(amount), 0)::numeric AS total_advances
         FROM teacher_advances
         WHERE month_name = $1 AND branch_id = $2
         GROUP BY teacher_id
       ),
       monthly_given_regular AS (
         SELECT
           teacher_id,
           COALESCE(SUM(amount), 0)::numeric AS total_given
         FROM teacher_salary_payouts
         WHERE month_name = $1
           AND branch_id = $2
           AND COALESCE(payout_type, '${PAYOUT_TYPE_REGULAR}') = '${PAYOUT_TYPE_REGULAR}'
         GROUP BY teacher_id
       ),
       monthly_given_post_close AS (
         SELECT
           teacher_id,
           COALESCE(SUM(amount), 0)::numeric AS post_close_given
         FROM teacher_salary_payouts
         WHERE month_name = $1
           AND branch_id = $2
           AND COALESCE(payout_type, '${PAYOUT_TYPE_POST_CLOSE}') = '${PAYOUT_TYPE_POST_CLOSE}'
         GROUP BY teacher_id
       ),
       teacher_student_status AS (
         SELECT
           g.teacher_id,
           ms.student_id,
           MAX(ms.student_name) AS student_name,
           MAX(ms.student_surname) AS student_surname,
           MAX(COALESCE(ms.student_phone, su.phone)) AS student_phone,
           MAX(su.phone2) AS student_phone2,
           MAX(COALESCE(ms.student_father_name, su.father_name)) AS student_father_name,
           MAX(COALESCE(ms.student_father_phone, su.father_phone)) AS student_father_phone,
           MAX(su.address) AS student_address,
           MAX(su.age) AS student_age,
         COALESCE(SUM(COALESCE(ms.required_amount, 0)), 0)::numeric AS total_required_amount,
         COALESCE(SUM(COALESCE(ms.discount_amount, 0)), 0)::numeric AS total_discount_amount,
         COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0)::numeric AS total_paid_amount,
         (
           COALESCE(MAX(ms.group_price), 0)
             - ${EFFECTIVE_REQUIRED_SQL}
         )::numeric AS effective_discount_amount,
         ${EFFECTIVE_REQUIRED_SQL}::numeric AS effective_required_amount,
         CASE
             WHEN ${EFFECTIVE_REQUIRED_SQL} <= 0 THEN 'paid'
             WHEN COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0) <= 0 THEN 'unpaid'
             WHEN COALESCE(SUM(COALESCE(ms.paid_amount, 0)), 0) >= ${EFFECTIVE_REQUIRED_SQL} THEN 'paid'
             ELSE 'partial'
           END AS payment_state
         FROM monthly_snapshots ms
         JOIN groups g ON g.id = ms.group_id
         LEFT JOIN users su ON su.id = ms.student_id
         LEFT JOIN active_discounts ad
           ON ad.student_id = ms.student_id
          AND ad.group_id = ms.group_id
         WHERE ms.month = $1
           AND ms.branch_id = $2
           AND g.branch_id = $2
           AND COALESCE(ms.monthly_status, 'active') = 'active'
         GROUP BY g.teacher_id, ms.student_id, ad.center_discount_amount, ad.teacher_discount_amount
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
                 'phone', tss.student_phone,
                 'phone2', tss.student_phone2,
                 'father_name', tss.student_father_name,
                 'father_phone', tss.student_father_phone,
                 'address', tss.student_address,
                 'age', tss.student_age,
                'payment_state', tss.payment_state,
                'effective_required_amount', tss.effective_required_amount,
                'required_amount', tss.total_required_amount,
                'original_required_amount', tss.total_required_amount,
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
         COALESCE(mgr.total_given, 0)::numeric AS total_given,
         COALESCE(mpc.post_close_given, 0)::numeric AS post_close_given,
         COALESCE(tsa.paid_students_count, 0)::int AS paid_students_count,
         COALESCE(tsa.partial_students_count, 0)::int AS partial_students_count,
         COALESCE(tsa.unpaid_students_count, 0)::int AS unpaid_students_count,
         COALESCE(tsa.students, '[]'::json) AS students,
         COALESCE(tms.is_closed, false) AS is_closed,
         tms.close_revenue,
         tms.close_expected_salary,
         tms.close_balance
       FROM users u
       LEFT JOIN teacher_salary_settings tss ON tss.teacher_id = u.id AND tss.branch_id = u.branch_id
       LEFT JOIN monthly_collected mc ON mc.teacher_id = u.id
       LEFT JOIN monthly_advances ma ON ma.teacher_id = u.id
       LEFT JOIN monthly_given_regular mgr ON mgr.teacher_id = u.id
       LEFT JOIN monthly_given_post_close mpc ON mpc.teacher_id = u.id
       LEFT JOIN teacher_students_agg tsa ON tsa.teacher_id = u.id
       LEFT JOIN teacher_monthly_salaries tms
         ON tms.teacher_id = u.id
        AND tms.month_name = $1
        AND tms.branch_id = $2
       WHERE u.role = 'teacher'
         AND u.branch_id = $2
       ORDER BY teacher_name ASC`,
      [monthName, branchId]
    );

    const teachers = result.rows.map((row) => {
      const salaryPercentage = toNum(row.salary_percentage);
      const totalAdvances = toNum(row.total_advances);
      const totalGiven = toNum(row.total_given);
      const postCloseGiven = toNum(row.post_close_given);
      const isClosed = Boolean(row.is_closed);
      const givenForBalance = isClosed ? postCloseGiven : totalGiven;

      const totalCollected = isClosed
        ? toNum(row.close_revenue != null ? row.close_revenue : row.live_total_collected)
        : toNum(row.live_total_collected);

      const expectedGross = isClosed
        ? toNum(
            row.close_expected_salary != null
              ? row.close_expected_salary
              : round2((totalCollected * salaryPercentage) / 100)
          )
        : round2((totalCollected * salaryPercentage) / 100);

      const expectedNet = round2(expectedGross - totalAdvances);

      const postCloseCollectedRevenue = isClosed
        ? round2(Math.max(toNum(row.live_total_collected) - toNum(row.close_revenue), 0))
        : 0;
      const postCloseExpectedSalary = isClosed
        ? round2((postCloseCollectedRevenue * salaryPercentage) / 100)
        : 0;
      const postCloseAvailable = round2(postCloseExpectedSalary - postCloseGiven);

      const finalSalary = isClosed
        ? toNum(row.close_balance != null ? row.close_balance : 0)
        : round2(expectedGross - totalAdvances - totalGiven);

      return {
        teacher_id: toNum(row.teacher_id),
        teacher_name: row.teacher_name,
        month_name: monthName,
        paid_students_count: toNum(row.paid_students_count),
        partial_students_count: toNum(row.partial_students_count),
        unpaid_students_count: toNum(row.unpaid_students_count),
        total_collected: totalCollected,
        salary_percentage: salaryPercentage,
        expected_salary: expectedNet,
        expected_salary_gross: expectedGross,
        total_advances: totalAdvances,
        total_given: totalGiven,
        post_close_given: postCloseGiven,
        given_for_balance: givenForBalance,
        final_salary: finalSalary,
        can_give: finalSalary > 0,
        is_closed: isClosed,
        can_give_advance: !isClosed,
        post_close_collected_revenue: postCloseCollectedRevenue,
        post_close_expected_salary: postCloseExpectedSalary,
        post_close_available: postCloseAvailable,
        post_close_can_give: postCloseAvailable > 0,
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
        total_given: round2(teachers.reduce((sum, t) => sum + toNum(t.total_given), 0)),
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

exports.resetTeacherMonthPayouts = async (req, res) => {
  const teacherId = Number(req.params.teacher_id);
  const monthName = req.params.month_name;
  const branchId = getScopedBranchId(req);

  if (!teacherId || Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teacher = await getTeacherWithPercent(client, teacherId, branchId);
    if (!teacher) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }

    const closed = await client.query(
      `SELECT is_closed
       FROM teacher_monthly_salaries
       WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3
       FOR UPDATE`,
      [teacherId, monthName, branchId]
    );

    if (closed.rows[0]?.is_closed) {
      await client.query(
        `UPDATE teacher_monthly_salaries
         SET is_closed = false,
             closed_at = NULL,
             closed_by = NULL,
             close_revenue = NULL,
             close_expected_salary = NULL,
             close_balance = NULL
         WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3`,
        [teacherId, monthName, branchId]
      );
    }

    const del = await client.query(
      `DELETE FROM teacher_salary_payouts
       WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3
       RETURNING id`,
      [teacherId, monthName, branchId]
    );

    const summary = await buildOpenMonthSummary(client, teacherId, monthName, branchId);

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Teacher oyligi bo\'yicha berilgan to\'lovlar 0 ga qaytarildi',
      data: {
        deleted_count: del.rowCount,
        summary,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({
      success: false,
      message: 'Teacher oyligini tiklashda xatolik',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

exports.resetTeacherMonthAdvances = async (req, res) => {
  const teacherId = Number(req.params.teacher_id);
  const monthName = req.params.month_name;
  const branchId = getScopedBranchId(req);

  if (!teacherId || Number.isNaN(teacherId)) {
    return res.status(400).json({ success: false, message: 'teacher_id noto\'g\'ri' });
  }

  if (!isValidMonth(monthName)) {
    return res.status(400).json({ success: false, message: 'month_name YYYY-MM formatda bo\'lishi kerak' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teacher = await getTeacherWithPercent(client, teacherId, branchId);
    if (!teacher) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: "O'qituvchi topilmadi" });
    }

    const closed = await client.query(
      `SELECT is_closed
       FROM teacher_monthly_salaries
       WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3
       FOR UPDATE`,
      [teacherId, monthName, branchId]
    );

    if (closed.rows[0]?.is_closed) {
      await client.query(
        `UPDATE teacher_monthly_salaries
         SET is_closed = false,
             closed_at = NULL,
             closed_by = NULL,
             close_revenue = NULL,
             close_expected_salary = NULL,
             close_balance = NULL
         WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3`,
        [teacherId, monthName, branchId]
      );
    }

    const del = await client.query(
      `DELETE FROM teacher_advances
       WHERE teacher_id = $1 AND month_name = $2 AND branch_id = $3
       RETURNING id`,
      [teacherId, monthName, branchId]
    );

    const summary = await buildOpenMonthSummary(client, teacherId, monthName, branchId);

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Teacher avanslari 0 ga qaytarildi',
      data: {
        deleted_count: del.rowCount,
        summary,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return res.status(500).json({
      success: false,
      message: 'Teacher avanslarini tiklashda xatolik',
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// Backward compatibility aliases
exports.createTeacherSalaryPayout = exports.createTeacherSalaryGiven;
exports.getTeacherSalaryPayouts = exports.getTeacherSalaryGivenList;
