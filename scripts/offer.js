/* ===========================================================================
   offer.js   the Skill Setup pop-up on every /r/<slug> page (offer.css)

   v4 (Oct 21, Jake: lead with the outcome, show how easy it is, add proof):
   Indigo band: the outcome headline ("[500]" and "[one]" render in the
   pixel face) and pastel example-skill tags ending in "+497 more".
   Ink strip: the real
   launch countdown, ticking. Paper: price, one button, two proof lines
   (GitHub stars, five-star reviews), dismiss. Opens trigger.seconds after
   landing. v3 (Oct 19) was the compact card this keeps.

   Everything Jake would change lives in /offer.json (price, deadline, copy,
   Stripe links, timing). Editing that file and pushing is the release.

   Rules kept from earlier rounds:
     - the countdown is the real deadline; at zero the price moves to
       afterDeadline.price, the checkout to afterDeadline.checkoutUrl, and
       the clock disappears. It never resets per visitor.
     - closing starts a cooldown (trigger.cooldownDays); a small pill keeps
       the offer one tap away. A buyer never sees either again (the
       thank-you page sets the bought flag). No storage = never auto-opens.
     - Google-referred visitors only see it on a PDF download or exit intent.
     - #skill-setup or ?offer on any /r/ URL opens it at once (DMs, testing).
     - every open (and its trigger), close (and how), Buy click, PDF download
       and 50% / 90% scroll is logged to offer_events through the cookieless
       /api/public/offer-event; offer.json "variant" names the live design.
     - ?sim on a local host points the button at the local checkout sim.
   =========================================================================== */
