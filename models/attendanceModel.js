const pool = require('../config/db');

// Initialize tables
const initTables = async () => {
  try {
    await createLessonsTable();
    await createHolidaysTable();
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
        teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
        room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
        date DATE NOT NULL,
        start_time TIME NOT NULL DEFAULT '00:00:00',
        end_time TIME,
        is_holiday BOOLEAN DEFAULT false,
        status VARCHAR(20) NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'open', 'closed')),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, date, start_time)
      );
    `;
    
    await pool.query(createQuery);

    // Mavjud sxema uchun minimal migratsiya.
    await pool.query(`
      ALTER TABLE lessons
      ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS start_time TIME DEFAULT '00:00:00',
      ADD COLUMN IF NOT EXISTS end_time TIME,
      ADD COLUMN IF NOT EXISTS is_holiday BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'open', 'closed'));
    `);

    // Eski lessonlar uchun groupdan teacher/subject/room ni to'ldiramiz.
    await pool.query(`
      UPDATE lessons l
      SET teacher_id = g.teacher_id
      FROM groups g
      WHERE l.group_id = g.id
        AND l.teacher_id IS NULL
    `);
    await pool.query(`
      UPDATE lessons l
      SET subject_id = g.subject_id
      FROM groups g
      WHERE l.group_id = g.id
        AND l.subject_id IS NULL
    `);
    await pool.query(`
      UPDATE lessons l
      SET room_id = g.room_id
      FROM groups g
      WHERE l.group_id = g.id
        AND l.room_id IS NULL
    `);

    await pool.query(`
      UPDATE lessons
      SET status = CASE
        WHEN status = 'closed' THEN 'closed'
        WHEN date > CURRENT_DATE THEN 'not_started'
        ELSE 'open'
      END
      WHERE status IS NULL
    `);

    await pool.query(`
      UPDATE lessons
      SET start_time = COALESCE(start_time, '00:00:00'::time)
      WHERE start_time IS NULL
    `);

    await pool.query(`
      UPDATE lessons
      SET is_holiday = COALESCE(is_holiday, false)
      WHERE is_holiday IS NULL
    `);

    await pool.query(`
      ALTER TABLE lessons
      ALTER COLUMN start_time SET DEFAULT '00:00:00',
      ALTER COLUMN start_time SET NOT NULL,
      ALTER COLUMN is_holiday SET DEFAULT false,
      ALTER COLUMN status SET DEFAULT 'not_started',
      ALTER COLUMN status SET NOT NULL;
    `);

    // Ustunlar mavjud bo'lgandan keyin index yaratamiz.
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lessons_group_date ON lessons(group_id, date);
      CREATE INDEX IF NOT EXISTS idx_lessons_teacher_date ON lessons(teacher_id, date);
      CREATE INDEX IF NOT EXISTS idx_lessons_subject_date ON lessons(subject_id, date);
      CREATE INDEX IF NOT EXISTS idx_lessons_room_date ON lessons(room_id, date);
      CREATE INDEX IF NOT EXISTS idx_lessons_status ON lessons(status);
    `);

    // Eski unique(group_id, date) ni yangi unique(group_id, date, start_time) ga o'tkazamiz.
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'lessons_group_id_date_key'
            AND contype = 'u'
        ) THEN
          ALTER TABLE lessons DROP CONSTRAINT lessons_group_id_date_key;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'lessons_group_id_date_start_time_key'
            AND contype = 'u'
        ) THEN
          ALTER TABLE lessons
          ADD CONSTRAINT lessons_group_id_date_start_time_key UNIQUE (group_id, date, start_time);
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lesson_audit_logs (
        id SERIAL PRIMARY KEY,
        lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
        changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL,
        before_data JSONB,
        after_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_lesson_audit_lesson ON lesson_audit_logs(lesson_id);
      CREATE INDEX IF NOT EXISTS idx_lesson_audit_changed_by ON lesson_audit_logs(changed_by);
    `);

    console.log("✅ 'lessons' jadvali yaratildi.");
  } catch (error) {
    console.error('Lessons jadvalini yaratishda xatolik:', error);
    throw error;
  }
};

// Global holiday (dam olish) sanalari jadvali
const createHolidaysTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        date DATE PRIMARY KEY,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);`);
  } catch (error) {
    console.error('Holidays jadvalini yaratishda xatolik:', error);
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
      // Eski sxemadagi unique constraintlar yangi lesson-level attendance ga to'sqinlik qiladi.
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'attendance'
              AND constraint_name = 'attendance_student_id_month_name_key'
              AND constraint_type = 'UNIQUE'
          ) THEN
            ALTER TABLE attendance DROP CONSTRAINT attendance_student_id_month_name_key;
          END IF;

          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'attendance'
              AND constraint_name = 'attendance_student_id_group_id_month_name_key'
              AND constraint_type = 'UNIQUE'
          ) THEN
            ALTER TABLE attendance DROP CONSTRAINT attendance_student_id_group_id_month_name_key;
          END IF;
        END $$;
      `);

      await pool.query(`
        UPDATE attendance
        SET month = COALESCE(month, month_name),
            month_name = COALESCE(month_name, month)
        WHERE month IS NULL OR month_name IS NULL;
      `);

      await pool.query(`
        UPDATE attendance a
        SET is_marked = CASE
          -- Muhim: faqat eski "is_marked = NULL" yozuvlarini tiklaymiz.
          -- O'tgan sana bo'lgani uchun avtomatik true qilish yangi flowni buzadi.
          WHEN a.is_marked IS NULL AND a.status IN ('keldi', 'kechikdi') THEN true
          WHEN a.is_marked IS NULL THEN false
          ELSE a.is_marked
        END
        FROM lessons l
        WHERE a.lesson_id = l.id;
      `);

      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'attendance_lesson_id_student_id_key'
              AND contype = 'u'
          ) THEN
            ALTER TABLE attendance
            ADD CONSTRAINT attendance_lesson_id_student_id_key UNIQUE (lesson_id, student_id);
          END IF;
        END $$;
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
      SELECT l.id, l.date, l.is_holiday, CONCAT(u.name, ' ', u.surname) as created_by_name
      FROM lessons l
      LEFT JOIN users u ON l.created_by = u.id
      WHERE l.group_id = $1 AND l.date >= $2 AND l.date <= $3
      ORDER BY l.date
    `;
    const lessonsResult = await pool.query(lessonsQuery, [groupId, startDateStr, endDateStr]);
    const lessons = lessonsResult.rows.map(row => ({
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      created_by: row.created_by_name || 'Noma\'lum',
      is_holiday: row.is_holiday === true
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
  createHolidaysTable,
  createAttendanceTable,
  getMonthlyAttendanceGrid
};
