const { pool } = require('./config/db');

async function testPaymentStatusFixed() {
    try {
        console.log('=== PAYMENT STATUS FIXED TEST ===\n');
        
        console.log('1. API orqali test qilish...');
        
        // Test requests using fetch
        const baseURL = 'http://localhost:5001';
        
        // Login
        console.log('2. Admin token olish...');
        const loginResponse = await fetch(`${baseURL}/api/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: '+998901234567',
                password: '123456'
            })
        });
        
        const loginData = await loginResponse.json();
        
        if (!loginData.success) {
            console.log('Login xatoligi:', loginData.message);
            return;
        }
        
        const token = loginData.token;
        const headers = { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        
        // Test 1: Hamma talabalar (filter yo'q)
        console.log('\n3. Hamma talabalar (filter yo\'q):');
        const allResponse = await fetch(`${baseURL}/api/payments/monthly-payments?month=2026-01`, { headers });
        const allData = await allResponse.json();
        
        if (allData.success) {
            console.log(`Jami talabalar: ${allData.data.students.length}`);
            allData.data.students.forEach(s => {
                console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status} - to'langan: ${s.paid_amount}, kerak: ${s.required_amount}`);
            });
        } else {
            console.log('Xatolik:', allData.message);
        }
        
        // Test 2: Faqat toliq tolagan 
        console.log('\n4. Faqat toliq tolagan (paid filter):');
        const paidResponse = await fetch(`${baseURL}/api/payments/monthly-payments?month=2026-01&status=paid`, { headers });
        const paidData = await paidResponse.json();
        
        if (paidData.success) {
            console.log(`Toliq tolagan talabalar: ${paidData.data.students.length}`);
            paidData.data.students.forEach(s => {
                console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status} - to'langan: ${s.paid_amount}, kerak: ${s.required_amount}`);
            });
        } else {
            console.log('Xatolik:', paidData.message);
        }
        
        // Test 3: Faqat qisman tolagan
        console.log('\n5. Faqat qisman tolagan (partial filter):');
        const partialResponse = await fetch(`${baseURL}/api/payments/monthly-payments?month=2026-01&status=partial`, { headers });
        const partialData = await partialResponse.json();
        
        if (partialData.success) {
            console.log(`Qisman tolagan talabalar: ${partialData.data.students.length}`);
            partialData.data.students.forEach(s => {
                console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status} - to'langan: ${s.paid_amount}, kerak: ${s.required_amount}`);
            });
        } else {
            console.log('Xatolik:', partialData.message);
        }
        
        // Test 4: Faqat tolamagan
        console.log('\n6. Faqat tolamagan (unpaid filter):');
        const unpaidResponse = await fetch(`${baseURL}/api/payments/monthly-payments?month=2026-01&status=unpaid`, { headers });
        const unpaidData = await unpaidResponse.json();
        
        if (unpaidData.success) {
            console.log(`Tolamagan talabalar: ${unpaidData.data.students.length}`);
            unpaidData.data.students.forEach(s => {
                console.log(`- ${s.name} ${s.surname} (${s.student_status}): ${s.payment_status} - to'langan: ${s.paid_amount}, kerak: ${s.required_amount}`);
            });
        } else {
            console.log('Xatolik:', unpaidData.message);
        }
        
    } catch (error) {
        console.error('Test xatoligi:', error.message);
    }
}

// Serverning ishlab turganini tekshiring: npm run dev
testPaymentStatusFixed();