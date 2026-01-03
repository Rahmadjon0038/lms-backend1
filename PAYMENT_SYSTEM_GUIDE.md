# 💰 To'lovlar Tizimi - To'liq Qo'llanma

## 📋 Tizim Tavsifi

Professional oyma-oy to'lovlar tizimi:
- ✅ Har bir student uchun har bir oyda alohida to'lov talabi
- ✅ Admin har bir student uchun to'lov summasini belgilaydi
- ✅ To'lovlar tarixi saqlanadi
- ✅ Avtomatik qarz hisoblash
- ✅ Oylik hisobotlar va statistika

---

## 🗄️ Database Tuzilishi

### 1. `monthly_fees` jadvali
Har bir student uchun har bir oyda qancha to'lashi kerak va qancha to'lagan:

```sql
CREATE TABLE monthly_fees (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  month_name VARCHAR(20) NOT NULL,           -- "2026-01"
  required_amount DECIMAL(10, 2) DEFAULT 0,  -- To'lashi kerak
  paid_amount DECIMAL(10, 2) DEFAULT 0,      -- To'lagan
  status VARCHAR(20) DEFAULT 'unpaid',       -- paid/partial/unpaid
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(student_id, month_name)
);
```

**Status avtomatik yangilanadi:**
- `unpaid` - hali to'lamagan (paid_amount = 0)
- `partial` - qisman to'lagan (0 < paid_amount < required_amount)
- `paid` - to'liq to'lagan (paid_amount >= required_amount)

### 2. `payments` jadvali
Har bir to'lov alohida saqlanadi (tarix):

```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
  month_name VARCHAR(20) NOT NULL,          -- Qaysi oy uchun
  amount DECIMAL(10, 2) NOT NULL,           -- To'langan summa
  payment_method VARCHAR(20) DEFAULT 'cash', -- cash/card/transfer
  note TEXT,                                 -- Izoh
  created_by INTEGER REFERENCES users(id),  -- Qaysi admin qo'shgan
  created_at TIMESTAMP
);
```

---

## 🚀 Workflow (Ish jarayoni)

### 1️⃣ Admin studentlar ro'yxatini ko'radi
**Endpoint:** `GET /api/payments/students-list?month_name=2026-01`

**Response:**
```json
{
  "success": true,
  "month": "2026-01",
  "count": 15,
  "students": [
    {
      "student_id": 5,
      "student_name": "Ali Valiyev",
      "phone": "+998901234567",
      "group_name": "English Beginner A1",
      "teacher_name": "Rahmadjon Abdullayev",
      "default_price": 500000,        // Guruhning narxi
      "required_amount": 450000,      // Shu student uchun belgilangan
      "paid_amount": 200000,          // To'lagan
      "status": "partial",            // Qisman to'lagan
      "debt": 250000                  // Qolgan qarz
    },
    {
      "student_id": 8,
      "student_name": "Sarvar Karimov",
      "phone": "+998912345678",
      "group_name": "Python Advanced",
      "teacher_name": "Jasur Nazarov",
      "default_price": 800000,
      "required_amount": null,        // Hali belgilanmagan
      "paid_amount": 0,
      "status": null,
      "debt": 800000                  // Default price asosida
    }
  ]
}
```

**Filterlar:**
- `?month_name=2026-01` - Oy (default: joriy oy)
- `?group_id=3` - Guruh bo'yicha

---

### 2️⃣ Admin studentga oylik to'lov summasini belgilaydi
**Endpoint:** `POST /api/payments/set-requirement`

**Request:**
```json
{
  "student_id": 5,
  "month_name": "2026-01",
  "required_amount": 450000
}
```

**Response:**
```json
{
  "success": true,
  "message": "Ali Valiyev uchun 2026-01 oyiga to'lov summasi belgilandi",
  "data": {
    "id": 12,
    "student_id": 5,
    "group_id": 2,
    "month_name": "2026-01",
    "required_amount": 450000,
    "paid_amount": 0,
    "status": "unpaid"
  }
}
```

**Qachon kerak?**
- Yangi student guruhga qo'shilganda
- Student chegirmaga ega bo'lsa
- Qo'shimcha to'lovlar bo'lsa
- Har oy uchun alohida summa belgilash kerak bo'lsa

---

### 3️⃣ Student to'lov qilganda admin qo'shadi
**Endpoint:** `POST /api/payments/add`

**Request:**
```json
{
  "student_id": 5,
  "month_name": "2026-01",
  "amount": 200000,
  "payment_method": "cash",
  "note": "Yanvar oyining qismi"
}
```

**Response:**
```json
{
  "success": true,
  "message": "To'lov muvaffaqiyatli qo'shildi",
  "payment": {
    "id": 45,
    "student_id": 5,
    "group_id": 2,
    "month_name": "2026-01",
    "amount": 200000,
    "payment_method": "cash",
    "note": "Yanvar oyining qismi",
    "created_by": 1,
    "created_at": "2026-01-03T10:30:00Z"
  },
  "monthly_summary": {
    "id": 12,
    "student_id": 5,
    "month_name": "2026-01",
    "required_amount": 450000,
    "paid_amount": 200000,      // Avtomatik yangilandi!
    "status": "partial"         // Avtomatik o'zgardi!
  },
  "student": {
    "id": 5,
    "name": "Ali",
    "surname": "Valiyev",
    "group_name": "English Beginner A1"
  }
}
```

