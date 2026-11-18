"""Generate the light-mode stylesheet for the TechClean schedule from its own (dark) stylesheet.
Every rule that sets a dark background / grey text / border gets a `body.light …` twin with the
colour mapped to its light-theme equivalent. Saturated job / class colours are left alone.
Run after any CSS change:  python3 gen_light.py /home/claude/build/index.html
The JS side (lightFix) applies the same mapping to inline styles and SVG fills at run time."""
import sys, re, colorsys, tinycss2

P = sys.argv[1]
src = open(P, encoding='utf-8').read()
START, END = '<style id="light-css">', '</style><!--/light-css-->'
if START in src:
    a = src.index(START); b = src.index(END) + len(END); src = src[:a] + src[b:]
css = src[src.index('<style>') + 7: src.index('</style>')]

HEX = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
RGBA = re.compile(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)')

def to_rgb(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def hexs(r, g, b): return '#%02X%02X%02X' % tuple(max(0, min(255, round(x * 255))) for x in (r, g, b))

def map_rgb(rgb, kind, alpha=1.0):
    """kind: bg | border | text. Returns (rgb, alpha)."""
    r, g, b = rgb
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    white = (r, g, b) == (1, 1, 1); black = (r, g, b) == (0, 0, 0)
    if alpha < 1 and white:            # translucent white tints → translucent black
        return (0, 0, 0), min(1, alpha * (0.9 if kind == 'bg' else 1.3))
    if alpha < 1 and black:            # dark overlays / shadows → much lighter
        return (0, 0, 0), alpha * (0.35 if kind == 'bg' else 0.6)
    if alpha < 1: return rgb, alpha    # coloured tints: keep
    grey = s < 0.2 or l < 0.12
    if kind == 'bg':
        if grey and l < 0.45: nl = 1 - l * 0.55; return colorsys.hls_to_rgb(h, nl, min(s, 0.08)), alpha
        if not grey and l < 0.3: return colorsys.hls_to_rgb(h, 0.92, min(s, 0.55)), alpha
        return rgb, alpha
    if kind == 'border':
        if grey and l < 0.5: nl = max(0.62, 1 - l * 1.15); return colorsys.hls_to_rgb(h, nl, min(s, 0.08)), alpha
        if not grey and l < 0.3: return colorsys.hls_to_rgb(h, 0.75, min(s, 0.55)), alpha
        return rgb, alpha
    # text / fill
    if grey:
        if l >= 0.4: nl = max(0.1, min(0.55, 1.02 - l * 0.95)); return colorsys.hls_to_rgb(h, nl, s), alpha
        return rgb, alpha
    if l > 0.55 or (0.10 < h < 0.30 and l > 0.3): return colorsys.hls_to_rgb(h, 0.32, min(1, s)), alpha
    return rgb, alpha

def map_value(v, kind):
    def hx(m):
        rgb, a = map_rgb(to_rgb(m.group(0)), kind); return hexs(*rgb)
    def rg(m):
        r, g, b = (int(m.group(i)) / 255 for i in (1, 2, 3)); a = float(m.group(4)) if m.group(4) else 1.0
        rgb, a2 = map_rgb((r, g, b), kind, a)
        R, G, B = (round(x * 255) for x in rgb)
        return f'rgba({R},{G},{B},{round(a2, 3)})' if m.group(4) else hexs(*rgb)
    return RGBA.sub(rg, HEX.sub(hx, v))

def kind_of(prop):
    if prop in ('color', 'fill', 'caret-color', 'stroke', '-webkit-text-fill-color'): return 'text'
    if prop.startswith('border') or prop.startswith('outline') or prop == 'box-shadow' and False: return 'border'
    if prop.startswith('background') or prop == 'box-shadow': return 'bg'
    return None

def var_kind(name):
    n = name.lower()
    if any(k in n for k in ('bg', 'surface', 'panel', 'navy')): return 'bg'
    if 'border' in n: return 'border'
    if any(k in n for k in ('text', 'muted', 'white')): return 'text'
    return None

def saturated_bg(decls):
    for name, val in decls:
        if name in ('background', 'background-color'):
            m = HEX.search(val)
            if m:
                h, l, s = colorsys.rgb_to_hls(*to_rgb(m.group(0)))
                if s > 0.35 and 0.25 < l < 0.85: return True
            if 'var(--c-orange' in val or 'var(--c-lime' in val or 'var(--c-red' in val or 'var(--c-green' in val: return True
    return False

def prefix(sel):
    out = []
    for s in sel.split(','):
        s = s.strip()
        if not s: continue
        if s.startswith(':root'): out.append('body.light' + s[5:])
        elif s.startswith('html'): out.append(s.replace('html', 'html body.light', 1) if ' ' in s else 'body.light')
        elif re.match(r'body\b', s): out.append('body.light' + s[4:])
        else: out.append('body.light ' + s)
    return ', '.join(out)

def rules_to_css(rules):
    out = []
    for r in rules:
        if r.type == 'qualified-rule':
            sel = tinycss2.serialize(r.prelude).strip()
            decls = [d for d in tinycss2.parse_declaration_list(r.content, skip_whitespace=True, skip_comments=True) if d.type == 'declaration']
            pairs = [(d.lower_name, tinycss2.serialize(d.value).strip()) for d in decls]
            satbg = saturated_bg(pairs)
            new = []
            for d, (name, val) in zip(decls, pairs):
                k = var_kind(name) if name.startswith('--') else kind_of(name)
                if not k or not (HEX.search(val) or RGBA.search(val)): continue
                if k == 'text' and satbg: continue
                nv = map_value(val, k)
                if nv != val: new.append(f'{name}:{nv}{" !important" if d.important else ""}')
            if new: out.append(f'{prefix(sel)}{{{";".join(new)}}}')
        elif r.type == 'at-rule' and r.lower_at_keyword == 'media' and r.content:
            inner = rules_to_css(tinycss2.parse_rule_list(r.content, skip_whitespace=True, skip_comments=True))
            if inner: out.append(f'@media {tinycss2.serialize(r.prelude).strip()}{{{inner}}}')
    return '\n'.join(out)

light = rules_to_css(tinycss2.parse_stylesheet(css, skip_whitespace=True, skip_comments=True))
# hand-tuned extras on top of the generated rules
light += """
body.light{color-scheme:light}
body.light .bd-day{background:#FFFFFF}
body.light .bd-day.wknd{background:#F1F2F4}
body.light .bd-day.past{background:#F6F7F8}
body.light .rs-grid tbody td{background:#FFFFFF}
body.light .rs-grid tbody td.nm{background:#F6F7F8}
body.light .rs-grid tbody tr:hover td{background:#F1F4E6}
body.light #cal-table tbody td.td-date{background:#FFFFFF}
body.light #cal-table tbody td.td-date.td-sat,body.light #cal-table tbody td.td-date.td-sun{background:#F1F2F4}
body.light .wk-row th.alt{background:#ECEEF0!important}
body.light .bd-wkbar em.now,body.light .wk-row em.now{background:rgba(122,146,0,.15);color:#5C6E00}
body.light .bd-wkbar.now{border-top-color:#7A9200}
body.light select,body.light input,body.light textarea{color-scheme:light}
body.light #theme-btn{background:#FFFFFF}
body.light #version-tag{color:#4A5560!important;background:#E4E6E9!important}
"""
block = START + '\n' + light + '\n' + END
i = src.index('</style>') + len('</style>')
src = src[:i] + '\n' + block + src[i:]
open(P, 'w', encoding='utf-8').write(src)
print('light rules:', light.count('{'))
