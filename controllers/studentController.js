const pool = require('../config/db');
const crypto = require('crypto');
const { MONTHLY_POINT_CAP } = require('../config/points');
const { getScopedBranchId } = require('../utils/branch');
const { buildReportPayload } = require('./teacherStatisticsController');
const {
    loadMonthlyGroupMemberStats,
    loadStudentPointHistoryEntries,
} = require('../utils/englishPoints');

const generatePlainRecoveryKey = () => {
    return `RK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

const hashRecoveryKey = (username, recoveryKey) => {
    const pepper = process.env.PASSWORD_RESET_PEPPER || process.env.JWT_SECRET || 'default-pepper';
    return crypto
        .createHash('sha256')
        .update(`${String(username).trim()}::${String(recoveryKey).trim()}::${pepper}`)
        .digest('hex');
};

const hasUsersColumn = async (columnName) => {
    const result = await pool.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_name = 'users' AND column_name = $1
         LIMIT 1`,
        [columnName]
    );
    return result.rows.length > 0;
};

const ensureStudentRecoveryKeys = async () => {
    const usersResult = await pool.query(
        `SELECT id, username
         FROM users
         WHERE role = 'student'
           AND (password_reset_key_plain IS NULL OR password_reset_key_hash IS NULL)`
    );

    for (const user of usersResult.rows) {
        const recoveryKey = generatePlainRecoveryKey();
        const recoveryKeyHash = hashRecoveryKey(user.username, recoveryKey);
        await pool.query(
            `UPDATE users
             SET password_reset_key_plain = $1,
                 password_reset_key_hash = $2,
                 password_reset_key_rotated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [recoveryKey, recoveryKeyHash, user.id]
        );
    }
};

const normalizeDuplicateDigits = (value) => String(value || '').replace(/\D/g, '');
const normalizeDuplicateText = (value) => String(value || '').toLowerCase().trim();

const buildDuplicateGroups = (students = []) => {
    const fields = [
        { key: 'phone', label: 'Telefon', getValue: (s) => normalizeDuplicateDigits(s?.phone) },
        { key: 'phone2', label: "Qo'shimcha telefon", getValue: (s) => normalizeDuplicateDigits(s?.phone2) },
        { key: 'father_phone', label: "Ota telefoni", getValue: (s) => normalizeDuplicateDigits(s?.father_phone) },
        { key: 'username', label: 'Foydalanuvchi nomi', getValue: (s) => normalizeDuplicateText(s?.username) },
    ];

    const groups = [];

    fields.forEach((field) => {
        const map = new Map();

        students.forEach((student, index) => {
            const value = field.getValue(student);
            if (!value || value.length < 3) return;

            if (!map.has(value)) {
                map.set(value, []);
            }

            map.get(value).push({
                ...student,
                _rowKey: `${student.id}-${field.key}-${index}`,
            });
        });

        map.forEach((items, value) => {
            if (items.length < 2) return;

            groups.push({
                id: `${field.key}-${value}`,
                field_key: field.key,
                field_label: field.label,
                field_value: value,
                students: items,
                count: items.length,
            });
        });
    });

    return groups.sort((a, b) => b.count - a.count);
};

const buildImageUrl = (filePath) => {
    if (!filePath) return null;
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        return filePath;
    }
    return filePath.startsWith('/') ? filePath : `/${filePath}`;
};

const getCurrentMonthKey = () => new Date().toISOString().slice(0, 7);

const normalizeMonthKey = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    const monthMatch = text.match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
        return `${monthMatch[1]}-${monthMatch[2]}`;
    }
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
};

const buildMonthFilter = (month) => normalizeMonthKey(month) || getCurrentMonthKey();

const formatDateDdMmYyyy = (value) => {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) return text;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat('uz-UZ', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(parsed);
};

const parseDateLike = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const text = String(value).trim();
    if (!text) return null;

    if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
        const [day, month, year] = text.split('.').map((part) => Number.parseInt(part, 10));
        if (!day || !month || !year) return null;
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const monthKeyFromDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const formatDateToYmd = (value) => {
    const date = parseDateLike(value);
    if (!date) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const buildAvailableMonthKeys = (startValue, endValue = null) => {
    const currentMonth = new Date();
    const current = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

    const startDate = parseDateLike(startValue);
    const endDate = parseDateLike(endValue) || current;

    const start = startDate
        ? new Date(startDate.getFullYear(), startDate.getMonth(), 1)
        : new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    if (start > end) {
        start.setTime(end.getTime());
    }
    if (end > current) {
        end.setTime(current.getTime());
    }

    const months = [];
    let cursor = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor >= start && months.length < 36) {
        const key = monthKeyFromDate(cursor);
        if (key) {
            months.push(key);
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    }
    return months;
};

// Student guruh statusini o'zgartirish - FAQAT ADMIN
// Bu funksiya faqat bitta guruhdagi statusni o'zgartiradi, boshqa guruhlarga ta'sir qilmaydi
// Agar student guruhda bo'lmasa, uni guruhga qo'shadi va status beradi
exports.updateStudentGroupStatus = async (req, res) => {
    const { student_id, group_id } = req.params;
    const { status } = req.body;
    const branchId = getScopedBranchId(req);
    
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
            'SELECT id, name, surname FROM users WHERE id = $1 AND role = $2 AND branch_id = $3',
            [student_id, 'student', branchId]
        );

        if (studentCheck.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        const groupCheck = await pool.query(
            'SELECT id, name FROM groups WHERE id = $1 AND branch_id = $2',
            [group_id, branchId]
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
             WHERE sg.student_id = $1
               AND sg.group_id = $2
               AND sg.branch_id = $3
               AND sg.status = 'active'`,
            [student_id, group_id, branchId]
        );

        let result;
        let message = '';
        let isNewEntry = false;

        if (studentGroupCheck.rows.length === 0) {
            // Student ushbu guruhda emas - yangi entry yaratish
            const left_at = (status === 'finished' || status === 'stopped') ? new Date().toISOString() : null;
            
            result = await pool.query(
                `INSERT INTO student_groups (student_id, group_id, status, joined_at, left_at, branch_id)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5)
                 RETURNING student_id, group_id, status, joined_at, left_at`,
                [student_id, group_id, status, left_at, branchId]
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
                 WHERE student_id = $3 AND group_id = $4 AND branch_id = $5
                 RETURNING student_id, group_id, status, joined_at, left_at`,
                [status, left_at, student_id, group_id, branchId]
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

        // Users jadvalidagi course ma'lumotlarini yangilash
        if (status === 'finished' || status === 'stopped') {
            // Student kursni bitirgan yoki to'xtatgan
            await pool.query(
                `UPDATE users 
                 SET course_status = $1, course_end_date = CURRENT_TIMESTAMP 
                 WHERE id = $2`,
                [status === 'finished' ? 'finished' : 'stopped', student_id]
            );
        } else if (status === 'active') {
            // Student yana kursni boshlagan - end_date ni tozalash
            await pool.query(
                `UPDATE users 
                 SET course_status = 'in_progress', course_end_date = NULL 
                 WHERE id = $1`,
                [student_id]
            );
        }

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
                TO_CHAR(sg.left_at, 'DD.MM.YYYY') as formatted_left_date,
                CASE 
                    WHEN sg.status = 'finished' THEN sg.left_at
                    WHEN sg.status = 'stopped' THEN sg.left_at  
                    ELSE NULL
                END as status_changed_date,
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

// 2. Studentni butunlay o'chirish - ADMIN yoki TEACHER
// Student o'z akkauntini butunlay o'chiradi (mobil ilova sozlamalaridagi
// "Delete account"). Parol yuborilsa tekshiriladi, ammo majburiy emas;
// users qatori o'chganda bog'liq yozuvlar (guruh a'zoliklari, to'lovlar,
// davomat, ballar) CASCADE orqali birga o'chadi.
exports.deleteMyAccount = async (req, res) => {
    try {
        const { id: userId, role } = req.user;
        const password = String(req.body?.password ?? '').trim();

        if (role !== 'student') {
            return res.status(403).json({
                success: false,
                message: 'Bu amal faqat studentlar uchun'
            });
        }
        const userResult = await pool.query(
            `SELECT id, password FROM users WHERE id = $1 AND role = 'student'`,
            [userId]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Akkaunt topilmadi'
            });
        }

        if (password) {
            const bcrypt = require('bcryptjs');
            const passwordMatches = await bcrypt.compare(
                password,
                userResult.rows[0].password || ''
            );
            if (!passwordMatches) {
                return res.status(401).json({
                    success: false,
                    message: 'Parol noto\'g\'ri'
                });
            }
        }

        await pool.query(`DELETE FROM users WHERE id = $1 AND role = 'student'`, [userId]);

        res.json({
            success: true,
            message: 'Akkaunt va unga bog\'liq barcha ma\'lumotlar o\'chirildi'
        });
    } catch (error) {
        console.error('❌ Student akkauntini o\'chirishda xato:', error);
        res.status(500).json({
            success: false,
            message: 'Akkauntni o\'chirishda xatolik yuz berdi',
            error: error.message
        });
    }
};

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

// Guruhga umuman biriktirilmagan studentlarni to'liq o'chirish - ADMIN
exports.deleteUnassignedStudents = async (req, res) => {
  try {
    const result = await pool.query(
      `WITH deleted_students AS (
         DELETE FROM users u
         WHERE u.role = 'student'
           AND NOT EXISTS (
             SELECT 1
             FROM student_groups sg
             WHERE sg.student_id = u.id
           )
         RETURNING u.id
       )
       SELECT COUNT(*)::int AS deleted_count
       FROM deleted_students`
    );

    const deletedCount = Number(result.rows[0]?.deleted_count || 0);

    return res.json({
      success: true,
      message: deletedCount > 0
        ? `${deletedCount} ta guruhsiz talaba o'chirildi`
        : "Guruhsiz talabalar topilmadi",
      deleted_count: deletedCount
    });
  } catch (err) {
    console.error('Guruhsiz talabalarni o\'chirishda xatolik:', err);
    return res.status(500).json({
      success: false,
      message: "Guruhsiz talabalarni o'chirishda xatolik",
      error: err.message
    });
  }
};

