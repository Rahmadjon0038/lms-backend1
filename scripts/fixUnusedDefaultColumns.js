// Eski mobil ilova (ustun sozlamasi saqlanmagan versiyasi) ba'zi hisobotlarga
// teacher hech qachon ishlatmagan standart ustunlarni (Uy vazifasi / So'z
// boyligi / Faollik) yoqilgan holda qo'shib yuborgan: barcha o'quvchida 0 ball,
// lekin ularning maksimal bali jami maksimalga qo'shilgani uchun FOIZ va baho
// (PERFECT/GOOD/BAD) past ko'rinardi.
//
// Skript shunday ustunlarni (HAMMA o'quvchida 0) hisobotda "yashirin" qiladi va
// foiz/bahoni qayta hisoblaydi. Jami ball (total) o'zgarmaydi — shuning uchun
// reyting va ball tarixi ham o'zgarmaydi.
//
// Ishlatish (konteyner ichida):
//   node scripts/fixUnusedDefaultColumns.js            # faqat ro'yxat (hech narsa o'zgarmaydi)
//   node scripts/fixUnusedDefaultColumns.js --apply    # qo'llash (avval zaxira JSON yoziladi)
//   --teacher=ID  — faqat bitta teacher hisobotlari
require('dotenv').config();
const fs = require('fs');
const pool = require('../config/db');
const {
  normalizeColumns,
  normalizeRows,
  buildRowsWithTotals,
  normalizeFeedback,
} = require('../controllers/teacherStatisticsController');

const APPLY = process.argv.includes('--apply');
const teacherArg = process.argv.find((arg) => arg.startsWith('--teacher='));
const TEACHER_ID = teacherArg ? Number.parseInt(teacherArg.split('=')[1], 10) : null;
const CANDIDATE_KEYS = new Set(['homework', 'vocabulary', 'participation']);

const average = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

(async () => {
  const result = await pool.query(
    `SELECT r.id, r.teacher_id, r.group_id, r.lesson_date, r.report_data, r.percent, r.feedback, r.total,
            g.name AS group_name, COALESCE(u.surname || ' ' || u.name, '') AS teacher_name
     FROM teacher_lesson_statistics_reports r
     LEFT JOIN groups g ON g.id = r.group_id
     LEFT JOIN users u ON u.id = r.teacher_id
     ${TEACHER_ID ? 'WHERE r.teacher_id = $1' : ''}
     ORDER BY r.lesson_date, r.id`,
    TEACHER_ID ? [TEACHER_ID] : []
  );

  const fixes = [];
  for (const report of result.rows) {
    const data = report.report_data || {};
    if (!Array.isArray(data.columns) || !Array.isArray(data.rows) || data.rows.length < 2) continue;

    const columns = normalizeColumns(data.columns);
    const rows = normalizeRows(data.rows, columns);
    if (rows.length < 2) continue;

    const unused = columns.filter(
      (column) =>
        column.enabled !== false &&
        CANDIDATE_KEYS.has(column.key) &&
        rows.every((row) => Number(row.values[column.key] || 0) === 0)
    );
    if (unused.length === 0) continue;

    const nextColumns = columns.map((column) =>
      unused.some((u) => u.key === column.key) ? { ...column, enabled: false } : column
    );
    if (!nextColumns.some((column) => column.enabled !== false)) continue;

    const nextRows = buildRowsWithTotals(rows, nextColumns);
    const maxTotal = nextColumns
      .filter((column) => column.enabled !== false)
      .reduce((sum, column) => sum + column.max_value, 0);
    const averageTotal = Math.round(average(nextRows.map((row) => row.total)));
    const averagePercent = Math.round(maxTotal === 0 ? 0 : (averageTotal / maxTotal) * 100);

    fixes.push({
      report,
      disabledKeys: unused.map((column) => column.key),
      before: Number(report.percent) || 0,
      after: averagePercent,
      nextData: { ...data, columns: nextColumns, rows: nextRows },
      nextTotal: averageTotal,
      nextPercent: averagePercent,
      nextFeedback: normalizeFeedback(averagePercent),
    });
  }

  console.log(`Jami ${result.rows.length} ta hisobot tekshirildi, ${fixes.length} tasi tuzatilishi mumkin:\n`);
  for (const fix of fixes) {
    const date = new Date(fix.report.lesson_date).toISOString().slice(0, 10);
    console.log(
      `#${fix.report.id}  ${date}  ${fix.report.group_name || '-'}  (${fix.report.teacher_name.trim() || fix.report.teacher_id})` +
        `  yashiriladi: ${fix.disabledKeys.join(', ')}  o'rtacha foiz: ${fix.before}% -> ${fix.after}%`
    );
  }

  if (!APPLY) {
    console.log("\nHech narsa o'zgartirilmadi. Qo'llash uchun --apply bilan qayta ishga tushiring.");
    await pool.end();
    process.exit(0);
  }

  const backupFile = `fixUnusedDefaultColumns.backup-${Date.now()}.json`;
  fs.writeFileSync(
    backupFile,
    JSON.stringify(
      fixes.map((fix) => ({
        id: fix.report.id,
        report_data: fix.report.report_data,
        percent: fix.report.percent,
        feedback: fix.report.feedback,
        total: fix.report.total,
      })),
      null,
      2
    )
  );
  console.log(`\nZaxira yozildi: ${backupFile}`);

  for (const fix of fixes) {
    await pool.query(
      `UPDATE teacher_lesson_statistics_reports
       SET report_data = $1::jsonb, total = $2, percent = $3, feedback = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [JSON.stringify(fix.nextData), fix.nextTotal, fix.nextPercent, fix.nextFeedback, fix.report.id]
    );
  }
  console.log(`✅ ${fixes.length} ta hisobot yangilandi.`);
  await pool.end();
  process.exit(0);
})().catch((error) => {
  console.error('❌ Xatolik:', error.message);
  process.exit(1);
});
