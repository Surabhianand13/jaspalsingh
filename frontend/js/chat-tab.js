(function () {
  var WA_URL = 'https://wa.me/919829133317?text=' + encodeURIComponent('Hi Jaspal Sir, I have a question about the RSSB JE Test Series before enrolling.');

  var WA_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#fff"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.407A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  var WA_SVG_GREEN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.407A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="#25D366" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  var style = document.createElement('style');
  style.textContent = [
    '.jct-desktop{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:9990;display:flex;align-items:stretch;}',
    '.jct-tab{background:#1A1A2E;border-radius:12px 0 0 12px;border-top:3px solid #C81240;padding:22px 12px;display:flex;flex-direction:column;align-items:center;gap:14px;cursor:pointer;transition:all .28s ease;min-width:44px;}',
    '.jct-tab .jct-icon{flex-shrink:0;}',
    '.jct-tab .jct-rotated{writing-mode:vertical-rl;transform:rotate(180deg);font-size:10px;font-weight:500;color:rgba(255,255,255,0.82);letter-spacing:0.6px;white-space:nowrap;font-family:Arial,sans-serif;}',
    '.jct-tab .jct-dot{width:5px;height:5px;border-radius:50%;background:#C81240;flex-shrink:0;}',
    '.jct-panel{background:#1A1A2E;border-radius:12px 0 0 12px;border-top:3px solid #C81240;padding:26px 18px;display:flex;flex-direction:column;align-items:center;gap:16px;width:0;overflow:hidden;opacity:0;transition:width .28s ease, opacity .25s ease, padding .28s ease;}',
    '.jct-panel.open{width:130px;opacity:1;}',
    '.jct-panel .jct-label{font-size:8px;font-weight:700;color:#C81240;letter-spacing:1.6px;text-transform:uppercase;text-align:center;white-space:nowrap;font-family:Arial,sans-serif;}',
    '.jct-panel .jct-text{font-size:14px;font-weight:600;color:#fff;line-height:1.5;text-align:center;font-family:Arial,sans-serif;}',
    '.jct-panel .jct-divider{width:28px;height:1px;background:rgba(200,18,64,0.35);}',
    '.jct-panel .jct-wa-btn{display:flex;align-items:center;justify-content:center;gap:7px;background:#25D366;border-radius:20px;padding:9px 16px;text-decoration:none;white-space:nowrap;}',
    '.jct-panel .jct-wa-btn span{font-size:12px;font-weight:600;color:#fff;font-family:Arial,sans-serif;}',
    '.jct-mobile{display:none;position:fixed;bottom:0;left:0;right:0;z-index:9990;padding:10px 14px 14px;}',
    '.jct-mobile-inner{background:#1A1A2E;border-radius:14px;border-top:2px solid #C81240;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;}',
    '.jct-mobile-left{display:flex;align-items:center;gap:10px;}',
    '.jct-mobile-text .jct-m-label{font-size:9px;font-weight:700;color:#C81240;letter-spacing:1.2px;text-transform:uppercase;font-family:Arial,sans-serif;}',
    '.jct-mobile-text .jct-m-title{font-size:13px;font-weight:600;color:#fff;font-family:Arial,sans-serif;}',
    '.jct-mobile-right{display:flex;align-items:center;gap:9px;flex-shrink:0;}',
    '.jct-mobile .jct-wa-btn{display:flex;align-items:center;gap:6px;background:#25D366;border-radius:20px;padding:8px 14px;text-decoration:none;}',
    '.jct-mobile .jct-wa-btn span{font-size:12px;font-weight:600;color:#fff;font-family:Arial,sans-serif;}',
    '.jct-mobile-close{font-size:20px;color:rgba(255,255,255,0.25);cursor:pointer;line-height:1;padding:0 2px;}',
    '@media(max-width:768px){.jct-desktop{display:none;}.jct-mobile{display:block;}}'
  ].join('');
  document.head.appendChild(style);

  // Desktop tab
  var desktop = document.createElement('div');
  desktop.className = 'jct-desktop';
  desktop.innerHTML = [
    '<div class="jct-panel" id="jctPanel">',
      '<span class="jct-label">Still unsure?</span>',
      '<div class="jct-text">Chat with<br/>Jaspal Sir</div>',
      '<div class="jct-divider"></div>',
      '<a class="jct-wa-btn" href="' + WA_URL + '" target="_blank" rel="noopener">' + WA_SVG + '<span>WhatsApp</span></a>',
    '</div>',
    '<div class="jct-tab" id="jctTab">',
      '<div class="jct-icon">' + WA_SVG_GREEN + '</div>',
      '<span class="jct-rotated">Chat with Jaspal Sir</span>',
      '<div class="jct-dot"></div>',
    '</div>'
  ].join('');
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
    if (e.target.closest('.jct-wa-btn')) return;
    togglePanel();
  });

  // Mobile bar
  if (sessionStorage.getItem('jct_dismissed')) return;
  var mobile = document.createElement('div');
  mobile.className = 'jct-mobile';
  mobile.id = 'jctMobile';
  mobile.innerHTML = [
    '<div class="jct-mobile-inner">',
      '<div class="jct-mobile-left">',
        '<div>' + WA_SVG_GREEN + '</div>',
        '<div class="jct-mobile-text">',
          '<div class="jct-m-label">Still unsure?</div>',
          '<div class="jct-m-title">Chat with Jaspal Sir directly</div>',
        '</div>',
      '</div>',
      '<div class="jct-mobile-right">',
        '<a class="jct-wa-btn" href="' + WA_URL + '" target="_blank" rel="noopener">' + WA_SVG + '<span>WhatsApp</span></a>',
        '<span class="jct-mobile-close" id="jctClose">&times;</span>',
      '</div>',
    '</div>'
  ].join('');
  document.body.appendChild(mobile);

  document.getElementById('jctClose').addEventListener('click', function () {
    document.getElementById('jctMobile').style.display = 'none';
    sessionStorage.setItem('jct_dismissed', '1');
  });
})();
