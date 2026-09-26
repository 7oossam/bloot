import os, json, base64, urllib.request, concurrent.futures as cf
from PIL import Image
KEY = os.environ["OPENROUTER_API_KEY"]
def durl(p): return 'data:image/jpeg;base64,' + base64.b64encode(open(p,'rb').read()).decode()
P = """Image 1 is a finished playing card. Image 2 is only a plain diagram of its gold frame.
Edit image 1 with one small change: the sheathed sword at his belt is shorter and hangs more steeply, so the tip of the sheath ends well inside the card, clearly above and to the left of the inner gold frame line at the bottom-right step, with a clear teal gap; nothing touches or overlaps the frame lines.
Keep everything else exactly as in image 1: the same young man, face, headwear, clothes, colours, pose, hands, held object, flowers, the gold sun disc, the plain teal background, the double gold frame with its two steps (continuous lines), the empty teal corner areas, and the ink drawing style.
No text, letters, numbers or suit symbols."""
def run(n):
    Image.open(f'deck_{n}.png').convert('RGB').save(f'in_{n}.jpg', quality=95)
    body = {'model':'openai/gpt-image-2.5-flare','aspect_ratio':'2:3','quality':'max','n':1,'prompt':P,
            'input_references':[{'type':'image_url','image_url':{'url':durl(f'in_{n}.jpg')}},{'type':'image_url','image_url':{'url':durl('guide2.jpg')}}]}
    req = urllib.request.Request('https://openrouter.ai/api/v1/images', data=json.dumps(body).encode(), headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}, method='POST')
    try: d = json.load(urllib.request.urlopen(req, timeout=900))
    except urllib.error.HTTPError as e: return n, f'HTTP {e.code} {e.read().decode()[:300]}'
    open(f'fix_{n}.png','wb').write(base64.b64decode(d['data'][0]['b64_json'])); return n, 'ok cost=%s' % d['usage']['cost']
with cf.ThreadPoolExecutor(3) as ex:
    for n, r in ex.map(run, ['diamonds-J','clubs-J','spades-J']): print(n, r)