// 3. Studentlarni oy, teacher, group, subject bo'yicha filter qilish + har birining barcha guruhlari
exports.getAllStudents = async (req, res) => {
  const { teacher_id, group_id, subject_id, status, group_status, unassigned, page, limit, search } = req.query;

  try {
    const branchId = getScopedBranchId(req);
    const hasPasswordPlainColumn = await hasUsersColumn('password_plain');

    const unassignedOnly = unassigned === 'true';

    let baseQuery = `
      SELECT DISTINCT
        u.id, 
        u.name, 
        u.surname, 
        u.username,
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
        COALESCE(NULLIF(BTRIM(u.unassigned_reason), ''), 'Yangi qo''shilgan') as unassigned_reason,
        ${hasPasswordPlainColumn ? 'u.password_plain as password,' : 'NULL::text as password,'}
        u.subject_id as registered_subject_id,
        sp.name as registered_subject_name,
        TO_CHAR(u.course_end_date, 'DD.MM.YYYY') as formatted_course_end_date,
        u.role
      FROM users u
      LEFT JOIN subjects sp ON u.subject_id = sp.id AND sp.branch_id = u.branch_id
    `;
    
    let whereConditions = ['u.role = \'student\'', 'u.branch_id = $1'];
    let joinConditions = [];
    let params = [branchId];
    let paramIdx = 2;

    // Search (name/phone/username/father) - case-insensitive + partial
    // Multiple tokens are treated as OR so partial typing doesn't drop results.
    if (search && String(search).trim().length > 0) {
      const raw = String(search).trim().toLowerCase();
      const tokens = raw.split(/\s+/).filter(Boolean);
      const fieldsClause = (idx) => `(
        LOWER(COALESCE(u.name, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.surname, '')) LIKE $${idx}
        OR LOWER(CONCAT_WS(' ', u.name, u.surname)) LIKE $${idx}
        OR LOWER(CONCAT_WS(' ', u.surname, u.name)) LIKE $${idx}
        OR LOWER(COALESCE(u.phone, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.phone2, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.username, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.father_name, '')) LIKE $${idx}
        OR LOWER(COALESCE(u.father_phone, '')) LIKE $${idx}
      )`;

      if (tokens.length <= 1) {
        const searchValue = `%${raw}%`;
        whereConditions.push(fieldsClause(paramIdx));
        params.push(searchValue);
        paramIdx++;
      } else {
        const tokenClauses = [];
        for (const token of tokens) {
          const searchValue = `%${token}%`;
          tokenClauses.push(fieldsClause(paramIdx));
          params.push(searchValue);
          paramIdx++;
        }
        whereConditions.push(`(${tokenClauses.join(' OR ')})`);
      }
    }

    // Agar specific filters bo'lsa, JOIN qo'shamiz
    // unassigned=true bo'lsa, teacher/group/group_status filtrlari ishlamaydi (guruhsizlar uchun)
    if (!unassignedOnly && (teacher_id || group_id || subject_id || group_status)) {
      // 'removed' a'zoliklar bu yerda hisobga olinmaydi — chiqarilgan talaba
      // eski guruhga "tegishli" deb hisoblanmasligi kerak (teacher/subject/group filtrlarida)
      joinConditions.push("LEFT JOIN student_groups sg ON u.id = sg.student_id AND sg.branch_id = u.branch_id AND sg.status <> 'removed'");
      joinConditions.push('LEFT JOIN groups g ON sg.group_id = g.id AND g.branch_id = u.branch_id');
      
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
        whereConditions.push(`(
          (sg.student_id IS NULL AND u.subject_id = $${paramIdx})
          OR
          (sg.student_id IS NOT NULL AND g.subject_id = $${paramIdx})
        )`);
        params.push(subject_id);
        paramIdx++;
      }
      
      // Group status filter
      if (group_status) {
        whereConditions.push(`sg.status = $${paramIdx++}`);
        params.push(group_status);
      }
    }
    
    // Agar unassigned=true bo'lsa faqat users.subject_id bo'yicha filter qilamiz
    if (unassignedOnly && subject_id) {
      whereConditions.push(`u.subject_id = $${paramIdx++}`);
      params.push(subject_id);
    }

    // Student status filter
    if (status) {
      whereConditions.push(`u.status = $${paramIdx++}`);
      params.push(status);
    }

    // Unassigned filter
    // 'removed' a'zoliklar hisobga olinmaydi — stats.unassigned_students bilan bir xil ta'rif
    // (guruhdan chiqarilgan, lekin boshqa faol/to'xtatilgan/bitirgan a'zoligi yo'q talaba ham guruhsiz hisoblanadi)
    if (unassigned === 'true') {
      if (!joinConditions.some(j => j.includes('student_groups'))) {
        joinConditions.push("LEFT JOIN student_groups sg ON u.id = sg.student_id AND sg.branch_id = u.branch_id AND sg.status <> 'removed'");
      }
      whereConditions.push('sg.student_id IS NULL');
    }

    // Pagination
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const offsetNumber = (pageNumber - 1) * limitNumber;

    const finalQuery = baseQuery + 
      (joinConditions.length > 0 ? ' ' + joinConditions.join(' ') : '') + 
      ' WHERE ' + whereConditions.join(' AND ') + 
      ' ORDER BY u.name, u.surname' +
      ` LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;

    const studentsResult = await pool.query(finalQuery, [...params, limitNumber, offsetNumber]);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      LEFT JOIN subjects sp ON u.subject_id = sp.id
      ${joinConditions.length > 0 ? joinConditions.join(' ') : ''}
      WHERE ${whereConditions.join(' AND ')}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total, 10) || 0;
    const totalPages = Math.ceil(total / limitNumber);
    
    // Sahifadagi barcha studentlarning guruhlarini BITTA query bilan olamiz (N+1 muammosini oldini olish uchun)
    const studentIds = studentsResult.rows.map(student => student.id);
    const groupsByStudent = new Map();

    if (studentIds.length > 0) {
      const allGroupsData = await pool.query(`
        SELECT
          sg.student_id,
          g.id as group_id,
          g.name as group_name,
          g.subject_id,
          g.status as group_admin_status,
          g.class_status as group_class_status,
          g.class_start_date,
          g.price,
          sg.status as group_status,
          sg.joined_at as group_joined_at,
          sg.left_at as group_left_at,
          sg.left_reason,
          CASE
            WHEN sg.status = 'active' THEN 'Faol'
            WHEN sg.status = 'stopped' THEN 'Nofaol'
            WHEN sg.status = 'finished' THEN 'Bitirgan'
            ELSE 'Belgilanmagan'
          END as group_status_description,
          CASE
            WHEN sg.status = 'finished' THEN sg.left_at
            WHEN sg.status = 'stopped' THEN sg.left_at
            ELSE NULL
          END as status_changed_date,
          TO_CHAR(sg.left_at, 'DD.MM.YYYY') as formatted_left_date,
          g.teacher_id,
          g.subject_id,
          CONCAT(t.name, ' ', t.surname) as teacher_name,
          s.name as subject_name,
          r.room_number,
          r.capacity as room_capacity,
          r.has_projector
        FROM student_groups sg
        JOIN groups g ON sg.group_id = g.id AND g.branch_id = sg.branch_id
        LEFT JOIN users t ON g.teacher_id = t.id AND t.branch_id = sg.branch_id
        LEFT JOIN subjects s ON g.subject_id = s.id AND s.branch_id = sg.branch_id
        LEFT JOIN rooms r ON g.room_id = r.id AND r.branch_id = sg.branch_id
        WHERE sg.student_id = ANY($1::int[]) AND sg.branch_id = $2
        ORDER BY sg.joined_at DESC
      `, [studentIds, branchId]);

      // Natijalarni student_id bo'yicha guruhlaymiz (joined_at DESC tartibi saqlanadi)
      for (const row of allGroupsData.rows) {
        if (!groupsByStudent.has(row.student_id)) {
          groupsByStudent.set(row.student_id, []);
        }
        groupsByStudent.get(row.student_id).push(row);
      }
    }

    const enrichedStudents = studentsResult.rows.map(student => {
      const studentGroups = groupsByStudent.get(student.id) || [];

      const activeOrLatestGroup = studentGroups.find(group => group.group_status === 'active')
        || studentGroups.find(group => group.group_status !== 'removed')
        || null;
      const effectiveSubjectId = activeOrLatestGroup?.subject_id || student.registered_subject_id || null;
      const effectiveSubjectName = activeOrLatestGroup?.subject_name || student.registered_subject_name || null;

      return {
        ...student,
        subject_id: effectiveSubjectId,
        subject_name: effectiveSubjectName,
        groups: studentGroups.map(group => ({
          ...group,
          // Faqat guruh active va darslar boshlangan bo'lsagina "started_at" ni ko'rsatamiz
          started_at: (group.group_admin_status === 'active' && group.group_class_status === 'started' && group.class_start_date)
            ? group.class_start_date : null
        }))
      };
    });
    
    // Statistika (filter bo'yicha umumiy)
    const statsJoins = new Set(joinConditions);
    if (!Array.from(statsJoins).some(j => j.includes('student_groups'))) {
      statsJoins.add('LEFT JOIN student_groups sg ON u.id = sg.student_id AND sg.branch_id = u.branch_id');
    }
    if (!Array.from(statsJoins).some(j => j.includes('groups g'))) {
      statsJoins.add('LEFT JOIN groups g ON sg.group_id = g.id AND g.branch_id = u.branch_id');
    }

    const statsJoinSql = Array.from(statsJoins).join(' ');
    const statsQuery = `
      WITH filtered_students AS (
        SELECT DISTINCT u.id, u.branch_id
        FROM users u
        LEFT JOIN subjects sp ON u.subject_id = sp.id
        ${statsJoinSql}
      WHERE ${whereConditions.join(' AND ')}
      ),
      student_memberships AS (
        SELECT
          fs.id AS student_id,
          sg.id AS membership_id,
          sg.status AS membership_status,
          g.status AS group_admin_status,
          g.class_status AS group_class_status,
          COALESCE(g.class_start_date, g.start_date, g.created_at::date) AS group_started_on
        FROM filtered_students fs
        LEFT JOIN student_groups sg
          ON sg.student_id = fs.id
         AND sg.branch_id = fs.branch_id
         AND sg.status <> 'removed'
        LEFT JOIN groups g
          ON g.id = sg.group_id
         AND g.branch_id = sg.branch_id
      )
      SELECT
        COUNT(*)::int as total_students,
        COUNT(*) FILTER (WHERE membership_id IS NOT NULL)::int as students_with_groups,
        COUNT(*) FILTER (WHERE membership_id IS NULL)::int as unassigned_students,
        COUNT(*) FILTER (WHERE membership_status = 'stopped')::int as stopped,
        COUNT(*) FILTER (WHERE membership_status = 'finished')::int as finished,
        (
          SELECT COUNT(*)
          FROM filtered_students fs
          JOIN student_groups sg
            ON sg.student_id = fs.id
           AND sg.branch_id = fs.branch_id
          JOIN groups g
            ON g.id = sg.group_id
           AND g.branch_id = sg.branch_id
          WHERE sg.status = 'active'
            AND g.status IN ('active', 'blocked')
            AND g.class_status = 'started'
            AND COALESCE(g.class_start_date, g.start_date, g.created_at::date) <= CURRENT_DATE
        )::int as active_attendance_students
      FROM student_memberships
    `;
    const statsResult = await pool.query(statsQuery, params);
    const statsRow = statsResult.rows[0] || {};
    const stoppedCount = parseInt(statsRow.stopped || 0, 10);
    const finishedCount = parseInt(statsRow.finished || 0, 10);
    const unassignedCount = parseInt(statsRow.unassigned_students || 0, 10);
    const studentsWithGroupsCount = parseInt(statsRow.students_with_groups || 0, 10);
    const activeAttendanceCount = parseInt(statsRow.active_attendance_students || 0, 10);

    const stats = {
      total_students: parseInt(statsRow.total_students || 0, 10),
      students_with_groups: studentsWithGroupsCount,
      unassigned_students: unassignedCount,
      active_attendance_students: activeAttendanceCount,
      group_memberships: {
        active: activeAttendanceCount,
        stopped: stoppedCount,
        finished: finishedCount
      }
    };
    
    res.json({
      success: true,
      stats: stats,
      students: enrichedStudents,
      pagination: {
        page: pageNumber,
        limit: limitNumber,
        total,
        total_pages: totalPages
      }
    });
    
  } catch (err) {
    console.error('Studentlarni olishda xatolik:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
};

exports.getDuplicateStudents = async (req, res) => {
  try {
    const hasPasswordPlainColumn = await hasUsersColumn('password_plain');

    const studentsResult = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.surname,
         u.username,
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
         ${hasPasswordPlainColumn ? 'u.password_plain as password,' : 'NULL::text as password,'}
         u.subject_id as registered_subject_id,
         sp.name as registered_subject_name,
         u.role
       FROM users u
       LEFT JOIN subjects sp ON u.subject_id = sp.id
       WHERE u.role = 'student'
       ORDER BY u.name, u.surname, u.id`
    );

    const students = studentsResult.rows || [];
    const studentIds = students.map((student) => student.id);
    const groupsByStudent = new Map();

    if (studentIds.length > 0) {
      const allGroupsData = await pool.query(
        `SELECT
           sg.student_id,
           g.id as group_id,
           g.name as group_name,
           g.subject_id,
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
           CASE
             WHEN sg.status = 'finished' THEN sg.left_at
             WHEN sg.status = 'stopped' THEN sg.left_at
             ELSE NULL
           END as status_changed_date,
           TO_CHAR(sg.left_at, 'DD.MM.YYYY') as formatted_left_date,
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
         WHERE sg.student_id = ANY($1::int[])
         ORDER BY sg.joined_at DESC`,
        [studentIds]
      );

      for (const row of allGroupsData.rows) {
        if (!groupsByStudent.has(row.student_id)) {
          groupsByStudent.set(row.student_id, []);
        }
        groupsByStudent.get(row.student_id).push(row);
      }
    }

    const enrichedStudents = students.map((student) => {
      const studentGroups = groupsByStudent.get(student.id) || [];
      const activeGroup = studentGroups.find((group) => group.group_status === 'active') || null;
      const latestClosedGroup = studentGroups.find((group) => group.group_status !== 'active') || null;
      const resolvedReason =
        activeGroup?.group_status === 'active'
          ? null
          : (latestClosedGroup?.left_reason || student.unassigned_reason || null);

      return {
        ...student,
        subject_id: activeGroup?.subject_id || student.registered_subject_id || null,
        subject_name: activeGroup?.subject_name || student.registered_subject_name || null,
        group_id: activeGroup?.group_id || null,
        group_name: activeGroup?.group_name || null,
        group_status: activeGroup?.group_status || null,
        group_status_description: activeGroup?.group_status_description || null,
        teacher_name: activeGroup?.teacher_name || null,
        unassigned_reason: resolvedReason,
        groups: studentGroups.map((group) => ({
          ...group,
          started_at: (group.group_admin_status === 'active' && group.group_class_status === 'started' && group.class_start_date)
            ? group.class_start_date
            : null,
        })),
      };
    });

    const duplicateGroups = buildDuplicateGroups(enrichedStudents);
    const duplicateStudentsCount = duplicateGroups.reduce((sum, group) => sum + group.count, 0);

    return res.json({
      success: true,
      message: 'Takroriy studentlar topildi',
      stats: {
        duplicate_groups: duplicateGroups.length,
        duplicate_students: duplicateStudentsCount,
      },
      groups: duplicateGroups,
    });
  } catch (err) {
    console.error('Duplicate studentlarni olishda xatolik:', err);
    return res.status(500).json({
      success: false,
      message: 'Duplicate studentlarni olishda xatolik',
      error: err.message,
    });
  }
};

