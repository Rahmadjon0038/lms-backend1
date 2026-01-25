const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE_URL = 'http://localhost:5001/api';

// Test user credentials
const testAdmin = {
  phone: '+998901234567',
  password: 'admin123'
};

let authToken = '';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ data: jsonData, status: res.statusCode });
        } catch (e) {
          resolve({ data: data, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    
    if (options.data) {
      req.write(JSON.stringify(options.data));
    }
    
    req.end();
  });
}

async function login() {
  try {
    const response = await makeRequest(`${BASE_URL}/users/login`, {
      method: 'POST',
      data: testAdmin
    });
    
    if (response.status === 200 && response.data.token) {
      authToken = response.data.token;
      console.log('✅ Admin login muvaffaqiyatli');
      return true;
    } else {
      console.log('❌ Login failed:', response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Login error:', error.message);
    return false;
  }
}

async function testMonthlyStudents(month) {
  try {
    const response = await makeRequest(
      `${BASE_URL}/payments/students?month=${month}`, 
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    console.log(`\n📊 ${month} oy uchun studentlar:`);
    const students = response.data;
    
    // Jasur va Mirjalol'ni qidiramiz
    const jasur = students.find(s => s.name.includes('Jasur'));
    const mirjalol = students.find(s => s.name.includes('Mirjalol'));
    
    console.log(`📍 Jasur: ${jasur ? '✅ Topildi' : '❌ Yo\'q'}`);
    if (jasur) {
      console.log(`   Status: ${jasur.status}, Group: ${jasur.group_name}`);
    }
    
    console.log(`📍 Mirjalol: ${mirjalol ? '✅ Topildi' : '❌ Yo\'q'}`);
    if (mirjalol) {
      console.log(`   Status: ${mirjalol.status}, Group: ${mirjalol.group_name}`);
    }
    
    console.log(`📊 Jami talabalar: ${students.length}`);
    
  } catch (error) {
    console.log(`❌ ${month} oy uchun error:`, error.response?.data || error.message);
  }
}

(async () => {
  console.log('🚀 Monthly students API test boshlanmoqda...');
  
  if (await login()) {
    await testMonthlyStudents('2026-01');
    await testMonthlyStudents('2026-02');
  }
  
  process.exit(0);
})();