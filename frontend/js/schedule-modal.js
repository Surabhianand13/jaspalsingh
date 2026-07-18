/* ============================================================
   schedule-modal.js  -  Shared "See Schedule" experience
   Dr. Jaspal Singh Website  -  jaspalsingh.in

   Self-serve paper/answer-sheet download+upload for paid learners.
   Extracted from profile.js (2026-07-18) so both the /my-programs/
   page and the "premium" logged-in view of each program page can
   open the same modal without duplicating this logic.

   Requires learner-auth.js to be loaded first (uses window.LearnerAuth
   for the auth token).

   Exposes: window.ScheduleModal.open(slug, programName)
   ============================================================ */

(function () {
  'use strict';

  var API_BASE = (function () {
    var h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000' : 'https://jaspalsingh.onrender.com';
  })();

  function authFetch(path, opts) {
    var token = window.LearnerAuth ? window.LearnerAuth.getToken() : null;
    var isFormData = (opts || {}).body instanceof FormData;
    var headers = Object.assign(isFormData ? {} : { 'Content-Type': 'application/json' }, (opts || {}).headers || {});
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

  var scheduleState = { slug: null, name: null, tests: [], categories: [], category: null };

  /* Combo programs (RSSB Degree/Diploma, ESE Civil/General Studies) bundle
     two tracks under one program_slug - matches backend/routes/learner-
     schedule.js and the same labels in frontend/admin/js/admin.js. */
  var CATEGORY_LABELS = {
    'degree': 'Degree', 'diploma': 'Diploma',
    'civil': 'Civil (Paper 2)', 'general-studies': 'General Studies (Paper 1)',
  };
  function categoryLabel(cat) {
    return CATEGORY_LABELS[cat] || cat.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function ensureScheduleModal() {
    if (document.getElementById('scheduleModalOverlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'scheduleModalOverlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(26,26,46,.55);z-index:9999;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;';
    overlay.innerHTML =
      '<div style="background:#fff;border-radius:14px;max-width:640px;width:100%;padding:24px;position:relative;">' +
        '<button id="scheduleModalClose" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;color:#6b6b8a;">&times;</button>' +
        '<h3 id="scheduleModalHeading" style="margin:0 0 16px;color:#1A1A2E;font-size:19px;"></h3>' +
        '<div id="scheduleModalBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) closeScheduleModal(); });
    document.getElementById('scheduleModalClose').addEventListener('click', closeScheduleModal);
  }
  function closeScheduleModal() {
    var overlay = document.getElementById('scheduleModalOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function openScheduleModal(slug, name) {
    ensureScheduleModal();
    scheduleState.slug = slug; scheduleState.name = name; scheduleState.category = null;
    document.getElementById('scheduleModalHeading').textContent = name;
    document.getElementById('scheduleModalOverlay').style.display = 'flex';
    loadScheduleForCategory(null);
  }

  function loadScheduleForCategory(category) {
    var bodyEl = document.getElementById('scheduleModalBody');
    bodyEl.innerHTML = '<p class="profile-empty">Loading schedule…</p>';
    var path = '/api/schedule/' + encodeURIComponent(scheduleState.slug) + (category ? '?category=' + encodeURIComponent(category) : '');
    authFetch(path).then(function (data) {
      scheduleState.categories = data.categories || [];
      scheduleState.tests = data.tests || [];
      scheduleState.category = category;
      if (scheduleState.categories.length && !category) {
        renderTrackPicker();
      } else {
        renderScheduleList();
      }
    }).catch(function (err) {
      bodyEl.innerHTML = '<p class="profile-empty">' + esc(err.message || 'Could not load schedule.') + '</p>';
    });
  }

  function renderTrackPicker() {
    var bodyEl = document.getElementById('scheduleModalBody');
    bodyEl.innerHTML = '<p style="font-size:13px;color:#6b6b8a;margin-bottom:14px;">Which track are you enrolled in?</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        scheduleState.categories.map(function (c) {
          return '<button data-track="' + esc(c) + '" style="background:#0F766E;color:#fff;border:none;border-radius:10px;padding:14px;font-size:14px;font-weight:700;cursor:pointer;">' + esc(categoryLabel(c)) + '</button>';
        }).join('') +
      '</div>';
    bodyEl.querySelectorAll('[data-track]').forEach(function (btn) {
      btn.addEventListener('click', function () { loadScheduleForCategory(btn.getAttribute('data-track')); });
    });
  }

  function renderScheduleList() {
    var bodyEl = document.getElementById('scheduleModalBody');
    var tests = scheduleState.tests;
    var trackSwitcher = scheduleState.categories.length
      ? '<button id="scheduleTrackSwitch" style="background:none;border:none;color:#0F766E;font-weight:700;cursor:pointer;margin-bottom:10px;font-size:12.5px;">' + esc(categoryLabel(scheduleState.category)) + ' &middot; change track</button>'
      : '';
    bodyEl.innerHTML = trackSwitcher + (!tests.length
      ? '<p class="profile-empty">No tests scheduled yet - check back soon.</p>'
      : tests.map(function (t) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;border:1px solid #eee;border-radius:10px;padding:12px 16px;margin-bottom:10px;">' +
          '<div>' +
            '<div style="font-weight:700;color:#1A1A2E;">' + esc(t.test_date || ('Test ' + t.test_number)) + '</div>' +
            '<div style="font-size:12.5px;color:#6b6b8a;">Test no: ' + t.test_number + (t.syllabus ? ' &middot; ' + esc(t.syllabus) : '') + '</div>' +
          '</div>' +
          '<button class="btn" data-schedule-view="' + t.id + '" style="background:#0F766E;color:#fff;border:none;border-radius:20px;padding:8px 18px;font-size:12.5px;font-weight:700;cursor:pointer;">Next &rarr;</button>' +
        '</div>';
      }).join(''));
    var trackSwitchBtn = document.getElementById('scheduleTrackSwitch');
    if (trackSwitchBtn) trackSwitchBtn.addEventListener('click', function () { loadScheduleForCategory(null); });
    bodyEl.querySelectorAll('[data-schedule-view]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var test = tests.filter(function (t) { return String(t.id) === btn.getAttribute('data-schedule-view'); })[0];
        renderScheduleDetail(test);
      });
    });
  }

  function scheduleCard(label, iconClass, enabled, onClick) {
    var style = 'border:1px solid ' + (enabled ? '#0F766E' : '#eee') + ';border-radius:10px;padding:16px;text-align:center;cursor:' + (enabled ? 'pointer' : 'default') + ';opacity:' + (enabled ? '1' : '.45') + ';';
    var el = document.createElement('div');
    el.style.cssText = style;
    el.innerHTML = '<i class="fas ' + iconClass + '" style="font-size:22px;color:#0F766E;"></i><div style="margin-top:8px;font-weight:700;font-size:13px;color:#1A1A2E;">' + esc(label) + '</div>' +
      (!enabled ? '<div style="font-size:11px;color:#9999b0;margin-top:4px;">Not available yet</div>' : '');
    if (enabled && onClick) el.addEventListener('click', onClick);
    return el;
  }

  function renderScheduleDetail(test) {
    var bodyEl = document.getElementById('scheduleModalBody');
    bodyEl.innerHTML = '<button id="scheduleBackBtn" style="background:none;border:none;color:#0F766E;font-weight:700;cursor:pointer;margin-bottom:14px;">&larr; Back to schedule</button>' +
      '<div style="font-weight:700;color:#1A1A2E;margin-bottom:14px;">Test ' + test.test_number + (test.test_date ? ' &middot; ' + esc(test.test_date) : '') + '</div>' +
      '<div id="scheduleCardsGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;"></div>' +
      '<div id="scheduleOmrUploadArea" style="margin-top:16px;"></div>';

    document.getElementById('scheduleBackBtn').addEventListener('click', renderScheduleList);

    var grid = document.getElementById('scheduleCardsGrid');
    grid.appendChild(scheduleCard('Test Paper', 'fa-file-alt', !!test.question_paper_url, function () { window.open(test.question_paper_url, '_blank'); }));
    if (test.requires_omr_upload) {
      grid.appendChild(scheduleCard('Blank OMR', 'fa-clipboard-list', !!test.blank_omr_url, function () { window.open(test.blank_omr_url, '_blank'); }));
    }
    grid.appendChild(scheduleCard('Solution', 'fa-lightbulb', !!test.solution_url, function () { window.open(test.solution_url, '_blank'); }));

    if (test.requires_omr_upload) {
      renderOmrUploadArea(test);
    }
  }

  function renderOmrUploadArea(test) {
    var area = document.getElementById('scheduleOmrUploadArea');
    var alreadySubmittedNote = test.my_upload
      ? '<p class="profile-empty">You submitted on ' + esc(new Date(test.my_upload.uploaded_at).toLocaleString('en-IN')) + '. ' + (test.upload_open ? 'You can re-upload to replace it until the deadline.' : '') + '</p>'
      : '';
    if (!test.upload_open) {
      area.innerHTML = alreadySubmittedNote || '<p class="profile-empty"><i class="fas fa-lock"></i> Upload window is closed for this test.</p>';
      return;
    }
    area.innerHTML = alreadySubmittedNote +
      '<label style="font-weight:700;font-size:13px;color:#1A1A2E;display:block;margin-bottom:8px;">' + (test.my_upload ? 'Re-upload your answer sheet' : 'Upload your answer sheet (photo or PDF)') + '</label>' +
      '<input type="file" id="scheduleOmrFile" accept="image/*,application/pdf" style="display:block;margin-bottom:10px;">' +
      '<button id="scheduleOmrSubmit" style="background:#C81240;color:#fff;border:none;border-radius:20px;padding:9px 20px;font-size:12.5px;font-weight:700;cursor:pointer;">Submit</button>' +
      '<div id="scheduleOmrMsg" style="margin-top:8px;font-size:12.5px;"></div>';

    document.getElementById('scheduleOmrSubmit').addEventListener('click', function () {
      var fileInput = document.getElementById('scheduleOmrFile');
      var msgEl = document.getElementById('scheduleOmrMsg');
      if (!fileInput.files[0]) { msgEl.textContent = 'Choose a photo or PDF of your filled answer sheet first.'; msgEl.style.color = '#C81240'; return; }
      var fd = new FormData();
      fd.append('photo', fileInput.files[0]);
      msgEl.textContent = 'Uploading…'; msgEl.style.color = '#6b6b8a';
      authFetch('/api/schedule/' + encodeURIComponent(scheduleState.slug) + '/tests/' + test.id + '/submit-omr', { method: 'POST', body: fd })
        .then(function () {
          msgEl.textContent = 'Submitted!'; msgEl.style.color = '#0F766E';
          document.getElementById('scheduleOmrSubmit').disabled = true;
        })
        .catch(function (err) { msgEl.textContent = err.message || 'Upload failed.'; msgEl.style.color = '#C81240'; });
    });
  }

  window.ScheduleModal = { open: openScheduleModal };

})();
