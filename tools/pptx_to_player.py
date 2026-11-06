#!/usr/bin/env python3
"""Turn a clickable PowerPoint into a web course for courses/player.html.

    python3 tools/pptx_to_player.py deck.pptx courses/<slug>

Needs macOS + Microsoft PowerPoint (renders the slides, so fonts match), and
pip packages lxml, numpy, pillow, pypdfium2; ffmpeg for trimming long audio.

Reproduces what the deck does in slide show:
  - hyperlink buttons, incl. jumps to hidden slides
  - click triggers that make shapes appear / disappear (each animated shape is
    rendered separately and cut out as a transparent layer)
  - audio that auto-plays or plays on click, looping, play-across-slides
  - slide transitions, as a crossfade (Morph can't be rebuilt from images)
"""
import copy, json, os, posixpath, re, shutil, subprocess, sys, tempfile, zipfile
import numpy as np
import pypdfium2
from lxml import etree
from PIL import Image

NS = {
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'p14': 'http://schemas.microsoft.com/office/powerpoint/2010/main',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
}
R_ID = '{%s}id' % NS['r']
SHAPES = {'{%s}%s' % (NS['p'], t) for t in ('sp', 'pic', 'grpSp', 'cxnSp', 'graphicFrame')}
ALT = '{%s}AlternateContent' % NS['mc']
JUMPS = {'nextslide': 'next', 'previousslide': 'prev', 'firstslide': 'first',
         'lastslide': 'last', 'lastslideviewed': 'back', 'endshow': 'end'}
RENDER_W = 3840
LONG_AUDIO = 900  # seconds; longer tracks are background loops, trimmed to 10 min


def first(el, *paths):
    return next((f for f in (el.find(p, NS) for p in paths) if f is not None), None)


def rels(z, part):
    d, f = posixpath.split(part)
    path = f'{d}/_rels/{f}.rels'
    if path not in z.namelist():
        return {}
    out = {}
    for r in etree.fromstring(z.read(path)).findall('rel:Relationship', NS):
        t = r.get('Target')
        if r.get('TargetMode') != 'External':
            t = posixpath.normpath(posixpath.join(d, t))
        out[r.get('Id')] = t
    return out


def walk(tree, tf=lambda b: b):
    """Yield (shape element, box in slide EMU) for every shape, applying group transforms."""
    for el in tree:
        if el.tag == ALT:
            branch = first(el, 'mc:Choice', 'mc:Fallback')
            yield from walk(branch if branch is not None else [], tf)
            continue
        if el.tag not in SHAPES:
            continue
        x = first(el, 'p:spPr/a:xfrm', 'p:grpSpPr/a:xfrm', 'p:xfrm')
        got = None
        if x is not None and x.find('a:off', NS) is not None:
            o, e = x.find('a:off', NS), x.find('a:ext', NS)
            got = [int(o.get('x')), int(o.get('y')), int(e.get('cx')), int(e.get('cy'))]
        yield el, (tf(got) if got else None)
        co = x.find('a:chOff', NS) if x is not None else None
        ce = x.find('a:chExt', NS) if x is not None else None
        if el.tag.endswith('}grpSp') and got and co is not None and ce is not None:
            cx, cy = int(co.get('x')), int(co.get('y'))
            cw, ch = int(ce.get('cx')) or 1, int(ce.get('cy')) or 1
            gx, gy, gw, gh = got
            def child_tf(b, outer=tf, cx=cx, cy=cy, cw=cw, ch=ch, gx=gx, gy=gy, gw=gw, gh=gh):
                return outer([gx + (b[0] - cx) * gw / cw, gy + (b[1] - cy) * gh / ch,
                              b[2] * gw / cw, b[3] * gh / ch])
            yield from walk(el, child_tf)


def cnvpr(el):
    return next((c.find('p:cNvPr', NS) for c in el
                 if c.tag.endswith('Pr') and c.find('p:cNvPr', NS) is not None), None)


