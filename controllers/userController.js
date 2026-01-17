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

// 1.1. Teacher yaratish (Faqat adminlar uchun) - subject_id bilan
const registerTeacher = async (req, res) => {
    const { 
        name, surname, username, password, phone, phone2, subject_id, startDate,
        certificate, age, has_experience, experience_years, experience_place, 
        available_times, work_days_hours 
    } = req.body;
    
    try {
        // Username mavjudligini tekshirish
        const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ message: "Bu username allaqachon mavjud!" });
        }

        // Subject mavjudligini tekshirish
        if (subject_id) {
            const subjectExists = await pool.query('SELECT id, name FROM subjects WHERE id = $1', [subject_id]);
            if (subjectExists.rows.length === 0) {
                return res.status(400).json({ message: "Bunday subject mavjud emas" });
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Subject nomini olish (agar subject_id berilgan bo'lsa)
        let subjectName = null;
        if (subject_id) {
            const subjectResult = await pool.query('SELECT name FROM subjects WHERE id = $1', [subject_id]);
            subjectName = subjectResult.rows[0]?.name;
        }

        const newTeacher = await pool.query(
            `INSERT INTO users (name, surname, username, password, phone, phone2, role, subject_id, subject, start_date, 
                               certificate, age, has_experience, experience_years, experience_place, 
                               available_times, work_days_hours) 
             VALUES ($1, $2, $3, $4, $5, $6, 'teacher', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
             RETURNING id, name, surname, username, role, subject_id, subject, start_date, certificate, age, 
                       has_experience, experience_years, experience_place, available_times, work_days_hours`,
            [name, surname, username, hashedPassword, phone, phone2, subject_id, subjectName, startDate || new Date(),
             certificate, age, has_experience || false, experience_years, experience_place, 
             available_times, work_days_hours]
        );

        res.status(201).json({ 
            message: "Teacher muvaffaqiyatli yaratildi", 
            teacher: newTeacher.rows[0],
            subject: {
                id: subject_id,
                name: subjectName
            }
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

    // Subject filter - teacher'ning o'z subject_id si bo'yicha
    if (subject_id) {
        filters.push(`u.subject_id = $${paramIdx++}`);
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
                u.subject_id,
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
                sub.name as subject_name
            FROM users u
            LEFT JOIN groups g ON u.id = g.teacher_id
            LEFT JOIN subjects sub ON u.subject_id = sub.id
            WHERE u.role = 'teacher' ${whereClause}
            GROUP BY u.id, u.name, u.surname, u.phone, u.phone2, u.status, u.subject, u.subject_id, u.start_date, u.end_date, 
                     u.certificate, u.age, u.has_experience, u.experience_years, u.experience_place, 
                     u.available_times, u.work_days_hours, u.created_at, sub.name
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
                subject: teacher.subject || teacher.subject_name || 'Belgilanmagan',
                subject_id: teacher.subject_id,
                subject_name: teacher.subject_name,
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

// 9. Teacher'ni butunlay o'chirish (DELETE)
const deleteTeacher = async (req, res) => {
    const { teacherId } = req.params;

    try {
        // Teacher mavjudligini tekshirish
        const teacher = await pool.query(
            'SELECT id, name, surname FROM users WHERE id = $1 AND role = $2',
            [teacherId, 'teacher']
        );

        if (teacher.rows.length === 0) {
            return res.status(404).json({ message: "Teacher topilmadi" });
        }

        // Teacher bilan bog'langan guruhlarni tekshirish
        const groups = await pool.query(
            'SELECT COUNT(*) as group_count FROM groups WHERE teacher_id = $1',
            [teacherId]
        );

        if (parseInt(groups.rows[0].group_count) > 0) {
            return res.status(400).json({ 
                message: "Bu teacher'ga bog'langan guruhlar mavjud. Avval guruhlarni boshqa teacher'ga o'tkazing yoki o'chiring.",
                groups_count: groups.rows[0].group_count
            });
        }

        // Teacher'ni butunlay o'chirish
        await pool.query('DELETE FROM users WHERE id = $1 AND role = $2', [teacherId, 'teacher']);

        res.json({ 
            message: `${teacher.rows[0].name} ${teacher.rows[0].surname} butunlay o'chirildi`,
            deleted_teacher_id: teacherId
        });

    } catch (err) {
        res.status(500).json({ 
            error: "Teacher'ni o'chirishda xatolik yuz berdi",
            details: err.message 
        });
    }
};

// 10. Teacher ma'lumotlarini to'liq yangilash (PUT)
const updateTeacher = async (req, res) => {
    const { teacherId } = req.params;
    const { 
        name, surname, username, password, phone, phone2, subject_id,
        certificate, age, has_experience, experience_years, experience_place,
        available_times, work_days_hours 
    } = req.body;

    try {
        // Teacher mavjudligini tekshirish
        const teacherExists = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND role = $2',
            [teacherId, 'teacher']
        );

        if (teacherExists.rows.length === 0) {
            return res.status(404).json({ message: "Teacher topilmadi" });
        }

        // Username unique ekanini tekshirish (o'zidan tashqari)
        if (username) {
            const usernameTaken = await pool.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [username, teacherId]
            );

            if (usernameTaken.rows.length > 0) {
                return res.status(400).json({ message: "Bu username allaqachon band" });
            }
        }

        // Subject mavjudligini tekshirish
        let subjectName = null;
        if (subject_id) {
            const subjectExists = await pool.query('SELECT id, name FROM subjects WHERE id = $1', [subject_id]);
            if (subjectExists.rows.length === 0) {
                return res.status(400).json({ message: "Bunday subject mavjud emas" });
            }
            subjectName = subjectExists.rows[0].name;
        }

        // Parol hash qilish (agar yangi parol berilgan bo'lsa)
        let hashedPassword = null;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
        }

        // Teacher ma'lumotlarini yangilash
        const updateQuery = `
            UPDATE users SET 
                name = COALESCE($1, name),
                surname = COALESCE($2, surname),
                username = COALESCE($3, username),
                password = COALESCE($4, password),
                phone = COALESCE($5, phone),
                phone2 = COALESCE($6, phone2),
                subject_id = COALESCE($7, subject_id),
                subject = COALESCE($8, subject),
                certificate = COALESCE($9, certificate),
                age = COALESCE($10, age),
                has_experience = COALESCE($11, has_experience),
                experience_years = COALESCE($12, experience_years),
                experience_place = COALESCE($13, experience_place),
                available_times = COALESCE($14, available_times),
                work_days_hours = COALESCE($15, work_days_hours)
            WHERE id = $16 AND role = 'teacher'
            RETURNING id, name, surname, username, phone, phone2, subject_id, subject, 
                     certificate, age, has_experience, experience_years, experience_place,
                     available_times, work_days_hours, status, start_date
        `;

        const updatedTeacher = await pool.query(updateQuery, [
            name, surname, username, hashedPassword, phone, phone2, subject_id, subjectName,
            certificate, age, has_experience, experience_years, experience_place,
            available_times, work_days_hours, teacherId
        ]);

        res.json({
            message: "Teacher ma'lumotlari muvaffaqiyatli yangilandi",
            teacher: updatedTeacher.rows[0]
        });

    } catch (err) {
        res.status(500).json({ 
            error: "Teacher'ni yangilashda xatolik yuz berdi",
            details: err.message 
        });
    }
};

// 11. Teacher ma'lumotlarini qisman yangilash (PATCH)
const patchTeacher = async (req, res) => {
    const { teacherId } = req.params;
    const updateFields = req.body;

    try {
        // Teacher mavjudligini tekshirish
        const teacherExists = await pool.query(
            'SELECT id FROM users WHERE id = $1 AND role = $2',
            [teacherId, 'teacher']
        );

        if (teacherExists.rows.length === 0) {
            return res.status(404).json({ message: "Teacher topilmadi" });
        }

        // Bo'sh obyekt tekshiruvi
        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: "Yangilanishi kerak bo'lgan maydonlar ko'rsatilmagan" });
        }

        // Username unique ekanini tekshirish
        if (updateFields.username) {
            const usernameTaken = await pool.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [updateFields.username, teacherId]
            );

            if (usernameTaken.rows.length > 0) {
                return res.status(400).json({ message: "Bu username allaqachon band" });
            }
        }

        // Subject tekshiruvi va nom olish
        if (updateFields.subject_id) {
            const subjectExists = await pool.query('SELECT id, name FROM subjects WHERE id = $1', [updateFields.subject_id]);
            if (subjectExists.rows.length === 0) {
                return res.status(400).json({ message: "Bunday subject mavjud emas" });
            }
            updateFields.subject = subjectExists.rows[0].name;
        }

        // Parol hash qilish
        if (updateFields.password) {
            const salt = await bcrypt.genSalt(10);
            updateFields.password = await bcrypt.hash(updateFields.password, salt);
        }

        // Dinamik query yaratish
        const keys = Object.keys(updateFields);
        const values = Object.values(updateFields);
        const setClause = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');
        
        const updateQuery = `
            UPDATE users SET ${setClause}
            WHERE id = $${keys.length + 1} AND role = 'teacher'
            RETURNING id, name, surname, username, phone, phone2, subject_id, subject, 
                     certificate, age, has_experience, experience_years, experience_place,
                     available_times, work_days_hours, status, start_date
        `;

        const updatedTeacher = await pool.query(updateQuery, [...values, teacherId]);

        res.json({
            message: "Teacher ma'lumotlari qisman yangilandi",
            updated_fields: keys,
            teacher: updatedTeacher.rows[0]
        });

    } catch (err) {
        res.status(500).json({ 
            error: "Teacher'ni qisman yangilashda xatolik yuz berdi",
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
    reactivateTeacher,
    deleteTeacher,
    updateTeacher,
    patchTeacher
};