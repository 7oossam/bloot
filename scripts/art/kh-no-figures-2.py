import json, base64, urllib.request, concurrent.futures as cf
import os
KEY=os.environ["OPENROUTER_API_KEY"]
BASE = """One single playing card shown flat, straight-on, filling the image, portrait 2:3, rounded corners, on a plain dark background.
Design quality: an award-winning modern designer playing-card deck by a top graphic designer. Bold, confident, minimal: a FEW large simple shapes, strong silhouette, generous negative space, clear hierarchy, perfect balance. Flat colour with no gradients, crisp vector-like edges, a subtle screen-print paper grain. NOT ornate, NOT busy, no small filler ornaments, no clip-art, no Victorian flourishes.
Absolutely no people, faces, hands, bodies, animals or birds - no living beings.
Corner index: top-left a bold condensed serif capital letter and a heart below it in the card's dark ink colour; the same in the bottom-right rotated 180 degrees. No other text or numbers."""
C = {
 "K_bold": """King of Hearts. Full-bleed deep crimson red card face with a thin cream inner border. Palette only: crimson, cream, burnished gold, near-black ink.
Double-ended court card: one big bold emblem of the king's regalia, drawn as large flat shapes - a tall white royal turban with a single gold jewel above a pair of crossed curved swords - and the same emblem rotated 180 degrees below, the two locking together through one large gold heart in the exact centre, like an interlocking graphic mark. Clean diagonal composition with lots of red negative space.""",
 "K_geo": """King of Hearts. Cream card stock. Palette only: crimson, deep teal, burnished gold, cream and near-black ink.
Double-ended court card built as a bold geometric architectural composition inside a rounded rectangle panel: flat interlocking blocks forming an Andalusian horseshoe arch and a dome, a white turban with a gold jewel set inside the arch like a crown, a curved sword running diagonally across the panel, simple stepped stairs and zellige star tiles as large pattern blocks. The composition is rotated 180 degrees for the lower half and joins seamlessly through a big heart roundel in the centre. Strong grid, thick even outlines, big shapes, mid-century modern poster feel.""",
 "A_geo": """Ace of Hearts. Cream card stock. Palette only: crimson, burnished gold, cream and near-black ink.
One large heart in the centre, and INSIDE the heart shape a bold simple geometric Andalusian motif: an eight-pointed zellige star with a small horseshoe arch, in flat blocks of crimson, gold and cream with thick even outlines. Everything else on the card is empty cream space. Elegant, minimal, iconic.""",
}
def run(k):
    body={'model':'openai/gpt-image-2.5-flare','aspect_ratio':'2:3','quality':'max','n':1,'prompt':BASE+"\n"+C[k]}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:200])
    open(f'{k}.png','wb').write(base64.b64decode(d['data'][0]['b64_json'])); return k,d['usage']['cost']
with cf.ThreadPoolExecutor(3) as ex:
    for k,r in ex.map(run,C): print(k,r)
