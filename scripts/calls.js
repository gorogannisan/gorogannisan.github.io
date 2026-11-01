/* ===========================================================================
   calls.js
   Runs each tool-call group as the reader scrolls through it.

   Scroll decides when a call STARTS. Time decides when it FINISHES. That split
   matters: driving the finish from scroll position too meant a fast scroll
   advanced the target past a row in one frame, so the row jumped straight to
   its check and the spinner was never seen. Now every call spins for a fixed
   beat before it lands, whatever the reader does with the wheel.

   Every line starts INVISIBLE and arrives on its own band; nothing on the page
   is a dimmed preview of something that has not happened yet.

   ONE LINE PER SCROLL BAND. Every line in the group owns a slice of the
   group's travel through the viewport: the join marker, the header, then each
   call. They arrive one at a time as the reader moves, so the session
   assembles from the top rather than appearing with a finished header above
   calls that trickle in underneath it. An earlier version released every remaining row the
   moment the group was comfortably on screen, which made a four call run land
   as a single event no matter how slowly you scrolled.

   That bulk release existed for a real reason: a reader who stops mid group
   would otherwise stare at a half drawn run forever. It is replaced by an IDLE
   catch up. After the wheel has been still for a beat the remaining rows
   release one at a time on their own cadence, so the sequence always completes
   without ever collapsing into one jump.

   Anti-stranding: the dimmed resting state is gated behind the .tc-js class
   this file sets, so if the script never loads or throws, every group renders
   finished rather than half drawn, and the generating line renders visible.
   =========================================================================== */
