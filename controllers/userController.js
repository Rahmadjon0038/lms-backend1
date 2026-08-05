const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:5000';
const { 
    addSubjectToTeacher, 
    getTeacherSubjects, 
    removeSubjectFromTeacher,
    getTeachersBySubject
} = require('../models/teacherSubjectModel');
const { getScopedBranchId, getUserBranchId } = require('../utils/branch');

// Yordamchi funksiya: Access Token yaratish (15 minutlik)
const generateAccessToken = (user) => {
    return jwt.sign(
        { id: user.id, role: user.role, branch_id: user.branch_id || 1 },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );
};

// Yordamchi funksiya: Refresh Token yaratish (7 kunlik)
const generateRefreshToken = (user) => {
    return jwt.sign(
        { id: user.id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: '30d' }
    );
};

const generatePlainRecoveryKey = () => {
    return `RK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

const generateSixDigitPassword = () => String(Math.floor(100000 + Math.random() * 900000));

const hashRecoveryKey = (username, recoveryKey) => {
    const pepper = process.env.PASSWORD_RESET_PEPPER || process.env.JWT_SECRET || 'default-pepper';
    return crypto
        .createHash('sha256')
        .update(`${String(username).trim()}::${String(recoveryKey).trim()}::${pepper}`)
        .digest('hex');
};

const hashPassword = async (password) => {
    const plain = String(password ?? '').trim();
    if (!plain) {
        throw new Error('password majburiy');
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(plain, salt);
    return { plain, hashed };
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

const ensureRecoveryKeysForRole = async (role) => {
    const usersResult = await pool.query(
        `SELECT id, username
         FROM users
         WHERE role = $1
           AND (password_reset_key_plain IS NULL OR password_reset_key_hash IS NULL)`,
        [role]
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

const isValidMonthName = (value) => typeof value === 'string' && /^\d{4}-\d{2}$/.test(value.trim());

const normalizeDateValue = (value) => {
    if (!value) return null;
    try {
        return new Date(value).toISOString().split('T')[0];
    } catch (_err) {
        return null;
    }
};

const normalizeUsername = (value) => {
    if (value === undefined || value === null) return '';
    return String(value).trim();
};

const normalizeAgeValue = (age) => {
    const normalizedAgeInput = typeof age === 'string' ? age.trim() : age;
    if (normalizedAgeInput === undefined || normalizedAgeInput === null || normalizedAgeInput === '') {
        return { value: null, error: null };
    }
    const normalizedAge = Number(normalizedAgeInput);
    if (!Number.isInteger(normalizedAge)) {
        return { value: null, error: "age butun son bo'lishi kerak" };
    }
    return { value: normalizedAge, error: null };
};

const profileSelectColumns = `
    u.id,
    u.branch_id,
    b.name AS branch_name,
    u.name,
    u.surname,
    u.username,
    u.role,
    u.status,
    u.phone,
    u.phone2,
    u.father_name,
    u.father_phone,
    u.address,
    u.age,
    u.avatar_key,
    CASE
      WHEN pa.image_path IS NULL THEN NULL
      WHEN pa.image_path ~ '^https?://' THEN pa.image_path
      ELSE CONCAT('${PUBLIC_BASE_URL}', pa.image_path)
    END AS avatar_url,
    pa.name AS avatar_name,
    u.subject,
    u.start_date,
    u.end_date,
    u.certificate,
    u.has_experience,
    u.experience_years,
    u.experience_place,
    u.available_times,
    u.work_days_hours,
    u.created_at,
    g.id as group_id,
    g.name as group_name,
    g.status as group_status,
    r.room_number,
    r.capacity as room_capacity,
    r.has_projector,
    COALESCE(s.name, ss.name) as subject_name,
    CONCAT(t.name, ' ', t.surname) as teacher_name
`;

const loginSelectColumns = `
    ${profileSelectColumns},
    u.password,
    u.password_plain
`;

const generateUniqueUsername = async (baseUsername, usedUsernames, branchId = 1) => {
    const base = normalizeUsername(baseUsername);
    if (!base) {
        throw new Error("username majburiy");
    }
    let candidate = base;
    let counter = 1;

    while (true) {
        if (!usedUsernames.has(candidate)) {
            const exists = await pool.query(
                'SELECT 1 FROM users WHERE username = $1 AND branch_id = $2',
                [candidate, branchId]
            );
            if (exists.rows.length === 0) {
                usedUsernames.add(candidate);
                return candidate;
            }
        }
        candidate = `${base}_${counter}`;
        counter += 1;
        if (counter > 10000) {
            throw new Error("username uchun unikal variant topilmadi");
        }
    }
};

const resolveAdmissionAdmin = async ({ req, branchId, admittedBy, admittedByName }) => {
    const requestedAdminId = Number(admittedBy);
    if (Number.isInteger(requestedAdminId) && requestedAdminId > 0) {
        const adminResult = await pool.query(
            `SELECT id, name, surname
             FROM users
             WHERE id = $1
               AND role = 'admin'
               AND branch_id = $2`,
            [requestedAdminId, branchId]
        );

        if (adminResult.rows.length === 0) {
            return { error: 'Tanlangan admin topilmadi' };
        }

        const admin = adminResult.rows[0];
        return {
            admittedById: admin.id,
            admittedByName: `${admin.name || ''} ${admin.surname || ''}`.trim() || String(admittedByName || '').trim() || null
        };
    }

    const actorResult = await pool.query(
        `SELECT id, name, surname
         FROM users
         WHERE id = $1
           AND branch_id = $2`,
        [req.user?.id, branchId]
    );

    if (actorResult.rows.length === 0) {
        return { error: 'Qabul qiluvchi foydalanuvchi topilmadi' };
    }

    const actor = actorResult.rows[0];
    return {
        admittedById: actor.id,
        admittedByName: `${actor.name || ''} ${actor.surname || ''}`.trim() || null
    };
};

// 1. Student ro'yxatdan o'tishi (Yangi maydonlar bilan)
const registerStudent = async (req, res) => {
    const { name, surname, username, password, phone, phone2, father_name, father_phone, address, age, subject_id, admitted_by, admitted_by_name } = req.body;
    try {
        const branchId = getUserBranchId(req.user);
        const { value: normalizedAge, error: ageError } = normalizeAgeValue(age);
        if (ageError) {
            return res.status(400).json({ message: ageError });
        }
        const normalizedSubjectId = Number(subject_id);
        if (!Number.isInteger(normalizedSubjectId) || normalizedSubjectId <= 0) {
            return res.status(400).json({ message: "subject_id majburiy va butun son bo'lishi kerak" });
        }

        const userExists = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND branch_id = $2',
            [username, branchId]
        );
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: "Bu username allaqachon mavjud!" });
        }

        const subjectResult = await pool.query(
            'SELECT id, name FROM subjects WHERE id = $1 AND branch_id = $2',
            [normalizedSubjectId, branchId]
        );
        if (subjectResult.rows.length === 0) {
            return res.status(400).json({ message: "Tanlangan fan topilmadi" });
        }
        const selectedSubject = subjectResult.rows[0];
        const admissionAdmin = await resolveAdmissionAdmin({
            req,
            branchId,
            admittedBy: admitted_by,
            admittedByName: admitted_by_name,
        });
        if (admissionAdmin.error) {
            return res.status(400).json({ message: admissionAdmin.error });
        }

        const finalPassword = String(password ?? '').trim() || generateSixDigitPassword();
        const { plain: passwordPlain, hashed: hashedPassword } = await hashPassword(finalPassword);

        const recoveryKey = generatePlainRecoveryKey();
        const recoveryKeyHash = hashRecoveryKey(username, recoveryKey);

        const newUser = await pool.query(
            `INSERT INTO users (
                name, surname, username, password, password_plain, phone, phone2, father_name, father_phone, address, age, subject, subject_id,
                branch_id,
                admitted_by, admitted_by_name,
                unassigned_reason, password_reset_key_plain, password_reset_key_hash, password_reset_key_rotated_at
            ) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP) 
             RETURNING id, branch_id, name, surname, username, role, father_name, father_phone, address, age, subject_id, admitted_by, admitted_by_name`,
            [
                name,
                surname,
                username,
                hashedPassword,
                passwordPlain,
                phone,
                phone2,
                father_name,
                father_phone,
                address,
                normalizedAge,
                selectedSubject.name,
                normalizedSubjectId,
                branchId,
                admissionAdmin.admittedById,
                admissionAdmin.admittedByName,
                "Yangi qo'shilgan",
                recoveryKey,
                recoveryKeyHash
            ]
        );

        res.status(201).json({
            message: "Muvaffaqiyatli ro'yxatdan o'tdingiz",
            user: newUser.rows[0],
            selected_subject: selectedSubject,
            recovery_key: recoveryKey,
            generated_password: passwordPlain
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const registerStudentsBulk = async (req, res) => {
    const students = Array.isArray(req.body) ? req.body : req.body?.students;
    if (!Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ message: "students array majburiy" });
    }

    try {
        const branchId = getUserBranchId(req.user);
        const subjectIds = [
            ...new Set(
                students
                    .map((student) => Number(student?.subject_id))
                    .filter((subjectId) => Number.isInteger(subjectId) && subjectId > 0)
            )
        ];

        const subjectsResult = subjectIds.length
            ? await pool.query(
                'SELECT id, name FROM subjects WHERE id = ANY($1) AND branch_id = $2',
                [subjectIds, branchId]
              )
            : { rows: [] };
        const subjectMap = new Map(subjectsResult.rows.map((row) => [row.id, row]));
        const admissionAdmin = await resolveAdmissionAdmin({
            req,
            branchId,
            admittedBy: req.body?.admitted_by,
            admittedByName: req.body?.admitted_by_name,
        });
        if (admissionAdmin.error) {
            return res.status(400).json({ message: admissionAdmin.error });
        }

        const usedUsernames = new Set();
        const created = [];
        const failed = [];

        for (let index = 0; index < students.length; index += 1) {
            const student = students[index] || {};
            const name = student.name;
            const surname = student.surname;
            const username = normalizeUsername(student.username);
            const password = String(student.password ?? '').trim() || generateSixDigitPassword();
            const phone = student.phone;
            const phone2 = student.phone2;
            const father_name = student.father_name;
            const father_phone = student.father_phone;
            const address = student.address;
            const subjectId = Number(student.subject_id);

            if (!name || !surname || !username || !password || !Number.isInteger(subjectId) || subjectId <= 0) {
                failed.push({
                    index,
                    username: username || null,
                    message: "name, surname, username, password va subject_id majburiy"
                });
                continue;
            }

            const subject = subjectMap.get(subjectId);
            if (!subject) {
                failed.push({
                    index,
                    username,
                    message: "Tanlangan fan topilmadi"
                });
                continue;
            }

            const { value: normalizedAge, error: ageError } = normalizeAgeValue(student.age);
            if (ageError) {
                failed.push({
                    index,
                    username,
                    message: ageError
                });
                continue;
            }

            try {
                let finalUsername = await generateUniqueUsername(username, usedUsernames, branchId);
                const { plain: passwordPlain, hashed: hashedPassword } = await hashPassword(password);

                let recoveryKey = generatePlainRecoveryKey();
                let recoveryKeyHash = hashRecoveryKey(finalUsername, recoveryKey);

                let inserted = null;
                let attempts = 0;
                while (!inserted && attempts < 5) {
                    try {
                        const newUser = await pool.query(
                            `INSERT INTO users (
                                name, surname, username, password, password_plain, phone, phone2, father_name, father_phone, address, age, subject, subject_id,
                                branch_id,
                                admitted_by, admitted_by_name,
                                unassigned_reason, password_reset_key_plain, password_reset_key_hash, password_reset_key_rotated_at
                            ) 
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP) 
                             RETURNING id, branch_id, name, surname, username, role, father_name, father_phone, address, age, subject_id, admitted_by, admitted_by_name`,
                            [
                                name,
                                surname,
                                finalUsername,
                                hashedPassword,
                                passwordPlain,
                                phone,
                                phone2,
                                father_name,
                                father_phone,
                                address,
                                normalizedAge,
                                subject.name,
                                subjectId,
                                branchId,
                                admissionAdmin.admittedById,
                                admissionAdmin.admittedByName,
                                "Yangi qo'shilgan",
                                recoveryKey,
                                recoveryKeyHash
                            ]
                        );
                        inserted = newUser.rows[0];
                    } catch (err) {
                        if (err && err.code === '23505') {
                            finalUsername = await generateUniqueUsername(username, usedUsernames);
                            recoveryKeyHash = hashRecoveryKey(finalUsername, recoveryKey);
                            attempts += 1;
                            continue;
                        }
                        throw err;
                    }
                }

                if (!inserted) {
                    throw new Error("username uchun unikal variant topilmadi");
                }

                created.push({
                    index,
                    user: inserted,
                    recovery_key: recoveryKey,
                    generated_password: passwordPlain
                });
            } catch (err) {
                failed.push({
                    index,
                    username,
                    message: err.message
                });
            }
        }

        return res.status(201).json({
            message: "Bulk student register yakunlandi",
            created_count: created.length,
            failed_count: failed.length,
            created,
            failed
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const changePassword = async (req, res) => {
    const { username, old_password, new_password } = req.body;
    if (!old_password || !new_password) {
        return res.status(400).json({ success: false, message: "old_password va new_password majburiy" });
    }

    try {
        const userResult = await pool.query(
            'SELECT id, username, password FROM users WHERE id = $1',
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Foydalanuvchi topilmadi" });
        }

        const user = userResult.rows[0];
        if (username && String(username).trim() !== user.username) {
            return res.status(400).json({ success: false, message: "username mos emas" });
        }

        const isOldPasswordCorrect = await bcrypt.compare(String(old_password), user.password);
        if (!isOldPasswordCorrect) {
            return res.status(401).json({ success: false, message: "Eski parol noto'g'ri" });
        }

        const { plain: passwordPlain, hashed: hashedPassword } = await hashPassword(new_password);

        await pool.query(
            'UPDATE users SET password = $1, password_plain = $2 WHERE id = $3',
            [hashedPassword, passwordPlain, user.id]
        );

        return res.json({
            success: true,
            message: "Parol muvaffaqiyatli yangilandi"
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Parolni yangilashda xatolik", error: err.message });
    }
};

// 1.1. Teacher yaratish (Faqat adminlar uchun) - Ko'p fanlar bilan (primary fan yo'q)
const registerTeacher = async (req, res) => {
    const { 
        name, surname, username, password, phone, phone2, subject_ids, startDate,
        certificate, age, has_experience, experience_years, experience_place, 
        available_times, work_days_hours
    } = req.body;
    
    try {
        const branchId = getUserBranchId(req.user);
        // Username mavjudligini tekshirish
        const userExists = await pool.query(
            'SELECT * FROM users WHERE username = $1 AND branch_id = $2',
            [username, branchId]
        );
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: "Bu username allaqachon mavjud!" });
        }

        // Subject IDs tekshirish (array bo'lishi kerak)
        if (!subject_ids || !Array.isArray(subject_ids) || subject_ids.length === 0) {
            return res.status(400).json({ message: "Kamida bitta fan tanlang (subject_ids array ko'rinishida)" });
        }

        // Barcha subject_ids mavjudligini tekshirish
        const subjectsCheck = await pool.query(
            'SELECT id, name FROM subjects WHERE id = ANY($1) AND branch_id = $2',
            [subject_ids, branchId]
        );
        
        if (subjectsCheck.rows.length !== subject_ids.length) {
            return res.status(400).json({ message: "Ba'zi fanlar mavjud emas" });
        }

        // Primary subject tekshirish olib tashlandi
        if (subject_ids.length === 0) {
            return res.status(400).json({ message: "Kamida bitta fan tanlang" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const recoveryKey = generatePlainRecoveryKey();
        const recoveryKeyHash = hashRecoveryKey(username, recoveryKey);

        // Teacher yaratish (eski subject ustunlarini null qilamiz)
        const newTeacher = await pool.query(
            `INSERT INTO users (name, surname, username, password, password_plain, phone, phone2, role, start_date, 
                               certificate, age, has_experience, experience_years, experience_place, 
                               available_times, work_days_hours, branch_id, password_reset_key_plain, password_reset_key_hash, password_reset_key_rotated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'teacher', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, CURRENT_TIMESTAMP) 
             RETURNING id, branch_id, name, surname, username, role, start_date, certificate, age, 
                       has_experience, experience_years, experience_place, available_times, work_days_hours, password_plain`,
            [name, surname, username, hashedPassword, password, phone, phone2, startDate || new Date(),
             certificate, age, has_experience || false, experience_years, experience_place, 
             available_times, work_days_hours, branchId, recoveryKey, recoveryKeyHash]
        );

        const teacherId = newTeacher.rows[0].id;

        // Har bir fanni teacher_subjects jadvaliga qo'shish
        const assignedSubjects = [];
        for (let i = 0; i < subject_ids.length; i++) {
            const subjectId = subject_ids[i];
            
            try {
                await addSubjectToTeacher(teacherId, subjectId, branchId);
                const subjectInfo = subjectsCheck.rows.find(s => s.id === subjectId);
                assignedSubjects.push({
                    id: subjectId,
                    name: subjectInfo.name
                });
            } catch (err) {
                console.error(`Fan ${subjectId} qo'shishda xato:`, err.message);
            }
        }

        res.status(201).json({ 
            message: "Teacher muvaffaqiyatli yaratildi", 
            teacher: newTeacher.rows[0],
            recovery_key: recoveryKey,
            subjects: assignedSubjects,
            total_subjects: assignedSubjects.length
        });
    } catch (err) {
        res.status(500).json({ 
            error: "Teacher yaratishda xatolik yuz berdi",
            details: err.message 
        });
    }
};

