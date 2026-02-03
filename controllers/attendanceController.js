const pool = require('../config/db');

/**
 * YANGI ATTENDANCE TIZIMI
 * - Har bir attendance yozuvi oylik mustaqil monthly_status ga ega
 * - Student ning har oy uchun alohida status
 * - Eski group_status ni ishlatmaymiz
 */

// ============================================================================
// 1. GURUHLAR RO'YXATI (Attendance uchun)
// ============================================================================
exports.getGroupsForAttendance = async (req, res) => {
  const { role, id: userId } = req.user;
  const { teacher_id, subject_id, status_filter = 'all' } = req.query;
  
  try {
    let query = `
      SELECT 
        g.id,
        g.name,
        g.status,
        g.class_status,
        s.name as subject_name,
        COALESCE(CONCAT(t.name, ' ', t.surname), 'O''qituvchi yo''q') as teacher_name,
        COUNT(DISTINCT sg.student_id) as students_count,
        g.class_start_date,
        g.schedule,
        r.room_number
      FROM groups g
      LEFT JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN users t ON g.teacher_id = t.id
      LEFT JOIN student_groups sg ON g.id = sg.group_id
      LEFT JOIN rooms r ON g.room_id = r.id
      WHERE g.class_status = 'started'
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Status filter
    if (status_filter === 'active') {
      query += ` AND g.status = 'active'`;
    } else if (status_filter === 'blocked') {
      query += ` AND g.status = 'blocked'`;
    } else {
      query += ` AND g.status IN ('active', 'blocked')`;
    }
    
    // Teacher faqat o'z guruhlarini ko'radi
    if (role === 'teacher') {
      query += ` AND g.teacher_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }
    
    // Admin uchun teacher filter
    if (teacher_id && role === 'admin') {
      query += ` AND g.teacher_id = $${paramIndex}`;
      params.push(teacher_id);
      paramIndex++;
    }
    
    // Subject filter
    if (subject_id) {
      query += ` AND g.subject_id = $${paramIndex}`;
      params.push(subject_id);
      paramIndex++;
    }
    
    query += ` GROUP BY g.id, g.name, g.status, g.class_status, s.name, t.name, t.surname, 
               g.class_start_date, g.schedule, r.room_number 
               ORDER BY g.name`;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Guruhlarni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 2. DARS YARATISH (OXIRGI OY STATUSINI TEKSHIRISH BILAN)
// ============================================================================
exports.createLesson = async (req, res) => {
  const { group_id, date } = req.body;
  const { id: userId } = req.user;
  
  try {
    if (!group_id || !date) {
      return res.status(400).json({
        success: false,
        message: 'group_id va date majburiy'
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'date YYYY-MM-DD formatida bo\'lishi kerak'
      });
    }

    // Shu sana uchun dars borligini tekshirish
    const existingLesson = await pool.query(
      'SELECT id FROM lessons WHERE group_id = $1 AND date = $2',
      [group_id, date]
    );

    if (existingLesson.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Shu sana uchun dars allaqachon yaratilgan'
      });
    }

    // Yangi dars yaratish
    const newLesson = await pool.query(
      'INSERT INTO lessons (group_id, date, created_by) VALUES ($1, $2::date, $3) RETURNING id, date',
      [group_id, date, userId]
    );
    const lesson_id = newLesson.rows[0].id;
    const month = date.substring(0, 7); // YYYY-MM

    // Guruhdagi barcha studentlarni olish (student_groups.status ga qaramasdan)
    const students = await pool.query(
      `SELECT student_id 
       FROM student_groups 
       WHERE group_id = $1`,
      [group_id]
    );

    // Har bir student uchun attendance yaratish
    if (students.rows.length > 0) {
      for (const student of students.rows) {
        // Oxirgi oydagi monthly_status ni tekshirish
        const lastMonthStatus = await pool.query(
          `SELECT monthly_status 
           FROM attendance 
           WHERE student_id = $1 AND group_id = $2 
           ORDER BY created_at DESC 
           LIMIT 1`,
          [student.student_id, group_id]
        );

        // Agar oxirgi oy stopped yoki finished bo'lsa, yangi oyda ham o'sha status bilan yaratish
        // Agar ma'lumot bo'lmasa yoki active bo'lsa, default 'active' bo'ladi
        let initialStatus = 'active';
        if (lastMonthStatus.rows.length > 0) {
          const lastStatus = lastMonthStatus.rows[0].monthly_status;
          if (lastStatus === 'stopped' || lastStatus === 'finished') {
            initialStatus = lastStatus;
          }
        }

        await pool.query(
          `INSERT INTO attendance (lesson_id, student_id, group_id, month, status, monthly_status) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [lesson_id, student.student_id, group_id, month, 'kelmadi', initialStatus]
        );
      }
    }

    res.json({
      success: true,
      message: 'Dars yaratildi',
      data: {
        lesson_id,
        group_id: parseInt(group_id),
        date: newLesson.rows[0].date,
        students_count: students.rows.length
      }
    });

  } catch (error) {
    console.error('Dars yaratishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 3. DARS UCHUN STUDENTLAR RO'YXATI
// ============================================================================
exports.getLessonStudents = async (req, res) => {
  const { lesson_id } = req.params;
  
  try {
    // Dars ma'lumotlarini olish
    const lessonInfo = await pool.query(
      `SELECT group_id, TO_CHAR(date, 'YYYY-MM') as month FROM lessons WHERE id = $1`,
      [lesson_id]
    );

    if (lessonInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dars topilmadi'
      });
    }

    const { group_id, month } = lessonInfo.rows[0];

    // Guruhdagi barcha talabalarni olish (qo'shilgan sana bilan)
    const allStudents = await pool.query(
      `SELECT student_id, DATE(joined_at) as joined_date FROM student_groups WHERE group_id = $1`,
      [group_id]
    );

    // Dars sanasini olish
    const lessonDate = await pool.query(
      `SELECT date FROM lessons WHERE id = $1`,
      [lesson_id]
    );
    const currentLessonDate = lessonDate.rows[0].date;

    // Har bir talaba uchun attendance yozuvi borligini tekshirish
    for (const student of allStudents.rows) {
      // Agar talaba dars sanasidan KEYIN qo'shilgan bo'lsa, o'tkazib yuboramiz
      if (student.joined_date > currentLessonDate) {
        console.log(`⏭️ Talaba ${student.student_id} bu darsdan keyin qo'shilgan (${student.joined_date} > ${currentLessonDate}), o'tkazib yuborildi`);
        continue;
      }

      const existingAttendance = await pool.query(
        `SELECT id FROM attendance WHERE lesson_id = $1 AND student_id = $2`,
        [lesson_id, student.student_id]
      );

      if (existingAttendance.rows.length === 0) {
        // Attendance yo'q - yaratish kerak
        console.log(`📝 Yangi attendance yaratilmoqda: student_id=${student.student_id}, lesson_id=${lesson_id}`);
        
        // Oxirgi oydagi statusni tekshirish
        const lastMonthStatus = await pool.query(
          `SELECT monthly_status 
           FROM attendance 
           WHERE student_id = $1 AND group_id = $2 
           ORDER BY created_at DESC 
           LIMIT 1`,
          [student.student_id, group_id]
        );

        console.log(`🔍 Oxirgi oy status:`, lastMonthStatus.rows);

        let initialStatus = 'active';
        if (lastMonthStatus.rows.length > 0) {
          const lastStatus = lastMonthStatus.rows[0].monthly_status;
          console.log(`📊 Topilgan status: ${lastStatus}`);
          if (lastStatus === 'stopped' || lastStatus === 'finished') {
            initialStatus = lastStatus;
          }
        } else {
          console.log(`✅ Oxirgi status topilmadi - yangi talaba, active qilamiz`);
        }

        console.log(`💾 Yaratilayotgan attendance: monthly_status=${initialStatus}`);

        // Attendance yaratish
        await pool.query(
          `INSERT INTO attendance (lesson_id, student_id, group_id, month, status, monthly_status) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [lesson_id, student.student_id, group_id, month, 'kelmadi', initialStatus]
        );
      }
    }

    // Barcha talabalarni olish (faqat dars sanasidan OLDIN yoki O'SHA KUNDA qo'shilganlar)
    const students = await pool.query(
      `SELECT 
         a.id as attendance_id,
         a.student_id,
         u.name || ' ' || u.surname as student_name,
         u.phone,
         a.status,
         a.monthly_status,
         CASE 
           WHEN a.monthly_status = 'active' THEN 'Faol'
           WHEN a.monthly_status = 'stopped' THEN 'Toxtatgan'
           WHEN a.monthly_status = 'finished' THEN 'Bitirgan'
           ELSE 'Nomalum'
         END as monthly_status_description,
         CASE WHEN a.monthly_status = 'active' THEN true ELSE false END as can_mark
       FROM attendance a
       JOIN users u ON a.student_id = u.id
       JOIN student_groups sg ON a.student_id = sg.student_id AND a.group_id = sg.group_id
       WHERE a.lesson_id = $1 AND DATE(sg.joined_at) <= $2
       ORDER BY a.monthly_status, u.name`,
      [lesson_id, currentLessonDate]
    );

    res.json({
      success: true,
      data: students.rows
    });

  } catch (error) {
    console.error('Studentlarni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi'
    });
  }
};

