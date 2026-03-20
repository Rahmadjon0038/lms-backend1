# Pagination va Search o'zgarishlari (Snapshots / To'lov jadvali)

## Backend o'zgarishlari

Endpoint: `GET /api/snapshots`

Yangi query parametrlari:
- `search`: string. Qidiruv quyidagilar bo'yicha ishlaydi: talaba ism/familiya, telefon, ota-ona ism/telefon. Qo'shimcha ravishda, `users` jadvalidagi (current) ism/familiya/telefon ham fallback sifatida qidiriladi.
- `page`: integer. Default `1`.
- `limit`: integer. Default `20`, max `100`.

Response ichida yangi `pagination` obyekt qaytadi:
- `page`: current page
- `limit`: page size
- `total`: umumiy yozuvlar soni
- `total_pages`: jami sahifalar soni

## Frontend uchun ko'rsatma

1. Ro'yhat olishda pagination ishlating:
- Birinchi yuklash: `page=1&limit=20` (yoki sizga mos limit)
- Keyingi sahifa: `page=2`, `page=3`, ...

2. Search ishlatish:
- Search input o'zgarganda `search=<matn>` yuboring.
- Search paytida `page` ni doim `1` ga qaytaring.

3. UI paginationni `pagination` obyektidan boshqaring:
- `pagination.total` va `pagination.total_pages` bilan sahifalash tugmalarini hisoblang.
- Agar `students` bo'sh bo'lsa va `page > 1`, `page` ni pasaytirib qayta so'rov yuboring.

## Namuna

`/api/snapshots?month=2026-03&page=1&limit=20&search=Ali`

## Eslatma

`month` parametri majburiy va format `YYYY-MM` bo'lishi shart.
