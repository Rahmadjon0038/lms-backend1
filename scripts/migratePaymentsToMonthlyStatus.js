const pool = require('../config/db');

/**
 * TO'LOV TIZIMINI OYLIK STATUS BILAN YANGILASH
 * 
 * Bu script to'lov tizimini attendance jadvalidagi monthly_status bilan bog'laydi.
 * Endi har oylik to'lovlar mustaqil boshqariladi - xuddi attendance tizimidagi kabi.
 */

const migratePaymentsToMonthlyStatus = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔄 To\'lov tizimini yangilash boshlandi...\n');

    // ============================================================================
    // 1. STUDENT_PAYMENTS jadvalidan eski ustunlarni olib tashlash
    // ============================================================================
    console.log('1️⃣  student_payments jadvalini tozalash...');
    
    // Eski UNIQUE constraint ni o'chirish (agar mavjud bo'lsa)
    const checkOldConstraint = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'student_payments' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name LIKE '%student_id_month%'
    `);
    
    if (checkOldConstraint.rows.length > 0) {
      const constraintName = checkOldConstraint.rows[0].constraint_name;
      await client.query(`
        ALTER TABLE student_payments 
        DROP CONSTRAINT IF EXISTS ${constraintName}
      `);
      console.log(`   ✅ Eski constraint (${constraintName}) o'chirildi`);
    }

    // ============================================================================
    // 2. YANGI UNIQUE CONSTRAINT - (student_id, group_id, month)
    // ============================================================================
    console.log('\n2️⃣  Yangi unique constraint qo\'shish...');
    
    await client.query(`
      ALTER TABLE student_payments 
      ADD CONSTRAINT student_payments_student_group_month_unique 
      UNIQUE (student_id, group_id, month)
    `);
    console.log('   ✅ Yangi constraint qo\'shildi: (student_id, group_id, month)');

    // ============================================================================
    // 3. INDEKSLAR QO'SHISH
    // ============================================================================
    console.log('\n3️⃣  Indekslar qo\'shish...');
    
    // Group + Month index (tez qidirish uchun)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_student_payments_group_month 
      ON student_payments(group_id, month)
    `);
    
    // Student + Group + Month index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_student_payments_student_group_month 
      ON student_payments(student_id, group_id, month)
    `);
    
    console.log('   ✅ Indekslar yaratildi');

    // ============================================================================
    // 4. PAYMENT_TRANSACTIONS jadvaliga INDEX
    // ============================================================================
    console.log('\n4️⃣  payment_transactions indekslarini yangilash...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_group_month 
      ON payment_transactions(group_id, month)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_student_group_month 
      ON payment_transactions(student_id, group_id, month)
    `);
    
    console.log('   ✅ Transaction indekslari yaratildi');

    // ============================================================================
    // 5. STUDENT_DISCOUNTS jadvalini yangilash
    // ============================================================================
    console.log('\n5️⃣  student_discounts jadvalini yangilash...');
    
    // Eski unique constraint ni o'chirish
    await client.query(`
      ALTER TABLE student_discounts 
      DROP CONSTRAINT IF EXISTS student_discounts_student_id_group_id_start_month_end_month_key
    `);
    
    // Yangi constraint - bir student bir group bir oy uchun faqat bitta active discount
    await client.query(`
      ALTER TABLE student_discounts 
      ADD CONSTRAINT student_discounts_unique_active 
      UNIQUE (student_id, group_id, start_month, is_active)
    `);
    
    console.log('   ✅ Discounts jadvali yangilandi');

    // ============================================================================
    // 6. MA'LUMOTLARNI TEKSHIRISH
    // ============================================================================
    console.log('\n6️⃣  Ma\'lumotlarni tekshirish...');
    
    const paymentCount = await client.query(`
      SELECT COUNT(*) as count FROM student_payments
    `);
    
    const transactionCount = await client.query(`
      SELECT COUNT(*) as count FROM payment_transactions
    `);
    
    const discountCount = await client.query(`
      SELECT COUNT(*) as count FROM student_discounts WHERE is_active = true
    `);
    
    console.log(`   📊 Jami to'lov yozuvlari: ${paymentCount.rows[0].count}`);
    console.log(`   📊 Jami tranzaksiyalar: ${transactionCount.rows[0].count}`);
    console.log(`   📊 Aktiv chegirmalar: ${discountCount.rows[0].count}`);

    // ============================================================================
    // 7. COMMIT
    // ============================================================================
    await client.query('COMMIT');
    
    console.log('\n✅✅✅ TO\'LOV TIZIMI MUVAFFAQIYATLI YANGILANDI! ✅✅✅\n');
    console.log('📝 Endi to\'lovlar attendance jadvalidagi monthly_status ga bog\'langan.\n');
    console.log('📝 Har oylik to\'lovlar mustaqil boshqariladi.\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Xatolik yuz berdi:', error.message);
    console.error('📋 Barcha o\'zgarishlar bekor qilindi.\n');
    throw error;
  } finally {
    client.release();
  }
};

// Script ni ishga tushirish
if (require.main === module) {
  migratePaymentsToMonthlyStatus()
    .then(() => {
      console.log('✅ Script muvaffaqiyatli yakunlandi');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script xato bilan tugadi:', error);
      process.exit(1);
    });
}

module.exports = migratePaymentsToMonthlyStatus;