// ============================================================================
// 4. DAVOMAT BELGILASH
// ============================================================================
exports.markAttendance = async (req, res) => {
  const { lesson_id } = req.params;
  const { attendance_records } = req.body; // [{attendance_id, status}]
  
  try {
    if (!Array.isArray(attendance_records) || attendance_records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'attendance_records majburiy'
      });
    }

    const allowedStatuses = ['keldi', 'kelmadi', 'kechikdi'];
    let updatedCount = 0;
    
    for (const record of attendance_records) {
      if (!record.attendance_id) {
        return res.status(400).json({
          success: false,
          message: 'attendance_id majburiy'
        });
      }
      
      if (!allowedStatuses.includes(record.status)) {
        return res.status(400).json({
          success: false,
          message: `Status faqat: ${allowedStatuses.join(', ')}`
        });
      }

      // XAVFSIZLIK: lesson_id ham tekshiriladi + faqat active talabalar
      const result = await pool.query(
        `UPDATE attendance 
         SET status = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND lesson_id = $3 AND monthly_status = 'active'
         RETURNING student_id`,
        [record.status, record.attendance_id, lesson_id]
      );

      if (result.rowCount === 0) {
        // Tekshirish: to'xtatilgan yoki topilmagan?
        const checkAttendance = await pool.query(
          `SELECT id, student_id, monthly_status, status FROM attendance WHERE id = $1 AND lesson_id = $2`,
          [record.attendance_id, lesson_id]
        );
        
        if (checkAttendance.rows.length > 0) {
          const att = checkAttendance.rows[0];
          
          if (att.monthly_status !== 'active') {
            // To'xtatilgan talaba - xato bermasdan o'tkazib yuborish
            console.log(`⏭️ O'tkazib yuborildi: attendance_id=${record.attendance_id}, monthly_status=${att.monthly_status}`);
            continue; // Keyingisiga o'tish
          }
        } else {
          console.log(`⚠️ Attendance topilmadi: attendance_id=${record.attendance_id}`);
          return res.status(404).json({
            success: false,
            message: 'Attendance topilmadi',
            attendance_id: record.attendance_id
          });
        }
      } else {
        updatedCount += result.rowCount;
      }
    }

    res.json({
      success: true,
      message: 'Davomat belgilandi',
      updated_count: updatedCount
    });

  } catch (error) {
    console.error('Davomat belgilashda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi'
    });
  }
};

