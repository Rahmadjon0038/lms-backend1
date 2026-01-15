# Payments API Yangilanishlari

## O'zgarishlar

### 1. Students List API (/api/payments/students-list)

**Yangi filterlar qo'shildi:**
- `teacher_id` - O'qituvchi bo'yicha filter
- `subject_id` - Fan bo'yicha filter

**Yangi student ma'lumotlari:**
- `phone2` - Ikkinchi telefon raqami
- `father_name` - Otasining ismi
- `father_phone` - Otasining telefon raqami
- `address` - Yashash manzili
- `subject_name` - Fan nomi
- `teacher_id` - O'qituvchi ID

**Misol so'rov:**
```
GET /api/payments/students-list?month_name=2026-01&teacher_id=3&subject_id=1
```

**Tushunchalar:**
- `default_price`: Guruhning asosiy narxi
- `required_amount`: Shu oy uchun to'lash kerak bo'lgan summa (agar custom narx belgilangan bo'lsa, aks holda default_price)
- `debt`: Qarzi (required_amount - paid_amount)

### 2. Custom Narx Belgilash (/api/payments/set-requirement)

**Yangi parametr:**
- `duration_months`: Necha oy davomida shu narxni qo'llash (ixtiyoriy)

**Imkoniyat:**
Admin student uchun bir necha oyga custom narx belgilay oladi.

**Misol:**
```json
{
  "student_id": 5,
  "month_name": "2026-01",
  "required_amount": 400000,
  "duration_months": 3
}
```

Bu 2026-01, 2026-02, 2026-03 oylari uchun 400,000 so'm belgilaydi.

### 3. To'lov Qo'shish (/api/payments/add)

**O'zgarishlar:**
- `payment_method` parametri olib tashlandi
- `note` ixtiyoriy qilingan
- `admin_name` avtomatik qo'shiladi (to'lovni tasdiqlagan admin ismi)

**Misol:**
```json
{
  "student_id": 5,
  "month_name": "2026-01",
  "amount": 500000,
  "note": "Yanvar oyi to'lovi" // ixtiyoriy
}
```

### 4. Database O'zgarishlari

**Payments jadvali:**
- `payment_method` ustuni o'chirildi
- `admin_name` ustuni qo'shildi
- `note` ixtiyoriy qilingan

### 5. Barcha To'lovlar API (/api/payments/all)

**Yangi filter:**
- `teacher_id` - O'qituvchi bo'yicha filter qo'shildi

**Imkoniyat:**
Admin malum bir o'qituvchining studentlarining to'lovlarini ko'rishi mumkin.

**Misol:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/payments/all?month_name=2026-01&teacher_id=2"
```

Bu 2026-01 oyida ID=2 o'qituvchining barcha studentlarining to'lovlarini qaytaradi.

## Test Qilish

1. **Filterlar bilan students list:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/payments/students-list?month_name=2026-01&teacher_id=1"
```

2. **Custom narx belgilash (bir necha oy):**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"student_id": 1, "month_name": "2026-01", "required_amount": 400000, "duration_months": 3}' \
  http://localhost:5000/api/payments/set-requirement
```

3. **To'lov qo'shish:**
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"student_id": 1, "month_name": "2026-01", "amount": 200000, "note": "Qisman to'lov"}' \
  http://localhost:5000/api/payments/add
```

4. **Barcha to'lovlar (teacher filter bilan):**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:5000/api/payments/all?month_name=2026-01&teacher_id=1"
```

## Swagger Documentation

Swagger UI da `/api-docs` da barcha yangi parametrlar va response formatlar yangilangan.