# DAVOMAT TIZIMI API HUJJATLARI

## Umumiy ma'lumot

Yangilangan davomat tizimi guruh jadvaliga asoslangan holda avtomatik davomat kunlarini hisoblaydi va har bir talabaning davomat holatini saqlaydi.

### Asosiy xususiyatlar:
- ✅ Guruh jadvaliga qarab davomat kunlarini avtomatik hisoblash
- ✅ Talabaning har oylik davomati alohida saqlanadi
- ✅ Talaba faol emas (stopped) bo'lsa ham, oldingi oylar davomati saqlanib qoladi
- ✅ Har bir kun uchun 3 holat: `present` (keldi), `absent` (kelmadi), `null` (belgilanmagan)
- ✅ Davomat jadvali guruh darslar jadvalidan avtomatik hisoblanadi
- ✅ Oydan oyga o'tish imkoniyati
- ✅ Fan va o'qituvchi bo'yicha filterlar

---

## API Endpoints

### 1. Barcha guruhlarni olish (davomat uchun)

**GET** `/api/attendance/groups`

**Query Parameters:**
- `subject_id` (optional) - Fan ID bo'yicha filter
- `teacher_id` (optional) - O'qituvchi ID bo'yicha filter (faqat admin uchun)
- `month` (optional) - Oy (format: `YYYY-MM`, default: joriy oy)

**Permissions:**
- `admin` - Barcha guruhlar
- `teacher` - Faqat o'z guruhlari

**Response:**
```json
{
  "success": true,
  "message": "Davomat uchun guruhlar",
  "filters": {
    "subject_id": null,
    "teacher_id": null,
    "month": "2026-01"
  },
  "count": 5,
  "groups": [
    {
      "group_id": 1,
      "group_name": "Matematika - 10A",
      "subject_name": "Matematika",
      "subject_id": 1,
      "teacher_name": "Aziz Karimov",
      "teacher_id": 3,
      "schedule": {
        "dushanba": "10:00-12:00",
        "chorshanba": "14:00-16:00",
        "juma": "10:00-12:00"
      },
      "class_start_date": "2026-01-05",
      "active_students_count": 15,
      "stopped_students_count": 2
    }
  ]
}
```

---

### 2. Guruh davomati - talabalar va davomat jadvali

**GET** `/api/attendance/group/:group_id`

**Path Parameters:**
- `group_id` - Guruh ID (majburiy)

**Query Parameters:**
- `month` (optional) - Oy (format: `YYYY-MM`, default: joriy oy)

**Permissions:**
- `admin` - Istalgan guruh
- `teacher` - Faqat o'z guruhi

**Response:**
```json
{
  "success": true,
  "message": "Guruh davomat ma'lumotlari",
  "month": "2026-01",
  "group": {
    "id": 1,
    "group_name": "Matematika - 10A",
    "schedule": {
      "dushanba": "10:00-12:00",
      "chorshanba": "14:00-16:00",
      "juma": "10:00-12:00"
    },
    "class_start_date": "2026-01-05",
    "subject_name": "Matematika",
    "subject_id": 1,
    "teacher_name": "Aziz Karimov",
    "teacher_id": 3
  },
  "attendance_days": [
    {
      "date": "2026-01-06",
      "day_name": "dushanba",
      "time": "10:00-12:00"
    },
    {
      "date": "2026-01-08",
      "day_name": "chorshanba",
      "time": "14:00-16:00"
    },
    {
      "date": "2026-01-10",
      "day_name": "juma",
      "time": "10:00-12:00"
    }
  ],
  "students": [
    {
      "student_id": 5,
      "name": "Ali",
      "surname": "Valiyev",
      "phone": "+998901234567",
      "joined_at": "2026-01-01T00:00:00.000Z",
      "student_group_status": "active",
      "user_status": "active",
      "is_active": true,
      "attendance_id": 12,
      "daily_records": {
        "2026-01-06": 1,
        "2026-01-08": 1,
        "2026-01-10": 0
      },
      "total_classes": 3,
      "attended_classes": 2,
      "attendance_percentage": "66.67"
    },
    {
      "student_id": 8,
      "name": "Bekzod",
      "surname": "Toshmatov",
      "phone": "+998909876543",
      "joined_at": "2026-01-01T00:00:00.000Z",
      "student_group_status": "stopped",
      "user_status": "active",
      "is_active": false,
      "attendance_id": 15,
      "daily_records": {
        "2026-01-06": 1,
        "2026-01-08": 1,
        "2026-01-10": null
      },
      "total_classes": 2,
      "attended_classes": 2,
      "attendance_percentage": "100.00"
    }
  ]
}
```

