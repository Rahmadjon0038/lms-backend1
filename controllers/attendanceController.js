const pool = require('../config/db');
const {
  createLessonsTable,
  createAttendanceTable,
  getMonthlyAttendanceGrid,
  getGroupLessons
} = require('../models/attendanceModel');

// Initialize tables
const initTables = async () => {
  try {
    await createLessonsTable();
    await createAttendanceTable();
  } catch (error) {
    console.error('Jadvallarni yaratishda xatolik:', error);
  }
};

initTables();

// 1. Davomat uchun guruhlar ro'yxati
exports.getGroupsForAttendance = async (req, res) => {
  const user_role = req.user.role;
  const user_id = req.user.id;
  
  try {
    let query = `
      SELECT 
        g.id,
        g.name,
        s.name as subject_name,
        COALESCE(CONCAT(t.name, ' ', t.surname), 'O''qituvchi biriktirilmagan') as teacher_name,
        COUNT(sg.student_id) FILTER (WHERE sg.status = 'active') as students_count
      FROM groups g
      LEFT JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN users t ON g.teacher_id = t.id
      LEFT JOIN student_groups sg ON g.id = sg.group_id
      WHERE g.class_status = 'started' AND g.status = 'active'
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Teacher faqat o'z guruhlarini ko'radi
    if (user_role === 'teacher') {
      query += ` AND g.teacher_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }
    
    query += ` GROUP BY g.id, g.name, s.name, t.name, t.surname ORDER BY g.name`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Guruhlarni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Guruhlarni olishda xatolik yuz berdi'
    });
  }
};