// 1.2. Admin yaratish (Faqat super adminlar uchun)
const registerAdmin = async (req, res) => {
    const { name, surname, username, password, phone, phone2 } = req.body;

    if (!name || !surname || !username || !password) {
        return res.status(400).json({ message: "name, surname, username va password majburiy" });
    }

    try {
        const branchId = getUserBranchId(req.user);
        const userExists = await pool.query(
            'SELECT 1 FROM users WHERE username = $1 AND branch_id = $2',
            [username, branchId]
        );
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: "Bu username allaqachon mavjud!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const recoveryKey = generatePlainRecoveryKey();
        const recoveryKeyHash = hashRecoveryKey(username, recoveryKey);

        const newAdmin = await pool.query(
            `INSERT INTO users (
                name, surname, username, password, role, phone, phone2,
                branch_id, password_reset_key_plain, password_reset_key_hash, password_reset_key_rotated_at
            )
             VALUES ($1, $2, $3, $4, 'admin', $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
             RETURNING id, branch_id, name, surname, username, role, phone, phone2, status, created_at`,
            [name, surname, username, hashedPassword, phone || null, phone2 || null, branchId, recoveryKey, recoveryKeyHash]
        );

        return res.status(201).json({
            success: true,
            message: "Admin muvaffaqiyatli yaratildi",
            admin: newAdmin.rows[0],
            recovery_key: recoveryKey
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Admin yaratishda xatolik", error: err.message });
    }
};

// 5.A. Barcha adminlarni olish (Super admin)
const getAdmins = async (req, res) => {
    const { status, month_name } = req.query || {};
    const branchId = getScopedBranchId(req);
    const filters = [`u.role = 'admin'`, `u.branch_id = $1`];
    const params = [branchId];
    let idx = 2;

    if (status) {
        const validStatuses = ['active', 'terminated', 'on_leave'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: "status noto'g'ri" });
        }
        filters.push(`u.status = $${idx++}`);
        params.push(status);
    }

    let monthName = null;
    let monthParamIndex = null;
    if (month_name !== undefined) {
        const incomingMonth = String(month_name).trim();
        if (!isValidMonthName(incomingMonth)) {
            return res.status(400).json({ success: false, message: "month_name 'YYYY-MM' formatida bo'lishi kerak" });
        }
        monthName = incomingMonth;
        monthParamIndex = idx;
        filters.push(`(u.created_at AT TIME ZONE 'Asia/Tashkent') < (TO_DATE($${idx++} || '-01', 'YYYY-MM-DD') + INTERVAL '1 month')`);
        params.push(monthName);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    try {
        await ensureRecoveryKeysForRole('admin');

        let queryText = `
            SELECT u.id,
                   u.name,
                   u.surname,
                   u.username,
                   u.phone,
                   u.phone2,
                   u.status,
                   u.termination_date,
                   u.created_at,
                   u.password_reset_key_plain as recovery_key
            FROM users u
            ${whereClause}
            ORDER BY u.created_at DESC
        `;

        if (monthName) {
            queryText = `
                SELECT u.id,
                       u.name,
                       u.surname,
                       u.username,
                       u.phone,
                       u.phone2,
                       u.status,
                       u.termination_date,
                       u.created_at,
                       u.password_reset_key_plain as recovery_key,
                       asp.amount as salary_amount,
                       asp.description as salary_description,
                       asp.updated_at as salary_updated_at,
                       asp.month_name as salary_month
                FROM users u
                LEFT JOIN admin_salary_payouts asp
                  ON asp.admin_id = u.id AND asp.month_name = $${monthParamIndex} AND asp.branch_id = u.branch_id
                ${whereClause}
                ORDER BY u.created_at DESC
            `;
        }

        const admins = await pool.query(queryText, params);

        const formatted = admins.rows.map((row) => ({
            id: row.id,
            name: row.name,
            surname: row.surname,
            username: row.username,
            phone: row.phone || '',
            phone2: row.phone2 || '',
            status: row.status,
            terminationDate: normalizeDateValue(row.termination_date),
            createdAt: normalizeDateValue(row.created_at),
            recovery_key: row.recovery_key || null,
            salary: monthName
                ? {
                    month_name: row.salary_month || monthName,
                    amount: row.salary_amount !== null ? Number(row.salary_amount) : null,
                    description: row.salary_description || null,
                    updated_at: normalizeDateValue(row.salary_updated_at)
                }
                : undefined
        }));

        return res.json({ success: true, data: formatted });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Adminlarni olishda xatolik", error: err.message });
    }
};

// 5.B. Admin holatini yangilash (Super admin)
const updateAdminStatus = async (req, res) => {
    const adminId = Number(req.params.adminId);
    const { status, terminationDate } = req.body || {};

    if (!Number.isInteger(adminId) || adminId <= 0) {
        return res.status(400).json({ success: false, message: "adminId noto'g'ri" });
    }

    const validStatuses = ['active', 'terminated', 'on_leave'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: "status noto'g'ri" });
    }

    try {
        const branchId = getScopedBranchId(req);
        const admin = await pool.query(
            `SELECT id, name, surname, status
             FROM users
             WHERE id = $1 AND role = 'admin' AND branch_id = $2`,
            [adminId, branchId]
        );

        if (admin.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Admin topilmadi' });
        }

        let terminationDateValue = null;
        if (status === 'terminated') {
            terminationDateValue = normalizeDateValue(terminationDate) || new Date().toISOString().split('T')[0];
        }

        await pool.query(
            `UPDATE users
             SET status = $1,
                 termination_date = $2
             WHERE id = $3 AND branch_id = $4`,
            [status, terminationDateValue, adminId, branchId]
        );

        return res.json({
            success: true,
            message: 'Admin holati yangilandi',
            admin: {
                id: adminId,
                name: admin.rows[0].name,
                surname: admin.rows[0].surname,
                status,
                terminationDate: terminationDateValue
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Admin holatini yangilashda xatolik', error: err.message });
    }
};

// 5.C. Admin o'chirish (Super admin)
const deleteAdmin = async (req, res) => {
    const adminId = Number(req.params.adminId);

    if (!Number.isInteger(adminId) || adminId <= 0) {
        return res.status(400).json({ success: false, message: "adminId noto'g'ri" });
    }

    if (Number(req.user?.id) === adminId) {
        return res.status(400).json({ success: false, message: "O'zingizni o'chira olmaysiz" });
    }

    try {
        const branchId = getScopedBranchId(req);
        const admin = await pool.query(
            `SELECT id, name, surname, username, role, status
             FROM users
             WHERE id = $1 AND role = 'admin' AND branch_id = $2`,
            [adminId, branchId]
        );

        if (admin.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Admin topilmadi' });
        }

        await pool.query('DELETE FROM users WHERE id = $1 AND branch_id = $2', [adminId, branchId]);

        return res.json({
            success: true,
            message: 'Admin muvaffaqiyatli o\'chirildi',
            admin: admin.rows[0]
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Adminni o\'chirishda xatolik', error: err.message });
    }
};

// 2. Student Login (Access va Refresh token qaytaradi)
const loginStudent = async (req, res) => {
    const usernameRaw = typeof req.body?.username === 'string' ? req.body.username : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const requestedBranchId = Number(req.body?.branch_id);
    const username = usernameRaw.trim();

    if (!username || !password) {
        return res.status(400).json({ message: "Username va parol majburiy!" });
    }

    try {
        const result = await pool.query(
            `SELECT ${loginSelectColumns}
             FROM users u
             LEFT JOIN branches b ON b.id = u.branch_id
             LEFT JOIN profile_avatars pa ON BTRIM(u.avatar_key) = BTRIM(pa.avatar_key) AND pa.branch_id = u.branch_id
             LEFT JOIN student_groups sg ON u.id = sg.student_id AND sg.status = 'active' AND sg.branch_id = u.branch_id
             LEFT JOIN groups g ON sg.group_id = g.id AND g.branch_id = u.branch_id
             LEFT JOIN rooms r ON g.room_id = r.id AND r.branch_id = u.branch_id
             LEFT JOIN subjects s ON g.subject_id = s.id AND s.branch_id = u.branch_id
             LEFT JOIN subjects ss ON u.subject_id = ss.id AND ss.branch_id = u.branch_id
             LEFT JOIN users t ON g.teacher_id = t.id AND t.branch_id = u.branch_id
             WHERE BTRIM(u.username) = BTRIM($1)
               AND ($2::int IS NULL OR u.branch_id = $2)
             ORDER BY sg.id DESC NULLS LAST
             LIMIT 1`, 
            [username, Number.isInteger(requestedBranchId) && requestedBranchId > 0 ? requestedBranchId : null]
        );
        const user = result.rows[0];
        const storedPassword = typeof user?.password === 'string' ? user.password : '';
        const plainPassword = typeof user?.password_plain === 'string' ? user.password_plain : '';

        if (!user) {
            return res.status(401).json({ message: "Username yoki parol xato!" });
        }

        let passwordMatches = false;
        if (storedPassword.startsWith('$2')) {
            passwordMatches = await bcrypt.compare(password, storedPassword);
        } else if (plainPassword) {
            passwordMatches = password === plainPassword;
        }

        if (passwordMatches) {
            // Ikkala tokenni ham yaratamiz
            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);

            res.json({
                accessToken,
                refreshToken,
                user: { 
                    id: user.id, 
                    branch_id: user.branch_id || 1,
                    branch_name: user.branch_name || null,
                    name: user.name, 
                    surname: user.surname,
                    role: user.role,
                    group_id: user.group_id,
                    group_name: user.group_name,
                group_status: user.group_status,
                room_number: user.room_number,
                room_capacity: user.room_capacity,
                has_projector: user.has_projector,
                subject_name: user.subject_name,
                teacher_name: user.teacher_name,
                avatar_key: user.avatar_key,
                avatar_url: user.avatar_url,
                avatar_name: user.avatar_name
                }
            });
        } else {
            res.status(401).json({ message: "Username yoki parol xato!" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. Yangi Access Token olish (Refresh Token yordamida)
const refreshAccessToken = async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(401).json({ message: "Refresh Token taqdim etilmadi!" });
    }

    try {
        // Refresh tokenni tekshiramiz
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

        // Bazadan foydalanuvchini topamiz
        const result = await pool.query('SELECT id, role, branch_id FROM users WHERE id = $1', [decoded.id]);
        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({ message: "Foydalanuvchi topilmadi!" });
        }

        // Yangi Access Token yaratib qaytaramiz
        const newAccessToken = generateAccessToken(user);

        res.json({ accessToken: newAccessToken });
    } catch (err) {
        return res.status(403).json({ message: "Refresh Token yaroqsiz yoki muddati o'tgan!" });
    }
};

// 4. Profil ma'lumotlarini olish
const getProfile = async (req, res) => {
    try {
        const user = await pool.query(
            `SELECT u.id, u.branch_id, b.name AS branch_name, u.name, u.surname, u.username, u.role, u.status, u.phone, u.phone2, u.father_name, u.father_phone, u.address, u.age, 
                    u.avatar_key, pa.image_path AS avatar_url, pa.name AS avatar_name,
                    u.subject, u.start_date, u.end_date, u.certificate, u.has_experience, u.experience_years, u.experience_place, 
                    u.available_times, u.work_days_hours, u.created_at,
                    -- Guruh va xona ma'lumotlari (faqat student uchun)
                    g.id as group_id,
                    g.name as group_name,
                    g.status as group_status,
                    r.room_number,
                    r.capacity as room_capacity,
                    r.has_projector,
                    COALESCE(s.name, ss.name) as subject_name,
                    CONCAT(t.name, ' ', t.surname) as teacher_name
             FROM users u
             LEFT JOIN branches b ON b.id = u.branch_id
             LEFT JOIN profile_avatars pa ON BTRIM(u.avatar_key) = BTRIM(pa.avatar_key) AND pa.branch_id = u.branch_id
             LEFT JOIN student_groups sg ON u.id = sg.student_id AND sg.status = 'active' AND sg.branch_id = u.branch_id
             LEFT JOIN groups g ON sg.group_id = g.id AND g.branch_id = u.branch_id
             LEFT JOIN rooms r ON g.room_id = r.id AND r.branch_id = u.branch_id
             LEFT JOIN subjects s ON g.subject_id = s.id AND s.branch_id = u.branch_id
             LEFT JOIN subjects ss ON u.subject_id = ss.id AND ss.branch_id = u.branch_id
             LEFT JOIN users t ON g.teacher_id = t.id AND t.branch_id = u.branch_id
             WHERE u.id = $1`,
            [req.user.id]
        );
        res.json(user.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4.1. Profil ma'lumotlarini yangilash (faqat o'z profili)
const updateProfile = async (req, res) => {
    const allowedFields = [
        'username',
        'name',
        'surname',
        'phone',
        'phone2',
        'father_name',
        'father_phone',
        'address',
        'age',
        'certificate',
        'has_experience',
        'experience_years',
        'experience_place',
        'available_times',
        'work_days_hours',
        'avatar_key'
    ];

    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const incomingKeys = Object.keys(incoming);

    if (incomingKeys.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Yangilanishi kerak bo'lgan maydonlar yuborilmadi"
        });
    }

    const invalidFields = incomingKeys.filter((key) => !allowedFields.includes(key));
    if (invalidFields.length > 0) {
        return res.status(400).json({
            success: false,
            message: "Ba'zi maydonlarni yangilashga ruxsat yo'q",
            invalid_fields: invalidFields
        });
    }

    if (incoming.age !== undefined && incoming.age !== null && !Number.isInteger(incoming.age)) {
        return res.status(400).json({
            success: false,
            message: "age butun son bo'lishi kerak"
        });
    }

    if (
        incoming.experience_years !== undefined &&
        incoming.experience_years !== null &&
        !Number.isInteger(incoming.experience_years)
    ) {
        return res.status(400).json({
            success: false,
            message: "experience_years butun son bo'lishi kerak"
        });
    }

    if (
        incoming.has_experience !== undefined &&
        incoming.has_experience !== null &&
        typeof incoming.has_experience !== 'boolean'
    ) {
        return res.status(400).json({
            success: false,
            message: "has_experience boolean bo'lishi kerak"
        });
    }

    if (incoming.username !== undefined) {
        const username = String(incoming.username).trim();
        if (!username) {
            return res.status(400).json({
                success: false,
                message: "username bo'sh bo'lmasligi kerak"
            });
        }

        incoming.username = username;
    }

    const setClauses = [];
    const values = [];
    let index = 1;

    for (const key of incomingKeys) {
        if (incoming[key] === undefined) continue;
        setClauses.push(`${key} = $${index}`);
        values.push(incoming[key]);
        index += 1;
    }

    if (setClauses.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Yangilanishi kerak bo'lgan maydonlar yuborilmadi"
        });
    }

    values.push(req.user.id);

    try {
        if (incoming.username !== undefined) {
            const usernameExists = await pool.query(
                `SELECT id
                 FROM users
                 WHERE BTRIM(username) = BTRIM($1)
                   AND id <> $2
                   AND branch_id = $3
                 LIMIT 1`,
                [incoming.username, req.user.id, getUserBranchId(req.user)]
            );

            if (usernameExists.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Bu username allaqachon band"
                });
            }
        }

        const updated = await pool.query(
            `UPDATE users
             SET ${setClauses.join(', ')}
             WHERE id = $${index} AND branch_id = $${index + 1}
             RETURNING id, name, surname, username, role, status, phone, phone2, father_name, father_phone, address, age,
                       certificate, has_experience, experience_years, experience_place, available_times, work_days_hours, avatar_key, created_at`
            ,
            [...values, getUserBranchId(req.user)]
        );

        if (updated.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Foydalanuvchi topilmadi"
            });
        }

        const profile = await pool.query(
            `SELECT ${profileSelectColumns}
             FROM users u
             LEFT JOIN branches b ON b.id = u.branch_id
             LEFT JOIN profile_avatars pa ON BTRIM(u.avatar_key) = BTRIM(pa.avatar_key) AND pa.branch_id = u.branch_id
             LEFT JOIN student_groups sg ON u.id = sg.student_id AND sg.status = 'active' AND sg.branch_id = u.branch_id
             LEFT JOIN groups g ON sg.group_id = g.id AND g.branch_id = u.branch_id
             LEFT JOIN rooms r ON g.room_id = r.id AND r.branch_id = u.branch_id
             LEFT JOIN subjects s ON g.subject_id = s.id AND s.branch_id = u.branch_id
             LEFT JOIN subjects ss ON u.subject_id = ss.id AND ss.branch_id = u.branch_id
             LEFT JOIN users t ON g.teacher_id = t.id AND t.branch_id = u.branch_id
             WHERE u.id = $1`,
            [req.user.id]
        );

        return res.json({
            success: true,
            message: "Profil ma'lumotlari yangilandi",
            updated_fields: setClauses.map((part) => part.split(' = ')[0]),
            user: profile.rows[0] || updated.rows[0]
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Profil ma'lumotlarini yangilashda xatolik",
            error: err.message
        });
    }
};

