// 8. Guruhni o'chirish (faqat admin)
exports.deleteGroup = async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ message: "ID raqam bo'lishi shart!" });
    }
    try {
        // Avval student_groupsdan ham o'chadi (ON DELETE CASCADE)
        const result = await pool.query("DELETE FROM groups WHERE id = $1 RETURNING *", [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Guruh topilmadi" });
        res.json({ success: true, message: "Guruh o'chirildi" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
const pool = require('../config/db');
const crypto = require('crypto');
const { getTeacherSubjects } = require('../models/teacherSubjectModel');
const { checkRoomAvailability } = require('../models/roomModel');

// Tasodifiy 6-8 belgili kod yaratish (Masalan: GR-A1B2C3)
const generateUniqueCode = () => {
    return 'GR-' + crypto.randomBytes(3).toString('hex').toUpperCase();
};

// Vaqt formatini parse qilish ("14:00-16:00" -> {start: "14:00", end: "16:00"})
const parseTimeRange = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const parts = timeStr.split('-');
    if (parts.length !== 2) return null;
    return {
        start: parts[0].trim(),
        end: parts[1].trim()
    };
};

// Vaqt to'qnashuvini tekshirish
const isTimeOverlap = (time1, time2) => {
    const t1 = parseTimeRange(time1);
    const t2 = parseTimeRange(time2);
    
    if (!t1 || !t2) return false;
    
    // Vaqtni minutlarga aylantirish
    const timeToMinutes = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    };
    
    const start1 = timeToMinutes(t1.start);
    const end1 = timeToMinutes(t1.end);
    const start2 = timeToMinutes(t2.start);
    const end2 = timeToMinutes(t2.end);
    
    // To'qnashuv: bitta vaqtning boshi ikkinchisining oxirigacha yoki aksincha
    return (start1 < end2 && start2 < end1);
};

// Kunlar to'qnashuvini tekshirish
const isDaysOverlap = (days1, days2) => {
    if (!Array.isArray(days1) || !Array.isArray(days2)) return false;
    return days1.some(day => days2.includes(day));
};

const normalizeScheduleForCompare = (schedule) => {
    if (!schedule || typeof schedule !== 'object') return null;
    const days = Array.isArray(schedule.days)
        ? schedule.days.map((d) => String(d).trim().toLowerCase()).sort()
        : [];
    const time = schedule.time ? String(schedule.time).trim() : null;
    return JSON.stringify({ days, time });
};

const todayAsDateString = () => new Date().toISOString().slice(0, 10);

// Teacher schedule conflict tekshirish
const checkTeacherScheduleConflict = async (teacherId, schedule, excludeGroupId = null) => {
    if (!teacherId || !schedule || !schedule.days || !schedule.time) {
        return { hasConflict: false };
    }
    
    try {
        // Teacher ning barcha active guruhlarini olish
        let query = `
            SELECT id, name, schedule, status 
            FROM groups 
            WHERE teacher_id = $1 
            AND (status = 'active' OR status = 'draft') 
            AND schedule IS NOT NULL
        `;
        
        const params = [teacherId];
        
        if (excludeGroupId) {
            query += ` AND id != $2`;
            params.push(excludeGroupId);
        }
        
        const result = await pool.query(query, params);
        
        for (const group of result.rows) {
            const groupSchedule = group.schedule;
            
            // Kunlar to'qnashuvini tekshirish
            if (isDaysOverlap(schedule.days, groupSchedule.days)) {
                // Vaqt to'qnashuvini tekshirish
                if (isTimeOverlap(schedule.time, groupSchedule.time)) {
                    return {
                        hasConflict: true,
                        conflictGroup: {
                            id: group.id,
                            name: group.name,
                            schedule: groupSchedule,
                            status: group.status
                        }
                    };
                }
            }
        }
        
        return { hasConflict: false };
    } catch (err) {
        throw new Error(`Schedule conflict tekshirishda xatolik: ${err.message}`);
    }
};

// Vaqt to'qnashuvini tekshirish helper funksiyasi
const checkScheduleConflict = async (teacherId, newSchedule, excludeGroupId = null) => {
    if (!teacherId || !newSchedule) return { hasConflict: false };
    
    try {
        // Teacher ning barcha guruhlarining jadvalini olish (active guruhlar)
        let query = `SELECT id, name, schedule FROM groups 
                     WHERE teacher_id = $1 AND schedule IS NOT NULL AND status != 'blocked'`;
        let params = [teacherId];
        
        // Agar guruhni yangilayotgan bo'lsak, o'sha guruhni chiqarib qo'yamiz
        if (excludeGroupId) {
            query += ` AND id != $2`;
            params.push(excludeGroupId);
        }
        
        const result = await pool.query(query, params);
        const existingGroups = result.rows;
        
        // Har bir mavjud guruh uchun to'qnashuvni tekshirish
        for (const group of existingGroups) {
            if (!group.schedule) continue;
            
            const existingSchedule = group.schedule;
            const conflict = hasTimeConflict(newSchedule, existingSchedule);
            
            if (conflict) {
                return { 
                    hasConflict: true, 
                    conflictGroup: group,
                    conflictDetails: conflict
                };
            }
        }
        
        return { hasConflict: false };
    } catch (err) {
        console.error('Schedule conflict check error:', err);
        return { hasConflict: false }; // Xato bo'lsa, davom ettiramiz
    }
};

// Ikki jadval o'rtasida vaqt to'qnashuvini tekshirish
const hasTimeConflict = (schedule1, schedule2) => {
    if (!schedule1 || !schedule2) return false;
    
    for (const day1 in schedule1) {
        if (schedule2[day1]) {
            const times1 = schedule1[day1];
            const times2 = schedule2[day1];
            
            // Har bir vaqt oralig'ini tekshirish
            for (const time1 of times1) {
                for (const time2 of times2) {
                    if (timeRangesOverlap(time1, time2)) {
                        return {
                            day: day1,
                            existingTime: time2,
                            newTime: time1
                        };
                    }
                }
            }
        }
    }
    return false;
};

// Vaqt oraliqlarining ustma-ust tushishini tekshirish
const timeRangesOverlap = (range1, range2) => {
    if (!range1.start || !range1.end || !range2.start || !range2.end) return false;
    
    const start1 = timeToMinutes(range1.start);
    const end1 = timeToMinutes(range1.end);
    const start2 = timeToMinutes(range2.start);
    const end2 = timeToMinutes(range2.end);
    
    // Overlap tekshiruvi: (start1 < end2) && (start2 < end1)
    return start1 < end2 && start2 < end1;
};

// Vaqtni minutga o'zgartirish (masalan "14:30" -> 870)
const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// 1. Guruh yaratish (Teacher-subject va schedule conflict validation bilan)
exports.createGroup = async (req, res) => {
    const { name, teacher_id, start_date, schedule, subject_id, price, status, room_id } = req.body;
    const unique_code = generateUniqueCode();
    
    try {
        // Agar teacher_id va subject_id berilgan bo'lsa, teacher bu fanni o'qitishini tekshirish
        if (teacher_id && subject_id) {
            const teacherSubjects = await getTeacherSubjects(teacher_id);
            const canTeachSubject = teacherSubjects.some(sub => sub.id === subject_id);
            
            if (!canTeachSubject) {
                return res.status(400).json({ 
                    message: "Bu teacher tanlangan fanni o'qitmaydi",
                    teacher_id,
                    subject_id,
                    teacher_subjects: teacherSubjects.map(s => ({ id: s.id, name: s.name }))
                });
            }
        }
        
        // Teacher schedule conflict tekshirish
        if (teacher_id && schedule) {
            const conflict = await checkTeacherScheduleConflict(teacher_id, schedule);
            if (conflict.hasConflict) {
                return res.status(400).json({
                    message: "Bu teacher tanlangan kun va vaqtda boshqa guruhda dars bor!",
                    teacher_id,
                    conflict_group: conflict.conflictGroup,
                    new_schedule: schedule,
                    suggestion: "Boshqa vaqt yoki kun tanlang, yoki mavjud guruhning vaqtini o'zgartiring"
                });
            }
        }

        // Schedule conflict tekshiruvi
        if (teacher_id && schedule) {
            const conflictCheck = await checkScheduleConflict(teacher_id, schedule);
            if (conflictCheck.hasConflict) {
                return res.status(400).json({
                    message: "Bu teacherning ko'rsatilgan kunda va vaqtda boshqa guruhida darsi bor!",
                    conflict: {
                        day: conflictCheck.conflictDetails.day,
                        existing_time: conflictCheck.conflictDetails.existingTime,
                        new_time: conflictCheck.conflictDetails.newTime,
                        conflicting_group: {
                            id: conflictCheck.conflictGroup.id,
                            name: conflictCheck.conflictGroup.name
                        }
                    },
                    suggestion: "Boshqa vaqt tanlang yoki mavjud guruh vaqtini o'zgartiring"
                });
            }
        }

        // Xona conflict tekshirish
        if (room_id && schedule) {
            const roomCheck = await checkRoomAvailability(room_id, schedule);
            if (!roomCheck.isAvailable) {
                return res.status(400).json({
                    message: "Bu xona tanlangan kun va vaqtda band!",
                    room_id,
                    conflict_group: roomCheck.conflictGroup,
                    new_schedule: schedule,
                    suggestion: "Boshqa xona yoki vaqt tanlang"
                });
            }
        }

        const result = await pool.query(
            `INSERT INTO groups (name, teacher_id, unique_code, start_date, schedule, subject_id, price, status, room_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [
                name, 
                teacher_id, 
                unique_code, 
                start_date ? start_date : null,
                schedule ? JSON.stringify(schedule) : null,
                subject_id,
                price,
                status || 'draft', // Default status
                room_id || null
            ]
        );
        res.status(201).json({ success: true, group: result.rows[0] });
    } catch (err) { 
        if (err.code === '23505') {
            return exports.createGroup(req, res); 
        }
        res.status(500).json({ error: err.message }); 
    }
};
// 2. Guruhni tahrirlash (Teacher-subject va schedule conflict validation bilan)
exports.updateGroup = async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, teacher_id, is_active, schedule, start_date, price, subject_id, room_id, schedule_effective_from } = req.body;
    let transactionStarted = false;
    
    try {
        const currentGroupResult = await pool.query(
            `SELECT id, teacher_id, room_id, subject_id, schedule
             FROM groups
             WHERE id = $1`,
            [id]
        );
        if (currentGroupResult.rows.length === 0) {
            return res.status(404).json({ message: "Guruh topilmadi" });
        }
        const currentGroup = currentGroupResult.rows[0];

        // Bo'sh string va 0 qiymatlarni null ga o'zgartirish
        const processedTeacherId = (teacher_id === 0 || teacher_id === "" || teacher_id === null) ? null : teacher_id;
        const processedSubjectId = (subject_id === 0 || subject_id === "" || subject_id === null) ? null : subject_id;
        const processedStartDate = (start_date === "" || start_date === null) ? null : start_date;
        const processedRoomId = (room_id === 0 || room_id === "" || room_id === null) ? null : room_id;
        const finalTeacherId = processedTeacherId === undefined ? currentGroup.teacher_id : processedTeacherId;
        const finalSubjectId = processedSubjectId === undefined ? currentGroup.subject_id : processedSubjectId;
        const finalRoomId = processedRoomId === undefined ? currentGroup.room_id : processedRoomId;
        const teacherForValidation = processedTeacherId !== undefined ? processedTeacherId : currentGroup.teacher_id;
        const roomForValidation = processedRoomId !== undefined ? processedRoomId : currentGroup.room_id;
        const scheduleChanged = schedule !== undefined
            && normalizeScheduleForCompare(schedule) !== normalizeScheduleForCompare(currentGroup.schedule);
        if (scheduleChanged && schedule_effective_from && !/^\d{4}-\d{2}-\d{2}$/.test(String(schedule_effective_from))) {
            return res.status(400).json({
                message: "schedule_effective_from YYYY-MM-DD formatida bo'lishi kerak"
            });
        }
        const effectiveFrom = scheduleChanged
            ? (schedule_effective_from && /^\d{4}-\d{2}-\d{2}$/.test(String(schedule_effective_from))
                ? schedule_effective_from
                : todayAsDateString())
            : null;
        
        // Teacher va subject validation - agar ikkalasi ham berilgan bo'lsa
        if (teacherForValidation && processedSubjectId) {
            const teacherSubjects = await getTeacherSubjects(teacherForValidation);
            const canTeachSubject = teacherSubjects.some(sub => sub.id === processedSubjectId);
            
            if (!canTeachSubject) {
                return res.status(400).json({ 
                    message: "Bu teacher tanlangan fanni o'qitmaydi",
                    teacher_id: teacherForValidation,
                    subject_id: processedSubjectId,
                    teacher_subjects: teacherSubjects.map(s => ({ id: s.id, name: s.name }))
                });
            }
        }
        
        // Teacher schedule conflict tekshirish (faqat teacher_id yoki schedule o'zgarsa)
        if (teacherForValidation && schedule) {
            const conflict = await checkTeacherScheduleConflict(teacherForValidation, schedule, id);
            if (conflict.hasConflict) {
                return res.status(400).json({
                    message: "Bu teacher tanlangan kun va vaqtda boshqa guruhda dars bor!",
                    teacher_id: teacherForValidation,
                    conflict_group: conflict.conflictGroup,
                    new_schedule: schedule,
                    suggestion: "Boshqa vaqt yoki kun tanlang, yoki mavjud guruhning vaqtini o'zgartiring"
                });
            }
        }

        // Schedule conflict tekshiruvi - faqat teacher va schedule o'zgartirish paytida
        if (teacherForValidation && schedule) {
            const conflictCheck = await checkScheduleConflict(teacherForValidation, schedule, id);
            if (conflictCheck.hasConflict) {
                return res.status(400).json({
                    message: "Bu teacherning ko'rsatilgan kunda va vaqtda boshqa guruhida darsi bor!",
                    conflict: {
                        day: conflictCheck.conflictDetails.day,
                        existing_time: conflictCheck.conflictDetails.existingTime,
                        new_time: conflictCheck.conflictDetails.newTime,
                        conflicting_group: {
                            id: conflictCheck.conflictGroup.id,
                            name: conflictCheck.conflictGroup.name
                        }
                    },
                    suggestion: "Boshqa vaqt tanlang yoki mavjud guruh vaqtini o'zgartiring"
                });
            }
        }

        // Xona conflict tekshirish
        if (roomForValidation && schedule) {
            const roomCheck = await checkRoomAvailability(roomForValidation, schedule, id);
            if (!roomCheck.isAvailable) {
                return res.status(400).json({
                    message: "Bu xona tanlangan kun va vaqtda band!",
                    room_id: roomForValidation,
                    conflict_group: roomCheck.conflictGroup,
                    new_schedule: schedule,
                    suggestion: "Boshqa xona yoki vaqt tanlang"
                });
            }
        }

        await pool.query('BEGIN');
        transactionStarted = true;

        const result = await pool.query(
            `UPDATE groups SET 
                name = COALESCE($1, name), 
                teacher_id = $2, 
                is_active = COALESCE($3, is_active), 
                schedule = COALESCE($4, schedule),
                start_date = COALESCE($5, start_date),
                price = COALESCE($6, price),
                subject_id = $7,
                room_id = $8,
                schedule_effective_from = CASE
                  WHEN $9::date IS NOT NULL THEN $9::date
                  ELSE schedule_effective_from
                END
             WHERE id = $10 RETURNING *`,
            [name, finalTeacherId, is_active, schedule ? JSON.stringify(schedule) : null, processedStartDate, price, finalSubjectId, finalRoomId, effectiveFrom, id]
        );
        if (result.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ message: "Guruh topilmadi" });
        }

        let deletedLessonsCount = 0;
        let deletedAttendanceCount = 0;
        if (scheduleChanged && effectiveFrom) {
            const deletedAttendance = await pool.query(
                `DELETE FROM attendance a
                 USING lessons l
                 WHERE a.lesson_id = l.id
                   AND l.group_id = $1
                   AND l.date >= $2::date`,
                [id, effectiveFrom]
            );
            const deletedLessons = await pool.query(
                `DELETE FROM lessons
                 WHERE group_id = $1
                   AND date >= $2::date`,
                [id, effectiveFrom]
            );
            deletedLessonsCount = deletedLessons.rowCount;
            deletedAttendanceCount = deletedAttendance.rowCount;
        }

        await pool.query('COMMIT');
        transactionStarted = false;

        return res.json({
            success: true,
            group: result.rows[0],
            ...(scheduleChanged ? {
                schedule_change: {
                    effective_from: effectiveFrom,
                    deleted_future_lessons_count: deletedLessonsCount,
                    deleted_future_attendance_count: deletedAttendanceCount,
                    note: 'Bu sanadan oldingi lessonlar saqlanib qoldi'
                }
            } : {})
        });
    } catch (err) {
        if (transactionStarted) {
            await pool.query('ROLLBACK');
        }
        return res.status(500).json({ error: err.message });
    }
};

// 2.1. Guruh statusini o'zgartirish (draft -> active -> blocked)
exports.updateGroupStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'draft', 'active', 'blocked'
    
    // Status validatsiya
    const validStatuses = ['draft', 'active', 'blocked'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            message: "Status faqat 'draft', 'active' yoki 'blocked' bo'lishi mumkin" 
        });
    }

    try {
        // Agar guruh bloklansa, avval faol talabalar borligini tekshirish
        if (status === 'blocked') {
            const activeStudentsCheck = await pool.query(
                `SELECT COUNT(*) as count 
                 FROM student_groups 
                 WHERE group_id = $1 AND status = 'active'`,
                [id]
            );
            
            const activeStudentsCount = parseInt(activeStudentsCheck.rows[0].count);
            
            if (activeStudentsCount > 0) {
                return res.status(400).json({ 
                    message: `Guruhda ${activeStudentsCount} ta faol talaba mavjud. Avval talabalarni to'xtatish kerak!`,
                    activeStudentsCount: activeStudentsCount
                });
            }
        }

        let updateFields = {};
        let updateValues = [];
        let paramCount = 1;
        let updateQuery = 'UPDATE groups SET ';
        
        // Status active bo'lsa - darslar boshlangan deb belgilaymiz
        if (status === 'active') {
            updateFields.status = status;
            updateFields.class_start_date = new Date();
            updateFields.class_status = 'started';
            
            updateQuery += 'status = $1, class_start_date = $2, class_status = $3 WHERE id = $4';
            updateValues = [status, new Date(), 'started', id];
        } else {
            updateFields.status = status;
            updateQuery += 'status = $1 WHERE id = $2';
            updateValues = [status, id];
        }
        
        const result = await pool.query(
            updateQuery + ' RETURNING id, name, status, teacher_id, start_date, class_start_date, class_status',
            updateValues
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Guruh topilmadi" });
        }

        // Guruh statusiga qarab student_groups statusini yangilash
        if (status === 'blocked') {
            // Guruh bloklanganda barcha talabalar statusini 'stopped' ga o'zgartirish
            await pool.query(
                `UPDATE student_groups 
                 SET status = 'stopped', left_at = $2
                 WHERE group_id = $1 AND status = 'active'`,
                [id, new Date()]
            );
            
            // Guruh bloklanganda talabalarning course ma'lumotlarini yangilash
            await pool.query(
                `UPDATE users 
                 SET course_status = 'stopped', 
                     course_end_date = $1 
                 WHERE id IN (
                     SELECT sg.student_id 
                     FROM student_groups sg 
                     WHERE sg.group_id = $2 AND sg.status = 'stopped'
                 ) AND course_status = 'in_progress'`,
                [new Date(), id]
            );
        } else if (status === 'active') {
            // Guruh aktiv bo'lganda talabalar statusini 'active' ga qaytarish
            await pool.query(
                `UPDATE student_groups 
                 SET status = 'active', left_at = NULL
                 WHERE group_id = $1 AND status = 'stopped'`,
                [id]
            );
            
            // Guruh aktiv bo'lganda talabalarning course ma'lumotlarini qaytarish
            await pool.query(
                `UPDATE users 
                 SET course_status = 'in_progress', 
                     course_end_date = NULL 
                 WHERE id IN (
                     SELECT sg.student_id 
                     FROM student_groups sg 
                     WHERE sg.group_id = $1 AND sg.status = 'active'
                 ) AND course_status = 'stopped'`,
                [id]
            );
        }

        // Agar guruh active holatiga o'tkazilsa, barcha studentlarning course statusini yangilash
        if (status === 'active') {
            await pool.query(
                `UPDATE users 
                 SET course_status = 'in_progress', 
                     course_start_date = $1 
                 WHERE id IN (
                     SELECT sg.student_id 
                     FROM student_groups sg 
                     WHERE sg.group_id = $2 AND sg.status = 'active'
                 ) AND course_status = 'not_started'`,
                [new Date(), id]
            );
        }

        let message = '';
        if (status === 'draft') {
            message = "Guruh tayyorgarlik holatiga o'tkazildi (studentlar yig'ilmoqda)";
        } else if (status === 'active') {
            message = "Guruh faollashtirildi (darslar boshlandi). Barcha studentlarning kursi avtomatik boshlandi.";
        } else {
            message = "Guruh bloklandi";
        }

        res.json({
            success: true,
            message: message,
            group: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Studentni chiqarish
exports.removeStudentFromGroup = async (req, res) => {
    const group_id = parseInt(req.params.group_id);
    const student_id = parseInt(req.params.student_id);
    try {
        const result = await pool.query(
            "DELETE FROM student_groups WHERE group_id = $1 AND student_id = $2 RETURNING *",
            [group_id, student_id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "Bu student guruhda topilmadi" });
        res.json({ success: true, message: "Student guruhdan o'chirildi" });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 4. Admin studentni qo'shishi
exports.adminAddStudentToGroup = async (req, res) => {
    const { student_id, group_id } = req.body;
    try {
        // Student statusini tekshirish
        const studentCheck = await pool.query(
            'SELECT id, name, surname, status FROM users WHERE id = $1 AND role = $2',
            [student_id, 'student']
        );

        if (studentCheck.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        const student = studentCheck.rows[0];
        
        // Student faol bo'lmasa guruhga qo'shishni taqiqlash
        if (student.status !== 'active') {
            const statusNames = {
                'inactive': 'o\'qishni to\'xtatgan',
                'blocked': 'bloklangan',
                'studying': 'o\'qimoqda',
                'graduated': 'bitirgan',
                'dropped_out': 'bitimasdan chiqib ketgan'
            };
            
            return res.status(400).json({ 
                success: false,
                message: `${student.name} ${student.surname} ni guruhga qo'shib bo'lmaydi. Student holati: ${statusNames[student.status] || student.status}`,
                student_status: student.status,
                allowed_status: 'active',
                note: "Faqat faol (active) studentlarni guruhga qo'shish mumkin"
            });
        }

        // Guruh ma'lumotlarini olish
        const groupRes = await pool.query(
            `SELECT g.id, g.name as group_name, g.price, g.teacher_id, g.status, u.name || ' ' || u.surname as teacher_name 
             FROM groups g 
             LEFT JOIN users u ON g.teacher_id = u.id 
             WHERE g.id = $1`,
            [group_id]
        );
        if (groupRes.rows.length === 0) {
            return res.status(404).json({ message: "Guruh topilmadi" });
        }
        if (groupRes.rows[0].status === 'blocked') {
            return res.status(400).json({ message: "Bloklangan guruhga student qo'shib bo'lmaydi" });
        }

        const groupData = groupRes.rows[0];

        // Debug: guruh ma'lumotlarini console'ga chiqarish
        console.log("📊 Guruh ma'lumotlari:", groupData);
        console.log("💰 Price:", groupData.price, "Type:", typeof groupData.price);

        // Student_groups jadvaliga qo'shish - guruh holatiga qarab status belgilash
        let studentGroupStatus = 'active';
        
        // Agar guruh bloklangan bo'lsa, talabani ham bloklangan holatda qo'shamiz
        if (groupData.status === 'blocked') {
            studentGroupStatus = 'stopped';
        }
        
        const result = await pool.query(
            "INSERT INTO student_groups (student_id, group_id, status) VALUES ($1, $2, $3) RETURNING *",
            [student_id, group_id, studentGroupStatus]
        );

        // Users jadvalida studentning ma'lumotlarini yangilash
        const updateResult = await pool.query(
            `UPDATE users SET 
              group_id = $1, 
              group_name = $2, 
              teacher_id = $3
             WHERE id = $4
             RETURNING id, name, surname, group_id, group_name, teacher_id`,
            [groupData.id, groupData.group_name, groupData.teacher_id, student_id]
        );

        // Agar guruh allaqachon active bo'lsa, studentning course statusini avtomatik boshlash
        if (groupData.status === 'active') {
            await pool.query(
                `UPDATE users 
                 SET course_status = 'in_progress', 
                     course_start_date = CURRENT_TIMESTAMP 
                 WHERE id = $1 AND course_status = 'not_started'`,
                [student_id]
            );
        }

        console.log("✅ Student yangilandi:", updateResult.rows[0]);

        res.status(201).json({ 
            success: true, 
            message: "Student guruhga qo'shildi",
            data: result.rows[0],
            updatedStudent: updateResult.rows[0],
            updatedFields: {
                group_id: groupData.id,
                group_name: groupData.group_name,
                teacher_id: groupData.teacher_id,
                teacher_name: groupData.teacher_name
            }
        });
    } catch (err) { 
        console.error("❌ Xatolik:", err);
        if (err.code === '23505') {
            return res.status(400).json({ message: "Bu student allaqachon guruhda" });
        }
        res.status(500).json({ error: err.message }); 
    }
};

// 5. Student kod orqali qo'shilishi
exports.studentJoinByCode = async (req, res) => {
    const { unique_code } = req.body;
    try {
        // Guruh ma'lumotlarini olish
        const group = await pool.query(
            `SELECT g.id, g.name as group_name, g.price, g.teacher_id, u.name || ' ' || u.surname as teacher_name, g.is_active, g.status 
             FROM groups g 
             LEFT JOIN users u ON g.teacher_id = u.id 
             WHERE g.unique_code = $1`,
            [unique_code]
        );
        if (!group.rows[0]) return res.status(404).json({ message: "Bunday kodli guruh mavjud emas" });
        if (!group.rows[0].is_active) return res.status(400).json({ message: "Guruh hozirda bloklangan" });
        if (group.rows[0].status === 'blocked') return res.status(400).json({ message: "Guruh bloklangan holatda" });

        const groupData = group.rows[0];

        // Student guruhga qo'shiladi - guruh holatiga qarab status belgilash
        let studentGroupStatus = 'active';
        if (groupData.status === 'blocked') {
            studentGroupStatus = 'stopped';
        }
        
        // Student_groups jadvaliga qo'shish
        const result = await pool.query(
            "INSERT INTO student_groups (student_id, group_id, status) VALUES ($1, $2, $3) RETURNING *",
            [req.user.id, groupData.id, studentGroupStatus]
        );

        // Users jadvalida studentning ma'lumotlarini yangilash
        await pool.query(
            `UPDATE users SET 
              group_id = $1, 
              group_name = $2, 
              teacher_id = $3
             WHERE id = $4`,
            [groupData.id, groupData.group_name, groupData.teacher_id, req.user.id]
        );

        // Agar guruh allaqachon active bo'lsa, studentning course statusini avtomatik boshlash
        if (groupData.status === 'active') {
            await pool.query(
                `UPDATE users 
                 SET course_status = 'in_progress', 
                     course_start_date = CURRENT_TIMESTAMP 
                 WHERE id = $1 AND course_status = 'not_started'`,
                [req.user.id]
            );
        }

        res.status(201).json({ 
            success: true, 
            message: "Guruhga muvaffaqiyatli qo'shildingiz",
            data: result.rows[0],
            groupInfo: {
                group_name: groupData.group_name,
                teacher_name: groupData.teacher_name,
                price: groupData.price
            }
        });
    } catch (err) { 
        if(err.code === '23505') return res.status(400).json({ message: "Siz allaqachon bu guruhdasiz" });
        res.status(500).json({ error: err.message }); 
    }
};

// 6. Filtrlangan ro'yxat (Fan ma'lumoti bilan)
exports.getAllGroups = async (req, res) => {
    const { teacher_id, subject_id, is_active, status } = req.query;
    let query = `SELECT g.*, 
                        CONCAT(u.name, ' ', u.surname) as teacher_name,
                        s.name as subject_name,
                        r.room_number,
                        r.capacity as room_capacity,
                        r.has_projector,
                        -- Teacher-ning barcha fanlarini olish
                        COALESCE(
                            (SELECT json_agg(
                                json_build_object(
                                    'id', sub.id,
                                    'name', sub.name
                                ) ORDER BY sub.name ASC
                            )
                            FROM teacher_subjects ts
                            JOIN subjects sub ON ts.subject_id = sub.id
                            WHERE ts.teacher_id = u.id),
                            '[]'::json
                        ) as teacher_subjects,
                        -- Guruhda talabalar statistikasi
                        COALESCE(
                            (SELECT COUNT(*)::integer
                            FROM student_groups sg
                            WHERE sg.group_id = g.id),
                            0
                        ) as total_students_count,
                        COALESCE(
                            (SELECT COUNT(*)::integer
                            FROM student_groups sg
                            WHERE sg.group_id = g.id AND sg.status = 'active'),
                            0
                        ) as active_students_count,
                        COALESCE(
                            (SELECT COUNT(*)::integer
                            FROM student_groups sg
                            WHERE sg.group_id = g.id AND sg.status = 'stopped'),
                            0
                        ) as stopped_students_count,
                        COALESCE(
                            (SELECT COUNT(*)::integer
                            FROM student_groups sg
                            WHERE sg.group_id = g.id AND sg.status = 'finished'),
                            0
                        ) as finished_students_count
                 FROM groups g 
                 LEFT JOIN users u ON g.teacher_id = u.id 
                 LEFT JOIN subjects s ON g.subject_id = s.id
                 LEFT JOIN rooms r ON g.room_id = r.id
                 WHERE 1=1`;
    const params = [];

    if (teacher_id) { params.push(parseInt(teacher_id)); query += ` AND g.teacher_id = $${params.length}`; }
    if (subject_id) { params.push(parseInt(subject_id)); query += ` AND g.subject_id = $${params.length}`; }
    if (is_active !== undefined) { params.push(is_active === 'true'); query += ` AND g.is_active = $${params.length}`; }
    if (status) { params.push(status); query += ` AND g.status = $${params.length}`; }

    query += ` ORDER BY g.created_at DESC`;

    try {
        const result = await pool.query(query, params);
        
        // Natijalarni formatlash
        const formattedGroups = result.rows.map(group => ({
            ...group,
            teacher_subjects: group.teacher_subjects || [],
            teacher_subjects_count: (group.teacher_subjects || []).length
        }));
        
        res.json({ 
            success: true, 
            count: formattedGroups.length, 
            groups: formattedGroups 
        });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
};

// 7. Bitta guruh (Batafsil ma'lumot va talabalar ro'yxati)
exports.getGroupById = async (req, res) => {
    const id = parseInt(req.params.id);
    
    // ID raqam ekanligini tekshirish
    if (isNaN(id)) {
        return res.status(400).json({ message: "ID raqam bo'lishi shart!" });
    }

    try {
        // Guruh ma'lumotlarini olish (subject nomi bilan)
        const group = await pool.query(`
            SELECT g.*, 
                   CONCAT(u.name, ' ', u.surname) as teacher_name, 
                   u.phone as teacher_phone, 
                   u.phone2 as teacher_phone2,
                   u.certificate as teacher_certificate, 
                   u.age as teacher_age, 
                   u.has_experience as teacher_has_experience,
                   u.experience_years as teacher_experience_years, 
                   u.experience_place as teacher_experience_place,
                   u.available_times as teacher_available_times, 
                   u.work_days_hours as teacher_work_days_hours,
                   s.name as subject_name,
                   r.room_number,
                   r.capacity as room_capacity,
                   r.has_projector,
                   r.description as room_description
            FROM groups g 
            LEFT JOIN users u ON g.teacher_id = u.id 
            LEFT JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN rooms r ON g.room_id = r.id
            WHERE g.id = $1`, [id]);

        if (group.rows.length === 0) {
            return res.status(404).json({ message: "Guruh topilmadi" });
        }

        // Guruhdagi studentlarni barcha ma'lumotlari bilan olish
        const students = await pool.query(`
            SELECT 
                u.id, 
                u.name, 
                u.surname, 
                u.phone,
                u.phone2,
                u.father_name,
                u.father_phone,
                u.age,
                u.address,
                u.status as student_status,
                u.course_status,
                u.course_start_date,
                u.course_end_date,
                u.created_at as registration_date,
                u.role,
                sg.status as group_status,
                CASE 
                  WHEN sg.status = 'active' THEN 'Faol'
                  WHEN sg.status = 'stopped' THEN 'Nofaol'
                  WHEN sg.status = 'finished' THEN 'Bitirgan'
                  ELSE 'Belgilanmagan'
                END as group_status_description,
                sg.joined_at,
                sg.left_at
            FROM users u 
            JOIN student_groups sg ON u.id = sg.student_id 
            WHERE sg.group_id = $1 
            ORDER BY sg.status = 'active' DESC, u.name, u.surname`, [id]);

        res.json({ 
            success: true, 
            group: group.rows[0], 
            students: students.rows 
        });
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
};
// 8. Guruhni butunlay o'chirish (Admin)
exports.deleteGroup = async (req, res) => {
    const id = parseInt(req.params.id);

    // ID raqam ekanligini tekshirish
    if (isNaN(id)) {
        return res.status(400).json({ message: "ID raqam bo'lishi shart!" });
    }

    try {
        const result = await pool.query(
            "DELETE FROM groups WHERE id = $1 RETURNING *",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Guruh topilmadi" });
        }

        res.json({ 
            success: true, 
            message: "Guruh va unga tegishli barcha a'zolik ma'lumotlari muvaffaqiyatli o'chirildi",
            deletedGroup: result.rows[0] 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 9. Student guruhni ko'rishi (faqat guruh tavsifotlari va ism-familiyalar)
exports.getGroupViewForStudent = async (req, res) => {
    const groupId = parseInt(req.params.id);

    if (isNaN(groupId)) {
        return res.status(400).json({ message: "ID raqam bo'lishi shart!" });
    }

    try {
        // Guruh ma'lumotlarini teacher bilan olish
        const group = await pool.query(`
            SELECT 
                g.id, 
                g.name, 
                g.start_date, 
                g.schedule, 
                g.is_active,
                CONCAT(u.name, ' ', u.surname) as teacher_name,
                u.phone as teacher_phone,
                u.phone2 as teacher_phone2
            FROM groups g
            LEFT JOIN users u ON g.teacher_id = u.id
            WHERE g.id = $1
        `, [groupId]);

        if (group.rows.length === 0) {
            return res.status(404).json({ message: "Guruh topilmadi" });
        }

        // Guruh a'zolari (faqat ism-familiya)
        const groupMembers = await pool.query(`
            SELECT 
                u.name,
                u.surname
            FROM users u
            JOIN student_groups sg ON u.id = sg.student_id
            WHERE sg.group_id = $1 AND sg.status = 'active'
            ORDER BY u.name
        `, [groupId]);

        res.json({
            success: true,
            group: group.rows[0],
            members: groupMembers.rows,
            totalMembers: groupMembers.rows.length
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 11. Studentni boshqa guruhga o'tkazish (Admin)
exports.changeStudentGroup = async (req, res) => {
    const { student_id, new_group_id } = req.body;

    if (!student_id || !new_group_id) {
        return res.status(400).json({ 
            message: "student_id va new_group_id majburiy" 
        });
    }

    try {
        // Studentni tekshirish
        const studentCheck = await pool.query(
            'SELECT id, name, surname, status, group_id, group_name FROM users WHERE id = $1 AND role = $2',
            [student_id, 'student']
        );

        if (studentCheck.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        const student = studentCheck.rows[0];
        
        // Student faol bo'lmasa guruh o'zgartirishni taqiqlash
        if (student.status !== 'active') {
            const statusNames = {
                'inactive': 'o\'qishni to\'xtatgan',
                'blocked': 'bloklangan',
                'studying': 'o\'qimoqda',
                'graduated': 'bitirgan',
                'dropped_out': 'bitimasdan chiqib ketgan'
            };
            
            return res.status(400).json({ 
                success: false,
                message: `${student.name} ${student.surname} ni boshqa guruhga o'tkazib bo'lmaydi. Student holati: ${statusNames[student.status] || student.status}`,
                student_status: student.status,
                allowed_status: 'active',
                note: "Faqat faol (active) studentlarni guruh o'zgartirish mumkin. Agar kerak bo'lsa, avval studentni faol holatiga o'tkazing.",
                current_group: student.group_name,
                allowed_action: "Faqat guruhdan chiqarish mumkin"
            });
        }

        const oldGroupId = student.group_id;

        // Yangi guruhni tekshirish
        const newGroupCheck = await pool.query(
            `SELECT g.id, g.name as group_name, g.teacher_id, u.name || ' ' || u.surname as teacher_name, g.is_active
             FROM groups g 
             LEFT JOIN users u ON g.teacher_id = u.id 
             WHERE g.id = $1`,
            [new_group_id]
        );

        if (newGroupCheck.rows.length === 0) {
            return res.status(404).json({ message: "Yangi guruh topilmadi" });
        }

        const newGroup = newGroupCheck.rows[0];

        if (!newGroup.is_active) {
            return res.status(400).json({ message: "Yangi guruh faol emas (bloklangan)" });
        }

        // Eski guruhdan o'chirish (agar mavjud bo'lsa)
        if (oldGroupId) {
            await pool.query(
                'DELETE FROM student_groups WHERE student_id = $1 AND group_id = $2',
                [student_id, oldGroupId]
            );
        }

        // Yangi guruhga qo'shish - yangi guruh holatiga qarab status belgilash
        const newGroupStatusCheck = await pool.query(
            'SELECT status FROM groups WHERE id = $1',
            [new_group_id]
        );
        
        let studentGroupStatus = 'active';
        if (newGroupStatusCheck.rows.length > 0 && newGroupStatusCheck.rows[0].status === 'blocked') {
            studentGroupStatus = 'stopped';
        }
        
        await pool.query(
            `INSERT INTO student_groups (student_id, group_id, status) \n             VALUES ($1, $2, $3)
             ON CONFLICT (student_id, group_id) DO NOTHING`,
            [student_id, new_group_id, studentGroupStatus]
        );

        // Users jadvalidagi ma'lumotlarni yangilash
        const updateResult = await pool.query(
            `UPDATE users SET 
              group_id = $1, 
              group_name = $2, 
              teacher_id = $3, 
              teacher_name = $4
             WHERE id = $5
             RETURNING id, name, surname, group_id, group_name, teacher_id, teacher_name`,
            [newGroup.id, newGroup.group_name, newGroup.teacher_id, newGroup.teacher_name, student_id]
        );

        res.json({
            success: true,
            message: `${student.name} ${student.surname} guruhdan guruhga ko'chirildi`,
            previous_group: {
                id: oldGroupId,
                name: student.group_name
            },
            new_group: {
                id: newGroup.id,
                name: newGroup.group_name,
                teacher_name: newGroup.teacher_name
            },
            updated_student: updateResult.rows[0]
        });
    } catch (err) {
        console.error("Guruhni o'zgartirishda xato:", err);
        res.status(500).json({ error: err.message });
    }
};

// Barcha studentlarda nomuvofiqliklarni aniqlash va tuzatish 
exports.fixAllStudentCourseStatuses = async (req, res) => {
    try {
        // Nomuvofiq studentlarni topish
        const inconsistentStudents = await pool.query(`
            SELECT 
                u.id, u.name, u.surname, 
                u.status as student_status,
                u.course_status, u.course_start_date, u.course_end_date,
                u.group_id, u.group_name,
                g.status as group_status, g.class_status, g.class_start_date,
                CASE 
                    WHEN u.group_id IS NOT NULL AND g.status = 'active' AND u.course_status = 'not_started' THEN 'need_start'
                    WHEN u.group_id IS NULL AND u.course_status = 'in_progress' THEN 'need_reset'
                    ELSE 'ok'
                END as issue_type
            FROM users u
            LEFT JOIN groups g ON u.group_id = g.id
            WHERE u.role = 'student' 
            AND (
                (u.group_id IS NOT NULL AND g.status = 'active' AND u.course_status = 'not_started') OR
                (u.group_id IS NULL AND u.course_status = 'in_progress')
            )
        `);

        if (inconsistentStudents.rows.length === 0) {
            return res.json({
                success: true,
                message: "Barcha studentlarda course status to'g'ri",
                fixed_count: 0
            });
        }

        let fixedStudents = [];

        for (const student of inconsistentStudents.rows) {
            let updateFields = [];
            let updateValues = [];
            let paramIndex = 1;
            let fixes = [];

            if (student.issue_type === 'need_start') {
                // Active guruhda, lekin kurs hali boshlanmagan
                updateFields.push(`course_status = $${paramIndex++}`);
                updateValues.push('in_progress');
                
                if (!student.course_start_date) {
                    updateFields.push(`course_start_date = $${paramIndex++}`);
                    updateValues.push(new Date());
                }
                
                fixes.push("Course status 'in_progress' ga o'zgartirildi");
                if (!student.course_start_date) {
                    fixes.push("Course start date belgilandi");
                }

            } else if (student.issue_type === 'need_reset') {
                // Guruhda emas, lekin kurs progress da
                updateFields.push(`course_status = $${paramIndex++}`);
                updateValues.push('not_started');
                
                updateFields.push(`course_start_date = $${paramIndex++}`);
                updateValues.push(null);
                
                fixes.push("Course status 'not_started' ga qaytarildi");
                fixes.push("Course start date tozalandi");
            }

            if (updateFields.length > 0) {
                updateValues.push(student.id);
                
                const updateQuery = `
                    UPDATE users 
                    SET ${updateFields.join(', ')} 
                    WHERE id = $${paramIndex}
                `;
                
                await pool.query(updateQuery, updateValues);
                
                fixedStudents.push({
                    id: student.id,
                    name: `${student.name} ${student.surname}`,
                    fixes: fixes,
                    issue_type: student.issue_type
                });
            }
        }

        res.json({
            success: true,
            message: `${fixedStudents.length} ta studentning course statusi tuzatildi`,
            fixed_count: fixedStudents.length,
            total_issues_found: inconsistentStudents.rows.length,
            fixed_students: fixedStudents
        });

    } catch (err) {
        console.error("Barcha studentlarni tuzatishda xato:", err);
        res.status(500).json({ error: err.message });
    }
};

// Student course statusini tuzatish (nomuvofiqliklarni hal qilish)
exports.fixStudentCourseStatus = async (req, res) => {
    const { student_id } = req.body;

    if (!student_id) {
        return res.status(400).json({ 
            message: "student_id majburiy" 
        });
    }

    try {
        // Student ma'lumotlarini va guruh holatini olish
        const studentData = await pool.query(`
            SELECT 
                u.id, u.name, u.surname, 
                u.status as student_status,
                u.course_status, u.course_start_date, u.course_end_date,
                u.group_id, u.group_name,
                g.status as group_status, g.class_status, g.class_start_date
            FROM users u
            LEFT JOIN groups g ON u.group_id = g.id
            WHERE u.id = $1 AND u.role = 'student'
        `, [student_id]);

        if (studentData.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        const student = studentData.rows[0];
        let fixes = [];
        let updateFields = [];
        let updateValues = [];
        let paramIndex = 1;

        // 1. Agar student active guruhda va course_status hali "not_started" bo'lsa
        if (student.group_id && student.group_status === 'active' && 
            student.course_status === 'not_started') {
            
            updateFields.push(`course_status = $${paramIndex++}`);
            updateValues.push('in_progress');
            
            if (!student.course_start_date) {
                updateFields.push(`course_start_date = $${paramIndex++}`);
                updateValues.push(new Date());
            }
            
            fixes.push("Course status 'in_progress' ga o'zgartirildi");
            fixes.push("Course start date belgilandi");
        }

        // 2. Agar student guruhda emas, lekin course statusi aktiv bo'lsa
        if (!student.group_id && student.course_status === 'in_progress') {
            updateFields.push(`course_status = $${paramIndex++}`);
            updateValues.push('not_started');
            
            updateFields.push(`course_start_date = $${paramIndex++}`);
            updateValues.push(null);
            
            fixes.push("Course status 'not_started' ga qaytarildi");
            fixes.push("Course start date tozalandi");
        }

        // 3. Agar tuzatish kerak bo'lsa
        if (updateFields.length > 0) {
            updateValues.push(student_id);
            
            const updateQuery = `
                UPDATE users 
                SET ${updateFields.join(', ')} 
                WHERE id = $${paramIndex} 
                RETURNING id, name, surname, course_status, course_start_date, group_id, group_name
            `;
            
            const result = await pool.query(updateQuery, updateValues);
            
            return res.json({
                success: true,
                message: "Student ma'lumotlari tuzatildi",
                fixes: fixes,
                before: {
                    course_status: student.course_status,
                    course_start_date: student.course_start_date,
                    group_id: student.group_id
                },
                after: result.rows[0]
            });
        }

        res.json({
            success: true,
            message: "Hech qanday tuzatish talab qilinmadi",
            student: student
        });

    } catch (err) {
        console.error("Student course statusini tuzatishda xato:", err);
        res.status(500).json({ error: err.message });
    }
};

// Student uchun guruh ma'lumotlarini olish (class start date bilan)
exports.getStudentGroupInfo = async (req, res) => {
    const { studentId } = req.params;
    
    try {
        const studentGroup = await pool.query(`
            SELECT 
                u.id as student_id,
                u.name || ' ' || u.surname as student_name,
                u.status as student_status,
                u.group_id,
                u.group_name,
                g.status as group_status,
                g.class_status,
                g.class_start_date,
                g.start_date as planned_start_date,
                g.teacher_id,
                t.name || ' ' || t.surname as teacher_name
            FROM users u
            LEFT JOIN groups g ON u.group_id = g.id
            LEFT JOIN users t ON g.teacher_id = t.id
            WHERE u.id = $1 AND u.role = 'student'
        `, [studentId]);

        if (studentGroup.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi yoki guruhga a'zo emas" });
        }

        const studentData = studentGroup.rows[0];
        let classStatus = "Guruhga tegishli emas";
        
        if (studentData.group_id) {
            if (studentData.class_status === 'not_started') {
                classStatus = "Darslar boshlanishi kutilmoqda";
            } else if (studentData.class_status === 'started') {
                const startDate = new Date(studentData.class_start_date).toLocaleDateString('uz-UZ');
                classStatus = `Darslar ${startDate} da boshlandi`;
            } else if (studentData.class_status === 'finished') {
                classStatus = "Darslar yakunlandi";
            }
        }

        res.json({
            success: true,
            student: {
                id: studentData.student_id,
                name: studentData.student_name,
                status: studentData.student_status,
                group: {
                    id: studentData.group_id,
                    name: studentData.group_name,
                    status: studentData.group_status,
                    classStatus: studentData.class_status,
                    classStartDate: studentData.class_start_date ? studentData.class_start_date.toISOString().split('T')[0] : null,
                    plannedStartDate: studentData.planned_start_date ? studentData.planned_start_date.toISOString().split('T')[0] : null,
                    teacher: {
                        id: studentData.teacher_id,
                        name: studentData.teacher_name
                    }
                },
                displayStatus: classStatus
            }
        });
    } catch (err) {
        console.error("Student guruh ma'lumotlarini olishda xato:", err);
        res.status(500).json({ error: err.message });
    }
};

// 17. Yangi ochilgan guruhlar ro'yxati (draft status da bo'lgan guruhlar)
exports.getNewlyCreatedGroups = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                g.id, g.name, g.unique_code, g.status, 
                g.created_at, g.price, g.start_date,
                s.name as subject_name,
                COALESCE(t.name || ' ' || t.surname, 'Teacher biriktirilmagan') as teacher_name,
                COUNT(sg.student_id) as student_count
            FROM groups g
            LEFT JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN users t ON g.teacher_id = t.id AND t.role = 'teacher'
            LEFT JOIN student_groups sg ON g.id = sg.group_id AND sg.status = 'active'
            WHERE g.status = 'draft'
            GROUP BY g.id, g.name, g.unique_code, g.status, g.created_at, 
                     g.price, g.start_date, s.name, t.name, t.surname
            ORDER BY g.created_at DESC
        `);

        res.json({
            success: true,
            message: "Yangi ochilgan guruhlar ro'yxati",
            groups: result.rows.map(group => ({
                id: group.id,
                name: group.name,
                unique_code: group.unique_code,
                status: group.status,
                subject_name: group.subject_name,
                teacher_name: group.teacher_name,
                student_count: parseInt(group.student_count),
                price: parseFloat(group.price || 0),
                start_date: group.start_date,
                created_at: group.created_at,
                can_start_class: parseInt(group.student_count) > 0 // Dars boshlash mumkinligi
            }))
        });
    } catch (err) {
        console.error("Yangi ochilgan guruhlarni olishda xato:", err);
        res.status(500).json({ error: err.message });
    }
};

// 18. Darsni boshlash (draft -> active + avtomatik start_date)
exports.startGroupClass = async (req, res) => {
    const { id } = req.params;

    try {
        // Guruh mavjudligini va statusini tekshirish
        const groupCheck = await pool.query(`
            SELECT g.*, COUNT(sg.student_id) as student_count
            FROM groups g
            LEFT JOIN student_groups sg ON g.id = sg.group_id AND sg.status = 'active'
            WHERE g.id = $1
            GROUP BY g.id
        `, [id]);

        if (groupCheck.rows.length === 0) {
            return res.status(404).json({ message: "Guruh topilmadi" });
        }

        const group = groupCheck.rows[0];

        // Faqat draft holatidagi guruhni boshlash mumkin
        if (group.status !== 'draft') {
            return res.status(400).json({ 
                message: `Guruh allaqachon ${group.status} holatida. Faqat 'draft' holatidagi guruhlarni boshlash mumkin.` 
            });
        }

        if (parseInt(group.student_count) === 0) {
            return res.status(400).json({ 
                message: "Guruhda studentlar yo'q. Avval studentlarni qo'shing!" 
            });
        }

        // Guruhni active holatiga o'tkazish va dars boshlash sanasini belgilash
        const now = new Date();
        const result = await pool.query(`
            UPDATE groups SET 
                status = 'active',
                class_start_date = $1,
                class_status = 'started',
                start_date = COALESCE(start_date, $1)
            WHERE id = $2
            RETURNING *
        `, [now, id]);

        // Barcha studentlarning course statusini yangilash
        await pool.query(`
            UPDATE users 
            SET course_status = 'in_progress', 
                course_start_date = $1 
            WHERE id IN (
                SELECT sg.student_id 
                FROM student_groups sg 
                WHERE sg.group_id = $2 AND sg.status = 'active'
            ) AND course_status = 'not_started'
        `, [now, id]);

        res.json({
            success: true,
            message: "Darslar muvaffaqiyatli boshlandi! Barcha studentlarning kursi faollashdi.",
            group: {
                id: result.rows[0].id,
                name: result.rows[0].name,
                status: result.rows[0].status,
                class_start_date: result.rows[0].class_start_date,
                class_status: result.rows[0].class_status,
                student_count: parseInt(group.student_count)
            }
        });

    } catch (err) {
        console.error("Darsni boshlashda xato:", err);
        res.status(500).json({ 
            error: "Darsni boshlashda xatolik yuz berdi",
            details: err.message 
        });
    }
};

// 18. Teacher guruhlarining vaqtlarini almashtirish
exports.swapGroupSchedules = async (req, res) => {
    const { group1_id, group2_id } = req.body;
    
    if (!group1_id || !group2_id) {
        return res.status(400).json({ 
            message: "group1_id va group2_id majburiy" 
        });
    }
    
    if (group1_id === group2_id) {
        return res.status(400).json({ 
            message: "Bir xil guruhning vaqtini almashtirib bo'lmaydi" 
        });
    }
    
    try {
        // Guruhlarni olish va tekshirish
        const group1Result = await pool.query(
            `SELECT g.*, CONCAT(u.name, ' ', u.surname) as teacher_name 
             FROM groups g 
             LEFT JOIN users u ON g.teacher_id = u.id 
             WHERE g.id = $1`,
            [group1_id]
        );
        
        const group2Result = await pool.query(
            `SELECT g.*, CONCAT(u.name, ' ', u.surname) as teacher_name 
             FROM groups g 
             LEFT JOIN users u ON g.teacher_id = u.id 
             WHERE g.id = $2`,
            [group2_id]
        );
        
        if (group1Result.rows.length === 0) {
            return res.status(404).json({ message: `Guruh #${group1_id} topilmadi` });
        }
        
        if (group2Result.rows.length === 0) {
            return res.status(404).json({ message: `Guruh #${group2_id} topilmadi` });
        }
        
        const group1 = group1Result.rows[0];
        const group2 = group2Result.rows[0];
        
        // Bir xil teacher ekanligini tekshirish
        if (group1.teacher_id !== group2.teacher_id) {
            return res.status(400).json({
                message: "Faqat bir xil teacherning guruhlarining vaqtini almashtirishingiz mumkin",
                group1_teacher: group1.teacher_name,
                group2_teacher: group2.teacher_name
            });
        }
        
        // Schedule mavjudligini tekshirish
        if (!group1.schedule || !group2.schedule) {
            return res.status(400).json({
                message: "Ikkala guruhda ham jadval bo'lishi shart",
                group1_schedule: group1.schedule,
                group2_schedule: group2.schedule
            });
        }
        
        // Transaction boshlaymiz
        await pool.query('BEGIN');
        
        try {
            // Vaqtlarni almashtirish
            await pool.query(
                'UPDATE groups SET schedule = $1 WHERE id = $2',
                [group2.schedule, group1_id]
            );
            
            await pool.query(
                'UPDATE groups SET schedule = $1 WHERE id = $2', 
                [group1.schedule, group2_id]
            );
            
            await pool.query('COMMIT');
            
            res.json({
                success: true,
                message: "Guruhlar jadvallari muvaffaqiyatli almashtirildi",
                changes: {
                    group1: {
                        id: group1_id,
                        name: group1.name,
                        old_schedule: group1.schedule,
                        new_schedule: group2.schedule
                    },
                    group2: {
                        id: group2_id,
                        name: group2.name,
                        old_schedule: group2.schedule,
                        new_schedule: group1.schedule
                    }
                }
            });
            
        } catch (updateErr) {
            await pool.query('ROLLBACK');
            throw updateErr;
        }
        
    } catch (err) {
        console.error("Jadval almashtirishda xato:", err);
        res.status(500).json({ 
            error: "Jadval almashtirishda xatolik",
            details: err.message 
        });
    }
};

// 19. Teacher guruhlarining barcha jadvallarini ko'rish
exports.getTeacherScheduleOverview = async (req, res) => {
    const { teacher_id } = req.params;
    
    if (!teacher_id || isNaN(parseInt(teacher_id))) {
        return res.status(400).json({ message: "Teacher ID raqam bo'lishi shart" });
    }
    
    try {
        const result = await pool.query(`
            SELECT 
                g.id,
                g.name,
                g.schedule,
                g.status,
                s.name as subject_name,
                CONCAT(u.name, ' ', u.surname) as teacher_name,
                COUNT(sg.student_id) as student_count
            FROM groups g
            LEFT JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN users u ON g.teacher_id = u.id
            LEFT JOIN student_groups sg ON g.id = sg.group_id AND sg.status = 'active'
            WHERE g.teacher_id = $1 
            AND g.schedule IS NOT NULL
            AND (g.status = 'active' OR g.status = 'draft')
            GROUP BY g.id, g.name, g.schedule, g.status, s.name, u.name, u.surname
            ORDER BY g.schedule->>'time', g.name
        `, [teacher_id]);
        
        // Kunlar bo'yicha guruhlash
        const scheduleByDay = {};
        const allGroups = [];
        
        result.rows.forEach(group => {
            if (group.schedule && group.schedule.days) {
                group.schedule.days.forEach(day => {
                    if (!scheduleByDay[day]) {
                        scheduleByDay[day] = [];
                    }
                    scheduleByDay[day].push({
                        ...group,
                        day: day
                    });
                });
            }
            allGroups.push(group);
        });
        
        res.json({
            success: true,
            teacher_id: parseInt(teacher_id),
            teacher_name: result.rows[0]?.teacher_name || null,
            total_groups: allGroups.length,
            groups: allGroups,
            schedule_by_day: scheduleByDay
        });
        
    } catch (err) {
        console.error("Teacher jadvalini olishda xato:", err);
        res.status(500).json({ 
            error: "Teacher jadvalini olishda xatolik",
            details: err.message 
        });
    }
};

// ============================================================================
// TEACHER O'Z GURUHLARINI KO'RISH API'LARI
// ============================================================================

/**
 * Teacher o'zi o'qitayotgan guruhlar ro'yxatini olish (dars jadvali bilan)
 */
exports.getTeacherMyGroups = async (req, res) => {
    try {
        const teacherId = req.user.id;

        console.log(`👨‍🏫 Teacher ${teacherId} o'z guruhlarini so'ramoqda`);

        const myGroups = await pool.query(`
            SELECT 
                g.id as group_id,
                g.name as group_name,
                g.unique_code,
                g.price,
                g.schedule,
                g.status as group_status,
                g.class_status,
                TO_CHAR(g.start_date, 'DD.MM.YYYY') as start_date,
                TO_CHAR(g.class_start_date, 'DD.MM.YYYY') as class_start_date,
                
                s.id as subject_id,
                s.name as subject_name,
                
                r.id as room_id,
                r.room_number,
                r.capacity as room_capacity,
                
                -- Aktiv talabalar soni
                (
                    SELECT COUNT(*) 
                    FROM student_groups sg 
                    WHERE sg.group_id = g.id AND sg.status = 'active'
                ) as active_students_count,
                
                -- Jami talabalar soni (barcha statuslar)
                (
                    SELECT COUNT(*) 
                    FROM student_groups sg 
                    WHERE sg.group_id = g.id
                ) as total_students_count
                
            FROM groups g
            JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN rooms r ON g.room_id = r.id
            
            WHERE g.teacher_id = $1
            ORDER BY 
                CASE g.status 
                    WHEN 'active' THEN 1
                    WHEN 'draft' THEN 2  
                    WHEN 'blocked' THEN 3
                    ELSE 4
                END,
                CASE g.class_status 
                    WHEN 'started' THEN 1
                    WHEN 'not_started' THEN 2  
                    WHEN 'finished' THEN 3
                    ELSE 4
                END,
                g.name
        `, [teacherId]);

        // Schedule'ni formatlash
        const formatSchedule = (schedule) => {
            if (!schedule) return null;
            
            const dayNames = {
                'monday': 'Dushanba',
                'tuesday': 'Seshanba', 
                'wednesday': 'Chorshanba',
                'thursday': 'Payshanba',
                'friday': 'Juma',
                'saturday': 'Shanba',
                'sunday': 'Yakshanba'
            };
            
            return {
                days: schedule.days || [],
                days_uz: (schedule.days || []).map(d => dayNames[d] || d),
                time: schedule.time || null
            };
        };

        const groupsData = myGroups.rows.map(group => ({
            group_info: {
                id: group.group_id,
                name: group.group_name,
                unique_code: group.unique_code,
                price: parseFloat(group.price) || 0,
                status: group.group_status,
                class_status: group.class_status,
                start_date: group.start_date,
                class_start_date: group.class_start_date
            },
            schedule: formatSchedule(group.schedule),
            subject_info: {
                id: group.subject_id,
                name: group.subject_name
            },
            room_info: {
                id: group.room_id,
                room_number: group.room_number || 'Tayinlanmagan',
                capacity: group.room_capacity
            },
            students_count: {
                active: parseInt(group.active_students_count),
                total: parseInt(group.total_students_count)
            }
        }));

        // Kunlar bo'yicha guruhlash
        const scheduleByDay = {};
        const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        
        myGroups.rows.forEach(group => {
            if (group.schedule && group.schedule.days) {
                group.schedule.days.forEach(day => {
                    if (!scheduleByDay[day]) {
                        scheduleByDay[day] = [];
                    }
                    scheduleByDay[day].push({
                        group_id: group.group_id,
                        group_name: group.group_name,
                        time: group.schedule.time,
                        room_number: group.room_number,
                        subject_name: group.subject_name,
                        active_students: parseInt(group.active_students_count)
                    });
                });
            }
        });

        // Kunlarni tartiblash
        const orderedSchedule = {};
        dayOrder.forEach(day => {
            if (scheduleByDay[day]) {
                orderedSchedule[day] = scheduleByDay[day].sort((a, b) => {
                    if (!a.time || !b.time) return 0;
                    return a.time.localeCompare(b.time);
                });
            }
        });

        console.log(`✅ Teacher ${teacherId} ning ${groupsData.length}ta guruhi topildi`);

        res.json({
            success: true,
            message: 'Guruhlar ro\'yxati muvaffaqiyatli olindi',
            data: {
                teacher_id: teacherId,
                total_groups: groupsData.length,
                groups: groupsData,
                schedule_by_day: orderedSchedule
            }
        });

    } catch (error) {
        console.error('❌ Teacher guruhlarini olishda xato:', error);
        res.status(500).json({
            success: false,
            message: 'Guruhlar ro\'yxatini olishda xatolik yuz berdi',
            error: error.message
        });
    }
};

/**
 * Teacher ma'lum bir guruh haqida batafsil ma'lumot olish (talabalar ro'yxati bilan)
 */
exports.getTeacherGroupDetails = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const groupId = parseInt(req.params.group_id);

        if (isNaN(groupId)) {
            return res.status(400).json({
                success: false,
                message: "Guruh ID raqam bo'lishi kerak"
            });
        }

        console.log(`👨‍🏫 Teacher ${teacherId} ${groupId}-guruh ma'lumotlarini so'ramoqda`);

        // Guruhni tekshirish va teacher'ga tegishliligini tasdiqlash
        const groupResult = await pool.query(`
            SELECT 
                g.id as group_id,
                g.name as group_name,
                g.unique_code,
                g.price,
                g.schedule,
                g.status as group_status,
                g.class_status,
                TO_CHAR(g.start_date, 'DD.MM.YYYY') as start_date,
                TO_CHAR(g.class_start_date, 'DD.MM.YYYY') as class_start_date,
                TO_CHAR(g.created_at, 'DD.MM.YYYY') as created_at,
                
                s.id as subject_id,
                s.name as subject_name,
                
                r.id as room_id,
                r.room_number,
                r.capacity as room_capacity,
                r.has_projector
                
            FROM groups g
            JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN rooms r ON g.room_id = r.id
            
            WHERE g.id = $1 AND g.teacher_id = $2
        `, [groupId, teacherId]);

        if (groupResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Guruh topilmadi yoki sizga tegishli emas'
            });
        }

        const group = groupResult.rows[0];

        // Talabalar ro'yxatini olish
        const studentsResult = await pool.query(`
            SELECT 
                u.id as student_id,
                u.name,
                u.surname,
                u.phone,
                u.phone2,
                u.father_name,
                u.father_phone,
                u.age,
                u.address,
                
                sg.status as group_status,
                CASE 
                    WHEN sg.status = 'active' THEN 'Faol'
                    WHEN sg.status = 'stopped' THEN 'Nofaol'
                    WHEN sg.status = 'finished' THEN 'Bitirgan'
                    ELSE 'Belgilanmagan'
                END as group_status_description,
                TO_CHAR(sg.joined_at, 'DD.MM.YYYY') as join_date,
                TO_CHAR(sg.left_at, 'DD.MM.YYYY') as leave_date,
                sg.joined_at
                
            FROM student_groups sg
            JOIN users u ON sg.student_id = u.id
            
            WHERE sg.group_id = $1
            ORDER BY 
                CASE sg.status 
                    WHEN 'active' THEN 1
                    WHEN 'stopped' THEN 2  
                    WHEN 'finished' THEN 3
                    ELSE 4
                END,
                u.name, u.surname
        `, [groupId]);

        // Schedule formatlash
        const dayNames = {
            'monday': 'Dushanba',
            'tuesday': 'Seshanba', 
            'wednesday': 'Chorshanba',
            'thursday': 'Payshanba',
            'friday': 'Juma',
            'saturday': 'Shanba',
            'sunday': 'Yakshanba'
        };

        const formatSchedule = (schedule) => {
            if (!schedule) return null;
            return {
                days: schedule.days || [],
                days_uz: (schedule.days || []).map(d => dayNames[d] || d),
                time: schedule.time || null
            };
        };

        // Talabalar statistikasi
        const studentsStats = {
            total: studentsResult.rows.length,
            active: studentsResult.rows.filter(s => s.group_status === 'active').length,
            stopped: studentsResult.rows.filter(s => s.group_status === 'stopped').length,
            finished: studentsResult.rows.filter(s => s.group_status === 'finished').length
        };

        // Talabalar ro'yxatini formatlash
        const students = studentsResult.rows.map(student => ({
            id: student.student_id,
            name: student.name,
            surname: student.surname,
            full_name: `${student.name} ${student.surname}`,
            phone: student.phone,
            phone2: student.phone2 || null,
            father_name: student.father_name || null,
            father_phone: student.father_phone || null,
            age: student.age,
            address: student.address || null,
            group_status: student.group_status,
            group_status_description: student.group_status_description,
            join_date: student.join_date,
            leave_date: student.leave_date
        }));

        console.log(`✅ Guruh ${groupId} ma'lumotlari olindi: ${students.length}ta talaba`);

        res.json({
            success: true,
            message: 'Guruh ma\'lumotlari muvaffaqiyatli olindi',
            data: {
                group_info: {
                    id: group.group_id,
                    name: group.group_name,
                    unique_code: group.unique_code,
                    price: parseFloat(group.price) || 0,
                    status: group.group_status,
                    class_status: group.class_status,
                    start_date: group.start_date,
                    class_start_date: group.class_start_date,
                    created_at: group.created_at
                },
                schedule: formatSchedule(group.schedule),
                subject_info: {
                    id: group.subject_id,
                    name: group.subject_name
                },
                room_info: {
                    id: group.room_id,
                    room_number: group.room_number || 'Tayinlanmagan',
                    capacity: group.room_capacity,
                    has_projector: group.has_projector
                },
                students_stats: studentsStats,
                students: students
            }
        });

    } catch (error) {
        console.error('❌ Guruh ma\'lumotlarini olishda xato:', error);
        res.status(500).json({
            success: false,
            message: 'Guruh ma\'lumotlarini olishda xatolik yuz berdi',
            error: error.message
        });
    }
};

// ============================================================================
// TEACHER API'LARI
// ============================================================================

/**
 * Teacher o'zining guruhlar ro'yxatini olish (dars jadvali bilan)
 * GET /api/groups/teacher/my-groups
 */
exports.getTeacherMyGroups = async (req, res) => {
    try {
        const teacherId = req.user.id;

        console.log(`👨‍🏫 Teacher ${teacherId} o'z guruhlarini so'ramoqda`);

        const myGroups = await pool.query(`
            SELECT 
                g.id as group_id,
                g.name as group_name,
                g.unique_code,
                g.price,
                g.schedule,
                g.status as group_status,
                g.class_status,
                TO_CHAR(g.start_date, 'DD.MM.YYYY') as start_date,
                TO_CHAR(g.class_start_date, 'DD.MM.YYYY') as class_start_date,
                
                s.id as subject_id,
                s.name as subject_name,
                
                r.id as room_id,
                r.room_number,
                
                -- Guruh a'zolari statistikasi
                (
                    SELECT COUNT(*) 
                    FROM student_groups sg2 
                    WHERE sg2.group_id = g.id AND sg2.status = 'active'
                ) as active_students,
                (
                    SELECT COUNT(*) 
                    FROM student_groups sg2 
                    WHERE sg2.group_id = g.id AND sg2.status = 'stopped'
                ) as stopped_students,
                (
                    SELECT COUNT(*) 
                    FROM student_groups sg2 
                    WHERE sg2.group_id = g.id
                ) as total_students
                
            FROM groups g
            JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN rooms r ON g.room_id = r.id
            
            WHERE g.teacher_id = $1
            ORDER BY 
                CASE g.class_status 
                    WHEN 'started' THEN 1
                    WHEN 'not_started' THEN 2  
                    WHEN 'finished' THEN 3
                    ELSE 4
                END,
                g.name
        `, [teacherId]);

        const groupsData = myGroups.rows.map(group => ({
            group_info: {
                id: group.group_id,
                name: group.group_name,
                unique_code: group.unique_code,
                price: parseFloat(group.price) || 0,
                status: group.group_status,
                class_status: group.class_status,
                start_date: group.start_date,
                class_start_date: group.class_start_date,
                schedule: group.schedule || null
            },
            subject_info: {
                id: group.subject_id,
                name: group.subject_name
            },
            room_info: {
                id: group.room_id,
                room_number: group.room_number || 'Tayinlanmagan'
            },
            students_stats: {
                active: parseInt(group.active_students) || 0,
                stopped: parseInt(group.stopped_students) || 0,
                total: parseInt(group.total_students) || 0
            }
        }));

        console.log(`✅ Teacher ${teacherId} ning ${groupsData.length}ta guruhi topildi`);

        res.json({
            success: true,
            message: 'Guruhlar ro\'yxati muvaffaqiyatli olindi',
            data: {
                teacher_id: teacherId,
                total_groups: groupsData.length,
                groups: groupsData
            }
        });

    } catch (error) {
        console.error('❌ Teacher guruhlarini olishda xato:', error);
        res.status(500).json({
            success: false,
            message: 'Guruhlarni olishda xatolik yuz berdi',
            error: error.message
        });
    }
};

/**
 * Teacher o'zining bitta guruhini batafsil olish (talabalar bilan)
 * GET /api/groups/teacher/my-groups/:group_id
 */
exports.getTeacherGroupDetails = async (req, res) => {
    try {
        const teacherId = req.user.id;
        const groupId = parseInt(req.params.group_id);

        console.log(`👨‍🏫 Teacher ${teacherId} guruh ${groupId} ma'lumotlarini so'ramoqda`);

        // Avval guruh teacher'ga tegishli ekanligini tekshirish
        const groupResult = await pool.query(`
            SELECT 
                g.id as group_id,
                g.name as group_name,
                g.unique_code,
                g.price,
                g.schedule,
                g.status as group_status,
                g.class_status,
                TO_CHAR(g.start_date, 'DD.MM.YYYY') as start_date,
                TO_CHAR(g.class_start_date, 'DD.MM.YYYY') as class_start_date,
                TO_CHAR(g.created_at, 'DD.MM.YYYY HH24:MI') as created_at,
                
                s.id as subject_id,
                s.name as subject_name,
                
                r.id as room_id,
                r.room_number,
                r.capacity as room_capacity,
                r.has_projector
                
            FROM groups g
            JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN rooms r ON g.room_id = r.id
            
            WHERE g.id = $1 AND g.teacher_id = $2
        `, [groupId, teacherId]);

        if (groupResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Guruh topilmadi yoki sizga tegishli emas'
            });
        }

        const group = groupResult.rows[0];

        // Guruh talabalari
        const studentsResult = await pool.query(`
            SELECT 
                u.id as student_id,
                u.name,
                u.surname,
                u.phone,
                u.phone2,
                u.father_name,
                u.father_phone,
                sg.status as group_status,
                TO_CHAR(sg.joined_at, 'DD.MM.YYYY') as join_date,
                TO_CHAR(sg.left_at, 'DD.MM.YYYY') as leave_date,
                CASE sg.status 
                    WHEN 'active' THEN 'Faol'
                    WHEN 'stopped' THEN 'To''xtatilgan'
                    WHEN 'finished' THEN 'Tugatgan'
                    ELSE sg.status
                END as status_description
                
            FROM student_groups sg
            JOIN users u ON sg.student_id = u.id
            WHERE sg.group_id = $1
            ORDER BY 
                CASE sg.status 
                    WHEN 'active' THEN 1
                    WHEN 'stopped' THEN 2  
                    WHEN 'finished' THEN 3
                    ELSE 4
                END,
                u.name, u.surname
        `, [groupId]);

        // Statistika
        const stats = {
            active: studentsResult.rows.filter(s => s.group_status === 'active').length,
            stopped: studentsResult.rows.filter(s => s.group_status === 'stopped').length,
            finished: studentsResult.rows.filter(s => s.group_status === 'finished').length,
            total: studentsResult.rows.length
        };

        const students = studentsResult.rows.map(student => ({
            id: student.student_id,
            name: student.name,
            surname: student.surname,
            full_name: `${student.name} ${student.surname}`,
            phone: student.phone,
            phone2: student.phone2 || null,
            father_name: student.father_name || null,
            father_phone: student.father_phone || null,
            group_status: student.group_status,
            status_description: student.status_description,
            join_date: student.join_date,
            leave_date: student.leave_date
        }));

        console.log(`✅ Teacher guruh ${groupId} ma'lumotlari olindi: ${students.length}ta talaba`);

        res.json({
            success: true,
            message: 'Guruh ma\'lumotlari muvaffaqiyatli olindi',
            data: {
                group_info: {
                    id: group.group_id,
                    name: group.group_name,
                    unique_code: group.unique_code,
                    price: parseFloat(group.price) || 0,
                    status: group.group_status,
                    class_status: group.class_status,
                    start_date: group.start_date,
                    class_start_date: group.class_start_date,
                    created_at: group.created_at,
                    schedule: group.schedule || null
                },
                subject_info: {
                    id: group.subject_id,
                    name: group.subject_name
                },
                room_info: {
                    id: group.room_id,
                    room_number: group.room_number || 'Tayinlanmagan',
                    capacity: group.room_capacity || null,
                    has_projector: group.has_projector || false
                },
                students_stats: stats,
                students: students
            }
        });

    } catch (error) {
        console.error('❌ Teacher guruh ma\'lumotlarini olishda xato:', error);
        res.status(500).json({
            success: false,
            message: 'Guruh ma\'lumotlarini olishda xatolik yuz berdi',
            error: error.message
        });
    }
};