def effects(sld):
    """Appear/disappear effects in document order: (trigger, 'entr'|'exit', spid).
    trigger is the clicked shape's spid, None for effects that run at slide start, or
    False for mainSeq click effects (fired by 'next' clicks; the decks use buttons, so
    these only count towards which shapes start hidden)."""
    out = []
    for seq in sld.iter('{%s}seq' % NS['p']):
        ctn = seq.find('p:cTn', NS)
        trig = ctn.find("p:stCondLst/p:cond[@evt='onClick']/p:tgtEl/p:spTgt", NS)
        interactive = ctn.get('nodeType') == 'interactiveSeq'
        for c in seq.iter('{%s}cTn' % NS['p']):
            cls = c.get('presetClass')
            tgt = c.find('.//p:spTgt', NS)
            if cls not in ('entr', 'exit') or tgt is None:
                continue
            if interactive:
                out.append((trig.get('spid') if trig is not None else False, cls, tgt.get('spid')))
            else:
                out.append((False if c.get('nodeType') == 'clickEffect' else None, cls, tgt.get('spid')))
    return out


def export_pdf(pptx, pdf):
    """Save as PDF with PowerPoint (sandboxed: work inside Office's group container)."""
    box = os.path.expanduser('~/Library/Group Containers/UBF8T346G9.Office/pptx_to_player')
    os.makedirs(box, exist_ok=True)
    src, dst = f'{box}/render.pptx', f'{box}/render.pdf'
    shutil.copy(pptx, src)
    if os.path.exists(dst):
        os.remove(dst)
    subprocess.run(['osascript', '-e', f'''
        tell application "Microsoft PowerPoint"
          open POSIX file "{src}"
          delay 5
          set p to presentation "render.pptx"
          save p in (POSIX file "{dst}" as string) as save as PDF
          close p saving no
        end tell'''], check=True)
    if not os.path.exists(dst):
        sys.exit(f'PowerPoint did not export {src}: open it in PowerPoint to see why')
    shutil.move(dst, pdf)


