---
name: Hub re-render on language switch
description: Why applyLangStrings() must re-render the open module hub in app.html
---

# Module hub must re-render on language switch

In `app.html`, dynamically-rendered screens are NOT all covered by `renderAll()`.
The module **hub** (`renderHub()`, gated by `hubCurrentModId`) builds its section
bodies imperatively (header, lesson, practice, Deep Dive/blog, "From the Novel").

`setLang()` → `applyLangStrings()` → `renderAll()`, but `renderAll()` does **not**
call `renderHub()`. So if a user switches EN/FR/ES while the hub screen is open,
any hub-only content stays in the previous language until the hub is reopened.

**Rule:** any new localized content rendered inside the hub must re-render on
language change. `applyLangStrings()` ends with a guarded
`if (hubCurrentModId) renderHub();` — keep it, and don't assume `renderAll()`
alone re-localizes hub content.

**Why:** caught in code review of the book↔curriculum cross-link card; the card
was localized on module-open but froze on in-place language switch.
