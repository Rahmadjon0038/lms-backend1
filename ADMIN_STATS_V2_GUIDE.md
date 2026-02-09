# Admin Stats V2 Qo'llanma

Yangi dashboard formati uchun ishlatiladigan endpointlar:

1. `GET /api/dashboard/stats/daily`
2. `GET /api/dashboard/stats/monthly`
3. `GET /api/dashboard/stats/overview`

## Daily widgetlar
`data.summary` dan oling:
- `payments_count`
- `new_students_count`
- `expenses_count`
- `expenses_amount`

## Monthly widgetlar
`data.current_month` dan oling:
- `payments_count`
- `new_students_count`
- `expenses_count`
- `expenses_amount`
- `debtors_count`
- `debt_amount`

## Monthly To'lov status chart
`data.payment_status_distribution`:
- `items[].label`
- `items[].count`
- `items[].percentage`

Pie/Doughnut uchun:
- labels: `data.payment_status_distribution.chart.labels`
- values: `data.payment_status_distribution.chart.series.count`

## Overview widgetlar
`data.overall`:
- `active_teachers_count`
- `active_groups_count`
- `subjects_count`

Qabul trendi chart:
- labels: `data.charts.admissions_monthly_last_12.labels`
- values: `data.charts.admissions_monthly_last_12.series.admissions_count`
