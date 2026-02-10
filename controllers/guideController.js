const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../config/db');

const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const levelPdfDir = path.join(__dirname, '..', 'private_uploads', 'guide_levels');
const lessonPdfDir = path.join(__dirname, '..', 'private_uploads', 'guide_lessons');
const vocabularyImageDir = path.join(__dirname, '..', 'private_uploads', 'guide_vocabulary_images');
const pdfBannerDir = path.join(__dirname, '..', 'private_uploads', 'guide_pdf_banners');
const levelBannerDir = path.join(__dirname, '..', 'private_uploads', 'guide_level_banners');
if (!fs.existsSync(levelPdfDir)) fs.mkdirSync(levelPdfDir, { recursive: true });
if (!fs.existsSync(lessonPdfDir)) fs.mkdirSync(lessonPdfDir, { recursive: true });
if (!fs.existsSync(vocabularyImageDir)) fs.mkdirSync(vocabularyImageDir, { recursive: true });
if (!fs.existsSync(pdfBannerDir)) fs.mkdirSync(pdfBannerDir, { recursive: true });
if (!fs.existsSync(levelBannerDir)) fs.mkdirSync(levelBannerDir, { recursive: true });

const createPdfUpload = (destination) => multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destination),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: MAX_PDF_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const createImageUpload = (destination) => multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destination),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: MAX_IMAGE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const createPdfWithOptionalBannerUpload = (pdfDestination) => multer({
  storage: multer.diskStorage({
    destination: (_req, file, cb) => {
      if (file.fieldname === 'file') return cb(null, pdfDestination);
      if (file.fieldname === 'banner') return cb(null, pdfBannerDir);
      return cb(new Error('Unexpected upload field'));
    },
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: MAX_PDF_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'file') {
      if (file.mimetype !== 'application/pdf') return cb(new Error('Only PDF files are allowed for file'));
      return cb(null, true);
    }
    if (file.fieldname === 'banner') {
      if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed for banner'));
      return cb(null, true);
    }
    return cb(new Error('Unexpected upload field'));
  },
});

const uploadMainPdf = createPdfUpload(levelPdfDir);
const uploadLessonPdf = createPdfUpload(lessonPdfDir);
const uploadVocabularyImage = createImageUpload(vocabularyImageDir);
const uploadLevelBanner = createImageUpload(levelBannerDir);

const ALLOWED_NOTE_COLORS = new Set(['blue', 'green', 'orange', 'red', 'purple', 'pink']);
const DEFAULT_SPEECH_RATE = 1.0;
const MIN_SPEECH_RATE = 0.5;
const MAX_SPEECH_RATE = 2.0;

const sendSuccess = (res, data, status = 200) => res.status(status).json({ success: true, data });
const sendError = (res, message, status = 400, errors = {}) =>
  res.status(status).json({ success: false, message, errors });

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const getUploadedPdfAndBanner = (req) => ({
  pdfFile: req?.files?.file?.[0] || req?.file || null,
  bannerFile: req?.files?.banner?.[0] || null,
});

const cleanupUploadedPdfAndBanner = async ({ pdfFile, bannerFile }) => {
  if (pdfFile?.path) await removeFileIfExists(pdfFile.path);
  if (bannerFile?.path) await removeFileIfExists(bannerFile.path);
};

const hasText = (v) => typeof v === 'string' && v.trim().length > 0;
const normalizeTopicName = (body) => {
  if (hasText(body?.topic_name)) return body.topic_name.trim();
  if (hasText(body?.topic)) return body.topic.trim();
  if (hasText(body?.title)) return body.title.trim();
  return null;
};

const normalizeNoteColor = (value) => {
  if (!hasText(value)) return 'blue';
  const color = value.trim().toLowerCase();
  return ALLOWED_NOTE_COLORS.has(color) ? color : null;
};

const extractYouTubeVideoId = (input) => {
  if (!hasText(input)) return null;

  const raw = input.trim();
  try {
    const url = new URL(raw);

    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }

    if (url.hostname.includes('youtube.com')) {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v');
        return id || null;
      }
      if (url.pathname.startsWith('/embed/')) {
        const id = url.pathname.split('/').filter(Boolean)[1];
        return id || null;
      }
      if (url.pathname.startsWith('/shorts/')) {
        const id = url.pathname.split('/').filter(Boolean)[1];
        return id || null;
      }
    }
  } catch (_error) {
    return null;
  }

  return null;
};

const buildYouTubeEmbedUrl = (videoId) => `https://www.youtube.com/embed/${videoId}`;
const mapLessonRow = (row) => ({
  id: row.id,
  level_id: row.level_id,
  topic_name: row.title,
  order_index: row.order_index,
  created_at: row.created_at,
  updated_at: row.updated_at,
});
const mapNoteRow = (row) => ({
  id: row.id,
  lesson_id: row.lesson_id,
  content_markdown: row.content_markdown,
  color: row.color,
  created_by: row.created_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
});
const mapAssignmentRow = (row) => ({
  id: row.id,
  lesson_id: row.lesson_id,
  assignment_text: row.description,
  created_by: row.created_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
});
const mapVocabularyMarkdownRow = (row) => ({
  id: row.id,
  lesson_id: row.lesson_id,
  content_markdown: row.content_markdown,
  created_by: row.created_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
});
const mapVocabularyRow = (row) => ({
  ...row,
  speak_text: row.word,
});

const normalizeSpeechRate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < MIN_SPEECH_RATE || numeric > MAX_SPEECH_RATE) return null;
  return Number(numeric.toFixed(2));
};

