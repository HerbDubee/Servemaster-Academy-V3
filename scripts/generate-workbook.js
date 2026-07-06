'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { WORKBOOKS } = require('../lib/workbooks');

const OUT_DIR = path.join(__dirname, '../books/workbooks');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const C = {
  black:  '#0a0a0a',
  white:  '#f9f5ef',
  gold:   '#b8963e',
  ink:    '#1a1208',
  muted:  '#6b5e4a',
  rule:   '#d4c4a0',
  bg:     '#faf7f2',
};

const W = 612 - 144;
const LABELS = ['A', 'B', 'C', 'D'];

// ── Per-book renderer ─────────────────────────────────────────────────────────
function buildWorkbook(book) {
  return new Promise((resolve, reject) => {
    const wb = WORKBOOKS[book.id];
    if (!wb) return reject(new Error(`No workbook metadata for id "${book.id}"`));
    const outFile = path.join(OUT_DIR, wb.pdf);

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 56, bottom: 56, left: 72, right: 72 },
      info: {
        Title: `${book.title} - Companion Workbook`,
        Author: 'ServeMaster Academy',
        Subject: book.subject,
      },
      autoFirstPage: false,
      bufferPages: false,
    });

    const stream = fs.createWriteStream(outFile);
    doc.pipe(stream);

    // pageAdded fires on every addPage() AND every auto-overflow page break.
    // Setting currentBg before adding a page guarantees every page gets its background.
    let currentBg = C.black;
    doc.on('pageAdded', () => {
      doc.save();
      doc.rect(0, 0, 612, 792).fill(currentBg);
      doc.restore();
    });

    const setBg = (bg) => { currentBg = bg; };
    const addPage = (bg) => { if (bg) setBg(bg); doc.addPage(); };
    const hRule = (color) => {
      const y = doc.y;
      doc.save().moveTo(72, y).lineTo(540, y)
         .strokeColor(color || C.rule).lineWidth(0.4).stroke().restore();
    };
    const sectionLabel = (text) => {
      doc.moveDown(0.55);
      doc.fontSize(7).fillColor(C.gold).font('Helvetica-Bold')
         .text(text.toUpperCase(), { characterSpacing: 1.8 });
      doc.moveDown(0.15);
    };

    // ── Cover ─────────────────────────────────────────────────────────────────
    addPage(C.black);

    doc.fillColor(C.gold).fontSize(9).font('Helvetica-Bold')
       .text('ServeMaster Academy', 72, 72);
    let coverY = 150;
    for (const line of book.coverTitleLines) {
      doc.fillColor(C.white).fontSize(44).font('Helvetica-Bold').text(line, 72, coverY);
      coverY += 45;
    }
    doc.fillColor(C.gold).fontSize(13).font('Helvetica')
       .text('Companion Workbook', 72, coverY + 5);
    doc.moveTo(72, coverY + 27).lineTo(200, coverY + 27).strokeColor(C.gold).lineWidth(1).stroke();
    doc.fillColor(C.muted).fontSize(9.5).font('Helvetica')
       .text('Exercises, wine pairings, and service scenarios\ndrawn from each of the twelve chapters.', 72, coverY + 41, { lineGap: 3 });
    doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
       .text('Answers at the back.', 72, coverY + 85);
    doc.fillColor('#444').fontSize(8).font('Helvetica')
       .text('servemasteracademy.ca', 72, 714, { characterSpacing: 0.5 });

    // ── How to use ──────────────────────────────────────────────────────────────
    addPage(C.bg);

    doc.fillColor(C.gold).fontSize(8).font('Helvetica-Bold')
       .text('HOW TO USE THIS WORKBOOK', 72, 60, { characterSpacing: 1.5 });
    doc.y = 74; hRule(); doc.moveDown(0.8);

    const noteTop = doc.y;
    doc.save().rect(72, noteTop, W, 52).fillColor('#ede7d5').fill().restore();
    doc.fillColor(C.gold).fontSize(7.5).font('Helvetica-Bold')
       .text('SUPPLEMENTAL MATERIAL', 78, noteTop + 7, { characterSpacing: 1.2 });
    doc.fillColor(C.ink).fontSize(9).font('Helvetica')
       .text(
         `${book.title} and this workbook are supplemental to the ServeMaster Academy ` +
         'course and app. The novel brings the skills to life through story; the app is ' +
         'where you practise, certify, and track your progress. Use both together for the ' +
         'full experience.',
         78, noteTop + 20, { width: W - 12, lineGap: 2 }
       );
    doc.y = noteTop + 60;

    doc.moveDown(0.6);
    doc.fontSize(9.5).fillColor(C.ink).font('Helvetica-Bold')
       .text('Each chapter has three parts:');
    doc.moveDown(0.4);

    const parts = [
      ['Knowledge Check',
       'Four multiple-choice questions on wine, service technique, and the chapter setting. ' +
       'One best answer - the others represent common mistakes or partial truths.'],
      ['Service Scenario',
       "An open-ended situation drawn from the chapter's key service moment. " +
       'Write freely, then review against your own experience.'],
      ['Skills Checklist',
       "Five statements about the chapter's core skills. Tick what you own, circle what " +
       "you're working on. Return after your next shift."],
    ];
    for (const [title, desc] of parts) {
      doc.fontSize(9.5).fillColor(C.gold).font('Helvetica-Bold').text('  ' + title);
      doc.fontSize(9.5).fillColor(C.ink).font('Helvetica')
         .text(desc, { indent: 12, lineGap: 2 });
      doc.moveDown(0.35);
    }

    doc.moveDown(0.4); hRule(); doc.moveDown(0.5);
    doc.fontSize(9).fillColor(C.ink).font('Helvetica')
       .text(
         'Answers to the Knowledge Check are in the Answer Key at the back, with a brief ' +
         'explanation of why each answer is correct and what makes the wrong answers wrong.',
         { lineGap: 2 }
       );

    // ── Chapters ────────────────────────────────────────────────────────────────
    for (const ch of book.chapters) {
      addPage(C.bg);

      doc.fillColor(C.gold).fontSize(7.5).font('Helvetica-Bold')
         .text('CHAPTER ' + ch.num, 72, 60, { characterSpacing: 1.5 });
      doc.fillColor(C.ink).fontSize(16).font('Helvetica-Bold')
         .text(ch.title, 72, 73, { width: W });
      doc.fillColor(C.muted).fontSize(8).font('Helvetica')
         .text(ch.location, { lineGap: 0 });
      doc.moveDown(0.3); hRule(); doc.moveDown(0.1);

      sectionLabel('Chapter Summary');
      doc.fontSize(9).fillColor(C.ink).font('Helvetica')
         .text(ch.summary, { width: W, lineGap: 2 });

      sectionLabel('Knowledge Check');
      for (let qi = 0; qi < ch.mc.length; qi++) {
        const q = ch.mc[qi];
        doc.fontSize(9).fillColor(C.ink).font('Helvetica-Bold')
           .text((qi + 1) + '.  ' + q.q, { width: W, lineGap: 1 });
        for (let oi = 0; oi < q.opts.length; oi++) {
          doc.fontSize(9).fillColor(C.ink).font('Helvetica')
             .text(LABELS[oi] + ')  ' + q.opts[oi], { indent: 14, width: W - 14, lineGap: 1 });
        }
        doc.moveDown(0.45);
      }

      sectionLabel('Service Scenario');
      doc.fontSize(9).fillColor(C.ink).font('Helvetica-Bold')
         .text(ch.scenario, { width: W, lineGap: 2 });
      doc.moveDown(0.5);

      for (let i = 0; i < 5; i++) {
        const ly = doc.y + 2;
        if (ly + 14 > 792 - 56 - 8) break;
        doc.moveTo(72, ly).lineTo(540, ly).strokeColor(C.rule).lineWidth(0.35).stroke();
        doc.y = ly + 13;
      }

      sectionLabel('Skills Checklist');
      doc.fontSize(7.5).fillColor(C.muted).font('Helvetica')
         .text("Tick what you own  -  Circle what you're working on  -  Leave blank what you haven't started",
               { width: W, lineGap: 1 });
      doc.moveDown(0.3);

      for (const item of ch.checklist) {
        const cy = doc.y;
        doc.save().rect(72, cy + 1, 8, 8).strokeColor(C.rule).lineWidth(0.6).stroke().restore();
        doc.fontSize(9).fillColor(C.ink).font('Helvetica')
           .text(item, 86, cy, { width: W - 14, lineGap: 1 });
        doc.moveDown(0.2);
      }
    }

    // ── Answer Key ──────────────────────────────────────────────────────────────
    addPage(C.black);

    doc.fillColor(C.gold).fontSize(8).font('Helvetica-Bold')
       .text('ANSWER KEY', 72, 60, { characterSpacing: 2 });
    doc.fillColor(C.white).fontSize(20).font('Helvetica-Bold')
       .text('Knowledge Check Answers', 72, 74);
    doc.fillColor(C.muted).fontSize(9).font('Helvetica')
       .text('With explanations.', 72, 100);
    doc.moveTo(72, 116).lineTo(220, 116).strokeColor(C.gold).lineWidth(1).stroke();
    doc.y = 128;

    for (const ch of book.chapters) {
      doc.moveDown(0.3);
      doc.fillColor(C.gold).fontSize(7.5).font('Helvetica-Bold')
         .text('Ch. ' + ch.num + ' - ' + ch.title.toUpperCase(), { width: W, characterSpacing: 0.4 });
      doc.moveDown(0.15);

      for (let qi = 0; qi < ch.mc.length; qi++) {
        const q = ch.mc[qi];
        const ansLabel = (qi + 1) + '.  Answer: ' + LABELS[q.ans] + ')  ' + q.opts[q.ans];
        doc.fillColor(C.white).fontSize(8.5).font('Helvetica-Bold')
           .text(ansLabel, { width: W, lineGap: 1 });
        doc.fillColor('#999').fontSize(8).font('Helvetica')
           .text(q.explain, { indent: 8, width: W - 8, lineGap: 1 });
        doc.moveDown(0.3);
      }
    }

    // ── Back cover ────────────────────────────────────────────────────────────────
    addPage(C.black);
    doc.fillColor(C.gold).fontSize(28).font('Helvetica-Bold').text('Keep going.', 72, 310);
    doc.fillColor(C.muted).fontSize(10).font('Helvetica')
       .text('ServeMaster Academy - Training the next generation\nof hospitality professionals.',
             72, 350, { lineGap: 4 });
    doc.fillColor('#444').fontSize(8).font('Helvetica')
       .text('servemasteracademy.ca', 72, 714, { characterSpacing: 0.5 });

    doc.end();
    stream.on('finish', () => {
      const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
      console.log('  ' + outFile + '  (' + kb + ' KB)');
      resolve();
    });
    stream.on('error', reject);
  });
}

