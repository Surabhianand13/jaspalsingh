/* ============================================================
   profile.js  -  My Profile Page Logic
   Dr. Jaspal Singh Website  -  jaspalsingh.in
   ============================================================ */

(function () {
  'use strict';

  var TOKEN_KEY = 'jaspal_learner_token';
  var USER_KEY  = 'jaspal_learner';
  var API_BASE  = 'https://jaspalsingh.onrender.com';
  var REFERRAL_CLAIM_FORM_URL = 'https://tally.so/r/xXog2G';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser()  {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  }

  function authFetch(path, opts) {
    var token = getToken();
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

  /* ── Guard: redirect if not logged in ───────────────────── */
  function init() {
    if (!getToken()) {
      document.getElementById('profileNotLoggedIn').style.display = 'block';
      return;
    }
    document.getElementById('profileContent').style.display = 'block';
    loadProfile();
    loadReferralCode();
    loadEnrolledPrograms();
    loadFreeResources();
    loadDownloads();
    setupPhotoUpload();

    document.getElementById('profileLogoutBtn').addEventListener('click', function () {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      window.location.href = '/';
    });

    document.getElementById('profileForm').addEventListener('submit', onSave);
  }

  /* ── Photo upload ────────────────────────────────────────── */
  function setupPhotoUpload() {
    var input = document.getElementById('profilePhotoInput');
    if (!input) return;
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { showMsg('Photo must be under 2MB.', 'error'); return; }

      var reader = new FileReader();
      reader.onload = function (e) {
        var dataUrl = e.target.result;
        // Show preview
        var img = document.getElementById('profileAvatarImg');
        var initials = document.getElementById('profileInitials');
        img.src = dataUrl;
        img.style.display = 'block';
        initials.style.display = 'none';
        // Save to profile as data URL (or use Cloudinary upload if available)
        authFetch('/api/learners/me', {
          method: 'PUT',
          body: JSON.stringify({ photo_url: dataUrl }),
        }).then(function () {
          showMsg('Photo updated!', 'success');
        }).catch(function () {
          showMsg('Could not save photo. Try again.', 'error');
        });
      };
      reader.readAsDataURL(file);
    });
  }

  /* ── Load profile from API ───────────────────────────────── */
  function loadProfile() {
    authFetch('/api/learners/me').then(function (data) {
      var l = data.learner;

      // Avatar
      if (l.photo_url) {
        var img = document.getElementById('profileAvatarImg');
        img.src = l.photo_url;
        img.style.display = 'block';
        document.getElementById('profileInitials').style.display = 'none';
      } else {
        var initials = (l.name || '?').split(' ').map(function(w) { return w[0]; }).slice(0,2).join('').toUpperCase();
        document.getElementById('profileInitials').textContent = initials;
      }

      // Header
      document.getElementById('profileDisplayName').textContent = l.name || 'My Profile';
      var meta = [];
      if (l.target_exam && l.target_exam !== 'General') meta.push(l.target_exam + ' Aspirant');
      if (l.city) meta.push(l.city);
      if (l.email) meta.push(l.email);
      document.getElementById('profileMetaLine').textContent = meta.join(' · ');

      // Form fields
      document.getElementById('pfName').value    = l.name    || '';
      document.getElementById('pfEmail').value   = l.email   || '';
      document.getElementById('pfPhone').value   = l.phone   || '';
      document.getElementById('pfCity').value    = l.city    || '';
      document.getElementById('pfCollege').value = l.graduation_college || '';
      if (l.dob) document.getElementById('pfDob').value = l.dob.split('T')[0];

      var genderSel = document.getElementById('pfGender');
      if (l.gender) {
        for (var i = 0; i < genderSel.options.length; i++) {
          if (genderSel.options[i].value === l.gender) { genderSel.selectedIndex = i; break; }
        }
      }

      var examSel = document.getElementById('pfExam');
      if (l.target_exam) {
        for (var j = 0; j < examSel.options.length; j++) {
          if (examSel.options[j].value === l.target_exam) { examSel.selectedIndex = j; break; }
        }
      }

      // Cache
      var cached = getUser() || {};
      cached.name = l.name;
      localStorage.setItem(USER_KEY, JSON.stringify(cached));

    }).catch(function (err) {
      showMsg('Could not load profile: ' + err.message, 'error');
    });
  }

  /* ── Load referral code ──────────────────────────────────── */
  function loadReferralCode() {
    var body = document.getElementById('referralBody');
    if (!body) return;
    authFetch('/api/payment/my-referral-code').then(function (data) {
      if (!data.referral_code) {
        body.innerHTML = '<p class="profile-empty"><i class="fas fa-gift"></i> Enroll in a program to unlock your referral code.<br>' +
          '<a href="/programs">Browse programs &rarr;</a></p>';
        return;
      }
      body.innerHTML =
        '<div style="padding:16px;border-radius:12px;background:linear-gradient(135deg,#fff4e6,#ffe8d6);border:1px dashed #C81240;text-align:center;">' +
          '<div style="font-size:13px;color:#6b6b8a;margin-bottom:10px;">Share this code. Your friend gets &#8377;100 off, you get &#8377;100 once they enroll.</div>' +
          '<div style="display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap;">' +
            '<span style="font-size:18px;font-weight:800;letter-spacing:1px;color:#C81240;">' + esc(data.referral_code) + '</span>' +
            '<button type="button" id="profileCopyReferralBtn" style="background:#C81240;color:#fff;border:none;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;">Copy</button>' +
          '</div>' +
          '<div style="font-size:12px;color:#6b6b8a;margin-top:10px;">Earned so far: &#8377;' + Number(data.total_earned || 0).toLocaleString('en-IN') +
            ' &middot; Pending: &#8377;' + Number(data.total_pending || 0).toLocaleString('en-IN') + '</div>' +
          '<a href="' + REFERRAL_CLAIM_FORM_URL + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:14px;background:#C81240;color:#fff;border-radius:20px;padding:8px 18px;font-size:12px;font-weight:700;text-decoration:none;">Submit Referral Claim &rarr;</a>' +
          '<div style="font-size:11px;color:#9999b0;margin-top:8px;">Your friend already paid? Submit their payment screenshot here to get your &#8377;100 - claims are paid out daily by 10 PM.</div>' +
        '</div>';
      var copyBtn = document.getElementById('profileCopyReferralBtn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          navigator.clipboard.writeText(data.referral_code).then(function () {
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
          });
        });
      }
    }).catch(function () {
      body.innerHTML = '<p class="profile-empty">Could not load referral code.</p>';
    });
  }

  /* ── Load enrolled programs ──────────────────────────────── */
  function loadEnrolledPrograms() {
    var body = document.getElementById('enrolledBody');
    authFetch('/api/enrollment/my-enrollments').then(function (data) {
      var enrollments = data.enrollments || [];
      if (!enrollments.length) {
        body.innerHTML = '<p class="profile-empty"><i class="fas fa-graduation-cap"></i> No enrolled programs yet.<br>' +
          '<a href="/programs">Browse programs &rarr;</a></p>';
        return;
      }

      var PROGRAM_COLORS = {
        'rssb-jen-diploma-test-series':  { bg: 'linear-gradient(135deg,#0369A1,#0284C7)', icon: 'fa-clipboard-list' },
        'rssb-jen-degree-test-series':   { bg: 'linear-gradient(135deg,#0F766E,#0D9488)', icon: 'fa-clipboard-check' },
        'rpsc-ae-interview':             { bg: 'linear-gradient(135deg,#6D28D9,#7C3AED)', icon: 'fa-user-tie' },
        'rssb-jen-crash-course':         { bg: 'linear-gradient(135deg,#B45309,#C2410C)', icon: 'fa-bolt' },
        'gate-ese-foundation':           { bg: 'linear-gradient(135deg,#166534,#15803D)', icon: 'fa-graduation-cap' },
      };

      var html = '<div class="enrolled-grid">';
      enrollments.forEach(function(e) {
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
            '<a href="/programs/' + esc(e.program_slug) + '/" class="enrolled-link">View Program &rarr;</a> ' +
            '<a href="#" class="enrolled-link" data-schedule-open="' + esc(e.program_slug) + '" data-schedule-name="' + esc(e.program_name) + '">Schedule &rarr;</a>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
      body.innerHTML = html;
      body.querySelectorAll('[data-schedule-open]').forEach(function (link) {
        link.addEventListener('click', function (ev) {
          ev.preventDefault();
          openScheduleModal(link.getAttribute('data-schedule-open'), link.getAttribute('data-schedule-name'));
        });
      });

    }).catch(function () {
      body.innerHTML = '<p class="profile-empty">Could not load enrolled programs.</p>';
    });
  }

  /* ── Schedule: Test Paper / OMR / Answer Key / Solution / Response Sheet ──
     Self-serve replacement for admin manually emailing papers/OMR sheets.
     Every list/detail/upload call is gated server-side by the learner's
     active (paid, non-refunded) enrollment - see backend
     utils/enrollmentAccess.js. A refunded learner gets a 403 here, same
     as if they'd never purchased. */
  var scheduleState = { slug: null, name: null, tests: [] };

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
    scheduleState.slug = slug; scheduleState.name = name;
    document.getElementById('scheduleModalHeading').textContent = name;
    document.getElementById('scheduleModalOverlay').style.display = 'flex';
    var bodyEl = document.getElementById('scheduleModalBody');
    bodyEl.innerHTML = '<p class="profile-empty">Loading schedule…</p>';

    authFetch('/api/schedule/' + encodeURIComponent(slug)).then(function (data) {
      scheduleState.tests = data.tests || [];
      renderScheduleList();
    }).catch(function (err) {
      bodyEl.innerHTML = '<p class="profile-empty">' + esc(err.message || 'Could not load schedule.') + '</p>';
    });
  }

  function renderScheduleList() {
    var bodyEl = document.getElementById('scheduleModalBody');
    var tests = scheduleState.tests;
    if (!tests.length) {
      bodyEl.innerHTML = '<p class="profile-empty">No tests scheduled yet - check back soon.</p>';
      return;
    }
    bodyEl.innerHTML = tests.map(function (t) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;border:1px solid #eee;border-radius:10px;padding:12px 16px;margin-bottom:10px;">' +
        '<div>' +
          '<div style="font-weight:700;color:#1A1A2E;">' + esc(t.test_date || ('Test ' + t.test_number)) + '</div>' +
          '<div style="font-size:12.5px;color:#6b6b8a;">Test no: ' + t.test_number + (t.syllabus ? ' &middot; ' + esc(t.syllabus) : '') + '</div>' +
        '</div>' +
        '<button class="btn" data-schedule-view="' + t.id + '" style="background:#0F766E;color:#fff;border:none;border-radius:20px;padding:8px 18px;font-size:12.5px;font-weight:700;cursor:pointer;">Next &rarr;</button>' +
      '</div>';
    }).join('');
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

  /* ── Save profile ────────────────────────────────────────── */
  function onSave(e) {
    e.preventDefault();
    clearMsg();

    var name    = document.getElementById('pfName').value.trim();
    var phone   = document.getElementById('pfPhone').value.trim();
    var city    = document.getElementById('pfCity').value.trim();
    var dob     = document.getElementById('pfDob').value;
    var gender  = document.getElementById('pfGender').value;
    var exam    = document.getElementById('pfExam').value;
    var college = document.getElementById('pfCollege').value.trim();

    if (!name) { showMsg('Name is required.', 'error'); return; }

    var btn = document.getElementById('pfSaveBtn');
    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

    authFetch('/api/learners/me', {
      method: 'PUT',
      body: JSON.stringify({
        name, phone: phone || null, city: city || null,
        dob: dob || null, gender: gender || null,
        target_exam: exam || null, graduation_college: college || null,
      }),
    }).then(function (data) {
      showMsg('Profile saved successfully!', 'success');
      var l = data.learner;
      document.getElementById('profileDisplayName').textContent = l.name;
      var meta = [];
      if (l.target_exam && l.target_exam !== 'General') meta.push(l.target_exam + ' Aspirant');
      if (l.city) meta.push(l.city);
      if (l.email) meta.push(l.email);
      document.getElementById('profileMetaLine').textContent = meta.join(' · ');
      var cached = getUser() || {};
      cached.name = l.name;
      localStorage.setItem(USER_KEY, JSON.stringify(cached));
    }).catch(function (err) {
      showMsg('Save failed: ' + err.message, 'error');
    }).finally(function () {
      btn.disabled  = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    });
  }

  /* ── Load downloads ──────────────────────────────────────── */
  function loadDownloads() {
    authFetch('/api/learners/downloads').then(function (data) {
      var downloads = data.downloads || [];
      var body = document.getElementById('downloadsBody');

      if (!downloads.length) {
        body.innerHTML = '<p class="profile-empty"><i class="fas fa-inbox"></i> No downloads yet.<br>' +
          '<a href="/resources">Browse resources &rarr;</a></p>';
        return;
      }

      var rows = downloads.map(function (d) {
        var date = d.downloaded_at
          ? new Date(d.downloaded_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '';
        return '<tr>' +
          '<td><span class="dl-title">' + esc(d.title) + '</span><br>' +
               '<span class="dl-sub">' + esc(d.subject) + ' · ' + esc(d.resource_type) + '</span></td>' +
          '<td class="dl-date">' + date + '</td>' +
          '<td><a href="' + esc(d.file_url) + '" target="_blank" rel="noopener" class="btn btn-sm">' +
               '<i class="fas fa-download"></i> Open</a></td>' +
          '</tr>';
      }).join('');

      body.innerHTML = '<div class="dl-table-wrap"><table class="dl-table">' +
        '<thead><tr><th>Resource</th><th>Date</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';

    }).catch(function () {
      document.getElementById('downloadsBody').innerHTML =
        '<p class="profile-empty">Could not load download history.</p>';
    });
  }

  function loadFreeResources() {
    var body = document.getElementById('freeResourcesBody');
    if (!body) return;
    authFetch('/api/free-resources').then(function (resources) {
      if (!resources.length) {
        body.innerHTML = '<p class="profile-empty"><i class="fas fa-inbox"></i> No free resources available yet. Check back soon!</p>';
        return;
      }
      var cards = resources.map(function (r) {
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid rgba(26,26,46,.07);">' +
          '<div style="display:flex;align-items:center;gap:12px;">' +
            '<div style="width:36px;height:36px;border-radius:10px;background:#fff0f4;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
              '<i class="fas fa-file-pdf" style="color:#c81240;font-size:15px;"></i>' +
            '</div>' +
            '<div>' +
              '<div style="font-size:14px;font-weight:700;color:#0f172a;">' + esc(r.title) + '</div>' +
              (r.description ? '<div style="font-size:12px;color:#64748b;margin-top:2px;">' + esc(r.description) + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<a href="' + esc(r.pdf_url) + '" target="_blank" rel="noopener" ' +
             'style="flex-shrink:0;display:inline-flex;align-items:center;gap:6px;background:#c81240;color:#fff;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">' +
            '<i class="fas fa-eye"></i> View' +
          '</a>' +
        '</div>';
      }).join('');
      body.innerHTML = '<div style="padding:0 4px;">' + cards + '</div>' +
        '<div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(26,26,46,.07);text-align:center;">' +
          '<a href="/" style="font-size:13px;font-weight:600;color:#c81240;text-decoration:none;">' +
            '<i class="fas fa-arrow-left"></i> Explore Programs &rarr;' +
          '</a>' +
        '</div>';

      /* Auto-scroll if arriving from resource page */
      if (window.location.hash === '#free-resources') {
        setTimeout(function () {
          var sec = document.getElementById('free-resources');
          if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 400);
      }
    }).catch(function () {
      body.innerHTML = '<p class="profile-empty">Could not load free resources.</p>';
    });
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function showMsg(msg, type) {
    var el = document.getElementById('profileFormMsg');
    el.textContent   = msg;
    el.className     = 'profile-msg profile-msg--' + type;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function clearMsg() {
    var el = document.getElementById('profileFormMsg');
    el.style.display = 'none'; el.textContent = '';
  }
  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

})();
