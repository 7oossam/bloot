import os, json, base64, urllib.request, concurrent.futures as cf
KEY = os.environ["OPENROUTER_API_KEY"]
def durl(p): return 'data:image/jpeg;base64,' + base64.b64encode(open(p,'rb').read()).decode()
P = """Image 1 is a finished King playing card. Edit it and keep the illustration exactly the same.
1. Everything outside the outer gold frame line becomes plain clean white paper (#FAF7F0, a very subtle paper grain): the card margin all around and the two stepped corner areas at the top-left and bottom-right. Everything inside the outer gold frame line (the band between the two gold lines and the whole field behind the king) stays {bg} exactly as now.
2. The card index in the two white stepped corner areas: the capital letter K in the same elegant classical Roman serif, now in {ink} with a thin gold outline, and the {suit} directly below it, {suitcol} with a thin gold outline. The same K and {short} in the bottom-right white corner area, the whole group rotated 180 degrees (upside down: the {short} above the K, both upside down). Centred in the corner areas, not touching the frame or the card edge.
Keep the king, clothes, flowers, gold sun disc, the double gold frame with its two steps (continuous lines) and the ink drawing style exactly as in image 1. No other text, letters or numbers."""
TESTS = {
 'H-K': ('w_in_H-K_0.jpg','deep burgundy red','deep crimson red','heart symbol','deep crimson red','heart'),
 'S-K': ('w_in_S-K_0.jpg','deep navy indigo','deep navy indigo','spade symbol','deep navy indigo','spade'),
}
def run(k):
    img,bg,ink,suit,suitcol,short = TESTS[k]
    body = {'model':'openai/gpt-image-2.5-flare','aspect_ratio':'2:3','quality':'max','n':2,
            'prompt':P.format(bg=bg,ink=ink,suit=suit,suitcol=suitcol,short=short),'input_references':[{'type':'image_url','image_url':{'url':durl(img)}}]}
    req = urllib.request.Request('https://openrouter.ai/api/v1/images', data=json.dumps(body).encode(), headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}, method='POST')
    try: d = json.load(urllib.request.urlopen(req, timeout=900))
    except urllib.error.HTTPError as e: return k, f'HTTP {e.code} {e.read().decode()[:300]}'
    for i,im in enumerate(d['data']): open(f'w_{k}_{i}.png','wb').write(base64.b64decode(im['b64_json']))
    return k, 'ok %d cost=%s' % (len(d['data']), d['usage']['cost'])
with cf.ThreadPoolExecutor(2) as ex:
    for k, r in ex.map(run, list(TESTS)): print(k, r)
