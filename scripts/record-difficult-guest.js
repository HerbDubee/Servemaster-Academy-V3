#!/usr/bin/env node
/**
 * scripts/record-difficult-guest.js
 *
 * Records the Difficult Guest animated video component to an MP4.
 * Uses Playwright's built-in video recording (webm) then converts with ffmpeg.
 *
 * Prerequisites:
 *   Both servers running:
 *     node server.js                               (port 5000)
 *     cd artifacts/mockup-sandbox && npm run dev  (port 23636)
 *
 * Usage:
 *   node scripts/record-difficult-guest.js
 *
 * Output:
 *   exports/difficult-guest-scenario.mp4
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync, spawn } = require('child_process');

const PREVIEW_URL   = 'http://localhost:5000/__mockup/preview/difficult-guest/DifficultGuest';
const OUTPUT_PATH   = path.resolve(__dirname, '../exports/difficult-guest-scenario.mp4');
const WEBM_TMP      = path.resolve(__dirname, '../exports/.tmp-recording.webm');
const VIDEO_DIR_TMP = path.resolve(__dirname, '../exports/.pw-video-tmp');

const WIDTH  = 1280;
const HEIGHT = 720;

// Total scene durations: 3000 + 4000 + 10000 + 4000 + 5000 = 26000 ms
const TOTAL_DURATION_MS = 27000;   // 26 s + 1 s buffer

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function checkFfmpeg() {
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function waitForServer(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const attempt = () => {
      http.get(url, res => {
        res.resume();
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Server not up: ${url}`));
        else setTimeout(attempt, 500);
      }).setTimeout(2000, function() { this.destroy(); });
    };
    attempt();
  });
}

async function main() {
  console.log('🎬  Difficult Guest — MP4 recorder (Playwright + ffmpeg)');
  console.log('────────────────────────────────────────────────────────');

  if (!checkFfmpeg()) {
    console.error('✗  ffmpeg not found on PATH'); process.exit(1);
  }
  console.log('✓  ffmpeg available');

  console.log(`   Checking preview server …`);
  try {
    await waitForServer('http://localhost:5000/__mockup/', 10000);
    console.log('✓  Preview server is up');
  } catch (err) {
    console.error('✗  Preview server not responding. Start both servers first.');
    process.exit(1);
  }

  ensureDir(path.dirname(OUTPUT_PATH));
  ensureDir(VIDEO_DIR_TMP);

  // Clean up any stale tmp files
  if (fs.existsSync(WEBM_TMP)) fs.unlinkSync(WEBM_TMP);

  console.log(`\n▶  Launching Playwright Chromium (${WIDTH}×${HEIGHT}) …`);

  // Use system Chromium from Nix (pre-installed with correct library paths)
  // Falls back to Playwright's bundled Chromium if not available
  const SYSTEM_CHROMIUM = '/nix/store/khk7xpgsm5insk81azy9d560yq4npf77-chromium-131.0.6778.204/bin/chromium';
  const useSystemChromium = fs.existsSync(SYSTEM_CHROMIUM);
  if (useSystemChromium) {
    console.log(`   Using system Chromium: ${SYSTEM_CHROMIUM}`);
  } else {
    console.log('   Using Playwright bundled Chromium');
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: useSystemChromium ? SYSTEM_CHROMIUM : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  let recordingDone = false;

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: {
      dir: VIDEO_DIR_TMP,
      size: { width: WIDTH, height: HEIGHT },
    },
  });

  const page = await context.newPage();

  // Expose the stop-recording hook the component calls
  await page.exposeFunction('__pwRecordingStopped', () => {
    recordingDone = true;
    console.log('\n✓  window.stopRecording() fired — all scenes complete');
  });

  // Wire component hooks before page loads
  await page.addInitScript(() => {
    window.startRecording = () => {
      console.log('[recorder] startRecording called');
    };
    window.stopRecording = () => {
      window.__pwRecordingStopped();
    };
  });

  // Suppress noisy page console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('  [page]', msg.text().slice(0, 120));
  });

  console.log(`   Opening ${PREVIEW_URL} …`);
  await page.goto(PREVIEW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Give React time to hydrate (1 s)
  await page.waitForTimeout(1000);

  console.log(`   Recording for up to ${TOTAL_DURATION_MS / 1000} s …`);

  // Progress ticker
  const tickInterval = 2000;
  let elapsed = 0;
  const ticker = setInterval(() => {
    elapsed += tickInterval;
    process.stdout.write(`\r   ${elapsed / 1000}s / ${TOTAL_DURATION_MS / 1000}s elapsed`);
  }, tickInterval);

  // Wait for stop signal or hard timeout
  const deadline = Date.now() + TOTAL_DURATION_MS;
  while (!recordingDone && Date.now() < deadline) {
    await page.waitForTimeout(500);
  }
  clearInterval(ticker);
  process.stdout.write('\n');

  if (!recordingDone) console.warn('  ⚠  stopRecording was not fired — using full timeout');

  // Give the last frame a moment to render
  await page.waitForTimeout(500);

  // Retrieve the recorded video path before closing
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  if (!videoPath || !fs.existsSync(videoPath)) {
    console.error('✗  Playwright did not produce a video file');
    process.exit(1);
  }

  const sizeMB = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✓  Captured webm  (${sizeMB} MB) → ${videoPath}`);

  // ── Convert webm → mp4 with ffmpeg ──────────────────────────────────────
  console.log(`\n🎞   Converting to MP4 …`);

  const ffmpegArgs = [
    '-y',
    '-i', videoPath,
    '-vf', `scale=${WIDTH}:${HEIGHT}`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    OUTPUT_PATH,
  ];

  console.log('  $ ffmpeg', ffmpegArgs.join(' '));

  await new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); process.stdout.write(d); });
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-500)}`)));
  });

  // Clean up temp video dir
  fs.rmSync(VIDEO_DIR_TMP, { recursive: true, force: true });

  const outSize = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1);
  const outDuration = TOTAL_DURATION_MS / 1000;

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`✅  exports/difficult-guest-scenario.mp4`);
  console.log(`   Size: ${outSize} MB  |  Duration: ~${outDuration}s  |  ${WIDTH}×${HEIGHT}`);
  console.log('────────────────────────────────────────────────────────');
}

main().catch(err => {
  console.error('\n✗  Recording failed:', err.message);
  process.exit(1);
});
