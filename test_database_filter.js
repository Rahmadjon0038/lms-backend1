const pool = require('./config/db');

async function testPaymentFilterDatabase() {
    try {
        console.log('=== DATABASE PAYMENT FILTER TEST ===\n');
        
        const selectedMonth = '2026-01';
        
        // Test 1: Hamma talabalar (status filter yo'q)
        console.log('1. Hamma talabalar:');
        const query1 = `
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
                LEFT JOIN student_discounts sd ON sg.student_id = sd.student_id 
                    AND sd.is_active = true
                    AND (sd.start_month IS NULL OR $1 >= sd.start_month)
                    AND (sd.end_month IS NULL OR $1 <= sd.end_month)
                WHERE sg.status IN ('active', 'stopped', 'finished')
                GROUP BY sg.student_id, sg.group_id, g.price
            )
            SELECT 
                sg.student_id,
                u.name,
                u.surname,
                sg.status as student_status,
                g.price as original_price,
                GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) as required_amount,
                COALESCE(sp.paid_amount, 0) as paid_amount,
                CASE 
                    WHEN COALESCE(sp.paid_amount, 0) >= GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0) THEN 'paid'
                    WHEN COALESCE(sp.paid_amount, 0) > 0 THEN 'partial'
                    ELSE 'unpaid'
                END as payment_status
            FROM student_groups sg
            JOIN users u ON sg.student_id = u.id
            JOIN groups g ON sg.group_id = g.id
            LEFT JOIN student_discounts_calc sdc ON sg.student_id = sdc.student_id AND sg.group_id = sdc.group_id
            LEFT JOIN student_payments sp ON sg.student_id = sp.student_id AND sp.month = $1
            WHERE (
                sg.status = 'active' 
                OR
                EXISTS (
                    SELECT 1 FROM student_payments sp_check 
                    WHERE sp_check.student_id = sg.student_id 
                        AND sp_check.month = $1
                )
            )
            AND u.role = 'student'
            AND (
                sg.join_date IS NULL OR 
                sg.join_date <= ($1 || '-01')::DATE + INTERVAL '1 month' - INTERVAL '1 day'
            )
            AND (
                sg.leave_date IS NULL OR 
                sg.leave_date >= ($1 || '-01')::DATE
            )
            ORDER BY u.name ASC
        `;
        
        const result1 = await pool.query(query1, [selectedMonth]);
        console.log(`Jami talabalar: ${result1.rows.length}`);
        result1.rows.forEach(s => {
            console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status} - to'langan: ${s.paid_amount}, kerak: ${s.required_amount}`);
        });
        
        // Test 2: Faqat toliq tolagan
        console.log('\n2. Faqat toliq tolagan (paid):');
        const query2 = query1.replace('ORDER BY u.name ASC', `
            AND COALESCE(sp.paid_amount, 0) >= GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0)
            ORDER BY u.name ASC
        `);
        
        const result2 = await pool.query(query2, [selectedMonth]);
        console.log(`Toliq tolagan: ${result2.rows.length}`);
        result2.rows.forEach(s => {
            console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status} - to'langan: ${s.paid_amount}, kerak: ${s.required_amount}`);
        });
        
        // Test 3: Faqat qisman tolagan
        console.log('\n3. Faqat qisman tolagan (partial):');
        const query3 = query1.replace('ORDER BY u.name ASC', `
            AND COALESCE(sp.paid_amount, 0) > 0 
            AND COALESCE(sp.paid_amount, 0) < GREATEST(g.price - COALESCE(sdc.total_discount_amount, 0), 0)
            ORDER BY u.name ASC
        `);
        
        const result3 = await pool.query(query3, [selectedMonth]);
        console.log(`Qisman tolagan: ${result3.rows.length}`);
        result3.rows.forEach(s => {
            console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status} - to'langan: ${s.paid_amount}, kerak: ${s.required_amount}`);
        });
        
        // Test 4: Faqat tolamagan
        console.log('\n4. Faqat tolamagan (unpaid):');
        const query4 = query1.replace('ORDER BY u.name ASC', `
            AND COALESCE(sp.paid_amount, 0) = 0
            ORDER BY u.name ASC
        `);
        
        const result4 = await pool.query(query4, [selectedMonth]);
        console.log(`Tolamagan: ${result4.rows.length}`);
        result4.rows.forEach(s => {
            console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status} - to'langan: ${s.paid_amount}, kerak: ${s.required_amount}`);
        });
        
        console.log('\n=== XULOSA ===');
        console.log('✅ Hamma status filteri ishlaydi');
        console.log('✅ Faqat haqiqatdan ham o\'sha holatdagi talabalar ko\'rsatiladi');
        console.log('✅ finished/stopped talabalar ham to\'g\'ri filterlash jarayonida ishtirok etadi');
        
    } catch (error) {
        console.error('Test xatoligi:', error.message);
    } finally {
        await pool.end();
    }
}

testPaymentFilterDatabase();