(function () {
  if (window.OJOffer) return;
  window.OJOffer = true;

  var q = new URLSearchParams(location.search);
  var SIM = /^(localhost|127\.0\.0\.1|oj\.local)$/.test(location.hostname) ? q.get('sim') : null;
  var FORCE = location.hash === '#skill-setup' || q.has('offer');
  var main = document.querySelector('main[data-slug]');
  var slug = main ? main.getAttribute('data-slug') : '';

  // behaviour beacon (track() below): never from local hosts, the sim or headless
  // browsers; VIEW ties one page load's events together and lives only in memory
  var T0 = Date.now();
  var VIEW = Math.random().toString(36).slice(2, 12);
  var REPORT = !SIM && !navigator.webdriver && !/^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$|\.local$|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname);
  var OFFER = null;

  var canStore = (function () { try { localStorage.setItem('oj-t', '1'); localStorage.removeItem('oj-t'); return true; } catch (e) { return false; } })();
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }

  fetch('/offer.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(init).catch(function () {});

  var X = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  var STAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2l2 4.3 4.7.5-3.5 3.2 1 4.6L8 11.5l-4.2 2.3 1-4.6L1.3 6l4.7-.5z" fill="currentColor"/></svg>';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // "[500]" and "[one]" in the headline become the big pixel words,
  // and a hyphenated word ("expert-level") never splits across lines
  function mark(s) { return esc(s).replace(/\[([^\]]+)\]/g, '<span class="of-n">$1</span>').replace(/(^|\s)([\w]+-[\w-]+)/g, '$1<span class="of-nw">$2</span>'); }
  // the leading count of a proof line ("14,000+") reads in ink, the rest in grey
  function lead(s) { return '<span>' + esc(s).replace(/^([\d.,+kKM]+)/, '<b>$1</b>') + '</span>'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function money(n) { return '$' + n; }
  function fill(s, o) { return String(s || '').replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); }

  function init(o) {
    if (!o || !o.enabled) return;
    if ((o.excludeSlugs || []).indexOf(slug) !== -1) return;
    var BOUGHT = 'oj-offer-bought:' + o.id, KEY = 'oj-offer-closed:' + o.id;
    if (!SIM && !FORCE && store.get(BOUGHT)) return;
    OFFER = o;

    var deadline = Date.parse(o.deadline);
    var live = function () { return Date.now() < deadline; };
    var price = function () { return live() ? o.price : (o.afterDeadline && o.afterDeadline.price) || o.price; };
    var t = o.trigger || {};

    // --- build ------------------------------------------------------------------
    var root = document.createElement('div');
    root.className = 'of';
    root.hidden = true;
    root.innerHTML =
      '<div class="of-scrim" data-of-close="scrim"></div>' +
      '<div class="of-win" role="dialog" aria-modal="true" aria-labelledby="of-h" tabindex="-1">' +
        '<button class="of-x" type="button" aria-label="Close" data-of-close="x">' + X + '</button>' +
        '<div class="of-top">' +
          '<h2 class="of-h" id="of-h">' + mark(o.hero) + '</h2>' +
          ((o.tags || []).length ? '<p class="of-tags">' + o.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + (o.tagsMore ? '<span class="of-tags-more">' + esc(o.tagsMore) + '</span>' : '') + '</p>' : '') +
        '</div>' +
        '<div class="of-clock" role="timer" aria-label="' + esc(o.endsLabel) + '">' +
          '<span class="of-clock-k">' + esc(o.endsLabel) + '</span>' +
          '<span class="of-clock-v"><b data-u="d">00</b><i>d</i><b data-u="h">00</b><i>h</i><b data-u="m">00</b><i>m</i><b data-u="s">00</b><i>s</i></span>' +
        '</div>' +
        '<div class="of-bot">' +
          '<p class="of-price"><b></b><s></s><em></em></p>' +
          '<a class="rs-btn rs-btn-primary of-buy" href="#"></a>' +
          '<div class="of-proof">' +
            '<p class="of-proof-r"><img src="' + esc(o.avatar) + '" alt="" width="22" height="22">' + lead(o.proof) + '</p>' +
            (o.reviews ? '<p class="of-proof-r"><span class="of-stars" aria-hidden="true">' + STAR + STAR + STAR + STAR + STAR + '</span>' + lead(o.reviews) + '</p>' : '') +
          '</div>' +
          '<button class="of-skip" type="button" data-of-close="skip">' + esc(o.dismiss || 'No thanks') + '</button>' +
        '</div>' +
      '</div>';

    var pill = document.createElement('div');
    pill.className = 'of-pill';
    pill.hidden = true;
    pill.innerHTML =
      '<button class="of-pill-b" type="button" aria-haspopup="dialog"><span class="of-pill-n">500</span><span>' + esc(o.pill || 'Claude skills') + '</span><b></b></button>' +
      '<button class="of-pill-x" type="button" aria-label="Hide for now">' + X + '</button>';

    document.body.appendChild(root);
    document.body.appendChild(pill);

    var win = root.querySelector('.of-win');
    var buy = root.querySelector('.of-buy');
    var clock = root.querySelector('.of-clock');
    var units = {};
    [].forEach.call(root.querySelectorAll('[data-u]'), function (b) { units[b.getAttribute('data-u')] = b; });

    // the checkout link carries the page it came from, so Stripe shows which resource sells
    function checkout() {
      var base = SIM ? (o.simCheckoutUrl || o.checkoutUrl) : live() ? o.checkoutUrl : (o.afterDeadline && o.afterDeadline.checkoutUrl) || o.checkoutUrl;
      var url = new URL(base, location.href);
      url.searchParams.set('client_reference_id', ('r_' + (slug || 'site')).replace(/[^\w-]/g, '_').slice(0, 200));
      if (SIM) url.searchParams.set('price', price());
      return url.toString();
    }

    function paint() {
      var p = price(), on = live();
      root.querySelector('.of-price b').textContent = money(p);
      var s = root.querySelector('.of-price s');
      s.textContent = on && o.compareAt > p ? money(o.compareAt) : '';
      s.hidden = !s.textContent;
      var save = root.querySelector('.of-price em');
      // under $100 a percentage reads bigger than the dollar amount (40% off vs Save $20)
      save.textContent = !s.textContent ? '' : o.compareAt < 100 ? Math.floor((o.compareAt - p) / o.compareAt * 100) + '% off' : 'Save ' + money(o.compareAt - p);
      save.hidden = !save.textContent;
      buy.textContent = fill(o.cta, { price: money(p) });
      buy.href = checkout();
      clock.hidden = !on;
      pill.querySelector('b').textContent = money(p);
      tick();
    }
    function tick() {
      var left = Math.max(0, deadline - Date.now());
      if (!left) { if (!clock.hidden) paint(); return; }
      units.d.textContent = pad(Math.floor(left / 864e5));
      units.h.textContent = pad(Math.floor(left / 36e5) % 24);
      units.m.textContent = pad(Math.floor(left / 6e4) % 60);
      units.s.textContent = pad(Math.floor(left / 1e3) % 60);
    }
    paint();
    setInterval(function () { if (!root.hidden) tick(); }, 1000);

    // --- open / close -------------------------------------------------------------------
    var lastFocus = null, opened = false, openedAt = 0;
    function open(why) {
      if (!root.hidden) return;
      opened = true;
      lastFocus = document.activeElement;
      tick();
      pill.hidden = true;
      root.hidden = false;
      document.documentElement.classList.add('of-lock');
      // two frames so the entrance runs; the timer covers tabs where rAF is paused
      var show = function () { if (!root.hidden) root.setAttribute('data-state', 'open'); };
      requestAnimationFrame(function () { requestAnimationFrame(show); });
      setTimeout(show, 80);
      // focus the dialog, not the Buy button, so Enter never means "buy"
      setTimeout(function () { win.focus({ preventScroll: true }); }, 60);
      openedAt = Date.now();
      track('open', why, openedAt - T0);
    }
    function close(how) {
      if (root.hidden) return;
      track('close', how, Date.now() - openedAt);
      root.removeAttribute('data-state');
      document.documentElement.classList.remove('of-lock');
      store.set(KEY, String(Date.now()));
      setTimeout(function () {
        root.hidden = true;
        if (ss('oj-offer-pill-off') !== '1') pill.hidden = false;
        if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      }, 200);
    }
    root.addEventListener('click', function (e) { var c = e.target.closest('[data-of-close]'); if (c) close(c.getAttribute('data-of-close')); });
    document.addEventListener('keydown', function (e) {
      if (root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close('esc'); }
      if (e.key === 'Tab') {
        var f = [].filter.call(win.querySelectorAll('a[href], button'), function (x) { return x.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === win)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    // a checkout click starts the cooldown too, so an abandoned checkout is not re-pitched on the next page
    buy.addEventListener('click', function () { store.set(KEY, String(Date.now())); track('checkout', '', Date.now() - openedAt); });
    pill.querySelector('.of-pill-b').addEventListener('click', function () { open('pill'); });
    pill.querySelector('.of-pill-x').addEventListener('click', function () { pill.hidden = true; ss('oj-offer-pill-off', '1'); track('pill_hide'); });

    // --- page behaviour: PDF downloads and how far down the page people read ----------
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a[download]')) track('download'); });
    var depths = [50, 90];
    function onScroll() {
      var de = document.documentElement, reach = (window.scrollY + window.innerHeight) / Math.max(1, de.scrollHeight) * 100;
      while (depths.length && reach >= depths[0]) track('scroll', String(depths.shift()), Date.now() - T0);
      if (!depths.length) window.removeEventListener('scroll', onScroll);
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // --- triggers -----------------------------------------------------------------------
    if (SIM) { setTimeout(function () { open('sim'); }, 800); return; }
    if (FORCE) { setTimeout(function () { open('link'); }, 500); return; }

    var closedAt = +store.get(KEY) || 0;
    var cooling = closedAt && Date.now() - closedAt < (t.cooldownDays || 3) * 864e5;
    if (cooling || !canStore) {
      if (live() && ss('oj-offer-pill-off') !== '1') pill.hidden = false;
      return;
    }

    var fromSearch = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|perplexity)\./i.test((function () { try { return new URL(document.referrer).hostname; } catch (e) { return ''; } })());
    var quiet = fromSearch && t.searchVisitors === 'download-or-exit';
    var born = Date.now(), minMs = (t.minSeconds || 1) * 1000;
    function fire(why) {
      if (opened) return;
      var wait = Math.max(0, minMs - (Date.now() - born));
      setTimeout(function () { if (!opened) open(why); }, wait);
    }
    if (!quiet && t.seconds) setTimeout(function () { fire('time'); }, t.seconds * 1000);
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[download]');
      if (a) setTimeout(function () { fire('download'); }, t.afterDownloadMs || 1200);
    });
    if (t.exitIntent && matchMedia('(hover: hover) and (pointer: fine)').matches) {
      document.addEventListener('mouseout', function (e) { if (!e.relatedTarget && e.clientY <= 0) fire('exit'); });
    }
  }

  // open / close / checkout / pill_hide / download / scroll -> /api/public/offer-event
  // (cookieless, src/routes/api/public/offer-event.ts). Also fired as an oj:offer
  // DOM event for anything on the page that wants to listen.
  function track(name, detail, ms) {
    try { document.dispatchEvent(new CustomEvent('oj:offer', { detail: { event: name, why: detail || '', slug: slug } })); } catch (e) {}
    if (!REPORT || !OFFER) return;
    var body = { offer: OFFER.id, variant: OFFER.variant || '', event: name, detail: detail || '', slug: slug, view: VIEW, referrer: (document.referrer || '').slice(0, 2000) };
    if (ms >= 0) body.ms = Math.round(ms);
    try {
      fetch('/api/public/offer-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true, credentials: 'omit' }).catch(function () {});
    } catch (e) {}
  }
})();
