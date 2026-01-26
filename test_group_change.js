const pool = require('./config/db');

// ============================================================================
// GURUH O'ZGARISHI TEST SKRIPTI
// ============================================================================

const testGroupChange = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Guruh o\'zgarishi testini boshlayapman...\n');
    
    // 1. Test talaba yaratish
    console.log('1️⃣ Test talaba yaratish...');
    const studentResult = await client.query(`
      SELECT id, name, surname FROM users 
      WHERE phone = '+998901234567'
    `);
    
    let student;
    if (studentResult.rows.length > 0) {
      student = studentResult.rows[0];
      console.log(`✅ Mavjud talaba topildi: ${student.name} ${student.surname} (ID: ${student.id})`);
    } else {
      const newStudentResult = await client.query(`
        INSERT INTO users (name, surname, phone, role, password)
        VALUES ('Test', 'Student', '+998901234567', 'student', 'password')
        RETURNING id, name, surname
      `);
      student = newStudentResult.rows[0];
      console.log(`✅ Yangi talaba yaratildi: ${student.name} ${student.surname} (ID: ${student.id})`);
    }
    
    // 2. Ikkita guruh yaratish
    console.log('\n2️⃣ Ikkita guruh yaratish...');
    
    // Birinchi guruh
    let group1Result = await client.query(`
      SELECT id, name, price FROM groups WHERE name = 'Test Guruh 1'
    `);
    
    let group1;
    if (group1Result.rows.length > 0) {
      group1 = group1Result.rows[0];
    } else {
      group1Result = await client.query(`
        INSERT INTO groups (name, price, teacher_id, subject_id, status, class_status, unique_code)
        SELECT 'Test Guruh 1', 300000, t.id, s.id, 'active', 'started', 'TEST1'
        FROM (SELECT id FROM users WHERE role = 'teacher' LIMIT 1) t,
             (SELECT id FROM subjects LIMIT 1) s
        RETURNING id, name, price
      `);
      group1 = group1Result.rows[0];
    }
    
    // Ikkinchi guruh
    let group2Result = await client.query(`
      SELECT id, name, price FROM groups WHERE name = 'Test Guruh 2'
    `);
    
    let group2;
    if (group2Result.rows.length > 0) {
      group2 = group2Result.rows[0];
    } else {
      group2Result = await client.query(`
        INSERT INTO groups (name, price, teacher_id, subject_id, status, class_status, unique_code)
        SELECT 'Test Guruh 2', 350000, t.id, s.id, 'active', 'started', 'TEST2'
        FROM (SELECT id FROM users WHERE role = 'teacher' LIMIT 1) t,
             (SELECT id FROM subjects LIMIT 1) s
        RETURNING id, name, price
      `);
      group2 = group2Result.rows[0];
    }
    console.log(`✅ Guruh 1: ${group1.name} - ${group1.price} so'm (ID: ${group1.id})`);
    console.log(`✅ Guruh 2: ${group2.name} - ${group2.price} so'm (ID: ${group2.id})`);
    
    // 3. Talabani birinchi guruhga qo'shish
    console.log('\n3️⃣ Talabani birinchi guruhga qo\'shish...');
    
    // Avval mavjudligini tekshirish
    const existingRelation = await client.query(`
      SELECT * FROM student_groups 
      WHERE student_id = $1 AND group_id = $2
    `, [student.id, group1.id]);
    
    if (existingRelation.rows.length > 0) {
      await client.query(`
        UPDATE student_groups 
        SET status = 'active', join_date = CURRENT_DATE - INTERVAL '2 months'
        WHERE student_id = $1 AND group_id = $2
      `, [student.id, group1.id]);
    } else {
      await client.query(`
        INSERT INTO student_groups (student_id, group_id, status, join_date)
        VALUES ($1, $2, 'active', CURRENT_DATE - INTERVAL '2 months')
      `, [student.id, group1.id]);
    }
    console.log(`✅ ${student.name} birinchi guruhga qo'shildi`);
    
    // 4. Admin yaratish
    const adminResult = await client.query(`
      SELECT id FROM users WHERE role = 'admin' LIMIT 1
    `);
    const adminId = adminResult.rows[0].id;
    
    // 5. Birinchi oyda to'lov qilish (2024-11)
    console.log('\n4️⃣ Birinchi oyda to\'lov qilish (2024-11)...');
    
    // Avval mavjud to'lovni tekshirish
    const existingPayment = await client.query(`
      SELECT * FROM student_payments 
      WHERE student_id = $1 AND month = '2024-11' AND group_id = $2
    `, [student.id, group1.id]);
    
    if (existingPayment.rows.length > 0) {
      await client.query(`
        UPDATE student_payments 
        SET paid_amount = $1, updated_at = NOW()
        WHERE student_id = $2 AND month = '2024-11' AND group_id = $3
      `, [group1.price, student.id, group1.id]);
    } else {
      await client.query(`
        INSERT INTO student_payments 
        (student_id, month, group_id, required_amount, paid_amount, created_by)
        VALUES ($1, '2024-11', $2, $3, $4, $5)
      `, [student.id, group1.id, group1.price, group1.price, adminId]);
    }
    
    // Tranzaksiya qo'shish (dublikat bo'lmasligi uchun tekshirish)
    const existingTransaction = await client.query(`
      SELECT * FROM payment_transactions 
      WHERE student_id = $1 AND month = '2024-11' AND group_id = $2
    `, [student.id, group1.id]);
    
    if (existingTransaction.rows.length === 0) {
      await client.query(`
        INSERT INTO payment_transactions 
        (student_id, month, group_id, amount, payment_method, description, created_by)
        VALUES ($1, '2024-11', $2, $3, 'cash', 'Birinchi guruh uchun tolov', $4)
      `, [student.id, group1.id, group1.price, adminId]);
    }
    
    console.log(`✅ Birinchi guruh uchun to'lov qilindi: ${group1.price} so'm`);
    
    // 6. Talabani ikkinchi guruhga ko'chirish (birinchi guruhni "finished" qilish)
    console.log('\n5️⃣ Talabani ikkinchi guruhga ko\'chirish...');
    await client.query(`
      UPDATE student_groups 
      SET status = 'finished', leave_date = CURRENT_DATE
      WHERE student_id = $1 AND group_id = $2
    `, [student.id, group1.id]);
    
    // Ikkinchi guruhga qo'shish
    const existingRelation2 = await client.query(`
      SELECT * FROM student_groups 
      WHERE student_id = $1 AND group_id = $2
    `, [student.id, group2.id]);
    
    if (existingRelation2.rows.length > 0) {
      await client.query(`
        UPDATE student_groups 
        SET status = 'active', join_date = CURRENT_DATE
        WHERE student_id = $1 AND group_id = $2
      `, [student.id, group2.id]);
    } else {
      await client.query(`
        INSERT INTO student_groups (student_id, group_id, status, join_date)
        VALUES ($1, $2, 'active', CURRENT_DATE)
      `, [student.id, group2.id]);
    }
    
    console.log(`✅ ${student.name} ikkinchi guruhga ko'chirildi`);
    
    // 7. Ikkinchi oyda to'lov qilish (2024-12)
    console.log('\n6️⃣ Ikkinchi oyda to\'lov qilish (2024-12)...');
    
    // Avval mavjud to'lovni tekshirish
    const existingPayment2 = await client.query(`
      SELECT * FROM student_payments 
      WHERE student_id = $1 AND month = '2024-12' AND group_id = $2
    `, [student.id, group2.id]);
    
    if (existingPayment2.rows.length > 0) {
      await client.query(`
        UPDATE student_payments 
        SET paid_amount = $1, updated_at = NOW()
        WHERE student_id = $2 AND month = '2024-12' AND group_id = $3
      `, [group2.price, student.id, group2.id]);
    } else {
      await client.query(`
        INSERT INTO student_payments 
        (student_id, month, group_id, required_amount, paid_amount, created_by)
        VALUES ($1, '2024-12', $2, $3, $4, $5)
      `, [student.id, group2.id, group2.price, group2.price, adminId]);
    }
    
    // Tranzaksiya qo'shish
    const existingTransaction2 = await client.query(`
      SELECT * FROM payment_transactions 
      WHERE student_id = $1 AND month = '2024-12' AND group_id = $2
    `, [student.id, group2.id]);
    
    if (existingTransaction2.rows.length === 0) {
      await client.query(`
        INSERT INTO payment_transactions 
        (student_id, month, group_id, amount, payment_method, description, created_by)
        VALUES ($1, '2024-12', $2, $3, 'card', 'Ikkinchi guruh uchun tolov', $4)
      `, [student.id, group2.id, group2.price, adminId]);
    }
    
    console.log(`✅ Ikkinchi guruh uchun to'lov qilindi: ${group2.price} so'm`);
    
    // 8. Ma'lumotlarni tekshirish
    console.log('\n🔍 TEST NATIJALARI:\n');
    
    // To'lov tarixi
    const paymentHistory = await client.query(`
      SELECT 
        sp.month,
        sp.student_id,
        g.name as group_name,
        sp.required_amount,
        sp.paid_amount,
        pt.payment_method,
        pt.description
      FROM student_payments sp
      JOIN groups g ON sp.group_id = g.id
      LEFT JOIN payment_transactions pt ON sp.student_id = pt.student_id 
        AND sp.month = pt.month AND sp.group_id = pt.group_id
      WHERE sp.student_id = $1
      ORDER BY sp.month
    `, [student.id]);
    
    console.log('📊 TO\'LOV TARIXI:');
    paymentHistory.rows.forEach(payment => {
      console.log(`  ${payment.month}: ${payment.group_name} - ${payment.paid_amount} so'm (${payment.payment_method})`);
    });
    
    // Guruh holati
    const studentGroups = await client.query(`
      SELECT 
        sg.student_id,
        g.name as group_name,
        sg.status,
        sg.join_date,
        sg.leave_date
      FROM student_groups sg
      JOIN groups g ON sg.group_id = g.id
      WHERE sg.student_id = $1
      ORDER BY sg.join_date
    `, [student.id]);
    
    console.log('\n📚 GURUH TARIXI:');
    studentGroups.rows.forEach(group => {
      console.log(`  ${group.group_name}: ${group.status} (${group.join_date} dan ${group.leave_date || 'hozirgacha'})`);
    });
    
    console.log('\n✅ Test muvaffaqiyatli yakunlandi!');
    console.log('💡 Endi har bir oy uchun guruh ma\'lumotlari saqlanadi.');
    
  } catch (error) {
    console.error('❌ Test muvaffaqiyatsiz tugadi:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

// Test ishga tushirish
if (require.main === module) {
  testGroupChange()
    .then(() => {
      console.log('\n🎉 Test yakunlandi');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Test xatolik bilan tugadi:', error);
      process.exit(1);
    });
}

module.exports = testGroupChange;