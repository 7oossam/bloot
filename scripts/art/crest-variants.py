import json, base64, urllib.request, concurrent.futures as cf
import os
KEY=os.environ["OPENROUTER_API_KEY"]
HEAD = """A double-ended heraldic crest emblem for the King of Hearts in an Arabian-Andalusian designer playing-card deck, isolated on a plain flat cream background (#F5EDDC), no card, no border, no text.
Heraldic logic: a central shield carries one large crimson heart; the king's royal white turban with a crimson jewel crowns the shield; two curved scimitars are the weapons behind it; red roses are the supporters. Double-ended like a classic court card: the lower half is the upper half rotated 180 degrees, sharing the one central shield. Precise symmetry, clear silhouette readable at small size, generous spacing.
No people, faces, hands, animals or birds.
"""
ENGR = "Art style: fine 19th-century ENGRAVING like a banknote: crisp engraved lines, cross-hatching and stippling, dark ink with only crimson and muted gold as flat spot colours. Intricate, precise, elegant."
DECO = "Art style: ART DECO 1920s luxury: thin gold hairlines, stepped geometric forms, stylised fan-shaped roses, streamlined scimitars, flat deep teal and crimson fills on cream, strong vertical symmetry."
C = {
 "engr_wreath": ENGR + """
Composition: the shield is an eight-pointed Andalusian star cartouche; a full oval wreath of engraved roses and leaves encircles the whole crest; the two scimitars cross in an X behind the star, their hilts reaching out of the wreath at the four corners; a turban crown sits at the top and (rotated) at the bottom of the wreath, each with an engraved ribbon of guilloche pattern beneath it.""",
 "engr_keyhole": ENGR + """
Composition: the shield is a tall horseshoe-arch (keyhole-shaped) cartouche with a fine guilloche rosette border; the scimitars stand upright on either side of it like guards, blades curving outward; rose vines climb the scimitars and meet over the turban crowns at the top and bottom; a small engraved sun-disc rosette behind each turban.""",
 "deco_sunburst": DECO + """
Composition: the shield is a circular medallion with the heart, set on a large gold sunburst of straight rays that fills the card height; the turban crown sits on a stepped ziggurat pedestal above the medallion (and rotated below); the scimitars are drawn as two long parallel vertical curves framing the whole emblem; fan-shaped rose clusters sit at the four diagonal points.""",
 "deco_lozenge": DECO + """
Composition: the shield is a tall lozenge (diamond) with stepped corners and the heart in it; behind it the two scimitars cross in a clean X; from the lozenge, stepped teal bands rise up and down to the turban crowns, which are framed by gold hairline arches; slim stylised rose stems run in straight lines along the left and right edges of the emblem like columns.""",
}
def run(k):
    body={'model':'openai/gpt-image-2.5-sunburst','aspect_ratio':'2:3','quality':'max','n':1,'prompt':HEAD+C[k]}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:300])
    open(f'st_{k}.png','wb').write(base64.b64decode(d['data'][0]['b64_json'])); return k,d['usage']['cost']
with cf.ThreadPoolExecutor(4) as ex:
    for k,r in ex.map(run,C): print(k,r)