const getSpeechSettingsForUser = async (userId) => {
  const result = await pool.query(
    `SELECT speech_rate, updated_at
     FROM guide_user_speech_settings
     WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return {
      speech_rate: DEFAULT_SPEECH_RATE,
      min_rate: MIN_SPEECH_RATE,
      max_rate: MAX_SPEECH_RATE,
      updated_at: null,
    };
  }

  return {
    speech_rate: Number(result.rows[0].speech_rate),
    min_rate: MIN_SPEECH_RATE,
    max_rate: MAX_SPEECH_RATE,
    updated_at: result.rows[0].updated_at,
  };
};

const findLevel = async (levelId) => {
  const result = await pool.query(
    `SELECT id, title, description, created_at, updated_at,
            banner_file_name, banner_file_size_bytes, banner_mime_type
     FROM guide_levels
     WHERE id = $1`,
    [levelId]
  );
  return result.rows[0] || null;
};

const findLesson = async (lessonId) => {
  const result = await pool.query(
    `SELECT gl.id, gl.level_id, gl.title, gl.description, gl.order_index, gl.created_at, gl.updated_at,
            lvl.title AS level_title
     FROM guide_lessons gl
     JOIN guide_levels lvl ON lvl.id = gl.level_id
     WHERE gl.id = $1`,
    [lessonId]
  );
  return result.rows[0] || null;
};

const removeFileIfExists = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (_e) {
    // ignore
  }
};

// Level CRUD
const createLevel = async (req, res) => {
  if (!req.file) {
    return sendError(res, 'banner image is required');
  }

  try {
    const result = await pool.query(
      `INSERT INTO guide_levels (
         title, description, banner_path, banner_file_name, banner_file_size_bytes, banner_mime_type
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, description, created_at, updated_at,
                 banner_file_name, banner_file_size_bytes, banner_mime_type`,
      ['Untitled Level', '', req.file.path, req.file.originalname, req.file.size, req.file.mimetype]
    );

    return sendSuccess(res, {
      ...result.rows[0],
      protected_banner_url: `/api/admin/guides/levels/${result.rows[0].id}/banner`,
    }, 201);
  } catch (error) {
    if (req.file?.path) await removeFileIfExists(req.file.path);
    return sendError(res, 'Failed to create level', 500, { detail: error.message });
  }
};

const getLevels = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.id, l.created_at, l.updated_at,
              l.banner_file_name, l.banner_file_size_bytes, l.banner_mime_type,
              COUNT(gl.id)::int AS lesson_count,
              CASE WHEN mp.id IS NOT NULL THEN true ELSE false END AS has_main_pdf
       FROM guide_levels l
       LEFT JOIN guide_lessons gl ON gl.level_id = l.id
       LEFT JOIN guide_level_main_pdfs mp ON mp.level_id = l.id
       GROUP BY l.id, mp.id
       ORDER BY l.id DESC`
    );
    const rolePrefix = _req.baseUrl.startsWith('/api/admin') ? '/api/admin' : '/api/teacher';
    return sendSuccess(res, result.rows.map((row) => ({
      ...row,
      protected_banner_url: row.banner_file_name
        ? `${rolePrefix}/guides/levels/${row.id}/banner`
        : null,
    })));
  } catch (error) {
    return sendError(res, 'Failed to fetch levels', 500, { detail: error.message });
  }
};

const getLevelById = async (req, res) => {
  const levelId = parseId(req.params.levelId);
  if (!levelId) return sendError(res, 'Invalid levelId');

  try {
    const level = await findLevel(levelId);
    if (!level) return sendError(res, 'Level not found', 404);
    const rolePrefix = req.baseUrl.startsWith('/api/admin') ? '/api/admin' : '/api/teacher';

    const mainPdfResult = await pool.query(
      `SELECT id, file_name, file_size_bytes, mime_type, uploaded_by, uploaded_at,
              banner_file_name, banner_file_size_bytes, banner_mime_type
       FROM guide_level_main_pdfs
       WHERE level_id = $1`,
      [levelId]
    );

    const lessonsResult = await pool.query(
      `SELECT id, level_id, title, description, order_index, created_at, updated_at
       FROM guide_lessons
       WHERE level_id = $1
       ORDER BY order_index ASC, id ASC`,
      [levelId]
    );

    return sendSuccess(res, {
      level: {
        id: level.id,
        created_at: level.created_at,
        updated_at: level.updated_at,
        banner_file_name: level.banner_file_name,
        banner_file_size_bytes: level.banner_file_size_bytes,
        banner_mime_type: level.banner_mime_type,
        protected_banner_url: level.banner_file_name
          ? `${rolePrefix}/guides/levels/${levelId}/banner`
          : null,
      },
      main_pdf: mainPdfResult.rows[0]
        ? {
            ...mainPdfResult.rows[0],
            protected_file_url: `${rolePrefix}/guides/levels/${levelId}/main-pdf/file`,
          }
        : null,
      lessons: lessonsResult.rows.map(mapLessonRow),
    });
  } catch (error) {
    return sendError(res, 'Failed to fetch level details', 500, { detail: error.message });
  }
};

const updateLevel = async (req, res) => {
  const levelId = parseId(req.params.levelId);
  if (!levelId) return sendError(res, 'Invalid levelId');
  return sendError(res, 'Level title/description update disabled. Level only has banner.', 400);
};

