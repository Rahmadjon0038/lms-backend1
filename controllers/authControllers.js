const userModel = require('../models/userModel');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); // Parollarni solishtirish uchun

const addUserByAdmin = async (req, res) => {
    try {
        const { username, password, role, email, createdBy } = req.body;

        // 1. Username band emasligini tekshirish
        const existingUser = await userModel.findUserByUsername(username);
        if (existingUser) {
            return res.status(400).json({ message: "Bu username allaqachon mavjud!" });
        }

        // 2. Parolni shifrlash (Xavfsizlik uchun)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Bazaga saqlash
        const newUser = await userModel.createUser({
            username,
            password: hashedPassword, // Shifrlangan parolni saqlaymiz
            role,
            email,
            createdBy
        });

        res.status(201).json({
            success: true,
            message: "Foydalanuvchi muvaffaqiyatli yaratildi",
            data: {
                id: newUser.id,
                username: newUser.username,
                role: newUser.role
            }
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ success: false, message: "Serverda xatolik yuz berdi" });
    }
};

const loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Foydalanuvchini izlash
        const user = await userModel.findUserByUsername(username);
        if (!user) {
            return res.status(404).json({ success: false, message: "Foydalanuvchi topilmadi" });
        }

        // 2. Parolni tekshirish (bcrypt bilan solishtirish)
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Parol noto'g'ri" });
        }

        // 3. Token yaratish
        const token = jwt.sign(
            { id: user.id, role: user.role }, 
            process.env.JWT_SECRET, 
            { expiresIn: '24h' }
        );

        // Siz so'ragan muvaffaqiyatli javob formati
        res.status(200).json({
            success: true,
            message: "Tizimga muvaffaqiyatli kirdingiz",
            token: token,
            role: user.role
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { addUserByAdmin, loginUser };