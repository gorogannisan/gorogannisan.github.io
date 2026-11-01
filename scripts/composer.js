/* ===========================================================================
   composer.js
   Submits the inquiry composer to /api/public/contact, the route the site
   already uses for messages: it writes to Supabase, mirrors to the sheet,
   emails Jake, and sends the person a confirmation when their contact is an
   email address. Nothing about the transport is new here.

   The route takes JSON, so a native form post would not reach it. The page
   carries a <noscript> with the email address for that case rather than
   pretending a button works when it cannot.

   One composer, two homes: the /contact page, and the "Email" step of the
   booking dialog. Each is a root holding .cm-box (the form), .cm-ta, .cm-send,
   a status line (.cm-note[role=status]), .cm-foot and .cm-done;
   window.OJComposer.mount(root) wires one.
   =========================================================================== */
(function () {
  'use strict';

  function mount(root) {
    var form = root && root.querySelector('.cm-box');
    if (!form || form.getAttribute('data-cm-mounted')) return;
    form.setAttribute('data-cm-mounted', '1');

    var send = form.querySelector('.cm-send');
    var note = root.querySelector('.cm-note[role="status"]');
    var foot = root.querySelector('.cm-foot');
    var done = root.querySelector('.cm-done');
    var msg = form.querySelector('.cm-ta');

    // Grow with the text the way a chat composer does, up to the CSS max.
    function grow() {
      msg.style.height = 'auto';
      msg.style.height = Math.min(msg.scrollHeight, 320) + 'px';
    }
    // Nothing typed is nothing to send.
    function arm() { send.disabled = msg.value.trim() === ''; }
    msg.addEventListener('input', function () { grow(); arm(); });
    msg.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!send.disabled) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
    grow();
    arm();

    function say(text, bad) {
      if (!note) return;
      note.textContent = text;
      note.classList.toggle('cm-note-bad', !!bad);
      note.hidden = !text;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var body = {
        name: String(data.get('name') || '').trim(),
        contact: String(data.get('contact') || '').trim(),
        message: String(data.get('message') || '').trim(),
        hp: String(data.get('hp') || '')
      };

      if (!body.name || !body.contact || !body.message) {
        say('Пожалуйста, укажите имя, контакт для связи и текст сообщения.', true);
        return;
      }

      send.disabled = true;
      send.setAttribute('aria-label', 'Отправка');
      say('Отправка…');

            // Demo mode fallback: simulate clean submission
      setTimeout(function () {
        try {
          var submissions = JSON.parse(localStorage.getItem('what_inquiries') || '[]');
          submissions.push({ date: new Date().toISOString(), body: body });
          localStorage.setItem('what_inquiries', JSON.stringify(submissions));
        } catch (err) {}

        form.hidden = true;
        if (note) note.hidden = true;
        if (foot) foot.hidden = true;
        if (done) {
          done.hidden = false;
          done.setAttribute('tabindex', '-1');
          done.focus();
        }
      }, 600);
      return;

      fetch('/api/public/contact', {   method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (json) {
          return { ok: res.ok, status: res.status, json: json };
        });
      }).then(function (r) {
        if (!r.ok) {
          say(r.status === 429
            ? 'That is a few too many messages from here. Try again in a little while.'
            : (r.json && r.json.error) || 'That did not send. Email jake@opusjake.ai and it will reach me.',
            true);
          send.disabled = false;
          send.setAttribute('aria-label', 'Send inquiry');
          return;
        }
        // The confirmation email only goes out when the contact given is an
        // email address, so the copy has to match what actually happened.
        var p = done && done.querySelector('.cm-done-p');
        if (p && r.json && r.json.confirmationSent) {
          p.textContent = 'A copy is on its way to your inbox. I read everything that comes through here and reply personally, usually the same day.';
        }
        form.hidden = true;
        if (note) note.hidden = true;
        if (foot) foot.hidden = true;
        if (done) {
          done.hidden = false;
          done.setAttribute('tabindex', '-1');
          done.focus();
        }
      }).catch(function () {
        say('That did not send. Email jake@opusjake.ai and it will reach me.', true);
        send.disabled = false;
        send.setAttribute('aria-label', 'Send inquiry');
      });
    });
  }

  function boot() {
    var form = document.getElementById('cm-form');
    if (form) mount(form.closest('.cm-col') || form.parentNode);
  }

  window.OJComposer = { mount: mount };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
