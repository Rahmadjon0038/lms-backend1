const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const protect = async (req, res, next) => {
    let token;

    // 1. Headerda 'Authorization: Bearer <token>' borligini tekshirish
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Tokenni ajratib olish
            token = req.headers.authorization.split(' ')[1];

            // Access Tokenni tekshirish (JWT_SECRET orqali)
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            const userResult = await pool.query(
                `SELECT id, role, branch_id, name, surname
                 FROM users
                 WHERE id = $1
                 LIMIT 1`,
                [decoded.id]
            );

            if (userResult.rows.length === 0) {
                return res.status(401).json({ message: "Token foydalanuvchisi topilmadi!" });
            }

            const dbUser = userResult.rows[0];

            // Foydalanuvchi ma'lumotlarini requestga qo'shish.
            // Eski tokenlarda branch_id bo'lmasa ham DB orqali to'ldiriladi.
            req.user = {
                ...decoded,
                id: dbUser.id,
                role: dbUser.role,
                branch_id: dbUser.branch_id || 1,
                name: dbUser.name,
                surname: dbUser.surname
            };

            next(); // Hamma narsa joyida, keyingi funksiyaga ruxsat
        } catch (error) {
            return res.status(401).json({
                message: "Token xatosi: " + error.message,
            });
        }
    }

    if (!token) {
        return res.status(401).json({ message: "Ruxsat berilmadi, token topilmadi!" });
    }
};

// Admin uchun middleware - faqat admin va super_admin ruxsat beradi
const protectAdmin = (req, res, next) => {
    protect(req, res, () => {
        // protect middleware orqali o'tganidan keyin role tekshiriladi
        if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
            next(); // Admin yoki super admin - ruxsat beriladi
        } else {
            return res.status(403).json({ 
                success: false,
                message: "Ruxsat berilmadi! Faqat adminlar uchun." 
            });
        }
    });
};

module.exports = { protect, protectAdmin };
