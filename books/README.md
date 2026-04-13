# ServeMaster Books — Manuscript Files

Each chapter is one `.md` file in this folder.

## File naming

```
{book-slug}-ch{number}.md
```

Examples:
- `tables-of-ambition-ch01.md`
- `shadows-of-service-ch01.md`
- `the-last-table-ch03.md`
- `servemaster-textbook-ch01.md`

## File format

Each file must start with YAML frontmatter, followed by the prose:

```markdown
---
book: Tables of Ambition
chapter: 1
title: The Elevator Rush
published: true
---

Full chapter prose goes here...
```

## Frontmatter fields

| Field       | Required | Description                          |
|-------------|----------|--------------------------------------|
| `book`      | yes      | Exact book title (consistent across chapters) |
| `chapter`   | yes      | Chapter number (integer)             |
| `title`     | yes      | Chapter title                        |
| `published` | no       | true = Published, false/absent = Draft |

## Syncing to the database

After pulling from GitHub, run:

```bash
node scripts/sync-books.js
```

This upserts all chapters into the `book_chapters` table. Existing chapters
are updated (not duplicated). New chapters are inserted.
