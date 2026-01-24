const pool = require('../config/db');

// 1. ATTENDANCE UCHUN GURUHLAR RO'YXATI
exports.getGroupsForAttendance = async (req, res) => {
  const { role, id: userId } = req.user;
  const { teacher_id, subject_id } = req.query;
  
  try {
    let query = `
      SELECT 
        g.id,
        g.name,
        g.unique_code,
        s.name as subject_name,
        COALESCE(CONCAT(t.name, ' ', t.surname), 'O''qituvchi yo''q') as teacher_name,
        COUNT(sg.student_id) as students_count,
        g.class_start_date,
        g.schedule,
        r.room_number
      FROM groups g
      LEFT JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN users t ON g.teacher_id = t.id
      LEFT JOIN student_groups sg ON g.id = sg.group_id
      LEFT JOIN rooms r ON g.room_id = r.id
      WHERE g.status = 'active' AND g.class_status = 'started'
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // TEACHER faqat o'z guruhlarini ko'radi
    if (role === 'teacher') {
      query += ` AND g.teacher_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }
    
    // Teacher ID bo'yicha filter (Admin uchun)
    if (teacher_id && role === 'admin') {
      query += ` AND g.teacher_id = $${paramIndex}`;
      params.push(teacher_id);
      paramIndex++;
    }
    
    // Subject ID bo'yicha filter
    if (subject_id) {
      query += ` AND g.subject_id = $${paramIndex}`;
      params.push(subject_id);
      paramIndex++;
    }
    
    query += ' GROUP BY g.id, g.name, g.unique_code, s.name, t.name, t.surname, g.class_start_date, g.schedule, r.room_number ORDER BY g.name';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      message: 'Guruhlar muvaffaqiyatli olindi',
      data: result.rows
    });
    
  } catch (error) {
    console.error('Guruhlarni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Guruhlarni olishda xatolik yuz berdi',
      error: error.message
    });
  }
};

