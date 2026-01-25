const pool = require('./config/db');

(async () => {
  try {
    console.log('🧪 Payment va discount descriptions test qilmoqda...');
    
    // Test uchun Jasur ga bir nechta to'lov qo'shish
    console.log('📝 Test to\'lovlar qo\'shmoqda...');
    
    await pool.query(`
      INSERT INTO payment_transactions 
      (student_id, month, amount, payment_method, description, created_by)
      VALUES 
        (34, '2026-01', 500000, 'cash', 'Naqd pul orqali birinchi tolov', 1),
        (34, '2026-01', 300000, 'card', 'Plastik karta orqali ikkinchi tolov', 1),
        (34, '2026-01', 200000, 'transfer', 'Bank otkazmasi orqali qolgan summa', 1)
    `);
    
    console.log('✅ Test to\'lovlar qo\'shildi');
    
    // GetMonthlyPayments query'sini test qilish
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
        g.name as group_name,
        COALESCE(sp.paid_amount, 0) as paid_amount,
        
        -- So'ngi to'lov descriptions
        (
          SELECT STRING_AGG(
            pt.description || ' (' || TO_CHAR(pt.created_at, 'DD.MM.YYYY HH24:MI') || ')', 
            '; ' ORDER BY pt.created_at DESC
          )
          FROM payment_transactions pt 
          WHERE pt.student_id = sg.student_id 
            AND pt.month = '2026-01'
        ) as payment_descriptions,
        
        -- Chegirma description
        (
          SELECT sd.description || ' (' || sd.discount_value || 
            CASE 
              WHEN sd.discount_type = 'percent' THEN '%)'
              ELSE ' som)'
            END
          FROM student_discounts sd
          WHERE sd.student_id = sg.student_id 
            AND sd.start_month = '2026-01'
            AND sd.is_active = true
          LIMIT 1
        ) as discount_description

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
    
    console.log('\\n📊 Jasur ning to\'lov va chegirma ma\'lumotlari:');
    
    if (result.rows.length > 0) {
      const data = result.rows[0];
      console.log(`👤 Student: ${data.name} ${data.surname}`);
      console.log(`📚 Guruh: ${data.group_name}`);
      console.log(`💰 To'langan summa: ${parseFloat(data.paid_amount).toLocaleString()} so'm`);
      console.log(`📝 To'lov izohlar:`);
      console.log(`   ${data.payment_descriptions || 'To\'lov izohlar topilmadi'}`);
      console.log(`🎁 Chegirma izohi:`);
      console.log(`   ${data.discount_description || 'Chegirma izohi topilmadi'}`);
    } else {
      console.log('❌ Ma\'lumot topilmadi');
    }
    
    console.log('\\n✅ Test yakunlandi - API responseida payment_descriptions va discount_description maydonlari bo\'ladi!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    process.exit(1);
  }
})();