const streamLevelBanner = async (req, res) => {
  const levelId = parseId(req.params.levelId);
  if (!levelId) return sendError(res, 'Invalid levelId');

  try {
    const result = await pool.query(
      `SELECT banner_path, banner_file_name, banner_mime_type
       FROM guide_levels
       WHERE id = $1`,
      [levelId]
    );

    if (result.rows.length === 0 || !result.rows[0].banner_path) return sendError(res, 'Level banner not found', 404);
    const banner = result.rows[0];
    if (!fs.existsSync(banner.banner_path)) return sendError(res, 'Banner file not found', 404);

    res.setHeader('Content-Type', banner.banner_mime_type || 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${banner.banner_file_name || 'level-banner'}"`);
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    return res.sendFile(path.resolve(banner.banner_path));
  } catch (error) {
    return sendError(res, 'Failed to open level banner', 500, { detail: error.message });
  }
};

const deleteLevel = async (req, res) => {
  const levelId = parseId(req.params.levelId);
  if (!levelId) return sendError(res, 'Invalid levelId');

  try {
    const pdf = await pool.query('SELECT file_path, banner_path FROM guide_level_main_pdfs WHERE level_id = $1', [levelId]);

    const levelBanner = await pool.query('SELECT banner_path FROM guide_levels WHERE id = $1', [levelId]);
    const result = await pool.query('DELETE FROM guide_levels WHERE id = $1 RETURNING id', [levelId]);
    if (result.rows.length === 0) return sendError(res, 'Level not found', 404);

    if (pdf.rows[0]?.file_path) await removeFileIfExists(pdf.rows[0].file_path);
    if (pdf.rows[0]?.banner_path) await removeFileIfExists(pdf.rows[0].banner_path);
    if (levelBanner.rows[0]?.banner_path) await removeFileIfExists(levelBanner.rows[0].banner_path);

    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete level', 500, { detail: error.message });
  }
};

// Main PDF (one per level)
const uploadLevelMainPdf = async (req, res) => {
  const pdfFile = req.file;
  const levelId = parseId(req.params.levelId);
  if (!levelId) {
    if (pdfFile?.path) await removeFileIfExists(pdfFile.path);
    return sendError(res, 'Invalid levelId');
  }

  if (!pdfFile) {
    return sendError(res, 'PDF file is required');
  }

  try {
    const level = await findLevel(levelId);
    if (!level) {
      await removeFileIfExists(pdfFile.path);
      return sendError(res, 'Level not found', 404);
    }

    const old = await pool.query('SELECT file_path FROM guide_level_main_pdfs WHERE level_id = $1', [levelId]);

    let result;
    if (old.rows.length > 0) {
      result = await pool.query(
        `UPDATE guide_level_main_pdfs
         SET file_path = $1,
             file_name = $2,
             file_size_bytes = $3,
             mime_type = $4,
             uploaded_by = $5,
             uploaded_at = CURRENT_TIMESTAMP
         WHERE level_id = $6
         RETURNING id, level_id, file_name, file_size_bytes, mime_type, uploaded_by, uploaded_at`,
        [pdfFile.path, pdfFile.originalname, pdfFile.size, pdfFile.mimetype, req.user.id, levelId]
      );
      await removeFileIfExists(old.rows[0].file_path);
    } else {
      result = await pool.query(
        `INSERT INTO guide_level_main_pdfs (
          level_id, file_path, file_name, file_size_bytes, mime_type, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, level_id, file_name, file_size_bytes, mime_type, uploaded_by, uploaded_at`,
        [levelId, pdfFile.path, pdfFile.originalname, pdfFile.size, pdfFile.mimetype, req.user.id]
      );
    }

    return sendSuccess(
      res,
      {
        ...result.rows[0],
        protected_file_url: `/api/admin/guides/levels/${levelId}/main-pdf/file`,
      },
      201
    );
  } catch (error) {
    if (pdfFile?.path) await removeFileIfExists(pdfFile.path);
    return sendError(res, 'Failed to upload main PDF', 500, { detail: error.message });
  }
};

const getLevelMainPdfMeta = async (req, res) => {
  const levelId = parseId(req.params.levelId);
  if (!levelId) return sendError(res, 'Invalid levelId');

  try {
    const result = await pool.query(
      `SELECT id, level_id, file_name, file_size_bytes, mime_type, uploaded_by, uploaded_at
       FROM guide_level_main_pdfs
       WHERE level_id = $1`,
      [levelId]
    );

    if (result.rows.length === 0) return sendError(res, 'Main PDF not found', 404);

    const protectedUrl = req.user.role === 'teacher'
      ? `/api/teacher/guides/levels/${levelId}/main-pdf/file`
      : `/api/admin/guides/levels/${levelId}/main-pdf/file`;

    return sendSuccess(res, {
      ...result.rows[0],
      protected_file_url: protectedUrl,
    });
  } catch (error) {
    return sendError(res, 'Failed to fetch main PDF metadata', 500, { detail: error.message });
  }
};

const streamLevelMainPdf = async (req, res) => {
  const levelId = parseId(req.params.levelId);
  if (!levelId) return sendError(res, 'Invalid levelId');

  try {
    const result = await pool.query(
      `SELECT file_path, file_name, mime_type
       FROM guide_level_main_pdfs
       WHERE level_id = $1`,
      [levelId]
    );

    if (result.rows.length === 0) return sendError(res, 'Main PDF not found', 404);

    const pdf = result.rows[0];
    if (!fs.existsSync(pdf.file_path)) return sendError(res, 'PDF file not found', 404);

    res.setHeader('Content-Type', pdf.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${pdf.file_name}"`);
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    return res.sendFile(path.resolve(pdf.file_path));
  } catch (error) {
    return sendError(res, 'Failed to open main PDF', 500, { detail: error.message });
  }
};

const deleteLevelMainPdf = async (req, res) => {
  const levelId = parseId(req.params.levelId);
  if (!levelId) return sendError(res, 'Invalid levelId');

  try {
    const result = await pool.query(
      `DELETE FROM guide_level_main_pdfs
       WHERE level_id = $1
       RETURNING id, file_path, banner_path`,
      [levelId]
    );

    if (result.rows.length === 0) return sendError(res, 'Main PDF not found', 404);
    await removeFileIfExists(result.rows[0].file_path);
    await removeFileIfExists(result.rows[0].banner_path);

    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete main PDF', 500, { detail: error.message });
  }
};

// Lessons CRUD inside level
const createLesson = async (req, res) => {
  const levelId = parseId(req.params.levelId);
  if (!levelId) return sendError(res, 'Invalid levelId');

  const topicName = normalizeTopicName(req.body);
  if (!topicName) {
    return sendError(res, 'topic_name is required');
  }

  try {
    const level = await findLevel(levelId);
    if (!level) return sendError(res, 'Level not found', 404);

    const nextOrderResult = await pool.query(
      'SELECT COALESCE(MAX(order_index), 0)::int AS max_order FROM guide_lessons WHERE level_id = $1',
      [levelId]
    );
    const nextOrder = (nextOrderResult.rows[0]?.max_order || 0) + 1;

    const result = await pool.query(
      `INSERT INTO guide_lessons (level_id, title, description, order_index)
       VALUES ($1, $2, $3, $4)
       RETURNING id, level_id, title, description, order_index, created_at, updated_at`,
      [levelId, topicName, '', nextOrder]
    );

    return sendSuccess(res, mapLessonRow(result.rows[0]), 201);
  } catch (error) {
    return sendError(res, 'Failed to create lesson', 500, { detail: error.message });
  }
};

const getLevelLessons = async (req, res) => {
  const levelId = parseId(req.params.levelId);
  if (!levelId) return sendError(res, 'Invalid levelId');

  try {
    const result = await pool.query(
      `SELECT id, level_id, title, description, order_index, created_at, updated_at
       FROM guide_lessons
       WHERE level_id = $1
       ORDER BY order_index ASC, id ASC`,
      [levelId]
    );

    return sendSuccess(res, result.rows.map(mapLessonRow));
  } catch (error) {
    return sendError(res, 'Failed to fetch lessons', 500, { detail: error.message });
  }
};

const updateLesson = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  const topicName = normalizeTopicName(req.body);
  if (!topicName) {
    return sendError(res, 'topic_name is required');
  }

  try {
    const result = await pool.query(
      `UPDATE guide_lessons
       SET title = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, level_id, title, description, order_index, created_at, updated_at`,
      [topicName, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Lesson not found', 404);
    return sendSuccess(res, mapLessonRow(result.rows[0]));
  } catch (error) {
    return sendError(res, 'Failed to update lesson', 500, { detail: error.message });
  }
};

const deleteLesson = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  try {
    const result = await pool.query('DELETE FROM guide_lessons WHERE id = $1 RETURNING id, level_id', [lessonId]);
    if (result.rows.length === 0) return sendError(res, 'Lesson not found', 404);

    const levelId = result.rows[0].level_id;
    await pool.query(
      `WITH ordered AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY level_id ORDER BY order_index ASC, id ASC) AS rn
        FROM guide_lessons
        WHERE level_id = $1
      )
      UPDATE guide_lessons gl
      SET order_index = ordered.rn
      FROM ordered
      WHERE gl.id = ordered.id`,
      [levelId]
    );

    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete lesson', 500, { detail: error.message });
  }
};

const reorderLessons = async (req, res) => {
  const levelId = parseId(req.params.levelId);
  if (!levelId) return sendError(res, 'Invalid levelId');

  const lessons = req.body.lessons;
  if (!Array.isArray(lessons) || lessons.length === 0) {
    return sendError(res, 'lessons array is required');
  }

  const normalized = lessons.map((item) => ({
    lessonId: parseId(item?.id),
    orderIndex: parseId(item?.order_index),
  }));

  if (normalized.some((x) => !x.lessonId || !x.orderIndex)) {
    return sendError(res, 'Each item must include positive integer id and order_index');
  }

  const orderSet = new Set(normalized.map((x) => x.orderIndex));
  if (orderSet.size !== normalized.length) {
    return sendError(res, 'order_index values must be unique');
  }

  try {
    const existing = await pool.query('SELECT id FROM guide_lessons WHERE level_id = $1', [levelId]);
    if (existing.rows.length === 0) return sendError(res, 'No lessons found in this level', 404);

    const existingIds = new Set(existing.rows.map((r) => r.id));
    const incomingIds = new Set(normalized.map((x) => x.lessonId));

    if (existingIds.size !== incomingIds.size) {
      return sendError(res, 'All lessons in the level must be included for reorder');
    }

    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        return sendError(res, 'Submitted lessons list is incomplete or contains invalid lessons');
      }
    }

    const sortedOrders = [...orderSet].sort((a, b) => a - b);
    for (let i = 0; i < sortedOrders.length; i += 1) {
      if (sortedOrders[i] !== i + 1) {
        return sendError(res, 'order_index must be sequential from 1..N');
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of normalized) {
        await client.query(
          `UPDATE guide_lessons
           SET order_index = $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND level_id = $3`,
          [item.orderIndex, item.lessonId, levelId]
        );
      }
      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    const result = await pool.query(
      `SELECT id, level_id, title, description, order_index, created_at, updated_at
       FROM guide_lessons
       WHERE level_id = $1
       ORDER BY order_index ASC, id ASC`,
      [levelId]
    );
    return sendSuccess(res, result.rows.map(mapLessonRow));
  } catch (error) {
    return sendError(res, 'Failed to save lesson order', 500, { detail: error.message });
  }
};

// Lesson inner content (admin create global, teacher read)
const createLessonNote = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  const { content_markdown, color } = req.body;
  if (!hasText(content_markdown)) {
    return sendError(res, 'content_markdown is required');
  }

  const normalizedColor = normalizeNoteColor(color);
  if (!normalizedColor) {
    return sendError(res, 'Invalid color', 400, { allowed: [...ALLOWED_NOTE_COLORS] });
  }

  try {
    const lesson = await findLesson(lessonId);
    if (!lesson) return sendError(res, 'Lesson not found', 404);

    const result = await pool.query(
      `INSERT INTO guide_lesson_notes (lesson_id, title, content_markdown, color, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, lesson_id, title, content_markdown, color, created_by, created_at, updated_at`,
      [lessonId, '', content_markdown.trim(), normalizedColor, req.user.id]
    );

    return sendSuccess(res, mapNoteRow(result.rows[0]), 201);
  } catch (error) {
    return sendError(res, 'Failed to create lesson note', 500, { detail: error.message });
  }
};

