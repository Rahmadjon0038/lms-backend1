const pool = require('../config/db');

// O'qituvchilarning kechikishlari (kech qolgan daqiqalari) jadvali.
// Har bir yozuv = bitta kunga kechikish: sana, necha daqiqa, izoh.
const createTeacherLateTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_late_records (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        late_date DATE NOT NULL,
        minutes INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_teacher_late_records_teacher_date
      ON teacher_late_records(teacher_id, late_date);
    `);

    console.log("✅ Teacher late (kechikish) jadvali tayyorlandi.");
  } catch (err) {
    console.error("❌ Teacher late jadvalida xatolik:", err.message);
    throw err;
  }
};

module.exports = { createTeacherLateTables };
