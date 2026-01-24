const pool = require('../config/db');

// Student guruh statusini o'zgartirish - FAQAT ADMIN
// Bu funksiya faqat bitta guruhdagi statusni o'zgartiradi, boshqa guruhlarga ta'sir qilmaydi
// Agar student guruhda bo'lmasa, uni guruhga qo'shadi va status beradi
exports.updateStudentGroupStatus = async (req, res) => {
    const { student_id, group_id } = req.params;
    const { status } = req.body;
    
    // Status validatsiya - guruh-specific statuslar
    const validStatuses = ['active', 'stopped', 'finished'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
            message: "Status faqat 'active', 'stopped' yoki 'finished' bo'lishi mumkin",
            valid_statuses: validStatuses
        });
    }

    try {
        // Student va guruhni alohida tekshirish
        const studentCheck = await pool.query(
            'SELECT id, name, surname FROM users WHERE id = $1 AND role = $2',
            [student_id, 'student']
        );

        if (studentCheck.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        const groupCheck = await pool.query(
            'SELECT id, name FROM groups WHERE id = $1',
            [group_id]
        );

        if (groupCheck.rows.length === 0) {
            return res.status(404).json({ message: "Guruh topilmadi" });
        }

        const student = studentCheck.rows[0];
        const group = groupCheck.rows[0];

        // Student guruhda borligini tekshirish
        const studentGroupCheck = await pool.query(
            `SELECT sg.id, sg.status, sg.joined_at 
             FROM student_groups sg
             WHERE sg.student_id = $1 AND sg.group_id = $2`,
            [student_id, group_id]
        );

        let result;
        let message = '';
        let isNewEntry = false;

        if (studentGroupCheck.rows.length === 0) {
            // Student ushbu guruhda emas - yangi entry yaratish
            const left_at = (status === 'finished' || status === 'stopped') ? new Date().toISOString() : null;
            
            result = await pool.query(
                `INSERT INTO student_groups (student_id, group_id, status, joined_at, left_at)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
                 RETURNING student_id, group_id, status, joined_at, left_at`,
                [student_id, group_id, status, left_at]
            );
            
            const statusText = status === 'active' ? 'faol' : (status === 'stopped' ? 'nofaol' : 'bitirgan');
            message = `${student.name} ${student.surname} "${group.name}" guruhida ${statusText} status berildi`;
            isNewEntry = true;
        } else {
            // Student guruhda mavjud - statusni yangilash
            const left_at = (status === 'finished' || status === 'stopped') ? new Date().toISOString() : null;

            result = await pool.query(
                `UPDATE student_groups 
                 SET status = $1, left_at = $2
                 WHERE student_id = $3 AND group_id = $4 
                 RETURNING student_id, group_id, status, joined_at, left_at`,
                [status, left_at, student_id, group_id]
            );

            // Status o'zgarishiga mos xabarlar
            switch(status) {
                case 'active':
                    message = `${student.name} ${student.surname} "${group.name}" guruhida faol holatga keltirildi`;
                    break;
                case 'stopped':
                    message = `${student.name} ${student.surname} "${group.name}" guruhida nofaol holatga keltirildi`;
                    break;
                case 'finished':
                    message = `${student.name} ${student.surname} "${group.name}" guruhini bitirdi`;
                    break;
            }
        }

        // Status description
        const statusDescriptions = {
            'active': 'Faol',
            'stopped': 'Nofaol', 
            'finished': 'Bitirgan'
        };

        res.json({
            success: true,
            message: message,
            status_description: statusDescriptions[status],
            is_new_entry: isNewEntry,
            student_group: result.rows[0],
            student_name: `${student.name} ${student.surname}`,
            group_name: group.name
        });
        
    } catch (err) {
        console.error('Student guruh statusini yangilashda xatolik:', err);
        res.status(500).json({ 
            success: false,
            message: "Student guruh statusini yangilashda xatolik",
            error: err.message 
        });
    }
};

