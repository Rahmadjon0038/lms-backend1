const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    let token;

    // 1. Headerda 'Authorization: Bearer <token>' borligini tekshirish
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Tokenni ajratib olish
            token = req.headers.authorization.split(' ')[1];

            console.log("--- TOKEN DEBUG ---");
            console.log("Raw Authorization Header:", req.headers.authorization);
            console.log("Extracted Token:", token);
            console.log("Token uzunligi:", token ? token.length : 'null');
            console.log("JWT_SECRET mavjud:", !!process.env.JWT_SECRET);
            console.log("-------------------");

            // 2. Access Tokenni tekshirish (JWT_SECRET orqali)
            // .env faylingdagi JWT_SECRET=maxfiy_kalit_123@ ishlatiladi
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // 3. Foydalanuvchi ma'lumotlarini (id, role) requestga qo'shish
            req.user = decoded;

            next(); // Hamma narsa joyida, keyingi funksiyaga ruxsat
        } catch (error) {
            console.log("--- TOKEN ERROR DEBUG ---");
            console.log("Xato xabari:", error.message);
            console.log("Xato turi:", error.name);
            console.log("Raw Authorization:", req.headers.authorization);
            console.log("Ajratilgan token:", token);
            console.log("Token mavjudmi:", !!token);
            console.log("Secret mavjudmi:", !!process.env.JWT_SECRET);
            console.log("Secret qiymati:", process.env.JWT_SECRET);
            console.log("-------------------------");

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