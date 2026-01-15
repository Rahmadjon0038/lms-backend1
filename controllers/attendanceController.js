const pool = require('../config/db');

// 1. O'qituvchining guruhlarini ko'rish (faqat o'z guruhlari)
exports.getTeacherGroups = async (req, res) => {
    const teacher_id = req.user.id;
    
    try {
        const groups = await pool.query(
            `SELECT 
                g.id as group_id,
                g.name as group_name,
                s.name as subject_name,
                COUNT(u.id) as students_count,
                g.created_at
             FROM groups g
             LEFT JOIN subjects s ON g.subject_id = s.id
             LEFT JOIN users u ON u.group_id = g.id AND u.role = 'student' AND u.status = 'active'
             WHERE g.teacher_id = $1
             GROUP BY g.id, g.name, s.name, g.created_at
             ORDER BY g.name`,
            [teacher_id]
        );

        res.json({
            success: true,
            message: "O'qituvchi guruhlari",
            teacher_id,
            groups: groups.rows
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: "Guruhlarni olishda xatolik",
            error: err.message 
        });
    }
};

// 2. Guruh studentlarining davomat ma'lumotlari
exports.getGroupAttendance = async (req, res) => {
    const { group_id } = req.params;
    const { month_name } = req.query;
    const user_id = req.user.id;
    const user_role = req.user.role;
    
    const currentMonth = month_name || new Date().toISOString().slice(0, 7);

    try {
        // Agar teacher bo'lsa - faqat o'z guruhini ko'rishi mumkin
        if (user_role === 'teacher') {
            const groupCheck = await pool.query(
                'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
                [group_id, user_id]
            );
            
            if (groupCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "Bu guruhga ruxsatingiz yo'q"
                });
            }
        }

        // Guruh ma'lumotlari
        const groupInfo = await pool.query(
            `SELECT 
                g.id, g.name as group_name,
                s.name as subject_name,
                COALESCE(CONCAT(t.name, ' ', t.surname), 'Oqituvchi biriktirilmagan') as teacher_name
             FROM groups g
             LEFT JOIN subjects s ON g.subject_id = s.id
             LEFT JOIN users t ON g.teacher_id = t.id
             WHERE g.id = $1`,
            [group_id]
        );

        if (groupInfo.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Guruh topilmadi"
            });
        }

        // Studentlar va ularning davomat ma'lumotlari
        const studentsAttendance = await pool.query(
            `SELECT 
                u.id as student_id,
                u.name || ' ' || u.surname as student_name,
                u.phone,
                u.phone2,
                u.father_name,
                u.father_phone,
                u.address,
                a.daily_records,
                a.total_classes,
                a.attended_classes,
                a.attendance_percentage,
                a.updated_at as last_update
             FROM users u
             LEFT JOIN attendance a ON u.id = a.student_id AND a.month_name = $1
             WHERE u.group_id = $2 AND u.role = 'student' AND u.status = 'active'
             ORDER BY u.surname, u.name`,
            [currentMonth, group_id]
        );

        // Default davomat yaratish (agar mavjud bo'lmasa)
        for (let student of studentsAttendance.rows) {
            if (!student.daily_records) {
                const daysInMonth = new Date(currentMonth.split('-')[0], currentMonth.split('-')[1], 0).getDate();
                const defaultRecords = Array(daysInMonth).fill(0);
                
                await pool.query(
                    `INSERT INTO attendance (student_id, group_id, teacher_id, month_name, daily_records, total_classes)
                     VALUES ($1, $2, $3, $4, $5, 0)
                     ON CONFLICT (student_id, month_name) DO NOTHING`,
                    [student.student_id, group_id, groupInfo.rows[0].teacher_id, currentMonth, JSON.stringify(defaultRecords)]
                );
                
                // Ma'lumotlarni qayta olish
                student.daily_records = JSON.stringify(defaultRecords);
                student.total_classes = 0;
                student.attended_classes = 0;
                student.attendance_percentage = 0;
            }
        }

        res.json({
            success: true,
            message: "Guruh davomat ma'lumotlari",
            month: currentMonth,
            group: groupInfo.rows[0],
            students: studentsAttendance.rows
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: "Ma'lumotlarni olishda xatolik",
            error: err.message 
        });
    }
};

