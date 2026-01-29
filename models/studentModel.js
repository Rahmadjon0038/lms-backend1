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

    -- Chegirmalar jadvali (Talaba+Guruh uchun alohida chegirmalar)
    CREATE TABLE IF NOT EXISTS student_discounts (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      discount_type VARCHAR(20) NOT NULL, -- 'percent' yoki 'amount'
      discount_value DECIMAL(10,2) NOT NULL,
      start_month VARCHAR(20) NOT NULL, -- Format: '2026-01'
      end_month VARCHAR(20) NOT NULL, -- Format: '2026-01'
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, group_id, start_month)
    );

    -- To'lov hisoboti jadvali (Talaba+Guruh+Oy uchun)
    CREATE TABLE IF NOT EXISTS student_payments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      month VARCHAR(20) NOT NULL, -- Format: '2026-01'
      required_amount DECIMAL(10,2) DEFAULT 0,
      paid_amount DECIMAL(10,2) DEFAULT 0,
      discount_amount DECIMAL(10,2) DEFAULT 0,
      last_payment_date TIMESTAMP,
      created_by INTEGER REFERENCES users(id),
      updated_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, group_id, month)
    );

    -- To'lov tranzaksiyalari jadvali (Har bir to'lov alohida)
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      month VARCHAR(20) NOT NULL, -- Format: '2026-01'
      amount DECIMAL(10,2) NOT NULL,
      payment_method VARCHAR(20) DEFAULT 'cash', -- 'cash', 'card', 'transfer'
      description TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Davomat jadvali (Oylik davomat)
    CREATE TABLE IF NOT EXISTS attendance (
      id SERIAL PRIMARY KEY,
      student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      teacher_id INTEGER REFERENCES users(id), -- O'qituvchi
      month_name VARCHAR(20) NOT NULL, -- Format: '2026-01'
      daily_records JSONB DEFAULT '{}', -- {"2026-01-15": 1, "2026-01-17": 0, ...}
      total_classes INTEGER DEFAULT 0, -- Jami darslar soni
      attended_classes INTEGER DEFAULT 0, -- Qatnashgan darslar
      attendance_percentage DECIMAL(5, 2) DEFAULT 0, -- Foiz
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER REFERENCES users(id), -- Kim yaratgan (teacher/admin)
      UNIQUE(student_id, group_id, month_name)
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
    
    // Eski va yangi jadvallarni uyg'unlashtiirish (migration)
    try {
      await pool.query(`
        DO $$ 
        BEGIN 
          -- Eski payment jadvalini tozalash
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='payment_method') THEN
            ALTER TABLE payments DROP COLUMN payment_method;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='admin_name') THEN
            ALTER TABLE payments ADD COLUMN admin_name VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='note') THEN
            ALTER TABLE payments ADD COLUMN note TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='created_by') THEN
            ALTER TABLE payments ADD COLUMN created_by INTEGER REFERENCES users(id);
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='status') THEN
            ALTER TABLE payments DROP COLUMN status;
          END IF;

          -- student_discounts jadvalini yangilash (eski bazalar uchun)
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_discounts' AND column_name='group_id') THEN
            ALTER TABLE student_discounts ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE;
          END IF;
          -- Eski unique constraint olib tashlash
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name='student_discounts' AND constraint_name='student_discounts_student_month_unique'
          ) THEN
            ALTER TABLE student_discounts DROP CONSTRAINT student_discounts_student_month_unique;
          END IF;
          -- Yangi unique constraint qo'shish
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name='student_discounts' AND constraint_name='student_discounts_student_group_month_unique'
          ) THEN
            ALTER TABLE student_discounts ADD CONSTRAINT student_discounts_student_group_month_unique UNIQUE (student_id, group_id, start_month);
          END IF;

          -- student_payments jadvalini yangilash
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name='student_payments' AND constraint_name='student_payments_student_month_group_unique'
          ) THEN
            ALTER TABLE student_payments ADD CONSTRAINT student_payments_student_month_group_unique UNIQUE (student_id, group_id, month);
          END IF;
        END $$;
      `);
      console.log("✅ Barcha jadvallar group_id bilan yangilandi.");
    } catch (alterErr) {
      console.log("⚠️ Jadvallarni yangilashda xatolik:", alterErr.message);
    }

    try {
      
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
      
      // Attendance trigger noto'g'ri edi, olib tashlandi
      // Attendance jadvali o'z-o'zidan ishlaydi
      console.log("✅ Attendance trigger yaratish o'tkazildi.");
    } catch (alterErr) {
      console.log("⚠️ Payments/Monthly fees yangilashda xato:", alterErr.message);
    }
  } catch (err) {
    console.error("❌ Xato:", err.message);
  }
};

module.exports = { createStudentAdditionalTables }