const updatePushToken = async (req, res) => {
    try {
        const incoming = req.body && typeof req.body === 'object' ? req.body : {};
        const rawToken = typeof incoming.fcm_token === 'string'
            ? incoming.fcm_token.trim()
            : typeof incoming.token === 'string'
                ? incoming.token.trim()
                : '';

        if (!rawToken) {
            return res.status(400).json({
                success: false,
                message: 'fcm_token majburiy'
            });
        }

        console.log(
            `🔔 Push token update: user_id=${req.user.id}, token_prefix=${rawToken.slice(0, 18)}...`
        );

        await pool.query(
            'UPDATE users SET fcm_token = $1 WHERE id = $2',
            [rawToken, req.user.id]
        );

        res.json({
            success: true,
            message: 'Push token yangilandi'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Push tokenni saqlashda xatolik',
            error: err.message
        });
    }
};

// 4.2. Student ma'lumotlarini yangilash (Admin yoki Teacher)
const updateStudentInfo = async (req, res) => {
    const studentId = parseInt(req.params.studentId, 10);
    if (!Number.isInteger(studentId) || studentId <= 0) {
        return res.status(400).json({
            success: false,
            message: "studentId noto'g'ri"
        });
    }

    const allowedFields = [
        'username',
        'name',
        'surname',
        'phone',
        'phone2',
        'father_name',
        'father_phone',
        'address',
        'age',
        'password'
    ];

    const incoming = req.body && typeof req.body === 'object' ? req.body : {};
    const incomingKeys = Object.keys(incoming);

    if (incomingKeys.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Yangilanishi kerak bo'lgan maydonlar yuborilmadi"
        });
    }

    const invalidFields = incomingKeys.filter((key) => !allowedFields.includes(key));
    if (invalidFields.length > 0) {
        return res.status(400).json({
            success: false,
            message: "Ba'zi maydonlarni yangilashga ruxsat yo'q",
            invalid_fields: invalidFields
        });
    }

    if (incoming.age !== undefined && incoming.age !== null && !Number.isInteger(incoming.age)) {
        return res.status(400).json({
            success: false,
            message: "age butun son bo'lishi kerak"
        });
    }

    if (incoming.username !== undefined) {
        const username = String(incoming.username).trim();
        if (!username) {
            return res.status(400).json({
                success: false,
                message: "username bo'sh bo'lmasligi kerak"
            });
        }

        incoming.username = username;
    }

    if (incoming.password !== undefined) {
        try {
            const { plain: passwordPlain, hashed: hashedPassword } = await hashPassword(incoming.password);
            incoming.password = hashedPassword;
            incoming.password_plain = passwordPlain;
        } catch (err) {
            return res.status(400).json({
                success: false,
                message: err.message || "password noto'g'ri"
            });
        }
    }

    try {
        const branchId = getScopedBranchId(req);
        const studentCheck = await pool.query(
            `SELECT id, name, surname
             FROM users
             WHERE id = $1 AND role = 'student' AND branch_id = $2`,
            [studentId, branchId]
        );

        if (studentCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Student topilmadi"
            });
        }

        if (req.user?.role === 'teacher') {
            const teacherAccess = await pool.query(
                `SELECT 1
                 FROM student_groups sg
                 JOIN groups g ON sg.group_id = g.id AND g.branch_id = sg.branch_id
                 WHERE sg.student_id = $1 AND g.teacher_id = $2 AND sg.branch_id = $3
                 LIMIT 1`,
                [studentId, req.user.id, branchId]
            );

            if (teacherAccess.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "Teacher faqat o'z guruhidagi studentni yangilay oladi"
                });
            }
        }

        if (incoming.username !== undefined) {
            const usernameExists = await pool.query(
                `SELECT id
                 FROM users
                 WHERE BTRIM(username) = BTRIM($1)
                   AND id <> $2
                   AND branch_id = $3
                 LIMIT 1`,
                [incoming.username, studentId, branchId]
            );

            if (usernameExists.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Bu username allaqachon band"
                });
            }
        }

        const setClauses = [];
        const values = [];
        let index = 1;
        const hasPasswordPlainColumn = await hasUsersColumn('password_plain');

        for (const key of incomingKeys) {
            if (incoming[key] === undefined) continue;
            if (key === 'password') {
                setClauses.push(`password = $${index}`);
                values.push(incoming.password);
                index += 1;
                if (hasPasswordPlainColumn) {
                    setClauses.push(`password_plain = $${index}`);
                    values.push(incoming.password_plain);
                    index += 1;
                }
                continue;
            }

            setClauses.push(`${key} = $${index}`);
            values.push(incoming[key]);
            index += 1;
        }

        if (setClauses.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Yangilanishi kerak bo'lgan maydonlar yuborilmadi"
            });
        }

        values.push(studentId, branchId);

        const updated = await pool.query(
            `UPDATE users
             SET ${setClauses.join(', ')}
             WHERE id = $${index} AND role = 'student' AND branch_id = $${index + 1}
             RETURNING id, name, surname, username, phone, phone2, father_name, father_phone, address, age`,
            values
        );

        return res.json({
            success: true,
            message: "Student ma'lumotlari yangilandi",
            updated_fields: setClauses.map((part) => part.split(' = ')[0]),
            student: updated.rows[0]
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Student ma'lumotlarini yangilashda xatolik",
            error: err.message
        });
    }
};

