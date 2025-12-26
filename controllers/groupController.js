const pool = require('../config/db');

// 1. Guruh yaratish
exports.createGroup = async (req, res) => {
    const { name, teacher_id, unique_code, start_date, schedule } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO groups (name, teacher_id, unique_code, start_date, schedule) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [name, teacher_id, unique_code, start_date, schedule ? JSON.stringify(schedule) : null]
        );
        res.status(201).json({ success: true, group: result.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 2. Guruhni tahrirlash (Tuzatilgan mantiq)
exports.updateGroup = async (req, res) => {
    const id = parseInt(req.params.id); // ID ni raqamga o'tkazamiz
    const { name, teacher_id, is_active, schedule } = req.body;
    
    try {
        const result = await pool.query(
            `UPDATE groups SET 
                name = COALESCE($1, name), 
                teacher_id = COALESCE($2, teacher_id), 
                is_active = COALESCE($3, is_active), 
                schedule = COALESCE($4, schedule) 
             WHERE id = $5 RETURNING *`,
            [name, teacher_id, is_active, schedule ? JSON.stringify(schedule) : null, id]
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
        const result = await pool.query(
            "INSERT INTO student_groups (student_id, group_id) VALUES ($1, $2) RETURNING *",
            [student_id, group_id]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 5. Student kod orqali qo'shilishi
exports.studentJoinByCode = async (req, res) => {
    const { unique_code } = req.body;
    try {
        const group = await pool.query("SELECT id, is_active FROM groups WHERE unique_code = $1", [unique_code]);
        if (!group.rows[0]) return res.status(404).json({ message: "Bunday kodli guruh mavjud emas" });
        if (!group.rows[0].is_active) return res.status(400).json({ message: "Guruh hozirda bloklangan" });

        const result = await pool.query(
            "INSERT INTO student_groups (student_id, group_id) VALUES ($1, $2) RETURNING *",
            [req.user.id, group.rows[0].id]
        );
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) { 
        if(err.code === '23505') return res.status(400).json({ message: "Siz allaqachon bu guruhdasiz" });
        res.status(500).json({ error: err.message }); 
    }
};

// 6. Filtrlangan ro'yxat
exports.getAllGroups = async (req, res) => {
    const { teacher_id, subject_id, is_active } = req.query;
    let query = `SELECT g.*, u.name as teacher_name FROM groups g LEFT JOIN users u ON g.teacher_id = u.id WHERE 1=1`;
    const params = [];

    if (teacher_id) { params.push(parseInt(teacher_id)); query += ` AND g.teacher_id = $${params.length}`; }
    if (subject_id) { params.push(parseInt(subject_id)); query += ` AND g.subject_id = $${params.length}`; }
    if (is_active !== undefined) { params.push(is_active === 'true'); query += ` AND g.is_active = $${params.length}`; }

    try {
        const result = await pool.query(query, params);
        res.json({ success: true, count: result.rows.length, groups: result.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// 7. Bitta guruh (Batafsil)
exports.getGroupById = async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const group = await pool.query(`SELECT g.*, u.name as teacher_name FROM groups g LEFT JOIN users u ON g.teacher_id = u.id WHERE g.id = $1`, [id]);
        if (group.rows.length === 0) return res.status(404).json({ message: "Guruh topilmadi" });

        const students = await pool.query(`SELECT u.id, u.name, u.surname FROM users u JOIN student_groups sg ON u.id = sg.student_id WHERE sg.group_id = $1`, [id]);
        res.json({ success: true, group: group.rows[0], students: students.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
};