const pool = require('./config/db');

(async () => {
  try {
    console.log('🔍 Real database holatini tekshirmoqda...');
    
    // Jasur va Mirjalol ning real ma'lumotlari
    const students = await pool.query(`
      SELECT 
        u.id, u.name, u.surname,
        sg.group_id, g.name as group_name,
        sg.status, sg.join_date, sg.leave_date
      FROM users u
      JOIN student_groups sg ON u.id = sg.student_id
      JOIN groups g ON sg.group_id = g.id
      WHERE u.id IN (34, 23)
      ORDER BY u.id, sg.group_id
    `);
    
    console.log('\n📊 Student groups real holati:');
    students.rows.forEach(row => {
      console.log(`${row.name} ${row.surname} (ID: ${row.id}) - ${row.group_name} (Group: ${row.group_id})`);
      console.log(`  Status: ${row.status}`);
      console.log(`  Join: ${row.join_date ? row.join_date.toISOString().split('T')[0] : 'NULL'}`);
      console.log(`  Leave: ${row.leave_date ? row.leave_date.toISOString().split('T')[0] : 'NULL'}`);
      console.log('---');
    });
    
    // 2026-01 uchun query test
    console.log('\n🧪 2026-01 uchun filter test:');
    const jan2026 = await pool.query(`
      SELECT 
        u.name, u.surname, sg.status, sg.group_id,
        CASE 
          WHEN sg.leave_date IS NULL THEN 'NULL' 
          ELSE sg.leave_date::text 
        END as leave_date,
        CASE
          WHEN sg.leave_date IS NULL THEN true
          ELSE sg.leave_date >= ('2026-01' || '-01')::DATE
        END as passes_leave_filter
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      WHERE u.id IN (34, 23)
    `);
    
    jan2026.rows.forEach(row => {
      console.log(`${row.name} ${row.surname} (Group: ${row.group_id}): Status=${row.status}, Leave=${row.leave_date}, Passes_2026_01=${row.passes_leave_filter}`);
    });
    
    // 2026-02 uchun query test  
    console.log('\n🧪 2026-02 uchun filter test:');
    const feb2026 = await pool.query(`
      SELECT 
        u.name, u.surname, sg.status, sg.group_id,
        CASE 
          WHEN sg.leave_date IS NULL THEN 'NULL' 
          ELSE sg.leave_date::text 
        END as leave_date,
        CASE
          WHEN sg.leave_date IS NULL THEN true
          ELSE sg.leave_date >= ('2026-02' || '-01')::DATE
        END as passes_leave_filter
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      WHERE u.id IN (34, 23)
    `);
    
    feb2026.rows.forEach(row => {
      console.log(`${row.name} ${row.surname} (Group: ${row.group_id}): Status=${row.status}, Leave=${row.leave_date}, Passes_2026_02=${row.passes_leave_filter}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();