const pool = require('../config/db');
const { 
    autoCalculateAllTeachersSalary, 
    checkTeachersDebts, 
    generateDetailedTeacherReport,
    calculateTeacherSalaryInternal 
} = require('../utils/teacherSalaryUtils');

// 1. O'qituvchi maosh sozlamalarini belgilash
exports.setTeacherSalarySettings = async (req, res) => {
    const { 
        teacher_id, 
        base_percentage, 
        bonus_percentage,
        experience_bonus_threshold,
        experience_bonus_rate 
    } = req.body;
    
    if (!teacher_id || !base_percentage) {
        return res.status(400).json({
            success: false,
            message: "teacher_id va base_percentage majburiy"
        });
    }

    try {
        // O'qituvchi mavjudligini tekshirish
        const teacher = await pool.query(
            'SELECT id, name, surname FROM users WHERE id = $1 AND role = $2',
            [teacher_id, 'teacher']
        );

        if (teacher.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "O'qituvchi topilmadi"
            });
        }

        // Sozlamalarni saqlash/yangilash
        const result = await pool.query(`
            INSERT INTO teacher_salary_settings (
                teacher_id, base_percentage, bonus_percentage, 
                experience_bonus_threshold, experience_bonus_rate
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (teacher_id) 
            DO UPDATE SET 
                base_percentage = $2,
                bonus_percentage = $3,
                experience_bonus_threshold = $4,
                experience_bonus_rate = $5,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [teacher_id, base_percentage, bonus_percentage || 0, 
            experience_bonus_threshold || 6, experience_bonus_rate || 5]);

        res.json({
            success: true,
            message: `${teacher.rows[0].name} ${teacher.rows[0].surname} uchun maosh sozlamalari belgilandi`,
            data: result.rows[0]
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Sozlamalarni saqlashda xato",
            error: err.message
        });
    }
};

// 2. O'qituvchi avans berish
exports.giveTeacherAdvance = async (req, res) => {
    const { teacher_id, amount, month_name, description } = req.body;
    const admin_id = req.user.id;

    if (!teacher_id || !amount || !month_name) {
        return res.status(400).json({
            success: false,
            message: "teacher_id, amount va month_name majburiy"
        });
    }

    try {
        // O'qituvchi mavjudligini tekshirish
        const teacher = await pool.query(
            'SELECT id, name, surname FROM users WHERE id = $1 AND role = $2',
            [teacher_id, 'teacher']
        );

        if (teacher.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "O'qituvchi topilmadi"
            });
        }

        // Avans berish
        const advance = await pool.query(`
            INSERT INTO teacher_advances (teacher_id, amount, month_name, description, created_by)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [teacher_id, amount, month_name, description, admin_id]);

        res.json({
            success: true,
            message: `${teacher.rows[0].name} ${teacher.rows[0].surname} ga ${amount} so'm avans berildi`,
            advance: advance.rows[0]
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Avans berishda xato",
            error: err.message
        });
    }
};

