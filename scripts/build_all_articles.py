import os
import glob
import json
from article_compiler import parse_frontmatter, render_extended_markdown

# Load all articles
md_files = sorted(glob.glob('articles/*.md'))
articles_data = []
articles_raw = []

for mf in md_files:
    with open(mf, 'r', encoding='utf-8') as f:
        text = f.read()
    fm, body = parse_frontmatter(text)
    html_content, toc = render_extended_markdown(body)
    fm['content_html'] = html_content
    fm['toc'] = toc
    articles_data.append(fm)
    articles_raw.append({
        'slug': fm.get('slug'),
        'title': fm.get('title'),
        'subtitle': fm.get('subtitle'),
        'tag': fm.get('tag'),
        'badge': fm.get('badge'),
        'category': fm.get('category'),
        'format': fm.get('format'),
        'date': fm.get('date'),
        'readTime': fm.get('readTime'),
        'markdown': text
    })

print(f"Loaded {len(articles_data)} articles from articles/ directory.")

# Save articles_data.js for library and client-side
with open('articles/articles_data.js', 'w', encoding='utf-8') as f:
    f.write('window.ARTICLES_DATABASE = ' + json.dumps(articles_data, ensure_ascii=False, indent=2) + ';\n')
print("Generated articles/articles_data.js")

# Save articles_raw.js for browser article engine
with open('articles/articles_raw.js', 'w', encoding='utf-8') as f:
    f.write('window.ARTICLES_RAW = ' + json.dumps(articles_raw, ensure_ascii=False, indent=2) + ';\n')
print("Generated articles/articles_raw.js")

# Badges and shelf mapping
# Gor shelves: rs-playbooks, rs-guides, rs-skills, rs-prompts
SHELF_MAP = {
    'badge-guides': 'rs-guides',
    'badge-skills': 'rs-skills',
    'badge-playbooks': 'rs-playbooks',
    'badge-infra': 'rs-prompts'
}

SVG_BADGES = {
    'badge-guides': '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m15 9-1.8 4.2L9 15l1.8-4.2z"/></svg>',
    'badge-skills': '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2 5.5 5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2z"/></svg>',
    'badge-playbooks': '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3.5h6v3H9zM9 12h6M9 16h4"/></svg>',
    'badge-infra': '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>'
}

LIQUID_SVG = '''<svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;pointer-events:none">
  <filter id="oj-liquid-a" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.0014 0.0031" numOctaves="2" seed="11" result="field">
      <animate attributeName="baseFrequency" dur="41s" begin="0s" repeatCount="indefinite" values="0.0014 0.0031; 0.0019 0.0024; 0.0010 0.0038; 0.0016 0.0028; 0.0014 0.0031"/>
    </feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="field" scale="150" xChannelSelector="R" yChannelSelector="G" result="wave">
      <animate attributeName="scale" dur="29s" repeatCount="indefinite" values="150; 194; 118; 168; 150"/>
    </feDisplacementMap>
    <feTurbulence type="fractalNoise" baseFrequency="0.0011 0.0022" numOctaves="2" seed="28" result="field2">
      <animate attributeName="baseFrequency" dur="53s" begin="0s" repeatCount="indefinite" values="0.0011 0.0022; 0.0014 0.0017; 0.0008 0.0027; 0.0012 0.0020; 0.0011 0.0022"/>
    </feTurbulence>
    <feDisplacementMap in="wave" in2="field2" scale="90" xChannelSelector="G" yChannelSelector="B" result="swell">
      <animate attributeName="scale" dur="37s" repeatCount="indefinite" values="90; 118; 72; 102; 90"/>
    </feDisplacementMap>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="11" stitchTiles="stitch" result="noise"/>
    <feColorMatrix in="noise" type="saturate" values="0" result="mono"/>
    <feComposite in="swell" in2="mono" operator="arithmetic" k1="0" k2="1" k3="0.34" k4="-0.17"/>
  </filter>

  <filter id="oj-footer" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.0011 0.0019" numOctaves="2" seed="53" result="field">
      <animate attributeName="baseFrequency" dur="59s" begin="0s" repeatCount="indefinite" values="0.0011 0.0019; 0.0014 0.0015; 0.0009 0.0023; 0.0011 0.0019"/>
    </feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="field" scale="44" xChannelSelector="R" yChannelSelector="G" result="soft">
      <animate attributeName="scale" dur="47s" repeatCount="indefinite" values="44; 58; 34; 44"/>
    </feDisplacementMap>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="53" stitchTiles="stitch" result="noise"/>
    <feColorMatrix in="noise" type="saturate" values="0" result="mono"/>
    <feComposite in="soft" in2="mono" operator="arithmetic" k1="0" k2="1" k3="0.26" k4="-0.13"/>
  </filter>

  <filter id="oj-liquid-b" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.0014 0.0031" numOctaves="2" seed="43" result="field">
      <animate attributeName="baseFrequency" dur="27s" begin="-9s" repeatCount="indefinite" values="0.0014 0.0031; 0.0019 0.0024; 0.0010 0.0038; 0.0016 0.0028; 0.0014 0.0031"/>
    </feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="field" scale="150" xChannelSelector="R" yChannelSelector="G" result="wave">
      <animate attributeName="scale" dur="29s" repeatCount="indefinite" values="150; 194; 118; 168; 150"/>
    </feDisplacementMap>
    <feTurbulence type="fractalNoise" baseFrequency="0.0011 0.0022" numOctaves="2" seed="60" result="field2">
      <animate attributeName="baseFrequency" dur="37s" begin="-14s" repeatCount="indefinite" values="0.0011 0.0022; 0.0014 0.0017; 0.0008 0.0027; 0.0012 0.0020; 0.0011 0.0022"/>
    </feTurbulence>
    <feDisplacementMap in="wave" in2="field2" scale="90" xChannelSelector="G" yChannelSelector="B" result="swell">
      <animate attributeName="scale" dur="37s" repeatCount="indefinite" values="90; 118; 72; 102; 90"/>
    </feDisplacementMap>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="43" stitchTiles="stitch" result="noise"/>
    <feColorMatrix in="noise" type="saturate" values="0" result="mono"/>
    <feComposite in="swell" in2="mono" operator="arithmetic" k1="0" k2="1" k3="0.34" k4="-0.17"/>
  </filter>
</svg>'''

