/* ============================================================
   profile.js — My Profile Page Logic
   Dr. Jaspal Singh Website — jaspalsingh.in
   ============================================================ */

(function () {
  'use strict';

  var TOKEN_KEY = 'jaspal_learner_token';
  var USER_KEY  = 'jaspal_learner';

  var API_BASE = (function () {
    var h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000' : '';
  })();

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser()  {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  }

  function authFetch(path, opts) {
    var token = getToken();
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

  /* ── Guard: redirect if not logged in ───────────────────── */

  function init() {
    if (!getToken()) {
      document.getElementById('profileNotLoggedIn').style.display = 'block';
      return;
    }
    document.getElementById('profileContent').style.display = 'block';
    loadProfile();
    loadDownloads();

    document.getElementById('profileLogoutBtn').addEventListener('click', function () {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      window.location.href = '/';
    });

    document.getElementById('profileForm').addEventListener('submit', onSave);
  }

  /* ── Load profile from API ───────────────────────────────── */

  function loadProfile() {
    authFetch('/api/learners/me').then(function (data) {
      var l = data.learner;

      /* Header */
      document.getElementById('profileDisplayName').textContent = l.name || 'My Profile';
      var meta = [];
      if (l.target_exam && l.target_exam !== 'General') meta.push(l.target_exam + ' Aspirant');
      if (l.email) meta.push(l.email);
      document.getElementById('profileMetaLine').textContent = meta.join(' · ');

      /* Form */
      document.getElementById('pfName').value    = l.name    || '';
      document.getElementById('pfEmail').value   = l.email   || '';
      document.getElementById('pfPhone').value   = l.phone   || '';
      document.getElementById('pfCollege').value = l.graduation_college || '';
      if (l.dob) document.getElementById('pfDob').value = l.dob.split('T')[0];

      var genderSel = document.getElementById('pfGender');
      if (l.gender) {
        for (var i = 0; i < genderSel.options.length; i++) {
          if (genderSel.options[i].value === l.gender) {
            genderSel.selectedIndex = i;
            break;
          }
        }
      }

      var examSel = document.getElementById('pfExam');
      if (l.target_exam) {
        for (var j = 0; j < examSel.options.length; j++) {
          if (examSel.options[j].value === l.target_exam) {
            examSel.selectedIndex = j;
            break;
          }
        }
      }

      /* Update cached user name */
      var cached = getUser() || {};
      cached.name = l.name;
      localStorage.setItem(USER_KEY, JSON.stringify(cached));

    }).catch(function (err) {
      showMsg('Could not load profile: ' + err.message, 'error');
    });
  }

  /* ── Save profile ────────────────────────────────────────── */

  function onSave(e) {
    e.preventDefault();
    clearMsg();

    var name   = document.getElementById('pfName').value.trim();
    var phone  = document.getElementById('pfPhone').value.trim();
    var dob    = document.getElementById('pfDob').value;
    var gender = document.getElementById('pfGender').value;
    var exam   = document.getElementById('pfExam').value;
    var college = document.getElementById('pfCollege').value.trim();

    if (!name) { showMsg('Name is required.', 'error'); return; }

    var btn = document.getElementById('pfSaveBtn');
    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

    authFetch('/api/learners/me', {
      method: 'PUT',
      body: JSON.stringify({
        name:               name,
        phone:              phone   || null,
        dob:                dob     || null,
        gender:             gender  || null,
        target_exam:        exam    || null,
        graduation_college: college || null,
      }),
    }).then(function (data) {
      showMsg('Profile saved successfully!', 'success');
      var l = data.learner;
      document.getElementById('profileDisplayName').textContent = l.name;
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
        body.innerHTML =
          '<p class="profile-empty"><i class="fas fa-inbox"></i> No downloads yet.<br>' +
          '<a href="/resources">Browse resources →</a></p>';
        return;
      }

      var rows = downloads.map(function (d) {
        var date = d.downloaded_at
          ? new Date(d.downloaded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : '';
        return '<tr>' +
          '<td><span class="dl-title">' + esc(d.title) + '</span><br>' +
               '<span class="dl-sub">' + esc(d.subject) + ' · ' + esc(d.resource_type) + '</span></td>' +
          '<td class="dl-date">' + date + '</td>' +
          '<td><a href="' + esc(d.file_url) + '" target="_blank" rel="noopener" class="btn btn-sm">' +
               '<i class="fas fa-download"></i> Open</a></td>' +
          '</tr>';
      }).join('');

      body.innerHTML =
        '<div class="dl-table-wrap"><table class="dl-table">' +
          '<thead><tr><th>Resource</th><th>Date</th><th></th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>';
    }).catch(function () {
      document.getElementById('downloadsBody').innerHTML =
        '<p class="profile-empty">Could not load download history.</p>';
    });
  }

  /* ── Helpers ─────────────────────────────────────────────── */

  function showMsg(msg, type) {
    var el = document.getElementById('profileFormMsg');
    el.textContent  = msg;
    el.className    = 'profile-msg profile-msg--' + type;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearMsg() {
    var el = document.getElementById('profileFormMsg');
    el.style.display = 'none';
    el.textContent   = '';
  }

  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/"/g,'&quot;');
  }

  /* ── Boot ────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
