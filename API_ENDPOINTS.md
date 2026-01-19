# LMS Backend - Barcha API Endpoints

## ✅ Yangi O'zgarishlar
- ✅ Users jadvalidan `required_amount` olib tashlandi
- ✅ Payments tizimi alohida qilindi - to'liq tarix va hisobotlar
- ✅ Student status management (active/inactive/blocked)
- ✅ Student delete API
- ✅ Oyma-oy to'lovlar va moliyaviy hisobotlar

---

## 🔐 Users (Foydalanuvchilar)
| Method | Endpoint | Tavsif | Auth |
|--------|----------|--------|------|
| POST | `/api/users/register` | Yangi foydalanuvchi ro'yxatdan o'tish | ❌ |
| POST | `/api/users/login` | Tizimga kirish | ❌ |
| POST | `/api/users/refresh-token` | Token yangilash | ❌ |

---

## 👥 Groups (Guruhlar)
| Method | Endpoint | Tavsif | Auth |
|--------|----------|--------|------|
| POST | `/api/groups` | Yangi guruh yaratish | Admin |
| GET | `/api/groups` | Barcha guruhlar | Admin |
| GET | `/api/groups/:id` | Bitta guruh | Admin |
| PATCH | `/api/groups/:id` | Guruhni tahrirlash | Admin |
| DELETE | `/api/groups/:id` | Guruhni o'chirish | Admin |
| POST | `/api/groups/admin/join-student` | Studentni guruhga qo'shish (admin) | Admin |
| POST | `/api/groups/join` | Kod orqali guruhga qo'shilish (student) | Student |
| DELETE | `/api/groups/:group_id/remove/:student_id` | Studentni guruhdan chiqarish | Admin |
| GET | `/api/groups/my-group` | Mening guruhim | Student |

---

## 🎓 Students (Studentlar)
| Method | Endpoint | Tavsif | Auth |
|--------|----------|--------|------|
| GET | `/api/students/all` | Barcha studentlar (filter bilan) | Admin |
| PATCH | `/api/students/:student_id/status` | Student statusini o'zgartirish | Admin |
| DELETE | `/api/students/:student_id` | Studentni o'chirish | Admin |

**Filter parametrlari:**
- `?teacher_id=1` - O'qituvchi bo'yicha
- `?group_id=5` - Guruh bo'yicha
- `?status=active` - Status bo'yicha (active/inactive/blocked/graduated/dropped_out)

**Mavjud statuslar:**
- `active` - Faol (guruhga biriktirilishi mumkin)
- `inactive` - O'qishni to'xtatgan (vaqtincha)
- `blocked` - Bloklangan (admin tomonidan)

- `graduated` - Kursni muvaffaqiyatli bitirgan
- `dropped_out` - O'qishdan bitimasdan chiqib ketgan

---

## 💰 Payments (To'lovlar) - YANGI TIZIM

### To'lov qo'shish
| Method | Endpoint | Tavsif | Auth |
|--------|----------|--------|------|
| POST | `/api/payments/add` | Yangi to'lov qo'shish | Admin |

**Body:**
```json
{
  "student_id": 1,
  "amount": 500000,
  "month_name": "2026-01",
  "payment_method": "cash", // cash, card, transfer
  "note": "Yanvar oyi to'lovi"
}
```

### Hisobotlar
| Method | Endpoint | Tavsif | Auth |
|--------|----------|--------|------|
| GET | `/api/payments/student/:student_id` | Bitta student to'lovlari | Token |
| GET | `/api/payments/month/:month_name` | Oylik to'lovlar (2026-01) | Admin |
| GET | `/api/payments/group/:group_id` | Guruh to'lovlari | Admin |
| GET | `/api/payments/all` | Barcha to'lovlar (filter bilan) | Admin |
| GET | `/api/payments/report/financial` | Moliyaviy hisobot | Admin |
| DELETE | `/api/payments/:payment_id` | To'lovni o'chirish | Admin |

**GET /api/payments/all - Filter parametrlari:**
- `?month_name=2026-01` - Oy bo'yicha
- `?payment_method=cash` - To'lov usuli bo'yicha
- `?student_id=5` - Student bo'yicha
- `?group_id=2` - Guruh bo'yicha

**GET /api/payments/report/financial - Parametrlar:**
- `?start_date=2026-01-01&end_date=2026-01-31` - Sana oraliqi

**Moliyaviy hisobot qaytaradi:**
- Jami daromad
- Oylik breakdown
- To'lov usullari bo'yicha statistika
- Guruhlar bo'yicha daromad

---

## 📊 Ma'lumotlar Tuzilishi

### Users jadvali (yangilangan)
```sql
- id, name, surname, username, password
- role (admin, teacher, student)
- status (active, inactive, blocked)
- phone, phone2
- group_id, group_name, teacher_id, teacher_name
- created_at
```

### Payments jadvali (yangi)
```sql
- id
- student_id (FK -> users)
- group_id (FK -> groups)
- amount
- month_name (Format: "2026-01")
- payment_method (cash, card, transfer)
- note
- created_by (FK -> users, qaysi admin qo'shgan)
- created_at
```

---

## 🚀 Workflow

1. **Student registratsiya qiladi** → `POST /api/users/register`
2. **Admin studentni guruhga qo'shadi** → `POST /api/groups/admin/join-student`
   - Auto-populate: group_name, teacher_name
3. **Student o'z guruhini ko'radi** → `GET /api/groups/my-group`
4. **Admin oylik to'lov qo'shadi** → `POST /api/payments/add`
5. **Student to'lovlar tarixini ko'radi** → `GET /api/payments/student/:id`
6. **Admin oylik hisobot oladi** → `GET /api/payments/month/2026-01`
7. **Admin moliyaviy dashboard oladi** → `GET /api/payments/report/financial`

---

## 🎯 Afzalliklar

✅ **To'lovlar alohida** - Payments jadvali butun tarixni saqlaydi  
✅ **Oyma-oy hisobotlar** - Har oy alohida tracking  
✅ **Moliyaviy dashboard** - Jami daromad, guruhlar bo'yicha, usullar bo'yicha  
✅ **Qarz hisoblash** - `required_amount` guruhda, to'lovlar alohida  
✅ **Admin tracking** - Qaysi admin to'lov qo'shganini bilish  
✅ **Student lifecycle** - Active/Inactive/Blocked statuslar  
✅ **Tozalash** - DELETE student barcha ma'lumotlar bilan (CASCADE)

---

## 📝 Swagger Dokumentatsiya
`http://localhost:5000/api-docs` da barcha endpoint'lar uchun to'liq Swagger UI mavjud!
