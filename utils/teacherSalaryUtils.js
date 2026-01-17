const pool = require('../config/db');

// 1. Cron job uchun - har oy oxirida barcha o'qituvchilar maoshini avtomatik hisoblash
const autoCalculateAllTeachersSalary = async (month_name) => {
    console.log(`🔄 ${month_name} uchun o'qituvchilar maoshini avtomatik hisoblash boshlandi...`);
    
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
                await calculateTeacherSalaryInternal(teacher.id, month_name);
                results.push({
                    teacher_id: teacher.id,
                    teacher_name: `${teacher.name} ${teacher.surname}`,
                    status: 'success'
                });
                console.log(`✅ ${teacher.name} ${teacher.surname} maoshi hisoblandi`);
            } catch (err) {
                results.push({
                    teacher_id: teacher.id,
                    teacher_name: `${teacher.name} ${teacher.surname}`,
                    status: 'error',
                    error: err.message
                });
                console.log(`❌ ${teacher.name} ${teacher.surname} maoshi hisoblashda xato:`, err.message);
            }
        }

        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        
        console.log(`✅ Avtomatik hisoblash tugadi. ${successCount} muvaffaqiyatli, ${errorCount} xato`);
        
        return {
            success: true,
            message: `${successCount} o'qituvchi maoshi hisoblandi`,
            results: results
        };

    } catch (err) {
        console.error("❌ Avtomatik maosh hisoblashda xato:", err.message);
        return {
            success: false,
            error: err.message
        };
    }
};

// 2. O'tgan oydan qarzlari bo'lgan o'qituvchilarni tekshirish va ogohlantirish
const checkTeachersDebts = async (current_month) => {
    try {
        // O'tgan oyni hisoblash
        const previousMonth = new Date(current_month + '-01');
        previousMonth.setMonth(previousMonth.getMonth() - 1);
        const previousMonthStr = previousMonth.toISOString().slice(0, 7);

        // O'tgan oydan qarzlari bo'lgan o'qituvchilar
        const debts = await pool.query(`
            SELECT 
                u.id, u.name, u.surname,
                tms.month_name, tms.final_salary as debt_amount,
                tms.total_earned, tms.total_advances
            FROM teacher_monthly_salaries tms
            JOIN users u ON tms.teacher_id = u.id
            WHERE tms.month_name = $1 AND tms.final_salary < 0 AND u.status = 'active'
            ORDER BY tms.final_salary ASC
        `, [previousMonthStr]);

        if (debts.rows.length > 0) {
            console.log(`⚠️  ${previousMonthStr} oyidan ${debts.rows.length} ta o'qituvchining qarzi qolgan:`);
            
            debts.rows.forEach(debt => {
                console.log(`   - ${debt.name} ${debt.surname}: ${Math.abs(debt.debt_amount)} so'm qarz`);
            });
            
            // Bu qarzlarni joriy oyga qo'shish (calculateTeacherSalaryInternal funksiyasi buni allaqachon qiladi)
            return {
                has_debts: true,
                debts: debts.rows,
                total_debt: debts.rows.reduce((sum, debt) => sum + Math.abs(debt.debt_amount), 0)
            };
        }

        return { has_debts: false, message: "Qarz yo'q" };

    } catch (err) {
        console.error("❌ Qarzlarni tekshirishda xato:", err.message);
        return { error: err.message };
    }
};

