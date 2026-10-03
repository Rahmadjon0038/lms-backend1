const { spawn, spawnSync } = require('child_process');
const fs = require('fs');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

let ffmpegChecked = false;
let ffmpegOk = false;

const isFfmpegAvailable = () => {
  if (!ffmpegChecked) {
    ffmpegChecked = true;
    try {
      ffmpegOk = spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' }).status === 0;
    } catch (_) {
      ffmpegOk = false;
    }
    if (!ffmpegOk) {
      console.warn("⚠️ ffmpeg topilmadi — storis videolari siqilmasdan saqlanadi (Dockerfile'ga ffmpeg qo'shing).");
    }
  }
  return ffmpegOk;
};

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg ${code} bilan tugadi: ${stderr.trim().split('\n').pop()}`));
    });
  });

// Qisqa tomoni 720p dan oshmaydi, H.264 + AAC, "faststart" (moov boshida) —
// shunda video butunlay yuklanmasdan darhol ijro boshlanadi.
const SCALE_FILTER = "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'";

const optimizeVideo = (inputPath, outputPath) =>
  runFfmpeg([
    '-y',
    '-i', inputPath,
    '-vf', SCALE_FILTER,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',
    '-maxrate', '2M',
    '-bufsize', '4M',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    outputPath,
  ]);

const createPoster = async (inputPath, outputPath) => {
  const base = ['-y', '-i', inputPath, '-frames:v', '1', '-vf', SCALE_FILTER, '-q:v', '5', outputPath];
  try {
    await runFfmpeg(['-ss', '0.5', ...base]);
  } catch (_) {
    // Video 0.5 soniyadan qisqa bo'lsa — birinchi kadr
    await runFfmpeg(base);
  }
  if (!fs.existsSync(outputPath)) throw new Error('poster yaratilmadi');
};

// Og'ir ffmpeg ishlari server CPU'sini band qilmasligi uchun navbat bilan (birin-ketin).
let queue = Promise.resolve();
const enqueue = (task) => {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
};

module.exports = { isFfmpegAvailable, optimizeVideo, createPoster, enqueue };
