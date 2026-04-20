/* ============================================================
   learner-auth.js — Learner Login / Register Modal
   Dr. Jaspal Singh Website — jaspalsingh.in

   Exposes: window.LearnerAuth
   Usage (in resources.js):
     if (!LearnerAuth.isLoggedIn()) {
       LearnerAuth.showModal(function () { proceedWithDownload(); });
     } else {
       proceedWithDownload();
     }
   ============================================================ */

(function (global) {
  'use strict';

  var TOKEN_KEY  = 'jaspal_learner_token';
  var USER_KEY   = 'jaspal_learner';
  var _successCb = null;

  var API_BASE = (function () {
    var h = window.location.hostname;
    return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:5000' : '';
  })();

  /* ── Session helpers ────────────────────────────────────── */

  function getToken()   { return localStorage.getItem(TOKEN_KEY); }
  function isLoggedIn() { return !!getToken(); }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  }

  function setSession(token, learner) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(learner));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  /* ── API helpers ────────────────────────────────────────── */

  function authPost(path, body) {
    return doAuthPost(path, body, false);
  }

  function doAuthPost(path, body, isRetry) {
    var controller = new AbortController();
    var timeoutId  = setTimeout(function () { controller.abort(); }, 15000); /* 15 s */

    return fetch(API_BASE + path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    }).then(function (res) {
      clearTimeout(timeoutId);
      /* 503 = Render cold start — retry once after 12 s */
      if (res.status === 503 && !isRetry) {
        return new Promise(function (resolve, reject) {
          showError('Server is starting up — please wait a moment…');
          setTimeout(function () {
            doAuthPost(path, body, true).then(resolve).catch(reject);
          }, 12000);
        });
      }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Something went wrong (' + res.status + ')');
        return data;
      });
    }).catch(function (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        if (!isRetry) {
          return new Promise(function (resolve, reject) {
            showError('Server is starting up — retrying in 12 seconds…');
            setTimeout(function () {
              doAuthPost(path, body, true).then(resolve).catch(reject);
            }, 12000);
          });
        }
        throw new Error('Server took too long to respond. Please try again in a moment.');
      }
      throw err;
    });
  }

  /* ── Modal HTML ─────────────────────────────────────────── */

  function getModalHTML() {
    return [
      '<div id="learnerAuthOverlay" class="lauth-overlay" aria-hidden="true">',
        '<div class="lauth-modal" role="dialog" aria-modal="true" aria-labelledby="lauthHeading">',

          /* Close */
          '<button class="lauth-close" id="lauthClose" aria-label="Close modal">&times;</button>',

          /* Branding */
          '<div class="lauth-brand">',
            '<img src="assets/images/jaspal-hero.png" class="lauth-brand-avatar"',
                 ' alt="Dr. Jaspal Singh" onerror="this.style.display=\'none\'" />',
            '<h2 id="lauthHeading">Join Free — Download Everything</h2>',
            '<p>Create your free account to download all notes, formula books and PYQs — and receive personalised strategy updates.</p>',
          '</div>',

          /* Error */
          '<div class="lauth-error" id="lauthError"></div>',

          /* Tabs */
          '<div class="lauth-tab-bar" role="tablist">',
            '<button class="lauth-tab active" data-lauth-tab="login"',
                    ' role="tab" aria-selected="true" aria-controls="lauthLoginSection">Sign In</button>',
            '<button class="lauth-tab" data-lauth-tab="register"',
                    ' role="tab" aria-selected="false" aria-controls="lauthRegSection">Create Account</button>',
          '</div>',

          /* ── Login form ── */
          '<div id="lauthLoginSection">',
            '<form class="lauth-form" id="lauthLoginForm" novalidate>',
              '<div class="lauth-field">',
                '<label for="lauthLoginEmail">Email</label>',
                '<input type="email" id="lauthLoginEmail" placeholder="your@email.com"',
                       ' required autocomplete="email" />',
              '</div>',
              '<div class="lauth-field">',
                '<label for="lauthLoginPassword">Password</label>',
                '<input type="password" id="lauthLoginPassword" placeholder="••••••••"',
                       ' required autocomplete="current-password" />',
              '</div>',
              '<button type="submit" class="lauth-submit" id="lauthLoginBtn">',
                '<i class="fas fa-sign-in-alt"></i> Sign In &amp; Download',
              '</button>',
            '</form>',
          '</div>',

          /* ── Register form ── */
          '<div id="lauthRegSection" style="display:none;">',
            '<form class="lauth-form" id="lauthRegForm" novalidate>',
              '<div class="lauth-field">',
                '<label for="lauthRegName">Full Name <span style="color:var(--magenta,#F0345A)">*</span></label>',
                '<input type="text" id="lauthRegName" placeholder="e.g. Rahul Sharma"',
                       ' required autocomplete="name" />',
              '</div>',
              '<div class="lauth-field">',
                '<label for="lauthRegEmail">Email <span style="color:var(--magenta,#F0345A)">*</span></label>',
                '<input type="email" id="lauthRegEmail" placeholder="your@email.com"',
                       ' required autocomplete="email" />',
              '</div>',
              '<div class="lauth-field">',
                '<label for="lauthRegPass">Password <span style="color:var(--magenta,#F0345A)">*</span></label>',
                '<input type="password" id="lauthRegPass" placeholder="Minimum 6 characters"',
                       ' required autocomplete="new-password" />',
              '</div>',
              '<div class="lauth-field">',
                '<label for="lauthRegExam">Target Exam</label>',
                '<select id="lauthRegExam">',
                  '<option value="General">Select exam (optional)</option>',
                  '<option value="GATE">GATE CE</option>',
                  '<option value="ESE">UPSC IES / ESE</option>',
                  '<option value="SSC JE">SSC JE</option>',
                  '<option value="State AE/JE">State AE / JE</option>',
                '</select>',
              '</div>',
              '<button type="submit" class="lauth-submit" id="lauthRegBtn">',
                '<i class="fas fa-user-plus"></i> Create Account &amp; Download',
              '</button>',
            '</form>',
          '</div>',

          '<p class="lauth-note">',
            '<i class="fas fa-lock"></i> Your data is private and never shared. No spam, ever.',
          '</p>',

        '</div>',
      '</div>',
    ].join('');
  }

  /* ── Build + inject modal ───────────────────────────────── */

  var _modalBuilt = false;

  function buildModal() {
    if (_modalBuilt) return;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = getModalHTML();
    document.body.appendChild(wrapper.firstChild);
    _modalBuilt = true;
    bindModalEvents();
  }

  /* ── Event binding ──────────────────────────────────────── */

  function bindModalEvents() {
    var overlay = document.getElementById('learnerAuthOverlay');

    /* Click outside modal → close */
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hideModal();
    });

    /* Close button */
    document.getElementById('lauthClose').addEventListener('click', hideModal);

    /* Escape key */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideModal();
    });

    /* Tab switching */
    document.querySelectorAll('.lauth-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.dataset.lauthTab);
      });
    });

    /* Form submits */
    document.getElementById('lauthLoginForm').addEventListener('submit', onLoginSubmit);
    document.getElementById('lauthRegForm').addEventListener('submit', onRegisterSubmit);
  }

  /* ── Tab switching ──────────────────────────────────────── */

  function switchTab(tab) {
    document.querySelectorAll('.lauth-tab').forEach(function (b) {
      var active = b.dataset.lauthTab === tab;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.getElementById('lauthLoginSection').style.display  = tab === 'login'    ? '' : 'none';
    document.getElementById('lauthRegSection').style.display    = tab === 'register' ? '' : 'none';
    clearError();
  }

  /* ── Show / hide ────────────────────────────────────────── */

  function showModal(onSuccess) {
    _successCb = onSuccess || null;
    buildModal();
    var overlay = document.getElementById('learnerAuthOverlay');
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    /* Focus first input after animation */
    setTimeout(function () {
      var inp = overlay.querySelector('input');
      if (inp) inp.focus();
    }, 280);
  }

  function hideModal() {
    var overlay = document.getElementById('learnerAuthOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    clearError();
  }

  /* ── Error helpers ──────────────────────────────────────── */

  function showError(msg) {
    var el = document.getElementById('lauthError');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
  }

  function clearError() {
    var el = document.getElementById('lauthError');
    if (el) { el.textContent = ''; el.classList.remove('visible'); }
  }

  function setBtnLoading(btn, loading, defaultText) {
    if (loading) {
      btn._origHTML   = btn.innerHTML;
      btn.innerHTML   = '<i class="fas fa-spinner fa-spin"></i> Please wait…';
      btn.disabled    = true;
    } else {
      btn.innerHTML   = btn._origHTML || defaultText || btn.innerHTML;
      btn.disabled    = false;
    }
  }

  /* ── Login submit ───────────────────────────────────────── */

  function onLoginSubmit(e) {
    e.preventDefault();
    clearError();

    var email    = (document.getElementById('lauthLoginEmail').value    || '').trim();
    var password = (document.getElementById('lauthLoginPassword').value || '');

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    var btn = document.getElementById('lauthLoginBtn');
    setBtnLoading(btn, true);

    authPost('/api/learners/login', { email: email, password: password })
      .then(function (data) {
        setSession(data.token, data.learner);
        hideModal();
        updateHeaderUI();
        if (_successCb) { var cb = _successCb; _successCb = null; cb(); }
      })
      .catch(function (err) {
        showError(err.message);
        setBtnLoading(btn, false, '<i class="fas fa-sign-in-alt"></i> Sign In & Download');
      });
  }

  /* ── Register submit ────────────────────────────────────── */

  function onRegisterSubmit(e) {
    e.preventDefault();
    clearError();

    var name     = (document.getElementById('lauthRegName').value  || '').trim();
    var email    = (document.getElementById('lauthRegEmail').value || '').trim();
    var password = (document.getElementById('lauthRegPass').value  || '');
    var exam     = (document.getElementById('lauthRegExam').value  || 'General');

    if (!name)               { showError('Please enter your name.'); return; }
    if (!email)              { showError('Please enter your email.'); return; }
    if (password.length < 6) { showError('Password must be at least 6 characters.'); return; }
    if (password.length > 128) { showError('Password is too long (max 128 characters).'); return; }

    var btn = document.getElementById('lauthRegBtn');
    setBtnLoading(btn, true);

    authPost('/api/learners/register', {
      name: name, email: email, password: password, target_exam: exam,
    }).then(function (data) {
      setSession(data.token, data.learner);
      hideModal();
      updateHeaderUI();
      if (_successCb) { var cb = _successCb; _successCb = null; cb(); }
    }).catch(function (err) {
      showError(err.message);
      setBtnLoading(btn, false, '<i class="fas fa-user-plus"></i> Create Account & Download');
    });
  }

  /* ── Header learner pill ────────────────────────────────── */

  function updateHeaderUI() {
    /* Remove any existing learner UI element */
    var existing = document.getElementById('learnerHeaderUI');
    if (existing) existing.remove();

    var user = getUser();
    if (!user) return;

    var firstName = (user.name || 'Friend').split(' ')[0];

    var el = document.createElement('div');
    el.id        = 'learnerHeaderUI';
    el.className = 'learner-header-ui';
    el.innerHTML =
      '<span class="learner-greeting">' +
        '<i class="fas fa-user-circle" style="margin-right:4px;color:var(--magenta,#F0345A);"></i>Hi, ' +
        escHtml(firstName) + '!' +
      '</span>' +
      '<button class="learner-logout" id="learnerLogoutBtn">Logout</button>';

    /* Insert after the main nav (before hamburger button) */
    var headerInner = document.querySelector('.header-inner');
    var hamburger   = document.getElementById('hamburger');
    if (headerInner && hamburger) {
      headerInner.insertBefore(el, hamburger);
    } else if (headerInner) {
      headerInner.appendChild(el);
    }

    document.getElementById('learnerLogoutBtn').addEventListener('click', function () {
      clearSession();
      updateHeaderUI();
    });
  }

  /* ── Small escaping helper (for names in HTML) ──────────── */

  function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Global API ─────────────────────────────────────────── */

  global.LearnerAuth = {
    isLoggedIn:   isLoggedIn,
    getToken:     getToken,
    getUser:      getUser,
    clearSession: clearSession,
    showModal:    showModal,
    hideModal:    hideModal,
  };

  /* ── Auto-init on page load ─────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateHeaderUI);
  } else {
    updateHeaderUI();
  }

})(window);
