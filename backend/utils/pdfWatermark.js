/* ============================================================
   utils/pdfWatermark.js

   Shared "pull a PDF from R2 and burn a tiled per-learner watermark
   into it" used by the Free Resources viewer and batch study
   materials. Holds the whole PDF in memory several times over
   (download buffer, parsed pdf-lib document, saved copy), so on the
   512 MB Render instance a few of these at once can exceed the memory
   limit and get the service restarted (2026-10-23 OOM).

   Jobs therefore run ONE AT A TIME: a request waits in line instead of
   all of them stacking up in memory together. Memory before/after each
   job is logged as [pdf-watermark] so the Render logs show which file
   and how much it cost.

   Even one job can be too much: pdf-lib holds a large PDF several times
   over, and on 2026-10-26 a new RPSC free resource took the whole
   backend down (502 for every page) while learners opened it. So
   sendPdfForViewing() only burns the stamp into files up to
   STAMP_MAX_BYTES; bigger files are STREAMED from R2 untouched (no
   buffering, near-zero memory), and the viewers draw the learner's
   name/email over every rendered page in the browser instead
   (profile.js, schedule-modal.js).
   ============================================================ */

const { GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { PDFDocument, StandardFonts, degrees, rgb } = require('pdf-lib');
const { r2, BUCKET } = require('../config/r2');

let queue = Promise.resolve();
function runExclusive(fn) {
  const job = queue.then(fn, fn);
  queue = job.catch(() => {});
  return job;
}

const mb = (n) => Math.round(n / 1024 / 1024);

/* Resolves to the watermarked PDF bytes, or null if the file isn't a
   readable PDF (callers answer 422). */
function watermarkFromR2(key, stamp) {
  return runExclusive(async () => {
    const before = process.memoryUsage().rss;
    const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const chunks = [];
    for await (const chunk of obj.Body) chunks.push(chunk);
    let original = Buffer.concat(chunks);
    chunks.length = 0;
    const sizeMb = mb(original.length);

    let pdfDoc;
    try { pdfDoc = await PDFDocument.load(original); }
    catch (e) { return null; }
    original = null;

    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 11;
    const textWidth = font.widthOfTextAtSize(stamp, fontSize);
    // Tiled diagonal grid (not one corner stamp) so cropping the page
    // can't remove the watermark.
    pdfDoc.getPages().forEach((page) => {
      const { width, height } = page.getSize();
      for (let row = 0; row < height + 400; row += 160) {
        for (let col = -textWidth; col < width + textWidth; col += textWidth + 60) {
          page.drawText(stamp, { x: col, y: row, size: fontSize, font, color: rgb(0.55, 0.1, 0.1), opacity: 0.15, rotate: degrees(30) });
        }
      }
    });
    const pages = pdfDoc.getPageCount();
    const out = Buffer.from(await pdfDoc.save());
    pdfDoc = null;
    console.log(`[pdf-watermark] ${key}: ${sizeMb} MB, ${pages} pages, rss ${mb(before)} -> ${mb(process.memoryUsage().rss)} MB`);
    return out;
  });
}

const STAMP_MAX_BYTES = 8 * 1024 * 1024;

/* Answers the learner viewer request: stamped PDF for small files,
   streamed original for big ones. Returns false if the file isn't a
   readable PDF (caller answers 422). */
async function sendPdfForViewing(res, key, stamp, filename) {
  const headers = {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${filename}"`,
    'Cache-Control': 'no-store, private',
  };
  const head = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  const size = Number(head.ContentLength) || 0;

  if (size > STAMP_MAX_BYTES) {
    const obj = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    res.set(Object.assign(headers, { 'Content-Length': size, 'X-Watermark': 'viewer' }));
    console.log(`[pdf-watermark] ${key}: ${mb(size)} MB - streamed unstamped (over ${mb(STAMP_MAX_BYTES)} MB), rss ${mb(process.memoryUsage().rss)} MB`);
    // Headers are already out, so a mid-stream R2 failure can only abort
    // the response (the viewer shows "could not load"), never JSON.
    await new Promise((resolve) => {
      obj.Body.on('error', (err) => { console.error('[pdf-watermark] stream error:', err.message); res.destroy(err); resolve(); });
      res.on('close', resolve);
      obj.Body.pipe(res);
    });
    return true;
  }

  const watermarked = await watermarkFromR2(key, stamp);
  if (!watermarked) return false;
  res.set(Object.assign(headers, { 'Content-Length': watermarked.length }));
  res.send(watermarked);
  return true;
}

module.exports = { watermarkFromR2, sendPdfForViewing, STAMP_MAX_BYTES };
