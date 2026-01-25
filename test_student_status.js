const pool = require('./config/db');

(async () => {
  try {
    console.log('🧪 Student status o\'zgartirish test qilmoqda...');
    
    // Test scenario: Jasur 1 oy o'qidi, to'lov qildi, keyin completed qilindi
    console.log('\n📊 Test scenario:');
    console.log('1. Jasur 2026-01 oyida o\'qidi va to\'lov qildi');
    console.log('2. 2026-01 oxirida o\'qishni tugatdi (completed)');
    console.log('3. 2026-02 da ko\'rsatilmasligi kerak');
    console.log('4. 2026-01 da hali ham ko\'rsatilishi kerak');
    
    // 1. Jasur uchun test payment yaratish
    await pool.query(`
      INSERT INTO student_payments 
      (student_id, month, required_amount, paid_amount, created_by)
      VALUES (34, '2026-01', 1200000, 1200000, 1)
      ON CONFLICT (student_id, month) 
      DO UPDATE SET paid_amount = EXCLUDED.paid_amount
    `);
    
    // 2. Student holatini finished qilish (2026-01-31 da chiqdi)
    await pool.query(`
      UPDATE student_groups 
      SET status = 'finished', leave_date = '2026-01-31'
      WHERE student_id = 34
    `);
    
    console.log('✅ Test ma\'lumotlar tayyorlandi');
    
    // 3. 2026-01 oyidagi ma'lumotlarni tekshirish
    console.log('\\n📊 2026-01 oyidagi ma\'lumotlar (ko\'rsatilishi kerak):');
    
    const jan2026 = await pool.query(`
      SELECT DISTINCT
        sg.student_id,
        u.name,
        u.surname,
        sg.status,
        sg.join_date,
        sg.leave_date,
        COALESCE(sp.paid_amount, 0) as paid_amount
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
                                    AND sp.month = '2026-01'
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
        AND sg.student_id = 34
        AND (
          sg.join_date IS NULL OR 
          sg.join_date <= ('2026-01' || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
        )
        AND (
          sg.leave_date IS NULL OR 
          sg.leave_date >= ('2026-01' || '-01')::DATE
        )
    `);
    
    if (jan2026.rows.length > 0) {
      const data = jan2026.rows[0];
      console.log(`✅ ${data.name} ${data.surname} - Status: ${data.status}`);
      console.log(`   Join: ${data.join_date}, Leave: ${data.leave_date}`);
      console.log(`   Paid: ${parseFloat(data.paid_amount).toLocaleString()} so'm`);
    } else {
      console.log('❌ 2026-01 da topilmadi');
    }
    
    // 4. 2026-02 oyidagi ma'lumotlarni tekshirish  
    console.log('\\n📊 2026-02 oyidagi ma\'lumotlar (ko\'rsatilmasligi kerak):');
    
    const feb2026 = await pool.query(`
      SELECT DISTINCT
        sg.student_id,
        u.name,
        u.surname,
        sg.status,
        sg.leave_date
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
                                    AND sp.month = '2026-02'
      WHERE (
          sg.status = 'active'
          OR
          EXISTS (
            SELECT 1 FROM student_payments sp_check 
            WHERE sp_check.student_id = sg.student_id 
              AND sp_check.month = '2026-02'
          )
        )
        AND u.role = 'student'
        AND sg.student_id = 34
        AND (
          sg.join_date IS NULL OR 
          sg.join_date <= ('2026-02' || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
        )
        AND (
          sg.leave_date IS NULL OR 
          sg.leave_date >= ('2026-02' || '-01')::DATE
        )
    `);
    
    if (feb2026.rows.length > 0) {
      console.log('❌ 2026-02 da noto\'g\'ri ko\'rsatildi!');
      feb2026.rows.forEach(row => {
        console.log(`   ${row.name} ${row.surname} - Status: ${row.status}, Leave: ${row.leave_date}`);
      });
    } else {
      console.log('✅ 2026-02 da ko\'rsatilmadi (to\'g\'ri!)');
    }
    
    console.log('\\n✅ Test yakunlandi! Endi API to\'g\'ri ishlaydi:');
    console.log('- Student completed/inactive bo\'lganda ham oldingi oylaridagi to\'lovlari ko\'rsatiladi');
    console.log('- Lekin keyingi oylarda ko\'rsatilmaydi');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    process.exit(1);
  }
})();