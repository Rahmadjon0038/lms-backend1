# Teacher Attendance Frontend Guide

## Maqsad
Teacher login bo'lganda attendance oqimi adminnikiga o'xshash ishlaydi:
1. Teacher faqat o'z guruhlarini ko'radi.
2. Guruh tanlanganda tanlangan oy uchun darslar (max 12 ta) avtomatik chiqadi.
3. Har bir dars ichida studentlar ko'rinadi.
4. Teacher `keldi/kelmadi/kechikdi` belgilab submit qiladi.

---

## Auth
- Barcha endpointlar `Bearer <accessToken>` bilan chaqiriladi.
- Teacher role bo'lmasa `403` qaytadi.

---

## 1) Teacherning o'z guruhlari
### Endpoint
`GET /api/attendance/my-groups`

### Eslatma
- Bu endpoint teacher uchun maxsus alias.
- Xuddi shu natijani `GET /api/attendance/groups` ham beradi (teacher bo'lsa avtomatik o'z guruhlari qaytadi).

### Query (ixtiyoriy)
- `status_filter=active|blocked|all` (default `all`)
- `subject_id=<id>`
- `date=YYYY-MM-DD` (kun bo'yicha schedule filter)
- `day=dushanba|seshanba|...` yoki `monday|tuesday|...`
- `shift=kunduzgi|kechki` yoki `morning|evening`

### Frontend action
- Teacher profilidagi attendance sahifasi ochilganda shu endpointni chaqiring.
- Kun filter bo'lsa `date` yoki `day` dan bittasini yuboring (`date` ustuvor).
- Shift filter bo'lsa `shift=kunduzgi|kechki` yuboring.
- Card/list da kamida: `name`, `subject_name`, `room_number`, `students_count`.

---

## 2) Tanlangan guruh bo'yicha oylik darslar (auto 12)
### Endpoint
`GET /api/attendance/groups/:group_id/lessons?month=YYYY-MM`

### Muhim
- `month` yuborilmasa joriy oy olinadi.
- Endpoint chaqirilganda schedule asosida o'sha oy uchun darslar avtomatik generate bo'ladi.
- Oylik limit: `12`.

### Frontend action
- `selectedGroupId` va `selectedMonth` ni statega saqlang.
- Guruh yoki oy o'zgarganda endpointni qayta chaqiring.
- UI da ko'rsating:
  - `formatted_date`, `start_time`, `end_time`
  - `lesson_status`
  - `present_count`, `absent_count`, `late_count`
  - `active_students_count`, `marked_students_count`
  - `attendance_state`, `attendance_completed`

---

## 3) Dars ichidagi studentlar
### Endpoint
`GET /api/attendance/lessons/:lesson_id/students`

### Frontend action
- Dars tanlanganda shu endpointni chaqiring.
- Jadvalda:
  - `student_name` (yoki `name` + `surname`)
  - `monthly_status`
  - `status`
  - `can_mark`

---

## 4) Davomatni belgilash
### Endpoint
`PUT /api/attendance/lessons/:lesson_id/mark`

### Body
```json
{
  "attendance_records": [
    { "attendance_id": 101, "status": "keldi" },
    { "attendance_id": 102, "status": "kelmadi" },
    { "attendance_id": 103, "status": "kechikdi" }
  ]
}
```

### Qoidalar
- `status` faqat: `keldi | kelmadi | kechikdi`.
- Submitdan keyin:
  1. `GET /lessons/:lesson_id/students` ni refresh qiling.
  2. `GET /groups/:group_id/lessons?month=...` ni refresh qiling (count va holatlar yangilanadi).

---

## 5) Teacher dashboard uchun alternativ endpoint
### Endpoint
`GET /api/attendance/my-lessons?date=YYYY-MM-DD` yoki `?month=YYYY-MM`

### Qachon ishlatish
- Agar sahifada guruh tanlamasdan turib "bugungi darslarim" yoki "shu oydagi darslarim" ko'rsatmoqchi bo'lsangiz.

---

## Tavsiya etilgan frontend state
- `selectedGroupId`
- `selectedLessonId`
- `selectedMonth`
- `groups`
- `lessons`
- `students`
- `attendanceDraft` (`{ [attendance_id]: 'keldi' | 'kelmadi' | 'kechikdi' }`)
- `loading`
- `error`

---

## Minimal UX
- Har bir API uchun loading holati bo'lsin.
- `PUT mark` vaqtida submit tugmasini disable qiling.
- Backenddan qaytgan `message` ni toast/alert ko'rsating.
- `can_mark=false` bo'lgan studentlarni readonly holatda ko'rsating.
