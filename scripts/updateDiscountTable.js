const pool = require('../config/db');

/**
 * Chegirma tizimini oyma-oy qilish uchun student_discounts jadvalini yangilash
 */
(async () => {
  try {
    console.log('🔄 Student discounts jadvalini yangilamoqda...');

    // Avval unique constraint mavjudligini tekshirish
    const constraintCheck = await pool.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'student_discounts' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name = 'student_discounts_student_month_unique'
    `);

    if (constraintCheck.rows.length === 0) {
      // Unique constraint qo'shish: bir student bir oyda faqat bitta chegirma
      await pool.query(`
        ALTER TABLE student_discounts 
        ADD CONSTRAINT student_discounts_student_month_unique 
        UNIQUE (student_id, group_id, start_month, end_month, discount_scope)
      `);
      console.log('✅ Unique constraint qo\'shildi: student_id + group_id + start_month + end_month + discount_scope');
    } else {
      console.log('ℹ️  Unique constraint allaqachon mavjud');
    }

    await pool.query(`
      ALTER TABLE student_discounts
        ADD COLUMN IF NOT EXISTS discount_scope VARCHAR(20) DEFAULT 'center'
    `);

    await pool.query(`
      UPDATE student_discounts
      SET discount_scope = 'center'
      WHERE discount_scope IS NULL
    `);

    // Months ustunini olib tashlash (endi kerak emas)
    const columnsCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'student_discounts' 
        AND column_name = 'months'
    `);

    if (columnsCheck.rows.length > 0) {
      await pool.query(`
        ALTER TABLE student_discounts 
        DROP COLUMN IF EXISTS months
      `);
      console.log('✅ Months ustuni olib tashlandi');
    }

    // Test: Bir nechta studentga turli oylarda chegirma berish
    console.log('\n🧪 Test: Chegirma berish...');
    
    // Student 34 (Jasur) - 2026-01 oyiga 50% chegirma
    await pool.query(`
      INSERT INTO student_discounts 
      (student_id, group_id, discount_scope, discount_type, discount_value, start_month, end_month, description, created_by)
      VALUES (34, (SELECT id FROM groups ORDER BY id LIMIT 1), 'center', 'percent', 62, '2026-01', '2026-01', 'Yanvar oyiga chegirma', 1)
      ON CONFLICT (student_id, group_id, start_month, end_month, discount_scope) 
      DO UPDATE SET 
        discount_scope = EXCLUDED.discount_scope,
        discount_type = EXCLUDED.discount_type,
        discount_value = EXCLUDED.discount_value,
        description = EXCLUDED.description
    `);
    
    console.log('✅ Jasur uchun 2026-01 oyiga 62% chegirma berildi');

    // Student 23 (Mirjalol) - 2026-01 oyiga amount chegirma
    await pool.query(`
      INSERT INTO student_discounts 
      (student_id, group_id, discount_scope, discount_type, discount_value, start_month, end_month, description, created_by)
      VALUES (23, (SELECT id FROM groups ORDER BY id LIMIT 1), 'teacher', 'amount', 100000, '2026-01', '2026-01', 'Yanvar oyiga 100k chegirma', 1)
      ON CONFLICT (student_id, group_id, start_month, end_month, discount_scope) 
      DO UPDATE SET 
        discount_scope = EXCLUDED.discount_scope,
        discount_type = EXCLUDED.discount_type,
        discount_value = EXCLUDED.discount_value,
        description = EXCLUDED.description
    `);
    
    console.log('✅ Mirjalol uchun 2026-01 oyiga 100,000 som chegirma berildi');

    // Natijani tekshirish
    const result = await pool.query(`
      SELECT 
        sd.student_id,
        u.name || ' ' || u.surname as student_name,
        sd.start_month,
        sd.discount_scope,
        sd.discount_type,
        sd.discount_value,
        sd.description
      FROM student_discounts sd
      JOIN users u ON sd.student_id = u.id
      ORDER BY sd.student_id, sd.start_month
    `);

    console.log('\n📊 Barcha chegirmalar:');
    result.rows.forEach(row => {
      console.log(`${row.student_name} (ID: ${row.student_id}) - ${row.start_month} - ${row.discount_scope} - ${row.discount_type}: ${row.discount_value} - ${row.description}`);
    });

    console.log('\n✅ Student discounts jadvali muvaffaqiyatli yangilandi!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    process.exit(1);
  }
})();
