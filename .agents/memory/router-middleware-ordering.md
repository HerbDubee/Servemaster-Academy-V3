---
name: Router middleware ordering
description: Rules for where to mount Express routers relative to express.json() in server.js
---

The Stripe router is intentionally mounted BEFORE `express.json()` (the comment in server.js says so) because the Stripe webhook endpoint needs the raw request body.

All other routers that have POST/PATCH routes reading `req.body` must be mounted AFTER `express.json()`. The correct mount section is labeled "User + Contact routers (require parsed JSON body)" just after the security-headers middleware block (~line 492).

**Why:** Mounting a router before `express.json()` means `req.body` is `undefined` in all that router's handlers. The symptom is HTTP 500 instead of 400 on validation checks that destructure `req.body`.

**How to apply:** When extracting new router files, always mount them in the "after express.json" section, not alongside the Stripe/auth/manager/admin routers which are in the "before express.json" section. The manager and admin routers pre-date this lesson and may have the same latent bug for their POST routes — investigate before relying on them.

**Stripe router exception:** Because the Stripe router is mounted before `express.json()`, ANY Stripe route that reads a JSON `req.body` (e.g. `/payments/create-checkout`) must attach a route-level `express.json()` middleware itself — global JSON parsing never runs for it. The webhook route uses `express.raw()` for the same reason. Don't move the Stripe router after `express.json()` or you break webhook signature verification.