// ============================================================================
// 5. OYLIK DAVOMAT (Guruh bo'yicha)
// ============================================================================
exports.getMonthlyAttendance = async (req, res) => {
  const { group_id } = req.params;
  const { month } = req.query; // YYYY-MM
  
  try {
    const selectedMonth = month || new Date().toISOString().slice(0, 7);

    // Oyning barcha darslarini olish
    const lessons = await pool.query(
      `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') as date, TO_CHAR(date, 'DD') as day
       FROM lessons 
       WHERE group_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2
       ORDER BY date`,
      [group_id, selectedMonth]
    );

    // Shu oydagi barcha studentlar va ularning attendance yozuvlari
    const attendance = await pool.query(
      `SELECT 
         a.student_id,
         u.name || ' ' || u.surname as student_name,
         u.phone,
         a.monthly_status,
         json_agg(
           json_build_object(
             'lesson_id', l.id,
             'date', TO_CHAR(l.date, 'YYYY-MM-DD'),
             'status', a.status
           ) ORDER BY l.date
         ) as attendance_records
       FROM attendance a
       JOIN users u ON a.student_id = u.id
       JOIN lessons l ON a.lesson_id = l.id
       WHERE a.group_id = $1 AND a.month = $2
       GROUP BY a.student_id, u.name, u.surname, u.phone, a.monthly_status
       ORDER BY a.monthly_status, u.name`,
      [group_id, selectedMonth]
    );

    res.json({
      success: true,
      data: {
        month: selectedMonth,
        lessons: lessons.rows,
        students: attendance.rows
      }
    });

  } catch (error) {
    console.error('Oylik davomatni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi'
    });
  }
};

