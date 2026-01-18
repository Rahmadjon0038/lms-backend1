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

// 3. Studentlarni oy, teacher, group, subject bo'yicha filter qilish
exports.getAllStudents = async (req, res) => {
  const { teacher_id, group_id, subject_id, status, unassigned } = req.query;
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
  
  // Subject filter - groups orqali
  if (subject_id) {
    filters.push(`g.subject_id = $${paramIdx++}`);
    params.push(subject_id);
  }
  
  // Status filter (active, inactive, blocked)
  if (status) {
    filters.push(`u.status = $${paramIdx++}`);
    params.push(status);
  }

  // Unassigned filter - hali guruhga qo'shilmagan studentlar
  if (unassigned === 'true') {
    filters.push('sg.student_id IS NULL');
  }

  const whereClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

  const queryText = `
    SELECT 
      u.id, 
      u.name, 
      u.surname, 
      u.phone, 
      u.phone2, 
      u.father_name,
      u.father_phone,
      u.address,
      u.age,
      u.status,
      u.created_at as registration_date,
      u.course_status,
      u.course_start_date,
      u.course_end_date,
      -- Har bir guruh uchun alohida ma'lumot
      COALESCE(g.name, 'Guruh biriktirilmagan') as group_name,
      COALESCE(CONCAT(t.name, ' ', t.surname), 'Oqituvchi biriktirilmagan') as teacher_name,
      COALESCE(s.name, 'Fan belgilanmagan') as subject_name,
      sg.joined_at,
      sg.status as group_status,
      g.id as group_id
    FROM users u
    LEFT JOIN student_groups sg ON u.id = sg.student_id AND sg.status = 'active'
    LEFT JOIN groups g ON sg.group_id = g.id
    LEFT JOIN users t ON g.teacher_id = t.id
    LEFT JOIN subjects s ON g.subject_id = s.id
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

// 5. Student'ning aniq guruh ma'lumotlari va dars holati (Teacher telefon, guruh price va a'zolar bilan)
exports.getMyGroupInfo = async (req, res) => {
    const student_id = req.user.id; // JWT token'dan student ID
    const { group_id } = req.params; // URL'dan guruh ID
    
    try {
        // Student bu guruhga a'zo ekanligini tekshirish
        const membershipCheck = await pool.query(`
            SELECT sg.id FROM student_groups sg 
            WHERE sg.student_id = $1 AND sg.group_id = $2 AND sg.status = 'active'
        `, [student_id, group_id]);
        
        if (membershipCheck.rows.length === 0) {
            return res.status(403).json({ 
                message: "Siz bu guruhga a'zo emassiz yoki guruh mavjud emas" 
            });
        }

        // Student va guruh ma'lumotlari
        const studentGroup = await pool.query(`
            SELECT 
                u.id as student_id,
                u.name || ' ' || u.surname as student_name,
                g.id as group_id,
                g.name as group_name,
                g.status as group_status,
                g.class_status,
                g.class_start_date,
                g.start_date as planned_start_date,
                g.price as group_price,
                g.teacher_id,
                t.name || ' ' || t.surname as teacher_name,
                t.phone as teacher_phone,
                t.phone2 as teacher_phone2
            FROM users u
            INNER JOIN groups g ON g.id = $2
            LEFT JOIN users t ON g.teacher_id = t.id
            WHERE u.id = $1 AND u.role = 'student'
        `, [student_id, group_id]);

        if (studentGroup.rows.length === 0) {
            return res.status(404).json({ message: "Student yoki guruh topilmadi" });
        }

        const studentData = studentGroup.rows[0];

        // Guruh a'zolari (guruhdashlari) - o'zidan boshqa
        const groupMembers = await pool.query(`
            SELECT 
                u.id,
                u.name,
                u.surname
            FROM users u
            INNER JOIN student_groups sg ON u.id = sg.student_id
            WHERE sg.group_id = $1 AND sg.status = 'active' AND u.id != $2
            ORDER BY u.name, u.surname
        `, [group_id, student_id]);

        let classStatus = "Darslar boshlanishi kutilmoqda";
        
        if (studentData.class_status === 'not_started') {
            classStatus = "Darslar boshlanishi kutilmoqda";
        } else if (studentData.class_status === 'started') {
            const startDate = new Date(studentData.class_start_date).toLocaleDateString('uz-UZ');
            classStatus = `Darslar ${startDate} da boshlandi`;
        } else if (studentData.class_status === 'finished') {
            classStatus = "Darslar yakunlandi";
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
                    price: studentData.group_price,
                    teacher: {
                        id: studentData.teacher_id,
                        name: studentData.teacher_name,
                        phone: studentData.teacher_phone,
                        phone2: studentData.teacher_phone2
                    },
                    classmates: groupMembers.rows.map(member => ({
                        id: member.id,
                        name: member.name + ' ' + member.surname
                    })),
                    totalClassmates: groupMembers.rows.length
                },
                displayStatus: classStatus
            }
        });
    } catch (err) {
        console.error("Student guruh ma'lumotlarini olishda xato:", err);
        res.status(500).json({ error: err.message });
    }
};
