const http = require('http');
const querystring = require('querystring');

async function testAttendanceAPI() {
  try {
    console.log('🧪 ATTENDANCE API TEST');
    console.log('=====================');
    
    // 1. Login
    console.log('\n1️⃣ Login qilish...');
    const token = await login();
    console.log('✅ Token olindi!');
    
    // 2. Monthly attendance olish (before)
    console.log('\n2️⃣ Monthly attendance (BEFORE):');
    const beforeData = await getMonthlyAttendance(token, 41);
    beforeData.students.forEach(student => {
      console.log(`   ${student.name} ${student.surname}: ${student.attendance['2026-01-21']}`);
    });
    
    // 3. Attendance saqlash
    console.log('\n3️⃣ Attendance saqlash...');
    const saveResult = await saveAttendance(token, 7, [
      {student_id: 36, status: 'keldi'},
      {student_id: 34, status: 'keldi'}, 
      {student_id: 23, status: 'keldi'}
    ]);
    console.log('Save result:', saveResult);
    
    // 4. Monthly attendance olish (after)  
    console.log('\n4️⃣ Monthly attendance (AFTER):');
    const afterData = await getMonthlyAttendance(token, 41);
    afterData.students.forEach(student => {
      console.log(`   ${student.name} ${student.surname}: ${student.attendance['2026-01-21']}`);
    });
    
    console.log('\n✅ TEST TUGADI!');
    
  } catch (error) {
    console.error('❌ Test xatolik:', error.message);
  }
}

function login() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      username: 'Astrocoder',
      password: '123'
    });

    const options = {
      hostname: 'localhost',
      port: 5001,
      path: '/api/users/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.accessToken);
        } catch (err) {
          reject(new Error('Login parse error'));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getMonthlyAttendance(token, groupId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5001,
      path: `/api/attendance/groups/${groupId}/monthly?month=2026-01`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.data);
        } catch (err) {
          reject(new Error('Monthly attendance parse error'));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function saveAttendance(token, lessonId, attendanceData) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      lesson_id: lessonId,
      attendance_data: attendanceData
    });

    const options = {
      hostname: 'localhost',
      port: 5001,
      path: '/api/attendance/save',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (err) {
          reject(new Error('Save attendance parse error'));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

testAttendanceAPI();