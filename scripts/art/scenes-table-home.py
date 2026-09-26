import json, base64, urllib.request, concurrent.futures as cf, os
KEY=os.environ["OPENROUTER_API_KEY"]
def durl(p): return 'data:image/jpeg;base64,'+base64.b64encode(open(p,'rb').read()).decode()
REF=[{'type':'image_url','image_url':{'url':durl('back_ref_s.jpg')}}]
JOBS={
 "table": ('3:4', """Image 1 is our playing-card back, a style reference only (fine 19th-century engraving, navy and cream, arabesque, sun medallion, keys, palm fronds).
Draw a straight top-down view of a card-game table top, filling the whole image edge to edge, for a mobile card game: a deep midnight-navy baize felt surface with a very subtle woven texture, framed by a wide carved border engraved in fine burnished-gold line work - interlaced Andalusian arabesque, small eight-pointed stars, and a small ornate corner medallion in each of the four corners. Just inside the border a thin double gold line. The whole centre of the felt is plain, calm and EMPTY with soft even light (cards will be placed there). Symmetric, precise engraving, flat top-down, no perspective.
No cards, no objects on the table, no people, no text, letters or numbers."""),
 "home": ('9:16', """Image 1 is our playing-card back, a style reference only: fine 19th-century ENGRAVING - crisp engraved lines, cross-hatching and stippling.
An engraved illustration for the title screen of an Arabian card game about a secret diwaniya that opens one night every forty years: a grand carved wooden Najdi-Andalusian double door standing slightly ajar, warm golden light spilling out through the gap and onto the step; a brass lantern hanging on each side; date-palm fronds framing the scene; above, a deep navy night sky full of fine engraved stars and a large burnished-gold sun disc motif. Palette: deep navy and midnight blue engraving with burnished gold and a touch of crimson on cream highlights. The top third of the image is calm open night sky (a title will be placed there); the bottom fifth is calm dark ground (buttons will be placed there). Centred, symmetric, portrait.
No people, faces, animals or birds, no text, letters or numbers, no religious symbols."""),
}
def run(k):
    ar,p=JOBS[k]
    body={'model':'openai/gpt-image-2.5-sunburst','aspect_ratio':ar,'quality':'max','n':2,'prompt':p,'input_references':REF}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:300])
    for i,im in enumerate(d['data']): open(f'{k}_{i}.png','wb').write(base64.b64decode(im['b64_json']))
    return k,d['usage']['cost']
with cf.ThreadPoolExecutor(2) as ex:
    for k,r in ex.map(run,JOBS): print(k,r)
