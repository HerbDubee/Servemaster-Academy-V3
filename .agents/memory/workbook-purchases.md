---
name: Workbook purchases & tokenized download
description: How companion-workbook one-time purchases and tokenized PDF downloads are enforced.
---

Companion workbooks (books 1-4) are one-time $1.99 CAD purchases. Catalogue + fs
helpers live in lib/workbooks.js; routes in routes/workbooks.js; purchase recording
+ delivery email in the Stripe webhook (routes/stripe.js handleWorkbookPurchase,
defined inside the factory so it closes over resend/APP_URL/escapeHtml). PDFs are
served from the repo (books/workbooks/), NOT Object Storage.

**Rule:** the tokenized download route must consume a download with ONE guarded
`UPDATE ... SET download_count = download_count + 1 WHERE token=$1 AND
token_expires_at > NOW() AND download_count < max_downloads RETURNING ...`, and only
serve the file when a row is returned. Classify 404/410/429 with a follow-up SELECT
only when the guard rejects.

**Why:** a check-then-increment (SELECT then UPDATE) lets concurrent requests both
pass the limit check and exceed max_downloads. Verified: 7 parallel requests on a
max=5 token yield exactly 5×200 + 2×429, count capped at 5.

**How to apply:** any quota/limit consumption tied to a DB counter (download caps,
redemption limits, seat counts) should be a single atomic guarded UPDATE, not a
read-then-write.
