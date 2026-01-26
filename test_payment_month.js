const pool = require('./config/db');

(async () => {
  try {
    // Aktiv talaba olish
    const students = await pool.query(`
      SELECT u.id, u.name, sg.group_id
      FROM users u
      JOIN student_groups sg ON u.id = sg.student_id
      WHERE sg.status = 'active' AND u.role = 'student'
      LIMIT 1
    `);
    
    if (students.rows.length === 0) {
      console.log('Aktiv talaba topilmadi');
      process.exit(1);
    }
    
    const student = students.rows[0];
    console.log('Test talaba:', student);
    
    // Barcha oylar uchun to'lovlarni tekshirish
    const payments = await pool.query(`
      SELECT month, paid_amount, required_amount, group_id
      FROM student_payments 
      WHERE student_id = $1
      ORDER BY month DESC
    `, [student.id]);
    
    console.log('\nTalabaning barcha to\'lovlari:');
    payments.rows.forEach(r => console.log(`  ${r.month}: ${r.paid_amount}/${r.required_amount} (group: ${r.group_id})`));
    
    // Chegirmalarni tekshirish
    const discounts = await pool.query(`
      SELECT start_month, end_month, discount_type, discount_value
      FROM student_discounts 
      WHERE student_id = $1
      ORDER BY start_month DESC
    `, [student.id]);
    
    console.log('\nTalabaning chegirmalari:');
    discounts.rows.forEach(r => console.log(`  ${r.start_month}-${r.end_month}: ${r.discount_value}${r.discount_type === 'percent' ? '%' : ' so\'m'}`));
    
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
})();
