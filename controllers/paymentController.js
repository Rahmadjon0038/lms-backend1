const pool = require('../config/db');
const XLSX = require('xlsx');

// ============================================================================
// YANGI TO'LOV TIZIMI
// ============================================================================

/**
 * 1. OYLIK TO'LOV RO'YXATI OLISH
 * Faqat aktiv talabalar ko'rsatiladi (guruhga qo'shilgan)
 * Filtrlar: teacher, subject, status
 */
exports.getMonthlyPayments = async (req, res) => {
  const { month, teacher_id, subject_id, status } = req.query;
  const { role, id: userId } = req.user;

  try {
    // Month validatsiyasi (YYYY-MM format)
    const selectedMonth = month || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(selectedMonth)) {
      return res.status(400).json({
        success: false,
        message: 'month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    // Teacher faqat o'z talabalarini ko'ra oladi
    let teacherFilter = '';
    if (role === 'teacher') {
      teacherFilter = 'AND g.teacher_id = $1';
    }

    // Asosiy query - faqat ACTIVE talabalar (chegirmalar bilan)
    let query = `
      WITH student_discounts_calc AS (
        SELECT 
          sg.student_id,
          sg.group_id,
          g.price as original_price,
          COALESCE(
            SUM(
              CASE 
                WHEN sd.discount_type = 'percent' THEN (g.price * sd.discount_value / 100)
                WHEN sd.discount_type = 'amount' THEN sd.discount_value
                ELSE 0
              END
            ), 0
          ) as total_discount_amount
        FROM student_groups sg
        JOIN groups g ON sg.group_id = g.id
        LEFT JOIN student_discounts sd ON sg.student_id = sd.student_id AND sg.group_id = sd.group_id 
          AND sd.is_active = true
          AND (sd.start_month IS NULL OR $${role === 'teacher' ? 2 : 1} >= sd.start_month)
          AND (sd.end_month IS NULL OR $${role === 'teacher' ? 2 : 1} <= sd.end_month)
        WHERE sg.status IN ('active', 'stopped', 'finished')
          AND g.status = 'active' 
          AND g.class_status = 'started'
        GROUP BY sg.student_id, sg.group_id, g.price
      )
      SELECT 
        sg.student_id,
        u.name,
        u.surname,
        u.phone,
        u.phone2,
        u.father_name,
        u.father_phone,
        g.id as group_id,
        g.name as group_name,
        g.price as original_price,
        s.name as subject_name,
        t.name || ' ' || t.surname as teacher_name,
        
        -- Student status va date ma'lumotlari  
        sg.status as student_status,
        sg.join_date,
        sg.leave_date,
        
        -- To'lov ma'lumotlari (chegirma hisobga olingan)
        GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) as required_amount,
        COALESCE(sp.paid_amount, 0) as paid_amount,
        COALESCE(sdc.total_discount_amount, 0) as discount_amount,
        CASE 
          WHEN COALESCE(sp.paid_amount, 0) >= GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) THEN 'paid'
          WHEN COALESCE(sp.paid_amount, 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END as payment_status,
        
        (GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) - COALESCE(sp.paid_amount, 0)) as debt_amount,
        TO_CHAR(sp.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date,
        TO_CHAR(sp.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as payment_record_created,
        
        -- So'ngi to'lov descriptions va admin
        (
          SELECT STRING_AGG(
            pt.description || ' (' || TO_CHAR(pt.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') || ') - ' || 
            CASE pt.payment_method 
              WHEN 'cash' THEN 'Naqd'
              WHEN 'card' THEN 'Karta' 
              WHEN 'transfer' THEN 'O''tkazma'
              ELSE pt.payment_method
            END || ' - Admin: ' || COALESCE(admin.name || ' ' || admin.surname, 'Noma''lum'), 
            '; ' ORDER BY pt.created_at DESC
          )
          FROM payment_transactions pt 
          LEFT JOIN users admin ON pt.created_by = admin.id
          WHERE pt.student_id = sg.student_id 
            AND pt.month = $${role === 'teacher' ? 2 : 1}
            AND pt.group_id = sg.group_id
        ) as payment_descriptions,
        
        -- So'ngi to'lov qilgan admin
        (
          SELECT CONCAT(admin.name, ' ', admin.surname)
          FROM payment_transactions pt 
          LEFT JOIN users admin ON pt.created_by = admin.id
          WHERE pt.student_id = sg.student_id 
            AND pt.month = $${role === 'teacher' ? 2 : 1}
            AND pt.group_id = sg.group_id
          ORDER BY pt.created_at DESC
          LIMIT 1
        ) as last_payment_admin,
        
        -- So'ngi to'lov usuli
        (
          SELECT CASE pt.payment_method 
            WHEN 'cash' THEN 'Naqd'
            WHEN 'card' THEN 'Karta'
            WHEN 'transfer' THEN 'O''tkazma'
            ELSE pt.payment_method
          END
          FROM payment_transactions pt 
          WHERE pt.student_id = sg.student_id 
            AND pt.month = $${role === 'teacher' ? 2 : 1}
            AND pt.group_id = sg.group_id
          ORDER BY pt.created_at DESC
          LIMIT 1
        ) as last_payment_method,
        
        -- Chegirma description
        (
          SELECT sd.description
          FROM student_discounts sd 
          WHERE sd.student_id = sg.student_id AND sd.group_id = sg.group_id
            AND sd.start_month = $${role === 'teacher' ? 2 : 1}
            AND sd.is_active = true
          ORDER BY sd.created_at DESC
          LIMIT 1
        ) as discount_description,
        
        -- Chegirma description
        (
          SELECT sd.description || ' (' || sd.discount_value || 
            CASE 
              WHEN sd.discount_type = 'percent' THEN '%)'
              ELSE ' so''m)'
            END
          FROM student_discounts sd
          WHERE sd.student_id = sg.student_id AND sg.group_id = sg.group_id
            AND sd.is_active = true
          ORDER BY sd.created_at DESC
          LIMIT 1
        ) as discount_full_description
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      JOIN users t ON g.teacher_id = t.id
      LEFT JOIN student_discounts_calc sdc ON sg.student_id = sdc.student_id AND sg.group_id = sdc.group_id
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
                                    AND sp.month = $${role === 'teacher' ? 2 : 1}
                                    AND sp.group_id = sg.group_id
      
      WHERE (
          -- Bu guruhda student active bo'lishi kerak YOKI
          -- Bu guruh uchun o'sha oyda to'lov qilgan bo'lishi kerak YOKI
          -- Payment status filtri bo'lsa barcha statusdagi talabalar
          sg.status = 'active' 
          OR
          EXISTS (
            SELECT 1 FROM student_payments sp_check 
            WHERE sp_check.student_id = sg.student_id 
              AND sp_check.month = $${role === 'teacher' ? 2 : 1}
              -- Group-specific payment check uchun kelajakda group_id qo'shish mumkin
          )
          OR
          (${status ? 'true' : 'false'} AND sg.status IN ('active', 'stopped', 'finished'))
        )
        AND u.role = 'student'
        AND g.status = 'active' 
        AND g.class_status = 'started'
        -- Bu guruhga student o'sha oyda join qilgan bo'lishi kerak
        AND (
          sg.join_date IS NULL OR 
          sg.join_date <= ($${role === 'teacher' ? 2 : 1} || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
        )
        -- Bu guruhdan o'sha oydan oldin chiqmagan bo'lishi kerak
        AND (
          sg.leave_date IS NULL OR 
          sg.leave_date >= ($${role === 'teacher' ? 2 : 1} || '-01')::DATE
        )
        ${teacherFilter}
    `;

    const params = role === 'teacher' ? [userId, selectedMonth] : [selectedMonth];
    let paramIndex = params.length + 1;

    // Qo'shimcha filtrlar
    if (role !== 'teacher' && teacher_id) {
      query += ` AND g.teacher_id = ${paramIndex}`;
      params.push(teacher_id);
      paramIndex++;
    }

    if (subject_id) {
      query += ` AND g.subject_id = ${paramIndex}`;
      params.push(subject_id);
      paramIndex++;
    }

    if (status) {
      if (status === 'paid') {
        query += ` AND COALESCE(sp.paid_amount, 0) >= GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0)`;
      } else if (status === 'partial') {
        query += ` AND COALESCE(sp.paid_amount, 0) > 0 AND COALESCE(sp.paid_amount, 0) < GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0)`;
      } else if (status === 'unpaid') {
        query += ` AND COALESCE(sp.paid_amount, 0) = 0`;
      }
    }

    query += ` ORDER BY u.name ASC`;

    const result = await pool.query(query, params);

    // Statistika hisoblash
    const stats = {
      total_students: result.rows.length,
      paid: result.rows.filter(r => r.payment_status === 'paid').length,
      partial: result.rows.filter(r => r.payment_status === 'partial').length,
      unpaid: result.rows.filter(r => r.payment_status === 'unpaid').length,
      total_expected: result.rows.reduce((sum, r) => sum + parseFloat(r.required_amount || 0), 0),
      total_collected: result.rows.reduce((sum, r) => sum + parseFloat(r.paid_amount || 0), 0),
      total_debt: result.rows.reduce((sum, r) => sum + parseFloat(r.debt_amount || 0), 0)
    };

    res.json({
      success: true,
      message: 'Oylik to\'lov ro\'yxati muvaffaqiyatli olindi',
      data: {
        month: selectedMonth,
        students: result.rows,
        stats
      }
    });

  } catch (error) {
    console.error('Oylik to\'lovlarni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * 2. TO'LOV QILISH
 * Bo'lib-bo'lib to'lash mumkin, student qaysi oyda turgan bo'lsa shu oyga to'lov
 */
exports.makePayment = async (req, res) => {
  const { student_id, group_id, amount, payment_method = 'cash', description, month } = req.body;
  const { id: adminId, name: adminName } = req.user;

  try {
    // Validatsiya - month va group_id ham majburiy!
    if (!student_id || !group_id || !amount || amount <= 0 || !month) {
      return res.status(400).json({
        success: false,
        message: 'student_id, group_id, amount va month majburiy (month: YYYY-MM formatda)'
      });
    }

    // Month validatsiyasi
    const selectedMonth = month;
    
    // Month format validatsiyasi (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(selectedMonth)) {
      return res.status(400).json({
        success: false,
        message: 'month parametri YYYY-MM formatida bo\'lishi kerak (masalan: 2026-02)'
      });
    }

    // Talaba ma'lumotlarini olish (aniq guruh uchun)
    const studentCheck = await pool.query(`
      SELECT u.id, u.name, u.surname, 
             sg.group_id, g.price, g.name as group_name
      FROM users u
      JOIN student_groups sg ON u.id = sg.student_id
      JOIN groups g ON sg.group_id = g.id
      WHERE u.id = $1 AND g.id = $2 AND sg.status = 'active' AND u.role = 'student'
    `, [student_id, group_id]);

    if (studentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aktiv talaba topilmadi'
      });
    }

    const student = studentCheck.rows[0];

    // Mavjud to'lov yozuvini olish yoki yaratish (aniq guruh uchun)
    let paymentRecord = await pool.query(`
      SELECT * FROM student_payments 
      WHERE student_id = $1 AND month = $2 AND group_id = $3
    `, [student_id, selectedMonth, group_id]);

    const newPaidAmount = parseFloat(amount);

    if (paymentRecord.rows.length === 0) {
      // Yangi yozuv yaratish
      const requiredAmount = student.price;
      
      await pool.query(`
        INSERT INTO student_payments 
        (student_id, month, group_id, required_amount, paid_amount, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [student_id, selectedMonth, group_id, requiredAmount, newPaidAmount, adminId]);

      paymentRecord = await pool.query(`
        SELECT * FROM student_payments 
        WHERE student_id = $1 AND month = $2 AND group_id = $3
      `, [student_id, selectedMonth, group_id]);
    } else {
      // Mavjud yozuvni yangilash
      const currentPaid = parseFloat(paymentRecord.rows[0].paid_amount || 0);
      const totalPaid = currentPaid + newPaidAmount;

      await pool.query(`
        UPDATE student_payments 
        SET paid_amount = $1, last_payment_date = NOW(), updated_by = $2
        WHERE student_id = $3 AND month = $4 AND group_id = $5
      `, [totalPaid, adminId, student_id, selectedMonth, group_id]);
    }

    // Tranzaksiya yozuvi (aniq guruh uchun)
    await pool.query(`
      INSERT INTO payment_transactions 
      (student_id, month, group_id, amount, payment_method, description, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [student_id, selectedMonth, group_id, newPaidAmount, payment_method, description, adminId]);

    // Yangilangan ma'lumotni qaytarish
    const updatedRecord = await pool.query(`
      SELECT sp.*, u.name, u.surname, g.name as group_name
      FROM student_payments sp
      JOIN users u ON sp.student_id = u.id  
      JOIN student_groups sg ON u.id = sg.student_id AND sg.group_id = sp.group_id
      JOIN groups g ON sg.group_id = g.id
      WHERE sp.student_id = $1 AND sp.month = $2 AND sp.group_id = $3
    `, [student_id, selectedMonth, group_id]);

    const record = updatedRecord.rows[0];
    const isFullyPaid = parseFloat(record.paid_amount) >= parseFloat(record.required_amount);

    res.json({
      success: true,
      message: `To'lov muvaffaqiyatli qabul qilindi`,
      data: {
        student_name: `${record.name} ${record.surname}`,
        group_name: record.group_name,
        month: selectedMonth,
        paid_amount: parseFloat(record.paid_amount),
        required_amount: parseFloat(record.required_amount),
        remaining: parseFloat(record.required_amount) - parseFloat(record.paid_amount),
        status: isFullyPaid ? 'To\'liq to\'landi' : 'Qisman to\'landi',
        processed_by: adminName
      }
    });

  } catch (error) {
    console.error('To\'lov qilishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'To\'lov amalga oshmadi',
      error: error.message
    });
  }
};

/**
 * 3. TALABA TO'LOV TARIXI
 * Talaba o'z tarixini ko'rishi uchun
 */
exports.getStudentPaymentHistory = async (req, res) => {
  const { student_id } = req.params;
  const { group_id } = req.query; // Group filter qo'shildi
  const { role, id: userId } = req.user;

  try {
    // Faqat admin va o'z tarixini ko'rmoqchi bo'lgan talaba
    if (role === 'student' && parseInt(student_id) !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Faqat o\'z to\'lov tarixingizni ko\'ra olasiz'
      });
    }

    // To'lov tarixi
    const payments = await pool.query(`
      SELECT sp.month, sp.required_amount, sp.paid_amount, sp.discount_amount,
             TO_CHAR(sp.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date,
             TO_CHAR(sp.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as payment_record_created,
             g.name as group_name, s.name as subject_name,
             CASE 
               WHEN sp.paid_amount >= sp.required_amount THEN 'paid'
               WHEN sp.paid_amount > 0 THEN 'partial'
               ELSE 'unpaid'
             END as status
      FROM student_payments sp
      JOIN student_groups sg ON sp.student_id = sg.student_id AND sp.group_id = sg.group_id
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      WHERE sp.student_id = $1
      ${group_id ? 'AND sp.group_id = $2' : ''}
      ORDER BY sp.month DESC
    `, group_id ? [student_id, group_id] : [student_id]);

    // Tranzaksiya tarixi
    const transactions = await pool.query(`
      SELECT pt.month, pt.amount, 
             CASE pt.payment_method 
               WHEN 'cash' THEN 'Naqd'
               WHEN 'card' THEN 'Karta'
               WHEN 'transfer' THEN 'O''tkazma'
               ELSE pt.payment_method
             END as payment_method, 
             pt.description,
             TO_CHAR(pt.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI:SS') as created_at,
             pt.created_at as raw_created_at,
             CONCAT(u.name, ' ', u.surname) as admin_name
      FROM payment_transactions pt
      LEFT JOIN users u ON pt.created_by = u.id
      WHERE pt.student_id = $1
      ${group_id ? 'AND pt.group_id = $2' : ''}
      ORDER BY pt.created_at DESC
    `, group_id ? [student_id, group_id] : [student_id]);

    // Talaba ma'lumotlari
    const studentInfo = await pool.query(`
      SELECT u.name, u.surname, g.name as group_name
      FROM users u
      JOIN student_groups sg ON u.id = sg.student_id  
      JOIN groups g ON sg.group_id = g.id
      WHERE u.id = $1 AND sg.status = 'active'
      ${group_id ? 'AND g.id = $2' : ''}
    `, group_id ? [student_id, group_id] : [student_id]);

    res.json({
      success: true,
      message: 'To\'lov tarixi muvaffaqiyatli olindi',
      data: {
        student: studentInfo.rows[0],
        payments: payments.rows,
        transactions: transactions.rows
      }
    });

  } catch (error) {
    console.error('To\'lov tarixini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * 4. CHEGIRMA BERISH
 * Faqat bitta oyga chegirma berish va required_amount'ni avtomatik yangilash
 */
exports.giveDiscount = async (req, res) => {
  const { student_id, group_id, discount_type, discount_value, month, description } = req.body;
  const { id: adminId } = req.user;

  try {
    // Validatsiya - month va group_id ham majburiy!
    if (!student_id || !group_id || !discount_type || !discount_value || !month) {
      return res.status(400).json({
        success: false,
        message: 'student_id, group_id, discount_type, discount_value va month majburiy (month: YYYY-MM formatda)'
      });
    }

    const selectedMonth = month;

    // Talaba va guruh tekshiruvi
    const studentCheck = await pool.query(`
      SELECT u.id, u.name, u.surname, g.price, g.id as group_id
      FROM users u
      JOIN student_groups sg ON u.id = sg.student_id
      JOIN groups g ON sg.group_id = g.id
      WHERE u.id = $1 AND g.id = $2 AND sg.status = 'active'
    `, [student_id, group_id]);

    if (studentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aktiv talaba topilmadi'
      });
    }

    const student = studentCheck.rows[0];
    const originalPrice = parseFloat(student.price);
    
    // Chegirma miqdorini hisoblash
    let discountAmount = 0;
    if (discount_type === 'percent') {
      discountAmount = (originalPrice * discount_value) / 100;
    } else if (discount_type === 'amount') {
      discountAmount = discount_value;
    }
    
    const newRequiredAmount = Math.max(originalPrice - discountAmount, 0);
    const groupId = student.group_id;

    // Chegirma yaratish/yangilash - group_id bilan constraint
    await pool.query(`
      INSERT INTO student_discounts 
      (student_id, group_id, discount_type, discount_value, start_month, end_month, description, created_by)
      VALUES ($1, $2, $3, $4, $5, $5, $6, $7)
      ON CONFLICT ON CONSTRAINT student_discounts_student_group_month_unique 
      DO UPDATE SET 
        discount_type = EXCLUDED.discount_type,
        discount_value = EXCLUDED.discount_value,
        end_month = EXCLUDED.end_month,
        description = EXCLUDED.description
    `, [student_id, group_id, discount_type, discount_value, selectedMonth, description, adminId]);

    // student_payments jadvalini yangilash - group_id qo'shildi
    await pool.query(`
      INSERT INTO student_payments 
      (student_id, month, group_id, required_amount, paid_amount, created_by)
      VALUES ($1, $2, $3, $4, 0, $5)
      ON CONFLICT ON CONSTRAINT student_payments_student_month_group_unique 
      DO UPDATE SET 
        required_amount = EXCLUDED.required_amount
    `, [student_id, selectedMonth, groupId, newRequiredAmount, adminId]);

    res.json({
      success: true,
      message: 'Chegirma muvaffaqiyatli berildi va to\'lov summasi yangilandi',
      data: {
        student_name: `${student.name} ${student.surname}`,
        month: selectedMonth,
        discount_type,
        discount_value,
        original_price: originalPrice,
        discount_amount: discountAmount,
        new_required_amount: newRequiredAmount
      }
    });

  } catch (error) {
    console.error('Chegirma berishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Chegirma berib bo\'lmadi',
      error: error.message
    });
  }
};

/**
 * 5. FILTER UCHUN MA'LUMOTLAR
 * Teacher va subject ro'yxati
 */
exports.getPaymentFilters = async (req, res) => {
  try {
    // Teacherlar ro'yxati
    const teachers = await pool.query(`
      SELECT u.id, u.name || ' ' || u.surname as name
      FROM users u
      JOIN groups g ON u.id = g.teacher_id
      WHERE u.role = 'teacher' AND g.status = 'active'
      GROUP BY u.id, u.name, u.surname
      ORDER BY u.name
    `);

    // Fanlar ro'yxati  
    const subjects = await pool.query(`
      SELECT DISTINCT s.id, s.name
      FROM subjects s
      JOIN groups g ON s.id = g.subject_id
      WHERE g.status = 'active'
      ORDER BY s.name
    `);

    res.json({
      success: true,
      data: {
        teachers: teachers.rows,
        subjects: subjects.rows,
        statuses: [
          { value: 'paid', label: 'To\'liq to\'langan' },
          { value: 'partial', label: 'Qisman to\'langan' },
          { value: 'unpaid', label: 'To\'lanmagan' }
        ]
      }
    });

  } catch (error) {
    console.error('Filter ma\'lumotlarini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * 6. STUDENT TO'LOV MA'LUMOTLARINI TOZALASH
 * Admin uchun - student'ning barcha to'lov tarixini o'chirish
 */
exports.clearStudentPayments = async (req, res) => {
  const { student_id, confirm } = req.body;
  const { id: adminId, name: adminName, role } = req.user;

  try {
    // Faqat admin uchun
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Faqat adminlar student ma\'lumotlarini tozalashi mumkin'
      });
    }

    // Validatsiya
    if (!student_id || !confirm) {
      return res.status(400).json({
        success: false,
        message: 'student_id va confirm=true parametrlari majburiy'
      });
    }

    // Student mavjudligini tekshirish
    const studentCheck = await pool.query(`
      SELECT u.id, u.name, u.surname
      FROM users u
      WHERE u.id = $1 AND u.role = 'student'
    `, [student_id]);

    if (studentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Student topilmadi'
      });
    }

    const student = studentCheck.rows[0];

    // Mavjud ma'lumotlarni hisoblash
    const statsQuery = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM student_payments WHERE student_id = $1) as payments_count,
        (SELECT COUNT(*) FROM payment_transactions WHERE student_id = $1) as transactions_count,
        (SELECT COUNT(*) FROM student_discounts WHERE student_id = $1) as discounts_count,
        (SELECT COALESCE(SUM(paid_amount), 0) FROM student_payments WHERE student_id = $1) as total_paid
    `, [student_id]);

    const stats = statsQuery.rows[0];

    // Transaction boshlanishi
    await pool.query('BEGIN');

    try {
      // 1. Payment transactions'ni o'chirish
      await pool.query(`
        DELETE FROM payment_transactions 
        WHERE student_id = $1
      `, [student_id]);

      // 2. Student payments'ni o'chirish
      await pool.query(`
        DELETE FROM student_payments 
        WHERE student_id = $1
      `, [student_id]);

      // 3. Student discounts'ni o'chirish
      await pool.query(`
        DELETE FROM student_discounts 
        WHERE student_id = $1
      `, [student_id]);

      // Transaction commit
      await pool.query('COMMIT');

      // Log yozish
      console.log(`🗑️  Admin ${adminName} (ID: ${adminId}) tomonidan ${student.name} ${student.surname} (ID: ${student_id}) ning to'lov ma'lumotlari tozalandi`);

      res.json({
        success: true,
        message: 'Student to\'lov ma\'lumotlari muvaffaqiyatli tozalandi',
        data: {
          student_name: `${student.name} ${student.surname}`,
          cleared_data: {
            payments_records: parseInt(stats.payments_count),
            transactions_records: parseInt(stats.transactions_count),
            discount_records: parseInt(stats.discounts_count),
            total_amount_cleared: parseFloat(stats.total_paid)
          },
          cleared_by: adminName,
          cleared_at: new Date().toISOString()
        }
      });

    } catch (error) {
      // Transaction rollback
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Student to\'lov ma\'lumotlarini tozalashda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'To\'lov ma\'lumotlarini tozalab bo\'lmadi',
      error: error.message
    });
  }
};

// OYLIK TO'LOV HISOBOTINI EXCEL EXPORT QILISH
exports.exportMonthlyPayments = async (req, res) => {
  const { month, teacher_id, subject_id, status } = req.query;
  const { role, id: userId } = req.user;

  try {
    // Month validatsiyasi
    const selectedMonth = month || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(selectedMonth)) {
      return res.status(400).json({
        success: false,
        message: 'month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    // Teacher faqat o'z talabalarini ko'ra oladi
    let teacherFilter = '';
    if (role === 'teacher') {
      teacherFilter = 'AND g.teacher_id = $1';
    }

    // Asosiy query - faqat ACTIVE talabalar va boshlangan guruhlar
    let query = `
      WITH student_discounts_calc AS (
        SELECT 
          sg.student_id,
          sg.group_id,
          g.price as original_price,
          COALESCE(
            SUM(
              CASE 
                WHEN sd.discount_type = 'percent' THEN (g.price * sd.discount_value / 100)
                WHEN sd.discount_type = 'amount' THEN sd.discount_value
                ELSE 0
              END
            ), 0
          ) as total_discount_amount
        FROM student_groups sg
        JOIN groups g ON sg.group_id = g.id
        LEFT JOIN student_discounts sd ON sg.student_id = sd.student_id AND sg.group_id = sd.group_id 
          AND sd.is_active = true
          AND (sd.start_month IS NULL OR $${role === 'teacher' ? 2 : 1} >= sd.start_month)
          AND (sd.end_month IS NULL OR $${role === 'teacher' ? 2 : 1} <= sd.end_month)
        WHERE sg.status IN ('active', 'stopped', 'finished')
          AND g.status = 'active' 
          AND g.class_status = 'started'
        GROUP BY sg.student_id, sg.group_id, g.price
      )
      SELECT 
        sg.student_id,
        u.name,
        u.surname,
        u.phone,
        u.father_name,
        u.father_phone,
        g.id as group_id,
        g.name as group_name,
        g.price as original_price,
        s.name as subject_name,
        t.name || ' ' || t.surname as teacher_name,
        
        -- Student status
        sg.status as student_status,
        CASE 
          WHEN sg.status = 'active' THEN 'Faol'
          WHEN sg.status = 'stopped' THEN 'Toʻxtatgan' 
          WHEN sg.status = 'finished' THEN 'Bitirgan'
          ELSE 'Nomaʻlum'
        END as student_status_desc,
        
        -- To'lov ma'lumotlari
        GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) as required_amount,
        COALESCE(sp.paid_amount, 0) as paid_amount,
        COALESCE(sdc.total_discount_amount, 0) as discount_amount,
        CASE 
          WHEN COALESCE(sp.paid_amount, 0) >= GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) THEN 'Toʻliq toʻlagan'
          WHEN COALESCE(sp.paid_amount, 0) > 0 THEN 'Qisman toʻlagan'
          ELSE 'Toʻlamagan'
        END as payment_status,
        
        (GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) - COALESCE(sp.paid_amount, 0)) as debt_amount,
        TO_CHAR(sp.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date

      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      JOIN users t ON g.teacher_id = t.id
      LEFT JOIN student_discounts_calc sdc ON sg.student_id = sdc.student_id AND sg.group_id = sdc.group_id
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
                                    AND sp.month = $${role === 'teacher' ? 2 : 1}
                                    AND sp.group_id = sg.group_id
      
      WHERE (
          sg.status = 'active' 
          OR
          EXISTS (
            SELECT 1 FROM student_payments sp_check 
            WHERE sp_check.student_id = sg.student_id 
              AND sp_check.month = $${role === 'teacher' ? 2 : 1}
          )
          OR
          (${status ? 'true' : 'false'} AND sg.status IN ('active', 'stopped', 'finished'))
        )
        AND u.role = 'student'
        AND g.status = 'active' 
        AND g.class_status = 'started'
        ${teacherFilter}
    `;

    // Parametrlar
    const params = [selectedMonth];
    let paramIndex = 2;

    if (role === 'teacher') {
      params.push(userId);
      paramIndex++;
    }

    // Filtrlar qo'shish
    if (teacher_id && role === 'admin') {
      query += ` AND g.teacher_id = ${paramIndex}`;
      params.push(teacher_id);
      paramIndex++;
    }

    if (subject_id) {
      query += ` AND g.subject_id = ${paramIndex}`;
      params.push(subject_id);
      paramIndex++;
    }

    if (status) {
      const statusCondition = 
        status === 'paid' ? `COALESCE(sp.paid_amount, 0) >= GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0)` :
        status === 'partial' ? `COALESCE(sp.paid_amount, 0) > 0 AND COALESCE(sp.paid_amount, 0) < GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0)` :
        status === 'unpaid' ? `COALESCE(sp.paid_amount, 0) = 0` : '';
      
      if (statusCondition) {
        query += ` AND (${statusCondition})`;
      }
    }

    query += ` ORDER BY u.name, u.surname`;

    const result = await pool.query(query, params);
    const payments = result.rows;

    if (payments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hech qanday to\'lov ma\'lumotlari topilmadi'
      });
    }

    // Excel ma'lumotlarini tayyorlash
    const excelData = [];
    
    // Sarlavha
    const [year, monthNum] = selectedMonth.split('-');
    const monthName = new Date(year, monthNum - 1).toLocaleString('uz-UZ', { month: 'long', year: 'numeric' });
    
    excelData.push([`Oylik Toʻlov Hisoboti - ${monthName}`]);
    excelData.push([`Yaratildi: ${new Date().toLocaleDateString('uz-UZ')}`]);
    excelData.push(['']); // Bo'sh qator

    // Jadval sarlavhasi
    excelData.push([
      '№',
      'Talaba',
      'Telefon',
      'Ota ismi',
      'Ota telefoni',
      'Guruh',
      'Fan',
      'Oʻqituvchi',
      'Student holati',
      'Kerakli toʻlov',
      'Chegirma',
      'Toʻlanishi kerak',
      'Toʻlangan',
      'Qarz',
      'Toʻlov holati',
      'Oxirgi toʻlov vaqti',
      'Toʻlov usuli',
      'Admin'
    ]);

    // Ma'lumotlar qo'shish
    let totalRequired = 0;
    let totalDiscount = 0;
    let totalPaid = 0;
    let totalDebt = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    payments.forEach((payment, index) => {
      const requiredAfterDiscount = payment.required_amount;
      totalRequired += parseFloat(payment.original_price);
      totalDiscount += parseFloat(payment.discount_amount);
      totalPaid += parseFloat(payment.paid_amount);
      totalDebt += parseFloat(payment.debt_amount);

      if (payment.payment_status === 'Toʻliq toʻlagan') paidCount++;
      else if (payment.payment_status === 'Qisman toʻlagan') partialCount++;
      else unpaidCount++;

      excelData.push([
        index + 1,
        `${payment.name} ${payment.surname}`,
        payment.phone || '',
        payment.father_name || '',
        payment.father_phone || '',
        payment.group_name,
        payment.subject_name,
        payment.teacher_name,
        payment.student_status_desc,
        payment.original_price,
        payment.discount_amount,
        requiredAfterDiscount,
        payment.paid_amount,
        payment.debt_amount,
        payment.payment_status,
        payment.last_payment_date || 'Toʻlanmagan',
        payment.last_payment_method || 'Toʻlanmagan',
        payment.last_payment_admin || 'Admin noma\'lum'
      ]);
    });

    // Jami ma'lumotlar
    excelData.push(['']); // Bo'sh qator
    excelData.push(['JAMI STATISTIKA']);
    excelData.push(['Jami talabalar:', payments.length]);
    excelData.push(['Toʻliq toʻlaganlar:', paidCount]);
    excelData.push(['Qisman toʻlaganlar:', partialCount]);
    excelData.push(['Toʻlamaganlar:', unpaidCount]);
    excelData.push(['']);
    excelData.push(['Jami kerakli toʻlov:', totalRequired.toLocaleString()]);
    excelData.push(['Jami chegirma:', totalDiscount.toLocaleString()]);
    excelData.push(['Jami toʻlanishi kerak:', (totalRequired - totalDiscount).toLocaleString()]);
    excelData.push(['Jami toʻlangan:', totalPaid.toLocaleString()]);
    excelData.push(['Jami qarz:', totalDebt.toLocaleString()]);
    excelData.push(['Toʻlov foizi:', `${Math.round((totalPaid / (totalRequired - totalDiscount)) * 100)}%`]);

    // Excel workbook yaratish
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);
    
    // Ustun kengligini sozlash
    const colWidths = [
      { wch: 4 },  // №
      { wch: 20 }, // Talaba
      { wch: 15 }, // Telefon
      { wch: 15 }, // Ota ismi
      { wch: 15 }, // Ota telefoni
      { wch: 15 }, // Guruh
      { wch: 12 }, // Fan
      { wch: 18 }, // O'qituvchi
      { wch: 12 }, // Student holati
      { wch: 12 }, // Kerakli to'lov
      { wch: 10 }, // Chegirma
      { wch: 15 }, // To'lanishi kerak
      { wch: 12 }, // To'langan
      { wch: 10 }, // Qarz
      { wch: 15 }, // To'lov holati
      { wch: 18 }  // Oxirgi to'lov vaqti
    ];
    
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Toʻlovlar');

    // Excel buffer yaratish
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Fayl nomini yaratish
    const fileName = `Tolovlar_${selectedMonth}.xlsx`;

    // Response header sozlash
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Excel faylni yuborish
    res.send(excelBuffer);

  } catch (error) {
    console.error('Excel export xatoligi:', error);
    res.status(500).json({
      success: false,
      message: 'Excel fayl yaratishda xatolik yuz berdi',
      error: error.message
    });
  }
};

// ============================================================================
// TALABA UCHUN API LAR (O'Z TO'LOV MA'LUMOTLARINI KO'RISH)
// ============================================================================

/**
 * Talaba o'z oylik to'lov ma'lumotlarini olish
 * Faqat o'z ma'lumotlarini ko'ra oladi
 */
exports.getMyPayments = async (req, res) => {
  const { month } = req.query;
  const { role, id: userId } = req.user;

  try {
    // Faqat talabalar foydalana oladi
    if (role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Bu API faqat talabalar uchun'
      });
    }

    // Month validatsiyasi
    const selectedMonth = month || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(selectedMonth)) {
      return res.status(400).json({
        success: false,
        message: 'month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    // Talabaning barcha guruhlaridagi to'lov ma'lumotlarini olish
    const query = `
      SELECT 
        sg.group_id,
        g.name as group_name,
        s.name as subject_name,
        CONCAT(t.name, ' ', t.surname) as teacher_name,
        g.price as original_price,
        
        -- Chegirma miqdori
        COALESCE(
          (SELECT SUM(
            CASE 
              WHEN sd.discount_type = 'percent' THEN (g.price * sd.discount_value / 100)
              WHEN sd.discount_type = 'amount' THEN sd.discount_value
              ELSE 0
            END
          )
          FROM student_discounts sd 
          WHERE sd.student_id = sg.student_id 
            AND sd.group_id = sg.group_id
            AND sd.start_month = $1
            AND sd.is_active = true
          ), 0
        ) as discount_amount,
        
        -- To'langan summa
        COALESCE(sp.paid_amount, 0) as paid_amount,
        
        -- To'lov holati
        CASE 
          WHEN COALESCE(sp.paid_amount, 0) >= GREATEST(g.price - COALESCE(
            (SELECT SUM(
              CASE 
                WHEN sd.discount_type = 'percent' THEN (g.price * sd.discount_value / 100)
                WHEN sd.discount_type = 'amount' THEN sd.discount_value
                ELSE 0
              END
            )
            FROM student_discounts sd 
            WHERE sd.student_id = sg.student_id 
              AND sd.group_id = sg.group_id
              AND sd.start_month = $1
              AND sd.is_active = true
          ), 0), 0) THEN 'paid'
          WHEN COALESCE(sp.paid_amount, 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END as payment_status,
        
        -- Qarz miqdori
        GREATEST(g.price - COALESCE(
          (SELECT SUM(
            CASE 
              WHEN sd.discount_type = 'percent' THEN (g.price * sd.discount_value / 100)
              WHEN sd.discount_type = 'amount' THEN sd.discount_value
              ELSE 0
            END
          )
          FROM student_discounts sd 
          WHERE sd.student_id = sg.student_id 
            AND sd.group_id = sg.group_id
            AND sd.start_month = $1
            AND sd.is_active = true
        ), 0) - COALESCE(sp.paid_amount, 0), 0) as remaining_amount,
        
        -- Chegirma tavsifi
        (
          SELECT sd.description
          FROM student_discounts sd 
          WHERE sd.student_id = sg.student_id 
            AND sd.group_id = sg.group_id
            AND sd.start_month = $1
            AND sd.is_active = true
          LIMIT 1
        ) as discount_description,
        
        -- So'ngi to'lov sanasi
        sp.created_at as last_payment_date
        
      FROM student_groups sg
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id  
      JOIN users t ON g.teacher_id = t.id
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
        AND sp.group_id = sg.group_id 
        AND sp.month = $1
      WHERE sg.student_id = $2 
        AND sg.status = 'active'
        AND g.status = 'active'
        AND g.class_status = 'started'
      ORDER BY g.name ASC
    `;

    const result = await pool.query(query, [selectedMonth, userId]);

    // Umumiy statistika
    const totalOriginal = result.rows.reduce((sum, row) => sum + parseFloat(row.original_price), 0);
    const totalDiscount = result.rows.reduce((sum, row) => sum + parseFloat(row.discount_amount), 0);
    const totalPaid = result.rows.reduce((sum, row) => sum + parseFloat(row.paid_amount), 0);
    const totalRemaining = result.rows.reduce((sum, row) => sum + parseFloat(row.remaining_amount), 0);

    res.json({
      success: true,
      message: 'To\'lov ma\'lumotlari muvaffaqiyatli olindi',
      data: {
        month: selectedMonth,
        groups: result.rows,
        summary: {
          total_groups: result.rows.length,
          total_original_amount: totalOriginal,
          total_discount_amount: totalDiscount,
          total_required_amount: totalOriginal - totalDiscount,
          total_paid_amount: totalPaid,
          total_remaining_amount: totalRemaining,
          overall_status: totalRemaining === 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid')
        }
      }
    });

  } catch (error) {
    console.error('Talaba to\'lov ma\'lumotlarini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * Talaba o'z to'lov tarixini olish
 */
exports.getMyPaymentHistory = async (req, res) => {
  const { group_id, limit = 10 } = req.query;
  const { role, id: userId } = req.user;

  try {
    // Faqat talabalar foydalana oladi
    if (role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Bu API faqat talabalar uchun'
      });
    }

    let query = `
      SELECT 
        pt.id,
        pt.month,
        pt.amount,
        pt.payment_method,
        pt.description,
        pt.created_at as payment_date,
        g.name as group_name,
        s.name as subject_name,
        CONCAT(admin.name, ' ', admin.surname) as received_by
      FROM payment_transactions pt
      JOIN student_groups sg ON pt.student_id = sg.student_id AND pt.group_id = sg.group_id
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN users admin ON pt.created_by = admin.id
      WHERE pt.student_id = $1
    `;

    const params = [userId];
    let paramCount = 1;

    // Group filter
    if (group_id) {
      paramCount++;
      query += ` AND pt.group_id = $${paramCount}`;
      params.push(group_id);
    }

    query += ` ORDER BY pt.created_at DESC LIMIT $${paramCount + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    res.json({
      success: true,
      message: 'To\'lov tarixi muvaffaqiyatli olindi',
      data: {
        payments: result.rows,
        total_count: result.rows.length
      }
    });

  } catch (error) {
    console.error('To\'lov tarixini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * Talaba o'z chegirma ma'lumotlarini olish
 */
exports.getMyDiscounts = async (req, res) => {
  const { role, id: userId } = req.user;

  try {
    // Faqat talabalar foydalana oladi
    if (role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Bu API faqat talabalar uchun'
      });
    }

    const query = `
      SELECT 
        sd.id,
        sd.start_month,
        sd.end_month,
        sd.discount_type,
        sd.discount_value,
        sd.description,
        sd.is_active,
        sd.created_at,
        g.name as group_name,
        s.name as subject_name,
        CASE 
          WHEN sd.discount_type = 'percent' THEN CONCAT(sd.discount_value, '%')
          ELSE CONCAT(sd.discount_value, ' so\'m')
        END as discount_display
      FROM student_discounts sd
      JOIN groups g ON sd.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      WHERE sd.student_id = $1 
        AND sd.is_active = true
      ORDER BY sd.created_at DESC
    `;

    const result = await pool.query(query, [userId]);

    res.json({
      success: true,
      message: 'Chegirma ma\'lumotlari muvaffaqiyatli olindi',
      data: {
        discounts: result.rows,
        total_count: result.rows.length
      }
    });

  } catch (error) {
    console.error('Chegirma ma\'lumotlarini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};