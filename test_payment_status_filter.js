const { pool } = require('./config/db');

async function testPaymentStatusFilter() {
    try {
        console.log('=== PAYMENT STATUS FILTER TEST ===\n');
        
        // 1. Test ma'lumotlar yaratish
        console.log('1. Test malumotlar yaratish...');
        
        // Test student yaratish
        await pool.query(`
            INSERT INTO users (name, surname, phone, role, password_hash)
            VALUES ('Test', 'Student', '+998901234567', 'student', 'test_hash')
            ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name;
        `);
        
        const student = await pool.query(
            "SELECT id FROM users WHERE phone = '+998901234567'"
        );
        const studentId = student.rows[0].id;
        
        // Test group yaratish
        await pool.query(`
            INSERT INTO subjects (name) 
            VALUES ('Test Subject') 
            ON CONFLICT (name) DO NOTHING;
        `);
        
        const subject = await pool.query("SELECT id FROM subjects WHERE name = 'Test Subject'");
        const subjectId = subject.rows[0].id;
        
        await pool.query(`
            INSERT INTO users (name, surname, phone, role, password_hash)
            VALUES ('Test', 'Teacher', '+998901234568', 'teacher', 'test_hash')
            ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name;
        `);
        
        const teacher = await pool.query(
            "SELECT id FROM users WHERE phone = '+998901234568'"
        );
        const teacherId = teacher.rows[0].id;
        
        await pool.query(`
            INSERT INTO groups (name, subject_id, teacher_id, price, start_date)
            VALUES ('Test Group', $1, $2, 500000, '2026-01-01')
            ON CONFLICT (name) DO NOTHING;
        `, [subjectId, teacherId]);
        
        const group = await pool.query("SELECT id FROM groups WHERE name = 'Test Group'");
        const groupId = group.rows[0].id;
        
        // 2. Turli xil statuslardagi talabalar qo'shish
        console.log('2. Turli statuslardagi talabalar qo\'shish...');
        
        // Active student (tolamagan)
        await pool.query(`
            INSERT INTO student_groups (student_id, group_id, status, join_date)
            VALUES ($1, $2, 'active', '2026-01-01')
            ON CONFLICT (student_id, group_id) DO UPDATE SET status = 'active';
        `, [studentId, groupId]);
        
        // Finished student yaratish
        await pool.query(`
            INSERT INTO users (name, surname, phone, role, password_hash)
            VALUES ('Finished', 'Student', '+998901234569', 'student', 'test_hash')
            ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name;
        `);
        
        const finishedStudent = await pool.query(
            "SELECT id FROM users WHERE phone = '+998901234569'"
        );
        const finishedStudentId = finishedStudent.rows[0].id;
        
        await pool.query(`
            INSERT INTO student_groups (student_id, group_id, status, join_date, leave_date)
            VALUES ($1, $2, 'finished', '2026-01-01', '2026-01-20')
            ON CONFLICT (student_id, group_id) DO UPDATE SET 
            status = 'finished', leave_date = '2026-01-20';
        `, [finishedStudentId, groupId]);
        
        // Stopped student yaratish  
        await pool.query(`
            INSERT INTO users (name, surname, phone, role, password_hash)
            VALUES ('Stopped', 'Student', '+998901234570', 'student', 'test_hash')
            ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name;
        `);
        
        const stoppedStudent = await pool.query(
            "SELECT id FROM users WHERE phone = '+998901234570'"
        );
        const stoppedStudentId = stoppedStudent.rows[0].id;
        
        await pool.query(`
            INSERT INTO student_groups (student_id, group_id, status, join_date, leave_date)
            VALUES ($1, $2, 'stopped', '2026-01-01', '2026-01-15')
            ON CONFLICT (student_id, group_id) DO UPDATE SET 
            status = 'stopped', leave_date = '2026-01-15';
        `, [stoppedStudentId, groupId]);
        
        // 3. To'lovlar qilish
        console.log('3. To\'lovlar qilish...');
        
        // Active student - qisman to'lov
        await pool.query(`
            INSERT INTO student_payments (student_id, month, required_amount, paid_amount)
            VALUES ($1, '2026-01', 500000, 250000)
            ON CONFLICT (student_id, month) DO UPDATE SET 
            paid_amount = EXCLUDED.paid_amount;
        `, [studentId]);
        
        // Finished student - to'lamagan (payment record yo'q)
        // Stopped student - to'lamagan (payment record yo'q)
        
        // 4. API test qilish
        console.log('4. API test qilish...\n');
        
        // Test 1: Hamma talabalar (status filter yo'q)
        console.log('TEST 1: Hamma talabalar (status filter yo\'q)');
        const mockReq = {
            query: { month: '2026-01' },
            user: { role: 'admin', id: 1 }
        };
        
        // Mock response object
        let responseData = null;
        const mockRes = {
            json: (data) => { responseData = data; },
            status: (code) => ({ json: (data) => { responseData = data; } })
        };
        
        // Import controller function
        const { getMonthlyPayments } = require('./controllers/paymentController');
        await getMonthlyPayments(mockReq, mockRes);
        
        console.log('Natija (hamma):');
        if (responseData && responseData.success) {
            responseData.data.students.forEach(s => {
                console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status}`);
            });
        } else {
            console.log('Xatolik:', responseData?.message);
        }
        
        // Test 2: Faqat tolamagan talabalar
        console.log('\nTEST 2: Faqat tolamagan talabalar');
        mockReq.query.status = 'unpaid';
        responseData = null;
        
        await getMonthlyPayments(mockReq, mockRes);
        
        console.log('Natija (tolamagan):');
        if (responseData && responseData.success) {
            responseData.data.students.forEach(s => {
                console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status}`);
            });
        } else {
            console.log('Xatolik:', responseData?.message);
        }
        
        // Test 3: Faqat qisman tolagan talabalar  
        console.log('\nTEST 3: Faqat qisman tolagan talabalar');
        mockReq.query.status = 'partial';
        responseData = null;
        
        await getMonthlyPayments(mockReq, mockRes);
        
        console.log('Natija (qisman):');
        if (responseData && responseData.success) {
            responseData.data.students.forEach(s => {
                console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status}`);
            });
        } else {
            console.log('Xatolik:', responseData?.message);
        }
        
    } catch (error) {
        console.error('Test xatoligi:', error);
    } finally {
        await pool.end();
    }
}

testPaymentStatusFilter();