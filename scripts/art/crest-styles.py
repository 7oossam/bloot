import json, base64, urllib.request, concurrent.futures as cf
import os
KEY=os.environ["OPENROUTER_API_KEY"]
LOGIC = """A double-ended heraldic crest emblem for the King of Hearts in an Arabian-Andalusian designer playing-card deck, isolated on a plain flat cream background (#F5EDDC), no card, no border, no text.
Heraldic logic, strictly followed: in the exact centre a single cusped Andalusian cartouche shield carrying one large crimson heart. On top of the shield sits a royal white turban with a crimson jewel and a small gold plume, placed like a crown on a crest. Behind the shield two curved scimitars cross diagonally, hilts outward. On the left and right, a tall stem of red roses with leaves rises as the two supporters. The whole crest is double-ended like a classic court card: the lower half is the upper half rotated 180 degrees, sharing the one central shield. Precise symmetry, a clear silhouette readable at small size, generous spacing.
No people, faces, hands, animals or birds."""
STYLES = {
 "engraved": "Art style: a fine 19th-century ENGRAVING, like a banknote or an antique playing-card back: everything drawn with crisp engraved lines, cross-hatching and stippling for shading, printed in dark ink with only two spot colours added flat - crimson for the heart, jewel and roses, and muted gold for the plume and hilts. Elegant, intricate, high-precision linework.",
 "screenprint": "Art style: bold MID-CENTURY SCREEN-PRINT poster: big simplified flat shapes with no outlines, overlapping flat colour layers with slight print misregistration, a few halftone dot and stripe textures, geometric simplification of the roses, turban and swords. Palette: crimson, deep teal, mustard gold, ink black and cream. Graphic, modern, confident.",
 "illuminated": "Art style: an ILLUMINATED Islamic manuscript page (tezhip / Persian-Andalusian miniature ornament): shining burnished gold leaf with fine tooled patterns, deep lapis blue and malachite green accents, crimson, delicate hairline black outlines, tiny floral arabesques inside the gold, rich and luxurious but orderly.",
 "artdeco": "Art style: ART DECO: elegant thin gold line art with stepped geometric forms, sunburst rays behind the crest, stylised fan-like roses and streamlined scimitars, strong vertical symmetry, flat fills of deep teal and crimson with gold hairlines on cream, 1920s luxury poster feel.",
}
def run(k):
    body={'model':'openai/gpt-image-2.5-sunburst','aspect_ratio':'2:3','quality':'max','n':1,'prompt':LOGIC+"\n"+STYLES[k]}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:300])
    open(f'st_{k}.png','wb').write(base64.b64decode(d['data'][0]['b64_json'])); return k,d['usage']['cost']
with cf.ThreadPoolExecutor(4) as ex:
    for k,r in ex.map(run,STYLES): print(k,r)
