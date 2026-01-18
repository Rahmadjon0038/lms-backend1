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
    const { name, teacher_id, start_date, schedule, subject_id, price, status } = req.body;
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

        const result = await pool.query(
            `INSERT INTO groups (name, teacher_id, unique_code, start_date, schedule, subject_id, price, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [
                name, 
                teacher_id, 
                unique_code, 
                start_date ? start_date : null,
                schedule ? JSON.stringify(schedule) : null,
                subject_id,
                price,
                status || 'draft' // Default status
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
    const { name, teacher_id, is_active, schedule, start_date, price, subject_id } = req.body;
    
    try {
        // Bo'sh string va 0 qiymatlarni null ga o'zgartirish
        const processedTeacherId = (teacher_id === 0 || teacher_id === "" || teacher_id === null) ? null : teacher_id;
        const processedSubjectId = (subject_id === 0 || subject_id === "" || subject_id === null) ? null : subject_id;
        const processedStartDate = (start_date === "" || start_date === null) ? null : start_date;
        
        // Teacher va subject validation - agar ikkalasi ham berilgan bo'lsa
        if (processedTeacherId && processedSubjectId) {
            const teacherSubjects = await getTeacherSubjects(processedTeacherId);
            const canTeachSubject = teacherSubjects.some(sub => sub.id === processedSubjectId);
            
            if (!canTeachSubject) {
                return res.status(400).json({ 
                    message: "Bu teacher tanlangan fanni o'qitmaydi",
                    teacher_id: processedTeacherId,
                    subject_id: processedSubjectId,
                    teacher_subjects: teacherSubjects.map(s => ({ id: s.id, name: s.name }))
                });
            }
        }
        
        // Teacher schedule conflict tekshirish (faqat teacher_id yoki schedule o'zgarsa)
        if (processedTeacherId && schedule) {
            const conflict = await checkTeacherScheduleConflict(processedTeacherId, schedule, id);
            if (conflict.hasConflict) {
                return res.status(400).json({
                    message: "Bu teacher tanlangan kun va vaqtda boshqa guruhda dars bor!",
                    teacher_id: processedTeacherId,
                    conflict_group: conflict.conflictGroup,
                    new_schedule: schedule,
                    suggestion: "Boshqa vaqt yoki kun tanlang, yoki mavjud guruhning vaqtini o'zgartiring"
                });
            }
        }

        // Schedule conflict tekshiruvi - faqat teacher va schedule o'zgartirish paytida
        if (processedTeacherId && schedule) {
            const conflictCheck = await checkScheduleConflict(processedTeacherId, schedule, id);
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
        
        const result = await pool.query(
            `UPDATE groups SET 
                name = COALESCE($1, name), 
                teacher_id = $2, 
                is_active = COALESCE($3, is_active), 
                schedule = COALESCE($4, schedule),
                start_date = COALESCE($5, start_date),
                price = COALESCE($6, price),
                subject_id = $7
             WHERE id = $8 RETURNING *`,
            [name, processedTeacherId, is_active, schedule ? JSON.stringify(schedule) : null, processedStartDate, price, processedSubjectId, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: "Guruh topilmadi" });
        res.json({ success: true, group: result.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
        let updateFields = {};
        let updateValues = [];
        let paramCount = 1;
        let updateQuery = 'UPDATE groups SET ';
        
        // Status active bo'lsa, class_start_date va class_status ni ham yangilash
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

        // Student_groups jadvaliga qo'shish
        const result = await pool.query(
            "INSERT INTO student_groups (student_id, group_id) VALUES ($1, $2) RETURNING *",
            [student_id, group_id]
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

        // Student_groups jadvaliga qo'shish
        const result = await pool.query(
            "INSERT INTO student_groups (student_id, group_id) VALUES ($1, $2) RETURNING *",
            [req.user.id, groupData.id]
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
                        -- Guruhda nechta talaba borligini hisoblash
                        COALESCE(
                            (SELECT COUNT(*)::integer
                            FROM student_groups sg
                            WHERE sg.group_id = g.id AND sg.status = 'active'),
                            0
                        ) as student_count
                 FROM groups g 
                 LEFT JOIN users u ON g.teacher_id = u.id 
                 LEFT JOIN subjects s ON g.subject_id = s.id
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
                   s.name as subject_name
            FROM groups g 
            LEFT JOIN users u ON g.teacher_id = u.id 
            LEFT JOIN subjects s ON g.subject_id = s.id
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
                u.course_status,
                u.course_start_date,
                u.course_end_date,
                u.created_at as registration_date,
                u.role,
                u.group_id,
                u.teacher_id,
                u.teacher_name,
                u.group_name,
                sg.status as group_status, 
                sg.joined_at 
            FROM users u 
            JOIN student_groups sg ON u.id = sg.student_id 
            WHERE sg.group_id = $1 
            ORDER BY u.name, u.surname`, [id]);

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
            'SELECT id, name, surname, group_id, group_name FROM users WHERE id = $1 AND role = $2',
            [student_id, 'student']
        );

        if (studentCheck.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        const student = studentCheck.rows[0];
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

        // Yangi guruhga qo'shish
        await pool.query(
            `INSERT INTO student_groups (student_id, group_id) 
             VALUES ($1, $2)
             ON CONFLICT (student_id, group_id) DO NOTHING`,
            [student_id, new_group_id]
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