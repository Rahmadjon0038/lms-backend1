const pool = require('../config/db');

const createTeacherSalaryTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_salary_settings (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        salary_percentage DECIMAL(5,2) DEFAULT 50.00,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_advances (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(12,2) NOT NULL,
        month_name VARCHAR(7) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_salary_payouts (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        month_name VARCHAR(7) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS teacher_monthly_salaries (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        month_name VARCHAR(7) NOT NULL,
        salary_percentage DECIMAL(5,2) DEFAULT 50.00,
        collected_revenue DECIMAL(12,2) DEFAULT 0,
        expected_salary DECIMAL(12,2) DEFAULT 0,
        carry_from_previous DECIMAL(12,2) DEFAULT 0,
        gross_salary DECIMAL(12,2) DEFAULT 0,
        total_advances DECIMAL(12,2) DEFAULT 0,
        net_salary DECIMAL(12,2) DEFAULT 0,
        total_payouts DECIMAL(12,2) DEFAULT 0,
        balance DECIMAL(12,2) DEFAULT 0,
        total_students INTEGER DEFAULT 0,
        paid_students INTEGER DEFAULT 0,
        partial_students INTEGER DEFAULT 0,
        unpaid_students INTEGER DEFAULT 0,
        fully_paid_students INTEGER DEFAULT 0,
        is_closed BOOLEAN DEFAULT false,
        closed_at TIMESTAMP,
        closed_by INTEGER REFERENCES users(id),
        close_revenue DECIMAL(12,2),
        close_expected_salary DECIMAL(12,2),
        close_balance DECIMAL(12,2),
        recalculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_id, month_name)
      );
    `);

    await pool.query(`
      ALTER TABLE teacher_salary_settings
      ADD COLUMN IF NOT EXISTS salary_percentage DECIMAL(5,2) DEFAULT 50.00;
    `);

    await pool.query(`
      ALTER TABLE teacher_salary_settings
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    `);

    await pool.query(`
      ALTER TABLE teacher_salary_settings
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'teacher_salary_settings'
            AND column_name = 'base_percentage'
        ) THEN
          EXECUTE '
            UPDATE teacher_salary_settings
            SET salary_percentage = COALESCE(salary_percentage, base_percentage, 50.00)
            WHERE salary_percentage IS NULL OR salary_percentage = 0
          ';
        ELSE
          EXECUTE '
            UPDATE teacher_salary_settings
            SET salary_percentage = COALESCE(salary_percentage, 50.00)
            WHERE salary_percentage IS NULL OR salary_percentage = 0
          ';
        END IF;
      END $$;
    `);

    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS salary_percentage DECIMAL(5,2) DEFAULT 50.00;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS collected_revenue DECIMAL(12,2) DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS expected_salary DECIMAL(12,2) DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS carry_from_previous DECIMAL(12,2) DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS gross_salary DECIMAL(12,2) DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS total_advances DECIMAL(12,2) DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS net_salary DECIMAL(12,2) DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS total_payouts DECIMAL(12,2) DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS balance DECIMAL(12,2) DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS total_students INTEGER DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS paid_students INTEGER DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS partial_students INTEGER DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS unpaid_students INTEGER DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS fully_paid_students INTEGER DEFAULT 0;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT false;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS closed_by INTEGER REFERENCES users(id);
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS close_revenue DECIMAL(12,2);
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS close_expected_salary DECIMAL(12,2);
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS close_balance DECIMAL(12,2);
    `);
    await pool.query(`
      ALTER TABLE teacher_monthly_salaries
      ADD COLUMN IF NOT EXISTS recalculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_teacher_advances_teacher_month
      ON teacher_advances(teacher_id, month_name);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_teacher_salary_payouts_teacher_month
      ON teacher_salary_payouts(teacher_id, month_name);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_teacher_monthly_salaries_month
      ON teacher_monthly_salaries(month_name);
    `);

    console.log("✅ Teacher salary V2 jadvallari tayyorlandi.");
  } catch (err) {
    console.error("❌ Teacher salary V2 jadvallarida xatolik:", err.message);
    throw err;
  }
};

module.exports = { createTeacherSalaryTables };
