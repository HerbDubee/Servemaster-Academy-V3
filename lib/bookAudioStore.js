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

// Stream a chapter MP3 straight from durable storage to the HTTP response, with
// full HTTP Range support (so audio players can seek). This avoids writing 45 MB
// to local disk on every cold play — which is unreliable in deployments that run
// multiple/ephemeral instances (races on the shared cache path, read-only FS).
//
// Returns true once it has begun serving (or finished sending an error/headers),
// false if storage is unconfigured or the object does not exist (so the caller
// can fall through to on-demand synthesis). May throw only before any bytes/
// headers are sent (e.g. metadata lookup failure), letting the caller fall back.
async function streamToResponse(key, req, res) {
  if (!isConfigured()) return false;
  const file = fileFor(key);
  const [ok] = await file.exists();
  if (!ok) return false;

  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  let start = 0;
  let end = size - 1;
  let status = 200;

  // Only honour a single, well-formed byte range. A malformed/multi-range header
  // is ignored (RFC 7233 §4.1) and we serve the full 200 response instead of a
  // synthetic 206 — which keeps non-conforming clients working.
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] !== '' || m[2] !== '')) {
    if (m[1] === '') {
      // suffix range: last N bytes
      start = Math.max(0, size - parseInt(m[2], 10));
    } else {
      start = parseInt(m[1], 10);
      end = m[2] ? parseInt(m[2], 10) : size - 1;
    }
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      res.status(416).setHeader('Content-Range', `bytes */${size}`);
      res.end();
      return true;
    }
    end = Math.min(end, size - 1);
    status = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  }

  res.status(status);
  res.setHeader('Content-Length', end - start + 1);

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  const stream = file.createReadStream({ start, end });
  // If the client disconnects mid-stream (common with audio seeking), stop
  // reading from Object Storage so we don't waste bandwidth/CPU.
  const onClose = () => stream.destroy();
  res.on('close', onClose);
  stream.on('error', (err) => {
    res.off('close', onClose);
    if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') return; // client aborted — expected
    logger.warn('book_audio_store_stream_error', { key, error: err.message });
    if (!res.headersSent) res.status(500).end();
    else res.destroy(err);
  });
  stream.on('end', () => res.off('close', onClose));
  stream.pipe(res);
  return true;
}

module.exports = { isConfigured, exists, upload, streamToResponse };