def build_render_deck(src_dir, order, plan):
    """Rewrite the unpacked deck for one PDF export: every slide visible, animated shapes
    removed from each base slide, and per animated shape three extra slides: only that
    shape on black and on white (where it covers), and base + that shape (its colours,
    with shapes in front of it, like text over a highlight, still in front).
    Returns the page list: (slide index, spid or None for the base, variant)."""
    def load(p):
        return etree.parse(f'{src_dir}/{p}')
    def save(t, p):
        t.write(f'{src_dir}/{p}', xml_declaration=True, encoding='UTF-8', standalone=True)
    def shape_of(root, spid):
        return next(c.getparent().getparent() for c in root.iter('{%s}cNvPr' % NS['p']) if c.get('id') == spid)

    def strip(tree, spids):
        for spid in spids:
            shape = shape_of(tree.getroot(), spid)
            if shape.getparent() is not None:
                shape.getparent().remove(shape)

    def isolate(tree, spid, color):
        root = tree.getroot()
        target = shape_of(root, spid)
        keep = {target, *target.iterancestors()}
        for el in list(root.find('p:cSld/p:spTree', NS).iter()):
            if (el.tag in SHAPES or el.tag == ALT) and el not in keep \
                    and target not in el.iterancestors() and el.getparent() is not None:
                el.getparent().remove(el)
        csld = root.find('p:cSld', NS)
        for bg in csld.findall('p:bg', NS):
            csld.remove(bg)
        csld.insert(0, etree.fromstring(
            f'<p:bg xmlns:p="{NS["p"]}" xmlns:a="{NS["a"]}"><p:bgPr><a:solidFill><a:srgbClr val="{color}"/>'
            '</a:solidFill><a:effectLst/></p:bgPr></p:bg>'))
        root.set('showMasterSp', '0')  # no layout/master decoration either

    pres, prels, ct = load('ppt/presentation.xml'), load('ppt/_rels/presentation.xml.rels'), load('[Content_Types].xml')
    lst = pres.getroot().find('p:sldIdLst', NS)
    for s in list(lst):
        lst.remove(s)
    for rel in list(prels.getroot()):  # re-added below, one per page
        if rel.get('Type').endswith('/slide'):
            prels.getroot().remove(rel)
    pages, n_file = [], 1000

    for i, part in enumerate(order):
        animated = plan[i]
        tree = load(part)
        tree.getroot().attrib.pop('show', None)
        timing = tree.getroot().find('p:timing', NS)  # a static render needs no animations,
        if timing is not None:                         # and they'd point at removed shapes
            tree.getroot().remove(timing)
        for spid, variant in [(None, None)] + [(a, v) for a in animated for v in ('000000', 'FFFFFF', 'with')]:
            t = copy.deepcopy(tree)
            if spid is None:
                strip(t, animated)
            elif variant == 'with':
                strip(t, [a for a in animated if a != spid])
            else:
                isolate(t, spid, variant)
            if spid is None:
                target = part
            else:  # extra slide: same rels minus the notes page
                n_file += 1
                target = f'ppt/slides/slide{n_file}.xml'
                r = load(f'ppt/slides/_rels/{posixpath.basename(part)}.rels')
                for rel in list(r.getroot()):
                    if rel.get('Type').endswith('/notesSlide'):
                        r.getroot().remove(rel)
                save(r, f'ppt/slides/_rels/slide{n_file}.xml.rels')
                etree.SubElement(ct.getroot(), '{http://schemas.openxmlformats.org/package/2006/content-types}Override',
                                 PartName=f'/{target}',
                                 ContentType='application/vnd.openxmlformats-officedocument.presentationml.slide+xml')
            save(t, target)
            rid = f'rIdRender{len(pages)}'
            etree.SubElement(prels.getroot(), '{%s}Relationship' % NS['rel'], Id=rid, Target=target[4:],
                             Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide')
            etree.SubElement(lst, '{%s}sldId' % NS['p'], {'id': str(256 + len(pages)), R_ID: rid})
            pages.append((i, spid, variant))
    save(pres, 'ppt/presentation.xml')
    save(prels, 'ppt/_rels/presentation.xml.rels')
    save(ct, '[Content_Types].xml')
    return pages


def cutout(on_black, on_white, with_shape):
    """The shape as an RGBA layer: opaque where it covers (seen from its renders alone
    on black and on white), coloured from the slide render that includes it."""
    covers = (on_black.max(axis=2) > 3) | (on_white.min(axis=2) < 252)
    if not covers.any():
        return None, None
    ys, xs = np.where(covers)
    ya, yb, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([with_shape, covers.astype(np.uint8) * 255])[ya:yb, xa:xb]
    return Image.fromarray(rgba, 'RGBA'), [xa, ya, xb - xa, yb - ya]


def trim_long_audio(path):
    try:
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                    '-of', 'csv=p=0', path], capture_output=True, text=True).stdout)
    except (OSError, ValueError):
        return
    if dur > LONG_AUDIO:  # ponytail: a background bed nobody hears past 10 min
        tmp = path + '.tmp.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-t', '600', '-af',
                        'afade=t=in:d=2,afade=t=out:st=596:d=4', '-ac', '1', '-b:a', '64k', tmp], check=True)
        os.replace(tmp, path)


