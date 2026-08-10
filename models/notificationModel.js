const pool = require('../config/db');

const createNotificationTable = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL DEFAULT 'payment',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_read BOOLEAN NOT NULL DEFAULT false,
      read_at TIMESTAMP,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'users'
            AND column_name = 'fcm_token'
        ) THEN
          ALTER TABLE users ADD COLUMN fcm_token TEXT;
        END IF;
      END $$;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
      ON notifications(user_id, is_read, created_at DESC);
    `);

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_type_dedupe_key
      ON notifications(
        user_id,
        type,
        ((data->>'dedupe_key'))
      )
      WHERE data ? 'dedupe_key';
    `);

    console.log("✅ notifications jadvali tayyor.");
  } catch (error) {
    console.error("❌ notifications jadvalini yaratishda xatolik:", error.message);
  }
};

module.exports = { createNotificationTable };
