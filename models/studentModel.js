const pool = require('../config/db');

const createStudentAdditionalTables = async () => {
  const queryText = `
    -- Fanlar/Kurslar jadvali
    CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE
    );

    -- Oylik to'lov talablari (Har oy uchun student qancha to'lashi kerak)
    CREATE TABLE IF NOT EXISTS monthly_fees (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      month_name VARCHAR(20) NOT NULL, -- Format: '2026-01'
      required_amount DECIMAL(10, 2) DEFAULT 0, -- Shu oy uchun to'lashi kerak
      paid_amount DECIMAL(10, 2) DEFAULT 0, -- Shu oyga to'lagan
      status VARCHAR(20) DEFAULT 'unpaid', -- 'paid', 'partial', 'unpaid'
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, month_name)
    );

    -- To'lovlar jadvali (Oylik to'lovlar tarixi - har bir to'lov alohida)
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      month_name VARCHAR(20) NOT NULL, -- Qaysi oy uchun to'lov
      amount DECIMAL(10, 2) NOT NULL, -- To'langan summa
      note TEXT, -- Qo'shimcha izoh (ixtiyoriy)
      created_by INTEGER REFERENCES users(id), -- Qaysi admin qo'shgan
      admin_name VARCHAR(100), -- Admin ismi (kim to'lovni tasdiqlagani)
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Davomat jadvali (Oylik davomat)
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      teacher_id INTEGER REFERENCES users(id), -- O'qituvchi
      month_name VARCHAR(20) NOT NULL, -- Format: '2026-01'
      daily_records JSON DEFAULT '[]', -- [1,0,1,1,0,...] 31 tagacha kun
      total_classes INTEGER DEFAULT 0, -- Jami darslar soni
      attended_classes INTEGER DEFAULT 0, -- Qatnashgan darslar
      attendance_percentage DECIMAL(5, 2) DEFAULT 0, -- Foiz
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES users(id), -- Kim yaratgan (teacher/admin)
      UNIQUE(student_id, month_name)
    );
  `;
  try {
    await pool.query(queryText);
    console.log("✅ Studentlar uchun qo'shimcha jadvallar tayyor.");
    
    // Price ustunini olib tashlash (agar mavjud bo'lsa)
    try {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subjects' AND column_name='price') THEN
            ALTER TABLE subjects DROP COLUMN price;
            RAISE NOTICE 'subjects jadvalidan price ustuni o''chirildi';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subjects' AND column_name='name') THEN
            ALTER TABLE subjects ADD COLUMN name VARCHAR(100) NOT NULL;
          END IF;
          -- Name ustuniga UNIQUE constraint qo'shish
          IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='subjects' AND constraint_name='subjects_name_key') THEN
            ALTER TABLE subjects ADD CONSTRAINT subjects_name_key UNIQUE (name);
          END IF;
        END $$;
      `);
      console.log("✅ Subjects jadvali price'siz yangilandi.");
    } catch (alterErr) {
      console.log("⚠️ Subjects jadvalini yangilashda xatolik:", alterErr.message);
    }
    
    // Payments jadvaliga yangi ustunlarni qo'shish/o'zgartirish (eski bazalar uchun)
    try {
      await pool.query(`
        DO $$ 
        BEGIN 
          -- payment_method ustunini o'chirish
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='payment_method') THEN
            ALTER TABLE payments DROP COLUMN payment_method;
          END IF;
          -- admin_name ustunini qo'shish
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='admin_name') THEN
            ALTER TABLE payments ADD COLUMN admin_name VARCHAR(100);
          END IF;
          -- note ustunini ixtiyoriy qilish
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='note') THEN
            ALTER TABLE payments ADD COLUMN note TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='created_by') THEN
            ALTER TABLE payments ADD COLUMN created_by INTEGER REFERENCES users(id);
          END IF;
          -- Eski status ustunini o'chirish (kerak emas)
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='status') THEN
            ALTER TABLE payments DROP COLUMN status;
          END IF;
        END $$;
      `);
      console.log("✅ Payments jadvaliga yangi ustunlar qo'shildi.");
      
      // Monthly fees jadvali uchun trigger (paid_amount yangilanganda status avtomatik o'zgaradi)
      await pool.query(`
        CREATE OR REPLACE FUNCTION update_monthly_fee_status()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.paid_amount >= NEW.required_amount THEN
            NEW.status = 'paid';
          ELSIF NEW.paid_amount > 0 THEN
            NEW.status = 'partial';
          ELSE
            NEW.status = 'unpaid';
          END IF;
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS monthly_fee_status_trigger ON monthly_fees;
        
        CREATE TRIGGER monthly_fee_status_trigger
        BEFORE INSERT OR UPDATE ON monthly_fees
        FOR EACH ROW
        EXECUTE FUNCTION update_monthly_fee_status();
      `);
      console.log("✅ Monthly fees trigger yaratildi.");
      
      // Davomat jadvali uchun trigger (attendance percentage avtomatik hisoblanadi)
      await pool.query(`
        CREATE OR REPLACE FUNCTION update_attendance_percentage()
        RETURNS TRIGGER AS $$
        BEGIN
          -- Daily records dan attended_classes ni hisoblash
          IF NEW.daily_records IS NOT NULL THEN
            SELECT COUNT(*) INTO NEW.attended_classes 
            FROM json_array_elements_text(NEW.daily_records) AS day
            WHERE day::INTEGER = 1;
          ELSE
            NEW.attended_classes = 0;
          END IF;
          
          -- Total classes dan percentage hisoblash
          IF NEW.total_classes > 0 THEN
            NEW.attendance_percentage = (NEW.attended_classes::DECIMAL / NEW.total_classes) * 100;
          ELSE
            NEW.attendance_percentage = 0;
          END IF;
          
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS attendance_percentage_trigger ON attendance;
        
        CREATE TRIGGER attendance_percentage_trigger
        BEFORE INSERT OR UPDATE ON attendance
        FOR EACH ROW
        EXECUTE FUNCTION update_attendance_percentage();
      `);
      console.log("✅ Attendance trigger yaratildi.");
    } catch (alterErr) {
      console.log("⚠️ Payments/Monthly fees yangilashda xato:", alterErr.message);
    }
  } catch (err) {
    console.error("❌ Xato:", err.message);
  }
};

module.exports = { createStudentAdditionalTables }