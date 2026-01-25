const pool = require('./config/db');

(async () => {
  try {
    console.log('🧪 Yangilangan payment tizimini test qilmoqda...');
    
    // 1. Jasur uchun 2026-01 oyiga 50% chegirma berish
    await pool.query(`
      INSERT INTO student_discounts 
      (student_id, discount_type, discount_value, start_month, end_month, description, created_by)
      VALUES (34, 'percent', 50, '2026-01', '2026-01', 'Test chegirma - 50%', 1)
      ON CONFLICT (student_id, start_month) 
      DO UPDATE SET 
        discount_type = EXCLUDED.discount_type,
        discount_value = EXCLUDED.discount_value,
        description = EXCLUDED.description
    `);
    
    console.log('✅ Jasur uchun 2026-01 oyiga 50% chegirma berildi');
    
    // 2. Required amount'ni yangilash (2,399,999 - 50% = 1,199,999.5)
    const originalPrice = 2399999;
    const discountAmount = (originalPrice * 50) / 100;
    const newRequiredAmount = originalPrice - discountAmount;
    
    await pool.query(`
      INSERT INTO student_payments 
      (student_id, month, required_amount, paid_amount, created_by)
      VALUES (34, '2026-01', $1, 0, 1)
      ON CONFLICT (student_id, month) 
      DO UPDATE SET required_amount = EXCLUDED.required_amount
    `, [newRequiredAmount]);
    
    console.log(`✅ Required amount yangilandi: ${newRequiredAmount.toLocaleString()} so'm`);
    
    // 3. Monthly payments ma'lumotlarini olish
    const result = await pool.query(`
      WITH student_discounts_calc AS (
        SELECT 
          sg.student_id,
          g.price as original_price,
          COALESCE(
            SUM(
              CASE 
                WHEN sd.discount_type = 'percent' THEN (g.price * sd.discount_value / 100)
                WHEN sd.discount_type = 'amount' THEN sd.discount_value
                ELSE 0
              END
            ), 0
          ) as total_discount_amount
        FROM student_groups sg
        JOIN groups g ON sg.group_id = g.id
        LEFT JOIN student_discounts sd ON sg.student_id = sd.student_id 
          AND sd.is_active = true
          AND ('2026-01' >= sd.start_month)
          AND ('2026-01' <= sd.end_month)
        WHERE sg.status = 'active' AND sg.student_id = 34
        GROUP BY sg.student_id, g.price
      )
      SELECT DISTINCT
        sg.student_id,
        u.name,
        u.surname,
        g.price as original_price,
        g.name as group_name,
        
        -- To'lov ma'lumotlari (chegirma hisobga olingan)
        GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) as required_amount,
        COALESCE(sp.paid_amount, 0) as paid_amount,
        COALESCE(sdc.total_discount_amount, 0) as discount_amount,
        CASE 
          WHEN COALESCE(sp.paid_amount, 0) >= GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) THEN 'paid'
          WHEN COALESCE(sp.paid_amount, 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END as payment_status,
        
        (GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) - COALESCE(sp.paid_amount, 0)) as debt_amount

      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      LEFT JOIN student_discounts_calc sdc ON sg.student_id = sdc.student_id
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
                                    AND sp.month = '2026-01'
      
      WHERE sg.status = 'active'
        AND u.role = 'student'
        AND sg.student_id = 34
    `);
    
    console.log('\n📊 2026-01 oyidagi Jasur ning yangilangan ma\'lumotlari:');
    
    if (result.rows.length > 0) {
      const data = result.rows[0];
      console.log(`👤 Student: ${data.name} ${data.surname}`);
      console.log(`📚 Guruh: ${data.group_name}`);
      console.log(`💰 Original price: ${parseFloat(data.original_price).toLocaleString()} so'm`);
      console.log(`🎁 Discount: ${parseFloat(data.discount_amount).toLocaleString()} so'm`);
      console.log(`💳 Required amount: ${parseFloat(data.required_amount).toLocaleString()} so'm`);
      console.log(`✅ Paid amount: ${parseFloat(data.paid_amount).toLocaleString()} so'm`);
      console.log(`❗ Debt: ${parseFloat(data.debt_amount).toLocaleString()} so'm`);
      console.log(`🔄 Status: ${data.payment_status}`);
      
      // Eski ma'lumot bilan taqqoslash
      console.log('\n🔍 Taqqoslash:');
      console.log(`   Avval kerak edi: 2,399,999 so'm`);
      console.log(`   Endi kerak: ${parseFloat(data.required_amount).toLocaleString()} so'm`);
      console.log(`   Tejaldi: ${(2399999 - parseFloat(data.required_amount)).toLocaleString()} so'm`);
    } else {
      console.log('❌ Ma\'lumot topilmadi');
    }
    
    console.log('\n✅ Test yakunlandi!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    process.exit(1);
  }
})();