def build_article_html(article, all_articles):
    slug = article.get('slug')
    title = article.get('title')
    subtitle = article.get('subtitle')
    tag = article.get('tag', 'Разбор')
    badge_key = article.get('badge', 'badge-guides')
    shelf_class = SHELF_MAP.get(badge_key, 'rs-guides')
    badge_icon = SVG_BADGES.get(badge_key, '')
    category = article.get('category', 'Разбор')
    format_label = article.get('format', 'PDF')
    date_str = article.get('date', '')
    read_time = article.get('readTime', '5 мин')
    version = article.get('version', 'v1.0')
    author = article.get('author', 'Гор Оганнисян')
    author_handle = article.get('authorHandle', '@gorogannisan')
    author_url = article.get('authorUrl', 'https://gorogannisan.site')
    author_avatar = article.get('authorAvatar', 'assets/gor.webp')
    
    # Apps
    apps = article.get('apps', [])
    apps_html = ''.join([f'<span class="rs-app">{a}</span>' for a in apps])
    
    # TOC
    toc_list = article.get('toc', [])
    toc_html = ''.join([f'<li><a href="#{item["id"]}"><span>{item["title"]}</span></a></li>' for item in toc_list])
    
    # Content
    content_html = article.get('content_html', '')
    
    # Other articles for .rs-more
    other_articles = [a for a in all_articles if a.get('slug') != slug][:3]
    more_cards = []
    for oa in other_articles:
        obadge = oa.get('badge', 'badge-guides')
        oicon = SVG_BADGES.get(obadge, '')
        more_cards.append(f'''<li><a class="rs-item" href="{oa.get('slug')}.html">
  <span class="rs-item-tags"><span class="resource-badge {obadge}">{oicon}{oa.get('category', 'Статья')}</span></span>
  <span class="rs-item-t">{oa.get('title')}</span>
  <span class="rs-item-p">{oa.get('subtitle')}</span>
  <span class="rs-item-u">gorogannisan.site · {oa.get('readTime')}</span>
</a></li>''')
    more_html = '\n'.join(more_cards)

    page = f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light only">
<title>{title} | gorogannisan</title>
<meta name="description" content="{subtitle}">
<meta name="author" content="{author}">
<link rel="icon" href="logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="article-bundle.css">
</head>
<body>

{LIQUID_SVG}

<nav class="nv-nav" aria-label="Primary">
  <a class="nv-brand" href="index.html">gor</a>
  <div class="nv-links">
    <a class="nv-link" href="index.html">Главная</a>
    <a class="nv-link" href="about.html">Обо мне</a>
    <a aria-current="page" class="nv-link" href="library.html">Библиотека</a>
    <a class="nv-link nv-link-cta" href="contact.html">Обсудить проект</a>
  </div>
  <details class="nv-menu">
    <summary class="nv-menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="nv-orbs">
      <svg class="nv-menu-glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path class="nv-mg-a" d="M2.5 5.5h11"/><path class="nv-mg-b" d="M2.5 10.5h11"/></svg>
    </summary>
    <div class="nv-menu-panel" id="nv-orbs">
      <ul class="nv-items">
        <li><a class="nv-item" href="index.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><span>Главная</span></a></li>
        <li><a class="nv-item" href="about.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg><span>Обо мне</span></a></li>
        <li><a aria-current="page" class="nv-item" href="library.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7v13a2 2 0 0 0-2-2H4z"/><path d="M20 4.5h-5.5A2.5 2.5 0 0 0 12 7v13a2 2 0 0 1 2-2h6z"/></svg><span>Библиотека</span></a></li>
      </ul>
      <div class="nv-drop-cta">
        <a class="nv-drop-btn" href="contact.html">Обсудить проект</a>
      </div>
    </div>
  </details>