// 5. Barcha teacherlarni olish (Subject filter bilan)
const getAllTeachers = async (req, res) => {
    const { subject_id, status } = req.query;
    const branchId = getScopedBranchId(req);
    let filters = [];
    let params = [branchId];
    let paramIdx = 2;

    // Status filter (faqat 3ta holat: active, terminated, on_leave)
    if (status) {
        const validStatuses = ['active', 'terminated', 'on_leave'];
        if (validStatuses.includes(status)) {
            filters.push(`u.status = $${paramIdx++}`);
            params.push(status);
        }
    }

    // Subject filter - yangi teacher_subjects jadvali bilan
    if (subject_id) {
        filters.push(`EXISTS (
            SELECT 1 FROM teacher_subjects ts 
            WHERE ts.teacher_id = u.id AND ts.subject_id = $${paramIdx++}
              AND ts.branch_id = u.branch_id
        )`);
        params.push(subject_id);
    }
    
    const whereClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

    try {
        const teachers = await pool.query(`
            SELECT
                u.id,
                u.name,
                u.surname,
                u.username,
                u.password_plain,
                u.phone,
                u.phone2,
                u.status,
                u.start_date,
                u.end_date,
                u.termination_date,
                u.certificate,
                u.age,
                u.has_experience,
                u.experience_years,
                u.experience_place,
                u.available_times,
                u.work_days_hours,
                u.created_at as registration_date,
                COUNT(DISTINCT g.id) as group_count,
                -- Teacher-ning barcha fanlarini JSON shaklida olish
                COALESCE(
                    (SELECT json_agg(
                        json_build_object(
                            'id', s.id,
                            'name', s.name,
                            'assigned_at', ts.assigned_at
                        ) ORDER BY s.name ASC
                    )
                    FROM teacher_subjects ts
                    JOIN subjects s ON ts.subject_id = s.id AND s.branch_id = ts.branch_id
                    WHERE ts.teacher_id = u.id AND ts.branch_id = u.branch_id),
                    '[]'::json
                ) as subjects
            FROM users u
            LEFT JOIN groups g ON u.id = g.teacher_id AND g.branch_id = u.branch_id
            WHERE u.role = 'teacher' AND u.branch_id = $1 ${whereClause}
            GROUP BY u.id, u.name, u.surname, u.phone, u.phone2, u.status, u.start_date, u.end_date,
                     u.username, u.password_plain,
                     u.certificate, u.age, u.has_experience, u.experience_years, u.experience_place,
                     u.available_times, u.work_days_hours, u.created_at
            ORDER BY u.created_at DESC
        `, params);

        const formattedTeachers = teachers.rows.map(teacher => {
            // Fanlar ro'yxatini formatlash
            const subjects = teacher.subjects || [];
            const subjectNames = subjects.map(s => s.name).join(', ');

            return {
                id: teacher.id,
                name: teacher.name,
                surname: teacher.surname,
                username: teacher.username || null,
                password: teacher.password_plain || null,
                subjects: subjects,
                subjects_list: subjectNames || 'Belgilanmagan',
                subjects_count: subjects.length,
                status: teacher.status, // raw status: active, terminated, on_leave
                isActive: teacher.status === 'active',
                startDate: teacher.start_date ? teacher.start_date.toISOString().split('T')[0] : null,
                endDate: teacher.end_date ? teacher.end_date.toISOString().split('T')[0] : null,
                terminationDate: teacher.termination_date ? teacher.termination_date.toISOString().split('T')[0] : null,
                registrationDate: teacher.registration_date ? teacher.registration_date.toISOString().split('T')[0] : null,
                phone: teacher.phone || '',
                phone2: teacher.phone2 || '',
                certificate: teacher.certificate || '',
                age: teacher.age || null,
                hasExperience: teacher.has_experience || false,
                experienceYears: teacher.experience_years || null,
                experiencePlace: teacher.experience_place || '',
                availableTimes: teacher.available_times || '',
                workDaysHours: teacher.work_days_hours || '',
                groupCount: parseInt(teacher.group_count) || 0
            };
        });

        // Statistikalarni hisoblash        
        res.json({
            message: "Teacherlar muvaffaqiyatli olindi",
            teachers: formattedTeachers,
            total: formattedTeachers.length,
            filters_applied: {
                subject_id: subject_id || null,
                status: status || null
            }
        });
    } catch (err) {
        console.error('Teacherlarni olishda xatolik:', err);
        res.status(500).json({ 
            error: "Teacherlarni olishda xatolik yuz berdi",
            details: err.message 
        });
    }
};

