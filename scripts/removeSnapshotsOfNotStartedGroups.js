// Darsi hali boshlanmagan (draft / not_started) guruh talabalari uchun
// yaratilib qolgan oylik to'lov jadvali qatorlarini tozalaydi.
//
// Sabab: "yangi talabalar uchun jadval yaratish" so'rovi boshlanmagan guruhlarni
// ham olgan, shu sababli bunday talabalar To'lovlar va Davomat sahifalarida
// sanalib qolgan. Endi kod buni qilmaydi; bu skript eski qatorlarni olib tashlaydi.
//
// Xavfsizlik: faqat HECH QANDAY to'lov yozilmagan (paid_amount = 0 va
// payment_transactions yo'q) qatorlar o'chiriladi. To'lovi bor qatorlar tegilmaydi
// va alohida ro'yxatda ko'rsatiladi.
//
// Ishlatish (konteyner ichida):
//   node scripts/removeSnapshotsOfNotStartedGroups.js                 # ro'yxat (joriy oy)
//   node scripts/removeSnapshotsOfNotStartedGroups.js --month=2026-10
//   node scripts/removeSnapshotsOfNotStartedGroups.js --month=2026-10 --apply
require('dotenv').config();
const fs = require('fs');
const pool = require('../config/db');

const APPLY = process.argv.includes('--apply');
const monthArg = process.argv.find((arg) => arg.startsWith('--month='));
const MONTH = monthArg
  ? monthArg.split('=')[1]
  : new Date().toISOString().slice(0, 7);

if (!/^\d{4}-\d{2}$/.test(MONTH)) {
  console.error('❌ --month=YYYY-MM formatida bo\'lishi kerak');
  process.exit(1);
}

(async () => {
  const { rows } = await pool.query(
    `SELECT ms.*, g.name AS current_group_name, g.status AS group_status, g.class_status,
            EXISTS (
              SELECT 1 FROM payment_transactions pt
              WHERE pt.student_id = ms.student_id AND pt.group_id = ms.group_id AND pt.month = ms.month
            ) AS has_transactions
     FROM monthly_snapshots ms
     JOIN groups g ON g.id = ms.group_id AND g.branch_id = ms.branch_id
     WHERE ms.month = $1
       AND NOT (g.status = 'active' AND g.class_status = 'started')
     ORDER BY ms.branch_id, g.name, ms.student_surname, ms.student_name`,
    [MONTH]
  );

  const deletable = rows.filter((r) => Number(r.paid_amount || 0) === 0 && !r.has_transactions);
  const kept = rows.filter((r) => !deletable.includes(r));

  console.log(`${MONTH}: darsi boshlanmagan guruhlarda ${rows.length} ta qator topildi.`);
  console.log(`  o'chiriladigan (to'lovsiz): ${deletable.length}`);
  console.log(`  qoldiriladigan (to'lovi bor): ${kept.length}\n`);

  const describe = (r) =>
    `  #${r.id} filial ${r.branch_id} | ${r.current_group_name} (${r.group_status}/${r.class_status}) | ` +
    `${r.student_surname || ''} ${r.student_name || ''} | holat: ${r.monthly_status} | to'langan: ${r.paid_amount}`;

  deletable.forEach((r) => console.log(describe(r)));
  if (kept.length) {
    console.log("\nTegilmaydi (to'lov mavjud):");
    kept.forEach((r) => console.log(describe(r)));
  }

  if (!APPLY) {
    console.log("\nHech narsa o'zgartirilmadi. O'chirish uchun --apply bilan qayta ishga tushiring.");
    await pool.end();
    process.exit(0);
  }

  const backupFile = `removeSnapshotsOfNotStartedGroups.backup-${MONTH}-${Date.now()}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(deletable, null, 2));
  console.log(`\nZaxira yozildi: ${backupFile}`);

  if (deletable.length) {
    await pool.query('DELETE FROM monthly_snapshots WHERE id = ANY($1::int[])', [
      deletable.map((r) => r.id),
    ]);
  }
  console.log(`✅ ${deletable.length} ta qator o'chirildi.`);
  await pool.end();
  process.exit(0);
})().catch((error) => {
  console.error('❌ Xatolik:', error.message);
  process.exit(1);
});
