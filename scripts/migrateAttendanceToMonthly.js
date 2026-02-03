const pool = require('../config/db');

/**
 * ATTENDANCE JADVALINI OYLIK MUSTAQIL TIZIMGA O'TKAZISH
 * 
 * Yangi ustunlar:
 * - month (YYYY-MM) - Qaysi oyga tegishli
 * - group_id - Qaysi guruhga tegishli
 * - monthly_status (active/stopped/finished) - HAR OY UCHUN ALOHIDA STATUS
 */

const migrateAttendance = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Attendance jadvalini oylik tizimga o\'tkazish...\n');
    
    // 1. Eski group_status ustunini o'chirish (endi kerak emas)
    console.log('1️⃣ Eski group_status ustunini o\'chirish...');
    await client.query(`
      ALTER TABLE attendance 
      DROP COLUMN IF EXISTS group_status;
    `);
    console.log('✅ group_status o\'chirildi\n');
    
    // 2. Yangi ustunlarni qo'shish
    console.log('2️⃣ Yangi ustunlarni qo\'shish...');
    await client.query(`
      ALTER TABLE attendance 
      ADD COLUMN IF NOT EXISTS month VARCHAR(7),
      ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS monthly_status VARCHAR(20) DEFAULT 'active' 
        CHECK (monthly_status IN ('active', 'stopped', 'finished'));
    `);
    console.log('✅ month, group_id, monthly_status qo\'shildi\n');
    
    // 3. Mavjud ma'lumotlarni yangilash
    console.log('3️⃣ Mavjud ma\'lumotlarni yangilash...');
    await client.query(`
      UPDATE attendance
      SET 
        month = subquery.month,
        group_id = subquery.group_id,
        monthly_status = subquery.monthly_status
      FROM (
        SELECT 
          a.id,
          TO_CHAR(l.date, 'YYYY-MM') as month,
          l.group_id,
          COALESCE(sg.status, 'active') as monthly_status
        FROM attendance a
        JOIN lessons l ON a.lesson_id = l.id
        LEFT JOIN student_groups sg ON sg.student_id = a.student_id AND sg.group_id = l.group_id
        WHERE a.month IS NULL OR a.group_id IS NULL
      ) AS subquery
      WHERE attendance.id = subquery.id;
    `);
    console.log('✅ Mavjud ma\'lumotlar yangilandi\n');
    
    // 4. Index'lar yaratish (tezlik uchun)
    console.log('4️⃣ Index\'lar yaratish...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_month ON attendance(month);
      CREATE INDEX IF NOT EXISTS idx_attendance_group_month ON attendance(group_id, month);
      CREATE INDEX IF NOT EXISTS idx_attendance_student_month ON attendance(student_id, month);
      CREATE INDEX IF NOT EXISTS idx_attendance_monthly_status ON attendance(monthly_status);
    `);
    console.log('✅ Index\'lar yaratildi\n');
    
    // 5. Natijani ko'rsatish
    const stats = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN monthly_status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN monthly_status = 'stopped' THEN 1 END) as stopped,
        COUNT(CASE WHEN monthly_status = 'finished' THEN 1 END) as finished
      FROM attendance
    `);
    
    console.log('📊 Migratsiya statistikasi:');
    console.log(`   Jami yozuvlar: ${stats.rows[0].total}`);
    console.log(`   Active: ${stats.rows[0].active}`);
    console.log(`   Stopped: ${stats.rows[0].stopped}`);
    console.log(`   Finished: ${stats.rows[0].finished}\n`);
    
    console.log('🎉 Attendance jadvali muvaffaqiyatli yangilandi!');
    console.log('ℹ️  Endi har bir attendance yozuvi oylik mustaqil status ga ega\n');
    
  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    throw error;
  } finally {
    client.release();
    process.exit(0);
  }
};

migrateAttendance();
