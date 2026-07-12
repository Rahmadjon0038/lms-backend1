const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../config/db');

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const storyUploadDir = path.join(__dirname, '..', 'uploads', 'stories');
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200 MB

if (!fs.existsSync(storyUploadDir)) {
  fs.mkdirSync(storyUploadDir, { recursive: true });
}

const storyVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storyUploadDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${crypto.randomUUID()}-${safeName}`);
    },
  }),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      cb(new Error('Faqat video fayl yuklash mumkin'));
      return;
    }
    cb(null, true);
  },
});

exports.storyVideoUpload = storyVideoUpload;

const buildFileUrl = (filePath) => {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  return `${PUBLIC_BASE_URL}${filePath}`;
};

const removeFileQuietly = (relativePath) => {
  try {
    if (!relativePath || /^https?:\/\//i.test(relativePath)) return;
    const absolute = path.join(__dirname, '..', relativePath.replace(/^\//, ''));
    if (fs.existsSync(absolute)) {
      fs.unlinkSync(absolute);
    }
  } catch (error) {
    console.warn(`⚠️ Fayl o'chirilmadi: ${error.message}`);
  }
};

const isAdmin = (role) => role === 'admin' || role === 'super_admin';

const mapStory = (row) => ({
  id: row.id,
  title: row.title,
  video_path: row.video_path,
  video_url: buildFileUrl(row.video_path),
  order_index: row.order_index,
  is_active: row.is_active,
  created_at: row.created_at,
});

// ============================ STORIES ============================

// GET /api/content/stories — hamma rollar uchun (faqat faollar).
// Admin ?all=1 bersa nofaollarni ham ko'radi (boshqaruv paneli uchun).
exports.getStories = async (req, res) => {
  try {
    const showAll = isAdmin(req.user.role) && String(req.query.all || '') === '1';
    const result = await pool.query(
      `SELECT id, title, video_path, order_index, is_active, created_at
       FROM stories
       ${showAll ? '' : 'WHERE is_active = TRUE'}
       ORDER BY order_index ASC, created_at DESC`
    );
    res.json({ success: true, data: result.rows.map(mapStory) });
  } catch (error) {
    console.error('Storislarni olishda xatolik:', error);
    res.status(500).json({ success: false, message: 'Server xatoligi', error: error.message });
  }
};

// POST /api/content/stories — video (multipart, field: video), title ixtiyoriy
exports.createStory = async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'video fayl majburiy' });
    }

    const videoPath = `/uploads/stories/${req.file.filename}`;
    const orderIndex = parseInt(req.body.order_index) || 0;

    const result = await pool.query(
      `INSERT INTO stories (title, video_path, order_index, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, video_path, order_index, is_active, created_at`,
      [title, videoPath, orderIndex, req.user.id]
    );

    res.status(201).json({
      success: true,
      message: 'Storis qo\'shildi',
      data: mapStory(result.rows[0]),
    });
  } catch (error) {
    console.error('Storis yaratishda xatolik:', error);
    res.status(500).json({ success: false, message: 'Server xatoligi', error: error.message });
  }
};

// PATCH /api/content/stories/:id — title/order/is_active, ixtiyoriy yangi video
exports.updateStory = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await pool.query('SELECT * FROM stories WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      if (req.file) removeFileQuietly(`/uploads/stories/${req.file.filename}`);
      return res.status(404).json({ success: false, message: 'Storis topilmadi' });
    }

    const current = existing.rows[0];
    const title = req.body.title !== undefined ? String(req.body.title).trim() : current.title;
    const orderIndex = req.body.order_index !== undefined
      ? parseInt(req.body.order_index) || 0
      : current.order_index;
    const isActive = req.body.is_active !== undefined
      ? String(req.body.is_active) === 'true' || req.body.is_active === true
      : current.is_active;

    let videoPath = current.video_path;
    if (req.file) {
      videoPath = `/uploads/stories/${req.file.filename}`;
      removeFileQuietly(current.video_path);
    }

    const result = await pool.query(
      `UPDATE stories
       SET title = $1, order_index = $2, is_active = $3, video_path = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, title, video_path, order_index, is_active, created_at`,
      [title, orderIndex, isActive, videoPath, id]
    );

    res.json({
      success: true,
      message: 'Storis yangilandi',
      data: mapStory(result.rows[0]),
    });
  } catch (error) {
    console.error('Storis yangilashda xatolik:', error);
    res.status(500).json({ success: false, message: 'Server xatoligi', error: error.message });
  }
};

