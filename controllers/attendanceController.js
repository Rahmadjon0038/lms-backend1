const pool = require('../config/db');
const XLSX = require('xlsx');

/**
 * YANGI ATTENDANCE TIZIMI
 * - Har bir attendance yozuvi oylik mustaqil monthly_status ga ega
 * - Student ning har oy uchun alohida status
 * - Eski group_status ni ishlatmaymiz
 */

const WEEKDAY_MAP = {
  monday: 1,
  dushanba: 1,
  mon: 1,
  tuesday: 2,
  seshanba: 2,
  tue: 2,
  wednesday: 3,
  chorshanba: 3,
  wed: 3,
  thursday: 4,
  payshanba: 4,
  thu: 4,
  friday: 5,
  juma: 5,
  fri: 5,
  saturday: 6,
  shanba: 6,
  sat: 6,
  sunday: 0,
  yakshanba: 0,
  sun: 0
};

const normalizeScheduleDaysToWeekdays = (schedule) => {
  if (!schedule) return [];
  const rawDays = Array.isArray(schedule.days) ? schedule.days : [];
  return [...new Set(
    rawDays
      .map((d) => String(d || '').trim().toLowerCase())
      .map((d) => WEEKDAY_MAP[d])
      .filter((d) => Number.isInteger(d))
  )];
};

const getMonthStartEnd = (month) => {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 0));
  return { start, end };
};

