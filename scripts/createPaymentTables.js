const pool = require('../config/db');

// ============================================================================
// TO'LOV TIZIMI UCHUN DATABASE JADVALLARINI YARATISH
// ============================================================================

const createPaymentTables = async () => {
  try {
    // 1. STUDENT_PAYMENTS - oylik to'lovlar jadvali
    // YANGI: group_id qo'shildi, UNIQUE constraint (student_id, group_id, month)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_payments (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL, -- YYYY-MM format
        required_amount DECIMAL(10,2) DEFAULT 0, -- Kerakli summa
        paid_amount DECIMAL(10,2) DEFAULT 0, -- To'langan summa
        discount_amount DECIMAL(10,2) DEFAULT 0, -- Chegirma summasi
        last_payment_date TIMESTAMP, -- Oxirgi to'lov sanasi
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id),
        
        -- YANGI: Bir talaba bir guruhda bir oyda bitta yozuv
        UNIQUE(student_id, group_id, month)
      )
    `);
    console.log('✅ student_payments jadvali yaratildi');

    // Eski bazalarda UNIQUE(student_id, month) bo'lishi mumkin — uni olib tashlab,
    // (student_id, group_id, month) bo'yicha unique borligini kafolatlaymiz.
    // ON CONFLICT (student_id, group_id, month) ishlashi uchun shart.
    await pool.query(`
      DO $$
      DECLARE
        legacy_constraint RECORD;
        has_correct_unique BOOLEAN;
      BEGIN
        -- Faqat (student_id, month) ustunlaridan iborat unique constraintlarni topib o'chiramiz
        FOR legacy_constraint IN
          SELECT c.conname
          FROM pg_constraint c
          WHERE c.conrelid = 'student_payments'::regclass
            AND c.contype = 'u'
            AND (
              SELECT array_agg(a.attname ORDER BY a.attname)
              FROM unnest(c.conkey) AS k
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
            ) = ARRAY['month', 'student_id']::name[]
        LOOP
          EXECUTE format('ALTER TABLE student_payments DROP CONSTRAINT %I', legacy_constraint.conname);
        END LOOP;

        SELECT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = 'student_payments'::regclass
            AND c.contype = 'u'
            AND (
              SELECT array_agg(a.attname ORDER BY a.attname)
              FROM unnest(c.conkey) AS k
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
            ) = ARRAY['group_id', 'month', 'student_id']::name[]
        ) INTO has_correct_unique;

        IF NOT has_correct_unique THEN
          ALTER TABLE student_payments
            ADD CONSTRAINT student_payments_student_group_month_unique UNIQUE (student_id, group_id, month);
        END IF;
      END $$;
    `);
    console.log('✅ student_payments unique constraint (student_id, group_id, month) tekshirildi');

    // 2. PAYMENT_TRANSACTIONS - to'lov tranzaksiyalari
    // YANGI: group_id qo'shildi
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
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
        discount_scope VARCHAR(20) NOT NULL DEFAULT 'center', -- 'center' yoki 'teacher'
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
        CHECK (discount_scope IN ('center', 'teacher')),
        CHECK (discount_value > 0)
      )
    `);
    console.log('✅ student_discounts jadvali yaratildi');

    await pool.query(`
      ALTER TABLE student_discounts
        ADD COLUMN IF NOT EXISTS discount_scope VARCHAR(20) DEFAULT 'center'
    `);

    await pool.query(`
      UPDATE student_discounts
      SET discount_scope = 'center'
      WHERE discount_scope IS NULL
    `);

    await pool.query(`
      DO $$
      DECLARE
        legacy_constraint RECORD;
        has_correct_unique BOOLEAN;
      BEGIN
        FOR legacy_constraint IN
          SELECT c.conname
          FROM pg_constraint c
          WHERE c.conrelid = 'student_discounts'::regclass
            AND c.contype = 'u'
            AND (
              SELECT array_agg(a.attname ORDER BY a.attname)
              FROM unnest(c.conkey) AS k
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
            ) IN (
              ARRAY['end_month', 'group_id', 'start_month', 'student_id']::name[],
              ARRAY['start_month', 'student_id']::name[],
              ARRAY['discount_scope', 'end_month', 'group_id', 'start_month', 'student_id']::name[]
            )
        LOOP
          EXECUTE format('ALTER TABLE student_discounts DROP CONSTRAINT %I', legacy_constraint.conname);
        END LOOP;

        SELECT EXISTS (
          SELECT 1
          FROM pg_constraint c
          WHERE c.conrelid = 'student_discounts'::regclass
            AND c.contype = 'u'
            AND (
              SELECT array_agg(a.attname ORDER BY a.attname)
              FROM unnest(c.conkey) AS k
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
            ) = ARRAY['discount_scope', 'end_month', 'group_id', 'start_month', 'student_id']::name[]
        ) INTO has_correct_unique;

        IF NOT has_correct_unique THEN
          ALTER TABLE student_discounts
            ADD CONSTRAINT student_discounts_student_group_month_scope_unique
            UNIQUE (student_id, group_id, start_month, end_month, discount_scope);
        END IF;
      END $$;
    `);
// YANGI: group_id qo'shilgan indekslar
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_payments_student_group_month 
      ON student_payments(student_id, group_id, month)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_payments_group_month 
      ON student_payments(group_id, month)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_discounts_group 
      ON student_discounts(student_id, group_id, is_active)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_discounts_scope
      ON student_discounts(student_id, group_id, discount_scope, is_active)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_student_group 
      ON payment_transactions(student_id, group_id, month)
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_group_month 
      ON payment_transactions(group_id, month)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_discounts_active 
      ON student_discounts(student_id, is_active)
    `);

    console.log('✅ Indekslar yaratildi');

    // 5. Trigger yaratish - to'lov qilinganda required_amount ni chegirma bilan hisoblash
    // MUHIM: hisob-kitob aynan NEW.group_id bo'yicha yuritiladi. Talaba bir vaqtda
    // bir nechta guruhda o'qishi mumkin, shuning uchun student_id bo'yicha qidirish noto'g'ri.
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
        -- Aynan shu yozuvning guruhi bo'yicha narx va statusni olish
        SELECT g.price, g.status, g.class_status INTO group_price, group_status, group_class_status
        FROM groups g
        WHERE g.id = NEW.group_id;

        -- Guruh topilmasa (masalan, tarixiy yozuv) qiymatlarni o'zgartirmasdan qoldiramiz
        IF NOT FOUND THEN
          RETURN NEW;
        END IF;

        -- Faqat yangi yozuvda: guruh active emas yoki darslar boshlanmagan bo'lsa, payment yaratmaslik
        IF TG_OP = 'INSERT' AND (group_status IS DISTINCT FROM 'active' OR group_class_status IS DISTINCT FROM 'started') THEN
          RETURN NULL;
        END IF;

        -- Shu guruhga tegishli aktiv chegirmalarni hisoblash
        FOR discount_rec IN
          SELECT discount_type, discount_value
          FROM student_discounts
          WHERE student_id = NEW.student_id
            AND (group_id IS NULL OR group_id = NEW.group_id)
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
