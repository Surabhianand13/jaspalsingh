/* ============================================================
   login-wall.js
   Pops up every 10s for anyone who has NOT paid:
     - anonymous visitors  -> nudge to create account / log in
     - logged-in free users -> nudge to enrol in a program
   Stops only once the user has a paid enrolment.
   ============================================================ */

(function() {
  var API = 'https://jaspalsingh.onrender.com';
  var INTERVAL = 10000; // 10 seconds

  var path = window.location.pathname;
  var token = localStorage.getItem('jaspal_learner_token');
  var wallActive = false;

  /* ── Header auth UI (Login button / avatar) - runs on EVERY page ── */
  injectHeaderStyles();
  renderHeaderAuth();

  /* ── Wall logic only below (respects noWallPaths) ── */
  var noWallPaths = ['/checkout', '/payment-success', '/admin'];
  if (noWallPaths.some(function(p){ return path.startsWith(p); })) return;

  /* Decide whether to run, and in which mode */
  if (!token) {
    // Anonymous visitor -> account-creation wall
    startWall('anon');
  } else {
    // Logged in -> only nag if they have NO paid enrolment
    fetch(API + '/api/enrollment/my-enrollments', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      var hasPaid = data && data.enrollments && data.enrollments.length > 0;
      if (!hasPaid && path.indexOf('/profile') !== 0) startWall('free');
    })
    .catch(function(){ /* on error, do not nag */ });
  }

  /* ── Styles ──────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('lwStyles')) return;
    var s = document.createElement('style');
    s.id = 'lwStyles';
    s.textContent = `
      .lw-overlay { position: fixed; inset: 0; z-index: 99999; background: rgba(10,10,20,.65);
        display: flex; align-items: center; justify-content: center; padding: 24px; animation: lwFade .3s ease; }
      @keyframes lwFade { from { opacity:0; } to { opacity:1; } }
      .lw-card { background:#fff; border-radius:20px; padding:40px 36px; max-width:440px; width:100%;
        box-shadow:0 24px 64px rgba(0,0,0,.22); position:relative; text-align:center; animation:lwUp .3s ease; }
      @keyframes lwUp { from { transform:translateY(20px);opacity:0; } to { transform:translateY(0);opacity:1; } }
      .lw-close { position:absolute; top:16px; right:16px; background:none; border:none; cursor:pointer;
        font-size:18px; color:#9999b0; width:32px; height:32px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; transition:background .15s; }
      .lw-close:hover { background:#f5f5f8; }
      .lw-avatar { width:64px; height:64px; border-radius:50%; object-fit:cover; margin:0 auto 16px;
        border:3px solid #fff; box-shadow:0 4px 16px rgba(0,0,0,.12); display:block; }
      .lw-title { font-family:'Plus Jakarta Sans',sans-serif; font-size:20px; font-weight:800; color:#1A1A2E; margin-bottom:8px; }
      .lw-sub { font-size:14px; color:#6b6b8a; line-height:1.6; margin-bottom:20px; }
      .lw-benefits { display:flex; flex-direction:column; gap:6px; text-align:left; margin-bottom:20px; }
      .lw-benefit { display:flex; align-items:center; gap:8px; font-size:13px; color:#1A1A2E; }
      .lw-benefit i { color:#C81240; font-size:12px; width:16px; }
      .lw-btn-primary { display:block; width:100%; padding:13px 20px; background:linear-gradient(135deg,#C81240,#9B1230);
        color:#fff; border-radius:50px; border:none; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:800;
        text-decoration:none; cursor:pointer; margin-bottom:10px; box-shadow:0 6px 20px rgba(200,18,64,.3); transition:opacity .2s; }
      .lw-btn-primary:hover { opacity:.9; color:#fff; }
      .lw-btn-secondary { display:block; width:100%; padding:12px 20px; background:transparent; color:#1A1A2E;
        border:1.5px solid rgba(26,26,46,.14); border-radius:50px; font-family:'Plus Jakarta Sans',sans-serif;
        font-size:14px; font-weight:700; text-decoration:none; cursor:pointer; transition:background .2s; }
      .lw-btn-secondary:hover { background:#f5f5f8; }
      .lw-skip { font-size:12px; color:#9999b0; margin-top:14px; cursor:pointer; display:inline-block; }
      .lw-skip:hover { color:#6b6b8a; }
    `;
    document.head.appendChild(s);
  }

  /* ── Modal content per mode ──────────────────────────────── */
  function modalHtml(mode) {
    if (mode === 'free') {
      return ''
        + '<button class="lw-close" id="lwClose" aria-label="Close"><i class="fas fa-times"></i></button>'
        + '<img src="/assets/images/jaspal-hero.png" alt="Dr. Jaspal Singh" class="lw-avatar" />'
        + '<div class="lw-title">Enrol in an Offline Program</div>'
        + '<p class="lw-sub">Your seat is one step away. Join Dr. Jaspal Singh’s offline programs in Jaipur and learn directly from an expert who has been there.</p>'
        + '<div class="lw-benefits">'
        +   '<div class="lw-benefit"><i class="fas fa-clipboard-list"></i> RSSB JEN Test Series (Diploma &amp; Degree)</div>'
        +   '<div class="lw-benefit"><i class="fas fa-user-tie"></i> RPSC AE Interview Guidance</div>'
        +   '<div class="lw-benefit"><i class="fas fa-medal"></i> Mentored by the Expert</div>'
        + '</div>'
        + '<a href="/programs" class="lw-btn-primary"><i class="fas fa-graduation-cap"></i> View Programs &amp; Enrol</a>'
        + '<a href="/profile" class="lw-btn-secondary">Go to My Profile</a>'
        + '<div><span class="lw-skip" id="lwSkip">Maybe later &rarr;</span></div>';
    }
    // anonymous
    return ''
      + '<button class="lw-close" id="lwClose" aria-label="Close"><i class="fas fa-times"></i></button>'
      + '<img src="/assets/images/jaspal-hero.png" alt="Dr. Jaspal Singh" class="lw-avatar" />'
      + '<div class="lw-title">Join 1 Lakh+ Aspirants</div>'
      + '<p class="lw-sub">Create a free account to access study resources and stay updated on upcoming batches.</p>'
      + '<div class="lw-benefits">'
      +   '<div class="lw-benefit"><i class="fas fa-bullseye"></i> Clear your target exam with expert guidance</div>'
      +   '<div class="lw-benefit"><i class="fas fa-bell"></i> Batch opening alerts on WhatsApp</div>'
      +   '<div class="lw-benefit"><i class="fas fa-graduation-cap"></i> Exam strategy from the Expert</div>'
      + '</div>'
      + '<a href="/profile" class="lw-btn-primary"><i class="fas fa-user-plus"></i> Create Free Account</a>'
      + '<a href="/profile?tab=login" class="lw-btn-secondary">Already have an account? Log In</a>'
      + '<div><span class="lw-skip" id="lwSkip">Continue browsing &rarr;</span></div>';
  }

  function showModal(mode) {
    if (wallActive) return;
    wallActive = true;
    injectStyles();

    var overlay = document.createElement('div');
    overlay.className = 'lw-overlay';
    overlay.id = 'lwOverlay';
    overlay.innerHTML = '<div class="lw-card">' + modalHtml(mode) + '</div>';
    document.body.appendChild(overlay);

    function close() {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity .2s';
      setTimeout(function(){ overlay.remove(); wallActive = false; }, 200);
    }
    document.getElementById('lwClose').addEventListener('click', close);
    var skip = document.getElementById('lwSkip');
    if (skip) skip.addEventListener('click', close);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
  }

  /* ── Repeat every 10s ────────────────────────────────────── */
  function startWall(mode) {
    function tick() {
      setTimeout(function(){
        showModal(mode);
        tick();
      }, INTERVAL);
    }
    tick();
  }

  /* ── Header auth: Login/Sign Up (logged out) · avatar dropdown (logged in) ── */
  function injectHeaderStyles() {
    if (document.getElementById('lwHeaderStyles')) return;
    var s = document.createElement('style');
    s.id = 'lwHeaderStyles';
    s.textContent = `
      .lw-h-wrap { display:flex; align-items:center; gap:10px; margin-left:14px; position:relative; }
      .lw-btn-login { display:inline-flex; align-items:center; gap:7px; padding:8px 20px;
        background:#fff; color:#C81240; border:1.5px solid #C81240; border-radius:50px;
        font-family:'Plus Jakarta Sans',sans-serif; font-size:13.5px; font-weight:800;
        text-decoration:none; transition:all .15s; white-space:nowrap; }
      .lw-btn-login:hover { background:rgba(200,18,64,.06); color:#C81240; }
      .lw-btn-signup { display:inline-flex; align-items:center; gap:7px; padding:9px 20px;
        background:linear-gradient(135deg,#C81240,#9B1230); color:#fff; border:1.5px solid transparent; border-radius:50px;
        font-family:'Plus Jakarta Sans',sans-serif; font-size:13.5px; font-weight:800;
        text-decoration:none; box-shadow:0 4px 14px rgba(200,18,64,.28); transition:all .15s; white-space:nowrap; }
      .lw-btn-signup:hover { transform:translateY(-1px); opacity:.94; color:#fff; }

      .lw-h-avatar { width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg,#C81240,#9B1230);
        color:#fff; display:flex; align-items:center; justify-content:center;
        font-family:'Plus Jakarta Sans',sans-serif; font-size:15px; font-weight:800;
        overflow:hidden; flex-shrink:0; box-shadow:0 2px 10px rgba(200,18,64,.3); transition:transform .15s; cursor:pointer; border:none; }
      .lw-h-avatar:hover { transform:scale(1.06); }
      .lw-h-avatar img { width:100%; height:100%; object-fit:cover; border-radius:50%; }

      .lw-menu { position:absolute; top:calc(100% + 12px); right:0; width:268px;
        background:#fff; border:1px solid rgba(26,26,46,.08); border-radius:14px;
        box-shadow:0 16px 48px rgba(26,26,46,.16); overflow:hidden; z-index:10000;
        opacity:0; visibility:hidden; transform:translateY(-8px); transition:opacity .18s, transform .18s, visibility .18s;
        font-family:'Plus Jakarta Sans',sans-serif; }
      .lw-menu.open { opacity:1; visibility:visible; transform:translateY(0); }
      .lw-menu-head { padding:16px 18px; border-bottom:1px solid rgba(26,26,46,.07); }
      .lw-menu-name { font-size:14.5px; font-weight:800; color:#1A1A2E; line-height:1.2; }
      .lw-menu-email { font-size:12px; color:#9999b0; margin-top:3px; word-break:break-all; }
      .lw-menu-item { display:flex; align-items:center; gap:12px; padding:11px 18px;
        font-size:13.5px; font-weight:600; color:#1A1A2E; text-decoration:none; cursor:pointer;
        background:none; border:none; width:100%; text-align:left; font-family:inherit; transition:background .12s; }
      .lw-menu-item i { width:18px; font-size:14px; color:#6b6b8a; }
      .lw-menu-item:hover { background:#f6f6fa; }
      .lw-menu-divider { height:1px; background:rgba(26,26,46,.07); margin:6px 0; }
      .lw-menu-item.lw-logout { color:#C81240; }
      .lw-menu-item.lw-logout i { color:#C81240; }

      @media (max-width:600px){
        .lw-btn-login { padding:7px 15px; font-size:12.5px; }
        .lw-btn-signup { padding:8px 15px; font-size:12.5px; }
        .lw-h-wrap { margin-left:8px; }
        .lw-menu { right:-8px; }
      }
    `;
    document.head.appendChild(s);
  }

  function renderHeaderAuth() {
    if (document.getElementById('lwHeaderAuth')) return;
    // Remove any legacy element from older learner-auth.js builds
    var legacy = document.getElementById('learnerHeaderUI');
    if (legacy) legacy.remove();

    var headerRight = document.querySelector('.header-right');
    var headerInner = document.querySelector('.header-inner');
    var host = headerRight || headerInner;
    if (!host) return;

    var user = null;
    try { user = JSON.parse(localStorage.getItem('jaspal_learner')); } catch(e) {}

    var wrap = document.createElement('div');
    wrap.className = 'lw-h-wrap';
    wrap.id = 'lwHeaderAuth';

    if (token && user) {
      var initials = (user.name || 'U').split(' ').map(function(w){return w[0];}).slice(0,2).join('').toUpperCase();
      var inner = user.photo_url ? '<img src="'+esc(user.photo_url)+'" alt="" />' : initials;
      wrap.innerHTML =
        '<button class="lw-h-avatar" id="lwAvatarBtn" title="'+esc(user.name||'My Profile')+'" aria-label="Account menu">'+inner+'</button>' +
        '<div class="lw-menu" id="lwMenu">' +
          '<div class="lw-menu-head">' +
            '<div class="lw-menu-name">'+esc(user.name||'Student')+'</div>' +
            (user.email ? '<div class="lw-menu-email">'+esc(user.email)+'</div>' : '') +
          '</div>' +
          '<a href="/profile" class="lw-menu-item"><i class="fas fa-user"></i> My Profile</a>' +
          '<a href="/profile#enrolled" class="lw-menu-item"><i class="fas fa-graduation-cap"></i> My Programs</a>' +
          '<a href="/profile#enrolled" class="lw-menu-item"><i class="fas fa-receipt"></i> Purchase History</a>' +
          '<a href="/programs" class="lw-menu-item"><i class="fas fa-layer-group"></i> Browse Programs</a>' +
          '<div class="lw-menu-divider"></div>' +
          '<button class="lw-menu-item lw-logout" id="lwLogoutBtn"><i class="fas fa-sign-out-alt"></i> Logout</button>' +
        '</div>';
    } else {
      wrap.innerHTML =
        '<a href="/profile?tab=login" class="lw-btn-login">Login</a>' +
        '<a href="/profile" class="lw-btn-signup">Sign Up</a>';
    }

    var hamburger = document.getElementById('hamburger');
    if (headerRight && hamburger && hamburger.parentNode === headerRight) {
      headerRight.insertBefore(wrap, hamburger);
    } else {
      host.appendChild(wrap);
    }

    // Wire up dropdown
    var avatarBtn = document.getElementById('lwAvatarBtn');
    if (avatarBtn) {
      var menu = document.getElementById('lwMenu');
      avatarBtn.addEventListener('click', function(e){
        e.stopPropagation();
        menu.classList.toggle('open');
      });
      document.addEventListener('click', function(e){
        if (!wrap.contains(e.target)) menu.classList.remove('open');
      });
      var logout = document.getElementById('lwLogoutBtn');
      if (logout) logout.addEventListener('click', function(){
        localStorage.removeItem('jaspal_learner_token');
        localStorage.removeItem('jaspal_learner');
        window.location.href = '/';
      });
    }
  }

  function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

})();