const updateLessonNote = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const noteId = parseId(req.params.noteId);
  if (!lessonId || !noteId) return sendError(res, 'Invalid id');

  const { content_markdown, color } = req.body;
  if (!hasText(content_markdown)) {
    return sendError(res, 'content_markdown is required');
  }

  const normalizedColor = normalizeNoteColor(color);
  if (!normalizedColor) {
    return sendError(res, 'Invalid color', 400, { allowed: [...ALLOWED_NOTE_COLORS] });
  }

  try {
    const result = await pool.query(
      `UPDATE guide_lesson_notes
       SET title = '',
           content_markdown = $1,
           color = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND lesson_id = $4
       RETURNING id, lesson_id, title, content_markdown, color, created_by, created_at, updated_at`,
      [content_markdown.trim(), normalizedColor, noteId, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Lesson note not found', 404);
    return sendSuccess(res, mapNoteRow(result.rows[0]));
  } catch (error) {
    return sendError(res, 'Failed to update lesson note', 500, { detail: error.message });
  }
};

const deleteLessonNote = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const noteId = parseId(req.params.noteId);
  if (!lessonId || !noteId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `DELETE FROM guide_lesson_notes
       WHERE id = $1 AND lesson_id = $2
       RETURNING id`,
      [noteId, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Lesson note not found', 404);
    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete lesson note', 500, { detail: error.message });
  }
};

const uploadLessonPdfItem = async (req, res) => {
  const pdfFile = req.file;
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) {
    if (pdfFile?.path) await removeFileIfExists(pdfFile.path);
    return sendError(res, 'Invalid lessonId');
  }

  const { title } = req.body;
  if (!hasText(title)) {
    if (pdfFile?.path) await removeFileIfExists(pdfFile.path);
    return sendError(res, 'title is required');
  }

  if (!pdfFile) {
    return sendError(res, 'PDF file is required');
  }

  try {
    const lesson = await findLesson(lessonId);
    if (!lesson) {
      await removeFileIfExists(pdfFile.path);
      return sendError(res, 'Lesson not found', 404);
    }

    const result = await pool.query(
      `INSERT INTO guide_lesson_pdfs (
         lesson_id, title, description, file_path, file_name, file_size_bytes, mime_type, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, lesson_id, title, description, file_name, file_size_bytes, mime_type, created_by, created_at`,
      [
        lessonId,
        title.trim(),
        '',
        pdfFile.path,
        pdfFile.originalname,
        pdfFile.size,
        pdfFile.mimetype,
        req.user.id
      ]
    );

    return sendSuccess(res, {
      ...result.rows[0],
      protected_file_url: `/api/admin/guides/lessons/${lessonId}/pdfs/${result.rows[0].id}/file`,
    }, 201);
  } catch (error) {
    if (pdfFile?.path) await removeFileIfExists(pdfFile.path);
    return sendError(res, 'Failed to upload lesson PDF', 500, { detail: error.message });
  }
};

