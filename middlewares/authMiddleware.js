const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    let token;

    // 1. Headerda 'Authorization: Bearer <token>' borligini tekshirish
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Tokenni ajratib olish
            token = req.headers.authorization.split(' ')[1];

            // 2. Access Tokenni tekshirish (JWT_SECRET orqali)
            // .env faylingdagi JWT_SECRET=maxfiy_kalit_123@ ishlatiladi
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // 3. Foydalanuvchi ma'lumotlarini (id, role) requestga qo'shish
            req.user = decoded;

            next(); // Hamma narsa joyida, keyingi funksiyaga ruxsat
        } catch (error) {
            console.log("--- TOKEN DEBUG ---");
            console.log("Xato xabari:", error.message);
            console.log("Ishlatilgan Secret:", process.env.JWT_SECRET);
            console.log("-------------------");

            return res.status(401).json({
                message: "Token xatosi: " + error.message,
            });
        }
    }

    if (!token) {
        return res.status(401).json({ message: "Ruxsat berilmadi, token topilmadi!" });
    }
};

module.exports = { protect };