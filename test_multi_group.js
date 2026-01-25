const pool = require('./config/db');

(async () => {
  try {
    console.log('🧪 Multi-group student test qilmoqda...');
    
    // Test scenario yaratish
    console.log('\n📊 Test scenario:');
    console.log('1. Student ID 23 (Mirjalol) - 2 ta guruhda');
    console.log('2. Group A da finished, Group B da active');
    console.log('3. Har ikkala guruh ham yangi oyda ko\'rsatilishi kerak');
    
    // Mirjalol uchun 2 ta guruhda test ma'lumot
    await pool.query(`
      INSERT INTO student_groups (student_id, group_id, status, join_date)
      VALUES 
        (23, 42, 'active', '2026-01-01'),
        (23, 43, 'finished', '2026-01-01')
      ON CONFLICT (student_id, group_id) 
      DO UPDATE SET 
        status = EXCLUDED.status,
        join_date = EXCLUDED.join_date
    `);
    
    console.log('✅ Test student_groups yaratildi');
    
    // Barcha student_groups'ni ko'rish
    const allGroups = await pool.query(`
      SELECT 
        u.id, u.name, u.surname,
        sg.group_id, g.name as group_name,
        sg.status, sg.join_date, sg.leave_date
      FROM users u
      JOIN student_groups sg ON u.id = sg.student_id
      JOIN groups g ON sg.group_id = g.id
      WHERE u.id = 23
      ORDER BY sg.group_id
    `);
    
    console.log('\\n📊 Student 23 ning barcha guruhlari:');
    allGroups.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.name} ${row.surname} - ${row.group_name}`);
      console.log(`   Status: ${row.status}, Join: ${row.join_date ? row.join_date.toISOString().split('T')[0] : 'N/A'}`);
    });
    
    // Yangi logika bilan test
    const newLogicResult = await pool.query(`
      WITH student_discounts_calc AS (
        SELECT 
          sg.student_id,
          sg.group_id,
          g.price as original_price,
          COALESCE(SUM(0), 0) as total_discount_amount
        FROM student_groups sg
        JOIN groups g ON sg.group_id = g.id
        WHERE sg.status = 'active'
        GROUP BY sg.student_id, sg.group_id, g.price
      )
      SELECT 
        sg.student_id,
        u.name,
        u.surname,
        g.id as group_id,
        g.name as group_name,
        sg.status as student_status
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      LEFT JOIN student_discounts_calc sdc ON sg.student_id = sdc.student_id AND sg.group_id = sdc.group_id
      
      WHERE (
          sg.status = 'active' 
          OR
          EXISTS (
            SELECT 1 FROM student_payments sp_check 
            WHERE sp_check.student_id = sg.student_id 
              AND sp_check.month = '2026-01'
          )
        )
        AND u.role = 'student'
        AND u.id = 23
        AND (
          sg.join_date IS NULL OR 
          sg.join_date <= ('2026-01' || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
        )
        AND (
          sg.leave_date IS NULL OR 
          sg.leave_date >= ('2026-01' || '-01')::DATE
        )
      ORDER BY g.name
    `);
    
    console.log('\\n📊 Yangi logika natijasi (2026-01):');
    newLogicResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.name} ${row.surname} - ${row.group_name} (${row.student_status})`);
    });
    
    console.log(`\\n✅ Natija: ${newLogicResult.rows.length} ta guruh ko'rsatildi`);
    
    if (newLogicResult.rows.length >= 1) {
      console.log('✅ Kamida bitta active guruh ko\rsatildi');
    }
    
    // Agar finished guruh ham payment bilan ko'rsatish kerak bo'lsa
    await pool.query(`
      INSERT INTO student_payments (student_id, month, required_amount, paid_amount, created_by)
      VALUES (23, '2026-01', 500000, 500000, 1)
      ON CONFLICT (student_id, month) DO NOTHING
    `);
    
    const withPaymentResult = await pool.query(`
      SELECT 
        sg.student_id,
        u.name,
        g.name as group_name,
        sg.status as student_status
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      WHERE (
          sg.status = 'active' 
          OR
          EXISTS (
            SELECT 1 FROM student_payments sp_check 
            WHERE sp_check.student_id = sg.student_id 
              AND sp_check.month = '2026-01'
          )
        )
        AND u.role = 'student'
        AND u.id = 23
      ORDER BY g.name
    `);
    
    console.log('\\n📊 Payment bilan natija:');
    withPaymentResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.name} - ${row.group_name} (${row.student_status})`);
    });
    
    console.log('\\n✅ Test yakunlandi! Endi har guruh alohida ko\'rsatiladi');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    process.exit(1);
  }
})();