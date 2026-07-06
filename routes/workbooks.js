'use strict';

/**
 * Workbook routes (public, no auth)
 *
 *   GET  /api/workbooks/status/:bookId    — is this workbook purchasable yet?
 *   POST /api/workbooks/checkout          — create a one-time Stripe Checkout session
 *   GET  /api/workbooks/download/:token   — tokenised PDF download (expiry + count enforced)
 *
 * Mounted in server.js AFTER express.json() (the checkout route reads req.body).
 * Purchase recording + the delivery email live in the Stripe webhook
 * (routes/stripe.js handleWorkbookPurchase) — this router only starts checkout,
 * reports availability, and serves the file against a valid download token.
 *
 * Factory export:
 *   const createWorkbooksRouter = require('./routes/workbooks');
 *   app.use('/api', createWorkbooksRouter({ APP_URL }));
 */

const express = require('express');
const db = require('../db');
const { getUncachableStripeClient } = require('../stripeClient');
const {
  getWorkbook,
  workbookPath,
  workbookExists,
  WORKBOOK_PRICE_CENTS,
  WORKBOOK_CURRENCY,
} = require('../lib/workbooks');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = function createWorkbooksRouter({ APP_URL }) {
  const router = express.Router();

  // ── Availability ──────────────────────────────────────────────────────────
  router.get('/workbooks/status/:bookId', (req, res) => {
    const wb = getWorkbook(req.params.bookId);
    if (!wb) return res.json({ available: false });
    res.json({ available: workbookExists(req.params.bookId), title: wb.title });
  });

  // ── Checkout ──────────────────────────────────────────────────────────────
  router.post('/workbooks/checkout', async (req, res, next) => {
    const email = String(req.body?.email || '').trim();
    const bookId = String(req.body?.bookId || '').trim();

    const wb = getWorkbook(bookId);
    if (!wb) return res.status(400).json({ error: 'Unknown workbook.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email address is required.' });
    if (!workbookExists(bookId)) return res.status(409).json({ error: 'This workbook is not available yet.' });

    try {
      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: email,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: WORKBOOK_CURRENCY,
            unit_amount: WORKBOOK_PRICE_CENTS,
            product_data: {
              name: `${wb.title} — Companion Workbook`,
              description: 'ServeMaster Academy companion workbook (PDF), delivered by email.',
            },
          },
        }],
        metadata: { type: 'workbook', bookId, email },
        success_url: `${APP_URL}/novels/${wb.slug}?workbook=success`,
        cancel_url: `${APP_URL}/novels/${wb.slug}`,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error('Workbook checkout error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to start workbook checkout.' }));
    }
  });

  // ── Tokenised download ────────────────────────────────────────────────────
  router.get('/workbooks/download/:token', async (req, res, next) => {
    const token = String(req.params.token || '');
    try {
      // Consume one download atomically: a single guarded UPDATE both validates
      // (exists + not expired + under the limit) and increments, so concurrent
      // requests can't race past max_downloads. Then classify the failure with a
      // cheap follow-up read only when the guard rejected the row.
      const claim = await db.query(
        `UPDATE workbook_purchases
            SET download_count = download_count + 1
          WHERE download_token = $1
            AND token_expires_at > NOW()
            AND download_count < max_downloads
        RETURNING book_id`,
        [token]
      );

      let row = claim.rows[0];
      if (!row) {
        const existing = await db.query(
          'SELECT token_expires_at, download_count, max_downloads FROM workbook_purchases WHERE download_token = $1',
          [token]
        );
        const r = existing.rows[0];
        if (!r) return res.status(404).send('Invalid or expired download link.');
        if (new Date(r.token_expires_at).getTime() < Date.now()) {
          return res.status(410).send('This download link has expired.');
        }
        return res.status(429).send('Download limit reached for this link.');
      }

      if (!workbookExists(row.book_id)) {
        // File is missing despite a valid claim — refund the consumed download.
        await db.query(
          'UPDATE workbook_purchases SET download_count = download_count - 1 WHERE download_token = $1',
          [token]
        ).catch(() => {});
        return res.status(404).send('Workbook file not found.');
      }

      const wb = getWorkbook(row.book_id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${wb.pdf}"`);
      res.sendFile(workbookPath(row.book_id));
    } catch (err) {
      console.error('Workbook download error:', err.message);
      next(Object.assign(err, { publicMessage: 'Failed to serve workbook download.' }));
    }
  });

  return router;
};