// 3. Oylik maosh hisoblash (asosiy funksiya)
exports.calculateMonthlySalary = async (req, res) => {
    const { teacher_id, month_name } = req.body;

    if (!teacher_id || !month_name) {
        return res.status(400).json({
            success: false,
            message: "teacher_id va month_name majburiy"
        });
    }

    try {
        // O'qituvchi va uning sozlamalarini olish
        const teacherQuery = await pool.query(`
            SELECT 
                u.id, u.name, u.surname, u.start_date,
                COALESCE(tss.base_percentage, 50) as base_percentage,
                COALESCE(tss.bonus_percentage, 0) as bonus_percentage,
                COALESCE(tss.experience_bonus_threshold, 6) as experience_bonus_threshold,
                COALESCE(tss.experience_bonus_rate, 5) as experience_bonus_rate
            FROM users u
            LEFT JOIN teacher_salary_settings tss ON u.id = tss.teacher_id
            WHERE u.id = $1 AND u.role = 'teacher'
        `, [teacher_id]);

        if (teacherQuery.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "O'qituvchi topilmadi"
            });
        }

        const teacher = teacherQuery.rows[0];

        // O'qituvchining guruhlaridan tushgan jami to'lovlarni hisoblash
        const studentPayments = await pool.query(`
            SELECT 
                COALESCE(SUM(p.amount), 0) as total_payments,
                COUNT(DISTINCT p.student_id) as active_students
            FROM payments p
            JOIN users s ON p.student_id = s.id
            JOIN groups g ON p.group_id = g.id
            WHERE g.teacher_id = $1 AND p.month_name = $2
        `, [teacher_id, month_name]);

        const totalStudentPayments = parseFloat(studentPayments.rows[0].total_payments || 0);
        const activeStudents = parseInt(studentPayments.rows[0].active_students || 0);

        // Tajriba oylarini hisoblash
        const experienceMonths = teacher.start_date ? 
            Math.floor((new Date() - new Date(teacher.start_date)) / (1000 * 60 * 60 * 24 * 30)) : 0;

        // Asosiy maosh
        const baseSalary = totalStudentPayments * (teacher.base_percentage / 100);

        // Tajriba bonusi
        let experienceBonus = 0;
        if (experienceMonths >= teacher.experience_bonus_threshold) {
            experienceBonus = baseSalary * (teacher.experience_bonus_rate / 100);
        }

        // Boshqa bonuslar (hozircha 0)
        const otherBonuses = baseSalary * (teacher.bonus_percentage / 100);

        // Jami ishlangan
        const totalEarned = baseSalary + experienceBonus + otherBonuses;

        // Shu oydan olingan avanslar
        const advances = await pool.query(`
            SELECT COALESCE(SUM(amount), 0) as total_advances
            FROM teacher_advances 
            WHERE teacher_id = $1 AND month_name = $2
        `, [teacher_id, month_name]);

        const totalAdvances = parseFloat(advances.rows[0].total_advances || 0);

        // O'tgan oydan qolgan qarzni tekshirish
        const previousMonth = new Date(month_name + '-01');
        previousMonth.setMonth(previousMonth.getMonth() - 1);
        const previousMonthStr = previousMonth.toISOString().slice(0, 7);

        const previousDebt = await pool.query(`
            SELECT COALESCE(final_salary, 0) as debt
            FROM teacher_monthly_salaries 
            WHERE teacher_id = $1 AND month_name = $2 AND final_salary < 0
        `, [teacher_id, previousMonthStr]);

        const debtFromPrevious = parseFloat(previousDebt.rows[0]?.debt || 0);

        // Final maosh (qarz hisobga olingan holda)
        const finalSalary = totalEarned - totalAdvances + debtFromPrevious;

        // Monthly salary jadvaliga saqlash/yangilash
        const monthlySalary = await pool.query(`
            INSERT INTO teacher_monthly_salaries (
                teacher_id, month_name, total_student_payments, base_salary,
                experience_bonus, other_bonuses, total_earned, total_advances,
                final_salary, debt_from_previous
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (teacher_id, month_name)
            DO UPDATE SET 
                total_student_payments = $3,
                base_salary = $4,
                experience_bonus = $5,
                other_bonuses = $6,
                total_earned = $7,
                total_advances = $8,
                final_salary = $9,
                debt_from_previous = $10,
                calculated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [teacher_id, month_name, totalStudentPayments, baseSalary,
            experienceBonus, otherBonuses, totalEarned, totalAdvances,
            finalSalary, debtFromPrevious]);

        res.json({
            success: true,
            message: "Oylik maosh hisoblandi",
            teacher: {
                id: teacher.id,
                name: teacher.name,
                surname: teacher.surname,
                experience_months: experienceMonths
            },
            calculation: {
                total_student_payments: totalStudentPayments,
                active_students: activeStudents,
                base_percentage: teacher.base_percentage,
                base_salary: baseSalary,
                experience_bonus: experienceBonus,
                other_bonuses: otherBonuses,
                total_earned: totalEarned,
                total_advances: totalAdvances,
                debt_from_previous: debtFromPrevious,
                final_salary: finalSalary
            },
            monthly_salary: monthlySalary.rows[0]
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Maosh hisoblashda xato",
            error: err.message
        });
    }
};

// 4. Barcha o'qituvchilarning oylik maoshini hisoblash
exports.calculateAllTeachersSalary = async (req, res) => {
    const { month_name } = req.body;

    if (!month_name) {
        return res.status(400).json({
            success: false,
            message: "month_name majburiy"
        });
    }

    try {
        // Barcha faol o'qituvchilarni olish
        const teachers = await pool.query(`
            SELECT id, name, surname 
            FROM users 
            WHERE role = 'teacher' AND status = 'active'
        `);

        const results = [];
        
        for (const teacher of teachers.rows) {
            try {
                // Har bir o'qituvchi uchun maosh hisoblash
                const calculation = await calculateTeacherSalaryInternal(teacher.id, month_name);
                results.push({
                    teacher: teacher,
                    calculation: calculation,
                    status: 'success'
                });
            } catch (err) {
                results.push({
                    teacher: teacher,
                    error: err.message,
                    status: 'error'
                });
            }
        }

        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;

        res.json({
            success: true,
            message: `${successCount} o'qituvchi maoshi hisoblandi, ${errorCount} ta xato`,
            month_name: month_name,
            results: results
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Barcha o'qituvchilar maoshini hisoblashda xato",
            error: err.message
        });
    }
};