// 2. DARS YARATISH (Ma'lum oy va kun uchun)
exports.createLesson = async (req, res) => {
  const { group_id, date } = req.body; // date: "2026-01-24"
  const { role, id: userId } = req.user;
  
  try {
    if (!group_id || !date) {
      return res.status(400).json({
        success: false,
        message: 'group_id va date majburiy'
      });
    }

    // Date formatini tekshirish
    const lessonDate = new Date(date);
    if (isNaN(lessonDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Date noto\'g\'ri formatda (YYYY-MM-DD bo\'lishi kerak)'
      });
    }

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
      'SELECT id, name FROM groups WHERE id = $1 AND status = $2 AND class_status = $3',
      [group_id, 'active', 'started']
    );
    
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi yoki darslar boshlanmagan'
      });
    }

    // Shu sana uchun dars mavjudligini tekshirish
    const existingLesson = await pool.query(
      'SELECT id FROM lessons WHERE group_id = $1 AND date = $2',
      [group_id, date]
    );

    if (existingLesson.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Shu sana uchun dars allaqachon yaratilgan',
        lesson_id: existingLesson.rows[0].id
      });
    }

    // Yangi dars yaratish
    const newLessonResult = await pool.query(
      'INSERT INTO lessons (group_id, date, created_by) VALUES ($1, $2, $3) RETURNING id',
      [group_id, date, userId]
    );
    const lesson_id = newLessonResult.rows[0].id;

    // Guruhdagi barcha studentlar uchun attendance yaratish
    const studentsResult = await pool.query(
      `SELECT DISTINCT sg.student_id, sg.status as group_status
       FROM student_groups sg 
       WHERE sg.group_id = $1`,
      [group_id]
    );

    if (studentsResult.rows.length > 0) {
      // attendance table-ga group_status ustuni qo'shish
      try {
        await pool.query(`
          ALTER TABLE attendance ADD COLUMN IF NOT EXISTS group_status VARCHAR(20) DEFAULT 'active'
        `);
      } catch (alterError) {
        // Ustun allaqachon mavjud
      }

      const attendanceValues = studentsResult.rows.map((_, index) => {
        const baseIndex = index * 4;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`;
      }).join(', ');

      const attendanceParams = [];
      studentsResult.rows.forEach(student => {
        const defaultStatus = student.group_status === 'active' ? 'kelmadi' : 'inactive';
        attendanceParams.push(lesson_id, student.student_id, defaultStatus, student.group_status);
      });

      await pool.query(
        `INSERT INTO attendance (lesson_id, student_id, status, group_status) VALUES ${attendanceValues}`,
        attendanceParams
      );
    }

    res.json({
      success: true,
      message: 'Dars muvaffaqiyatli yaratildi',
      data: {
        lesson_id,
        group_id: parseInt(group_id),
        date: date,
        students_count: studentsResult.rows.length
      }
    });

  } catch (error) {
    console.error('Dars yaratishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Dars yaratishda xatolik yuz berdi',
      error: error.message
    });
  }
};

// 3. DARS UCHUN STUDENTLAR RO'YXATI
exports.getLessonStudents = async (req, res) => {
  const { lesson_id } = req.params;
  const { role, id: userId } = req.user;
  
  try {
    // Dars ma'lumotlarini olish
    const lessonCheck = await pool.query(
      `SELECT l.id, l.group_id, l.date, g.name as group_name, g.teacher_id
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

    // TEACHER faqat o'z darsini ko'ra oladi
    if (role === 'teacher' && lesson.teacher_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Sizda bu darsni ko'rish huquqi yo'q"
      });
    }

    // Studentlar va ularning davomat holatini olish
    const studentsData = await pool.query(
      `SELECT 
         u.id as student_id,
         u.name,
         u.surname,
         u.phone,
         a.status as attendance_status,
         COALESCE(a.group_status, sg.status, 'unknown') as group_status,
         CASE 
           WHEN COALESCE(a.group_status, sg.status) = 'active' THEN 'Faol'
           WHEN COALESCE(a.group_status, sg.status) = 'stopped' THEN 'Nofaol' 
           WHEN COALESCE(a.group_status, sg.status) = 'finished' THEN 'Bitirgan'
           ELSE 'Nomalom'
         END as group_status_description,
         -- Davomat ozgartirish mumkinmi?
         CASE 
           WHEN COALESCE(a.group_status, sg.status) = 'active' THEN true
           ELSE false
         END as can_mark_attendance
       FROM attendance a
       JOIN users u ON a.student_id = u.id
       LEFT JOIN student_groups sg ON sg.student_id = u.id AND sg.group_id = $2
       WHERE a.lesson_id = $1
       ORDER BY 
         CASE WHEN COALESCE(a.group_status, sg.status) = 'active' THEN 1 ELSE 2 END,
         u.name, u.surname`,
      [lesson_id, lesson.group_id]
    );

    res.json({
      success: true,
      message: 'Studentlar royhati muvaffaqiyatli olindi',
      data: {
        lesson: {
          id: lesson.id,
          group_id: lesson.group_id,
          group_name: lesson.group_name,
          date: lesson.date.toISOString().split('T')[0]
        },
        students: studentsData.rows
      }
    });

  } catch (error) {
    console.error('Studentlar royhati olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Studentlar royhati olishda xatolik yuz berdi',
      error: error.message
    });
  }
};