(function () {
  'use strict';

  var RUN_MS = 620;      /* how long a call visibly spins before it resolves */
  var ROTATE_MS = 4200;  /* how long each generating claim holds before the next */

  var reduce = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function boot() {
    /* The join marker no longer belongs to a run, so the step sequencer below
       never sees it: that walks steps inside a group, and this is not one any
       more. It gets its own reveal, with no ordering, because there is nothing
       left for it to stay in sequence with.

       Under reduced motion .tc-js is never set, so nothing was hidden in the
       first place and adding the class is simply a no-op. */
    var soloJoins = [].slice.call(document.querySelectorAll('.tc-join'))
      .filter(function (j) { return !j.closest('.tc-group'); });

    if (soloJoins.length && !reduce && typeof IntersectionObserver === 'function') {
      var soloIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('tc-in');
          soloIO.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -15% 0px' });
      soloJoins.forEach(function (j) { soloIO.observe(j); });
    } else {
      soloJoins.forEach(function (j) { j.classList.add('tc-in'); });
    }

    var groups = [].slice.call(document.querySelectorAll('.tc-group'));
    if (!groups.length) return;

    function land(row) {
      row.classList.remove('tc-run');
      row.classList.add(row.getAttribute('data-tc-end') === 'error' ? 'tc-fail' : 'tc-done');
      settle(row.closest('.tc-group'));
    }

    /* The generating line claims the model is writing, so it may only appear
       once every call in its group has actually returned. Checked on the group
       rather than counted, so it stays correct however a row landed: scroll,
       idle catch up, or the reduced-motion path that lands them all at once. */
    function settle(group) {
      if (!group || group.classList.contains('tc-settled')) return;
      var rows = group.querySelectorAll('.tc-row');
      for (var i = 0; i < rows.length; i++) {
        if (!rows[i].classList.contains('tc-done') &&
            !rows[i].classList.contains('tc-fail')) return;
      }
      group.classList.add('tc-settled');
    }
    function settled(row) {
      return row.classList.contains('tc-done') || row.classList.contains('tc-fail');
    }

    /* reduced motion, or no rAF: every call has simply already run */
    if (reduce || typeof window.requestAnimationFrame !== 'function') {
      groups.forEach(function (g) {
        var j = g.querySelector('.tc-join'); if (j) j.classList.add('tc-in');
        var h = g.querySelector('.tc-head'); if (h) h.classList.add('tc-in');
        [].slice.call(g.querySelectorAll('.tc-row')).forEach(land);
      });
      rotate();
      return;
    }

    document.documentElement.classList.add('tc-js');

    /* A step is any line that arrives on its own band. Rows spin before they
       land; the join marker and the header just appear. Keeping them in ONE
       ordered list is what guarantees they can never arrive out of sequence. */
    var runs = groups.map(function (g) {
      var steps = [];
      var join = g.querySelector('.tc-join');
      var head = g.querySelector('.tc-head');
      if (join) steps.push({ el: join, row: false });
      if (head) steps.push({ el: head, row: false });
      [].slice.call(g.querySelectorAll('.tc-row')).forEach(function (r) {
        steps.push({ el: r, row: true });
      });
      return {
        el: g,
        steps: steps,
        rows: [].slice.call(g.querySelectorAll('.tc-row')),
        started: 0,           /* how many lines have been kicked off so far */
        idleAt: 0             /* when the next idle catch up line may release */
      };
    });

    /* Kick a step. A row spins, then resolves on its own clock; anything else
       simply arrives. Steps start in order and never restart, so the sequence
       cannot run backwards. */
    function start(r, i) {
      var step = r.steps[i];
      if (!step) return;
      if (!step.row) { step.el.classList.add('tc-in'); return; }
      var row = step.el;
      if (settled(row) || row.classList.contains('tc-run')) return;
      row.classList.add('tc-run');
      window.setTimeout(function () { land(row); }, RUN_MS);
    }

    var lastY = -1;
    var IDLE_WAIT = 900;   /* how long the wheel must be still before catch up */
    var IDLE_STEP = 520;   /* and how fast the remaining lines then release */

    function frame() {
      window.requestAnimationFrame(frame);
      var y = window.scrollY || window.pageYOffset || 0;
      var vh = window.innerHeight || 0;
      var moved = y !== lastY;
      lastY = y;
      var now = Date.now();

      /* Idle catch up. Runs only when the reader has stopped and the group is
         actually on screen, so a run is never left half drawn, and never
         releases more than one row at a time. */
      if (!moved) {
        runs.forEach(function (r) {
          if (r.started >= r.steps.length) return;
          var b = r.el.getBoundingClientRect();
          if (b.bottom < 0 || b.top > vh) return;
          if (!r.idleAt) { r.idleAt = now + IDLE_WAIT; return; }
          if (now >= r.idleAt) {
            start(r, r.started);
            r.started++;
            r.idleAt = now + IDLE_STEP;
          }
        });
        return;
      }

      runs.forEach(function (r) {
        var box = r.el.getBoundingClientRect();

        /* fully above the fold: the reader is past it, so nothing down there
           should still be spinning */
        if (box.bottom < 0) {
          r.steps.forEach(function (s2) {
            if (s2.row) land(s2.el); else s2.el.classList.add('tc-in');
          });
          r.started = r.steps.length;
          return;
        }

        /* Progress through the group: 0 as its top reaches 76% of the
           viewport, 1 once it has travelled 58% of a screen. Both numbers
           matter. Starting at 76 rather than 88 means nothing fires while the
           block is still climbing in from the bottom edge, and finishing at 58
           rather than 100 packs the whole sequence into the stretch where the
           block is actually centred and being read. The old window spread six
           steps across a full viewport, most of which was spent off the bottom
           of the screen, so by the time a reader looked at the run it had
           already finished and appeared to arrive all at once. */
        var p = (vh * 0.76 - box.top) / (vh * 0.58);
        p = Math.max(0, Math.min(1, p));

        /* one row per band, and never more than one new row per frame, so a
           flick of the wheel cannot skip the sequence */
        var want = Math.min(r.steps.length, Math.floor(p * r.steps.length) + 1);
        if (want > r.started + 1) want = r.started + 1;

        while (r.started < want) {
          start(r, r.started);
          r.started++;
          r.idleAt = 0;
        }
      });
    }

    frame();

    /* first paint: a group already behind the reader is finished, not spinning */
    window.requestAnimationFrame(function () {
      runs.forEach(function (r) {
        if (r.el.getBoundingClientRect().bottom < 0) {
          r.steps.forEach(function (s2) {
            if (s2.row) land(s2.el); else s2.el.classList.add('tc-in');
          });
          r.started = r.steps.length;
        }
      });
    });

    rotate();

    window.addEventListener('resize', function () { lastY = -1; }, { passive: true });
  }

  /* The generating line rotates through its group's claims. Deliberately NOT
     aria-live: the text is theatre, and announcing a new joke every four
     seconds would make the page hostile to a screen reader. It is read once in
     document order like any other text. */
  function rotate() {
    var gens = [].slice.call(document.querySelectorAll('.tc-gen[data-tc-lines]'));
    if (!gens.length) return;
    if (reduce) return;   /* one claim, no swapping */

    gens.forEach(function (gen, gi) {
      var lines = (gen.getAttribute('data-tc-lines') || '').split('|')
        .map(function (t) { return t.trim(); }).filter(Boolean);
      if (lines.length < 2) return;
      var t = gen.querySelector('.tc-gen-t');
      if (!t) return;
      var i = 0;
      /* offset per group so two visible runs never swap on the same beat */
      window.setTimeout(function () {
        window.setInterval(function () {
          if (document.hidden) return;
          t.classList.add('tc-swap');
          window.setTimeout(function () {
            i = (i + 1) % lines.length;
            t.textContent = lines[i];
            t.classList.remove('tc-swap');
          }, 260);
        }, ROTATE_MS);
      }, gi * 1400);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
