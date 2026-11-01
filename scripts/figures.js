/* figures.js   prefix fg-   the three FIG cards

   One job: reveal each card once, on scroll, in the order header, rule,
   plate, heading, body, action, caption.

   THE SAFETY CONTRACT, which this project has broken twice.

   The stylesheet alone renders every card fully visible. The hidden state
   lives behind .fg-armed, and .fg-armed is added by this file and by nothing
   else, so it cannot exist unless this script is running.

   While it is running there are four independent ways out of it, and the
   important thing about the list is that no two of them share a dependency:

     1. a first pass position check, which resolves anything already on screen
     2. an IntersectionObserver, the precise trigger
     3. a position poll on setInterval, which also covers a page that scrolls
        a container rather than the window
     4. a plain setTimeout hard stop that reveals everything unconditionally

   Measured, not assumed: in a hidden tab, requestAnimationFrame and
   IntersectionObserver never fire at all, while setTimeout and setInterval
   still do, and getBoundingClientRect still returns true geometry. A page
   opened in a background tab is an ordinary thing, so nothing here may be
   reached only through rAF. rAF is used for one thing only, to let the armed
   state paint once so the transition has something to move from, and a 300ms
   timer starts the same setup if that frame never arrives.

   Under prefers-reduced-motion nothing is armed at all, so there is no hidden
   state to undo.

   This file binds nothing but .fg- classes and reads nothing but geometry. */
(function () {
  'use strict';

  var cards = [].slice.call(document.querySelectorAll('.fg-fig'));
  if (!cards.length) return;

  var reduce = window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce || !('IntersectionObserver' in window)) {
    /* never armed, so there is nothing to undo */
    return;
  }

  var io = null;
  var poll = 0;
  var hardStop = 0;
  var started = false;
  var pending = cards.length;

  function vh() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }

  function near(el, bias) {
    var r = el.getBoundingClientRect();
    return r.top < vh() * bias && r.bottom > 0;
  }

  function stop() {
    if (io) { io.disconnect(); io = null; }
    if (poll) { clearInterval(poll); poll = 0; }
    if (hardStop) { clearTimeout(hardStop); hardStop = 0; }
  }

  function go(el) {
    if (el.classList.contains('fg-in')) return;
    el.classList.add('fg-in');
    if (io) io.unobserve(el);
    pending--;
    if (pending <= 0) stop();
  }

  function resolveAll() {
    for (var i = 0; i < cards.length; i++) go(cards[i]);
    stop();
  }

  function sweep(bias) {
    for (var i = 0; i < cards.length; i++) {
      if (pending <= 0) return;
      if (near(cards[i], bias)) go(cards[i]);
    }
  }

  function start() {
    if (started) return;
    started = true;

    /* anything already on screen resolves here, before an observer exists */
    sweep(0.85);
    if (pending <= 0) return;

    io = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k++) {
        if (entries[k].isIntersecting) go(entries[k].target);
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });

    for (var i = 0; i < cards.length; i++) {
      if (!cards[i].classList.contains('fg-in')) io.observe(cards[i]);
    }

    poll = setInterval(function () { sweep(0.9); }, 500);
  }

  for (var i = 0; i < cards.length; i++) cards[i].classList.add('fg-armed');

  /* the guarantee, on a timer, so it survives a tab where neither rAF nor the
     observer ever runs */
  hardStop = setTimeout(resolveAll, 20000);

  /* preferred path: let the armed state paint one frame, then set up, so the
     cards above the fold animate in rather than appearing already finished */
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(start);
    });
  }

  /* fallback path: a frame may never arrive. This one always does. */
  setTimeout(start, 300);
})();
