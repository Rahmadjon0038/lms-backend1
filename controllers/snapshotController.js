const db = require('../config/db');

/**
 * ===================================================================
 * MONTHLY SNAPSHOT CONTROLLER
 * ===================================================================
 * 
 * Bu controller har oylik snapshot yaratish va boshqarish uchun
 * Admin malum oy uchun snapshot yaratib, to'lov va davomatni boshqaradi
 */

/**
 * 1. MALUM OY UCHUN SNAPSHOT YARATISH
 */
exports.createMonthlySnapshot = async (req, res) => {
  try {
    const { month } = req.body;
    const { role } = req.user;

    // Faqat admin snapshot yarata oladi
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Faqat admin To\'lov jadvali yarata oladi'
      });
    }

    // Month validatsiyasi
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month YYYY-MM formatida bo\'lishi kerak'
      });
    }

    console.log(`📸 ${month} oy uchun snapshot yaratyapmiz...`);

    // Avval mavjud snapshot ni tekshiramiz
    const existingCheck = await db.query(
      'SELECT COUNT(*) as total FROM monthly_snapshots WHERE month = $1',
      [month]
    );

    const existingCount = parseInt(existingCheck.rows[0].total);

    if (existingCount > 0) {
      return res.status(400).json({
        success: false,
        message: `${month} oy uchun To'lov jadvali allaqachon mavjud (${existingCount} ta yozuv). Avval uni o'chiring.`,
        existing_records: existingCount
      });
    }

    // Barcha aktiv talabalar uchun snapshot yaratamiz
    const createSnapshotQuery = `
      INSERT INTO monthly_snapshots (
        month, student_id, group_id,
        student_name, student_surname, student_phone, 
        student_father_name, student_father_phone,
        group_name, group_price, subject_name, teacher_name,
        monthly_status, payment_status,
        required_amount, paid_amount, discount_amount, debt_amount,
        last_payment_date,
        total_lessons, attended_lessons, attendance_percentage
      )
      SELECT DISTINCT
        $1 as month,
        u.id as student_id,
        g.id as group_id,
        
        -- Student ma'lumotlari
        u.name as student_name,
        u.surname as student_surname,
        u.phone as student_phone,
        u.father_name as student_father_name,
        u.father_phone as student_father_phone,
        
        -- Guruh ma'lumotlari
        g.name as group_name,
        g.price as group_price,
        s.name as subject_name,
        CONCAT(t.name, ' ', t.surname) as teacher_name,
        
        -- Status ma'lumotlari (eng oxirgi holatga qarab)
        COALESCE(att.monthly_status, 'active') as monthly_status,
        CASE 
          WHEN COALESCE(att.monthly_status, 'active') != 'active' THEN 'inactive'
          WHEN COALESCE(sp.paid_amount, 0) >= COALESCE(sp.required_amount, g.price) THEN 'paid'
          WHEN COALESCE(sp.paid_amount, 0) > 0 THEN 'partial'
          ELSE 'unpaid'
        END as payment_status,
        
        -- To'lov ma'lumotlari
        COALESCE(sp.required_amount, g.price) as required_amount,
        COALESCE(sp.paid_amount, 0) as paid_amount,
        0 as discount_amount, -- Default 0, keyinchalik yangilanadi
        COALESCE(sp.required_amount, g.price) - COALESCE(sp.paid_amount, 0) as debt_amount,
        sp.last_payment_date,
        
        -- Davomat ma'lumotlari
        COALESCE(lesson_stats.total_lessons, 0) as total_lessons,
        COALESCE(lesson_stats.attended_lessons, 0) as attended_lessons,
        CASE 
          WHEN lesson_stats.total_lessons > 0 THEN 
            ROUND((lesson_stats.attended_lessons::decimal / lesson_stats.total_lessons * 100), 2)
          ELSE 0 
        END as attendance_percentage
        
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN users t ON g.teacher_id = t.id
      
      -- Attendance ma'lumotlari (eng oxirgi statusni olish)
      LEFT JOIN (
        SELECT DISTINCT ON (student_id, group_id)
          student_id, group_id, monthly_status
        FROM attendance 
        WHERE month <= $1
        ORDER BY student_id, group_id, month DESC
      ) att ON att.student_id = u.id AND att.group_id = g.id
      
      -- To'lov ma'lumotlari
      LEFT JOIN student_payments sp ON sp.student_id = u.id 
                                     AND sp.group_id = g.id 
                                     AND sp.month = $1
      
      -- Darslar statistikasi (faqat qo'shilgandan keyin)
      LEFT JOIN (
        SELECT 
          l.group_id,
          a.student_id,
          COUNT(l.id) as total_lessons,
          COUNT(CASE WHEN a.status = 'present' OR a.status = 'keldi' THEN 1 END) as attended_lessons
        FROM lessons l
        LEFT JOIN attendance a ON l.id = a.lesson_id
        LEFT JOIN student_groups sg ON a.student_id = sg.student_id AND l.group_id = sg.group_id
        WHERE DATE_TRUNC('month', l.date) = DATE_TRUNC('month', ($1 || '-01')::date)
          AND l.date >= COALESCE(DATE(sg.joined_at), l.date) -- Faqat qo'shilgandan keyin
        GROUP BY l.group_id, a.student_id
      ) lesson_stats ON lesson_stats.group_id = g.id AND lesson_stats.student_id = u.id
      
      WHERE u.role = 'student'
        AND sg.status = 'active'
        AND g.status = 'active'
        AND g.class_status = 'started'
        AND TO_CHAR(sg.joined_at, 'YYYY-MM') <= $1 -- Faqat o'sha oyda yoki undan oldin qo'shilganlar
      
      ORDER BY g.name, u.name
    `;

    const result = await db.query(createSnapshotQuery, [month]);
    
    console.log(`✅ ${result.rowCount} ta talaba uchun snapshot yaratildi`);

    // 0 ta yozuv bo'lsa muvaffaqiyat deb qaytarmaymiz
    if (result.rowCount === 0) {
      const diagnosticsQuery = `
        SELECT
          (SELECT COUNT(*) FROM groups WHERE status = 'active' AND class_status = 'started') AS active_started_groups,
          (SELECT COUNT(*) FROM student_groups WHERE status = 'active') AS active_student_group_links,
          (SELECT COUNT(*)
             FROM student_groups sg
             JOIN users u ON sg.student_id = u.id
             JOIN groups g ON sg.group_id = g.id
            WHERE u.role = 'student'
              AND sg.status = 'active'
              AND g.status = 'active'
              AND g.class_status = 'started'
              AND TO_CHAR(sg.joined_at, 'YYYY-MM') <= $1
          ) AS eligible_records
      `;
      const diagnostics = await db.query(diagnosticsQuery, [month]);

      return res.status(400).json({
        success: false,
        message: `${month} oy uchun To'lov jadvali yaratilmadi: mos talaba/guruh topilmadi`,
        data: {
          month,
          created_records: 0,
          diagnostics: diagnostics.rows[0]
        }
      });
    }

    // Yaratilgan snapshot statistikasi
    const statsQuery = `
      SELECT 
        COUNT(*) as total_students,
        COUNT(CASE WHEN monthly_status = 'active' THEN 1 END) as active_students,
        COUNT(CASE WHEN monthly_status = 'stopped' THEN 1 END) as stopped_students,
        COUNT(CASE WHEN monthly_status = 'finished' THEN 1 END) as finished_students,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_students,
        COUNT(CASE WHEN payment_status = 'partial' THEN 1 END) as partial_students,
        COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END) as unpaid_students,
        COUNT(CASE WHEN payment_status = 'inactive' THEN 1 END) as inactive_students,
        SUM(required_amount) as total_required,
        SUM(paid_amount) as total_paid,
        SUM(debt_amount) as total_debt
      FROM monthly_snapshots 
      WHERE month = $1
    `;

    const statsResult = await db.query(statsQuery, [month]);

    res.json({
      success: true,
      message: `${month} oy uchun To'lov jadvali muvaffaqiyatli yaratildi`,
      data: {
        month,
        created_records: result.rowCount,
        statistics: statsResult.rows[0]
      }
    });

  } catch (error) {
    console.error('Snapshot yaratishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * 2. SNAPSHOT RO'YXATI
 */
exports.getMonthlySnapshots = async (req, res) => {
  try {
    const { month, group_id, status, payment_status, teacher_id, subject_id } = req.query;
    const { role: userRole, id: userId } = req.user;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Month filter (majburiy)
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    whereConditions.push(`ms.month = $${paramIndex}`);
    params.push(month);
    paramIndex++;

    // Teacher faqat o'z guruhlarini ko'radi
    if (userRole === 'teacher') {
      const teacherGroupsQuery = `
        SELECT DISTINCT ms2.group_id 
        FROM monthly_snapshots ms2
        JOIN groups g ON ms2.group_id = g.id
        WHERE g.teacher_id = $${paramIndex} AND ms2.month = $1
      `;
      whereConditions.push(`ms.group_id IN (${teacherGroupsQuery})`);
      params.push(userId);
      paramIndex++;
    }

    // Filters
    if (group_id) {
      whereConditions.push(`ms.group_id = $${paramIndex}`);
      params.push(group_id);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`ms.monthly_status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (payment_status) {
      whereConditions.push(`ms.payment_status = $${paramIndex}`);
      params.push(payment_status);
      paramIndex++;
    }

    // Teacher ID filter - guruh orqali o'qituvchini filterlash
    if (teacher_id) {
      const teacherFilterQuery = `
        SELECT DISTINCT g.id 
        FROM groups g 
        WHERE g.teacher_id = $${paramIndex}
      `;
      whereConditions.push(`ms.group_id IN (${teacherFilterQuery})`);
      params.push(teacher_id);
      paramIndex++;
    }

    // Subject ID filter - guruh orqali fanni filterlash
    if (subject_id) {
      const subjectFilterQuery = `
        SELECT DISTINCT g.id 
        FROM groups g 
        WHERE g.subject_id = $${paramIndex}
      `;
      whereConditions.push(`ms.group_id IN (${subjectFilterQuery})`);
      params.push(subject_id);
      paramIndex++;
    }

    const query = `
      SELECT 
        ms.id,
        ms.month,
        ms.student_id,
        ms.group_id,
        ms.student_name,
        ms.student_surname,
        ms.student_phone,
        ms.student_father_name,
        ms.student_father_phone,
        ms.group_name,
        ms.group_price,
        ms.subject_name,
        ms.teacher_name,
        ms.monthly_status,
        ms.payment_status,
        ms.required_amount,
        ms.paid_amount,
        COALESCE(ms.discount_amount, 0) as discount_amount,
        (ms.required_amount - COALESCE(ms.discount_amount, 0)) as effective_required, -- Chegirma bilan kamaygan summa
        ms.debt_amount,
        TO_CHAR(ms.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date,
        ms.total_lessons,
        ms.attended_lessons,
        ms.attendance_percentage,
        TO_CHAR(ms.snapshot_created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as snapshot_created_at,
        TO_CHAR(ms.snapshot_updated_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as snapshot_updated_at,
        
        -- To'lovni amalga oshirgan admin ma'lumotlari
        u.name as payment_admin_first_name,
        u.surname as payment_admin_last_name,
        CASE WHEN ms.payment_made_by IS NOT NULL THEN 
          CONCAT(u.name, ' ', u.surname) 
        ELSE NULL END as payment_admin_full_name,
        
        -- Chegirma ma'lumotlari
        COALESCE(
          CASE 
            WHEN sd.discount_type = 'percent' THEN 
              ROUND((ms.required_amount * sd.discount_value / 100), 2)
            WHEN sd.discount_type = 'amount' THEN 
              sd.discount_value
            ELSE 0
          END, 0
        ) as discount_amount,
        sd.discount_type,
        sd.discount_value,
        sd.description as discount_description
        
      FROM monthly_snapshots ms
      LEFT JOIN student_discounts sd ON ms.student_id = sd.student_id 
        AND ms.group_id = sd.group_id
        AND sd.start_month <= ms.month 
        AND sd.end_month >= ms.month
        AND sd.is_active = true
      LEFT JOIN users u ON ms.payment_made_by = u.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ms.group_name, ms.student_name
    `;

    const result = await db.query(query, params);

    // STATIC SNAPSHOT - yaratilgandan keyin o'zgarmasligi kerak
    // Hybrid approach olib tashlandim - faqat snapshot ma'lumotlari
    
    // Summary statistika - faqat snapshot dan
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_students,
        COUNT(CASE WHEN ms.monthly_status = 'active' THEN 1 END) as active_students,
        COUNT(CASE WHEN ms.payment_status = 'paid' THEN 1 END) as paid_students,
        COUNT(CASE WHEN ms.payment_status = 'partial' THEN 1 END) as partial_students,
        COUNT(CASE WHEN ms.payment_status = 'unpaid' THEN 1 END) as unpaid_students,
        SUM(ms.required_amount) as total_required,
        SUM(ms.paid_amount) as total_paid,
        SUM(ms.debt_amount) as total_debt,
        COUNT(CASE WHEN sd.id IS NOT NULL THEN 1 END) as students_with_discounts,
        SUM(COALESCE(ms.discount_amount, 0)) as total_discount_amount
      FROM monthly_snapshots ms
      LEFT JOIN student_discounts sd ON ms.student_id = sd.student_id 
        AND ms.group_id = sd.group_id
        AND sd.start_month <= ms.month 
        AND sd.end_month >= ms.month
        AND sd.is_active = true
      WHERE ${whereConditions.join(' AND ')}
    `;

    const summaryResult = await db.query(summaryQuery, params);

    res.json({
      success: true,
      data: {
        month,
        students: result.rows,
        summary: summaryResult.rows[0]
      }
    });

  } catch (error) {
    console.error('Snapshot olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * 3. SNAPSHOT YANGILASH
 */
exports.updateMonthlySnapshot = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      monthly_status, 
      required_amount, 
      paid_amount,
      attendance_percentage 
    } = req.body;
    const { role } = req.user;

    // Faqat admin yangilashi mumkin
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Faqat admin To\'lov jadvalini yangilashi mumkin'
      });
    }

    // Mavjud snapshot ni topamiz
    const existingSnapshot = await db.query(
      'SELECT * FROM monthly_snapshots WHERE id = $1',
      [id]
    );

    if (existingSnapshot.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'To\'lov jadvali topilmadi'
      });
    }

    const current = existingSnapshot.rows[0];

    // Yangilanadigan maydonlar
    const updates = [];
    const params = [];
    let paramIndex = 1;
    let attendanceUpdateNeeded = false;
    let newMonthlyStatus = null;

    if (monthly_status !== undefined) {
      updates.push(`monthly_status = $${paramIndex}`);
      params.push(monthly_status);
      paramIndex++;
      
      // Attendance jadvalini ham yangilash uchun
      attendanceUpdateNeeded = true;
      newMonthlyStatus = monthly_status;

      // Status o'zgarsa payment status ham yangilanadi
      if (monthly_status !== 'active') {
        updates.push(`payment_status = 'inactive'`);
      }
    }

    if (required_amount !== undefined) {
      updates.push(`required_amount = $${paramIndex}`);
      params.push(required_amount);
      paramIndex++;
    }

    if (paid_amount !== undefined) {
      updates.push(`paid_amount = $${paramIndex}`);
      params.push(paid_amount);
      paramIndex++;

      // Paid amount o'zgarsa, payment status ham yangilanadi
      const newPaidAmount = parseFloat(paid_amount);
      const currentRequired = parseFloat(current.required_amount);

      let newPaymentStatus;
      if (newPaidAmount >= currentRequired) {
        newPaymentStatus = 'paid';
      } else if (newPaidAmount > 0) {
        newPaymentStatus = 'partial';
      } else {
        newPaymentStatus = 'unpaid';
      }

      updates.push(`payment_status = '${newPaymentStatus}'`);
      updates.push(`debt_amount = required_amount - $${paramIndex - 1}`);
    }

    if (attendance_percentage !== undefined) {
      updates.push(`attendance_percentage = $${paramIndex}`);
      params.push(attendance_percentage);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Hech qanday yangilanish berilmagan'
      });
    }

    // Yangilash
    const updateQuery = `
      UPDATE monthly_snapshots 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    params.push(id);

    const result = await db.query(updateQuery, params);

    // ATTENDANCE JADVALINI HAM YANGILASH
    if (attendanceUpdateNeeded && newMonthlyStatus) {
      console.log(`🔄 Attendance jadvalini yangilamoqda: student=${current.student_id}, group=${current.group_id}, month=${current.month}, status=${newMonthlyStatus}`);
      
      // Attendance jadvalida mavjud yozuv bormi tekshirish
      const existingAttendance = await db.query(`
        SELECT id FROM attendance 
        WHERE student_id = $1 AND group_id = $2 AND COALESCE(month, month_name) = $3
      `, [current.student_id, current.group_id, current.month]);

      if (existingAttendance.rows.length > 0) {
        // Mavjud yozuvni yangilash
        await db.query(`
          UPDATE attendance 
          SET monthly_status = $1, updated_at = NOW()
          WHERE student_id = $2 AND group_id = $3 AND COALESCE(month, month_name) = $4
        `, [newMonthlyStatus, current.student_id, current.group_id, current.month]);
        
        console.log(`✅ Attendance yangilandi`);
      } else {
        // Yangi attendance yozuv yaratish
        await db.query(`
          INSERT INTO attendance (student_id, group_id, month, month_name, monthly_status, created_at, updated_at)
          VALUES ($1, $2, $3, $3, $4, NOW(), NOW())
        `, [current.student_id, current.group_id, current.month, newMonthlyStatus]);
        
        console.log(`✅ Yangi attendance yozuv yaratildi`);
      }
    }

    console.log(`✅ Snapshot ${id} yangilandi`);

    res.json({
      success: true,
      message: 'To\'lov jadvali va attendance muvaffaqiyatli yangilandi',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Snapshot yangilashda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * 4. SNAPSHOT O'CHIRISH
 */
exports.deleteMonthlySnapshot = async (req, res) => {
  try {
    const { month } = req.params;
    const { role } = req.user;

    // Faqat admin o'chirishi mumkin
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Faqat admin To\'lov jadvalini o\'chirishi mumkin'
      });
    }

    // Month validatsiyasi
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month YYYY-MM formatida bo\'lishi kerak'
      });
    }

    console.log(`🗑️ ${month} oy snapshot va bog'liq ma'lumotlarni o'chirish boshlandi...`);

    // 1. Avval shu oyning barcha to'lov tranzaksiyalarini o'chirish
    const deleteTransactionsQuery = 'DELETE FROM payment_transactions WHERE month = $1';
    const transactionsResult = await db.query(deleteTransactionsQuery, [month]);
    console.log(`   💳 To'lov tranzaksiyalari o'chirildi: ${transactionsResult.rowCount} ta`);

    // 1.5. Student_payments jadvalini ham tozalash
    const deleteStudentPaymentsQuery = 'DELETE FROM student_payments WHERE month = $1';
    const studentPaymentsResult = await db.query(deleteStudentPaymentsQuery, [month]);
    console.log(`   💰 Talaba to'lov ma'lumotlari o'chirildi: ${studentPaymentsResult.rowCount} ta`);

    // 2. Shu oyning chegirmalarini o'chirish (yoki deaktivlashtirish)
    const deleteDiscountsQuery = `
      DELETE FROM student_discounts 
      WHERE start_month = $1 AND end_month = $1
    `;
    const discountsResult = await db.query(deleteDiscountsQuery, [month]);
    console.log(`   📉 Chegirmalar o'chirildi: ${discountsResult.rowCount} ta`);

    // 3. Ko'p oylik chegirmalarni deaktivlashtirish (agar shu oyni qamrab olsa)
    const deactivateMultiMonthDiscountsQuery = `
      UPDATE student_discounts 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE start_month <= $1 AND end_month >= $1 AND is_active = true
    `;
    const deactivatedResult = await db.query(deactivateMultiMonthDiscountsQuery, [month]);
    console.log(`   📊 Ko'p oylik chegirmalar deaktivlashtirildi: ${deactivatedResult.rowCount} ta`);

    // 4. Nihoyat snapshot o'zini o'chirish
    const deleteSnapshotsQuery = 'DELETE FROM monthly_snapshots WHERE month = $1';
    const snapshotsResult = await db.query(deleteSnapshotsQuery, [month]);
    console.log(`   📸 Snapshotlar o'chirildi: ${snapshotsResult.rowCount} ta`);

    const totalDeleted = transactionsResult.rowCount + studentPaymentsResult.rowCount + discountsResult.rowCount + snapshotsResult.rowCount;

    console.log(`✅ ${month} oy uchun barcha ma'lumotlar tozalandi!`);
    console.log(`   Jami o'chirildi: ${totalDeleted} ta yozuv`);
    console.log(`   Deaktivlashtirildi: ${deactivatedResult.rowCount} ta chegirma`);

    res.json({
      success: true,
      message: `${month} oy uchun barcha ma'lumotlar tozalandi`,
      deleted_summary: {
        transactions_deleted: transactionsResult.rowCount,
        student_payments_deleted: studentPaymentsResult.rowCount,
        discounts_deleted: discountsResult.rowCount,
        multi_month_discounts_deactivated: deactivatedResult.rowCount,
        snapshots_deleted: snapshotsResult.rowCount,
        total_deleted: totalDeleted
      }
    });

  } catch (error) {
    console.error('Snapshot o\'chirishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'To\'lov jadvalini o\'chirishda xatolik',
      error: error.message
    });
  }
};

