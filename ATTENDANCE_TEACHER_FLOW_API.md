# Attendance Teacher -> Group -> Lesson Flow

## Yangilanishlar (2026-02-27)

### Qo'shilgan endpoint (Teacher)
- `GET /api/attendance/my-groups`
- `GET /api/attendance/my-lessons?date=YYYY-MM-DD`
- `GET /api/attendance/my-lessons?month=YYYY-MM`

### Access
- `teacher`

### Nima qaytaradi
- `my-groups`: teacherning o'ziga biriktirilgan guruhlari
  - Query filterlar: `date`, `day`, `shift`, `status_filter`, `subject_id`
- Teacherning o'ziga tegishli darslari (`lessons`)
- `date` yoki `month` bo'yicha filter
- `auto_generated` ma'lumoti (oy bo'yicha auto lesson generate natijasi)

### 404 sababi va fix
- Sabab: `getMyLessons` controller mavjud bo'lgan, lekin routega ulanmagan edi.
- Fix:
  - `routes/attendanceRoutes.js` ga route qo'shildi:
    - `router.get('/my-lessons', protect, roleCheck(['teacher']), getMyLessons);`
  - `controllers/attendanceController.js` `module.exports` ga `getMyLessons` qo'shildi.

## Maqsad
Frontend attendance bo'limida quyidagi oqimni ishlatadi:
1. Teacherlar ro'yxati
2. Teacher ichida guruhlar
3. Guruh ichida shu oy darslari (auto 12 ta)
4. Dars ichida studentlar va davomat
5. Student monthly status boshqaruvi


---

## 0) Teacherning o'z guruhlari (my-groups)
### Endpoint
`GET /api/attendance/my-groups`

### Access
- `teacher`

### Query (ixtiyoriy)
- `date=YYYY-MM-DD`
- `day=dushanba|seshanba|...` yoki `monday|tuesday|...`
- `shift=kunduzgi|kechki` yoki `morning|evening`
- `status_filter=active|blocked|all`
- `subject_id=<id>`

### UI da ko'rsatish
- `name`
- `subject_name`
- `room_number`
- `students_count`
- `today_lessons_count`
- `today_marked_students_count`
- `today_active_students_count`
- `today_attendance_completed` (bugun kamida 1 lesson to'liq belgilangan bo'lsa `true`)
- `today_attendance_fully_completed` (bugungi barcha lessonlar to'liq belgilangan bo'lsa `true`)

### Response (qisqa)
```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "name": "Frontend N12",
      "subject_name": "Frontend",
      "room_number": "203",
      "students_count": "14",
      "today_date": "2026-03-19",
      "today_lessons_count": 1,
      "today_active_students_count": 14,
      "today_marked_students_count": 14,
      "today_attendance_completed": true,
      "today_attendance_fully_completed": true
    }
  ],
  "filters": {
    "date": null,
    "day": null,
    "shift": null
  }
}
```

Eslatma:
- `date` yuborilmasa `today_*` maydonlar bugungi sanaga (`YYYY-MM-DD`) qarab hisoblanadi.
- `students_count` string bo'lishi mumkin -> `Number(item.students_count)`.

## 1) Teacherlar ro'yxati
### Endpoint
`GET /api/attendance/teachers`

### Access
- `admin`
- `super_admin`

### Query (ixtiyoriy)
- `date=YYYY-MM-DD` (kunlik progress uchun sana, default: bugun)
- `shift=kunduzgi|kechki` yoki `morning|evening` (ixtiyoriy)

