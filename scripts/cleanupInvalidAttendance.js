const pool = require('../config/db');

async function cleanupInvalidAttendance() {
  try {
    console.log('🧹 Noto\'g\'ri attendance yozuvlarini tozalash boshlandi...');

    // Talaba darsdan KEYIN qo'shilgan bo'lsa, o'sha attendance'ni o'chirish
    const result = await pool.query(`
      DELETE FROM attendance a
      USING lessons l, student_groups sg
      WHERE a.lesson_id = l.id 
        AND a.student_id = sg.student_id 
        AND a.group_id = sg.group_id
        AND sg.joined_at > l.date
      RETURNING a.id, a.student_id, l.id as lesson_id, l.date as lesson_date, sg.joined_at
    `);

    console.log(`✅ ${result.rowCount} ta noto'g'ri attendance o'chirildi:`);
    result.rows.forEach(row => {
      console.log(`   - Student ${row.student_id}: Dars sanasi ${row.lesson_date}, Qo'shilgan ${row.joined_at}`);
    });

    console.log('✨ Tozalash tugadi!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Xatolik:', error);
    process.exit(1);
  }
}

cleanupInvalidAttendance();
