const pool = require('../config/db');

const createAdminSalaryTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_salary_payouts (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        month_name VARCHAR(7) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(admin_id, month_name)
      );
    `);

    await pool.query(`
      ALTER TABLE admin_salary_payouts
      ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);
    `);

    await pool.query(`
      ALTER TABLE admin_salary_payouts
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_salary_payouts_admin_month
      ON admin_salary_payouts(admin_id, month_name);
    `);

    console.log("✅ Admin salary tables ready.");
  } catch (err) {
    console.error("❌ Admin salary tables error:", err.message);
  }
};

module.exports = { createAdminSalaryTables };