// 1.2. Student qatnashayotgan barcha guruhlarni ko'rish - ADMIN
// Bu orqali qaysi guruhlarda active, qaysi birida finished/stopped ekanligini ko'rish mumkin
exports.getStudentGroups = async (req, res) => {
    const { student_id } = req.params;

    try {
        // Studentni tekshirish
        const studentCheck = await pool.query(
            'SELECT id, name, surname, username FROM users WHERE id = $1 AND role = $2',
            [student_id, 'student']
        );

        if (studentCheck.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        const student = studentCheck.rows[0];

        // Student guruhlarini olish
        const studentGroups = await pool.query(
            `SELECT 
                sg.id as student_group_id,
                sg.status as group_status,
                sg.joined_at,
                sg.left_at,
                g.id as group_id,
                g.name as group_name,
                g.unique_code,
                g.price,
                g.class_status,
                g.status as group_admin_status,
                s.name as subject_name,
                t.name as teacher_name,
                t.surname as teacher_surname
             FROM student_groups sg
             INNER JOIN groups g ON sg.group_id = g.id
             LEFT JOIN subjects s ON g.subject_id = s.id
             LEFT JOIN users t ON g.teacher_id = t.id
             WHERE sg.student_id = $1
             ORDER BY sg.joined_at DESC`,
            [student_id]
        );

        res.json({
            success: true,
            message: "Student guruhlar ro'yxati",
            student: student,
            groups: studentGroups.rows,
            total_groups: studentGroups.rows.length,
            active_groups: studentGroups.rows.filter(g => g.group_status === 'active').length,
            finished_groups: studentGroups.rows.filter(g => g.group_status === 'finished').length,
            stopped_groups: studentGroups.rows.filter(g => g.group_status === 'stopped').length
        });
        
    } catch (err) {
        console.error('Student guruhlarini olishda xatolik:', err);
        res.status(500).json({ 
            success: false,
            message: "Student guruhlarini olishda xatolik",
            error: err.message 
        });
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

// 3. Studentlarni oy, teacher, group, subject bo'yicha filter qilish + har birining barcha guruhlari
exports.getAllStudents = async (req, res) => {
  const { teacher_id, group_id, subject_id, status, group_status, unassigned } = req.query;
  
  try {
    let baseQuery = `
      SELECT DISTINCT
        u.id, 
        u.name, 
        u.surname, 
        u.phone, 
        u.phone2, 
        u.father_name,
        u.father_phone,
        u.address,
        u.age,
        u.status as student_status,
        u.created_at as registration_date,
        u.course_status,
        u.course_start_date,
        u.course_end_date,
        u.role
      FROM users u
    `;
    
    let whereConditions = ['u.role = \'student\''];
    let joinConditions = [];
    let params = [];
    let paramIdx = 1;

    // Agar specific filters bo'lsa, JOIN qo'shamiz
    if (teacher_id || group_id || subject_id || group_status) {
      joinConditions.push('LEFT JOIN student_groups sg ON u.id = sg.student_id');
      joinConditions.push('LEFT JOIN groups g ON sg.group_id = g.id');
      
      // Teacher filter
      if (teacher_id) {
        whereConditions.push(`g.teacher_id = $${paramIdx++}`);
        params.push(teacher_id);
      }
      
      // Group filter
      if (group_id) {
        whereConditions.push(`g.id = $${paramIdx++}`);
        params.push(group_id);
      }
      
      // Subject filter
      if (subject_id) {
        whereConditions.push(`g.subject_id = $${paramIdx++}`);
        params.push(subject_id);
      }
      
      // Group status filter
      if (group_status) {
        whereConditions.push(`sg.status = $${paramIdx++}`);
        params.push(group_status);
      }
    }
    
    // Student status filter
    if (status) {
      whereConditions.push(`u.status = $${paramIdx++}`);
      params.push(status);
    }

    // Unassigned filter
    if (unassigned === 'true') {
      if (!joinConditions.some(j => j.includes('student_groups'))) {
        joinConditions.push('LEFT JOIN student_groups sg ON u.id = sg.student_id');
      }
      whereConditions.push('sg.student_id IS NULL');
    }

    const finalQuery = baseQuery + 
      (joinConditions.length > 0 ? ' ' + joinConditions.join(' ') : '') + 
      ' WHERE ' + whereConditions.join(' AND ') + 
      ' ORDER BY u.name, u.surname';

    const studentsResult = await pool.query(finalQuery, params);
    
    // Har bir student uchun barcha guruh ma'lumotlarini alohida olish
    const enrichedStudents = [];
    
    for (const student of studentsResult.rows) {
      // Studentning barcha guruhlari va statuslarini olish
      const groupsData = await pool.query(`
        SELECT 
          g.id as group_id,
          g.name as group_name,
          g.status as group_admin_status,
          g.class_status as group_class_status,
          g.class_start_date,
          g.price,
          sg.status as group_status,
          sg.joined_at as group_joined_at,
          sg.left_at as group_left_at,
          CASE 
            WHEN sg.status = 'active' THEN 'Faol'
            WHEN sg.status = 'stopped' THEN 'Nofaol' 
            WHEN sg.status = 'finished' THEN 'Bitirgan'
            ELSE 'Belgilanmagan'
          END as group_status_description,
          CONCAT(t.name, ' ', t.surname) as teacher_name,
          s.name as subject_name,
          r.room_number,
          r.capacity as room_capacity,
          r.has_projector
        FROM student_groups sg
        JOIN groups g ON sg.group_id = g.id
        LEFT JOIN users t ON g.teacher_id = t.id
        LEFT JOIN subjects s ON g.subject_id = s.id
        LEFT JOIN rooms r ON g.room_id = r.id
        WHERE sg.student_id = $1
        ORDER BY sg.joined_at DESC
      `, [student.id]);
      
      enrichedStudents.push({
        ...student,
        groups: groupsData.rows.map(group => ({
          ...group,
          // Faqat guruh active va darslar boshlangan bo'lsagina "started_at" ni ko'rsatamiz
          started_at: (group.group_admin_status === 'active' && group.group_class_status === 'started' && group.class_start_date) 
            ? group.class_start_date : null
        }))
      });
    }
    
    // Statistika hisoblash
    let totalActiveInGroups = 0;
    let totalStoppedInGroups = 0;
    let totalFinishedFromGroups = 0;
    let totalUnassigned = 0;
    
    enrichedStudents.forEach(student => {
      if (student.groups.length === 0) {
        totalUnassigned++;
      } else {
        student.groups.forEach(group => {
          if (group.group_status === 'active') totalActiveInGroups++;
          else if (group.group_status === 'stopped') totalStoppedInGroups++;
          else if (group.group_status === 'finished') totalFinishedFromGroups++;
        });
      }
    });
    
    const stats = {
      total_students: enrichedStudents.length,
      students_with_groups: enrichedStudents.filter(s => s.groups.length > 0).length,
      unassigned_students: totalUnassigned,
      group_memberships: {
        active: totalActiveInGroups,
        stopped: totalStoppedInGroups, 
        finished: totalFinishedFromGroups
      }
    };
    
    res.json({
      success: true,
      stats: stats,
      students: enrichedStudents
    });
    
  } catch (err) {
    console.error('Studentlarni olishda xatolik:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
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
                g.status as group_status,
                g.class_status,
                g.class_start_date,
                sg.joined_at,
                sg.status as student_group_status,
                CONCAT(t.name, ' ', t.surname) as teacher_name,
                s.name as subject_name,
                r.room_number,
                r.capacity as room_capacity,
                r.has_projector
             FROM student_groups sg
             JOIN groups g ON sg.group_id = g.id
             LEFT JOIN users t ON g.teacher_id = t.id
             LEFT JOIN subjects s ON g.subject_id = s.id
             LEFT JOIN rooms r ON g.room_id = r.id
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

        // JSON formatda schedule ma'lumotlarini parse qilish va holat tekstini aniqlash
        const groups = result.rows.map(group => {
            let displayStatus = "Guruh tashkil topilmoqda";
            let startedAt = null; // Darslar boshlangan sana
            
            // Guruh bloklangan bo'lsa
            if (group.group_status === 'blocked' || group.student_group_status === 'stopped') {
                displayStatus = "Bloklangan";
            }
            // Guruh active va darslar boshlangan
            else if (group.group_status === 'active' && group.class_status === 'started') {
                displayStatus = "O'qimoqda";
                startedAt = group.class_start_date; // Faqat dars boshlangan bo'lsagina sana ko'rsatiladi
            }
            // Guruh active lekin darslar boshlanmagan
            else if (group.group_status === 'active' && group.class_status === 'not_started') {
                displayStatus = "Guruh faol, darslar boshlanishi kutilmoqda";
            }
            // Guruh draft holatida
            else if (group.group_status === 'draft') {
                displayStatus = "Guruh tashkil topilmoqda";
            }
            // Darslar tugagan
            else if (group.class_status === 'finished') {
                displayStatus = "Darslar tugagan";
                startedAt = group.class_start_date;
            }
            
            return {
                ...group,
                joined_at: group.joined_at, // Guruhga qo'shilgan sana
                started_at: startedAt, // Darslar boshlangan sana (faqat dars boshlangan bo'lsa)
                schedule: group.schedule ? (typeof group.schedule === 'string' ? JSON.parse(group.schedule) : group.schedule) : null,
                display_status: displayStatus,
                status_details: {
                    group_status: group.group_status,
                    class_status: group.class_status,
                    student_group_status: group.student_group_status
                }
            };
        });

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