### UI da ko'rsatish
- `full_name`
- `subjects`
- `room_numbers`
- `groups_count`
- `today_groups_count` (bugungi dars bor guruhlar soni)
- `today_marked_groups_count` (bugun davomat to'liq belgilangan guruhlar soni)

### Response (qisqa)
```json
{
  "success": true,
  "data": [
    {
      "teacher_id": 12,
      "full_name": "Ali Valiyev",
      "subjects": ["Matematika", "Fizika"],
      "room_numbers": ["101", "203"],
      "groups_count": "4",
      "today_date": "2026-03-19",
      "today_shift": null,
      "today_groups_count": 5,
      "today_marked_groups_count": 1
    }
  ],
  "meta": {
    "date": "2026-03-19",
    "shift": null
  }
}
```

Eslatma:
- `groups_count` string bo'lishi mumkin -> `Number(item.groups_count)`.
- `today_groups_count` teacher schedule bo'yicha hisoblanadi (tanlangan `date` va `shift` ga qarab).
- `today_marked_groups_count` lesson + attendance yozuvlariga qarab hisoblanadi.

---

## 2) Teacher ichida guruhlar ro'yxati
### Endpoint
`GET /api/attendance/teachers/:teacher_id/groups`

### Access
- `admin`j
- `super_admin`

### Query filterlar (ixtiyoriy)
- `date=YYYY-MM-DD`
- `day=dushanba|seshanba|...` yoki `monday|tuesday|...`
- `shift=kunduzgi|kechki` yoki `morning|evening`

### UI da ko'rsatish
- `group_name`
- `subject_name`
- `room_number`
- `students_count`
- `schedule.days`
- `schedule.time`
- `today_lessons_count` (bugun nechta lesson bor)
- `today_marked_students_count` / `today_active_students_count` (progress ko'rsatish uchun)
- `today_attendance_completed` (bugun kamida 1 lesson to'liq belgilangan)
- `today_attendance_fully_completed` (bugungi barcha lessonlar to'liq belgilangan)

### Response (qisqa)
```json
{
  "success": true,
  "data": {
    "teacher": {
      "teacher_id": 12,
      "full_name": "Ali Valiyev"
    },
    "filters": {
      "date": "2026-02-27",
      "day": null,
      "shift": "morning"
    },
    "groups": [
      {
        "group_id": 5,
        "group_name": "Frontend N12",
        "subject_name": "Frontend",
        "room_number": "203",
        "students_count": "14",
        "schedule": { "days": ["Dushanba", "Chorshanba"], "time": "10:00-12:00" },
        "today_date": "2026-03-19",
        "today_lessons_count": 1,
        "today_active_students_count": 14,
        "today_marked_students_count": 14,
        "today_attendance_completed": true,
        "today_attendance_fully_completed": true
      }
    ]
  }
}
```

Eslatma:
- `date` yuborilmasa ham `today_*` maydonlar bugungi sanaga (`YYYY-MM-DD`) qarab hisoblanadi.

---

## 3) Guruh tanlanganda oy darslari (auto 12 ta)
### Endpoint
`GET /api/attendance/groups/:group_id/lessons?month=YYYY-MM`

### Access
- `admin`
- `super_admin`
- `teacher` (faqat o'z guruhida)

### Muhim
- `month` yuborilmasa, joriy oy olinadi.
- `month` yuborilsa faqat `YYYY-MM` format qabul qilinadi.
- Endpoint ochilganda schedule asosida darslar avtomatik yaratiladi.
- Oylik limit: maksimum `12`.

### UI da ko'rsatish
- `formatted_date`
- `start_time`, `end_time`
- `lesson_status`
- `present_count`, `absent_count`, `late_count`
- `active_students_count`
- `marked_students_count`
- `attendance_state` (`not_marked|partial|marked|completed`)
- `attendance_completed`

Frontend rang berish uchun:
- `attendance_state=completed` -> "davomat to'liq yakunlangan" (yashil)
- `attendance_state=marked` -> "to'liq belgilangan, lekin close qilinmagan" (ko'k)
- `attendance_state=partial` -> "qisman belgilangan" (sariq)
- `attendance_state=not_marked` -> "hali qilinmagan" (kulrang)

`attendance_completed=true` bo'ladi, agar:
- barcha `active` studentlar belgilangan bo'lsa

---

## 4) Dars ichida studentlar va davomat
### Talabalarni olish
`GET /api/attendance/lessons/:lesson_id/students`

Response student fieldlar:
- `attendance_id`
- `student_id`
- `name`
- `surname`
- `student_name`
- `monthly_status`
- `status` (`is_marked=false` bo'lsa `null`)
- `can_mark`

### Davomat belgilash
`PUT /api/attendance/lessons/:lesson_id/mark`

Body:
```json
{
  "attendance_records": [
    { "attendance_id": 101, "status": "keldi" },
    { "attendance_id": 102, "status": "kelmadi" }
  ]
}
```

Statuslar:
- `keldi`
- `kelmadi`
- `kechikdi`

---

## 5) Student monthly status
### Endpoint
`PUT /api/attendance/student/monthly-status`

### Access
- `admin`
- `super_admin`

### Mode
- `month`
- `months`
- `from_month`

Misol:
```json
{
  "student_id": 25,
  "group_id": 5,
  "month": "2026-02",
  "monthly_status": "stopped"
}
```

`monthly_status`:
- `active`
- `stopped`
- `finished`

---

## Frontendchi uchun aniq vazifalar
0. Teacher dashboard (faqat teacher login):
- `GET /my-lessons?date=YYYY-MM-DD` yoki `GET /my-lessons?month=YYYY-MM` ishlatish.
- Guruhlar uchun `GET /my-groups` ishlatish.
- Adminnikiga o'xshash filterlar yuborish mumkin:
  - `date=YYYY-MM-DD`
  - `day=dushanba|seshanba|...` yoki `monday|tuesday|...`
  - `shift=kunduzgi|kechki` yoki `morning|evening`

1. Attendance root sahifa:
- `GET /teachers` bilan teacher list chiqarish.
- Teacher card click bo'lsa `selectedTeacherId` saqlash.

2. Teacher detail sahifa:
- `GET /teachers/:teacher_id/groups` chaqirish.
- Filter UI: `date`, `day`, `shift`.
- Filter o'zgarsa requestni qayta yuborish.

3. Group tanlanganda:
- `selectedGroupId` saqlash.
- `GET /groups/:group_id/lessons?month=YYYY-MM` chaqirish.
- Month picker qo'shish (`YYYY-MM`), default joriy oy.
- Darslar listini chiqarish.

4. Lesson tanlanganda:
- `selectedLessonId` saqlash.
- `GET /lessons/:lesson_id/students` chaqirish.
- Jadvalda `name/surname/monthly_status/status` ko'rsatish.

5. Davomat submit:
- student statuslarini yig'ib `PUT /lessons/:lesson_id/mark` yuborish.
- muvaffaqiyatdan keyin student listni qayta fetch qilish.

6. Monthly status o'zgartirish:
- admin/super_admin uchun action qo'shish.
- `PUT /student/monthly-status` chaqirish.
- muvaffaqiyatdan keyin student listni yangilash.

---

## Tavsiya etiladigan frontend state
- `selectedTeacherId`
- `selectedGroupId`
- `selectedLessonId`
- `selectedMonth`
- `filters: { date, day, shift }`
- `teachers`, `groups`, `lessons`, `students`
- `loading`, `error`

---

## Minimal UX qoidalar
- Har API uchun loading ko'rsating.
- Xatolikda backend `message` ni toast/alert qiling.
- Davomat tugmasi submit payti disable bo'lsin.
- `monthly_status != active` studentlar uchun status input readonly bo'lsin.
