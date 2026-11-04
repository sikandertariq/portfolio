#!/usr/bin/env python3
"""Turn a clickable PowerPoint into a web course for courses/player.html.

    python3 tools/pptx_to_player.py deck.pptx slides_dir courses/<slug>

slides_dir holds two renders per slide, hidden slides included: NN.webp
(1920 wide) and NN@2x.webp (3840 wide, for full screen / retina). Writes courses/<slug>/course.json plus copies of the slide
images and audio. Reproduces what the deck does in slide show: hyperlink
buttons (incl. jumps to hidden slides), audio that auto-plays or plays when a
shape is clicked, looping / play-across-slides audio, and slide transitions
(as a crossfade; Morph can't be rebuilt from flat images).

Render slides from real PowerPoint (LibreOffice substitutes Calibri/Cambria and
mis-draws button text): unhide all slides, File > Save As PDF, then rasterize the
PDF with pypdfium2 at 3840 px and downscale to 1920 (WebP q92).
ehr-challenge: audio/media4.mp3 was a 1-hour loop; trimmed afterwards to 10 min:
    ffmpeg -i media4.mp3 -t 600 -af "afade=t=in:d=2,afade=t=out:st=596:d=4" -ac 1 -b:a 64k out.mp3
"""
import json, posixpath, re, shutil, sys, zipfile
import xml.etree.ElementTree as ET

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
JUMPS = {'nextslide': 'next', 'previousslide': 'prev', 'firstslide': 'first',
         'lastslide': 'last', 'lastslideviewed': 'back', 'endshow': 'end'}


def rels(z, part):
    d, f = posixpath.split(part)
    path = f'{d}/_rels/{f}.rels'
    if path not in z.namelist():
        return {}
    out = {}
    for r in ET.fromstring(z.read(path)).findall('rel:Relationship', NS):
        t = r.get('Target')
        if r.get('TargetMode') != 'External':
            t = posixpath.normpath(posixpath.join(d, t))
        out[r.get('Id')] = t
    return out


def first(el, *paths):
    return next((f for f in (el.find(p, NS) for p in paths) if f is not None), None)


def box_of(el):
    x = first(el, 'p:spPr/a:xfrm', 'p:grpSpPr/a:xfrm', 'p:xfrm')
    if x is None or x.find('a:off', NS) is None:
        return None
    o, e = x.find('a:off', NS), x.find('a:ext', NS)
    return [int(o.get('x')), int(o.get('y')), int(e.get('cx')), int(e.get('cy'))], x


def walk(tree, tf=lambda b: b):
    """Yield (element, box-in-slide-EMU) for every shape, applying group transforms."""
    for el in tree:
        if el.tag == '{%s}AlternateContent' % NS['mc']:
            branch = first(el, 'mc:Choice', 'mc:Fallback')
            yield from walk(branch if branch is not None else [], tf)
            continue
        if el.tag not in SHAPES:
            continue
        got = box_of(el)
        box = tf(got[0]) if got else None
        yield el, box
        if el.tag.endswith('}grpSp') and got:
            x = got[1]
            co, ce = x.find('a:chOff', NS), x.find('a:chExt', NS)
            if co is None or ce is None:
                continue
            cx, cy, cw, ch = int(co.get('x')), int(co.get('y')), int(ce.get('cx')) or 1, int(ce.get('cy')) or 1
            gx, gy, gw, gh = got[0]
            def child_tf(b, cx=cx, cy=cy, cw=cw, ch=ch, gx=gx, gy=gy, gw=gw, gh=gh, outer=tf):
                return outer([gx + (b[0] - cx) * gw / cw, gy + (b[1] - cy) * gh / ch,
                              b[2] * gw / cw, b[3] * gh / ch])
            yield from walk(el, child_tf)