// Joriy teacher ingliz tili o'qituvchisimi tekshirish
const checkIsEnglishTeacher = async (req, res) => {
    try {
        const teacherId = req.user.id; // JWT tokendan teacher ID olish
        const branchId = getScopedBranchId(req);
        
        const teacherSubjects = await pool.query(`
            SELECT s.name 
            FROM teacher_subjects ts
            JOIN subjects s ON ts.subject_id = s.id AND s.branch_id = ts.branch_id
            WHERE ts.teacher_id = $1 AND ts.branch_id = $2
        `, [teacherId, branchId]);

        const subjects = teacherSubjects.rows;
        const isEnglishTeacher = subjects.some(s => 
            s.name.toLowerCase().includes('ingliz') || 
            s.name.toLowerCase().includes('english') ||
            s.name.toLowerCase().includes('ingiliz') ||
            s.name.toLowerCase().includes('inglis')
        );

        res.json({
            message: "Teacher turi tekshirildi",
            isEnglishTeacher: isEnglishTeacher,
            teacherId: teacherId
        });
    } catch (err) {
        console.error('Teacher turini tekshirishda xatolik:', err);
        res.status(500).json({ 
            error: "Teacher turini tekshirishda xatolik yuz berdi",
            details: err.message 
        });
    }
};

