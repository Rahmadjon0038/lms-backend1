const db = require('../config/db');

/**
 * ===================================================================
 * PAYMENT CONTROLLER (Snapshot-based)
 * ===================================================================
 * 
 * ESLATMA: Asosiy to'lov va chegirma operatsiyalari endi snapshot orqali:
 * - /api/snapshots/make-payment
 * - /api/snapshots/discount
 * 
 * Bu yerda faqat talabaning o'z ma'lumotlarini ko'rish funksiyasi qoldirildi
 */

/**
 * TALABA O'Z TO'LOVLARI (Snapshot asosida)
 */
exports.getMyPayments = async (req, res) => {
  try {
    const { id: studentId, role } = req.user;

    // Faqat student role uchun
    if (role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Faqat talabalar o\'z ma\'lumotlarini ko\'ra oladi'
      });
    }

    const { month } = req.query;
    
    let whereClause = 'WHERE ms.student_id = $1';
    let params = [studentId];
    
    if (month) {
      whereClause += ' AND ms.month = $2';
      params.push(month);
    }

    // Snapshot'lardan ma'lumot olish
    const query = `
      SELECT 
        ms.month,
        ms.group_name,
        ms.subject_name,
        ms.teacher_name,
        ms.monthly_status,
        ms.payment_status,
        ms.required_amount,
        ms.paid_amount,
        ms.discount_amount,
        ms.debt_amount,
        ms.last_payment_date,
        ms.total_lessons,
        ms.attended_lessons,
        ms.attendance_percentage,
        TO_CHAR(ms.snapshot_created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY') as snapshot_date
      FROM monthly_snapshots ms
      ${whereClause}
      ORDER BY ms.month DESC, ms.group_name
    `;

    const result = await db.query(query, params);

    // Transaction tarixi (agar kerak bo'lsa)
    const transactionQuery = `
      SELECT 
        pt.month,
        pt.amount,
        pt.payment_method,
        pt.description,
        g.name as group_name,
        TO_CHAR(pt.created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as payment_date
      FROM payment_transactions pt
      JOIN groups g ON pt.group_id = g.id
      WHERE pt.student_id = $1
      ${month ? 'AND pt.month = $2' : ''}
      ORDER BY pt.created_at DESC
      LIMIT 50
    `;

    const transactionResult = await db.query(transactionQuery, params);

    // Umumiy statistika
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_enrollments,
        COUNT(CASE WHEN monthly_status = 'active' THEN 1 END) as active_enrollments,
        SUM(required_amount) as total_required,
        SUM(paid_amount) as total_paid,
        SUM(discount_amount) as total_discount,
        SUM(debt_amount) as total_debt,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN payment_status = 'partial' THEN 1 END) as partial_count,
        COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END) as unpaid_count
      FROM monthly_snapshots 
      WHERE student_id = $1
      ${month ? 'AND month = $2' : ''}
    `;

    const summaryResult = await db.query(summaryQuery, params);

    res.json({
      success: true,
      data: {
        enrollments: result.rows,
        transactions: transactionResult.rows,
        summary: summaryResult.rows[0]
      }
    });

  } catch (error) {
    console.error('❌ getMyPayments error:', error);
    res.status(500).json({
      success: false,
      message: 'O\'z ma\'lumotlarini olishda xatolik',
      error: error.message
    });
  }
};
