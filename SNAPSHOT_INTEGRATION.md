# YANGILANGAN TO'LOV TIZIMI - SNAPSHOT INTEGRATSIYASI

## 🔄 Yangilanishlar

### ✅ Nima o'zgartirildi:

1. **Snapshot va Attendance bog'lanishi**: Snapshot yangilanganida attendance jadvalidagi `monthly_status` ham avtomatik yangilanadi

2. **To'lov tizimi endi to'liq attendance.monthly_status ga bog'langan**: Group_status dan butunlay voz kechildik

3. **Har oylik mustaqil boshqarish**: Bir oyning statusini o'zgartirish boshqa oylarga ta'sir qilmaydi

## 🔧 Qanday ishlaydi:

### 1. Snapshot orqali status o'zgartirish:
```bash
PUT /api/snapshots/156
{
  "monthly_status": "stopped"
}
```

Bu API:
- ✅ Snapshot jadvalini yangilaydi
- ✅ Attendance jadvalidagi monthly_status ni ham yangilaydi  
- ✅ To'lov tizimi avtomatik stopped status ni ko'radi va to'lov qabul qilishni to'xtatadi

### 2. To'lovlar attendance ga bog'langan:
```sql
-- PaymentController da ishlatilayotgan query:
SELECT 
  COALESCE(att.monthly_status, 'active') as monthly_status
FROM attendance att 
WHERE att.student_id = $1 AND att.group_id = $2 AND att.month = $3
```

Agar `monthly_status = 'stopped'` bo'lsa → to'lov qabul qilinmaydi

### 3. Ikki tomonlama sinxronizatsiya:

**A) Snapshot → Attendance:**
```bash
PUT /api/snapshots/156 { "monthly_status": "stopped" }
```
→ Attendance jadvalida ham monthly_status yangilanadi

**B) Attendance → Snapshot:**  
```bash  
PUT /api/attendance/student/monthly-status
{
  "student_id": 123,
  "group_id": 45, 
  "month": "2024-03",
  "monthly_status": "stopped"
}
```
→ Agar snapshot mavjud bo'lsa, u ham yangilanadi (keyingi versiyada qo'shiladi)

## 🎯 Foydalanish misollari:

### Talabani bir oyga to'xtatish:
```bash
# Variant 1: Snapshot orqali
PUT /api/snapshots/156
{
  "monthly_status": "stopped" 
}

# Variant 2: To'g'ridan-to'g'ri attendance orqali
PUT /api/attendance/student/monthly-status  
{
  "student_id": 123,
  "group_id": 45,
  "month": "2024-03", 
  "monthly_status": "stopped"
}
```

### Ko'p oylarni birdaniga boshqarish:
```bash
PUT /api/attendance/student/monthly-status
{
  "student_id": 123,
  "group_id": 45,
  "months": ["2024-03", "2024-04", "2024-05"],
  "monthly_status": "stopped"
}
```

### Ma'lum oydan keyingi barcha oylar:
```bash
PUT /api/attendance/student/monthly-status
{
  "student_id": 123, 
  "group_id": 45,
  "from_month": "2024-03",
  "monthly_status": "finished"
}
```

## 🔄 Workflow:

1. **Admin snapshot yaratadi** (har oy boshi):
   ```bash
   POST /api/snapshots/create { "month": "2024-03" }
   ```

2. **Talaba statusini o'zgartiradi**:
   ```bash
   PUT /api/snapshots/156 { "monthly_status": "stopped" }
   ```

3. **Tizim avtomatik**:
   - ✅ Snapshot yangilaydi
   - ✅ Attendance monthly_status yangilaydi
   - ✅ To'lov tizimi yangi status ni ko'radi

4. **To'lov qabul qilishda**:
   ```bash
   POST /api/payments/make-payment
   {
     "student_id": 123,
     "group_id": 45, 
     "amount": 500000
   }
   ```
   
   Agar monthly_status = 'stopped' → `403 Forbidden` qaytadi

## ⚠️ Muhim eslatmalar:

1. **Group_status dan voz kechildik**: Endi faqat monthly_status ishlatiladi

2. **Har oy mustaqil**: Bir oyning statusini o'zgartirish boshqa oylarga ta'sir qilmaydi

3. **To'lov faqat active talabalar uchun**: monthly_status != 'active' bo'lsa to'lov rad etiladi

4. **Snapshot va Attendance sinxron**: Biri o'zgarsa ikkinchisi ham avtomatik yangilanadi

5. **Tarixiy ma'lumotlar saqlanadi**: O'tgan oylar snapshot lari o'zgarishsiz qoladi

## 📊 API Endpoints:

```bash
# Snapshot management
POST   /api/snapshots/create          # Snapshot yaratish
GET    /api/snapshots                 # Snapshot ko'rish  
PUT    /api/snapshots/{id}           # Snapshot yangilash ✨ + Attendance sinxron
DELETE /api/snapshots/{month}         # Snapshot o'chirish

# Attendance management  
PUT    /api/attendance/student/monthly-status  # Student status o'zgartirish

# To'lov tizimi (attendance ga bog'langan)
GET    /api/payments/monthly          # Oylik to'lovlar (monthly_status ga qarab)
POST   /api/payments/make-payment     # To'lov qabul qilish (faqat active lar uchun)
```

Bu yangi tizim orqali har oylik ma'lumotlarni to'liq mustaqil va xavfsiz boshqarish mumkin! 🎉