// ============================================================================
// 6. STUDENT OYLIK STATUSINI O'ZGARTIRISH (3 ta variant!)
// ============================================================================
// Variant 1: { month: "2026-02" } - Faqat bitta oy
// Variant 2: { months: ["2026-02", "2026-03", "2026-04"] } - Bir necha oylar
// Variant 3: { from_month: "2026-02" } - Shu oydan keyingi barcha oylar
exports.updateStudentMonthlyStatus = async (req, res) => {
  const { student_id, group_id, monthly_status, month, months, from_month } = req.body;
  
  try {
    if (!student_id || !group_id || !monthly_status) {
      return res.status(400).json({
        success: false,
        message: 'student_id, group_id, monthly_status majburiy'
      });
    }

    const allowedStatuses = ['active', 'stopped', 'finished'];
    if (!allowedStatuses.includes(monthly_status)) {
      return res.status(400).json({
        success: false,
        message: `monthly_status faqat: ${allowedStatuses.join(', ')}`
      });
    }

    let query;
    let params;
    let mode;

    if (from_month) {
      // Variant 3: Shu oydan keyingi barcha oylar
      mode = 'from_month_onwards';
      query = `UPDATE attendance 
               SET monthly_status = $1, updated_at = CURRENT_TIMESTAMP
               WHERE student_id = $2 AND group_id = $3 AND month >= $4
               RETURNING id, month, monthly_status`;
      params = [monthly_status, student_id, group_id, from_month];
    } else if (months && Array.isArray(months) && months.length > 0) {
      // Variant 2: Bir necha oylar
      mode = 'multiple_months';
      const monthPlaceholders = months.map((_, i) => `$${i + 4}`).join(', ');
      query = `UPDATE attendance 
               SET monthly_status = $1, updated_at = CURRENT_TIMESTAMP
               WHERE student_id = $2 AND group_id = $3 AND month IN (${monthPlaceholders})
               RETURNING id, month, monthly_status`;
      params = [monthly_status, student_id, group_id, ...months];
    } else if (month) {
      // Variant 1: Faqat bitta oy
      mode = 'single_month';
      query = `UPDATE attendance 
               SET monthly_status = $1, updated_at = CURRENT_TIMESTAMP
               WHERE student_id = $2 AND group_id = $3 AND month = $4
               RETURNING id, month, monthly_status`;
      params = [monthly_status, student_id, group_id, month];
    } else {
      return res.status(400).json({
        success: false,
        message: 'month, months yoki from_month dan bittasini yuboring'
      });
    }

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hech qanday attendance topilmadi'
      });
    }

    // Yangilangan oylarning xulasasi
    const summary = await pool.query(
      `SELECT month, COUNT(*) as lesson_count
       FROM attendance 
       WHERE student_id = $1 AND group_id = $2 AND monthly_status = $3
       GROUP BY month
       ORDER BY month`,
      [student_id, group_id, monthly_status]
    );

    res.json({
      success: true,
      message: `${result.rowCount} ta yozuv yangilandi`,
      mode,
      data: {
        student_id,
        group_id,
        monthly_status,
        updated_count: result.rowCount,
        ...(month && { month }),
        ...(months && { months }),
        ...(from_month && { from_month })
      },
      affected_months: summary.rows
    });

  } catch (error) {
    console.error('Statusni yangilashda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 7. GURUHNING BARCHA DARSLARINI KO'RISH
// ============================================================================
exports.getGroupLessons = async (req, res) => {
  const { group_id } = req.params;
  const { month } = req.query;
  
  try {
    const selectedMonth = month || new Date().toISOString().slice(0, 7);

    const lessons = await pool.query(
      `SELECT 
         l.id,
         TO_CHAR(l.date, 'YYYY-MM-DD') as date,
         TO_CHAR(l.date, 'DD.MM.YYYY') as formatted_date,
         COUNT(CASE WHEN a.monthly_status = 'active' OR a.status IN ('keldi', 'kechikdi') THEN 1 END) as total_students,
         COUNT(CASE WHEN a.status = 'keldi' THEN 1 END) as present_count,
         COUNT(CASE WHEN a.status = 'kelmadi' AND a.monthly_status = 'active' THEN 1 END) as absent_count,
         COUNT(CASE WHEN a.status = 'kechikdi' THEN 1 END) as late_count
       FROM lessons l
       LEFT JOIN attendance a ON l.id = a.lesson_id
       WHERE l.group_id = $1 AND TO_CHAR(l.date, 'YYYY-MM') = $2
       GROUP BY l.id, l.date
       ORDER BY l.date DESC`,
      [group_id, selectedMonth]
    );

    res.json({
      success: true,
      data: lessons.rows
    });

  } catch (error) {
    console.error('Darslarni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi'
    });
  }
};

// ============================================================================
// 8. DARSNI O'CHIRISH
// ============================================================================
exports.deleteLesson = async (req, res) => {
  const { lesson_id } = req.params;
  
  try {
    await pool.query('BEGIN');

    // Attendance yozuvlarini o'chirish
    await pool.query('DELETE FROM attendance WHERE lesson_id = $1', [lesson_id]);

    // Darsni o'chirish
    const result = await pool.query('DELETE FROM lessons WHERE id = $1 RETURNING id', [lesson_id]);

    if (result.rowCount === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Dars topilmadi'
      });
    }

    await pool.query('COMMIT');

    res.json({
      success: true,
      message: 'Dars o\'chirildi'
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Darsni o\'chirishda xatolik:', error);
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
  updateStudentMonthlyStatus: exports.updateStudentMonthlyStatus,
  getGroupLessons: exports.getGroupLessons,
  deleteLesson: exports.deleteLesson
};