// Ingliz tili o'qituvchilarini alohida olish
const getEnglishTeachers = async (req, res) => {
    try {
        const { status } = req.query;
        const branchId = getScopedBranchId(req);
        
        // Status filter uchun params
        let statusCondition = '';
        let params = [branchId];
        
        if (status) {
            statusCondition = 'AND u.status = $2';
            params.push(status);
        }

        const teachers = await pool.query(`
            SELECT 
                u.id, u.name, u.surname, u.phone, u.phone2, u.status, u.start_date, u.end_date, 
                u.termination_date, u.registration_date, u.certificate, u.age, u.has_experience, 
                u.experience_years, u.experience_place, u.available_times, u.work_days_hours, 
                u.created_at,
                COALESCE(
                    JSON_AGG(
                        CASE 
                            WHEN s.id IS NOT NULL THEN 
                                JSON_BUILD_OBJECT('id', s.id, 'name', s.name)
                            ELSE NULL
                        END
                    ) FILTER (WHERE s.id IS NOT NULL), '[]'
                ) AS subjects,
                COUNT(DISTINCT g.id) as group_count
            FROM users u
            LEFT JOIN teacher_subjects ts ON u.id = ts.teacher_id AND ts.branch_id = u.branch_id
            LEFT JOIN subjects s ON ts.subject_id = s.id AND s.branch_id = u.branch_id
            LEFT JOIN groups g ON u.id = g.teacher_id AND g.status = 'active' AND g.branch_id = u.branch_id
            WHERE u.role = 'teacher' 
                AND u.branch_id = $1
                AND u.status != 'deleted' 
                AND EXISTS (
                    SELECT 1 FROM teacher_subjects ts2 
                    JOIN subjects s2 ON ts2.subject_id = s2.id AND s2.branch_id = ts2.branch_id
                    WHERE ts2.teacher_id = u.id 
                    AND ts2.branch_id = u.branch_id
                    AND (LOWER(s2.name) LIKE '%ingliz%' 
                         OR LOWER(s2.name) LIKE '%english%' 
                         OR LOWER(s2.name) LIKE '%ingiliz%'
                         OR LOWER(s2.name) LIKE '%inglis%')
                )
                ${statusCondition}
            GROUP BY u.id, u.name, u.surname, u.phone, u.phone2, u.status, u.start_date, 
                     u.end_date, u.termination_date, u.registration_date, u.certificate, 
                     u.age, u.has_experience, u.experience_years, u.experience_place, 
                     u.available_times, u.work_days_hours, u.created_at
            ORDER BY u.created_at DESC
        `, params);

        const formattedTeachers = teachers.rows.map(teacher => {
            const subjects = teacher.subjects || [];
            const subjectNames = subjects.map(s => s.name).join(', ');

            return {
                id: teacher.id,
                name: teacher.name,
                surname: teacher.surname,
                subjects: subjects,
                subjects_list: subjectNames || 'Belgilanmagan',
                subjects_count: subjects.length,
                status: teacher.status,
                isActive: teacher.status === 'active',
                startDate: teacher.start_date ? teacher.start_date.toISOString().split('T')[0] : null,
                endDate: teacher.end_date ? teacher.end_date.toISOString().split('T')[0] : null,
                terminationDate: teacher.termination_date ? teacher.termination_date.toISOString().split('T')[0] : null,
                registrationDate: teacher.registration_date ? teacher.registration_date.toISOString().split('T')[0] : null,
                phone: teacher.phone || '',
                phone2: teacher.phone2 || '',
                certificate: teacher.certificate || '',
                age: teacher.age || null,
                hasExperience: teacher.has_experience || false,
                experienceYears: teacher.experience_years || null,
                experiencePlace: teacher.experience_place || '',
                availableTimes: teacher.available_times || '',
                workDaysHours: teacher.work_days_hours || '',
                groupCount: parseInt(teacher.group_count) || 0,
                
                // Ingliz tili o'qituvchilari uchun maxsus maydonlar
                isEnglishTeacher: true,
                teacherCategory: 'english',
                specialCapabilities: [
                    'speaking_clubs',
                    'ielts_preparation', 
                    'toefl_preparation',
                    'business_english',
                    'online_classes',
                    'conversation_practice'
                ],
                canTeachIELTS: true,
                canTeachTOEFL: true,
                canTeachBusinessEnglish: true,
                canConductSpeakingClubs: true,
                // Qo'shimcha ingliz tili ma'lumotlari
                englishLevel: 'advanced', // Keyinroq database'dan olish mumkin
                certifications: [], // CELTA, TESOL va h.k.
                speakingClubsCount: 0, // Keyinroq hisoblash
                onlineClassesEnabled: true
            };
        });

        res.json({
            message: "Ingliz tili o'qituvchilari muvaffaqiyatli olindi",
            teachers: formattedTeachers,
            total: formattedTeachers.length,
            statistics: {
                total_english_teachers: formattedTeachers.length,
                active_english_teachers: formattedTeachers.filter(t => t.isActive).length,
                with_experience: formattedTeachers.filter(t => t.hasExperience).length,
                certified_teachers: formattedTeachers.filter(t => t.certificate).length
            },
            filters_applied: {
                status: status || null,
                teacher_type: 'english_only'
            }
        });
    } catch (err) {
        console.error('Ingliz tili o\'qituvchilarni olishda xatolik:', err);
        res.status(500).json({ 
            error: "Ingliz tili o'qituvchilarni olishda xatolik yuz berdi",
            details: err.message 
        });
    }
};

