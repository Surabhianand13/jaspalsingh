/* ============================================================
   rpsc-daf.js  -  FREE "Personalised RPSC AE interview questions
   from Jaspal Sir" on the profile page (Free Resources tab).

   Verified RPSC AE candidates (application number check, or paid
   RPSC AE Interview learners) upload their DAF; the reply from
   Jaspal Sir (typed questions and/or a PDF) shows here once sent.
   Deep link: /profile/#rpsc-questions  (short: /rpsc-questions)
   Backend: routes/rpsc-daf.js
   ============================================================ */

(function () {
  'use strict';

  var API = 'https://jaspalsingh.onrender.com';
  var MAX_MB = 10;
  var BRANCHES = ['Civil', 'Mechanical', 'Electrical'];
  var state = { data: null, editing: false, busy: false };

  function token() { return localStorage.getItem('jaspal_learner_token'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtDate(iso) {
    return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';
  }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + token() }, opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
        return d;
      });
    });
  }
  /* Private files: fetched with the login token, opened as a blob. */
  function openFile(path) {
    var w = window.open('', '_blank');
    if (w) w.document.write('<p style="font-family:sans-serif;padding:24px;">Opening…</p>');
    fetch(API + path, { headers: { Authorization: 'Bearer ' + token() } }).then(function (r) {
      if (!r.ok) throw new Error('Could not open the file.');
      return r.blob();
    }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      if (w) w.location.href = url; else window.location.href = url;
    }).catch(function (e) { if (w) w.close(); alert(e.message); });
  }

  function box() { return document.getElementById('rpscDafBox'); }

  function load() {
    var el = box();
    if (!el || !token()) return;
    el.innerHTML = '<div class="rdq"><p class="rdq-muted"><i class="fas fa-spinner fa-spin"></i> Loading…</p></div>';
    api('/api/rpsc-daf/me').then(function (d) {
      state.data = d;
      state.editing = false;
      render();
      if (location.hash === '#rpsc-questions') setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);
    }).catch(function () {
      el.innerHTML = '';
    });
  }

  function header(badge) {
    return '<div class="rdq-head">' +
      '<span class="rdq-icon"><i class="fas fa-user-tie"></i></span>' +
      '<div><div class="rdq-tags"><span class="rdq-tag rdq-tag--free">FREE</span><span class="rdq-tag">RPSC AE candidates</span>' + (badge || '') + '</div>' +
      '<h3 class="rdq-title">RPSC AE Interview: Personalised questions from Jaspal Sir</h3></div></div>';
  }

  function render() {
    var el = box(), d = state.data;
    if (!el || !d) return;
    var s = d.submission;

    if (s && s.status === 'answered') {
      var qs = (s.reply_text || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
      el.innerHTML = '<div class="rdq rdq--ready">' + header('<span class="rdq-tag rdq-tag--ok"><i class="fas fa-circle-check"></i> Ready</span>') +
        '<p class="rdq-sub">Jaspal Sir has prepared these questions from your DAF. Practise answering each one out loud.</p>' +
        (qs.length ? '<ol class="rdq-qs">' + qs.map(function (q) { return '<li>' + esc(q.replace(/^\d+[.)]\s*/, '')) + '</li>'; }).join('') + '</ol>' : '') +
        '<div class="rdq-actions">' +
          (s.has_reply_pdf ? '<button type="button" class="rdq-btn" data-rdq-open="/api/rpsc-daf/me/reply-pdf"><i class="fas fa-file-pdf"></i> Open PDF from Jaspal Sir</button>' : '') +
          '<button type="button" class="rdq-link" data-rdq-open="/api/rpsc-daf/me/daf">View my DAF</button>' +
        '</div>' +
        '<p class="rdq-muted">Replied ' + esc(fmtDate(s.replied_at)) + '</p>' +
      '</div>';
    } else if (s && !state.editing) {
      el.innerHTML = '<div class="rdq">' + header('<span class="rdq-tag rdq-tag--wait"><i class="fas fa-hourglass-half"></i> Submitted</span>') +
        '<p class="rdq-sub">Your DAF is with Jaspal Sir. We will email you when your questions are ready, and they will appear right here.</p>' +
        '<p class="rdq-muted">Submitted ' + esc(fmtDate(s.created_at)) + ' · ' + esc(s.branch || '') + ' · Roll no ' + esc(s.roll_no || '') + '</p>' +
        '<div class="rdq-actions"><button type="button" class="rdq-link" data-rdq-open="/api/rpsc-daf/me/daf">View my DAF</button>' +
        '<button type="button" class="rdq-link" id="rdqReplace">Replace DAF / edit details</button></div>' +
      '</div>';
    } else {
      el.innerHTML = '<div class="rdq">' + header() + formHtml(d, s) + '</div>';
      wireForm();
    }
    el.querySelectorAll('[data-rdq-open]').forEach(function (b) {
      b.addEventListener('click', function () { openFile(b.getAttribute('data-rdq-open')); });
    });
    var rep = document.getElementById('rdqReplace');
    if (rep) rep.addEventListener('click', function () { state.editing = true; render(); });
  }

  function formHtml(d, s) {
    var p = d.prefill || {}, v = s || {};
    var appNum = v.application_number || p.application_number || '', roll = v.roll_no || p.roll_no || '';
    var locked = d.verified && p.application_number;
    return '<p class="rdq-sub">The RPSC board asks questions from your own DAF - your job, hometown, hobbies, education and branch. Upload your DAF and Jaspal Sir will prepare interview questions based on your profile.</p>' +
      '<form class="rdq-form" id="rdqForm" novalidate>' +
        '<label>Full name<input name="name" value="' + esc(p.name) + '" maxlength="120" required></label>' +
        '<label>Mobile number<input name="phone" value="' + esc(p.phone) + '" inputmode="numeric" maxlength="10" required></label>' +
        '<label>RPSC AE application number<input name="application_number" value="' + esc(appNum) + '" inputmode="numeric" maxlength="12" placeholder="e.g. 202434338188"' + (locked ? ' readonly' : '') + ' required></label>' +
        '<label>RPSC AE roll number<input name="roll_no" value="' + esc(roll) + '" maxlength="40"' + (locked ? ' readonly' : '') + ' required></label>' +
        '<label>Branch<select name="branch" required><option value="">Choose…</option>' + BRANCHES.map(function (b) {
          return '<option' + (v.branch === b ? ' selected' : '') + '>' + b + '</option>';
        }).join('') + '</select></label>' +
        '<label>Your DAF (PDF or photo, max ' + MAX_MB + ' MB)<input name="daf" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"' + (s ? '' : ' required') + '>' +
          (s ? '<small>Leave empty to keep the DAF you already uploaded.</small>' : '') + '</label>' +
        '<label class="rdq-check"><input type="checkbox" name="consent"> I agree to share my DAF with Dr. Jaspal Singh\'s team to prepare my questions.</label>' +
        '<p class="rdq-msg" id="rdqMsg" hidden></p>' +
        '<div class="rdq-actions"><button type="submit" class="rdq-btn" id="rdqSubmit"><i class="fas fa-paper-plane"></i> ' + (s ? 'Save changes' : 'Submit my DAF') + '</button>' +
          (s ? '<button type="button" class="rdq-link" id="rdqCancel">Cancel</button>' : '') + '</div>' +
        (d.verified ? '' : '<p class="rdq-muted"><i class="fas fa-shield-halved"></i> Only for RPSC AE 2024 candidates - your application number is checked when you submit.</p>') +
        '<p class="rdq-muted"><i class="fas fa-lock"></i> Your DAF is private - only Jaspal Sir\'s team can see it.</p>' +
      '</form>';
  }

  function say(text, ok) {
    var m = document.getElementById('rdqMsg');
    m.hidden = false; m.textContent = text;
    m.className = 'rdq-msg ' + (ok ? 'rdq-msg--ok' : 'rdq-msg--err');
  }

  function wireForm() {
    var f = document.getElementById('rdqForm');
    var cancel = document.getElementById('rdqCancel');
    if (cancel) cancel.addEventListener('click', function () { state.editing = false; render(); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (state.busy) return;
      var phone = f.phone.value.replace(/\D/g, '');
      var app = f.application_number.value.trim();
      var file = f.daf.files[0];
      if (!f.name.value.trim()) return say('Please enter your name.');
      if (phone.length !== 10) return say('Please enter your 10-digit mobile number.');
      if (!/^2024\d{8}$/.test(app)) return say('Application number must be 12 digits starting with 2024.');
      if (!f.roll_no.value.trim()) return say('Please enter your RPSC AE roll number.');
      if (!f.branch.value) return say('Please choose your branch.');
      if (!file && !(state.data && state.data.submission)) return say('Please choose your DAF file.');
      if (file && file.size > MAX_MB * 1024 * 1024) return say('The file is larger than ' + MAX_MB + ' MB. Please upload a smaller PDF or photo.');
      if (!f.consent.checked) return say('Please tick the consent box.');

      var fd = new FormData();
      fd.append('name', f.name.value.trim());
      fd.append('phone', phone);
      fd.append('application_number', app);
      fd.append('roll_no', f.roll_no.value.trim());
      fd.append('branch', f.branch.value);
      fd.append('consent', 'true');
      if (file) fd.append('daf', file);

      var btn = document.getElementById('rdqSubmit');
      state.busy = true; btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';
      api('/api/rpsc-daf', { method: 'POST', body: fd }).then(function (r) {
        state.data.submission = r.submission;
        state.data.verified = true;
        state.editing = false;
        render();
      }).catch(function (err) {
        say(err.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> ' + (state.data.submission ? 'Save changes' : 'Submit my DAF');
      }).then(function () { state.busy = false; });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
  window.RpscDaf = { load: load };
})();
