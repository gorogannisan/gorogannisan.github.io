/**
 * article.js - Interactions for Gor Ogannisyan's Library Articles
 * Copy code blocks, TOC scrollspy, and navigation helpers.
 */
(function () {
  'use strict';

  // 1. Copy button inside .rs-code
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-rs-copy]');
    if (!b) return;
    var pre = b.closest('.rs-code').querySelector('pre');
    if (!pre) return;
    var t = b.querySelector('span');
    var originalText = t ? t.textContent : 'Копировать';
    var done = function (ok) {
      if (t) t.textContent = ok ? 'Скопировано!' : 'Выделите текст';
      setTimeout(function () {
        if (t) t.textContent = originalText;
      }, 1600);
    };

    var text = pre.innerText;
    var legacy = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (err) {}
      document.body.removeChild(ta);
      done(ok);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, legacy);
    } else {
      legacy();
    }
  });

  document.body.classList.add('has-rs');

  // 2. Table of contents scrollspy & smooth click
  var links = [].slice.call(document.querySelectorAll('.rs-toc a'));
  if (links.length) {
    var byId = {};
    links.forEach(function (a) {
      var href = a.getAttribute('href');
      if (href && href.startsWith('#')) {
        byId[href.slice(1)] = a;
        a.addEventListener('click', function (e) {
          var target = document.getElementById(href.slice(1));
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.pushState(null, '', href);
          }
        });
      }
    });

    var heads = [].slice.call(document.querySelectorAll('.rs-article h2[id]'));
    var setCur = function (id) {
      links.forEach(function (a) {
        if (a === byId[id]) {
          a.setAttribute('aria-current', 'true');
        } else {
          a.removeAttribute('aria-current');
        }
      });
    };

    var onScroll = function () {
      var cur = heads[0];
      heads.forEach(function (h) {
        if (h.getBoundingClientRect().top < window.innerHeight * 0.35) {
          cur = h;
        }
      });
      if (cur) setCur(cur.id);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // 3. Navbar scroll ground
  var nav = document.querySelector('.nv-nav');
  if (nav) {
    var updateNav = function () {
      if (window.scrollY > 40) {
        nav.classList.add('nv-in');
      } else {
        nav.classList.remove('nv-in');
      }
    };
    window.addEventListener('scroll', updateNav, { passive: true });
    updateNav();
  }
})();
