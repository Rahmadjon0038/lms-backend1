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
  category_id: row.category_id || null,
  category_name: row.category_name || null,
});

const findCategoryById = async (categoryId) => {
  const result = await pool.query(
    'SELECT id, name FROM expense_categories WHERE id = $1',
    [categoryId]
  );
  return result.rows[0] || null;
};

const createExpense = async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  const amount = Number(req.body?.amount);
  const expenseDate = req.body?.expense_date || getToday();
  const rawCategoryId = req.body?.category_id;

  if (!reason) {
    return res.status(400).json({ success: false, message: 'reason majburiy', errors: {} });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'amount musbat son bo\'lishi kerak', errors: {} });
  }
  if (!isValidDate(expenseDate)) {
    return res.status(400).json({ success: false, message: 'expense_date formati YYYY-MM-DD bo\'lishi kerak', errors: {} });
  }

  let category = null;
  if (rawCategoryId !== undefined && rawCategoryId !== null && rawCategoryId !== '') {
    const categoryId = Number(rawCategoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({ success: false, message: 'category_id noto\'g\'ri', errors: {} });
    }
    category = await findCategoryById(categoryId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategoriya topilmadi', errors: {} });
    }
  }

  try {
    const month = expenseDate.slice(0, 7);
    const result = await pool.query(
      `INSERT INTO center_expenses (title, note, amount, expense_date, month, created_by, category_id)
       VALUES ($1, NULL, $2, $3::date, $4, $5, $6)
       RETURNING id, title, amount, expense_date::text, month, created_at, created_by, category_id`,
      [reason, amount, expenseDate, month, req.user.id, category ? category.id : null]
    );

    const created = { ...result.rows[0], category_name: category ? category.name : null };
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
  const dateFilter = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  if (dateFilter && !isValidDate(dateFilter)) {
    return res.status(400).json({ success: false, message: 'date formati YYYY-MM-DD bo\'lishi kerak', errors: {} });
  }
  const month = dateFilter ? dateFilter.slice(0, 7) : req.query.month || getCurrentMonth();
  const adminNameFilter = typeof req.query.admin_name === 'string' ? req.query.admin_name.trim() : '';
  const categoryIdFilter = req.query.category_id !== undefined ? Number(req.query.category_id) : null;
  if (!isValidMonth(month)) {
    return res.status(400).json({ success: false, message: 'month formati YYYY-MM bo\'lishi kerak', errors: {} });
  }
  if (req.query.category_id !== undefined && (!Number.isInteger(categoryIdFilter) || categoryIdFilter <= 0)) {
    return res.status(400).json({ success: false, message: 'category_id noto\'g\'ri', errors: {} });
  }

  try {
    const filters = [];
    const params = [month];
    let paramIndex = 2;

    if (dateFilter) {
      filters.push(`ce.expense_date = $${paramIndex}::date`);
      params.push(dateFilter);
      paramIndex++;
    }

    if (adminNameFilter) {
      filters.push(`(u.name ILIKE $${paramIndex} OR u.surname ILIKE $${paramIndex} OR (u.name || ' ' || u.surname) ILIKE $${paramIndex})`);
      params.push(`%${adminNameFilter}%`);
      paramIndex++;
    }

    if (categoryIdFilter) {
      filters.push(`ce.category_id = $${paramIndex}`);
      params.push(categoryIdFilter);
      paramIndex++;
    }

    const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT ce.id, ce.title, ce.amount, ce.expense_date::text, ce.month, ce.created_at, ce.created_by,
              ce.category_id, ec.name AS category_name,
              u.name AS admin_name, u.surname AS admin_surname, (u.name || ' ' || u.surname) AS admin_full_name
       FROM center_expenses ce
       JOIN users u ON u.id = ce.created_by
       LEFT JOIN expense_categories ec ON ec.id = ce.category_id
       WHERE ce.month = $1
       ${whereClause}
       ORDER BY ce.expense_date DESC, ce.id DESC`,
      params
    );

    return res.json({
      success: true,
      data: {
        month,
        date: dateFilter || undefined,
        admin_name: adminNameFilter || undefined,
        category_id: categoryIdFilter || undefined,
        count: result.rows.length,
        items: result.rows.map(mapExpense),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Rasxodlar ro\'yxatini olishda xatolik', errors: { detail: error.message } });
  }
};

const getExpenseSummary = async (req, res) => {
  const dateFilter = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  if (dateFilter && !isValidDate(dateFilter)) {
    return res.status(400).json({ success: false, message: 'date formati YYYY-MM-DD bo\'lishi kerak', errors: {} });
  }
  const month = dateFilter ? dateFilter.slice(0, 7) : req.query.month || getCurrentMonth();
  const categoryIdFilter = req.query.category_id !== undefined ? Number(req.query.category_id) : null;
  if (!isValidMonth(month)) {
    return res.status(400).json({ success: false, message: 'month formati YYYY-MM bo\'lishi kerak', errors: {} });
  }
  if (req.query.category_id !== undefined && (!Number.isInteger(categoryIdFilter) || categoryIdFilter <= 0)) {
    return res.status(400).json({ success: false, message: 'category_id noto\'g\'ri', errors: {} });
  }

  const today = getToday();
  const categoryClause = categoryIdFilter ? 'AND category_id = $2' : '';

  try {
    const [todaySum, monthSum, dateSum] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM center_expenses
         WHERE expense_date = $1::date
         ${categoryClause}`,
        categoryIdFilter ? [today, categoryIdFilter] : [today]
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::float AS total
         FROM center_expenses
         WHERE month = $1
         ${categoryClause}`,
        categoryIdFilter ? [month, categoryIdFilter] : [month]
      ),
      dateFilter
        ? pool.query(
            `SELECT COALESCE(SUM(amount), 0)::float AS total
             FROM center_expenses
             WHERE expense_date = $1::date
             ${categoryClause}`,
            categoryIdFilter ? [dateFilter, categoryIdFilter] : [dateFilter]
          )
        : Promise.resolve(null),
    ]);

    return res.json({
      success: true,
      data: {
        today,
        month,
        date: dateFilter || undefined,
        category_id: categoryIdFilter || undefined,
        today_total_expense: Number(todaySum.rows[0].total || 0),
        month_total_expense: Number(monthSum.rows[0].total || 0),
        date_total_expense: dateSum ? Number(dateSum.rows[0].total || 0) : undefined,
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
  const hasCategoryId = Object.prototype.hasOwnProperty.call(req.body || {}, 'category_id');

  if (!hasReason && !hasAmount && !hasExpenseDate && !hasCategoryId) {
    return res.status(400).json({
      success: false,
      message: 'Yangilash uchun kamida bitta maydon yuboring: reason, amount, expense_date yoki category_id',
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

  if (hasCategoryId) {
    const rawCategoryId = req.body.category_id;
    if (rawCategoryId === null || rawCategoryId === '') {
      updates.push('category_id = NULL');
    } else {
      const categoryId = Number(rawCategoryId);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return res.status(400).json({ success: false, message: 'category_id noto\'g\'ri', errors: {} });
      }
      const category = await findCategoryById(categoryId);
      if (!category) {
        return res.status(404).json({ success: false, message: 'Kategoriya topilmadi', errors: {} });
      }
      updates.push(`category_id = $${paramIndex++}`);
      params.push(categoryId);
    }
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);

  try {
    const result = await pool.query(
      `UPDATE center_expenses
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, title, amount, expense_date::text, month, created_at, created_by, category_id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Rasxod topilmadi', errors: {} });
    }

    const updated = result.rows[0];
    let categoryName = null;
    if (updated.category_id) {
      const category = await findCategoryById(updated.category_id);
      categoryName = category ? category.name : null;
    }

    return res.json({ success: true, data: mapExpense({ ...updated, category_name: categoryName }) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Rasxodni yangilashda xatolik', errors: { detail: error.message } });
  }
};

const getExpenseCategories = async (req, res) => {
  const dateFilter = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  const monthFilter = typeof req.query.month === 'string' ? req.query.month.trim() : '';
  if (dateFilter && !isValidDate(dateFilter)) {
    return res.status(400).json({ success: false, message: 'date formati YYYY-MM-DD bo\'lishi kerak', errors: {} });
  }
  if (monthFilter && !isValidMonth(monthFilter)) {
    return res.status(400).json({ success: false, message: 'month formati YYYY-MM bo\'lishi kerak', errors: {} });
  }

  // date yoki month berilsa, chip'lardagi soni va summasi shu davr bo'yicha hisoblanadi
  const params = [];
  let joinCondition = 'ce.category_id = ec.id';
  if (dateFilter) {
    params.push(dateFilter);
    joinCondition += ' AND ce.expense_date = $1::date';
  } else if (monthFilter) {
    params.push(monthFilter);
    joinCondition += ' AND ce.month = $1';
  }

  try {
    const result = await pool.query(
      `SELECT ec.id, ec.name, ec.created_at,
              COUNT(ce.id)::int AS expense_count,
              COALESCE(SUM(ce.amount), 0)::float AS total_amount
       FROM expense_categories ec
       LEFT JOIN center_expenses ce ON ${joinCondition}
       GROUP BY ec.id
       ORDER BY ec.name ASC`,
      params
    );

    return res.json({
      success: true,
      data: {
        month: monthFilter || undefined,
        date: dateFilter || undefined,
        count: result.rows.length,
        items: result.rows,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Kategoriyalarni olishda xatolik', errors: { detail: error.message } });
  }
};

const createExpenseCategory = async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    return res.status(400).json({ success: false, message: 'name majburiy', errors: {} });
  }
  if (name.length > 100) {
    return res.status(400).json({ success: false, message: 'name 100 belgidan oshmasligi kerak', errors: {} });
  }

  try {
    const existing = await pool.query(
      'SELECT id FROM expense_categories WHERE LOWER(name) = LOWER($1)',
      [name]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Bunday kategoriya allaqachon mavjud', errors: {} });
    }

    const result = await pool.query(
      `INSERT INTO expense_categories (name, created_by)
       VALUES ($1, $2)
       RETURNING id, name, created_at`,
      [name, req.user.id]
    );

    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Kategoriya qo\'shishda xatolik', errors: { detail: error.message } });
  }
};

const deleteExpenseCategory = async (req, res) => {
  const id = Number(req.params?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'id noto\'g\'ri', errors: {} });
  }

  try {
    const result = await pool.query(
      `DELETE FROM expense_categories
       WHERE id = $1
       RETURNING id, name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Kategoriya topilmadi', errors: {} });
    }

    return res.json({
      success: true,
      message: 'Kategoriya o\'chirildi (rasxodlar kategoriyasiz qoladi)',
      data: result.rows[0],
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Kategoriyani o\'chirishda xatolik', errors: { detail: error.message } });
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
  getExpenseCategories,
  createExpenseCategory,
  deleteExpenseCategory,
};