**Tushuntirish:**
- `attendance_days` - Shu oy uchun guruh jadvaliga qarab hisoblangan davomat kunlari
- `is_active` - Talaba faol yoki yo'qligi (`student_group_status === 'active' && user_status === 'active'`)
- `daily_records` - Har bir kun uchun holat: `1` = keldi, `0` = kelmadi, `null` = belgilanmagan
- Faol emas talabalar ham ro'yxatda ko'rinadi, lekin `is_active: false` bilan

---

### 3. Talaba davomatini yangilash (bitta kun)

**PUT** `/api/attendance/student/:student_id/group/:group_id/update`

**Path Parameters:**
- `student_id` - Talaba ID
- `group_id` - Guruh ID

**Request Body:**
```json
{
  "month": "2026-01",
  "date": "2026-01-15",
  "status": "present"
}
```

**Body Parameters:**
- `month` (required) - Oy (format: `YYYY-MM`)
- `date` (required) - Kun (format: `YYYY-MM-DD`)
- `status` (required) - Holat: `"present"` (keldi), `"absent"` (kelmadi), `null` (belgilanmagan)

**Permissions:**
- `admin` - Istalgan talaba
- `teacher` - Faqat o'z guruhidagi talabalar

**Response:**
```json
{
  "success": true,
  "message": "Davomat yangilandi",
  "attendance": {
    "id": 12,
    "student_id": 5,
    "group_id": 1,
    "month_name": "2026-01",
    "daily_records": {
      "2026-01-06": 1,
      "2026-01-08": 1,
      "2026-01-10": 0,
      "2026-01-15": 1
    },
    "total_classes": 4,
    "attended_classes": 3,
    "attendance_percentage": "75.00",
    "updated_at": "2026-01-20T10:30:00.000Z"
  }
}
```

---

### 4. Bir necha talabani bir vaqtda yangilash

**PUT** `/api/attendance/group/:group_id/update-multiple`

**Path Parameters:**
- `group_id` - Guruh ID

**Request Body:**
```json
{
  "month": "2026-01",
  "updates": [
    {
      "student_id": 5,
      "date": "2026-01-15",
      "status": "present"
    },
    {
      "student_id": 6,
      "date": "2026-01-15",
      "status": "absent"
    },
    {
      "student_id": 7,
      "date": "2026-01-15",
      "status": "present"
    }
  ]
}
```

**Body Parameters:**
- `month` (required) - Oy
- `updates` (required) - Yangilashlar array'i

**Permissions:**
- `admin` - Istalgan guruh
- `teacher` - Faqat o'z guruhi

**Response:**
```json
{
  "success": true,
  "message": "3 ta davomat yangilandi",
  "updated_count": 3,
  "results": [
    { "student_id": 5, "date": "2026-01-15", "updated": true },
    { "student_id": 6, "date": "2026-01-15", "updated": true },
    { "student_id": 7, "date": "2026-01-15", "updated": true }
  ]
}
```

---

### 5. Talabaning davomat tarixi

**GET** `/api/attendance/student/:student_id/group/:group_id/history`

**Path Parameters:**
- `student_id` - Talaba ID
- `group_id` - Guruh ID

**Permissions:**
- `admin` - Istalgan talaba
- `teacher` - Faqat o'z guruhidagi talabalar

