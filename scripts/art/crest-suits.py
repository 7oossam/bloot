import json, base64, urllib.request, concurrent.futures as cf, sys
import os
KEY=os.environ["OPENROUTER_API_KEY"]
STYLE = """Art style: fine 19th-century ENGRAVING like a banknote: crisp engraved lines, cross-hatching and stippling, dark ink with only crimson and muted gold as flat spot colours. Intricate, precise, elegant.
Isolated on a plain flat cream background (#F5EDDC), no card, no border, no text, no letters, no numbers.
STRICT RULES: the large suit symbol is at the EXACT geometric centre of the image, and the whole emblem is centred with equal empty margins on all sides. Every object is complete and physically connected - each weapon or key is one whole object, hilt or bow attached to its blade or shaft, nothing floating by itself, no loose fragments. Perfect symmetry. No people, faces, hands, animals or birds. No crosses or religious symbols."""
SUIT = {
 "D": dict(name="Diamonds", sym="one large solid crimson diamond (rhombus) suit symbol", court="Mamluk Cairo",
   shield="a round Mamluk blazon shield divided by a horizontal band, with a fine engraved rim", plant="stylised lotus flowers and lotus buds on curling stems"),
 "C": dict(name="Clubs", sym="one large solid dark-ink club suit symbol (three round lobes and a stem)", court="Hejazi",
   shield="a tall carved wooden Hejazi roshan panel shaped cartouche with fine latticework edges", plant="olive branches with leaves and olives"),
 "S": dict(name="Spades", sym="one large solid dark-ink spade suit symbol", court="Najdi",
   shield="a Najdi mud-brick style shield with a stepped triangular crenellated top edge and a plain field", plant="date-palm fronds with small date clusters"),
}
RANK = {
 "K": "Crowning the shield: a royal white turban with a crimson jewel and a small gold plume, placed like a crown. Behind the shield: two curved scimitars crossing diagonally, hilts outward, each one complete.",
 "Q": "Crowning the shield: a delicate jewelled gold diadem with a sheer veil draped from it in soft folds (an empty veil, no head). Behind the shield: two long strings of pearls crossing in an X, each ending in a tassel.",
 "J": "Crowning the shield: a soft crimson chechia cap (a rounded felt cap, not a helmet) wrapped with a narrow white cloth band and a black silk tassel falling to one side (empty, no head). Keys: two short complete antique keys cross in a small X just behind the cap; each key has a round openwork bow at its OUTER end, a straight shaft and a simple toothed bit at its INNER end near the cap.",
}
def prompt(r, s):
    d = SUIT[s]
    if r == "A":
        return f"""The ACE of {d['name']} emblem for an Arabian playing-card deck ({d['court']} court): {d['sym']} at the exact centre, set inside an eight-pointed star medallion with a fine engraved guilloche border, the medallion encircled by a round wreath of {d['plant']}. Nothing else. Iconic, calm, lots of empty space around it.\n{STYLE}"""
    return f"""A double-ended heraldic crest for the {dict(K='KING',Q='QUEEN',J='JACK')[r]} of {d['name']} in an Arabian playing-card deck ({d['court']} court). Heraldic logic: a central shield - {d['shield']} - carrying {d['sym']}. {RANK[r]} Supporters on the left and right: {d['plant']}. Double-ended: the lower half is the upper half rotated 180 degrees, sharing the one central shield.\n{STYLE}"""
def run(job):
    r, s = job; n = 1 if r == "A" else 2
    body={'model':'openai/gpt-image-2.5-sunburst','aspect_ratio':'2:3','quality':'max','n':n,'prompt':prompt(r,s)}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return job,'HTTP %d %s'%(e.code,e.read().decode()[:200])
    for i,im in enumerate(d['data']): open(f'{s}{r}_{i}.png','wb').write(base64.b64decode(im['b64_json']))
    return job, d['usage']['cost']
jobs = [(r,s) for s in (sys.argv[1] if len(sys.argv)>1 else "DCS") for r in "KQJA"]
with cf.ThreadPoolExecutor(6) as ex:
    for j,c in ex.map(run, jobs): print(j,c, flush=True)