def main(pptx, slides_dir, out):
    z = zipfile.ZipFile(pptx)
    pres = ET.fromstring(z.read('ppt/presentation.xml'))
    sz = pres.find('p:sldSz', NS)
    W, H = int(sz.get('cx')), int(sz.get('cy'))
    prels = rels(z, 'ppt/presentation.xml')
    order = [prels[s.get(R_ID)] for s in pres.findall('p:sldIdLst/p:sldId', NS)]
    index = {part: i for i, part in enumerate(order)}
    pct = lambda b: [round(b[0] / W * 100, 3), round(b[1] / H * 100, 3),
                     round(b[2] / W * 100, 3), round(b[3] / H * 100, 3)]

    shutil.rmtree(out, ignore_errors=True)
    for d in ('slides', 'audio'):
        shutil.os.makedirs(f'{out}/{d}', exist_ok=True)
    media_out = {}
    slides = []
    for i, part in enumerate(order):
        sld = ET.fromstring(z.read(part))
        srels = rels(z, part)
        shapes = list(walk(sld.find('p:cSld/p:spTree', NS)))
        by_id = {}
        links, audio_src = [], {}
        for el, box in shapes:
            nv = next((c for c in el if c.tag.endswith('Pr') and c.find('p:cNvPr', NS) is not None), None)
            c = nv.find('p:cNvPr', NS) if nv is not None else None
            if c is None or box is None:
                continue
            by_id[c.get('id')] = (box, c, el)
            af = nv.find('p:nvPr/a:audioFile', NS)
            if af is not None:
                # p14:media holds the embedded file; a:audioFile's link can be 'NULL'
                pm = nv.find('p:nvPr/p:extLst/p:ext/p14:media', NS)
                rid = pm.get('{%s}embed' % NS['r']) if pm is not None else af.get('{%s}link' % NS['r'])
                src = srels.get(rid)
                if src not in z.namelist():
                    continue
                if src not in media_out:
                    media_out[src] = f'audio/{posixpath.basename(src)}'
                    with open(f'{out}/{media_out[src]}', 'wb') as f:
                        f.write(z.read(src))
                audio_src[c.get('id')] = media_out.get(src)
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
            links.append({'box': pct(box), 'to': to,
                          'label': text or c.get('descr') or c.get('name')})

        # Audio: <p:audio> nodes give volume/loop/span; playFrom cmds say when they start.
        audio = {}
        for node in sld.iter('{%s}cMediaNode' % NS['p']):
            spid = node.find('p:tgtEl/p:spTgt', NS).get('spid')
            ctn = node.find('p:cTn', NS)
            if spid in audio_src:
                audio[spid] = {'src': audio_src[spid], 'vol': int(node.get('vol', 100000)) / 100000,
                               'loop': ctn.get('repeatCount') == 'indefinite',
                               'span': int(node.get('numSld', 1)), 'start': None}
        for seq in sld.iter('{%s}seq' % NS['p']):
            ctn = seq.find('p:cTn', NS)
            trig = ctn.find("p:stCondLst/p:cond[@evt='onClick']/p:tgtEl/p:spTgt", NS)
            for cmd in seq.iter('{%s}cmd' % NS['p']):
                spid = cmd.find('p:cBhvr/p:tgtEl/p:spTgt', NS).get('spid')
                if spid not in audio or not (cmd.get('cmd') or '').startswith(('playFrom', 'togglePause')):
                    continue
                if ctn.get('nodeType') == 'interactiveSeq' and trig is not None and trig.get('spid') in by_id:
                    links.append({'box': pct(by_id[trig.get('spid')][0]), 'play': audio[spid]['src'],
                                  'label': 'Play narration'})
                    audio[spid]['start'] = audio[spid]['start'] or 'click'
                elif ctn.get('nodeType') == 'mainSeq':
                    audio[spid]['start'] = 'auto'

        tr = sld.find('.//p:transition', NS)
        dur = 0
        if tr is not None:
            dur = int(tr.get('{%s}dur' % NS['p14']) or {'slow': 1000, 'med': 750, 'fast': 500}.get(tr.get('spd'), 700))
        img = f'slides/{i + 1:02}.webp'
        for name in (f'{i + 1:02}.webp', f'{i + 1:02}@2x.webp'):
            shutil.copy(f'{slides_dir}/{name}', f'{out}/slides/{name}')
        text = ' '.join(t.text.strip() for t in sld.iter('{%s}t' % NS['a']) if t.text and t.text.strip())
        slides.append({'image': img, 'hidden': sld.get('show') == '0', 'text': text,
                       'transition': min(dur, 1200),  # ponytail: crossfade stands in for Morph
                       'audio': [a for a in audio.values() if a['start']], 'links': links})

    with open(f'{out}/course.json', 'w') as f:
        json.dump({'aspect': W / H, 'slides': slides}, f, indent=1)
    print(f'{len(slides)} slides, {sum(len(s["links"]) for s in slides)} hotspots, {len(media_out)} audio files -> {out}')


if __name__ == '__main__':
    main(*sys.argv[1:4])
