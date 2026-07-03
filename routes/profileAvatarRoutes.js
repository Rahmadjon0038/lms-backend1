const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const profileAvatarController = require('../controllers/profileAvatarController');

const router = express.Router();

router.use(protect);

router.get('/', profileAvatarController.getProfileAvatars);

router.post(
  '/',
  roleCheck(['admin', 'super_admin']),
  (req, res, next) => {
    profileAvatarController.uploadAvatarImage(req, res, (err) => {
      if (!err) return next();

      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'Image size must not exceed 10MB',
          errors: { image: 'max_size_limit' },
        });
      }

      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed',
        errors: {},
      });
    });
  },
  profileAvatarController.uploadProfileAvatar
);

module.exports = router;
