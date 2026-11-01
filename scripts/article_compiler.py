import os
import glob
import re
import json

def parse_frontmatter(text):
    if not text.startswith('---'):
        return {}, text
    parts = text.split('---', 2)
    if len(parts) < 3:
        return {}, text
    fm_raw = parts[1]
    body = parts[2].strip()
    
    fm = {}
    current_key = None
    for line in fm_raw.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith('- ') and current_key:
            if not isinstance(fm[current_key], list):
                fm[current_key] = []
            fm[current_key].append(line[2:].strip())
        elif ':' in line:
            k, v = line.split(':', 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if v:
                fm[k] = v
            else:
                fm[k] = []
            current_key = k
    return fm, body

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9а-яё\- ]', '', text)
    text = re.sub(r'\s+', '-', text)
    # Russian transliteration for clean anchor IDs
    ru_map = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z',
        'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
        'с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch',
        'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
    }
    res = ''
    for ch in text:
        res += ru_map.get(ch, ch)
    return res.strip('-')

def render_extended_markdown(body):
    toc = []
    
    # 1. Custom block: :::flow
    def replace_flow(match):
        lines = match.group(1).strip().splitlines()
        steps_html = []
        for line in lines:
            line = line.strip()
            if line.startswith('- '):
                line = line[2:]
            parts = [p.strip() for p in line.split('|')]
            num = parts[0] if len(parts) > 0 else '01'
            title = parts[1] if len(parts) > 1 else ''
            desc = parts[2] if len(parts) > 2 else ''
            steps_html.append(f'''<li class="rv-step">
  <span class="rv-step-k"><span class="rv-step-n">{num}</span></span>
  <b class="rv-step-t">{title}</b>
  <span class="rv-step-p">{desc}</span>
</li>''')
        return f'<ol class="rv rv-flow">\n' + '\n'.join(steps_html) + '\n</ol>'

    body = re.sub(r':::flow\s*\n(.*?)\n:::', replace_flow, body, flags=re.DOTALL)

    # 2. Custom block: :::hub [Center Name] [Center Subtitle]
    def replace_hub(match):
        header = match.group(1).strip()
        h_match = re.findall(r'\[(.*?)\]', header)
        hub_name = h_match[0] if len(h_match) > 0 else "Hub"
        hub_note = h_match[1] if len(h_match) > 1 else "Architecture"
        
        lines = match.group(2).strip().splitlines()
        spokes = []
        for line in lines:
            line = line.strip()
            if line.startswith('- '):
                line = line[2:]
            parts = [p.strip() for p in line.split('|')]
            spoke_title = parts[0] if len(parts) > 0 else ''
            spoke_desc = parts[1] if len(parts) > 1 else ''
            spokes.append((spoke_title, spoke_desc))
            
        n = max(len(spokes), 1)
        wire_paths = []
        for i in range(n):
            y = ((i + 0.5) / n) * 100
            y_str = f"{y:.2f}"
            wire_paths.append(f'<path d="M0,50 C55,50 45,{y_str} 100,{y_str}"/>')
            
        spokes_html = []
        for st, sd in spokes:
            spokes_html.append(f'''<li class="rv-spoke">
  <span class="rv-spoke-t">
    <b>{st}</b>
    <span>{sd}</span>
  </span>
</li>''')

        return f'''<div class="rv rv-hub" role="img" aria-label="{hub_name} architecture">
  <div class="rv-hub-center">
    <span class="rv-hub-name">{hub_name}</span>
    <span class="rv-hub-note">{hub_note}</span>
  </div>
  <svg class="rv-hub-wires" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    {''.join(wire_paths)}
  </svg>
  <ol class="rv-hub-spokes">
    {chr(10).join(spokes_html)}
  </ol>
</div>'''

    body = re.sub(r':::hub\s*(.*?)\s*\n(.*?)\n:::', replace_hub, body, flags=re.DOTALL)

    # 3. Custom block: :::steps
    def replace_steps(match):
        raw = match.group(1).strip()
        lines = raw.splitlines()
        items = []
        cur_item = []
        for l in lines:
            m = re.match(r'^\d+\.\s*(.*)', l)
            if m:
                if cur_item:
                    items.append('\n'.join(cur_item))
                cur_item = [m.group(1)]
            else:
                cur_item.append(l)
        if cur_item:
            items.append('\n'.join(cur_item))
            
        lis = []
        for it in items:
            it_html = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', it)
            it_html = re.sub(r'`(.*?)`', r'<code>\1</code>', it_html)
            lis.append(f'<li>{it_html}</li>')
        return f'<ol class="rv-steps">\n' + '\n'.join(lis) + '\n</ol>'

    body = re.sub(r':::steps\s*\n(.*?)\n:::', replace_steps, body, flags=re.DOTALL)

    # 4. Code & Prompt blocks: ```prompt [Badge] / ```code [Badge] / ```lang
    def replace_code(match):
        spec = match.group(1).strip()
        code_content = match.group(2)
        badge_label = "Код"
        if '[' in spec and ']' in spec:
            badge_label = re.search(r'\[(.*?)\]', spec).group(1)
        elif spec.lower() in ['prompt', 'промпт']:
            badge_label = "Промпт"
        elif spec:
            badge_label = spec.upper()
            
        clean_code = code_content.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        return f'''<div class="rs-code">
  <div class="rs-code-bar">
    <span class="resource-badge badge-prompts">{badge_label}</span>
    <button type="button" class="rs-btn rs-btn-secondary rs-btn-sm" data-rs-copy>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path></svg>
      <span>Copy</span>
    </button>
  </div>
  <pre><code>{clean_code}</code></pre>
</div>'''

    body = re.sub(r'```([^\n]*)\n(.*?)\n```', replace_code, body, flags=re.DOTALL)

    # 5. Tables: markdown tables
    def replace_table(match):
        raw = match.group(0).strip()
        lines = [l.strip() for l in raw.splitlines() if l.strip()]
        if len(lines) < 2:
            return raw
        headers = [c.strip() for c in lines[0].strip('|').split('|')]
        # line 1 is separator |:---|
        rows = []
        for l in lines[2:]:
            cols = [c.strip() for c in l.strip('|').split('|')]
            rows.append(cols)
            
        def clean_cell(c):
            return re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', c)

        th_html = ''.join([f'<th>{clean_cell(h)}</th>' for h in headers])
        tr_html = []
        for r in rows:
            td_html = ''.join([f'<td>{clean_cell(c)}</td>' for c in r])
            tr_html.append(f'<tr>{td_html}</tr>')
            
        return f'''<div class="rs-table">
  <table>
    <thead><tr>{th_html}</tr></thead>
    <tbody>
      {chr(10).join(tr_html)}
    </tbody>
  </table>
</div>'''

    body = re.sub(r'(\|[^\n]+\|\n\|[\s\:\-\|]+\|\n(?:\|[^\n]+\|\n?)+)', replace_table, body)

    # 6. Headings
    def replace_h2(match):
        title = match.group(1).strip()
        hid = slugify(title)
        toc.append({'id': hid, 'title': title})
        return f'<h2 id="{hid}">{title}</h2>'

    body = re.sub(r'^##\s+(.+)$', replace_h2, body, flags=re.MULTILINE)

    def replace_h3(match):
        title = match.group(1).strip()
        return f'<h3>{title}</h3>'
    body = re.sub(r'^###\s+(.+)$', replace_h3, body, flags=re.MULTILINE)

    # 7. Blockquotes
    def replace_quote(match):
        content = match.group(1).strip()
        content = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', content)
        return f'<blockquote><p>{content}</p></blockquote>'
    body = re.sub(r'^>\s+(.+)$', replace_quote, body, flags=re.MULTILINE)

    # 8. Paragraphs & inline formatting
    # Preserve existing HTML blocks, wrap loose text lines in <p>
    blocks = body.split('\n\n')
    parsed_blocks = []
    for b in blocks:
        b = b.strip()
        if not b:
            continue
        if b.startswith('<') and (b.endswith('>') or b.endswith('</div>') or b.endswith('</ol>') or b.endswith('</blockquote>') or b.endswith('</h2>') or b.endswith('</h3>')):
            parsed_blocks.append(b)
        elif b.startswith('- '):
            lis = []
            for item in b.splitlines():
                if item.startswith('- '):
                    it_text = item[2:].strip()
                    it_text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', it_text)
                    it_text = re.sub(r'`(.*?)`', r'<code>\1</code>', it_text)
                    lis.append(f'<li>{it_text}</li>')
            parsed_blocks.append(f'<ul>\n' + '\n'.join(lis) + '\n</ul>')
        else:
            p_text = b
            p_text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', p_text)
            p_text = re.sub(r'\*(.*?)\*', r'<em>\1</em>', p_text)
            p_text = re.sub(r'`(.*?)`', r'<code>\1</code>', p_text)
            # Markdown links [text](url)
            p_text = re.sub(r'\[(.*?)\]\((.*?)\)', r'<a href="\2">\1</a>', p_text)
            parsed_blocks.append(f'<p>{p_text}</p>')

    rendered_html = '\n\n'.join(parsed_blocks)
    return rendered_html, toc

print("Article engine module compiled.")
