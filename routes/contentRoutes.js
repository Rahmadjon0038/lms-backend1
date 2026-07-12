const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const contentController = require('../controllers/contentController');

const router = express.Router();

router.use(protect);

// Multer xatolarini (hajm/format) tushunarli javobga aylantiruvchi wrapper
const withUpload = (handler) => (req, res, next) => {
  contentController.storyVideoUpload.single('video')(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Video yuklashda xatolik',
      });
    }
    return handler(req, res, next);
  });
};

// Storislar
router.get('/stories', contentController.getStories);
router.post(
  '/stories',
  roleCheck(['admin', 'super_admin']),
  withUpload(contentController.createStory)
);
router.patch(
  '/stories/:id',
  roleCheck(['admin', 'super_admin']),
  withUpload(contentController.updateStory)
);
router.delete(
  '/stories/:id',
  roleCheck(['admin', 'super_admin']),
  contentController.deleteStory
);

// Yangiliklar
router.get('/news', contentController.getNews);
router.post(
  '/news',
  roleCheck(['admin', 'super_admin']),
  contentController.createNews
);
router.patch(
  '/news/:id',
  roleCheck(['admin', 'super_admin']),
  contentController.updateNews
);
router.delete(
  '/news/:id',
  roleCheck(['admin', 'super_admin']),
  contentController.deleteNews
);

module.exports = router;
