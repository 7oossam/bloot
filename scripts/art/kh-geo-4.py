import json, base64, urllib.request, concurrent.futures as cf
import os
KEY=os.environ["OPENROUTER_API_KEY"]
BASE = """One single playing card, the King of Hearts, shown flat and straight-on, filling the image, portrait 2:3, rounded corners, on a plain dark background.
Style: a refined modern designer playing-card deck in flat screen-print style, like a premium boutique deck. Cream card stock with subtle paper grain. The court illustration sits in a rounded-rectangle panel with generous cream margins. Limited palette of exactly four inks plus cream: crimson red, deep teal, burnished gold and near-black. One consistent medium line weight everywhere, crisp geometric construction with compass-and-ruler precision, flat fills enriched with simple print textures (fine parallel stripes, small dot grids, thin concentric rings) used sparingly. Big clear shapes, a strong readable silhouette at small size, calm and balanced, generous breathing room. Not busy, no tiny filler ornament, no gradients, no 3D.
The panel is DOUBLE-ENDED: the lower half is the upper half rotated 180 degrees, and the two halves flow into each other through a designed centre, never a straight cut.
Absolutely no people, faces, hands, bodies, animals or birds - no living beings.
Corner index: top-left a condensed classical serif capital K in crimson with a small crimson heart below it; the same in the bottom-right rotated 180 degrees. No other text or numbers."""
C = {
 "v1_diagonal": """Composition: a bold DIAGONAL band runs from the upper-left to the lower-right of the panel like a path; on either side of it, rotated copies of the same scene - an Andalusian horseshoe arch gateway in teal and gold, a white turban with a crimson jewel resting on its keystone like a crown, and a curved sword laid along the band. The heart sits in a small gold roundel where the band crosses the centre.""",
 "v2_twin_medallions": """Composition: two large circular medallions, one in the upper half and one in the lower half (rotated copy), each a top-down view of an Andalusian courtyard: a round fountain basin with concentric rings, four orange trees drawn as simple dotted circles, a zellige star floor. A white turban with a crimson jewel sits in the centre of each fountain like a crown. The two medallions are linked by a vertical cascade of stepped water channels through the middle, with a crimson heart in a gold ring at the exact centre.""",
 "v3_arched_window": """Composition: the whole panel is shaped by one tall Andalusian multifoil arch at the top and the same arch rotated at the bottom. Inside, stacked horizontal bands like a palace facade seen through a window: a row of slender columns, a striped red-and-cream voussoir arch, a teal zellige band, and at the centre a large gold eight-pointed star holding a crimson heart. Crossed curved swords behind the star, a white turban crowning each arch.""",
 "v4_interlocking": """Composition: large interlocking curved shapes that wrap around each other like a woven knot - a big crimson ribbon curling from the top into the bottom half; inside its curves a white turban with a gold jewel, a gold dallah coffee pot and a rose drawn as bold simple shapes, and the rotated copy in the lower half. Teal leaf shapes and gold rings fill the negative spaces. A crimson heart in a cream roundel sits exactly where the ribbons cross in the centre.""",
}
def run(k):
    body={'model':'openai/gpt-image-2.5-flare','aspect_ratio':'2:3','quality':'max','n':1,'prompt':BASE+"\n"+C[k]}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:200])
    open(f'{k}.png','wb').write(base64.b64decode(d['data'][0]['b64_json'])); return k,d['usage']['cost']
with cf.ThreadPoolExecutor(4) as ex:
    for k,r in ex.map(run,C): print(k,r)
