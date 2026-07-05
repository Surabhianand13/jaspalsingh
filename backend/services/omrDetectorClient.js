/* ============================================================
   services/omrDetectorClient.js  -  Client for the omr-service
   Thin HTTP wrapper around the Python/Flask/OpenCV microservice
   that performs bubble-sheet detection. Uses Node's built-in
   fetch (Node >=18, see package.json engines) - no new HTTP
   dependency needed.
   ============================================================ */

const OMR_SERVICE_URL    = process.env.OMR_SERVICE_URL;
const OMR_SERVICE_SECRET = process.env.OMR_SERVICE_SECRET;

async function callOmrService(path, body) {
  if (!OMR_SERVICE_URL) {
    throw new Error('OMR_SERVICE_URL is not configured.');
  }

  const res = await fetch(`${OMR_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': OMR_SERVICE_SECRET || '',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    const message = (data && (data.message || data.error)) || `omr-service returned ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.detail = data;
    throw err;
  }

  return data;
}

/* Detect answers + roll number in an uploaded submission photo against a template's calibration. */
function detect({ image_url, template, total_questions }) {
  return callOmrService('/detect', { image_url, template, total_questions });
}

/* Render calibration anchors as dots on the reference image, so the admin can
   visually confirm alignment before saving. */
function calibratePreview({ image_url, corner_points, question_blocks }) {
  return callOmrService('/calibrate-preview', { image_url, corner_points, question_blocks });
}

module.exports = { detect, calibratePreview };
