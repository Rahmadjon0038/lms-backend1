const pool = require('../config/db');

const createGroupTables = async () => {
  const queryText = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS groups (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      subject_id UUID, -- Keyinchalik Subject jadvali bilan bog'laymiz
      teacher_id INTEGER REFERENCES users(id), -- O'qituvchi ID (User jadvalidan)
      unique_code VARCHAR(20) UNIQUE NOT NULL,
      start_date DATE DEFAULT CURRENT_DATE,
      schedule JSONB, -- { "days": ["Mon", "Wed"], "time": "10:00-12:00" }
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_groups (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      left_at TIMESTAMP,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'finished')),
      UNIQUE(student_id, group_id) -- Bir student bir guruhga ikki marta qo'shila olmaydi
    );
  `;

  try {
    await pool.query(queryText);
    console.log("✅ 'groups' va 'student_groups' jadvallari tayyor.");
  } catch (err) {
    console.error("❌ Guruh jadvallarini yaratishda xato:", err.message);
  }
};

module.exports = { createGroupTables };