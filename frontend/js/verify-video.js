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
        '<div class="vv-video-wrap">' +
          '<iframe src="https://www.youtube-nocookie.com/embed/' + VIDEO_ID + '?rel=0&origin=https://jaspalsingh.in" ' +
            'title="Verification message from Dr. Jaspal Singh" frameborder="0" ' +
            'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
            'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
        '</div>' +
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
      .vv-video-wrap { position:relative; width:100%; padding-top:177.77%; max-height:480px; margin:0 auto 20px;
        border-radius:14px; overflow:hidden; background:#000; }
      .vv-video-wrap iframe { position:absolute; top:0; left:0; width:100%; height:100%; border:0; }
      .vv-btn-primary { display:inline-block; width:100%; padding:13px 20px; background:linear-gradient(135deg,#C81240,#9B1230);
        color:#fff; border-radius:50px; border:none; font-family:'Plus Jakarta Sans',sans-serif; font-size:14px; font-weight:800;
        cursor:pointer; box-shadow:0 6px 20px rgba(200,18,64,.3); transition:opacity .2s; }
      .vv-btn-primary:hover { opacity:.9; }
      @media (max-width:480px){
        .vv-video-wrap { padding-top:177.77%; max-height:60vh; }
      }
    `;
    document.head.appendChild(s);
  }
})();
