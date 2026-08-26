/* Rolling daily offer countdown: active 6 AM - 2 AM, restarts every day.
   Drives any .op-countdown span on the page - queries live every tick,
   so it works even for spans added to the DOM after this script runs. */
(function () {
  function getDailyOfferEnd() {
    var now = new Date(), h = now.getHours(), end = new Date(now);
    if (h >= 6) { end.setHours(2, 0, 0, 0); end.setDate(end.getDate() + 1); }
    else { end.setHours(2, 0, 0, 0); }
    return end;
  }
  function isOfferActive() { var h = new Date().getHours(); return h >= 6 || h < 2; }
  function pad(n) { return n < 10 ? '0' + n : n; }
  function tick() {
    var spans = document.querySelectorAll('.op-countdown');
    if (!isOfferActive()) { spans.forEach(function (el) { el.textContent = 'Starts 6 AM'; }); return; }
    var diff = Math.max(0, getDailyOfferEnd() - new Date());
    var h = Math.floor(diff / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    var s = Math.floor((diff % 60000) / 1000);
    var text = pad(h) + ':' + pad(m) + ':' + pad(s);
    spans.forEach(function (el) { el.textContent = text; });
  }
  tick();
  setInterval(tick, 1000);
})();
