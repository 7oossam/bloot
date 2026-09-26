import json, base64, urllib.request, concurrent.futures as cf
import os
KEY=os.environ["OPENROUTER_API_KEY"]
STYLE = """Art style: fine 19th-century ENGRAVING like a banknote: crisp engraved lines, cross-hatching and stippling, dark ink with only crimson and muted gold as flat spot colours. Intricate, precise, elegant.
Isolated on a plain flat cream background (#F5EDDC), no card, no border, no text, no letters, no numbers.
STRICT RULES: the large crimson heart is at the EXACT geometric centre of the image, and the whole emblem is centred with equal empty margins on all sides. Every object is complete and physically connected - each weapon or key is one whole object, hilt or bow attached to its blade or shaft, nothing floating by itself, no loose fragments. Perfect symmetry. No people, faces, hands, animals or birds."""
C = {
 "Q": """A double-ended heraldic crest for the QUEEN of Hearts in an Arabian-Andalusian playing-card deck. Heraldic logic: a central cusped Andalusian cartouche shield carrying one large crimson heart. Crowning the shield: a delicate jewelled gold diadem with a sheer veil draped from it in soft folds (an empty veil, no head). Behind the shield: two long strings of pearls crossing in an X, each ending in a tassel. Supporters on the left and right: slender stems of red roses. Double-ended: the lower half is the upper half rotated 180 degrees, sharing the one central shield.""",
 "J": """A double-ended heraldic crest for the JACK of Hearts in an Arabian-Andalusian playing-card deck. Heraldic logic: a central pointed-arch cartouche shield carrying one large crimson heart. Crowning the shield: a young Andalusian squire's soft crimson chechia cap (a rounded felt cap, NOT a helmet, no armour, no visor) wrapped with a narrow white cloth band and a black silk tassel falling to one side, sitting on the shield like a crown (an empty cap, no head). Keys: in EACH half, two short complete antique Andalusian keys cross in a small X just behind the cap. Each key is one correct key: a round bow with arabesque openwork at its OUTER end, a straight shaft, and a simple toothed bit at its INNER end near the cap (never a bow at both ends, never a bit next to the bow, no crosses). The keys do not run behind the central shield. Supporters on the left and right: short sprigs of red rosebuds. Double-ended: the lower half is the upper half rotated 180 degrees, sharing the one central shield.""",
 "A": """The ACE of Hearts emblem for an Arabian-Andalusian playing-card deck: one large crimson heart at the exact centre, set inside an eight-pointed Andalusian star medallion with a fine engraved guilloche border, the medallion encircled by a round wreath of red roses and leaves. Nothing else. Iconic, calm, lots of empty space around it.""",
}
def run(k):
    body={'model':'openai/gpt-image-2.5-sunburst','aspect_ratio':'2:3','quality':'max','n':2,'prompt':C[k]+"\n"+STYLE}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:300])
    for i,im in enumerate(d['data']): open(f'{k}3_{i}.png','wb').write(base64.b64decode(im['b64_json']))
    return k,d['usage']['cost']
print(run('J'))