const formatDateUtc = (dateObj) => dateObj.toISOString().slice(0, 10);
const isValidMonth = (value) => /^\d{4}-\d{2}$/.test(String(value || ''));
const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const resolveDefaultMonthlyStatus = async (studentId, groupId) => {
  const lastMonthStatus = await pool.query(
    `SELECT monthly_status
     FROM attendance
     WHERE student_id = $1 AND group_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [studentId, groupId]
  );

  if (lastMonthStatus.rows.length > 0) {
    const lastStatus = lastMonthStatus.rows[0].monthly_status;
    if (lastStatus === 'stopped' || lastStatus === 'finished') {
      return lastStatus;
    }
  }
  return 'active';
};

const syncLessonAttendanceForDate = async (lessonId, groupId, lessonDate) => {
  const month = String(lessonDate).slice(0, 7);

  await pool.query(
    `DELETE FROM attendance a
     WHERE a.lesson_id = $1
       AND NOT EXISTS (
         SELECT 1
         FROM student_groups sg
         WHERE sg.student_id = a.student_id
           AND sg.group_id = $2
           AND DATE(sg.joined_at) <= $3::date
           AND (sg.left_at IS NULL OR DATE(sg.left_at) >= $3::date)
       )`,
    [lessonId, groupId, lessonDate]
  );

  const eligibleStudents = await pool.query(
    `SELECT DISTINCT sg.student_id
     FROM student_groups sg
     WHERE sg.group_id = $1
       AND DATE(sg.joined_at) <= $2::date
       AND (sg.left_at IS NULL OR DATE(sg.left_at) >= $2::date)`,
    [groupId, lessonDate]
  );

  let createdCount = 0;
  for (const student of eligibleStudents.rows) {
    const exists = await pool.query(
      `SELECT id FROM attendance WHERE lesson_id = $1 AND student_id = $2`,
      [lessonId, student.student_id]
    );

    if (exists.rows.length === 0) {
      const initialStatus = await resolveDefaultMonthlyStatus(student.student_id, groupId);
      await pool.query(
      `INSERT INTO attendance (lesson_id, student_id, group_id, month, status, monthly_status, is_marked)
         VALUES ($1, $2, $3, $4, $5, $6, false)`,
        [lessonId, student.student_id, groupId, month, 'kelmadi', initialStatus]
      );
      createdCount++;
    } else {
      await pool.query(
        `UPDATE attendance
         SET month = $1, updated_at = CURRENT_TIMESTAMP
         WHERE lesson_id = $2 AND student_id = $3`,
        [month, lessonId, student.student_id]
      );
    }
  }

  return { eligibleCount: eligibleStudents.rows.length, createdCount };
};

const autoGenerateLessonsForMonth = async ({ groupId, month, createdBy, fromDate = null }) => {
  let groupResult;
  try {
    groupResult = await pool.query(
      `SELECT id, schedule, class_start_date, start_date, schedule_effective_from
       FROM groups
       WHERE id = $1`,
      [groupId]
    );
  } catch (error) {
    // Eski sxemada schedule_effective_from bo'lmasa ham davom etamiz.
    if (error?.code === '42703') {
      groupResult = await pool.query(
        `SELECT id, schedule, class_start_date, start_date
         FROM groups
         WHERE id = $1`,
        [groupId]
      );
    } else {
      throw error;
    }
  }

  if (groupResult.rows.length === 0) {
    return { generated: 0, skipped: 'group_not_found' };
  }

  const group = groupResult.rows[0];
  const weekdays = normalizeScheduleDaysToWeekdays(group.schedule);
  if (weekdays.length === 0) {
    return { generated: 0, skipped: 'no_schedule_days' };
  }

  const { start: monthStart, end: monthEnd } = getMonthStartEnd(month);
  const startBoundary = group.class_start_date || group.start_date;
  const scheduleEffectiveFrom = group.schedule_effective_from
    ? new Date(Date.UTC(
      new Date(group.schedule_effective_from).getUTCFullYear(),
      new Date(group.schedule_effective_from).getUTCMonth(),
      new Date(group.schedule_effective_from).getUTCDate()
    ))
    : null;
  const effectiveStart = startBoundary
    ? new Date(Date.UTC(
      new Date(startBoundary).getUTCFullYear(),
      new Date(startBoundary).getUTCMonth(),
      new Date(startBoundary).getUTCDate()
    ))
    : monthStart;
  let firstDate = effectiveStart > monthStart ? effectiveStart : monthStart;
  if (scheduleEffectiveFrom && scheduleEffectiveFrom > firstDate) {
    firstDate = scheduleEffectiveFrom;
  }
  if (fromDate && isValidDate(fromDate)) {
    const fromDateObj = new Date(`${fromDate}T00:00:00.000Z`);
    if (!Number.isNaN(fromDateObj.getTime()) && fromDateObj > firstDate) {
      firstDate = fromDateObj;
    }
  }

  const existingLessons = await pool.query(
    `SELECT TO_CHAR(date, 'YYYY-MM-DD') as lesson_date
     FROM lessons
     WHERE group_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2`,
    [groupId, month]
  );
  const existingDates = new Set(existingLessons.rows.map((r) => r.lesson_date));

  const monthlyCap = 12;
  if (existingDates.size >= monthlyCap) {
    return { generated: 0, skipped: 'cap_reached' };
  }

  const candidates = [];
  const cursor = new Date(firstDate);
  while (cursor <= monthEnd) {
    if (weekdays.includes(cursor.getUTCDay())) {
      const d = formatDateUtc(cursor);
      if (!existingDates.has(d)) {
        candidates.push(d);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const toCreate = candidates.slice(0, Math.max(monthlyCap - existingDates.size, 0));
  let generated = 0;
  for (const lessonDate of toCreate) {
    const inserted = await pool.query(
      `INSERT INTO lessons (group_id, date, created_by)
       VALUES ($1, $2::date, $3)
       RETURNING id`,
      [groupId, lessonDate, createdBy]
    );
    const lessonId = inserted.rows[0].id;
    await syncLessonAttendanceForDate(lessonId, groupId, lessonDate);
    generated++;
  }

  return { generated, skipped: null };
};

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
    const syncResult = await syncLessonAttendanceForDate(lesson_id, group_id, date);

    res.json({
      success: true,
      message: 'Dars yaratildi',
      data: {
        lesson_id,
        group_id: parseInt(group_id),
        date: newLesson.rows[0].date,
        students_count: syncResult.eligibleCount
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

    // Dars sanasini olish (birinchi bo'lib)
    const lessonDate = await pool.query(
      `SELECT date FROM lessons WHERE id = $1`,
      [lesson_id]
    );
    const currentLessonDate = lessonDate.rows[0].date;

    // Avval eski/noto'g'ri attendance yozuvlarini tozalaymiz:
    // student lesson sanasida guruhda bo'lmagan bo'lsa bu lessondan o'chiriladi.
    await pool.query(
      `DELETE FROM attendance a
       USING lessons l
       WHERE a.lesson_id = l.id
         AND a.lesson_id = $1
         AND NOT EXISTS (
           SELECT 1
           FROM student_groups sg
           WHERE sg.student_id = a.student_id
             AND sg.group_id = l.group_id
             AND DATE(sg.joined_at) <= l.date
             AND (sg.left_at IS NULL OR DATE(sg.left_at) >= l.date)
         )`,
      [lesson_id]
    );

    // Guruhdagi barcha talabalarni olish - faqat shu dars sanasida guruhda bo'lganlar
    const allStudents = await pool.query(
      `SELECT DISTINCT
        sg.student_id,
        DATE(sg.joined_at) as joined_date
      FROM student_groups sg
      WHERE sg.group_id = $1
        AND DATE(sg.joined_at) <= $2::date
        AND (sg.left_at IS NULL OR DATE(sg.left_at) >= $2::date)`,
      [group_id, currentLessonDate]
    );

    // Har bir talaba uchun attendance yozuvi borligini tekshirish
    for (const student of allStudents.rows) {
      // Agar talaba dars sanasidan KEYIN qo'shilgan bo'lsa, o'tkazib yuboramiz
      if (student.joined_date > currentLessonDate) {
        console.log(`⏭️ Talaba ${student.student_id} bu darsdan keyin qo'shilgan, attendance yaratilmaydi`);
        continue;
      }

      // YANGI mantiq: faqat hozir guruhda bo'lgan studentlar uchun attendance yaratamiz
      // Agar left_at mavjud va dars sanasidan oldin bo'lsa, attendance yaratmaymiz

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
          `INSERT INTO attendance (lesson_id, student_id, group_id, month, status, monthly_status, is_marked) 
           VALUES ($1, $2, $3, $4, $5, $6, false)`,
          [lesson_id, student.student_id, group_id, month, 'kelmadi', initialStatus]
        );
      }
    }

    // Dars studentlarini olish - attendance yozuvi mavjud bo'lgan barcha studentlar
    // MUHIM: student chiqib ketgan bo'lsa ham, agar attendance yozuvi mavjud bo'lsa ko'rinsin
    const students = await pool.query(
      `SELECT 
         a.id as attendance_id,
         a.student_id,
         u.name || ' ' || u.surname as student_name,
         u.phone,
         CASE WHEN COALESCE(a.is_marked, false) THEN a.status ELSE NULL END as status,
         COALESCE(a.is_marked, false) as is_marked,
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
       WHERE a.lesson_id = $1 
       ORDER BY a.monthly_status, u.name`,
      [lesson_id]
    );

    res.json({
      success: true,
      data: students.rows
    });

  } catch (error) {
    console.error('Studentlarni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
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
         SET status = $1, is_marked = true, updated_at = CURRENT_TIMESTAMP 
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
      message: 'Server xatoligi',
      error: error.message
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

    // Avval guruh va teacher ma'lumotlarini olamiz
    const groupInfo = await pool.query(
      `SELECT 
         g.name as group_name,
         g.price as group_price,
         s.name as subject_name,
         CONCAT(t.name, ' ', t.surname) as teacher_name,
         t.name as teacher_first_name,
         t.surname as teacher_last_name
       FROM groups g
       JOIN subjects s ON g.subject_id = s.id  
       LEFT JOIN users t ON g.teacher_id = t.id
       WHERE g.id = $1`,
      [group_id]
    );

    if (groupInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const group = groupInfo.rows[0];

    // Oyning barcha darslarini olish
    const lessons = await pool.query(
      `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') as date, TO_CHAR(date, 'DD') as day
       FROM lessons 
       WHERE group_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2
       ORDER BY date`,
      [group_id, selectedMonth]
    );

    // Talabaning guruhdagi davrlari (bir necha marta kirib-chiqqan bo'lishi mumkin)
    const membershipPeriodsResult = await pool.query(
      `SELECT 
         sg.student_id,
         TO_CHAR(DATE(sg.joined_at), 'YYYY-MM-DD') as joined_at,
         TO_CHAR(DATE(sg.left_at), 'YYYY-MM-DD') as left_at
       FROM student_groups sg
       WHERE sg.group_id = $1
       ORDER BY sg.student_id, sg.joined_at`,
      [group_id]
    );

    const membershipPeriodsMap = new Map();
    membershipPeriodsResult.rows.forEach((row) => {
      if (!membershipPeriodsMap.has(row.student_id)) {
        membershipPeriodsMap.set(row.student_id, []);
      }
      membershipPeriodsMap.get(row.student_id).push({
        joined_at: row.joined_at,
        left_at: row.left_at
      });
    });

    // Shu oydagi barcha attendance yozuvlari - student chiqib ketgan bo'lsa ham ko'rinsin
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
             'status', CASE WHEN COALESCE(a.is_marked, false) THEN a.status ELSE NULL END,
             'is_marked', COALESCE(a.is_marked, false)
           ) ORDER BY l.date
         ) as attendance_records,
         -- Statistika hisoblash (barcha mavjud attendance yozuvlari uchun)
         COUNT(CASE WHEN a.status = 'keldi' AND COALESCE(a.is_marked, false) THEN 1 END) as total_present,
         COUNT(CASE WHEN a.status = 'kelmadi' AND COALESCE(a.is_marked, false) THEN 1 END) as total_absent,
         COUNT(CASE WHEN a.status = 'kechikdi' AND COALESCE(a.is_marked, false) THEN 1 END) as total_late,
         COUNT(CASE WHEN COALESCE(a.is_marked, false) THEN 1 END) as total_lessons
       FROM attendance a
       JOIN users u ON a.student_id = u.id
       JOIN lessons l ON a.lesson_id = l.id
       WHERE a.group_id = $1 AND a.month = $2
       GROUP BY a.student_id, u.name, u.surname, u.phone, a.monthly_status
       ORDER BY a.monthly_status, u.name`,
      [group_id, selectedMonth]
    );

    // Har bir student uchun statistika hisoblash va qo'shish
    const studentsWithStats = attendance.rows.map(student => {
      const totalAttended = parseInt(student.total_present) + parseInt(student.total_late);
      const totalLessons = parseInt(student.total_lessons);
      const attendancePercentage = totalLessons > 0 ? Math.round((totalAttended / totalLessons) * 100) : 0;
      
      return {
        ...student,
        membership_periods: membershipPeriodsMap.get(student.student_id) || [],
        statistics: {
          total_attended: totalAttended,      // Nechta darsga qatnashdi (keldi + kechikdi)
          total_missed: parseInt(student.total_absent),        // Nechta darsni qoldirdi
          total_late: parseInt(student.total_late),            // Nechta marta kechikdi
          total_lessons: totalLessons,        // Jami darslar soni (faqat student guruhda bo'lgan)
          attendance_percentage: attendancePercentage  // Davomat foizi
        }
      };
    });

    res.json({
      success: true,
      data: {
        month: selectedMonth,
        group: {
          group_id: parseInt(group_id),
          group_name: group.group_name,
          group_price: group.group_price,
          subject_name: group.subject_name,
          teacher_name: group.teacher_name,
          teacher_first_name: group.teacher_first_name,
          teacher_last_name: group.teacher_last_name
        },
        lessons: lessons.rows,
        students: studentsWithStats
      }
    });

  } catch (error) {
    console.error('Oylik davomatni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
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

    // YANGI: Payment jadvalini ham yangilash
    // Agar talaba stopped/finished bo'lsa, payment statusini ham yangilaymiz
    if (monthly_status === 'stopped' || monthly_status === 'finished') {
      try {
        let paymentUpdateQuery;
        let paymentParams;
        
        if (from_month) {
          // Shu oydan keyingi barcha oylar uchun
          paymentUpdateQuery = `
            UPDATE student_payments 
            SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 AND group_id = $2 AND month >= $3
          `;
          paymentParams = [student_id, group_id, from_month];
        } else if (months && Array.isArray(months) && months.length > 0) {
          // Bir necha oylar uchun
          const paymentMonthPlaceholders = months.map((_, i) => `$${i + 3}`).join(', ');
          paymentUpdateQuery = `
            UPDATE student_payments 
            SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 AND group_id = $2 AND month IN (${paymentMonthPlaceholders})
          `;
          paymentParams = [student_id, group_id, ...months];
        } else if (month) {
          // Faqat bitta oy uchun
          paymentUpdateQuery = `
            UPDATE student_payments 
            SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 AND group_id = $2 AND month = $3
          `;
          paymentParams = [student_id, group_id, month];
        }
        
        if (paymentUpdateQuery) {
          const paymentResult = await pool.query(paymentUpdateQuery, paymentParams);
          console.log(`🔄 Payment status yangilandi: ${paymentResult.rowCount} ta yozuv`);
        }
      } catch (paymentError) {
        console.error('Payment statusini yangilashda xatolik:', paymentError);
        // Payment xatosi attendance yangilashiga ta'sir qilmasin
      }
    } else if (monthly_status === 'active') {
      // Agar talaba qayta active bo'lsa, payment statusini ham active qilamiz
      try {
        let paymentReactivateQuery;
        let paymentParams;
        
        if (from_month) {
          paymentReactivateQuery = `
            UPDATE student_payments 
            SET status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 AND group_id = $2 AND month >= $3 AND status = 'inactive'
          `;
          paymentParams = [student_id, group_id, from_month];
        } else if (months && Array.isArray(months) && months.length > 0) {
          const paymentMonthPlaceholders = months.map((_, i) => `$${i + 3}`).join(', ');
          paymentReactivateQuery = `
            UPDATE student_payments 
            SET status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 AND group_id = $2 AND month IN (${paymentMonthPlaceholders}) AND status = 'inactive'
          `;
          paymentParams = [student_id, group_id, ...months];
        } else if (month) {
          paymentReactivateQuery = `
            UPDATE student_payments 
            SET status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 AND group_id = $2 AND month = $3 AND status = 'inactive'
          `;
          paymentParams = [student_id, group_id, month];
        }
        
        if (paymentReactivateQuery) {
          const paymentResult = await pool.query(paymentReactivateQuery, paymentParams);
          console.log(`🔄 Payment qayta faollashtirildi: ${paymentResult.rowCount} ta yozuv`);
        }
      } catch (paymentError) {
        console.error('Payment statusini faollashtrishda xatolik:', paymentError);
      }
    }

    // YANGI: Mavjud snapshot'larni ham yangilaymiz
    try {
      let snapshotUpdateQuery;
      let snapshotParams;
      
      if (from_month) {
        snapshotUpdateQuery = `
          UPDATE monthly_snapshots 
          SET monthly_status = $1::varchar, 
              payment_status = CASE 
                WHEN $1::varchar = 'active' THEN 
                  CASE 
                    WHEN paid_amount >= required_amount THEN 'paid'::varchar
                    WHEN paid_amount > 0 THEN 'partial'::varchar
                    ELSE 'unpaid'::varchar
                  END
                ELSE 'inactive'::varchar
              END,
              updated_at = CURRENT_TIMESTAMP
          WHERE student_id = $2 AND group_id = $3 AND month >= $4::varchar
        `;
        snapshotParams = [monthly_status, student_id, group_id, from_month];
      } else if (months && Array.isArray(months) && months.length > 0) {
        const snapshotMonthPlaceholders = months.map((_, i) => `$${i + 4}::varchar`).join(', ');
        snapshotUpdateQuery = `
          UPDATE monthly_snapshots 
          SET monthly_status = $1::varchar, 
              payment_status = CASE 
                WHEN $1::varchar = 'active' THEN 
                  CASE 
                    WHEN paid_amount >= required_amount THEN 'paid'::varchar
                    WHEN paid_amount > 0 THEN 'partial'::varchar
                    ELSE 'unpaid'::varchar
                  END
                ELSE 'inactive'::varchar
              END,
              updated_at = CURRENT_TIMESTAMP
          WHERE student_id = $2 AND group_id = $3 AND month IN (${snapshotMonthPlaceholders})
        `;
        snapshotParams = [monthly_status, student_id, group_id, ...months];
      } else if (month) {
        snapshotUpdateQuery = `
          UPDATE monthly_snapshots 
          SET monthly_status = $1::varchar, 
              payment_status = CASE 
                WHEN $1::varchar = 'active' THEN 
                  CASE 
                    WHEN paid_amount >= required_amount THEN 'paid'::varchar
                    WHEN paid_amount > 0 THEN 'partial'::varchar
                    ELSE 'unpaid'::varchar
                  END
                ELSE 'inactive'::varchar
              END,
              updated_at = CURRENT_TIMESTAMP
          WHERE student_id = $2 AND group_id = $3 AND month = $4::varchar
        `;
        snapshotParams = [monthly_status, student_id, group_id, month];
      }
      
      if (snapshotUpdateQuery) {
        const snapshotResult = await pool.query(snapshotUpdateQuery, snapshotParams);
        console.log(`📸 Snapshot yangilandi: ${snapshotResult.rowCount} ta yozuv`);
      }
    } catch (snapshotError) {
      console.error('Snapshot yangilashda xatolik:', snapshotError);
      // Snapshot xatosi attendance yangilashiga ta'sir qilmasin
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
  const { id: userId } = req.user;
  
  try {
    const selectedMonth = month || new Date().toISOString().slice(0, 7);

    // Avval guruh ma'lumotlarini olamiz
    const groupInfo = await pool.query(
      `SELECT 
         g.id,
         g.name as group_name,
         g.price as group_price,
         s.name as subject_name,
         CONCAT(t.name, ' ', t.surname) as teacher_name,
         t.name as teacher_first_name,
         t.surname as teacher_last_name,
         t.id as teacher_id
       FROM groups g
       JOIN subjects s ON g.subject_id = s.id  
       LEFT JOIN users t ON g.teacher_id = t.id
       WHERE g.id = $1`,
      [group_id]
    );

    if (groupInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const group = groupInfo.rows[0];

    // Attendance sahifasiga kirilganda tanlangan oy uchun schedule asosida
    // darslarni avtomatik yaratamiz (oyiga maksimal 12 ta).
    const autoGen = await autoGenerateLessonsForMonth({
      groupId: parseInt(group_id, 10),
      month: selectedMonth,
      createdBy: userId
    });

    const lessons = await pool.query(
      `SELECT 
         l.id,
         TO_CHAR(l.date, 'YYYY-MM-DD') as date,
         TO_CHAR(l.date, 'DD.MM.YYYY') as formatted_date,
         COUNT(CASE WHEN a.monthly_status = 'active' OR (COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kechikdi')) THEN 1 END) as total_students,
         COUNT(CASE WHEN a.status = 'keldi' AND COALESCE(a.is_marked, false) THEN 1 END) as present_count,
         COUNT(CASE WHEN a.status = 'kelmadi' AND a.monthly_status = 'active' AND COALESCE(a.is_marked, false) THEN 1 END) as absent_count,
         COUNT(CASE WHEN a.status = 'kechikdi' AND COALESCE(a.is_marked, false) THEN 1 END) as late_count
       FROM lessons l
       LEFT JOIN attendance a ON l.id = a.lesson_id
       WHERE l.group_id = $1 AND TO_CHAR(l.date, 'YYYY-MM') = $2
       GROUP BY l.id, l.date
       ORDER BY l.date DESC`,
      [group_id, selectedMonth]
    );

    res.json({
      success: true,
      data: {
        month: selectedMonth,
        group: {
          group_id: parseInt(group_id),
          group_name: group.group_name,
          group_price: group.group_price,
          subject_name: group.subject_name,
          teacher_name: group.teacher_name,
          teacher_first_name: group.teacher_first_name,
          teacher_last_name: group.teacher_last_name,
          teacher_id: group.teacher_id
        },
        lessons: lessons.rows,
        auto_generated: {
          month: selectedMonth,
          generated_lessons_count: autoGen.generated,
          mode: 'schedule_based_max_12'
        }
      }
    });

  } catch (error) {
    console.error('Darslarni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 7.1 GURUH LESSONLARINI O'CHIRIB QAYTA GENERATE QILISH
// ============================================================================
exports.regenerateGroupLessons = async (req, res) => {
  const { group_id } = req.params;
  const { month, from_date } = req.body || {};
  const { role, id: userId } = req.user;

  let transactionStarted = false;
  try {
    const selectedMonth = month || new Date().toISOString().slice(0, 7);
    if (!isValidMonth(selectedMonth)) {
      return res.status(400).json({
        success: false,
        message: 'month YYYY-MM formatida bo\'lishi kerak'
      });
    }

    if (from_date && !isValidDate(from_date)) {
      return res.status(400).json({
        success: false,
        message: 'from_date YYYY-MM-DD formatida bo\'lishi kerak'
      });
    }

    if (from_date && !String(from_date).startsWith(`${selectedMonth}-`)) {
      return res.status(400).json({
        success: false,
        message: 'from_date tanlangan month ichida bo\'lishi kerak'
      });
    }

    const groupCheck = await pool.query(
      `SELECT id, teacher_id
       FROM groups
       WHERE id = $1`,
      [group_id]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const group = groupCheck.rows[0];
    if (role === 'teacher' && String(group.teacher_id || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'zingizning guruhingizni regenerate qila olasiz'
      });
    }

    const { start: monthStartObj, end: monthEndObj } = getMonthStartEnd(selectedMonth);
    const deleteStart = from_date || formatDateUtc(monthStartObj);
    const deleteEnd = formatDateUtc(monthEndObj);

    await pool.query('BEGIN');
    transactionStarted = true;

    const deletedAttendance = await pool.query(
      `DELETE FROM attendance a
       USING lessons l
       WHERE a.lesson_id = l.id
         AND l.group_id = $1
         AND l.date BETWEEN $2::date AND $3::date`,
      [group_id, deleteStart, deleteEnd]
    );

    const deletedLessons = await pool.query(
      `DELETE FROM lessons
       WHERE group_id = $1
         AND date BETWEEN $2::date AND $3::date`,
      [group_id, deleteStart, deleteEnd]
    );

    await pool.query('COMMIT');
    transactionStarted = false;

    const autoGen = await autoGenerateLessonsForMonth({
      groupId: Number(group_id),
      month: selectedMonth,
      createdBy: userId,
      fromDate: deleteStart
    });

    const lessonsAfter = await pool.query(
      `SELECT COUNT(*)::int as lesson_count
       FROM lessons
       WHERE group_id = $1
         AND TO_CHAR(date, 'YYYY-MM') = $2`,
      [group_id, selectedMonth]
    );

    return res.json({
      success: true,
      message: 'Davomat lessonlari qayta yaratildi',
      data: {
        group_id: Number(group_id),
        month: selectedMonth,
        delete_range: {
          from: deleteStart,
          to: deleteEnd
        },
        deleted_lessons_count: deletedLessons.rowCount,
        deleted_attendance_count: deletedAttendance.rowCount,
        generated_lessons_count: autoGen.generated,
        current_month_lessons_count: lessonsAfter.rows[0].lesson_count,
        mode: 'delete_then_schedule_regenerate_max_12'
      }
    });
  } catch (error) {
    if (transactionStarted) {
      await pool.query('ROLLBACK');
    }
    console.error('Lesson regenerate qilishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 8. DARS SANASINI O'ZGARTIRISH
// ============================================================================
exports.updateLessonDate = async (req, res) => {
  const { lesson_id } = req.params;
  const { date } = req.body;
  const { role, id: userId } = req.user;

  try {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "date YYYY-MM-DD formatida bo'lishi kerak"
      });
    }

    const lessonResult = await pool.query(
      `SELECT l.id, l.group_id, l.date, g.teacher_id
       FROM lessons l
       JOIN groups g ON g.id = l.group_id
       WHERE l.id = $1`,
      [lesson_id]
    );

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dars topilmadi'
      });
    }

    const lesson = lessonResult.rows[0];

    if (role === 'teacher' && String(lesson.teacher_id || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'zingizning guruh darsini o\'zgartira olasiz'
      });
    }

    const duplicate = await pool.query(
      `SELECT id
       FROM lessons
       WHERE group_id = $1
         AND date = $2::date
         AND id <> $3`,
      [lesson.group_id, date, lesson_id]
    );

    if (duplicate.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu sana uchun dars allaqachon mavjud'
      });
    }

    await pool.query(
      `UPDATE lessons
       SET date = $1::date
       WHERE id = $2`,
      [date, lesson_id]
    );

    await syncLessonAttendanceForDate(lesson_id, lesson.group_id, date);

    return res.json({
      success: true,
      message: "Dars sanasi muvaffaqiyatli o'zgartirildi",
      data: {
        lesson_id: Number(lesson_id),
        group_id: lesson.group_id,
        old_date: String(lesson.date).slice(0, 10),
        new_date: date,
        month: date.slice(0, 7)
      }
    });
  } catch (error) {
    console.error('Dars sanasini o\'zgartirishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
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

// ============================================================================
// 9. OYLIK DAVOMAT EXCEL EXPORT
// ============================================================================
exports.exportMonthlyAttendance = async (req, res) => {
  const { group_id } = req.params;
  const { role, id: userId } = req.user;
  const { month } = req.query;
  
  try {
    // Faqat YYYY-MM formatni qabul qilamiz
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Oy formatida xatolik (YYYY-MM format ishlatilsin)'
      });
    }
    
    // Guruhni tekshiramiz
    const groupResult = await pool.query(`
      SELECT 
        g.id,
        g.name,
        g.teacher_id,
        s.name as subject_name,
        CONCAT(t.name, ' ', t.surname) as teacher_name
      FROM groups g
      LEFT JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN users t ON g.teacher_id = t.id
      WHERE g.id = $1
    `, [group_id]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }
    
    const group = groupResult.rows[0];
    
    // O'qituvchi faqat o'z guruhlarini export qila oladi
    if (role === 'teacher' && group.teacher_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'z guruhlaringizni export qila olasiz'
      });
    }
    
    // Avval oyning barcha darslarini olamiz (getMonthlyAttendance kabi)
    const lessons = await pool.query(
      `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') as date, TO_CHAR(date, 'DD') as day
       FROM lessons 
       WHERE group_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2
       ORDER BY date`,
      [group_id, month]
    );
    
    if (lessons.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bu oy uchun darslar topilmadi'
      });
    }
    
    // Oylik davomatni olamiz - barcha mavjud attendance yozuvlari
    const attendanceQuery = `
      SELECT 
        a.student_id,
        u.name,
        u.surname,
        l.id as lesson_id,
        TO_CHAR(l.date, 'YYYY-MM-DD') as lesson_date,
        a.status,
        COALESCE(a.monthly_status, 'active') as monthly_status
      FROM attendance a
      JOIN users u ON a.student_id = u.id  
      JOIN lessons l ON a.lesson_id = l.id
      WHERE a.group_id = $1 AND TO_CHAR(l.date, 'YYYY-MM') = $2
      ORDER BY u.name, u.surname, l.date
    `;
    
    const attendanceResult = await pool.query(attendanceQuery, [group_id, month]);
    
    if (attendanceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bu oy uchun davomat ma\'lumotlari topilmadi'
      });
    }
    
    // Ma'lumotlarni Excel formatiga tayyorlaymiz
    const studentsMap = new Map();
    const dates = new Set();
    
    // Darslar sanalarini olish (lessons dan)
    lessons.rows.forEach(lesson => {
      dates.add(lesson.date);
    });
    
    // Student ma'lumotlarini to'plash
    attendanceResult.rows.forEach(row => {
      const studentKey = `${row.student_id}`;
      if (!studentsMap.has(studentKey)) {
        studentsMap.set(studentKey, {
          name: `${row.name} ${row.surname}`,
          monthly_status: row.monthly_status || 'active',
          attendance: {}
        });
      }
      
      // Har bir dars uchun status
      studentsMap.get(studentKey).attendance[row.lesson_date] = row.status;
    });
    
    // Sanalarni tartiblaymiz
    const sortedDates = Array.from(dates).sort();
    
    // Excel data tayyorlaymiz
    const worksheetData = [];
    
    // Oy va yil nomi uchun title qatori
    const monthName = {
      '01': 'Yanvar', '02': 'Fevral', '03': 'Mart', '04': 'Aprel',
      '05': 'May', '06': 'Iyun', '07': 'Iyul', '08': 'Avgust',
      '09': 'Sentyabr', '10': 'Oktyabr', '11': 'Noyabr', '12': 'Dekabr'
    };
    
    const [year, monthNum] = month.split('-');
    const titleRow = [`${group.name} - ${monthName[monthNum]} ${year} - Oylik Davomat`];
    worksheetData.push(titleRow);
    worksheetData.push([]); // Bo'sh qator
    
    // Header qatori - to'liq sanalar bilan
    const header = ['#', 'Talaba', 'Holati', ...sortedDates.map(date => {
      const d = new Date(date);
      return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
    }), 'Jami keldi', 'Jami kelmadi', 'Kelish foizi'];
    
    worksheetData.push(header);
    
    // Student ma'lumotlari
    let index = 1;
    studentsMap.forEach((student, studentId) => {
      let totalPresent = 0;
      let totalAbsent = 0;
      
      const row = [
        index++,
        student.name,
        student.monthly_status === 'active' ? 'Faol' : 
        student.monthly_status === 'stopped' ? 'To\'xtatildi' : 
        student.monthly_status === 'finished' ? 'Tugatdi' : student.monthly_status
      ];
      
      // Har bir sana uchun davomat holati
      sortedDates.forEach(date => {
        const status = student.attendance[date] || '';
        let displayStatus = '';
        
        if (status === 'keldi') {
          displayStatus = '✓';
          totalPresent++;
        } else if (status === 'kelmadi') {
          displayStatus = '✗';
          totalAbsent++;
        } else if (status === 'kechikdi') {
          displayStatus = 'K';
          totalPresent++;
        } else if (status === 'uzrli') {
          displayStatus = 'U';
        } else {
          displayStatus = '';
        }
        
        row.push(displayStatus);
      });
      
      // Statistika
      const totalLessons = totalPresent + totalAbsent;
      const attendancePercentage = totalLessons > 0 ? Math.round((totalPresent / totalLessons) * 100) : 0;
      
      row.push(totalPresent, totalAbsent, attendancePercentage + '%');
      worksheetData.push(row);
    });
    
    // Excel fayl yaratamiz
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Title qatorini merge qilamiz
    const titleCellsCount = 3 + sortedDates.length + 3; // barcha ustunlar soni
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: titleCellsCount - 1 } }
    ];
    
    // Ustunlar kengligini sozlaymiz
    worksheet['!cols'] = [
      { wch: 5 },   // #
      { wch: 25 },  // Talaba
      { wch: 15 },  // Holati
      ...sortedDates.map(() => ({ wch: 12 })), // Sanalar (kengroq)
      { wch: 10 },  // Jami keldi
      { wch: 12 },  // Jami kelmadi
      { wch: 12 }   // Kelish foizi
    ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Oylik Davomat');
    
    // Excel faylni bufferga yozamiz
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    
    // Fayl nomini yaratamiz
    const fileName = `${group.name}_${monthName[monthNum]}_${year}_davomat.xlsx`;
    
    // Response headerlarini sozlaymiz
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Length', excelBuffer.length);
    
    // Excel faylni yuboramiz
    res.end(excelBuffer);
    
  } catch (error) {
    console.error('Excel export xatoligi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
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
  regenerateGroupLessons: exports.regenerateGroupLessons,
  updateLessonDate: exports.updateLessonDate,
  deleteLesson: exports.deleteLesson,
  exportMonthlyAttendance: exports.exportMonthlyAttendance
};
