const pool = require('../config/db');

const createExpenseTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS center_expenses (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      note TEXT,
      amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
      expense_date DATE NOT NULL,
      month VARCHAR(7) NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_center_expenses_month ON center_expenses(month);
    CREATE INDEX IF NOT EXISTS idx_center_expenses_date ON center_expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_center_expenses_created_by ON center_expenses(created_by);
  `;

  try {
    await pool.query(query);
    console.log("✅ 'center_expenses' jadvali tayyor");
  } catch (err) {
    console.error("❌ 'center_expenses' jadvalini yaratishda xatolik:", err.message);
    throw err;
  }
};

module.exports = { createExpenseTable };
