const pool = require('../config/db');

const createTeacherStatisticsTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_lesson_statistics_reports (
        id SERIAL PRIMARY KEY,
        lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
        branch_id INTEGER NOT NULL DEFAULT 1,
        report_month VARCHAR(7) NOT NULL,
        lesson_date DATE NOT NULL,
        lesson_start_time TIME,
        lesson_end_time TIME,
        homework INTEGER NOT NULL DEFAULT 0,
        vocabulary INTEGER NOT NULL DEFAULT 0,
        attendance INTEGER NOT NULL DEFAULT 0,
        participation INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        percent INTEGER NOT NULL DEFAULT 0,
        feedback VARCHAR(20) NOT NULL DEFAULT 'BAD',
        report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (lesson_id)
      );

      CREATE INDEX IF NOT EXISTS idx_teacher_lesson_statistics_branch
        ON teacher_lesson_statistics_reports(branch_id);
      CREATE INDEX IF NOT EXISTS idx_teacher_lesson_statistics_teacher
        ON teacher_lesson_statistics_reports(teacher_id);
      CREATE INDEX IF NOT EXISTS idx_teacher_lesson_statistics_group
        ON teacher_lesson_statistics_reports(group_id);
      CREATE INDEX IF NOT EXISTS idx_teacher_lesson_statistics_month
        ON teacher_lesson_statistics_reports(report_month);
      CREATE INDEX IF NOT EXISTS idx_teacher_lesson_statistics_date
        ON teacher_lesson_statistics_reports(lesson_date);
    `);

    await pool.query(`
      ALTER TABLE teacher_lesson_statistics_reports
        ADD COLUMN IF NOT EXISTS branch_id INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS report_month VARCHAR(7),
        ADD COLUMN IF NOT EXISTS lesson_date DATE,
        ADD COLUMN IF NOT EXISTS lesson_start_time TIME,
        ADD COLUMN IF NOT EXISTS lesson_end_time TIME,
        ADD COLUMN IF NOT EXISTS homework INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vocabulary INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS attendance INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS participation INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS percent INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS feedback VARCHAR(20) NOT NULL DEFAULT 'BAD',
        ADD COLUMN IF NOT EXISTS report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    console.log("✅ 'teacher_lesson_statistics_reports' jadvali yaratildi.");
  } catch (error) {
    console.error("Teacher statistikasi jadvalini yaratishda xatolik:", error);
    throw error;
  }
};

module.exports = { createTeacherStatisticsTables };
