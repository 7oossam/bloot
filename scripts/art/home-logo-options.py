import json, base64, urllib.request, concurrent.futures as cf, os
KEY=os.environ["OPENROUTER_API_KEY"]
def durl(p): return 'data:image/jpeg;base64,'+base64.b64encode(open(p,'rb').read()).decode()
LOGO="""THE LOGO: in the upper part (from about 6% to 26% of the height) draw a large, ornate, EMPTY title cartouche integrated into the artwork - an elongated horizontal Andalusian cartouche with pointed cusped ends, a double burnished-gold rim, a small crest ornament (a tiny key and sun) on its top and a small empty ribbon scroll beneath it. The inside of the cartouche and of the ribbon is plain flat deep teal with nothing in it (the game's name will be set there later).
Keep the bottom 15% calm and simple (buttons go there). Fine engraved line work with cross-hatching, premium mobile-game title screen, portrait.
No text, letters, numbers or calligraphy anywhere. No people, faces, animals or birds, no religious symbols."""
C={
 "desert_sunset": ("ref_desert.jpg","Image 1 is the approved scene: keep its composition - rolling dunes, a small lone diwaniya on a far dune with its door open and golden light pouring out, a huge sun disc low behind it - but it is SUNSET, not night: a warm sky from deep teal at the top through dusty rose to glowing apricot and gold at the horizon, the dunes in warm terracotta and ochre with teal shadows, the first faint stars only at the very top."),
 "desert_dusk": ("ref_desert.jpg","Image 1 is the approved scene: keep its composition - rolling dunes, a small lone diwaniya on a far dune with its door open and warm light pouring out, a large sun disc on the horizon behind it - at BLUE-HOUR DUSK: a teal and lavender sky with a band of amber glow at the horizon, dunes in muted sand and teal tones, lanterns glowing at the door, a few stars."),
 "dallah_golden": ("ref_still.jpg","Image 1 is the approved scene: keep its composition - a brass dallah coffee pot, three small finjan cups, dates on a plate, a pierced lantern and a fanned hand of ornate cream playing cards on a table - but in warm GOLDEN-HOUR daylight: a deep teal baize table, soft sunlight from the side through a mashrabiya casting patterned light and shadow, terracotta cushion behind, rich warm colours, not dark."),
 "dallah_ivory": ("ref_still.jpg","Image 1 is the approved scene: keep its composition - a brass dallah coffee pot, three small finjan cups, dates, a lantern and a fanned hand of ornate playing cards - rendered as a lighter engraved illustration on a warm ivory table with a terracotta and teal sadu runner, morning light, gold and brass highlights, soft teal shadows."),
}
def run(k):
    ref,desc=C[k]
    body={'model':'openai/gpt-image-2.5-sunburst','aspect_ratio':'9:16','quality':'max','n':1,'prompt':desc+"\n"+LOGO,'input_references':[{'type':'image_url','image_url':{'url':durl(ref)}}]}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:300])
    open(f'L_{k}.png','wb').write(base64.b64decode(d['data'][0]['b64_json'])); return k,d['usage']['cost']
with cf.ThreadPoolExecutor(4) as ex:
    for k,r in ex.map(run,C): print(k,r)
