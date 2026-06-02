/* ============================================================
   track.js  -  lightweight interaction tracking
   Fires events to /api/events/track. Never blocks the page.
   Auto-captures: page_view, whatsapp_click, call_click,
   enquiry/enroll clicks. Exposes window.jspTrack() for manual.
   ============================================================ */
(function () {
  var API = 'https://jaspalsingh.onrender.com';

  /* Stable anonymous session id (per browser) */
  function sessionId() {
    try {
      var k = 'jsp_sid', v = localStorage.getItem(k);
      if (!v) { v = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(k, v); }
      return v;
    } catch (e) { return 's_anon'; }
  }

  function token() {
    try { return localStorage.getItem('jaspal_learner_token'); } catch (e) { return null; }
  }

  function send(type, label, meta, useBeacon) {
    try {
      var payload = JSON.stringify({
        type: type, label: label || null, path: location.pathname,
        session_id: sessionId(), meta: meta || null
      });
      // sendBeacon survives page unloads (checkout_exit etc.)
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(API + '/api/events/track', new Blob([payload], { type: 'application/json' }));
        return;
      }
      var headers = { 'Content-Type': 'application/json' };
      var t = token(); if (t) headers['Authorization'] = 'Bearer ' + t;
      fetch(API + '/api/events/track', { method: 'POST', headers: headers, body: payload, keepalive: true }).catch(function () {});
    } catch (e) { /* ignore */ }
  }

  // Public manual tracker
  window.jspTrack = function (type, label, meta) { send(type, label, meta); };

  /* ── Page view ── */
  send('page_view', document.title ? document.title.slice(0, 120) : null);

  /* ── Auto-capture clicks ── */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a, button');
    if (!a) return;
    var href = (a.getAttribute && a.getAttribute('href')) || '';
    var txt = (a.textContent || '').trim().slice(0, 60);

    if (href.indexOf('wa.me') !== -1 || href.indexOf('whatsapp') !== -1 || a.classList.contains('whatsapp-float')) {
      send('whatsapp_click', txt || 'whatsapp');
    } else if (href.indexOf('tel:') === 0) {
      send('call_click', href.replace('tel:', ''));
    } else if (/enquir|enquiry/i.test(txt)) {
      send('enquiry_click', txt);
    } else if (/enrol|enroll|join|reserve|pay/i.test(txt)) {
      send('enroll_click', txt);
    }
  }, true);

  /* ── Program detail view ── */
  if (/^\/programs\/[^/]+\/?$/.test(location.pathname)) {
    send('program_view', location.pathname.replace(/\/$/, '').split('/').pop());
  }
})();
