const pool = require('../config/db');

// ============================================================================
// ADMIN DASHBOARD STATISTIKALARI
// ============================================================================

/**
 * Admin dashboard uchun sodda statistikalar (qabulxona admin)
 * Query params:
 *  - date: kunlik statistikalar uchun sana (YYYY-MM-DD) - default: bugun
 *  - month: oylik statistikalar uchun oy (YYYY-MM) - default: joriy oy
 */
const getDashboardStats = async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Filter parametrlari
    const selectedDate = req.query.date || new Date().toISOString().split('T')[0];
    const selectedMonth = req.query.month || new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    console.log(`📊 Admin dashboard statistikalari - Sana: ${selectedDate}, Oy: ${selectedMonth}`);

    // ========== KUNLIK STATISTIKALAR (tanlangan sana bo'yicha) ==========
    
    // 1. KUNLIK TO'LOVLAR
    const dailyPayments = await client.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payment_transactions 
      WHERE DATE(created_at AT TIME ZONE 'Asia/Tashkent') = $1
    `, [selectedDate]);

    // 2. KUNLIK YANGI TALABALAR (tanlangan kun)
    const dailyNewStudents = await client.query(`
      SELECT 
        u.id,
        u.name || ' ' || u.surname as student_name,
        u.phone,
        g.name as group_name,
        s.name as subject_name,
        TO_CHAR(sg.joined_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as join_date
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      WHERE DATE(sg.joined_at) = $1
      ORDER BY sg.joined_at DESC
    `, [selectedDate]);

    // 3. TO'LOV USULLARI (tanlangan kun)
    const paymentMethods = await client.query(`
      SELECT 
        CASE payment_method 
          WHEN 'cash' THEN 'Naqd'
          WHEN 'card' THEN 'Karta'
          WHEN 'transfer' THEN 'O''tkazma'
          ELSE payment_method
        END as method,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM payment_transactions 
      WHERE DATE(created_at AT TIME ZONE 'Asia/Tashkent') = $1
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `, [selectedDate]);

    // ========== OYLIK STATISTIKALAR (tanlangan oy bo'yicha) ==========
    
    // 4. OYLIK TO'LOVLAR
    const monthlyPayments = await client.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payment_transactions 
      WHERE month = $1
    `, [selectedMonth]);

    // 5. OYLIK YANGI TALABALAR
    const monthlyNewStudents = await client.query(`
      SELECT COUNT(DISTINCT student_id) as count
      FROM student_groups
      WHERE TO_CHAR(join_date, 'YYYY-MM') = $1
    `, [selectedMonth]);

    // 6. QARZDOR TALABALAR SONI (tanlangan oy uchun)
    const debtorStudents = await client.query(`
      WITH student_discounts_calc AS (
        SELECT 
          sd.student_id,
          sd.group_id,
          SUM(
            CASE sd.discount_type
              WHEN 'percent' THEN (sd.discount_value / 100.0) * g.price
              WHEN 'amount' THEN sd.discount_value
              ELSE 0
            END
          ) as total_discount_amount
        FROM student_discounts sd
        JOIN groups g ON sd.group_id = g.id
        WHERE sd.is_active = true
          AND sd.start_month <= $1
          AND (sd.end_month IS NULL OR sd.end_month >= $1)
        GROUP BY sd.student_id, sd.group_id
      )
      SELECT COUNT(DISTINCT sg.student_id) as count
      FROM student_groups sg
      JOIN groups g ON sg.group_id = g.id
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
                                    AND sp.month = $1 
                                    AND sp.group_id = sg.group_id
      LEFT JOIN student_discounts_calc sdc ON sg.student_id = sdc.student_id 
                                            AND sg.group_id = sdc.group_id
      WHERE sg.status = 'active' 
        AND g.status = 'active' 
        AND g.class_status = 'started'
        AND COALESCE(sp.paid_amount, 0) < GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0)
    `, [selectedMonth]);

    // ========== UMUMIY STATISTIKALAR (dastur boshidan) ==========
    
    // 7. JAMI TO'LOVLAR (barchasi)
    const totalPayments = await client.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payment_transactions
    `);

    // 8. JAMI TALABALAR (barchasi - aktiv va noaktiv)
    const totalStudents = await client.query(`
      SELECT COUNT(DISTINCT student_id) as count
      FROM student_groups
    `);

    // 9. AKTIV TALABALAR
    const activeStudents = await client.query(`
      SELECT COUNT(DISTINCT sg.student_id) as count
      FROM student_groups sg
      JOIN groups g ON sg.group_id = g.id
      WHERE sg.status = 'active' 
        AND g.status = 'active' 
        AND g.class_status = 'started'
    `);

    // 10. AKTIV GURUHLAR
    const activeGroups = await client.query(`
      SELECT COUNT(*) as count
      FROM groups 
      WHERE status = 'active' AND class_status = 'started'
    `);

    // 11. JAMI GURUHLAR
    const totalGroups = await client.query(`
      SELECT COUNT(*) as count
      FROM groups
    `);

    const dashboardData = {
      // Kunlik statistikalar
      daily: {
        date: selectedDate,
        is_today: selectedDate === today,
        payments: {
          count: parseInt(dailyPayments.rows[0].count),
          amount: parseFloat(dailyPayments.rows[0].total_amount)
        },
        new_students: {
          count: dailyNewStudents.rows.length,
          list: dailyNewStudents.rows.map(row => ({
            id: row.id,
            student_name: row.student_name,
            phone: row.phone,
            group_name: row.group_name,
            subject_name: row.subject_name,
            join_date: row.join_date
          }))
        },
        payment_methods: paymentMethods.rows.map(row => ({
          method: row.method,
          count: parseInt(row.count),
          total_amount: parseFloat(row.total_amount)
        }))
      },

      // Oylik statistikalar
      monthly: {
        month: selectedMonth,
        is_current_month: selectedMonth === currentMonth,
        payments: {
          count: parseInt(monthlyPayments.rows[0].count),
          amount: parseFloat(monthlyPayments.rows[0].total_amount)
        },
        new_students: parseInt(monthlyNewStudents.rows[0].count),
        debtor_students: parseInt(debtorStudents.rows[0].count)
      },

      // Umumiy statistikalar
      overall: {
        total_payments: {
          count: parseInt(totalPayments.rows[0].count),
          amount: parseFloat(totalPayments.rows[0].total_amount)
        },
        students: {
          total: parseInt(totalStudents.rows[0].count),
          active: parseInt(activeStudents.rows[0].count)
        },
        groups: {
          total: parseInt(totalGroups.rows[0].count),
          active: parseInt(activeGroups.rows[0].count)
        }
      },

      meta: {
        generated_at: new Date().toISOString(),
        filters: {
          selected_date: selectedDate,
          selected_month: selectedMonth,
          today_date: today,
          current_month: currentMonth
        }
      }
    };

    console.log(`✅ Admin dashboard muvaffaqiyatli yaratildi`);
    
    res.json({
      success: true,
      message: 'Admin dashboard statistikalari muvaffaqiyatli olindi',
      data: dashboardData
    });

  } catch (error) {
    console.error('❌ Admin dashboard statistikalari xatoligi:', error);
    res.status(500).json({
      success: false,
      message: 'Dashboard statistikalarini olishda xatolik yuz berdi',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Qarzdor talabalar ro'yxati (admin uchun)
 */
const getDebtorStudents = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { limit = 50 } = req.query;

    const debtorsList = await client.query(`
      WITH student_discounts_calc AS (
        SELECT 
          sd.student_id,
          sd.group_id,
          SUM(
            CASE sd.discount_type
              WHEN 'percent' THEN (sd.discount_value / 100.0) * g.price
              WHEN 'amount' THEN sd.discount_value
              ELSE 0
            END
          ) as total_discount_amount
        FROM student_discounts sd
        JOIN groups g ON sd.group_id = g.id
        WHERE sd.is_active = true
          AND sd.start_month <= $1
          AND (sd.end_month IS NULL OR sd.end_month >= $1)
        GROUP BY sd.student_id, sd.group_id
      )
      SELECT 
        u.id,
        u.name || ' ' || u.surname as student_name,
        u.phone,
        g.name as group_name,
        s.name as subject_name,
        g.price as original_price,
        COALESCE(sdc.total_discount_amount, 0) as discount_amount,
        GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) as required_amount,
        COALESCE(sp.paid_amount, 0) as paid_amount,
        (GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) - COALESCE(sp.paid_amount, 0)) as debt_amount,
        TO_CHAR(sp.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date
        
      FROM student_groups sg
      JOIN users u ON sg.student_id = u.id
      JOIN groups g ON sg.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      LEFT JOIN student_discounts_calc sdc ON sg.student_id = sdc.student_id 
                                            AND sg.group_id = sdc.group_id
      LEFT JOIN student_payments sp ON sg.student_id = sp.student_id 
                                    AND sp.month = $1 
                                    AND sp.group_id = sg.group_id
      
      WHERE sg.status = 'active' 
        AND g.status = 'active' 
        AND g.class_status = 'started'
        AND COALESCE(sp.paid_amount, 0) < GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0)
      
      ORDER BY debt_amount DESC
      LIMIT $2
    `, [currentMonth, limit]);

    res.json({
      success: true,
      message: 'Qarzdor talabalar ro\'yxati muvaffaqiyatli olindi',
      data: {
        month: currentMonth,
        total_debtors: debtorsList.rows.length,
        students: debtorsList.rows.map(row => ({
          id: row.id,
          student_name: row.student_name,
          phone: row.phone,
          group_name: row.group_name,
          subject_name: row.subject_name,
          original_price: parseFloat(row.original_price),
          discount_amount: parseFloat(row.discount_amount),
          required_amount: parseFloat(row.required_amount),
          paid_amount: parseFloat(row.paid_amount),
          debt_amount: parseFloat(row.debt_amount),
          last_payment_date: row.last_payment_date || 'Hech qachon'
        }))
      }
    });

  } catch (error) {
    console.error('❌ Qarzdor talabalar ro\'yxati xatoligi:', error);
    res.status(500).json({
      success: false,
      message: 'Qarzdor talabalar ro\'yxatini olishda xatolik yuz berdi',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Super Admin dashboard uchun to'liq statistikalar
 */
const getSuperAdminStats = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    
    console.log(`📊 Super Admin dashboard statistikalari so'ralmoqda - ${today}`);

    // 1. SHU OYDAGI JAMI TO'LOVLAR (DAROMAD)
    const monthlyPayments = await client.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total_amount
      FROM payment_transactions 
      WHERE month = $1
    `, [currentMonth]);

    // 2. AKTIV TALABALAR SONI
    const activeStudents = await client.query(`
      SELECT COUNT(DISTINCT sg.student_id) as count
      FROM student_groups sg
      JOIN groups g ON sg.group_id = g.id
      WHERE sg.status = 'active' 
        AND g.status = 'active' 
        AND g.class_status = 'started'
    `);

    // 3. AKTIV GURUHLAR SONI
    const activeGroups = await client.query(`
      SELECT COUNT(*) as count
      FROM groups 
      WHERE status = 'active' AND class_status = 'started'
    `);

    // 4. AKTIV O'QITUVCHILAR SONI
    const activeTeachers = await client.query(`
      SELECT COUNT(DISTINCT teacher_id) as count
      FROM groups 
      WHERE status = 'active' AND class_status = 'started'
    `);

    // 5. SHU OYDAGI DARS DAVOMATLARI STATISTIKASI
    const monthlyAttendance = await client.query(`
      SELECT 
        COUNT(*) as total_lessons,
        COUNT(*) FILTER (WHERE status = 'present') as present_count,
        COUNT(*) FILTER (WHERE status = 'absent') as absent_count,
        COUNT(*) FILTER (WHERE status = 'late') as late_count,
        ROUND(
          (COUNT(*) FILTER (WHERE status = 'present') * 100.0 / 
           CASE WHEN COUNT(*) = 0 THEN 1 ELSE COUNT(*) END), 2
        ) as attendance_percentage
      FROM attendance a
      JOIN lessons l ON a.lesson_id = l.id
      WHERE TO_CHAR(l.date, 'YYYY-MM') = $1
    `, [currentMonth]);

    // 6. O'QITUVCHILARGA TO'LANGAN OYLIK MAOSHLAR
    const teacherSalaries = await client.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_paid
      FROM teacher_salary_transactions 
      WHERE month = $1 AND payment_type = 'salary'
    `, [currentMonth]);

    // 7. BOSHQA RASXODLAR (avanslar, bonuslar)
    const otherExpenses = await client.query(`
      SELECT 
        payment_type,
        COALESCE(SUM(amount), 0) as total_amount
      FROM teacher_salary_transactions 
      WHERE month = $1 AND payment_type != 'salary'
      GROUP BY payment_type
    `, [currentMonth]);

    // 8. SOF FOYDA HISOBI
    const totalRevenue = parseFloat(monthlyPayments.rows[0].total_amount);
    const totalSalaries = parseFloat(teacherSalaries.rows[0].total_paid);
    const totalOtherExpenses = otherExpenses.rows.reduce((sum, row) => 
      sum + parseFloat(row.total_amount), 0
    );
    const totalExpenses = totalSalaries + totalOtherExpenses;
    const netProfit = totalRevenue - totalExpenses;

    // 9. GURUH VA FAN BO'YICHA DAROMAD
    const revenueBySubject = await client.query(`
      SELECT 
        s.name as subject_name,
        COUNT(DISTINCT g.id) as groups_count,
        COUNT(DISTINCT pt.student_id) as students_count,
        SUM(pt.amount) as total_revenue
      FROM payment_transactions pt
      JOIN groups g ON pt.group_id = g.id
      JOIN subjects s ON g.subject_id = s.id
      WHERE pt.month = $1
      GROUP BY s.id, s.name
      ORDER BY total_revenue DESC
    `, [currentMonth]);

    // 10. OYLIK TRENDI (oxirgi 6 oy)
    const monthlyTrend = await client.query(`
      SELECT 
        month,
        COUNT(*) as payment_count,
        SUM(amount) as total_revenue
      FROM payment_transactions 
      WHERE month >= TO_CHAR(CURRENT_DATE - INTERVAL '6 months', 'YYYY-MM')
      GROUP BY month
      ORDER BY month
    `);

    // 11. ENG YAXSHI O'QITUVCHILAR (daromad bo'yicha)
    const topTeachersByRevenue = await client.query(`
      SELECT 
        u.name || ' ' || u.surname as teacher_name,
        COUNT(DISTINCT g.id) as groups_count,
        COUNT(DISTINCT pt.student_id) as students_count,
        SUM(pt.amount) as total_revenue
      FROM payment_transactions pt
      JOIN groups g ON pt.group_id = g.id
      JOIN users u ON g.teacher_id = u.id
      WHERE pt.month = $1
      GROUP BY u.id, u.name, u.surname
      ORDER BY total_revenue DESC
      LIMIT 10
    `, [currentMonth]);

    const superAdminData = {
      financial_summary: {
        monthly_revenue: totalRevenue,
        total_expenses: totalExpenses,
        teacher_salaries: totalSalaries,
        other_expenses: totalOtherExpenses,
        net_profit: netProfit,
        profit_margin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0
      },
      
      operational_summary: {
        active_students: parseInt(activeStudents.rows[0].count),
        active_groups: parseInt(activeGroups.rows[0].count),
        active_teachers: parseInt(activeTeachers.rows[0].count),
        monthly_attendance: {
          total_lessons: parseInt(monthlyAttendance.rows[0]?.total_lessons || 0),
          present: parseInt(monthlyAttendance.rows[0]?.present_count || 0),
          absent: parseInt(monthlyAttendance.rows[0]?.absent_count || 0),
          late: parseInt(monthlyAttendance.rows[0]?.late_count || 0),
          percentage: parseFloat(monthlyAttendance.rows[0]?.attendance_percentage || 0)
        }
      },

      detailed_analytics: {
        revenue_by_subject: revenueBySubject.rows.map(row => ({
          subject_name: row.subject_name,
          groups_count: parseInt(row.groups_count),
          students_count: parseInt(row.students_count),
          total_revenue: parseFloat(row.total_revenue)
        })),
        
        top_teachers: topTeachersByRevenue.rows.map(row => ({
          teacher_name: row.teacher_name,
          groups_count: parseInt(row.groups_count),
          students_count: parseInt(row.students_count),
          total_revenue: parseFloat(row.total_revenue)
        })),
        
        monthly_trend: monthlyTrend.rows.map(row => ({
          month: row.month,
          payment_count: parseInt(row.payment_count),
          total_revenue: parseFloat(row.total_revenue)
        })),

        expense_breakdown: otherExpenses.rows.map(row => ({
          expense_type: row.payment_type,
          amount: parseFloat(row.total_amount)
        }))
      },

      meta: {
        generated_at: new Date().toISOString(),
        current_month: currentMonth,
        report_period: currentMonth
      }
    };

    console.log(`✅ Super Admin dashboard muvaffaqiyatli yaratildi`);
    
    res.json({
      success: true,
      message: 'Super Admin dashboard statistikalari muvaffaqiyatli olindi',
      data: superAdminData
    });

  } catch (error) {
    console.error('❌ Super Admin dashboard xatoligi:', error);
    res.status(500).json({
      success: false,
      message: 'Super Admin dashboard statistikalarini olishda xatolik yuz berdi',
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getDashboardStats,
  getDebtorStudents,
  getSuperAdminStats
};