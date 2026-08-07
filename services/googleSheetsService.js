const path = require('path');
const { google } = require('googleapis');
const db = require('../config/db');

const KEY_PATH = process.env.GOOGLE_SHEETS_KEY_PATH
  ? path.resolve(__dirname, '..', process.env.GOOGLE_SHEETS_KEY_PATH)
  : null;
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '';

// Ustunlar tartibi — to'lov sahifasidagi ma'lumotlarga mos.
const HEADERS = [
  'Student ID',
  'Familiya',
  'Ism',
  'Telefon',
  "Ota telefoni",
  'Group ID',
  'Guruh',
  'Fan',
  "O'qituvchi",
  'Guruh narxi',
  'Kerakli summa',
  'Chegirma',
  "To'langan",
  'Qarz',
  "To'lov holati",
  'Oylik holat',
  "Oxirgi to'lov sanasi",
  "To'lovni qabul qilgan",
  'Yangilangan vaqti',
];

let sheetsClientPromise = null;
// month -> Map(`${student_id}:${group_id}` -> rowNumber)
const rowIndexCache = new Map();
// Shu process ichida allaqachon mavjudligi tekshirilgan/yaratilgan varaqlar (title)
const ensuredSheets = new Set();

const isConfigured = () => Boolean(KEY_PATH && SPREADSHEET_ID);

const getSheetsClient = async () => {
  if (!isConfigured()) return null;
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const auth = new google.auth.GoogleAuth({
        keyFile: KEY_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const client = await auth.getClient();
      return google.sheets({ version: 'v4', auth: client });
    })();
  }
  return sheetsClientPromise;
};

const sheetTitleForMonth = (month) => String(month || '').trim();

const ensureMonthSheet = async (sheets, title) => {
  if (ensuredSheets.has(title)) return;

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = (meta.data.sheets || []).some((sheet) => sheet.properties?.title === title);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }

  ensuredSheets.add(title);
};

