#!/usr/bin/env node
'use strict';

/**
 * upload-to-youtube.js
 *
 * Uploads a video file to YouTube, polls for processing completion,
 * and writes a JSON manifest for later embed/website use.
 *
 * Usage:
 *   node scripts/upload-to-youtube.js \
 *     --file <path>          Video/audio file to upload (required)
 *     --title <string>       Video title (required)
 *     --description <string> Video description (optional)
 *     --privacy <string>     unlisted | private | public  (default: unlisted)
 *     --playlist-id <string> Add to playlist after upload (optional)
 *     --manifest-out <path>  Folder to write manifest JSON (default: see MANIFEST_DIR)
 *     --poll-processing      Poll until YouTube finishes processing
 *     --poll-seconds <n>     Seconds between polls (default: 5)
 *     --poll-attempts <n>    Max poll attempts (default: 6)
 *     --token-file <path>    Path to OAuth2 token file (default: ~/.config/sma-yt/token.json)
 *     --dry-run              Build manifest from existing video ID (skips upload)
 *     --video-id <id>        Use with --dry-run to fetch manifest for existing video
 */

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const { google } = require('googleapis');
const { Readable } = require('stream');
const args  = require('minimist')(process.argv.slice(2), {
  boolean: ['poll-processing', 'dry-run'],
  string:  ['file', 'title', 'description', 'privacy', 'playlist-id',
             'manifest-out', 'poll-seconds', 'poll-attempts', 'token-file', 'video-id'],
  default: {
    privacy:         'unlisted',
    'poll-seconds':  '5',
    'poll-attempts': '6',
  },
});

const MANIFEST_DIR   = args['manifest-out'] ||
  '/data/.openclaw/workspace/shared-memory/youtube-uploads';
const TOKEN_FILE     = args['token-file'] ||
  path.join(os.homedir(), '.config', 'sma-yt', 'token.json');
const POLL_SECONDS   = Math.max(1, parseInt(args['poll-seconds'],  10) || 5);
const POLL_ATTEMPTS  = Math.max(1, parseInt(args['poll-attempts'], 10) || 6);
const SCOPES         = ['https://www.googleapis.com/auth/youtube.upload',
                        'https://www.googleapis.com/auth/youtube'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function log(...a)  { console.log('[yt-upload]', ...a); }
function warn(...a) { console.warn('[yt-upload] WARN:', ...a); }
function die(...a)  { console.error('[yt-upload] ERROR:', ...a); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── OAuth2 ────────────────────────────────────────────────────────────────────

function buildOAuthClient() {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    die('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars are required.');
  }
  return new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
}

function loadToken(oauth2) {
  if (!fs.existsSync(TOKEN_FILE)) return false;
  try {
    const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    oauth2.setCredentials(token);
    return true;
  } catch {
    return false;
  }
}

function saveToken(oauth2) {
  ensureDir(path.dirname(TOKEN_FILE));
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(oauth2.credentials, null, 2));
}

async function authorize(oauth2) {
  if (loadToken(oauth2)) {
    try {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);
      saveToken(oauth2);
      log('Token refreshed.');
      return;
    } catch (e) {
      warn('Token refresh failed, re-authorizing:', e.message);
    }
  }

  const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('\n── YouTube Authorization Required ─────────────────────────────');
  console.log('Open this URL in your browser and paste the code below:\n');
  console.log(authUrl);
  console.log('\n───────────────────────────────────────────────────────────────');

  const code = await new Promise(resolve => {
    const readline = require('readline').createInterface(
      { input: process.stdin, output: process.stdout });
    readline.question('\nPaste authorization code: ', ans => {
      readline.close();
      resolve(ans.trim());
    });
  });

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);
  saveToken(oauth2);
  log('Authorization complete. Token saved to', TOKEN_FILE);
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadVideo(youtube, opts) {
  const { filePath, title, description, privacy } = opts;

  const stat = fs.statSync(filePath);
  log(`Uploading "${title}" (${(stat.size / 1024 / 1024).toFixed(1)} MB) …`);

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description: description || '',
        categoryId:  '27',
      },
      status: {
        privacyStatus:           privacy,
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(filePath),
    },
  }, {
    onUploadProgress: evt => {
      const pct = Math.round(evt.bytesRead / stat.size * 100);
      process.stdout.write(`\r  Progress: ${pct}% (${(evt.bytesRead/1024/1024).toFixed(1)} MB)`);
    },
  });

  process.stdout.write('\n');
  log('Upload complete. Video ID:', res.data.id);
  return res.data;
}

