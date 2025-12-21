const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    let token = req.headers.authorization;

    if (token && token.startsWith('Bearer')) {
        try {
            token = token.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded; // Token ichidagi id va role endi so'rovda bor
            next();
        } catch (error) {
            res.status(401).json({ message: "Token yaroqsiz yoki muddati o'tgan" });
        }
    } else {
        res.status(401).json({ message: "Token topilmadi, ruxsat yo'q" });
    }
};

module.exports = { protect };