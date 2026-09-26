import os, json, base64, time, sys, urllib.request, concurrent.futures as cf
KEY = os.environ["OPENROUTER_API_KEY"]
def durl(p): return 'data:image/jpeg;base64,' + base64.b64encode(open(p,'rb').read()).decode()
REFS = [{'type':'image_url','image_url':{'url':durl('kh.jpg')}}, {'type':'image_url','image_url':{'url':durl('guide.jpg')}}]
PROMPT = """Image 1 is a finished playing card illustration (King of Hearts). Image 2 is only a plain diagram of the gold frame shape it must have.
Edit image 1: reshape its gold frame to match image 2, and keep everything else the same.
Frame:
- The outer gold frame line has a large rectangular step cut into the top-left corner, and the same step rotated 180 degrees in the bottom-right corner, at the size and position shown in image 2 (about one quarter of the card width and one third of the card height). The line is one continuous unbroken line with small rounded turns, the same gold with dark ink edges as in image 1.
- The thin inner gold arch line runs inside the frame, parallel to it, follows around both steps, and is never broken. It never touches, joins or crosses the outer frame line; keep an even teal gap between them everywhere.
- The two stepped corner areas outside the frame are plain flat deep teal, completely empty.
Keep from image 1: the same king, face, white turban with red cap and jewel, white beard, teal cloak, cream and rust robe, the red rose in his hand, the sword, the burnished-gold sun disc, the red and cream roses, the deep teal background, the colours and the fine ink drawing style with hatching and print grain. The whole figure, robe, sword and roses stay inside the inner arch line with a small gap; nothing is cut off by the frame lines. Make the figure or the sun disc slightly smaller if needed.
Do not copy anything else from image 2; it is only a shape guide.
No text, letters, numbers or suit symbols."""
MODELS = {
 'sunburst': {'model':'openai/gpt-image-2.5-sunburst','aspect_ratio':'2:3','quality':'high'},
 'flare':    {'model':'openai/gpt-image-2.5-flare','aspect_ratio':'2:3','quality':'high'},
 'mai26':    {'model':'microsoft/mai-image-2.6','aspect_ratio':'2:3'},
 'grok2':    {'model':'x-ai/grok-imagine-image-2.0','aspect_ratio':'2:3','resolution':'2K','quality':'medium'},
 'nbpro':    {'model':'google/gemini-3-pro-image','aspect_ratio':'2:3','resolution':'2K'},
}
def run(name):
    body = dict(MODELS[name], prompt=PROMPT, input_references=URLREFS if name=='mai26' else REFS)
    req = urllib.request.Request('https://openrouter.ai/api/v1/images', data=json.dumps(body).encode(),
        headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}, method='POST')
    t=time.time()
    try: d = json.load(urllib.request.urlopen(req, timeout=600))
    except urllib.error.HTTPError as e: return name, 'HTTP %d %s' % (e.code, e.read().decode()[:400])
    except Exception as e: return name, 'ERR %r' % e
    imgs = d.get('data') or []
    if not imgs: return name, 'no image: ' + json.dumps(d)[:400]
    raw = base64.b64decode(imgs[0]['b64_json']); open(f'or_{name}.png','wb').write(raw)
    return name, 'ok %.0fs usage=%s' % (time.time()-t, json.dumps(d.get('usage')))
names = sys.argv[1:] or list(MODELS)
with cf.ThreadPoolExecutor(5) as ex:
    for n, r in ex.map(run, names): print(n, r, flush=True)
