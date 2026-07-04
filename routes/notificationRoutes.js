const express = require('express');
const router = express.Router();

const {
  getMyNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} = require('../controllers/notificationController');

const { protect } = require('../middlewares/authMiddleware');

router.get('/', protect, getMyNotifications);
router.get('/unread-count', protect, getUnreadCount);
router.patch('/:id/read', protect, markNotificationAsRead);
router.patch('/read-all', protect, markAllNotificationsAsRead);

module.exports = router;