// 5. O'qituvchi maoshi to'lash
exports.payTeacherSalary = async (req, res) => {
    const { teacher_id, month_name, payment_amount, description } = req.body;
    const admin_id = req.user.id;

    if (!teacher_id || !month_name || !payment_amount) {
        return res.status(400).json({
            success: false,
            message: "teacher_id, month_name va payment_amount majburiy"
        });
    }

    try {
        // Oylik maosh mavjudligini tekshirish
        const monthlySalary = await pool.query(`
            SELECT * FROM teacher_monthly_salaries 
            WHERE teacher_id = $1 AND month_name = $2
        `, [teacher_id, month_name]);

        if (monthlySalary.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Oylik maosh hisob-kitobi topilmadi. Avval hisoblang!"
            });
        }

        const salary = monthlySalary.rows[0];

        // To'lovni qayd qilish
        const payment = await pool.query(`
            INSERT INTO teacher_salary_payments (
                teacher_id, monthly_salary_id, amount, payment_type, description, created_by
            ) VALUES ($1, $2, $3, 'salary', $4, $5)
            RETURNING *
        `, [teacher_id, salary.id, payment_amount, description, admin_id]);

        // Monthly salary ni to'langan deb belgilash
        const totalPaid = await pool.query(`
            SELECT COALESCE(SUM(amount), 0) as total_paid
            FROM teacher_salary_payments 
            WHERE monthly_salary_id = $1
        `, [salary.id]);

        const totalPaidAmount = parseFloat(totalPaid.rows[0].total_paid);
        const isPaid = totalPaidAmount >= salary.final_salary;

        if (isPaid) {
            await pool.query(`
                UPDATE teacher_monthly_salaries 
                SET is_paid = true, payment_date = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [salary.id]);
        }

        // O'qituvchi ma'lumotlarini olish
        const teacher = await pool.query(`
            SELECT name, surname FROM users WHERE id = $1
        `, [teacher_id]);

        res.json({
            success: true,
            message: `${teacher.rows[0].name} ${teacher.rows[0].surname} ga maosh to'landi`,
            payment: payment.rows[0],
            total_paid: totalPaidAmount,
            remaining: salary.final_salary - totalPaidAmount,
            is_fully_paid: isPaid
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Maosh to'lashda xato",
            error: err.message
        });
    }
};

// 6. O'qituvchi oylik hisobot
exports.getTeacherMonthlySalary = async (req, res) => {
    const { teacher_id } = req.params;
    const { month_name } = req.query;

    if (!month_name) {
        return res.status(400).json({
            success: false,
            message: "month_name parametri majburiy"
        });
    }

    try {
        // O'qituvchi ma'lumotlari va maosh hisobi
        const result = await pool.query(`
            SELECT 
                u.name, u.surname, u.start_date,
                tms.*,
                tss.base_percentage, tss.bonus_percentage,
                tss.experience_bonus_threshold, tss.experience_bonus_rate
            FROM users u
            LEFT JOIN teacher_monthly_salaries tms ON u.id = tms.teacher_id AND tms.month_name = $2
            LEFT JOIN teacher_salary_settings tss ON u.id = tss.teacher_id
            WHERE u.id = $1 AND u.role = 'teacher'
        `, [teacher_id, month_name]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "O'qituvchi topilmadi"
            });
        }

        const teacher = result.rows[0];

        // Avanslar
        const advances = await pool.query(`
            SELECT * FROM teacher_advances 
            WHERE teacher_id = $1 AND month_name = $2
            ORDER BY created_at
        `, [teacher_id, month_name]);

        // To'lovlar
        const payments = await pool.query(`
            SELECT * FROM teacher_salary_payments 
            WHERE teacher_id = $1 AND monthly_salary_id = $2
            ORDER BY created_at
        `, [teacher_id, teacher.id]);

        // Guruhlar va studentlar
        const groups = await pool.query(`
            SELECT 
                g.id, g.name, g.price,
                COUNT(u.id) as student_count,
                COALESCE(SUM(p.amount), 0) as group_payments
            FROM groups g
            LEFT JOIN users u ON g.id = u.group_id AND u.role = 'student'
            LEFT JOIN payments p ON p.group_id = g.id AND p.month_name = $2
            WHERE g.teacher_id = $1
            GROUP BY g.id, g.name, g.price
        `, [teacher_id, month_name]);

        res.json({
            success: true,
            teacher: {
                id: teacher_id,
                name: teacher.name,
                surname: teacher.surname,
                start_date: teacher.start_date
            },
            month_name: month_name,
            salary_calculation: {
                total_student_payments: teacher.total_student_payments,
                base_salary: teacher.base_salary,
                experience_bonus: teacher.experience_bonus,
                other_bonuses: teacher.other_bonuses,
                total_earned: teacher.total_earned,
                total_advances: teacher.total_advances,
                debt_from_previous: teacher.debt_from_previous,
                final_salary: teacher.final_salary,
                is_paid: teacher.is_paid,
                payment_date: teacher.payment_date
            },
            settings: {
                base_percentage: teacher.base_percentage,
                bonus_percentage: teacher.bonus_percentage,
                experience_bonus_threshold: teacher.experience_bonus_threshold,
                experience_bonus_rate: teacher.experience_bonus_rate
            },
            advances: advances.rows,
            payments: payments.rows,
            groups: groups.rows
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Ma'lumotlarni olishda xato",
            error: err.message
        });
    }
};

