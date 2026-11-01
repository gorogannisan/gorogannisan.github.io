/* ===========================================================================
   press.js   the touch press, Astryx 0.6.7's model (utils/pressGesture.ts)

   A mouse press is CSS :active (button.css). A finger is not: on iOS Safari
   :active paints the moment a finger lands and can outlive the start of a
   scroll, so every button a thumb grazes on its way down the page would
   flash. Astryx writes the press itself instead, and so does this:

     armed    finger down, nothing painted yet
     on       held 150ms with under 10px of travel: the press paints
     flash    lifted before 150ms (a quick tap): paint for 100ms
     fading   the 200ms release, then the attribute is removed
     dead     moved past 10px, or the page scrolled: nothing paints

   A tap that lands within 150ms of a scroll is the thumb stopping a fling,
   not a press, so it never arms.
   =========================================================================== */
(function () {
  if (window.OJPress) return;
  window.OJPress = true;

  var SEL = '.hr-btn, .rs-btn, .fg-act, .ft-pill, .ft-el, .nv-link, .nv-menu-toggle, .nv-item, .bk-go, .bk-close, .bk-opt, ' +
            '.lbm-close, .cm-send, .sort-submit, a.resource-badge, .bkr-day-open, .bkr-slot, .bkr-nav, .bkr-back, .bkr-confirm, .bkr-seg-b';
  var ONSET = 150, SLOP = 10, FLASH = 100, FADE = 200, BRAKE = 150;
  var g = null, lastScroll = -Infinity;

  function paint(el, v) {
    if (v) el.setAttribute('data-press', v);
    else el.removeAttribute('data-press');
  }
  function kill() {
    if (!g) return;
    clearTimeout(g.t);
    paint(g.el, null);
    g = null;
  }
  function fade(s) {
    s.phase = 'fading';
    paint(s.el, 'fading');
    s.t = setTimeout(function () {
      paint(s.el, null);
      if (g === s) g = null;
    }, FADE);
  }
  function live() { return g && (g.phase === 'armed' || g.phase === 'on'); }

  var opts = { passive: true, capture: true };

  /* Push in, then go. A link with data-press-nav holds its pressed look for
     one beat before it navigates, so a tap is answered on screen before the
     page leaves. Only a plain left click: modifier keys, middle clicks and
     anything already prevented keep the browser's own behaviour. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-press-nav]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.getAttribute('data-press-going')) return;
    e.preventDefault();
    a.setAttribute('data-press-going', '1');
    paint(a, 'on');
    var href = a.href, target = a.getAttribute('target');
    setTimeout(function () {
      if (target === '_blank') window.open(href, '_blank', 'noopener');
      else location.href = href;
      setTimeout(function () { paint(a, null); a.removeAttribute('data-press-going'); }, 600);
    }, 180);
  });

  addEventListener('scroll', function () {
    lastScroll = performance.now();
    if (live()) kill();
  }, opts);

  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    var el = e.target.closest && e.target.closest(SEL);
    if (!el || el.matches(':disabled, [aria-disabled="true"]')) return;
    if (performance.now() - lastScroll < BRAKE) return;
    if (g) { clearTimeout(g.t); paint(g.el, null); }
    var s = g = { el: el, x: e.clientX, y: e.clientY, phase: 'armed' };
    s.t = setTimeout(function () {
      if (g === s && s.phase === 'armed') { s.phase = 'on'; paint(el, 'on'); }
    }, ONSET);
  }, opts);

  document.addEventListener('pointermove', function (e) {
    if (!live() || e.pointerType !== 'touch') return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > SLOP) kill();
  }, opts);

  document.addEventListener('pointercancel', function () { if (live()) kill(); }, opts);

  document.addEventListener('pointerup', function (e) {
    if (!live() || e.pointerType !== 'touch') return;
    var s = g;
    clearTimeout(s.t);
    if (s.phase === 'armed') {
      s.phase = 'flash';
      paint(s.el, 'on');
      s.t = setTimeout(function () { fade(s); }, FLASH);
    } else {
      fade(s);
    }
  }, opts);
})();
