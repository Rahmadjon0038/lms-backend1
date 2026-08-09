const pool = require('../config/db');
const XLSX = require('xlsx');
const { notifyUser } = require('./notificationController');
const { MONTHLY_POINT_CAP } = require('../config/points');
const { getScopedBranchId } = require('../utils/branch');

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
const isValidTime = (value) => /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(value || ''));

const formatTashkentDateTimeLabel = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const tashkentDate = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const year = tashkentDate.getUTCFullYear().toString().padStart(4, '0');
  const month = String(tashkentDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(tashkentDate.getUTCDate()).padStart(2, '0');
  const hour = String(tashkentDate.getUTCHours()).padStart(2, '0');
  const minute = String(tashkentDate.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const formatTashkentDateYmd = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const tashkentDate = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const year = tashkentDate.getUTCFullYear().toString().padStart(4, '0');
  const month = String(tashkentDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(tashkentDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeMonthParam = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (isValidMonth(raw)) return raw;
  if (isValidDate(raw)) return raw.slice(0, 7);
  return null;
};

const normalizeTimeValue = (value, fallback = '00:00:00') => {
  if (!value) return fallback;
  const raw = String(value).trim();
  if (!isValidTime(raw)) return fallback;
  return raw.length === 5 ? `${raw}:00` : raw;
};

const parseScheduleTimeRange = (schedule) => {
  const raw = String(schedule?.time || '').trim();
  if (!raw) {
    return { start_time: '00:00:00', end_time: null };
  }

  // Qo'llab-quvvatlanadi:
  // - 10:00-12:00
  // - 10:00 - 12:00
  // - 10.00-12.00
  // - 10:00 (faqat boshlanish vaqti)
  const normalized = raw
    .replace(/[–—]/g, '-')
    .replace(/\./g, ':')
    .replace(/\s+/g, ' ')
    .trim();

  const rangeMatch = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/);
  if (rangeMatch) {
    return {
      start_time: `${rangeMatch[1]}:${rangeMatch[2]}:00`,
      end_time: `${rangeMatch[3]}:${rangeMatch[4]}:00`
    };
  }

  const singleMatch = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (singleMatch) {
    return {
      start_time: `${singleMatch[1]}:${singleMatch[2]}:00`,
      end_time: null
    };
  }

  return { start_time: '00:00:00', end_time: null };
};

const isHolidayDate = async (dateStr, branchId = 1) => {
  if (!isValidDate(dateStr)) return false;
  const result = await pool.query(`SELECT 1 FROM holidays WHERE date = $1 AND branch_id = $2`, [dateStr, branchId]);
  return result.rows.length > 0;
};

const getHolidayDatesForMonth = async (month, branchId = 1) => {
  if (!isValidMonth(month)) return new Set();
  const result = await pool.query(
    `SELECT TO_CHAR(date, 'YYYY-MM-DD') as date
     FROM holidays
     WHERE TO_CHAR(date, 'YYYY-MM') = $1 AND branch_id = $2`,
    [month, branchId]
  );
  return new Set(result.rows.map((r) => r.date));
};

const applyGlobalHoliday = async ({ date, isHoliday, userId, branchId = 1 }) => {
  if (isHoliday) {
    await pool.query(
      `INSERT INTO holidays (date, created_by, branch_id)
       VALUES ($1::date, $2, $3)
       ON CONFLICT (date, branch_id) DO NOTHING`,
      [date, userId, branchId]
    );
  } else {
    await pool.query(`DELETE FROM holidays WHERE date = $1::date AND branch_id = $2`, [date, branchId]);
  }

  const updateResult = await pool.query(
    `UPDATE lessons
     SET is_holiday = $2
     WHERE date = $1::date AND branch_id = $3
     RETURNING id`,
    [date, Boolean(isHoliday), branchId]
  );

  return updateResult.rowCount;
};

const getDefaultLessonStatusForDate = (dateStr) => {
  const today = formatTashkentDateYmd(new Date()) || new Date().toISOString().slice(0, 10);
  return String(dateStr) > today ? 'not_started' : 'open';
};

const getShiftFromTime = (timeValue) => {
  const normalized = normalizeTimeValue(timeValue);
  const hour = parseInt(normalized.slice(0, 2), 10);
  return Number.isNaN(hour) ? 'morning' : (hour < 13 ? 'morning' : 'evening');
};

const resolveDefaultMonthlyStatus = async (studentId, groupId, branchId = 1) => {
  const lastMonthStatus = await pool.query(
    `SELECT monthly_status
     FROM attendance
     WHERE student_id = $1 AND group_id = $2 AND branch_id = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [studentId, groupId, branchId]
  );

  if (lastMonthStatus.rows.length > 0) {
    const lastStatus = lastMonthStatus.rows[0].monthly_status;
    if (lastStatus === 'stopped' || lastStatus === 'finished') {
      return lastStatus;
    }
  }
  return 'active';
};

const syncLessonAttendanceForDate = async (lessonId, groupId, lessonDate, branchId = 1) => {
  const month = String(lessonDate).slice(0, 7);

  const eligibleStudents = await pool.query(
    `SELECT DISTINCT sg.student_id
     FROM student_groups sg
     WHERE sg.group_id = $1
       AND sg.branch_id = $3
       AND DATE(sg.joined_at) <= $2::date
       AND (sg.left_at IS NULL OR DATE(sg.left_at) > $2::date)`,
    [groupId, lessonDate, branchId]
  );

  let createdCount = 0;
  for (const student of eligibleStudents.rows) {
    const exists = await pool.query(
      `SELECT id FROM attendance WHERE lesson_id = $1 AND student_id = $2 AND branch_id = $3`,
      [lessonId, student.student_id, branchId]
    );

    if (exists.rows.length === 0) {
      const initialStatus = await resolveDefaultMonthlyStatus(student.student_id, groupId, branchId);
      await pool.query(
      `INSERT INTO attendance (lesson_id, student_id, group_id, month, month_name, status, monthly_status, is_marked, branch_id)
         VALUES ($1, $2, $3, $4, $4, $5, $6, false, $7)`,
        [lessonId, student.student_id, groupId, month, 'kelmadi', initialStatus, branchId]
      );
      createdCount++;
    } else {
      await pool.query(
        `UPDATE attendance
         SET month = $1, month_name = $1, updated_at = CURRENT_TIMESTAMP
         WHERE lesson_id = $2 AND student_id = $3 AND branch_id = $4`,
        [month, lessonId, student.student_id, branchId]
      );
    }
  }

  return { eligibleCount: eligibleStudents.rows.length, createdCount };
};

const processAttendanceRecordsForLesson = async ({
  lesson,
  attendanceRecords,
  userId,
}) => {
  const allowedStatuses = ['keldi', 'kelmadi', 'kechikdi'];
  let updatedCount = 0;

  for (const record of attendanceRecords) {
    if (!record.attendance_id) {
      const error = new Error('attendance_id majburiy');
      error.statusCode = 400;
      throw error;
    }

    const normalizedStatus = record.status === '' ? null : record.status;
    const isCleared = normalizedStatus === null || normalizedStatus === undefined;

    if (!isCleared && !allowedStatuses.includes(normalizedStatus)) {
      const error = new Error(`Status faqat: ${allowedStatuses.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const result = isCleared
      ? await pool.query(
          `UPDATE attendance 
           SET is_marked = false,
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1 AND lesson_id = $2 AND monthly_status = 'active'
           RETURNING student_id`,
          [record.attendance_id, lesson.id]
        )
      : await pool.query(
          `UPDATE attendance 
           SET status = $1,
               is_marked = true,
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2 AND lesson_id = $3 AND monthly_status = 'active'
           RETURNING student_id`,
          [normalizedStatus, record.attendance_id, lesson.id]
        );

    if (result.rowCount === 0) {
      const checkAttendance = await pool.query(
        `SELECT id, student_id, monthly_status, status FROM attendance WHERE id = $1 AND lesson_id = $2`,
        [record.attendance_id, lesson.id]
      );

      if (checkAttendance.rows.length > 0) {
        const att = checkAttendance.rows[0];
        if (att.monthly_status !== 'active') {
          console.log(`⏭️ O'tkazib yuborildi: attendance_id=${record.attendance_id}, monthly_status=${att.monthly_status}`);
          continue;
        }
      } else {
        const error = new Error('Attendance topilmadi');
        error.statusCode = 404;
        error.attendance_id = record.attendance_id;
        throw error;
      }
    } else {
      updatedCount += result.rowCount;

      const updatedStudentId = result.rows[0]?.student_id;
      if (!updatedStudentId) {
        continue;
      }

      const statusLabels = {
        keldi: 'Keldi',
        kelmadi: 'Kelmadi',
        kechikdi: 'Kechikdi'
      };
      const humanStatus = statusLabels[record.status] || record.status;
      const markedAtLabel = formatTashkentDateTimeLabel();
      const pushSubjectName = lesson.subject_name || lesson.group_name || '';
      const pushBody = pushSubjectName
        ? `${pushSubjectName} — ${humanStatus}\n${markedAtLabel}`
        : `${humanStatus}\n${markedAtLabel}`;

      try {
        await notifyUser({
          userId: updatedStudentId,
          type: 'attendance',
          title: 'Davomat belgilandi',
          body: humanStatus,
          pushTitle: 'Davomat belgilandi',
          pushBody,
          branchId: lesson.group_branch_id || lesson.branch_id || null,
          data: {
            route: '/notification-detail',
            type: 'attendance',
            lesson_id: String(lesson.id),
            lesson_date: String(lesson.lesson_date),
            lesson_month: String(lesson.lesson_month || String(lesson.lesson_date).slice(0, 7)),
            group_id: String(lesson.group_id),
            group_name: lesson.group_name || '',
            teacher_name: lesson.teacher_name || '',
            subject_name: lesson.subject_name || '',
            attendance_status: record.status,
            attendance_marked_at: markedAtLabel,
          },
          createdBy: userId,
        });
      } catch (notificationError) {
        console.warn(`⚠️ Attendance notification yuborilmadi: ${notificationError.message}`);
      }

      try {
        const attendancePoints = {
          keldi: 3,
          kelmadi: 0,
        };
        const basePoints = attendancePoints[record.status] ?? 0;

        await pool.query(
          `DELETE FROM student_point_events
           WHERE student_id = $1 AND lesson_id = $2 AND source_type = 'attendance'`,
          [updatedStudentId, lesson.id]
        );

        const eventMonthKey =
          lesson.lesson_month || String(lesson.lesson_date).slice(0, 7);
        let awardedPoints = basePoints;
        if (basePoints > 0) {
          const capResult = await pool.query(
            `SELECT COALESCE(SUM(points), 0)::int AS month_total
             FROM student_point_events
             WHERE student_id = $1 AND group_id = $2 AND month_name = $3`,
            [updatedStudentId, lesson.group_id, eventMonthKey]
          );
          const remaining = Math.max(
            0,
            MONTHLY_POINT_CAP - (capResult.rows[0]?.month_total || 0)
          );
          awardedPoints = Math.min(basePoints, remaining);
        }

        if (awardedPoints > 0) {
          await pool.query(
            `
            INSERT INTO student_point_events (
              student_id,
              group_id,
              lesson_id,
              month_name,
              points,
              source_type,
              title,
              description,
              metadata,
              created_by
            ) VALUES (
              $1, $2, $3, $4, $5, 'attendance', $6, $7,
              $8::jsonb || jsonb_build_object(
                'created_by_name',
                COALESCE((SELECT NULLIF(TRIM(name || ' ' || surname), '') FROM users WHERE id = $9), '')
              ),
              $9
            )
            `,
            [
              updatedStudentId,
              lesson.group_id,
              lesson.id,
              eventMonthKey,
              awardedPoints,
              'Darsga qatnashdi',
              `${humanStatus} - +${awardedPoints} ball`,
              JSON.stringify({
                status: record.status,
                lesson_date: lesson.lesson_date,
                group_name: lesson.group_name || '',
                teacher_name: lesson.teacher_name || '',
                subject_name: lesson.subject_name || '',
                awarded_points: awardedPoints,
                base_points: basePoints,
                capped: awardedPoints < basePoints,
              }),
              userId,
            ]
          );
        }
      } catch (pointsError) {
        console.warn(`⚠️ Attendance point event qo'shilmagan: ${pointsError.message}`);
      }
    }
  }

  return { updatedCount };
};

const getLessonAttendanceAccess = async (lessonId, branchId) => {
  return pool.query(
    `SELECT
       l.id,
       TO_CHAR(l.date, 'YYYY-MM-DD') as lesson_date,
       TO_CHAR(l.date, 'YYYY-MM') as lesson_month,
       l.group_id,
       COALESCE(l.teacher_id, g.teacher_id) as teacher_id,
       l.status,
       COALESCE(l.is_holiday, false) as is_holiday,
       g.name as group_name,
       CONCAT(COALESCE(t.name, ''), ' ', COALESCE(t.surname, '')) as teacher_name,
       COALESCE(s.name, '') as subject_name
     FROM lessons l
     LEFT JOIN groups g ON g.id = l.group_id
     LEFT JOIN users t ON t.id = COALESCE(l.teacher_id, g.teacher_id)
     LEFT JOIN subjects s ON s.id = g.subject_id
     WHERE l.id = $1 AND l.branch_id = $2`,
    [lessonId, branchId]
  );
};

const autoGenerateLessonsForMonth = async ({ groupId, month, createdBy, fromDate = null, branchId = 1 }) => {
  let groupResult;
  try {
    groupResult = await pool.query(
      `SELECT id, schedule, class_start_date, start_date, schedule_effective_from, teacher_id, subject_id, room_id
       FROM groups
       WHERE id = $1 AND branch_id = $2`,
      [groupId, branchId]
    );
  } catch (error) {
    // Eski sxemada schedule_effective_from bo'lmasa ham davom etamiz.
    if (error?.code === '42703') {
      groupResult = await pool.query(
        `SELECT id, schedule, class_start_date, start_date, teacher_id, subject_id, room_id
         FROM groups
         WHERE id = $1 AND branch_id = $2`,
        [groupId, branchId]
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
  const slot = parseScheduleTimeRange(group.schedule);
  if (weekdays.length === 0) {
    return { generated: 0, skipped: 'no_schedule_days' };
  }

  const { start: monthStart, end: monthEnd } = getMonthStartEnd(month);
  const startBoundary = formatTashkentDateYmd(group.class_start_date || group.start_date);
  const scheduleEffectiveFrom = group.schedule_effective_from
    ? formatTashkentDateYmd(group.schedule_effective_from)
    : null;
  const effectiveStart = startBoundary
    ? new Date(`${startBoundary}T00:00:00.000Z`)
    : monthStart;
  let firstDate = effectiveStart > monthStart ? effectiveStart : monthStart;
  if (scheduleEffectiveFrom) {
    const scheduleEffectiveFromDate = new Date(`${scheduleEffectiveFrom}T00:00:00.000Z`);
    if (scheduleEffectiveFromDate > firstDate) {
      firstDate = scheduleEffectiveFromDate;
    }
  }
  if (fromDate && isValidDate(fromDate)) {
    const fromDateObj = new Date(`${fromDate}T00:00:00.000Z`);
    if (!Number.isNaN(fromDateObj.getTime()) && fromDateObj > firstDate) {
      firstDate = fromDateObj;
    }
  }

  const existingLessons = await pool.query(
    `SELECT TO_CHAR(date, 'YYYY-MM-DD') as lesson_date, TO_CHAR(start_time, 'HH24:MI:SS') as start_time
     FROM lessons
     WHERE group_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2 AND branch_id = $3`,
    [groupId, month, branchId]
  );
  const existingSlots = new Set(existingLessons.rows.map((r) => `${r.lesson_date}|${normalizeTimeValue(r.start_time)}`));
  const holidayDates = await getHolidayDatesForMonth(month, branchId);

  const candidates = [];
  const cursor = new Date(firstDate);
  while (cursor <= monthEnd) {
    if (weekdays.includes(cursor.getUTCDay())) {
      const d = formatDateUtc(cursor);
      const key = `${d}|${slot.start_time}`;
      if (!existingSlots.has(key)) {
        candidates.push(d);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const toCreate = candidates;
  let generated = 0;
  for (const lessonDate of toCreate) {
    const inserted = await pool.query(
      `INSERT INTO lessons (group_id, teacher_id, subject_id, room_id, date, start_time, end_time, status, created_by, is_holiday, branch_id)
       VALUES ($1, $2, $3, $4, $5::date, $6::time, $7::time, $8, $9, $10, $11)
       ON CONFLICT (group_id, date, start_time) DO NOTHING
       RETURNING id`,
      [
        groupId,
        group.teacher_id || createdBy,
        group.subject_id || null,
        group.room_id || null,
        lessonDate,
        slot.start_time,
        slot.end_time,
        getDefaultLessonStatusForDate(lessonDate),
        createdBy,
        holidayDates.has(lessonDate),
        branchId
      ]
    );

    // Parallel so'rov bo'lsa, conflict normal holat - shunchaki o'tamiz.
    if (inserted.rows.length === 0) {
      continue;
    }

    const lessonId = inserted.rows[0].id;
    await syncLessonAttendanceForDate(lessonId, groupId, lessonDate, branchId);
    generated++;
  }

  return { generated, skipped: null };
};

const ensureGeneratedLessonsForScope = async ({ month, createdBy, teacherId = null, branchId = 1 }) => {
  const params = [branchId];
  let teacherFilter = '';
  if (teacherId) {
    teacherFilter = ` AND g.teacher_id = $2`;
    params.push(teacherId);
  }

  const groupsResult = await pool.query(
    `SELECT g.id
     FROM groups g
     WHERE g.class_status = 'started'
       AND g.branch_id = $1
       AND g.status IN ('active', 'blocked')
       AND g.teacher_id IS NOT NULL
       ${teacherFilter}`,
    params
  );

  let generated = 0;
  for (const row of groupsResult.rows) {
    const auto = await autoGenerateLessonsForMonth({
      groupId: row.id,
      month,
      createdBy,
      branchId
    });
    generated += auto.generated || 0;
  }

  return { groups_count: groupsResult.rows.length, generated_lessons: generated };
};

const writeLessonAuditLog = async ({ lessonId, changedBy, action, beforeData, afterData }) => {
  try {
    await pool.query(
      `INSERT INTO lesson_audit_logs (lesson_id, changed_by, action, before_data, after_data)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [lessonId, changedBy, action, JSON.stringify(beforeData || {}), JSON.stringify(afterData || {})]
    );
  } catch (error) {
    console.error('Lesson audit log yozishda xatolik:', error.message);
  }
};

// ============================================================================
// 1. GURUHLAR RO'YXATI (Attendance uchun)
// ============================================================================
exports.getTeachersAttendanceList = async (req, res) => {
  try {
    const { date, month, shift, subject_id } = req.query;
    const branchId = getScopedBranchId(req);
    const subjectIdParam = subject_id ? parseInt(subject_id, 10) : null;
    const normalizedDate = date ? (isValidDate(date) ? date : null) : null;
    const normalizedMonth = normalizeMonthParam(month) || (normalizedDate ? normalizedDate.slice(0, 7) : new Date().toISOString().slice(0, 7));
    if (!normalizedMonth) {
      return res.status(400).json({
        success: false,
        message: "month YYYY-MM formatida bo'lishi kerak"
      });
    }
    if (date && !normalizedDate) {
      return res.status(400).json({
        success: false,
        message: "date YYYY-MM-DD formatida bo'lishi kerak"
      });
    }

    let normalizedShift = null;
    if (shift) {
      const shiftRaw = String(shift).trim().toLowerCase();
      if (shiftRaw === 'morning' || shiftRaw === 'kunduzgi') {
        normalizedShift = 'morning';
      } else if (shiftRaw === 'evening' || shiftRaw === 'kechki') {
        normalizedShift = 'evening';
      } else {
        return res.status(400).json({
          success: false,
          message: "shift faqat kunduzgi/kechki (yoki morning/evening) bo'lishi mumkin"
        });
      }
    }

    const { end: monthEndObj } = getMonthStartEnd(normalizedMonth);
    const monthEnd = formatDateUtc(monthEndObj);
    const attendanceDate = normalizedDate || monthEnd;
    const attendanceMonth = attendanceDate.slice(0, 7);
    const targetWeekday = new Date(`${attendanceDate}T00:00:00.000Z`).getUTCDay();

    const result = await pool.query(
      `SELECT
         u.id as teacher_id,
         u.name,
         u.surname,
         CONCAT(u.name, ' ', u.surname) as full_name,
         COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.name), NULL), ARRAY[]::text[]) as subjects,
         COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.room_number::text), NULL), ARRAY[]::text[]) as room_numbers,
         COUNT(DISTINCT g.id) as groups_count,
         COUNT(sg.student_id) as students_count,
         COUNT(*) FILTER (WHERE sg.status = 'active') as active_students_count,
         COUNT(*) FILTER (WHERE sg.status = 'stopped') as stopped_students_count,
         COUNT(*) FILTER (WHERE sg.status = 'finished') as finished_students_count
       FROM users u
       LEFT JOIN groups g ON g.teacher_id = u.id
         AND g.branch_id = $2
         AND g.class_status = 'started'
         AND g.status IN ('active', 'blocked')
         AND COALESCE(g.class_start_date, g.start_date, g.created_at::date) <= $1::date
         AND ($3::int IS NULL OR g.subject_id = $3)
       LEFT JOIN student_groups sg ON sg.group_id = g.id
         AND sg.branch_id = $2
         AND DATE(sg.joined_at) <= $1::date
       LEFT JOIN subjects s ON s.id = g.subject_id AND s.branch_id = $2
       LEFT JOIN rooms r ON r.id = g.room_id AND r.branch_id = $2
       WHERE u.role = 'teacher'
         AND u.branch_id = $2
       GROUP BY u.id, u.name, u.surname
       HAVING COUNT(DISTINCT g.id) > 0
       ORDER BY u.name, u.surname`,
      [attendanceDate, branchId, subjectIdParam]
    );

    const groupsForSchedule = await pool.query(
      `SELECT g.id, g.teacher_id, g.schedule
       FROM groups g
       WHERE g.class_status = 'started'
         AND g.status IN ('active', 'blocked')
         AND g.teacher_id IS NOT NULL
         AND g.branch_id = $2
         AND COALESCE(g.class_start_date, g.start_date, g.created_at::date) <= $1::date
         AND ($3::int IS NULL OR g.subject_id = $3)`,
      [attendanceDate, branchId, subjectIdParam]
    );

    const todayGroupsCount = new Map();
    for (const group of groupsForSchedule.rows) {
      let dayOk = true;
      let shiftOk = true;

      const rawDays = Array.isArray(group.schedule?.days) ? group.schedule.days : [];
      const groupWeekdays = rawDays
        .map((d) => String(d || '').trim().toLowerCase())
        .map((d) => WEEKDAY_MAP[d])
        .filter((d) => Number.isInteger(d));
      dayOk = groupWeekdays.includes(targetWeekday);

      if (normalizedShift) {
        const slot = parseScheduleTimeRange(group.schedule);
        const groupShift = getShiftFromTime(slot.start_time);
        shiftOk = groupShift === normalizedShift;
      }

      if (!dayOk || !shiftOk) continue;

      const teacherKey = String(group.teacher_id);
      todayGroupsCount.set(teacherKey, (todayGroupsCount.get(teacherKey) || 0) + 1);
    }

    const allTodayGroupIds = groupsForSchedule.rows
      .filter((group) => {
        const rawDays = Array.isArray(group.schedule?.days) ? group.schedule.days : [];
        const groupWeekdays = rawDays
          .map((d) => String(d || '').trim().toLowerCase())
          .map((d) => WEEKDAY_MAP[d])
          .filter((d) => Number.isInteger(d));
        if (!groupWeekdays.includes(targetWeekday)) return false;
        if (normalizedShift) {
          const slot = parseScheduleTimeRange(group.schedule);
          const groupShift = getShiftFromTime(slot.start_time);
          return groupShift === normalizedShift;
        }
        return true;
      })
      .map((group) => Number(group.id));
    const scheduledStudentCounts = new Map();
    if (allTodayGroupIds.length > 0) {
      const scheduledStudentsResult = await pool.query(
       `SELECT
           g.teacher_id,
           COUNT(sg.student_id) as students_count,
           COUNT(*) FILTER (WHERE sg.status = 'active') as active_students_count,
           COUNT(*) FILTER (WHERE sg.status = 'stopped') as stopped_students_count,
           COUNT(*) FILTER (WHERE sg.status = 'finished') as finished_students_count
       FROM student_groups sg
       JOIN groups g ON g.id = sg.group_id
       WHERE g.id = ANY($1::int[])
          AND DATE(sg.joined_at) <= $2::date
          AND (sg.left_at IS NULL OR DATE(sg.left_at) > $2::date)
          AND g.branch_id = $3
          AND sg.branch_id = $3
        GROUP BY g.teacher_id`,
        [allTodayGroupIds, attendanceDate, branchId]
      );

      for (const row of scheduledStudentsResult.rows) {
        scheduledStudentCounts.set(String(row.teacher_id), {
          students_count: Number(row.students_count) || 0,
          active_students_count: Number(row.active_students_count) || 0,
          stopped_students_count: Number(row.stopped_students_count) || 0,
          finished_students_count: Number(row.finished_students_count) || 0,
        });
      }
    }

    const completedResult = await pool.query(
      `WITH lesson_attendance AS (
         SELECT
           l.id,
           l.group_id,
           g3.teacher_id AS current_teacher_id,
           CASE
             WHEN COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) > 0
              AND COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) = COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END)
             THEN true
             ELSE false
           END as attendance_completed
         FROM lessons l
         LEFT JOIN groups g3 ON g3.id = l.group_id AND g3.branch_id = l.branch_id
         LEFT JOIN attendance a ON a.lesson_id = l.id
           AND a.branch_id = $2
           AND EXISTS (
             SELECT 1 FROM student_groups sg
             WHERE sg.student_id = a.student_id
               AND sg.group_id = a.group_id
               AND sg.branch_id = $2
               AND DATE(sg.joined_at) <= l.date
               AND (sg.left_at IS NULL OR DATE(sg.left_at) > l.date)
           )
         WHERE l.date = $1::date
           AND l.branch_id = $2
           AND COALESCE(l.is_holiday, false) = false
           AND ($3::int IS NULL OR g3.subject_id = $3)
           ${normalizedShift === 'morning'
             ? `AND l.start_time < '13:00:00'::time`
             : normalizedShift === 'evening'
               ? `AND l.start_time >= '13:00:00'::time`
               : ''}
         GROUP BY l.id, l.group_id, g3.teacher_id
       )
       SELECT
         current_teacher_id AS teacher_id,
         COUNT(DISTINCT group_id) as groups_with_lessons,
         COUNT(DISTINCT CASE WHEN attendance_completed THEN group_id END) as completed_groups
       FROM lesson_attendance
       GROUP BY current_teacher_id`,
      [attendanceDate, branchId, subjectIdParam]
    );

    const completedMap = new Map();
    for (const row of completedResult.rows) {
      completedMap.set(String(row.teacher_id), {
        groups_with_lessons: Number(row.groups_with_lessons) || 0,
        completed_groups: Number(row.completed_groups) || 0
      });
    }

    const enriched = result.rows.map((row) => {
      const teacherKey = String(row.teacher_id);
      const todayCount = todayGroupsCount.get(teacherKey) || 0;
      const scheduledStudents = scheduledStudentCounts.get(teacherKey) || {
        students_count: 0,
        active_students_count: 0,
        stopped_students_count: 0,
        finished_students_count: 0
      };
      const completion = completedMap.get(teacherKey) || { completed_groups: 0, groups_with_lessons: 0 };
      return {
        ...row,
        today_date: attendanceDate,
        today_shift: normalizedShift || null,
        groups_count: Number(row.groups_count) || 0,
        today_groups_count: todayCount,
        today_marked_groups_count: completion.completed_groups,
        students_count: scheduledStudents.students_count,
        active_students_count: scheduledStudents.active_students_count,
        stopped_students_count: scheduledStudents.stopped_students_count,
        finished_students_count: scheduledStudents.finished_students_count
      };
    });

    return res.json({
      success: true,
      data: enriched,
      meta: {
        month: attendanceMonth,
        date: attendanceDate,
        shift: normalizedShift || null
      }
    });
  } catch (error) {
    console.error('Teacher ro\'yxatini olishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 2. TEACHER BO'YICHA GURUHLAR RO'YXATI
// ============================================================================
exports.getTeacherGroupsForAttendance = async (req, res) => {
  const { teacher_id } = req.params;
  const { date, month, day, shift } = req.query;

  try {
    const branchId = getScopedBranchId(req);
    const teacherIdNum = Number(teacher_id);
    if (!Number.isInteger(teacherIdNum) || teacherIdNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'teacher_id noto\'g\'ri'
      });
    }

    const teacherResult = await pool.query(
      `SELECT id, name, surname
       FROM users
       WHERE id = $1 AND role = 'teacher' AND branch_id = $2`,
      [teacherIdNum, branchId]
    );

    if (teacherResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Teacher topilmadi'
      });
    }

    let attendanceDate = null;
    if (date) {
      if (!isValidDate(date)) {
        return res.status(400).json({
          success: false,
          message: "date YYYY-MM-DD formatida bo'lishi kerak"
        });
      }
      attendanceDate = date;
    } else if (month) {
      const normalizedMonth = normalizeMonthParam(month);
      if (!normalizedMonth) {
        return res.status(400).json({
          success: false,
          message: "month YYYY-MM formatida bo'lishi kerak"
        });
      }
      const { end } = getMonthStartEnd(normalizedMonth);
      attendanceDate = formatDateUtc(end);
    } else {
      attendanceDate = new Date().toISOString().slice(0, 10);
    }

    const groupsResult = await pool.query(
      `SELECT
         g.id as group_id,
         g.name as group_name,
         g.status,
         g.class_status,
         g.price,
         TO_CHAR(g.class_start_date, 'YYYY-MM-DD') as class_start_date,
         g.schedule,
         s.id as subject_id,
         s.name as subject_name,
         r.id as room_id,
         r.room_number,
         COUNT(sg.student_id) as students_count,
         COUNT(*) FILTER (WHERE sg.status = 'active') as active_students_count,
         COUNT(*) FILTER (WHERE sg.status = 'stopped') as stopped_students_count,
         COUNT(*) FILTER (WHERE sg.status = 'finished') as finished_students_count
       FROM groups g
       LEFT JOIN subjects s ON s.id = g.subject_id AND s.branch_id = g.branch_id
       LEFT JOIN rooms r ON r.id = g.room_id AND r.branch_id = g.branch_id
       LEFT JOIN student_groups sg ON sg.group_id = g.id
         AND sg.branch_id = g.branch_id
         AND DATE(sg.joined_at) <= $2::date
         AND (sg.left_at IS NULL OR DATE(sg.left_at) > $2::date)
       WHERE g.teacher_id = $1
         AND g.branch_id = $3
         AND g.class_status = 'started'
         AND g.status IN ('active', 'blocked')
         AND COALESCE(g.class_start_date, g.start_date, g.created_at::date) <= $2::date
       GROUP BY g.id, s.id, s.name, r.id, r.room_number
       ORDER BY g.name`,
      [teacherIdNum, attendanceDate, branchId]
    );

    let targetWeekday = null;
    if (date) {
      targetWeekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    } else if (!month && day) {
      const normalizedDay = String(day).trim().toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(WEEKDAY_MAP, normalizedDay)) {
        return res.status(400).json({
          success: false,
          message: "day noto'g'ri (masalan: dushanba/chorshanba yoki monday/wednesday)"
        });
      }
      targetWeekday = WEEKDAY_MAP[normalizedDay];
    }

    let normalizedShift = null;
    if (shift) {
      const shiftRaw = String(shift).trim().toLowerCase();
      if (shiftRaw === 'morning' || shiftRaw === 'kunduzgi') {
        normalizedShift = 'morning';
      } else if (shiftRaw === 'evening' || shiftRaw === 'kechki') {
        normalizedShift = 'evening';
      } else {
        return res.status(400).json({
          success: false,
          message: "shift faqat kunduzgi/kechki (yoki morning/evening) bo'lishi mumkin"
        });
      }
    }

    const filteredGroups = groupsResult.rows.filter((group) => {
      let dayOk = true;
      let shiftOk = true;

      if (targetWeekday !== null) {
        const rawDays = Array.isArray(group.schedule?.days) ? group.schedule.days : [];
        const groupWeekdays = rawDays
          .map((d) => String(d || '').trim().toLowerCase())
          .map((d) => WEEKDAY_MAP[d])
          .filter((d) => Number.isInteger(d));
        dayOk = groupWeekdays.includes(targetWeekday);
      }

      if (normalizedShift) {
        const slot = parseScheduleTimeRange(group.schedule);
        const groupShift = getShiftFromTime(slot.start_time);
        shiftOk = groupShift === normalizedShift;
      }

      return dayOk && shiftOk;
    });

    const lessonStatsResult = await pool.query(
      `WITH lesson_stats AS (
         SELECT
           l.id as lesson_id,
           l.group_id,
           COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) as active_students_count,
           COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END) as marked_students_count,
           CASE
             WHEN COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) > 0
              AND COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) = COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END)
             THEN true
             ELSE false
           END as attendance_completed,
           CASE WHEN r.lesson_id IS NOT NULL THEN true ELSE false END as report_sent
         FROM lessons l
         LEFT JOIN attendance a ON a.lesson_id = l.id
           AND a.branch_id = $3
           AND EXISTS (
             SELECT 1 FROM student_groups sg
             WHERE sg.student_id = a.student_id
               AND sg.group_id = a.group_id
               AND sg.branch_id = $3
               AND DATE(sg.joined_at) <= l.date
               AND (sg.left_at IS NULL OR DATE(sg.left_at) > l.date)
           )
         LEFT JOIN teacher_lesson_statistics_reports r
           ON r.lesson_id = l.id
          AND r.branch_id = $3
         WHERE l.group_id = ANY($1::int[])
           AND l.date = $2::date
           AND l.branch_id = $3
           AND COALESCE(l.is_holiday, false) = false
         GROUP BY l.id, l.group_id, r.lesson_id
       )
       SELECT
         group_id,
         COUNT(*) as lessons_today_count,
         COALESCE(SUM(active_students_count), 0) as active_students_count,
         COALESCE(SUM(marked_students_count), 0) as marked_students_count,
         BOOL_OR(attendance_completed) as any_attendance_completed,
         BOOL_AND(attendance_completed) as all_attendance_completed,
         COUNT(*) FILTER (WHERE report_sent) as reported_lessons_count,
         BOOL_OR(report_sent) as any_report_sent,
         BOOL_AND(report_sent) as all_reports_sent
       FROM lesson_stats
       GROUP BY group_id`,
      [filteredGroups.map((g) => g.group_id), attendanceDate, branchId]
    );

    const lessonStatsMap = new Map();
    for (const row of lessonStatsResult.rows) {
      lessonStatsMap.set(String(row.group_id), {
        lessons_today_count: Number(row.lessons_today_count) || 0,
        active_students_count: Number(row.active_students_count) || 0,
        marked_students_count: Number(row.marked_students_count) || 0,
        any_attendance_completed: Boolean(row.any_attendance_completed),
        all_attendance_completed: Boolean(row.all_attendance_completed),
        reported_lessons_count: Number(row.reported_lessons_count) || 0,
        any_report_sent: Boolean(row.any_report_sent),
        all_reports_sent: Boolean(row.all_reports_sent)
      });
    }

    const groupsWithStatus = filteredGroups.map((group) => {
      const stats = lessonStatsMap.get(String(group.group_id)) || {
        lessons_today_count: 0,
        active_students_count: 0,
        marked_students_count: 0,
        any_attendance_completed: false,
        all_attendance_completed: false,
        reported_lessons_count: 0,
        any_report_sent: false,
        all_reports_sent: false
      };

      return {
        ...group,
        today_date: attendanceDate,
        today_lessons_count: stats.lessons_today_count,
        today_active_students_count: stats.active_students_count,
        today_marked_students_count: stats.marked_students_count,
        today_attendance_completed: stats.any_attendance_completed,
        today_attendance_fully_completed: stats.all_attendance_completed,
        today_reported_lessons_count: stats.reported_lessons_count,
        today_report_sent: stats.any_report_sent,
        today_report_fully_sent: stats.all_reports_sent
      };
    });

    return res.json({
      success: true,
      data: {
        teacher: {
          teacher_id: teacherResult.rows[0].id,
          full_name: `${teacherResult.rows[0].name} ${teacherResult.rows[0].surname}`
        },
        filters: {
          date: date || null,
          day: day || null,
          shift: normalizedShift || null
        },
        groups: groupsWithStatus
      }
    });
  } catch (error) {
    console.error('Teacher guruhlarini olishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 3. GURUHLAR RO'YXATI (Attendance uchun)
// ============================================================================
exports.getGroupsForAttendance = async (req, res) => {
  const { role, id: userId } = req.user;
  const { teacher_id, subject_id, status_filter = 'all', date, day, shift, count_mode } = req.query;
  
  try {
    const branchId = getScopedBranchId(req);
    const countAllStudents = String(count_mode || '').trim().toLowerCase() === 'all';
    const attendanceDate = date || new Date().toISOString().slice(0, 10);
    let targetWeekday = null;
    if (date) {
      if (!isValidDate(date)) {
        return res.status(400).json({
          success: false,
          message: "date YYYY-MM-DD formatida bo'lishi kerak"
        });
      }
      targetWeekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    } else if (day) {
      const normalizedDay = String(day).trim().toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(WEEKDAY_MAP, normalizedDay)) {
        return res.status(400).json({
          success: false,
          message: "day noto'g'ri (masalan: dushanba/chorshanba yoki monday/wednesday)"
        });
      }
      targetWeekday = WEEKDAY_MAP[normalizedDay];
    }

    let normalizedShift = null;
    if (shift) {
      const shiftRaw = String(shift).trim().toLowerCase();
      if (shiftRaw === 'morning' || shiftRaw === 'kunduzgi') {
        normalizedShift = 'morning';
      } else if (shiftRaw === 'evening' || shiftRaw === 'kechki') {
        normalizedShift = 'evening';
      } else {
        return res.status(400).json({
          success: false,
          message: "shift faqat kunduzgi/kechki (yoki morning/evening) bo'lishi mumkin"
        });
      }
    }

    let query = `
      SELECT 
        g.id,
        g.name,
        g.status,
        g.class_status,
        s.name as subject_name,
        COALESCE(CONCAT(t.name, ' ', t.surname), 'O''qituvchi yo''q') as teacher_name,
        COUNT(sg.student_id) as students_count,
        g.class_start_date,
        g.schedule,
        r.room_number
      FROM groups g
      LEFT JOIN subjects s ON g.subject_id = s.id AND s.branch_id = g.branch_id
      LEFT JOIN users t ON g.teacher_id = t.id AND t.branch_id = g.branch_id
      LEFT JOIN student_groups sg ON g.id = sg.group_id
        AND sg.branch_id = g.branch_id
        AND sg.status = 'active'
        ${countAllStudents ? '' : 'AND DATE(sg.joined_at) <= $1::date AND (sg.left_at IS NULL OR DATE(sg.left_at) > $1::date)'}
      LEFT JOIN rooms r ON g.room_id = r.id AND r.branch_id = g.branch_id
      WHERE g.class_status = 'started'
    `;
    
    const params = [];
    let paramIndex = 1;
    if (!countAllStudents) {
      params.push(attendanceDate);
      paramIndex++;
    }

    query += ` AND g.branch_id = $${paramIndex}`;
    params.push(branchId);
    paramIndex++;
    
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
    if (teacher_id && (role === 'admin' || role === 'super_admin')) {
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

    const filteredGroups = result.rows.filter((group) => {
      let dayOk = true;
      let shiftOk = true;

      if (targetWeekday !== null) {
        const rawDays = Array.isArray(group.schedule?.days) ? group.schedule.days : [];
        const groupWeekdays = rawDays
          .map((d) => String(d || '').trim().toLowerCase())
          .map((d) => WEEKDAY_MAP[d])
          .filter((d) => Number.isInteger(d));
        dayOk = groupWeekdays.includes(targetWeekday);
      }

      if (normalizedShift) {
        const slot = parseScheduleTimeRange(group.schedule);
        const groupShift = getShiftFromTime(slot.start_time);
        shiftOk = groupShift === normalizedShift;
      }

      return dayOk && shiftOk;
    });
    
    let attendanceStatsMap = new Map();

    if (filteredGroups.length > 0) {
      const groupIds = filteredGroups.map((g) => g.id);
      const lessonStatsResult = await pool.query(
        `WITH lesson_attendance AS (
           SELECT
             l.id as lesson_id,
             l.group_id,
             COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) as active_students_count,
             COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END) as marked_students_count,
             CASE
               WHEN COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END) > 0 THEN true
               ELSE false
             END as attendance_completed,
             CASE WHEN r.lesson_id IS NOT NULL THEN true ELSE false END as report_sent
         FROM lessons l
         LEFT JOIN attendance a ON a.lesson_id = l.id
           AND a.branch_id = $3
           AND EXISTS (
             SELECT 1 FROM student_groups sg
             WHERE sg.student_id = a.student_id
               AND sg.group_id = a.group_id
               AND sg.branch_id = $3
               AND DATE(sg.joined_at) <= l.date
               AND (sg.left_at IS NULL OR DATE(sg.left_at) > l.date)
           )
         LEFT JOIN teacher_lesson_statistics_reports r
           ON r.lesson_id = l.id
          AND r.branch_id = $3
         WHERE l.date = $1::date
           AND l.group_id = ANY($2::int[])
           AND l.branch_id = $3
           AND COALESCE(l.is_holiday, false) = false
         GROUP BY l.id, l.group_id, r.lesson_id
       )
       SELECT
         group_id,
         COUNT(*) as lessons_today_count,
         COALESCE(SUM(active_students_count), 0) as active_students_count,
         COALESCE(SUM(marked_students_count), 0) as marked_students_count,
         BOOL_OR(attendance_completed) as any_attendance_completed,
         BOOL_AND(attendance_completed) as all_attendance_completed,
         COUNT(*) FILTER (WHERE report_sent) as reported_lessons_count,
         BOOL_OR(report_sent) as any_report_sent,
         BOOL_AND(report_sent) as all_reports_sent
       FROM lesson_attendance
       GROUP BY group_id`,
        [attendanceDate, groupIds, branchId]
      );

      for (const row of lessonStatsResult.rows) {
        attendanceStatsMap.set(String(row.group_id), {
          lessons_today_count: Number(row.lessons_today_count) || 0,
          active_students_count: Number(row.active_students_count) || 0,
          marked_students_count: Number(row.marked_students_count) || 0,
          any_attendance_completed: Boolean(row.any_attendance_completed),
          all_attendance_completed: Boolean(row.all_attendance_completed),
          reported_lessons_count: Number(row.reported_lessons_count) || 0,
          any_report_sent: Boolean(row.any_report_sent),
          all_reports_sent: Boolean(row.all_reports_sent)
        });
      }
    }

    const groupsWithStatus = filteredGroups.map((group) => {
      const stats = attendanceStatsMap.get(String(group.id)) || {
        lessons_today_count: 0,
        active_students_count: 0,
        marked_students_count: 0,
        any_attendance_completed: false,
        all_attendance_completed: false,
        reported_lessons_count: 0,
        any_report_sent: false,
        all_reports_sent: false
      };

      return {
        ...group,
        today_date: attendanceDate,
        today_lessons_count: stats.lessons_today_count,
        today_active_students_count: stats.active_students_count,
        today_marked_students_count: stats.marked_students_count,
        today_attendance_completed: stats.any_attendance_completed,
        today_attendance_fully_completed: stats.all_attendance_completed,
        today_reported_lessons_count: stats.reported_lessons_count,
        today_report_sent: stats.any_report_sent,
        today_report_fully_sent: stats.all_reports_sent
      };
    });

    res.json({
      success: true,
      data: groupsWithStatus,
      filters: {
        date: date || null,
        day: day || null,
        shift: normalizedShift || null
      }
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
  const { group_id, date, teacher_id, subject_id, room_id, start_time, end_time, status } = req.body;
  const { id: userId, role } = req.user;
  const branchId = getScopedBranchId(req);
  
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

    const requestedStartTime = normalizeTimeValue(start_time);
    const requestedEndTime = end_time ? normalizeTimeValue(end_time, null) : null;
    const allowedLessonStatuses = ['not_started', 'open', 'closed'];
    const lessonStatus = status && allowedLessonStatuses.includes(status)
      ? status
      : getDefaultLessonStatusForDate(date);

    const groupResult = await pool.query(
      `SELECT id, teacher_id, subject_id, room_id
       FROM groups
       WHERE id = $1 AND branch_id = $2`,
      [group_id, branchId]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const group = groupResult.rows[0];
    if (role === 'teacher' && String(group.teacher_id || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'zingizga biriktirilgan guruhga lesson yarata olasiz'
      });
    }

    const finalTeacherId = teacher_id || group.teacher_id || userId;
    const finalSubjectId = subject_id || group.subject_id || null;
    const finalRoomId = room_id || group.room_id || null;
    const holidayForDate = await isHolidayDate(date, branchId);

    if (role === 'teacher' && String(finalTeacherId || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Teacher faqat o\'ziga tegishli lesson yaratishi mumkin'
      });
    }

    // Shu sana + vaqt uchun dars borligini tekshirish
    const existingLesson = await pool.query(
      'SELECT id FROM lessons WHERE group_id = $1 AND date = $2 AND start_time = $3::time AND branch_id = $4',
      [group_id, date, requestedStartTime, branchId]
    );

    if (existingLesson.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Shu sana/vaqt uchun dars allaqachon yaratilgan'
      });
    }

    // Yangi dars yaratish
    const newLesson = await pool.query(
      `INSERT INTO lessons (
         group_id, teacher_id, subject_id, room_id, date, start_time, end_time, status, created_by, is_holiday, branch_id
       ) VALUES ($1, $2, $3, $4, $5::date, $6::time, $7::time, $8, $9, $10, $11)
       RETURNING id, date, teacher_id, subject_id, room_id, start_time, end_time, status, is_holiday`,
      [
        group_id,
        finalTeacherId,
        finalSubjectId,
        finalRoomId,
        date,
        requestedStartTime,
        requestedEndTime,
        lessonStatus,
        userId,
        holidayForDate,
        branchId
      ]
    );
    const lesson_id = newLesson.rows[0].id;
    const syncResult = await syncLessonAttendanceForDate(lesson_id, group_id, date, branchId);

    res.json({
      success: true,
      message: 'Dars yaratildi',
      data: {
        lesson_id,
        group_id: parseInt(group_id),
        date: newLesson.rows[0].date,
        teacher_id: newLesson.rows[0].teacher_id,
        subject_id: newLesson.rows[0].subject_id,
        room_id: newLesson.rows[0].room_id,
        start_time: newLesson.rows[0].start_time,
        end_time: newLesson.rows[0].end_time,
        status: newLesson.rows[0].status,
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
  const { role, id: userId } = req.user;
  const branchId = getScopedBranchId(req);
  
  try {
    // Dars ma'lumotlarini olish
    const lessonInfo = await pool.query(
      `SELECT l.group_id, TO_CHAR(l.date, 'YYYY-MM') as month, COALESCE(l.teacher_id, g.teacher_id) as teacher_id
       FROM lessons l
       LEFT JOIN groups g ON g.id = l.group_id AND g.branch_id = l.branch_id
       WHERE l.id = $1 AND l.branch_id = $2`,
      [lesson_id, branchId]
    );

    if (lessonInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dars topilmadi'
      });
    }

    const { group_id, month, teacher_id } = lessonInfo.rows[0];

    if (role === 'teacher' && String(teacher_id || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'zingizga biriktirilgan lessonni ko\'ra olasiz'
      });
    }

    // Dars sanasini olish (birinchi bo'lib)
    const lessonDate = await pool.query(
      `SELECT date FROM lessons WHERE id = $1 AND branch_id = $2`,
      [lesson_id, branchId]
    );
    const currentLessonDate = lessonDate.rows[0].date;

    // Avval eski/noto'g'ri attendance yozuvlarini tozalaymiz:
    // student lesson sanasida guruhda bo'lmagan bo'lsa bu lessondan o'chiriladi.
    await pool.query(
      `DELETE FROM attendance a
       USING lessons l
       WHERE a.lesson_id = l.id
         AND a.lesson_id = $1
         AND a.branch_id = $2
         AND l.branch_id = $2
         AND l.status IN ('not_started', 'open')
         AND COALESCE(a.is_marked, false) = false
         AND a.updated_at = a.created_at
         AND NOT EXISTS (
           SELECT 1
           FROM student_groups sg
           WHERE sg.student_id = a.student_id
             AND sg.group_id = l.group_id
             AND sg.branch_id = l.branch_id
             AND DATE(sg.joined_at) <= l.date
             AND (sg.left_at IS NULL OR DATE(sg.left_at) > l.date)
         )`,
      [lesson_id, branchId]
    );

    // Guruhdagi barcha talabalarni olish - faqat shu dars sanasida guruhda bo'lganlar
    const allStudents = await pool.query(
      `SELECT DISTINCT
        sg.student_id,
        DATE(sg.joined_at) as joined_date
      FROM student_groups sg
      WHERE sg.group_id = $1
        AND sg.branch_id = $3
        AND DATE(sg.joined_at) <= $2::date
        AND (sg.left_at IS NULL OR DATE(sg.left_at) > $2::date)`,
      [group_id, currentLessonDate, branchId]
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
        `SELECT id FROM attendance WHERE lesson_id = $1 AND student_id = $2 AND branch_id = $3`,
        [lesson_id, student.student_id, branchId]
      );

      if (existingAttendance.rows.length === 0) {
        // Attendance yo'q - yaratish kerak
        console.log(`📝 Yangi attendance yaratilmoqda: student_id=${student.student_id}, lesson_id=${lesson_id}`);
        
        // Oxirgi oydagi statusni tekshirish
        const lastMonthStatus = await pool.query(
          `SELECT monthly_status 
           FROM attendance 
           WHERE student_id = $1 AND group_id = $2 
             AND branch_id = $3
           ORDER BY created_at DESC 
           LIMIT 1`,
          [student.student_id, group_id, branchId]
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
          `INSERT INTO attendance (lesson_id, student_id, group_id, branch_id, month, month_name, status, monthly_status, is_marked) 
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7, false)`,
          [lesson_id, student.student_id, group_id, branchId, month, 'kelmadi', initialStatus]
        );
      }
    }

    // Dars studentlarini olish - attendance yozuvi mavjud bo'lgan barcha studentlar
    // MUHIM: student chiqib ketgan bo'lsa ham, agar attendance yozuvi mavjud bo'lsa ko'rinsin
    const students = await pool.query(
      `SELECT 
         a.id as attendance_id,
         a.student_id,
         u.name,
         u.surname,
         u.surname || ' ' || u.name as student_name,
         u.phone,
         TO_CHAR(DATE(sg.joined_at), 'YYYY-MM-DD') as joined_at,
         CASE WHEN COALESCE(a.is_marked, false) THEN a.status ELSE NULL END as status,
         COALESCE(a.is_marked, false) as is_marked,
         a.monthly_status,
         CASE 
           WHEN a.monthly_status = 'active' THEN 'Faol'
           WHEN a.monthly_status = 'stopped' THEN 'Toxtatgan'
           WHEN a.monthly_status = 'finished' THEN 'Bitirgan'
           ELSE 'Nomalum'
         END as monthly_status_description,
         CASE WHEN a.monthly_status = 'active' THEN true ELSE false END as can_mark,
         COALESCE(ms.paid_amount, sp.paid_amount, 0) as paid_amount,
         COALESCE(ms.discount_amount, sp.discount_amount, 0) as discount_amount,
         COALESCE(
           ms.debt_amount,
           COALESCE(ms.required_amount, sp.required_amount, g.price, 0) - COALESCE(ms.paid_amount, sp.paid_amount, 0)
         ) as debt_amount
       FROM attendance a
       JOIN users u ON a.student_id = u.id AND u.branch_id = a.branch_id
       JOIN student_groups sg
         ON sg.student_id = a.student_id
        AND sg.group_id = a.group_id
        AND sg.branch_id = a.branch_id
        AND DATE(sg.joined_at) <= $2::date
        AND (sg.left_at IS NULL OR DATE(sg.left_at) > $2::date)
       LEFT JOIN monthly_snapshots ms 
         ON ms.student_id = a.student_id 
        AND ms.group_id = a.group_id 
        AND ms.month = COALESCE(a.month, a.month_name)
        AND ms.branch_id = a.branch_id
       LEFT JOIN student_payments sp
         ON sp.student_id = a.student_id
        AND sp.group_id = a.group_id
        AND sp.month = COALESCE(a.month, a.month_name)
        AND sp.branch_id = a.branch_id
       LEFT JOIN groups g ON g.id = a.group_id AND g.branch_id = a.branch_id
       WHERE a.lesson_id = $1 
         AND a.branch_id = $3
       ORDER BY a.monthly_status, u.name`,
      [lesson_id, currentLessonDate, branchId]
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
  const { role, id: userId } = req.user;
  const branchId = getScopedBranchId(req);
  
  try {
    if (!Array.isArray(attendance_records) || attendance_records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'attendance_records majburiy'
      });
    }

    const lessonAccess = await getLessonAttendanceAccess(lesson_id, branchId);

    if (lessonAccess.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dars topilmadi'
      });
    }

    const lesson = lessonAccess.rows[0];
    if (role === 'teacher' && String(lesson.teacher_id || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'zingizga biriktirilgan lesson davomatini belgilay olasiz'
      });
    }

    if (lesson.is_holiday) {
      return res.status(409).json({
        success: false,
        message: 'Dam olish kuni uchun davomat belgilab bo\'lmaydi'
      });
    }

    if (role === 'teacher' && lesson.status === 'closed') {
      return res.status(409).json({
        success: false,
        message: 'Yopilgan (closed) lesson uchun teacher davomatni o\'zgartira olmaydi'
      });
    }

    const { updatedCount } = await processAttendanceRecordsForLesson({
      lesson,
      attendanceRecords: attendance_records,
      userId
    });

    res.json({
      success: true,
      message: 'Davomat belgilandi',
      updated_count: updatedCount
    });

  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        attendance_id: error.attendance_id || null
      });
    }

    console.error('Davomat belgilashda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 4.1 KUNLIK DAVOMAT (BARCHA GURUHLAR)
// ============================================================================
exports.getAttendanceByDate = async (req, res) => {
  const { role, id: userId } = req.user;
  const { date, teacher_id, group_id, subject_id, shift } = req.query;
  const branchId = getScopedBranchId(req);

  try {
    const selectedDate = date || new Date().toISOString().slice(0, 10);
    if (!isValidDate(selectedDate)) {
      return res.status(400).json({
        success: false,
        message: 'date YYYY-MM-DD formatida bo\'lishi kerak'
      });
    }

    let normalizedShift = null;
    if (shift) {
      const shiftRaw = String(shift).trim().toLowerCase();
      if (shiftRaw === 'morning' || shiftRaw === 'kunduzgi') {
        normalizedShift = 'morning';
      } else if (shiftRaw === 'evening' || shiftRaw === 'kechki') {
        normalizedShift = 'evening';
      } else {
        return res.status(400).json({
          success: false,
          message: "shift faqat kunduzgi/kechki (yoki morning/evening) bo'lishi mumkin"
        });
      }
    }

    const groupIdNum = group_id ? Number(group_id) : null;
    if (group_id && (!Number.isInteger(groupIdNum) || groupIdNum <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'group_id noto\'g\'ri'
      });
    }

    const teacherIdNum = teacher_id ? Number(teacher_id) : null;
    if (teacher_id && (!Number.isInteger(teacherIdNum) || teacherIdNum <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'teacher_id noto\'g\'ri'
      });
    }

    const subjectIdNum = subject_id ? Number(subject_id) : null;
    if (subject_id && (!Number.isInteger(subjectIdNum) || subjectIdNum <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'subject_id noto\'g\'ri'
      });
    }

    await ensureGeneratedLessonsForScope({
      month: selectedDate.slice(0, 7),
      createdBy: userId,
      teacherId: role === 'teacher' ? userId : (teacherIdNum || null),
      branchId
    });

    const params = [selectedDate, branchId];
    let paramIndex = 3;
    let query = `
      SELECT
        l.id as lesson_id,
        l.group_id,
        g.name as group_name,
        l.teacher_id,
        CONCAT(COALESCE(t.name, ''), ' ', COALESCE(t.surname, '')) as teacher_name,
        l.subject_id,
        COALESCE(s.name, gs.name) as subject_name,
        l.room_id,
        r.room_number,
        TO_CHAR(l.date, 'YYYY-MM-DD') as date,
        TO_CHAR(l.start_time, 'HH24:MI') as start_time,
        CASE WHEN l.end_time IS NOT NULL THEN TO_CHAR(l.end_time, 'HH24:MI') ELSE NULL END as end_time,
        l.status as lesson_status,
        COALESCE(l.is_holiday, false) as is_holiday,
        CASE WHEN tr.lesson_id IS NOT NULL THEN true ELSE false END as report_sent,
        COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) as active_students_count,
        COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END) as marked_students_count,
        CASE
          WHEN COALESCE(l.is_holiday, false) = true THEN 'holiday'
          WHEN COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END) > 0 THEN 'marked'
          ELSE 'not_marked'
        END as attendance_state,
        CASE
          WHEN COALESCE(l.is_holiday, false) = true THEN false
          WHEN COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END) > 0 THEN true
          ELSE false
        END as attendance_completed
      FROM lessons l
      LEFT JOIN groups g ON g.id = l.group_id AND g.branch_id = $2
      LEFT JOIN users t ON t.id = COALESCE(l.teacher_id, g.teacher_id) AND t.branch_id = $2
      LEFT JOIN subjects s ON s.id = l.subject_id
      LEFT JOIN subjects gs ON gs.id = g.subject_id
      LEFT JOIN rooms r ON r.id = l.room_id AND r.branch_id = $2
      LEFT JOIN teacher_lesson_statistics_reports tr
        ON tr.lesson_id = l.id
       AND tr.branch_id = $2
      LEFT JOIN attendance a ON a.lesson_id = l.id
        AND a.branch_id = $2
        AND EXISTS (
          SELECT 1 FROM student_groups sg
          WHERE sg.student_id = a.student_id
            AND sg.group_id = a.group_id
            AND sg.branch_id = $2
            AND DATE(sg.joined_at) <= l.date
            AND (sg.left_at IS NULL OR DATE(sg.left_at) > l.date)
        )
      WHERE l.date = $1::date
        AND l.branch_id = $2
        AND COALESCE(l.is_holiday, false) = false`;

    if (role === 'teacher') {
      query += ` AND l.teacher_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (teacherIdNum) {
      query += ` AND l.teacher_id = $${paramIndex}`;
      params.push(teacherIdNum);
      paramIndex++;
    }

    if (groupIdNum) {
      query += ` AND l.group_id = $${paramIndex}`;
      params.push(groupIdNum);
      paramIndex++;
    }

    if (subjectIdNum) {
      query += ` AND COALESCE(l.subject_id, g.subject_id) = $${paramIndex}`;
      params.push(subjectIdNum);
      paramIndex++;
    }

    if (normalizedShift === 'morning') {
      query += ` AND l.start_time < '13:00:00'::time`;
    } else if (normalizedShift === 'evening') {
      query += ` AND l.start_time >= '13:00:00'::time`;
    }

    query += `
      GROUP BY
        l.id, l.group_id, g.name, l.teacher_id, t.name, t.surname,
        l.subject_id, s.name, gs.name, l.room_id, r.room_number,
        tr.lesson_id
      ORDER BY g.name, l.start_time ASC, l.id ASC`;

    const lessonsResult = await pool.query(query, params);
    const lessonRows = lessonsResult.rows.map((row) => ({
      ...row,
      lesson_id: Number(row.lesson_id),
      group_id: Number(row.group_id),
      teacher_id: row.teacher_id ? Number(row.teacher_id) : null,
      subject_id: row.subject_id ? Number(row.subject_id) : null,
      attendance_records: []
    }));

    for (const lesson of lessonRows) {
      await syncLessonAttendanceForDate(lesson.lesson_id, lesson.group_id, lesson.date, branchId);
    }

    const lessonIds = lessonRows.map((lesson) => lesson.lesson_id);
    const attendanceResult = lessonIds.length > 0
      ? await pool.query(
        `SELECT
           a.id as attendance_id,
           a.lesson_id,
           a.group_id,
           a.student_id,
           u.name,
           u.surname,
           u.phone,
           TO_CHAR(DATE(sg.joined_at), 'YYYY-MM-DD') as joined_at,
           TO_CHAR(DATE(sg.left_at), 'YYYY-MM-DD') as left_at,
           CASE WHEN COALESCE(a.is_marked, false) THEN a.status ELSE NULL END as status,
           COALESCE(a.is_marked, false) as is_marked,
           a.monthly_status,
           CASE
             WHEN a.monthly_status = 'active' THEN true
             ELSE false
           END as can_mark,
           COALESCE(ms.paid_amount, sp.paid_amount, 0) as paid_amount,
           COALESCE(ms.discount_amount, sp.discount_amount, 0) as discount_amount,
           COALESCE(
             ms.debt_amount,
             COALESCE(ms.required_amount, sp.required_amount, g.price, 0) - COALESCE(ms.paid_amount, sp.paid_amount, 0)
           ) as debt_amount
         FROM attendance a
         JOIN lessons l ON l.id = a.lesson_id AND l.branch_id = a.branch_id
         JOIN users u ON u.id = a.student_id AND u.branch_id = a.branch_id
         JOIN student_groups sg
           ON sg.student_id = a.student_id
          AND sg.group_id = a.group_id
          AND sg.branch_id = a.branch_id
          AND DATE(sg.joined_at) <= l.date
          AND (sg.left_at IS NULL OR DATE(sg.left_at) > l.date)
         LEFT JOIN monthly_snapshots ms
           ON ms.student_id = a.student_id
          AND ms.group_id = a.group_id
          AND ms.month = COALESCE(a.month, a.month_name)
          AND ms.branch_id = a.branch_id
         LEFT JOIN student_payments sp
           ON sp.student_id = a.student_id
          AND sp.group_id = a.group_id
          AND sp.month = COALESCE(a.month, a.month_name)
          AND sp.branch_id = a.branch_id
         LEFT JOIN groups g ON g.id = a.group_id AND g.branch_id = a.branch_id
         WHERE a.branch_id = $1
           AND l.date = $2::date
           AND a.lesson_id = ANY($3::int[])
         ORDER BY a.lesson_id, u.name, u.surname, a.student_id`,
        [branchId, selectedDate, lessonIds]
      )
      : { rows: [] };

    const lessonMap = new Map();
    const groupMap = new Map();

    for (const lesson of lessonRows) {
      lessonMap.set(String(lesson.lesson_id), lesson);
      const groupKey = String(lesson.group_id);
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          group_id: lesson.group_id,
          group_name: lesson.group_name,
          teacher_id: lesson.teacher_id,
          teacher_name: lesson.teacher_name,
          subject_id: lesson.subject_id,
          subject_name: lesson.subject_name,
          room_id: lesson.room_id,
          room_number: lesson.room_number,
          lessons: []
        });
      }
      groupMap.get(groupKey).lessons.push(lesson);
    }

    for (const row of attendanceResult.rows) {
      const lesson = lessonMap.get(String(row.lesson_id));
      if (!lesson) continue;
      lesson.attendance_records.push({
        attendance_id: Number(row.attendance_id),
        lesson_id: Number(row.lesson_id),
        group_id: Number(row.group_id),
        student_id: Number(row.student_id),
        name: row.name,
        surname: row.surname,
        phone: row.phone,
        joined_at: row.joined_at,
        left_at: row.left_at,
        status: row.status,
        is_marked: Boolean(row.is_marked),
        monthly_status: row.monthly_status,
        can_mark: Boolean(row.can_mark),
        paid_amount: Number(row.paid_amount) || 0,
        discount_amount: Number(row.discount_amount) || 0,
        debt_amount: Number(row.debt_amount) || 0,
      });
    }

    const lessonsWithAttendance = lessonRows.map((lesson) => ({
      ...lesson,
      attendance_records: lesson.attendance_records
    }));

    const groups = Array.from(groupMap.values()).map((group) => ({
      ...group,
      lessons: group.lessons.map((lesson) => ({
        ...lesson,
        attendance_records: lesson.attendance_records
      }))
    }));

    return res.json({
      success: true,
      data: {
        date: selectedDate,
        filters: {
          teacher_id: teacherIdNum || null,
          group_id: groupIdNum || null,
          subject_id: subjectIdNum || null,
          shift: normalizedShift || null
        },
        lessons: lessonsWithAttendance,
        groups,
        summary: {
          groups_count: groups.length,
          lessons_count: lessonsWithAttendance.length,
          attendance_records_count: attendanceResult.rows.length
        }
      }
    });
  } catch (error) {
    console.error('Kunlik attendance ma\'lumotini olishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 4.2 KUNLIK DAVOMATNI BULK YANGILASH
// ============================================================================
exports.updateAttendanceByDate = async (req, res) => {
  const { role, id: userId } = req.user;
  const incomingBody = req.body || {};
  const payload = incomingBody?.data && typeof incomingBody.data === 'object'
    ? incomingBody.data
    : incomingBody;
  const { date, lessons, groups, lesson_id, attendance_records } = payload;
  const branchId = getScopedBranchId(req);

  try {
    const selectedDate = date || new Date().toISOString().slice(0, 10);
    if (!isValidDate(selectedDate)) {
      return res.status(400).json({
        success: false,
        message: 'date YYYY-MM-DD formatida bo\'lishi kerak'
      });
    }

    const payloadLessonMap = new Map();
    if (Array.isArray(lessons)) {
      for (const lesson of lessons) {
        if (lesson?.lesson_id) {
          payloadLessonMap.set(String(lesson.lesson_id), lesson);
        }
      }
    }
    if (Array.isArray(groups)) {
      for (const group of groups) {
        if (Array.isArray(group?.lessons)) {
          for (const lesson of group.lessons) {
            if (lesson?.lesson_id) {
              payloadLessonMap.set(String(lesson.lesson_id), lesson);
            }
          }
        }
      }
    }
    if (lesson_id && Array.isArray(attendance_records)) {
      payloadLessonMap.set(String(lesson_id), { lesson_id, attendance_records });
    }

    const payloadLessons = Array.from(payloadLessonMap.values());
    if (payloadLessons.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'lessons yoki groups yoki lesson_id + attendance_records majburiy'
      });
    }

    const updatedLessons = [];
    let totalUpdatedCount = 0;

    for (const item of payloadLessons) {
      const currentLessonId = Number(item.lesson_id);
      if (!Number.isInteger(currentLessonId) || currentLessonId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'lesson_id noto\'g\'ri'
        });
      }

      const records = Array.isArray(item.attendance_records) ? item.attendance_records : [];
      if (records.length === 0) {
        continue;
      }

      const lessonAccess = await getLessonAttendanceAccess(currentLessonId, branchId);
      if (lessonAccess.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Dars topilmadi',
          lesson_id: currentLessonId
        });
      }

      const lesson = lessonAccess.rows[0];
      if (String(lesson.lesson_date) !== selectedDate) {
        return res.status(400).json({
          success: false,
          message: `lesson_id=${currentLessonId} tanlangan sanaga mos emas`,
          lesson_date: lesson.lesson_date
        });
      }

      if (role === 'teacher' && String(lesson.teacher_id || '') !== String(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Siz faqat o\'zingizga biriktirilgan lesson davomatini belgilay olasiz'
        });
      }

      if (lesson.is_holiday) {
        return res.status(409).json({
          success: false,
          message: 'Dam olish kuni uchun davomat belgilab bo\'lmaydi'
        });
      }

      if (role === 'teacher' && lesson.status === 'closed') {
        return res.status(409).json({
          success: false,
          message: 'Yopilgan (closed) lesson uchun teacher davomatni o\'zgartira olmaydi'
        });
      }

      const normalizedRecords = records
        .filter((record) => record && record.attendance_id)
        .map((record) => ({
          ...record,
          status: record.status === '' ? null : record.status
        }));

      if (normalizedRecords.length === 0) {
        updatedLessons.push({
          lesson_id: currentLessonId,
          updated_count: 0
        });
        continue;
      }

      const result = await processAttendanceRecordsForLesson({
        lesson,
        attendanceRecords: normalizedRecords,
        userId
      });

      totalUpdatedCount += result.updatedCount;
      updatedLessons.push({
        lesson_id: currentLessonId,
        updated_count: result.updatedCount
      });
    }

    return res.json({
      success: true,
      message: 'Kunlik davomat yangilandi',
      updated_count: totalUpdatedCount,
      data: {
        date: selectedDate,
        lessons: updatedLessons
      }
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        attendance_id: error.attendance_id || null
      });
    }

    console.error('Kunlik attendance yangilashda xatolik:', error);
    return res.status(500).json({
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
  const { role, id: userId } = req.user;
  const branchId = getScopedBranchId(req);
  
  try {
    const normalizedMonth = normalizeMonthParam(month);
    if (month && !normalizedMonth) {
      return res.status(400).json({
        success: false,
        message: "month YYYY-MM formatida bo'lishi kerak (yoki YYYY-MM-DD yuborsangiz oyga aylantiriladi)"
      });
    }
    const selectedMonth = normalizedMonth || new Date().toISOString().slice(0, 7);

    // Avval guruh va teacher ma'lumotlarini olamiz
    const groupInfo = await pool.query(
      `SELECT 
         g.name as group_name,
         g.price as group_price,
         g.teacher_id,
         g.class_start_date,
         g.start_date,
         g.created_at,
         s.name as subject_name,
         CONCAT(t.name, ' ', t.surname) as teacher_name,
         t.name as teacher_first_name,
         t.surname as teacher_last_name
       FROM groups g
       JOIN subjects s ON g.subject_id = s.id  
       LEFT JOIN users t ON g.teacher_id = t.id
       WHERE g.id = $1 AND g.branch_id = $2`,
      [group_id, branchId]
    );

    if (groupInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const group = groupInfo.rows[0];
    const groupStartDate = formatTashkentDateYmd(group.class_start_date || group.start_date || group.created_at);
    if (role === 'teacher' && String(group.teacher_id || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'zingizning guruhingiz davomati ko\'ra olasiz'
      });
    }

    // Oyning barcha darslarini olish
    const [monthYear, monthNum] = selectedMonth.split('-').map(Number);
    const monthStart = `${selectedMonth}-01`;
    const monthEnd = `${selectedMonth}-${String(new Date(monthYear, monthNum, 0).getDate()).padStart(2, '0')}`;

    const lessons = await pool.query(
      `SELECT id AS lesson_id, id, TO_CHAR(date, 'YYYY-MM-DD') as date, TO_CHAR(date, 'DD') as day, is_holiday,
              TO_CHAR(start_time, 'HH24:MI') as start_time,
              TO_CHAR(end_time, 'HH24:MI') as end_time
       FROM lessons
       WHERE group_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2 AND branch_id = $3
         ${groupStartDate ? 'AND date >= $4::date' : ''}
       ORDER BY date`,
      groupStartDate ? [group_id, selectedMonth, branchId, groupStartDate] : [group_id, selectedMonth, branchId]
    );

    // SAFETY: shu oy darslaridagi attendance yozuvlari mavjudligini ta'minlaymiz
    // (bugun/kelajak sanalari uchun bo'sh kelishni oldini oladi)
    for (const lesson of lessons.rows) {
      await syncLessonAttendanceForDate(lesson.id, group_id, lesson.date, branchId);
    }

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
    
    const getMonthBounds = (monthStr) => {
      const [y, m] = monthStr.split('-').map(Number);
      const monthStart = `${monthStr}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const monthEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
      return { monthStart, monthEnd };
    };

    const pickJoinedAtForMonth = (periods, monthStr) => {
      if (!periods || periods.length === 0) return null;
      const { monthStart, monthEnd } = getMonthBounds(monthStr);
      const match = periods.find(p => {
        const joinedOk = !p.joined_at || p.joined_at <= monthEnd;
        const leftOk = !p.left_at || p.left_at > monthStart;
        return joinedOk && leftOk;
      });
      if (match) return match.joined_at;
      return periods[periods.length - 1].joined_at || null;
    };

    const isLessonWithinMembership = (lessonDate, periods) => {
      if (!lessonDate) return false;
      if (!periods || periods.length === 0) return true;

      return periods.some((period) => {
        const joinedOk = !period.joined_at || lessonDate >= period.joined_at;
        const leftOk = !period.left_at || lessonDate <= period.left_at;
        return joinedOk && leftOk;
      });
    };

    // Shu oydagi barcha attendance yozuvlari - student chiqib ketgan bo'lsa ham ko'rinsin
    const attendance = await pool.query(
      `SELECT 
         a.student_id,
         u.surname || ' ' || u.name as student_name,
         u.phone,
         a.monthly_status,
         json_agg(
             json_build_object(
               'lesson_id', l.id,
               'date', TO_CHAR(l.date, 'YYYY-MM-DD'),
               'is_holiday', COALESCE(l.is_holiday, false),
               'status', CASE WHEN COALESCE(a.is_marked, false) THEN a.status ELSE NULL END,
               'is_marked', COALESCE(a.is_marked, false)
             ) ORDER BY l.date
         ) as attendance_records,
         -- Statistika hisoblash (barcha mavjud attendance yozuvlari uchun)
         COUNT(CASE WHEN a.status = 'keldi' AND COALESCE(a.is_marked, false) AND COALESCE(l.is_holiday, false) = false THEN 1 END) as total_present,
         COUNT(CASE WHEN a.status = 'kelmadi' AND COALESCE(a.is_marked, false) AND COALESCE(l.is_holiday, false) = false THEN 1 END) as total_absent,
         COUNT(CASE WHEN a.status = 'kechikdi' AND COALESCE(a.is_marked, false) AND COALESCE(l.is_holiday, false) = false THEN 1 END) as total_late,
         COUNT(CASE WHEN COALESCE(a.is_marked, false) AND COALESCE(l.is_holiday, false) = false THEN 1 END) as total_lessons,
         MAX(COALESCE(ms.paid_amount, sp.paid_amount, 0)) as paid_amount,
         MAX(COALESCE(ms.discount_amount, sp.discount_amount, 0)) as discount_amount,
         MAX(
           COALESCE(
             ms.debt_amount,
             COALESCE(ms.required_amount, sp.required_amount, g.price, 0) - COALESCE(ms.paid_amount, sp.paid_amount, 0)
           )
         ) as debt_amount
       FROM attendance a
       JOIN users u ON a.student_id = u.id
       JOIN lessons l ON a.lesson_id = l.id
       LEFT JOIN monthly_snapshots ms 
         ON ms.student_id = a.student_id 
        AND ms.group_id = a.group_id 
        AND ms.month = COALESCE(a.month, a.month_name)
       LEFT JOIN student_payments sp
         ON sp.student_id = a.student_id
        AND sp.group_id = a.group_id
        AND sp.month = COALESCE(a.month, a.month_name)
       LEFT JOIN groups g ON g.id = a.group_id
       WHERE a.group_id = $1
         AND TO_CHAR(l.date, 'YYYY-MM') = $2
         AND EXISTS (
           SELECT 1
           FROM student_groups sg
           WHERE sg.student_id = a.student_id
             AND sg.group_id = a.group_id
             AND sg.branch_id = $3
             AND DATE(sg.joined_at) <= $5::date
             AND (sg.left_at IS NULL OR DATE(sg.left_at) > $4::date)
         )
       GROUP BY a.student_id, u.name, u.surname, u.phone, a.monthly_status
       ORDER BY a.monthly_status, u.name`,
      [group_id, selectedMonth, branchId, monthStart, monthEnd]
    );

    // Har bir student uchun statistika hisoblash va qo'shish
    const studentsWithStats = attendance.rows.map(student => {
      const periods = membershipPeriodsMap.get(student.student_id) || [];
      const joinedAtForMonth = pickJoinedAtForMonth(periods, selectedMonth);
      const filteredRecords = Array.isArray(student.attendance_records)
        ? student.attendance_records.map((record) => {
            const lessonDate = String(record?.date || '').slice(0, 10);
            if (!isLessonWithinMembership(lessonDate, periods)) {
              return {
                ...record,
                status: null,
                is_marked: false
              };
            }
            return record;
          })
        : [];

      const filteredNonHoliday = filteredRecords.filter((record) => !record.is_holiday);
      const totalAttended = filteredNonHoliday.filter(
        (record) => record.is_marked && (record.status === 'keldi' || record.status === 'present' || record.status === 'kechikdi' || record.status === 'late')
      ).length;
      const totalMissed = filteredNonHoliday.filter(
        (record) => record.is_marked && (record.status === 'kelmadi' || record.status === 'absent')
      ).length;
      const totalLate = filteredNonHoliday.filter(
        (record) => record.is_marked && (record.status === 'kechikdi' || record.status === 'late')
      ).length;
      const totalLessons = filteredNonHoliday.filter((record) => record.is_marked).length;
      const attendancePercentage = totalLessons > 0 ? Math.round((totalAttended / totalLessons) * 100) : 0;
      
      return {
        ...student,
        joined_at: joinedAtForMonth,
        membership_periods: membershipPeriodsMap.get(student.student_id) || [],
        attendance_records: filteredRecords,
        total_present: filteredNonHoliday.filter((record) =>
          record.is_marked && (record.status === 'keldi' || record.status === 'present')
        ).length,
        total_absent: totalMissed,
        total_late: totalLate,
        total_lessons: totalLessons,
        statistics: {
          total_attended: totalAttended,      // Nechta darsga qatnashdi (keldi + kechikdi)
          total_missed: totalMissed,        // Nechta darsni qoldirdi
          total_late: totalLate,            // Nechta marta kechikdi
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
// Default: { month: "2026-02" } - Faqat bitta oy
// Optional: { apply_scope: "months", months: ["2026-02", "2026-03"] } - Bir necha oylar
// Optional: { apply_scope: "from_month", from_month: "2026-02" } - Shu oydan keyingi barcha oylar
exports.updateStudentMonthlyStatus = async (req, res) => {
  const {
    student_id,
    group_id,
    monthly_status,
    month,
    months,
    from_month,
    apply_scope,
  } = req.body;
  
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

    const scope = String(apply_scope || '').trim().toLowerCase();
    const hasFromMonth = typeof from_month === 'string' && from_month.trim().length > 0;
    const hasMonths = Array.isArray(months) && months.length > 0;
    const hasSingleMonth = typeof month === 'string' && month.trim().length > 0;

    // Backward compatible:
    // - apply_scope yuborilsa, shu ishlaydi
    // - apply_scope yuborilmasa ham from_month / months bo'lsa avtomatik scope tanlanadi
    const useFromMonth = hasFromMonth && (scope === 'from_month' || !scope);
    const useMonths = hasMonths && (scope === 'months' || !scope);
    const useSingleMonth = hasSingleMonth && (!scope || scope === 'single_month' || scope === 'month');

    if (useFromMonth) {
      // Variant 3: Shu oydan keyingi barcha oylar
      mode = 'from_month_onwards';
      query = `UPDATE attendance 
               SET monthly_status = $1, updated_at = CURRENT_TIMESTAMP
               WHERE student_id = $2 AND group_id = $3 AND month >= $4
               RETURNING id, month, monthly_status`;
      params = [monthly_status, student_id, group_id, from_month];
    } else if (useMonths) {
      // Variant 2: Bir necha oylar
      mode = 'multiple_months';
      const monthPlaceholders = months.map((_, i) => `$${i + 4}`).join(', ');
      query = `UPDATE attendance 
               SET monthly_status = $1, updated_at = CURRENT_TIMESTAMP
               WHERE student_id = $2 AND group_id = $3 AND month IN (${monthPlaceholders})
               RETURNING id, month, monthly_status`;
      params = [monthly_status, student_id, group_id, ...months];
    } else if (useSingleMonth) {
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
        message: 'month yuboring yoki months/from_month parametrlaridan birini tanlang'
      });
    }

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hech qanday attendance topilmadi'
      });
    }

    // Monthly status o'zgartirilganda ayrim eski yozuvlarda kelmadi + is_marked=true
    // holati qolib ketishi mumkin. Open/not_started lessonlar uchun buni tozalaymiz.
    try {
      let normalizeQuery;
      let normalizeParams;

      if (useFromMonth) {
        normalizeQuery = `
          UPDATE attendance a
          SET is_marked = false
          FROM lessons l
          WHERE a.lesson_id = l.id
            AND a.student_id = $1
            AND a.group_id = $2
            AND a.month >= $3
            AND a.status = 'kelmadi'
            AND a.is_marked = true
            AND l.status IN ('not_started', 'open')
        `;
        normalizeParams = [student_id, group_id, from_month];
      } else if (useMonths) {
        const monthPlaceholders = months.map((_, i) => `$${i + 3}`).join(', ');
        normalizeQuery = `
          UPDATE attendance a
          SET is_marked = false
          FROM lessons l
          WHERE a.lesson_id = l.id
            AND a.student_id = $1
            AND a.group_id = $2
            AND a.month IN (${monthPlaceholders})
            AND a.status = 'kelmadi'
            AND a.is_marked = true
            AND l.status IN ('not_started', 'open')
        `;
        normalizeParams = [student_id, group_id, ...months];
      } else if (useSingleMonth) {
        normalizeQuery = `
          UPDATE attendance a
          SET is_marked = false
          FROM lessons l
          WHERE a.lesson_id = l.id
            AND a.student_id = $1
            AND a.group_id = $2
            AND a.month = $3
            AND a.status = 'kelmadi'
            AND a.is_marked = true
            AND l.status IN ('not_started', 'open')
        `;
        normalizeParams = [student_id, group_id, month];
      }

      if (normalizeQuery) {
        await pool.query(normalizeQuery, normalizeParams);
      }
    } catch (normalizeError) {
      console.error('Attendance normalize xatoligi:', normalizeError);
    }

    // YANGI: Payment jadvalini ham yangilash
    // Agar talaba stopped/finished bo'lsa, payment statusini ham yangilaymiz
    if (monthly_status === 'stopped' || monthly_status === 'finished') {
      try {
        let paymentUpdateQuery;
        let paymentParams;
        
        if (useFromMonth) {
          // Shu oydan keyingi barcha oylar uchun
          paymentUpdateQuery = `
            UPDATE student_payments 
            SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 AND group_id = $2 AND month >= $3
          `;
          paymentParams = [student_id, group_id, from_month];
        } else if (useMonths) {
          // Bir necha oylar uchun
          const paymentMonthPlaceholders = months.map((_, i) => `$${i + 3}`).join(', ');
          paymentUpdateQuery = `
            UPDATE student_payments 
            SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 AND group_id = $2 AND month IN (${paymentMonthPlaceholders})
          `;
          paymentParams = [student_id, group_id, ...months];
        } else if (useSingleMonth) {
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
        
        if (useFromMonth) {
          paymentReactivateQuery = `
            UPDATE student_payments 
            SET status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 AND group_id = $2 AND month >= $3 AND status = 'inactive'
          `;
          paymentParams = [student_id, group_id, from_month];
        } else if (useMonths) {
          const paymentMonthPlaceholders = months.map((_, i) => `$${i + 3}`).join(', ');
          paymentReactivateQuery = `
            UPDATE student_payments 
            SET status = 'active', updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1 AND group_id = $2 AND month IN (${paymentMonthPlaceholders}) AND status = 'inactive'
          `;
          paymentParams = [student_id, group_id, ...months];
        } else if (useSingleMonth) {
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
      
      if (useFromMonth) {
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
      } else if (useMonths) {
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
      } else if (useSingleMonth) {
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

    // Student guruh statusini ham sinxronlaymiz.
    // Shu bilan admin/students sahifasidagi ko'rsatkich attendance'dagi holatga mos bo'ladi.
    try {
      const membershipLookup = await pool.query(
        `SELECT id
         FROM student_groups
         WHERE student_id = $1
           AND group_id = $2
           AND branch_id = $3
         ORDER BY
           CASE status
             WHEN 'active' THEN 1
             WHEN 'stopped' THEN 2
             WHEN 'finished' THEN 3
             ELSE 4
           END,
           joined_at DESC NULLS LAST,
           id DESC
         LIMIT 1`,
        [student_id, group_id, branchId]
      );

      const membershipStatus = monthly_status;
      const leftAtValue = membershipStatus === 'active' ? null : new Date();

      if (membershipLookup.rows.length > 0) {
        await pool.query(
          `UPDATE student_groups
           SET status = $1,
               left_at = $2
           WHERE id = $3`,
          [membershipStatus, leftAtValue, membershipLookup.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO student_groups (student_id, group_id, status, joined_at, left_at, branch_id)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5)`,
          [student_id, group_id, membershipStatus, leftAtValue, branchId]
        );
      }

      await pool.query(
        `UPDATE users
         SET course_status = $1,
             course_end_date = $2
         WHERE id = $3 AND branch_id = $4`,
        [
          membershipStatus === 'active' ? 'in_progress' : 'stopped',
          membershipStatus === 'active' ? null : new Date(),
          student_id,
          branchId
        ]
      );
    } catch (membershipError) {
      console.error('Student guruh statusini sinxronlashda xatolik:', membershipError);
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
        ...(useSingleMonth && { month }),
        ...(useMonths && { months }),
        ...(useFromMonth && { from_month }),
        apply_scope: useFromMonth ? 'from_month' : useMonths ? 'months' : 'single_month'
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
  const { role, id: userId } = req.user;
  const branchId = getScopedBranchId(req);
  
  try {
    if (month && !isValidMonth(month)) {
      return res.status(400).json({
        success: false,
        message: "month YYYY-MM formatida bo'lishi kerak"
      });
    }

    const selectedMonth = month || new Date().toISOString().slice(0, 7);

    // Avval guruh ma'lumotlarini olamiz
    const groupInfo = await pool.query(
      `SELECT 
         g.id,
         g.name as group_name,
         g.price as group_price,
         g.schedule,
         g.class_start_date,
         g.start_date,
         g.created_at,
         s.name as subject_name,
         CONCAT(t.name, ' ', t.surname) as teacher_name,
         t.name as teacher_first_name,
         t.surname as teacher_last_name,
         t.id as teacher_id
       FROM groups g
       JOIN subjects s ON g.subject_id = s.id  
       LEFT JOIN users t ON g.teacher_id = t.id
       WHERE g.id = $1 AND g.branch_id = $2`,
      [group_id, branchId]
    );

    if (groupInfo.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const group = groupInfo.rows[0];
    const groupStartDate = formatTashkentDateYmd(group.class_start_date || group.start_date || group.created_at);
    if (role === 'teacher' && String(group.teacher_id || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'zingizning guruhingiz lessonlarini ko\'ra olasiz'
      });
    }

    // Attendance sahifasiga kirilganda tanlangan oy uchun schedule asosida
    // darslarni avtomatik yaratamiz (oyiga maksimal 12 ta).
    const autoGen = await autoGenerateLessonsForMonth({
      groupId: parseInt(group_id, 10),
      month: selectedMonth,
      createdBy: userId,
      fromDate: groupStartDate,
      branchId
    });

    // Auto-yaratilgan, lekin noto'g'ri "marked" bo'lib qolgan yozuvlarni tozalash:
    // faqat qo'lda o'zgartirilmagan (updated_at = created_at) va "kelmadi" holatlar.
    await pool.query(
      `UPDATE attendance a
       SET is_marked = false
       FROM lessons l
       WHERE a.lesson_id = l.id
         AND l.group_id = $1
         AND a.branch_id = $2
         AND l.branch_id = $2
         AND TO_CHAR(l.date, 'YYYY-MM') = $3
         AND l.status IN ('not_started', 'open')
         AND a.is_marked = true
         AND a.status = 'kelmadi'
         AND a.updated_at = a.created_at`,
      [group_id, branchId, selectedMonth]
    );

    // Eski darslar 00:00 bo'lib qolgan bo'lsa, guruh schedule vaqti bilan to'ldiramiz.
    const slot = parseScheduleTimeRange(group.schedule);
    if (slot.start_time !== '00:00:00') {
      await pool.query(
        `UPDATE lessons l
         SET start_time = $1::time,
             end_time = COALESCE(end_time, $2::time)
         WHERE l.group_id = $3
           AND TO_CHAR(l.date, 'YYYY-MM') = $4
           AND l.branch_id = $5
           AND l.start_time = '00:00:00'::time
           AND NOT EXISTS (
             SELECT 1
             FROM lessons l2
             WHERE l2.group_id = l.group_id
               AND l2.date = l.date
               AND l2.start_time = $1::time
               AND l2.id <> l.id
           )`,
        [slot.start_time, slot.end_time, group_id, selectedMonth, branchId]
      );
    }

    const lessons = await pool.query(
      `SELECT 
         l.id,
         TO_CHAR(l.date, 'YYYY-MM-DD') as date,
         TO_CHAR(l.date, 'DD.MM.YYYY') as formatted_date,
         TO_CHAR(l.start_time, 'HH24:MI') as start_time,
         CASE WHEN l.end_time IS NOT NULL THEN TO_CHAR(l.end_time, 'HH24:MI') ELSE NULL END as end_time,
         l.status as lesson_status,
         l.is_holiday,
         l.teacher_id,
         l.subject_id,
         l.room_id,
         s2.name as lesson_subject_name,
         r2.room_number as lesson_room_number,
         COUNT(CASE WHEN a.monthly_status = 'active' OR (COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kechikdi')) THEN 1 END)
           FILTER (WHERE COALESCE(l.is_holiday, false) = false) as total_students,
         COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END)
           FILTER (WHERE COALESCE(l.is_holiday, false) = false) as active_students_count,
         COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END)
           FILTER (WHERE COALESCE(l.is_holiday, false) = false) as marked_students_count,
         COUNT(CASE WHEN a.status = 'keldi' AND COALESCE(a.is_marked, false) THEN 1 END)
           FILTER (WHERE COALESCE(l.is_holiday, false) = false) as present_count,
         COUNT(CASE WHEN a.status = 'kelmadi' AND a.monthly_status = 'active' AND COALESCE(a.is_marked, false) THEN 1 END)
           FILTER (WHERE COALESCE(l.is_holiday, false) = false) as absent_count,
         COUNT(CASE WHEN a.status = 'kechikdi' AND COALESCE(a.is_marked, false) THEN 1 END)
         FILTER (WHERE COALESCE(l.is_holiday, false) = false) as late_count,
         CASE WHEN r.lesson_id IS NOT NULL THEN true ELSE false END as report_sent,
         CASE
           WHEN COALESCE(l.is_holiday, false) = true THEN 'holiday'
           WHEN COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) > 0
            AND COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) = COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END)
             THEN 'marked'
           ELSE 'not_marked'
         END as attendance_state,
         CASE
           WHEN COALESCE(l.is_holiday, false) = true THEN false
           WHEN COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) > 0
            AND COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) = COUNT(CASE WHEN a.monthly_status = 'active' AND COALESCE(a.is_marked, false) AND a.status IN ('keldi', 'kelmadi') THEN 1 END)
             THEN true
           ELSE false
        END as attendance_completed
       FROM lessons l
       LEFT JOIN attendance a ON l.id = a.lesson_id AND a.branch_id = $3
         AND EXISTS (
           SELECT 1 FROM student_groups sg
           WHERE sg.student_id = a.student_id
             AND sg.group_id = a.group_id
             AND sg.branch_id = $3
             AND DATE(sg.joined_at) <= l.date
             AND (sg.left_at IS NULL OR DATE(sg.left_at) > l.date)
         )
       LEFT JOIN teacher_lesson_statistics_reports r
         ON r.lesson_id = l.id
        AND r.branch_id = $3
       LEFT JOIN subjects s2 ON l.subject_id = s2.id
       LEFT JOIN rooms r2 ON l.room_id = r2.id
       WHERE l.group_id = $1 AND TO_CHAR(l.date, 'YYYY-MM') = $2 AND l.branch_id = $3
         ${groupStartDate ? `AND l.date >= $4::date` : ''}
       GROUP BY l.id, l.date, l.start_time, l.end_time, l.status, l.is_holiday, l.teacher_id, l.subject_id, l.room_id, s2.name, r2.room_number, r.lesson_id
       ORDER BY l.date DESC, l.start_time ASC`,
      groupStartDate ? [group_id, selectedMonth, branchId, groupStartDate] : [group_id, selectedMonth, branchId]
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
// 7.0 TEACHER: FAQAT O'Z LESSONLARI (kunlik/oylik)
// ============================================================================
exports.getMyLessons = async (req, res) => {
  const { role, id: userId } = req.user;
  const { date, month } = req.query;
  const branchId = getScopedBranchId(req);

  try {
    if (role !== 'teacher') {
      return res.status(403).json({
        success: false,
        message: 'Bu endpoint faqat teacher uchun'
      });
    }

    if (date && !isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: 'date YYYY-MM-DD formatida bo\'lishi kerak'
      });
    }
    if (month && !isValidMonth(month)) {
      return res.status(400).json({
        success: false,
        message: 'month YYYY-MM formatida bo\'lishi kerak'
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const selectedDate = month ? null : (date || today);
    const selectedMonth = month || selectedDate.slice(0, 7);

    const autoGen = await ensureGeneratedLessonsForScope({
      month: selectedMonth,
      createdBy: userId,
      teacherId: userId,
      branchId
    });

    const params = [userId, branchId];
    let filterQuery = '';
    if (selectedDate) {
      filterQuery = ` AND l.date = $3::date`;
      params.push(selectedDate);
    } else {
      filterQuery = ` AND TO_CHAR(l.date, 'YYYY-MM') = $3`;
      params.push(selectedMonth);
    }

    const lessonsResult = await pool.query(
      `SELECT
         l.id as lesson_id,
         l.group_id,
         g.name as group_name,
         l.teacher_id,
         l.subject_id,
         COALESCE(s.name, gs.name) as subject_name,
         l.room_id,
         r.room_number,
         TO_CHAR(l.date, 'YYYY-MM-DD') as date,
         TO_CHAR(l.start_time, 'HH24:MI') as start_time,
         CASE WHEN l.end_time IS NOT NULL THEN TO_CHAR(l.end_time, 'HH24:MI') ELSE NULL END as end_time,
         l.status as lesson_status,
         l.is_holiday,
         COUNT(a.id) FILTER (WHERE COALESCE(l.is_holiday, false) = false) as attendance_rows,
         COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END)
           FILTER (WHERE COALESCE(l.is_holiday, false) = false) as active_students,
         COUNT(CASE WHEN COALESCE(a.is_marked, false) THEN 1 END)
           FILTER (WHERE COALESCE(l.is_holiday, false) = false) as marked_students
       FROM lessons l
       JOIN groups g ON g.id = l.group_id AND g.branch_id = $2
       LEFT JOIN subjects s ON s.id = l.subject_id
       LEFT JOIN subjects gs ON gs.id = g.subject_id
       LEFT JOIN rooms r ON r.id = l.room_id
       LEFT JOIN attendance a ON a.lesson_id = l.id AND a.branch_id = $2
           AND EXISTS (
             SELECT 1 FROM student_groups sg
             WHERE sg.student_id = a.student_id
               AND sg.group_id = a.group_id
               AND sg.branch_id = $2
               AND DATE(sg.joined_at) <= l.date
               AND (sg.left_at IS NULL OR DATE(sg.left_at) > l.date)
           )
       WHERE (
         (l.date >= CURRENT_DATE AND g.teacher_id = $1)
         OR (l.date < CURRENT_DATE AND l.teacher_id = $1)
       )
         AND l.branch_id = $2
         ${filterQuery}
       GROUP BY l.id, g.name, s.name, gs.name, r.room_number, l.is_holiday
       ORDER BY l.date ASC, l.start_time ASC`,
      params
    );

    return res.json({
      success: true,
      data: {
        teacher_id: userId,
        ...(selectedDate ? { date: selectedDate } : { month: selectedMonth }),
        lessons: lessonsResult.rows,
        auto_generated: autoGen
      }
    });
  } catch (error) {
    console.error('My lessons olishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 7.A ADMIN: KUNLIK TEACHERLAR RO'YXATI (date + shift)
// ============================================================================
exports.getAdminTeachersAttendance = async (req, res) => {
  const { id: userId } = req.user;
  const { date, shift } = req.query;
  const branchId = getScopedBranchId(req);

  try {
    const selectedDate = date || new Date().toISOString().slice(0, 10);
    if (!isValidDate(selectedDate)) {
      return res.status(400).json({
        success: false,
        message: 'date YYYY-MM-DD formatida bo\'lishi kerak'
      });
    }

    const allowedShifts = ['morning', 'evening'];
    let selectedShift = shift;
    if (!selectedShift) {
      const now = new Date();
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
      selectedShift = getShiftFromTime(nowTime);
    }
    if (!allowedShifts.includes(selectedShift)) {
      return res.status(400).json({
        success: false,
        message: 'shift faqat morning yoki evening bo\'lishi mumkin'
      });
    }

    await ensureGeneratedLessonsForScope({
      month: selectedDate.slice(0, 7),
      createdBy: userId,
      branchId
    });

    const shiftSql = selectedShift === 'morning'
      ? `AND l.start_time < '13:00:00'::time`
      : `AND l.start_time >= '13:00:00'::time`;

    const teachers = await pool.query(
      `SELECT
         u.id as teacher_id,
         CONCAT(u.name, ' ', u.surname) as full_name,
         COALESCE(
           ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(s.name, gs.name)), NULL),
           ARRAY[]::text[]
         ) as subjects_taught,
         COUNT(l.id) as lessons_count,
         COUNT(CASE WHEN l.status = 'not_started' THEN 1 END) as not_started_count,
         COUNT(CASE WHEN l.status = 'open' THEN 1 END) as open_count,
         COUNT(CASE WHEN l.status = 'closed' THEN 1 END) as closed_count
       FROM users u
       LEFT JOIN lessons l ON l.teacher_id = u.id
         AND l.date = $1::date
         AND l.branch_id = $2
         ${shiftSql}
       LEFT JOIN groups g ON g.id = l.group_id AND g.branch_id = $2
       LEFT JOIN subjects s ON s.id = l.subject_id
       LEFT JOIN subjects gs ON gs.id = g.subject_id
       WHERE u.role = 'teacher'
         AND u.branch_id = $2
       GROUP BY u.id, u.name, u.surname
       HAVING COUNT(l.id) > 0
       ORDER BY full_name`,
      [selectedDate, branchId]
    );

    return res.json({
      success: true,
      data: {
        date: selectedDate,
        shift: selectedShift,
        teachers: teachers.rows
      }
    });
  } catch (error) {
    console.error('Admin teacherlar attendance ro\'yxati xatoligi:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 7.B ADMIN: TANLANGAN TEACHER LESSONLARI (date + shift)
// ============================================================================
exports.getAdminTeacherLessons = async (req, res) => {
  const { id: userId } = req.user;
  const { teacher_id } = req.params;
  const { date, shift } = req.query;
  const branchId = getScopedBranchId(req);

  try {
    const teacherIdNum = Number(teacher_id);
    if (!Number.isInteger(teacherIdNum) || teacherIdNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'teacher_id noto\'g\'ri'
      });
    }

    const selectedDate = date || new Date().toISOString().slice(0, 10);
    if (!isValidDate(selectedDate)) {
      return res.status(400).json({
        success: false,
        message: 'date YYYY-MM-DD formatida bo\'lishi kerak'
      });
    }

    const allowedShifts = ['morning', 'evening'];
    let selectedShift = shift;
    if (!selectedShift) {
      const now = new Date();
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
      selectedShift = getShiftFromTime(nowTime);
    }
    if (!allowedShifts.includes(selectedShift)) {
      return res.status(400).json({
        success: false,
        message: 'shift faqat morning yoki evening bo\'lishi mumkin'
      });
    }

    await ensureGeneratedLessonsForScope({
      month: selectedDate.slice(0, 7),
      createdBy: userId,
      teacherId: teacherIdNum,
      branchId
    });

    const shiftSql = selectedShift === 'morning'
      ? `AND l.start_time < '13:00:00'::time`
      : `AND l.start_time >= '13:00:00'::time`;

    const lessons = await pool.query(
      `SELECT
         l.id as lesson_id,
         l.group_id,
         g.name as group_name,
         l.teacher_id,
         CONCAT(t.name, ' ', t.surname) as teacher_name,
         l.subject_id,
         COALESCE(s.name, gs.name) as subject_name,
         l.room_id,
         r.room_number,
         TO_CHAR(l.date, 'YYYY-MM-DD') as date,
         TO_CHAR(l.start_time, 'HH24:MI') as start_time,
         CASE WHEN l.end_time IS NOT NULL THEN TO_CHAR(l.end_time, 'HH24:MI') ELSE NULL END as end_time,
         l.status as lesson_status,
         COUNT(CASE WHEN a.monthly_status = 'active' THEN 1 END) as active_students,
         COUNT(CASE WHEN a.status = 'keldi' AND COALESCE(a.is_marked, false) THEN 1 END) as present_count,
         COUNT(CASE WHEN a.status = 'kelmadi' AND COALESCE(a.is_marked, false) THEN 1 END) as absent_count,
         COUNT(CASE WHEN a.status = 'kechikdi' AND COALESCE(a.is_marked, false) THEN 1 END) as late_count
       FROM lessons l
       JOIN users t ON t.id = l.teacher_id AND t.branch_id = $3
       JOIN groups g ON g.id = l.group_id AND g.branch_id = $3
       LEFT JOIN subjects s ON s.id = l.subject_id
       LEFT JOIN subjects gs ON gs.id = g.subject_id
       LEFT JOIN rooms r ON r.id = l.room_id
       LEFT JOIN attendance a ON a.lesson_id = l.id AND a.branch_id = $3
           AND EXISTS (
             SELECT 1 FROM student_groups sg
             WHERE sg.student_id = a.student_id
               AND sg.group_id = a.group_id
               AND sg.branch_id = $3
               AND DATE(sg.joined_at) <= l.date
               AND (sg.left_at IS NULL OR DATE(sg.left_at) > l.date)
           )
       WHERE l.teacher_id = $1
         AND l.date = $2::date
         AND l.branch_id = $3
         ${shiftSql}
       GROUP BY l.id, g.name, t.name, t.surname, s.name, gs.name, r.room_number
       ORDER BY l.start_time ASC, l.id ASC`,
      [teacherIdNum, selectedDate, branchId]
    );

    return res.json({
      success: true,
      data: {
        teacher_id: teacherIdNum,
        date: selectedDate,
        shift: selectedShift,
        lessons: lessons.rows
      }
    });
  } catch (error) {
    console.error('Admin teacher lessonlari xatoligi:', error);
    return res.status(500).json({
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
  const { month, from_date, append_only } = req.body || {};
  const { role, id: userId } = req.user;
  const branchId = getScopedBranchId(req);

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
       WHERE id = $1 AND branch_id = $2`,
      [group_id, branchId]
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

    let deletedAttendance = { rowCount: 0 };
    let deletedLessons = { rowCount: 0 };
    if (!append_only) {
      await pool.query('BEGIN');
      transactionStarted = true;

      deletedAttendance = await pool.query(
        `DELETE FROM attendance a
         USING lessons l
         WHERE a.lesson_id = l.id
           AND l.group_id = $1
           AND a.branch_id = $4
           AND l.branch_id = $4
           AND l.date BETWEEN $2::date AND $3::date`,
        [group_id, deleteStart, deleteEnd, branchId]
      );

      deletedLessons = await pool.query(
        `DELETE FROM lessons
         WHERE group_id = $1
           AND branch_id = $4
           AND date BETWEEN $2::date AND $3::date`,
        [group_id, deleteStart, deleteEnd, branchId]
      );

      await pool.query('COMMIT');
      transactionStarted = false;
    }

    const autoGen = await autoGenerateLessonsForMonth({
      groupId: Number(group_id),
      month: selectedMonth,
      createdBy: userId,
      fromDate: deleteStart,
      branchId
    });

    const lessonsAfter = await pool.query(
      `SELECT COUNT(*)::int as lesson_count
       FROM lessons
       WHERE group_id = $1
         AND TO_CHAR(date, 'YYYY-MM') = $2
         AND branch_id = $3`,
      [group_id, selectedMonth, branchId]
    );

    return res.json({
      success: true,
      message: 'Davomat lessonlari qayta yaratildi',
      data: {
        group_id: Number(group_id),
        month: selectedMonth,
        delete_range: append_only ? null : {
          from: deleteStart,
          to: deleteEnd
        },
        deleted_lessons_count: deletedLessons.rowCount,
        deleted_attendance_count: deletedAttendance.rowCount,
        generated_lessons_count: autoGen.generated,
        current_month_lessons_count: lessonsAfter.rows[0].lesson_count,
        mode: append_only ? 'append_only_generate' : 'delete_then_schedule_regenerate'
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
  const branchId = getScopedBranchId(req);

  try {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "date YYYY-MM-DD formatida bo'lishi kerak"
      });
    }

    const lessonResult = await pool.query(
      `SELECT l.id, l.group_id, l.date, l.start_time, COALESCE(l.teacher_id, g.teacher_id) as teacher_id
       FROM lessons l
       JOIN groups g ON g.id = l.group_id AND g.branch_id = $2
       WHERE l.id = $1 AND l.branch_id = $2`,
      [lesson_id, branchId]
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
         AND start_time = $4::time
         AND id <> $3
         AND branch_id = $5`,
      [lesson.group_id, date, lesson_id, lesson.start_time, branchId]
    );

    if (duplicate.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Bu sana uchun dars allaqachon mavjud'
      });
    }

    const holidayForDate = await isHolidayDate(date, branchId);

    await pool.query(
      `UPDATE lessons
       SET date = $1::date,
           is_holiday = $3
       WHERE id = $2 AND branch_id = $4`,
      [date, lesson_id, holidayForDate, branchId]
    );

    await syncLessonAttendanceForDate(lesson_id, lesson.group_id, date, branchId);

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
// 8.1 QO'LDA LESSON/SESSION YARATISH
// ============================================================================
exports.createManualLesson = async (req, res) => {
  const {
    group_id,
    teacher_id,
    subject_id,
    room_id,
    date,
    start_time,
    end_time,
    status
  } = req.body || {};
  const { role, id: userId } = req.user;
  const branchId = getScopedBranchId(req);

  try {
    if (!group_id || !date || !start_time) {
      return res.status(400).json({
        success: false,
        message: 'group_id, date, start_time majburiy'
      });
    }
    if (!isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "date YYYY-MM-DD formatida bo'lishi kerak"
      });
    }
    if (!isValidTime(start_time)) {
      return res.status(400).json({
        success: false,
        message: "start_time HH:MM yoki HH:MM:SS formatida bo'lishi kerak"
      });
    }
    if (end_time && !isValidTime(end_time)) {
      return res.status(400).json({
        success: false,
        message: "end_time HH:MM yoki HH:MM:SS formatida bo'lishi kerak"
      });
    }

    const groupResult = await pool.query(
      `SELECT id, teacher_id, subject_id, room_id
       FROM groups
       WHERE id = $1 AND branch_id = $2`,
      [group_id, branchId]
    );
    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const group = groupResult.rows[0];
    if (role === 'teacher' && String(group.teacher_id || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'zingizga biriktirilgan guruhga lesson yarata olasiz'
      });
    }

    const finalTeacherId = teacher_id || group.teacher_id || userId;
    if (role === 'teacher' && String(finalTeacherId || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Teacher faqat o\'z lessonini yaratishi mumkin'
      });
    }

    const finalStatus = ['not_started', 'open', 'closed'].includes(status)
      ? status
      : getDefaultLessonStatusForDate(date);
    const normalizedStartTime = normalizeTimeValue(start_time);
    const normalizedEndTime = end_time ? normalizeTimeValue(end_time, null) : null;
    const holidayForDate = await isHolidayDate(date, branchId);

    const duplicate = await pool.query(
      `SELECT id
       FROM lessons
       WHERE group_id = $1
         AND date = $2::date
         AND start_time = $3::time
         AND branch_id = $4`,
      [group_id, date, normalizedStartTime, branchId]
    );
    if (duplicate.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ushbu group/date/start_time uchun lesson allaqachon mavjud'
      });
    }

    const created = await pool.query(
      `INSERT INTO lessons (
         group_id, teacher_id, subject_id, room_id, date, start_time, end_time, status, created_by, is_holiday, branch_id
       ) VALUES ($1, $2, $3, $4, $5::date, $6::time, $7::time, $8, $9, $10, $11)
       RETURNING id, group_id, teacher_id, subject_id, room_id, date, start_time, end_time, status, is_holiday`,
      [
        group_id,
        finalTeacherId,
        subject_id || group.subject_id || null,
        room_id || group.room_id || null,
        date,
        normalizedStartTime,
        normalizedEndTime,
        finalStatus,
        userId,
        holidayForDate,
        branchId
      ]
    );

    const lesson = created.rows[0];
    await syncLessonAttendanceForDate(lesson.id, group_id, date, branchId);
    await writeLessonAuditLog({
      lessonId: lesson.id,
      changedBy: userId,
      action: 'manual_create',
      beforeData: null,
      afterData: lesson
    });

    return res.status(201).json({
      success: true,
      message: 'Manual lesson yaratildi',
      data: lesson
    });
  } catch (error) {
    console.error('Manual lesson yaratishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 8.2 LESSONNI PATCH QILISH (room/time/status)
// ============================================================================
exports.patchLesson = async (req, res) => {
  const { lesson_id } = req.params;
  const { role, id: userId } = req.user;
  const { teacher_id, subject_id, room_id, date, start_time, end_time, status } = req.body || {};
  const branchId = getScopedBranchId(req);

  try {
    if (
      teacher_id === undefined &&
      subject_id === undefined &&
      room_id === undefined &&
      date === undefined &&
      start_time === undefined &&
      end_time === undefined &&
      status === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: 'Kamida bitta field yuborilishi kerak'
      });
    }

    if (date !== undefined && !isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: "date YYYY-MM-DD formatida bo'lishi kerak"
      });
    }
    if (start_time !== undefined && !isValidTime(start_time)) {
      return res.status(400).json({
        success: false,
        message: "start_time HH:MM yoki HH:MM:SS formatida bo'lishi kerak"
      });
    }
    if (end_time !== undefined && end_time !== null && !isValidTime(end_time)) {
      return res.status(400).json({
        success: false,
        message: "end_time HH:MM yoki HH:MM:SS formatida bo'lishi kerak"
      });
    }
    if (status !== undefined && !['not_started', 'open', 'closed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status faqat not_started/open/closed bo\'lishi mumkin'
      });
    }

    const lessonResult = await pool.query(
      `SELECT l.*, COALESCE(l.teacher_id, g.teacher_id) as effective_teacher_id
       FROM lessons l
       LEFT JOIN groups g ON g.id = l.group_id AND g.branch_id = $2
       WHERE l.id = $1 AND l.branch_id = $2`,
      [lesson_id, branchId]
    );
    if (lessonResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dars topilmadi'
      });
    }

    const current = lessonResult.rows[0];
    if (role === 'teacher' && String(current.effective_teacher_id || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'zingizga biriktirilgan lessonni o\'zgartira olasiz'
      });
    }

    const nextDate = date || formatDateUtc(new Date(current.date));
    const nextStartTime = start_time !== undefined
      ? normalizeTimeValue(start_time)
      : normalizeTimeValue(current.start_time);
    const nextEndTime = end_time === undefined
      ? current.end_time
      : (end_time === null ? null : normalizeTimeValue(end_time, null));
    const nextStatus = status !== undefined ? status : current.status;
    const nextTeacherId = teacher_id !== undefined ? teacher_id : current.teacher_id;
    const nextSubjectId = subject_id !== undefined ? subject_id : current.subject_id;
    const nextRoomId = room_id !== undefined ? room_id : current.room_id;
    const nextIsHoliday = date !== undefined
      ? await isHolidayDate(nextDate, branchId)
      : Boolean(current.is_holiday);

    if (role === 'teacher' && teacher_id !== undefined && String(nextTeacherId || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Teacher lessonni boshqa teacherga o\'tkaza olmaydi'
      });
    }

    const duplicate = await pool.query(
      `SELECT id
       FROM lessons
       WHERE group_id = $1
         AND date = $2::date
         AND start_time = $3::time
         AND id <> $4
         AND branch_id = $5`,
      [current.group_id, nextDate, nextStartTime, lesson_id, branchId]
    );
    if (duplicate.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ushbu group/date/start_time uchun boshqa lesson mavjud'
      });
    }

    const updated = await pool.query(
      `UPDATE lessons
       SET teacher_id = $1,
           subject_id = $2,
           room_id = $3,
           date = $4::date,
           start_time = $5::time,
           end_time = $6::time,
           status = $7,
           is_holiday = $9
       WHERE id = $8 AND branch_id = $10
       RETURNING *`,
      [nextTeacherId, nextSubjectId, nextRoomId, nextDate, nextStartTime, nextEndTime, nextStatus, lesson_id, nextIsHoliday, branchId]
    );

    if (nextDate !== formatDateUtc(new Date(current.date))) {
      await syncLessonAttendanceForDate(current.id, current.group_id, nextDate, branchId);
    }

    await writeLessonAuditLog({
      lessonId: current.id,
      changedBy: userId,
      action: 'patch_update',
      beforeData: {
        teacher_id: current.teacher_id,
        subject_id: current.subject_id,
        room_id: current.room_id,
        date: formatDateUtc(new Date(current.date)),
        start_time: normalizeTimeValue(current.start_time),
        end_time: current.end_time,
        status: current.status
      },
      afterData: {
        teacher_id: nextTeacherId,
        subject_id: nextSubjectId,
        room_id: nextRoomId,
        date: nextDate,
        start_time: nextStartTime,
        end_time: nextEndTime,
        status: nextStatus
      }
    });

    return res.json({
      success: true,
      message: 'Lesson yangilandi',
      data: updated.rows[0]
    });
  } catch (error) {
    console.error('Lesson patch xatoligi:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 8.3 DAM OLISH KUNINI BELGILASH (GLOBAL)
// ============================================================================
exports.setHolidayForDate = async (req, res) => {
  const { date, is_holiday = true } = req.body || {};
  const { id: userId } = req.user;
  const branchId = getScopedBranchId(req);

  try {
    if (!isValidDate(date)) {
      return res.status(400).json({
        success: false,
        message: 'date YYYY-MM-DD formatida bo\'lishi kerak'
      });
    }

    const updatedLessons = await applyGlobalHoliday({
      date,
      isHoliday: Boolean(is_holiday),
      userId,
      branchId
    });

    return res.json({
      success: true,
      data: {
        date,
        is_holiday: Boolean(is_holiday),
        updated_lessons: updatedLessons
      }
    });
  } catch (error) {
    console.error('Dam olish belgilashda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 8.3.A GLOBAL HOLIDAY LIST (month)
// ============================================================================
exports.getGlobalHolidays = async (req, res) => {
  const { month } = req.query;

  try {
    if (month && !isValidMonth(month)) {
      return res.status(400).json({
        success: false,
        message: 'month YYYY-MM formatida bo\'lishi kerak'
      });
    }

    const params = [];
    let filter = '';
    if (month) {
      filter = ' WHERE TO_CHAR(date, \'YYYY-MM\') = $1';
      params.push(month);
    }

    const result = await pool.query(
      `SELECT TO_CHAR(date, 'YYYY-MM-DD') as date
       FROM holidays${filter}
       ORDER BY date ASC`,
      params
    );

    return res.json({
      success: true,
      data: {
        month: month || null,
        dates: result.rows.map((r) => r.date)
      }
    });
  } catch (error) {
    console.error('Holiday list olishda xatolik:', error);
    return res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

// ============================================================================
// 9. DARSNI O'CHIRISH
// ============================================================================
exports.deleteLesson = async (req, res) => {
  const { lesson_id } = req.params;
  const { role, id: userId } = req.user;
  const branchId = getScopedBranchId(req);
  
  try {
    const lessonResult = await pool.query(
      `SELECT l.id, COALESCE(l.teacher_id, g.teacher_id) as teacher_id
       FROM lessons l
       LEFT JOIN groups g ON g.id = l.group_id AND g.branch_id = l.branch_id
       WHERE l.id = $1 AND l.branch_id = $2`,
      [lesson_id, branchId]
    );

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dars topilmadi'
      });
    }

    if (role === 'teacher' && String(lessonResult.rows[0].teacher_id || '') !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Siz faqat o\'zingizga biriktirilgan lessonni o\'chira olasiz'
      });
    }

    await pool.query('BEGIN');

    // Attendance yozuvlarini o'chirish
    await pool.query('DELETE FROM attendance WHERE lesson_id = $1 AND branch_id = $2', [lesson_id, branchId]);

    // Darsni o'chirish
    const result = await pool.query('DELETE FROM lessons WHERE id = $1 AND branch_id = $2 RETURNING id', [lesson_id, branchId]);
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
  const branchId = getScopedBranchId(req);
  
  try {
    const normalizedMonth = normalizeMonthParam(month);
    // Faqat YYYY-MM formatni qabul qilamiz (yoki YYYY-MM-DD bo'lsa oyga aylantiramiz)
    if (!normalizedMonth) {
      return res.status(400).json({
        success: false,
        message: 'Oy formatida xatolik (YYYY-MM format ishlatilsin, YYYY-MM-DD bo\'lsa oyga aylantiriladi)'
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
      LEFT JOIN subjects s ON g.subject_id = s.id AND s.branch_id = g.branch_id
      LEFT JOIN users t ON g.teacher_id = t.id AND t.branch_id = g.branch_id
      WHERE g.id = $1 AND g.branch_id = $2
    `, [group_id, branchId]);
    
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
      `SELECT id, TO_CHAR(date, 'YYYY-MM-DD') as date, TO_CHAR(date, 'DD') as day, is_holiday
       FROM lessons 
       WHERE group_id = $1 AND TO_CHAR(date, 'YYYY-MM') = $2 AND branch_id = $3
       ORDER BY date`,
      [group_id, normalizedMonth, branchId]
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
        COALESCE(l.is_holiday, false) as is_holiday,
        COALESCE(a.monthly_status, 'active') as monthly_status
      FROM attendance a
      JOIN users u ON a.student_id = u.id AND u.branch_id = a.branch_id
      JOIN lessons l ON a.lesson_id = l.id AND l.branch_id = a.branch_id
      WHERE a.group_id = $1 AND TO_CHAR(l.date, 'YYYY-MM') = $2 AND a.branch_id = $3
      ORDER BY u.name, u.surname, l.date
    `;
    
    const attendanceResult = await pool.query(attendanceQuery, [group_id, normalizedMonth, branchId]);
    
    
    if (attendanceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bu oy uchun davomat ma\'lumotlari topilmadi'
      });
    }
    
    // Ma'lumotlarni Excel formatiga tayyorlaymiz
    const studentsMap = new Map();
    const dates = new Set();
    const holidayDates = new Set();
    
    // Darslar sanalarini olish (lessons dan)
    lessons.rows.forEach(lesson => {
      dates.add(lesson.date);
      if (lesson.is_holiday) {
        holidayDates.add(lesson.date);
      }
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
      if (row.is_holiday) {
        studentsMap.get(studentKey).attendance[row.lesson_date] = 'holiday';
      } else {
        studentsMap.get(studentKey).attendance[row.lesson_date] = row.status;
      }
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
    
    const [year, monthNum] = normalizedMonth.split('-');
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

        if (holidayDates.has(date) || status === 'holiday') {
          displayStatus = 'Dam';
        } else if (status === 'keldi') {
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
  getTeachersAttendanceList: exports.getTeachersAttendanceList,
  getTeacherGroupsForAttendance: exports.getTeacherGroupsForAttendance,
  getGroupsForAttendance: exports.getGroupsForAttendance,
  getMyLessons: exports.getMyLessons,
  createLesson: exports.createLesson,
  getLessonStudents: exports.getLessonStudents,
  markAttendance: exports.markAttendance,
  getAttendanceByDate: exports.getAttendanceByDate,
  updateAttendanceByDate: exports.updateAttendanceByDate,
  getMonthlyAttendance: exports.getMonthlyAttendance,
  updateStudentMonthlyStatus: exports.updateStudentMonthlyStatus,
  getGroupLessons: exports.getGroupLessons,
  regenerateGroupLessons: exports.regenerateGroupLessons,
  updateLessonDate: exports.updateLessonDate,
  patchLesson: exports.patchLesson,
  setHolidayForDate: exports.setHolidayForDate,
  getGlobalHolidays: exports.getGlobalHolidays,
  deleteLesson: exports.deleteLesson,
  exportMonthlyAttendance: exports.exportMonthlyAttendance
};
