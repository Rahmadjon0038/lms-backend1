const pool = require('./config/db');

async function testJoinDateLogic() {
  console.log('=== SAVOL: Talaba guruhga qo\'shilganda qaysi oydan ko\'rinadi? ===\n');
  
  try {
    // 1. Bitta student guruhga qo'shilish sanasini ko'ramiz
    console.log('1. Talabalar guruhga qoshilgan sanalar:');
    const studentsQuery = `
      SELECT 
        u.name, u.surname,
        g.name as group_name,
        sg.join_date,
        sg.status,
        TO_CHAR(sg.join_date, 'YYYY-MM') as join_month
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      WHERE u.role = 'student' AND sg.status = 'active'
      ORDER BY sg.join_date;
    `;
    
    const studentsResult = await pool.query(studentsQuery);
    studentsResult.rows.forEach(row => {
      console.log(`- ${row.name} ${row.surname} (${row.group_name}): qoshildi ${row.join_date}, status: ${row.status}`);
    });
    
    // 2. Har xil oy uchun filter logikasini test qilamiz
    console.log('\n2. Filter logikasi test (talaba qaysi oydan korinadi):');
    
    const testMonths = ['2025-12', '2026-01', '2026-02', '2026-03'];
    
    for (const month of testMonths) {
      console.log(`\n--- ${month} oyi uchun ---`);
      
      const filterQuery = `
        SELECT 
          u.name, u.surname,
          g.name as group_name,
          sg.join_date,
          sg.status,
          -- Join date filter explanation
          CASE 
            WHEN sg.join_date IS NULL THEN 'Join date NULL - har doim korinadi'
            WHEN sg.join_date <= ($1 || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day' THEN 'Osha oyda yoki avval qoshilgan - korinadi'
            ELSE 'Keyinroq qoshilgan - korinmaydi'
          END as filter_result
        FROM student_groups sg
        JOIN users u ON sg.student_id = u.id
        JOIN groups g ON sg.group_id = g.id
        WHERE u.role = 'student' 
          AND sg.status = 'active'
          AND (
            sg.join_date IS NULL OR 
            sg.join_date <= ($1 || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
          )
        ORDER BY sg.join_date;
      `;
      
      const result = await pool.query(filterQuery, [month]);
      
      if (result.rows.length > 0) {
        result.rows.forEach(row => {
          console.log(`✓ ${row.name} ${row.surname} (${row.group_name})`);
          console.log(`  Join: ${row.join_date}, ${row.filter_result}`);
        });
      } else {
        console.log('  Hech kim korinmaydi');
      }
    }
    
    // 3. Praktik misol
    console.log('\n3. PRAKTIK MISOL:');
    console.log('Agar talaba 2026-01-15 da guruhga qoshilsa:');
    
    const exampleQuery = `
      SELECT 
        month_test,
        (join_example <= (month_test || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day') as will_appear
      FROM (
        VALUES 
          ('2025-12', '2026-01-15'::DATE),
          ('2026-01', '2026-01-15'::DATE),
          ('2026-02', '2026-01-15'::DATE),
          ('2026-03', '2026-01-15'::DATE)
      ) AS test_data(month_test, join_example);
    `;
    
    const exampleResult = await pool.query(exampleQuery);
    exampleResult.rows.forEach(row => {
      const status = row.will_appear ? '✓ Korinadi' : '✗ Korinmaydi';
      console.log(`- ${row.month_test} oyida: ${status}`);
    });
    
    console.log('\n=== JAVOB ===');
    console.log('Ha, talaba guruhga qoshilgan oydan boshlab tolovlar jadvalida korinadi!');
    console.log('Join_date <= oyning oxirgi kuni bolsa, osha oyda korinadi.');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  process.exit(0);
}

testJoinDateLogic();