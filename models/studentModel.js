const pool = require('../config/db');

const createStudentAdditionalTables = async () => {
  const queryText = `
    -- Fanlar/Kurslar jadvali
    CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      price DECIMAL(10, 2) NOT NULL
    );

    -- To'lovlar jadvali (Oylar kesimida saqlash uchun)
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      amount DECIMAL(10, 2) NOT NULL,
      month_name VARCHAR(20) NOT NULL, -- Masalan: 'December 2024'
      status VARCHAR(20) DEFAULT 'paid',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(queryText);
    console.log("✅ Studentlar uchun qo'shimcha jadvallar tayyor.");
  } catch (err) {
    console.error("❌ Xato:", err.message);
  }
};

module.exports = { createStudentAdditionalTables };