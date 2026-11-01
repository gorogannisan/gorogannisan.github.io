/* ===========================================================================
   booking.js
   The booking dialog. Opens from any element with href="#book" or
   [data-book], asks up to two questions, names the call, and books it, all
   inside the dialog:

     questions -> the call -> a calendar of open times -> name and email ->
     confirm (the only place a price appears) -> Stripe -> back here, booked

   Open times come from /api/public/book/slots: the weekly windows in
   src/lib/booking/config.ts, minus Jake's Google Calendar, minus calls
   already booked. Picking a time holds it (/api/public/book/hold) while the
   visitor pays on the Stripe Payment Link; Stripe sends them to /book/done,
   which reopens this dialog with ?booked=<session>, and the held time is
   confirmed (/api/public/book/confirm). The free intro skips Stripe and
   becomes a request Jake approves from his email.

   The dialog builds its own DOM, so a page only needs this script plus
   booking.css; no markup has to be added to the template.
   =========================================================================== */
(function () {
  'use strict';

  var API = '/api/public/book/';
  var PENDING = 'oj-booking';
  var TZ = (function () {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto'; }
    catch (e) { return 'America/Toronto'; }
  })();

  var ROUTES = {
    intro: {
      title: 'Intro Call', minutes: 15,
      time: '15 min', price: 'Free', free: true,
      copy: 'Reserved for teams with a $100k+ budget that are ready to implement now. Fifteen minutes to work out whether Jake is the right person to build it, then a plan for the engagement.',
      note: 'Jake confirms each intro by hand. If the fit is not there you will hear back with a better next step.'
    },
    call: {
      title: 'Strategy Call', minutes: 30,
      time: '30 min', price: '$299',
      copy: 'Bring the workflow that is costing you the most hours. You leave with the plan: what an agent takes off it, what it costs, what to build first.',
      note: 'Pick a time first; you check out on Stripe at the end.'
    },
    build: {
      title: 'Build Session', minutes: 60,
      time: '60 min', price: '$1,000',
      copy: 'We build the thing on the call. Bring the accounts and the credentials; you leave with a working agent or automation, not a proposal.',
      note: 'Pick a time first; you check out on Stripe at the end.'
    }
  };

  /* The free intro sits behind two gates: budget, then readiness. Every other
     path lands on a paid call, which is the point: the free slot is for
     engagements, not for advice. */
  var STEPS = {
    start: {
      q: 'How do you want to get in touch?',
      sub: 'A message goes straight to Jake. A call puts you on his calendar.',
      opts: [
        { t: 'Email',                                         s: 'Write it out. Jake reads it himself and replies, usually the same day.', go: 'email' },
        { t: 'Call',                                          s: 'Pick a time: a free intro, a strategy call or a build session.',         go: 'calls' }
      ]
    },
    calls: {
      q: 'What do you need right now?',
      sub: 'Three ways to get time with Jake. Two questions, at most, and you are picking a time.',
      opts: [
        { t: 'A clear plan for one specific problem.',        s: '30 min',                         go: 'call' },
        { t: 'Something built, on the call, today.',          s: '60 min',                         go: 'size' },
        { t: 'A larger engagement. I have budget.',           s: 'agents, systems, a full build',  go: 'budget' }
      ]
    },
    size: {
      q: 'How big is the thing?',
      sub: 'An hour is enough for one agent or one workflow, end to end.',
      opts: [
        { t: 'One agent or one workflow, done in an hour.',   s: '60 min',                         go: 'build' },
        { t: 'Bigger than that.',                             s: 'scope it on a strategy call',    go: 'call' }
      ]
    },
    budget: {
      q: 'What is the budget for this?',
      sub: 'Honest answer. It decides which call is worth your time.',
      opts: [
        { t: '$100,000 and up.',                              s: 'one more question',              go: 'ready' },
        { t: 'Under $100,000.',                               s: 'start with a strategy call',     go: 'call' },
        { t: 'Not set yet.',                                  s: 'start with a strategy call',     go: 'call' }
      ]
    },
    ready: {
      q: 'When are you implementing?',
      sub: 'The free intro is for teams that are moving now.',
      opts: [
        { t: 'Now. Decision maker is on the call.',           s: '15 min, free',                   go: 'intro' },
        { t: 'This year, still lining things up.',            s: 'start with a strategy call',     go: 'call' },
        { t: 'Just exploring.',                               s: 'start with a strategy call',     go: 'call' }
      ]
    }
  };

  var root, card, stepEl, backBtn, altLink, trail = [], opener = null;
  // what the visitor has chosen so far
  var sel = { kind: null, month: null, day: null, slot: null, name: '', email: '', note: '' };
  var slotCache = {};

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function txt(tag, cls, text) {
    var n = el(tag, cls);
    n.textContent = text;
    return n;
  }
  function heading(text) {
    var h = txt('h2', 'bk-q', text);
    h.id = 'bk-title';
    h.tabIndex = -1;
    return h;
  }

  // --- dates in the visitor's zone ---------------------------------------------
  var fDay = new Intl.DateTimeFormat(undefined, { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  function dayKey(d) {
    var p = {};
    fDay.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }
  function fmt(d, o) { return new Intl.DateTimeFormat(undefined, Object.assign({ timeZone: TZ }, o)).format(d); }
  var timeOf = function (d) { return fmt(d, { hour: 'numeric', minute: '2-digit' }); };
  var longDay = function (d) { return fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }); };
  var tzName = (function () {
    try {
      return new Intl.DateTimeFormat(undefined, { timeZoneName: 'long' }).formatToParts(new Date())
        .filter(function (x) { return x.type === 'timeZoneName'; })[0].value;
    } catch (e) { return TZ; }
  })();

  function build() {
    root = el('div', 'bk');
    root.id = 'book';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'bk-title');
    root.hidden = true;

    var scrim = el('div', 'bk-scrim');
    scrim.addEventListener('click', close);

    card = el('div', 'bk-card');
    card.setAttribute('role', 'document');

    var head = el('div', 'bk-head');
    var x = el('button', 'bk-close', 'Close');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close booking');
    x.addEventListener('click', close);
    head.appendChild(x);

    stepEl = el('div', 'bk-step');
    stepEl.setAttribute('aria-live', 'polite');

    var foot = el('div', 'bk-foot');
    backBtn = el('button', 'bk-back', '&larr; Back');
    backBtn.type = 'button';
    backBtn.addEventListener('click', back);
    var alt = altLink = el('a', 'bk-alt', 'Email instead');
    alt.href = 'mailto:jake@opusjake.ai?subject=Let%27s%20build%20something';
    foot.appendChild(backBtn);
    foot.appendChild(alt);

    card.appendChild(head);
    card.appendChild(stepEl);
    card.appendChild(foot);
    root.appendChild(scrim);
    root.appendChild(card);
    document.body.appendChild(root);
  }

  function renderStep(key) {
    var s = STEPS[key];
    stepEl.innerHTML = '';
    stepEl.appendChild(heading(s.q));
    stepEl.appendChild(el('p', 'bk-sub', s.sub));
    var ul = el('ul', 'bk-opts');
    s.opts.forEach(function (o) {
      var li = el('li');
      var b = el('button', 'bk-opt',
        '<span>' + o.t + '<small>' + o.s + '</small></span>' +
        '<span class="bk-opt-x" aria-hidden="true">→</span>');
      b.type = 'button';
      b.addEventListener('click', function () { go(o.go); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    stepEl.appendChild(ul);
    backBtn.hidden = trail.length <= 1;
    var first = stepEl.querySelector('button');
    if (first) first.focus();
  }

  function renderResult(key) {
    var r = ROUTES[key];
    sel.kind = key;
    stepEl.innerHTML = '';
    var box = el('div', 'bk-res');
    /* No price until checkout (Jake, Oct 2026): a paid call shows its length
       here and its price on the confirm step. Only the free intro says so. */
    box.appendChild(el('div', 'bk-res-row',
      '<span class="bk-tag bk-tag-time">' + r.time + '</span>' +
      (r.free ? '<span class="bk-tag bk-tag-free">' + r.price + '</span>' : '')));
    box.appendChild(heading(r.title));
    box.appendChild(el('p', 'bk-res-p', r.copy));
    var b = el('button', 'bk-go', 'Pick a time <span aria-hidden="true">→</span>');
    b.type = 'button';
    b.setAttribute('data-book-route', key);
    b.addEventListener('click', function () { go('pick'); });
    box.appendChild(b);
    box.appendChild(el('p', 'bk-note', r.note));
    stepEl.appendChild(box);
    backBtn.hidden = false;
    b.focus();
  }

  // --- the booker: the cal.diy booking page, in the dialog ------------------
  // Same anatomy and the same Bare reskin as cal.opusjake.ai/opusjake/<event>:
  // event details on the left, the month in the middle, the day's times on
  // the right (stacked on a phone). Squared corners, hairline dividers, open
  // days as filled tiles, the chosen day in indigo, times as outlined mono
  // boxes, a 12h/24h switch.
  var AVATAR = 'https://lh3.googleusercontent.com/a/ACg8ocKoQuVsnexkpqpo5XZbGfl7cCHaCBe5BNOybu3ar2XhYlMnteXf=s96-c';
  var ICON = {
    when: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/></svg>',
    time: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.75"/><path d="M8 5v3.25l2 1.25"/></svg>',
    call: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.75" y="4" width="8.5" height="8" rx="1.5"/><path d="m10.25 7 4-2.25v6.5l-4-2.25"/></svg>',
    tz: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.75"/><path d="M2.25 8h11.5M8 2.25c1.6 1.6 2.4 3.5 2.4 5.75S9.6 12.15 8 13.75C6.4 12.15 5.6 10.25 5.6 8S6.4 3.85 8 2.25z"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="m5.5 8 1.75 1.75L10.5 6.5"/></svg>'
  };
  var hour12 = true;
  try { hour12 = localStorage.getItem('oj-booking-h') !== '24'; } catch (e) {}

  function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
  function slotLabel(d) {
    if (!hour12) return fmt(d, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return fmt(d, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([AP])M/i, function (m, x) { return x.toLowerCase() + 'm'; });
  }

  function fetchMonth(kind, month) {
    var key = kind + ':' + month.getFullYear() + '-' + month.getMonth();
    if (slotCache[key]) return slotCache[key];
    // a little either side, so a zone offset never drops the month's edge days
    var from = new Date(month.getTime() - 86400000), to = new Date(addMonths(month, 1).getTime() + 86400000);
    var q = API + 'slots?kind=' + kind + '&from=' + from.toISOString() + '&to=' + to.toISOString();
    var p = fetch(q, { headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (j) {
        var byDay = {};
        (j.slots || []).forEach(function (iso) {
          var d = new Date(iso), k = dayKey(d);
          (byDay[k] = byDay[k] || []).push(d);
        });
        return byDay;
      });
    p.catch(function () { delete slotCache[key]; });
    slotCache[key] = p;
    return p;
  }

  // the left column: who, what, how long, where, which zone
  function info(withWhen) {
    var r = ROUTES[sel.kind];
    var a = el('aside', 'bkr-info');
    var av = el('span', 'bkr-avatar');
    var img = el('img');
    img.alt = ''; img.width = 24; img.height = 24; img.referrerPolicy = 'no-referrer'; img.src = AVATAR;
    img.addEventListener('error', function () { av.textContent = 'JS'; });
    av.appendChild(img);
    a.appendChild(av);
    a.appendChild(txt('p', 'bkr-host', 'Jake Schincariol'));
    var h = txt('h2', 'bkr-title', r.title);
    h.id = 'bk-title'; h.tabIndex = -1;
    a.appendChild(h);
    a.appendChild(txt('p', 'bkr-desc', r.copy));
    var ul = el('ul', 'bkr-meta');
    function meta(icon, text, extra) {
      var li = el('li', null, ICON[icon]);
      var sp = txt('span', null, text);
      if (extra) { sp.appendChild(el('br')); sp.appendChild(document.createTextNode(extra)); }
      li.appendChild(sp);
      ul.appendChild(li);
    }
    if (withWhen && sel.slot) {
      var end = new Date(sel.slot.getTime() + r.minutes * 60000);
      meta('when', fmt(sel.slot, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        slotLabel(sel.slot) + ' – ' + slotLabel(end));
    }
    if (r.free) meta('check', 'Requires confirmation');
    meta('time', r.minutes + 'm');
    meta('call', 'Google Meet');
    meta('tz', TZ.replace(/_/g, ' '));
    a.appendChild(ul);
    return a;
  }

  function wide(on) { card.classList.toggle('bk-wide', on); }

  function renderPick() {
    if (!sel.month) sel.month = monthStart(new Date());
    stepEl.innerHTML = '';
    wide(true);
    var bkr = el('div', 'bkr');
    bkr.appendChild(info(false));

    // the month
    var cal = el('section', 'bkr-cal');
    cal.setAttribute('aria-label', 'Pick a day');
    var bar = el('div', 'bkr-cal-bar');
    var mo = el('span', 'bkr-month');
    mo.appendChild(txt('b', null, fmt(sel.month, { month: 'long' })));
    mo.appendChild(document.createTextNode(' ' + sel.month.getFullYear()));
    var prev = el('button', 'bkr-nav', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>');
    var next = el('button', 'bkr-nav', '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', 'Previous month');
    next.setAttribute('aria-label', 'Next month');
    bar.appendChild(mo); bar.appendChild(prev); bar.appendChild(next);
    cal.appendChild(bar);
    var grid = el('div', 'bkr-grid');
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function (w) { grid.appendChild(txt('span', 'bkr-wd', w)); });
    cal.appendChild(grid);
    var msg = el('p', 'bkr-msg');
    msg.setAttribute('role', 'status');
    cal.appendChild(msg);
    bkr.appendChild(cal);

    // the day's times
    var times = el('section', 'bkr-times');
    times.setAttribute('aria-label', 'Pick a time');
    bkr.appendChild(times);
    stepEl.appendChild(bkr);
    backBtn.hidden = false;

    var thisMonth = monthStart(new Date());
    prev.disabled = sel.month <= thisMonth;
    next.disabled = sel.month >= addMonths(thisMonth, 2);
    prev.addEventListener('click', function () { sel.month = addMonths(sel.month, -1); sel.day = null; renderPick(); });
    next.addEventListener('click', function () { sel.month = addMonths(sel.month, 1); sel.day = null; renderPick(); });

    var first = sel.month, days = [], todayKey = dayKey(new Date());
    for (var i = 0; i < first.getDay(); i++) grid.appendChild(el('span', 'bkr-pad'));
    var n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (var dd = 1; dd <= n; dd++) {
      var date = new Date(first.getFullYear(), first.getMonth(), dd);
      var b = txt('button', 'bkr-day', String(dd));
      b.type = 'button';
      b.disabled = true;
      b.setAttribute('aria-label', longDay(date));
      b.dataset.key = dayKey(date);
      if (b.dataset.key === todayKey) b.classList.add('bkr-today');
      grid.appendChild(b);
      days.push(b);
    }

    // a quick answer never flashes a loading line
    var loadingTimer = setTimeout(function () { msg.textContent = 'Finding open times…'; }, 160);
    var month = sel.month;
    fetchMonth(sel.kind, month).then(function (byDay) {
      clearTimeout(loadingTimer);
      if (month !== sel.month || !stepEl.contains(grid)) return;
      msg.textContent = '';
      var firstOpen = null;
      days.forEach(function (b) {
        var list = byDay[b.dataset.key];
        if (!list || !list.length) return;
        b.disabled = false;
        b.classList.add('bkr-day-open');
        if (!firstOpen) firstOpen = b;
        b.addEventListener('click', function () { pickDay(b.dataset.key, list, days, times); });
      });
      if (!firstOpen) {
        msg.textContent = 'No open times in ' + fmt(month, { month: 'long' }) + '.';
        if (!next.disabled) {
          var more = txt('button', 'bk-link', 'See ' + fmt(addMonths(month, 1), { month: 'long' }));
          more.type = 'button';
          more.addEventListener('click', function () { next.click(); });
          msg.appendChild(document.createTextNode(' '));
          msg.appendChild(more);
        }
        return;
      }
      var keep = sel.day && byDay[sel.day] ? days.filter(function (b) { return b.dataset.key === sel.day; })[0] : null;
      (keep || firstOpen).click();
    }).catch(function () {
      clearTimeout(loadingTimer);
      msg.innerHTML = '';
      // The calendar could not be read (not connected yet, or Google is down).
      // Times are never guessed, so the visitor is handed to the written path,
      // which always works and reaches Jake the same way.
      msg.appendChild(document.createTextNode('Times are not showing here right now. '));
      var note = txt('button', 'bk-link', 'Send Jake a note instead');
      note.type = 'button';
      note.addEventListener('click', function () { go('email'); });
      msg.appendChild(note);
      msg.appendChild(document.createTextNode(' and he will reply with times.'));
    });
    var h = stepEl.querySelector('#bk-title');
    if (h) h.focus({ preventScroll: true });
  }

  function pickDay(key, list, days, times) {
    sel.day = key;
    days.forEach(function (b) {
      var on = b.dataset.key === key;
      b.classList.toggle('bkr-day-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    times.innerHTML = '';
    var bar = el('div', 'bkr-times-bar');
    var dh = el('span', 'bkr-dayh');
    dh.appendChild(txt('b', null, fmt(list[0], { weekday: 'short' })));
    dh.appendChild(document.createTextNode(' ' + fmt(list[0], { day: 'numeric' })));
    bar.appendChild(dh);
    var seg = el('div', 'bkr-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Clock');
    [['12h', true], ['24h', false]].forEach(function (o) {
      var b = txt('button', 'bkr-seg-b', o[0]);
      b.type = 'button';
      b.setAttribute('aria-pressed', hour12 === o[1] ? 'true' : 'false');
      b.addEventListener('click', function () {
        hour12 = o[1];
        try { localStorage.setItem('oj-booking-h', hour12 ? '12' : '24'); } catch (e) {}
        pickDay(key, list, days, times);
      });
      seg.appendChild(b);
    });
    bar.appendChild(seg);
    times.appendChild(bar);
    var ul = el('ul', 'bkr-slots');
    list.forEach(function (d) {
      var li = el('li');
      var b = txt('button', 'bkr-slot', slotLabel(d));
      b.type = 'button';
      b.addEventListener('click', function () { sel.slot = d; go('details'); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    times.appendChild(ul);
  }

  // --- the form: name, email, notes, and the one place the price appears ------
  function field(label, input) {
    var w = el('label', 'bkr-field');
    w.appendChild(txt('span', 'bkr-label', label));
    w.appendChild(input);
    return w;
  }

  function renderDetails() {
    var r = ROUTES[sel.kind];
    stepEl.innerHTML = '';
    wide(true);
    var bkr = el('div', 'bkr bkr-form-mode');
    bkr.appendChild(info(true));
    var form = el('form', 'bkr-form');
    form.noValidate = true;
    var name = el('input', 'bkr-input');
    name.name = 'name'; name.autocomplete = 'name'; name.required = true; name.maxLength = 100; name.value = sel.name;
    var email = el('input', 'bkr-input');
    email.type = 'email'; email.name = 'email'; email.autocomplete = 'email'; email.required = true; email.maxLength = 200; email.value = sel.email;
    var note = el('textarea', 'bkr-input bkr-textarea');
    note.name = 'note'; note.rows = 3; note.maxLength = 2000; note.value = sel.note;
    note.placeholder = 'Please share anything that will help prepare for our meeting.';
    var hp = el('input', 'bk-hp');
    hp.name = 'company_url'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
    form.appendChild(field('Your name *', name));
    form.appendChild(field('Email address *', email));
    form.appendChild(field('Additional notes', note));
    form.appendChild(hp);
    var err = el('p', 'bk-err');
    err.setAttribute('role', 'alert');
    form.appendChild(err);
    // a fixed field clears its complaint as soon as the visitor types
    form.addEventListener('input', function () { err.textContent = ''; });
    form.appendChild(txt('p', 'bkr-fine', r.free
      ? 'Jake confirms intros by hand; the calendar invite follows.'
      : 'Stripe opens next. Your time is held for 30 minutes while you pay, and the invite arrives by email once it clears.'));
    var actions = el('div', 'bkr-actions');
    var backB = txt('button', 'bkr-back', 'Back');
    backB.type = 'button';
    backB.addEventListener('click', back);
    var submit = txt('button', 'bkr-confirm', r.free ? 'Request this time' : 'Check out · ' + r.price);
    submit.type = 'submit';
    actions.appendChild(backB);
    actions.appendChild(submit);
    form.appendChild(actions);
    bkr.appendChild(form);
    stepEl.appendChild(bkr);
    backBtn.hidden = true;
    name.focus();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      sel.name = name.value.trim(); sel.email = email.value.trim(); sel.note = note.value.trim();
      sel.hp = hp.value;
      if (!sel.name) { err.textContent = 'Add your name.'; name.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sel.email)) { err.textContent = 'That email does not look right.'; email.focus(); return; }
      submit.disabled = true;
      var label = submit.textContent;
      submit.textContent = r.free ? 'Sending…' : 'Holding your time…';
      fetch(API + 'hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: sel.kind, start: sel.slot.toISOString(), name: sel.name, email: sel.email, note: sel.note, tz: TZ, hp: sel.hp || '' })
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (j) { return { status: res.status, j: j }; });
      }).then(function (o) {
        if (o.status === 409) {
          // someone took it a moment ago: fresh times, same day
          slotCache = {};
          sel.slot = null;
          trail = trail.slice(0, trail.lastIndexOf('pick') + 1);
          renderPick();
          var m = stepEl.querySelector('.bkr-msg');
          if (m) m.textContent = 'That time was just taken. Pick another.';
          return;
        }
        if (o.status !== 200 || !o.j.id) throw new Error(String(o.status));
        if (o.j.checkoutUrl) {
          try {
            localStorage.setItem(PENDING, JSON.stringify({ id: o.j.id, kind: sel.kind, start: sel.slot.toISOString(), checkoutUrl: o.j.checkoutUrl }));
          } catch (e2) { /* the return still works from the session id alone, less gracefully */ }
          location.href = o.j.checkoutUrl;
          return;
        }
        renderRequested();
      }).catch(function () {
        submit.disabled = false;
        submit.textContent = label;
        err.textContent = 'That did not go through. Try again, or email jake@opusjake.ai.';
      });
    });
  }

  function renderRequested() {
    stepEl.innerHTML = '';
    wide(false);
    stepEl.appendChild(heading('Request sent'));
    stepEl.appendChild(txt('p', 'bk-sub', 'Intro Call, ' + longDay(sel.slot) + ', ' + timeOf(sel.slot) + '. Jake confirms it by hand; the invite comes to ' + sel.email + '.'));
    backBtn.hidden = true;
    stepEl.querySelector('h2').focus();
  }

  // --- back from Stripe --------------------------------------------------------
  function renderReturn(session) {
    stepEl.innerHTML = '';
    stepEl.appendChild(heading('Confirming your booking…'));
    backBtn.hidden = true;
    var pending = null;
    try { pending = JSON.parse(localStorage.getItem(PENDING) || 'null'); } catch (e) { pending = null; }
    if (!pending || !pending.id) {
      finish('Payment received', 'This browser does not have the booking it came from, so Jake will email you to lock in the time. If you paid, nothing is lost.');
      return;
    }
    fetch(API + 'confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pending.id, session: session })
    }).then(function (r) { return r.json(); }).then(function (j) {
      var when = j.start ? longDay(new Date(j.start)) + ', ' + timeOf(new Date(j.start)) : '';
      if (j.ok) {
        try { localStorage.removeItem(PENDING); } catch (e) {}
        finish('You’re booked', j.title + ', ' + when + '. The calendar invite is on its way to ' + j.email + '.');
      } else if (j.reason === 'unpaid') {
        finish('Payment did not go through', 'Your time is still held for a little while.', pending.checkoutUrl);
      } else if (j.reason === 'conflict') {
        finish('Paid, but that time was taken', 'Someone booked it while you were checking out. Jake has your payment and will email you a new time today.');
      } else {
        finish('Payment received', 'Jake will email you to lock in the time.');
      }
    }).catch(function () {
      finish('Payment received', 'The booking is still confirming. If no invite arrives within the hour, reply to your Stripe receipt.');
    });
  }

  function finish(title, text, retryUrl) {
    stepEl.innerHTML = '';
    wide(false);
    stepEl.appendChild(heading(title));
    stepEl.appendChild(txt('p', 'bk-sub', text));
    if (retryUrl) {
      var a = el('a', 'bk-go', 'Try checkout again <span aria-hidden="true">→</span>');
      a.href = retryUrl;
      stepEl.appendChild(a);
    }
    stepEl.querySelector('h2').focus();
  }

  // --- email: the "work with me" form, the same one the live site sends ------
  // Same fields, same wording, same endpoint as the live site's work-with-me
  // window (/api/public/work-request): saved to scale_requests under
  // engagement "mentorship" or "custom-build", emailed to Jake from
  // agent@opusjake.ai. Two branches, asked one page at a time:
  //   which one -> you -> (format, who | company, role) -> project, timeline
  //   -> budget (builds only) -> sent
  var WM = {
    'mentorship': {
      label: 'What do you want to walk away able to do?',
      ph: 'the thing you keep getting stuck on…',
      done: "I'll come back with formats and dates that fit."
    },
    'custom-build': {
      label: 'What are you trying to ship?',
      ph: 'the workflow, agent or tool you want built…',
      done: "I'll reply with scope and a slot if it's a fit, and tell you straight if it isn't."
    },
    'partnership': {
      label: 'What do you have in mind?',
      ph: 'a launch, a reel series, a product in front of people who build with AI\u2026',
      done: "I'll come back with what I can do and what it costs."
    }
  };
  var wm = { engagement: '', firstName: '', lastName: '', contact: '', format: '', groupSize: '', company: '', role: '', project: '', timeline: '', budget: '', hp: '' };
  var WM_PAGES = {
    'mentorship':   ['email', 'wm-you', 'wm-fit', 'wm-project'],
    'custom-build': ['email', 'wm-you', 'wm-fit', 'wm-project', 'wm-budget'],
    'partnership':  ['email', 'wm-you', 'wm-fit', 'wm-project']
  };

  function wmStep(key) {
    var pages = WM_PAGES[wm.engagement] || ['email', 'wm-you'];
    var i = pages.indexOf(key);
    // the total depends on the branch, so it is only shown once there is one
    return el('span', 'bk-eyebrow bk-wm-step', 'Step ' + (i + 1) + (wm.engagement && key !== 'email' ? ' of ' + pages.length : ''));
  }

  function input(name, label, o) {
    o = o || {};
    var w = el('label', 'bk-f');
    w.appendChild(txt('span', 'bk-f-l', label));
    var i;
    if (o.options) {
      i = el('select', 'bk-f-i bk-f-sel');
      [''].concat(o.options).forEach(function (v) {
        var op = txt('option', null, v || 'Select');
        op.value = v;
        i.appendChild(op);
      });
    } else if (o.area) {
      i = el('textarea', 'bk-f-i bk-f-area');
      i.rows = 4;
    } else {
      i = el('input', 'bk-f-i');
      i.type = o.type || 'text';
    }
    i.name = name;
    if (o.max) i.maxLength = o.max;
    if (o.auto) i.autocomplete = o.auto;
    if (o.ph) i.placeholder = o.ph;
    if (o.mode) i.inputMode = o.mode;
    i.value = wm[name] || '';
    i.addEventListener('input', function () { wm[name] = i.value; });
    i.addEventListener('change', function () { wm[name] = i.value; });
    w.appendChild(i);
    return w;
  }

  function wmPage(key, title, fields, last) {
    stepEl.innerHTML = '';
    stepEl.appendChild(wmStep(key));
    stepEl.appendChild(heading(title));
    var form = el('form', 'bk-wm');
    form.noValidate = true;
    var row = null;
    fields.forEach(function (f) {
      if (f === 'row') { row = el('div', 'bk-f-row'); form.appendChild(row); return; }
      if (f === 'endrow') { row = null; return; }
      (row || form).appendChild(f);
    });
    if (last && last.hint) form.appendChild(txt('p', 'bk-note', last.hint));
    var err = el('p', 'bk-err');
    err.setAttribute('role', 'alert');
    form.appendChild(err);
    form.addEventListener('input', function () { err.textContent = ''; });
    var b = el('button', 'bk-go', (last && last.send ? 'Send it' : 'Next') + ' <span aria-hidden="true">→</span>');
    b.type = 'submit';
    form.appendChild(b);
    stepEl.appendChild(form);
    backBtn.hidden = false;
    var first = form.querySelector('input, select, textarea');
    if (first) first.focus();
    return { form: form, err: err, button: b };
  }

  function need(form, err) {
    // every visible field is required; the honeypot is meant to stay empty
    var bad = [].filter.call(form.querySelectorAll('input:not(.bk-hp), select, textarea'), function (i) { return !i.value.trim(); })[0];
    if (bad) { err.textContent = 'Fill this in to keep going.'; bad.focus(); return false; }
    var mail = form.querySelector('input[type=email]');
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.value.trim())) { err.textContent = 'Check the email address.'; mail.focus(); return false; }
    return true;
  }

  function nextPage(key) {
    var pages = WM_PAGES[wm.engagement];
    var i = pages.indexOf(key);
    go(pages[i + 1]);
  }

  // page 1: which of the two, as two choices rather than a dropdown
  function renderEmail() {
    stepEl.innerHTML = '';
    stepEl.appendChild(wmStep('email'));
    stepEl.appendChild(heading('Three ways I work with people. Which one fits?'));
    var ul = el('ul', 'bk-opts');
    [['mentorship', 'Workshop or mentorship', 'You or your team want to get good at building with AI. Sessions, workshops, ongoing mentorship.'],
     ['custom-build', 'A custom build for my company', 'You want something designed and shipped: agents, workflows, internal tools.'],
     ['partnership', 'Collaborations and partnerships', 'Brand deals, content partnerships and launches. You have a product; I have the people who build with AI.']].forEach(function (o) {
      var li = el('li');
      var b = el('button', 'bk-opt', '<span>' + o[1] + '<small>' + o[2] + '</small></span><span class="bk-opt-x" aria-hidden="true">→</span>');
      b.type = 'button';
      if (wm.engagement === o[0]) b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', function () { wm.engagement = o[0]; go('wm-you'); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    stepEl.appendChild(ul);
    backBtn.hidden = trail.length <= 1;
    var f = stepEl.querySelector('button');
    if (f) f.focus();
  }

  function renderWm(key) {
    var b = wm.engagement, p;
    if (key === 'wm-you') {
      p = wmPage(key, 'Who am I talking to?', [
        'row',
        input('firstName', 'First name', { max: 60, auto: 'given-name' }),
        input('lastName', 'Last name', { max: 60, auto: 'family-name' }),
        'endrow',
        input('contact', 'Email', { type: 'email', max: 200, auto: 'email', mode: 'email', ph: 'you@company.com' })
      ]);
    } else if (key === 'wm-fit' && b === 'mentorship') {
      p = wmPage(key, 'What kind of session?', [
        input('format', 'Format', { options: ['1:1 mentorship', 'Team workshop', 'Talk or session for a group', 'Not sure yet'] }),
        input('groupSize', 'Who is it for', { options: ['Just me', '2–5 people', '6–20 people', '20+ people'] })
      ]);
    } else if (key === 'wm-fit' && b === 'partnership') {
      p = wmPage(key, 'Who are you with?', [
        input('company', 'Company or brand', { max: 120, auto: 'organization' }),
        input('role', 'Your role', { max: 120, ph: 'founder, marketing lead, partnerships\u2026' })
      ]);
    } else if (key === 'wm-fit') {
      p = wmPage(key, 'Where would this live?', [
        input('company', 'Company', { max: 120, auto: 'organization' }),
        input('role', 'Your role', { max: 120, ph: 'founder, ops lead, head of marketing…' })
      ]);
    } else if (key === 'wm-project') {
      p = wmPage(key, WM[b].label, [
        input('project', WM[b].label, { area: true, max: 2000, ph: WM[b].ph }),
        input('timeline', 'Timeline', { options: ['Ready now', 'Next month', 'This quarter', 'Just exploring'] })
      ], b === 'mentorship' ? { send: true } : null);
      // the label repeats the question as the heading; keep it for the reader
      // that lands on the field, hide it for everyone else
      p.form.querySelector('.bk-f-l').className = 'bk-f-l bk-sr';
    } else if (key === 'wm-budget') {
      p = wmPage(key, 'What is the budget?', [
        input('budget', 'Budget', { options: ['$10k – $15k (build · minimum)', '$15k – $50k', '$50k+', 'Not sure yet'] })
      ], { send: true, hint: 'Custom builds start at $10–15k. Picking a range helps me route this to the right slot.' });
    }
    var hp = el('input', 'bk-hp');
    hp.name = 'hp'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true');
    hp.addEventListener('input', function () { wm.hp = hp.value; });
    p.form.appendChild(hp);

    var last = WM_PAGES[b][WM_PAGES[b].length - 1] === key;
    p.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!need(p.form, p.err)) return;
      if (!last) { nextPage(key); return; }
      sendWm(p);
    });
  }

  function sendWm(p) {
    var b = wm.engagement;
    var payload = {
      engagement: b,
      name: [wm.firstName.trim(), wm.lastName.trim()].filter(Boolean).join(' '),
      contact: wm.contact.trim(),
      project: wm.project.trim(),
      timeline: wm.timeline,
      hp: wm.hp || ''
    };
    if (b === 'mentorship') { payload.format = wm.format; payload.groupSize = wm.groupSize; }
    else { payload.company = wm.company.trim(); payload.role = wm.role.trim(); if (b === 'custom-build') payload.budget = wm.budget; }
    p.button.disabled = true;
    var label = p.button.innerHTML;
    p.button.textContent = 'Sending…';
    fetch('/api/public/work-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.status === 429) throw new Error('429');
      if (!res.ok) throw new Error(String(res.status));
      stepEl.innerHTML = '';
      stepEl.appendChild(heading('Got it'));
      stepEl.appendChild(txt('p', 'bk-sub', 'This came straight to me. ' + WM[b].done));
      var more = txt('button', 'bk-link', 'Book a call instead');
      more.type = 'button';
      more.addEventListener('click', function () { go('calls'); });
      var n = el('p', 'bk-note');
      n.appendChild(document.createTextNode('Want to talk sooner? '));
      n.appendChild(more);
      stepEl.appendChild(n);
      backBtn.hidden = true;
      wm = { engagement: '', firstName: wm.firstName, lastName: wm.lastName, contact: wm.contact, format: '', groupSize: '', company: '', role: '', project: '', timeline: '', budget: '', hp: '' };
      stepEl.querySelector('h2').focus();
    }).catch(function (e) {
      p.button.disabled = false;
      p.button.innerHTML = label;
      p.err.textContent = String(e && e.message) === '429'
        ? 'Too many attempts from here. Try again shortly.'
        : 'That did not send. Try again, or email jake@opusjake.ai.';
    });
  }

  // --- navigation ---------------------------------------------------------------
  function render(key) {
    if (key !== 'pick' && key !== 'details') wide(false);
    // "Email instead" is noise where email is the question or the answer
    if (altLink) altLink.hidden = key === 'start' || key === 'email' || key.indexOf('wm-') === 0;
    if (STEPS[key]) renderStep(key);
    else if (ROUTES[key]) renderResult(key);
    else if (key === 'email') renderEmail();
    else if (key.indexOf('wm-') === 0) renderWm(key);
    else if (key === 'pick') renderPick();
    else if (key === 'details') renderDetails();
  }

  function go(key) {
    trail.push(key);
    render(key);
  }

  function back() {
    if (trail.length <= 1) return;
    trail.pop();
    render(trail[trail.length - 1]);
  }

  // A button that says "Book a call" (or "pick a time") already answered the
  // first question, so it opens on the calls; "Get in touch" asks.
  function startFor(from) {
    if (!from || !from.getAttribute) return 'start';
    var asked = from.getAttribute('data-book-start');
    if (asked && (STEPS[asked] || asked === 'email')) return asked;
    return /\b(call|book|time)\b/i.test(from.textContent || '') ? 'calls' : 'start';
  }

  function open(from) {
    if (!root) build();
    opener = from || document.activeElement;
    trail = [];
    sel = { kind: null, month: null, day: null, slot: null, name: sel.name, email: sel.email, note: '' };
    root.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    go(startFor(from));
  }

  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    document.documentElement.style.overflow = '';
    if (location.hash === '#book') history.replaceState(null, '', location.pathname + location.search);
    if (opener && opener.focus) opener.focus();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('a[href="#book"], a[href="/#book"], [data-book]');
    if (!t) return;
    e.preventDefault();
    open(t);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  // back from Stripe: /book/done hands over ?booked=<session>#book
  var booked = (function () {
    try { return new URLSearchParams(location.search).get('booked'); } catch (e) { return null; }
  })();
  if (booked) {
    build();
    opener = null;
    root.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    history.replaceState(null, '', location.pathname);
    renderReturn(booked);
  } else if (location.hash === '#book') {
    open();
  }
  window.addEventListener('hashchange', function () { if (location.hash === '#book') open(); });

  window.OJBooking = { open: open, close: close };
})();
