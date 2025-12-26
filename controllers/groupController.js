const pool = require('../config/db');

// 1. Admin tomonidan studentni guruhga qo'shish
const adminAddStudentToGroup = async (req, res) => {
    const { student_id, group_id } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO student_groups (student_id, group_id) VALUES ($1, $2) RETURNING *`,
            [student_id, group_id]
        );
        res.status(201).json({ success: true, student_group: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ message: "Student allaqachon bu guruhda bor!" });
        res.status(500).json({ error: err.message });
    }
};

// 2. Student o'zi unique_code orqali qo'shilishi
const studentJoinByCode = async (req, res) => {
    const { unique_code } = req.body;
    const student_id = req.user.id; // Middleware-dan kelgan ID

    try {
        // Avval guruhni kod orqali topamiz
        const groupResult = await pool.query('SELECT id, is_active FROM groups WHERE unique_code = $1', [unique_code]);
        const group = groupResult.rows[0];

        if (!group) return res.status(404).json({ message: "Bunday kodli guruh topilmadi!" });
        if (!group.is_active) return res.status(400).json({ message: "Guruh hozirda faol emas!" });

        // Studentni biriktiramiz
        const joinResult = await pool.query(
            `INSERT INTO student_groups (student_id, group_id) VALUES ($1, $2) RETURNING *`,
            [student_id, group.id]
        );

        res.status(201).json({ success: true, group_info: joinResult.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ message: "Siz allaqachon bu guruhga qo'shilgansiz!" });
        res.status(500).json({ error: err.message });
    }
};

module.exports = { adminAddStudentToGroup, studentJoinByCode };