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
