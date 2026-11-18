/* ============================================================
   announcements-admin.js  -  Admin > Learners > Email announcements
   One-time emails to every learner on the platform (registered +
   paid), one per email address, each at most once per campaign.
   Send sample first, then Send to all. Backend: routes/announcements.js
   Exposes: window.AnnouncementsAdmin.load()
   ============================================================ */

(function () {
  'use strict';

  var API = location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';

  function token() { return localStorage.getItem('jaspal_admin_token'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function msg(text, type) {
    if (typeof window.showToast === 'function') return window.showToast(text, type);
    alert(text);
  }
  function api(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, { Authorization: 'Bearer ' + token() }),
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (r.status === 401) { location.href = '/admin/login'; throw new Error('Session expired'); }
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ('Request failed (' + r.status + ')'));
        return d;
      });
    });
  }

  function load() {
    var root = document.getElementById('announcementsAdmin');
    if (!root) return;
    if (!root.innerHTML) root.innerHTML = '<p class="admin-empty">Loading announcements…</p>';
    api('GET', '/api/announcements/admin').then(function (d) {
      if (!d.campaigns.length) { root.innerHTML = ''; return; }
      root.innerHTML = '<div style="background:#fff;border:1.5px solid #E2E8F0;border-radius:12px;padding:14px 16px;">' +
        '<div style="font-weight:800;font-size:14px;margin-bottom:4px;"><i class="fas fa-bullhorn" style="color:#C81240;margin-right:6px;"></i>Email announcements</div>' +
        '<div style="font-size:12px;color:#64748B;margin-bottom:10px;">Goes to every learner on the platform (registered + paid), one per email address, at most once per announcement.</div>' +
        d.campaigns.map(function (c) {
          return '<div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between;border-top:1px solid #F1F5F9;padding-top:10px;margin-top:8px;">' +
            '<div style="font-size:13.5px;"><strong>' + esc(c.title) + '</strong><br><span style="font-size:12px;color:#64748B;">Subject: ' + esc(c.subject) + ' · sent to <strong>' + c.sent + '</strong> of ' + c.total + '</span></div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
              '<input type="email" data-an-to="' + esc(c.key) + '" value="biz@solvvai.com" style="border:1.5px solid #E2E8F0;border-radius:8px;padding:7px 10px;font-size:13px;min-width:200px;">' +
              '<button class="btn-admin-secondary" style="padding:6px 12px;font-size:12.5px;" data-an-sample="' + esc(c.key) + '"><i class="fas fa-eye"></i> Send sample</button>' +
              '<button class="btn-admin-primary" style="padding:6px 12px;font-size:12.5px;" data-an-all="' + esc(c.key) + '" data-n="' + c.pending + '"' + (c.pending ? '' : ' disabled') + '><i class="fas fa-paper-plane"></i> Send to all (' + c.pending + ')</button>' +
            '</div></div>';
        }).join('') + '</div>';
      root.querySelectorAll('[data-an-sample]').forEach(function (b) {
        b.addEventListener('click', function () {
          var key = b.getAttribute('data-an-sample');
          var to = root.querySelector('[data-an-to="' + key + '"]').value.trim();
          b.disabled = true;
          api('POST', '/api/announcements/admin/' + encodeURIComponent(key), { mode: 'sample', to: to })
            .then(function () { msg('Sample sent to ' + to + '.', 'success'); })
            .catch(function (e) { msg(e.message, 'error'); })
            .then(function () { b.disabled = false; });
        });
      });
      root.querySelectorAll('[data-an-all]').forEach(function (b) {
        b.addEventListener('click', function () {
          var key = b.getAttribute('data-an-all'), n = b.getAttribute('data-n');
          if (!confirm('Email this announcement to ' + n + ' learner(s)?\n\nEveryone on the platform (free + paid), one email each, never twice. It takes a few minutes per 100 emails.')) return;
          b.disabled = true;
          api('POST', '/api/announcements/admin/' + encodeURIComponent(key), { mode: 'all' }).then(function (r) {
            msg('Sending to ' + r.queued + ' learner(s) - it runs in the background. Reload later to see the count.', 'success');
            load();
          }).catch(function (e) { msg(e.message, 'error'); b.disabled = false; });
        });
      });
    }).catch(function (e) { root.innerHTML = '<p class="admin-empty" style="color:#B91C1C;">' + esc(e.message) + '</p>'; });
  }

  window.AnnouncementsAdmin = { load: load };
})();
