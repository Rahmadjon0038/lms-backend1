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
             RETURNING id, name, surname, username, status, group_name, teacher_name`,
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

  // Teacher filter
  if (teacher_id) {
    filters.push(`u.teacher_id = $${paramIdx++}`);
    params.push(teacher_id);
  }
  // Group filter
  if (group_id) {
    filters.push(`u.group_id = $${paramIdx++}`);
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
      u.group_name,
      u.teacher_name
    FROM users u
    WHERE u.role = 'student' ${whereClause}
    ORDER BY u.created_at DESC;
  `;
  try {
    const result = await pool.query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
