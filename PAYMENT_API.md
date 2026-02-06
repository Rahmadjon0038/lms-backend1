# PAYMENT API - YANGI TIZIM

## ASOSIY PRINSIPLAR

### Attendance Monthly Status Bilan Bog'lanish
- **To'lovlar faqat `monthly_status = 'active'` bo'lgan talabalar uchun qabul qilinadi**
- Har oylik status mustaqil: bir oyga to'xtatish boshqa oylarga ta'sir qilmaydi
- Status turlari: `active` (faol), `stopped` (to'xtatilgan), `finished` (tugatilgan)

### Snapshot Tizimi
- `group_monthly_settings` jadvalida har oy uchun guruh ma'lumotlari snapshot saqlanadi
- Bu tarixiy ma'lumotlarni buzilmasligini ta'minlaydi
- Guruh narxi yoki o'qituvchisi o'zgarsa ham, eski oylar ma'lumotlari saqlanadi

## API ENDPOINTS

### 1. GET /api/payments/monthly
Oylik to'lovlar ro'yxatini olish

**Parameters:**
- `month` (string): YYYY-MM formatida (default: joriy oy)
- `teacher_id` (int): O'qituvchi bo'yicha filter (admin uchun)
- `subject_id` (int): Fan bo'yicha filter (admin uchun)
- `group_id` (int): Guruh bo'yicha filter (admin uchun)
- `status` (string): To'lov holati (`paid`, `partial`, `unpaid`, `inactive`)

**Response:**
```json
{
  "success": true,
  "data": {
    "month": "2024-01",
    "filters": {...},
    "students": [
      {
        "student_id": 123,
        "name": "Ali",
        "surname": "Valiev",
        "group_name": "Frontend 1",
        "monthly_status": "active",
        "required_amount": "500000",
        "paid_amount": "300000",
        "debt_amount": "200000",
        "payment_status": "partial",
        "last_payment_date": "15.01.2024 14:30"
      }
    ],
    "summary": {
      "total_students": 45,
      "paid_students": 20,
      "unpaid_students": 15,
      "inactive_students": 10,
      "collection_rate": "67.3"
    }
  }
}
```

### 2. POST /api/payments/make-payment
To'lov qabul qilish

**Body:**
```json
{
  "student_id": 123,
  "group_id": 45,
  "amount": 500000,
  "payment_method": "cash",
  "description": "Yanvar oyi uchun to'lov"
}
```

**Response:**
```json
{
  "success": true,
  "message": "To'lov muvaffaqiyatli qabul qilindi",
  "data": {
    "student": {
      "name": "Ali",
      "surname": "Valiev",
      "group_name": "Frontend 1"
    },
    "payment": {
      "student_id": 123,
      "group_id": 45,
      "month": "2024-01",
      "required_amount": "500000",
      "paid_amount": "500000"
    },
    "monthly_status": "active"
  }
}
```

**Xato holati (talaba faol emas):**
```json
{
  "success": false,
  "message": "Ali Valiev ning 2024-01 oydagi holati \"stopped\". To'lov qabul qilinmaydi."
}
```

### 3. GET /api/payments/student/{student_id}/history
Talabaning to'lov tarixi

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 567,
      "month": "2024-01",
      "amount": "500000",
      "payment_method": "cash",
      "group_name": "Frontend 1",
      "subject_name": "JavaScript",
      "created_by_name": "Admin User",
      "payment_date": "15.01.2024 14:30"
    }
  ]
}
```

### 4. GET /api/payments/filters
Filter ma'lumotlari

**Response:**
```json
{
  "success": true,
  "data": {
    "teachers": [
      {"id": 1, "name": "John Smith"},
      {"id": 2, "name": "Jane Doe"}
    ],
    "subjects": [
      {"id": 1, "name": "JavaScript"},
      {"id": 2, "name": "Python"}
    ],
    "groups": [
      {"id": 1, "name": "Frontend 1"},
      {"id": 2, "name": "Backend Advanced"}
    ]
  }
}
```

### 5. GET /api/payments/my
Talabaning o'z to'lovlari (student role)

**Parameters:**
- `month` (string): YYYY-MM formatida

**Response:**
```json
{
  "success": true,
  "data": {
    "month": "2024-01",
    "payments": [
      {
        "group_id": 45,
        "group_name": "Frontend 1",
        "subject_name": "JavaScript",
        "teacher_name": "John Smith",
        "required_amount": "500000",
        "paid_amount": "300000",
        "debt_amount": "200000",
        "monthly_status": "active",
        "payment_status": "partial",
        "last_payment_date": "15.01.2024"
      }
    ]
  }
}
```

### 6. POST /api/payments/discount
Chegirma berish (Admin only)

**Body:**
```json
{
  "student_id": 123,
  "group_id": 45,
  "discount_type": "percent",
  "discount_value": 20,
  "start_month": "2024-01",
  "end_month": "2024-06",
  "description": "A'lo baholar uchun"
}
```

## MUHIM XUSUSIYATLAR

### 1. Automatic Payment Record Creation
Agar talaba `monthly_status = 'active'` lekin to'lov yozuvi yo'q bo'lsa, avtomatik yaratiladi.

### 2. Monthly Status Validation
To'lov qabul qilishdan oldin talabaning oylik holati tekshiriladi:
- `active`: To'lov qabul qilinadi ✅
- `stopped`: To'lov qabul qilinmaydi ❌
- `finished`: To'lov qabul qilinmaydi ❌

### 3. Role-based Access
- **Teacher**: Faqat o'z guruhlaridagi talabalar
- **Admin**: Barcha talabalar
- **Student**: Faqat o'z to'lovlari

### 4. Payment Status Logic
```sql
CASE 
  WHEN monthly_status != 'active' THEN 'inactive'
  WHEN paid_amount >= required_amount THEN 'paid'
  WHEN paid_amount > 0 THEN 'partial'
  ELSE 'unpaid'
END as payment_status
```

## DATABASE JADVALLARI

### student_payments
```sql
CREATE TABLE student_payments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  month VARCHAR(7) NOT NULL, -- YYYY-MM
  required_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  last_payment_date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, group_id, month)
);
```

### payment_transactions
```sql
CREATE TABLE payment_transactions (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  month VARCHAR(7) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50) DEFAULT 'cash',
  description TEXT,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### student_discounts
```sql
CREATE TABLE student_discounts (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  discount_type VARCHAR(20) NOT NULL, -- 'percent' yoki 'amount'
  discount_value DECIMAL(10,2) NOT NULL,
  start_month VARCHAR(7) NOT NULL,
  end_month VARCHAR(7), -- NULL agar indefinite
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## MIGRATION

Eski tizimdan yangi tizimga o'tish uchun:

```bash
# Database migrate qilish
node scripts/migratePaymentsToMonthlyStatus.js

# Tables yaratish
node scripts/createGroupMonthlySettingsTable.js
node scripts/createPaymentTables.js
```

## TESTING

API'larni test qilish:

```bash
# Server ishga tushirish
npm run dev

# Swagger UI: http://localhost:5000/api-docs

# Example API calls:
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/payments/monthly?month=2024-01"

curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"student_id":123,"group_id":45,"amount":500000}' \
  "http://localhost:5000/api/payments/make-payment"
```