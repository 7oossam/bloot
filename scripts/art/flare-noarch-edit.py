import os, json, base64, time, urllib.request
KEY = os.environ["OPENROUTER_API_KEY"]
def durl(p): return 'data:image/jpeg;base64,' + base64.b64encode(open(p,'rb').read()).decode()
PROMPT = """Image 1 is a finished playing card illustration (King of Hearts). Image 2 is only a plain diagram of the gold frame it must have.
Edit image 1 to make the design cleaner:
- Remove the thin gold arch line completely (the arched line that runs around the king and the sun disc inside the frame). There is no arch at all anymore: behind the king is only the plain flat deep teal field and the sun disc.
- The frame is exactly as in image 2: two parallel gold lines (a thicker outer line and a thinner inner line, gold with dark ink edges) with an even teal gap between them, each one continuous and unbroken, with a large rectangular step at the top-left corner and the same step rotated 180 degrees at the bottom-right corner, small rounded turns. Keep the frame's size and position as in image 1.
- The two stepped corner areas outside the frame are plain flat deep teal, completely empty.
- Nothing touches the inner frame line: the robe, the sword, the hand and every rose stay a little inside it with a small teal gap, especially at the bottom-right step. Move or shrink the roses there if needed.
Keep everything else exactly as in image 1: the same king, face, white turban with red cap and jewel, white beard, teal cloak, cream and rust robe, the red rose in his hand, the sword, the burnished-gold sun disc with its thin ring, the red and cream roses, the colours and the fine ink drawing style with hatching and print grain.
Do not copy anything else from image 2; it is only a shape guide.
No text, letters, numbers or suit symbols."""
body = {'model':'openai/gpt-image-2.5-flare','aspect_ratio':'2:3','quality':'max','n':2,'prompt':PROMPT,
        'input_references':[{'type':'image_url','image_url':{'url':durl('flare_in.jpg')}},{'type':'image_url','image_url':{'url':durl('guide2.jpg')}}]}
req = urllib.request.Request('https://openrouter.ai/api/v1/images', data=json.dumps(body).encode(), headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}, method='POST')
t=time.time()
try: d = json.load(urllib.request.urlopen(req, timeout=900))
except urllib.error.HTTPError as e: print(e.code, e.read().decode()[:500]); raise SystemExit
for i,im in enumerate(d.get('data') or []): open(f'f2_{i}.png','wb').write(base64.b64decode(im['b64_json']))
print(len(d.get('data') or []), 'images %.0fs'%(time.time()-t), json.dumps(d.get('usage')))