// ── Details + polling ─────────────────────────────────────────────────────────

async function fetchVideoDetails(youtube, videoId) {
  const res = await youtube.videos.list({
    part: ['snippet', 'status', 'processingDetails'],
    id:   [videoId],
  });
  return res.data.items?.[0] || null;
}

async function pollProcessing(youtube, videoId) {
  log(`Polling processing status (max ${POLL_ATTEMPTS} attempts, ${POLL_SECONDS}s interval) …`);

  for (let i = 1; i <= POLL_ATTEMPTS; i++) {
    const video = await fetchVideoDetails(youtube, videoId);
    if (!video) { warn('Video not found during polling.'); break; }

    const ps = video.processingDetails?.processingStatus;
    log(`  Attempt ${i}/${POLL_ATTEMPTS}: processingStatus = ${ps || 'unknown'}`);

    if (ps === 'succeeded' || ps === 'failed' || ps === 'terminated') {
      return video;
    }
    if (i < POLL_ATTEMPTS) await sleep(POLL_SECONDS * 1000);
  }

  log('Polling limit reached — returning current state.');
  return fetchVideoDetails(youtube, videoId);
}

// ── Manifest ──────────────────────────────────────────────────────────────────

function buildManifest(video) {
  const id   = video.id;
  const snip = video.snippet        || {};
  const stat = video.status         || {};
  const proc = video.processingDetails || {};

  return {
    videoId:           id,
    watchUrl:          `https://www.youtube.com/watch?v=${id}`,
    embedUrl:          `https://www.youtube.com/embed/${id}`,
    thumbnails:        snip.thumbnails || {},
    title:             snip.title      || '',
    description:       snip.description|| '',
    publishedAt:       snip.publishedAt|| null,
    privacyStatus:     stat.privacyStatus     || null,
    uploadStatus:      stat.uploadStatus      || null,
    processingStatus:  proc.processingStatus  || null,
    processingProgress: proc.processingProgress || null,
    generatedAt:       new Date().toISOString(),
  };
}

function writeManifest(manifest, outDir) {
  ensureDir(outDir);
  const slug     = slugify(manifest.title);
  const filename = `${slug}-${manifest.videoId}.json`;
  const outPath  = path.join(outDir, filename);
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  return outPath;
}

// ── Playlist ──────────────────────────────────────────────────────────────────

async function addToPlaylist(youtube, videoId, playlistId) {
  log(`Adding to playlist ${playlistId} …`);
  await youtube.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId },
      },
    },
  });
  log('Added to playlist.');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const isDryRun = args['dry-run'];

  if (!isDryRun && !args.file)  die('--file is required (path to video file).');
  if (!isDryRun && !args.title) die('--title is required.');
  if (isDryRun  && !args['video-id']) die('--video-id is required with --dry-run.');

  const oauth2  = buildOAuthClient();
  await authorize(oauth2);

  google.options({ auth: oauth2 });
  const youtube = google.youtube('v3');

  let videoId;
  let uploadResult = null;

  if (isDryRun) {
    videoId = args['video-id'];
    log('Dry-run mode — skipping upload, fetching details for', videoId);
  } else {
    const filePath = path.resolve(args.file);
    if (!fs.existsSync(filePath)) die('File not found:', filePath);

    uploadResult = await uploadVideo(youtube, {
      filePath,
      title:       args.title,
      description: args.description || '',
      privacy:     args.privacy,
    });
    videoId = uploadResult.id;
  }

  let video;
  if (args['poll-processing']) {
    video = await pollProcessing(youtube, videoId);
  } else {
    log('Fetching video details …');
    video = await fetchVideoDetails(youtube, videoId);
  }

  if (!video) die('Could not retrieve video details for', videoId);

  if (args['playlist-id']) {
    await addToPlaylist(youtube, videoId, args['playlist-id']);
  }

  const manifest    = buildManifest(video);
  const manifestPath = writeManifest(manifest, MANIFEST_DIR);

  log('─────────────────────────────────────────────────');
  log('Video ID:    ', manifest.videoId);
  log('Watch URL:   ', manifest.watchUrl);
  log('Privacy:     ', manifest.privacyStatus);
  log('Processing:  ', manifest.processingStatus || 'not yet available');
  log('Manifest:    ', manifestPath);
  log('─────────────────────────────────────────────────');

  const result = { uploadResult, manifest, manifestPath };
  process.stdout.write('\n' + JSON.stringify(result, null, 2) + '\n');
  return result;
}

main().catch(e => die(e.message || e));
