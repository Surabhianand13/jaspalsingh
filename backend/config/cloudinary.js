/* ============================================================
   config/cloudinary.js — Cloudinary SDK Configuration
   Dr. Jaspal Singh Website — jaspalsingh.in

   Reads credentials from .env:
     CLOUDINARY_CLOUD_NAME
     CLOUDINARY_API_KEY
     CLOUDINARY_API_SECRET
   ============================================================ */

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,   // always use https:// URLs
});

/* Quick sanity-check on startup (non-fatal) */
if (!process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY    ||
    !process.env.CLOUDINARY_API_SECRET) {
  console.warn('⚠️  Cloudinary credentials missing in .env — uploads will fail.');
}

module.exports = cloudinary;
