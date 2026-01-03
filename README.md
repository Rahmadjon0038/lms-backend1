# LMS Backend - Yakuniy Arxitektura

## 🎯 To'liq Tizim Strukturasi

### 1. **Student Ro'yxatdan O'tishi** 
User saytdan ro'yxatdan o'tganda **avtomatik student rolida** yaratiladi.

**Endpoint:** `POST /api/users/register`

**Request:**
```json
{
  "name": "Ali",
  "surname": "Valiyev",
  "username": "ali777",
  "password": "parol123",
  "phone": "+998901234567",
  "phone2": "+998912345678"
}
```

**Response:**
```json
{
  "message": "Muvaffaqiyatli ro'yxatdan o'tdingiz",
  "user": {
    "id": 5,
    "name": "Ali",
    "surname": "Valiyev",
    "username": "ali777",
    "role": "student"
  }
}
```

---

### 2. **Admin Studentni Guruhga Qo'shadi**
Admin student ID va guruh ID orqali studentni guruhga qo'shadi.
**Avtomatik ravishda** student ma'lumotlariga guruh nomi, teacher nomi va price yoziladi!

**Endpoint:** `POST /api/groups/admin/join-student`

**Request:**
```json
{
  "student_id": 5,
  "group_id": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Student guruhga qo'shildi",
  "updatedFields": {
    "group_name": "Inglis tili beginner",
    "teacher_name": "Rahmadjon Abdullayev",
    "required_amount": 500000
  }
}
```

**Users jadvalidagi student ma'lumotlari:**
```json
{
  "id": 5,
  "name": "Ali",
  "surname": "Valiyev",
  "phone": "+998901234567",
  "phone2": "+998912345678",
  "group_id": 1,
  "group_name": "Inglis tili beginner",
  "teacher_id": 3,
  "teacher_name": "Rahmadjon Abdullayev",
  "required_amount": 500000,
  "registration_date": "2026-01-03T10:30:00.000Z"
}
```

---

### 3. **Student O'z Guruhini Ko'radi** ⭐ YANGI
Student o'z guruhiga kirib, guruh ma'lumotlari va guruh a'zolarini ko'radi.

**Endpoint:** `GET /api/groups/my-group`  
**Auth:** JWT Token kerak

**Response:**
```json
{
  "success": true,
  "groupInfo": {
    "group_id": 1,
    "group_name": "Inglis tili beginner",
    "teacher_name": "Rahmadjon Abdullayev",
    "required_amount": 500000,
    "schedule": {"days": ["Mon", "Wed"], "time": "18:00-20:00"},
    "start_date": "2025-01-10",
    "is_active": true,
    "unique_code": "GR-A1B2C3"
  },
  "members": [
    {
      "id": 5,
      "name": "Ali",
      "surname": "Valiyev",
      "username": "ali123",
      "phone": "+998901234567",
      "joined_at": "2026-01-03T10:30:00.000Z",
      "status": "active"
    },
    {
      "id": 7,
      "name": "Sardor",
      "surname": "Karimov",
      "username": "sardor99",
      "phone": "+998901234568",
      "joined_at": "2026-01-02T14:20:00.000Z",
      "status": "active"
    }
  ],
  "totalMembers": 2
}
```

---

### 4. **Student Kod Orqali Guruhga Qo'shilishi**
Student o'zi guruh kodini bilsa, kod orqali qo'shilishi mumkin.

**Endpoint:** `POST /api/groups/join`  
**Auth:** JWT Token kerak

**Request:**
```json
{
  "unique_code": "GR-A1B2C3"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Guruhga muvaffaqiyatli qo'shildingiz",
  "groupInfo": {
    "group_name": "Inglis tili beginner",
    "teacher_name": "Rahmadjon Abdullayev",
    "price": 500000
  }
}
```

---

## 📊 Barcha Endpointlar

### Users
- `POST /api/users/register` - Ro'yxatdan o'tish (avtomatik student)
- `POST /api/users/login` - Tizimga kirish
- `GET /api/users/profile` - O'z profilini ko'rish (auth)
- `GET /api/users/all` - Barcha userlar (faqat admin)

### Groups
- `POST /api/groups/create` - Yangi guruh yaratish (admin)
- `GET /api/groups` - Barcha guruhlar
- `GET /api/groups/:id` - Bitta guruh batafsil
- `PATCH /api/groups/:id` - Guruhni tahrirlash (admin)
- `DELETE /api/groups/:id` - Guruhni o'chirish (admin)
- `POST /api/groups/admin/join-student` - Admin student qo'shadi ⭐
- `POST /api/groups/join` - Student kod orqali qo'shiladi
- `GET /api/groups/my-group` - Student o'z guruhini ko'radi ⭐ YANGI
- `DELETE /api/groups/:group_id/remove-student/:student_id` - Studentni chiqarish

### Students
- `GET /api/students/all` - Barcha studentlar (filter bilan)

---

## 🔑 Asosiy Xususiyatlar

✅ **Avtomatik Student Roli** - Register bo'lganda avtomatik student  
✅ **Avtomatik Guruh Ma'lumotlari** - Guruhga qo'shilganda avtomatik price, teacher, group_name yoziladi  
✅ **Student O'z Guruhini Ko'radi** - Guruh ma'lumotlari va a'zolar ro'yxati  
✅ **Kod Orqali Qo'shilish** - Guruh unique_code orqali qo'shilish  
✅ **Admin Boshqaruvi** - Admin studentlarni guruhga qo'shadi  

---

## 🗄️ Database Schema

### users
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  surname VARCHAR(100),
  username VARCHAR(50) UNIQUE,
  password TEXT,
  role VARCHAR(20) DEFAULT 'student',
  phone VARCHAR(20),
  phone2 VARCHAR(20),
  group_id INTEGER,           -- Guruh ID
  group_name VARCHAR(255),    -- Guruh nomi
  teacher_id INTEGER,         -- O'qituvchi ID
  teacher_name VARCHAR(255),  -- O'qituvchi ismi
  required_amount DECIMAL(10, 2), -- To'lov summasi
  created_at TIMESTAMP DEFAULT NOW()
);
```

### groups
```sql
CREATE TABLE groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  teacher_id INTEGER,
  unique_code VARCHAR(20) UNIQUE,
  price DECIMAL(10, 2),
  schedule JSONB,
  start_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### student_groups
```sql
CREATE TABLE student_groups (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id),
  group_id INTEGER REFERENCES groups(id),
  joined_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'active',
  UNIQUE(student_id, group_id)
);
```

---

## 🚀 Ishga Tushirish

```bash
# Serverni ishga tushirish
npm run dev

# Swagger UI
http://localhost:5000/api-docs
```

---

## ✨ Muhim Eslatmalar

1. **Register = Student** - Ro'yxatdan o'tish avtomatik student yaratadi
2. **Admin Guruhga Qo'shadi** - Faqat admin studentni guruhga qo'shadi
3. **Avtomatik Ma'lumotlar** - Guruhga qo'shilganda avtomatik guruh ma'lumotlari yoziladi
4. **Student O'z Guruhini Ko'radi** - `/api/groups/my-group` endpoint orqali
5. **Kod Orqali Qo'shilish** - Student o'zi ham kod orqali qo'shilishi mumkin

---

Barcha tizim tayyor! 🎉
