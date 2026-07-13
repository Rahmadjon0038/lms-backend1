# Student ball tarixi — Frontend qo'llanma

Ball tizimi **studentga** bog'langan (`student_point_events.student_id`), guruhga emas.
Shuning uchun student guruhdan guruhga o'tsa, teacher almashsa yoki guruh o'chirilsa ham
ballari va tarixi **yo'qolmaydi**. Har bir eventda guruh nomi, teacher nomi va ball
qo'ygan odam ismi snapshot sifatida `metadata`da ham saqlanadi.

## 1. Student o'z tarixini ko'rishi (mavjud endpoint, kengaytirildi)

```
GET /api/students/my-point-reports
GET /api/students/my-point-reports?month=2026-07        // bitta oy (default: joriy oy)
GET /api/students/my-point-reports?month=all            // BUTUN o'qish davri
GET /api/students/my-point-reports?month=all&group_id=5 // guruh bo'yicha filtr
```

Eski javob shakli saqlangan, qo'shimcha maydonlar:

```jsonc
{
  "data": {
    "month": "all",                      // yoki "2026-07"
    "summary": {
      "total_points": 340,
      "total_events": 120,
      "attendance_events": 100,
      "manual_events": 20,
      "first_event_date": "2025-09-02",  // YANGI
      "last_event_date": "2026-07-10"    // YANGI
    },
    "breakdown": [...],                  // guruhlar kesimida (o'chirilgan guruh nomi ham chiqadi)
    "monthly_breakdown": [               // YANGI — oyma-oy jami
      { "month_name": "2026-07", "total_points": 42, "total_events": 14 }
    ],
    "teacher_breakdown": [               // YANGI — qaysi teacher qaysi oyda qancha ball qo'ygan
      { "month_name": "2026-07", "teacher_id": 8, "teacher_name": "Ali Valiyev", "total_points": 30, "total_events": 10 }
    ],
    "daily_breakdown": [...],
    "events": [
      {
        "id": 1, "group_id": 5, "group_name": "Frontend N1",
        "points": 3, "source_type": "attendance",
        "created_by": 8, "created_by_name": "Ali Valiyev",  // YANGI — kim qo'ygan
        "month_name": "2026-07", "created_at": "2026-07-10 14:05", ...
      }
    ]
  }
}
```

## 2. Admin/teacher studentning to'liq tarixini ko'rishi (YANGI endpoint)

```
GET /api/students/:id/point-history                   // default: butun o'qish davri (month=all)
GET /api/students/:id/point-history?month=2026-07     // bitta oy
GET /api/students/:id/point-history?group_id=5        // guruh filtri
```

- Role: `admin`, `super_admin` — istalgan student; `teacher` — faqat o'z guruhidagi student
  (lekin tarix to'liq qaytadi, boshqa guruh/teacherlardagi ballari bilan birga).
- Javob shakli 1-punkt bilan bir xil, qo'shimcha `data.student = { id, name, surname }`.

## 3. Oylik ball limiti (100)

Student bir oyda (bitta guruh bo'yicha) ko'pi bilan **100 ball** to'playdi
(`config/points.js` → `MONTHLY_POINT_CAP`). Yangi oy boshlanganda hisob 0 dan
boshlanadi; eski oylar tarixda saqlanadi va umumiy (`month=all`) yig'indiga
qo'shilib boraveradi.

- `summary.monthly_cap` — reportlarda limit qiymati qaytadi (UI da "72/100" ko'rsatish uchun).
- `POST /api/students/point-events` limitdan oshiq qo'shishga urinsa **400** qaytaradi:

```jsonc
{
  "success": false,
  "message": "Oylik ball limiti 100 ta. 2026-07 oyida to'plangan: 97, yana qo'shish mumkin: 3",
  "data": { "monthly_cap": 100, "month_name": "2026-07", "month_total": 97, "remaining": 3 }
}
```

- Davomat ballari (+3/+2) limitga yetganda qolgan budjet doirasida qirqib beriladi
  (masalan, 99 ball bo'lsa "keldi" uchun +1 beriladi); event `metadata.capped = true`
  va `metadata.base_points` bilan yoziladi.
- Ball ayirish (manfiy) har doim mumkin — limit faqat qo'shishga tegishli.

## 4. Muhim kafolatlar

- Guruhdan o'tkazish / guruhdan chiqarish ball eventlariga tegmaydi.
- Guruh o'chirilsa: `group_id` NULL bo'ladi, lekin `group_name` metadata snapshotidan chiqadi.
- Teacher (user) o'chirilsa: `created_by` NULL bo'ladi, `created_by_name` snapshotdan chiqadi.
- Faqat davomat qayta belgilanganda o'sha darsning eski attendance-ball eventi almashtiriladi
  (dublikat bo'lmasligi uchun) — boshqa hech qayerda eventlar o'chirilmaydi.
