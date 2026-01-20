const pool = require('../config/db');

// Lessons jadvalini yaratish
const createLessonsTable = async () => {
  try {
    const createQuery = `
      CREATE TABLE IF NOT EXISTS lessons (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, date)
      );
      
      CREATE INDEX IF NOT EXISTS idx_lessons_group_date ON lessons(group_id, date);
    `;
    
    await pool.query(createQuery);
    console.log("✅ 'lessons' jadvali yaratildi.");
  } catch (error) {
    console.error('Lessons jadvalini yaratishda xatolik:', error);
    throw error;
  }
};

// Attendance jadvalini qayta yaratish (lesson-based)
const createAttendanceTable = async () => {
  try {
    // Eski attendance jadvalini o'chirish
    await pool.query('DROP TABLE IF EXISTS attendance CASCADE');
    
    // Yangi attendance jadvalini yaratish
    const createQuery = `
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
        student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'absent' CHECK (status IN ('present', 'absent')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(lesson_id, student_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_attendance_lesson ON attendance(lesson_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    `;
    
    await pool.query(createQuery);
    console.log("✅ Yangi 'attendance' jadvali yaratildi.");
  } catch (error) {
    console.error('Attendance jadvalini yaratishda xatolik:', error);
    throw error;
  }
};

// Oylik davomat jadvalini olish
const getMonthlyAttendanceGrid = async (groupId, month = null) => {
  try {
    // Default month - joriy oy
    const currentMonth = month || new Date().toISOString().slice(0, 7); // YYYY-MM format
    const startDate = new Date(currentMonth + '-01');
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    const endDateStr = endDate.toISOString().slice(0, 10);
    const startDateStr = startDate.toISOString().slice(0, 10);

    // Guruh ma'lumotlarini olish
    const groupQuery = `
      SELECT 
        g.id,
        g.name,
        s.name as subject_name,
        COALESCE(CONCAT(t.name, ' ', t.surname), 'O''qituvchi biriktirilmagan') as teacher_name
      FROM groups g
      LEFT JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN users t ON g.teacher_id = t.id
      WHERE g.id = $1
    `;
    const groupResult = await pool.query(groupQuery, [groupId]);
    
    if (groupResult.rows.length === 0) {
      throw new Error('Guruh topilmadi');
    }

    const group = groupResult.rows[0];

    // Oy ichidagi barcha darslarni olish
    const lessonsQuery = `
      SELECT l.id, l.date
      FROM lessons l
      WHERE l.group_id = $1 AND l.date >= $2 AND l.date <= $3
      ORDER BY l.date
    `;
    const lessonsResult = await pool.query(lessonsQuery, [groupId, startDateStr, endDateStr]);
    const lessonDates = lessonsResult.rows.map(row => row.date.toISOString().slice(0, 10));

    // Guruhdagi aktiv talabalarni olish
    const studentsQuery = `
      SELECT 
        u.id as student_id,
        u.name,
        u.surname,
        u.phone
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      WHERE sg.group_id = $1 AND sg.status = 'active'
      ORDER BY u.name, u.surname
    `;
    const studentsResult = await pool.query(studentsQuery, [groupId]);

    // Davomat ma'lumotlarini olish
    const attendanceQuery = `
      SELECT 
        a.student_id,
        l.date,
        a.status
      FROM attendance a
      JOIN lessons l ON a.lesson_id = l.id
      WHERE l.group_id = $1 AND l.date >= $2 AND l.date <= $3
    `;
    const attendanceResult = await pool.query(attendanceQuery, [groupId, startDateStr, endDateStr]);

    // Davomat ma'lumotlarini student_id va date bo'yicha indekslash
    const attendanceMap = {};
    attendanceResult.rows.forEach(row => {
      const dateStr = row.date.toISOString().slice(0, 10);
      if (!attendanceMap[row.student_id]) {
        attendanceMap[row.student_id] = {};
      }
      attendanceMap[row.student_id][dateStr] = row.status;
    });

    // Har bir talaba uchun davomat kataklarini tayyorlash
    const students = studentsResult.rows.map(student => {
      const dailyAttendance = {};
      lessonDates.forEach(date => {
        dailyAttendance[date] = attendanceMap[student.student_id] ? 
          attendanceMap[student.student_id][date] || null : null;
      });

      return {
        ...student,
        daily_attendance: dailyAttendance
      };
    });

    return {
      group: {
        id: group.id,
        name: group.name,
        subject_name: group.subject_name,
        teacher_name: group.teacher_name
      },
      lesson_dates: lessonDates,
      students: students,
      month: currentMonth
    };

  } catch (error) {
    console.error('Oylik davomat jadvalini olishda xatolik:', error);
    throw error;
  }
};

// Guruhning barcha darslarini olish (tarix bilan)
const getGroupLessons = async (groupId, startDate = null, endDate = null) => {
  try {
    let query = `
      SELECT 
        l.id,
        l.date,
        COUNT(a.id) as total_students,
        COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN a.status = 'absent' THEN 1 END) as absent_count
      FROM lessons l
      LEFT JOIN attendance a ON l.id = a.lesson_id
      WHERE l.group_id = $1
    `;
    
    const params = [groupId];
    let paramIndex = 2;
    
    if (startDate) {
      query += ` AND l.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND l.date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ` GROUP BY l.id, l.date ORDER BY l.date DESC`;
    
    const result = await pool.query(query, params);
    
    return result.rows.map(row => ({
      ...row,
      date: row.date.toISOString().slice(0, 10)
    }));
    
  } catch (error) {
    console.error('Guruh darslarini olishda xatolik:', error);
    throw error;
  }
};

module.exports = {
  createLessonsTable,
  createAttendanceTable,
  getMonthlyAttendanceGrid,
  getGroupLessons
};