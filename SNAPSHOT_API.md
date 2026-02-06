# MONTHLY SNAPSHOT API

Bu API har oylik ma'lumotlarni snapshot shaklida saqlash va boshqarish uchun ishlatiladi.

## Asosiy Prinsip

- **Har oy uchun alohida snapshot**: Malum oy uchun barcha talabalar, guruhlar va to'lov ma'lumotlari saqlanadi
- **Mustaqil boshqarish**: Har bir oylik snapshot mustaqil ravishda yaratiladi va boshqariladi
- **Tarixiy ma'lumotlar**: O'tgan oylar ma'lumotlari saqlanib qoladi
- **Flexible reporting**: Har qanday oy bo'yicha hisobot olish mumkin

## 📋 Snapshot jadval tuzilishi

```sql
CREATE TABLE monthly_snapshots (
    id SERIAL PRIMARY KEY,
    month VARCHAR(7) NOT NULL, -- YYYY-MM format
    student_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    
    -- Student ma'lumotlari
    student_name VARCHAR(100),
    student_surname VARCHAR(100),
    student_phone VARCHAR(20),
    student_father_name VARCHAR(100),
    student_father_phone VARCHAR(20),
    
    -- Guruh ma'lumotlari  
    group_name VARCHAR(100),
    group_price DECIMAL(10,2),
    subject_name VARCHAR(100),
    teacher_name VARCHAR(100),
    
    -- Status ma'lumotlari
    monthly_status VARCHAR(20) DEFAULT 'active', -- 'active', 'stopped', 'finished'
    payment_status VARCHAR(20) DEFAULT 'unpaid', -- 'paid', 'partial', 'unpaid', 'inactive'
    
    -- To'lov ma'lumotlari
    required_amount DECIMAL(10,2) DEFAULT 0,
    paid_amount DECIMAL(10,2) DEFAULT 0,
    debt_amount DECIMAL(10,2) DEFAULT 0,
    last_payment_date TIMESTAMP,
    
    -- Davomat ma'lumotlari
    total_lessons INTEGER DEFAULT 0,
    attended_lessons INTEGER DEFAULT 0,
    attendance_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Sana ma'lumotlari
    snapshot_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    snapshot_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(month, student_id, group_id)
);
```

## 🚀 API Endpoints

### 1. Snapshot yaratish
```http
POST /api/snapshots/create
```

**Request Body:**
```json
{
  "month": "2024-03"
}
```

**Response:**
```json
{
  "success": true,
  "message": "2024-03 oy uchun snapshot muvaffaqiyatli yaratildi",
  "data": {
    "month": "2024-03",
    "created_records": 156,
    "statistics": {
      "total_students": 156,
      "active_students": 142,
      "stopped_students": 12,
      "finished_students": 2,
      "paid_students": 89,
      "partial_students": 23,
      "unpaid_students": 30,
      "inactive_students": 14,
      "total_required": "45600000",
      "total_paid": "32800000",
      "total_debt": "12800000"
    }
  }
}
```

### 2. Snapshot ko'rish
```http
GET /api/snapshots?month=2024-03
```

**Query Parameters:**
- `month` (majburiy): YYYY-MM format
- `group_id`: Guruh bo'yicha filter
- `status`: monthly_status bo'yicha filter (`active`, `stopped`, `finished`)
- `payment_status`: payment_status bo'yicha filter (`paid`, `partial`, `unpaid`, `inactive`)

**Response:**
```json
{
  "success": true,
  "data": {
    "month": "2024-03",
    "students": [
      {
        "id": 1,
        "month": "2024-03",
        "student_id": 123,
        "group_id": 45,
        "student_name": "Ahmad",
        "student_surname": "Karimov",
        "student_phone": "+998901234567",
        "group_name": "IELTS Advanced",
        "group_price": 500000,
        "subject_name": "English",
        "teacher_name": "John Smith",
        "monthly_status": "active",
        "payment_status": "paid",
        "required_amount": 500000,
        "paid_amount": 500000,
        "debt_amount": 0,
        "last_payment_date": "15.03.2024 14:30",
        "total_lessons": 12,
        "attended_lessons": 11,
        "attendance_percentage": 91.67,
        "snapshot_created_at": "01.03.2024 09:00",
        "snapshot_updated_at": "15.03.2024 14:30"
      }
    ],
    "summary": {
      "total_students": 1,
      "active_students": 1,
      "paid_students": 1,
      "partial_students": 0,
      "unpaid_students": 0,
      "total_required": "500000",
      "total_paid": "500000",
      "total_debt": "0"
    }
  }
}
```

