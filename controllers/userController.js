const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { 
    addSubjectToTeacher, 
    getTeacherSubjects, 
    removeSubjectFromTeacher,
    getTeachersBySubject
} = require('../models/teacherSubjectModel');

// Yordamchi funksiya: Access Token yaratish (15 minutlik)
const generateAccessToken = (user) => {
    return jwt.sign(
        { id: user.id, role: user.role },
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

const hashRecoveryKey = (username, recoveryKey) => {
    const pepper = process.env.PASSWORD_RESET_PEPPER || process.env.JWT_SECRET || 'default-pepper';
    return crypto
        .createHash('sha256')
        .update(`${String(username).trim()}::${String(recoveryKey).trim()}::${pepper}`)
        .digest('hex');
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

// 1. Student ro'yxatdan o'tishi (Yangi maydonlar bilan)
const registerStudent = async (req, res) => {
    const { name, surname, username, password, phone, phone2, father_name, father_phone, address, age } = req.body;
    try {
        const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: "Bu username allaqachon mavjud!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const recoveryKey = generatePlainRecoveryKey();
        const recoveryKeyHash = hashRecoveryKey(username, recoveryKey);

        const newUser = await pool.query(
            `INSERT INTO users (
                name, surname, username, password, phone, phone2, father_name, father_phone, address, age,
                password_reset_key_plain, password_reset_key_hash, password_reset_key_rotated_at
            ) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP) 
             RETURNING id, name, surname, username, role, father_name, father_phone, address, age`,
            [name, surname, username, hashedPassword, phone, phone2, father_name, father_phone, address, age, recoveryKey, recoveryKeyHash]
        );

        res.status(201).json({
            message: "Muvaffaqiyatli ro'yxatdan o'tdingiz",
            user: newUser.rows[0],
            recovery_key: recoveryKey
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const resetPasswordWithRecoveryKey = async (req, res) => {
    const { username, recovery_key, new_password } = req.body;

    if (!username || !recovery_key || !new_password) {
        return res.status(400).json({ success: false, message: "username, recovery_key va new_password majburiy" });
    }

    try {
        const userResult = await pool.query(
            'SELECT id, username, password_reset_key_hash FROM users WHERE username = $1',
            [String(username).trim()]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Foydalanuvchi topilmadi" });
        }

        const user = userResult.rows[0];
        if (!user.password_reset_key_hash) {
            return res.status(400).json({ success: false, message: "Recovery key hali berilmagan. Admin orqali yangilang." });
        }

        const incomingHash = hashRecoveryKey(user.username, recovery_key);
        if (incomingHash !== user.password_reset_key_hash) {
            return res.status(401).json({ success: false, message: "Recovery key noto'g'ri" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(String(new_password), salt);

        // Bir martalik ishlashi uchun keyni darhol aylantiramiz (oldingi key yaroqsiz bo'ladi)
        const nextRecoveryKey = generatePlainRecoveryKey();
        const nextRecoveryKeyHash = hashRecoveryKey(user.username, nextRecoveryKey);

        await pool.query(
            `UPDATE users
             SET password = $1,
                 password_reset_key_plain = $2,
                 password_reset_key_hash = $3,
                 password_reset_key_rotated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [hashedPassword, nextRecoveryKey, nextRecoveryKeyHash, user.id]
        );

        return res.json({
            success: true,
            message: "Parol muvaffaqiyatli tiklandi. Eski recovery key endi ishlamaydi.",
            data: {
                recovery_key: nextRecoveryKey
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Parolni tiklashda xatolik", error: err.message });
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

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(String(new_password), salt);

        await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, user.id]
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
        // Username mavjudligini tekshirish
        const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: "Bu username allaqachon mavjud!" });
        }

        // Subject IDs tekshirish (array bo'lishi kerak)
        if (!subject_ids || !Array.isArray(subject_ids) || subject_ids.length === 0) {
            return res.status(400).json({ message: "Kamida bitta fan tanlang (subject_ids array ko'rinishida)" });
        }

        // Barcha subject_ids mavjudligini tekshirish
        const subjectsCheck = await pool.query(
            'SELECT id, name FROM subjects WHERE id = ANY($1)',
            [subject_ids]
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
            `INSERT INTO users (name, surname, username, password, phone, phone2, role, start_date, 
                               certificate, age, has_experience, experience_years, experience_place, 
                               available_times, work_days_hours, password_reset_key_plain, password_reset_key_hash, password_reset_key_rotated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, 'teacher', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP) 
             RETURNING id, name, surname, username, role, start_date, certificate, age, 
                       has_experience, experience_years, experience_place, available_times, work_days_hours`,
            [name, surname, username, hashedPassword, phone, phone2, startDate || new Date(),
             certificate, age, has_experience || false, experience_years, experience_place, 
             available_times, work_days_hours, recoveryKey, recoveryKeyHash]
        );

        const teacherId = newTeacher.rows[0].id;

        // Har bir fanni teacher_subjects jadvaliga qo'shish
        const assignedSubjects = [];
        for (let i = 0; i < subject_ids.length; i++) {
            const subjectId = subject_ids[i];
            
            try {
                await addSubjectToTeacher(teacherId, subjectId);
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

// 2. Student Login (Access va Refresh token qaytaradi)
const loginStudent = async (req, res) => {
    const usernameRaw = typeof req.body?.username === 'string' ? req.body.username : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const username = usernameRaw.trim();

    if (!username || !password) {
        return res.status(400).json({ message: "Username va parol majburiy!" });
    }

    try {
        const result = await pool.query(
            `SELECT u.*, 
                    g.id as group_id,
                    g.name as group_name,
                    g.status as group_status,
                    r.room_number,
                    r.capacity as room_capacity,
                    r.has_projector,
                    s.name as subject_name,
                    CONCAT(t.name, ' ', t.surname) as teacher_name
             FROM users u
             LEFT JOIN student_groups sg ON u.id = sg.student_id AND sg.status = 'active'
             LEFT JOIN groups g ON sg.group_id = g.id
             LEFT JOIN rooms r ON g.room_id = r.id
             LEFT JOIN subjects s ON g.subject_id = s.id
             LEFT JOIN users t ON g.teacher_id = t.id
             WHERE LOWER(BTRIM(u.username)) = LOWER($1)
             ORDER BY sg.id DESC NULLS LAST
             LIMIT 1`, 
            [username]
        );
        const user = result.rows[0];

        if (user && (await bcrypt.compare(password, user.password))) {
            // Ikkala tokenni ham yaratamiz
            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);

            res.json({
                accessToken,
                refreshToken,
                user: { 
                    id: user.id, 
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
                    teacher_name: user.teacher_name
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
        const result = await pool.query('SELECT id, role FROM users WHERE id = $1', [decoded.id]);
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
            `SELECT u.id, u.name, u.surname, u.username, u.role, u.status, u.phone, u.phone2, u.father_name, u.father_phone, u.address, u.age, 
                    u.subject, u.start_date, u.end_date, u.certificate, u.has_experience, u.experience_years, u.experience_place, 
                    u.available_times, u.work_days_hours, u.created_at,
                    -- Guruh va xona ma'lumotlari (faqat student uchun)
                    g.id as group_id,
                    g.name as group_name,
                    g.status as group_status,
                    r.room_number,
                    r.capacity as room_capacity,
                    r.has_projector,
                    s.name as subject_name,
                    CONCAT(t.name, ' ', t.surname) as teacher_name
             FROM users u
             LEFT JOIN student_groups sg ON u.id = sg.student_id AND sg.status = 'active'
             LEFT JOIN groups g ON sg.group_id = g.id
             LEFT JOIN rooms r ON g.room_id = r.id
             LEFT JOIN subjects s ON g.subject_id = s.id
             LEFT JOIN users t ON g.teacher_id = t.id
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
        'work_days_hours'
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
                 WHERE LOWER(BTRIM(username)) = LOWER($1)
                   AND id <> $2
                 LIMIT 1`,
                [incoming.username, req.user.id]
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
             WHERE id = $${index}
             RETURNING id, name, surname, username, role, status, phone, phone2, father_name, father_phone, address, age,
                       certificate, has_experience, experience_years, experience_place, available_times, work_days_hours, created_at`
            ,
            values
        );

        if (updated.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Foydalanuvchi topilmadi"
            });
        }

        return res.json({
            success: true,
            message: "Profil ma'lumotlari yangilandi",
            updated_fields: setClauses.map((part) => part.split(' = ')[0]),
            user: updated.rows[0]
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Profil ma'lumotlarini yangilashda xatolik",
            error: err.message
        });
    }
};

// 5. Barcha teacherlarni olish (Subject filter bilan)
const getAllTeachers = async (req, res) => {
    const { subject_id, status } = req.query;
    let filters = [];
    let params = [];
    let paramIdx = 1;

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
        )`);
        params.push(subject_id);
    }
    
    const whereClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

    try {
        await ensureRecoveryKeysForRole('teacher');

        const teachers = await pool.query(`
            SELECT 
                u.id, 
                u.name, 
                u.surname, 
                u.phone, 
                u.phone2,
                u.password_reset_key_plain as recovery_key,
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
                    JOIN subjects s ON ts.subject_id = s.id
                    WHERE ts.teacher_id = u.id),
                    '[]'::json
                ) as subjects
            FROM users u
            LEFT JOIN groups g ON u.id = g.teacher_id
            WHERE u.role = 'teacher' ${whereClause}
            GROUP BY u.id, u.name, u.surname, u.phone, u.phone2, u.status, u.start_date, u.end_date, 
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
                recovery_key: teacher.recovery_key || null,
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
        
        const teacherSubjects = await pool.query(`
            SELECT s.name 
            FROM teacher_subjects ts
            JOIN subjects s ON ts.subject_id = s.id
            WHERE ts.teacher_id = $1
        `, [teacherId]);

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
        
        // Status filter uchun params
        let statusCondition = '';
        let params = [];
        
        if (status) {
            statusCondition = 'AND u.status = $1';
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
            LEFT JOIN teacher_subjects ts ON u.id = ts.teacher_id
            LEFT JOIN subjects s ON ts.subject_id = s.id
            LEFT JOIN groups g ON u.id = g.teacher_id AND g.status = 'active'
            WHERE u.role = 'teacher' 
                AND u.status != 'deleted' 
                AND EXISTS (
                    SELECT 1 FROM teacher_subjects ts2 
                    JOIN subjects s2 ON ts2.subject_id = s2.id 
                    WHERE ts2.teacher_id = u.id 
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
        const teacher = await pool.query('SELECT * FROM users WHERE id = $1 AND role = $2', [teacherId, 'teacher']);
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
             LEFT JOIN student_groups sg ON g.id = sg.group_id
             WHERE g.teacher_id = $1 AND g.status = 'active'
             GROUP BY g.id, g.name, g.unique_code
             ORDER BY g.name`,
            [teacherId]
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
            'UPDATE users SET status = $1 WHERE id = $2',
            ['on_leave', teacherId]
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
        const teacher = await pool.query('SELECT * FROM users WHERE id = $1 AND role = $2', [teacherId, 'teacher']);
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
             LEFT JOIN student_groups sg ON g.id = sg.group_id
             WHERE g.teacher_id = $1 AND g.status IN ('active', 'draft')
             GROUP BY g.id, g.name, g.unique_code, g.status
             ORDER BY g.name`,
            [teacherId]
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
            'UPDATE users SET status = $1, termination_date = $2 WHERE id = $3',
            ['terminated', termDate, teacherId]
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
        const teacher = await pool.query('SELECT * FROM users WHERE id = $1 AND role = $2', [teacherId, 'teacher']);
        if (teacher.rows.length === 0) {
            return res.status(404).json({ message: "Teacher topilmadi!" });
        }

        if (teacher.rows[0].status === 'active') {
            return res.status(400).json({ message: "Teacher allaqachon faol holatda!" });
        }

        await pool.query(
            'UPDATE users SET status = $1, termination_date = NULL WHERE id = $2',
            ['active', teacherId]
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

    try {
        await client.query('BEGIN');

        // Teacher mavjudligini tekshirish
        const teacher = await client.query(
            'SELECT id, name, surname FROM users WHERE id = $1 AND role = $2',
            [teacherId, 'teacher']
        );

        if (teacher.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Teacher topilmadi" });
        }

        // Teacher bilan bog'langan guruhlarni tekshirish
        const groups = await client.query(
            'SELECT COUNT(*) as group_count FROM groups WHERE teacher_id = $1',
            [teacherId]
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
             WHERE teacher_id_for_month = $1`,
            [teacherId]
        );
        await client.query(
            `UPDATE group_monthly_settings
             SET created_by = NULL
             WHERE created_by = $1`,
            [teacherId]
        );

        // Teacher'ni butunlay o'chirish
        await client.query('DELETE FROM users WHERE id = $1 AND role = $2', [teacherId, 'teacher']);
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

    try {
        // Teacher mavjudligini tekshirish
        const teacherExists = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND role = $2',
            [teacherId, 'teacher']
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
                'SELECT id, name FROM subjects WHERE id = ANY($1)',
                [subject_ids]
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
                WHERE id = $${keys.length + 1} AND role = 'teacher'
                RETURNING id, name, surname, username, phone, phone2,
                         certificate, age, has_experience, experience_years, experience_place,
                         available_times, work_days_hours, status, start_date
            `;

            updatedTeacher = await pool.query(updateQuery, [...values, teacherId]);
        } else {
            // Faqat teacher ma'lumotlarini olish
            updatedTeacher = await pool.query(
                `SELECT id, name, surname, username, phone, phone2,
                        certificate, age, has_experience, experience_years, experience_place,
                        available_times, work_days_hours, status, start_date
                 FROM users WHERE id = $1 AND role = 'teacher'`,
                [teacherId]
            );
        }

        // Fanlarni yangilash (agar subject_ids berilgan bo'lsa)
        if (subject_ids && Array.isArray(subject_ids) && subject_ids.length > 0) {
            // Avvalgi fanlarni o'chirish
            await pool.query('DELETE FROM teacher_subjects WHERE teacher_id = $1', [teacherId]);
            
            // Yangi fanlarni qo'shish
            for (const subjectId of subject_ids) {
                await pool.query(
                    'INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES ($1, $2)',
                    [teacherId, subjectId]
                );
            }
        }

        // Teacher fanlarini olish
        const teacherSubjects = await getTeacherSubjects(teacherId);
        
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

    try {
        // Teacher mavjudligini tekshirish
        const teacherExists = await pool.query(
            'SELECT id, name, surname FROM users WHERE id = $1 AND role = $2',
            [teacherId, 'teacher']
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
                'SELECT id, name FROM subjects WHERE id = ANY($1)',
                [subject_ids]
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
            WHERE id = $12 AND role = 'teacher'
            RETURNING id, name, surname, username, phone, phone2,
                     certificate, age, has_experience, experience_years, experience_place,
                     available_times, work_days_hours, status, start_date, created_at
        `;

        const updatedTeacher = await pool.query(updateQuery, [
            name, surname, phone, phone2, certificate, age,
            has_experience, experience_years, experience_place, available_times, work_days_hours,
            teacherId
        ]);

        // Fanlarni yangilash (agar berilgan bo'lsa)
        if (subject_ids && Array.isArray(subject_ids) && subject_ids.length > 0) {
            // Avvalgi fanlarni o'chirish
            await pool.query('DELETE FROM teacher_subjects WHERE teacher_id = $1', [teacherId]);
            
            // Yangi fanlarni qo'shish
            for (const subjectId of subject_ids) {
                await pool.query(
                    'INSERT INTO teacher_subjects (teacher_id, subject_id) VALUES ($1, $2)',
                    [teacherId, subjectId]
                );
            }
        }

        // Teacher fanlarini olish
        const teacherSubjects = await getTeacherSubjects(teacherId);
        
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
    registerTeacher, 
    loginStudent, 
    resetPasswordWithRecoveryKey,
    changePassword,
    getProfile, 
    updateProfile,
    refreshAccessToken, 
    getAllTeachers,
    getEnglishTeachers,
    checkIsEnglishTeacher,
    setTeacherOnLeave,
    terminateTeacher,
    reactivateTeacher,
    deleteTeacher,
    patchTeacher,
    updateTeacherInfo,
    changeStudentStatus
};
