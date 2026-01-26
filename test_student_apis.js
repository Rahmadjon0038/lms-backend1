const pool = require('./config/db');

// ============================================================================
// STUDENT API LARINI TEST QILISH
// ============================================================================

const testStudentAPIs = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Student API testini boshlayapman...');

    // 1. Test student yaratish yoki topish
    console.log('\n1️⃣ Test student yaratish...');
    
    let studentResult = await client.query(`
      SELECT id, name, surname, phone FROM users 
      WHERE phone = '+998901111111' AND role = 'student'
    `);
    
    let student;
    if (studentResult.rows.length > 0) {
      student = studentResult.rows[0];
      console.log(`✅ Mavjud student topildi: ${student.name} ${student.surname} (ID: ${student.id})`);
    } else {
      const newStudentResult = await client.query(`
        INSERT INTO users (name, surname, username, phone, role, password)
        VALUES ('API Test', 'Student', 'apitest', '+998901111111', 'student', 'password123')
        RETURNING id, name, surname, phone
      `);
      student = newStudentResult.rows[0];
      console.log(`✅ Yangi student yaratildi: ${student.name} ${student.surname} (ID: ${student.id})`);
    }

    // 2. Student uchun test guruh yaratish
    console.log('\n2️⃣ Test guruh yaratish...');
    
    let groupResult = await client.query(`
      SELECT id, name, price FROM groups WHERE name = 'Test Student Guruh'
    `);
    
    let group;
    if (groupResult.rows.length > 0) {
      group = groupResult.rows[0];
    } else {
      groupResult = await client.query(`
        INSERT INTO groups (name, price, teacher_id, subject_id, status, class_status, unique_code)
        SELECT 'Test Student Guruh', 250000, t.id, s.id, 'active', 'started', 'TESTSTU'
        FROM (SELECT id FROM users WHERE role = 'teacher' LIMIT 1) t,
             (SELECT id FROM subjects LIMIT 1) s
        RETURNING id, name, price
      `);
      group = groupResult.rows[0];
    }
    console.log(`✅ Test guruh: ${group.name} (ID: ${group.id})`);

    // 3. Studentni guruhga qo'shish
    console.log('\n3️⃣ Studentni guruhga qo\'shish...');
    
    const existingMembership = await client.query(`
      SELECT * FROM student_groups 
      WHERE student_id = $1 AND group_id = $2
    `, [student.id, group.id]);
    
    if (existingMembership.rows.length === 0) {
      await client.query(`
        INSERT INTO student_groups (student_id, group_id, status, join_date)
        VALUES ($1, $2, 'active', CURRENT_DATE)
      `, [student.id, group.id]);
      console.log('✅ Student guruhga qo\'shildi');
    } else {
      await client.query(`
        UPDATE student_groups 
        SET status = 'active', join_date = CURRENT_DATE
        WHERE student_id = $1 AND group_id = $2
      `, [student.id, group.id]);
      console.log('✅ Student guruh statusi yangilandi');
    }

    // 4. Test to'lov yaratish
    console.log('\n4️⃣ Test to\'lov yaratish...');
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    const adminId = 1; // Admin ID
    
    const existingPayment = await client.query(`
      SELECT * FROM student_payments 
      WHERE student_id = $1 AND month = $2 AND group_id = $3
    `, [student.id, currentMonth, group.id]);
    
    if (existingPayment.rows.length === 0) {
      await client.query(`
        INSERT INTO student_payments 
        (student_id, month, group_id, required_amount, paid_amount, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [student.id, currentMonth, group.id, group.price, group.price / 2, adminId]);
      
      await client.query(`
        INSERT INTO payment_transactions 
        (student_id, month, group_id, amount, payment_method, description, created_by)
        VALUES ($1, $2, $3, $4, 'cash', 'Test tolov', $5)
      `, [student.id, currentMonth, group.id, group.price / 2, adminId]);
      
      console.log(`✅ Test to'lov yaratildi: ${group.price / 2} so'm`);
    } else {
      console.log('✅ To\'lov allaqachon mavjud');
    }

    // 5. API Test ma'lumotlarini ko'rsatish
    console.log('\n🎯 TEST MA\'LUMOTLARI:');
    console.log(`👤 Student: ${student.name} ${student.surname} (ID: ${student.id})`);
    console.log(`📚 Guruh: ${group.name} (ID: ${group.id})`);
    console.log(`💰 Guruh narxi: ${group.price} so'm`);
    console.log(`📅 Joriy oy: ${currentMonth}`);
    
    console.log('\n📡 TEST QILINADIGAN API LAR:');
    console.log('GET /api/students/my-groups');
    console.log(`GET /api/students/my-group-info/${group.id}`);
    
    console.log('\n🔑 TOKEN OLISH UCHUN:');
    console.log(`POST /api/users/login`);
    console.log(`Body: { "phone": "${student.phone}", "password": "password123" }`);

    console.log('\n✅ Test ma\'lumotlari tayyor!');

  } catch (error) {
    console.error('❌ Test xatolik bilan tugadi:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Script ni ishga tushirish
if (require.main === module) {
  testStudentAPIs()
    .then(() => {
      console.log('🎉 Test yakunlandi');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test muvaffaqiyatsiz tugadi:', error);
      process.exit(1);
    });
}

module.exports = testStudentAPIs;