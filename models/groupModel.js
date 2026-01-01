const pool = require('../config/db');

const createGroupTables = async () => {
  const queryText = `
    -- Guruhlar jadvali
    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subject_id INTEGER, 
      teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      unique_code VARCHAR(20) UNIQUE NOT NULL,
      start_date DATE,
      schedule JSONB,
      price DECIMAL(10,2),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Studentlarni guruhga bog'lash jadvali
    CREATE TABLE IF NOT EXISTS student_groups (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      left_at TIMESTAMP,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'finished')),
      UNIQUE(student_id, group_id)
    );
  `;

  try {
    await pool.query(queryText);
    console.log("✅ 'groups' va 'student_groups' SERIAL ID bilan tayyor.");
  } catch (err) {
    console.error("❌ Xatolik:", err.message);
  }
};

module.exports = { createGroupTables };