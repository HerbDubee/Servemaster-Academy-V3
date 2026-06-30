// Durable storage for pre-generated book chapter narration MP3s.
//
// The local books/audio-cache/ directory is gitignored and ephemeral (it does
// not survive a fresh deploy), so chapter audio is also persisted in Replit
// Object Storage. The server's TTS route uses this module to (a) restore a
// chapter into the local cache on a cold instance and (b) persist any audio it
// synthesizes on demand, so playback is instant and durable across deploys.
//
// Thin wrapper around the shared audio object-store factory, bound to the
// `book-audio` object prefix. Keys are flat chapter keys (e.g. `book4-ch01`).

const { createAudioStore } = require('./audioObjectStore');

module.exports = createAudioStore({ prefix: 'book-audio', logLabel: 'book_audio_store' });
