const pool = require('../config/db');

// ============================================================================
// PAYMENT_TRANSACTIONS JADVALIGA GROUP_ID USTUNI QO'SHISH
// ============================================================================

const addGroupIdToTransactions = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔄 payment_transactions jadvaliga group_id ustuni qo\'shish...');
    
    // 1. group_id ustunini qo'shish (agar mavjud bo'lmasa)
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'payment_transactions' AND column_name = 'group_id'
    `);
    
    if (checkColumn.rows.length === 0) {
      await client.query(`
        ALTER TABLE payment_transactions 
        ADD COLUMN group_id INTEGER REFERENCES groups(id)
      `);
      console.log('✅ group_id ustuni qo\'shildi');
    } else {
      console.log('ℹ️  group_id ustuni allaqachon mavjud');
    }
    
    // 2. Mavjud tranzaksiyalarni yangilash
    console.log('🔄 Mavjud tranzaksiya ma\'lumotlarini yangilayapman...');
    
    const updateResult = await client.query(`
      UPDATE payment_transactions pt
      SET group_id = sg.group_id
      FROM student_groups sg
      WHERE pt.student_id = sg.student_id 
        AND pt.group_id IS NULL
        AND sg.status = 'active'
    `);
    
    console.log(`✅ ${updateResult.rowCount} ta tranzaksiya ma'lumoti yangilandi`);
    
    await client.query('COMMIT');
    console.log('✅ payment_transactions jadvali muvaffaqiyatli yangilandi!');
    
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
  addGroupIdToTransactions()
    .then(() => {
      console.log('✅ Migration yakunlandi');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration muvaffaqiyatsiz tugadi:', error);
      process.exit(1);
    });
}

module.exports = addGroupIdToTransactions;