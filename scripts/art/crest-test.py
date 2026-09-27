import json, base64, urllib.request, concurrent.futures as cf
import os
KEY=os.environ["OPENROUTER_API_KEY"]
P = """A double-ended heraldic crest emblem for the King of Hearts in an Arabian-Andalusian designer playing-card deck, isolated on a plain flat cream background (#F5EDDC), no card, no border, no text.
Heraldic logic, strictly followed: in the exact centre a single cusped Andalusian cartouche shield carrying one large crimson heart. On top of the shield sits a royal white turban with a crimson jewel and a small gold plume, placed like a crown on a crest. Behind the shield two curved scimitars cross diagonally, hilts outward. On the left and right, a tall stem of red roses with leaves rises as the two supporters. The whole crest is double-ended like a classic court card: the lower half is the upper half rotated 180 degrees (a second turban-crown at the bottom, the swords' other ends, mirrored rose stems), sharing the one central shield.
Style: premium modern playing-card illustration, flat vector with clean confident outlines of one even weight, precise symmetry, simple elegant shapes, generous spacing between elements, a strong clear silhouette readable at small size. Palette of only crimson #B3202C, deep teal #1F4A4D, burnished gold #C9973E, near-black ink #221A16 and cream. No gradients, no 3D, no texture noise, no clutter.
No people, faces, hands, animals or birds."""
JOBS = {
 "sunburst": {'model':'openai/gpt-image-2.5-sunburst','aspect_ratio':'2:3','quality':'max'},
 "recraft_vector": {'model':'recraft/recraft-v4.1-pro-vector','aspect_ratio':'3:4','output_format':'svg'},
 "recraft": {'model':'recraft/recraft-v4.1-pro','aspect_ratio':'3:4'},
}
def run(k):
    body=dict(JOBS[k], prompt=P, n=1)
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:300])
    im=d['data'][0]; raw=base64.b64decode(im['b64_json'])
    ext='svg' if raw[:200].lstrip().startswith(b'<') else 'png'
    open(f'{k}.{ext}','wb').write(raw); return k,(ext, d.get('usage',{}).get('cost'))
with cf.ThreadPoolExecutor(3) as ex:
    for k,r in ex.map(run,JOBS): print(k,r)
