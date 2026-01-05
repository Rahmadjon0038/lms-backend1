const pool = require('../config/db');

// 1. Student statusini o'zgartirish (active, inactive, blocked) - FAQAT ADMIN
exports.updateStudentStatus = async (req, res) => {
    const { student_id } = req.params;
    const { status } = req.body; // 'active', 'inactive', 'blocked'
    
    // Status validatsiya
    const validStatuses = ['active', 'inactive', 'blocked'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            message: "Status faqat 'active', 'inactive' yoki 'blocked' bo'lishi mumkin" 
        });
    }

    try {
        const result = await pool.query(
            `UPDATE users SET status = $1 WHERE id = $2 AND role = 'student' 
             RETURNING id, name, surname, username, status`,
            [status, student_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        let message = '';
        if (status === 'inactive') {
            message = "Student o'qishni to'xtatdi (inactive)";
        } else if (status === 'blocked') {
            message = "Student bloklandi";
        } else {
            message = "Student faollashtirildi (active)";
        }

        res.json({
            success: true,
            message: message,
            student: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Studentni butunlay o'chirish - FAQAT ADMIN
exports.deleteStudent = async (req, res) => {
    const { student_id } = req.params;

    try {
        // Avval student_groups jadvalidan o'chiriladi (CASCADE orqali avtomatik)
        const result = await pool.query(
            `DELETE FROM users WHERE id = $1 AND role = 'student' RETURNING id, name, surname, username`,
            [student_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        res.json({
            success: true,
            message: "Student va uning barcha ma'lumotlari o'chirildi",
            deletedStudent: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Studentlarni oy, teacher, group bo'yicha filter qilish
exports.getAllStudents = async (req, res) => {
  const { teacher_id, group_id, status } = req.query;
  let filters = [];
  let params = [];
  let paramIdx = 1;

  // Teacher filter - student_groups orqali
  if (teacher_id) {
    filters.push(`g.teacher_id = $${paramIdx++}`);
    params.push(teacher_id);
  }
  
  // Group filter - student_groups orqali
  if (group_id) {
    filters.push(`g.id = $${paramIdx++}`);
    params.push(group_id);
  }
  
  // Status filter (active, inactive, blocked)
  if (status) {
    filters.push(`u.status = $${paramIdx++}`);
    params.push(status);
  }

  const whereClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

  const queryText = `
    SELECT 
      u.id, 
      u.name, 
      u.surname, 
      u.phone, 
      u.phone2, 
      u.status,
      u.created_at as registration_date,
      -- Har bir guruh uchun alohida ma'lumot
      COALESCE(g.name, 'Guruh biriktirilmagan') as group_name,
      COALESCE(CONCAT(t.name, ' ', t.surname), 'Oqituvchi biriktirilmagan') as teacher_name,
      sg.joined_at,
      sg.status as group_status,
      g.id as group_id
    FROM users u
    LEFT JOIN student_groups sg ON u.id = sg.student_id AND sg.status = 'active'
    LEFT JOIN groups g ON sg.group_id = g.id
    LEFT JOIN users t ON g.teacher_id = t.id
    WHERE u.role = 'student' ${whereClause}
    ORDER BY u.name, u.surname, sg.joined_at DESC;
  `;
  try {
    const result = await pool.query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Student o'zi qatnashayotgan guruhlarni olish
exports.getMyGroups = async (req, res) => {
    const student_id = req.user.id; // JWT tokendan olingan student ID
    
    try {
        const result = await pool.query(
            `SELECT 
                g.id as group_id,
                g.name as group_name,
                g.unique_code,
                g.start_date,
                g.schedule,
                g.price,
                g.is_active,
                sg.joined_at,
                sg.status as student_status,
                CONCAT(t.name, ' ', t.surname) as teacher_name,
                s.name as subject_name
             FROM student_groups sg
             JOIN groups g ON sg.group_id = g.id
             LEFT JOIN users t ON g.teacher_id = t.id
             LEFT JOIN subjects s ON g.subject_id = s.id
             WHERE sg.student_id = $1
             ORDER BY sg.joined_at DESC`,
            [student_id]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                message: "Siz hali hech qaysi guruhga a'zo emassiz",
                groups: []
            });
        }

        // JSON formatda schedule ma'lumotlarini parse qilish
        const groups = result.rows.map(group => ({
            ...group,
            schedule: group.schedule ? (typeof group.schedule === 'string' ? JSON.parse(group.schedule) : group.schedule) : null
        }));

        res.json({
            success: true,
            message: "Sizning guruhlaringiz ro'yxati",
            groups: groups
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
