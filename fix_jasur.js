const pool = require('./config/db');

(async () => {
  try {
    console.log('🔧 Jasur ning holatini tuzatmoqda...');
    
    // Jasur ning haqiqiy holati qanday ekanlini ko'ramiz
    const jasur = await pool.query(`
      SELECT 
        u.id, u.name, u.surname,
        sg.group_id, g.name as group_name,
        sg.status, sg.join_date, sg.leave_date,
        NOW() as current_date
      FROM users u
      JOIN student_groups sg ON u.id = sg.student_id
      JOIN groups g ON sg.group_id = g.id
      WHERE u.id = 34
    `);
    
    console.log('\n📊 Jasur ning real holati:');
    jasur.rows.forEach(row => {
      console.log(`${row.name} ${row.surname} (ID: ${row.id}) - ${row.group_name}`);
      console.log(`  Status: ${row.status}`);
      console.log(`  Join: ${row.join_date.toISOString().split('T')[0]}`);
      console.log(`  Leave: ${row.leave_date ? row.leave_date.toISOString().split('T')[0] : 'NULL'}`);
      console.log(`  Hozirgi vaqt: ${row.current_date.toISOString().split('T')[0]}`);
      
      if (row.leave_date && row.leave_date <= new Date()) {
        console.log('  ⚠️  MUAMMO: Leave_date o\'tgan, lekin status hali active!');
      }
    });
    
    // Agar Jasur haqiqatan ham active bo'lishi kerak bo'lsa, leave_date'ni NULL qilamiz
    console.log('\n🔧 Jasur ning leave_date\'ini NULL qilmoqda (active status uchun)...');
    
    await pool.query(`
      UPDATE student_groups 
      SET leave_date = NULL 
      WHERE student_id = 34 AND status = 'active'
    `);
    
    console.log('✅ Jasur ning holati tuzatildi!');
    
    // Qayta tekshiramiz
    const after = await pool.query(`
      SELECT 
        u.name, u.surname, sg.status, sg.leave_date
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      WHERE u.id = 34
    `);
    
    console.log('\n📊 Tuzatilganidan keyin:');
    after.rows.forEach(row => {
      console.log(`${row.name} ${row.surname}: Status=${row.status}, Leave=${row.leave_date || 'NULL'}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();