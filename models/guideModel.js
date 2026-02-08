const pool = require('../config/db');

const createGuideTables = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS guide_levels (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_level_main_pdfs (
      id SERIAL PRIMARY KEY,
      level_id INTEGER NOT NULL UNIQUE REFERENCES guide_levels(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size_bytes BIGINT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_lessons (
      id SERIAL PRIMARY KEY,
      level_id INTEGER NOT NULL REFERENCES guide_levels(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_lesson_notes (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES guide_lessons(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      content_markdown TEXT NOT NULL,
      color VARCHAR(20) NOT NULL DEFAULT 'blue',
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_lesson_pdfs (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES guide_lessons(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size_bytes BIGINT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_lesson_assignments (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES guide_lessons(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_lesson_vocabularies (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES guide_lessons(id) ON DELETE CASCADE,
      word VARCHAR(255) NOT NULL,
      translation VARCHAR(255) NOT NULL,
      example TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_lesson_vocabulary_pdfs (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES guide_lessons(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      file_path TEXT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size_bytes BIGINT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_lesson_vocabulary_images (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES guide_lessons(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      file_path TEXT NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size_bytes BIGINT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_lesson_vocabulary_markdowns (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES guide_lessons(id) ON DELETE CASCADE,
      content_markdown TEXT NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_lesson_videos (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES guide_lessons(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      youtube_url TEXT NOT NULL,
      youtube_video_id VARCHAR(50) NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guide_user_speech_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      speech_rate NUMERIC(3,2) NOT NULL DEFAULT 1.00,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_guide_lessons_level_id ON guide_lessons(level_id);
    CREATE INDEX IF NOT EXISTS idx_guide_notes_lesson_id ON guide_lesson_notes(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_guide_lesson_pdfs_lesson_id ON guide_lesson_pdfs(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_guide_lesson_assignments_lesson_id ON guide_lesson_assignments(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_guide_lesson_vocab_lesson_id ON guide_lesson_vocabularies(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_guide_lesson_vocab_pdfs_lesson_id ON guide_lesson_vocabulary_pdfs(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_guide_lesson_vocab_images_lesson_id ON guide_lesson_vocabulary_images(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_guide_lesson_vocab_markdowns_lesson_id ON guide_lesson_vocabulary_markdowns(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_guide_lesson_videos_lesson_id ON guide_lesson_videos(lesson_id);
    CREATE INDEX IF NOT EXISTS idx_guide_user_speech_settings_user_id ON guide_user_speech_settings(user_id);
  `;

  try {
    await pool.query(query);

    await pool.query(`
      DO $$
      BEGIN
        -- guide_levels: eski sxema bo'lsa title/description ni qo'shish
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_levels' AND column_name = 'title'
        ) THEN
          ALTER TABLE guide_levels ADD COLUMN title VARCHAR(255);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_levels' AND column_name = 'description'
        ) THEN
          ALTER TABLE guide_levels ADD COLUMN description TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_levels' AND column_name = 'created_at'
        ) THEN
          ALTER TABLE guide_levels ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_levels' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE guide_levels ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;

        -- Eski sxemada course_id NOT NULL bo'lib qolgan bo'lsa, yangi minimal API uchun ixtiyoriy qilamiz
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_levels' AND column_name = 'course_id'
        ) THEN
          ALTER TABLE guide_levels ALTER COLUMN course_id DROP NOT NULL;
        END IF;

        -- Eski sxemada name NOT NULL bo'lishi mumkin, yangi API title ishlatadi
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_levels' AND column_name = 'name'
        ) THEN
          ALTER TABLE guide_levels ALTER COLUMN name DROP NOT NULL;
        END IF;

        -- Agar eski 'name' ustuni mavjud bo'lsa title ni o'shandan to'ldiramiz
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_levels' AND column_name = 'name'
        ) THEN
          UPDATE guide_levels
          SET title = COALESCE(NULLIF(title, ''), name)
          WHERE title IS NULL OR title = '';
        END IF;

        UPDATE guide_levels
        SET title = COALESCE(NULLIF(title, ''), 'Untitled Level')
        WHERE title IS NULL OR title = '';

        ALTER TABLE guide_levels
        ALTER COLUMN title SET NOT NULL;

        -- guide_lessons: eski sxema bo'lsa title/description ni qo'shish
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_lessons' AND column_name = 'title'
        ) THEN
          ALTER TABLE guide_lessons ADD COLUMN title VARCHAR(255);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_lessons' AND column_name = 'description'
        ) THEN
          ALTER TABLE guide_lessons ADD COLUMN description TEXT;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_lessons' AND column_name = 'created_at'
        ) THEN
          ALTER TABLE guide_lessons ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_lessons' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE guide_lessons ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_lessons' AND column_name = 'order_index'
        ) THEN
          ALTER TABLE guide_lessons ADD COLUMN order_index INTEGER;
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_lessons' AND column_name = 'name'
        ) THEN
          UPDATE guide_lessons
          SET title = COALESCE(NULLIF(title, ''), name)
          WHERE title IS NULL OR title = '';
        END IF;

        -- Eski sxemada lesson.name NOT NULL bo'lishi mumkin, yangi API title ishlatadi
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_lessons' AND column_name = 'name'
        ) THEN
          ALTER TABLE guide_lessons ALTER COLUMN name DROP NOT NULL;
        END IF;

        UPDATE guide_lessons
        SET title = COALESCE(NULLIF(title, ''), 'Untitled Lesson')
        WHERE title IS NULL OR title = '';

        UPDATE guide_lessons
        SET description = COALESCE(NULLIF(description, ''), '')
        WHERE description IS NULL;

        -- order_index bo'sh bo'lsa level ichida ID bo'yicha ketma-ket to'ldiramiz
        WITH ordered AS (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY level_id ORDER BY id) AS rn
          FROM guide_lessons
        )
        UPDATE guide_lessons gl
        SET order_index = ordered.rn
        FROM ordered
        WHERE gl.id = ordered.id
          AND (gl.order_index IS NULL OR gl.order_index <= 0);

        ALTER TABLE guide_lessons
        ALTER COLUMN title SET NOT NULL;

        ALTER TABLE guide_lessons
        ALTER COLUMN description SET NOT NULL;

        ALTER TABLE guide_lessons
        ALTER COLUMN order_index SET NOT NULL;
      END $$;
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_guide_lessons_level_order
      ON guide_lessons(level_id, order_index);
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'guide_lesson_notes' AND column_name = 'color'
        ) THEN
          UPDATE guide_lesson_notes
          SET color = 'blue'
          WHERE color IS NULL OR color = '';
        END IF;
      END $$;
    `);

    console.log("✅ guide jadvallari tayyor");
  } catch (err) {
    console.error("❌ guide jadvallarini yaratishda xatolik:", err.message);
    throw err;
  }
};

module.exports = { createGuideTables };
