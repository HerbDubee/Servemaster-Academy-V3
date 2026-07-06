---
name: "Knowledge Centre" spelling standard
description: Canonical spelling for the brand's knowledge hub across UI copy
---

# "Knowledge Centre" (Canadian spelling) is the standard

Visible UI copy uses **"Knowledge Centre"** (British/Canadian), NOT "Center".

**Why:** ServeMaster Academy is a Canadian (`.ca`) brand and the site already
uses "Centre" overwhelmingly (hundreds of occurrences across blog JSON-LD and
nav), vs a handful of stray "Center". A polish-audit note suggested US "Center"
but its premise ("Center matches existing usage") was factually inverted.

**How to apply:**
- Use "Knowledge Centre" for any new display text (nav links, headings,
  i18n strings in `public/js/lang.js`).
- Do NOT rename the URL slugs — the routes are `/knowledge-center` (301→/blog)
  and `/app/knowledge-center`. Slugs stay US-spelled to avoid route breakage;
  only display text is "Centre".