const streamLessonPdfFile = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const pdfId = parseId(req.params.pdfId);
  if (!lessonId || !pdfId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `SELECT id, file_path, file_name, mime_type
       FROM guide_lesson_pdfs
       WHERE id = $1 AND lesson_id = $2`,
      [pdfId, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Lesson PDF not found', 404);

    const item = result.rows[0];
    if (!fs.existsSync(item.file_path)) return sendError(res, 'PDF file not found', 404);

    res.setHeader('Content-Type', item.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${item.file_name}"`);
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    return res.sendFile(path.resolve(item.file_path));
  } catch (error) {
    return sendError(res, 'Failed to open lesson PDF', 500, { detail: error.message });
  }
};

const deleteLessonPdfItem = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const pdfId = parseId(req.params.pdfId);
  if (!lessonId || !pdfId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `DELETE FROM guide_lesson_pdfs
       WHERE id = $1 AND lesson_id = $2
       RETURNING id, file_path`,
      [pdfId, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Lesson PDF not found', 404);
    await removeFileIfExists(result.rows[0].file_path);

    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete lesson PDF', 500, { detail: error.message });
  }
};

const createAssignment = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  const assignmentText = hasText(req.body?.assignment_text)
    ? req.body.assignment_text.trim()
    : (hasText(req.body?.text) ? req.body.text.trim() : null);
  if (!assignmentText) {
    return sendError(res, 'assignment_text is required');
  }

  try {
    const lesson = await findLesson(lessonId);
    if (!lesson) return sendError(res, 'Lesson not found', 404);

    const result = await pool.query(
      `INSERT INTO guide_lesson_assignments (lesson_id, title, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, lesson_id, title, description, created_by, created_at, updated_at`,
      [lessonId, '', assignmentText, req.user.id]
    );

    return sendSuccess(res, mapAssignmentRow(result.rows[0]), 201);
  } catch (error) {
    return sendError(res, 'Failed to create assignment', 500, { detail: error.message });
  }
};

const updateAssignment = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const assignmentId = parseId(req.params.assignmentId);
  if (!lessonId || !assignmentId) return sendError(res, 'Invalid id');

  const assignmentText = hasText(req.body?.assignment_text)
    ? req.body.assignment_text.trim()
    : (hasText(req.body?.text) ? req.body.text.trim() : null);
  if (!assignmentText) {
    return sendError(res, 'assignment_text is required');
  }

  try {
    const result = await pool.query(
      `UPDATE guide_lesson_assignments
       SET title = '',
           description = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND lesson_id = $3
       RETURNING id, lesson_id, title, description, created_by, created_at, updated_at`,
      [assignmentText, assignmentId, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Assignment not found', 404);
    return sendSuccess(res, mapAssignmentRow(result.rows[0]));
  } catch (error) {
    return sendError(res, 'Failed to update assignment', 500, { detail: error.message });
  }
};

const deleteAssignment = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const assignmentId = parseId(req.params.assignmentId);
  if (!lessonId || !assignmentId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `DELETE FROM guide_lesson_assignments
       WHERE id = $1 AND lesson_id = $2
       RETURNING id`,
      [assignmentId, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Assignment not found', 404);
    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete assignment', 500, { detail: error.message });
  }
};

const createVocabulary = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  const { word, translation, example } = req.body;
  if (!hasText(word) || !hasText(translation)) {
    return sendError(res, 'word and translation are required');
  }

  try {
    const lesson = await findLesson(lessonId);
    if (!lesson) return sendError(res, 'Lesson not found', 404);

    const result = await pool.query(
      `INSERT INTO guide_lesson_vocabularies (lesson_id, word, translation, example, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, lesson_id, word, translation, example, created_by, created_at, updated_at`,
      [lessonId, word.trim(), translation.trim(), hasText(example) ? example.trim() : null, req.user.id]
    );

    return sendSuccess(res, result.rows[0], 201);
  } catch (error) {
    return sendError(res, 'Failed to create vocabulary item', 500, { detail: error.message });
  }
};

const updateVocabulary = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const vocabId = parseId(req.params.vocabId);
  if (!lessonId || !vocabId) return sendError(res, 'Invalid id');

  const { word, translation, example } = req.body;
  if (!hasText(word) || !hasText(translation)) {
    return sendError(res, 'word and translation are required');
  }

  try {
    const result = await pool.query(
      `UPDATE guide_lesson_vocabularies
       SET word = $1,
           translation = $2,
           example = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND lesson_id = $5
       RETURNING id, lesson_id, word, translation, example, created_by, created_at, updated_at`,
      [word.trim(), translation.trim(), hasText(example) ? example.trim() : null, vocabId, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Vocabulary item not found', 404);
    return sendSuccess(res, result.rows[0]);
  } catch (error) {
    return sendError(res, 'Failed to update vocabulary item', 500, { detail: error.message });
  }
};

const deleteVocabulary = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const vocabId = parseId(req.params.vocabId);
  if (!lessonId || !vocabId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `DELETE FROM guide_lesson_vocabularies
       WHERE id = $1 AND lesson_id = $2
       RETURNING id`,
      [vocabId, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Vocabulary item not found', 404);
    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete vocabulary item', 500, { detail: error.message });
  }
};

const uploadVocabularyPdf = async (req, res) => {
  const pdfFile = req.file;
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) {
    if (pdfFile?.path) await removeFileIfExists(pdfFile.path);
    return sendError(res, 'Invalid lessonId');
  }

  const { title } = req.body;
  if (!hasText(title)) {
    if (pdfFile?.path) await removeFileIfExists(pdfFile.path);
    return sendError(res, 'title is required');
  }
  if (!pdfFile) {
    return sendError(res, 'PDF file is required');
  }

  try {
    const lesson = await findLesson(lessonId);
    if (!lesson) {
      await removeFileIfExists(pdfFile.path);
      return sendError(res, 'Lesson not found', 404);
    }

    const result = await pool.query(
      `INSERT INTO guide_lesson_vocabulary_pdfs (
         lesson_id, title, file_path, file_name, file_size_bytes, mime_type, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, lesson_id, title, file_name, file_size_bytes, mime_type, created_by, created_at`,
      [
        lessonId,
        title.trim(),
        pdfFile.path,
        pdfFile.originalname,
        pdfFile.size,
        pdfFile.mimetype,
        req.user.id
      ]
    );

    return sendSuccess(res, {
      ...result.rows[0],
      protected_file_url: `/api/admin/guides/lessons/${lessonId}/vocabulary-pdfs/${result.rows[0].id}/file`,
    }, 201);
  } catch (error) {
    if (pdfFile?.path) await removeFileIfExists(pdfFile.path);
    return sendError(res, 'Failed to upload vocabulary PDF', 500, { detail: error.message });
  }
};

