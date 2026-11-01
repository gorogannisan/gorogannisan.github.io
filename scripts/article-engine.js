/**
 * article-engine.js - Pure JavaScript Client-Side Engine for Gor's Library
 * Parses extended Markdown into authentic Gor DOM in the browser.
 * No Python or backend needed!
 */

(function () {
  'use strict';

  // Helper: transliteration for heading IDs
  function slugify(text) {
    var ruMap = {
      'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z',
      'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
      'с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch',
      'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
    };
    var t = text.toLowerCase().trim();
    var res = '';
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (ruMap[ch] !== undefined) res += ruMap[ch];
      else if (/[a-z0-9]/.test(ch)) res += ch;
      else if (/[\s\-]/.test(ch)) res += '-';
    }
    return res.replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  // Parse YAML Frontmatter from markdown string
  function parseFrontmatter(md) {
    var fm = {};
    var body = md;
    if (md.startsWith('---')) {
      var parts = md.split('---');
      if (parts.length >= 3) {
        var fmText = parts[1];
        body = parts.slice(2).join('---').trim();
        var lines = fmText.split('\n');
        var curKey = null;
        lines.forEach(function (line) {
          line = line.trim();
          if (!line) return;
          if (line.startsWith('- ') && curKey) {
            if (!Array.isArray(fm[curKey])) fm[curKey] = [];
            fm[curKey].push(line.slice(2).trim());
          } else if (line.indexOf(':') !== -1) {
            var colIdx = line.indexOf(':');
            var k = line.slice(0, colIdx).trim();
            var v = line.slice(colIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (v) fm[k] = v;
            else fm[k] = [];
            curKey = k;
          }
        });
      }
    }
    return { fm: fm, body: body };
  }

  // Parse Extended Markdown to HTML
  function renderMarkdown(body) {
    var toc = [];

    // 1. Flow block: :::flow
    body = body.replace(/:::flow\s*\n([\s\S]*?)\n:::/g, function (_, content) {
      var lines = content.trim().split('\n');
      var steps = lines.map(function (line) {
        line = line.trim().replace(/^- /, '');
        var parts = line.split('|').map(function (p) { return p.trim(); });
        var num = parts[0] || '01';
        var t = parts[1] || '';
        var p = parts[2] || '';
        return '<li class="rv-step">\n' +
               '  <span class="rv-step-k"><span class="rv-step-n">' + num + '</span></span>\n' +
               '  <b class="rv-step-t">' + t + '</b>\n' +
               '  <span class="rv-step-p">' + p + '</span>\n' +
               '</li>';
      }).join('\n');
      return '<ol class="rv rv-flow">\n' + steps + '\n</ol>';
    });

    // 2. Hub block: :::hub [Center Name] [Center Subtitle]
    body = body.replace(/:::hub\s*(.*?)\s*\n([\s\S]*?)\n:::/g, function (_, header, content) {
      var matches = header.match(/\[(.*?)\]/g) || [];
      var hubName = matches[0] ? matches[0].slice(1, -1) : 'Hub';
      var hubNote = matches[1] ? matches[1].slice(1, -1) : 'Architecture';

      var lines = content.trim().split('\n');
      var spokes = lines.map(function (line) {
        line = line.trim().replace(/^- /, '');
        var parts = line.split('|').map(function (p) { return p.trim(); });
        return { title: parts[0] || '', desc: parts[1] || '' };
      });

      var n = Math.max(spokes.length, 1);
      var wirePaths = '';
      for (var i = 0; i < n; i++) {
        var y = (((i + 0.5) / n) * 100).toFixed(2);
        wirePaths += '<path d="M0,50 C55,50 45,' + y + ' 100,' + y + '"/>';
      }

      var spokesHtml = spokes.map(function (s) {
        return '<li class="rv-spoke">\n' +
               '  <span class="rv-spoke-t">\n' +
               '    <b>' + s.title + '</b>\n' +
               '    <span>' + s.desc + '</span>\n' +
               '  </span>\n' +
               '</li>';
      }).join('\n');

      return '<div class="rv rv-hub" role="img" aria-label="' + hubName + ' architecture">\n' +
             '  <div class="rv-hub-center">\n' +
             '    <span class="rv-hub-name">' + hubName + '</span>\n' +
             '    <span class="rv-hub-note">' + hubNote + '</span>\n' +
             '  </div>\n' +
             '  <svg class="rv-hub-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">\n' +
             '    ' + wirePaths + '\n' +
             '  </svg>\n' +
             '  <ol class="rv-hub-spokes">\n' +
             '    ' + spokesHtml + '\n' +
             '  </ol>\n' +
             '</div>';
    });

    // 3. Step rail block: :::steps
    body = body.replace(/:::steps\s*\n([\s\S]*?)\n:::/g, function (_, content) {
      var lines = content.trim().split('\n');
      var items = [];
      var cur = [];
      lines.forEach(function (l) {
        var m = l.match(/^\d+\.\s*(.*)/);
        if (m) {
          if (cur.length) items.push(cur.join('\n'));
          cur = [m[1]];
        } else {
          cur.push(l);
        }
      });
      if (cur.length) items.push(cur.join('\n'));

      var lis = items.map(function (it) {
        it = it.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        it = it.replace(/`(.*?)`/g, '<code>$1</code>');
        return '<li>' + it + '</li>';
      }).join('\n');

      return '<ol class="rv-steps">\n' + lis + '\n</ol>';
    });

    // 4. Code & Prompt cards
    body = body.replace(/```([^\n]*)\n([\s\S]*?)\n```/g, function (_, spec, code) {
      spec = spec.trim();
      var badgeLabel = 'Код';
      var m = spec.match(/\[(.*?)\]/);
      if (m) badgeLabel = m[1];
      else if (spec.toLowerCase() === 'prompt') badgeLabel = 'Промпт';
      else if (spec) badgeLabel = spec.toUpperCase();

      var cleanCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return '<div class="rs-code">\n' +
             '  <div class="rs-code-bar">\n' +
             '    <span class="resource-badge badge-prompts">' + badgeLabel + '</span>\n' +
             '    <button type="button" class="rs-btn rs-btn-secondary rs-btn-sm" data-rs-copy>\n' +
             '      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path></svg>\n' +
             '      <span>Copy</span>\n' +
             '    </button>\n' +
             '  </div>\n' +
             '  <pre><code>' + cleanCode + '</code></pre>\n' +
             '</div>';
    });

    // 5. Tables: markdown table to .rs-table
    body = body.replace(/(\|[^\n]+\|\n\|[\s\:\-\|]+\|\n(?:\|[^\n]+\|\n?)+)/g, function (raw) {
      var lines = raw.trim().split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (lines.length < 2) return raw;
      
      var headers = lines[0].replace(/^\||\|$/g, '').split('|').map(function (c) {
        return c.trim()
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/`(.*?)`/g, '<code>$1</code>');
      });

      var rows = lines.slice(2).map(function (l) {
        return l.replace(/^\||\|$/g, '').split('|').map(function (c) {
          return c.trim()
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
        });
      });

      var thHtml = headers.map(function (h) { return '<th>' + h + '</th>'; }).join('');
      var trHtml = rows.map(function (r) {
        var tdHtml = r.map(function (c) { return '<td>' + c + '</td>'; }).join('');
        return '<tr>' + tdHtml + '</tr>';
      }).join('\n');

      return '<div class="rs-table">\n' +
             '  <table>\n' +
             '    <thead><tr>' + thHtml + '</tr></thead>\n' +
             '    <tbody>\n' + trHtml + '\n</tbody>\n' +
             '  </table>\n' +
             '</div>';
    });

    // 6. Headings
    body = body.replace(/^##\s+(.+)$/gm, function (_, title) {
      title = title.trim();
      var hid = slugify(title);
      toc.push({ id: hid, title: title });
      return '<h2 id="' + hid + '">' + title + '</h2>';
    });

    body = body.replace(/^###\s+(.+)$/gm, function (_, title) {
      return '<h3>' + title.trim() + '</h3>';
    });

    // 7. Blockquotes
    body = body.replace(/^>\s+(.+)$/gm, function (_, quote) {
      var q = quote.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return '<blockquote><p>' + q + '</p></blockquote>';
    });

    // 8. Paragraphs & Lists
    var blocks = body.split('\n\n');
    var parsed = blocks.map(function (b) {
      b = b.trim();
      if (!b) return '';
      if (b.startsWith('<') && (b.endsWith('>') || b.endsWith('</div>') || b.endsWith('</ol>') || b.endsWith('</blockquote>') || b.endsWith('</h2>') || b.endsWith('</h3>'))) {
        return b;
      }
      if (b.startsWith('- ')) {
        var items = b.split('\n').filter(function (l) { return l.startsWith('- '); });
        var lis = items.map(function (it) {
          var text = it.slice(2).trim()
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
          return '<li>' + text + '</li>';
        }).join('\n');
        return '<ul>\n' + lis + '\n</ul>';
      }
      var p = b
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
      return '<p>' + p + '</p>';
    }).filter(Boolean);

    return { html: parsed.join('\n\n'), toc: toc };
  }

  // Setup interactive behavior: copy button and TOC scrollspy
  function initInteractions() {
    // Copy button
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-rs-copy]');
      if (!b) return;
      var pre = b.closest('.rs-code').querySelector('pre');
      if (!pre) return;
      var t = b.querySelector('span');
      var original = t ? t.textContent : 'Copy';
      var done = function (ok) {
        if (t) t.textContent = ok ? 'Скопировано!' : 'Copy';
        setTimeout(function () { if (t) t.textContent = original; }, 1600);
      };
      var text = pre.innerText;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { done(document.execCommand('copy')); } catch (err) { done(false); }
        document.body.removeChild(ta);
      }
    });

    // TOC scrollspy & smooth click
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
      var tick = function () {
        var cur = heads[0];
        heads.forEach(function (h) {
          if (h.getBoundingClientRect().top < window.innerHeight * 0.35) cur = h;
        });
        if (cur) {
          links.forEach(function (a) {
            if (a === byId[cur.id]) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
          });
        }
      };
      window.addEventListener('scroll', tick, { passive: true });
      tick();
    }

    // Nav blur ground
    var nav = document.querySelector('.nv-nav');
    if (nav) {
      var onScroll = function () {
        if (window.scrollY > 40) nav.classList.add('nv-in');
        else nav.classList.remove('nv-in');
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }

  // Template builder
  function buildArticlePage(fm, contentHtml, toc, allArticles) {
    var title = fm.title || 'Статья';
    var subtitle = fm.subtitle || '';
    var badgeKey = fm.badge || 'badge-guides';
    var shelfClass = (badgeKey === 'badge-skills') ? 'rs-skills' : (badgeKey === 'badge-playbooks') ? 'rs-playbooks' : (badgeKey === 'badge-infra') ? 'rs-prompts' : 'rs-guides';
    var category = fm.category || 'Разбор';
    var formatLabel = fm.format || 'Кейс';
    var dateStr = fm.date || '';
    var readTime = fm.readTime || '5 мин';
    var version = fm.version || 'v1.0';
    var author = fm.author || 'Гор Оганнисян';
    var authorHandle = fm.authorHandle || '@gorogannisan';
    var authorAvatar = fm.authorAvatar || 'assets/gor-avatar.png';

    var apps = Array.isArray(fm.apps) ? fm.apps : [];
    var appsHtml = apps.map(function (a) { return '<span class="rs-app">' + a + '</span>'; }).join('');

    var tocHtml = toc.map(function (item) {
      return '<li><a href="#' + item.id + '"><span>' + item.title + '</span></a></li>';
    }).join('\n');

    var others = (allArticles || []).filter(function (a) { return a.slug !== fm.slug; }).slice(0, 3);
    var moreHtml = others.map(function (oa) {
      return '<li><a class="rs-item" href="article.html?id=' + oa.slug + '">\n' +
             '  <span class="rs-item-tags"><span class="resource-badge ' + (oa.badge || 'badge-guides') + '">' + (oa.category || 'Разбор') + '</span></span>\n' +
             '  <span class="rs-item-t">' + (oa.title || '') + '</span>\n' +
             '  <span class="rs-item-p">' + (oa.subtitle || '') + '</span>\n' +
             '  <span class="rs-item-u">gorogannisan.site · ' + (oa.readTime || '5 мин') + '</span>\n' +
             '</a></li>';
    }).join('\n');

    return '<nav class="nv-nav" aria-label="Primary">\n' +
           '  <a class="nv-brand" href="index.html">gor</a>\n' +
           '  <div class="nv-links">\n' +
           '    <a class="nv-link" href="index.html">Главная</a>\n' +
           '    <a class="nv-link" href="about.html">Обо мне</a>\n' +
           '    <a aria-current="page" class="nv-link" href="library.html">Библиотека</a>\n' +
           '    <a class="nv-link nv-link-cta" href="contact.html">Обсудить проект</a>\n' +
           '  </div>\n' +
           '  <details class="nv-menu">\n' +
           '    <summary class="nv-menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="nv-orbs">\n' +
           '      <svg class="nv-menu-glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path class="nv-mg-a" d="M2.5 5.5h11"/><path class="nv-mg-b" d="M2.5 10.5h11"/></svg>\n' +
           '    </summary>\n' +
           '    <div class="nv-menu-panel" id="nv-orbs">\n' +
           '      <ul class="nv-items">\n' +
           '        <li><a class="nv-item" href="index.html"><span>Главная</span></a></li>\n' +
           '        <li><a class="nv-item" href="about.html"><span>Обо мне</span></a></li>\n' +
           '        <li><a aria-current="page" class="nv-item" href="library.html"><span>Библиотека</span></a></li>\n' +
           '      </ul>\n' +
           '      <div class="nv-drop-cta"><a class="nv-drop-btn" href="contact.html">Обсудить проект</a></div>\n' +
           '    </div>\n' +
           '  </details>\n' +
           '</nav>\n' +
           '<main id="top" class="rs ' + shelfClass + ' rs-deck" data-slug="' + (fm.slug || '') + '">\n' +
           '<header class="rs-head">\n' +
           '<div class="wrap">\n' +
           '  <div class="rs-tags">\n' +
           '    <nav class="rs-crumbs pg-eyebrow" aria-label="Breadcrumb"><a href="library.html">Библиотека</a><span aria-hidden="true">/</span></nav>\n' +
           '    <a class="resource-badge ' + badgeKey + '" href="library.html">' + category + '</a>\n' +
           '    <span class="resource-badge badge-file">' + formatLabel + '</span>\n' +
           '  </div>\n' +
           '  <h1 class="pg-h1 rs-h1">' + title + '</h1>\n' +
           '  <p class="pg-lede">' + subtitle + '</p>\n' +
           '  <p class="rs-meta">\n' +
           '    <span>Автор: <a href="about.html" rel="author">' + author + '</a></span>\n' +
           '    <i aria-hidden="true">·</i><span>' + dateStr + '</span>\n' +
           '    <i aria-hidden="true">·</i><span>' + version + '</span>\n' +
           '    <i aria-hidden="true">·</i><span>' + readTime + '</span>\n' +
           '  </p>\n' +
           '  <div class="rs-hosts" style="display:flex;flex-wrap:wrap;gap:16px 36px;align-items:center;margin:28px 0 4px">\n' +
           '    <div style="display:flex;align-items:center;gap:14px">\n' +
           '      <img src="' + authorAvatar + '" alt="' + author + '" width="52" height="52" style="width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none;box-shadow:0 4px 14px rgba(29,29,34,.16)">\n' +
           '      <div style="display:flex;flex-direction:column;gap:3px">\n' +
           '        <span style="font:400 18px/1.2 var(--sans);color:var(--ink)">' + author + '</span>\n' +
           '        <a href="https://t.me/gorogannisan" target="_blank" style="font:500 13px/1.3 var(--mono);color:var(--indigo);text-decoration:none">' + authorHandle + '</a>\n' +
           '      </div>\n' +
           '    </div>\n' +
           '  </div>\n' +
           '  <div class="rs-apps"><span class="rs-apps-k">Стек</span>' + appsHtml + '</div>\n' +
           '  <div class="rs-actions">\n' +
           '    <a class="rs-btn rs-btn-primary" href="contact.html">Обсудить проект</a>\n' +
           '    <a class="rs-btn rs-btn-secondary" href="https://t.me/gorogannisan" target="_blank">Telegram @gorogannisan</a>\n' +
           '  </div>\n' +
           '</div>\n' +
           '</header>\n' +
           '<div class="wrap">\n' +
           '<div class="rs-grid">\n' +
           '<article class="rs-article">\n' + contentHtml + '\n</article>\n' +
           '<aside class="rs-toc" aria-label="На этой странице">\n' +
           '  <div class="rs-toc-in">\n' +
           '    <p class="rs-toc-h">На этой странице</p>\n' +
           '    <ol>' + tocHtml + '</ol>\n' +
           '    <div class="rs-toc-foot">\n' +
            '      <button type="button" class="rs-btn rs-btn-secondary rs-btn-sm" onclick="window.print()" title="Экспорт статьи в PDF">\n' +
            '        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>\n' +
            '        <span>Экспорт в PDF</span>\n' +
            '      </button>\n' +
            '    </div>\n' +
           '  </div>\n' +
           '</aside>\n' +
           '</div>\n' +
           '<section class="rs-end" aria-label="Связь и рассылка">\n' +
           '  <div class="rs-door">\n' +
           '    <div class="fg-copy">\n' +
           '      <div class="fg-page-dots" aria-hidden="true"><span class="fg-page-dot fg-page-dot-red"></span><span class="fg-page-dot fg-page-dot-yellow"></span><span class="fg-page-dot fg-page-dot-green"></span></div>\n' +
           '      <h2 class="fg-h">Разработка и архитектура</h2>\n' +
           '      <p class="fg-p">Помогу спроектировать надежную архитектуру, быстро собрать MVP или автоматизировать процессы разработки.</p>\n' +
           '      <a class="rs-btn rs-btn-onblue" href="contact.html">Обсудить проект</a>\n' +
           '    </div>\n' +
           '  </div>\n' +
           '  <div class="rs-card">\n' +
           '    <p class="rs-card-k">Канал & Рассылка</p>\n' +
           '    <h2 class="rs-card-h">Новые разборы первыми</h2>\n' +
           '    <p class="rs-card-p">Новые кейсы, архитектурные рецепты и код выходят без спама. Прямо в ваш Telegram или на почту.</p>\n' +
           '    <form class="rs-form" onsubmit="event.preventDefault(); window.open(\'https://t.me/gorogannisan\', \'_blank\');">\n' +
           '      <input class="rs-field" type="email" placeholder="you@company.com" aria-label="Email">\n' +
           '      <button type="submit" class="rs-btn rs-btn-primary">Подписаться</button>\n' +
           '    </form>\n' +
           '    <p class="rs-note">Или сразу в Telegram: <a href="https://t.me/gorogannisan" target="_blank" style="color:var(--indigo);text-decoration:underline;">@gorogannisan</a></p>\n' +
           '  </div>\n' +
           '</section>\n' +
           '<section class="rs-more">\n' +
           '  <div class="rs-more-head"><h2 class="rs-more-h">Еще из библиотеки</h2><a class="rs-more-all" href="library.html">Все материалы</a></div>\n' +
           '  <ul class="rs-more-list">' + moreHtml + '</ul>\n' +
           '</section>\n' +
           '</div>\n' +
           '<footer class="ft" id="footer">\n' +
           '  <div class="ft-sky" aria-hidden="true"><i style="--h:86%;--d:0s"></i><i style="--h:72%;--d:-7s"></i><i style="--h:95%;--d:-13s"></i><i style="--h:67%;--d:-3s"></i><i style="--h:79%;--d:-19s"></i><i style="--h:64%;--d:-9s"></i></div>\n' +
           '  <div class="ft-grain" aria-hidden="true"></div>\n' +
           '  <div class="wrap ft-in">\n' +
           '    <h2 class="ft-h">Создано для тех,<br>у кого есть реальные дела</h2>\n' +
           '    <div class="ft-cols">\n' +
           '      <nav class="ft-col"><span class="ft-lab">Навигация</span><a href="index.html">Главная</a><a href="about.html">Обо мне</a><a href="library.html">Библиотека</a><a href="contact.html">Контакты</a></nav>\n' +
           '      <div class="ft-col"><span class="ft-lab">Связь</span><a href="contact.html">Обсудить проект</a><a href="https://t.me/gorogannisan" target="_blank">Telegram @gorogannisan</a><a href="mailto:gorogannisan641@gmail.com">gorogannisan641@gmail.com</a></div>\n' +
           '      <nav class="ft-col ft-col-else"><span class="ft-lab">Соцсети</span><a class="ft-el" href="https://t.me/gorogannisan" target="_blank"><span class="ft-el-t">Telegram</span></a><a class="ft-el" href="https://github.com/gorogannisan" target="_blank"><span class="ft-el-t">GitHub</span></a></nav>\n' +
           '      <div class="ft-col ft-col-status"><span class="ft-lab">Статус</span><p class="ft-p" style="font-family: var(--mono); font-size: 13px; color: var(--ink-2); line-height: 1.6; margin: 0;">Открыт к новым проектам. Отвечаю в день обращения.</p></div>\n' +
           '    </div>\n' +
           '    <div class="ft-foot">\n' +
           '      <nav class="ft-marks"><a class="ft-el ft-mark" href="https://t.me/gorogannisan" target="_blank"><span class="ft-el-t">Telegram</span></a><a class="ft-el ft-mark" href="https://github.com/gorogannisan" target="_blank"><span class="ft-el-t">GitHub</span></a></nav>\n' +
           '      <a class="ft-pill" href="contact.html">Обсудить проект</a>\n' +
           '      <span class="ft-fine">gorogannisan · всегда качество. никакого шлака.</span>\n' +
           '    </div>\n' +
           '  </div>\n' +
           '</footer>\n' +
           '</main>';
  }

  // Engine Entrypoint
  window.ArticleEngine = {
    render: function (rawMarkdown, allArticles) {
      var parsedFm = parseFrontmatter(rawMarkdown);
      var rendered = renderMarkdown(parsedFm.body);
      return buildArticlePage(parsedFm.fm, rendered.html, rendered.toc, allArticles);
    },
    loadAndMount: function (containerSelector, slug) {
      var container = document.querySelector(containerSelector);
      if (!container) return;

      var articles = window.ARTICLES_RAW || [];
      var articleItem = articles.find(function (a) { return a.slug === slug; }) || articles[0];

      if (!articleItem) {
        container.innerHTML = '<div style="padding:100px 20px;text-align:center;font-family:var(--mono)">Статья не найдена. <a href="library.html">В библиотеку</a></div>';
        return;
      }

      document.body.classList.add('has-rs');
      var fullHtml = this.render(articleItem.markdown, articles);
      if (container.id === 'app' && container.parentNode === document.body) {
        var temp = document.createElement('div');
        temp.innerHTML = fullHtml;
        var parent = container.parentNode;
        while (temp.firstChild) {
          parent.insertBefore(temp.firstChild, container);
        }
        parent.removeChild(container);
      } else {
        container.innerHTML = fullHtml;
      }
      document.title = (articleItem.title || 'Статья') + ' | gorogannisan';
      initInteractions();
    }
  };
})();
