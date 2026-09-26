import json, base64, urllib.request, concurrent.futures as cf, os
KEY=os.environ["OPENROUTER_API_KEY"]
def durl(p): return 'data:image/jpeg;base64,'+base64.b64encode(open(p,'rb').read()).decode()
REF=[{'type':'image_url','image_url':{'url':durl('kh_ref.jpg')}}]
COMMON="""Image 1 is a court card from our deck: match its style exactly - fine 19th-century ENGRAVING on warm CREAM paper (#F5EDDC): crisp dark-ink engraved lines, cross-hatching and stippling, with only crimson and muted burnished gold as flat spot colours. Light, airy, elegant, like a printed banknote or an antique card box. NOT dark, no night, no navy background.
A portrait title-screen illustration for an Arabian card game. LAYOUT: the top 30% is mostly empty cream paper (a title will be printed there), the bottom 20% is mostly empty cream paper (a button will be placed there); the subject sits in the middle band. Premium, calm, not cluttered.
No people, faces, hands, animals or birds, no text, letters or numbers, no religious symbols."""
C={
 "crest": "Composition: one large symmetric engraved emblem in the middle band: a big ornate antique key standing vertically before a burnished-gold sun disc with fine engraved rays, framed by two date-palm fronds and a small wreath of red roses, the four suit signs (heart, diamond, club, spade) set as small crimson and ink jewels around the sun. A fine engraved double border runs around the whole image edge like a card.",
 "majlis": "Composition: the interior of an Andalusian-Najdi diwaniya seen through a large engraved horseshoe arch that fills the middle band: inside, low cushions along the walls, carved plaster arches, hanging pierced lanterns in gold, and a low round table in the centre with playing cards laid on it; warm daylight; the arch frames the scene symmetrically and fades out into the cream paper above and below.",
}
def run(k):
    body={'model':'openai/gpt-image-2.5-sunburst','aspect_ratio':'9:16','quality':'max','n':2,'prompt':COMMON+"\n"+C[k],'input_references':REF}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:300])
    for i,im in enumerate(d['data']): open(f'c_{k}_{i}.png','wb').write(base64.b64decode(im['b64_json']))
    return k,d['usage']['cost']
with cf.ThreadPoolExecutor(2) as ex:
    for k,r in ex.map(run,C): print(k,r)
