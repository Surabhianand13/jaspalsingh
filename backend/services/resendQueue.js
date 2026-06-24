/* ============================================================
   services/resendQueue.js  -  Serialised Resend email queue

   All Resend sends go through this module.
   Guarantees a minimum 600 ms gap between sends (safely under
   the 2 req/sec Resend rate limit even when multiple learners
   enroll simultaneously).

   Priority levels (lower number = higher priority):
     1  OTP verification
     2  Invoice / payment confirmation
     3  Action-required / welcome-payment email
     4  Admin purchase notification (owner)
     5  Admit card
     6  Everything else (contact auto-reply, welcome learner, etc.)

   Within the same priority, emails are sent FCFS.
   ============================================================ */

const { Resend } = require('resend');

const resend    = new Resend(process.env.RESEND_API_KEY);
const MIN_GAP   = 600; // ms between sends

const PRIORITY = {
  OTP:    1,
  INVOICE:  2,
  ACTION_REQUIRED: 3,
  ADMIN_NOTIFY: 4,
  ADMIT_CARD: 5,
  DEFAULT: 6,
};

/* ── Internal queue state ─────────────────────────────────── */

let queue     = [];   // { priority, payload, resolve, reject }
let running   = false;
let lastSent  = 0;

async function processQueue() {
  if (running) return;
  running = true;

  while (queue.length > 0) {
    // Sort: lowest priority number first, FCFS within same level (stable via insertion order)
    queue.sort((a, b) => a.priority - b.priority);

    const item = queue.shift();

    // Enforce minimum gap since last send
    const elapsed = Date.now() - lastSent;
    if (elapsed < MIN_GAP) {
      await new Promise(r => setTimeout(r, MIN_GAP - elapsed));
    }

    try {
      const result = await resend.emails.send(item.payload);
      lastSent = Date.now();
      if (result.error) {
        console.error('[resendQueue] Resend error:', result.error);
        item.reject(new Error(result.error.message || 'Resend error'));
      } else {
        item.resolve(result);
      }
    } catch (err) {
      lastSent = Date.now();
      console.error('[resendQueue] Send failed:', err.message);
      item.reject(err);
    }
  }

  running = false;
}

/* ── Public API ───────────────────────────────────────────── */

/**
 * Enqueue an email send.
 * @param {object} payload  - same shape as resend.emails.send()
 * @param {number} priority - use PRIORITY constants above (default 6)
 * @returns {Promise}       - resolves with Resend result
 */
function send(payload, priority = PRIORITY.DEFAULT) {
  return new Promise((resolve, reject) => {
    queue.push({ priority, payload, resolve, reject });
    processQueue(); // start processing if not already running
  });
}

module.exports = { send, PRIORITY };
