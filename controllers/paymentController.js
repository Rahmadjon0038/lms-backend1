const db = require('../config/db');

/**
 * 1. OYLIK TO'LOVLAR RO'YXATI
 * Barcha talabalar va ularning to'lov holatlari
 */
exports.getMonthlyPayments = async (req, res) => {
  try {
    const { month, teacher_id, subject_id, status } = req.query;
    const { role, id: userId } = req.user;

    // Month validatsiyasi (YYYY-MM format)
    const selectedMonth = month || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(selectedMonth)) {
      return res.status(400).json({
        success: false,
        message: 'month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    // Parameters va filters
    let params = [selectedMonth]; // $1 = selectedMonth
    let paramIndex = 2;
    let whereConditions = [];
    let teacherFilter = '';

    // Teacher faqat o'z talabalarini ko'ra oladi
    if (role === 'teacher') {
      teacherFilter = `AND gms.teacher_id_for_month = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    // Admin uchun teacher_id filtri
    if (role !== 'teacher' && teacher_id) {
      whereConditions.push(`gms.teacher_id_for_month = $${paramIndex}`);
      params.push(teacher_id);
      paramIndex++;
    }

    // Subject filter
    if (subject_id) {
      whereConditions.push(`gms.subject_id_for_month = $${paramIndex}`);
      params.push(subject_id);
      paramIndex++;
    }

    // Payment status filter
    let statusFilter = '';
    if (status) {
      if (status === 'paid') {
        statusFilter = ` AND COALESCE(sp.paid_amount, 0) >= COALESCE(sp.required_amount, 0) AND COALESCE(sp.required_amount, 0) > 0`;
      } else if (status === 'partial') {
        statusFilter = ` AND COALESCE(sp.paid_amount, 0) > 0 AND COALESCE(sp.paid_amount, 0) < COALESCE(sp.required_amount, 0)`;
      } else if (status === 'unpaid') {
        statusFilter = ` AND (COALESCE(sp.paid_amount, 0) = 0 OR COALESCE(sp.required_amount, 0) = 0)`;
      }
    }

    // Additional WHERE conditions
    const additionalWhere = whereConditions.length > 0 
      ? ` AND ${whereConditions.join(' AND ')}`
      : '';

    // HISTORICAL DATA bilan query - group_monthly_settings dan foydalanish
    const query = `
      SELECT 
        sg.student_id,
        u.name,
        u.surname,
        u.phone,
        u.phone2,
        u.father_name,
        u.father_phone,
        sg.group_id,
        
        -- HISTORICAL GROUP DATA (faqat snapshot, agar yo'q bo'lsa NULL)
        gms.name_for_month as group_name,
        gms.price_for_month as original_price,
        s_hist.name as subject_name,
        CONCAT(t_hist.name, ' ', t_hist.surname) as teacher_name,
        
        sg.status as student_status,
        sg.join_date,
        sg.leave_date,
        
        -- To'lov ma'lumotlari (faqat saqlangan historical data)
        COALESCE(sp.required_amount, 0) as required_amount,
        COALESCE(sp.paid_amount, 0) as paid_amount,
        
        -- Haqiqiy chegirma miqdori (snapshot narxi - required amount)
        CASE 
          WHEN gms.price_for_month IS NOT NULL AND sp.required_amount IS NOT NULL 
          THEN (gms.price_for_month - sp.required_amount)
          ELSE 0
        END as discount_amount,
        
        CASE 
          WHEN COALESCE(sp.required_amount, 0) = 0 AND gms.price_for_month > 0 THEN 'paid'  -- 100% chegirma = to'langan
          WHEN COALESCE(sp.required_amount, 0) = 0 THEN 'not_set'  -- Hali belgilanmagan
          WHEN COALESCE(sp.paid_amount, 0) >= COALESCE(sp.required_amount, 0) THEN 'paid'
          WHEN COALESCE(sp.paid_amount, 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END as payment_status,
        
        GREATEST(COALESCE(sp.required_amount, 0) - COALESCE(sp.paid_amount, 0), 0) as debt_amount,
        TO_CHAR(sp.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date,
        TO_CHAR(sp.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as payment_record_created,
        
        -- To'lov descriptions va adminlar
        (
          SELECT STRING_AGG(
            pt.description || ' - ' || pt.amount || ' so''m (' || 
            TO_CHAR(pt.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') || ')', 
            '; ' ORDER BY pt.created_at DESC
          )
          FROM payment_transactions pt 
          WHERE pt.student_id = sg.student_id 
            AND pt.month = $1
            AND pt.group_id = sg.group_id
        ) as payment_descriptions,
        
        -- So'ngi to'lov qilgan admin
        (
          SELECT CONCAT(admin.name, ' ', admin.surname)
          FROM payment_transactions pt 
          LEFT JOIN users admin ON pt.created_by = admin.id
          WHERE pt.student_id = sg.student_id 
            AND pt.month = $1
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
            AND pt.month = $1
            AND pt.group_id = sg.group_id
          ORDER BY pt.created_at DESC
          LIMIT 1
        ) as last_payment_method,
        
        -- Chegirma description
        (
          SELECT STRING_AGG(
            sd.description || ' (' || sd.discount_value || 
            CASE 
              WHEN sd.discount_type = 'percent' THEN '%)'
              ELSE ' so''m)'
            END,
            '; '
          )
          FROM student_discounts sd 
          WHERE sd.student_id = sg.student_id 
            AND sd.group_id = sg.group_id
            AND sd.start_month = $1
            AND sd.is_active = true
        ) as discount_description,
        
        -- Chegirma full description
        (
          SELECT STRING_AGG(
            sd.description || ' - ' || sd.discount_value || 
            CASE 
              WHEN sd.discount_type = 'percent' THEN '% chegirma'
              ELSE ' so''m chegirma'
            END || ' (' || TO_CHAR(sd.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY') || ')',
            '; '
          )
          FROM student_discounts sd
          WHERE sd.student_id = sg.student_id 
            AND sd.group_id = sg.group_id
            AND sd.start_month = $1
            AND sd.is_active = true
        ) as discount_full_description

      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      JOIN users t ON g.teacher_id = t.id
      
      -- HISTORICAL GROUP SETTINGS (o'sha oy uchun snapshot) - MAJBURIY
      JOIN group_monthly_settings gms ON sg.group_id = gms.group_id AND gms.month = $1
      LEFT JOIN subjects s_hist ON gms.subject_id_for_month = s_hist.id
      LEFT JOIN users t_hist ON gms.teacher_id_for_month = t_hist.id
      
      -- PAYMENT DATA
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
                                    AND sp.month = $1
                                    AND sp.group_id = sg.group_id
      
      WHERE u.role = 'student'
        AND g.status = 'active' 
        AND g.class_status = 'started'
        AND gms.month IS NOT NULL
        -- O'sha oyda group status asosida filtrlash (user status emas)
        AND (
          -- 1. Hozir ham active bo'lgan talabalar
          (sg.status = 'active')
          OR
          -- 2. O'sha oyda to'xtatilgan talabalar (o'sha oy uchun to'lov kerak)
          (
            sg.status IN ('stopped', 'finished')
            AND sg.leave_date IS NOT NULL 
            AND TO_CHAR(sg.leave_date, 'YYYY-MM') = $1
            AND (
              sg.join_date IS NULL 
              OR TO_CHAR(sg.join_date, 'YYYY-MM') <= $1
            )
          )
        )
        -- Guruhga o'sha oydan oldin qo'shilgan bo'lishi kerak  
        AND (
          sg.join_date IS NULL 
          OR TO_CHAR(sg.join_date, 'YYYY-MM') <= $1
        )
        ${teacherFilter}
        ${additionalWhere}
        ${statusFilter}
      
      ORDER BY gms.name_for_month, u.name, u.surname
    `;

    console.log('SQL Query:', query);
    console.log('Parameters:', params);

    // Query ishlatamiz
    const result = await db.query(query, params);

    // Agar student_payments yo'q bo'lsa, avtomatik yaratish
    for (const student of result.rows) {
      if (parseFloat(student.required_amount) === 0 && student.original_price) {
        console.log(`⚠️  ${student.name} ${student.surname} uchun ${selectedMonth} oyda to'lov qaydi yo'q. Avtomatik yaratilmoqda...`);
        
        // Chegirmalarni hisoblash - har oy uchun alohida, oraliq hisobga olinadi
        const discountQuery = `
          SELECT 
            SUM(
              CASE 
                WHEN sd.discount_type = 'percent' THEN (${student.original_price} * sd.discount_value / 100)
                WHEN sd.discount_type = 'amount' THEN sd.discount_value
                ELSE 0
              END
            ) as total_discount
          FROM student_discounts sd 
          WHERE sd.student_id = $1 AND sd.group_id = $2 
            AND $3 >= sd.start_month
            AND ($3 <= sd.end_month OR sd.end_month IS NULL)
            AND sd.is_active = true
        `;
        
        const discountResult = await db.query(discountQuery, [student.student_id, student.group_id, selectedMonth]);
        const totalDiscount = discountResult.rows[0].total_discount || 0;
        
        // Required amount (original price - discount, minimum 0)
        const requiredAmount = Math.max(parseFloat(student.original_price) - totalDiscount, 0);
        
        // Student_payments yaratish
        const createPaymentQuery = `
          INSERT INTO student_payments (student_id, group_id, month, required_amount, paid_amount, created_at)
          VALUES ($1, $2, $3, $4, 0, NOW())
          ON CONFLICT (student_id, group_id, month) DO NOTHING
        `;
        
        await db.query(createPaymentQuery, [student.student_id, student.group_id, selectedMonth, requiredAmount]);
        
        // Ma'lumotni yangilash
        student.required_amount = requiredAmount.toString();
        student.discount_amount = totalDiscount.toString();
        student.debt_amount = requiredAmount.toString();
        
        // Payment status to'g'ri aniqlash
        if (requiredAmount === 0 && parseFloat(student.original_price) > 0) {
          student.payment_status = 'paid';  // 100% chegirma = to'langan
        } else if (requiredAmount > 0) {
          student.payment_status = 'unpaid';
        } else {
          student.payment_status = 'not_applicable';
        }
        
        console.log(`✅ ${student.name} ${student.surname} uchun ${requiredAmount} so'm required_amount yaratildi`);
      }
    }

    res.json({
      success: true,
      data: {
        month: selectedMonth,
        students: result.rows,
        summary: {
          total_students: result.rows.length,
          paid: result.rows.filter(s => s.payment_status === 'paid').length,
          partial: result.rows.filter(s => s.payment_status === 'partial').length,
          unpaid: result.rows.filter(s => s.payment_status === 'unpaid').length,
          not_set: result.rows.filter(s => s.payment_status === 'not_set').length,
          total_required: result.rows.reduce((sum, s) => sum + parseFloat(s.required_amount), 0),
          total_paid: result.rows.reduce((sum, s) => sum + parseFloat(s.paid_amount), 0)
        }
      }
    });

  } catch (error) {
    console.error('Error in getMonthlyPayments:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 2. TO'LOV QILISH
 * Bo'lib-bo'lib to'lash mumkin
 */
exports.makePayment = async (req, res) => {
  try {
    const { student_id, group_id, amount, month, payment_method = 'cash', description = '' } = req.body;
    const { id: admin_id } = req.user;

    // Validatsiyalar
    if (!student_id || !group_id || !amount || !month) {
      return res.status(400).json({
        success: false,
        message: 'student_id, group_id, amount va month maydonlari talab qilinadi (month: YYYY-MM formatda)'
      });
    }

    // Month formatini tekshirish
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'To\'lov summasi 0 dan katta bo\'lishi kerak'
      });
    }

    // Belgilangan oy uchun to'lov
    const selectedMonth = month;

    // Guruh ma'lumotlarini olish (joriy narx)
    const groupQuery = `
      SELECT g.price, g.name, s.name as subject_name
      FROM groups g 
      JOIN subjects s ON g.subject_id = s.id
      WHERE g.id = $1 AND g.status = 'active'
    `;
    const groupResult = await db.query(groupQuery, [group_id]);
    
    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Guruh topilmadi'
      });
    }

    const group = groupResult.rows[0];

    // Talaba shu guruhda ekanligini tekshirish
    const studentGroupQuery = `
      SELECT sg.student_id
      FROM student_groups sg
      WHERE sg.student_id = $1 AND sg.group_id = $2 AND sg.status = 'active'
    `;
    const studentGroupResult = await db.query(studentGroupQuery, [student_id, group_id]);
    
    if (studentGroupResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Talaba bu guruhga tegishli emas yoki faol emas'
      });
    }

    // O'sha oy uchun chegirmalarni hisoblash
    const discountQuery = `
      SELECT 
        SUM(
          CASE 
            WHEN discount_type = 'percent' THEN (${group.price} * discount_value / 100)
            WHEN discount_type = 'amount' THEN discount_value
            ELSE 0
          END
        ) as total_discount
      FROM student_discounts 
      WHERE student_id = $1 AND group_id = $2 
        AND $3 >= start_month
        AND ($3 <= end_month OR end_month IS NULL)
        AND is_active = true
    `;
    const discountResult = await db.query(discountQuery, [student_id, group_id, selectedMonth]);
    const totalDiscount = discountResult.rows[0].total_discount || 0;

    // Required amount (joriy narx - chegirma, minimum 0)
    const requiredAmount = Math.max(group.price - totalDiscount, 0);

    // Mavjud to'lov ma'lumotlarini olish yoki yaratish
    const paymentQuery = `
      INSERT INTO student_payments (student_id, group_id, month, required_amount, paid_amount, created_at)
      VALUES ($1, $2, $3, $4, 0, NOW())
      ON CONFLICT (student_id, group_id, month)
      DO UPDATE SET
        required_amount = CASE 
          WHEN student_payments.required_amount IS NULL THEN $4
          ELSE student_payments.required_amount
        END
      RETURNING *
    `;
    const paymentResult = await db.query(paymentQuery, [student_id, group_id, selectedMonth, requiredAmount]);
    const payment = paymentResult.rows[0];

    // Yangi to'lov summasi
    const newPaidAmount = parseFloat(payment.paid_amount) + parseFloat(amount);

    // To'lov qaydini yangilash
    const updateQuery = `
      UPDATE student_payments 
      SET 
        paid_amount = $1,
        last_payment_date = NOW(),
        updated_at = NOW()
      WHERE student_id = $2 AND group_id = $3 AND month = $4
      RETURNING *
    `;
    const updateResult = await db.query(updateQuery, [newPaidAmount, student_id, group_id, selectedMonth]);

    // Transaction qo'shish
    const transactionQuery = `
      INSERT INTO payment_transactions 
      (student_id, group_id, month, amount, payment_method, description, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `;
    const transactionResult = await db.query(transactionQuery, 
      [student_id, group_id, selectedMonth, amount, payment_method, description, admin_id]);

    res.json({
      success: true,
      message: 'To\'lov muvaffaqiyatli amalga oshirildi',
      data: {
        payment: updateResult.rows[0],
        transaction: transactionResult.rows[0],
        group: group
      }
    });

  } catch (error) {
    console.error('Error in makePayment:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 3. TALABANING TO'LOV TARIXI
 */
exports.getStudentPaymentHistory = async (req, res) => {
  try {
    const { student_id } = req.params;

    const query = `
      SELECT 
        pt.*,
        g.name as group_name,
        s.name as subject_name,
        CONCAT(u.name, ' ', u.surname) as admin_name
      FROM payment_transactions pt
      JOIN groups g ON pt.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN users u ON pt.created_by = u.id
      WHERE pt.student_id = $1
      ORDER BY pt.created_at DESC
    `;

    const result = await db.query(query, [student_id]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error in getStudentPaymentHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 5. OYLIK GROUP SNAPSHOT YARATISH (Har oy boshlanganda)
 * Bu funksiya group_monthly_settings VA student_payments ni ham yaratadi
 */
exports.createMonthlyGroupSnapshot = async (req, res) => {
  try {
    const { month } = req.body;
    const { role, id: userId } = req.user;

    // Faqat admin snapshot yarata oladi
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Faqat admin bu amalni bajarishi mumkin'
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

    // 1. Group snapshot yaratish
    const snapshotQuery = `
      INSERT INTO group_monthly_settings 
      (group_id, month, name_for_month, price_for_month, teacher_id_for_month, 
       subject_id_for_month, status_for_month, class_status_for_month, created_by)
      SELECT 
        g.id,
        $1 as month,
        g.name,
        g.price,
        g.teacher_id,
        g.subject_id,
        g.status,
        g.class_status,
        $2
      FROM groups g
      WHERE g.status = 'active'
      ON CONFLICT (group_id, month) 
      DO UPDATE SET
        name_for_month = EXCLUDED.name_for_month,
        price_for_month = EXCLUDED.price_for_month,
        teacher_id_for_month = EXCLUDED.teacher_id_for_month,
        subject_id_for_month = EXCLUDED.subject_id_for_month,
        status_for_month = EXCLUDED.status_for_month,
        class_status_for_month = EXCLUDED.class_status_for_month,
        created_by = EXCLUDED.created_by,
        created_at = NOW()
      RETURNING *
    `;

    const snapshotResult = await db.query(snapshotQuery, [selectedMonth, userId]);

    // 2. Student payments yaratish
    const studentsQuery = `
      SELECT 
        sg.student_id,
        sg.group_id,
        g.price as current_price,
        u.name,
        u.surname,
        g.name as group_name,
        sg.status as group_status
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      WHERE u.role = 'student'
        AND g.status = 'active'
        AND g.class_status = 'started'
        AND (
          -- 1. Hozir ham active bo'lgan talabalar
          (sg.status = 'active')
          OR
          -- 2. O'sha oyda to'xtatilgan talabalar (o'sha oy uchun to'lov kerak)
          (
            sg.status IN ('stopped', 'finished') 
            AND sg.leave_date IS NOT NULL 
            AND TO_CHAR(sg.leave_date, 'YYYY-MM') = $1
            AND (
              sg.join_date IS NULL 
              OR TO_CHAR(sg.join_date, 'YYYY-MM') <= $1
            )
          )
        )
        -- Guruhga o'sha oydan oldin qo'shilgan bo'lishi kerak
        AND (
          sg.join_date IS NULL 
          OR TO_CHAR(sg.join_date, 'YYYY-MM') <= $1
        )
      ORDER BY u.name, g.name
    `;

    const studentsResult = await db.query(studentsQuery, [selectedMonth]);
    
    let paymentsCreated = 0;
    let paymentsExists = 0;

    for (const student of studentsResult.rows) {
      // Chegirmalarni hisoblash
      const discountQuery = `
        SELECT 
          SUM(
            CASE 
              WHEN discount_type = 'percent' THEN ($3 * discount_value / 100)
              WHEN discount_type = 'amount' THEN discount_value
              ELSE 0
            END
          ) as total_discount
        FROM student_discounts 
        WHERE student_id = $1 
          AND group_id = $2 
          AND $4 >= start_month
          AND ($4 <= end_month OR end_month IS NULL)
          AND is_active = true
      `;
      const discountResult = await db.query(discountQuery, [student.student_id, student.group_id, student.current_price, selectedMonth]);
      const totalDiscount = discountResult.rows[0].total_discount || 0;

      // Required amount
      const requiredAmount = Math.max(student.current_price - totalDiscount, 0);

      // Payment record yaratish
      const paymentInsert = `
        INSERT INTO student_payments (student_id, group_id, month, required_amount, paid_amount, created_at)
        VALUES ($1, $2, $3, $4, 0, NOW())
        ON CONFLICT (student_id, group_id, month) DO NOTHING
      `;
      
      const paymentResult = await db.query(paymentInsert, [student.student_id, student.group_id, selectedMonth, requiredAmount]);
      
      if (paymentResult.rowCount > 0) {
        paymentsCreated++;
      } else {
        paymentsExists++;
      }
    }

    res.json({
      success: true,
      message: `${selectedMonth} oy uchun to'liq snapshot yaratildi`,
      data: {
        month: selectedMonth,
        groups_processed: snapshotResult.rows.length,
        students_found: studentsResult.rows.length,
        payments_created: paymentsCreated,
        payments_already_exists: paymentsExists
      }
    });

  } catch (error) {
    console.error('Error in createMonthlyGroupSnapshot:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 6. OY UCHUN TO'LOV QAYDNOMASINI YARATISH (Agar yo'q bo'lsa)
 */
exports.createMonthlyPaymentRecord = async (req, res) => {
  try {
    const { month } = req.body;
    const { role } = req.user;

    // Faqat admin ushbu amalni bajara oladi
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Faqat admin bu amalni bajarishi mumkin'
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

    // O'sha oyda bir lahzada ham active bo'lgan talabalar va ularning guruhlarini olish
    // Group status asosida ishlash - user status emas
    const monthStart = `${selectedMonth}-01`;
    const nextMonth = new Date(selectedMonth.split('-')[0], selectedMonth.split('-')[1], 1);
    const monthEnd = new Date(nextMonth.getTime() - 1).toISOString().split('T')[0];

    const studentsQuery = `
      SELECT 
        sg.student_id,
        sg.group_id,
        g.price as current_price,
        u.name,
        u.surname,
        g.name as group_name,
        sg.status as group_status,
        sg.join_date,
        sg.leave_date
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      WHERE u.role = 'student'
        AND g.status = 'active'
        AND g.class_status = 'started'
        AND (
          -- 1. Hozir ham active bo'lgan talabalar
          (sg.status = 'active')
          OR
          -- 2. O'sha oyda to'xtatilgan talabalar (o'sha oy uchun to'lov kerak)
          (
            sg.status IN ('stopped', 'finished') 
            AND sg.leave_date IS NOT NULL 
            AND TO_CHAR(sg.leave_date, 'YYYY-MM') = $1
            AND (
              sg.join_date IS NULL 
              OR TO_CHAR(sg.join_date, 'YYYY-MM') <= $1
            )
          )
        )
        -- Guruhga o'sha oydan oldin yoki o'sha oyda qo'shilgan bo'lishi kerak
        AND (
          sg.join_date IS NULL 
          OR TO_CHAR(sg.join_date, 'YYYY-MM') <= $1
        )
      ORDER BY u.name, g.name
    `;
    
    const studentsResult = await db.query(studentsQuery, [selectedMonth]);
    
    let created = 0;
    let alreadyExists = 0;

    for (const student of studentsResult.rows) {
      // Chegirmalarni hisoblash - faqat o'sha oy uchun
      const discountQuery = `
        SELECT 
          SUM(
            CASE 
              WHEN discount_type = 'percent' THEN ($3 * discount_value / 100)
              WHEN discount_type = 'amount' THEN discount_value
              ELSE 0
            END
          ) as total_discount
        FROM student_discounts 
        WHERE student_id = $1 
          AND group_id = $2 
          AND $4 >= start_month
          AND ($4 <= end_month OR end_month IS NULL)
          AND is_active = true
      `;
      const discountResult = await db.query(discountQuery, [student.student_id, student.group_id, selectedMonth]);
      const totalDiscount = discountResult.rows[0].total_discount || 0;

      // Required amount (joriy narx - chegirma, minimum 0)
      const requiredAmount = Math.max(student.current_price - totalDiscount, 0);

      // To'lov qaydnomasini yaratish (agar mavjud bo'lmasa)
      const insertQuery = `
        INSERT INTO student_payments (student_id, group_id, month, required_amount, paid_amount, created_at)
        VALUES ($1, $2, $3, $4, 0, NOW())
        ON CONFLICT (student_id, group_id, month) DO NOTHING
      `;
      
      const insertResult = await db.query(insertQuery, [student.student_id, student.group_id, selectedMonth, requiredAmount]);
      
      if (insertResult.rowCount > 0) {
        created++;
      } else {
        alreadyExists++;
      }
    }

    res.json({
      success: true,
      message: `${selectedMonth} oy uchun to'lov qaydnomalari yaratildi`,
      data: {
        month: selectedMonth,
        total_students: studentsResult.rows.length,
        created: created,
        already_exists: alreadyExists
      }
    });

  } catch (error) {
    console.error('Error in createMonthlyPaymentRecord:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 4. TALABA TO'LOVLARINI TO'LIQ TOZALASH (Admin only)
 */
exports.clearStudentPaymentsByMonth = async (req, res) => {
  try {
    const { student_id, group_id, month } = req.body;
    const { role } = req.user;

    // Faqat admin tozalay oladi
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Faqat admin bu amalni bajarishi mumkin'
      });
    }

    // Validatsiyalar
    if (!student_id || !group_id || !month) {
      return res.status(400).json({
        success: false,
        message: 'student_id, group_id va month parametrlari talab qilinadi'
      });
    }

    // Month formatini tekshirish
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    // Talaba va guruhning mavjudligini tekshirish
    const checkQuery = `
      SELECT 
        u.name, u.surname, g.name as group_name
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id  
      JOIN groups g ON sg.group_id = g.id
      WHERE sg.student_id = $1 AND sg.group_id = $2
    `;
    const checkResult = await db.query(checkQuery, [student_id, group_id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Talaba yoki guruh topilmadi'
      });
    }

    const studentInfo = checkResult.rows[0];

    await db.query('BEGIN');

    let deletedCounts = {
      transactions: 0,
      payments: 0,
      discounts: 0
    };

    // 1. Payment transactions ni o'chirish (to'lov tarixi)
    const deleteTransactionsQuery = `
      DELETE FROM payment_transactions 
      WHERE student_id = $1 AND group_id = $2 AND month = $3
      RETURNING id
    `;
    const transactionResult = await db.query(deleteTransactionsQuery, [student_id, group_id, month]);
    deletedCounts.transactions = transactionResult.rowCount;

    // 2. Student payments ni o'chirish (to'lov summasi)
    const deletePaymentsQuery = `
      DELETE FROM student_payments 
      WHERE student_id = $1 AND group_id = $2 AND month = $3
      RETURNING id
    `;
    const paymentResult = await db.query(deletePaymentsQuery, [student_id, group_id, month]);
    deletedCounts.payments = paymentResult.rowCount;

    // 3. Student discounts ni o'chirish (chegirmalar)
    const deleteDiscountsQuery = `
      DELETE FROM student_discounts 
      WHERE student_id = $1 AND group_id = $2 AND start_month = $3
      RETURNING id
    `;
    const discountResult = await db.query(deleteDiscountsQuery, [student_id, group_id, month]);
    deletedCounts.discounts = discountResult.rowCount;

    await db.query('COMMIT');

    res.json({
      success: true,
      message: `${studentInfo.name} ${studentInfo.surname}ning ${month} oy uchun barcha to'lov ma'lumotlari tozalandi`,
      data: {
        student_info: {
          student_id,
          name: studentInfo.name,
          surname: studentInfo.surname,
          group_name: studentInfo.group_name,
          group_id
        },
        deleted_counts: deletedCounts,
        month: month,
        total_deleted: deletedCounts.transactions + deletedCounts.payments + deletedCounts.discounts
      }
    });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error in clearStudentPaymentsByMonth:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 5. CHEGIRMA BERISH
 */
exports.giveDiscount = async (req, res) => {
  try {
    const { student_id, group_id, discount_type, discount_value, month, description } = req.body;
    const { id: adminId } = req.user;

    // Validatsiya
    if (!student_id || !group_id || !discount_type || !discount_value || !month) {
      return res.status(400).json({
        success: false,
        message: 'student_id, group_id, discount_type, discount_value va month majburiy (month: YYYY-MM formatda)'
      });
    }

    // Month formatini tekshirish
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    // Talaba va guruh tekshiruvi
    const studentCheck = await db.query(`
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

    // Chegirma yaratish/yangilash - FAQAT BELGILANGAN OY UCHUN
    await db.query(`
      INSERT INTO student_discounts 
      (student_id, group_id, discount_type, discount_value, start_month, end_month, description, created_by)
      VALUES ($1, $2, $3, $4, $5, $5, $6, $7)
      ON CONFLICT (student_id, group_id, start_month) 
      DO UPDATE SET 
        discount_type = EXCLUDED.discount_type,
        discount_value = EXCLUDED.discount_value,
        end_month = EXCLUDED.end_month,
        description = EXCLUDED.description,
        is_active = true
    `, [student_id, group_id, discount_type, discount_value, month, description, adminId]);

    // student_payments jadvalini yangilash
    await db.query(`
      INSERT INTO student_payments 
      (student_id, month, group_id, required_amount, paid_amount, created_by)
      VALUES ($1, $2, $3, $4, 0, $5)
      ON CONFLICT (student_id, group_id, month) 
      DO UPDATE SET 
        required_amount = $4
    `, [student_id, month, group_id, newRequiredAmount, adminId]);

    res.json({
      success: true,
      message: 'Chegirma muvaffaqiyatli berildi',
      data: {
        student_id,
        group_id,
        month,
        original_price: originalPrice,
        discount_amount: discountAmount,
        new_required_amount: newRequiredAmount,
        discount_type,
        discount_value
      }
    });

  } catch (error) {
    console.error('Error in giveDiscount:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 6. FILTER MA'LUMOTLARI
 */
exports.getPaymentFilters = async (req, res) => {
  try {
    // Teachers ro'yxati
    const teachersQuery = `
      SELECT DISTINCT t.id, t.name, t.surname
      FROM users t
      JOIN groups g ON t.id = g.teacher_id
      WHERE t.role = 'teacher' AND g.status = 'active'
      ORDER BY t.name, t.surname
    `;
    const teachersResult = await db.query(teachersQuery);

    // Subjects ro'yxati
    const subjectsQuery = `
      SELECT DISTINCT s.id, s.name
      FROM subjects s
      JOIN groups g ON s.id = g.subject_id
      WHERE g.status = 'active'
      ORDER BY s.name
    `;
    const subjectsResult = await db.query(subjectsQuery);

    res.json({
      success: true,
      data: {
        teachers: teachersResult.rows,
        subjects: subjectsResult.rows,
        payment_statuses: [
          { value: 'paid', label: 'To\'liq to\'lagan' },
          { value: 'partial', label: 'Qisman to\'lagan' },
          { value: 'unpaid', label: 'To\'lamagan' }
        ],
        payment_methods: [
          { value: 'cash', label: 'Naqd' },
          { value: 'card', label: 'Karta' },
          { value: 'transfer', label: 'O\'tkazma' }
        ]
      }
    });

  } catch (error) {
    console.error('Error in getPaymentFilters:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 7. OYLIK TO'LOVLARNI EXPORT QILISH
 */
exports.exportMonthlyPayments = async (req, res) => {
  try {
    const { month } = req.query;
    const { role, id: userId } = req.user;

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
    let params = [selectedMonth];
    
    if (role === 'teacher') {
      teacherFilter = 'AND g.teacher_id = $2';
      params.push(userId);
    }

    const query = `
      SELECT 
        u.name || ' ' || u.surname as student_name,
        g.name as group_name,
        s.name as subject_name,
        t.name || ' ' || t.surname as teacher_name,
        g.price as original_price,
        COALESCE(sp.required_amount, g.price) as required_amount,
        COALESCE(sp.paid_amount, 0) as paid_amount,
        (COALESCE(sp.required_amount, g.price) - COALESCE(sp.paid_amount, 0)) as debt_amount,
        CASE 
          WHEN COALESCE(sp.paid_amount, 0) >= COALESCE(sp.required_amount, g.price) THEN 'To\'liq to\'lagan'
          WHEN COALESCE(sp.paid_amount, 0) > 0 THEN 'Qisman to\'lagan'
          ELSE 'To\'lamagan'
        END as payment_status
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      JOIN users t ON g.teacher_id = t.id
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
                                    AND sp.month = $1
                                    AND sp.group_id = sg.group_id
      WHERE sg.status = 'active'
        AND u.role = 'student'
        AND g.status = 'active'
        ${teacherFilter}
      ORDER BY g.name, u.name, u.surname
    `;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        month: selectedMonth,
        export_data: result.rows
      }
    });

  } catch (error) {
    console.error('Error in exportMonthlyPayments:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 8. TALABANING O'Z TO'LOVLARI (Student faqat o'zinikini ko'radi)
 */
exports.getMyPayments = async (req, res) => {
  try {
    const { id: student_id, role } = req.user;
    const { month } = req.query;

    if (role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Faqat talabalar o\'z to\'lovlarini ko\'ra oladi'
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

    const query = `
      SELECT 
        sg.group_id,
        g.name as group_name,
        s.name as subject_name,
        t.name || ' ' || t.surname as teacher_name,
        g.price as original_price,
        COALESCE(sp.required_amount, g.price) as required_amount,
        COALESCE(sp.paid_amount, 0) as paid_amount,
        (COALESCE(sp.required_amount, g.price) - COALESCE(sp.paid_amount, 0)) as debt_amount,
        CASE 
          WHEN COALESCE(sp.paid_amount, 0) >= COALESCE(sp.required_amount, g.price) THEN 'paid'
          WHEN COALESCE(sp.paid_amount, 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END as payment_status,
        TO_CHAR(sp.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date
      FROM student_groups sg
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      JOIN users t ON g.teacher_id = t.id
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
                                    AND sp.month = $1
                                    AND sp.group_id = sg.group_id
      WHERE sg.student_id = $2 AND sg.status = 'active'
      ORDER BY g.name
    `;

    const result = await db.query(query, [selectedMonth, student_id]);

    res.json({
      success: true,
      data: {
        month: selectedMonth,
        payments: result.rows
      }
    });

  } catch (error) {
    console.error('Error in getMyPayments:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 9. TALABANING TO'LOV TARIXI (Admin va Student uchun)
 */
exports.getMyPaymentHistory = async (req, res) => {
  try {
    const { id: current_user_id, role } = req.user;
    const { month, group_id, student_id, limit = 50 } = req.query;

    let target_student_id;

    // Role va student_id aniqlash
    if (role === 'admin') {
      // Admin istalgan talabaning tarixini ko'ra oladi
      if (!student_id) {
        return res.status(400).json({
          success: false,
          message: 'Admin uchun student_id parametri talab qilinadi'
        });
      }
      target_student_id = student_id;
    } else if (role === 'student') {
      // Student faqat o'z tarixini ko'ra oladi
      target_student_id = current_user_id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'Faqat admin va talabalar to\'lov tarixini ko\'ra oladi'
      });
    }

    // Query parametrlari
    let params = [target_student_id];
    let paramIndex = 2;
    let whereConditions = [];
    
    // Month filtri
    if (month) {
      whereConditions.push(`pt.month = $${paramIndex}`);
      params.push(month);
      paramIndex++;
    }
    
    // Group filtri
    if (group_id) {
      whereConditions.push(`pt.group_id = $${paramIndex}`);
      params.push(group_id);
      paramIndex++;
    }
    
    // WHERE condition
    const additionalWhere = whereConditions.length > 0 
      ? ` AND ${whereConditions.join(' AND ')}`
      : '';

    const query = `
      SELECT 
        pt.month,
        pt.amount,
        pt.payment_method,
        pt.description,
        g.name as group_name,
        s.name as subject_name,
        CONCAT(u.name, ' ', u.surname) as student_name,
        CONCAT(admin.name, ' ', admin.surname) as admin_name,
        TO_CHAR(pt.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as payment_date
      FROM payment_transactions pt
      JOIN groups g ON pt.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      JOIN users u ON pt.student_id = u.id
      LEFT JOIN users admin ON pt.created_by = admin.id
      WHERE pt.student_id = $1
        ${additionalWhere}
      ORDER BY pt.created_at DESC
      LIMIT ${parseInt(limit)}
    `;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: {
        history: result.rows,
        filters: {
          student_id: target_student_id,
          month: month || 'all',
          group_id: group_id || 'all', 
          limit: parseInt(limit),
          total_found: result.rows.length
        },
        requested_by: role
      }
    });

  } catch (error) {
    console.error('Error in getMyPaymentHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};

/**
 * 10. TALABANING CHEGIMARILARI
 */
exports.getMyDiscounts = async (req, res) => {
  try {
    const { id: student_id, role } = req.user;

    if (role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Faqat talabalar o\'z chegirmalarini ko\'ra oladi'
      });
    }

    const query = `
      SELECT 
        sd.start_month as month,
        sd.discount_type,
        sd.discount_value,
        sd.description,
        g.name as group_name,
        s.name as subject_name,
        g.price as original_price,
        CASE 
          WHEN sd.discount_type = 'percent' THEN (g.price * sd.discount_value / 100)
          WHEN sd.discount_type = 'amount' THEN sd.discount_value
          ELSE 0
        END as discount_amount,
        TO_CHAR(sd.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as given_date
      FROM student_discounts sd
      JOIN groups g ON sd.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      WHERE sd.student_id = $1 AND sd.is_active = true
      ORDER BY sd.start_month DESC, sd.created_at DESC
    `;

    const result = await db.query(query, [student_id]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error in getMyDiscounts:', error);
    res.status(500).json({
      success: false,
      message: 'Xatolik yuz berdi',
      error: error.message
    });
  }
};