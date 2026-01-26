const axios = require('axios');

// ============================================================================
// STUDENT API LARINI TEST QILISH - HTTP CLIENT
// ============================================================================

const baseURL = 'http://localhost:5001/api';

const testStudentAPIs = async () => {
  try {
    console.log('🧪 Student API HTTP testini boshlayapman...');

    // 1. Login qilish va token olish
    console.log('\n1️⃣ Student login qilish...');
    
    const loginResponse = await axios.post(`${baseURL}/users/login`, {
      phone: '+998901111111',
      password: 'password123'
    });

    if (!loginResponse.data.success) {
      throw new Error('Login muvaffaqiyatsiz: ' + loginResponse.data.message);
    }

    const token = loginResponse.data.token;
    console.log('✅ Login muvaffaqiyatli, token olindi');
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. Studentning guruhlarini olish
    console.log('\n2️⃣ /api/students/my-groups API ni test qilish...');
    
    const myGroupsResponse = await axios.get(`${baseURL}/students/my-groups`, { headers });
    
    if (myGroupsResponse.data.success) {
      console.log('✅ My Groups API muvaffaqiyatli ishladi');
      console.log(`📚 Jami guruhlar: ${myGroupsResponse.data.data.total_groups}`);
      
      if (myGroupsResponse.data.data.total_groups > 0) {
        const firstGroup = myGroupsResponse.data.data.groups[0];
        console.log(`📖 Birinchi guruh: ${firstGroup.group_info.name}`);
        console.log(`💰 Narx: ${firstGroup.group_info.price} so'm`);
        console.log(`💳 To'lov holati: ${firstGroup.payment_info.status}`);
        
        // 3. Guruh ma'lumotlarini batafsil olish
        console.log('\n3️⃣ /api/students/my-group-info/:id API ni test qilish...');
        
        const groupId = firstGroup.group_info.id;
        const groupInfoResponse = await axios.get(`${baseURL}/students/my-group-info/${groupId}`, { headers });
        
        if (groupInfoResponse.data.success) {
          console.log('✅ My Group Info API muvaffaqiyatli ishladi');
          console.log(`👥 Guruh a'zolari: ${groupInfoResponse.data.data.group_statistics.total_members}`);
          console.log(`🎯 Aktiv a'zolar: ${groupInfoResponse.data.data.group_statistics.active_members}`);
          console.log(`👨‍🏫 O'qituvchi: ${groupInfoResponse.data.data.teacher.name}`);
          
          // Guruhdoshlar
          const groupmates = groupInfoResponse.data.data.groupmates;
          console.log('\n👨‍👩‍👧‍👦 GURUHDOSHLAR:');
          groupmates.forEach((mate, index) => {
            console.log(`${index + 1}. ${mate.name} ${mate.surname} - ${mate.status} (To'lov: ${mate.payment_status})`);
          });
          
        } else {
          console.log('❌ Group Info API xatosi:', groupInfoResponse.data.message);
        }
        
      } else {
        console.log('ℹ️  Student hech qanday guruhga a\'zo emas');
      }
      
    } else {
      console.log('❌ My Groups API xatosi:', myGroupsResponse.data.message);
    }

    console.log('\n🎉 API testlari yakunlandi!');

  } catch (error) {
    console.error('❌ Test xatoligi:', error.message);
    
    if (error.response) {
      console.error('📄 Response:', error.response.data);
      console.error('🔢 Status:', error.response.status);
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Server ishlamayapti! `npm run dev` bilan serverni ishga tushiring.');
    }
  }
};

// Axios dependency tekshiruvi
try {
  require('axios');
} catch (err) {
  console.error('❌ axios kutubxonasi o\'rnatilmagan!');
  console.log('📦 O\'rnatish uchun: npm install axios');
  process.exit(1);
}

// Script ni ishga tushirish
if (require.main === module) {
  testStudentAPIs();
}

module.exports = testStudentAPIs;