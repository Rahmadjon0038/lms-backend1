const pool = require('../config/db');

// Ilova versiyalarini boshqarish jadvali — har bir platforma (android/ios)
// uchun bitta qator, super admin panel orqali tahrirlanadi.
const createAppVersionTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS app_versions (
      id SERIAL PRIMARY KEY,
      platform VARCHAR(10) UNIQUE NOT NULL CHECK (platform IN ('android', 'ios')),
      latest_build_number INTEGER NOT NULL DEFAULT 1,
      latest_version_name VARCHAR(20) NOT NULL DEFAULT '1.0.0',
      min_supported_build_number INTEGER,
      update_message TEXT NOT NULL DEFAULT 'Ilovaning yangi versiyasi chiqdi. Yangilab, yangi imkoniyatlardan foydalaning.',
      store_url TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);
    console.log("✅ 'app_versions' jadvali tayyor.");

    // Boshlang'ich qatorlar — bo'lmasa version-check so'rovi bo'sh qaytadi
    await pool.query(`
      INSERT INTO app_versions (platform, latest_build_number, latest_version_name, store_url)
      VALUES
        ('android', 1, '1.0.0', 'https://play.google.com/store/apps/details?id=uz.taraqqiyot.mobile'),
        ('ios', 1, '1.0.0', NULL)
      ON CONFLICT (platform) DO NOTHING;
    `);
  } catch (err) {
    console.error("❌ app_versions jadvalini yaratishda xatolik:", err.message);
  }
};

const getAppVersion = async (platform) => {
  const result = await pool.query(
    'SELECT * FROM app_versions WHERE platform = $1',
    [platform]
  );
  return result.rows[0] || null;
};

const getAllAppVersions = async () => {
  const result = await pool.query('SELECT * FROM app_versions ORDER BY platform');
  return result.rows;
};

const updateAppVersion = async (platform, data) => {
  const fields = [];
  const values = [];
  let paramCount = 1;

  const allowedFields = [
    'latest_build_number',
    'latest_version_name',
    'min_supported_build_number',
    'update_message',
    'store_url',
  ];

  allowedFields.forEach((field) => {
    if (data[field] !== undefined) {
      fields.push(`${field} = $${paramCount}`);
      values.push(data[field]);
      paramCount++;
    }
  });

  if (fields.length === 0) {
    throw new Error("Yangilanishi kerak bo'lgan maydon topilmadi");
  }

  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(platform);

  const query = `UPDATE app_versions SET ${fields.join(', ')} WHERE platform = $${paramCount} RETURNING *`;
  const result = await pool.query(query, values);
  return result.rows[0];
};

module.exports = {
  createAppVersionTable,
  getAppVersion,
  getAllAppVersions,
  updateAppVersion,
};
