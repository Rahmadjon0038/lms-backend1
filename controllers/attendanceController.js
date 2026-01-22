const pool = require('../config/db');
const {
  getMonthlyAttendanceGrid
} = require('../models/attendanceModel');

// 1. ADMIN va TEACHER uchun guruhlar ro'yxati
exports.getGroupsForAttendance = async (req, res) => {
  const { role, id: userId } = req.user;
  
  try {
    let query = `
      SELECT 
        g.id,
        g.name,
        s.name as subject_name,
        COALESCE(CONCAT(t.name, ' ', t.surname), 'O''qituvchi biriktirilmagan') as teacher_name,
        COUNT(sg.student_id) FILTER (WHERE sg.status = 'active') as students_count,
        g.class_start_date,
        g.schedule
      FROM groups g
      LEFT JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN users t ON g.teacher_id = t.id
      LEFT JOIN student_groups sg ON g.id = sg.group_id
      WHERE g.status = 'active'
    `;
    
    const params = [];
    
    // TEACHER faqat o'z guruhlarini ko'radi
    if (role === 'teacher') {
      query += ' AND g.teacher_id = $1';
      params.push(userId);
    }
    
    query += ' GROUP BY g.id, g.name, s.name, t.name, t.surname, g.class_start_date, g.schedule ORDER BY g.name';
    
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

// 2. Bugungi dars yaratish
exports.createTodaysLesson = async (req, res) => {
  const { group_id } = req.params;
  const { role, id: userId } = req.user;
  
  try {
    // TEACHER faqat o'z guruhida dars yarata oladi
    if (role === 'teacher') {
      const teacherCheck = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2 AND status = $3',
        [group_id, userId, 'active']
      );
      
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Sizda bu guruhda dars yaratish huquqi yo'q"
        });
      }
    }

    // Guruh mavjudligini tekshirish
    const groupCheck = await pool.query(
      'SELECT id, name FROM groups WHERE id = $1 AND status = $2',
      [group_id, 'active']
    );
    
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi yoki faol emas'
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Bugungi kun uchun dars mavjudligini tekshirish
    const lessonCheck = await pool.query(
      'SELECT id FROM lessons WHERE group_id = $1 AND date = $2',
      [group_id, today]
    );

    if (lessonCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bugungi kun uchun dars allaqachon yaratilgan'
      });
    }

    // Yangi dars yaratish
    const newLessonResult = await pool.query(
      'INSERT INTO lessons (group_id, date, created_by) VALUES ($1, $2, $3) RETURNING id',
      [group_id, today, userId]
    );
    const lesson_id = newLessonResult.rows[0].id;

    // Shu guruhdagi barcha aktiv studentlar uchun attendance yozuvlari yaratish
    const studentsResult = await pool.query(
      `SELECT sg.student_id FROM student_groups sg 
       WHERE sg.group_id = $1 AND sg.status = 'active'`,
      [group_id]
    );

    if (studentsResult.rows.length > 0) {
      const attendanceValues = studentsResult.rows.map((_, index) => {
        const baseIndex = index * 3;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`;
      }).join(', ');

      const attendanceParams = [];
      studentsResult.rows.forEach(student => {
        attendanceParams.push(lesson_id, student.student_id, 'kelmadi');
      });

      await pool.query(
        `INSERT INTO attendance (lesson_id, student_id, status) VALUES ${attendanceValues}`,
        attendanceParams
      );
    }

    res.json({
      success: true,
      message: 'Bugungi dars muvaffaqiyatli yaratildi',
      data: {
        lesson_id,
        group_id: parseInt(group_id),
        date: today,
        students_count: studentsResult.rows.length
      }
    });

  } catch (error) {
    console.error('Dars yaratishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Dars yaratishda xatolik yuz berdi'
    });
  }
};

// 3. Dars uchun studentlar ro'yxati va davomat
exports.getLessonStudents = async (req, res) => {
  const { lesson_id } = req.params;
  const { role, id: userId } = req.user;
  
  try {
    // Dars va guruh ma'lumotlarini olish
    const lessonCheck = await pool.query(
      `SELECT l.id, l.group_id, l.date, g.name as group_name 
       FROM lessons l
       JOIN groups g ON l.group_id = g.id
       WHERE l.id = $1`,
      [lesson_id]
    );

    if (lessonCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dars topilmadi'
      });
    }

    const lesson = lessonCheck.rows[0];

    // TEACHER faqat o'z guruhini ko'ra oladi
    if (role === 'teacher') {
      const teacherCheck = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [lesson.group_id, userId]
      );
      
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Sizda bu darsni ko'rish huquqi yo'q"
        });
      }
    }

    // Studentlar va ularning davomat holatini olish
    const studentsData = await pool.query(
      `SELECT 
         u.id as student_id,
         u.name,
         u.surname,
         u.phone,
         a.status
       FROM attendance a
       JOIN users u ON a.student_id = u.id
       WHERE a.lesson_id = $1
       ORDER BY u.name, u.surname`,
      [lesson_id]
    );

    res.json({
      success: true,
      data: {
        lesson_id: lesson.id,
        group_id: lesson.group_id,
        group_name: lesson.group_name,
        date: lesson.date.toISOString().split('T')[0],
        students: studentsData.rows
      }
    });

  } catch (error) {
    console.error('Dars studentlarini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Studentlar ro\'yxatini olishda xatolik yuz berdi'
    });
  }
};

// 4. Davomat belgilash/saqlash
exports.saveAttendance = async (req, res) => {
  const { lesson_id, attendance_data } = req.body;
  const { role, id: userId } = req.user;
  
  try {
    // Validatsiya
    if (!lesson_id || !Array.isArray(attendance_data) || attendance_data.length === 0) {
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

    // TEACHER faqat o'z guruhida davomat saqlaydi
    if (role === 'teacher') {
      const teacherCheck = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [group_id, userId]
      );
      
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Sizda bu guruhda davomat saqlash huquqi yo'q"
        });
      }
    }

    // Har bir attendance ma'lumotini validatsiya qilish
    const validStatuses = ['keldi', 'kelmadi', 'kechikdi'];
    for (const record of attendance_data) {
      if (!record.student_id || !validStatuses.includes(record.status)) {
        return res.status(400).json({
          success: false,
          message: "Har bir record uchun student_id va status ('keldi', 'kelmadi', 'kechikdi') majburiy"
        });
      }
    }

    // Transaction ichida attendance yozuvlarini yangilash
    await pool.query('BEGIN');
    
    try {
      let updated_count = 0;
      
      for (const record of attendance_data) {
        const result = await pool.query(
          `UPDATE attendance 
           SET status = $1, updated_at = CURRENT_TIMESTAMP
           WHERE lesson_id = $2 AND student_id = $3`,
          [record.status, lesson_id, record.student_id]
        );
        
        if (result.rowCount > 0) {
          updated_count++;
        }
      }
      
      await pool.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Davomat muvaffaqiyatli saqlandi',
        data: {
          lesson_id,
          updated_count
        }
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

// 5. Oylik davomat jadvalini ko'rish
exports.getMonthlyAttendance = async (req, res) => {
  const { group_id } = req.params;
  const { month } = req.query; // YYYY-MM format
  const { role, id: userId } = req.user;
  
  try {
    // TEACHER faqat o'z guruhini ko'ra oladi
    if (role === 'teacher') {
      const teacherCheck = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [group_id, userId]
      );
      
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Sizda bu guruhni ko'rish huquqi yo'q"
        });
      }
    }

    // Guruh mavjudligini tekshirish
    const groupCheck = await pool.query(
      'SELECT id, name FROM groups WHERE id = $1 AND status = $2',
      [group_id, 'active']
    );
    
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi yoki faol emas'
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