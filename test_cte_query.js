// Direct database query yordamida API'siz test
const pool = require('./config/db');

(async () => {
  try {
    console.log('🧪 Monthly payment filtering testi...');
    
    // Avval 2026-01 uchun getMonthlyPayments query'sini simulation qilamiz
    console.log('\n📊 2026-01 uchun CTE query test:');
    
    const jan2026Result = await pool.query(`
      WITH base_students AS (
        SELECT DISTINCT
          u.id,
          u.name,
          u.surname,
          u.phone,
          u.parent_phone,
          u.second_phone,
          u.parent_name,
          sg.group_id,
          g.name as group_name,
          s.name as subject_name,
          CONCAT(tu.name, ' ', tu.surname) as teacher_name,
          sg.status as student_status,
          sg.join_date,
          sg.leave_date,
          sp.base_fee,
          sp.required_amount,
          sp.paid_amount
        FROM users u
        JOIN student_groups sg ON u.id = sg.student_id
        JOIN groups g ON sg.group_id = g.id  
        JOIN subjects s ON g.subject_id = s.id
        LEFT JOIN users tu ON g.teacher_id = tu.id
        LEFT JOIN student_payments sp ON u.id = sp.student_id 
          AND sp.month_year = '2026-01'
          AND sp.group_id = sg.group_id
        WHERE u.role = 'student'
        AND (sg.leave_date IS NULL OR sg.leave_date >= '2026-01-01'::DATE)
      )
      SELECT 
        id, name, surname, phone, group_name, subject_name, 
        teacher_name, student_status, base_fee, required_amount, paid_amount
      FROM base_students 
      WHERE id IN (23, 34)
      ORDER BY name, group_name;
    `);
    
    console.log('2026-01 uchun natijalar:');
    jan2026Result.rows.forEach(row => {
      console.log(`  ${row.name} ${row.surname} - ${row.group_name} (Status: ${row.student_status})`);
    });
    
    console.log(`\n✅ 2026-01 da jami: ${jan2026Result.rows.length} ta entry`);
    
    // Endi 2026-02 uchun
    console.log('\n📊 2026-02 uchun CTE query test:');
    
    const feb2026Result = await pool.query(`
      WITH base_students AS (
        SELECT DISTINCT
          u.id,
          u.name,
          u.surname,
          u.phone,
          u.parent_phone,
          u.second_phone,
          u.parent_name,
          sg.group_id,
          g.name as group_name,
          s.name as subject_name,
          CONCAT(tu.name, ' ', tu.surname) as teacher_name,
          sg.status as student_status,
          sg.join_date,
          sg.leave_date,
          sp.base_fee,
          sp.required_amount,
          sp.paid_amount
        FROM users u
        JOIN student_groups sg ON u.id = sg.student_id
        JOIN groups g ON sg.group_id = g.id  
        JOIN subjects s ON g.subject_id = s.id
        LEFT JOIN users tu ON g.teacher_id = tu.id
        LEFT JOIN student_payments sp ON u.id = sp.student_id 
          AND sp.month_year = '2026-02'
          AND sp.group_id = sg.group_id
        WHERE u.role = 'student'
        AND (sg.leave_date IS NULL OR sg.leave_date >= '2026-02-01'::DATE)
      )
      SELECT 
        id, name, surname, phone, group_name, subject_name, 
        teacher_name, student_status, base_fee, required_amount, paid_amount
      FROM base_students 
      WHERE id IN (23, 34)
      ORDER BY name, group_name;
    `);
    
    console.log('2026-02 uchun natijalar:');
    feb2026Result.rows.forEach(row => {
      console.log(`  ${row.name} ${row.surname} - ${row.group_name} (Status: ${row.student_status})`);
    });
    
    console.log(`\n✅ 2026-02 da jami: ${feb2026Result.rows.length} ta entry`);
    
    // Comparison
    console.log('\n🔍 Taqqoslash:');
    console.log(`2026-01: ${jan2026Result.rows.length} entries`);
    console.log(`2026-02: ${feb2026Result.rows.length} entries`);
    
    if (jan2026Result.rows.length === feb2026Result.rows.length) {
      console.log('✅ Ikkala oyda ham bir xil miqdorda ko\'rsatilmoqda!');
    } else {
      console.log('❌ Oylar o\'rtasida farq bor!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();