'use strict';

/**
 * Workbook catalogue + filesystem helpers.
 *
 * Single source of truth for the companion-workbook metadata shared by the
 * Stripe webhook (delivery email) and the /api/workbooks/* routes.
 * PDFs are served from the repo at books/workbooks/<pdf>.
 */

const fs = require('fs');
const path = require('path');

const WORKBOOK_DIR = path.join(__dirname, '..', 'books', 'workbooks');

// One-time purchase price, in the smallest currency unit (cents).
const WORKBOOK_PRICE_CENTS = 199;
const WORKBOOK_CURRENCY = 'cad';

// Downloads are capped and time-limited (mirrors the on-page UI copy).
const WORKBOOK_MAX_DOWNLOADS = 5;
const WORKBOOK_EXPIRY_DAYS = 7;

const WORKBOOKS = {
  book1: { title: 'First Crossings',    slug: 'first-crossings',    pdf: 'Covers - First Crossings Workbook.pdf' },
  book2: { title: 'Eastern Sparks',     slug: 'eastern-sparks',     pdf: 'Covers - Eastern Sparks Workbook.pdf' },
  book3: { title: 'Southern Flames',    slug: 'southern-flames',    pdf: 'Covers - Southern Flames Workbook.pdf' },
  book4: { title: 'The Table We Built', slug: 'the-table-we-built', pdf: 'Covers - The Table We Built Workbook.pdf' },
};

function getWorkbook(bookId) {
  return WORKBOOKS[bookId] || null;
}

function workbookPath(bookId) {
  const wb = WORKBOOKS[bookId];
  return wb ? path.join(WORKBOOK_DIR, wb.pdf) : null;
}

function workbookExists(bookId) {
  const p = workbookPath(bookId);
  return !!p && fs.existsSync(p);
}

module.exports = {
  WORKBOOKS,
  WORKBOOK_DIR,
  WORKBOOK_PRICE_CENTS,
  WORKBOOK_CURRENCY,
  WORKBOOK_MAX_DOWNLOADS,
  WORKBOOK_EXPIRY_DAYS,
  getWorkbook,
  workbookPath,
  workbookExists,
};
