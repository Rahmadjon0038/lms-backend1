const pool = require('../config/db');

// ============================================================================
// STUDENT_PAYMENTS JADVALIGA GROUP_ID USTUNI QO'SHISH
// ============================================================================

const addGroupIdToPayments = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔄 student_payments jadvaliga group_id ustuni qo\'shish...');
    
    // 1. group_id ustunini qo'shish (agar mavjud bo'lmasa)
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'student_payments' AND column_name = 'group_id'
    `);
    
    if (checkColumn.rows.length === 0) {
      await client.query(`
        ALTER TABLE student_payments 
        ADD COLUMN group_id INTEGER REFERENCES groups(id)
      `);
      console.log('✅ group_id ustuni qo\'shildi');
    } else {
      console.log('ℹ️  group_id ustuni allaqachon mavjud');
    }
    
    // 2. Mavjud ma'lumotlarni yangilash - har bir payment uchun to'g'ri group_id ni aniqlash
    console.log('🔄 Mavjud to\'lov ma\'lumotlarini yangilayapman...');
    
    const updateResult = await client.query(`
      UPDATE student_payments 
      SET group_id = sg.group_id
      FROM student_groups sg
      WHERE student_payments.student_id = sg.student_id 
        AND student_payments.group_id IS NULL
        AND sg.status = 'active'
    `);
    
    console.log(`✅ ${updateResult.rowCount} ta to'lov ma'lumoti yangilandi`);
    
    // 3. Payment qo'shishda group_id ni majburiy qilish uchun constraint qo'shish
    // Bu eski unique constraint ni o'zgartiradi
    const checkConstraint = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'student_payments' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name = 'student_payments_student_id_month_key'
    `);
    
    if (checkConstraint.rows.length > 0) {
      // Eski constraint ni o'chirish
      await client.query(`
        ALTER TABLE student_payments 
        DROP CONSTRAINT student_payments_student_id_month_key
      `);
      console.log('✅ Eski unique constraint o\'chirildi');
    }
    
    // Yangi constraint qo'shish: student_id + month + group_id kombinatsiyasi unique bo'lishi kerak
    await client.query(`
      ALTER TABLE student_payments 
      ADD CONSTRAINT student_payments_student_month_group_unique 
      UNIQUE(student_id, month, group_id)
    `);
    console.log('✅ Yangi unique constraint (student_id, month, group_id) qo\'shildi');
    
    await client.query('COMMIT');
    console.log('✅ student_payments jadvali muvaffaqiyatli yangilandi!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Xatolik yuz berdi:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

// Script ni ishga tushirish
if (require.main === module) {
  addGroupIdToPayments()
    .then(() => {
      console.log('✅ Migration yakunlandi');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration muvaffaqiyatsiz tugadi:', error);
      process.exit(1);
    });
}

module.exports = addGroupIdToPayments;