### 3. Mavjud snapshot oylar ro'yxati
```http
GET /api/snapshots/available
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "month": "2024-03",
      "student_count": 156,
      "active_count": 142,
      "paid_count": 89,
      "total_required": "45600000",
      "total_paid": "32800000",
      "created_at": "01.03.2024 09:00",
      "updated_at": "15.03.2024 16:45"
    },
    {
      "month": "2024-02",
      "student_count": 148,
      "active_count": 134,
      "paid_count": 112,
      "total_required": "43200000",
      "total_paid": "39100000",
      "created_at": "01.02.2024 09:00",
      "updated_at": "28.02.2024 18:20"
    }
  ]
}
```

### 4. Snapshot yangilash
```http
PUT /api/snapshots/{id}
```

**Request Body:**
```json
{
  "monthly_status": "stopped",
  "required_amount": 450000,
  "paid_amount": 225000,
  "attendance_percentage": 85.5
}
```

**Response:**
```json
{
  "success": true,
  "message": "Snapshot muvaffaqiyatli yangilandi",
  "data": {
    "id": 1,
    "month": "2024-03",
    "student_id": 123,
    "group_id": 45,
    "monthly_status": "stopped",
    "payment_status": "partial",
    "required_amount": 450000,
    "paid_amount": 225000,
    "debt_amount": 225000,
    "attendance_percentage": 85.5
  }
}
```

### 5. Snapshot o'chirish
```http
DELETE /api/snapshots/{month}
```

**Response:**
```json
{
  "success": true,
  "message": "2024-03 oy uchun snapshot o'chirildi",
  "deleted_records": 156
}
```

## 🔒 Avtorizatsiya

- **Snapshot yaratish**: Faqat `admin`
- **Snapshot yangilash**: Faqat `admin`  
- **Snapshot o'chirish**: Faqat `admin`
- **Snapshot ko'rish**: Barcha foydalanuvchilar (teacher faqat o'z guruhlarini ko'radi)

## 💡 Foydalanish senariyalari

### 1. Har oy boshida snapshot yaratish
```bash
# Mart oyi uchun
POST /api/snapshots/create
{
  "month": "2024-03"
}
```

### 2. Talabani bir oyga to'xtatish
```bash
# Snapshot ID orqali
PUT /api/snapshots/156
{
  "monthly_status": "stopped"
}
```

### 3. Oylik hisobot olish
```bash
# Mart oyi hisoboti
GET /api/snapshots?month=2024-03

# Faqat to'lanmagan talabalar
GET /api/snapshots?month=2024-03&payment_status=unpaid

# Muayyan guruh bo'yicha
GET /api/snapshots?month=2024-03&group_id=45
```

### 4. To'lovlarni snapshot orqali kuzatish
```bash
# Talaba to'lov qilgandan keyin snapshot yangilash
PUT /api/snapshots/156
{
  "paid_amount": 500000
}
# payment_status avtomatik 'paid' ga o'zgaradi
```

## ⚠️ Muhim eslatmalar

1. **Snapshot yaratishdan oldin**: O'sha oy uchun barcha to'lov va davomat ma'lumotlari to'g'ri kiritilganligini tekshiring

2. **Group_status vs Monthly_status**: 
   - Eski tizim: `group_status` barcha oylarni buzardi
   - Yangi tizim: `monthly_status` faqat o'sha oyga ta'sir qiladi

3. **Snapshot o'chirish**: Ehtiyotkor bo'ling, bu amal qaytarilmaydi

4. **Performance**: Katta ma'lumotlar uchun indekslar ishlatiladi

5. **Backup**: Snapshot yaratishdan oldin ma'lumotlar bazasini backup qiling

## 🔧 Database Migration

Tizimni ishga tushirish uchun:

1. Script ishga tushirish:
```bash
node scripts/createMonthlySnapshot.js
```

2. Yoki server ishga tushganda avtomatik yaratiladi

3. Birinchi snapshot yaratish:
```bash
POST /api/snapshots/create
{
  "month": "2024-03"
}
```

## 📊 Reporting uchun

Har oylik snapshot orqali:
- To'lov foizi
- Davomat statistikasi
- Guruhlar bo'yicha tahlil
- O'qituvchilar bo'yicha hisobot
- Trenda tahlil (oyma-oy o'sish/kamayish)

Bu tizim orqali har bir oyni mustaqil boshqarish va tahlil qilish mumkin bo'ladi!