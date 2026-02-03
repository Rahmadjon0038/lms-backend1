const pool = require('../config/db');

const fixAttendanceTable = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Attendance jadvalini tuzatish...');
    
    // Eski attendance jadvalini o'chirish
    await client.query('DROP TABLE IF EXISTS attendance CASCADE;');
    console.log('✅ Eski attendance jadvali o\'chirildi');
    
    // Yangi attendance jadvalini yaratish
    await client.query(`
      CREATE TABLE attendance (
        id SERIAL PRIMARY KEY,
        lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'kelmadi' CHECK (status IN ('keldi', 'kelmadi', 'kechikdi')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(lesson_id, student_id)
      );
    `);
    console.log('✅ Yangi attendance jadvali yaratildi');
    
    // Index'larni yaratish
    await client.query('CREATE INDEX idx_attendance_lesson ON attendance(lesson_id);');
    await client.query('CREATE INDEX idx_attendance_student ON attendance(student_id);');
    console.log('✅ Index\'lar yaratildi');
    
    console.log('🎉 Attendance jadvali muvaffaqiyatli tuzatildi!');
    
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
  } finally {
    client.release();
    process.exit(0);
  }
};

fixAttendanceTable();
