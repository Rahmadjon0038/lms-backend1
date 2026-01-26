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

/**
 * Faqat super adminlar uchun middleware
 */
const protectSuperAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'super_admin') {
        return res.status(403).json({ 
            success: false,
            message: "Faqat super adminlar bu ma'lumotlarga kirish huquqiga ega!" 
        });
    }
    next();
};

module.exports = { roleCheck, protectSuperAdmin };