def main(pptx, out):
    z = zipfile.ZipFile(pptx)
    pres = etree.fromstring(z.read('ppt/presentation.xml'))
    sz = pres.find('p:sldSz', NS)
    W, H = int(sz.get('cx')), int(sz.get('cy'))
    prels = rels(z, 'ppt/presentation.xml')
    order = [prels[s.get(R_ID)] for s in pres.findall('p:sldIdLst/p:sldId', NS)]
    index = {part: i for i, part in enumerate(order)}
    pct = lambda b: [round(v / d * 100, 3) for v, d in zip(b, (W, H, W, H))]

    shutil.rmtree(out, ignore_errors=True)
    for d in ('slides', 'audio'):
        os.makedirs(f'{out}/{d}', exist_ok=True)

    media_out, slides, plan = {}, [], []
    for i, part in enumerate(order):
        sld = etree.fromstring(z.read(part))
        srels = rels(z, part)
        shapes, audio_src = {}, {}
        for pos, (el, box) in enumerate(walk(sld.find('p:cSld/p:spTree', NS))):
            c = cnvpr(el)
            if c is None or box is None:
                continue
            groups = [cnvpr(g).get('id') for g in el.iterancestors() if g.tag == '{%s}grpSp' % NS['p']]
            shapes[c.get('id')] = {'box': box, 'pos': pos, 'groups': groups}
            nv = c.getparent()
            af = nv.find('p:nvPr/a:audioFile', NS)
            if af is not None:
                # p14:media holds the embedded file; a:audioFile's link can be 'NULL'
                pm = nv.find('p:nvPr/p:extLst/p:ext/p14:media', NS)
                src = srels.get(pm.get('{%s}embed' % NS['r']) if pm is not None else af.get('{%s}link' % NS['r']))
                if src in z.namelist():
                    if src not in media_out:
                        media_out[src] = f'audio/{posixpath.basename(src)}'
                        with open(f'{out}/{media_out[src]}', 'wb') as f:
                            f.write(z.read(src))
                        trim_long_audio(f'{out}/{media_out[src]}')
                    audio_src[c.get('id')] = media_out[src]
            # link on the shape itself, else on its text (e.g. a "Continue" run)
            h = first(c, 'a:hlinkClick')
            if h is None and el.find('p:txBody', NS) is not None:
                h = el.find('p:txBody', NS).find('.//a:rPr/a:hlinkClick', NS)
            if h is None:
                continue
            act, rid = h.get('action') or '', h.get(R_ID)
            m = re.search(r'jump=(\w+)', act)
            if 'hlinksldjump' in act and srels.get(rid) in index:
                to = index[srels[rid]]
            elif m and m.group(1) in JUMPS:
                to = JUMPS[m.group(1)]
            elif not act and rid and srels.get(rid, '').startswith('http'):
                to = {'url': srels[rid]}
            else:
                continue
            text = ' '.join(t.text for t in el.iter('{%s}t' % NS['a']) if t.text).strip()
            shapes[c.get('id')]['link'] = {'to': to, 'label': text or c.get('descr') or c.get('name')}

        # Audio: <p:audio> nodes give volume/loop/span; playFrom cmds say when they start.
        audio = {}
        for node in sld.iter('{%s}cMediaNode' % NS['p']):
            tgt = node.find('p:tgtEl/p:spTgt', NS)
            spid = tgt.get('spid') if tgt is not None else None
            if spid in audio_src:
                audio[spid] = {'src': audio_src[spid], 'vol': int(node.get('vol', 100000)) / 100000,
                               'loop': node.find('p:cTn', NS).get('repeatCount') == 'indefinite',
                               'span': int(node.get('numSld', 1)), 'start': None}
        actions = {}  # clicked spid -> [{'show'|'hide'|'play': ...}] in timeline order
        for seq in sld.iter('{%s}seq' % NS['p']):
            ctn = seq.find('p:cTn', NS)
            trig = ctn.find("p:stCondLst/p:cond[@evt='onClick']/p:tgtEl/p:spTgt", NS)
            for cmd in seq.iter('{%s}cmd' % NS['p']):
                tgt = cmd.find('p:cBhvr/p:tgtEl/p:spTgt', NS)
                spid = tgt.get('spid') if tgt is not None else None
                if spid not in audio or not (cmd.get('cmd') or '').startswith(('playFrom', 'togglePause')):
                    continue
                if ctn.get('nodeType') == 'interactiveSeq' and trig is not None:
                    actions.setdefault(trig.get('spid'), []).append({'play': audio[spid]['src']})
                    audio[spid]['start'] = audio[spid]['start'] or 'click'
                elif ctn.get('nodeType') == 'mainSeq':
                    audio[spid]['start'] = 'auto'

        # Appear/disappear: a shape starts hidden if its first effect is an entrance
        initial, start_fx = {}, []
        for trig, cls, spid in effects(sld):
            if spid not in shapes:
                continue
            initial.setdefault(spid, cls == 'exit')
            step = {'show' if cls == 'entr' else 'hide': spid}
            if trig:
                actions.setdefault(trig, []).append(step)
            elif trig is None:
                start_fx.append(step)
        animated = sorted(initial, key=lambda s: shapes[s]['pos'])
        plan.append(animated)

        # Clickable areas, top-most shape last so it wins where they overlap
        links = []
        for spid in sorted((set(actions) | {s for s in shapes if 'link' in shapes[s]}) & set(shapes),
                           key=lambda s: shapes[s]['pos']):
            entry = {'box': pct(shapes[spid]['box'])}
            entry.update(shapes[spid].get('link', {}))
            if spid in actions:
                entry['actions'] = actions[spid]
                entry.setdefault('label', 'Play narration' if all('play' in a for a in actions[spid]) else 'Select')
            gate = [g for g in [spid] + shapes[spid]['groups'] if g in initial]
            if gate:
                entry['gate'] = gate  # clickable only while these shapes are showing
            links.append(entry)

        text = ' '.join(t.text.strip() for t in sld.iter('{%s}t' % NS['a']) if t.text and t.text.strip())
        tr = sld.find('.//p:transition', NS)
        dur = 0
        if tr is not None:
            dur = int(tr.get('{%s}dur' % NS['p14']) or {'slow': 1000, 'med': 750, 'fast': 500}.get(tr.get('spd'), 700))
        slides.append({'image': f'slides/{i + 1:02}.webp', 'hidden': sld.get('show') == '0', 'text': text,
                       'transition': min(dur, 1200),  # ponytail: crossfade stands in for Morph
                       'audio': [a for a in audio.values() if a['start']], 'links': links,
                       'overlays': [{'spid': s, 'visible': initial[s]} for s in animated],
                       'start': start_fx})

    # Render: one PowerPoint export covers every base slide and every animated shape
    with tempfile.TemporaryDirectory() as work:
        z.extractall(f'{work}/deck')
        pages = build_render_deck(f'{work}/deck', order, plan)
        with zipfile.ZipFile(f'{work}/render.pptx', 'w', zipfile.ZIP_DEFLATED) as rz:  # files only
            for root, _, files in os.walk(f'{work}/deck'):
                for f in files:
                    rz.write(f'{root}/{f}', os.path.relpath(f'{root}/{f}', f'{work}/deck'))
        export_pdf(f'{work}/render.pptx', f'{work}/render.pdf')
        pdf = pypdfium2.PdfDocument(f'{work}/render.pdf')
        assert len(pdf) == len(pages), f'PDF has {len(pdf)} pages, expected {len(pages)}'
        alone = {}
        for n, (i, spid, variant) in enumerate(pages):
            img = pdf[n].render(scale=RENDER_W / pdf[n].get_width()).to_pil().convert('RGB')
            if spid is None:
                img.save(f'{out}/slides/{i + 1:02}@2x.webp', quality=92, method=6)
                img.resize((1920, round(1920 * H / W)), Image.LANCZOS).save(
                    f'{out}/slides/{i + 1:02}.webp', quality=92, method=6)
                continue
            if variant != 'with':
                alone[i, spid, variant] = np.asarray(img)
                continue
            o = next(o for o in slides[i]['overlays'] if o['spid'] == spid)
            cut, box = cutout(alone.pop((i, spid, '000000')), alone.pop((i, spid, 'FFFFFF')), np.asarray(img))
            if cut is not None:
                o['src'] = f'slides/{i + 1:02}-{spid}.webp'
                o['box'] = [round(v / d * 100, 3) for v, d in zip(box, (img.width, img.height) * 2)]
                cut.save(f'{out}/{o["src"]}', lossless=True, method=6)

    with open(f'{out}/course.json', 'w') as f:
        json.dump({'aspect': W / H, 'slides': slides}, f, indent=1)
    print(f'{len(slides)} slides, {sum(len(s["links"]) for s in slides)} hotspots, '
          f'{sum(len(s["overlays"]) for s in slides)} overlays, {len(media_out)} audio files -> {out}')


if __name__ == '__main__':
    main(*sys.argv[1:3])
