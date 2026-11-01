/* ===========================================================================
   nav.js
   One rAF loop drives the nav reveal. The nav starts at opacity 0, so this
   file adds a no-JS guard: if it never runs, the CSS resting state is the only
   thing showing, which is why the stylesheet also reveals the nav under
   reduced motion.
   =========================================================================== */
(function () {
  'use strict';

  function boot() {
    var nav = document.querySelector('.nv-nav');
    // Idempotent: a host that re-renders the header (the blog is React and
    // can swap the injected markup) calls window.OJNav.boot() again and only
    // a bar that has not been wired yet is touched.
    if (!nav || nav.getAttribute('data-nv-booted')) return;
    nav.setAttribute('data-nv-booted', '1');

    var menu = nav.querySelector('.nv-menu');
    var toggle = nav.querySelector('.nv-menu-toggle');
    if (menu && toggle) {
      // With JS the details stays open for good, so the dropdown exists in the
      // DOM in both states and can animate closed as well as open. The
      // visible state is the .nv-open class (on the details for the panel,
      // on the nav for anything in the bar that answers it), and the button's
      // aria-expanded, which is also what pushes it in. Without JS the native
      // details toggle still works: nav-mobile.css keys the open panel on
      // [open]:not(.nv-js) too.
      menu.classList.add('nv-js');
      menu.open = true;
      var isOpen = function () { return menu.classList.contains('nv-open'); };
      var setOpen = function (on) {
        menu.classList.toggle('nv-open', on);
        nav.classList.toggle('nv-open', on);
        toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      };
      setOpen(false);
      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        setOpen(!isOpen());
      });
      menu.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(false);
      });
      document.addEventListener('click', function (e) {
        if (isOpen() && !nav.contains(e.target)) setOpen(false);
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen()) {
          setOpen(false);
          toggle.focus();
        }
      });
      nav.addEventListener('focusout', function (e) {
        if (e.relatedTarget && !nav.contains(e.relatedTarget)) setOpen(false);
      });
      window.addEventListener('resize', function () {
        if (window.innerWidth > 640) setOpen(false);
      }, { passive: true });
    }

    var reduce = window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Pages whose content starts directly under the bar keep it grounded
    // from the first frame (the blog); there is nothing to reveal.
    if (reduce || nav.classList.contains('nv-grounded')
        || typeof window.requestAnimationFrame !== 'function') {
      nav.classList.add('nv-in');
      return;
    }

    var lastY = -1;
    (function frame() {
      window.requestAnimationFrame(frame);
      var y = window.scrollY || window.pageYOffset || 0;
      if (y === lastY) return;
      lastY = y;

      // The compact hero can end well before the first viewport does.
      nav.classList.toggle('nv-in', y > 24);
    })();

    window.addEventListener('resize', function () { lastY = -1; }, { passive: true });
  }

  window.OJNav = { boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
