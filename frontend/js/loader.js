(function () {
  // Show on first visit of the session; for subsequent pages only show if load takes > 800ms
  var firstVisit = !sessionStorage.getItem('jsl_visited');
  sessionStorage.setItem('jsl_visited', '1');

  var startTime = Date.now();
  var el;

  function mount() {
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(el);
    setTimeout(function () {
      el.classList.add('fade-out');
      document.documentElement.style.overflow = '';
      setTimeout(function () { el.remove(); }, 500);
    }, 2400);
  }

  var style = document.createElement('style');
  style.textContent = `
    #js-page-loader {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #0F1117;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      transition: opacity 0.5s ease;
    }
    #js-page-loader.fade-out {
      opacity: 0;
      pointer-events: none;
    }
    #jsl-svg .jsl-ring {
      stroke-dasharray: 252;
      stroke-dashoffset: 252;
      animation: jslDrawRing 0.9s ease forwards 0.2s;
    }
    #jsl-svg .jsl-cross-h, #jsl-svg .jsl-cross-v {
      stroke-dasharray: 28;
      stroke-dashoffset: 28;
    }
    #jsl-svg .jsl-cross-h { animation: jslDrawLine 0.3s ease forwards 1.1s; }
    #jsl-svg .jsl-cross-v { animation: jslDrawLine 0.3s ease forwards 1.1s; }
    #jsl-svg .jsl-cross-h2 { animation: jslDrawLine 0.3s ease forwards 1.25s; }
    #jsl-svg .jsl-cross-v2 { animation: jslDrawLine 0.3s ease forwards 1.25s; }
    #jsl-svg .jsl-grid { animation: jslFadeIn 0.4s ease forwards 0.9s; opacity: 0; }
    #jsl-svg .jsl-monogram { animation: jslFadeIn 0.5s ease forwards 1.0s; opacity: 0; }
    #jsl-svg .jsl-dots circle { animation: jslFadeIn 0.3s ease forwards 1.2s; opacity: 0; }
    #jsl-brand { animation: jslFadeIn 0.5s ease forwards 1.3s; opacity: 0; }
    #jsl-bar { animation: jslFadeIn 0.3s ease forwards 1.5s; opacity: 0; }
    #jsl-bar-fill { animation: jslFillBar 0.9s ease forwards 1.5s; }
    @keyframes jslDrawRing { to { stroke-dashoffset: 0; } }
    @keyframes jslDrawLine { to { stroke-dashoffset: 0; } }
    @keyframes jslFadeIn { to { opacity: 1; } }
    @keyframes jslFillBar { from { width: 0; } to { width: 100%; } }
  `;
  document.head.appendChild(style);

  el = document.createElement('div');
  el.id = 'js-page-loader';
  el.innerHTML = `
    <svg id="jsl-svg" width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="jsl-gridpat" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10,0 L0,0 0,10" fill="none" stroke="#1a3a5c" stroke-width="0.6"/>
        </pattern>
        <clipPath id="jsl-clip">
          <circle cx="70" cy="70" r="54"/>
        </clipPath>
      </defs>
      <circle cx="70" cy="70" r="54" fill="#0a1628"/>
      <rect x="0" y="0" width="140" height="140" fill="url(#jsl-gridpat)" clip-path="url(#jsl-clip)" class="jsl-grid"/>
      <circle cx="70" cy="70" r="54" fill="none" stroke="#C81240" stroke-width="2.5" class="jsl-ring" transform="rotate(-90 70 70)"/>
      <line x1="16" y1="70" x2="33" y2="70" stroke="#C81240" stroke-width="1.2" stroke-linecap="round" class="jsl-cross-h"/>
      <line x1="107" y1="70" x2="124" y2="70" stroke="#C81240" stroke-width="1.2" stroke-linecap="round" class="jsl-cross-h2" style="stroke-dasharray:28;stroke-dashoffset:28;animation:jslDrawLine 0.3s ease forwards 1.25s"/>
      <line x1="70" y1="16" x2="70" y2="33" stroke="#C81240" stroke-width="1.2" stroke-linecap="round" class="jsl-cross-v"/>
      <line x1="70" y1="107" x2="70" y2="124" stroke="#C81240" stroke-width="1.2" stroke-linecap="round" class="jsl-cross-v2" style="stroke-dasharray:28;stroke-dashoffset:28;animation:jslDrawLine 0.3s ease forwards 1.25s"/>
      <text x="70" y="82" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-size="36" font-weight="800" fill="#C81240" class="jsl-monogram">JS</text>
      <g class="jsl-dots">
        <circle cx="70" cy="16" r="2.5" fill="#C81240"/>
        <circle cx="70" cy="124" r="2.5" fill="#C81240"/>
        <circle cx="16" cy="70" r="2.5" fill="#C81240"/>
        <circle cx="124" cy="70" r="2.5" fill="#C81240"/>
      </g>
    </svg>

    <div id="jsl-brand" style="margin-top:24px;text-align:center;font-family:Plus Jakarta Sans,sans-serif;">
      <div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.3px;">Dr. <span style="color:#C81240;">Jaspal Singh</span></div>
      <div style="font-size:10px;font-weight:700;letter-spacing:.2em;color:#555;text-transform:uppercase;margin-top:5px;">Rajasthan</div>
    </div>

    <div id="jsl-bar" style="margin-top:28px;width:120px;height:2px;background:#1e1e1e;border-radius:4px;overflow:hidden;">
      <div id="jsl-bar-fill" style="height:100%;width:0;background:#C81240;border-radius:4px;"></div>
    </div>
  `;

  if (firstVisit) {
    // Always show on very first page of the session
    document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);
  } else {
    // On subsequent pages, only show if DOMContentLoaded hasn't fired within 800ms
    var shown = false;
    document.addEventListener('DOMContentLoaded', function () {
      if (!shown && Date.now() - startTime > 800) {
        shown = true;
        mount();
      }
    });
    // If body exists and page is already taking time, show immediately
    var slowTimer = setTimeout(function () {
      if (!shown) {
        shown = true;
        document.body ? mount() : document.addEventListener('DOMContentLoaded', mount);
      }
    }, 800);
    document.addEventListener('DOMContentLoaded', function () {
      clearTimeout(slowTimer);
    });
  }
})();
