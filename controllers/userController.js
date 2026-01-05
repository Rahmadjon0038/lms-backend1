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

// 1. Student ro'yxatdan o'tishi (O'zgarishsiz qoldi)
const registerStudent = async (req, res) => {
    const { name, surname, username, password, phone, phone2 } = req.body;
    try {
        const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: "Bu username allaqachon mavjud!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            `INSERT INTO users (name, surname, username, password, phone, phone2) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, surname, username, role`,
            [name, surname, username, hashedPassword, phone, phone2]
        );

        res.status(201).json({ message: "Muvaffaqiyatli ro'yxatdan o'tdingiz", user: newUser.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 1.1. Teacher yaratish (Faqat adminlar uchun)
const registerTeacher = async (req, res) => {
    const { name, surname, username, password, phone, phone2, subject, startDate } = req.body;
    try {
        const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: "Bu username allaqachon mavjud!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newTeacher = await pool.query(
            `INSERT INTO users (name, surname, username, password, phone, phone2, role, subject, start_date) 
             VALUES ($1, $2, $3, $4, $5, $6, 'teacher', $7, $8) 
             RETURNING id, name, surname, username, role, subject, start_date`,
            [name, surname, username, hashedPassword, phone, phone2, subject, startDate || new Date()]
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
            'SELECT id, name, surname, username, role, status, phone, phone2, created_at FROM users WHERE id = $1',
            [req.user.id]
        );
        res.json(user.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Barcha teacherlarni olish
const getAllTeachers = async (req, res) => {
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
                u.created_at as registration_date,
                COUNT(g.id) as group_count
            FROM users u
            LEFT JOIN groups g ON u.id = g.teacher_id
            WHERE u.role = 'teacher'
            GROUP BY u.id, u.name, u.surname, u.phone, u.phone2, u.status, u.subject, u.start_date, u.end_date, u.created_at
            ORDER BY u.created_at DESC
        `);

        const formattedTeachers = teachers.rows.map(teacher => {
            // Status belgilash
            let teacherStatus = 'Faol';
            if (teacher.status === 'inactive') {
                teacherStatus = 'Nofaol';
            } else if (teacher.status === 'blocked') {
                teacherStatus = 'Bloklangan';
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
                registrationDate: teacher.registration_date ? teacher.registration_date.toISOString().split('T')[0] : null,
                phone: teacher.phone || '',
                phone2: teacher.phone2 || '',
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

module.exports = { registerStudent, registerTeacher, loginStudent, getProfile, refreshAccessToken, getAllTeachers };