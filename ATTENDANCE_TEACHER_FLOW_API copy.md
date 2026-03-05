# Attendance API (Teacher-First Flow)

Bu hujjat frontend uchun davomatning yangi oqimini tushuntiradi.

- Eski entrypoint: `groups`
- Yangi entrypoint: `teachers`
- Eski group endpointlar o'chirilmagan, lekin yangi UI `teachers` endpointlar bilan ishlashi kerak.

## Base va Auth

- Base URL (local): `http://localhost:5001`
- Base URL (prod): `https://api.taraqqiyot-teaching-center.uz`
- Prefix: `/api/attendance`
- Header: `Authorization: Bearer <token>`
- Role access: `admin` va `teacher`

Agar token bo'lmasa: `401 Unauthorized`.

Muhim: frontend qaysi backendga ulangan bo'lsa (`5001` yoki `production`), barcha attendance endpointlar o'sha hostga yuborilishi shart.

## Yangi oqim

1. `GET /api/attendance/teachers` orqali teacherlar ro'yxati
2. Teacher bosilganda `GET /api/attendance/teachers/:teacher_id/students`
3. Full monthly grid/statistika kerak bo'lsa `GET /api/attendance/teachers/:teacher_id/monthly`

## 1) Teacherlar ro'yxati

`GET /api/attendance/teachers`

### Query params

- `subject_id` (optional, integer)
- `status_filter` (optional): `active | blocked | all` (default: `all`)

### Success response (200)

```json
{
  "success": true,
  "data": {
    "total": 2,
    "teachers": [
      {
        "teacher_id": 7,
        "teacher_name": "Olim",
        "teacher_surname": "Rahimov",
        "teacher_full_name": "Olim Rahimov",
        "subjects": ["IELTS", "General English"],
        "groups_count": 3,
        "students_count": 42
      }
    ]
  }
}
```

### Notes

- `teacher` roli bo'lsa, faqat o'zi qaytadi.
- `admin` bo'lsa, filter bo'yicha barcha teacherlar qaytadi.

## 2) Teacher ichidagi studentlar (asosiy list)

`GET /api/attendance/teachers/:teacher_id/students`

### Query params

- `month` (optional): `YYYY-MM`, default: joriy oy
- `group_id` (optional, integer)
- `monthly_status` (optional): `active | stopped | finished`
- `search` (optional): student ism/familiya yoki group nomi
- `page` (optional): default `1`
- `limit` (optional): default `20`, max `200`

### Success response (200)

```json
{
  "success": true,
  "data": {
    "month": "2026-02",
    "teacher_id": 7,
    "filters": {
      "group_id": null,
      "monthly_status": null,
      "search": null,
      "page": 1,
      "limit": 20
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "total_pages": 3,
      "has_more": true,
      "next_page": 2
    },
    "total": 42,
    "students": [
      {
        "student_id": 12,
        "student_name": "Ali",
        "student_surname": "Karimov",
        "group_id": 5,
        "group_name": "IELTS Beginner",
        "subject_name": "IELTS",
        "student_group_status": "active",
        "monthly_status": "active",
        "total_lessons": 10,
        "marked_lessons": 10,
        "present_count": 8,
        "absent_count": 1,
        "late_count": 1,
        "attendance_percentage": 90
      }
    ]
  }
}
```

### Infinite scroll

1. Dastlab `page=1&limit=20`
2. `pagination.has_more=true` bo'lsa `next_page`ni yuboring
3. `has_more=false` bo'lsa loading to'xtasin

## 3) Teacher bo'yicha monthly attendance

`GET /api/attendance/teachers/:teacher_id/monthly`

### Query params

- `month` (optional): `YYYY-MM`
- `group_id` (optional): bitta guruhga cheklash

### Success response (200)

```json
{
  "success": true,
  "data": {
    "month": "2026-02",
    "teacher": {
      "teacher_id": 7,
      "teacher_name": "Olim",
      "teacher_surname": "Rahimov",
      "teacher_full_name": "Olim Rahimov"
    },
    "group_filter": null,
    "lessons": [
      {
        "lesson_id": 91,
        "group_id": 5,
        "group_name": "IELTS Beginner",
        "date": "2026-02-03",
        "day": "03"
      }
    ],
    "students": [
      {
        "student_id": 12,
        "student_name": "Ali Karimov",
        "group_id": 5,
        "group_name": "IELTS Beginner",
        "monthly_status": "active",
        "statistics": {
          "marked_lessons": 10,
          "present_count": 8,
          "absent_count": 1,
          "late_count": 1,
          "attendance_percentage": 90
        },
        "attendance_records": [
          {
            "lesson_id": 91,
            "group_id": 5,
            "group_name": "IELTS Beginner",
            "date": "2026-02-03",
            "status": "keldi",
            "is_marked": true
          }
        ]
      }
    ]
  }
}
```

## Xatoliklar (umumiy)

- `400`: noto'g'ri query/path qiymat (masalan month format xato)
- `401`: token yo'q/yaroqsiz
- `403`: teacher boshqa teacher ID sini so'ragan
- `404`: teacher topilmagan
- `500`: server xatosi

## Frontend uchun tavsiya

1. Chap panelda teacher list: `GET /api/attendance/teachers`
2. Teacher tanlanganda o'ng panel list: `GET /api/attendance/teachers/:teacher_id/students`
3. Filterlar (`month`, `group_id`, `monthly_status`, `search`) o'zgarsa shu endpointni qayta chaqiring
4. Pastga scroll bo'lsa `pagination.next_page` bilan append qiling
5. Batafsil oylik jadval kerak bo'lsa `GET /api/attendance/teachers/:teacher_id/monthly`

## Eski endpointlar

Ishlashda davom etadi:

- `GET /api/attendance/groups`
- `GET /api/attendance/groups/:group_id/lessons`
- `GET /api/attendance/groups/:group_id/monthly`

Lekin yangi attendance sahifasi uchun ulardan foydalanmang.
