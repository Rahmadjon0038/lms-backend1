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
       RETURNING id, title, amount, expense_date::text, month, created_at`,
      [reason, amount, expenseDate, month, req.user.id]
    );

    return res.status(201).json({ success: true, data: mapExpense(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Rasxod qo\'shishda xatolik', errors: { detail: error.message } });
  }
};

const getExpenses = async (req, res) => {
  const month = req.query.month || getCurrentMonth();
  if (!isValidMonth(month)) {
    return res.status(400).json({ success: false, message: 'month formati YYYY-MM bo\'lishi kerak', errors: {} });
  }

  try {
    const result = await pool.query(
      `SELECT id, title, amount, expense_date::text, month, created_at
       FROM center_expenses
       WHERE month = $1
       ORDER BY expense_date DESC, id DESC`,
      [month]
    );

    return res.json({
      success: true,
      data: {
        month,
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
       RETURNING id, title, amount, expense_date::text, month, created_at`,
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
       RETURNING id, title, amount, expense_date::text, month, created_at`,
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