// 4. DAVOMAT BELGILASH
exports.markAttendance = async (req, res) => {
  const { lesson_id, attendance_data } = req.body;
  const { role, id: userId } = req.user;
  
  try {
    if (!lesson_id || !Array.isArray(attendance_data) || attendance_data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'lesson_id va attendance_data (array) majburiy'
      });
    }

    // Dars mavjudligini va ruxsatni tekshirish
    const lessonCheck = await pool.query(
      `SELECT l.id, l.group_id, g.teacher_id 
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

    // TEACHER faqat o'z darsida davomat belgilaydi
    if (role === 'teacher' && lesson.teacher_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Sizda bu darsda davomat belgilash huquqi yo'q"
      });
    }

    // Davomat ma'lumotlarini validatsiya qilish
    const validStatuses = ['keldi', 'kelmadi', 'kechikdi'];
    for (const record of attendance_data) {
      if (!record.student_id || !validStatuses.includes(record.status)) {
        return res.status(400).json({
          success: false,
          message: "Har bir record uchun student_id va status ('keldi', 'kelmadi', 'kechikdi') majburiy"
        });
      }
      
      // Faqat active studentlar uchun davomat o'zgartirish mumkin
      const studentStatusCheck = await pool.query(
        `SELECT sg.status as group_status 
         FROM student_groups sg 
         WHERE sg.student_id = $1 AND sg.group_id = $2`,
        [record.student_id, lesson.group_id]
      );
      
      if (studentStatusCheck.rows.length > 0 && studentStatusCheck.rows[0].group_status !== 'active') {
        return res.status(400).json({
          success: false,
          message: `Student ID ${record.student_id} faol emas. Faqat faol studentlar uchun davomat belgilash mumkin.`
        });
      }
    }

    // Transaction ichida davomat yangilash
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
          updated_count,
          total_records: attendance_data.length
        }
      });
      
    } catch (updateError) {
      await pool.query('ROLLBACK');
      throw updateError;
    }

  } catch (error) {
    console.error('Davomat belgilashda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Davomat belgilashda xatolik yuz berdi',
      error: error.message
    });
  }
};

// 5. OYLIK DAVOMAT JADVALI
exports.getMonthlyAttendance = async (req, res) => {
  const { group_id } = req.params;
  const { month } = req.query; // "2026-01" format
  const { role, id: userId } = req.user;
  
  try {
    // Month format tekshiruvi
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'month parametri YYYY-MM formatida bolishi kerak (masalan: 2026-01)'
      });
    }

    // TEACHER faqat o'z guruhini ko'ra oladi
    if (role === 'teacher') {
      const teacherCheck = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [group_id, userId]
      );
      
      if (teacherCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Sizda bu guruhni korish huquqi yoq"
        });
      }
    }

    // Guruh mavjudligini tekshirish
    const groupCheck = await pool.query(
      'SELECT id, name, schedule FROM groups WHERE id = $1 AND status = $2',
      [group_id, 'active']
    );
    
    if (groupCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi yoki faol emas'
      });
    }

    const group = groupCheck.rows[0];
    const [year, monthNum] = month.split('-');
    const startDate = `${year}-${monthNum}-01`;
    const endDate = `${year}-${monthNum}-${new Date(year, monthNum, 0).getDate()}`;

    // Shu oydagi barcha darslar
    const lessons = await pool.query(
      `SELECT id, date 
       FROM lessons 
       WHERE group_id = $1 AND date >= $2 AND date <= $3
       ORDER BY date`,
      [group_id, startDate, endDate]
    );

    // Guruhdagi barcha studentlar
    const students = await pool.query(
      `SELECT 
         u.id,
         u.name,
         u.surname,
         sg.status as group_status,
         CASE 
           WHEN sg.status = 'active' THEN 'Faol'
           WHEN sg.status = 'stopped' THEN 'Nofaol'
           WHEN sg.status = 'finished' THEN 'Bitirgan'
           ELSE 'Belgilanmagan'
         END as group_status_description
       FROM student_groups sg
       JOIN users u ON sg.student_id = u.id
       WHERE sg.group_id = $1
       ORDER BY sg.status = 'active' DESC, u.name, u.surname`,
      [group_id]
    );

    // Har bir student uchun davomat ma'lumotlari
    const attendanceGrid = [];
    for (const student of students.rows) {
      const studentAttendance = {
        student_id: student.id,
        name: student.name,
        surname: student.surname,
        group_status: student.group_status,
        group_status_description: student.group_status_description,
        attendance: {}
      };

      for (const lesson of lessons.rows) {
        const attendanceResult = await pool.query(
          `SELECT status 
           FROM attendance 
           WHERE lesson_id = $1 AND student_id = $2`,
          [lesson.id, student.id]
        );

        const dateKey = lesson.date.toISOString().split('T')[0];
        studentAttendance.attendance[dateKey] = attendanceResult.rows.length > 0 
          ? attendanceResult.rows[0].status 
          : null;
      }

      attendanceGrid.push(studentAttendance);
    }

    // Statistika
    const stats = {
      group_name: group.name,
      month: month,
      total_lessons: lessons.rows.length,
      total_students: students.rows.length,
      active_students: students.rows.filter(s => s.group_status === 'active').length,
      lesson_dates: lessons.rows.map(l => l.date.toISOString().split('T')[0])
    };

    res.json({
      success: true,
      message: 'Oylik davomat jadvali muvaffaqiyatli olindi',
      data: {
        stats,
        attendance_grid: attendanceGrid
      }
    });

  } catch (error) {
    console.error('Oylik davomat jadvalini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Davomat jadvalini olishda xatolik yuz berdi',
      error: error.message
    });
  }
};

// Guruh uchun yaratilgan darslar ro'yxati
const getGroupLessons = async (req, res) => {
  try {
    const { group_id } = req.params;
    const { month } = req.query; // 2026-01 format

    // Foydalanuvchi huquqlarini tekshirish
    if (req.user.role === 'teacher') {
      const checkTeacher = await pool.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [group_id, req.user.id]
      );
      
      if (checkTeacher.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Bu guruhda dars yaratish huquqingiz yo\'q'
        });
      }
    }

    let query = `
      SELECT 
        l.id,
        l.date as lesson_date,
        l.created_at,
        COUNT(u.id) as students_count,
        COUNT(CASE WHEN a.status = 'keldi' THEN 1 END) as present_count,
        COUNT(CASE WHEN a.status = 'kelmadi' THEN 1 END) as absent_count,
        COUNT(CASE WHEN a.status = 'kechikdi' THEN 1 END) as late_count
      FROM lessons l
      LEFT JOIN student_groups sg ON sg.group_id = l.group_id AND sg.status = 'active'
      LEFT JOIN users u ON u.id = sg.student_id AND u.role = 'student'
      LEFT JOIN attendance a ON a.lesson_id = l.id AND a.student_id = u.id
      WHERE l.group_id = $1
    `;

    const params = [group_id];

    if (month) {
      query += ` AND l.date >= $2 AND l.date < $3`;
      const startDate = `${month}-01`;
      const endDate = `${month}-31`;
      params.push(startDate, endDate);
    }

    query += `
      GROUP BY l.id, l.date, l.created_at
      ORDER BY l.date DESC
    `;

    const result = await pool.query(query, params);

    // Guruh ma'lumotlarini olish
    const groupInfo = await pool.query(`
      SELECT 
        g.id,
        g.name,
        COALESCE(CONCAT(u.name, ' ', u.surname), 'O''qituvchi yo''q') as teacher_name
      FROM groups g
      LEFT JOIN users u ON u.id = g.teacher_id
      WHERE g.id = $1
    `, [group_id]);

    if (groupInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    res.json({
      success: true,
      message: 'Darslar ro\'yxati muvaffaqiyatli olindi',
      data: {
        group_info: groupInfo.rows[0],
        lessons: result.rows.map(lesson => ({
          ...lesson,
          lesson_date: lesson.lesson_date,
          students_count: parseInt(lesson.students_count),
          present_count: parseInt(lesson.present_count),
          absent_count: parseInt(lesson.absent_count),
          late_count: parseInt(lesson.late_count)
        }))
      }
    });

  } catch (error) {
    console.error('Darslar ro\'yxatini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi'
    });
  }
};

// Darsni o'chirish
const deleteLesson = async (req, res) => {
  try {
    const { lesson_id } = req.params;
    const { role, id: userId } = req.user;

    // Dars mavjudligini va huquqlarni tekshirish
    const lessonCheck = await pool.query(
      `SELECT l.id, l.group_id, g.teacher_id 
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

    // TEACHER faqat o'z darsini o'chiradi
    if (role === 'teacher' && lesson.teacher_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Sizda bu darsni o'chirish huquqi yo'q"
      });
    }

    // Transaction ichida darsni va attendance yozuvlarini o'chirish
    await pool.query('BEGIN');

    try {
      // Avval attendance yozuvlarini o'chirish
      await pool.query(
        'DELETE FROM attendance WHERE lesson_id = $1',
        [lesson_id]
      );

      // Keyin darsni o'chirish
      await pool.query(
        'DELETE FROM lessons WHERE id = $1',
        [lesson_id]
      );

      await pool.query('COMMIT');

      res.json({
        success: true,
        message: "Dars muvaffaqiyatli o'chirildi",
        lesson_id: parseInt(lesson_id)
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error("Darsni o'chirishda xatolik:", error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi'
    });
  }
};

module.exports = {
  getGroupsForAttendance: exports.getGroupsForAttendance,
  createLesson: exports.createLesson,
  getLessonStudents: exports.getLessonStudents,
  markAttendance: exports.markAttendance,
  getMonthlyAttendance: exports.getMonthlyAttendance,
  getGroupLessons,
  deleteLesson
};