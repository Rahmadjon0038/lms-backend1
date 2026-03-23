const pool = require('../config/db');

const isValidDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isValidMonth = (v) => /^\d{4}-\d{2}$/.test(v);
const getToday = () => new Date().toISOString().slice(0, 10);
const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const mapExpense = (row) => ({
  id: row.id,
  reason: row.title,
  amount: Number(row.amount),
  expense_date: row.expense_date,
  month: row.month,
  created_at: row.created_at,
  created_by: row.created_by,
  admin_name: row.admin_name,
  admin_surname: row.admin_surname,
  admin_full_name: row.admin_full_name,
});

const createExpense = async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const amount = Number(req.body?.amount);
  const expenseDate = req.body?.expense_date || getToday();

  if (!reason) {
    return res.status(400).json({ success: false, message: 'reason majburiy', errors: {} });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'amount musbat son bo\'lishi kerak', errors: {} });
  }
  if (!isValidDate(expenseDate)) {
    return res.status(400).json({ success: false, message: 'expense_date formati YYYY-MM-DD bo\'lishi kerak', errors: {} });
  }

  try {
    const month = expenseDate.slice(0, 7);
    const result = await pool.query(
      `INSERT INTO center_expenses (title, note, amount, expense_date, month, created_by)
       VALUES ($1, NULL, $2, $3::date, $4, $5)
       RETURNING id, title, amount, expense_date::text, month, created_at, created_by`,
      [reason, amount, expenseDate, month, req.user.id]
    );

    const created = result.rows[0];
    const adminName = req.user?.name || null;
    const adminSurname = req.user?.surname || null;
    const adminFullName = adminName && adminSurname ? `${adminName} ${adminSurname}` : null;

    return res.status(201).json({
      success: true,
      data: mapExpense({
        ...created,
        created_by: req.user?.id,
        admin_name: adminName,
        admin_surname: adminSurname,
        admin_full_name: adminFullName,
      }),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Rasxod qo\'shishda xatolik', errors: { detail: error.message } });
  }
};

const getExpenses = async (req, res) => {
  const month = req.query.month || getCurrentMonth();
  const adminNameFilter = typeof req.query.admin_name === 'string' ? req.query.admin_name.trim() : '';
  if (!isValidMonth(month)) {
    return res.status(400).json({ success: false, message: 'month formati YYYY-MM bo\'lishi kerak', errors: {} });
  }

  try {
    const filters = [];
    const params = [month];
    let paramIndex = 2;

    if (adminNameFilter) {
      filters.push(`(u.name ILIKE $${paramIndex} OR u.surname ILIKE $${paramIndex} OR (u.name || ' ' || u.surname) ILIKE $${paramIndex})`);
      params.push(`%${adminNameFilter}%`);
      paramIndex++;
    }

    const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT ce.id, ce.title, ce.amount, ce.expense_date::text, ce.month, ce.created_at, ce.created_by,
              u.name AS admin_name, u.surname AS admin_surname, (u.name || ' ' || u.surname) AS admin_full_name
       FROM center_expenses ce
       JOIN users u ON u.id = ce.created_by
       WHERE ce.month = $1
       ${whereClause}
       ORDER BY ce.expense_date DESC, ce.id DESC`,
      params
    );

    return res.json({
      success: true,
      data: {
        month,
        admin_name: adminNameFilter || undefined,
        count: result.rows.length,
        items: result.rows.map(mapExpense),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Rasxodlar ro\'yxatini olishda xatolik', errors: { detail: error.message } });
  }
};

const getExpenseSummary = async (req, res) => {
  const month = req.query.month || getCurrentMonth();
  if (!isValidMonth(month)) {
    return res.status(400).json({ success: false, message: 'month formati YYYY-MM bo\'lishi kerak', errors: {} });
  }

  const today = getToday();

  try {
    const [todaySum, monthSum] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM center_expenses
         WHERE expense_date = $1::date`,
        [today]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM center_expenses
         WHERE month = $1`,
        [month]
      ),
    ]);

    return res.json({
      success: true,
      data: {
        today,
        month,
        today_total_expense: Number(todaySum.rows[0].total || 0),
        month_total_expense: Number(monthSum.rows[0].total || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Rasxod summalarini olishda xatolik', errors: { detail: error.message } });
  }
};

const updateExpense = async (req, res) => {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'id noto\'g\'ri', errors: {} });
  }

  const hasReason = Object.prototype.hasOwnProperty.call(req.body || {}, 'reason');
  const hasAmount = Object.prototype.hasOwnProperty.call(req.body || {}, 'amount');
  const hasExpenseDate = Object.prototype.hasOwnProperty.call(req.body || {}, 'expense_date');

  if (!hasReason && !hasAmount && !hasExpenseDate) {
    return res.status(400).json({
      success: false,
      message: 'Yangilash uchun kamida bitta maydon yuboring: reason, amount yoki expense_date',
      errors: {},
    });
  }

  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (hasReason) {
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      return res.status(400).json({ success: false, message: 'reason bo\'sh bo\'lmasligi kerak', errors: {} });
    }
    updates.push(`title = $${paramIndex++}`);
    params.push(reason);
  }

  if (hasAmount) {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'amount musbat son bo\'lishi kerak', errors: {} });
    }
    updates.push(`amount = $${paramIndex++}`);
    params.push(amount);
  }

  if (hasExpenseDate) {
    const expenseDate = req.body.expense_date;
    if (!isValidDate(expenseDate)) {
      return res.status(400).json({ success: false, message: 'expense_date formati YYYY-MM-DD bo\'lishi kerak', errors: {} });
    }
    updates.push(`expense_date = $${paramIndex}::date`);
    params.push(expenseDate);
    paramIndex++;

    updates.push(`month = $${paramIndex}`);
    params.push(expenseDate.slice(0, 7));
    paramIndex++;
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  try {
    const result = await pool.query(
      `UPDATE center_expenses
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, title, amount, expense_date::text, month, created_at, created_by`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rasxod topilmadi', errors: {} });
    }

    return res.json({ success: true, data: mapExpense(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Rasxodni yangilashda xatolik', errors: { detail: error.message } });
  }
};

const deleteExpense = async (req, res) => {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'id noto\'g\'ri', errors: {} });
  }

  try {
    const result = await pool.query(
      `DELETE FROM center_expenses
       WHERE id = $1
       RETURNING id, title, amount, expense_date::text, month, created_at, created_by`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rasxod topilmadi', errors: {} });
    }

    return res.json({
      success: true,
      message: 'Rasxod o\'chirildi',
      data: mapExpense(result.rows[0]),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Rasxodni o\'chirishda xatolik', errors: { detail: error.message } });
  }
};

module.exports = {
  createExpense,
  getExpenses,
  getExpenseSummary,
  updateExpense,
  deleteExpense,
};
