/* ============================================================
   login-wall.js
   Shows login/signup modal every 30 seconds for non-logged-in users
   ============================================================ */

(function() {
  const noWallPaths = ['/checkout', '/payment-success', '/profile', '/admin'];
  const path = window.location.pathname;
  if (noWallPaths.some(p => path.startsWith(p))) return;
  if (localStorage.getItem('jaspal_learner_token')) return;

  let wallActive = false;

  const STYLES = `
    .lw-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(10,10,20,.65);
      display: flex; align-items: center; justify-content: center;
      padding: 24px; animation: lwFadeIn .3s ease;
    }
    @keyframes lwFadeIn { from { opacity:0; } to { opacity:1; } }
    .lw-card {
      background: #fff; border-radius: 20px;
      padding: 40px 36px; max-width: 440px; width: 100%;
      box-shadow: 0 24px 64px rgba(0,0,0,.22);
      position: relative; text-align: center;
      animation: lwSlideUp .3s ease;
    }
    @keyframes lwSlideUp { from { transform:translateY(20px);opacity:0; } to { transform:translateY(0);opacity:1; } }
    .lw-close {
      position: absolute; top: 16px; right: 16px;
      background: none; border: none; cursor: pointer;
      font-size: 18px; color: #9999b0; width: 32px; height: 32px;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      transition: background .15s;
    }
    .lw-close:hover { background: #f5f5f8; }
    .lw-avatar { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; margin: 0 auto 16px; border: 3px solid #fff; box-shadow: 0 4px 16px rgba(0,0,0,.12); display: block; }
    .lw-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 20px; font-weight: 800; color: #1A1A2E; margin-bottom: 8px; }
    .lw-sub { font-size: 14px; color: #6b6b8a; line-height: 1.6; margin-bottom: 20px; }
    .lw-benefits { display: flex; flex-direction: column; gap: 6px; text-align: left; margin-bottom: 20px; }
    .lw-benefit { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #1A1A2E; }
    .lw-benefit i { color: #C81240; font-size: 12px; width: 16px; }
    .lw-btn-primary {
      display: block; width: 100%; padding: 13px 20px;
      background: linear-gradient(135deg,#C81240,#9B1230); color: #fff;
      border-radius: 50px; border: none; font-family: 'Plus Jakarta Sans',sans-serif;
      font-size: 14px; font-weight: 800; text-decoration: none; cursor: pointer;
      margin-bottom: 10px; box-shadow: 0 6px 20px rgba(200,18,64,.3); transition: opacity .2s;
    }
    .lw-btn-primary:hover { opacity: .9; color: #fff; }
    .lw-btn-secondary {
      display: block; width: 100%; padding: 12px 20px;
      background: transparent; color: #1A1A2E;
      border: 1.5px solid rgba(26,26,46,.14); border-radius: 50px;
      font-family: 'Plus Jakarta Sans',sans-serif; font-size: 14px; font-weight: 700;
      text-decoration: none; cursor: pointer; transition: background .2s;
    }
    .lw-btn-secondary:hover { background: #f5f5f8; }
    .lw-skip { font-size: 12px; color: #9999b0; margin-top: 14px; cursor: pointer; display: inline-block; }
    .lw-skip:hover { color: #6b6b8a; }
    .lw-timer { font-size: 11px; color: #c0c0d0; margin-top: 6px; }
  `;

  function injectStyles() {
    if (document.getElementById('lwStyles')) return;
    const s = document.createElement('style');
    s.id = 'lwStyles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }

  function showModal() {
    if (localStorage.getItem('jaspal_learner_token')) return;
    if (wallActive) return;
    wallActive = true;

    injectStyles();

    const overlay = document.createElement('div');
    overlay.className = 'lw-overlay';
    overlay.id = 'lwOverlay';
    overlay.innerHTML = `
      <div class="lw-card">
        <button class="lw-close" id="lwClose" aria-label="Close"><i class="fas fa-times"></i></button>
        <img src="/assets/images/jaspal-hero.png" alt="Dr. Jaspal Singh" class="lw-avatar" />
        <div class="lw-title">Join 1 Lakh+ Aspirants</div>
        <p class="lw-sub">Create a free account to access study resources and stay updated on upcoming batches.</p>
        <div class="lw-benefits">
          <div class="lw-benefit"><i class="fas fa-file-alt"></i> Free Civil Engineering notes &amp; resources</div>
          <div class="lw-benefit"><i class="fas fa-bell"></i> Batch opening alerts on WhatsApp</div>
          <div class="lw-benefit"><i class="fas fa-graduation-cap"></i> Exam strategy from AIR-04 GATE topper</div>
        </div>
        <a href="/profile" class="lw-btn-primary"><i class="fas fa-user-plus"></i> Create Free Account</a>
        <a href="/profile?tab=login" class="lw-btn-secondary">Already have an account? Log In</a>
        <div><span class="lw-skip" id="lwSkip">Continue browsing &rarr;</span></div>
      </div>
    `;

    document.body.appendChild(overlay);

    function close() {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity .2s';
      setTimeout(() => { overlay.remove(); wallActive = false; }, 200);
    }

    document.getElementById('lwClose').addEventListener('click', close);
    document.getElementById('lwSkip').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }

  // Show every 30 seconds while not logged in
  function scheduleNext() {
    setTimeout(function() {
      if (!localStorage.getItem('jaspal_learner_token')) {
        showModal();
        scheduleNext(); // schedule the next one after this fires
      }
    }, 10000); // 10 seconds
  }

  scheduleNext();

})();
