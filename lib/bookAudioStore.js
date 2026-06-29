// Durable storage for pre-generated book chapter narration MP3s.
//
// The local books/audio-cache/ directory is gitignored and ephemeral (it does
// not survive a fresh deploy), so chapter audio is also persisted in Replit
// Object Storage. The server's TTS route uses this module to (a) restore a
// chapter into the local cache on a cold instance and (b) persist any audio it
// synthesizes on demand, so playback is instant and durable across deploys.
//
// Configured for the Replit Object Storage sidecar exactly like the integration
// blueprint's objectStorage.ts, but as plain CommonJS so it loads in server.js
// without a TypeScript build step.

const fs = require('fs');
const { Storage } = require('@google-cloud/storage');
const { logger } = require('./logger');

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';
const AUDIO_PREFIX = 'book-audio';

let _client = null;
function getClient() {
  if (_client) return _client;
  _client = new Storage({
    credentials: {
      audience: 'replit',
      subject_token_type: 'access_token',
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: 'external_account',
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: { type: 'json', subject_token_field_name: 'access_token' },
      },
      universe_domain: 'googleapis.com',
    },
    projectId: '',
  });
  return _client;
}

// PRIVATE_OBJECT_DIR looks like "/<bucket>/.private"; split it into the bucket
// name and the object-name prefix used for every stored chapter.
function resolveLocation(key) {
  const dir = process.env.PRIVATE_OBJECT_DIR || '';
  if (!dir) throw new Error('PRIVATE_OBJECT_DIR is not set (Object Storage not configured)');
  const trimmed = dir.replace(/^\/+/, '').replace(/\/+$/, '');
  const slash = trimmed.indexOf('/');
  const bucketName = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const baseDir = slash === -1 ? '' : trimmed.slice(slash + 1);
  const objectName = `${baseDir ? `${baseDir}/` : ''}${AUDIO_PREFIX}/${key}.mp3`;
  return { bucketName, objectName };
}

function isConfigured() {
  return !!process.env.PRIVATE_OBJECT_DIR;
}

function fileFor(key) {
  const { bucketName, objectName } = resolveLocation(key);
  return getClient().bucket(bucketName).file(objectName);
}

async function exists(key) {
  if (!isConfigured()) return false;
  try {
    const [ok] = await fileFor(key).exists();
    return ok;
  } catch (err) {
    logger.warn('book_audio_store_exists_failed', { key, error: err.message });
    return false;
  }
}

// Upload a local MP3 file to durable storage. Resolves true on success.
async function upload(key, localPath) {
  if (!isConfigured()) return false;
  await fileFor(key).save(fs.readFileSync(localPath), {
    contentType: 'audio/mpeg',
    resumable: false,
    metadata: { contentType: 'audio/mpeg' },
  });
  return true;
}

// Download a chapter from durable storage to a local path (atomic via temp file).
// Resolves true on success, false if the object is missing or storage is off.
async function download(key, destPath) {
  if (!isConfigured()) return false;
  const file = fileFor(key);
  const [ok] = await file.exists();
  if (!ok) return false;
  const tmpPath = `${destPath}.${process.pid}.${Date.now()}.dl.tmp`;
  try {
    await file.download({ destination: tmpPath });
    fs.renameSync(tmpPath, destPath);
    return true;
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* nothing to clean up */ }
    throw err;
  }
}

module.exports = { isConfigured, exists, upload, download };