</nav>

<main id="top" class="rs {shelf_class} rs-deck" data-slug="{slug}">

<header class="rs-head">
<div class="wrap">
  <div class="rs-tags">
    <nav class="rs-crumbs pg-eyebrow" aria-label="Breadcrumb">
      <a href="library.html">Библиотека</a>
      <span aria-hidden="true">/</span>
    </nav>
    <a class="resource-badge {badge_key}" href="library.html">
      {badge_icon}
      {category}
    </a>
    <span class="resource-badge badge-file">{format_label}</span>
  </div>
  <h1 class="pg-h1 rs-h1">{title}</h1>
  <p class="pg-lede">{subtitle}</p>
  <p class="rs-meta">
    <span>Автор: <a href="about.html" rel="author">{author}</a></span>
    <i aria-hidden="true">·</i>
    <span>{date_str}</span>
    <i aria-hidden="true">·</i>
    <span>{version}</span>
    <i aria-hidden="true">·</i>
    <span>{read_time}</span>
  </p>
  <div class="rs-hosts" style="display:flex;flex-wrap:wrap;gap:16px 36px;align-items:center;margin:28px 0 4px">
    <div style="display:flex;align-items:center;gap:14px">
      <img src="{author_avatar}" alt="{author}" width="52" height="52" decoding="async" style="width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none;box-shadow:0 4px 14px rgba(29,29,34,.16)">
      <div style="display:flex;flex-direction:column;gap:4px">
        <span style="font:400 19px/1.2 var(--sans);color:var(--ink)">{author}</span>
        <span style="display:flex;flex-wrap:gap;gap:4px 12px">
          <a href="https://t.me/gorogannisan" target="_blank" rel="noreferrer" style="font:400 13px/1.3 var(--mono);color:var(--ink-3);text-decoration:none">{author_handle}</a>
          <a href="{author_url}" target="_blank" rel="noreferrer" style="font:600 13px/1.3 var(--mono);color:var(--indigo);text-decoration:none">gorogannisan.site</a>
        </span>
      </div>
    </div>
  </div>
  <div class="rs-apps">
    <span class="rs-apps-k">Стек</span>
    {apps_html}
  </div>
  <div class="rs-actions">
    <a class="rs-btn rs-btn-primary" href="contact.html">Обсудить проект</a>
    <a class="rs-btn rs-btn-secondary" href="https://t.me/gorogannisan" target="_blank" rel="noreferrer">Telegram @gorogannisan</a>
  </div>
</div>
</header>

<div class="wrap">
<div class="rs-grid">
<article class="rs-article">
{content_html}
</article>

<aside class="rs-toc" aria-label="На этой странице">
  <div class="rs-toc-in">
    <p class="rs-toc-h">На этой странице</p>
    <ol>
      {toc_html}
    </ol>
    <div class="rs-toc-foot">
      <a class="rs-btn rs-btn-secondary rs-btn-sm" href="library.html">← Все статьи</a>
    </div>
  </div>
</aside>
</div>

<section class="rs-end" aria-label="Связь и рассылка">
  <div class="rs-door">
    <div class="fg-copy">
      <div class="fg-page-dots" aria-hidden="true">
        <span class="fg-page-dot fg-page-dot-red"></span>
        <span class="fg-page-dot fg-page-dot-yellow"></span>
        <span class="fg-page-dot fg-page-dot-green"></span>
      </div>
      <h2 class="fg-h">Разработка и архитектура</h2>
      <p class="fg-p">Помогу спроектировать надежную архитектуру, быстро собрать MVP или автоматизировать процессы разработки.</p>
      <a class="rs-btn rs-btn-onblue" href="contact.html">Обсудить проект</a>
    </div>
  </div>
  <div class="rs-card">
    <p class="rs-card-k">Канал & Рассылка</p>
    <h2 class="rs-card-h">Новые разборы первыми</h2>
    <p class="rs-card-p">Новые кейсы, архитектурные рецепты и код выходят без спама. Прямо в ваш Telegram или на почту.</p>
    <form class="rs-form" onsubmit="event.preventDefault(); window.open('https://t.me/gorogannisan', '_blank');">
      <input class="rs-field" type="email" placeholder="you@company.com" aria-label="Email">
      <button type="submit" class="rs-btn rs-btn-primary">Подписаться</button>
    </form>
    <p class="rs-note">Или сразу в Telegram: <a href="https://t.me/gorogannisan" target="_blank" style="color:var(--indigo);text-decoration:underline;">@gorogannisan</a></p>
  </div>
