# Students /all uchun Pagination va Search

## Backend
Endpoint: `GET /api/students/all`

Yangi query parametrlari:
- `search`: string. Qidiruv: ism, familiya, telefon(lar), username, ota-ona ism/telefon.
- `page`: integer. Default `1`.
- `limit`: integer. Default `20`, max `100`.

Response qo'shimchasi:
- `pagination`: `{ page, limit, total, total_pages }`

## Frontend uchun ko'rsatma

1. Ro'yhat olish:
- Dastlab: `page=1&limit=20`
- Keyingi sahifa: `page=2`, `page=3` ...

2. Search:
- Search input o'zgarganda `search=<matn>` yuboring.
- Search boshlanganida `page` ni `1` ga qaytaring.

3. Pagination UI:
- `pagination.total` va `pagination.total_pages` dan foydalaning.

## Namuna

`/api/students/all?page=1&limit=20&search=Ali`

## Eslatma

Filterlar (`teacher_id`, `group_id`, `subject_id`, `status`, `group_status`, `unassigned`) bilan birga ishlaydi.
