const pool = require('../config/db');

// ============================================================================
// TO'LOV TIZIMI UCHUN DATABASE JADVALLARINI YARATISH
// ============================================================================

const createPaymentTables = async () => {
  try {
    // 1. STUDENT_PAYMENTS - oylik to'lovlar jadvali
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_payments (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL, -- YYYY-MM format
        required_amount DECIMAL(10,2) DEFAULT 0, -- Kerakli summa
        paid_amount DECIMAL(10,2) DEFAULT 0, -- To'langan summa
        discount_amount DECIMAL(10,2) DEFAULT 0, -- Chegirma summasi
        last_payment_date TIMESTAMP, -- Oxirgi to'lov sanasi
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id),
        
        -- Bir talaba uchun bir oyda bitta yozuv bo'lishi uchun
        UNIQUE(student_id, month)
      )
    `);
    console.log('✅ student_payments jadvali yaratildi');

    // 2. PAYMENT_TRANSACTIONS - to'lov tranzaksiyalari
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL, -- YYYY-MM format
        amount DECIMAL(10,2) NOT NULL, -- To'lov summasi
        payment_method VARCHAR(50) DEFAULT 'cash', -- naqd, karta, o'tkazma
        description TEXT, -- Izohi
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id) -- Kim qabul qildi
      )
    `);
    console.log('✅ payment_transactions jadvali yaratildi');

    // 3. STUDENT_DISCOUNTS - chegirmalar
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_discounts (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        discount_type VARCHAR(20) NOT NULL, -- 'percent' yoki 'amount'
        discount_value DECIMAL(10,2) NOT NULL, -- Foiz yoki summa
        months INTEGER, -- Necha oyga (NULL = cheksiz)
        start_month VARCHAR(7) DEFAULT NULL, -- Qaysi oydan boshlanadi
        end_month VARCHAR(7) DEFAULT NULL, -- Qaysi oyga qadar
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id),
        
        CHECK (discount_type IN ('percent', 'amount')),
        CHECK (discount_value > 0),
        UNIQUE (student_id, group_id, start_month, end_month)
      )
    `);
    console.log('✅ student_discounts jadvali yaratildi');

    // 4. Indekslar yaratish (tezlik uchun)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_payments_month 
      ON student_payments(student_id, month)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_discounts_group 
      ON student_discounts(student_id, group_id, is_active)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_student 
      ON payment_transactions(student_id, month)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_discounts_active 
      ON student_discounts(student_id, is_active)
    `);

    console.log('✅ Indekslar yaratildi');

    // 5. Trigger yaratish - to'lov qilinganda required_amount ni chegirma bilan hisoblash
    await pool.query(`
      CREATE OR REPLACE FUNCTION calculate_required_amount() 
      RETURNS TRIGGER AS $$
      DECLARE
        group_price DECIMAL(10,2);
        group_status VARCHAR(20);
        group_class_status VARCHAR(20);
        total_discount DECIMAL(10,2) := 0;
        discount_rec RECORD;
      BEGIN
        -- Guruh narxi va statusini olish
        SELECT g.price, g.status, g.class_status INTO group_price, group_status, group_class_status
        FROM student_groups sg
        JOIN groups g ON sg.group_id = g.id
        WHERE sg.student_id = NEW.student_id AND sg.status = 'active';

        -- Agar guruh active emas yoki darslar boshlanmagan bo'lsa, payment yaratmaslik
        IF group_status != 'active' OR group_class_status != 'started' THEN
          -- Bu holatda trigger funksiyasini to'xtatamiz
          RETURN NULL;
        END IF;

        -- Aktiv chegirmalarni hisoblash
        FOR discount_rec IN 
          SELECT discount_type, discount_value
          FROM student_discounts 
          WHERE student_id = NEW.student_id 
            AND is_active = true
            AND (start_month IS NULL OR NEW.month >= start_month)
            AND (end_month IS NULL OR NEW.month <= end_month)
        LOOP
          IF discount_rec.discount_type = 'percent' THEN
            total_discount := total_discount + (group_price * discount_rec.discount_value / 100);
          ELSE
            total_discount := total_discount + discount_rec.discount_value;
          END IF;
        END LOOP;

        -- Required amount ni hisoblash
        NEW.required_amount := GREATEST(group_price - total_discount, 0);
        NEW.discount_amount := total_discount;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS calculate_required_amount_trigger ON student_payments;
      CREATE TRIGGER calculate_required_amount_trigger
        BEFORE INSERT OR UPDATE ON student_payments
        FOR EACH ROW EXECUTE FUNCTION calculate_required_amount();
    `);

    console.log('✅ To\'lov hisoblash trigger yaratildi');

  } catch (error) {
    console.error('❌ To\'lov jadvallari yaratishda xatolik:', error);
    throw error;
  }
};

module.exports = { createPaymentTables };