// 3. Student davomatini yangilash
exports.updateStudentAttendance = async (req, res) => {
    const { student_id } = req.params;
    const { month_name, daily_records, total_classes } = req.body;
    const user_id = req.user.id;
    const user_role = req.user.role;

    if (!student_id || !month_name || !daily_records) {
        return res.status(400).json({
            success: false,
            message: "student_id, month_name va daily_records majburiy"
        });
    }

    try {
        // Student ma'lumotlarini olish
        const student = await pool.query(
            'SELECT id, name, surname, group_id FROM users WHERE id = $1 AND role = $2',
            [student_id, 'student']
        );

        if (student.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Student topilmadi"
            });
        }

        const studentData = student.rows[0];

        // Agar teacher bo'lsa - faqat o'z guruh studentlarini yangilashi mumkin
        if (user_role === 'teacher') {
            const groupCheck = await pool.query(
                'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
                [studentData.group_id, user_id]
            );
            
            if (groupCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "Bu studentni davomatini o'zgartirish huquqingiz yo'q"
                });
            }
        }

        // Davomat ma'lumotlarini yangilash
        const result = await pool.query(
            `INSERT INTO attendance (student_id, group_id, teacher_id, month_name, daily_records, total_classes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (student_id, month_name)
             DO UPDATE SET 
                daily_records = $5,
                total_classes = $6,
                updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [student_id, studentData.group_id, user_role === 'teacher' ? user_id : null, month_name, JSON.stringify(daily_records), total_classes || 0, user_id]
        );

        res.json({
            success: true,
            message: `${studentData.name} ${studentData.surname} davomati yangilandi`,
            attendance: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: "Davomatni yangilashda xatolik",
            error: err.message 
        });
    }
};

// 4. Oylik davomat statistikasi
exports.getAttendanceStats = async (req, res) => {
    const { month_name, group_id } = req.query;
    const currentMonth = month_name || new Date().toISOString().slice(0, 7);

    try {
        let query = `
            SELECT 
                u.id as student_id,
                u.name || ' ' || u.surname as student_name,
                g.name as group_name,
                s.name as subject_name,
                COALESCE(CONCAT(t.name, ' ', t.surname), 'Oqituvchi biriktirilmagan') as teacher_name,
                a.total_classes,
                a.attended_classes,
                a.attendance_percentage,
                (a.total_classes - a.attended_classes) as missed_classes
            FROM users u
            LEFT JOIN groups g ON u.group_id = g.id
            LEFT JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN users t ON g.teacher_id = t.id
            LEFT JOIN attendance a ON u.id = a.student_id AND a.month_name = $1
            WHERE u.role = 'student' AND u.status = 'active'
        `;
        
        const params = [currentMonth];
        
        if (group_id) {
            query += ' AND u.group_id = $2';
            params.push(group_id);
        }
        
        query += ' ORDER BY a.attendance_percentage ASC, g.name, u.surname';
        
        const stats = await pool.query(query, params);

        // Umumiy statistika
        const summary = await pool.query(
            `SELECT 
                COUNT(*) as total_students,
                AVG(attendance_percentage) as average_percentage,
                COUNT(CASE WHEN attendance_percentage >= 80 THEN 1 END) as good_attendance,
                COUNT(CASE WHEN attendance_percentage < 60 THEN 1 END) as poor_attendance
             FROM attendance 
             WHERE month_name = $1 ${group_id ? 'AND group_id = $2' : ''}`,
            group_id ? [currentMonth, group_id] : [currentMonth]
        );

        res.json({
            success: true,
            message: "Davomat statistikasi",
            month: currentMonth,
            summary: summary.rows[0],
            students: stats.rows
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: "Statistikani olishda xatolik",
            error: err.message 
        });
    }
};

// 5. Ko'p dars qoldirayotgan studentlar
exports.getPoorAttendanceStudents = async (req, res) => {
    const { month_name, threshold = 60 } = req.query;
    const currentMonth = month_name || new Date().toISOString().slice(0, 7);

    try {
        const poorStudents = await pool.query(
            `SELECT 
                u.id as student_id,
                u.name || ' ' || u.surname as student_name,
                u.phone,
                u.phone2,
                u.father_name,
                u.father_phone,
                u.address,
                g.name as group_name,
                s.name as subject_name,
                COALESCE(CONCAT(t.name, ' ', t.surname), 'Oqituvchi biriktirilmagan') as teacher_name,
                a.total_classes,
                a.attended_classes,
                a.attendance_percentage,
                (a.total_classes - a.attended_classes) as missed_classes
            FROM users u
            LEFT JOIN groups g ON u.group_id = g.id
            LEFT JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN users t ON g.teacher_id = t.id
            INNER JOIN attendance a ON u.id = a.student_id AND a.month_name = $1
            WHERE u.role = 'student' AND u.status = 'active' 
            AND a.attendance_percentage < $2
            ORDER BY a.attendance_percentage ASC`,
            [currentMonth, threshold]
        );

        res.json({
            success: true,
            message: `${threshold}% dan kam davomat studentlar`,
            month: currentMonth,
            threshold,
            count: poorStudents.rows.length,
            students: poorStudents.rows
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: "Ma'lumotlarni olishda xatolik",
            error: err.message 
        });
    }
};

// 6. Admin uchun barcha guruhlar davomati
exports.getAllGroupsAttendance = async (req, res) => {
    const { month_name } = req.query;
    const currentMonth = month_name || new Date().toISOString().slice(0, 7);

    try {
        const groupsStats = await pool.query(
            `SELECT 
                g.id as group_id,
                g.name as group_name,
                s.name as subject_name,
                COALESCE(CONCAT(t.name, ' ', t.surname), 'Oqituvchi biriktirilmagan') as teacher_name,
                COUNT(u.id) as total_students,
                COUNT(a.id) as students_with_attendance,
                AVG(a.attendance_percentage) as average_percentage,
                COUNT(CASE WHEN a.attendance_percentage >= 80 THEN 1 END) as good_students,
                COUNT(CASE WHEN a.attendance_percentage < 60 THEN 1 END) as poor_students
            FROM groups g
            LEFT JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN users t ON g.teacher_id = t.id
            LEFT JOIN users u ON u.group_id = g.id AND u.role = 'student' AND u.status = 'active'
            LEFT JOIN attendance a ON u.id = a.student_id AND a.month_name = $1
            GROUP BY g.id, g.name, s.name, t.name, t.surname
            ORDER BY g.name`,
            [currentMonth]
        );

        res.json({
            success: true,
            message: "Barcha guruhlar davomati",
            month: currentMonth,
            groups: groupsStats.rows
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: "Ma'lumotlarni olishda xatolik",
            error: err.message 
        });
    }
};

// 7. Admin uchun barcha studentlarni davomat bilan ko'rish (filterlar bilan)
exports.getAllStudentsAttendance = async (req, res) => {
    const { month_name, subject_id, teacher_id, search } = req.query;
    const currentMonth = month_name || new Date().toISOString().slice(0, 7);

    try {
        let query = `
            SELECT 
                u.id as student_id,
                u.name || ' ' || u.surname as student_name,
                u.phone,
                u.phone2,
                u.father_name,
                u.father_phone,
                u.address,
                u.group_id,
                g.name as group_name,
                s.name as subject_name,
                s.id as subject_id,
                COALESCE(CONCAT(t.name, ' ', t.surname), 'Oqituvchi biriktirilmagan') as teacher_name,
                t.id as teacher_id,
                COALESCE(a.daily_records, '[]') as daily_records,
                COALESCE(a.total_classes, 0) as total_classes,
                COALESCE(a.attended_classes, 0) as attended_classes,
                COALESCE(a.attendance_percentage, 0) as attendance_percentage,
                a.updated_at as last_update
            FROM users u
            LEFT JOIN groups g ON u.group_id = g.id
            LEFT JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN users t ON g.teacher_id = t.id
            LEFT JOIN attendance a ON u.id = a.student_id AND a.month_name = $1
            WHERE u.role = 'student' AND u.status = 'active'
        `;
        
        const params = [currentMonth];
        let paramIndex = 2;
        
        // Subject filter
        if (subject_id) {
            query += ` AND g.subject_id = $${paramIndex}`;
            params.push(subject_id);
            paramIndex++;
        }
        
        // Teacher filter
        if (teacher_id) {
            query += ` AND g.teacher_id = $${paramIndex}`;
            params.push(teacher_id);
            paramIndex++;
        }
        
        // Search filter (ismi yoki telefon raqami bo'yicha)
        if (search) {
            query += ` AND (
                u.name ILIKE $${paramIndex} OR 
                u.surname ILIKE $${paramIndex} OR 
                u.phone ILIKE $${paramIndex} OR
                u.phone2 ILIKE $${paramIndex}
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        query += ' ORDER BY g.name, u.surname, u.name';
        
        const studentsAttendance = await pool.query(query, params);

        // Default davomat yaratish (agar mavjud bo'lmasa)
        for (let student of studentsAttendance.rows) {
            if (!student.daily_records || student.daily_records === '[]') {
                const daysInMonth = new Date(currentMonth.split('-')[0], currentMonth.split('-')[1], 0).getDate();
                const defaultRecords = Array(daysInMonth).fill(0);
                
                await pool.query(
                    `INSERT INTO attendance (student_id, group_id, teacher_id, month_name, daily_records, total_classes)
                     VALUES ($1, $2, $3, $4, $5, 0)
                     ON CONFLICT (student_id, month_name) DO NOTHING`,
                    [student.student_id, student.group_id, student.teacher_id, currentMonth, JSON.stringify(defaultRecords)]
                );
                
                // Ma'lumotlarni yangilash
                student.daily_records = JSON.stringify(defaultRecords);
                student.total_classes = 0;
                student.attended_classes = 0;
                student.attendance_percentage = 0;
            }
        }

        // Umumiy statistika
        const summary = await pool.query(
            `SELECT 
                COUNT(*) as total_students,
                COUNT(a.id) as students_with_attendance,
                AVG(a.attendance_percentage) as average_percentage,
                COUNT(CASE WHEN a.attendance_percentage >= 80 THEN 1 END) as good_attendance,
                COUNT(CASE WHEN a.attendance_percentage < 60 THEN 1 END) as poor_attendance
             FROM users u
             LEFT JOIN groups g ON u.group_id = g.id
             LEFT JOIN attendance a ON u.id = a.student_id AND a.month_name = $1
             WHERE u.role = 'student' AND u.status = 'active'
             ${subject_id ? 'AND g.subject_id = $2' : ''}
             ${teacher_id ? `AND g.teacher_id = $${subject_id ? 3 : 2}` : ''}`,
            subject_id && teacher_id ? [currentMonth, subject_id, teacher_id] :
            subject_id ? [currentMonth, subject_id] :
            teacher_id ? [currentMonth, teacher_id] :
            [currentMonth]
        );

        res.json({
            success: true,
            message: "Barcha studentlar davomat ma'lumotlari",
            month: currentMonth,
            summary: summary.rows[0],
            filters: {
                subject_id,
                teacher_id,
                search
            },
            count: studentsAttendance.rows.length,
            students: studentsAttendance.rows
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            message: "Ma'lumotlarni olishda xatolik",
            error: err.message 
        });
    }
};