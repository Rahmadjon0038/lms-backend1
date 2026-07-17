const pool = require('../config/db');

const BRANCH_SCOPED_TABLES = [
  'users',
  'rooms',
  'subjects',
  'groups',
  'student_groups',
  'monthly_fees',
  'payments',
  'student_discounts',
  'student_payments',
  'student_point_events',
  'payment_transactions',
  'attendance',
  'lessons',
  'holidays',
  'monthly_snapshots',
  'notifications',
  'profile_avatars',
  'center_expenses',
  'expense_categories',
  'group_monthly_settings',
  'teacher_subjects',
  'teacher_salary_settings',
  'teacher_advances',
  'teacher_salary_payouts',
  'teacher_monthly_salaries',
  'teacher_late_records',
  'admin_salary_payouts',
  'stories',
  'news',
  'guide_levels',
  'guide_level_main_pdfs',
  'guide_lessons',
  'guide_lesson_notes',
  'guide_lesson_pdfs',
  'guide_lesson_assignments',
  'guide_lesson_vocabularies',
  'guide_lesson_vocabulary_pdfs',
  'guide_lesson_vocabulary_images',
  'guide_lesson_vocabulary_markdowns',
  'guide_lesson_videos',
  'guide_user_speech_settings'
];

const createBranchTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      address TEXT,
      phone VARCHAR(50),
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    INSERT INTO branches (id, name, status)
    VALUES (1, 'Asosiy filial', 'active')
    ON CONFLICT (id) DO UPDATE SET
      name = COALESCE(branches.name, EXCLUDED.name),
      status = COALESCE(branches.status, EXCLUDED.status);
  `);

  for (const tableName of BRANCH_SCOPED_TABLES) {
    const tableExists = await pool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
       LIMIT 1`,
      [tableName]
    );

    if (tableExists.rows.length === 0) {
      continue;
    }

    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS branch_id INTEGER;`);
    await pool.query(`ALTER TABLE ${tableName} ALTER COLUMN branch_id SET DEFAULT 1;`);
    await pool.query(`UPDATE ${tableName} SET branch_id = 1 WHERE branch_id IS NULL;`);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = '${tableName}'::regclass
            AND conname = '${tableName}_branch_id_fkey'
        ) THEN
          ALTER TABLE ${tableName}
          ADD CONSTRAINT ${tableName}_branch_id_fkey
          FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
        END IF;
      END $$;
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_branch_id ON ${tableName}(branch_id);`);
  }

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'users'::regclass AND conname = 'users_username_key'
      ) THEN
        ALTER TABLE users DROP CONSTRAINT users_username_key;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'users'::regclass AND conname = 'users_branch_username_key'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_branch_username_key UNIQUE (branch_id, username);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'subjects'::regclass AND conname = 'subjects_name_key'
      ) THEN
        ALTER TABLE subjects DROP CONSTRAINT subjects_name_key;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'subjects'::regclass AND conname = 'subjects_branch_name_key'
      ) THEN
        ALTER TABLE subjects ADD CONSTRAINT subjects_branch_name_key UNIQUE (branch_id, name);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'rooms'::regclass AND conname = 'rooms_room_number_key'
      ) THEN
        ALTER TABLE rooms DROP CONSTRAINT rooms_room_number_key;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'rooms'::regclass AND conname = 'rooms_branch_room_number_key'
      ) THEN
        ALTER TABLE rooms ADD CONSTRAINT rooms_branch_room_number_key UNIQUE (branch_id, room_number);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'expense_categories'::regclass AND conname = 'expense_categories_name_key'
      ) THEN
        ALTER TABLE expense_categories DROP CONSTRAINT expense_categories_name_key;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'expense_categories'::regclass AND conname = 'expense_categories_branch_name_key'
      ) THEN
        ALTER TABLE expense_categories ADD CONSTRAINT expense_categories_branch_name_key UNIQUE (branch_id, name);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'holidays'::regclass AND conname = 'holidays_pkey'
      ) THEN
        ALTER TABLE holidays DROP CONSTRAINT holidays_pkey;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'holidays'::regclass AND conname = 'holidays_branch_date_key'
      ) THEN
        ALTER TABLE holidays ADD CONSTRAINT holidays_branch_date_key UNIQUE (branch_id, date);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'groups'::regclass AND conname = 'groups_unique_code_key'
      ) THEN
        ALTER TABLE groups DROP CONSTRAINT groups_unique_code_key;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'groups'::regclass AND conname = 'groups_branch_unique_code_key'
      ) THEN
        ALTER TABLE groups ADD CONSTRAINT groups_branch_unique_code_key UNIQUE (branch_id, unique_code);
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'guide_user_speech_settings'::regclass
          AND conname = 'guide_user_speech_settings_user_id_key'
      ) THEN
        ALTER TABLE guide_user_speech_settings DROP CONSTRAINT guide_user_speech_settings_user_id_key;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'guide_user_speech_settings'::regclass
          AND conname = 'guide_user_speech_settings_branch_user_key'
      ) THEN
        ALTER TABLE guide_user_speech_settings
        ADD CONSTRAINT guide_user_speech_settings_branch_user_key UNIQUE (branch_id, user_id);
      END IF;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END $$;
  `);

  console.log("✅ 'branches' jadvali va branch_id migration tayyor.");
};

module.exports = { createBranchTables };
