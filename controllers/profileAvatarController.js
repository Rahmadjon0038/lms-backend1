const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../config/db');

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const avatarUploadDir = path.join(__dirname, '..', 'uploads', 'profile_avatars');
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

if (!fs.existsSync(avatarUploadDir)) {
  fs.mkdirSync(avatarUploadDir, { recursive: true });
}

const createImageUpload = () => multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarUploadDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${crypto.randomUUID()}-${safeName}`);
    },
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

const uploadAvatarImage = createImageUpload().single('image');

const buildImageUrl = (filePath) => {
  if (!filePath) return null;
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  return filePath.startsWith('/') ? filePath : `/${filePath}`;
};

const slugify = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);

const generateAvatarKey = (name) => {
  const slug = slugify(name);
  const suffix = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  return slug ? `avatar_${slug}_${suffix}` : `avatar_${suffix}`;
};

const getProfileAvatars = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, avatar_key, name, image_path, is_active, created_by, created_at
       FROM profile_avatars
       WHERE is_active = TRUE
       ORDER BY created_at DESC, id DESC`
    );

    res.json({
      success: true,
      avatars: result.rows.map((row) => ({
        id: row.id,
        avatar_key: row.avatar_key,
        name: row.name,
        image_path: row.image_path,
        image_url: buildImageUrl(row.image_path),
        is_active: row.is_active,
        created_by: row.created_by,
        created_at: row.created_at,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Avatarlar ro\'yxatini olishda xatolik',
      error: error.message,
    });
  }
};

const uploadProfileAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Avatar rasmi yuborilmadi',
      });
    }

    const name = String(req.body?.name ?? '').trim() || path.parse(req.file.originalname).name;
    const providedKey = String(req.body?.avatar_key ?? '').trim();
    const avatarKey = providedKey || generateAvatarKey(name);
    const imagePath = `/uploads/profile_avatars/${req.file.filename}`;
    const isActive = req.body?.is_active === undefined
      ? true
      : ['true', '1', true, 1].includes(req.body.is_active);

    const inserted = await pool.query(
      `INSERT INTO profile_avatars (avatar_key, name, image_path, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, avatar_key, name, image_path, is_active, created_by, created_at`,
      [avatarKey, name, imagePath, isActive, req.user?.id ?? null]
    );

    const avatar = inserted.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Avatar yuklandi',
      avatar: {
        ...avatar,
        image_url: buildImageUrl(avatar.image_path),
      },
    });
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Avatar yuklashda xatolik',
      error: error.message,
    });
  }
};

module.exports = {
  uploadAvatarImage,
  getProfileAvatars,
  uploadProfileAvatar,
};