/**
 * 6. SNAPSHOT ORQALI TO'LOV QILISH
 */
exports.makeSnapshotPayment = async (req, res) => {
  try {
    const { student_id, group_id, month, amount, payment_method = 'cash', description } = req.body;
    const adminId = req.user.id;

    // Validatsiya
    if (!student_id || !group_id || !month || !amount) {
      return res.status(400).json({
        success: false,
        message: 'student_id, group_id, month va amount majburiy'
      });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month YYYY-MM formatida bo\'lishi kerak'
      });
    }

    // Snapshot mavjudligini tekshirish
    const snapshotCheck = await db.query(
      'SELECT * FROM monthly_snapshots WHERE student_id = $1 AND group_id = $2 AND month = $3',
      [student_id, group_id, month]
    );

    if (snapshotCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `${month} oy uchun To'lov jadvali mavjud emas. Avval To'lov jadvali yarating.`
      });
    }

    const snapshot = snapshotCheck.rows[0];

    // To'lov transaction yaratish
    await db.query(`
      INSERT INTO payment_transactions 
      (student_id, group_id, month, amount, payment_method, description, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [student_id, group_id, month, amount, payment_method, description, adminId]);

    // Student_payments jadvalini yangilash
    await db.query(`
      INSERT INTO student_payments 
      (student_id, group_id, month, required_amount, paid_amount, last_payment_date, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $6)
      ON CONFLICT (student_id, group_id, month)
      DO UPDATE SET 
        paid_amount = student_payments.paid_amount + $5,
        last_payment_date = CURRENT_TIMESTAMP,
        updated_by = $6,
        updated_at = CURRENT_TIMESTAMP
    `, [student_id, group_id, month, snapshot.required_amount, amount, adminId]);

    // Snapshot jadvalini yangilash - chegirmani hisobga olish
    const newPaidAmount = parseFloat(snapshot.paid_amount) + parseFloat(amount);
    const originalRequired = parseFloat(snapshot.required_amount);
    const discountAmount = parseFloat(snapshot.discount_amount || 0);
    const effectiveRequired = originalRequired - discountAmount; // Chegirma bilan kamaygan summa
    const newDebtAmount = effectiveRequired - newPaidAmount; // Effective required - paid
    
    let newPaymentStatus = 'unpaid';
    if (newPaidAmount >= effectiveRequired) { // Chegirma bilan kamaygan summaga yetdimi?
      newPaymentStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newPaymentStatus = 'partial';
    }

    await db.query(`
      UPDATE monthly_snapshots 
      SET 
        paid_amount = $1,
        debt_amount = $2,
        payment_status = $3,
        last_payment_date = CURRENT_TIMESTAMP,
        payment_made_by = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE student_id = $5 AND group_id = $6 AND month = $7
    `, [newPaidAmount, newDebtAmount, newPaymentStatus, req.user.id, student_id, group_id, month]);

    res.json({
      success: true,
      message: `${amount} so'm to'lov qabul qilindi`,
      data: {
        student_id,
        group_id,
        month,
        amount,
        new_paid_amount: newPaidAmount,
        new_debt_amount: newDebtAmount,
        payment_status: newPaymentStatus
      }
    });

  } catch (error) {
    console.error('Snapshot to\'lov xatoligi:', error);
    res.status(500).json({
      success: false,
      message: 'To\'lov qilishda xatolik',
      error: error.message
    });
  }
};

/**
 * 7. SNAPSHOT ORQALI CHEGIRMA BERISH
 */
exports.giveSnapshotDiscount = async (req, res) => {
  try {
    const { student_id, group_id, month, discount_type, discount_value, description } = req.body;
    const adminId = req.user.id;

    // Validatsiya
    if (!student_id || !group_id || !month || !discount_type || !discount_value) {
      return res.status(400).json({
        success: false,
        message: 'Barcha majburiy maydonlarni to\'ldiring'
      });
    }

    if (!['percent', 'amount'].includes(discount_type)) {
      return res.status(400).json({
        success: false,
        message: 'discount_type faqat "percent" yoki "amount" bo\'lishi mumkin'
      });
    }

    // Snapshot mavjudligini tekshirish
    const snapshotCheck = await db.query(
      'SELECT * FROM monthly_snapshots WHERE student_id = $1 AND group_id = $2 AND month = $3',
      [student_id, group_id, month]
    );

    if (snapshotCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `${month} oy uchun To'lov jadvali mavjud emas`
      });
    }

    const snapshot = snapshotCheck.rows[0];

    // Chegirma miqdorini hisoblash
    let discountAmount;
    if (discount_type === 'percent') {
      discountAmount = (parseFloat(snapshot.required_amount) * parseFloat(discount_value)) / 100;
    } else {
      discountAmount = parseFloat(discount_value);
    }

    // Mavjud chegirmani tekshirish
    const existingDiscountCheck = await db.query(`
      SELECT * FROM student_discounts 
      WHERE student_id = $1 AND group_id = $2 AND start_month = $3
    `, [student_id, group_id, month]);

    if (existingDiscountCheck.rows.length > 0) {
      // Mavjud chegirmani yangilash
      await db.query(`
        UPDATE student_discounts 
        SET discount_type = $1, discount_value = $2, description = $3, 
            is_active = true, created_by = $4, updated_at = CURRENT_TIMESTAMP
        WHERE student_id = $5 AND group_id = $6 AND start_month = $7
      `, [discount_type, discount_value, description, adminId, student_id, group_id, month]);
      
      console.log(`🔄 Mavjud chegirma yangilandi`);
    } else {
      // Yangi chegirma yaratish
      await db.query(`
        INSERT INTO student_discounts 
        (student_id, group_id, discount_type, discount_value, start_month, end_month, description, is_active, created_by)
        VALUES ($1, $2, $3, $4, $5, $5, $6, true, $7)
      `, [student_id, group_id, discount_type, discount_value, month, description, adminId]);
      
      console.log(`✅ Yangi chegirma yaratildi`);
    }

    // Snapshot yangilash - chegirma effective required_amount ni kamaytiradi
    const originalRequired = parseFloat(snapshot.required_amount);
    const effectiveRequired = originalRequired - discountAmount; // 400,000 - 80,000 = 320,000
    const paidAmount = parseFloat(snapshot.paid_amount);
    const newDebtAmount = effectiveRequired - paidAmount; // 320,000 - paid_amount
    
    let newPaymentStatus = 'unpaid';
    if (paidAmount >= effectiveRequired) {
      newPaymentStatus = 'paid'; // Agar to'langan summa chegirma bilan kamaygan summaga yetsa
    } else if (paidAmount > 0) {
      newPaymentStatus = 'partial';
    }

    console.log(`📊 Chegirma hisob-kitobi:`);
    console.log(`   Asl summa: ${originalRequired}`);
    console.log(`   Chegirma: ${discountAmount}`);
    console.log(`   Yangi kerakli summa: ${effectiveRequired}`);
    console.log(`   To'langan: ${paidAmount}`);
    console.log(`   Yangi qarz: ${newDebtAmount}`);
    console.log(`   Yangi status: ${newPaymentStatus}`);

    const updateResult = await db.query(`
      UPDATE monthly_snapshots 
      SET 
        discount_amount = $1,
        debt_amount = $2,
        payment_status = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE student_id = $4 AND group_id = $5 AND month = $6
      RETURNING *
    `, [discountAmount, newDebtAmount, newPaymentStatus, student_id, group_id, month]);

    console.log(`📸 Snapshot yangilandi: ${updateResult.rowCount} ta yozuv`);

    if (updateResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: `${month} oy uchun To'lov jadvali topilmadi yoki yangilanmadi`
      });
    }

    res.json({
      success: true,
      message: 'Chegirma muvaffaqiyatli berildi va To\'lov jadvali yangilandi',
      data: {
        original_required: originalRequired,
        discount_amount: discountAmount,
        effective_required: effectiveRequired,
        paid_amount: paidAmount,
        new_debt_amount: newDebtAmount,
        payment_status: newPaymentStatus,
        updated_snapshot: updateResult.rows[0]
      }
    });

  } catch (error) {
    console.error('Snapshot chegirma xatoligi:', error);
    res.status(500).json({
      success: false,
      message: 'Chegirma berishda xatolik',
      error: error.message
    });
  }
};

