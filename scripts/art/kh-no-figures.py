import json, base64, urllib.request, concurrent.futures as cf
import os
KEY=os.environ["OPENROUTER_API_KEY"]
COMMON = """A single playing card, the King of Hearts, for an Arabian-themed card game, shown flat and straight-on, filling the whole image, portrait 2:3, with rounded corners on a plain dark background.
Style: a modern premium designer playing-card deck in flat screen-print style: clean confident ink outlines of even weight, flat fills in a limited palette of only deep crimson red, warm cream, burnished gold and dark ink, subtle paper grain, crisp and graphic, very readable at small size.
Card layout: warm cream card stock with a thin gold border line. In the top-left corner a small vertical gold ribbon banner with a swallowtail end carrying a bold serif capital letter K and a small red heart below it; the identical banner in the bottom-right corner rotated 180 degrees. The central illustration is DOUBLE-ENDED like a classic court card: the top half and the bottom half are the same design rotated 180 degrees, joined seamlessly in the middle by a shared element (a medallion, a diagonal band or a woven knot), so the card reads the same upside down; the join is designed, never a straight cut through the drawing.
ABSOLUTELY NO people, faces, heads, hands, bodies, animals or birds anywhere - no living beings at all.
No other text, letters or numbers."""
CONCEPTS = {
 "objects": """Concept: the King is told only through regal objects and Andalusian architecture. Each half: a horseshoe arch of an Andalusian palace framing a white royal turban with a red jewel resting on a tasselled cushion, a curved sword crossed behind it, a large wax seal, a red rose and zellige star tiles. The two halves meet at the centre in a round gold medallion holding a big red heart.""",
 "garments": """Concept: the King is present only as his empty regal garments, as if worn by an invisible king - no head, no face, no hands, no body: a white turban with a red jewel floating above an empty collar, a teal bisht cloak with gold-embroidered edges and a cream robe falling in folds, a jewelled belt with a curved sword, an empty sleeve holding its shape around a red rose on a stem. Warm and dignified, not spooky. The two halves meet diagonally where the cloaks overlap, with a red heart on a gold clasp at the centre.""",
 "geometric": """Concept: pure Islamic geometric ornament - the King is a grand eight-pointed zellige star rosette with interlaced strapwork, arabesque vines and rose-like petals radiating from it, crowned by a crown-shaped arch motif at each end; crimson, cream and gold tiles with ink outlines. Its centre is a large red heart inside the star.""",
}
def run(k):
    body={'model':'openai/gpt-image-2.5-flare','aspect_ratio':'2:3','quality':'max','n':1,'prompt':COMMON+"\n"+CONCEPTS[k]}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k, 'HTTP %d %s'%(e.code,e.read().decode()[:200])
    open(f'{k}.png','wb').write(base64.b64decode(d['data'][0]['b64_json'])); return k, d['usage']['cost']
with cf.ThreadPoolExecutor(3) as ex:
    for k,r in ex.map(run, CONCEPTS): print(k,r)
