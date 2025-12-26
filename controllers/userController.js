const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Yordamchi funksiya: Access Token yaratish (15 minutlik)
const generateAccessToken = (user) => {
    return jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );
};

// Yordamchi funksiya: Refresh Token yaratish (7 kunlik)
const generateRefreshToken = (user) => {
    return jwt.sign(
        { id: user.id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
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

module.exports = { registerStudent, loginStudent, getProfile, refreshAccessToken };