// ── Validate a content module before rendering ─────────────────────────────────
function validateBook(book) {
  const errs = [];
  if (!book || !book.id) errs.push('missing id');
  if (!Array.isArray(book.chapters) || book.chapters.length !== 12) {
    errs.push(`expected 12 chapters, got ${book.chapters ? book.chapters.length : 0}`);
  }
  (book.chapters || []).forEach((ch, i) => {
    if (!Array.isArray(ch.mc) || ch.mc.length !== 4) errs.push(`ch${i + 1}: expected 4 MC questions`);
    (ch.mc || []).forEach((q, qi) => {
      if (!Array.isArray(q.opts) || q.opts.length !== 4) errs.push(`ch${i + 1} q${qi + 1}: expected 4 options`);
      if (typeof q.ans !== 'number' || q.ans < 0 || q.ans > 3) errs.push(`ch${i + 1} q${qi + 1}: bad ans index`);
    });
    if (!Array.isArray(ch.checklist) || ch.checklist.length !== 5) errs.push(`ch${i + 1}: expected 5 checklist items`);
  });
  return errs;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  // Optional CLI filter: `node scripts/generate-workbook.js book2`
  const only = process.argv[2];
  const ids = only ? [only] : Object.keys(WORKBOOKS);

  console.log('Generating workbook PDF(s):');
  for (const id of ids) {
    let book;
    try {
      book = require(`./workbook-content/${id}.js`);
    } catch (e) {
      console.error(`  ! No content module for "${id}" (scripts/workbook-content/${id}.js) - skipping`);
      continue;
    }
    const errs = validateBook(book);
    if (errs.length) {
      console.error(`  ! ${id} failed validation:\n    - ${errs.join('\n    - ')}`);
      process.exitCode = 1;
      continue;
    }
    await buildWorkbook(book);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