/**
 * 7. TALABA TO'LOV MA'LUMOTLARINI TOZALASH
 */
exports.resetStudentPayment = async (req, res) => {
  try {
    const { student_id, group_id, month } = req.body;
    const { role } = req.user;

    // Faqat admin tozalashi mumkin
    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Faqat admin to\'lov ma\'lumotlarini tozalashi mumkin'
      });
    }

    // Validatsiya
    if (!student_id || !group_id || !month) {
      return res.status(400).json({
        success: false,
        message: 'student_id, group_id va month majburiy'
      });
    }

    // Snapshot mavjudligini tekshirish
    const snapshotCheck = await db.query(
      'SELECT * FROM monthly_snapshots WHERE student_id = $1 AND group_id = $2 AND month = $3',
      [student_id, group_id, month]
    );

    if (snapshotCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `${month} oy uchun To'lov jadvali topilmadi`
      });
    }

    const snapshot = snapshotCheck.rows[0];

    console.log(`🧹 To'lov ma'lumotlarini tozalash boshlandi:`);
    console.log(`   Talaba: ${snapshot.student_name} ${snapshot.student_surname}`);
    console.log(`   Guruh: ${snapshot.group_name}`);
    console.log(`   Oy: ${month}`);

    // 1. Chegirmalarni o'chirish/deaktivlashtirish
    const deactivateDiscountsResult = await db.query(`
      UPDATE student_discounts 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE student_id = $1 AND group_id = $2 
        AND start_month <= $3 AND end_month >= $3 AND is_active = true
    `, [student_id, group_id, month]);

    console.log(`   📉 Chegirmalar o'chirildi: ${deactivateDiscountsResult.rowCount} ta`);

    // 2. To'lov tranzaksiyalarini o'chirish
    const deleteTransactionsResult = await db.query(`
      DELETE FROM payment_transactions 
      WHERE student_id = $1 AND group_id = $2 AND month = $3
    `, [student_id, group_id, month]);

    console.log(`   💳 Tranzaksiyalar o'chirildi: ${deleteTransactionsResult.rowCount} ta`);

    // 3. Snapshot ni tozalash - barcha to'lov ma'lumotlarini reset qilish
    const resetSnapshot = await db.query(`
      UPDATE monthly_snapshots 
      SET 
        paid_amount = 0,
        discount_amount = 0,
        debt_amount = required_amount,
        payment_status = 'unpaid',
        last_payment_date = NULL,
        payment_made_by = NULL,
        snapshot_updated_at = CURRENT_TIMESTAMP
      WHERE student_id = $1 AND group_id = $2 AND month = $3
      RETURNING *
    `, [student_id, group_id, month]);

    console.log(`   📸 Snapshot tozalandi: ${resetSnapshot.rowCount} ta yozuv`);

    if (resetSnapshot.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'To\'lov jadvali tozalanmadi'
      });
    }

    const updatedSnapshot = resetSnapshot.rows[0];

    console.log(`✅ To'lov ma'lumotlari muvaffaqiyatli tozalandi!`);

    res.json({
      success: true,
      message: 'To\'lov ma\'lumotlari muvaffaqiyatli tozalandi',
      data: {
        student: `${snapshot.student_name} ${snapshot.student_surname}`,
        group: snapshot.group_name,
        month: month,
        reset_summary: {
          discounts_deactivated: deactivateDiscountsResult.rowCount,
          transactions_deleted: deleteTransactionsResult.rowCount,
          snapshot_reset: true,
          new_status: 'unpaid',
          debt_amount: updatedSnapshot.debt_amount
        },
        updated_snapshot: updatedSnapshot
      }
    });

  } catch (error) {
    console.error('To\'lov tozalashda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'To\'lov tozalashda xatolik',
      error: error.message
    });
  }
};

