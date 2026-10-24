/* ============================================================
   utils/diskUpload.js

   Multer uploads written to a temp file instead of RAM, then streamed
   to R2. memoryStorage() kept each whole file in memory for the
   length of the request - several learners uploading answer sheets at
   once on a test day could push the 512 MB Render instance over its
   memory limit (2026-10-23/24 OOM restarts).

   diskUpload(opts)     - multer instance (same options as multer(),
                          storage is fixed to os.tmpdir())
   cleanupTempFile      - middleware, put BEFORE the multer middleware:
                          deletes req.file's temp file once the response
                          is finished, whichever path the handler took
                          (success, validation error, thrown error)
   putFileToR2(file,..) - streams the temp file to R2 with an explicit
                          ContentLength (R2 rejects streamed bodies of
                          unknown length)
   ============================================================ */

const fs     = require('fs');
const os     = require('os');
const multer = require('multer');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { r2, BUCKET } = require('../config/r2');

function diskUpload(opts = {}) {
  return multer({
    ...opts,
    storage: multer.diskStorage({
      destination: os.tmpdir(),
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
    }),
  });
}

function cleanupTempFile(req, res, next) {
  res.on('close', () => {
    if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
  });
  next();
}

async function putFileToR2(file, key, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fs.createReadStream(file.path),
    ContentLength: file.size,
    ContentType: contentType,
  }));
}

module.exports = { diskUpload, cleanupTempFile, putFileToR2 };
