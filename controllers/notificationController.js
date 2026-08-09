const db = require('../config/db');
const { sendUserPushNotification } = require('../services/pushNotificationService');

const toInt = (value, fallback = 0) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeJson = (value) => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value;
};

const createNotificationRecord = async ({
  userId,
  type = 'payment',
  title,
  body,
  data = {},
  createdBy = null,
  branchId = null,
}) => {
  let resolvedBranchId = branchId;
  if (!resolvedBranchId) {
    const userBranch = await db.query(
      'SELECT branch_id FROM users WHERE id = $1 LIMIT 1',
      [userId],
    );
    resolvedBranchId = userBranch.rows[0]?.branch_id || 1;
  }
  const result = await db.query(
    `
      INSERT INTO notifications (
        user_id, type, title, body, data, created_by, branch_id
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
      RETURNING *
    `,
    [userId, type, title, body, JSON.stringify(safeJson(data)), createdBy, resolvedBranchId],
  );

  return result.rows[0];
};

const sendNotificationToUser = async ({
  userId,
  type = 'payment',
  title,
  body,
  pushTitle,
  pushBody,
  data = {},
  createdBy = null,
  branchId = null,
}) => {
  const notification = await createNotificationRecord({
    userId,
    type,
    title,
    body,
    data,
    createdBy,
    branchId,
  });

  const tokenResult = await db.query(
    'SELECT fcm_token FROM users WHERE id = $1',
    [userId],
  );
  const fcmToken = tokenResult.rows[0]?.fcm_token?.toString().trim() ?? '';

  if (fcmToken) {
    console.log(
      `🔔 Push yuborilmoqda: user_id=${userId}, token_prefix=${fcmToken.slice(0, 18)}..., type=${type}`
    );
    await sendUserPushNotification({
      token: fcmToken,
      title: pushTitle || 'Taraqqiyot Teaching Center',
      body: pushBody || body,
      data: {
        ...data,
        route: data.route || '/notification-detail',
        notification_id: String(notification.id),
        type,
      },
      });
  } else {
    console.warn(`⚠️ FCM token topilmadi: user_id=${userId}. Push yuborilmadi, faqat notification bazaga yozildi.`);
  }

  return notification;
};

exports.getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(toInt(req.query.page, 1), 1);
    const limit = Math.min(Math.max(toInt(req.query.limit, 20), 1), 100);
    const offset = (page - 1) * limit;

    const result = await db.query(
      `
        SELECT
          id,
          type,
          title,
          body,
          data,
          is_read,
          TO_CHAR(created_at AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') AS created_at,
          created_at AS created_at_raw
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset],
    );

    const unreadResult = await db.query(
      `
        SELECT COUNT(*) AS unread_count
        FROM notifications
        WHERE user_id = $1 AND is_read = false
      `,
      [userId],
    );

    const totalResult = await db.query(
      `
        SELECT COUNT(*) AS total_count
        FROM notifications
        WHERE user_id = $1
      `,
      [userId],
    );

    res.json({
      success: true,
      data: {
        notifications: result.rows,
        summary: {
          total_count: toInt(totalResult.rows[0]?.total_count, 0),
          unread_count: toInt(unreadResult.rows[0]?.unread_count, 0),
        },
      },
    });
  } catch (error) {
    console.error('❌ getMyNotifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Bildirishnomalarni olishda xatolik',
      error: error.message,
    });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const result = await db.query(
      `
        SELECT COUNT(*) AS unread_count
        FROM notifications
        WHERE user_id = $1 AND is_read = false
      `,
      [req.user.id],
    );

    res.json({
      success: true,
      data: {
        unread_count: toInt(result.rows[0]?.unread_count, 0),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Bildirishnoma sonini olishda xatolik',
      error: error.message,
    });
  }
};

exports.markNotificationAsRead = async (req, res) => {
  try {
    const notificationId = toInt(req.params.id, 0);
    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: 'Notification ID noto‘g‘ri',
      });
    }

    const result = await db.query(
      `
        UPDATE notifications
        SET is_read = true,
            read_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `,
      [notificationId, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bildirishnoma topilmadi',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Bildirishnomani o‘qilgan deb belgilashda xatolik',
      error: error.message,
    });
  }
};

exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const result = await db.query(
      `
        UPDATE notifications
        SET is_read = true,
            read_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND is_read = false
        RETURNING id
      `,
      [req.user.id],
    );

    res.json({
      success: true,
      data: {
        updated_count: result.rowCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Barchasini o‘qilgan deb belgilashda xatolik',
      error: error.message,
    });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const notificationId = toInt(req.params.id, 0);
    if (!notificationId) {
      return res.status(400).json({
        success: false,
        message: 'Notification ID noto‘g‘ri',
      });
    }

    const result = await db.query(
      `
        DELETE FROM notifications
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `,
      [notificationId, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Bildirishnoma topilmadi',
      });
    }

    res.json({
      success: true,
      data: {
        deleted_id: notificationId,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Bildirishnomani o‘chirishda xatolik',
      error: error.message,
    });
  }
};

exports.notifyUser = sendNotificationToUser;
exports.createNotificationRecord = createNotificationRecord;