const listVocabularyPdfs = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  try {
    const rolePrefix = req.baseUrl.startsWith('/api/admin') ? '/api/admin' : '/api/teacher';
    const result = await pool.query(
      `SELECT id, lesson_id, title, file_name, file_size_bytes, mime_type, created_by, created_at
       FROM guide_lesson_vocabulary_pdfs
       WHERE lesson_id = $1
       ORDER BY id DESC`,
      [lessonId]
    );

    return sendSuccess(res, result.rows.map((row) => ({
      ...row,
      protected_file_url: `${rolePrefix}/guides/lessons/${lessonId}/vocabulary-pdfs/${row.id}/file`,
    })));
  } catch (error) {
    return sendError(res, 'Failed to fetch vocabulary PDFs', 500, { detail: error.message });
  }
};

const streamVocabularyPdfFile = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const pdfId = parseId(req.params.pdfId);
  if (!lessonId || !pdfId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `SELECT id, file_path, file_name, mime_type
       FROM guide_lesson_vocabulary_pdfs
       WHERE id = $1 AND lesson_id = $2`,
      [pdfId, lessonId]
    );
    if (result.rows.length === 0) return sendError(res, 'Vocabulary PDF not found', 404);

    const item = result.rows[0];
    if (!fs.existsSync(item.file_path)) return sendError(res, 'PDF file not found', 404);

    res.setHeader('Content-Type', item.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${item.file_name}"`);
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    return res.sendFile(path.resolve(item.file_path));
  } catch (error) {
    return sendError(res, 'Failed to open vocabulary PDF', 500, { detail: error.message });
  }
};

const deleteVocabularyPdf = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const pdfId = parseId(req.params.pdfId);
  if (!lessonId || !pdfId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `DELETE FROM guide_lesson_vocabulary_pdfs
       WHERE id = $1 AND lesson_id = $2
       RETURNING id, file_path`,
      [pdfId, lessonId]
    );
    if (result.rows.length === 0) return sendError(res, 'Vocabulary PDF not found', 404);
    await removeFileIfExists(result.rows[0].file_path);

    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete vocabulary PDF', 500, { detail: error.message });
  }
};

const uploadVocabularyImageItem = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) {
    if (req.file?.path) await removeFileIfExists(req.file.path);
    return sendError(res, 'Invalid lessonId');
  }

  const { title } = req.body;
  if (!hasText(title)) {
    if (req.file?.path) await removeFileIfExists(req.file.path);
    return sendError(res, 'title is required');
  }
  if (!req.file) return sendError(res, 'Image file is required');

  try {
    const lesson = await findLesson(lessonId);
    if (!lesson) {
      await removeFileIfExists(req.file.path);
      return sendError(res, 'Lesson not found', 404);
    }

    const result = await pool.query(
      `INSERT INTO guide_lesson_vocabulary_images (
         lesson_id, title, file_path, file_name, file_size_bytes, mime_type, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, lesson_id, title, file_name, file_size_bytes, mime_type, created_by, created_at`,
      [lessonId, title.trim(), req.file.path, req.file.originalname, req.file.size, req.file.mimetype, req.user.id]
    );

    return sendSuccess(res, {
      ...result.rows[0],
      protected_file_url: `/api/admin/guides/lessons/${lessonId}/vocabulary-images/${result.rows[0].id}/file`,
    }, 201);
  } catch (error) {
    await removeFileIfExists(req.file.path);
    return sendError(res, 'Failed to upload vocabulary image', 500, { detail: error.message });
  }
};

const listVocabularyImages = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  try {
    const rolePrefix = req.baseUrl.startsWith('/api/admin') ? '/api/admin' : '/api/teacher';
    const result = await pool.query(
      `SELECT id, lesson_id, title, file_name, file_size_bytes, mime_type, created_by, created_at
       FROM guide_lesson_vocabulary_images
       WHERE lesson_id = $1
       ORDER BY id DESC`,
      [lessonId]
    );

    return sendSuccess(res, result.rows.map((row) => ({
      ...row,
      protected_file_url: `${rolePrefix}/guides/lessons/${lessonId}/vocabulary-images/${row.id}/file`,
    })));
  } catch (error) {
    return sendError(res, 'Failed to fetch vocabulary images', 500, { detail: error.message });
  }
};

const streamVocabularyImageFile = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const imageId = parseId(req.params.imageId);
  if (!lessonId || !imageId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `SELECT id, file_path, file_name, mime_type
       FROM guide_lesson_vocabulary_images
       WHERE id = $1 AND lesson_id = $2`,
      [imageId, lessonId]
    );
    if (result.rows.length === 0) return sendError(res, 'Vocabulary image not found', 404);

    const item = result.rows[0];
    if (!fs.existsSync(item.file_path)) return sendError(res, 'Image file not found', 404);

    res.setHeader('Content-Type', item.mime_type || 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${item.file_name}"`);
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    return res.sendFile(path.resolve(item.file_path));
  } catch (error) {
    return sendError(res, 'Failed to open vocabulary image', 500, { detail: error.message });
  }
};

const deleteVocabularyImage = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const imageId = parseId(req.params.imageId);
  if (!lessonId || !imageId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `DELETE FROM guide_lesson_vocabulary_images
       WHERE id = $1 AND lesson_id = $2
       RETURNING id, file_path`,
      [imageId, lessonId]
    );
    if (result.rows.length === 0) return sendError(res, 'Vocabulary image not found', 404);
    await removeFileIfExists(result.rows[0].file_path);

    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete vocabulary image', 500, { detail: error.message });
  }
};

const createVocabularyMarkdown = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  const { content_markdown } = req.body;
  if (!hasText(content_markdown)) {
    return sendError(res, 'content_markdown is required');
  }

  try {
    const lesson = await findLesson(lessonId);
    if (!lesson) return sendError(res, 'Lesson not found', 404);

    const result = await pool.query(
      `INSERT INTO guide_lesson_vocabulary_markdowns (lesson_id, content_markdown, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, lesson_id, content_markdown, created_by, created_at, updated_at`,
      [lessonId, content_markdown.trim(), req.user.id]
    );

    return sendSuccess(res, mapVocabularyMarkdownRow(result.rows[0]), 201);
  } catch (error) {
    return sendError(res, 'Failed to create vocabulary markdown', 500, { detail: error.message });
  }
};

