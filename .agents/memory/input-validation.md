---
name: Input validation convention (Zod)
description: How request validation is structured and the rules for adding it to new routes.
---

# Zod request validation

- Schemas live in `lib/schemas.js` (Zod v4). The `validate(schema, source='body')` middleware is in `middleware/validate.js`; it `safeParse`s, responds 400 with `{ error, issues:[{field,message}] }` on failure, and **replaces `req[source]` with the parsed data**.
- Zod object schemas **strip unknown keys** by default — so any body key a handler reads must be in the schema, or it silently becomes `undefined`. Check the handler before writing the schema.
- Shared `email` field trims + lowercases; redundant `.toLowerCase()` in handlers is harmless.

**Middleware order (must hold):** rate limiter → auth (if any) → `validate(...)` → handler. Limiters first so abusive traffic is capped before parsing; auth before validate so unauthenticated requests fail 401 fast (this is why auth-gated routes return 401, not 400, when both auth and body are bad).

**Zod v4 notes:** `z.enum([...], { error: 'msg' })` for custom enum message. `z.string({ error })` does NOT override the "expected string, received undefined" message for a missing required field — the field name is still shown, so it's acceptable; don't waste time fighting it.

**Scope:** auth/payment/contact AND manager/admin/admin-affiliates routes are validated — grep for `validate(` in a route file to confirm current coverage before assuming it.

**Body parser gotcha (manager/admin):** The manager + admin routers mount in `server.js` BEFORE the global `express.json()`, so `req.body` is `undefined` on them. Every body route on these routers needs its own inline `express.json()` placed before `validate(...)` (pattern: `auth, express.json(), validate(schema), handler`). admin-affiliates already had inline `express.json()` per-route.

**Pre-existing bug noticed (NOT validation):** several `routes/manager.js` handlers query `restaurants.manager_id`, but that column doesn't exist (table uses `owner_id`) — e.g. cert-logo 500s with `column "manager_id" does not exist`. Unrelated to validation; flagged as follow-up.