/**
 * 8. SNAPSHOT ORQALI TRANSACTION TARIXI
 */
exports.getSnapshotTransactions = async (req, res) => {
  try {
    const { student_id, group_id, month } = req.query;

    let whereConditions = ['1=1'];
    let params = [];
    let paramIndex = 1;

    if (student_id) {
      whereConditions.push(`pt.student_id = $${paramIndex}`);
      params.push(student_id);
      paramIndex++;
    }

    if (group_id) {
      whereConditions.push(`pt.group_id = $${paramIndex}`);
      params.push(group_id);
      paramIndex++;
    }

    if (month) {
      whereConditions.push(`pt.month = $${paramIndex}`);
      params.push(month);
      paramIndex++;
    }

    const query = `
      SELECT 
        pt.*,
        u.name as student_name,
        u.surname as student_surname,
        g.name as group_name,
        CASE WHEN admin.id IS NOT NULL THEN 
          CONCAT(admin.name, ' ', admin.surname) 
        ELSE NULL END as admin_name,
        TO_CHAR(pt.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as transaction_date
      FROM payment_transactions pt
      JOIN users u ON pt.student_id = u.id
      JOIN groups g ON pt.group_id = g.id
      LEFT JOIN users admin ON pt.created_by = admin.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY pt.created_at DESC
    `;

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Transaction tarixi xatoligi:', error);
    res.status(500).json({
      success: false,
      message: 'Transaction tarixi olishda xatolik',
      error: error.message
    });
  }
};

