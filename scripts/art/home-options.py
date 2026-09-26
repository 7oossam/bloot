import json, base64, urllib.request, concurrent.futures as cf, os
KEY=os.environ["OPENROUTER_API_KEY"]
def durl(p): return 'data:image/jpeg;base64,'+base64.b64encode(open(p,'rb').read()).decode()
REF=[{'type':'image_url','image_url':{'url':durl('back_ref_s.jpg')}}]
COMMON="""Image 1 is our playing-card back, a style reference only: fine 19th-century ENGRAVING - crisp engraved lines, cross-hatching and stippling - in deep navy with burnished gold and small crimson accents on cream highlights.
A portrait title-screen illustration for an Arabian card game called "The Host" about a secret diwaniya that opens one night every forty years. LAYOUT: the top 28% of the image is calm and simple (a title will be placed there), the bottom 22% is calm and dark (a button will be placed there); the subject sits in the middle band. Elegant, premium, readable at phone size, strong focal point, not cluttered.
No people, faces, hands, animals or birds, no text, letters or numbers, no religious symbols."""
C={
 "crest": "Composition: a premium card-deck box front. A dark navy field with an ornate engraved gold arabesque frame around the edges. In the middle one large symmetric engraved emblem: a big ornate antique key standing vertically in front of a burnished-gold sun disc with fine rays, framed by two date-palm fronds and a small wreath of roses, with the four card suit signs (heart, diamond, club, spade) set as tiny jewels around the sun.",
 "still": "Composition: a close still life seen from slightly above on a midnight-navy baize card table: a fanned hand of ornate cream playing cards (backs showing, no faces), a brass dallah coffee pot and three small finjan cups, a few dates on a small plate, and a pierced brass lantern whose warm golden light pools on the felt; deep shadows at the edges, the light at the centre.",
 "majlis": "Composition: the interior of an Andalusian-Najdi diwaniya at night seen through a large horseshoe arch in the foreground: inside, low cushions along the walls, carved plaster arches, hanging pierced lanterns glowing gold, and a low table in the centre with cards laid on it, bathed in warm light; the arch frames the scene symmetrically.",
 "desert": "Composition: a vast desert at night: rolling engraved dunes in the lower middle, and on a far dune a small lone diwaniya building with its carved door open and golden light pouring out onto the sand; above it an immense starry navy sky with fine engraved star rays and a large burnished-gold sun disc low on the horizon behind the building.",
}
def run(k):
    body={'model':'openai/gpt-image-2.5-sunburst','aspect_ratio':'9:16','quality':'max','n':1,'prompt':COMMON+"\n"+C[k],'input_references':REF}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:300])
    open(f'h_{k}.png','wb').write(base64.b64decode(d['data'][0]['b64_json'])); return k,d['usage']['cost']
with cf.ThreadPoolExecutor(4) as ex:
    for k,r in ex.map(run,C): print(k,r)
