const pool = require('./config/db');

(async () => {
  try {
    console.log('🧪 Student to\'lov ma\'lumotlarini tozalash API test qilmoqda...');
    
    // Test uchun student 34 (Jasur) ga test ma'lumotlar qo'shish
    console.log('\n📊 Test ma\'lumotlar yaratmoqda...');
    
    // 1. Test payment qo'shish
    await pool.query(`
      INSERT INTO student_payments 
      (student_id, month, required_amount, paid_amount, created_by)
      VALUES 
        (34, '2025-12', 2000000, 500000, 1),
        (34, '2026-01', 1199999, 1000000, 1)
      ON CONFLICT (student_id, month) DO NOTHING
    `);
    
    // 2. Test transactions qo'shish
    await pool.query(`
      INSERT INTO payment_transactions 
      (student_id, month, amount, payment_method, description, created_by)
      VALUES 
        (34, '2025-12', 500000, 'cash', 'Test tolov 1', 1),
        (34, '2026-01', 800000, 'card', 'Test tolov 2', 1),
        (34, '2026-01', 200000, 'cash', 'Test tolov 3', 1)
    `);
    
    // 3. Test discounts qo'shish
    await pool.query(`
      INSERT INTO student_discounts 
      (student_id, discount_type, discount_value, start_month, end_month, description, created_by)
      VALUES 
        (34, 'percent', 50, '2026-01', '2026-01', 'Test chegirma', 1),
        (34, 'amount', 100000, '2025-12', '2025-12', 'Test chegirma 2', 1)
      ON CONFLICT (student_id, start_month) DO NOTHING
    `);
    
    console.log('✅ Test ma\'lumotlar yaratildi');
    
    // Ma'lumotlarni hisoblash
    const beforeStats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM student_payments WHERE student_id = 34) as payments_count,
        (SELECT COUNT(*) FROM payment_transactions WHERE student_id = 34) as transactions_count,
        (SELECT COUNT(*) FROM student_discounts WHERE student_id = 34) as discounts_count,
        (SELECT COALESCE(SUM(paid_amount), 0) FROM student_payments WHERE student_id = 34) as total_paid
    `);
    
    const stats = beforeStats.rows[0];
    
    console.log('\\n📊 Tozalashdan oldingi ma\'lumotlar:');
    console.log(`💳 Payment records: ${stats.payments_count}`);
    console.log(`💰 Transaction records: ${stats.transactions_count}`);
    console.log(`🎁 Discount records: ${stats.discounts_count}`);
    console.log(`💵 Total paid amount: ${parseFloat(stats.total_paid).toLocaleString()} so'm`);
    
    // Student ma'lumotlarini ko'rish
    const student = await pool.query(`
      SELECT id, name, surname FROM users WHERE id = 34
    `);
    
    if (student.rows.length > 0) {
      console.log(`👤 Student: ${student.rows[0].name} ${student.rows[0].surname} (ID: ${student.rows[0].id})`);
    }
    
    console.log('\\n⚠️  Endi manual ravishda API orqali tozalash kerak:');
    console.log('curl -X POST "http://localhost:5001/api/payments/clear-student" \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -H "Authorization: Bearer <ADMIN_TOKEN>" \\');
    console.log('  -d \'{"student_id": 34, "confirm": true}\'');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    process.exit(1);
  }
})();