const loadRowIndex = async (sheets, title) => {
  if (rowIndexCache.has(title)) return rowIndexCache.get(title);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${title}!A2:B`,
  });

  const map = new Map();
  const rows = res.data.values || [];
  rows.forEach((row, index) => {
    const studentId = row[0];
    const groupId = row[1];
    if (studentId && groupId) {
      map.set(`${studentId}:${groupId}`, index + 2); // +2: 1-header row + 1-indexdan boshlanish
    }
  });

  rowIndexCache.set(title, map);
  return map;
};

const buildRowValues = (snap) => [
  snap.student_id,
  snap.student_surname || '',
  snap.student_name || '',
  snap.student_phone || '',
  snap.student_father_phone || '',
  snap.group_id,
  snap.group_name || '',
  snap.subject_name || '',
  snap.teacher_name || '',
  Number(snap.group_price) || 0,
  Number(snap.required_amount) || 0,
  Number(snap.discount_amount) || 0,
  Number(snap.paid_amount) || 0,
  Number(snap.debt_amount) || 0,
  snap.payment_status || '',
  snap.monthly_status || '',
  snap.last_payment_date || '',
  snap.payment_admin_full_name || '',
  new Date().toISOString(),
];

// To'lov sahifasi ko'rsatadigan barcha maydonlarni (student/guruh/chegirma
// birlashtirilgan holda) monthly_snapshots dan qayta o'qiydi — shu bilan
// har bir yozish nuqtasida bir xil, to'liq va izchil qator olamiz.
const fetchSnapshotForSheet = async ({ studentId, groupId, month, branchId }) => {
  const result = await db.query(
    `
      SELECT
        ms.student_id,
        ms.group_id,
        ms.month,
        ms.student_name,
        ms.student_surname,
        ms.student_phone,
        ms.student_father_phone,
        ms.group_name,
        ms.group_price,
        ms.subject_name,
        ms.teacher_name,
        ms.monthly_status,
        ms.payment_status,
        ms.required_amount,
        ms.paid_amount,
        COALESCE(sd_amt.amount, ms.discount_amount, 0) as discount_amount,
        ms.debt_amount,
        TO_CHAR(ms.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date,
        CASE WHEN ms.payment_made_by IS NOT NULL THEN CONCAT(u.name, ' ', u.surname) ELSE NULL END as payment_admin_full_name
      FROM monthly_snapshots ms
      LEFT JOIN users u ON ms.payment_made_by = u.id AND u.branch_id = ms.branch_id
      LEFT JOIN LATERAL (
        SELECT CASE
          WHEN sd.discount_type = 'percent' THEN ROUND((ms.required_amount * sd.discount_value / 100), 2)
          WHEN sd.discount_type = 'amount' THEN sd.discount_value
          ELSE 0
        END as amount
        FROM student_discounts sd
        WHERE sd.student_id = ms.student_id
          AND sd.group_id = ms.group_id
          AND sd.branch_id = ms.branch_id
          AND sd.start_month <= ms.month
          AND sd.end_month >= ms.month
          AND sd.is_active = true
        LIMIT 1
      ) sd_amt ON true
      WHERE ms.student_id = $1 AND ms.group_id = $2 AND ms.month = $3 AND ms.branch_id = $4
      LIMIT 1
    `,
    [studentId, groupId, month, branchId]
  );

  return result.rows[0] || null;
};

// Bitta (student, group, month) yozuvini Sheets'ga yozadi — mavjud bo'lsa
// o'sha qatorni yangilaydi, bo'lmasa oxiriga qo'shadi. Hech qachon o'chirmaydi.
const upsertSnapshotRow = async ({ studentId, groupId, month, branchId }) => {
  if (!isConfigured()) return;

  const sheets = await getSheetsClient();
  if (!sheets) return;

  const snap = await fetchSnapshotForSheet({ studentId, groupId, month, branchId });
  if (!snap) return; // Yozuv bazada topilmadi (masalan keyinroq o'chirilgan) — Sheets'ga tegilmaymiz

  const title = sheetTitleForMonth(month);
  await ensureMonthSheet(sheets, title);
  const rowIndex = await loadRowIndex(sheets, title);
  const key = `${snap.student_id}:${snap.group_id}`;
  const values = buildRowValues(snap);

  if (rowIndex.has(key)) {
    const targetRow = rowIndex.get(key);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A${targetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    });
    rowIndex.set(key, rowIndex.size + 2);
  }
};

// Fire-and-forget wrapper — CRM javobini hech qachon sekinlashtirmaydi yoki
// buzmaydi; Sheets xatosi faqat konsolga yoziladi.
const syncSnapshotToSheetsAsync = ({ studentId, groupId, month, branchId }) => {
  if (!isConfigured()) return;
  upsertSnapshotRow({ studentId, groupId, month, branchId }).catch((error) => {
    console.warn(
      `⚠️ Google Sheets sinxronizatsiya xato (student=${studentId}, group=${groupId}, month=${month}): ${error.message}`
    );
  });
};

// Butun oy uchun (masalan snapshot ommaviy yaratilganda) barcha qatorlarni
// bitta so'rovda o'qib, bitta yozish amali bilan varaqqa to'liq joylaydi —
// N ta talaba uchun N ta alohida API chaqiruvidan (rate limit xavfi) qochamiz.
const fetchMonthSnapshotsForSheet = async ({ month, branchId }) => {
  const result = await db.query(
    `
      SELECT
        ms.student_id,
        ms.group_id,
        ms.month,
        ms.student_name,
        ms.student_surname,
        ms.student_phone,
        ms.student_father_phone,
        ms.group_name,
        ms.group_price,
        ms.subject_name,
        ms.teacher_name,
        ms.monthly_status,
        ms.payment_status,
        ms.required_amount,
        ms.paid_amount,
        COALESCE(sd_amt.amount, ms.discount_amount, 0) as discount_amount,
        ms.debt_amount,
        TO_CHAR(ms.last_payment_date AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') as last_payment_date,
        CASE WHEN ms.payment_made_by IS NOT NULL THEN CONCAT(u.name, ' ', u.surname) ELSE NULL END as payment_admin_full_name
      FROM monthly_snapshots ms
      LEFT JOIN users u ON ms.payment_made_by = u.id AND u.branch_id = ms.branch_id
      LEFT JOIN LATERAL (
        SELECT CASE
          WHEN sd.discount_type = 'percent' THEN ROUND((ms.required_amount * sd.discount_value / 100), 2)
          WHEN sd.discount_type = 'amount' THEN sd.discount_value
          ELSE 0
        END as amount
        FROM student_discounts sd
        WHERE sd.student_id = ms.student_id
          AND sd.group_id = ms.group_id
          AND sd.branch_id = ms.branch_id
          AND sd.start_month <= ms.month
          AND sd.end_month >= ms.month
          AND sd.is_active = true
        LIMIT 1
      ) sd_amt ON true
      WHERE ms.month = $1 AND ms.branch_id = $2
      ORDER BY ms.group_name, ms.student_surname, ms.student_name
    `,
    [month, branchId]
  );

  return result.rows;
};

const syncMonthToSheets = async ({ month, branchId }) => {
  if (!isConfigured()) return;

  const sheets = await getSheetsClient();
  if (!sheets) return;

  const rows = await fetchMonthSnapshotsForSheet({ month, branchId });
  if (rows.length === 0) return;

  const title = sheetTitleForMonth(month);
  await ensureMonthSheet(sheets, title);

  const values = rows.map(buildRowValues);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${title}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  const map = new Map();
  rows.forEach((row, index) => {
    map.set(`${row.student_id}:${row.group_id}`, index + 2);
  });
  rowIndexCache.set(title, map);
};

const syncMonthToSheetsAsync = ({ month, branchId }) => {
  if (!isConfigured()) return;
  syncMonthToSheets({ month, branchId }).catch((error) => {
    console.warn(`⚠️ Google Sheets oylik sinxronizatsiya xato (month=${month}): ${error.message}`);
  });
};

module.exports = {
  isConfigured,
  syncSnapshotToSheetsAsync,
  syncMonthToSheetsAsync,
  upsertSnapshotRow,
};
