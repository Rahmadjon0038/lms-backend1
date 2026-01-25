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

    // Date formatini tekshirish (faqat YYYY-MM-DD qabul qilamiz, timezone muammosiz)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "Date noto'g'ri formatda (YYYY-MM-DD bo'lishi kerak)"
      });
    }
    
    console.log(`Frontend dan kelgan sana: ${date}`);

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

    // Yangi dars yaratish (sanani aniq formatda saqlash)
    const newLessonResult = await pool.query(
      'INSERT INTO lessons (group_id, date, created_by) VALUES ($1, $2::date, $3) RETURNING id, date',
      [group_id, date, userId]
    );
    const lesson_id = newLessonResult.rows[0].id;
    const savedDate = newLessonResult.rows[0].date;
    console.log(`Saqlangan sana: ${savedDate}`);

    // Guruhdagi barcha studentlar uchun attendance yaratish (haqiqiy status bilan)
    const studentsResult = await pool.query(
      `SELECT DISTINCT sg.student_id, sg.status as group_status
       FROM student_groups sg 
       WHERE sg.group_id = $1
         AND (
           sg.left_at IS NULL
           OR DATE_TRUNC('month', sg.left_at) = DATE_TRUNC('month', $2::date)
           OR DATE(sg.left_at) > $2
         )`,
      [group_id, date]
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
        // Faqat ruxsat etilgan statuslardan foydalanamiz
        const defaultStatus = 'kelmadi';
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
        requested_date: date,
        saved_date: savedDate,
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
      `SELECT l.id, l.group_id, TO_CHAR(l.date, 'YYYY-MM-DD') as date, g.name as group_name, g.teacher_id
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
          date: lesson.date // TO_CHAR dan YYYY-MM-DD formatda string
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
      
      // Faqat attendance jadvalidagi yozuv mavjud bo‘lsa, davomat belgilash mumkin
      const attendanceCheck = await pool.query(
        `SELECT id FROM attendance WHERE lesson_id = $1 AND student_id = $2`,
        [lesson.id, record.student_id]
      );
      if (attendanceCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: `Student ID ${record.student_id} uchun ushbu darsda attendance mavjud emas.`
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

    // Guruh mavjudligini tekshirish (teacher va subject ma'lumotlari bilan)
    const groupCheck = await pool.query(
      `SELECT g.id, g.name, g.schedule, 
              CONCAT(u.name, ' ', u.surname) as teacher_name,
              u.phone as teacher_phone,
              s.name as subject_name
       FROM groups g
       LEFT JOIN users u ON g.teacher_id = u.id
       LEFT JOIN subjects s ON g.subject_id = s.id
       WHERE g.id = $1 AND g.status = $2`,
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
    // Oy oxirgi kunini aniqlash
    const lastDay = new Date(Number(year), Number(monthNum), 0).getDate();
    const endDate = `${year}-${monthNum}-${String(lastDay).padStart(2, '0')}`;

    // Shu oydagi barcha darslar
    const lessons = await pool.query(
      `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') as date
       FROM lessons 
       WHERE group_id = $1 AND date >= $2::date AND date <= $3::date
       ORDER BY date ASC`,
      [group_id, startDate, endDate]
    );
    // lessonsArr ASC tartibda (eski darsdan yangi darsga)
    // TO_CHAR dan string formatda keladi
    const lessonsArr = lessons.rows.map(l => ({
      id: l.id,
      date: l.date // YYYY-MM-DD formatda string
    }));
    // attendance_grid: har bir student uchun darslar bo'yicha status
    // Avval barcha attendance yozuvlarini olish (student_groups bilan JOIN qilib haqiqiy status olish)
    const attendanceAll = await pool.query(
      `SELECT a.lesson_id, a.student_id, a.status, u.name, u.surname, 
              COALESCE(sg.status, a.group_status, 'unknown') as group_status,
              sg.left_at
       FROM attendance a
       JOIN users u ON a.student_id = u.id
       LEFT JOIN student_groups sg ON sg.student_id = a.student_id AND sg.group_id = $2
       WHERE a.lesson_id = ANY($1::int[])`,
      [lessonsArr.map(l => l.id), group_id]
    );

    // Faqat group_status = 'active' bo'lgan attendance yozuvlari (statistika uchun)
    const activeAttendanceRows = attendanceAll.rows.filter(row => row.group_status === 'active');

    // attendance_grid: BARCHA talabalar (active, finished, stopped) - user istagan
    const studentMap = new Map();
    attendanceAll.rows.forEach(row => {
      if (!studentMap.has(row.student_id)) {
        studentMap.set(row.student_id, {
          student_id: row.student_id,
          name: row.name,
          surname: row.surname,
          group_status: row.group_status, // active, finished, stopped
          group_status_description: row.group_status === 'active' ? 'Faol' : 
                                   row.group_status === 'finished' ? 'Bitirgan' : 
                                   row.group_status === 'stopped' ? 'To\'xtatgan' : 'Noma\'lum',
          left_at: row.left_at ? row.left_at.toISOString().split('T')[0] : null,
          attendance: {}
        });
      }
    });

    // Har bir attendance yozuvini studentga joylash
    // Har bir student uchun barcha dars sanalari bo‘yicha attendance obyektini to‘ldirish
    for (const student of studentMap.values()) {
      for (const lesson of lessonsArr) {
        const dateKey = lesson.date;
        // Shu student va shu dars uchun attendance yozuvi bormi? (barcha statuslar)
        const att = attendanceAll.rows.find(a => a.student_id === student.student_id && a.lesson_id === lesson.id);
        
        if (att) {
          // left_at sanasini tekshirish (faqat kun qismi)
          const leftDate = att.left_at ? att.left_at.toISOString().split('T')[0] : null;
          const lessonDate = lesson.date;
          
          // Agar student hozir active bo'lsa (left_at = null), hech qachon "toxtatgan/bitirgan" bermaslik
          if (student.group_status === 'active') {
            student.attendance[dateKey] = att.status; // Active student - haqiqiy davomat
          }
          // Agar student to'xtatgan/bitirgan bo'lsa va dars sanasi left_at dan keyinroq bo'lsa
          else if (leftDate && lessonDate > leftDate) {
            if (student.group_status === 'finished') {
              student.attendance[dateKey] = 'bitirgan'; // Bitirish sanasidan keyin
            } else if (student.group_status === 'stopped') {
              student.attendance[dateKey] = 'toxtatgan'; // To'xtatish sanasidan keyin
            } else {
              student.attendance[dateKey] = att.status; // Boshqa holatda
            }
          } else {
            // Left_at dan oldingi darslar yoki left_at yo'q bo'lsa - oddiy davomat
            student.attendance[dateKey] = att.status;
          }
        } else {
          student.attendance[dateKey] = null; // Attendance yo'q
        }
      }
    }

    const attendanceGrid = Array.from(studentMap.values()).sort((a, b) => {
      // Avval active, keyin finished, keyin stopped
      const statusOrder = { 'active': 1, 'finished': 2, 'stopped': 3 };
      const aOrder = statusOrder[a.group_status] || 4;
      const bOrder = statusOrder[b.group_status] || 4;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      // Bir xil status bo'lsa, ism bo'yicha tartiblash
      return a.name.localeCompare(b.name);
    });

    // lessonsArr teskari bo'lsa, attendance_grid ham darslar tartibiga mos bo'lishi uchun kerak bo'lsa, frontendga qulaylik uchun reverse qilinadi

    // Statistika: har bir dars uchun qatnashgan studentlar soni (faqat active studentlar bo'yicha)
    const stats = {
      group_name: group.name,
      month: month,
      total_lessons: lessonsArr.length,
      total_students_in_grid: attendanceGrid.length, // barcha studentlar (active + finished + stopped)
      total_active_students: activeAttendanceRows.length > 0 ? new Set(activeAttendanceRows.map(a => a.student_id)).size : 0, // faqat active
      lesson_dates: lessonsArr.map(l => l.date),
      lessons_stats: lessonsArr.map(lesson => {
        const count = activeAttendanceRows.filter(a => a.lesson_id === lesson.id).length;
        return {
          lesson_id: lesson.id,
          date: lesson.date,
          active_students: count // faqat active talabalar statistikasi
        };
      })
    };

    res.json({
      success: true,
      message: 'Oylik davomat jadvali muvaffaqiyatli olindi',
      data: {
        group: {
          id: group.id,
          name: group.name,
          schedule: group.schedule,
          teacher_name: group.teacher_name,
          teacher_phone: group.teacher_phone,
          subject_name: group.subject_name
        },
        lessons: lessonsArr.map(l => ({
          id: l.id,
          date: l.date
        })),
        attendance_grid: attendanceGrid,
        stats
      }
    });

  } catch (error) {
    console.error('Oylik davomat jadvalini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Oylik davomat jadvalini olishda xatolik yuz berdi',
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

    // Darslar ro'yxatini olish
    let lessonsQuery = `
      SELECT l.id, TO_CHAR(l.date, 'YYYY-MM-DD') as lesson_date, l.created_at
      FROM lessons l
      WHERE l.group_id = $1
    `;
    const params = [group_id];
    if (month) {
      lessonsQuery += ` AND l.date >= $2 AND l.date <= $3`;
      const [year, monthNum] = month.split('-');
      const startDate = `${month}-01`;
      // Oy oxirgi kunini aniqlash
      const lastDay = new Date(year, monthNum, 0).getDate();
      const endDate = `${month}-${lastDay}`;
      params.push(startDate, endDate);
    }
    lessonsQuery += ` ORDER BY l.date DESC`;
    const lessonsResult = await pool.query(lessonsQuery, params);
    const lessons = lessonsResult.rows;

    // Har bir dars uchun attendance statistikasi
    let lessonsStats = [];
    if (lessons.length > 0) {
      const lessonIds = lessons.map(l => l.id);
      const attendanceStatsResult = await pool.query(
        `SELECT 
            lesson_id,
            COUNT(*) as students_count,
            COUNT(CASE WHEN status = 'keldi' THEN 1 END) as present_count,
            COUNT(CASE WHEN status = 'kelmadi' THEN 1 END) as absent_count,
            COUNT(CASE WHEN status = 'kechikdi' THEN 1 END) as late_count
         FROM attendance
         WHERE lesson_id = ANY($1::int[])
           AND group_status = 'active'
         GROUP BY lesson_id`,
        [lessonIds]
      );
      const statsMap = new Map();
      attendanceStatsResult.rows.forEach(row => {
        statsMap.set(parseInt(row.lesson_id), {
          students_count: parseInt(row.students_count),
          present_count: parseInt(row.present_count),
          absent_count: parseInt(row.absent_count),
          late_count: parseInt(row.late_count)
        });
      });
      lessonsStats = lessons.map(lesson => ({
        ...lesson,
        ...statsMap.get(lesson.id) || {
          students_count: 0,
          present_count: 0,
          absent_count: 0,
          late_count: 0
        }
      }));
    }

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
        lessons: lessonsStats
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