const updateVocabularyMarkdown = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const markdownId = parseId(req.params.markdownId);
  if (!lessonId || !markdownId) return sendError(res, 'Invalid id');

  const { content_markdown } = req.body;
  if (!hasText(content_markdown)) {
    return sendError(res, 'content_markdown is required');
  }

  try {
    const result = await pool.query(
      `UPDATE guide_lesson_vocabulary_markdowns
       SET content_markdown = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND lesson_id = $3
       RETURNING id, lesson_id, content_markdown, created_by, created_at, updated_at`,
      [content_markdown.trim(), markdownId, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Vocabulary markdown not found', 404);
    return sendSuccess(res, mapVocabularyMarkdownRow(result.rows[0]));
  } catch (error) {
    return sendError(res, 'Failed to update vocabulary markdown', 500, { detail: error.message });
  }
};

const deleteVocabularyMarkdown = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const markdownId = parseId(req.params.markdownId);
  if (!lessonId || !markdownId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `DELETE FROM guide_lesson_vocabulary_markdowns
       WHERE id = $1 AND lesson_id = $2
       RETURNING id`,
      [markdownId, lessonId]
    );
    if (result.rows.length === 0) return sendError(res, 'Vocabulary markdown not found', 404);
    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete vocabulary markdown', 500, { detail: error.message });
  }
};

const listVocabularyMarkdowns = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  try {
    const result = await pool.query(
      `SELECT id, lesson_id, content_markdown, created_by, created_at, updated_at
       FROM guide_lesson_vocabulary_markdowns
       WHERE lesson_id = $1
       ORDER BY id DESC`,
      [lessonId]
    );
    return sendSuccess(res, result.rows.map(mapVocabularyMarkdownRow));
  } catch (error) {
    return sendError(res, 'Failed to fetch vocabulary markdowns', 500, { detail: error.message });
  }
};

const createVideo = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  const { title, youtube_url } = req.body;
  if (!hasText(title) || !hasText(youtube_url)) {
    return sendError(res, 'title and youtube_url are required');
  }

  const videoId = extractYouTubeVideoId(youtube_url);
  if (!videoId) return sendError(res, 'Invalid YouTube URL');

  try {
    const lesson = await findLesson(lessonId);
    if (!lesson) return sendError(res, 'Lesson not found', 404);

    const result = await pool.query(
      `INSERT INTO guide_lesson_videos (lesson_id, title, youtube_url, youtube_video_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, lesson_id, title, youtube_url, youtube_video_id, created_by, created_at`,
      [lessonId, title.trim(), youtube_url.trim(), videoId, req.user.id]
    );

    return sendSuccess(res, {
      ...result.rows[0],
      embed_url: buildYouTubeEmbedUrl(result.rows[0].youtube_video_id),
    }, 201);
  } catch (error) {
    return sendError(res, 'Failed to create video link', 500, { detail: error.message });
  }
};

const deleteVideo = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  const videoId = parseId(req.params.videoId);
  if (!lessonId || !videoId) return sendError(res, 'Invalid id');

  try {
    const result = await pool.query(
      `DELETE FROM guide_lesson_videos
       WHERE id = $1 AND lesson_id = $2
       RETURNING id`,
      [videoId, lessonId]
    );

    if (result.rows.length === 0) return sendError(res, 'Video link not found', 404);
    return sendSuccess(res, { id: result.rows[0].id, deleted: true });
  } catch (error) {
    return sendError(res, 'Failed to delete video link', 500, { detail: error.message });
  }
};

const getLessonDetail = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  try {
    const lesson = await findLesson(lessonId);
    if (!lesson) return sendError(res, 'Lesson not found', 404);

    const [notes, pdfs, assignments, vocabulary, vocabularyPdfs, vocabularyImages, vocabularyMarkdowns, videos, speechSettings] = await Promise.all([
      pool.query(
        `SELECT id, lesson_id, title, content_markdown, color, created_by, created_at, updated_at
         FROM guide_lesson_notes
         WHERE lesson_id = $1
         ORDER BY id ASC`,
        [lessonId]
      ),
      pool.query(
        `SELECT id, lesson_id, title, file_name, file_size_bytes, mime_type, created_by, created_at
         FROM guide_lesson_pdfs
         WHERE lesson_id = $1
         ORDER BY id DESC`,
        [lessonId]
      ),
      pool.query(
        `SELECT id, lesson_id, title, description, created_by, created_at, updated_at
         FROM guide_lesson_assignments
         WHERE lesson_id = $1
         ORDER BY id DESC`,
        [lessonId]
      ),
      pool.query(
        `SELECT id, lesson_id, word, translation, example, created_by, created_at, updated_at
         FROM guide_lesson_vocabularies
         WHERE lesson_id = $1
         ORDER BY id DESC`,
        [lessonId]
      ),
      pool.query(
        `SELECT id, lesson_id, title, file_name, file_size_bytes, mime_type, created_by, created_at
         FROM guide_lesson_vocabulary_pdfs
         WHERE lesson_id = $1
         ORDER BY id DESC`,
        [lessonId]
      ),
      pool.query(
        `SELECT id, lesson_id, title, file_name, file_size_bytes, mime_type, created_by, created_at
         FROM guide_lesson_vocabulary_images
         WHERE lesson_id = $1
         ORDER BY id DESC`,
        [lessonId]
      ),
      pool.query(
        `SELECT id, lesson_id, content_markdown, created_by, created_at, updated_at
         FROM guide_lesson_vocabulary_markdowns
         WHERE lesson_id = $1
         ORDER BY id DESC`,
        [lessonId]
      ),
      pool.query(
        `SELECT id, lesson_id, title, youtube_url, youtube_video_id, created_by, created_at
         FROM guide_lesson_videos
         WHERE lesson_id = $1
         ORDER BY id DESC`,
        [lessonId]
      ),
      getSpeechSettingsForUser(req.user.id),
    ]);

    const rolePrefix = req.baseUrl.startsWith('/api/admin') ? '/api/admin' : '/api/teacher';

    return sendSuccess(res, {
      lesson: {
        id: lesson.id,
        level_id: lesson.level_id,
        topic_name: lesson.title,
        order_index: lesson.order_index,
        level_title: lesson.level_title,
        created_at: lesson.created_at,
        updated_at: lesson.updated_at,
      },
      notes: notes.rows.map(mapNoteRow),
      pdfs: pdfs.rows.map((row) => ({
        ...row,
        protected_file_url: `${rolePrefix}/guides/lessons/${lessonId}/pdfs/${row.id}/file`,
      })),
      assignments: assignments.rows.map(mapAssignmentRow),
      vocabulary: vocabulary.rows.map(mapVocabularyRow),
      vocabulary_pdfs: vocabularyPdfs.rows.map((row) => ({
        ...row,
        protected_file_url: `${rolePrefix}/guides/lessons/${lessonId}/vocabulary-pdfs/${row.id}/file`,
      })),
      vocabulary_images: vocabularyImages.rows.map((row) => ({
        ...row,
        protected_file_url: `${rolePrefix}/guides/lessons/${lessonId}/vocabulary-images/${row.id}/file`,
      })),
      vocabulary_markdowns: vocabularyMarkdowns.rows.map(mapVocabularyMarkdownRow),
      videos: videos.rows.map((row) => ({
        ...row,
        embed_url: buildYouTubeEmbedUrl(row.youtube_video_id),
      })),
      speech_settings: speechSettings,
    });
  } catch (error) {
    return sendError(res, 'Failed to fetch lesson details', 500, { detail: error.message });
  }
};

