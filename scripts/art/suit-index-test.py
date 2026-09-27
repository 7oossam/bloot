import os, json, base64, urllib.request, concurrent.futures as cf
KEY = os.environ["OPENROUTER_API_KEY"]
def durl(p): return 'data:image/jpeg;base64,' + base64.b64encode(open(p,'rb').read()).decode()
P = """Image 1 is a finished King playing card. Edit it with two changes and keep everything else exactly the same.
1. Background colour: every flat teal area of the card (the field behind the king inside the frame, the gap between the two frame lines, the margin outside the frame and the two stepped corner areas) becomes {bg}. Same flat colour with the same subtle print grain. Keep the king, his clothes, the flowers, the gold sun disc and the gold frame exactly as they are, clearly readable against the new colour.
2. Card index: inside the empty stepped corner area at the top-left (outside the frame), draw a large capital letter K in an elegant classical Roman serif (like Trajan or Cinzel), gold with a thin dark ink outline, filling most of the width of that corner area; directly below it draw a {suit} of about the same width. Draw exactly the same K and {suit_short} in the bottom-right stepped corner area, rotated 180 degrees (upside down). They sit centred in the corner areas and do not touch the frame lines or the card edge.
The letter must be a correct, clean capital K. No other text, letters or numbers anywhere."""
TESTS = {
 'H-K': ('m_H-K.jpg', 'a deep burgundy red (#5E1F24)', 'heart symbol, bright red with a thin gold outline and a dark ink edge', 'heart'),
 'S-K': ('m_S-K.jpg', 'a deep navy indigo (#1C2B4A)', 'spade symbol, cream-white with a thin gold outline and a dark ink edge', 'spade'),
}
def run(k):
    img,bg,suit,short = TESTS[k]
    body = {'model':'openai/gpt-image-2.5-flare','aspect_ratio':'2:3','quality':'max','n':2,
            'prompt':P.format(bg=bg,suit=suit,suit_short=short),'input_references':[{'type':'image_url','image_url':{'url':durl(img)}}]}
    req = urllib.request.Request('https://openrouter.ai/api/v1/images', data=json.dumps(body).encode(), headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}, method='POST')
    try: d = json.load(urllib.request.urlopen(req, timeout=900))
    except urllib.error.HTTPError as e: return k, f'HTTP {e.code} {e.read().decode()[:300]}'
    for i,im in enumerate(d['data']): open(f't_{k}_{i}.png','wb').write(base64.b64decode(im['b64_json']))
    return k, 'ok %d cost=%s' % (len(d['data']), d['usage']['cost'])
with cf.ThreadPoolExecutor(2) as ex:
    for k, r in ex.map(run, list(TESTS)): print(k, r)
