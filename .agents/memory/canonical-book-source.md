---
name: Canonical novel source & PDF re-import
description: Which files are the authoritative novel text, and the PDF encoding defect to handle on any re-import.
---

# Canonical novel source

The authoritative novel text is the set of PDFs the user attaches (e.g. `attached_assets/Book1_FirstCrossings*.pdf`, `Book2_SecondCrossings*.pdf`, `Book3_SouthernFlames*.pdf`). When asked to reconcile, the app's `books/*.md` must be made to match the PDF **content**, not just chapter titles.

**Which md files are actually served:** `books/voice-map.js` is the single source of truth. Book 1 serves the `_v2` variants (`Book1_ChN_v2.md`, and `Book1_Ch3_Paris_NearMiss_v2.md` for ch3); Books 2/3/4 serve `BookN_ChN.md`. Multiple stale variants (`_Polished`, `_v3`, original) also sit in `books/` unused — do NOT assume the plain-named or `_v3` file is live; check voice-map.

**Server contract (server.js chapter route):** the md's first line MUST be `Chapter N — Title` (em/en dash or hyphen) — the route strips that line and the displayed title comes from voice-map. Body is served as markdown; blank lines = paragraph breaks.

## PDF encoding defect (critical for re-import)
**Why:** these PDFs export every em-dash as a literal `?`, conflated with real question marks. A raw `pdftotext` dump is therefore unusable as-is.
**How to apply when re-importing a chapter:**
- Restore em-dashes: ` ? ` (space-question-space) → ` — `; leave `word?` (no space before) as a real question mark.
- Strip page furniture: bare page-number lines, the running book-title header lines, and the `ServeMaster Academy` / `Sofia Vale & Luca Voss` front-matter lines.
- Reflow: pdftotext hard-wraps mid-paragraph; join lines and treat a short line (< ~72% of max width) or blank line as a paragraph end.
- Drop leading heading paragraphs (they contain no `.?!`) until the first real prose sentence.
- Validate the converter on a chapter already known to match (compare normalized word streams) — expect ≥0.99 — before trusting it on diverging chapters.

**Side effect of replacing chapter text:** the `books/audio-cache/*.mp3` (and Object Storage copies) are keyed by chapter key, not content hash, so narration goes stale silently. Regenerating costs ElevenLabs credits — leave it to the user.