const listLessonPdfs = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  try {
    const rolePrefix = req.baseUrl.startsWith('/api/admin') ? '/api/admin' : '/api/teacher';
    const result = await pool.query(
      `SELECT id, lesson_id, title, file_name, file_size_bytes, mime_type, created_by, created_at
       FROM guide_lesson_pdfs
       WHERE lesson_id = $1
       ORDER BY id DESC`,
      [lessonId]
    );

    return sendSuccess(res, result.rows.map((row) => ({
      ...row,
      protected_file_url: `${rolePrefix}/guides/lessons/${lessonId}/pdfs/${row.id}/file`,
    })));
  } catch (error) {
    return sendError(res, 'Failed to fetch lesson PDFs', 500, { detail: error.message });
  }
};

const listAssignments = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  try {
    const result = await pool.query(
      `SELECT id, lesson_id, title, description, created_by, created_at, updated_at
       FROM guide_lesson_assignments
       WHERE lesson_id = $1
       ORDER BY id DESC`,
      [lessonId]
    );
    return sendSuccess(res, result.rows.map(mapAssignmentRow));
  } catch (error) {
    return sendError(res, 'Failed to fetch assignments', 500, { detail: error.message });
  }
};

const listVocabularies = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  try {
    const result = await pool.query(
      `SELECT id, lesson_id, word, translation, example, created_by, created_at, updated_at
       FROM guide_lesson_vocabularies
       WHERE lesson_id = $1
       ORDER BY id DESC`,
      [lessonId]
    );
    return sendSuccess(res, result.rows.map(mapVocabularyRow));
  } catch (error) {
    return sendError(res, 'Failed to fetch vocabulary list', 500, { detail: error.message });
  }
};

const getSpeechSettings = async (req, res) => {
  try {
    const settings = await getSpeechSettingsForUser(req.user.id);
    return sendSuccess(res, settings);
  } catch (error) {
    return sendError(res, 'Failed to fetch speech settings', 500, { detail: error.message });
  }
};

const updateSpeechSettings = async (req, res) => {
  const incomingRate = req.body?.speech_rate ?? req.body?.rate ?? req.body?.speed;
  const speechRate = normalizeSpeechRate(incomingRate);
  if (speechRate === null) {
    return sendError(
      res,
      'speech_rate must be a number between 0.5 and 2.0',
      400,
      { min_rate: MIN_SPEECH_RATE, max_rate: MAX_SPEECH_RATE }
    );
  }

  try {
    const result = await pool.query(
      `INSERT INTO guide_user_speech_settings (user_id, speech_rate)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET speech_rate = EXCLUDED.speech_rate, updated_at = CURRENT_TIMESTAMP
       RETURNING speech_rate, updated_at`,
      [req.user.id, speechRate]
    );

    return sendSuccess(res, {
      speech_rate: Number(result.rows[0].speech_rate),
      min_rate: MIN_SPEECH_RATE,
      max_rate: MAX_SPEECH_RATE,
      updated_at: result.rows[0].updated_at,
    });
  } catch (error) {
    return sendError(res, 'Failed to update speech settings', 500, { detail: error.message });
  }
};

const listVideos = async (req, res) => {
  const lessonId = parseId(req.params.lessonId);
  if (!lessonId) return sendError(res, 'Invalid lessonId');

  try {
    const result = await pool.query(
      `SELECT id, lesson_id, title, youtube_url, youtube_video_id, created_by, created_at
       FROM guide_lesson_videos
       WHERE lesson_id = $1
       ORDER BY id DESC`,
      [lessonId]
    );

    return sendSuccess(res, result.rows.map((row) => ({
      ...row,
      embed_url: buildYouTubeEmbedUrl(row.youtube_video_id),
    })));
  } catch (error) {
    return sendError(res, 'Failed to fetch video list', 500, { detail: error.message });
  }
};

module.exports = {
  uploadMainPdf,
  uploadLessonPdf,
  uploadVocabularyImage,
  uploadLevelBanner,
  createLevel,
  getLevels,
  getLevelById,
  streamLevelBanner,
  updateLevel,
  deleteLevel,
  uploadLevelMainPdf,
  getLevelMainPdfMeta,
  streamLevelMainPdf,
  deleteLevelMainPdf,
  createLesson,
  getLevelLessons,
  reorderLessons,
  updateLesson,
  deleteLesson,
  createLessonNote,
  updateLessonNote,
  deleteLessonNote,
  uploadLessonPdfItem,
  streamLessonPdfFile,
  deleteLessonPdfItem,
  listLessonPdfs,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  listAssignments,
  createVocabulary,
  updateVocabulary,
  deleteVocabulary,
  listVocabularies,
  getSpeechSettings,
  updateSpeechSettings,
  uploadVocabularyPdf,
  listVocabularyPdfs,
  streamVocabularyPdfFile,
  deleteVocabularyPdf,
  uploadVocabularyImageItem,
  listVocabularyImages,
  streamVocabularyImageFile,
  deleteVocabularyImage,
  createVocabularyMarkdown,
  updateVocabularyMarkdown,
  deleteVocabularyMarkdown,
  listVocabularyMarkdowns,
  createVideo,
  deleteVideo,
  listVideos,
  getLessonDetail,
};
