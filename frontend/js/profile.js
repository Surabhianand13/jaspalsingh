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

  function authFetchBlob(path) {
    var token = getToken();
    var headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    return fetch(API_BASE + path, { headers: headers }).then(function (res) {
      if (!res.ok) {
        return res.json().then(
          function (data) { throw new Error(data.error || 'Request failed (' + res.status + ')'); },
          function ()     { throw new Error('Request failed (' + res.status + ')'); }
        );
      }
      return res.blob();
    });
  }

  /* Learner name/email tiled over each rendered page. Big PDFs are
     streamed without a burned-in stamp (backend utils/pdfWatermark.js,
     to keep the server from running out of memory), so this keeps every
     page visibly marked either way. */
  function drawViewerWatermark(canvas) {
    var u = {};
    try { u = JSON.parse(localStorage.getItem('jaspal_learner') || '{}') || {}; } catch (e) { u = {}; }
    var text = [u.name, u.email].filter(Boolean).join(' · ');
    if (!text) return;
    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#8c1a1a';
    ctx.font = 'bold ' + Math.round(canvas.width / 45) + 'px Arial, sans-serif';
    var step = ctx.measureText(text).width + 80;
    ctx.rotate(-Math.PI / 6);
    for (var y = -canvas.height; y < canvas.height * 2; y += Math.round(canvas.width / 6)) {
      for (var x = -canvas.width; x < canvas.width * 2; x += step) ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  /* ── Free-resource PDF viewer (PDF.js canvas, no download) ── */
  var PDFJS_VERSION = '3.11.174';
  var pdfjsLoadPromise = null;
  function ensurePdfJs() {
    if (!pdfjsLoadPromise) {
      pdfjsLoadPromise = new Promise(function (resolve, reject) {
        if (window.pdfjsLib) return resolve(window.pdfjsLib);
        var script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/pdf.min.js';
        script.onload = function () {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        };
        script.onerror = function () { reject(new Error('Could not load the PDF viewer. Check your connection and try again.')); };
        document.head.appendChild(script);
      });
    }
    return pdfjsLoadPromise;
  }

  var frViewerState = { pdfDoc: null };
  var frGatingTypes = {};

  function ensureFrViewerOverlay() {
    if (document.getElementById('frPdfViewerOverlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'frPdfViewerOverlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:#1A1A2E;z-index:10000;flex-direction:column;';
    overlay.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:#fff;border-bottom:1px solid #eee;">' +
        '<span style="font-weight:700;color:#1A1A2E;font-size:13.5px;"><i class="fas fa-lock"></i> View only - downloading is disabled</span>' +
        '<button id="frPdfViewerClose" style="background:none;border:none;font-size:22px;cursor:pointer;color:#6b6b8a;">&times;</button>' +
      '</div>' +
      '<div id="frPdfViewerPages" style="flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;align-items:center;gap:14px;user-select:none;-webkit-user-select:none;"></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('contextmenu', function (ev) { ev.preventDefault(); return false; });
    document.getElementById('frPdfViewerClose').addEventListener('click', closeFrViewer);
  }

  function closeFrViewer() {
    var overlay = document.getElementById('frPdfViewerOverlay');
    if (overlay) overlay.style.display = 'none';
    var pagesEl = document.getElementById('frPdfViewerPages');
    if (pagesEl) pagesEl.innerHTML = '';
    if (frViewerState.pdfDoc) { frViewerState.pdfDoc.destroy(); frViewerState.pdfDoc = null; }
  }

  /* ── RPSC AE Verification modal ─────────────────────────── */
  var rpscVerifyPendingId = null;

  function ensureRpscModal() {
    if (document.getElementById('rpscAeModal')) return;
    var modal = document.createElement('div');
    modal.id = 'rpscAeModal';
    modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.6);align-items:center;justify-content:center;';
    modal.innerHTML =
      '<div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
        '<h3 style="margin:0 0 8px;font-size:18px;color:#0f172a;"><i class="fas fa-shield-alt" style="color:#c81240;margin-right:8px;"></i>Verify RPSC AE Application</h3>' +
        '<p style="margin:0 0 20px;font-size:13px;color:#64748b;">This document is exclusively for RPSC AE 2024 interview candidates. Enter your application details to unlock access.</p>' +
        '<div style="margin-bottom:14px;">' +
          '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Application Number *</label>' +
          '<input id="rpscAppNum" type="text" inputmode="numeric" placeholder="e.g. 202434338188" maxlength="12" ' +
            'style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;box-sizing:border-box;" />' +
          '<div style="font-size:11px;color:#94a3b8;margin-top:4px;">12 digits - must start with 2024</div>' +
        '</div>' +
        '<div style="margin-bottom:20px;">' +
          '<label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:5px;">Roll Number *</label>' +
          '<input id="rpscRollNum" type="text" placeholder="Your RPSC AE roll number" ' +
            'style="width:100%;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;box-sizing:border-box;" />' +
        '</div>' +
        '<div id="rpscVerifyMsg" style="display:none;font-size:13px;padding:10px 14px;border-radius:8px;margin-bottom:14px;"></div>' +
        '<div style="display:flex;gap:10px;">' +
          '<button id="rpscVerifyBtn" style="flex:1;background:#c81240;color:#fff;border:none;padding:11px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">' +
            '<i class="fas fa-unlock"></i> Verify &amp; Open' +
          '</button>' +
          '<button onclick="closeRpscModal()" style="flex:0 0 auto;background:#f1f5f9;color:#374151;border:none;padding:11px 16px;border-radius:8px;font-size:14px;cursor:pointer;">Cancel</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('rpscVerifyBtn').addEventListener('click', submitRpscVerify);
    modal.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitRpscVerify(); });
  }

  function showRpscModal(resourceId) {
    rpscVerifyPendingId = resourceId;
    ensureRpscModal();
    document.getElementById('rpscAppNum').value = '';
    document.getElementById('rpscRollNum').value = '';
    var msg = document.getElementById('rpscVerifyMsg');
    msg.style.display = 'none'; msg.textContent = '';
    var btn = document.getElementById('rpscVerifyBtn');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-unlock"></i> Verify &amp; Open';
    var modal = document.getElementById('rpscAeModal');
    modal.style.display = 'flex';
    setTimeout(function () { document.getElementById('rpscAppNum').focus(); }, 100);
  }

  function closeRpscModal() {
    var modal = document.getElementById('rpscAeModal');
    if (modal) modal.style.display = 'none';
    rpscVerifyPendingId = null;
  }

  function submitRpscVerify() {
    var appNum  = (document.getElementById('rpscAppNum').value || '').trim();
    var rollNum = (document.getElementById('rpscRollNum').value || '').trim();
    var msgEl   = document.getElementById('rpscVerifyMsg');
    var btn     = document.getElementById('rpscVerifyBtn');

    if (!appNum || !rollNum) {
      setRpscMsg('Please fill in both fields.', 'error'); return;
    }
    if (!/^2024\d{8}$/.test(appNum)) {
      setRpscMsg('Application number must be 12 digits starting with 2024 (e.g. 202434338188).', 'error'); return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
    setRpscMsg('', '');

    authFetch('/api/free-resources/rpsc-verify', {
      method: 'POST',
      body: JSON.stringify({ application_number: appNum, roll_no: rollNum }),
    }).then(function () {
      setRpscMsg('Verified! Opening document...', 'success');
      var pending = rpscVerifyPendingId;
      setTimeout(function () {
        closeRpscModal();
        openFreeResourceViewer(pending, null);
      }, 800);
    }).catch(function (err) {
      setRpscMsg(err.message || 'Verification failed. Please try again.', 'error');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-unlock"></i> Verify &amp; Open';
    });
  }

  function setRpscMsg(text, type) {
    var el = document.getElementById('rpscVerifyMsg');
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
    el.style.background = type === 'error' ? '#fef2f2' : '#f0fdf4';
    el.style.color      = type === 'error' ? '#991b1b' : '#166534';
  }



  function openFreeResourceViewer(resourceId, gatingType) {
    if (gatingType === 'rpsc_ae') {
      authFetch('/api/free-resources/rpsc-verify-status').then(function (data) {
        if (data.verified) { openFreeResourceViewer(resourceId, null); }
        else { showRpscModal(resourceId); }
      }).catch(function () { showRpscModal(resourceId); });
      return;
    }
    closeFrViewer();
    ensureFrViewerOverlay();
    var overlay = document.getElementById('frPdfViewerOverlay');
    var pagesEl = document.getElementById('frPdfViewerPages');
    overlay.style.display = 'flex';
    pagesEl.innerHTML = '<p style="color:#fff;">Loading...</p>';
    Promise.all([
      ensurePdfJs(),
      authFetchBlob('/api/free-resources/' + encodeURIComponent(resourceId) + '/view'),
    ]).then(function (results) {
      var pdfjsLib = results[0];
      var blob = results[1];
      return blob.arrayBuffer().then(function (buf) {
        return pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
      });
    }).then(function (pdfDoc) {
      frViewerState.pdfDoc = pdfDoc;
      pagesEl.innerHTML = '';
      var renderPage = function (pageNum) {
        if (pageNum > pdfDoc.numPages) return;
        pdfDoc.getPage(pageNum).then(function (page) {
          var viewport = page.getViewport({ scale: 1.3 });
          var canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.cssText = 'max-width:100%;box-shadow:0 2px 10px rgba(0,0,0,.3);';
          pagesEl.appendChild(canvas);
          page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function () {
            drawViewerWatermark(canvas);
            renderPage(pageNum + 1);
          });
        });
      };
      renderPage(1);
    }).catch(function (err) {
      pagesEl.innerHTML = '<p style="color:#fff;padding:20px;">' + esc(err.message || 'Could not load this resource.') + '</p>';
    });
  }

  /* ── Guard: redirect if not logged in ───────────────────── */
  function init() {
    if (!getToken()) {
      document.getElementById('profileNotLoggedIn').style.display = 'block';
      return;
    }
    document.getElementById('profileContent').style.display = 'block';
    setupProfileTabs();
    loadDashboard();
    loadProfile();
    loadReferralCode();
    loadFreeResources();
    setupPhotoUpload();

    document.getElementById('profileLogoutBtn').addEventListener('click', function () {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem('jaspal_learner_dash');
      localStorage.removeItem('jaspal_learner_actions');
      window.location.href = '/';
    });

    document.getElementById('profileForm').addEventListener('submit', onSave);
  }

  /* ── Profile hub tabs ──
     Four tiles (courses / free / referral / account); only the chosen
     panel ([data-panel]) is shown. Deep links: #courses or #enrolled or a
     dashboard program anchor (#ld-...) -> courses, #free-resources -> free,
     #referral, #account. ?open_resource=<id> -> free. ── */
  var HASH_FOR_TAB = { courses: 'courses', free: 'free-resources', referral: 'referral', account: 'account' };
  var explicitTab = null;

  function tabFromLocation() {
    var h = (window.location.hash || '').slice(1);
    if (new URLSearchParams(location.search).get('open_resource')) return 'free';
    if (h === 'free-resources' || h === 'free') return 'free';
    if (h === 'referral') return 'referral';
    if (h === 'account') return 'account';
    if (h === 'courses' || h === 'enrolled' || h.indexOf('ld-') === 0) return 'courses';
    return null;
  }

  function showTab(name, fromUser) {
    document.querySelectorAll('[data-panel]').forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== name;
    });
    document.querySelectorAll('#profileTabs [data-tab]').forEach(function (b) {
      var on = b.getAttribute('data-tab') === name;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (name === 'account') {
      var details = document.getElementById('accountDetails');
      if (details) details.setAttribute('open', '');
    }
    if (fromUser) {
      explicitTab = name;
      try { history.replaceState(null, '', location.pathname + location.search + '#' + HASH_FOR_TAB[name]); } catch (e) { /* ignore */ }
      var tabs = document.getElementById('profileTabs');
      var top = tabs.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) tabs.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function setupProfileTabs() {
    document.querySelectorAll('#profileTabs [data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab'), true); });
    });
    explicitTab = tabFromLocation();
    showTab(explicitTab || 'courses');
    // Header bell / other links on this same page.
    window.__profileShowTab = function (name) { showTab(name, false); };
    window.addEventListener('hashchange', function () {
      var t = tabFromLocation();
      if (t) showTab(t);
    });
  }

  function setTabSub(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /* ── Paid learner dashboard (tests, admit card, next steps) ──
     Shown first for anyone with a paid program; Account Details folds
     away so it no longer pushes their tests below the fold. */
  function loadDashboard() {
    var el = document.getElementById('learnerDashboard');
    if (!el || !window.LearnerDashboard) return;
    window.LearnerDashboard.render(el, {
      onHasPrograms: function (enrollments) {
        setTabSub('phSubCourses', enrollments.length + ' enrolled');
        // The "Still unsure? ... before enrolling" chat nudge (chat-tab.js)
        // is a pre-purchase prompt - it only covers the dashboard for
        // someone who has already paid. The dashboard has its own Need help.
        var hideNudge = document.createElement('style');
        hideNudge.textContent = '.jct-desktop,.jct-mobile{display:none!important;}';
        document.head.appendChild(hideNudge);
      },
      onEmpty: function () {
        setTabSub('phSubCourses', 'No courses yet');
        el.innerHTML = '<div class="profile-card ph-empty">' +
          '<i class="fas fa-graduation-cap"></i>' +
          '<h3>No enrolled courses yet</h3>' +
          '<p>Your offline test series, Printed OMR tests and batches will appear here once you enroll.</p>' +
          '<a class="btn" href="/programs">Browse test series &amp; batches &rarr;</a>' +
        '</div>';
        // Free learners: land on Free Resources unless a link asked for a tab.
        if (!explicitTab) showTab('free');
      },
    });
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

  /* ── Free Resources: exam tiles + searchable card grid ──
     Category comes from free_resources.category (set in admin); until an
     admin sets it, it's inferred from the title so nothing is untagged.
     Keep keys in sync with FR_CATEGORIES in admin/dashboard/index.html. */
  var FR_CATEGORIES = [
    { key: 'rssb-je', label: 'RSSB JE',        icon: 'fa-drafting-compass',  color: '#0284C7', bg: '#E0F2FE' },
    { key: 'rpsc-ae', label: 'RPSC AE',        icon: 'fa-building',          color: '#16A34A', bg: '#DCFCE7' },
    { key: 'ese',     label: 'ESE',            icon: 'fa-graduation-cap',    color: '#7C3AED', bg: '#EDE9FE' },
    { key: 'gate',    label: 'GATE',           icon: 'fa-atom',              color: '#EA580C', bg: '#FFEDD5' },
    { key: 'syllabus', label: 'Syllabus',      icon: 'fa-list-check',        color: '#CA8A04', bg: '#FEF9C3' },
    { key: 'ukpsc',   label: 'UKPSC AE/JE',    icon: 'fa-mountain',          color: '#0D9488', bg: '#CCFBF1' },
    { key: 'up-poly', label: 'UP Polytechnic', icon: 'fa-chalkboard-teacher', color: '#DB2777', bg: '#FCE7F3' },
    // Fallback only (not offered in admin): anything untagged that the
    // title doesn't match - its tile only appears if it has items.
    { key: 'general', label: 'Other Notes',    icon: 'fa-book-open',         color: '#475569', bg: '#F1F5F9' },
  ];
  var FR_CAT_BY_KEY = {};
  FR_CATEGORIES.forEach(function (c) { FR_CAT_BY_KEY[c.key] = c; });

  function frCategory(r) {
    if (r.category && FR_CAT_BY_KEY[r.category]) return r.category;
    var t = (r.title + ' ' + (r.description || '')).toLowerCase();
    if (/syllabus/.test(r.title.toLowerCase())) return 'syllabus';
    if (/\b(rssb|rrsb|jen)\b|rssb je/.test(t)) return 'rssb-je';
    if (/\b(rpsc|rvunl)\b/.test(t)) return 'rpsc-ae';
    if (/\b(ese|ies|upsc)\b/.test(t)) return 'ese';
    if (/\bgate\b/.test(t)) return 'gate';
    if (/\bukpsc\b/.test(t)) return 'ukpsc';
    if (/polytechnic|up poly/.test(t)) return 'up-poly';
    return 'general';
  }

  function frKind(r) {
    var t = r.title.toLowerCase();
    if (/solution|test|booklet|paper/.test(t)) return { label: 'Test + Solutions', icon: 'fa-file-circle-check' };
    if (/interview|question bank|guidance/.test(t)) return { label: 'Guide', icon: 'fa-user-tie' };
    return { label: 'Notes', icon: 'fa-book' };
  }

  var frState = { all: [], cat: 'all', q: '' };

  function loadFreeResources() {
    var body = document.getElementById('freeResourcesBody');
    if (!body) return;
    authFetch('/api/free-resources').then(function (resources) {
      var countEl = document.getElementById('frTotalCount');
      if (!resources.length) {
        body.innerHTML = '<p class="profile-empty"><i class="fas fa-inbox"></i> No free resources available yet. Check back soon!</p>';
        return;
      }
      resources.forEach(function (r) { frGatingTypes[r.id] = r.gating_type || null; r._cat = frCategory(r); });
      frState.all = resources;
      if (countEl) { countEl.textContent = resources.length + ' PDFs'; countEl.style.display = ''; }
      setTabSub('phSubFree', resources.length + ' free PDFs');

      body.innerHTML =
        '<div class="frx-tiles" id="frxTiles"></div>' +
        '<div class="frx-toolbar">' +
          '<div class="frx-search"><i class="fas fa-magnifying-glass"></i><input type="search" id="frxSearch" placeholder="Search notes, tests, solutions…" aria-label="Search free resources" /></div>' +
          '<span class="frx-showing" id="frxShowing"></span>' +
        '</div>' +
        '<div class="frx-grid" id="frxGrid"></div>';

      document.getElementById('frxSearch').addEventListener('input', function (e) {
        frState.q = e.target.value.trim().toLowerCase();
        drawFrGrid();
      });
      drawFrTiles();
      drawFrGrid();

      window.__openFreeResource = function (id) { openFreeResourceViewer(id, frGatingTypes[id] || null); };

      /* Auto-open a specific resource from ?open_resource=<id> (e.g. from /resource page) */
      var autoOpen = new URLSearchParams(location.search).get('open_resource');
      if (autoOpen) {
        var aoId = parseInt(autoOpen, 10);
        if (aoId) setTimeout(function () { window.__openFreeResource(aoId); }, 600);
      }

    }).catch(function () {
      body.innerHTML = '<p class="profile-empty">Could not load free resources.</p>';
    });
  }

  function drawFrTiles() {
    var counts = {};
    frState.all.forEach(function (r) { counts[r._cat] = (counts[r._cat] || 0) + 1; });
    var tile = function (key, label, icon, color, bg, n) {
      return '<button type="button" class="frx-tile' + (frState.cat === key ? ' is-active' : '') + '" data-frx-cat="' + key + '" style="--frx-c:' + color + ';--frx-bg:' + bg + ';">' +
        '<span class="frx-tile-icon"><i class="fas ' + icon + '"></i></span>' +
        '<span class="frx-tile-name">' + esc(label) + '</span>' +
        '<span class="frx-tile-count">' + n + ' material' + (n === 1 ? '' : 's') + '</span>' +
      '</button>';
    };
    var html = tile('all', 'All resources', 'fa-layer-group', '#C81240', '#FFE4EA', frState.all.length);
    FR_CATEGORIES.forEach(function (c) {
      if (counts[c.key]) html += tile(c.key, c.label, c.icon, c.color, c.bg, counts[c.key]);
    });
    var el = document.getElementById('frxTiles');
    el.innerHTML = html;
    el.querySelectorAll('[data-frx-cat]').forEach(function (b) {
      b.addEventListener('click', function () {
        frState.cat = b.getAttribute('data-frx-cat');
        drawFrTiles();
        drawFrGrid();
      });
    });
  }

  function drawFrGrid() {
    var list = frState.all.filter(function (r) {
      if (frState.cat !== 'all' && r._cat !== frState.cat) return false;
      if (frState.q && (r.title + ' ' + (r.description || '')).toLowerCase().indexOf(frState.q) === -1) return false;
      return true;
    });
    var catLabel = frState.cat === 'all' ? 'all categories' : FR_CAT_BY_KEY[frState.cat].label;
    document.getElementById('frxShowing').textContent = list.length + ' of ' + frState.all.length + ' · ' + catLabel;

    var grid = document.getElementById('frxGrid');
    if (!list.length) {
      grid.innerHTML = '<p class="frx-empty"><i class="fas fa-magnifying-glass"></i> Nothing matches "' + esc(frState.q) + '" here. Try another word or category.</p>';
      return;
    }
    var fresh = Date.now() - 14 * 24 * 3600 * 1000;
    grid.innerHTML = list.map(function (r) {
      var cat = FR_CAT_BY_KEY[r._cat];
      var kind = frKind(r);
      var isNew = r.created_at && new Date(r.created_at).getTime() > fresh;
      return '<article class="frx-card" style="--frx-c:' + cat.color + ';--frx-bg:' + cat.bg + ';">' +
        '<div class="frx-card-top">' +
          '<span class="frx-card-icon"><i class="fas ' + kind.icon + '"></i></span>' +
          '<div class="frx-card-tags">' +
            '<span class="frx-tag">' + esc(cat.label) + '</span>' +
            '<span class="frx-tag frx-tag--kind">' + kind.label + '</span>' +
            (isNew ? '<span class="frx-tag frx-tag--new">NEW</span>' : '') +
          '</div>' +
        '</div>' +
        '<h3 class="frx-card-title">' + esc(r.title) + '</h3>' +
        (r.description ? '<p class="frx-card-desc">' + esc(r.description) + '</p>' : '') +
        '<div class="frx-card-foot">' +
          (r.gating_type === 'rpsc_ae' ? '<span class="frx-lock"><i class="fas fa-lock"></i> RPSC AE candidates</span>' : '<span class="frx-free"><i class="fas fa-circle-check"></i> Free</span>') +
          '<button type="button" class="frx-view" onclick="window.__openFreeResource(' + r.id + ')"><i class="fas fa-eye"></i> View PDF</button>' +
        '</div>' +
      '</article>';
    }).join('');
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
