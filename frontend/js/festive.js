/* festive.js - Dussehra 2026 festive UX layer
   Auto-expires: 22 Oct 2026 12:00 AM IST (21 Oct 18:30 UTC)
   Include on any page; safe no-op after deadline. */
(function () {
  var DEADLINE = new Date('2026-10-21T18:30:00Z');
  if (Date.now() >= DEADLINE) return;

  /* ── 1. INJECT STYLES ─────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = [
    /* Floating diya particles */
    '@keyframes diyaFloat{0%{opacity:0;transform:translateY(0) scale(.6) rotate(-8deg);}',
    '10%{opacity:.9;}',
    '90%{opacity:.6;}',
    '100%{opacity:0;transform:translateY(-110vh) scale(1) rotate(8deg);}}',

    /* Sparkle burst pieces */
    '@keyframes sparkOut{0%{opacity:1;transform:translate(0,0) scale(1);}',
    '100%{opacity:0;transform:translate(var(--sx),var(--sy)) scale(0);}}',

    /* CTA glow pulse */
    '@keyframes festGlow{0%,100%{box-shadow:0 0 0 0 rgba(255,165,0,.4);}',
    '50%{box-shadow:0 0 0 8px rgba(255,165,0,0);}}',

    /* Sticky badge bounce */
    '@keyframes badgeBounce{0%,100%{transform:translateY(0);}60%{transform:translateY(-5px);}}',

    '.diya-particle{position:fixed;pointer-events:none;z-index:9999;font-size:22px;',
    'animation:diyaFloat linear forwards;will-change:transform,opacity;}',

    '.fest-spark{position:fixed;pointer-events:none;z-index:9998;width:7px;height:7px;border-radius:50%;',
    'animation:sparkOut .55s ease-out forwards;will-change:transform,opacity;}',

    /* Glow on key CTAs */
    '.enroll-btn:not(:disabled),.pay-btn:not(:disabled),[class*="enroll-btn"]:not(:disabled){',
    'animation:festGlow 1.8s ease-in-out infinite;outline:2px solid rgba(255,165,0,.25);outline-offset:2px;}',

    /* Sticky corner badge */
    '#fest-corner-badge{position:fixed;bottom:80px;right:16px;z-index:9997;',
    'background:linear-gradient(135deg,#c8390a,#e8840a);color:#fff;',
    'border-radius:12px;padding:8px 12px 8px 10px;font-size:12px;font-weight:700;',
    'box-shadow:0 4px 16px rgba(0,0,0,.3);animation:badgeBounce 2.5s ease-in-out infinite;',
    'display:flex;align-items:center;gap:6px;cursor:default;max-width:190px;}',

    '#fest-corner-badge .fbc-close{background:none;border:none;color:rgba(255,255,255,.7);',
    'font-size:15px;cursor:pointer;padding:0;margin-left:auto;line-height:1;}',
  ].join('');
  document.head.appendChild(style);

  /* ── 2. FLOATING DIYA PARTICLES ───────────────────────── */
  var DIYAS = ['🪔','🔥','✨','🌟'];
  function spawnDiya() {
    if (Date.now() >= DEADLINE) return;
    var el = document.createElement('span');
    el.className = 'diya-particle';
    el.textContent = DIYAS[Math.floor(Math.random() * DIYAS.length)];
    var dur  = 6000 + Math.random() * 8000;
    var left = 2 + Math.random() * 96;
    el.style.cssText = 'left:' + left + 'vw;bottom:-40px;' +
      'animation-duration:' + dur + 'ms;' +
      'font-size:' + (16 + Math.random() * 18) + 'px;' +
      'opacity:' + (0.5 + Math.random() * 0.5) + ';';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, dur + 200);
    setTimeout(spawnDiya, 900 + Math.random() * 1800);
  }
  spawnDiya();

  /* ── 3. SPARKLE BURST ON CTA CLICKS ──────────────────── */
  var SPARK_COLORS = ['#FFD700','#FF6B35','#FF3D00','#FFAB00','#FF8C42','#FFF176'];
  function burstSparks(cx, cy) {
    for (var i = 0; i < 14; i++) {
      var sp = document.createElement('div');
      sp.className = 'fest-spark';
      var angle = (i / 14) * 2 * Math.PI;
      var dist  = 40 + Math.random() * 60;
      sp.style.cssText = [
        'left:' + (cx - 3.5) + 'px;',
        'top:'  + (cy - 3.5) + 'px;',
        'background:' + SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)] + ';',
        '--sx:' + Math.round(Math.cos(angle) * dist) + 'px;',
        '--sy:' + Math.round(Math.sin(angle) * dist) + 'px;',
        'animation-delay:' + (i * 20) + 'ms;',
      ].join('');
      document.body.appendChild(sp);
      setTimeout(function (el) { el.remove(); }, 700, sp);
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('.enroll-btn,.pay-btn,#pvEnrollBtn,[href*="/checkout"],[href*="/programs"]');
    if (!t) return;
    burstSparks(e.clientX, e.clientY);
  }, true);

  /* ── 4. STICKY CORNER BADGE ───────────────────────────── */
  var badge = document.createElement('div');
  badge.id = 'fest-corner-badge';
  badge.innerHTML = '<span style="font-size:16px;">🪔</span>' +
    '<span>Use <strong>DUSSHERA</strong><br>for 5% OFF</span>' +
    '<button class="fbc-close" onclick="this.closest(\'#fest-corner-badge\').remove()" aria-label="Close">&times;</button>';
  document.body.appendChild(badge);

  /* ── 5. SELF-DESTRUCT WHEN DEADLINE HITS ─────────────── */
  var remaining = DEADLINE - Date.now();
  if (remaining > 0 && remaining < 2147483647) {
    setTimeout(function () {
      var b = document.getElementById('fest-corner-badge');
      if (b) b.remove();
      var s = document.querySelector('.diya-particle');
      if (s) s.remove();
    }, remaining);
  }
})();
