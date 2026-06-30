// Durable storage for pre-generated blog "Listen" narration MP3s.
//
// The local public/audio/blog/ directory is gitignored (~1.9 GB) and never
// committed, so a fresh deploy has none of the pre-generated audio. Mirroring it
// into Replit Object Storage lets the public blog-audio route serve the real
// narration instantly to everyone (including logged-out readers) and persist any
// audio it synthesizes on demand, so it never needs regenerating.
//
// Thin wrapper around the shared audio object-store factory, bound to the
// `blog-audio` object prefix. Keys are `{lang}/{slug}` (e.g. `en/handle-complaints`).

const { createAudioStore } = require('./audioObjectStore');

module.exports = createAudioStore({ prefix: 'blog-audio', logLabel: 'blog_audio_store' });
