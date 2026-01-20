# ATTENDANCE SYSTEM - TO'LIQ QULLANMA

## API Endpoints:

### 1. Guruhlar ro'yxati
```http
GET /api/attendance/groups
Authorization: Bearer <token>
```

### 2. Bugungi kun uchun dars yaratish/ochish
```http
POST /api/attendance/lesson/{group_id}
Authorization: Bearer <token>
```
**Javob**: Agar dars mavjud bo'lsa - hozirgi davomat holatini ko'rsatadi. Agar yo'q bo'lsa - yangi dars yaratib, barcha studentlarni "absent" qilib qo'yadi.

### 3. Davomat saqlash
```http
PUT /api/attendance/save
Authorization: Bearer <token>

{
  "lesson_id": 123,
  "attendance_data": [
    {"student_id": 45, "status": "present"},
    {"student_id": 46, "status": "absent"}
  ]
}
```

### 4. Oylik davomat jadvali (YANGI!)
```http
GET /api/attendance/monthly/{group_id}?month=2026-01
Authorization: Bearer <token>
```
**Javob**: Tanglangan oy uchun barcha darslar va har bir studentning davomat holati.

### 5. Darslar tarixi (YANGI!)
```http
GET /api/attendance/lessons/{group_id}?start_date=2026-01-01&end_date=2026-01-31
Authorization: Bearer <token>
```
**Javob**: Guruhning barcha darsları, har birida nechta student kelgan/kelmagan.

## Frontend Workflow:

### Asosiy Attendance sahifasi:
1. `GET /api/attendance/groups` - guruhlar ro'yxati
2. Guruh tanlanadi
3. "New Attendance" tugmasi - `POST /api/attendance/lesson/{group_id}`
4. Studentlar ko'rsatiladi (mavjud holatlar bilan)
5. O'qituvchi belgilaydi
6. "Save" - `PUT /api/attendance/save`

### Oylik ko'rinish:
1. "Monthly View" tugmasi
2. `GET /api/attendance/monthly/{group_id}?month=2026-01`
3. Jadval ko'rsatiladi: studentlar x dars kunlari
4. Har katakchada: ✅ (present), ❌ (absent), ⚪ (dars yo'q)

### Darslar tarixi:
1. "Lesson History" tugmasi  
2. `GET /api/attendance/lessons/{group_id}`
3. Har dars uchun: sana, jami studentlar, kelganlar, kelmaganlar

## Frontend UI Taklifi:

```
┌─────────────────────────────────────────┐
│  📚 ATTENDANCE MANAGEMENT                │
├─────────────────────────────────────────┤
│  Groups: [Dropdown: Math A ▼]          │
│  [New Attendance] [Monthly View] [History] │
├─────────────────────────────────────────┤
│                                         │
│  📅 Today: 2026-01-21                   │
│                                         │
│  Students for today's lesson:           │
│  ☑️ Ali Karimov        (present)        │
│  ☐ Fatima Usmanova    (absent)         │
│  ☑️ Jasur Aminov      (present)        │
│                                         │
│  [Save Attendance]                      │
└─────────────────────────────────────────┘
```

Oylik ko'rinish:
```
┌─────────────────────────────────────────┐
│  📊 MONTHLY ATTENDANCE - January 2026   │
├─────────────────────────────────────────┤
│ Student Name    │ 15│ 17│ 20│ 22│ 24│ 27│
│ Ali Karimov     │ ✅│ ✅│ ❌│ ✅│ ⚪│ ⚪│
│ Fatima Usmanova │ ❌│ ✅│ ✅│ ❌│ ⚪│ ⚪│
│ Jasur Aminov    │ ✅│ ❌│ ✅│ ✅│ ⚪│ ⚪│
└─────────────────────────────────────────┘
```

## Muhim xususiyatlar:

✅ **Persistence**: Davomat belgigandan keyin saqlanib qoladi  
✅ **Monthly View**: Oyma-oy davom etuvchi davomat ko'rinishi  
✅ **Edit Previous**: Oldingi darslarni ham ochib tahrirlash mumkin  
✅ **Statistics**: Har dars uchun statistika  
✅ **Teacher Access Control**: Teacher faqat o'z guruhlarini ko'radi  

## Ma'lumotlar strukturasi:

**lessons** → **attendance** → **students**

Har guruh uchun har kun bitta lesson, har lesson uchun har student bitta attendance record.