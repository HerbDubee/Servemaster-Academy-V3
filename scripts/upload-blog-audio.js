#!/usr/bin/env node
// One-time (idempotent) uploader: push every pre-generated blog "Listen" MP3 in
// public/audio/blog/{lang}/ to durable Replit Object Storage so it survives
// deploys and is served to everyone (including logged-out readers).
//
// Usage:
//   node scripts/upload-blog-audio.js                       # upload all languages
//   node scripts/upload-blog-audio.js --lang en             # only one language
//   node scripts/upload-blog-audio.js --slug handle-complaints  # one slug (all langs)
//   node scripts/upload-blog-audio.js --force               # re-upload even if present

const fs = require('fs');
const path = require('path');
const blogAudioStore = require('../lib/blogAudioStore');

const AUDIO_DIR = path.join(__dirname, '..', 'public', 'audio', 'blog');
const LANGS = ['en', 'fr', 'es'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] || true);
}

async function main() {
  if (!blogAudioStore.isConfigured()) {
    console.error('Object Storage is not configured (PRIVATE_OBJECT_DIR unset). Aborting.');
    process.exit(1);
  }
  const langFilter = arg('--lang');
  const slugFilter = arg('--slug');
  const force = process.argv.includes('--force');

  if (!fs.existsSync(AUDIO_DIR)) {
    console.error(`No blog audio dir at ${AUDIO_DIR}`);
    process.exit(1);
  }

  // Build work list: { key, localPath, bytes }
  const work = [];
  for (const lang of LANGS) {
    if (langFilter && typeof langFilter === 'string' && lang !== langFilter) continue;
    const dir = path.join(AUDIO_DIR, lang);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort()) {
      const slug = file.replace(/\.mp3$/, '');
      if (slugFilter && typeof slugFilter === 'string' && slug !== slugFilter) continue;
      const localPath = path.join(dir, file);
      const bytes = fs.statSync(localPath).size;
      if (bytes <= 1024) continue; // skip empty/partial files
      work.push({ key: `${lang}/${slug}`, localPath, bytes });
    }
  }

  if (work.length === 0) {
    console.log('No matching MP3s to upload.');
    return;
  }

  let uploaded = 0;
  let skipped = 0;
  for (const { key, localPath, bytes } of work) {
    if (!force && (await blogAudioStore.exists(key))) {
      console.log(`skip   ${key} (already in storage)`);
      skipped++;
      continue;
    }
    process.stdout.write(`upload ${key} (${(bytes / 1e6).toFixed(1)} MB) ... `);
    await blogAudioStore.upload(key, localPath);
    console.log('done');
    uploaded++;
  }
  console.log(`\nComplete. uploaded=${uploaded} skipped=${skipped} total=${work.length}`);
}

main().catch((err) => {
  console.error('Upload failed:', err.message);
  process.exit(1);
});
