const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'LMS API Documentation',
      version: '3.0.0',
      description: `
# 🎉 LMS Backend API v3.0

## 🆕 Yangi xususiyatlar (v3.0)

### ✅ Monthly Snapshot Tizimi
- **Har oy uchun mustaqil ma'lumotlar**: Snapshot orqali oylik ma'lumotlarni alohida boshqarish
- **Attendance integratsiyasi**: Snapshot ↔ Attendance sinxronizatsiyasi  
- **Group_status dan xalos**: Endi faqat \`monthly_status\` ishlatiladi

### 🔄 Yangilangan To'lov Tizimi  
- **Attendance bog'langanligi**: To'lovlar \`attendance.monthly_status\` ga to'liq bog'langan
- **Har oylik mustaqillik**: Bir oyni to'xtatish boshqa oylarga ta'sir qilmaydi
- **Xavfsiz to'lovlar**: Faqat \`monthly_status = 'active'\` talabalar uchun to'lov qabuli

### 📊 Asosiy Endpoints

#### 🆕 Snapshot Management
- \`POST /api/snapshots/create\` - Snapshot yaratish
- \`GET /api/snapshots\` - Snapshot ko'rish
- \`PUT /api/snapshots/{id}\` - Status o'zgartirish (+ Attendance sinxron)

#### 💰 Payments (yangilangan)
- \`GET /api/payments/monthly\` - Oylik to'lovlar (\`monthly_status\` bo'yicha)
- \`POST /api/payments/make-payment\` - To'lov qabuli (faqat active lar)

#### 📋 Attendance 
- \`PUT /api/attendance/student/monthly-status\` - Status o'zgartirish

## 🚀 Qanday ishlatish

1. **Har oy boshida snapshot yarating**:
   \`\`\`
   POST /api/snapshots/create { "month": "2024-03" }
   \`\`\`

2. **Talaba statusini o'zgartiring**:
   \`\`\`  
   PUT /api/snapshots/156 { "monthly_status": "stopped" }
   \`\`\`

3. **To'lovlar avtomatik yangilanadi**: monthly_status bo'yicha

---
*Barcha APIlar uchun JWT token talab qilinadi*
      `,
    },
    tags: [
      { name: 'Users', description: 'Foydalanuvchilar registratsiya va login' },
      { name: 'Groups', description: 'Guruhlarni boshqarish' },
      { name: 'Students', description: 'Studentlarni boshqarish' },
      { name: 'Attendance', description: 'Davomat tizimi - oylik mustaqil monthly_status bilan' },
      { name: 'Payments', description: '✅ YANGI: To\'lovlar tizimi - attendance.monthly_status ga bog\'langan (v3.0)' },
      { name: 'Monthly Snapshots', description: '🆕 Oylik snapshot tizimi - har oy uchun mustaqil ma\'lumotlar boshqaruvi' },
      { name: 'Teacher Salary', description: 'O\'qituvchilar maoshi va avans tizimi' },
      { name: 'Subjects', description: 'Fanlar va o\'qituvchi-fan bog\'lanishlari' },
      { name: 'Rooms', description: 'Xonalarni boshqarish' },
      { name: 'Dashboard', description: 'Dashboard statistika va hisobotlar' }
    ],
    servers: [
      {
        url: 'http://localhost:5001',
        description: 'Local server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token kiriting',
        },
      },      schemas: {
        MonthlyPayment: {
          type: 'object',
          properties: {
            student_id: { type: 'integer', example: 123 },
            name: { type: 'string', example: 'Ahmad' },
            surname: { type: 'string', example: 'Karimov' },
            phone: { type: 'string', example: '+998901234567' },
            group_name: { type: 'string', example: 'IELTS Advanced' },
            subject_name: { type: 'string', example: 'English' },
            teacher_name: { type: 'string', example: 'John Smith' },
            monthly_status: { 
              type: 'string', 
              enum: ['active', 'stopped', 'finished'],
              description: 'Talabaning oylik holati'
            },
            payment_status: { 
              type: 'string', 
              enum: ['paid', 'partial', 'unpaid', 'inactive'],
              description: 'To\'lov holati'
            },
            required_amount: { type: 'number', example: 500000 },
            paid_amount: { type: 'number', example: 250000 },
            debt_amount: { type: 'number', example: 250000 }
          }
        },
        MonthlySnapshot: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            month: { type: 'string', example: '2024-03' },
            student_id: { type: 'integer', example: 123 },
            group_id: { type: 'integer', example: 45 },
            student_name: { type: 'string', example: 'Ahmad' },
            student_surname: { type: 'string', example: 'Karimov' },
            group_name: { type: 'string', example: 'IELTS Advanced' },
            monthly_status: { 
              type: 'string', 
              enum: ['active', 'stopped', 'finished'],
              description: 'Oylik holat - attendance bilan sinxron'
            },
            payment_status: { 
              type: 'string', 
              enum: ['paid', 'partial', 'unpaid', 'inactive'] 
            },
            required_amount: { type: 'number' },
            paid_amount: { type: 'number' },
            debt_amount: { type: 'number' },
            attendance_percentage: { type: 'number', example: 85.5 }
          }
        },
        AttendanceStatus: {
          type: 'object',
          properties: {
            student_id: { type: 'integer' },
            group_id: { type: 'integer' },
            month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
            monthly_status: { 
              type: 'string', 
              enum: ['active', 'stopped', 'finished'],
              description: 'YANGI: Har oylik mustaqil status (eski group_status emas!)'
            }
          }
        }
      }    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // API yo'llari qayerda yozilganini ko'rsatamiz
  apis: ['./routes/*.js', './server.js'], 
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };