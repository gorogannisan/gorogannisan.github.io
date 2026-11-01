(function () {
  'use strict';
  if (!window.OJAscii) return;

  function mount(c) {
    if (c.dataset.ojMounted) return;
    c.dataset.ojMounted = '1';
    window.OJAscii.mount(c, {});
  }

  function mountHero() {
    var hero = document.querySelector('canvas[data-src]:not(.fg-plate)');
    if (!hero) return false;
    mount(hero);
    return true;
  }

  if (!mountHero() && 'MutationObserver' in window) {
    var mo = new MutationObserver(function () { if (mountHero()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(function () { mo.disconnect(); mountHero(); }, 8000);
  }

  var plates = [].slice.call(document.querySelectorAll('.fg-plate, .pg-plate-photo, .pg-live'));
  plates.forEach(function (c) { c.dataset.dissolve = '0.16'; });
  if (!plates.length) return;

  if (!('IntersectionObserver' in window)) { plates.forEach(mount); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      mount(e.target);
    });
  }, { rootMargin: '400px 0px' });
  plates.forEach(function (c) { io.observe(c); });
})();
