const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

        const newUser = await pool.query(
            `INSERT INTO users (name, surname, username, password, phone, phone2, father_name, father_phone, address, age) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
             RETURNING id, name, surname, username, role, father_name, father_phone, address, age`,
            [name, surname, username, hashedPassword, phone, phone2, father_name, father_phone, address, age]
        );

        res.status(201).json({ message: "Muvaffaqiyatli ro'yxatdan o'tdingiz", user: newUser.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 1.1. Teacher yaratish (Faqat adminlar uchun)
const registerTeacher = async (req, res) => {
    const { 
        name, surname, username, password, phone, phone2, subject, startDate,
        certificate, age, has_experience, experience_years, experience_place, 
        available_times, work_days_hours 
    } = req.body;
    try {
        const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: "Bu username allaqachon mavjud!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newTeacher = await pool.query(
            `INSERT INTO users (name, surname, username, password, phone, phone2, role, subject, start_date, 
                               certificate, age, has_experience, experience_years, experience_place, 
                               available_times, work_days_hours) 
             VALUES ($1, $2, $3, $4, $5, $6, 'teacher', $7, $8, $9, $10, $11, $12, $13, $14, $15) 
             RETURNING id, name, surname, username, role, subject, start_date, certificate, age, 
                       has_experience, experience_years, experience_place, available_times, work_days_hours`,
            [name, surname, username, hashedPassword, phone, phone2, subject, startDate || new Date(),
             certificate, age, has_experience || false, experience_years, experience_place, 
             available_times, work_days_hours]
        );

        res.status(201).json({ 
            message: "Teacher muvaffaqiyatli yaratildi", 
            teacher: newTeacher.rows[0] 
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
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (user && (await bcrypt.compare(password, user.password))) {
            // Ikkala tokenni ham yaratamiz
            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);

            res.json({
                accessToken,
                refreshToken,
                user: { id: user.id, name: user.name, role: user.role }
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
            `SELECT id, name, surname, username, role, status, phone, phone2, father_name, father_phone, address, age, 
                    subject, start_date, end_date, certificate, has_experience, experience_years, experience_place, 
                    available_times, work_days_hours, created_at 
             FROM users WHERE id = $1`,
            [req.user.id]
        );
        res.json(user.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Barcha teacherlarni olish (Subject filter bilan)
const getAllTeachers = async (req, res) => {
    const { subject_id, status } = req.query;
    let filters = [];
    let params = [];
    let paramIdx = 1;

    // Status filter
    if (status) {
        filters.push(`u.status = $${paramIdx++}`);
        params.push(status);
    }

    // Subject filter uchun alohida WHERE shart
    let subjectFilter = '';
    if (subject_id) {
        subjectFilter = `AND EXISTS (
            SELECT 1 FROM groups g WHERE g.teacher_id = u.id AND g.subject_id = $${paramIdx++}
        )`;
        params.push(subject_id);
    }
    
    const whereClause = filters.length > 0 ? 'AND ' + filters.join(' AND ') : '';

    try {
        const teachers = await pool.query(`
            SELECT 
                u.id, 
                u.name, 
                u.surname, 
                u.phone, 
                u.phone2,
                u.status,
                u.subject,
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
                STRING_AGG(DISTINCT s.name, ', ') as subject_names
            FROM users u
            LEFT JOIN groups g ON u.id = g.teacher_id
            LEFT JOIN subjects s ON g.subject_id = s.id
            WHERE u.role = 'teacher' ${whereClause} ${subjectFilter}
            GROUP BY u.id, u.name, u.surname, u.phone, u.phone2, u.status, u.subject, u.start_date, u.end_date, 
                     u.certificate, u.age, u.has_experience, u.experience_years, u.experience_place, 
                     u.available_times, u.work_days_hours, u.created_at
            ORDER BY u.created_at DESC
        `, params);

        const formattedTeachers = teachers.rows.map(teacher => {
            // Status belgilash
            let teacherStatus = 'Faol';
            if (teacher.status === 'inactive') {
                teacherStatus = 'Nofaol';
            } else if (teacher.status === 'blocked') {
                teacherStatus = 'Bloklangan';
            } else if (teacher.status === 'on_leave') {
                teacherStatus = 'Dam olish';
            } else if (teacher.status === 'terminated') {
                teacherStatus = 'Ishdan boshatilgan';
            } else if (teacher.end_date && new Date(teacher.end_date) < new Date()) {
                teacherStatus = 'Ishdan ketgan';
            }

            return {
                id: teacher.id,
                name: teacher.name,
                surname: teacher.surname,
                subject: teacher.subject || 'Belgilanmagan',
                status: teacherStatus,
                isActive: teacher.status === 'active' && (!teacher.end_date || new Date(teacher.end_date) >= new Date()),
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

        res.json({
            message: "Teacherlar muvaffaqiyatli olindi",
            teachers: formattedTeachers,
            total: formattedTeachers.length
        });
    } catch (err) {
        console.error('Teacherlarni olishda xatolik:', err);
        res.status(500).json({ 
            error: "Teacherlarni olishda xatolik yuz berdi",
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

        await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2',
            ['on_leave', teacherId]
        );

        res.json({ 
            message: "Teacher dam olishga chiqarildi",
            teacher: { 
                id: teacherId, 
                status: 'on_leave',
                name: teacher.rows[0].name + ' ' + teacher.rows[0].surname
            }
        });
    } catch (err) {
        res.status(500).json({ 
            error: "Teacher'ni dam olishga chiqarishda xatolik yuz berdi",
            details: err.message 
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

        const termDate = terminationDate || new Date().toISOString().split('T')[0];
        
        await pool.query(
            'UPDATE users SET status = $1, termination_date = $2 WHERE id = $3',
            ['terminated', termDate, teacherId]
        );

        res.json({ 
            message: "Teacher ishdan boshatildi",
            teacher: { 
                id: teacherId, 
                status: 'terminated',
                terminationDate: termDate,
                name: teacher.rows[0].name + ' ' + teacher.rows[0].surname
            }
        });
    } catch (err) {
        res.status(500).json({ 
            error: "Teacher'ni ishdan boshatishda xatolik yuz berdi",
            details: err.message 
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

module.exports = { 
    registerStudent, 
    registerTeacher, 
    loginStudent, 
    getProfile, 
    refreshAccessToken, 
    getAllTeachers,
    setTeacherOnLeave,
    terminateTeacher,
    reactivateTeacher 
};