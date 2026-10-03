// Mavjud storis videolarini siqadi (720p, faststart) va poster rasm yaratadi.
// Ishga tushirish (serverda, konteyner ichida):
//   docker exec lms_backend node scripts/optimizeStoryVideos.js
// Bir necha marta ishga tushirsa ham xavfsiz — tayyor storislar o'tkazib yuboriladi.
require('dotenv').config();
const pool = require('../config/db');
const { processStoryMedia } = require('../controllers/contentController');
const { isFfmpegAvailable } = require('../utils/videoOptimizer');

(async () => {
  if (!isFfmpegAvailable()) {
    console.error('❌ ffmpeg topilmadi.');
    process.exit(1);
  }

  const { rows } = await pool.query(
    `SELECT id, video_path, poster_path FROM stories
     WHERE video_path NOT LIKE 'http%'
       AND (video_path NOT LIKE '%.opt.mp4' OR poster_path IS NULL)
     ORDER BY id`
  );
  console.log(`🎞️ ${rows.length} ta storis qayta ishlanadi...`);

  for (const row of rows) {
    await processStoryMedia(row.id, row.video_path);
  }

  console.log('✅ Tayyor.');
  await pool.end();
  process.exit(0);
})().catch((error) => {
  console.error('❌ Xatolik:', error.message);
  process.exit(1);
});