// Teacher'ni dam olishga chiqarish
const setTeacherOnLeave = async (req, res) => {
    const { teacherId } = req.params;
    try {
        const branchId = getScopedBranchId(req);
        const teacher = await pool.query('SELECT * FROM users WHERE id = $1 AND role = $2 AND branch_id = $3', [teacherId, 'teacher', branchId]);
        if (teacher.rows.length === 0) {
            return res.status(404).json({ message: "Teacher topilmadi!" });
        }

        if (teacher.rows[0].status === 'on_leave') {
            return res.status(400).json({ message: "Teacher allaqachon dam olish holatida!" });
        }

        // Teacher-ning faol guruhlarini tekshirish
        const activeGroups = await pool.query(
            `SELECT g.id, g.name, g.unique_code,
                    COUNT(sg.student_id) as total_students_count,
                    COUNT(sg.student_id) FILTER (WHERE sg.status = 'active') as active_students_count,
                    COUNT(sg.student_id) FILTER (WHERE sg.status = 'stopped') as stopped_students_count,
                    COUNT(sg.student_id) FILTER (WHERE sg.status = 'finished') as finished_students_count
             FROM groups g
             LEFT JOIN student_groups sg ON g.id = sg.group_id AND sg.branch_id = g.branch_id
             WHERE g.teacher_id = $1 AND g.status = 'active' AND g.branch_id = $2
             GROUP BY g.id, g.name, g.unique_code
             ORDER BY g.name`,
            [teacherId, branchId]
        );

        if (activeGroups.rows.length > 0) {
            const groupsList = activeGroups.rows.map(group => 
                `- ${group.name} (${group.unique_code}) - Jami: ${parseInt(group.total_students_count) || 0} ta student (Faol: ${parseInt(group.active_students_count) || 0})`
            ).join('\n');
            
            return res.status(400).json({ 
                success: false,
                message: `Teacher dam olishga chiqarib bo'lmaydi! Avval ${activeGroups.rows.length} ta faol guruhni boshqa teacherga o'tkazing:`,
                active_groups: activeGroups.rows.map(group => ({
                    id: group.id,
                    name: group.name,
                    code: group.unique_code,
                    total_students_count: parseInt(group.total_students_count) || 0,
                    active_students_count: parseInt(group.active_students_count) || 0,
                    stopped_students_count: parseInt(group.stopped_students_count) || 0,
                    finished_students_count: parseInt(group.finished_students_count) || 0
                })),
                groups_count: activeGroups.rows.length,
                groups_list: groupsList,
                instruction: "Har bir guruhni boshqa teacherga o'tkazish uchun:",
                api_example: `PATCH /api/groups/{group_id} -> {"teacher_id": yangi_teacher_id}`,
                note: "Barcha guruhlar o'tkazilgandan keyin qayta urinib ko'ring"
            });
        }

        await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2 AND branch_id = $3',
            ['on_leave', teacherId, branchId]
        );

        res.json({ 
            success: true,
            message: `${teacher.rows[0].name} ${teacher.rows[0].surname} dam olishga chiqarildi`,
            teacher: { 
                id: teacherId, 
                status: 'on_leave',
                name: teacher.rows[0].name,
                surname: teacher.rows[0].surname,
                full_name: teacher.rows[0].name + ' ' + teacher.rows[0].surname
            },
            note: "Teacher dam olishdan qaytganda 'reactivate' API ni ishlating"
        });
    } catch (err) {
        console.error('Teacher dam olishga chiqarishda xato:', err);
        res.status(500).json({ 
            success: false,
            error: "Teacher dam olishga chiqarishda texnik xatolik yuz berdi",
            message: "Iltimos, keyinroq qayta urinib ko'ring",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Teacher'ni ishdan boshatish
const terminateTeacher = async (req, res) => {
    const { teacherId } = req.params;
    const { terminationDate } = req.body;
    
    try {
        const branchId = getScopedBranchId(req);
        const teacher = await pool.query('SELECT * FROM users WHERE id = $1 AND role = $2 AND branch_id = $3', [teacherId, 'teacher', branchId]);
        if (teacher.rows.length === 0) {
            return res.status(404).json({ message: "Teacher topilmadi!" });
        }

        if (teacher.rows[0].status === 'terminated') {
            return res.status(400).json({ message: "Teacher allaqachon ishdan boshatilgan!" });
        }

        // Teacher-ning faol guruhlarini tekshirish
        const activeGroups = await pool.query(
            `SELECT g.id, g.name, g.unique_code, g.status,
                    COUNT(sg.student_id) as total_students_count,
                    COUNT(sg.student_id) FILTER (WHERE sg.status = 'active') as active_students_count,
                    COUNT(sg.student_id) FILTER (WHERE sg.status = 'stopped') as stopped_students_count,
                    COUNT(sg.student_id) FILTER (WHERE sg.status = 'finished') as finished_students_count
             FROM groups g
             LEFT JOIN student_groups sg ON g.id = sg.group_id AND sg.branch_id = g.branch_id
             WHERE g.teacher_id = $1 AND g.status IN ('active', 'draft') AND g.branch_id = $2
             GROUP BY g.id, g.name, g.unique_code, g.status
             ORDER BY g.name`,
            [teacherId, branchId]
        );

        if (activeGroups.rows.length > 0) {
            const groupsList = activeGroups.rows.map(group => 
                `- ${group.name} (${group.unique_code}) [${group.status}] - Jami: ${parseInt(group.total_students_count) || 0} ta student (Faol: ${parseInt(group.active_students_count) || 0})`
            ).join('\n');
            
            return res.status(400).json({ 
                success: false,
                message: `Teacher ishdan boshatib bo'lmaydi! Avval ${activeGroups.rows.length} ta guruhni boshqa teacherga o'tkazing:`,
                active_groups: activeGroups.rows.map(group => ({
                    id: group.id,
                    name: group.name,
                    code: group.unique_code,
                    status: group.status,
                    total_students_count: parseInt(group.total_students_count) || 0,
                    active_students_count: parseInt(group.active_students_count) || 0,
                    stopped_students_count: parseInt(group.stopped_students_count) || 0,
                    finished_students_count: parseInt(group.finished_students_count) || 0
                })),
                groups_count: activeGroups.rows.length,
                groups_list: groupsList,
                instruction: "Har bir guruhni boshqa teacherga o'tkazish uchun:",
                api_example: `PATCH /api/groups/{group_id} -> {"teacher_id": yangi_teacher_id}`,
                warning: "Ishdan boshatish qaytarib bo'lmaydigan harakat!",
                note: "Barcha guruhlar o'tkazilgandan keyin qayta urinib ko'ring"
            });
        }

        const termDate = terminationDate || new Date().toISOString().split('T')[0];
        
        await pool.query(
            'UPDATE users SET status = $1, termination_date = $2 WHERE id = $3 AND branch_id = $4',
            ['terminated', termDate, teacherId, branchId]
        );

        res.json({ 
            success: true,
            message: `${teacher.rows[0].name} ${teacher.rows[0].surname} ishdan boshatildi`,
            teacher: { 
                id: teacherId, 
                status: 'terminated',
                terminationDate: termDate,
                name: teacher.rows[0].name,
                surname: teacher.rows[0].surname,
                full_name: teacher.rows[0].name + ' ' + teacher.rows[0].surname
            },
            warning: "Bu harakat qaytarib bo'lmaydi!",
            note: "Agar kerak bo'lsa, yangi teacher sifatida qayta ro'yxatdan o'tkazishingiz mumkin"
        });
    } catch (err) {
        console.error('Teacher ishdan boshatishda xato:', err);
        res.status(500).json({ 
            success: false,
            error: "Teacher ishdan boshatishda texnik xatolik yuz berdi",
            message: "Iltimos, keyinroq qayta urinib ko'ring",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

// Teacher'ni ishga qaytarish (dam olishdan yoki ishdan boshatishdan)
const reactivateTeacher = async (req, res) => {
    const { teacherId } = req.params;
    try {
        const branchId = getScopedBranchId(req);
        const teacher = await pool.query('SELECT * FROM users WHERE id = $1 AND role = $2 AND branch_id = $3', [teacherId, 'teacher', branchId]);
        if (teacher.rows.length === 0) {
            return res.status(404).json({ message: "Teacher topilmadi!" });
        }

        if (teacher.rows[0].status === 'active') {
            return res.status(400).json({ message: "Teacher allaqachon faol holatda!" });
        }

        await pool.query(
            'UPDATE users SET status = $1, termination_date = NULL WHERE id = $2 AND branch_id = $3',
            ['active', teacherId, branchId]
        );

        res.json({ 
            message: "Teacher qayta faollashtirildi",
            teacher: { 
                id: teacherId, 
                status: 'active',
                name: teacher.rows[0].name + ' ' + teacher.rows[0].surname
            }
        });
    } catch (err) {
        res.status(500).json({ 
            error: "Teacher'ni qayta faollashtrishda xatolik yuz berdi",
            details: err.message 
        });
    }
};

// 9. Teacher'ni butunlay o'chirish (DELETE)
const deleteTeacher = async (req, res) => {
    const { teacherId } = req.params;
    const client = await pool.connect();
    const branchId = getScopedBranchId(req);

    try {
        await client.query('BEGIN');

        // Teacher mavjudligini tekshirish
        const teacher = await client.query(
            'SELECT id, name, surname FROM users WHERE id = $1 AND role = $2 AND branch_id = $3',
            [teacherId, 'teacher', branchId]
        );

        if (teacher.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Teacher topilmadi" });
        }

        // Teacher bilan bog'langan guruhlarni tekshirish
        const groups = await client.query(
            'SELECT COUNT(*) as group_count FROM groups WHERE teacher_id = $1 AND branch_id = $2',
            [teacherId, branchId]
        );

        if (parseInt(groups.rows[0].group_count) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                message: "Bu teacher'ga bog'langan guruhlar mavjud. Avval guruhlarni boshqa teacher'ga o'tkazing yoki o'chiring.",
                groups_count: groups.rows[0].group_count
            });
        }

        // FK xatolarini oldini olish: oylik group snapshotdagi teacher bog'lanishlarini bo'shatish
        await client.query(
            `UPDATE group_monthly_settings
             SET teacher_id_for_month = NULL
             WHERE teacher_id_for_month = $1 AND branch_id = $2`,
            [teacherId, branchId]
        );
        await client.query(
            `UPDATE group_monthly_settings
             SET created_by = NULL
             WHERE created_by = $1 AND branch_id = $2`,
            [teacherId, branchId]
        );

        // Teacher'ni butunlay o'chirish
        await client.query('DELETE FROM users WHERE id = $1 AND role = $2 AND branch_id = $3', [teacherId, 'teacher', branchId]);
        await client.query('COMMIT');

        res.json({ 
            message: `${teacher.rows[0].name} ${teacher.rows[0].surname} butunlay o'chirildi`,
            deleted_teacher_id: teacherId
        });

    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (rollbackErr) {}
        res.status(500).json({ 
            error: "Teacher'ni o'chirishda xatolik yuz berdi",
            details: err.message 
        });
    } finally {
        client.release();
    }
};

// 10. Teacher ma'lumotlarini to'liq yangilash (PUT)
// 11. Teacher ma'lumotlarini qisman yangilash (PATCH) - username va parolsiz
const patchTeacher = async (req, res) => {
    const { teacherId } = req.params;
    const updateFields = { ...req.body }; // Copy qilib olamiz
    const { subject_ids } = req.body; // Fanlar alohida
    const branchId = getScopedBranchId(req);

    try {
        // Teacher mavjudligini tekshirish
        const teacherExists = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND role = $2 AND branch_id = $3',
            [teacherId, 'teacher', branchId]
        );

        if (teacherExists.rows.length === 0) {
            return res.status(404).json({ message: "Teacher topilmadi" });
        }

        // Username va password fieldlarini olib tashlaymiz (admin faqat boshqa ma'lumotlarni o'zgartira oladi)
        delete updateFields.username;
        delete updateFields.password;
        delete updateFields.subject_ids; // subject_ids ni alohida ishlov beramiz
        
        // Bo'sh obyekt tekshiruvi
        if (Object.keys(updateFields).length === 0 && (!subject_ids || !Array.isArray(subject_ids))) {
            return res.status(400).json({ message: "Yangilanishi kerak bo'lgan maydonlar ko'rsatilmagan. Username va parolni yangilab bo'lmaydi." });
        }

        // Subject IDs tekshirish
        if (subject_ids && Array.isArray(subject_ids) && subject_ids.length > 0) {
            const subjectsCheck = await pool.query(
                'SELECT id, name FROM subjects WHERE id = ANY($1) AND branch_id = $2',
                [subject_ids, branchId]
            );
            
            if (subjectsCheck.rows.length !== subject_ids.length) {
                return res.status(400).json({ message: "Ba'zi fanlar mavjud emas" });
            }
        }

        let updatedTeacher = null;
        
        // Agar user ma'lumotlari yangilanishi kerak bo'lsa
        if (Object.keys(updateFields).length > 0) {
            // Dinamik query yaratish
            const keys = Object.keys(updateFields);
            const values = Object.values(updateFields);
            const setClause = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
            
            const updateQuery = `
                UPDATE users SET ${setClause}
                WHERE id = $${keys.length + 1} AND role = 'teacher' AND branch_id = $${keys.length + 2}
                RETURNING id, name, surname, username, phone, phone2,
                         certificate, age, has_experience, experience_years, experience_place,
                         available_times, work_days_hours, status, start_date
            `;

            updatedTeacher = await pool.query(updateQuery, [...values, teacherId, branchId]);
        } else {
            // Faqat teacher ma'lumotlarini olish
            updatedTeacher = await pool.query(
                `SELECT id, name, surname, username, phone, phone2,
                        certificate, age, has_experience, experience_years, experience_place,
                        available_times, work_days_hours, status, start_date
                 FROM users WHERE id = $1 AND role = 'teacher' AND branch_id = $2`,
                [teacherId, branchId]
            );
        }

        // Fanlarni yangilash (agar subject_ids berilgan bo'lsa)
        if (subject_ids && Array.isArray(subject_ids) && subject_ids.length > 0) {
            // Avvalgi fanlarni o'chirish
            await pool.query('DELETE FROM teacher_subjects WHERE teacher_id = $1 AND branch_id = $2', [teacherId, branchId]);
            
            // Yangi fanlarni qo'shish
            for (const subjectId of subject_ids) {
                await pool.query(
                    'INSERT INTO teacher_subjects (teacher_id, subject_id, branch_id) VALUES ($1, $2, $3)',
                    [teacherId, subjectId, branchId]
                );
            }
        }

        // Teacher fanlarini olish
        const teacherSubjects = await getTeacherSubjects(teacherId, branchId);
        
        const response = {
            message: "Teacher ma'lumotlari qisman yangilandi",
            teacher: updatedTeacher.rows[0],
            subjects: teacherSubjects,
            subjects_count: teacherSubjects.length,
            note: "Username va parolni yangilash taqiqlangan"
        };
        
        // Qaysi maydonlar yangilanganini ko'rsatish
        if (Object.keys(updateFields).length > 0) {
            response.updated_fields = Object.keys(updateFields);
        }
        if (subject_ids && Array.isArray(subject_ids)) {
            response.subjects_updated = true;
        }

        res.json(response);

    } catch (err) {
        res.status(500).json({ 
            error: "Teacher'ni qisman yangilashda xatolik yuz berdi",
            details: err.message 
        });
    }
};

// 12. Teacher ma'lumotlarini yangilash (sodda PATCH) - username va parolsiz
const updateTeacherInfo = async (req, res) => {
    const { teacherId } = req.params;
    const {
        name, surname, phone, phone2, subject_ids, certificate, age,
        has_experience, experience_years, experience_place, available_times, work_days_hours
    } = req.body;
    const branchId = getScopedBranchId(req);

    try {
        // Teacher mavjudligini tekshirish
        const teacherExists = await pool.query(
            'SELECT id, name, surname FROM users WHERE id = $1 AND role = $2 AND branch_id = $3',
            [teacherId, 'teacher', branchId]
        );

        if (teacherExists.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: "Teacher topilmadi" 
            });
        }

        const currentTeacher = teacherExists.rows[0];

        // Subject IDs tekshirish (agar berilgan bo'lsa)
        if (subject_ids && Array.isArray(subject_ids) && subject_ids.length > 0) {
            const subjectsCheck = await pool.query(
                'SELECT id, name FROM subjects WHERE id = ANY($1) AND branch_id = $2',
                [subject_ids, branchId]
            );
            
            if (subjectsCheck.rows.length !== subject_ids.length) {
                const foundIds = subjectsCheck.rows.map(s => s.id);
                const missingIds = subject_ids.filter(id => !foundIds.includes(id));
                return res.status(400).json({ 
                    success: false,
                    message: "Ba'zi fanlar mavjud emas",
                    missing_subject_ids: missingIds
                });
            }
        }

        // User ma'lumotlarini yangilash
        const updateQuery = `
            UPDATE users SET 
                name = COALESCE($1, name),
                surname = COALESCE($2, surname), 
                phone = COALESCE($3, phone),
                phone2 = COALESCE($4, phone2),
                certificate = COALESCE($5, certificate),
                age = COALESCE($6, age),
                has_experience = COALESCE($7, has_experience),
                experience_years = COALESCE($8, experience_years),
                experience_place = COALESCE($9, experience_place),
                available_times = COALESCE($10, available_times),
                work_days_hours = COALESCE($11, work_days_hours)
            WHERE id = $12 AND role = 'teacher' AND branch_id = $13
            RETURNING id, name, surname, username, phone, phone2,
                     certificate, age, has_experience, experience_years, experience_place,
                     available_times, work_days_hours, status, start_date, created_at
        `;

        const updatedTeacher = await pool.query(updateQuery, [
            name, surname, phone, phone2, certificate, age,
            has_experience, experience_years, experience_place, available_times, work_days_hours,
            teacherId, branchId
        ]);

        // Fanlarni yangilash (agar berilgan bo'lsa)
        if (subject_ids && Array.isArray(subject_ids) && subject_ids.length > 0) {
            // Avvalgi fanlarni o'chirish
            await pool.query('DELETE FROM teacher_subjects WHERE teacher_id = $1 AND branch_id = $2', [teacherId, branchId]);
            
            // Yangi fanlarni qo'shish
            for (const subjectId of subject_ids) {
                await pool.query(
                    'INSERT INTO teacher_subjects (teacher_id, subject_id, branch_id) VALUES ($1, $2, $3)',
                    [teacherId, subjectId, branchId]
                );
            }
        }

        // Teacher fanlarini olish
        const teacherSubjects = await getTeacherSubjects(teacherId, branchId);
        
        res.json({
            success: true,
            message: `${currentTeacher.name} ${currentTeacher.surname} ning ma'lumotlari yangilandi`,
            teacher: updatedTeacher.rows[0],
            subjects: teacherSubjects,
            subjects_count: teacherSubjects.length,
            updated_fields: Object.keys(req.body).filter(key => req.body[key] !== undefined),
            note: "Username va parolni yangilash mumkin emas"
        });

    } catch (err) {
        console.error('Teacher ma\'lumotlarini yangilashda xatolik:', err);
        res.status(500).json({ 
            success: false,
            message: "Teacher ma'lumotlarini yangilashda xatolik",
            error: err.message 
        });
    }
};

// Student status o'zgartirish (leave_date set qilish)
const changeStudentStatus = async (req, res) => {
    const { student_id, status, leave_date } = req.body;
    const { role } = req.user;

    try {
        // Faqat admin uchun
        if (role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Faqat adminlar student holatini o\'zgartira oladi'
            });
        }

        // Student tekshiruvi
        const studentCheck = await pool.query(`
            SELECT u.id, u.name, u.surname, sg.group_id, g.name as group_name
            FROM users u
            JOIN student_groups sg ON u.id = sg.student_id
            JOIN groups g ON sg.group_id = g.id
            WHERE u.id = $1 AND u.role = 'student'
        `, [student_id]);

        if (studentCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Student topilmadi'
            });
        }

        const student = studentCheck.rows[0];

        // Status va leave_date yangilash
        let updateQuery;
        let params;

        if (status === 'stopped' || status === 'finished') {
            const currentLeaveDate = leave_date || new Date().toISOString().split('T')[0];
            updateQuery = `
                UPDATE student_groups 
                SET status = $1, leave_date = $2
                WHERE student_id = $3
            `;
            params = [status, currentLeaveDate, student_id];
        } else {
            updateQuery = `
                UPDATE student_groups 
                SET status = $1, leave_date = NULL
                WHERE student_id = $2
            `;
            params = [status, student_id];
        }

        await pool.query(updateQuery, params);

        res.json({
            success: true,
            message: 'Student holati muvaffaqiyatli o\'zgartirildi',
            data: {
                student_name: `${student.name} ${student.surname}`,
                group_name: student.group_name,
                new_status: status,
                leave_date: status === 'stopped' || status === 'finished' ? leave_date || new Date().toISOString().split('T')[0] : null
            }
        });

    } catch (error) {
        console.error('Student holatini o\'zgartirishda xatolik:', error);
        res.status(500).json({
            success: false,
            message: 'Student holatini o\'zgartirib bo\'lmadi',
            error: error.message
        });
    }
};

module.exports = { 
    registerStudent, 
    registerStudentsBulk,
    registerTeacher, 
    registerAdmin,
    loginStudent,
    changePassword,
    getProfile, 
    updateProfile,
    updatePushToken,
    updateStudentInfo,
    refreshAccessToken,
    getAllTeachers,
    getAdmins,
    getEnglishTeachers,
    checkIsEnglishTeacher,
    setTeacherOnLeave,
    terminateTeacher,
    reactivateTeacher,
    deleteTeacher,
    patchTeacher,
    updateTeacherInfo,
    changeStudentStatus,
    updateAdminStatus,
    deleteAdmin
};
