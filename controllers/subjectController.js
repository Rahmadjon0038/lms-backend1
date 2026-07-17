const pool = require('../config/db');
const { getScopedBranchId } = require('../utils/branch');

// 1. Fan yaratish (Admin)
exports.createSubject = async (req, res) => {
    const { name } = req.body;
    try {
        const branchId = getScopedBranchId(req);
        const result = await pool.query(
            'INSERT INTO subjects (name, branch_id) VALUES ($1, $2) RETURNING *',
            [name, branchId]
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

// 2.1. Fanlar ro'yxatini olish (Teacher registratsiyasi uchun) - Yangi teacher_subjects bilan
exports.getSubjectsForTeacher = async (req, res) => {
    try {
        const branchId = getScopedBranchId(req);
        const result = await pool.query(`
            SELECT 
                s.id, 
                s.name,
                COUNT(DISTINCT ts.teacher_id) as teachers_count,
                COUNT(DISTINCT g.id) as groups_count,
                json_agg(
                    CASE WHEN g.id IS NOT NULL THEN 
                        json_build_object(
                            'group_id', g.id,
                            'group_name', g.name,
                            'schedule', g.schedule,
                            'class_start_date', g.class_start_date,
                            'status', g.status,
                            'price', g.price,
                            'teacher_name', u.full_name
                        )
                    ELSE NULL END
                ) FILTER (WHERE g.id IS NOT NULL) as groups
            FROM subjects s
            LEFT JOIN teacher_subjects ts ON s.id = ts.subject_id AND ts.branch_id = s.branch_id
            LEFT JOIN groups g ON s.id = g.subject_id AND g.status = 'active' AND g.branch_id = s.branch_id
            LEFT JOIN users u ON g.teacher_id = u.id
            WHERE s.branch_id = $1
            GROUP BY s.id, s.name
            ORDER BY s.name
        `, [branchId]);
        
        res.json({ 
            success: true, 
            message: "Teacher registratsiyasi uchun mavjud fanlar",
            subjects: result.rows.map(subject => ({
                id: subject.id,
                name: subject.name,
                teachers_count: parseInt(subject.teachers_count) || 0,
                groups_count: parseInt(subject.groups_count) || 0,
                description: `${subject.name} fani (${subject.teachers_count} ta teacher, ${subject.groups_count} ta active guruh)`,
                groups: subject.groups || []
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Barcha fanlarni olish - Yangi teacher_subjects bilan
exports.getAllSubjects = async (req, res) => {
    try {
        const branchId = getScopedBranchId(req);
        const result = await pool.query(`
            SELECT s.*, 
                   COUNT(DISTINCT g.id) as groups_count,
                   COUNT(sg.student_id) as students_count,
                   COUNT(DISTINCT ts.teacher_id) as teachers_count
            FROM subjects s
            LEFT JOIN groups g ON s.id = g.subject_id AND g.branch_id = s.branch_id
            LEFT JOIN student_groups sg ON g.id = sg.group_id AND sg.status = 'active' AND sg.branch_id = s.branch_id
            LEFT JOIN teacher_subjects ts ON s.id = ts.subject_id AND ts.branch_id = s.branch_id
            WHERE s.branch_id = $1
            GROUP BY s.id, s.name
            ORDER BY s.name
        `, [branchId]);
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
        const branchId = getScopedBranchId(req);
        const result = await pool.query(
            'UPDATE subjects SET name = COALESCE($1, name) WHERE id = $2 AND branch_id = $3 RETURNING *',
            [name, id, branchId]
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
    const client = await pool.connect();
    try {
        const branchId = getScopedBranchId(req);
        await client.query('BEGIN');

        // Avval bu fan bilan bog'liq guruhlar borligini tekshirish
        const groupCheck = await client.query(
            'SELECT COUNT(*) FROM groups WHERE subject_id = $1 AND branch_id = $2',
            [id, branchId]
        );
        
        if (parseInt(groupCheck.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                message: "Bu fan bilan bog'liq guruhlar mavjud. Avval guruhlarni o'chiring yoki boshqa fanga o'tkazing" 
            });
        }

        // Eski sxemada users.subject_id FK fan o'chirishni ushlab qolishi mumkin.
        // Shu sabab bog'lanishni oldin uzib qo'yamiz.
        await client.query(
            'UPDATE users SET subject_id = NULL WHERE subject_id = $1 AND branch_id = $2',
            [id, branchId]
        );

        // Teacher-subject bog'lanishlarini ham tozalaymiz.
        await client.query(
            'DELETE FROM teacher_subjects WHERE subject_id = $1 AND branch_id = $2',
            [id, branchId]
        );

        const result = await client.query(
            'DELETE FROM subjects WHERE id = $1 AND branch_id = $2 RETURNING *',
            [id, branchId]
        );
        
        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Fan topilmadi" });
        }

        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: "Fan muvaffaqiyatli o'chirildi",
            deletedSubject: result.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23503') {
            return res.status(400).json({
                message: "Fan o'chirilmayapti: boshqa jadvalda bu fanga bog'langan ma'lumot bor.",
                detail: err.detail || err.message
            });
        }
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// 5. Fan bo'yicha statistika
exports.getSubjectStats = async (req, res) => {
    const { id } = req.params;
    try {
        const branchId = getScopedBranchId(req);
        // Fan mavjudligini tekshirish
        const subject = await pool.query('SELECT * FROM subjects WHERE id = $1 AND branch_id = $2', [id, branchId]);
        if (subject.rows.length === 0) {
            return res.status(404).json({ message: "Fan topilmadi" });
        }

        // Guruhlar va studentlar statistikasi
        const stats = await pool.query(`
            SELECT 
                COUNT(DISTINCT g.id) as total_groups,
                COUNT(sg.student_id) as total_students,
                COUNT(DISTINCT g.teacher_id) as total_teachers,
                SUM(CASE WHEN g.status = 'active' THEN 1 ELSE 0 END) as active_groups,
                SUM(CASE WHEN g.status = 'draft' THEN 1 ELSE 0 END) as draft_groups,
                SUM(CASE WHEN g.status = 'blocked' THEN 1 ELSE 0 END) as blocked_groups
            FROM groups g
            LEFT JOIN student_groups sg ON g.id = sg.group_id AND sg.status = 'active' AND sg.branch_id = g.branch_id
            WHERE g.subject_id = $1 AND g.branch_id = $2
        `, [id, branchId]);

        res.json({
            success: true,
            subject: subject.rows[0],
            stats: stats.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
