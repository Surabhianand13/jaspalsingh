/* ============================================================
   my-programs.js  -  My Enrolled Programs page
   Dr. Jaspal Singh Website  -  jaspalsingh.in

   Moved off /profile (2026-07-18) onto its own page. Requires
   learner-auth.js (auth state) and schedule-modal.js (the Schedule
   button) to be loaded first.
   ============================================================ */

(function () {
  'use strict';

  var API_BASE = (function () {
    var h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  })();

  function authFetch(path, opts) {
    var token = window.LearnerAuth ? window.LearnerAuth.getToken() : null;
    var headers = Object.assign({ 'Content-Type': 'application/json' }, (opts || {}).headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(API_BASE + path, Object.assign({}, opts || {}, { headers: headers }))
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
          return data;
        });
      });
  }

  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  var PROGRAM_COLORS = {
    'rssb-jen-diploma-test-series':  { bg: 'linear-gradient(135deg,#0369A1,#0284C7)', icon: 'fa-clipboard-list' },
    'rssb-jen-degree-test-series':   { bg: 'linear-gradient(135deg,#0F766E,#0D9488)', icon: 'fa-clipboard-check' },
    'rpsc-ae-interview':             { bg: 'linear-gradient(135deg,#6D28D9,#7C3AED)', icon: 'fa-user-tie' },
    'rssb-jen-crash-course':         { bg: 'linear-gradient(135deg,#B45309,#C2410C)', icon: 'fa-bolt' },
    'gate-ese-foundation':           { bg: 'linear-gradient(135deg,#166534,#15803D)', icon: 'fa-graduation-cap' },
  };

  /* Admit card states, most recent flows first:
     - 'approved': admin has reviewed the generated PDF - download it directly.
     - 'pending':  learner submitted their Tally form, awaiting admin review.
     - 'rejected': something didn't match (e.g. email/phone) - admin left a reason.
     - 'none' (or anything else): pre-review-queue enrollment - falls back to
       the plain roll-number display that existed before the approval queue,
       so already-issued cards from before this shipped never show a
       "pending review" nag they were never meant to see. */
  function admitCardLine(e) {
    if (e.admit_card_status === 'approved' && e.admit_card_pdf_url) {
      return '<a href="' + esc(e.admit_card_pdf_url) + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;background:#0F766E;color:#fff;border-radius:20px;padding:7px 16px;font-size:12.5px;font-weight:700;text-decoration:none;">' +
        '<i class="fas fa-download"></i> Download Admit Card' +
      '</a>';
    }
    if (e.admit_card_status === 'pending') {
      return '<span style="color:#9999b0;"><i class="fas fa-hourglass-half"></i> Admit card pending review</span>';
    }
    if (e.admit_card_status === 'rejected') {
      return '<span style="color:#C81240;"><i class="fas fa-triangle-exclamation"></i> Admit card needs attention' +
        (e.admit_card_rejection_reason ? ' - ' + esc(e.admit_card_rejection_reason) : '') +
        ' - please <a href="https://wa.me/919829133317" target="_blank" rel="noopener" style="color:#C81240;font-weight:700;">WhatsApp us</a></span>';
    }
    if (!e.roll_number) {
      return '<span style="color:#9999b0;"><i class="fas fa-hourglass-half"></i> Admit card number: assigned shortly</span>';
    }
    // Combo (Degree+Diploma) enrollments store roll_number as a packed
    // "DEG-X|DIP-Y" pair - show each half labeled instead of the raw string.
    var parts = e.roll_number.split('|');
    var display = parts.length === 2
      ? 'Degree: <strong style="font-family:monospace;">' + esc(parts[0]) + '</strong> &middot; Diploma: <strong style="font-family:monospace;">' + esc(parts[1]) + '</strong>'
      : 'Admit Card No: <strong style="font-family:monospace;">' + esc(e.roll_number) + '</strong>';
    return '<i class="fas fa-id-card" style="color:#0F766E;"></i> ' + display;
  }

  function loadEnrolledPrograms() {
    var body = document.getElementById('enrolledBody');
    authFetch('/api/enrollment/my-enrollments').then(function (data) {
      var enrollments = data.enrollments || [];
      if (!enrollments.length) {
        body.innerHTML = '<p class="profile-empty"><i class="fas fa-graduation-cap"></i> No enrolled programs yet.<br>' +
          '<a href="/programs">Browse programs &rarr;</a></p>';
        return;
      }

      var html = '<div class="enrolled-grid">';
      enrollments.forEach(function (e) {
        // canonical_slug is what View Program / Schedule should always link
        // to - some older enrollments are keyed to a legacy checkout slug
        // (see backend/utils/programSlugAliases.js), program_slug is only
        // used as a fallback color-map key for display.
        var slug = e.canonical_slug || e.program_slug;
        var style = PROGRAM_COLORS[e.program_slug] || { bg: 'linear-gradient(135deg,#1A1A2E,#2d2d4e)', icon: 'fa-book' };
        var paid_at = e.paid_at ? new Date(e.paid_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '';
        html += '<div class="enrolled-card">' +
          '<div class="enrolled-thumb" style="background:' + style.bg + '">' +
            '<i class="fas ' + style.icon + '"></i>' +
          '</div>' +
          '<div class="enrolled-info">' +
            '<div class="enrolled-name">' + esc(e.program_name) + '</div>' +
            '<div class="enrolled-meta">' +
              '<span class="enrolled-status enrolled-status--paid"><i class="fas fa-check-circle"></i> Enrolled</span>' +
              (paid_at ? '<span class="enrolled-date">Joined ' + paid_at + '</span>' : '') +
              '<span class="enrolled-amount">&#8377;' + Number(e.amount).toLocaleString('en-IN') + ' paid</span>' +
            '</div>' +
            '<div class="enrolled-roll" style="margin-top:6px;font-size:13px;">' +
              admitCardLine(e) +
            '</div>' +
            '<button class="btn" data-schedule-open="' + esc(slug) + '" data-schedule-name="' + esc(e.program_name) + '" style="margin-top:10px;background:#0F766E;color:#fff;border:none;border-radius:20px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer;">' +
              '<i class="fas fa-calendar-alt"></i> View Schedule' +
            '</button>' +
            // TEMPORARY (2026-07-18) - diagnosing a slug mismatch report,
            // remove once confirmed fixed.
            '<div style="margin-top:8px;font-size:10px;color:#bbb;font-family:monospace;">slug: ' + esc(e.program_slug) + ' &rarr; ' + esc(e.canonical_slug || '(same)') + '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      body.innerHTML = html;
      body.querySelectorAll('[data-schedule-open]').forEach(function (link) {
        link.addEventListener('click', function (ev) {
          ev.preventDefault();
          window.ScheduleModal.open(link.getAttribute('data-schedule-open'), link.getAttribute('data-schedule-name'));
        });
      });
    }).catch(function () {
      body.innerHTML = '<p class="profile-empty">Could not load enrolled programs.</p>';
    });
  }

  function init() {
    if (!window.LearnerAuth || !window.LearnerAuth.isLoggedIn()) {
      document.getElementById('profileNotLoggedIn').style.display = 'block';
      return;
    }
    document.getElementById('profileContent').style.display = 'block';
    loadEnrolledPrograms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
