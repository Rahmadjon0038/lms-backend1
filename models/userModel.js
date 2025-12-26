const pool = require('../config/db');

const createUserTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      surname VARCHAR(100) NOT NULL,
      username VARCHAR(50) UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role VARCHAR(20) DEFAULT 'student', -- 'admin', 'teacher', 'student', 'super_admin'
      status VARCHAR(20) DEFAULT 'active', -- 'active', 'inactive', 'blocked'
      phone VARCHAR(20),
      phone2 VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);
    console.log("✅ 'users' jadvali tekshirildi/yaratildi.");
  } catch (err) {
    console.error("❌ Jadval yaratishda xato:", err.message);
  }
};

module.exports = { createUserTable };