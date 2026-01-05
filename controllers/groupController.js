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
    const { name, teacher_id, start_date, schedule, subject_id, price } = req.body;
    const unique_code = generateUniqueCode();
    try {
        const result = await pool.query(
            `INSERT INTO groups (name, teacher_id, unique_code, start_date, schedule, subject_id, price) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                name, 
                teacher_id, 
                unique_code, 
                start_date ? start_date : null,
                schedule ? JSON.stringify(schedule) : null,
                subject_id,
                price
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
            `SELECT g.id, g.name as group_name, g.price, g.teacher_id, u.name || ' ' || u.surname as teacher_name 
             FROM groups g 
             LEFT JOIN users u ON g.teacher_id = u.id 
             WHERE g.id = $1`,
            [group_id]
        );
        if (groupRes.rows.length === 0) {
            return res.status(404).json({ message: "Guruh topilmadi" });
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
            `SELECT g.id, g.name as group_name, g.price, g.teacher_id, u.name || ' ' || u.surname as teacher_name, g.is_active 
             FROM groups g 
             LEFT JOIN users u ON g.teacher_id = u.id 
             WHERE g.unique_code = $1`,
            [unique_code]
        );
        if (!group.rows[0]) return res.status(404).json({ message: "Bunday kodli guruh mavjud emas" });
        if (!group.rows[0].is_active) return res.status(400).json({ message: "Guruh hozirda bloklangan" });

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

// 6. Filtrlangan ro'yxat
exports.getAllGroups = async (req, res) => {
    const { teacher_id, subject_id, is_active } = req.query;
    let query = `SELECT g.*, CONCAT(u.name, ' ', u.surname) as teacher_name FROM groups g LEFT JOIN users u ON g.teacher_id = u.id WHERE 1=1`;
    const params = [];

    if (teacher_id) { params.push(parseInt(teacher_id)); query += ` AND g.teacher_id = $${params.length}`; }
    if (subject_id) { params.push(parseInt(subject_id)); query += ` AND g.subject_id = $${params.length}`; }
    if (is_active !== undefined) { params.push(is_active === 'true'); query += ` AND g.is_active = $${params.length}`; }

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
            SELECT g.*, CONCAT(u.name, ' ', u.surname) as teacher_name, u.phone as teacher_phone, u.phone2 as teacher_phone2 
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