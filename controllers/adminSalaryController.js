const pool = require('../config/db');

const isValidMonthName = (value) => typeof value === 'string' && /^\d{4}-\d{2}$/.test(value.trim());

const createOrUpdateAdminSalary = async (req, res) => {
  const { admin_id, month_name, amount, description } = req.body || {};
  const adminId = Number(admin_id);
  const monthName = typeof month_name === 'string' ? month_name.trim() : '';
  const numericAmount = Number(amount);

  if (!Number.isInteger(adminId) || adminId <= 0) {
    return res.status(400).json({ success: false, message: 'admin_id noto\'g\'ri' });
  }

  if (!isValidMonthName(monthName)) {
    return res.status(400).json({ success: false, message: "month_name 'YYYY-MM' formatida bo'lishi kerak" });
  }

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ success: false, message: "amount 0 dan katta bo'lishi kerak" });
  }

  try {
    const adminCheck = await pool.query(
      `SELECT id, name, surname, status
       FROM users
       WHERE id = $1 AND role = 'admin'`,
      [adminId]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Admin topilmadi' });
    }

    const existing = await pool.query(
      `SELECT id
       FROM admin_salary_payouts
       WHERE admin_id = $1 AND month_name = $2`,
      [adminId, monthName]
    );

    if (existing.rows.length === 0) {
      const insertRes = await pool.query(
        `INSERT INTO admin_salary_payouts (admin_id, month_name, amount, description, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING id, admin_id, month_name, amount, description, created_by, updated_by, created_at, updated_at`,
        [adminId, monthName, numericAmount, description || null, req.user.id]
      );

      return res.status(201).json({
        success: true,
        message: 'Admin oyligi saqlandi',
        action: 'created',
        salary: insertRes.rows[0]
      });
    }

    const updateRes = await pool.query(
      `UPDATE admin_salary_payouts
       SET amount = $1,
           description = $2,
           updated_by = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE admin_id = $4 AND month_name = $5
       RETURNING id, admin_id, month_name, amount, description, created_by, updated_by, created_at, updated_at`,
      [numericAmount, description || null, req.user.id, adminId, monthName]
    );

    return res.json({
      success: true,
      message: 'Admin oyligi yangilandi',
      action: 'updated',
      salary: updateRes.rows[0]
    });
  } catch (err) {
    console.error('Admin salary upsert error:', err.message);
    return res.status(500).json({ success: false, message: 'Admin oyligini saqlashda xatolik', error: err.message });
  }
};

const getAdminSalaryList = async (req, res) => {
  const { admin_id, month_name } = req.query || {};
  const filters = [];
  const params = [];
  let idx = 1;

  if (admin_id !== undefined) {
    const adminId = Number(admin_id);
    if (!Number.isInteger(adminId) || adminId <= 0) {
      return res.status(400).json({ success: false, message: 'admin_id noto\'g\'ri' });
    }
    filters.push(`asp.admin_id = $${idx++}`);
    params.push(adminId);
  }

  if (month_name !== undefined) {
    const monthName = String(month_name).trim();
    if (!isValidMonthName(monthName)) {
      return res.status(400).json({ success: false, message: "month_name 'YYYY-MM' formatida bo'lishi kerak" });
    }
    filters.push(`asp.month_name = $${idx++}`);
    params.push(monthName);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const result = await pool.query(
      `SELECT asp.id,
              asp.admin_id,
              u.name,
              u.surname,
              u.username,
              u.status,
              asp.month_name,
              asp.amount,
              asp.description,
              asp.created_by,
              asp.updated_by,
              asp.created_at,
              asp.updated_at
       FROM admin_salary_payouts asp
       JOIN users u ON u.id = asp.admin_id
       ${whereClause}
       ORDER BY asp.month_name DESC, asp.updated_at DESC`,
      params
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Admin salary list error:', err.message);
    return res.status(500).json({ success: false, message: 'Admin oyliklarini olishda xatolik', error: err.message });
  }
};

module.exports = { createOrUpdateAdminSalary, getAdminSalaryList };
