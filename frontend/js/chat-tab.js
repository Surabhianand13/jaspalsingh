(function () {
  var WA_URL = 'https://wa.me/919829133317?text=' + encodeURIComponent('Hi Jaspal Sir, I have a question about the RSSB JE Test Series before enrolling.');

  var WA_SVG_WHITE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#fff"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.407A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  var WA_SVG_GREEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.407A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#25D366" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  var WA_SVG_MOBILE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#fff"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.407A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  var style = document.createElement('style');
  style.textContent = [
    /* Desktop wrapper */
    '.jct-desktop{position:fixed!important;right:0!important;top:50%!important;transform:translateY(-50%)!important;z-index:9990!important;display:flex!important;align-items:stretch!important;}',

    /* Collapsed handle */
    '.jct-tab{background:#1A1A2E!important;border-radius:12px 0 0 12px!important;border-top:3px solid #C81240!important;padding:24px 11px!important;display:flex!important;flex-direction:column!important;align-items:center!important;gap:14px!important;cursor:pointer!important;min-width:44px!important;box-sizing:border-box!important;}',
    '.jct-tab .jct-rotated{writing-mode:vertical-rl!important;transform:rotate(180deg)!important;font-size:10px!important;font-weight:500!important;color:rgba(255,255,255,0.8)!important;letter-spacing:0.6px!important;white-space:nowrap!important;font-family:Arial,sans-serif!important;margin:0!important;padding:0!important;}',
    '.jct-tab .jct-dot{width:5px!important;height:5px!important;border-radius:50%!important;background:#C81240!important;flex-shrink:0!important;display:block!important;}',

    /* Expanded panel */
    '.jct-panel{background:#1A1A2E!important;border-radius:14px 0 0 14px!important;border-top:3px solid #C81240!important;padding:28px 18px!important;display:flex!important;flex-direction:column!important;align-items:center!important;gap:16px!important;width:0!important;overflow:hidden!important;opacity:0!important;transition:width .3s ease,opacity .25s ease!important;box-sizing:border-box!important;}',
    '.jct-panel.open{width:118px!important;opacity:1!important;}',
    '.jct-panel .jct-label{font-size:8px!important;font-weight:700!important;color:#C81240!important;letter-spacing:1.6px!important;text-transform:uppercase!important;text-align:center!important;white-space:nowrap!important;font-family:Arial,sans-serif!important;margin:0!important;padding:0!important;}',
    '.jct-panel .jct-text{font-size:14px!important;font-weight:500!important;color:#fff!important;line-height:1.5!important;text-align:center!important;font-family:Arial,sans-serif!important;margin:0!important;padding:0!important;}',
    '.jct-panel .jct-divider{width:28px!important;height:1px!important;background:rgba(200,18,64,0.35)!important;flex-shrink:0!important;}',
    '.jct-panel .jct-wa-btn{display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;background:#25D366!important;border-radius:20px!important;padding:9px 16px!important;text-decoration:none!important;white-space:nowrap!important;}',
    '.jct-panel .jct-wa-btn span{font-size:11px!important;font-weight:500!important;color:#fff!important;font-family:Arial,sans-serif!important;}',

    /* Mobile bar */
    '.jct-mobile{display:none!important;position:fixed!important;bottom:0!important;left:0!important;right:0!important;z-index:9990!important;padding:10px 14px 14px!important;}',
    '.jct-mobile-inner{background:#1A1A2E!important;border-radius:14px!important;border-top:2px solid #C81240!important;padding:13px 16px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;}',
    '.jct-mobile-left{display:flex!important;align-items:center!important;gap:10px!important;}',
    '.jct-m-label{font-size:9px!important;font-weight:700!important;color:#C81240!important;letter-spacing:1.2px!important;text-transform:uppercase!important;font-family:Arial,sans-serif!important;margin:0!important;}',
    '.jct-m-title{font-size:13px!important;font-weight:600!important;color:#fff!important;font-family:Arial,sans-serif!important;margin:0!important;}',
    '.jct-mobile-right{display:flex!important;align-items:center!important;gap:9px!important;flex-shrink:0!important;}',
    '.jct-mobile .jct-wa-btn{display:flex!important;align-items:center!important;gap:6px!important;background:#25D366!important;border-radius:20px!important;padding:8px 14px!important;text-decoration:none!important;}',
    '.jct-mobile .jct-wa-btn span{font-size:12px!important;font-weight:600!important;color:#fff!important;font-family:Arial,sans-serif!important;}',
    '.jct-mobile-close{font-size:20px!important;color:rgba(255,255,255,0.3)!important;cursor:pointer!important;line-height:1!important;padding:0 2px!important;background:none!important;border:none!important;font-family:Arial,sans-serif!important;}',

    '@media(max-width:768px){.jct-desktop{display:none!important;}.jct-mobile{display:block!important;}}'
  ].join('');
  document.head.appendChild(style);

  /* Desktop */
  var desktop = document.createElement('div');
  desktop.className = 'jct-desktop';
  desktop.innerHTML =
    '<div class="jct-panel" id="jctPanel">' +
      '<span class="jct-label">Still unsure?</span>' +
      '<div class="jct-text">Chat with<br>Jaspal Sir</div>' +
      '<div class="jct-divider"></div>' +
      '<a class="jct-wa-btn" href="' + WA_URL + '" target="_blank" rel="noopener">' + WA_SVG_WHITE + '<span>WhatsApp</span></a>' +
    '</div>' +
    '<div class="jct-tab" id="jctTab">' +
      WA_SVG_GREEN +
      '<span class="jct-rotated">Chat with Jaspal Sir</span>' +
      '<span class="jct-dot"></span>' +
    '</div>';
  document.body.appendChild(desktop);

  var panel = document.getElementById('jctPanel');
  var tab   = document.getElementById('jctTab');
  var open  = false;

  function togglePanel() {
    open = !open;
    panel.classList.toggle('open', open);
  }
  tab.addEventListener('click', togglePanel);
  panel.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.jct-wa-btn')) return;
    togglePanel();
  });

  /* Mobile */
  if (sessionStorage.getItem('jct_dismissed')) return;
  var mobile = document.createElement('div');
  mobile.className = 'jct-mobile';
  mobile.id = 'jctMobile';
  mobile.innerHTML =
    '<div class="jct-mobile-inner">' +
      '<div class="jct-mobile-left">' +
        WA_SVG_GREEN +
        '<div>' +
          '<p class="jct-m-label">Still unsure?</p>' +
          '<p class="jct-m-title">Chat with Jaspal Sir directly</p>' +
        '</div>' +
      '</div>' +
      '<div class="jct-mobile-right">' +
        '<a class="jct-wa-btn" href="' + WA_URL + '" target="_blank" rel="noopener">' + WA_SVG_MOBILE + '<span>WhatsApp</span></a>' +
        '<button class="jct-mobile-close" id="jctClose" aria-label="Dismiss">&times;</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(mobile);

  document.getElementById('jctClose').addEventListener('click', function () {
    document.getElementById('jctMobile').style.display = 'none';
    sessionStorage.setItem('jct_dismissed', '1');
  });
})();