// 7. Barcha o'qituvchilar oylik hisoboti
exports.getAllTeachersSalaryReport = async (req, res) => {
    const { month_name } = req.query;

    if (!month_name) {
        return res.status(400).json({
            success: false,
            message: "month_name parametri majburiy"
        });
    }

    try {
        const teachers = await pool.query(`
            SELECT 
                u.id, u.name, u.surname, u.start_date,
                tms.total_student_payments, tms.base_salary, tms.experience_bonus,
                tms.other_bonuses, tms.total_earned, tms.total_advances,
                tms.debt_from_previous, tms.final_salary, tms.is_paid, tms.payment_date,
                tss.base_percentage,
                COUNT(g.id) as group_count,
                COUNT(s.id) as student_count
            FROM users u
            LEFT JOIN teacher_monthly_salaries tms ON u.id = tms.teacher_id AND tms.month_name = $1
            LEFT JOIN teacher_salary_settings tss ON u.id = tss.teacher_id
            LEFT JOIN groups g ON u.id = g.teacher_id
            LEFT JOIN users s ON g.id = s.group_id AND s.role = 'student' AND s.status = 'active'
            WHERE u.role = 'teacher' AND u.status = 'active'
            GROUP BY u.id, u.name, u.surname, u.start_date, tms.id, tss.base_percentage
            ORDER BY u.surname, u.name
        `, [month_name]);

        // O'tgan oydan qarzlari bo'lgan o'qituvchilar
        const previousMonth = new Date(month_name + '-01');
        previousMonth.setMonth(previousMonth.getMonth() - 1);
        const previousMonthStr = previousMonth.toISOString().slice(0, 7);

        const unpaidPreviousMonth = await pool.query(`
            SELECT 
                u.name, u.surname, tms.final_salary as debt
            FROM teacher_monthly_salaries tms
            JOIN users u ON tms.teacher_id = u.id
            WHERE tms.month_name = $1 AND tms.final_salary < 0
        `, [previousMonthStr]);

        res.json({
            success: true,
            month_name: month_name,
            teachers: teachers.rows,
            summary: {
                total_teachers: teachers.rows.length,
                paid_teachers: teachers.rows.filter(t => t.is_paid).length,
                unpaid_teachers: teachers.rows.filter(t => !t.is_paid).length,
                total_earned: teachers.rows.reduce((sum, t) => sum + (parseFloat(t.total_earned) || 0), 0),
                total_advances: teachers.rows.reduce((sum, t) => sum + (parseFloat(t.total_advances) || 0), 0),
                total_final: teachers.rows.reduce((sum, t) => sum + (parseFloat(t.final_salary) || 0), 0)
            },
            previous_month_debts: unpaidPreviousMonth.rows
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Hisobotni olishda xato",
            error: err.message
        });
    }
};

// 8. O'tgan oydan qarzlarni tekshirish
exports.checkPreviousDebts = async (req, res) => {
    const { month_name } = req.query;

    if (!month_name) {
        return res.status(400).json({
            success: false,
            message: "month_name parametri majburiy"
        });
    }

    try {
        const debtsInfo = await checkTeachersDebts(month_name);
        
        res.json({
            success: true,
            message: debtsInfo.has_debts ? "Qarzlar topildi" : "Qarz yo'q",
            ...debtsInfo
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Qarzlarni tekshirishda xato",
            error: err.message
        });
    }
};

// 9. O'qituvchi tafsili hisoboti
exports.getDetailedTeacherReport = async (req, res) => {
    const { teacher_id } = req.params;
    const { month_name } = req.query;

    if (!month_name) {
        return res.status(400).json({
            success: false,
            message: "month_name parametri majburiy"
        });
    }

    try {
        const report = await generateDetailedTeacherReport(teacher_id, month_name);
        
        res.json({
            success: true,
            message: "Tafsili hisobot yaratildi",
            report: report
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Hisobotni yaratishda xato",
            error: err.message
        });
    }
};

// 10. Avtomatik hisoblash (test uchun)
exports.autoCalculateSalaries = async (req, res) => {
    const { month_name } = req.body;

    if (!month_name) {
        return res.status(400).json({
            success: false,
            message: "month_name majburiy"
        });
    }

    try {
        const result = await autoCalculateAllTeachersSalary(month_name);
        res.json(result);

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Avtomatik hisoblashda xato",
            error: err.message
        });
    }
};