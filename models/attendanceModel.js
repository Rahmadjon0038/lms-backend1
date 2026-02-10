const pool = require('../config/db');

// Initialize tables
const initTables = async () => {
  try {
    await createLessonsTable();
    await createAttendanceTable();
  } catch (error) {
    console.error('Jadvallarni yaratishda xatolik:', error);
  }
};

// Lessons jadvalini yaratish
const createLessonsTable = async () => {
  try {
    const createQuery = `
      CREATE TABLE IF NOT EXISTS lessons (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

// Attendance jadvalini yaratish
const createAttendanceTable = async () => {
  try {
    // Avval jadval mavjudligini tekshirish
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'attendance'
      );
    `);
    
    const tableExists = checkTable.rows[0].exists;
    
    if (!tableExists) {
      // Jadval yaratish - YANGI TIZIM: Oylik mustaqil status bilan
      await pool.query(`
        CREATE TABLE attendance (
          id SERIAL PRIMARY KEY,
          lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
          student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
          month VARCHAR(7) NOT NULL,
          month_name VARCHAR(7),
          status VARCHAR(20) NOT NULL DEFAULT 'kelmadi' CHECK (status IN ('keldi', 'kelmadi', 'kechikdi')),
          is_marked BOOLEAN NOT NULL DEFAULT false,
          monthly_status VARCHAR(20) DEFAULT 'active' CHECK (monthly_status IN ('active', 'stopped', 'finished')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(lesson_id, student_id)
        );
      `);
    } else {
      // Mavjud jadvalga yangi ustunlarni qo'shish
      await pool.query(`
        ALTER TABLE attendance 
        ADD COLUMN IF NOT EXISTS lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS month VARCHAR(7),
        ADD COLUMN IF NOT EXISTS month_name VARCHAR(7),
        ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'kelmadi' CHECK (status IN ('keldi', 'kelmadi', 'kechikdi')),
        ADD COLUMN IF NOT EXISTS is_marked BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS monthly_status VARCHAR(20) DEFAULT 'active' 
          CHECK (monthly_status IN ('active', 'stopped', 'finished'));
      `);
    }

    // Orqaga moslik:
    // - Ilgari mavjud yozuvlar uchun taxminiy mark holatini tiklaymiz.
    // - O'tgan kunlar (yoki keldi/kechikdi) -> marked, kelajak -> unmarked.
    const hasLessonIdCol = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'attendance'
          AND column_name = 'lesson_id'
      ) AS exists
    `);

    if (hasLessonIdCol.rows[0]?.exists) {
      await pool.query(`
        UPDATE attendance
        SET month = COALESCE(month, month_name),
            month_name = COALESCE(month_name, month)
        WHERE month IS NULL OR month_name IS NULL;
      `);

      await pool.query(`
        UPDATE attendance a
        SET is_marked = CASE
          WHEN a.is_marked = true THEN true
          WHEN a.status IN ('keldi', 'kechikdi') THEN true
          WHEN l.date < CURRENT_DATE THEN true
          ELSE false
        END
        FROM lessons l
        WHERE a.lesson_id = l.id;
      `);
    }
    
    // Index'larni yaratish
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_lesson ON attendance(lesson_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_month ON attendance(month);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_group_month ON attendance(group_id, month);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_student_month ON attendance(student_id, month);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_attendance_monthly_status ON attendance(monthly_status);`);
    
    console.log("✅ 'attendance' jadvali tayyor.");
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
      SELECT l.id, l.date, CONCAT(u.name, ' ', u.surname) as created_by_name
      FROM lessons l
      LEFT JOIN users u ON l.created_by = u.id
      WHERE l.group_id = $1 AND l.date >= $2 AND l.date <= $3
      ORDER BY l.date
    `;
    const lessonsResult = await pool.query(lessonsQuery, [groupId, startDateStr, endDateStr]);
    const lessons = lessonsResult.rows.map(row => ({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      created_by: row.created_by_name || 'Noma\'lum'
    }));

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
      const attendanceData = {};
      lessons.forEach(lesson => {
        attendanceData[lesson.date] = attendanceMap[student.student_id] ? 
          attendanceMap[student.student_id][lesson.date] || null : null;
      });

      return {
        ...student,
        attendance: attendanceData
      };
    });

    return {
      group: {
        id: group.id,
        name: group.name,
        subject_name: group.subject_name,
        teacher_name: group.teacher_name
      },
      lessons: lessons,
      students: students,
      month: currentMonth
    };

  } catch (error) {
    console.error('Oylik davomat jadvalini olishda xatolik:', error);
    throw error;
  }
};

// initTables(); // Server.js da chaqiriladi

module.exports = {
  createLessonsTable,
  createAttendanceTable,
  getMonthlyAttendanceGrid
};
