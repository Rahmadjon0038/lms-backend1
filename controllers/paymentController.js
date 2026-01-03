const pool = require('../config/db');

// 1. Studentlar ro'yxati to'lov uchun (guruh, teacher bilan)
exports.getStudentsForPayment = async (req, res) => {
    const { group_id, month_name } = req.query;
    
    try {
        let query = `
            SELECT 
                u.id as student_id,
                u.name || ' ' || u.surname as student_name,
                u.phone,
                u.group_id,
                u.group_name,
                u.teacher_name,
                g.price as default_price,
                mf.required_amount,
                mf.paid_amount,
                mf.status,
                (COALESCE(mf.required_amount, g.price, 0) - COALESCE(mf.paid_amount, 0)) as debt
            FROM users u
            LEFT JOIN groups g ON u.group_id = g.id
            LEFT JOIN monthly_fees mf ON u.id = mf.student_id AND mf.month_name = $1
            WHERE u.role = 'student' AND u.status = 'active'
        `;
        
        const params = [month_name || new Date().toISOString().slice(0, 7)]; // Default: joriy oy
        
        if (group_id) {
            query += ' AND u.group_id = $2';
            params.push(group_id);
        }
        
        query += ' ORDER BY u.group_name, u.surname, u.name';
        
        const result = await pool.query(query, params);
        
        res.json({
            success: true,
            month: params[0],
            count: result.rows.length,
            students: result.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. Studentning oylik to'lov talabini belgilash/o'zgartirish
exports.setMonthlyRequirement = async (req, res) => {
    const { student_id, month_name, required_amount } = req.body;
    
    if (!student_id || !month_name || !required_amount) {
        return res.status(400).json({ 
            message: "student_id, month_name va required_amount majburiy" 
        });
    }
    
    try {
        // Studentni tekshirish
        const student = await pool.query(
            'SELECT id, name, surname, group_id, group_name FROM users WHERE id = $1 AND role = $2',
            [student_id, 'student']
        );
        
        if (student.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }
        
        const studentData = student.rows[0];
        
        // Monthly_fees jadvalini yangilash yoki yaratish
        const result = await pool.query(
            `INSERT INTO monthly_fees (student_id, group_id, month_name, required_amount, paid_amount)
             VALUES ($1, $2, $3, $4, 0)
             ON CONFLICT (student_id, month_name) 
             DO UPDATE SET required_amount = $4
             RETURNING *`,
            [student_id, studentData.group_id, month_name, required_amount]
        );
        
        res.json({
            success: true,
            message: `${studentData.name} ${studentData.surname} uchun ${month_name} oyiga to'lov summasi belgilandi`,
            data: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. To'lov qo'shish (yangilangan versiya)
exports.addPayment = async (req, res) => {
    const { student_id, month_name, amount, payment_method, note } = req.body;
    const admin_id = req.user.id;

    if (!student_id || !amount || !month_name) {
        return res.status(400).json({ 
            message: "student_id, amount va month_name majburiy" 
        });
    }

    try {
        // Studentni tekshirish
        const studentCheck = await pool.query(
            'SELECT id, name, surname, group_id, group_name FROM users WHERE id = $1 AND role = $2',
            [student_id, 'student']
        );

        if (studentCheck.rows.length === 0) {
            return res.status(404).json({ message: "Student topilmadi" });
        }

        const student = studentCheck.rows[0];

        // To'lovni qo'shish
        const paymentResult = await pool.query(
            `INSERT INTO payments (student_id, group_id, month_name, amount, payment_method, note, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [student_id, student.group_id, month_name, amount, payment_method || 'cash', note, admin_id]
        );
        
        // Monthly_fees jadvalini yangilash
        const totalPaid = await pool.query(
            'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE student_id = $1 AND month_name = $2',
            [student_id, month_name]
        );
        
        // Monthly_fees da mavjud bo'lmasa yaratish
        await pool.query(
            `INSERT INTO monthly_fees (student_id, group_id, month_name, paid_amount)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (student_id, month_name)
             DO UPDATE SET paid_amount = $4`,
            [student_id, student.group_id, month_name, totalPaid.rows[0].total]
        );
        
        // Yangilangan monthly_fees ma'lumotini olish
        const monthlyFee = await pool.query(
            'SELECT * FROM monthly_fees WHERE student_id = $1 AND month_name = $2',
            [student_id, month_name]
        );

        res.status(201).json({
            success: true,
            message: "To'lov muvaffaqiyatli qo'shildi",
            payment: paymentResult.rows[0],
            monthly_summary: monthlyFee.rows[0],
            student: {
                id: student.id,
                name: student.name,
                surname: student.surname,
                group_name: student.group_name
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Bitta studentning to'lov tarixi va oylik ma'lumotlari
exports.getStudentPayments = async (req, res) => {
    const { student_id } = req.params;
    const { month_name } = req.query;

    try {
        // Agar oy ko'rsatilgan bo'lsa - faqat shu oy, yo'q bo'lsa - barcha oylar
        let monthlyQuery, monthlyParams;
        
        if (month_name) {
            monthlyQuery = `
                SELECT * FROM monthly_fees 
                WHERE student_id = $1 AND month_name = $2
            `;
            monthlyParams = [student_id, month_name];
        } else {
            monthlyQuery = `
                SELECT * FROM monthly_fees 
                WHERE student_id = $1
                ORDER BY month_name DESC
            `;
            monthlyParams = [student_id];
        }
        
        const monthlyFees = await pool.query(monthlyQuery, monthlyParams);
        
        // To'lovlar tarixi
        let paymentsQuery = `
            SELECT 
                p.*,
                admin.name || ' ' || admin.surname as admin_name
            FROM payments p
            LEFT JOIN users admin ON p.created_by = admin.id
            WHERE p.student_id = $1
        `;
        const paymentsParams = [student_id];
        
        if (month_name) {
            paymentsQuery += ' AND p.month_name = $2';
            paymentsParams.push(month_name);
        }
        
        paymentsQuery += ' ORDER BY p.created_at DESC';
        
        const payments = await pool.query(paymentsQuery, paymentsParams);
        
        // Student ma'lumotlari
        const student = await pool.query(
            'SELECT id, name, surname, group_name, teacher_name FROM users WHERE id = $1',
            [student_id]
        );

        res.json({
            success: true,
            student: student.rows[0],
            monthly_fees: monthlyFees.rows,
            payments: payments.rows,
            total_debt: monthlyFees.rows.reduce((sum, m) => 
                sum + (parseFloat(m.required_amount || 0) - parseFloat(m.paid_amount || 0)), 0
            )
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Oylik to'lovlar hisoboti (yangilangan)
exports.getMonthlyPayments = async (req, res) => {
    const { month_name } = req.params;

    try {
        // Oylik to'lovlar summasi bilan
        const monthlyData = await pool.query(
            `SELECT 
                u.id as student_id,
                u.name || ' ' || u.surname as student_name,
                u.phone,
                u.group_name,
                u.teacher_name,
                mf.required_amount,
                mf.paid_amount,
                mf.status,
                (COALESCE(mf.required_amount, 0) - COALESCE(mf.paid_amount, 0)) as debt
             FROM users u
             LEFT JOIN monthly_fees mf ON u.id = mf.student_id AND mf.month_name = $1
             WHERE u.role = 'student' AND u.status = 'active'
             ORDER BY u.group_name, u.surname`,
            [month_name]
        );

        // Jami statistika
        const stats = await pool.query(
            `SELECT 
                COUNT(*) as total_students,
                COALESCE(SUM(required_amount), 0) as total_required,
                COALESCE(SUM(paid_amount), 0) as total_paid,
                COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
                COUNT(CASE WHEN status = 'partial' THEN 1 END) as partial_count,
                COUNT(CASE WHEN status = 'unpaid' THEN 1 END) as unpaid_count
             FROM monthly_fees
             WHERE month_name = $1`,
            [month_name]
        );

        res.json({
            success: true,
            month: month_name,
            statistics: stats.rows[0],
            students: monthlyData.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. Guruh bo'yicha to'lovlar
exports.getGroupPayments = async (req, res) => {
    const { group_id } = req.params;
    const { month_name } = req.query;

    try {
        let query = `
            SELECT 
                p.*,
                u.name || ' ' || u.surname as student_name,
                u.phone
             FROM payments p
             LEFT JOIN users u ON p.student_id = u.id
             WHERE p.group_id = $1
        `;
        const params = [group_id];

        if (month_name) {
            query += ' AND p.month_name = $2';
            params.push(month_name);
        }

        query += ' ORDER BY p.created_at DESC';

        const payments = await pool.query(query, params);

        // Jami summa
        let totalQuery = 'SELECT COALESCE(SUM(amount), 0) as group_total FROM payments WHERE group_id = $1';
        const totalParams = [group_id];
        
        if (month_name) {
            totalQuery += ' AND month_name = $2';
            totalParams.push(month_name);
        }

        const total = await pool.query(totalQuery, totalParams);

        res.json({
            success: true,
            group_id: parseInt(group_id),
            month: month_name || 'all',
            total_amount: total.rows[0].group_total,
            payments_count: payments.rows.length,
            payments: payments.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. Barcha to'lovlar (admin filter bilan)
exports.getAllPayments = async (req, res) => {
    const { month_name, payment_method, student_id, group_id } = req.query;
    
    let filters = [];
    let params = [];
    let paramIdx = 1;

    if (month_name) {
        filters.push(`p.month_name = $${paramIdx++}`);
        params.push(month_name);
    }
    if (payment_method) {
        filters.push(`p.payment_method = $${paramIdx++}`);
        params.push(payment_method);
    }
    if (student_id) {
        filters.push(`p.student_id = $${paramIdx++}`);
        params.push(student_id);
    }
    if (group_id) {
        filters.push(`p.group_id = $${paramIdx++}`);
        params.push(group_id);
    }

    const whereClause = filters.length > 0 ? 'WHERE ' + filters.join(' AND ') : '';

    try {
        const payments = await pool.query(
            `SELECT 
                p.*,
                u.name || ' ' || u.surname as student_name,
                g.name as group_name,
                u.phone,
                admin.name || ' ' || admin.surname as admin_name
             FROM payments p
             LEFT JOIN users u ON p.student_id = u.id
             LEFT JOIN groups g ON p.group_id = g.id
             LEFT JOIN users admin ON p.created_by = admin.id
             ${whereClause}
             ORDER BY p.created_at DESC
             LIMIT 100`,
            params
        );

        // Jami summa
        const total = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM payments p ${whereClause}`,
            params
        );

        res.json({
            success: true,
            total_amount: total.rows[0].total,
            payments_count: payments.rows.length,
            payments: payments.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. To'lovni o'chirish (FAQAT ADMIN)
exports.deletePayment = async (req, res) => {
    const { payment_id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM payments WHERE id = $1 RETURNING *',
            [payment_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "To'lov topilmadi" });
        }

        res.json({
            success: true,
            message: "To'lov o'chirildi",
            deletedPayment: result.rows[0]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 7. Moliyaviy hisobot (Dashboard uchun)
exports.getFinancialReport = async (req, res) => {
    const { start_date, end_date } = req.query;

    try {
        let dateFilter = '';
        const params = [];

        if (start_date && end_date) {
            dateFilter = 'WHERE p.created_at BETWEEN $1 AND $2';
            params.push(start_date, end_date);
        }

        // Jami daromad
        const totalIncome = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) as total FROM payments p ${dateFilter}`,
            params
        );

        // Oylik breakdown
        const monthlyBreakdown = await pool.query(
            `SELECT 
                month_name,
                COALESCE(SUM(amount), 0) as monthly_total,
                COUNT(*) as payments_count
             FROM payments p
             ${dateFilter}
             GROUP BY month_name
             ORDER BY month_name DESC`,
            params
        );

        // To'lov usullari bo'yicha
        const byPaymentMethod = await pool.query(
            `SELECT 
                payment_method,
                COALESCE(SUM(amount), 0) as total,
                COUNT(*) as count
             FROM payments p
             ${dateFilter}
             GROUP BY payment_method`,
            params
        );

        // Guruhlar bo'yicha
        const byGroup = await pool.query(
            `SELECT 
                g.name as group_name,
                COALESCE(SUM(p.amount), 0) as total,
                COUNT(p.id) as payments_count
             FROM payments p
             LEFT JOIN groups g ON p.group_id = g.id
             ${dateFilter}
             GROUP BY g.name
             ORDER BY total DESC`,
            params
        );

        res.json({
            success: true,
            period: {
                start: start_date || 'all',
                end: end_date || 'all'
            },
            total_income: totalIncome.rows[0].total,
            monthly_breakdown: monthlyBreakdown.rows,
            by_payment_method: byPaymentMethod.rows,
            by_group: byGroup.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
