#!/usr/bin/env node
// One-time (idempotent) uploader: push every pre-generated chapter MP3 in
// books/audio-cache/ to durable Replit Object Storage so it survives deploys.
//
// Usage:
//   node scripts/upload-book-audio.js              # upload all cached chapters
//   node scripts/upload-book-audio.js --book book4 # only one book's chapters
//   node scripts/upload-book-audio.js --force      # re-upload even if present

const fs = require('fs');
const path = require('path');
const bookAudioStore = require('../lib/bookAudioStore');

const CACHE_DIR = path.join(__dirname, '..', 'books', 'audio-cache');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
}

async function main() {
  if (!bookAudioStore.isConfigured()) {
    console.error('Object Storage is not configured (PRIVATE_OBJECT_DIR unset). Aborting.');
    process.exit(1);
  }
  const bookFilter = arg('--book');
  const force = process.argv.includes('--force');

  if (!fs.existsSync(CACHE_DIR)) {
    console.error(`No cache dir at ${CACHE_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(CACHE_DIR)
    .filter((f) => f.endsWith('.mp3'))
    .filter((f) => (bookFilter && typeof bookFilter === 'string' ? f.startsWith(`${bookFilter}-`) : true))
    .sort();

  if (files.length === 0) {
    console.log('No matching MP3s to upload.');
    return;
  }

  let uploaded = 0;
  let skipped = 0;
  for (const file of files) {
    const key = file.replace(/\.mp3$/, '');
    const localPath = path.join(CACHE_DIR, file);
    const bytes = fs.statSync(localPath).size;
    if (!force && (await bookAudioStore.exists(key))) {
      console.log(`skip   ${key} (already in storage)`);
      skipped++;
      continue;
    }
    process.stdout.write(`upload ${key} (${(bytes / 1e6).toFixed(1)} MB) ... `);
    await bookAudioStore.upload(key, localPath);
    console.log('done');
    uploaded++;
  }
  console.log(`\nComplete. uploaded=${uploaded} skipped=${skipped} total=${files.length}`);
}

main().catch((err) => {
  console.error('Upload failed:', err.message);
  process.exit(1);
});