**Nima sodir bo'ladi?**
1. ✅ To'lov `payments` jadvaliga qo'shiladi
2. ✅ `monthly_fees` dagi `paid_amount` avtomatik yangilanadi (barcha to'lovlar summasi)
3. ✅ `status` avtomatik o'zgaradi (trigger orqali)

---

### 4️⃣ Student qayta to'lov qilsa
**Request:**
```json
{
  "student_id": 5,
  "month_name": "2026-01",
  "amount": 250000,
  "payment_method": "card"
}
```

**Natija:**
- `paid_amount`: 200000 + 250000 = **450000**
- `status`: **"paid"** (to'liq to'langan!)

---

### 5️⃣ Student to'lovlar tarixini ko'rish
**Endpoint:** `GET /api/payments/student/5?month_name=2026-01`

**Response:**
```json
{
  "success": true,
  "student": {
    "id": 5,
    "name": "Ali",
    "surname": "Valiyev",
    "group_name": "English Beginner A1",
    "teacher_name": "Rahmadjon Abdullayev"
  },
  "monthly_fees": [
    {
      "month_name": "2026-01",
      "required_amount": 450000,
      "paid_amount": 450000,
      "status": "paid"
    }
  ],
  "payments": [
    {
      "id": 46,
      "amount": 250000,
      "payment_method": "card",
      "admin_name": "Admin User",
      "created_at": "2026-01-03T14:20:00Z"
    },
    {
      "id": 45,
      "amount": 200000,
      "payment_method": "cash",
      "note": "Yanvar oyining qismi",
      "admin_name": "Admin User",
      "created_at": "2026-01-03T10:30:00Z"
    }
  ],
  "total_debt": 0
}
```

**Agar `month_name` ko'rsatilmasa** - barcha oylar ko'rinadi!

---

### 6️⃣ Oylik hisobot (Admin)
**Endpoint:** `GET /api/payments/month/2026-01`

**Response:**
```json
{
  "success": true,
  "month": "2026-01",
  "statistics": {
    "total_students": 15,
    "total_required": 7500000,
    "total_paid": 5200000,
    "paid_count": 5,          // To'liq to'laganlar
    "partial_count": 7,       // Qisman to'laganlar
    "unpaid_count": 3         // Hali to'lamaganlar
  },
  "students": [
    {
      "student_id": 5,
      "student_name": "Ali Valiyev",
      "phone": "+998901234567",
      "group_name": "English Beginner A1",
      "teacher_name": "Rahmadjon Abdullayev",
      "required_amount": 450000,
      "paid_amount": 450000,
      "status": "paid",
      "debt": 0
    },
    // ... boshqa studentlar
  ]
}
```

---

## 🎯 Asosiy Afzalliklar

### ✅ Har bir oy alohida
- Har bir oyda boshqa summa bo'lishi mumkin
- Chegirmalar va qo'shimcha to'lovlar
- O'tgan oylar ham saqlanadi

### ✅ To'lovlar tarixi
- Har bir to'lov alohida yoziladi
- Qaysi admin qo'shgani saqlanadi
- To'lov usuli (cash/card/transfer)

### ✅ Avtomatik hisoblash
- `paid_amount` avtomatik yangilanadi
- `status` avtomatik o'zgaradi
- `debt` avtomatik hisoblanadi

### ✅ Qulaylik
- Student ro'yxatida hamma ma'lumot ko'rinadi
- Qarz bor/yo'qligini bir nazar bilan bilish
- Oylik statistika

---

## 📊 Qo'shimcha Endpointlar

| Endpoint | Tavsif |
|----------|--------|
| `GET /api/payments/students-list` | To'lov qilish uchun studentlar |
| `POST /api/payments/set-requirement` | Oylik to'lov summasini belgilash |
| `POST /api/payments/add` | To'lov qo'shish |
| `GET /api/payments/student/:id` | Student tarixi |
| `GET /api/payments/month/:month` | Oylik hisobot |
| `GET /api/payments/group/:id` | Guruh to'lovlari |
| `GET /api/payments/all` | Barcha to'lovlar (filter) |
| `GET /api/payments/report/financial` | Moliyaviy dashboard |
| `DELETE /api/payments/:id` | To'lovni o'chirish |

---

## 🔄 Misollar

### Misol 1: Yangi oy boshlanadi
1. Admin `GET /api/payments/students-list?month_name=2026-02` ochadi
2. Barcha studentlar ko'rinadi, lekin `required_amount` = null
3. Admin har biriga summa belgilaydi: `POST /api/payments/set-requirement`
4. To'lovlar kelganda qo'shadi: `POST /api/payments/add`

### Misol 2: Student qarzini ko'rish
1. `GET /api/payments/student/5` - barcha oylar
2. Response da har oy uchun `debt` ko'rinadi
3. Jami qarz: `total_debt`

### Misol 3: Oylik statistika
1. `GET /api/payments/month/2026-01`
2. Kimlar to'lagan, kimlar to'lamagan - hammasi ko'rinadi
3. Jami to'lash kerak/to'langan summa

---

## 🚀 Ishga Tushirish

```bash
npm run dev
```

Server ishga tushganda:
- ✅ `monthly_fees` jadvali yaratiladi
- ✅ `payments` jadvali yangilanadi
- ✅ Trigger o'rnatiladi (status avtomatik o'zgaradi)

Swagger: `http://localhost:5000/api-docs`

---

**Mana endi sizda professional to'lovlar tizimi tayyor! 🎉**
