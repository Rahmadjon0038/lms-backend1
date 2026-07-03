const pool = require('../config/db');

const createProfileAvatarTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profile_avatars (
        id SERIAL PRIMARY KEY,
        avatar_key VARCHAR(120) UNIQUE NOT NULL,
        name VARCHAR(120) NOT NULL,
        image_path TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'profile_avatars'
            AND column_name = 'is_active'
        ) THEN
          ALTER TABLE profile_avatars ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'profile_avatars'
            AND column_name = 'created_by'
        ) THEN
          ALTER TABLE profile_avatars ADD COLUMN created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'profile_avatars'
            AND column_name = 'created_at'
        ) THEN
          ALTER TABLE profile_avatars ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END $$;
    `);

    console.log("✅ 'profile_avatars' jadvali tekshirildi/yaratildi.");
  } catch (error) {
    console.error("❌ 'profile_avatars' jadvali yaratishda xato:", error.message);
  }
};

module.exports = { createProfileAvatarTable };