// Student o'zi qatnashayotgan guruhlarni olish
// ESKIROQ VERSIYA - OLIB TASHLANDI
// Eski getMyGroups funksiyasi o'rniga 614-qatordagi yangi versiya ishlatiladi

// 5. Student'ning aniq guruh ma'lumotlari va dars holati (Teacher telefon, guruh price va a'zolar bilan)
exports.getMyGroupInfo = async (req, res) => {
    const student_id = req.user.id; // JWT token'dan student ID
    const { group_id } = req.params; // URL'dan guruh ID
    
    try {
        // Student bu guruhga a'zo ekanligini tekshirish
        const membershipCheck = await pool.query(`
            SELECT sg.id FROM student_groups sg 
            WHERE sg.student_id = $1
              AND sg.group_id = $2
              AND sg.status IN ('active', 'stopped', 'finished')
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
                    classStartDate: formatDateToYmd(studentData.class_start_date),
                    plannedStartDate: formatDateToYmd(studentData.planned_start_date),
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

// Ball tarixi student_id bo'yicha yig'iladi — student guruhdan guruhga
// o'tsa ham, guruh/teacher o'chirilsa ham tarix yo'qolmaydi (guruh nomi
// metadata snapshotidan tiklanadi). month='all' butun o'qish davri.
const buildStudentPointHistory = async (studentId, { month, groupId } = {}) => {
    const isAllTime = String(month || '').trim().toLowerCase() === 'all';
    const monthKey = isAllTime ? null : buildMonthFilter(month);
    const entries = await loadStudentPointHistoryEntries({
        studentId,
        month: monthKey || 'all',
        groupId,
    });

    const summary = {
        total_points: 0,
        total_events: entries.length,
        attendance_events: 0,
        manual_events: 0,
        first_event_date: null,
        last_event_date: null,
        monthly_cap: MONTHLY_POINT_CAP,
    };

    const breakdownMap = new Map();
    const monthlyMap = new Map();
    const teacherMap = new Map();
    const dailyMap = new Map();

    for (const entry of entries) {
        summary.total_points += entry.points;
        if (entry.source_type === 'attendance') summary.attendance_events += 1;
        if (entry.source_type === 'bonus' || entry.source_type === 'report') {
            summary.manual_events += 1;
        }

        if (!summary.first_event_date || entry.day_key < summary.first_event_date) {
            summary.first_event_date = entry.day_key;
        }
        if (!summary.last_event_date || entry.day_key > summary.last_event_date) {
            summary.last_event_date = entry.day_key;
        }

        const breakdownKey = `${entry.group_id}`;
        if (!breakdownMap.has(breakdownKey)) {
            breakdownMap.set(breakdownKey, {
                group_id: entry.group_id,
                group_name: entry.group_name || 'Guruh',
                total_points: 0,
                total_events: 0,
            });
        }
        const breakdownItem = breakdownMap.get(breakdownKey);
        breakdownItem.total_points += entry.points;
        breakdownItem.total_events += 1;

        if (!monthlyMap.has(entry.month_name)) {
            monthlyMap.set(entry.month_name, {
                month_name: entry.month_name,
                total_points: 0,
                total_events: 0,
            });
        }
        const monthlyItem = monthlyMap.get(entry.month_name);
        monthlyItem.total_points += entry.points;
        monthlyItem.total_events += 1;

        // Kim harakatni bajargani (masalan admin davomat belgilagan)
        // emas, balki guruhning HAQIQIY (biriktirilgan) o'qituvchisi
        // nomidan ko'rsatamiz — shu bilan bir guruhning davomat va
        // hisobot ballari bitta to'g'ri o'qituvchi ostida birlashadi.
        const attributedTeacherId = entry.group_teacher_id ?? entry.created_by;
        const attributedTeacherName = entry.group_teacher_name || entry.created_by_name;
        const teacherKey = `${entry.month_name}:${attributedTeacherId ?? 'null'}:${attributedTeacherName}`;
        if (!teacherMap.has(teacherKey)) {
            teacherMap.set(teacherKey, {
                month_name: entry.month_name,
                teacher_id: attributedTeacherId,
                teacher_name: attributedTeacherName || 'Noma\'lum',
                total_points: 0,
                total_events: 0,
            });
        }
        const teacherItem = teacherMap.get(teacherKey);
        teacherItem.total_points += entry.points;
        teacherItem.total_events += 1;

        const dailyKey = entry.day_key;
        if (!dailyMap.has(dailyKey)) {
            dailyMap.set(dailyKey, {
                day_key: dailyKey,
                total_points: 0,
                total_events: 0,
                first_time: entry.created_time,
                last_time: entry.created_time,
            });
        }
        const dailyItem = dailyMap.get(dailyKey);
        dailyItem.total_points += entry.points;
        dailyItem.total_events += 1;
        if (entry.created_time < dailyItem.first_time) dailyItem.first_time = entry.created_time;
        if (entry.created_time > dailyItem.last_time) dailyItem.last_time = entry.created_time;
    }

    const breakdown = [...breakdownMap.values()].sort(
        (a, b) => b.total_points - a.total_points || a.group_name.localeCompare(b.group_name)
    );
    const monthlyBreakdown = [...monthlyMap.values()].sort(
        (a, b) => b.month_name.localeCompare(a.month_name)
    );
    const teacherBreakdown = [...teacherMap.values()].sort(
        (a, b) => b.month_name.localeCompare(a.month_name) || b.total_points - a.total_points
    );
    const dailyBreakdown = [...dailyMap.values()].sort(
        (a, b) => b.day_key.localeCompare(a.day_key)
    );

    return {
        month: isAllTime ? 'all' : monthKey,
        filter: {
            group_id: groupId || null,
        },
        summary,
        breakdown,
        monthly_breakdown: monthlyBreakdown,
        teacher_breakdown: teacherBreakdown,
        daily_breakdown: dailyBreakdown,
        events: entries,
    };
};

exports.getMyPointReports = async (req, res) => {
    try {
        const studentId = req.user.id;
        const groupId = req.query.group_id ? parseInt(req.query.group_id) : null;

        const responseData = await buildStudentPointHistory(studentId, {
            month: req.query.month,
            groupId,
        });

        res.json({
            success: true,
            message: 'Ballar tarixi muvaffaqiyatli olindi',
            data: responseData
        });
    } catch (error) {
        console.error('❌ Student ballar tarixini olishda xato:', error);
        res.status(500).json({
            success: false,
            message: 'Ballar tarixini olishda xatolik yuz berdi',
            error: error.message
        });
    }
};

// Admin/teacher uchun: studentning butun o'qish davomidagi ball tarixi.
// Teacher faqat o'z guruhidagi (hozirgi a'zolik) studentni ko'ra oladi,
// lekin tarixning o'zi barcha guruh/teacherlar bo'yicha to'liq qaytadi.
exports.getStudentPointHistory = async (req, res) => {
    try {
        const { role, id: actorId } = req.user;
        const studentId = parseInt(req.params.id);
        const groupId = req.query.group_id ? parseInt(req.query.group_id) : null;

        if (Number.isNaN(studentId)) {
            return res.status(400).json({
                success: false,
                message: 'student id son bo\'lishi kerak'
            });
        }

        const studentCheck = await pool.query(
            'SELECT id, name, surname FROM users WHERE id = $1 AND role = $2',
            [studentId, 'student']
        );
        if (studentCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Student topilmadi'
            });
        }

        if (role === 'teacher') {
            const accessCheck = await pool.query(
                `SELECT 1
                 FROM student_groups sg
                 JOIN groups g ON g.id = sg.group_id
                 WHERE sg.student_id = $1 AND g.teacher_id = $2
                 LIMIT 1`,
                [studentId, actorId]
            );
            if (accessCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Siz faqat o\'z guruhingizdagi studentlar tarixini ko\'ra olasiz'
                });
            }
        }

        const responseData = await buildStudentPointHistory(studentId, {
            month: req.query.month || 'all',
            groupId,
        });

        res.json({
            success: true,
            message: 'Ballar tarixi muvaffaqiyatli olindi',
            data: {
                student: studentCheck.rows[0],
                ...responseData,
            }
        });
    } catch (error) {
        console.error('❌ Student ball tarixini olishda xato:', error);
        res.status(500).json({
            success: false,
            message: 'Ballar tarixini olishda xatolik yuz berdi',
            error: error.message
        });
    }
};

/**
 * Studentning oylik to'lovlari (faqat o'zi uchun)
 * Query:
 *  - month (optional, YYYY-MM) default: joriy oy
 *  - group_id (optional)
 */
exports.getMyMonthlyPayments = async (req, res) => {
    try {
        const studentId = req.user.id;
        const { month, group_id } = req.query;
        const targetMonth = month || new Date().toISOString().slice(0, 7);

        if (!/^\d{4}-\d{2}$/.test(targetMonth)) {
            return res.status(400).json({
                success: false,
                message: "month YYYY-MM formatida bo'lishi kerak"
            });
        }

        let groupIdFilter = null;
        if (group_id !== undefined) {
            groupIdFilter = parseInt(group_id, 10);
            if (Number.isNaN(groupIdFilter)) {
                return res.status(400).json({
                    success: false,
                    message: "group_id raqam bo'lishi kerak"
                });
            }
        }

        const params = [studentId, targetMonth];
        let groupClause = '';
        if (groupIdFilter !== null) {
            params.push(groupIdFilter);
            groupClause = ` AND ms.group_id = $${params.length}`;
        }

        const groupsQuery = `
            SELECT
                ms.group_id,
                ms.group_name,
                ms.subject_name,
                COALESCE(ms.teacher_name, 'Biriktirilmagan') as teacher_name,
                ms.monthly_status as student_group_status,
                COALESCE(ms.required_amount, g.price, 0) as required_amount,
                COALESCE(ms.paid_amount, 0) as paid_amount,
                COALESCE(ms.discount_amount, 0) as discount_amount,
                COALESCE(ms.debt_amount, 0) as debt_amount,
                COALESCE(ms.payment_status, 'unpaid') as payment_status,
                TO_CHAR(ms.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date,
                COALESCE(tx.transactions_count, 0) as transactions_count,
                COALESCE(tx.transactions_total, 0) as transactions_total
            FROM monthly_snapshots ms
            LEFT JOIN groups g ON g.id = ms.group_id
            LEFT JOIN (
                SELECT
                    pt.group_id,
                    COUNT(*) as transactions_count,
                    COALESCE(SUM(pt.amount), 0) as transactions_total
                FROM payment_transactions pt
                WHERE pt.student_id = $1 AND pt.month = $2
                GROUP BY pt.group_id
            ) tx ON tx.group_id = ms.group_id
            WHERE ms.student_id = $1
              AND ms.month = $2
              ${groupClause}
            ORDER BY ms.group_name
        `;

        const groupsResult = await pool.query(groupsQuery, params);

        const txParams = [studentId, targetMonth];
        let txGroupClause = '';
        if (groupIdFilter !== null) {
            txParams.push(groupIdFilter);
            txGroupClause = ` AND pt.group_id = $${txParams.length}`;
        }

        const transactionsQuery = `
            SELECT
                pt.id,
                pt.group_id,
                g.name as group_name,
                pt.amount,
                pt.payment_method,
                pt.description,
                TO_CHAR(pt.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as paid_at
            FROM payment_transactions pt
            LEFT JOIN groups g ON g.id = pt.group_id
            WHERE pt.student_id = $1 AND pt.month = $2
            ${txGroupClause}
            ORDER BY pt.created_at DESC
        `;

        const transactionsResult = await pool.query(transactionsQuery, txParams);

        const summary = groupsResult.rows.reduce((acc, row) => {
            acc.required_amount_total += parseFloat(row.required_amount || 0);
            acc.paid_amount_total += parseFloat(row.paid_amount || 0);
            acc.discount_amount_total += parseFloat(row.discount_amount || 0);
            acc.debt_amount_total += parseFloat(row.debt_amount || 0);
            acc.transactions_count_total += parseInt(row.transactions_count || 0, 10);
            return acc;
        }, {
            required_amount_total: 0,
            paid_amount_total: 0,
            discount_amount_total: 0,
            debt_amount_total: 0,
            transactions_count_total: 0
        });

        const hasRows = groupsResult.rows.length > 0;

        res.json({
            success: true,
            message: hasRows
                ? "Oylik to'lov ma'lumotlari muvaffaqiyatli olindi"
                : `${targetMonth} oy uchun To'lov jadvali topilmadi`,
            data: {
                student_id: studentId,
                month: targetMonth,
                summary,
                groups: groupsResult.rows,
                transactions: transactionsResult.rows
            }
        });

    } catch (error) {
        console.error("❌ Student oylik to'lovlarini olishda xato:", error);
        res.status(500).json({
            success: false,
            message: "Oylik to'lovlarni olishda xatolik yuz berdi",
            error: error.message
        });
    }
};

/**
 * Studentning o'zi qo'shilgan guruhlar ro'yxati
 */
exports.getMyGroups = async (req, res) => {
    try {
        const studentId = req.user.id;
        const currentMonth = getCurrentMonthKey();
        const requestedMonth = buildMonthFilter(req.query.month);
        const targetMonth = requestedMonth || currentMonth;
        const isCurrentMonth = targetMonth === currentMonth;
        const monthStart = `${targetMonth}-01`;

        console.log(`🎓 Student ${studentId} o'z guruhlarini so'ramoqda`);

        const myGroups = await pool.query(`
            SELECT
                g.id as group_id,
                g.name as group_name,
                g.unique_code,
                g.price,
                g.schedule,
                s.name as subject_name,
                u.name || ' ' || u.surname as teacher_name,
                u.phone as teacher_phone,
                r.room_number,
                
                -- Student guruh ma'lumotlari
                sg.status as my_status,
                TO_CHAR(sg.joined_at, 'DD.MM.YYYY') as my_join_date,
                TO_CHAR(sg.left_at, 'DD.MM.YYYY') as my_leave_date,
                
                -- Guruh umumiy ma'lumotlari
                g.status as group_status,
                g.class_status,
                TO_CHAR(g.start_date, 'DD.MM.YYYY') as group_start_date,
                TO_CHAR(g.created_at, 'DD.MM.YYYY') as group_created_date,
                
                -- Guruh a'zolari soni
                (
                    SELECT COUNT(*) 
                    FROM student_groups sg2 
                    WHERE sg2.group_id = g.id AND sg2.status = 'active'
                ) as total_students
                
            FROM student_groups sg
            JOIN groups g ON sg.group_id = g.id
            JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN users u ON g.teacher_id = u.id
            LEFT JOIN rooms r ON g.room_id = r.id
            
            WHERE sg.student_id = $1
              ${
                isCurrentMonth
                  ? `AND sg.status = 'active'`
                  : `AND DATE(sg.joined_at) <= (DATE($2) + INTERVAL '1 month - 1 day')
                      AND (sg.left_at IS NULL OR DATE(sg.left_at) >= DATE($2))`
              }
            ORDER BY 
                CASE sg.status 
                    WHEN 'active' THEN 1
                    WHEN 'stopped' THEN 2  
                    WHEN 'finished' THEN 3
                    ELSE 4
                END,
                g.name
        `, isCurrentMonth ? [studentId] : [studentId, monthStart]);

        const groupsData = myGroups.rows.map(group => ({
                group_id: group.group_id,
                group_info: {
                id: group.group_id,
                name: group.group_name,
                unique_code: group.unique_code,
                price: parseFloat(group.price),
                status: group.group_status,
                class_status: group.class_status,
                start_date: group.group_start_date,
                created_date: group.group_created_date,
                total_students: parseInt(group.total_students),
                schedule: group.schedule || null,
                available_months: buildAvailableMonthKeys(
                    group.my_join_date,
                    group.my_leave_date
                ),
                monthly_points: 0,
                monthly_rank: 0,
                group_max_points: 0,
                last_point_date: null,
                last_day_points: 0
            },
            subject_info: {
                name: group.subject_name
            },
            teacher_info: {
                name: group.teacher_name,
                phone: group.teacher_phone
            },
            room_info: {
                room_number: group.room_number || 'Tayinlanmagan'
            },
            my_status: {
                status: group.my_status,
                join_date: group.my_join_date,
                leave_date: group.my_leave_date,
                monthly_points: 0,
                monthly_rank: 0
            }
        }));

        const groupIds = groupsData.map((group) => group.group_id);
        const monthlyStats = await loadMonthlyGroupMemberStats({
            groupIds,
            month: currentMonth,
        });
        const statsByGroup = new Map();
        for (const stat of monthlyStats) {
            if (!statsByGroup.has(stat.group_id)) {
                statsByGroup.set(stat.group_id, []);
            }
            statsByGroup.get(stat.group_id).push(stat);
        }

        const updatedGroupsData = groupsData.map((group) => {
            const stats = statsByGroup.get(group.group_id) || [];
            const sorted = [...stats].sort(
                (a, b) => b.month_points - a.month_points || a.student_id - b.student_id
            );
            const currentUserStat = stats.find((stat) => stat.student_id === studentId) || {
                month_points: 0,
                last_point_day: null,
                last_day_points: 0,
            };
            const rank = sorted.findIndex((stat) => stat.student_id === studentId);
            const groupMaxPoints = sorted[0]?.month_points || 0;

            return {
                ...group,
                group_info: {
                    ...group.group_info,
                    monthly_points: currentUserStat.month_points,
                    monthly_rank: rank >= 0 ? rank + 1 : 0,
                    group_max_points: groupMaxPoints,
                    last_point_date: formatDateDdMmYyyy(currentUserStat.last_point_day),
                    last_day_points: currentUserStat.last_day_points,
                },
                my_status: {
                    ...group.my_status,
                    monthly_points: currentUserStat.month_points,
                    monthly_rank: rank >= 0 ? rank + 1 : 0,
                },
            };
        });

        console.log(`✅ Student ${studentId} ning ${groupsData.length}ta guruhi topildi`);

        res.json({
            success: true,
            message: 'Guruhlar ro\'yxati muvaffaqiyatli olindi',
            data: {
                student_id: studentId,
                total_groups: updatedGroupsData.length,
                groups: updatedGroupsData
            }
        });

    } catch (error) {
        console.error('❌ Student guruhlarini olishda xato:', error);
        res.status(500).json({
            success: false,
            message: 'Guruhlar ro\'yxatini olishda xatolik yuz berdi',
            error: error.message
        });
    }
};

/**
 * Muayyan guruh haqida batafsil ma'lumot
 */
exports.getMyGroupInfo = async (req, res) => {
    try {
        const studentId = req.user.id;
        const groupId = parseInt(req.params.group_id);
        // Ball tizimi oyma-oy — mobil ilova ?month=YYYY-MM bilan istalgan oyni so'rashi mumkin
        const currentMonth = buildMonthFilter(req.query.month);

        console.log(`📚 Student ${studentId} guruh ${groupId} ma'lumotlarini so'ramoqda (oy: ${currentMonth})`);

        // Avval student shu guruhda borligini tekshirish
        const membershipCheck = await pool.query(`
            SELECT sg.status 
            FROM student_groups sg 
            WHERE sg.student_id = $1 AND sg.group_id = $2
        `, [studentId, groupId]);

        if (membershipCheck.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Siz ushbu guruhga a\'zo emassiz'
            });
        }

        // Guruh to'liq ma'lumotlari va student qo'shilgan sana
        const groupInfo = await pool.query(`
            SELECT 
                g.id,
                g.name,
                g.unique_code,
                g.price,
                g.status as group_status,
                g.class_status,
                TO_CHAR(g.start_date, 'DD.MM.YYYY') as start_date,
                COALESCE(
                    TO_CHAR(g.created_at, 'DD.MM.YYYY'),
                    TO_CHAR(g.start_date, 'DD.MM.YYYY'),
                    TO_CHAR(sg.joined_at, 'DD.MM.YYYY')
                ) as created_date,
                TO_CHAR(sg.joined_at, 'DD.MM.YYYY') as student_joined_date,
                TO_CHAR(sg.left_at, 'DD.MM.YYYY') as student_left_date,
                g.schedule,
                s.name as subject_name,
                u.name || ' ' || u.surname as teacher_name,
                u.phone as teacher_phone
            FROM groups g
            JOIN subjects s ON g.subject_id = s.id
            LEFT JOIN users u ON g.teacher_id = u.id
            JOIN student_groups sg ON g.id = sg.group_id AND sg.student_id = $2
            WHERE g.id = $1
        `, [groupId, studentId]);

        if (groupInfo.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Guruh topilmadi'
            });
        }

        // Guruh a'zolari (guruh doshlari)
        const groupmates = await pool.query(`
            WITH latest_memberships AS (
                SELECT DISTINCT ON (sg.student_id)
                    sg.id,
                    sg.student_id,
                    sg.group_id,
                    sg.status,
                    sg.joined_at,
                    sg.left_at,
                    sg.branch_id
                FROM student_groups sg
                WHERE sg.group_id = $1
                ORDER BY
                    sg.student_id,
                    COALESCE(sg.left_at, sg.joined_at) DESC NULLS LAST,
                    sg.joined_at DESC NULLS LAST,
                    sg.id DESC
            )
            SELECT 
                u.id,
                u.name,
                u.surname,
                u.phone,
                u.avatar_key,
                pa.name as avatar_name,
                pa.image_path as avatar_url,
                sg.status,
                TO_CHAR(sg.joined_at, 'DD.MM.YYYY') as join_date,
                TO_CHAR(sg.left_at, 'DD.MM.YYYY') as leave_date,
                CASE 
                    WHEN sg.status = 'active' THEN 'Faol'
                    WHEN sg.status = 'stopped' THEN 'Toʻxtatgan'
                    WHEN sg.status = 'finished' THEN 'Bitirgan'
                    ELSE 'Nomaʻlum'
                END as status_description
            FROM latest_memberships sg
            JOIN users u ON sg.student_id = u.id
            LEFT JOIN profile_avatars pa
              ON LOWER(BTRIM(COALESCE(u.avatar_key, ''))) = LOWER(BTRIM(COALESCE(pa.avatar_key, '')))
             AND pa.branch_id = u.branch_id
            WHERE sg.status = 'active'
            ORDER BY u.surname, u.name, u.id
        `, [groupId]);

        // Mening to'lov ma'lumotlarim
        const myPayment = await pool.query(`
            SELECT 
                sp.required_amount,
                COALESCE(sp.paid_amount, 0) as paid_amount,
                TO_CHAR(sp.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date,
                CASE 
                    WHEN COALESCE(sp.paid_amount, 0) >= COALESCE(sp.required_amount, g.price) THEN 'paid'
                    WHEN COALESCE(sp.paid_amount, 0) > 0 THEN 'partial'
                    ELSE 'unpaid'
                END as payment_status
                
            FROM groups g
            LEFT JOIN student_payments sp ON sp.student_id = $1 
                                          AND sp.group_id = g.id 
                                          AND sp.month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
            WHERE g.id = $2
        `, [studentId, groupId]);

        const lessonReports = await pool.query(`
            SELECT
                r.id,
                r.lesson_id,
                r.group_id,
                r.teacher_id,
                r.subject_id,
                r.report_month,
                r.lesson_date,
                r.lesson_start_time,
                r.lesson_end_time,
                r.homework,
                r.vocabulary,
                r.attendance,
                r.participation,
                r.total,
                r.percent,
                r.feedback,
                r.report_data,
                r.created_at,
                r.updated_at,
                TO_CHAR(r.created_at, 'DD.MM.YYYY HH24:MI') AS created_at_label,
                TO_CHAR(r.updated_at, 'DD.MM.YYYY HH24:MI') AS updated_at_label,
                COALESCE(t.name, '') AS teacher_name,
                COALESCE(t.surname, '') AS teacher_surname,
                COALESCE(s.name, gs.name, '') AS subject_name,
                g.name AS group_name
            FROM teacher_lesson_statistics_reports r
            JOIN groups g ON g.id = r.group_id
            LEFT JOIN users t ON t.id = r.teacher_id
            LEFT JOIN subjects s ON s.id = r.subject_id
            LEFT JOIN subjects gs ON gs.id = g.subject_id
            WHERE r.group_id = $1
              AND COALESCE(NULLIF(r.report_month, ''), TO_CHAR(r.lesson_date::date, 'YYYY-MM')) = $2
            ORDER BY r.lesson_date DESC, r.lesson_start_time DESC, r.id DESC
        `, [groupId, currentMonth]);

        const group = groupInfo.rows[0];
        const payment = myPayment.rows[0];
        const memberStats = await loadMonthlyGroupMemberStats({
            groupIds: [groupId],
            month: currentMonth,
        });
        const statsByStudentId = new Map(
            memberStats.map((stat) => [stat.student_id, stat])
        );
        const sortedStats = [...memberStats].sort(
            (a, b) => b.month_points - a.month_points || a.student_id - b.student_id
        );
        const currentUserStat = statsByStudentId.get(studentId) || {
            month_points: 0,
            last_point_day: null,
            last_day_points: 0,
        };
        const currentRank = sortedStats.findIndex((stat) => stat.student_id === studentId);
        const topPoints = sortedStats[0]?.month_points || 0;

        const mappedGroupmates = groupmates.rows
            .map((mate) => {
                const stat = statsByStudentId.get(mate.id) || {
                    month_points: 0,
                    last_point_day: null,
                    last_day_points: 0,
                };
                return {
                    id: mate.id,
                    full_name: `${mate.name} ${mate.surname}`,
                    name: mate.name,
                    surname: mate.surname,
                    phone: mate.phone,
                    avatar_key: mate.avatar_key,
                    avatar_name: mate.avatar_name,
                    avatar_url: buildImageUrl(mate.avatar_url),
                    status: mate.status,
                    status_description: mate.status_description,
                    join_date: mate.join_date,
                    leave_date: mate.leave_date,
                    monthly_points: stat.month_points,
                    rank_in_group:
                        sortedStats.findIndex((statItem) => statItem.student_id === mate.id) + 1 || 0,
                };
            })
            .sort(
                (a, b) =>
                    b.monthly_points - a.monthly_points ||
                    a.surname.localeCompare(b.surname) ||
                    a.name.localeCompare(b.name) ||
                    a.id - b.id
            );

        const responseData = {
            month: currentMonth,
            group_details: {
                id: group.id,
                name: group.name,
                unique_code: group.unique_code,
                price: parseFloat(group.price),
                status: group.group_status,
                class_status: group.class_status,
                start_date: group.start_date,
                created_date: group.created_date,
                student_joined_date: group.student_joined_date,
                student_left_date: group.student_left_date,
                schedule: group.schedule || null,
                available_months: buildAvailableMonthKeys(
                    group.student_joined_date,
                    group.student_left_date
                )
            },
                subject: {
                    name: group.subject_name
                },
                teacher: {
                    name: group.teacher_name,
                phone: group.teacher_phone
            },
            group_statistics: {
                total_members: mappedGroupmates.length,
                active_members: mappedGroupmates.filter(m => m.status === 'active').length,
                monthly_points: currentUserStat.month_points || 0,
                top_points: topPoints
            },
            my_rating: {
                monthly_points: currentUserStat.month_points || 0,
                rank_in_group: currentRank >= 0 ? currentRank + 1 : 0
            },
            lesson_reports: lessonReports.rows.map((report) => {
                // Reuses the teacher-side payload builder so students/parents see the
                // same Uzbek-enforced column labels and computed totals/rows, instead
                // of raw report_data where a teacher's custom column label (and any
                // custom columns beyond the 4 defaults) would otherwise be dropped.
                const normalized = buildReportPayload(report);
                return {
                    id: report.id,
                    lesson_id: report.lesson_id,
                    group_id: report.group_id,
                    teacher_id: report.teacher_id,
                    subject_id: report.subject_id,
                    report_month: report.report_month,
                    lesson_date: report.lesson_date,
                    lesson_start_time: report.lesson_start_time,
                    lesson_end_time: report.lesson_end_time,
                    homework: report.homework,
                    vocabulary: report.vocabulary,
                    attendance: report.attendance,
                    participation: report.participation,
                    total: report.total,
                    percent: report.percent,
                    feedback: report.feedback,
                    report_data: report.report_data,
                    created_at: report.created_at,
                    updated_at: report.updated_at,
                    created_at_label: report.created_at_label,
                    updated_at_label: report.updated_at_label,
                    teacher_name: [report.teacher_surname, report.teacher_name]
                        .filter((part) => String(part || '').trim().length > 0)
                        .join(' ')
                        .trim(),
                    subject_name: report.subject_name,
                    group_name: report.group_name,
                    columns: normalized.columns,
                    rows: normalized.rows,
                    grading_enabled: normalized.grading_enabled,
                };
            }),
            groupmates: mappedGroupmates
        };

        console.log(`✅ Guruh ${groupId} ma'lumotlari ${groupmates.rows.length} a'zo bilan yuborildi`);

        res.json({
            success: true,
            message: 'Guruh ma\'lumotlari muvaffaqiyatli olindi',
            data: responseData
        });

    } catch (error) {
        console.error('❌ Guruh ma\'lumotlarini olishda xato:', error);
        res.status(500).json({
            success: false,
            message: 'Guruh ma\'lumotlarini olishda xatolik yuz berdi',
            error: error.message
        });
    }
};
