const pool = require('../config/db');

const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const GROUP_CHAT_ID = String(process.env.TELEGRAM_GROUP_CHAT_ID || '').trim();

let bot = null;

const monthLabelUz = (monthKey) => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  const names = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
  ];
  if (!year || !month || month < 1 || month > 12) return monthKey || '';
  return `${names[month - 1]} ${year}`;
};

const logMessage = async ({
  messageType,
  lessonId,
  teacherId,
  teacherName,
  groupId,
  groupName,
  branchId,
  chatId,
  telegramMessageId,
  telegramFileId,
  caption,
  reportMonth,
}) => {
  await pool.query(
    `
      INSERT INTO telegram_bot_messages (
        message_type, lesson_id, teacher_id, teacher_name, group_id, group_name,
        branch_id, chat_id, telegram_message_id, telegram_file_id, caption, report_month
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
    [
      messageType,
      lessonId || null,
      teacherId || null,
      teacherName || '',
      groupId || null,
      groupName || '',
      branchId || 1,
      chatId,
      telegramMessageId || null,
      telegramFileId || null,
      caption || '',
      reportMonth,
    ]
  );
};

// Bot sozlanmagan bo'lsa (token/chat_id yo'q) — asosiy statistika/uy vazifa
// oqimi buzilmasligi uchun barcha funksiyalar jimgina hech narsa qilmaydi.
if (!BOT_TOKEN || !GROUP_CHAT_ID) {
  console.warn(
    "⚠️ TELEGRAM_BOT_TOKEN yoki TELEGRAM_GROUP_CHAT_ID sozlanmagan — Telegram bot o'chirilgan holatda ishlaydi."
  );
} else {
  const TelegramBot = require('node-telegram-bot-api');
  bot = new TelegramBot(BOT_TOKEN, { polling: true });

  bot.on('polling_error', (error) => {
    console.error('❌ Telegram bot polling xatolik:', error.message);
  });

  const getTeachersForMonth = async (monthKey) => {
    const result = await pool.query(
      `
        SELECT DISTINCT teacher_id, teacher_name
        FROM telegram_bot_messages
        WHERE report_month = $1 AND teacher_id IS NOT NULL
        ORDER BY teacher_name
      `,
      [monthKey]
    );
    return result.rows;
  };

  const resendTeacherMonth = async (chatId, teacherId, monthKey) => {
    const result = await pool.query(
      `
        SELECT *
        FROM telegram_bot_messages
        WHERE teacher_id = $1 AND report_month = $2
        ORDER BY created_at ASC
      `,
      [teacherId, monthKey]
    );

    if (result.rows.length === 0) {
      await bot.sendMessage(chatId, "Bu oy uchun hech narsa topilmadi.");
      return;
    }

    for (const row of result.rows) {
      try {
        if (row.telegram_file_id) {
          await bot.sendPhoto(chatId, row.telegram_file_id, {
            caption: row.caption || undefined,
          });
        } else {
          await bot.sendMessage(chatId, row.caption || '(bo\'sh xabar)');
        }
      } catch (error) {
        console.warn(`⚠️ Telegram qayta yuborishda xatolik (message id=${row.id}): ${error.message}`);
      }
    }
  };

  const sendTeacherPicker = async (chatId) => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const teachers = await getTeachersForMonth(monthKey);

    if (teachers.length === 0) {
      await bot.sendMessage(chatId, `${monthLabelUz(monthKey)} uchun hali hech kim hisobot yubormagan.`);
      return;
    }

    const inlineKeyboard = teachers.map((teacher) => [
      {
        text: teacher.teacher_name || `Teacher #${teacher.teacher_id}`,
        callback_data: `teacher_month:${teacher.teacher_id}:${monthKey}`,
      },
    ]);

    await bot.sendMessage(
      chatId,
      `${monthLabelUz(monthKey)} davomida hisobot/uyga vazifa yuborgan ustozlar:`,
      { reply_markup: { inline_keyboard: inlineKeyboard } }
    );
  };

  bot.onText(/^\/start/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      "Salom! Bu Taraqqiyot Teaching Center statistika/uyga vazifa botining yordamchisi.\n\n" +
        "/hisobotlar — shu oy uchun hisobot yuborgan ustozlar ro'yxati va ularning barcha hisobotlarini ko'rish."
    );
  });

  bot.onText(/^\/hisobotlar/, (msg) => {
    sendTeacherPicker(msg.chat.id).catch((error) => {
      console.error('❌ /hisobotlar buyrug\'ida xatolik:', error);
    });
  });

  bot.on('callback_query', async (query) => {
    const data = String(query.data || '');
    if (!data.startsWith('teacher_month:')) return;

    const [, teacherIdRaw, monthKey] = data.split(':');
    const teacherId = Number.parseInt(teacherIdRaw, 10);

    try {
      await bot.answerCallbackQuery(query.id, { text: 'Yuborilmoqda...' });
      if (Number.isFinite(teacherId) && monthKey) {
        await resendTeacherMonth(query.message.chat.id, teacherId, monthKey);
      }
    } catch (error) {
      console.error('❌ Telegram callback_query xatolik:', error);
    }
  });
}

// Statistika screenshotini (rasm) guruhga yuboradi. Rasm serverda hech qachon
// diskka yozilmaydi — faqat xotiradagi buffer forward qilinadi, Telegram
// qaytargan file_id esa keyinchalik "oylik hisobot" tugmasi orqali qayta
// yuborish uchun bazada saqlanadi.
exports.sendReportScreenshot = async ({
  teacherId,
  teacherName,
  groupId,
  groupName,
  lessonId,
  branchId,
  imageBuffer,
  caption,
  reportMonth,
}) => {
  if (!bot) return null;

  const message = await bot.sendPhoto(GROUP_CHAT_ID, imageBuffer, { caption }, {
    filename: `report_${lessonId}.png`,
    contentType: 'image/png',
  });

  const photos = Array.isArray(message.photo) ? message.photo : [];
  const largestPhoto = photos[photos.length - 1];

  await logMessage({
    messageType: 'report',
    lessonId,
    teacherId,
    teacherName,
    groupId,
    groupName,
    branchId,
    chatId: GROUP_CHAT_ID,
    telegramMessageId: message.message_id,
    telegramFileId: largestPhoto?.file_id,
    caption,
    reportMonth,
  });

  return message;
};

// Uyga vazifa matnini guruhga yuboradi.
exports.sendHomeworkMessage = async ({
  teacherId,
  teacherName,
  groupId,
  groupName,
  lessonId,
  branchId,
  text,
  reportMonth,
}) => {
  if (!bot) return null;

  const message = await bot.sendMessage(GROUP_CHAT_ID, text);

  await logMessage({
    messageType: 'homework',
    lessonId,
    teacherId,
    teacherName,
    groupId,
    groupName,
    branchId,
    chatId: GROUP_CHAT_ID,
    telegramMessageId: message.message_id,
    telegramFileId: null,
    caption: text,
    reportMonth,
  });

  return message;
};

exports.isEnabled = () => Boolean(bot);
