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

// Tasodifiy 6-8 belgili kod yaratish (Masalan: GR-A1B2C3)
const generateUniqueCode = () => {
    return 'GR-' + crypto.randomBytes(3).toString('hex').toUpperCase();
};
// 1. Guruh yaratish (Tuzatilgan variant)
exports.createGroup = async (req, res) => {
    const { name, teacher_id, start_date, schedule, subject_id, price, status } = req.body;
    const unique_code = generateUniqueCode();
    try {
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
// 2. Guruhni tahrirlash (Tuzatilgan mantiq)
exports.updateGroup = async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, teacher_id, is_active, schedule, start_date, price } = req.body;
    try {
        const result = await pool.query(
            `UPDATE groups SET 
                name = COALESCE($1, name), 
                teacher_id = COALESCE($2, teacher_id), 
                is_active = COALESCE($3, is_active), 
                schedule = COALESCE($4, schedule),
                start_date = CASE WHEN $5::date IS NULL THEN start_date ELSE $5 END,
                price = COALESCE($6, price)
             WHERE id = $7 RETURNING *`,
            [name, teacher_id, is_active, schedule ? JSON.stringify(schedule) : null, start_date, price, id]
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

        let message = '';
        if (status === 'draft') {
            message = "Guruh tayyorgarlik holatiga o'tkazildi (studentlar yig'ilmoqda)";
        } else if (status === 'active') {
            message = "Guruh faollashtirildi (darslar boshlandi)";
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
                        s.name as subject_name
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
        res.json({ success: true, count: result.rows.length, groups: result.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 7. Bitta guruh (Batafsil ma'lumot va talabalar ro'yxati)
exports.getGroupById = async (req, res) => {
    const id = parseInt(req.params.id);
    
    // ID raqam ekanligini tekshirish
    if (isNaN(id)) {
        return res.status(400).json({ message: "ID raqam bo'lishi shart!" });
    }

    try {
        // Guruh ma'lumotlarini olish
        const group = await pool.query(`
            SELECT g.*, CONCAT(u.name, ' ', u.surname) as teacher_name, u.phone as teacher_phone, u.phone2 as teacher_phone2,
                   u.certificate as teacher_certificate, u.age as teacher_age, u.has_experience as teacher_has_experience,
                   u.experience_years as teacher_experience_years, u.experience_place as teacher_experience_place,
                   u.available_times as teacher_available_times, u.work_days_hours as teacher_work_days_hours
            FROM groups g 
            LEFT JOIN users u ON g.teacher_id = u.id 
            WHERE g.id = $1`, [id]);

        if (group.rows.length === 0) {
            return res.status(404).json({ message: "Guruh topilmadi" });
        }

        // Guruhdagi studentlarni telefon raqamlari bilan olish
        // u.phone va u.phone2 - bazangdagi ustun nomlariga moslang
        const students = await pool.query(`
            SELECT 
                u.id, 
                u.name, 
                u.surname, 
                u.phone,      -- 1-telefon raqami
                u.phone2,     -- 2-telefon raqami (masalan, ota-onasi kabi)
                sg.status, 
                sg.joined_at 
            FROM users u 
            JOIN student_groups sg ON u.id = sg.student_id 
            WHERE sg.group_id = $1`, [id]);

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