// 3. O'qituvchi maoshining tafsili hisobotini yaratish
const generateDetailedTeacherReport = async (teacher_id, month_name) => {
    try {
        // O'qituvchi asosiy ma'lumotlari
        const teacher = await pool.query(`
            SELECT 
                u.id, u.name, u.surname, u.start_date, u.phone,
                tss.base_percentage, tss.bonus_percentage, 
                tss.experience_bonus_threshold, tss.experience_bonus_rate
            FROM users u
            LEFT JOIN teacher_salary_settings tss ON u.id = tss.teacher_id
            WHERE u.id = $1 AND u.role = 'teacher'
        `, [teacher_id]);

        if (teacher.rows.length === 0) {
            throw new Error("O'qituvchi topilmadi");
        }

        const teacherData = teacher.rows[0];

        // Oylik maosh ma'lumotlari
        const salary = await pool.query(`
            SELECT * FROM teacher_monthly_salaries 
            WHERE teacher_id = $1 AND month_name = $2
        `, [teacher_id, month_name]);

        // Guruhlar va har bir guruhdan tushgan to'lovlar
        const groupPayments = await pool.query(`
            SELECT 
                g.id, g.name, g.price, g.start_date,
                COUNT(DISTINCT s.id) as total_students,
                COUNT(DISTINCT CASE WHEN p.month_name = $2 THEN p.student_id END) as paying_students,
                COALESCE(SUM(CASE WHEN p.month_name = $2 THEN p.amount ELSE 0 END), 0) as group_income
            FROM groups g
            LEFT JOIN users s ON g.id = s.group_id AND s.role = 'student' AND s.status = 'active'
            LEFT JOIN payments p ON s.id = p.student_id
            WHERE g.teacher_id = $1
            GROUP BY g.id, g.name, g.price, g.start_date
            ORDER BY g.name
        `, [teacher_id, month_name]);

        // Avanslar
        const advances = await pool.query(`
            SELECT * FROM teacher_advances 
            WHERE teacher_id = $1 AND month_name = $2
            ORDER BY created_at
        `, [teacher_id, month_name]);

        // To'lovlar tarixi
        const payments = await pool.query(`
            SELECT 
                tsp.*, u.name as paid_by_name
            FROM teacher_salary_payments tsp
            LEFT JOIN users u ON tsp.created_by = u.id
            WHERE tsp.teacher_id = $1 
            AND tsp.monthly_salary_id = (
                SELECT id FROM teacher_monthly_salaries 
                WHERE teacher_id = $1 AND month_name = $2
            )
            ORDER BY tsp.created_at
        `, [teacher_id, month_name]);

        // Tajriba hisoblash
        const experienceMonths = teacherData.start_date ? 
            Math.floor((new Date() - new Date(teacherData.start_date)) / (1000 * 60 * 60 * 24 * 30)) : 0;

        return {
            teacher: {
                ...teacherData,
                experience_months: experienceMonths
            },
            month_name: month_name,
            salary_data: salary.rows[0] || null,
            groups: groupPayments.rows,
            advances: advances.rows,
            payments: payments.rows,
            summary: {
                total_groups: groupPayments.rows.length,
                total_students: groupPayments.rows.reduce((sum, g) => sum + parseInt(g.total_students), 0),
                paying_students: groupPayments.rows.reduce((sum, g) => sum + parseInt(g.paying_students), 0),
                total_group_income: groupPayments.rows.reduce((sum, g) => sum + parseFloat(g.group_income), 0),
                total_advances: advances.rows.reduce((sum, a) => sum + parseFloat(a.amount), 0),
                total_payments_received: payments.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0)
            }
        };

    } catch (err) {
        console.error("❌ Tafsili hisobot yaratishda xato:", err.message);
        throw err;
    }
};

// 4. Teacher maoshini hisoblash ichki funksiyasi (controllerdan ko'chirilgan)
async function calculateTeacherSalaryInternal(teacher_id, month_name) {
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
        throw new Error("O'qituvchi topilmadi");
    }

    const teacher = teacherQuery.rows[0];

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
    
    const experienceMonths = teacher.start_date ? 
        Math.floor((new Date() - new Date(teacher.start_date)) / (1000 * 60 * 60 * 24 * 30)) : 0;

    const baseSalary = totalStudentPayments * (teacher.base_percentage / 100);

    let experienceBonus = 0;
    if (experienceMonths >= teacher.experience_bonus_threshold) {
        experienceBonus = baseSalary * (teacher.experience_bonus_rate / 100);
    }

    const otherBonuses = baseSalary * (teacher.bonus_percentage / 100);
    const totalEarned = baseSalary + experienceBonus + otherBonuses;

    const advances = await pool.query(`
        SELECT COALESCE(SUM(amount), 0) as total_advances
        FROM teacher_advances 
        WHERE teacher_id = $1 AND month_name = $2
    `, [teacher_id, month_name]);

    const totalAdvances = parseFloat(advances.rows[0].total_advances || 0);

    const previousMonth = new Date(month_name + '-01');
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    const previousMonthStr = previousMonth.toISOString().slice(0, 7);

    const previousDebt = await pool.query(`
        SELECT COALESCE(final_salary, 0) as debt
        FROM teacher_monthly_salaries 
        WHERE teacher_id = $1 AND month_name = $2 AND final_salary < 0
    `, [teacher_id, previousMonthStr]);

    const debtFromPrevious = parseFloat(previousDebt.rows[0]?.debt || 0);
    const finalSalary = totalEarned - totalAdvances + debtFromPrevious;

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

    return monthlySalary.rows[0];
}

module.exports = {
    autoCalculateAllTeachersSalary,
    checkTeachersDebts,
    generateDetailedTeacherReport,
    calculateTeacherSalaryInternal
};