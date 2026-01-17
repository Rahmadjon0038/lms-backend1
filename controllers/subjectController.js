const pool = require('../config/db');

// 1. Fan yaratish (Admin)
exports.createSubject = async (req, res) => {
    const { name } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO subjects (name) VALUES ($1) RETURNING *',
            [name]
        );
        res.status(201).json({ 
            success: true, 
            message: "Fan muvaffaqiyatli yaratildi",
            subject: result.rows[0] 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2.1. Fanlar ro'yxatini olish (Teacher registratsiyasi uchun) 
exports.getSubjectsForTeacher = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id, 
                name,
                COUNT(u.id) as teachers_count
            FROM subjects s
            LEFT JOIN users u ON s.id = u.subject_id AND u.role = 'teacher'
            GROUP BY s.id, s.name
            ORDER BY s.name
        `);
        
        res.json({ 
            success: true, 
            message: "Teacher registratsiyasi uchun mavjud fanlar",
            subjects: result.rows.map(subject => ({
                id: subject.id,
                name: subject.name,
                teachers_count: parseInt(subject.teachers_count) || 0,
                description: `${subject.name} fani (${subject.teachers_count} ta teacher)`
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Barcha fanlarni olish
exports.getAllSubjects = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, 
                   COUNT(g.id) as groups_count,
                   COUNT(DISTINCT sg.student_id) as students_count
            FROM subjects s
            LEFT JOIN groups g ON s.id = g.subject_id 
            LEFT JOIN student_groups sg ON g.id = sg.group_id AND sg.status = 'active'
            GROUP BY s.id, s.name
            ORDER BY s.name
        `);
        res.json({ 
            success: true, 
            subjects: result.rows 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Fan tahrirlash (Admin)
exports.updateSubject = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        const result = await pool.query(
            'UPDATE subjects SET name = COALESCE($1, name) WHERE id = $2 RETURNING *',
            [name, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Fan topilmadi" });
        }
        res.json({ 
            success: true, 
            message: "Fan muvaffaqiyatli yangilandi",
            subject: result.rows[0] 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Fan o'chirish (Admin)
exports.deleteSubject = async (req, res) => {
    const { id } = req.params;
    try {
        // Avval bu fan bilan bog'liq guruhlar borligini tekshirish
        const groupCheck = await pool.query(
            'SELECT COUNT(*) FROM groups WHERE subject_id = $1',
            [id]
        );
        
        if (parseInt(groupCheck.rows[0].count) > 0) {
            return res.status(400).json({ 
                message: "Bu fan bilan bog'liq guruhlar mavjud. Avval guruhlarni o'chiring yoki boshqa fanga o'tkazing" 
            });
        }

        const result = await pool.query(
            'DELETE FROM subjects WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Fan topilmadi" });
        }
        
        res.json({ 
            success: true, 
            message: "Fan muvaffaqiyatli o'chirildi",
            deletedSubject: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Fan bo'yicha statistika
exports.getSubjectStats = async (req, res) => {
    const { id } = req.params;
    try {
        // Fan mavjudligini tekshirish
        const subject = await pool.query('SELECT * FROM subjects WHERE id = $1', [id]);
        if (subject.rows.length === 0) {
            return res.status(404).json({ message: "Fan topilmadi" });
        }

        // Guruhlar va studentlar statistikasi
        const stats = await pool.query(`
            SELECT 
                COUNT(DISTINCT g.id) as total_groups,
                COUNT(DISTINCT sg.student_id) as total_students,
                COUNT(DISTINCT g.teacher_id) as total_teachers,
                SUM(CASE WHEN g.status = 'active' THEN 1 ELSE 0 END) as active_groups,
                SUM(CASE WHEN g.status = 'draft' THEN 1 ELSE 0 END) as draft_groups,
                SUM(CASE WHEN g.status = 'blocked' THEN 1 ELSE 0 END) as blocked_groups
            FROM groups g
            LEFT JOIN student_groups sg ON g.id = sg.group_id AND sg.status = 'active'
            WHERE g.subject_id = $1
        `, [id]);

        res.json({
            success: true,
            subject: subject.rows[0],
            stats: stats.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};