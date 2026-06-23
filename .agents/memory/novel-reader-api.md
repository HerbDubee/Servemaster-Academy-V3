---
name: Novel reader API
description: How the /api/books/* endpoints and voice-map drive the novel readers
---
# Novel reader API

The novel reader pages (public/novels*.html) consume three endpoints:
`/api/books/chapters[?book=]` (list), `/api/books/chapter/:key` (content),
`/api/books/tts/:key` (audio narration).

- **Chapter lists come from `books/voice-map.js`**, not the DB `book_chapters`
  table (that table is synced from a GitHub branch for a different purpose).
  The readers rely on each chapter's `key` (e.g. `book2-ch01`), which only
  voice-map provides.
- **`getAllChapters(book)` convention:** no argument → Book 1 (backward compat
  for the first-crossings reader); an explicit but unknown book id (e.g.
  `book4` before its content exists) → empty array. Do NOT reintroduce a silent
  fallback to Book 1 for unknown books.
  **Why:** each book's reader page passes its own `?book=` and must show
  "coming soon" / empty rather than Book 1's chapters.
- The chapters list only returns chapters whose `Book{N}_Ch*.md` file is
  present on disk, so a book populates automatically as its files land.
- Chapter content is read from the `books/` markdown files (path from
  `getChapter(key).file`).
- **Adding a new book** requires both a `BOOK{N}_CHAPTERS` array in voice-map
  (added to `BOOKS_BY_ID`) AND the markdown files on disk.
