const pool = require('../config/db');

const getBranches = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, address, phone, status, created_at, updated_at
       FROM branches
       ORDER BY id ASC`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Filiallarni olishda xatolik', error: error.message });
  }
};

const createBranch = async (req, res) => {
  const { name, address, phone } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ success: false, message: 'Filial nomi majburiy' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO branches (name, address, phone)
       VALUES ($1, $2, $3)
       RETURNING id, name, address, phone, status, created_at, updated_at`,
      [String(name).trim(), address || null, phone || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Filial yaratishda xatolik', error: error.message });
  }
};

const updateBranch = async (req, res) => {
  const branchId = Number(req.params.id);
  const { name, address, phone, status } = req.body || {};

  if (!Number.isInteger(branchId) || branchId <= 0) {
    return res.status(400).json({ success: false, message: 'Filial ID noto‘g‘ri' });
  }

  try {
    const result = await pool.query(
      `UPDATE branches
       SET name = COALESCE($1, name),
           address = COALESCE($2, address),
           phone = COALESCE($3, phone),
           status = COALESCE($4, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, name, address, phone, status, created_at, updated_at`,
      [
        name !== undefined ? String(name).trim() : null,
        address !== undefined ? address : null,
        phone !== undefined ? phone : null,
        status !== undefined ? status : null,
        branchId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Filial topilmadi' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Filialni yangilashda xatolik', error: error.message });
  }
};

module.exports = {
  getBranches,
  createBranch,
  updateBranch
};