**Response:**
```json
{
  "success": true,
  "message": "Talaba davomat tarixi",
  "student": {
    "id": 5,
    "name": "Ali",
    "surname": "Valiyev",
    "joined_at": "2026-01-01T00:00:00.000Z",
    "status": "active"
  },
  "history": [
    {
      "month_name": "2026-01",
      "daily_records": {
        "2026-01-06": 1,
        "2026-01-08": 1,
        "2026-01-10": 0
      },
      "total_classes": 3,
      "attended_classes": 2,
      "attendance_percentage": "66.67",
      "student_group_status": "active",
      "updated_at": "2026-01-20T10:30:00.000Z"
    },
    {
      "month_name": "2025-12",
      "daily_records": {
        "2025-12-02": 1,
        "2025-12-04": 1,
        "2025-12-09": 1
      },
      "total_classes": 3,
      "attended_classes": 3,
      "attendance_percentage": "100.00",
      "student_group_status": "active",
      "updated_at": "2025-12-30T10:30:00.000Z"
    }
  ]
}
```

---

## Frontend uchun maslahatlar

### 1. Guruhlar ro'yxati sahifasi
```javascript
// Barcha guruhlarni olish
const response = await fetch('/api/attendance/groups?month=2026-01', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await response.json();
```

### 2. Guruh davomat sahifasi
```javascript
// Guruh va talabalar ma'lumotlarini olish
const response = await fetch('/api/attendance/group/1?month=2026-01', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { group, attendance_days, students } = await response.json();

// attendance_days dan jadval ustunlarini yaratish
// students dan qatorlar yaratish
// is_active === false bo'lsa qator sariq rangda
```

### 3. Davomat belgilash
```javascript
// Checkbox yoki select o'zgarganda
const updateAttendance = async (studentId, groupId, date, status) => {
  await fetch(`/api/attendance/student/${studentId}/group/${groupId}/update`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      month: '2026-01',
      date: date, // '2026-01-15'
      status: status // 'present' | 'absent' | null
    })
  });
};

// Yoki ko'plab checkbox'larni bir vaqtda saqlash
const saveAllAttendance = async (updates) => {
  await fetch(`/api/attendance/group/${groupId}/update-multiple`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      month: '2026-01',
      updates: [
        { student_id: 5, date: '2026-01-15', status: 'present' },
        { student_id: 6, date: '2026-01-15', status: 'absent' }
      ]
    })
  });
};
```

### 4. Oydan oyga o'tish
```javascript
const [currentMonth, setCurrentMonth] = useState('2026-01');

const goToPreviousMonth = () => {
  const [year, month] = currentMonth.split('-').map(Number);
  const newDate = new Date(year, month - 2, 1); // -2 chunki month 0-indexed
  setCurrentMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
};

const goToNextMonth = () => {
  const [year, month] = currentMonth.split('-').map(Number);
  const newDate = new Date(year, month, 1);
  setCurrentMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
};
```

---

## Migratsiya

Agar eski bazada ma'lumotlar bo'lsa, migration scriptini ishga tushiring:

```bash
node scripts/migrate_attendance_table.js
```

Bu script:
- `daily_records` ustunini JSON dan JSONB ga o'zgartiradi
- UNIQUE constraint'ni yangilaydi
- Eski array formatdagi ma'lumotlarni yangi object formatiga o'zgartiradi

---

## Muhim eslatmalar

1. **Faol emas talabalar:**
   - Talaba `stopped` yoki `inactive` bo'lsa ham davomat jadvali chiqadi
   - `is_active` field orqali aniqlanadi va frontend'da sariq qator ko'rsatiladi
   - Oldingi oylar davomati saqlanib qoladi

2. **Davomat kunlari:**
   - Avtomatik guruh jadvaliga qarab hisoblanadi
   - Faqat `class_start_date` dan keyingi kunlar ko'rsatiladi
   - Agar guruh hali darslar boshlamagan bo'lsa, bo'sh array qaytadi

3. **Davomat statuslari:**
   - `1` - Keldi (present)
   - `0` - Kelmadi (absent)
   - `null` - Belgilanmagan (not marked yet)

4. **Performance:**
   - `update-multiple` endpoint'dan foydalanish tavsiya etiladi
   - Har bir checkbox o'zgarishi uchun alohida request yuborish shart emas
