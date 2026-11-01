/* ===========================================================================
   hero.js
   Splits the pixel wordmark into per-glyph cells so it can LOAD IN left to
   right, the way a sprite arrives: a solid block lands in the cell first, then
   the block resolves into the letter. It then loads back OUT and repeats on a
   ten second beat.

   Nothing here moves the wordmark. The word occupies its final box from the
   first frame; the only transform is a 6px stepped nudge inside each cell,
   which is a paint-time transform and cannot reflow anything.

   Anti-stranding: the hidden resting state lives behind the .hr-js class this
   file puts on the document element, exactly as calls.js does with .tc-js. The
   class goes on in the same tick as the run flag, at the last possible moment,
   and the whole boot is wrapped, so a script that never loads, throws, or
   never gets as far as starting leaves a fully drawn wordmark rather than a
   blank hole in the largest type on the page.

   Accessibility: the split glyphs are aria-hidden and unselectable, and the
   real string rides along in a visually hidden span, so the heading is still
   read and copied as "Hey I'm OPUSJAKE" rather than spelled out. Reduced
   motion returns before anything is touched, so the markup stays as authored.
   =========================================================================== */
(function () {
  'use strict';

  var STEP = 55;    /* ms between one glyph and the next */
  var DUR  = 300;   /* ms a single glyph spends loading */
  var LEAD = 140;   /* ms before the first glyph lands */
  var FONT_WAIT = 1200;  /* hard ceiling on waiting for Pixeboy */
  var CYCLE = 10000;     /* the wordmark loads in and back out on this beat */

  function boot() {
    var el = document.querySelector('[data-hr-wordmark]');
    if (!el) return;

    /* Reduced motion: leave the wordmark exactly as it was authored. No split,
       no class, no animation, nothing to strand. */
    if (window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    /* The mark is OPUSJAKE alone (Jake, Oct 2026: the name no longer
       alternates in). With more than one word it would alternate, rebuilding
       the cells at the start of each load-in while the word is off screen;
       with one it builds in once on arrival and stays. A word the reader is
       reading should not keep taking itself apart. */
    var initialWord = el.getAttribute('data-hr-wordmark') || el.textContent.trim() || 'gor';
    var WORDS = [initialWord];
    var wi = 0;

    /* the string assistive tech and the clipboard get */
    var sr = document.createElement('span');
    sr.className = 'hr-wm-sr';
    el.textContent = '';
    el.appendChild(sr);
    var ink = null;

    function buildWord(word) {
      sr.textContent = word;
      if (ink) el.removeChild(ink);
      ink = document.createElement('span');
      ink.className = 'hr-wm-ink';
      ink.setAttribute('aria-hidden', 'true');
      var gi = 0;
      for (var i = 0; i < word.length; i++) {
        var chr = word.charAt(i);
        if (chr === ' ') {
          /* one cell per glyph means a literal space would collapse; the gap
             is drawn as a fixed-width spacer with no cell block to animate */
          var sp = document.createElement('span');
          sp.className = 'hr-wm-sp';
          ink.appendChild(sp);
          continue;
        }
        var cell = document.createElement('span');
        cell.className = 'hr-wm-ch';
        cell.style.setProperty('--i', String(gi++));
        var glyph = document.createElement('span');
        glyph.className = 'hr-wm-g';
        glyph.textContent = chr;
        cell.appendChild(glyph);
        ink.appendChild(cell);
      }
      /* the name runs nearly twice the glyphs, so it steps down to hold the
         same optical width as the short mark */
      el.classList.toggle('hr-wm-long', gi > 10);
      el.appendChild(ink);
      return gi;
    }

    var n = buildWord(WORDS[0]);

    el.style.setProperty('--hr-wm-step', STEP + 'ms');
    el.style.setProperty('--hr-wm-dur', DUR + 'ms');
    el.style.setProperty('--hr-wm-lead', LEAD + 'ms');

    /* the run flag sits on the heading, because the quiet fade on "Hey I'm" is
       a sibling of the wordmark rather than a child of it */
    var title = (el.closest && el.closest('.hr-title')) || el.parentNode || el;

    /* Pixeboy is declared font-display: block, so before it arrives the glyphs
       paint nothing at all. Starting the load-in against an empty face would
       spend the whole animation invisible, so the run waits for the face and
       gives up after FONT_WAIT either way. Both paths are idempotent. */
    /* The cycle. Load in, hold, load out, immediately load in again. The out
       is timed to FINISH on the beat rather than start on it, so the word is
       never absent for longer than it takes one glyph to leave.

         in    LEAD + (n-1) * STEP + DUR
         out          (n-1) * STEP + DUR
    */
    /* recomputed per word: the two marks have different glyph counts, so the
       out phase is longer for the name than for the short mark */
    function outSpan() { return (n - 1) * STEP + DUR; }

    /* A class swap only restarts an animation if the element is reflowed in
       between, otherwise the style change is coalesced and nothing replays. */
    function restart(add, remove) {
      title.classList.remove(remove);
      void title.offsetWidth;
      title.classList.add(add);
    }

    var timer = 0;
    var firstIn = true;
    function loadIn() {
      /* A background tab still fires timers but paints nothing, so a cycle
         spent hidden would be spent invisibly and the word could come back
         mid-phase. Skip to the next beat instead. */
      if (document.hidden) { timer = window.setTimeout(loadIn, CYCLE); return; }
      if (!firstIn) { wi = (wi + 1) % WORDS.length; n = buildWord(WORDS[wi]); }
      firstIn = false;
      restart('hr-run', 'hr-out');
      if (WORDS.length > 1) timer = window.setTimeout(loadOut, Math.max(DUR, CYCLE - outSpan()));
    }
    function loadOut() {
      restart('hr-out', 'hr-run');
      timer = window.setTimeout(loadIn, outSpan());
    }

    /* Coming back to the tab mid-cycle would otherwise leave the word parked
       in whatever phase it was in when the tab was hidden. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden || !started) return;
      /* one word that has already built has nothing to come back to */
      if (WORDS.length < 2 && !firstIn) return;
      window.clearTimeout(timer);
      loadIn();
    });

    var started = false;
    function run() {
      if (started) return;
      started = true;
      /* Only here is the resting state allowed to hide anything, and the run
         flag lands in the same tick, so there is no frame where the wordmark
         is hidden but nothing is animating it back. */
      document.documentElement.classList.add('hr-js');
      title.classList.add('hr-intro');
      loadIn();
    }

    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(run, run);
    } else {
      run();
    }
    window.setTimeout(run, FONT_WAIT);
  }

  function safeBoot() {
    try {
      boot();
    } catch (e) {
      /* Never leave the headline half built. */
      document.documentElement.classList.remove('hr-js');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeBoot);
  } else {
    safeBoot();
  }
})();
