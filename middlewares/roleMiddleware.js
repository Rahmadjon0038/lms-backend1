const roleCheck = (roles) => {
    return (req, res, next) => {
        // req.user sening protect middleware-ingdan keladi
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: "Sizda ushbu amalni bajarish uchun ruxsat yo'q!" 
            });
        }
        next();
    };
};

module.exports = { roleCheck };