// 2. Bugungi kun uchun dars yaratish yoki ochish (New Attendance tugmasi)
exports.createOrGetTodaysLesson = async (req, res) => {
  const { group_id } = req.params;
  const user_role = req.user.role;
  const user_id = req.user.id;
  
  try {
    // Teacher faqat o'z guruhiga kirishini tekshirish
    if (user_role === 'teacher') {
      const teacherCheck = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [group_id, user_id]
      );
      
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Sizda bu guruhga kirish huquqi yo'q"
        });
      }
    }

    // Guruh mavjudligini tekshirish
    const groupCheck = await pool.query(
      'SELECT id, name FROM groups WHERE id = $1',
      [group_id]
    );
    
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // Bugungi kun uchun dars mavjudligini tekshirish
    let lessonCheck = await pool.query(
      'SELECT id FROM lessons WHERE group_id = $1 AND date = $2',
      [group_id, today]
    );

    let lesson_id;

    if (lessonCheck.rows.length === 0) {
      // Yangi dars yaratish
      const newLessonResult = await pool.query(
        'INSERT INTO lessons (group_id, date) VALUES ($1, $2) RETURNING id',
        [group_id, today]
      );
      lesson_id = newLessonResult.rows[0].id;

      // Shu guruhdagi barcha active studentlar uchun attendance yozuvlari yaratish
      const studentsResult = await pool.query(
        `SELECT sg.student_id FROM student_groups sg 
         WHERE sg.group_id = $1 AND sg.status = 'active'`,
        [group_id]
      );

      if (studentsResult.rows.length > 0) {
        const attendanceValues = studentsResult.rows.map((student, index) => {
          const baseIndex = index * 3;
          return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`;
        }).join(', ');

        const attendanceParams = [];
        studentsResult.rows.forEach(student => {
          attendanceParams.push(lesson_id, student.student_id, 'absent');
        });

        await pool.query(
          `INSERT INTO attendance (lesson_id, student_id, status) VALUES ${attendanceValues}`,
          attendanceParams
        );
      }
    } else {
      lesson_id = lessonCheck.rows[0].id;
    }

    // Talabalar ro'yxatini olish (mavjud davomat bilan)
    const studentsData = await pool.query(
      `SELECT 
         u.id as student_id,
         u.name,
         u.surname,
         COALESCE(a.status, 'absent') as status
       FROM student_groups sg
       JOIN users u ON sg.student_id = u.id
       LEFT JOIN attendance a ON a.lesson_id = $1 AND a.student_id = u.id
       WHERE sg.group_id = $2 AND sg.status = 'active'
       ORDER BY u.name, u.surname`,
      [lesson_id, group_id]
    );

    res.json({
      success: true,
      data: {
        id: lesson_id,
        group_id: parseInt(group_id),
        date: today,
        students: studentsData.rows
      }
    });

  } catch (error) {
    console.error('Dars yaratish/olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Dars yaratishda xatolik yuz berdi'
    });
  }
};

// 3. Dars davomatini saqlash
exports.saveLessonAttendance = async (req, res) => {
  const { lesson_id, attendance_data } = req.body;
  const user_role = req.user.role;
  const user_id = req.user.id;
  
  try {
    // Validatsiya
    if (!lesson_id || !Array.isArray(attendance_data)) {
      return res.status(400).json({
        success: false,
        message: 'lesson_id va attendance_data (array) majburiy'
      });
    }

    // Dars va guruh ma'lumotlarini olish
    const lessonCheck = await pool.query(
      'SELECT l.id, l.group_id FROM lessons l WHERE l.id = $1',
      [lesson_id]
    );

    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dars topilmadi'
      });
    }

    const group_id = lessonCheck.rows[0].group_id;

    // Teacher faqat o'z guruhida davomat saqlaydi
    if (user_role === 'teacher') {
      const teacherCheck = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [group_id, user_id]
      );
      
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Sizda bu guruhda davomat saqlash huquqi yo'q"
        });
      }
    }

    // Har bir attendance ma'lumotini validatsiya qilish
    for (const record of attendance_data) {
      if (!record.student_id || !['present', 'absent'].includes(record.status)) {
        return res.status(400).json({
          success: false,
          message: "Har bir record uchun student_id va status ('present' yoki 'absent') majburiy"
        });
      }
    }

    // Transaction ichida attendance yozuvlarini yangilash
    await pool.query('BEGIN');
    
    try {
      for (const record of attendance_data) {
        await pool.query(
          `UPDATE attendance 
           SET status = $1, updated_at = CURRENT_TIMESTAMP
           WHERE lesson_id = $2 AND student_id = $3`,
          [record.status, lesson_id, record.student_id]
        );
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Davomat muvaffaqiyatli saqlandi'
      });
      
    } catch (updateError) {
      await pool.query('ROLLBACK');
      throw updateError;
    }

  } catch (error) {
    console.error('Davomat saqlashda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Davomat saqlashda xatolik yuz berdi'
    });
  }
};

// 4. Oylik davomat jadvalini ko'rish
exports.getMonthlyAttendanceGrid = async (req, res) => {
  const { group_id } = req.params;
  const { month } = req.query; // YYYY-MM format
  const user_role = req.user.role;
  const user_id = req.user.id;
  
  try {
    // Teacher faqat o'z guruhiga kirishini tekshirish
    if (user_role === 'teacher') {
      const teacherCheck = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [group_id, user_id]
      );
      
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Sizda bu guruhga kirish huquqi yo'q"
        });
      }
    }

    // Guruh mavjudligini tekshirish
    const groupCheck = await pool.query(
      'SELECT id, name FROM groups WHERE id = $1',
      [group_id]
    );
    
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const gridData = await getMonthlyAttendanceGrid(group_id, month);

    res.json({
      success: true,
      data: gridData
    });

  } catch (error) {
    console.error('Oylik davomat jadvalini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Davomat jadvalini olishda xatolik yuz berdi'
    });
  }
};

// 5. Guruhning barcha darslarini ko'rish
exports.getGroupLessons = async (req, res) => {
  const { group_id } = req.params;
  const { start_date, end_date } = req.query;
  const user_role = req.user.role;
  const user_id = req.user.id;
  
  try {
    // Teacher faqat o'z guruhiga kirishini tekshirish
    if (user_role === 'teacher') {
      const teacherCheck = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [group_id, user_id]
      );
      
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Sizda bu guruhga kirish huquqi yo'q"
        });
      }
    }

    // Guruh mavjudligini tekshirish
    const groupCheck = await pool.query(
      'SELECT id, name FROM groups WHERE id = $1',
      [group_id]
    );
    
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const lessons = await getGroupLessons(group_id, start_date, end_date);

    res.json({
      success: true,
      data: lessons
    });

  } catch (error) {
    console.error('Guruh darslarini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Darslar ro\'yxatini olishda xatolik yuz berdi'
    });
  }
};

// 6. Group va date orqali davomat belgilash (lesson_id kerak emas)
exports.markAttendanceByGroupDate = async (req, res) => {
  const { group_id, date, attendance_data } = req.body;
  const user_role = req.user.role;
  const user_id = req.user.id;
  
  try {
    // Validatsiya
    if (!group_id || !date || !Array.isArray(attendance_data)) {
      return res.status(400).json({
        success: false,
        message: 'group_id, date va attendance_data (array) majburiy'
      });
    }

    // Teacher faqat o'z guruhida davomat belgilaydi
    if (user_role === 'teacher') {
      const teacherCheck = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [group_id, user_id]
      );
      
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Sizda bu guruhda davomat belgilash huquqi yo'q"
        });
      }
    }

    // Guruh mavjudligini tekshirish
    const groupCheck = await pool.query(
      'SELECT id FROM groups WHERE id = $1',
      [group_id]
    );
    
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    // Dars mavjudligini tekshirish yoki yaratish
    let lessonCheck = await pool.query(
      'SELECT id FROM lessons WHERE group_id = $1 AND date = $2',
      [group_id, date]
    );

    let lesson_id;

    if (lessonCheck.rows.length === 0) {
      // Yangi dars yaratish
      const newLessonResult = await pool.query(
        'INSERT INTO lessons (group_id, date) VALUES ($1, $2) RETURNING id',
        [group_id, date]
      );
      lesson_id = newLessonResult.rows[0].id;

      // Shu guruhdagi barcha active studentlar uchun attendance yozuvlari yaratish
      const studentsResult = await pool.query(
        `SELECT sg.student_id FROM student_groups sg 
         WHERE sg.group_id = $1 AND sg.status = 'active'`,
        [group_id]
      );

      if (studentsResult.rows.length > 0) {
        const attendanceValues = studentsResult.rows.map((student, index) => {
          const baseIndex = index * 3;
          return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`;
        }).join(', ');

        const attendanceParams = [];
        studentsResult.rows.forEach(student => {
          attendanceParams.push(lesson_id, student.student_id, 'absent');
        });

        await pool.query(
          `INSERT INTO attendance (lesson_id, student_id, status) VALUES ${attendanceValues}`,
          attendanceParams
        );
      }
    } else {
      lesson_id = lessonCheck.rows[0].id;
    }

    // Har bir attendance ma'lumotini validatsiya qilish
    for (const record of attendance_data) {
      if (!record.student_id || !['present', 'absent'].includes(record.status)) {
        return res.status(400).json({
          success: false,
          message: "Har bir record uchun student_id va status ('present' yoki 'absent') majburiy"
        });
      }
    }

    // Transaction ichida attendance yozuvlarini yangilash
    await pool.query('BEGIN');
    
    try {
      for (const record of attendance_data) {
        await pool.query(
          `UPDATE attendance 
           SET status = $1, updated_at = CURRENT_TIMESTAMP
           WHERE lesson_id = $2 AND student_id = $3`,
          [record.status, lesson_id, record.student_id]
        );
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Davomat muvaffaqiyatli saqlandi',
        data: {
          lesson_id,
          group_id,
          date,
          updated_count: attendance_data.length
        }
      });
      
    } catch (updateError) {
      await pool.query('ROLLBACK');
      throw updateError;
    }

  } catch (error) {
    console.error('Group va date orqali davomat belgilashda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Davomat belgilashda xatolik yuz berdi'
    });
  }
};

module.exports = {
  getGroupsForAttendance: exports.getGroupsForAttendance,
  createOrGetTodaysLesson: exports.createOrGetTodaysLesson,
  saveLessonAttendance: exports.saveLessonAttendance,
  getMonthlyAttendanceGrid: exports.getMonthlyAttendanceGrid,
  getGroupLessons: exports.getGroupLessons,
  markAttendanceByGroupDate: exports.markAttendanceByGroupDate
};