// DELETE /api/content/stories/:id
exports.deleteStory = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await pool.query(
      'DELETE FROM stories WHERE id = $1 RETURNING video_path',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Storis topilmadi' });
    }
    removeFileQuietly(result.rows[0].video_path);
    res.json({ success: true, message: 'Storis o\'chirildi' });
  } catch (error) {
    console.error('Storis o\'chirishda xatolik:', error);
    res.status(500).json({ success: false, message: 'Server xatoligi', error: error.message });
  }
};

// ============================ NEWS ============================

// GET /api/content/news — hamma rollar (faqat faollar); admin ?all=1
exports.getNews = async (req, res) => {
  try {
    const showAll = isAdmin(req.user.role) && String(req.query.all || '') === '1';
    const result = await pool.query(
      `SELECT id, tag, title, subtitle, body, order_index, is_active, created_at
       FROM news
       ${showAll ? '' : 'WHERE is_active = TRUE'}
       ORDER BY order_index ASC, created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Yangiliklarni olishda xatolik:', error);
    res.status(500).json({ success: false, message: 'Server xatoligi', error: error.message });
  }
};

// POST /api/content/news
exports.createNews = async (req, res) => {
  try {
    const { tag, title, subtitle, body, order_index } = req.body;
    if (!String(title || '').trim() || !String(body || '').trim()) {
      return res.status(400).json({ success: false, message: 'title va body majburiy' });
    }

    const result = await pool.query(
      `INSERT INTO news (tag, title, subtitle, body, order_index, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, tag, title, subtitle, body, order_index, is_active, created_at`,
      [
        String(tag || 'Yangilik').trim() || 'Yangilik',
        String(title).trim(),
        String(subtitle || '').trim(),
        String(body).trim(),
        parseInt(order_index) || 0,
        req.user.id,
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Yangilik qo\'shildi',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Yangilik yaratishda xatolik:', error);
    res.status(500).json({ success: false, message: 'Server xatoligi', error: error.message });
  }
};

// PATCH /api/content/news/:id
exports.updateNews = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await pool.query('SELECT * FROM news WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Yangilik topilmadi' });
    }

    const current = existing.rows[0];
    const next = {
      tag: req.body.tag !== undefined ? String(req.body.tag).trim() || 'Yangilik' : current.tag,
      title: req.body.title !== undefined ? String(req.body.title).trim() : current.title,
      subtitle: req.body.subtitle !== undefined ? String(req.body.subtitle).trim() : current.subtitle,
      body: req.body.body !== undefined ? String(req.body.body).trim() : current.body,
      order_index: req.body.order_index !== undefined
        ? parseInt(req.body.order_index) || 0
        : current.order_index,
      is_active: req.body.is_active !== undefined
        ? String(req.body.is_active) === 'true' || req.body.is_active === true
        : current.is_active,
    };

    if (!next.title || !next.body) {
      return res.status(400).json({ success: false, message: 'title va body bo\'sh bo\'lishi mumkin emas' });
    }

    const result = await pool.query(
      `UPDATE news
       SET tag = $1, title = $2, subtitle = $3, body = $4, order_index = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, tag, title, subtitle, body, order_index, is_active, created_at`,
      [next.tag, next.title, next.subtitle, next.body, next.order_index, next.is_active, id]
    );

    res.json({
      success: true,
      message: 'Yangilik yangilandi',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Yangilik yangilashda xatolik:', error);
    res.status(500).json({ success: false, message: 'Server xatoligi', error: error.message });
  }
};

// DELETE /api/content/news/:id
exports.deleteNews = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await pool.query('DELETE FROM news WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Yangilik topilmadi' });
    }
    res.json({ success: true, message: 'Yangilik o\'chirildi' });
  } catch (error) {
    console.error('Yangilik o\'chirishda xatolik:', error);
    res.status(500).json({ success: false, message: 'Server xatoligi', error: error.message });
  }
};
