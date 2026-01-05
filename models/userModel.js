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
      subject VARCHAR(255), -- Teacher uchun fan nomi
      start_date DATE, -- Ishni boshlagan sanasi
      end_date DATE, -- Ishni tugatgan sanasi (agar mavjud bo'lsa)
      group_id INTEGER,
      group_name VARCHAR(255),
      teacher_id INTEGER,
      teacher_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);
    console.log("✅ 'users' jadvali tekshirildi/yaratildi.");
    
    // Eski jadvallarga yangi ustunlarni qo'shish (agar mavjud bo'lmasa)
    try {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='subject') THEN
            ALTER TABLE users ADD COLUMN subject VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='start_date') THEN
            ALTER TABLE users ADD COLUMN start_date DATE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='end_date') THEN
            ALTER TABLE users ADD COLUMN end_date DATE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='group_id') THEN
            ALTER TABLE users ADD COLUMN group_id INTEGER;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='group_name') THEN
            ALTER TABLE users ADD COLUMN group_name VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='teacher_id') THEN
            ALTER TABLE users ADD COLUMN teacher_id INTEGER;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='teacher_name') THEN
            ALTER TABLE users ADD COLUMN teacher_name VARCHAR(255);
          END IF;
        END $$;
      `);
      console.log("✅ 'users' jadvaliga yangi ustunlar qo'shildi.");
      
      // Agar required_amount ustuni mavjud bo'lsa, uni o'chiramiz
      await pool.query(`
        DO $$ 
        BEGIN 
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='required_amount') THEN
            ALTER TABLE users DROP COLUMN required_amount;
            RAISE NOTICE 'required_amount ustuni o''chirildi';
          END IF;
        END $$;
      `);
    } catch (alterErr) {
      console.log("⚠️ Ustunlar allaqachon mavjud yoki qo'shishda xato:", alterErr.message);
    }
  } catch (err) {
    console.error("❌ Jadval yaratishda xato:", err.message);
  }
};

module.exports = { createUserTable };