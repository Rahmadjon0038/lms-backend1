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
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'terminated', 'on_leave')), -- faqat 3ta holat
      phone VARCHAR(20),
      phone2 VARCHAR(20),
      father_name VARCHAR(100), -- Otasining ismi
      father_phone VARCHAR(20), -- Otasining telefon raqami
      address TEXT, -- Yashash manzili
      age INTEGER, -- Student yoshi
      subject VARCHAR(255), -- Teacher uchun fan nomi
      start_date DATE, -- Ishni boshlagan sanasi
      end_date DATE, -- Ishni tugatgan sanasi (agar mavjud bo'lsa)
      termination_date DATE, -- Ishdan boshatilgan sana
      certificate VARCHAR(255), -- Teacher sertifikati
      has_experience BOOLEAN DEFAULT FALSE, -- Tajribasi bormi
      experience_years INTEGER, -- Tajriba yillari
      experience_place TEXT, -- Qayerda tajriba to'plagan
      available_times VARCHAR(100), -- Qaysi vaqtlarda ishlay oladi
      work_days_hours TEXT, -- Ish kunlari va soatlari
      group_id INTEGER,
      group_name VARCHAR(255),
      teacher_id INTEGER,
      teacher_name VARCHAR(255),
      course_status VARCHAR(20) DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed', 'dropped'
      course_start_date TIMESTAMP, -- Kurs boshlangan sana
      course_end_date TIMESTAMP, -- Kurs tugatgan sana
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
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='subject_id') THEN
            ALTER TABLE users ADD COLUMN subject_id INTEGER REFERENCES subjects(id);
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
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='father_name') THEN
            ALTER TABLE users ADD COLUMN father_name VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='father_phone') THEN
            ALTER TABLE users ADD COLUMN father_phone VARCHAR(20);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='address') THEN
            ALTER TABLE users ADD COLUMN address TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='age') THEN
            ALTER TABLE users ADD COLUMN age INTEGER;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='certificate') THEN
            ALTER TABLE users ADD COLUMN certificate VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='has_experience') THEN
            ALTER TABLE users ADD COLUMN has_experience BOOLEAN DEFAULT FALSE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='experience_years') THEN
            ALTER TABLE users ADD COLUMN experience_years INTEGER;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='experience_place') THEN
            ALTER TABLE users ADD COLUMN experience_place TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='available_times') THEN
            ALTER TABLE users ADD COLUMN available_times VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='work_days_hours') THEN
            ALTER TABLE users ADD COLUMN work_days_hours TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='termination_date') THEN
            ALTER TABLE users ADD COLUMN termination_date DATE;
          END IF;
          -- Kurs bilan bog'liq ustunlar qo'shish
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='course_status') THEN
            ALTER TABLE users ADD COLUMN course_status VARCHAR(20) DEFAULT 'not_started';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='course_start_date') THEN
            ALTER TABLE users ADD COLUMN course_start_date TIMESTAMP;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='course_end_date') THEN
            ALTER TABLE users ADD COLUMN course_end_date TIMESTAMP;
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