</section>

<section class="rs-more" aria-labelledby="rs-more-h">
  <div class="rs-more-head">
    <h2 class="rs-more-h" id="rs-more-h">Еще из библиотеки</h2>
    <a class="rs-more-all" href="library.html">Все материалы</a>
  </div>
  <ul class="rs-more-list">
    {more_html}
  </ul>
</section>
</div>

<footer class="ft" id="footer">
  <div class="ft-sky" aria-hidden="true">
    <i style="--h:86%;--d:0s"></i>
    <i style="--h:72%;--d:-7s"></i>
    <i style="--h:95%;--d:-13s"></i>
    <i style="--h:67%;--d:-3s"></i>
    <i style="--h:79%;--d:-19s"></i>
    <i style="--h:64%;--d:-9s"></i>
    <i style="--h:91%;--d:-24s"></i>
    <i style="--h:70%;--d:-5s"></i>
    <i style="--h:100%;--d:-16s"></i>
    <i style="--h:66%;--d:-11s"></i>
    <i style="--h:83%;--d:-21s"></i>
    <i style="--h:74%;--d:-2s"></i>
    <i style="--h:97%;--d:-14s"></i>
    <i style="--h:68%;--d:-8s"></i>
    <i style="--h:88%;--d:-26s"></i>
    <i style="--h:76%;--d:-4s"></i>
    <i style="--h:93%;--d:-18s"></i>
    <i style="--h:65%;--d:-12s"></i>
    <i style="--h:90%;--d:-6s"></i>
    <i style="--h:99%;--d:-22s"></i>
    <i style="--h:81%;--d:-10s"></i>
    <i style="--h:71%;--d:-15s"></i>
  </div>
  <div class="ft-grain" aria-hidden="true"></div>

  <div class="wrap ft-in">
    <h2 class="ft-h">Built for people<br>with actual work to do</h2>

    <div class="ft-cols">
      <nav class="ft-col" aria-label="Site">
        <span class="ft-lab">Навигация</span>
        <a href="index.html">Главная</a>
        <a href="about.html">Обо мне</a>
        <a href="index.html#projects">Проекты</a>
        <a href="library.html">Библиотека</a>
        <a href="contact.html">Контакты</a>
      </nav>
      <div class="ft-col">
        <span class="ft-lab">Связь</span>
        <a href="contact.html">Обсудить проект</a>
        <a href="https://t.me/gorogannisan" target="_blank" rel="noopener">Telegram @gorogannisan</a>
        <a href="mailto:gorogannisan641@gmail.com">gorogannisan641@gmail.com</a>
      </div>
      <nav class="ft-col ft-col-else" aria-label="Elsewhere">
        <span class="ft-lab">Соцсети</span>
        <a class="ft-el" href="https://t.me/gorogannisan" target="_blank" rel="noopener"><span class="ft-el-t">Telegram</span></a>
        <a class="ft-el" href="https://github.com/gorogannisan" target="_blank" rel="noopener"><span class="ft-el-t">GitHub</span></a>
      </nav>
      <div class="ft-col ft-col-status">
        <span class="ft-lab">Статус</span>
        <p class="ft-p" style="font-family: var(--mono); font-size: 13px; color: var(--ink-2); line-height: 1.6; margin: 0;">Открыт к новым проектам. Отвечаю в день обращения.</p>
      </div>
    </div>

    <div class="ft-foot">
      <nav class="ft-marks" aria-label="Elsewhere">
        <a class="ft-el ft-mark" aria-label="Telegram" href="https://t.me/gorogannisan" target="_blank" rel="noopener"><span class="ft-el-t">Telegram</span></a>
        <a class="ft-el ft-mark" aria-label="GitHub" href="https://github.com/gorogannisan" target="_blank" rel="noopener"><span class="ft-el-t">GitHub</span></a>
      </nav>
      <a class="ft-pill" href="contact.html">Обсудить проект</a>
      <span class="ft-fine">gorogannisan · gorogannisan.site</span>
    </div>
  </div>
</footer>
</main>

<script src="scripts/article.js"></script>
</body>
</html>'''
    return page

for article in articles_data:
    slug = article['slug']
    html_page = build_article_html(article, articles_data)
    out_path = f"{slug}.html"
    with open(out_path, 'w', encoding='utf-8') as out:
        out.write(html_page)
    print(f"Compiled article: {out_path} ({len(html_page)} chars)")

print("All articles successfully compiled.")
