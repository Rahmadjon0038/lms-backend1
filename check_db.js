const pool = require('./config/db');

(async () => {
  try {
    console.log('📊 HOZIRGI BAZA HOLATI:');
    console.log('==========================================');
    
    // Jadvallar ro'yxatini olish
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    
    console.log('🗂️  MAVJUD JADVALLAR:');
    tables.rows.forEach(row => {
      console.log('   -', row.table_name);
    });
    
    console.log('\n📋 LESSONS JADVALI TUZILISHI:');
    try {
      const lessonsStructure = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'lessons' 
        ORDER BY ordinal_position;
      `);
      
      if (lessonsStructure.rows.length > 0) {
        lessonsStructure.rows.forEach(col => {
          console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
        });
      } else {
        console.log('   ❌ Lessons jadvali mavjud emas');
      }
    } catch (err) {
      console.log('   ❌ Lessons jadvali mavjud emas');
    }
    
    console.log('\n📋 ATTENDANCE JADVALI TUZILISHI:');
    try {
      const attStructure = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'attendance' 
        ORDER BY ordinal_position;
      `);
      
      if (attStructure.rows.length > 0) {
        attStructure.rows.forEach(col => {
          console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
        });
      } else {
        console.log('   ❌ Attendance jadvali mavjud emas');
      }
    } catch (err) {
      console.log('   ❌ Attendance jadvali mavjud emas');
    }
    
    await pool.end();
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
  }
})();