/**
 * 8. TALABA DAVOMATINI OLISH
 */
exports.getStudentAttendance = async (req, res) => {
  try {
    const { student_id, group_id, month } = req.query;
    const { role, id: userId } = req.user;
    let targetStudentId = student_id;

    // Validatsiya
    if (!group_id || !month) {
      return res.status(400).json({
        success: false,
        message: 'group_id va month parametrlari majburiy'
      });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month YYYY-MM formatida bo\'lishi kerak'
      });
    }

    // Student faqat o'z davomatini ko'rishi mumkin
    if (role === 'student') {
      if (student_id && parseInt(student_id, 10) !== parseInt(userId, 10)) {
        return res.status(403).json({
          success: false,
          message: 'Siz faqat o\'zingizning davomatingizni ko\'rishingiz mumkin'
        });
      }
      targetStudentId = userId;
    }

    if (!targetStudentId) {
      return res.status(400).json({
        success: false,
        message: 'student_id parametri majburiy'
      });
    }

    // Teacher faqat o'z guruhining davomatini ko'rishi mumkin
    if (role === 'teacher') {
      const teacherGroupCheck = await db.query(
        'SELECT id FROM groups WHERE id = $1 AND teacher_id = $2',
        [group_id, userId]
      );

      if (teacherGroupCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Siz faqat o\'z guruhingizning davomatini ko\'rishingiz mumkin'
        });
      }
    }

    // Snapshot mavjudligini tekshirish
    const snapshotQuery = `
      SELECT 
        ms.id,
        ms.month,
        ms.student_id,
        ms.group_id,
        ms.student_name,
        ms.student_surname,
        ms.student_phone,
        ms.group_name,
        ms.subject_name,
        ms.teacher_name,
        ms.monthly_status,
        ms.total_lessons,
        ms.attended_lessons,
        ms.attendance_percentage,
        TO_CHAR(ms.snapshot_created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as snapshot_date,
        TO_CHAR(ms.snapshot_updated_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_updated
      FROM monthly_snapshots ms
      WHERE ms.student_id = $1 AND ms.group_id = $2 AND ms.month = $3
    `;

    const snapshotResult = await db.query(snapshotQuery, [targetStudentId, group_id, month]);

    let snapshot;
    
    if (snapshotResult.rows.length === 0) {
      // Snapshot mavjud bo'lmasa, student va group ma'lumotlarini olish
      const studentGroupQuery = `
        SELECT 
          u.id as student_id,
          u.name as student_name,
          u.surname as student_surname,
          u.phone as student_phone,
          g.id as group_id,
          g.name as group_name,
          s.name as subject_name,
          CONCAT(t.name, ' ', t.surname) as teacher_name
        FROM student_groups sg
        JOIN users u ON sg.student_id = u.id
        JOIN groups g ON sg.group_id = g.id
        JOIN subjects s ON g.subject_id = s.id
        LEFT JOIN users t ON g.teacher_id = t.id
        WHERE sg.student_id = $1 AND sg.group_id = $2 AND sg.status = 'active'
      `;
      
      const studentGroupResult = await db.query(studentGroupQuery, [targetStudentId, group_id]);
      
      if (studentGroupResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Talaba va guruh bog\'lanishi topilmadi'
        });
      }
      
      const studentGroup = studentGroupResult.rows[0];
      
      // Default snapshot yaratish (hali davomat qilmagan student uchun)
      snapshot = {
        id: null,
        month: month,
        student_id: studentGroup.student_id,
        group_id: studentGroup.group_id,
        student_name: studentGroup.student_name,
        student_surname: studentGroup.student_surname,
        student_phone: studentGroup.student_phone,
        group_name: studentGroup.group_name,
        subject_name: studentGroup.subject_name,
        teacher_name: studentGroup.teacher_name,
        monthly_status: 'active',
        total_lessons: 0,
        attended_lessons: 0,
        attendance_percentage: 0,
        snapshot_date: null,
        last_updated: null
      };
    } else {
      snapshot = snapshotResult.rows[0];
    }

    // Kunlik davomat ma'lumotlarini olish (oydagi barcha darslar)
    // Talaba qo'shilishidan oldingi darslar uchun status = null qaytamiz
    const dailyAttendanceQuery = `
      SELECT 
        l.date as lesson_date,
        CASE
          WHEN sg.joined_at IS NOT NULL AND l.date < DATE(sg.joined_at) THEN NULL
          ELSE COALESCE(a.status, 'kelmagan')
        END as status,
        TO_CHAR(l.date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY') as formatted_date,
        TO_CHAR(a.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as marked_at
      FROM lessons l
      LEFT JOIN attendance a ON l.id = a.lesson_id AND a.student_id = $1
      LEFT JOIN student_groups sg ON sg.student_id = $1 AND sg.group_id = $2
      WHERE l.group_id = $2 
        AND TO_CHAR(l.date, 'YYYY-MM') = $3
      ORDER BY l.date ASC
    `;

    const dailyResult = await db.query(dailyAttendanceQuery, [targetStudentId, group_id, month]);

    // Real lessons count (agar snapshot bo'lmasa)
    if (snapshot.id === null && dailyResult.rows.length > 0) {
      const eligibleRows = dailyResult.rows.filter((row) => row.status !== null);
      snapshot.total_lessons = eligibleRows.length;
      snapshot.attended_lessons = dailyResult.rows.filter(row => row.status === 'keldi' || row.status === 'present').length;
      snapshot.attendance_percentage = snapshot.total_lessons > 0 
        ? Math.round((snapshot.attended_lessons / snapshot.total_lessons) * 100) 
        : 0;
    }

    // Davomat statistikasi
    const attendanceStats = {
      total_lessons: snapshot.total_lessons || 0,
      attended_lessons: snapshot.attended_lessons || 0,
      missed_lessons: (snapshot.total_lessons || 0) - (snapshot.attended_lessons || 0),
      attendance_percentage: snapshot.attendance_percentage || 0,
      status: snapshot.monthly_status
    };

    // Kunlik davomatni status bo'yicha guruhlash
    const attendanceByStatus = {
      keldi: dailyResult.rows.filter(row => row.status === 'keldi' || row.status === 'present').length,
      kelmadi: dailyResult.rows.filter(row => row.status === 'kelmadi' || row.status === 'absent').length,
      kechikdi: dailyResult.rows.filter(row => row.status === 'kechikdi' || row.status === 'late').length,
      kelmagan: dailyResult.rows.filter(row => row.status === 'kelmagan').length, // Hali belgilanmagan
      not_joined_yet: dailyResult.rows.filter(row => row.status === null).length // Talaba hali guruhga qo'shilmagan kunlar
    };

    console.log(`📊 Davomat so'raldi:`);
    console.log(`   Talaba: ${snapshot.student_name} ${snapshot.student_surname}`);
    console.log(`   Guruh: ${snapshot.group_name}`);
    console.log(`   Oy: ${month}`);
    console.log(`   Davomat: ${snapshot.attended_lessons}/${snapshot.total_lessons} (${snapshot.attendance_percentage}%)`);

    const responseMessage = snapshot.id === null 
      ? `Talaba hali darslarga qatnashmagan yoki To'lov jadvali yaratilmagan (${snapshot.total_lessons} ta dars mavjud)`
      : 'Davomat ma\'lumotlari muvaffaqiyatli olindi';

    res.json({
      success: true,
      message: responseMessage,
      data: {
        student_info: {
          id: snapshot.student_id,
          name: snapshot.student_name,
          surname: snapshot.student_surname,
          phone: snapshot.student_phone
        },
        group_info: {
          id: snapshot.group_id,
          name: snapshot.group_name,
          subject: snapshot.subject_name,
          teacher: snapshot.teacher_name
        },
        month: month,
        monthly_status: snapshot.monthly_status,
        attendance_statistics: attendanceStats,
        attendance_breakdown: attendanceByStatus,
        daily_attendance: dailyResult.rows,
        snapshot_info: {
          created_at: snapshot.snapshot_date,
          updated_at: snapshot.last_updated,
          is_new_student: snapshot.id === null
        }
      }
    });

  } catch (error) {
    console.error('Davomat olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Davomat ma\'lumotlarini olishda xatolik',
      error: error.message
    });
  }
};

