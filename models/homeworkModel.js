const pool = require('../config/db');

const createHomeworkTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lesson_homework_assignments (
        id SERIAL PRIMARY KEY,
        lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
        branch_id INTEGER NOT NULL DEFAULT 1,
        lesson_date DATE NOT NULL,
        homework_text TEXT NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (lesson_id)
      );

      CREATE INDEX IF NOT EXISTS idx_lesson_homework_group
        ON lesson_homework_assignments(group_id);
      CREATE INDEX IF NOT EXISTS idx_lesson_homework_branch
        ON lesson_homework_assignments(branch_id);
    `);

    console.log("✅ 'lesson_homework_assignments' jadvali tayyor.");
  } catch (error) {
    console.error("Uyga vazifa jadvalini yaratishda xatolik:", error);
    throw error;
  }
};

module.exports = { createHomeworkTable };
