const pool = require('../config/db');
// 14 15 12 10 7
const createGroupTables = async () => {
  const queryText = `
    -- Guruhlar jadvali
    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subject_id INTEGER, 
      teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
      unique_code VARCHAR(20) UNIQUE NOT NULL,
      start_date DATE,
      schedule JSONB,
      schedule_effective_from DATE,
      price DECIMAL(10,2),
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'blocked')),
      class_start_date DATE, -- Darslar boshlangan sana
      class_status VARCHAR(20) DEFAULT 'not_started' CHECK (class_status IN ('not_started', 'started', 'finished')),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Studentlarni guruhga bog'lash jadvali
    CREATE TABLE IF NOT EXISTS student_groups (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      branch_id INTEGER,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      left_at TIMESTAMP,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'finished', 'removed')),
      UNIQUE(student_id, group_id)
    );
  `;

  try {
    await pool.query(queryText);
    
    // Eski jadvallarga status va room_id ustuni qo'shish (agar mavjud bo'lmasa)
    try {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='groups' AND column_name='status') THEN
            ALTER TABLE groups ADD COLUMN status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'blocked'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='groups' AND column_name='class_start_date') THEN
            ALTER TABLE groups ADD COLUMN class_start_date DATE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='groups' AND column_name='class_status') THEN
            ALTER TABLE groups ADD COLUMN class_status VARCHAR(20) DEFAULT 'not_started' CHECK (class_status IN ('not_started', 'started', 'finished'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='groups' AND column_name='room_id') THEN
            ALTER TABLE groups ADD COLUMN room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='groups' AND column_name='schedule_effective_from') THEN
            ALTER TABLE groups ADD COLUMN schedule_effective_from DATE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_groups' AND column_name='branch_id') THEN
            ALTER TABLE student_groups ADD COLUMN branch_id INTEGER;
          END IF;
        END $$;
      `);
      console.log("✅ 'groups' jadvaliga status va room_id ustuni qo'shildi.");
    } catch (alterErr) {
      console.log("⚠️ Status ustuni qo'shishda xatolik (balki mavjud):", alterErr.message);
    }

    try {
      await pool.query(`
        DO $$
        DECLARE
          constraint_name text;
        BEGIN
          SELECT con.conname
            INTO constraint_name
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
          WHERE rel.relname = 'student_groups'
            AND con.contype = 'u'
            AND pg_get_constraintdef(con.oid) ILIKE '%(student_id, group_id)%'
          LIMIT 1;

          IF constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE student_groups DROP CONSTRAINT %I', constraint_name);
          END IF;
        END $$;
      `);

      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS student_groups_active_unique_idx
        ON student_groups(student_id, group_id, branch_id)
        WHERE status = 'active'
      `);

      await pool.query(`
        DO $$
        DECLARE
          constraint_name text;
        BEGIN
          SELECT con.conname
            INTO constraint_name
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid = con.conrelid
          WHERE rel.relname = 'student_groups'
            AND con.contype = 'c'
            AND pg_get_constraintdef(con.oid) ILIKE '%status%'
          LIMIT 1;

          IF constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE student_groups DROP CONSTRAINT %I', constraint_name);
          END IF;

          ALTER TABLE student_groups
            ADD CONSTRAINT student_groups_status_check
            CHECK (status IN ('active', 'stopped', 'finished', 'removed'));
        END $$;
      `);
      console.log("✅ 'student_groups' history-friendly index tayyorlandi.");
    } catch (membershipErr) {
      console.log("⚠️ 'student_groups' index sozlashda xatolik:", membershipErr.message);
    }
    
    console.log("✅ 'groups' va 'student_groups' SERIAL ID bilan tayyor.");
  } catch (err) {
    console.error("❌ Xatolik:", err.message);
  }
};

module.exports = { createGroupTables };