/**
 * 9. SNAPSHOT SUMMARY - qarz, chegirma va to'lov statistikasi
 */
exports.getMonthlySnapshotSummary = async (req, res) => {
  try {
    const { month } = req.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    // Umumiy statistika
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_students,
        COUNT(CASE WHEN monthly_status = 'active' THEN 1 END) as active_students,
        COUNT(CASE WHEN monthly_status = 'stopped' THEN 1 END) as stopped_students,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_students,
        COUNT(CASE WHEN payment_status = 'partial' THEN 1 END) as partial_students,
        COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END) as unpaid_students,
        SUM(required_amount) as total_required,
        SUM(paid_amount) as total_paid,
        SUM(debt_amount) as total_debt,
        SUM(CASE WHEN monthly_status = 'active' THEN debt_amount ELSE 0 END) as active_debt
      FROM monthly_snapshots 
      WHERE month = $1
    `;

    const summaryResult = await db.query(summaryQuery, [month]);

    // Guruh bo'yicha breakdown
    const groupBreakdownQuery = `
      SELECT 
        group_name,
        COUNT(*) as students_count,
        SUM(required_amount) as group_required,
        SUM(paid_amount) as group_paid,
        SUM(debt_amount) as group_debt,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN monthly_status = 'active' THEN 1 END) as active_count
      FROM monthly_snapshots 
      WHERE month = $1
      GROUP BY group_id, group_name
      ORDER BY group_name
    `;

    const groupResult = await db.query(groupBreakdownQuery, [month]);

    // Chegirmalar statistikasi
    const discountQuery = `
      SELECT 
        COUNT(*) as discount_count,
        SUM(CASE WHEN discount_type = 'percent' THEN 
          (required_amount * discount_value / 100) 
          ELSE discount_value 
        END) as total_discount_amount
      FROM monthly_snapshots ms
      JOIN student_discounts sd ON ms.student_id = sd.student_id 
        AND ms.group_id = sd.group_id
      WHERE ms.month = $1 
        AND sd.start_month <= $1 
        AND sd.end_month >= $1
        AND sd.is_active = true
    `;

    const discountResult = await db.query(discountQuery, [month]);

    // To'lov metodlari statistikasi (agar kerak bo'lsa)
    const paymentMethodQuery = `
      SELECT 
        payment_method,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount
      FROM payment_transactions pt
      WHERE pt.month = $1
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `;

    const paymentMethodResult = await db.query(paymentMethodQuery, [month]);

    res.json({
      success: true,
      month,
      summary: summaryResult.rows[0],
      group_breakdown: groupResult.rows,
      discounts: discountResult.rows[0] || { discount_count: 0, total_discount_amount: 0 },
      payment_methods: paymentMethodResult.rows
    });

  } catch (error) {
    console.error('Snapshot summary xatoligi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * 7. SNAPSHOT MAVJUD OYLAR RO'YXATI
 */
exports.getAvailableSnapshots = async (req, res) => {
  try {
    const query = `
      SELECT 
        month,
        COUNT(*) as student_count,
        COUNT(CASE WHEN monthly_status = 'active' THEN 1 END) as active_count,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_count,
        SUM(required_amount) as total_required,
        SUM(paid_amount) as total_paid,
        TO_CHAR(MIN(snapshot_created_at) AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as created_at,
        TO_CHAR(MAX(snapshot_updated_at) AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as updated_at
      FROM monthly_snapshots
      GROUP BY month
      ORDER BY month DESC
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Snapshot ro\'yxatni olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * YANGI TALABALAR UCHUN SNAPSHOT YARATISH
 */
exports.createSnapshotForNewStudents = async (req, res) => {
  try {
    const { month } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'Oy kiritilishi kerak'
      });
    }

    // Snapshot yaratilgan vaqtni topamiz
    const snapshotCreatedQuery = `
      SELECT MAX(snapshot_created_at) as latest_snapshot_date
      FROM monthly_snapshots 
      WHERE month = $1
    `;
    const snapshotCreatedResult = await db.query(snapshotCreatedQuery, [month]);
    const snapshotCreatedDate = snapshotCreatedResult.rows[0]?.latest_snapshot_date;

    if (!snapshotCreatedDate) {
      return res.status(400).json({
        success: false,
        message: 'Bu oy uchun To\'lov jadvali yaratilmagan'
      });
    }

    // Yangi talabalarni topamiz
    let newStudentsQuery = `
      SELECT DISTINCT
          sg.student_id,
          sg.group_id,
          u.name as student_name,
          u.surname as student_surname,
          u.phone as student_phone,
          u.father_name as student_father_name,
          u.father_phone as student_father_phone,
          g.name as group_name,
          g.price as group_price,
          sub.name as subject_name,
          CONCAT(t.name, ' ', t.surname) as teacher_name
        FROM student_groups sg
        JOIN users u ON sg.student_id = u.id
        JOIN groups g ON sg.group_id = g.id
        JOIN subjects sub ON g.subject_id = sub.id
        LEFT JOIN users t ON g.teacher_id = t.id
        WHERE sg.joined_at > $1
          AND sg.status = 'active'
          AND g.status = 'active'
          AND g.class_status = 'started'
          AND u.role = 'student'
          AND TO_CHAR(sg.joined_at, 'YYYY-MM') <= $2 -- Faqat o'sha oyda yoki undan oldin qo'shilganlar
          AND NOT EXISTS (
            SELECT 1 FROM monthly_snapshots ms 
            WHERE ms.student_id = sg.student_id 
              AND ms.group_id = sg.group_id 
              AND ms.month = $2
          )
    `; 

    let params = [snapshotCreatedDate, month];

    // Role-based access control
    if (userRole === 'teacher') {
      newStudentsQuery += ` AND g.teacher_id = $3`;
      params.push(userId);
    }

    const newStudentsResult = await db.query(newStudentsQuery, params);

    if (newStudentsResult.rows.length === 0) {
      return res.json({
        success: true,
        message: 'Yangi talabalar topilmadi',
        count: 0
      });
    }

    // Har bir yangi talaba uchun snapshot yaratamiz
    const snapshotPromises = newStudentsResult.rows.map(async (student) => {
      // Attendance ma'lumotlarini hisoblaymiz (faqat qo'shilgandan keyin)
      const attendanceQuery = `
        SELECT 
          COUNT(l.id) as total_lessons,
          COUNT(CASE WHEN a.status = 'keldi' OR a.status = 'present' THEN 1 END) as attended_lessons
        FROM lessons l
        LEFT JOIN attendance a ON l.id = a.lesson_id AND a.student_id = $1
        LEFT JOIN student_groups sg ON sg.student_id = $1 AND sg.group_id = $2
        WHERE l.group_id = $2
          AND TO_CHAR(l.date, 'YYYY-MM') = $3
          AND l.date >= COALESCE(DATE(sg.joined_at), l.date) -- Faqat qo'shilgandan keyin
      `;
      const attendanceResult = await db.query(attendanceQuery, [student.student_id, student.group_id, month]);
      const attendance = attendanceResult.rows[0] || { total_lessons: 0, attended_lessons: 0 };

      // To'lov ma'lumotlarini hisoblaymiz
      const paymentQuery = `
        SELECT 
          COALESCE(SUM(amount), 0) as paid_amount,
          MAX(created_at) as last_payment_date
        FROM payments
        WHERE student_id = $1 
          AND group_id = $2
          AND TO_CHAR(created_at, 'YYYY-MM') = $3
      `;
      const paymentResult = await db.query(paymentQuery, [student.student_id, student.group_id, month]);
      const payment = paymentResult.rows[0] || { paid_amount: 0, last_payment_date: null };

      // Monthly status ni topamiz (attendance jadvalidan)
      const statusQuery = `
        SELECT monthly_status
        FROM attendance
        WHERE student_id = $1 AND group_id = $2 AND month = $3
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const statusResult = await db.query(statusQuery, [student.student_id, student.group_id, month]);
      const monthlyStatus = statusResult.rows[0]?.monthly_status || 'active';

      // Chegirma ma'lumotlarini topamiz
      const discountQuery = `
        SELECT 
          discount_type,
          discount_value
        FROM student_discounts
        WHERE student_id = $1 
          AND group_id = $2
          AND start_month <= $3
          AND end_month >= $3
          AND is_active = true
      `;
      const discountResult = await db.query(discountQuery, [student.student_id, student.group_id, month]);
      const discount = discountResult.rows[0];

      let discountAmount = 0;
      if (discount) {
        if (discount.discount_type === 'percent') {
          discountAmount = Math.round((student.group_price * discount.discount_value / 100) * 100) / 100;
        } else if (discount.discount_type === 'amount') {
          discountAmount = discount.discount_value;
        }
      }

      const requiredAmount = monthlyStatus === 'stopped' ? 0 : student.group_price;
      const effectiveRequired = requiredAmount - discountAmount;
      const paidAmount = parseFloat(payment.paid_amount) || 0;
      const debtAmount = effectiveRequired - paidAmount;

      let paymentStatus = 'unpaid';
      if (requiredAmount === 0 || paidAmount >= effectiveRequired) {
        paymentStatus = 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      }

      const attendancePercentage = attendance.total_lessons > 0 
        ? Math.round((attendance.attended_lessons / attendance.total_lessons) * 100)
        : 0;

      // Snapshot yaratamiz
      const insertQuery = `
        INSERT INTO monthly_snapshots (
          month, student_id, group_id, student_name, student_surname,
          student_phone, student_father_name, student_father_phone,
          group_name, group_price, subject_name, teacher_name,
          monthly_status, payment_status, required_amount, paid_amount,
          discount_amount, debt_amount, last_payment_date,
          total_lessons, attended_lessons, attendance_percentage,
          snapshot_created_at, snapshot_updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW()
        ) RETURNING id
      `;

      const insertParams = [
        month, student.student_id, student.group_id,
        student.student_name, student.student_surname, student.student_phone,
        student.student_father_name, student.student_father_phone,
        student.group_name, student.group_price, student.subject_name,
        student.teacher_name, monthlyStatus, paymentStatus,
        requiredAmount, paidAmount, discountAmount, debtAmount,
        payment.last_payment_date, attendance.total_lessons,
        attendance.attended_lessons, attendancePercentage
      ];

      return db.query(insertQuery, insertParams);
    });

    await Promise.all(snapshotPromises);

    res.json({
      success: true,
      message: `${newStudentsResult.rows.length} ta yangi talaba uchun To'lov jadvali yaratildi`,
      count: newStudentsResult.rows.length
    });

  } catch (error) {
    console.error('Yangi talabalar uchun snapshot yaratishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * YANGI TALABALAR BILDIRISHNOMASI
 * Snapshot yaratilgandan keyin qo'shilgan va o'qishni boshlagan talabalarni ko'rsatadi
 */
exports.getNewStudentsNotification = async (req, res) => {
  try {
    const { month } = req.query;
    const { role: userRole, id: userId } = req.user;

    // Month validation
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    // Snapshot yaratilgan vaqtni topamiz
    const snapshotCreatedQuery = `
      SELECT MAX(snapshot_created_at) as latest_snapshot_date
      FROM monthly_snapshots 
      WHERE month = $1
    `;
    const snapshotCreatedResult = await db.query(snapshotCreatedQuery, [month]);
    const snapshotCreatedDate = snapshotCreatedResult.rows[0]?.latest_snapshot_date;

    if (!snapshotCreatedDate) {
      return res.status(400).json({
        success: false,
        message: 'Bu oy uchun To\'lov jadvali yaratilmagan',
        data: {
          month,
          count: 0,
          new_students: []
        }
      });
    }

    // Yangi talabalarni topamiz (faqat o'qishni boshlaganlar)
    let newStudentsQuery = `
      SELECT DISTINCT
        sg.student_id,
        sg.group_id,
        u.name as student_name,
        u.surname as student_surname,
        u.phone as student_phone,
        g.name as group_name,
        s.name as subject_name,
        COALESCE(CONCAT(t.name, ' ', t.surname), 'Biriktirilmagan') as teacher_name,
        sg.joined_at,  -- ORDER BY uchun kerak
        TO_CHAR(sg.joined_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as joined_at_formatted,
        
        -- O'qishni boshlaganini tekshirish (darsga qatnashgan yoki darsi bor)
        CASE 
          WHEN lesson_count.total_lessons > 0 OR attendance_count.attended > 0 THEN true
          ELSE false 
        END as has_started,
        
        COALESCE(lesson_count.total_lessons, 0) as total_lessons_available,
        COALESCE(attendance_count.attended, 0) as lessons_attended
        
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN users t ON g.teacher_id = t.id
      
      -- O'sha oydagi darslar mavjudligini tekshirish
      LEFT JOIN (
        SELECT 
          l.group_id,
          COUNT(l.id) as total_lessons
        FROM lessons l
        WHERE TO_CHAR(l.date, 'YYYY-MM') = $2
        GROUP BY l.group_id
      ) lesson_count ON lesson_count.group_id = g.id
      
      -- Talabaning davomat yozuvlarini tekshirish
      LEFT JOIN (
        SELECT 
          a.student_id,
          l.group_id,
          COUNT(a.id) as attended
        FROM attendance a
        JOIN lessons l ON a.lesson_id = l.id
        WHERE TO_CHAR(l.date, 'YYYY-MM') = $2
          AND (a.status = 'keldi' OR a.status = 'present')
        GROUP BY a.student_id, l.group_id
      ) attendance_count ON attendance_count.student_id = sg.student_id 
                         AND attendance_count.group_id = sg.group_id
      
      WHERE sg.joined_at > $1  -- Snapshot dan keyin qo'shilgan
        AND sg.status = 'active'
        AND g.status = 'active'
        AND g.class_status = 'started'
        AND u.role = 'student'
        AND TO_CHAR(sg.joined_at, 'YYYY-MM') <= $2  -- O'sha oyda qo'shilgan
        
        -- Snapshot da yo'qligini tekshirish
        AND NOT EXISTS (
          SELECT 1 FROM monthly_snapshots ms 
          WHERE ms.student_id = sg.student_id 
            AND ms.group_id = sg.group_id 
            AND ms.month = $2
        )
    `;

    let params = [snapshotCreatedDate, month];

    // Teacher faqat o'z guruhlarini ko'radi
    if (userRole === 'teacher') {
      newStudentsQuery += ` AND g.teacher_id = $3`;
      params.push(userId);
    }

    newStudentsQuery += ` ORDER BY sg.joined_at DESC`;

    const result = await db.query(newStudentsQuery, params);

    // Faqat o'qishni boshlaganlarni filterlash
    const startedStudents = result.rows.filter(student => student.has_started).map(student => ({
      ...student,
      joined_at: student.joined_at_formatted // Formatted versiyani ishlatamiz
    }));
    const notStartedStudents = result.rows.filter(student => !student.has_started).map(student => ({
      ...student,
      joined_at: student.joined_at_formatted // Formatted versiyani ishlatamiz  
    }));

    res.json({
      success: true,
      data: {
        month,
        count: startedStudents.length,
        total_new_students: result.rows.length,
        new_students: startedStudents,
        not_started_students: notStartedStudents,
        snapshot_created_at: snapshotCreatedDate
      }
    });

  } catch (error) {
    console.error('Yangi talabalar bildirishnomasi xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

/**
 * TALABALAR TO'LOV MA'LUMOTLARINI EXCEL GA EXPORT QILISH
 */
exports.exportSnapshotsToExcel = async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { month, group_id, status, payment_status, teacher_id, subject_id } = req.query;
    const { role: userRole, id: userId } = req.user;

    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    // Month filter (majburiy)
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: 'Month parametri YYYY-MM formatida bo\'lishi kerak'
      });
    }

    whereConditions.push(`ms.month = $${paramIndex}`);
    params.push(month);
    paramIndex++;

    // Teacher faqat o'z guruhlarini ko'radi
    if (userRole === 'teacher') {
      const teacherGroupsQuery = `
        SELECT DISTINCT ms2.group_id 
        FROM monthly_snapshots ms2
        JOIN groups g ON ms2.group_id = g.id
        WHERE g.teacher_id = $${paramIndex} AND ms2.month = $1
      `;
      whereConditions.push(`ms.group_id IN (${teacherGroupsQuery})`);
      params.push(userId);
      paramIndex++;
    }

    // Filters
    if (group_id) {
      whereConditions.push(`ms.group_id = $${paramIndex}`);
      params.push(group_id);
      paramIndex++;
    }

    if (status) {
      whereConditions.push(`ms.monthly_status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (payment_status) {
      whereConditions.push(`ms.payment_status = $${paramIndex}`);
      params.push(payment_status);
      paramIndex++;
    }

    if (teacher_id) {
      const teacherFilterQuery = `
        SELECT DISTINCT g.id 
        FROM groups g 
        WHERE g.teacher_id = $${paramIndex}
      `;
      whereConditions.push(`ms.group_id IN (${teacherFilterQuery})`);
      params.push(teacher_id);
      paramIndex++;
    }

    if (subject_id) {
      const subjectFilterQuery = `
        SELECT DISTINCT g.id 
        FROM groups g 
        WHERE g.subject_id = $${paramIndex}
      `;
      whereConditions.push(`ms.group_id IN (${subjectFilterQuery})`);
      params.push(subject_id);
      paramIndex++;
    }

    // Export uchun kengaytirilgan ma'lumotlar
    const query = `
      SELECT 
        ms.student_name || ' ' || ms.student_surname as "Talaba F.I.SH",
        ms.student_phone as "Telefon raqami",
        ms.student_father_name as "Otasining ismi",
        ms.student_father_phone as "Otasining telefoni",
        ms.group_name as "Guruh nomi",
        ms.subject_name as "Fan",
        ms.teacher_name as "O'qituvchi",
        ms.group_price as "Guruh narxi (so'm)",
        CASE 
          WHEN ms.monthly_status = 'active' THEN 'Faol'
          WHEN ms.monthly_status = 'stopped' THEN 'To''xtatilgan'
          WHEN ms.monthly_status = 'finished' THEN 'Tugatilgan'
          ELSE ms.monthly_status
        END as "Oylik holati",
        CASE 
          WHEN ms.payment_status = 'paid' THEN 'To''langan'
          WHEN ms.payment_status = 'partial' THEN 'Qisman to''langan'
          WHEN ms.payment_status = 'unpaid' THEN 'To''lanmagan'
          WHEN ms.payment_status = 'inactive' THEN 'Nofaol'
          ELSE ms.payment_status
        END as "To'lov holati",
        ms.required_amount as "Kerakli summa (so'm)",
        ms.paid_amount as "To'langan summa (so'm)",
        ms.debt_amount as "Qarzdorlik (so'm)",
        COALESCE(
          CASE 
            WHEN sd.discount_type = 'percent' THEN 
              ROUND((ms.required_amount * sd.discount_value / 100), 2)
            WHEN sd.discount_type = 'amount' THEN 
              sd.discount_value
            ELSE 0
          END, 0
        ) as "Chegirma summasi (so'm)",
        CASE 
          WHEN sd.discount_type = 'percent' THEN sd.discount_value || '%'
          WHEN sd.discount_type = 'amount' THEN sd.discount_value || ' so''m'
          ELSE 'Yo''q'
        END as "Chegirma",
        ms.total_lessons as "Jami darslar",
        ms.attended_lessons as "Qatnashgan darslar",
        ms.attendance_percentage || '%' as "Davomat foizi",
        TO_CHAR(ms.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as "Oxirgi to'lov vaqti",
        TO_CHAR(ms.snapshot_created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as "To'lov jadvali yaratilgan vaqt"
        
      FROM monthly_snapshots ms
      LEFT JOIN student_discounts sd ON ms.student_id = sd.student_id 
        AND ms.group_id = sd.group_id
        AND sd.start_month <= ms.month 
        AND sd.end_month >= ms.month
        AND sd.is_active = true
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ms.group_name, ms.student_name
    `;

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Export qilish uchun ma\'lumotlar topilmadi'
      });
    }

    // Excel fayl yaratish
    const worksheet = XLSX.utils.json_to_sheet(result.rows);
    const workbook = XLSX.utils.book_new();
    
    // Worksheet nomini o'rnatish
    const sheetName = `Talabalar_${month}`;
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Kenglikni avtomatik sozlash
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const columnWidths = [];
    
    for (let C = range.s.c; C <= range.e.c; C++) {
      let maxWidth = 10;
      for (let R = range.s.r; R <= range.e.r; R++) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = worksheet[cellAddress];
        if (cell && cell.v) {
          const cellLength = String(cell.v).length;
          maxWidth = Math.max(maxWidth, cellLength);
        }
      }
      columnWidths.push({ width: Math.min(maxWidth + 2, 50) });
    }
    worksheet['!cols'] = columnWidths;

    // Excel buffer yaratish
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Fayl nomini yaratish
    const fileName = `Talabalar_To'lov_Ma'lumotlari_${month}.xlsx`;

    // Response headers o'rnatish
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Excel faylni yuborish
    res.send(excelBuffer);

  } catch (error) {
    console.error('Excel export xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message
    });
  }
};

module.exports = {
  createMonthlySnapshot: exports.createMonthlySnapshot,
  getMonthlySnapshots: exports.getMonthlySnapshots,
  getMonthlySnapshotSummary: exports.getMonthlySnapshotSummary,
  makeSnapshotPayment: exports.makeSnapshotPayment,
  giveSnapshotDiscount: exports.giveSnapshotDiscount,
  resetStudentPayment: exports.resetStudentPayment,
  getSnapshotTransactions: exports.getSnapshotTransactions,
  getStudentAttendance: exports.getStudentAttendance,
  updateMonthlySnapshot: exports.updateMonthlySnapshot,
  deleteMonthlySnapshot: exports.deleteMonthlySnapshot,
  getAvailableSnapshots: exports.getAvailableSnapshots,
  createSnapshotForNewStudents: exports.createSnapshotForNewStudents,
  getNewStudentsNotification: exports.getNewStudentsNotification,
  exportSnapshotsToExcel: exports.exportSnapshotsToExcel
};
