/* ============================================================
   middleware/cloudinaryStorage.js  -  Multer storage engine for Cloudinary
   Dr. Jaspal Singh Website  -  jaspalsingh.in

   Replaces multer-storage-cloudinary, whose latest release (4.0.0)
   peer-depends on cloudinary@^1.21.0 and blocks upgrading to the
   patched cloudinary v2 line (GHSA-g4mf-96x5-5m2c). This is a thin
   wrapper around cloudinary.uploader.upload_stream that returns the
   same { path, filename } shape multer-storage-cloudinary did, so
   the rest of the app (req.file.path / req.file.filename) is unchanged.

   Usage (same shape as multer-storage-cloudinary):
     const storage = cloudinaryStorage({
       cloudinary,
       params: async (req, file) => ({ folder: '...', resource_type: 'image', ... }),
     });
   ============================================================ */

class CloudinaryStorage {
  constructor({ cloudinary, params }) {
    this.cloudinary = cloudinary;
    this.paramsFn = typeof params === 'function' ? params : () => (params || {});
  }

  _handleFile(req, file, cb) {
    Promise.resolve(this.paramsFn(req, file))
      .then((opts) => {
        const uploadStream = this.cloudinary.uploader.upload_stream(opts, (err, result) => {
          if (err) return cb(err);
          cb(null, {
            path:          result.secure_url,
            filename:      result.public_id,
            size:          result.bytes,
            resource_type: result.resource_type,
            format:        result.format,
          });
        });
        file.stream.on('error', cb);
        file.stream.pipe(uploadStream);
      })
      .catch(cb);
  }

  _removeFile(req, file, cb) {
    this.cloudinary.uploader.destroy(
      file.filename,
      { resource_type: file.resource_type || 'image' },
      (err) => cb(err)
    );
  }
}

module.exports = function cloudinaryStorage(opts) {
  return new CloudinaryStorage(opts);
};
