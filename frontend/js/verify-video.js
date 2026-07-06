/* ============================================================
   verify-video.js
   Shows a one-time popup with a verification video from
   Dr. Jaspal Singh, warning learners about fake websites/pages
   using his name. Shown once per browser tab session, on every
   fresh page load where it has not yet been shown (covers first
   visit and hard refresh in a new session).
   ============================================================ */

(function() {
  var FLAG = 'jaspal_verify_video_shown';
  var VIDEO_ID = 'jtsiwLnESwQ';

  var path = window.location.pathname;
  var noShowPaths = ['/checkout', '/payment-success', '/admin'];
  if (noShowPaths.some(function(p){ return path.startsWith(p); })) return;

  if (sessionStorage.getItem(FLAG)) return;
  sessionStorage.setItem(FLAG, '1');

  document.addEventListener('DOMContentLoaded', showPopup);
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    showPopup();
  }

  function showPopup() {
    if (document.getElementById('vvOverlay')) return;
    injectStyles();

    var overlay = document.createElement('div');
    overlay.className = 'vv-overlay';
    overlay.id = 'vvOverlay';
    overlay.innerHTML =
      '<div class="vv-card">' +
        '<button class="vv-close" id="vvClose" aria-label="Close"><i class="fas fa-times"></i></button>' +
        '<div class="vv-title">A Message From Dr. Jaspal Singh</div>' +
        '<p class="vv-sub">Please watch this short video before browsing further.</p>' +
        '<a class="vv-thumb-link" href="https://youtube.com/shorts/' + VIDEO_ID + '" target="_blank" rel="noopener" aria-label="Watch verification video on YouTube">' +
          '<div class="vv-thumb-wrap">' +
            '<img src="https://i.ytimg.com/vi/' + VIDEO_ID + '/hqdefault.jpg" alt="Dr. Jaspal Singh verification video" class="vv-thumb-img" />' +
            '<div class="vv-play-btn"><svg viewBox="0 0 68 48" width="68" height="48"><path d="M66.5 7.7c-.8-2.9-3-5.2-5.9-6C55.8 0 34 0 34 0S12.2 0 7.4 1.7c-2.9.8-5.1 3.1-5.9 6C0 12.5 0 24 0 24s0 11.5 1.5 16.3c.8 2.9 3 5.2 5.9 6C12.2 48 34 48 34 48s21.8 0 26.6-1.7c2.9-.8 5.1-3.1 5.9-6C68 35.5 68 24 68 24s0-11.5-1.5-16.3z" fill="#ff0000"/><path d="M45 24 27 14v20" fill="#fff"/></svg></div>' +
          '</div>' +
          '<p class="vv-yt-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="#ff0000" style="vertical-align:-2px;margin-right:4px"><path d="M19.6 3H4.4C2.5 3 1 4.5 1 6.4v11.2C1 19.5 2.5 21 4.4 21h15.2c1.9 0 3.4-1.5 3.4-3.4V6.4C23 4.5 21.5 3 19.6 3zM10 15V9l6 3-6 3z"/></svg>Tap to watch on YouTube</p>' +
        '</a>' +
        '<button class="vv-btn-primary" id="vvContinue">Continue to Website</button>' +
      '</div>';
    document.body.appendChild(overlay);

    function close() {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity .2s';
      setTimeout(function(){ overlay.remove(); }, 200);
    }
    document.getElementById('vvClose').addEventListener('click', close);
    document.getElementById('vvContinue').addEventListener('click', close);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
  }

  function injectStyles() {
    if (document.getElementById('vvStyles')) return;
    var s = document.createElement('style');
    s.id = 'vvStyles';
    s.textContent = `
      .vv-overlay { position: fixed; inset: 0; z-index: 100000; background: rgba(10,10,20,.75);
        display: flex; align-items: center; justify-content: center; padding: 20px; animation: vvFade .3s ease; }
      @keyframes vvFade { from { opacity:0; } to { opacity:1; } }
      .vv-card { background:#fff; border-radius:20px; padding:32px 28px; max-width:520px; width:100%;
        box-shadow:0 24px 64px rgba(0,0,0,.28); position:relative; text-align:center; animation:vvUp .3s ease; }
      @keyframes vvUp { from { transform:translateY(20px);opacity:0; } to { transform:translateY(0);opacity:1; } }
      .vv-close { position:absolute; top:14px; right:14px; background:none; border:none; cursor:pointer;
        font-size:18px; color:#9999b0; width:32px; height:32px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; transition:background .15s; }
      .vv-close:hover { background:#f5f5f8; }
      .vv-title { font-family:'Plus Jakarta Sans',sans-serif; font-size:19px; font-weight:800; color:#1A1A2E; margin-bottom:6px; }
      .vv-sub { font-size:13.5px; color:#6b6b8a; line-height:1.5; margin-bottom:18px; }
      .vv-thumb-link { display:block; text-decoration:none; margin-bottom:16px; }
      .vv-thumb-wrap { position:relative; width:100%; max-width:280px; margin:0 auto;
        border-radius:14px; overflow:hidden; background:#000; cursor:pointer; }
      .vv-thumb-img { width:100%; display:block; object-fit:cover; aspect-ratio:9/16; }
      .vv-play-btn { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,.2); transition:background .2s; }
      .vv-thumb-link:hover .vv-play-btn { background:rgba(0,0,0,.35); }
      .vv-play-btn svg { filter:drop-shadow(0 2px 8px rgba(0,0,0,.5)); transform:scale(1); transition:transform .2s; }
      .vv-thumb-link:hover .vv-play-btn svg { transform:scale(1.1); }
      .vv-yt-label { font-size:12px; color:#6b6b8a; margin:8px 0 0; text-align:center; }
      .vv-btn-primary { display:inline-block; width:100%; padding:13px 20px; background:linear-gradient(135deg,#C81240,#9B1230);
        color:#fff; border-radius:50px; border:none; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:800;
        cursor:pointer; box-shadow:0 6px 20px rgba(200,18,64,.3); transition:opacity .2s; }
      .vv-btn-primary:hover { opacity:.9; }
    `;
    document.head.appendChild(s);
  }
})();
