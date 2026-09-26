import os, json, base64, time, sys, urllib.request, concurrent.futures as cf
KEY = os.environ["OPENROUTER_API_KEY"]
def durl(p): return 'data:image/jpeg;base64,' + base64.b64encode(open(p,'rb').read()).decode()
REFS = [{'type':'image_url','image_url':{'url':durl('kh_final.jpg')}},{'type':'image_url','image_url':{'url':durl('guide2.jpg')}}]
BASE = """Image 1 is the approved King of Hearts from a deck of playing cards. Image 2 is only a plain diagram of the card's gold frame.
Draw a NEW court card for the same deck, as if by the same illustrator on the same day.
Keep exactly as in image 1: the double gold frame (thicker outer line, thinner inner line, even teal gap, both continuous) with the large rectangular step at the top-left and bottom-right corners, the same size and position; the two stepped corner areas outside the frame are plain flat deep teal and completely empty; the plain flat deep teal background with print grain and no arch or other lines; a burnished-gold sun disc with a thin gold ring behind the head at the same place and size; the fine ink linework with hatching, flat rich colour fields and screen-print grain; the same framing (figure from the head down to below the waist, the frame's bottom edge crossing the lower body), the figure large and centred.
Nothing touches the inner frame line: the figure, hands, held objects and every flower stay a little inside it with a small teal gap, especially near the bottom-right step. Keep the right hand and anything held away from the bottom-right step.
Change only the figure and the flowers:
{figure}
No text, letters, numbers, suit symbols, crosses, religious symbols, halo glow, modern objects or revealing clothing."""
CARDS = {
 'hearts-Q': "A graceful young Andalusian lady (a queen) in long modest layered robes of cream, rust-red and teal with gold embroidered bands, a sheer cream headscarf over her hair and a small gold diadem, calm dignified face, holding a single red rose at her chest. Red and cream roses with leaves low along the two sides and in the two top inner corners, as in image 1.",
 'hearts-J': "A young Andalusian squire-knight in his twenties with a short dark beard, a white turban with a small red cap, a teal cloak over a rust-red tunic with gold bands, a sheathed curved sword at his belt with his left hand on the hilt, holding a single red rose in his right hand at his chest. Red and cream roses with leaves low along the two sides and in the two top inner corners, as in image 1.",
 'diamonds-K': "An elderly Mamluk sultan (a king) with a white beard, a tall rounded white Mamluk turban with a gold band, a turquoise robe with wide gold embroidered bands over a cream robe, holding up a large plain gold coin with a raised rim and no writing on it. Instead of roses: white and turquoise lotus flowers with leaves low along the two sides and in the two top inner corners.",
 'diamonds-Q': "A graceful young Mamluk lady (a queen) in long modest layered robes of turquoise, cream and gold, a sheer cream headscarf over her hair and a small gold diadem, calm dignified face, holding a large plain gold coin with a raised rim and no writing at her chest. White and turquoise lotus flowers with leaves low along the two sides and in the two top inner corners.",
 'diamonds-J': "A young Mamluk squire-knight in his twenties with a short dark beard, a white turban wrapped around a small gold cap, a turquoise coat with gold bands over a cream tunic, a sheathed curved sword at his belt with his left hand on the hilt, holding a large plain gold coin with a raised rim and no writing in his right hand at his chest. White and turquoise lotus flowers with leaves low along the two sides and in the two top inner corners.",
 'clubs-K': "An elderly Hejazi king with a white beard, a white Hejazi turban wrapped around a small cap, a white thobe under an olive-green bisht cloak with gold trim, a gold belt, holding an olive branch with leaves and a few olives at his chest. Instead of roses: olive branches with small white jasmine flowers low along the two sides and in the two top inner corners.",
 'clubs-Q': "A graceful young Hejazi lady (a queen) in long modest layered robes of white, olive green and gold, a sheer white headscarf over her hair and a small gold diadem, calm dignified face, holding an olive branch with leaves at her chest. Olive branches with small white jasmine flowers low along the two sides and in the two top inner corners.",
 'clubs-J': "A young Hejazi squire-knight in his twenties with a short dark beard, a white Hejazi turban, a white thobe under an olive-green vest with gold trim, a sheathed curved sword at his belt with his left hand on the hilt, holding an olive branch in his right hand at his chest. Olive branches with small white jasmine flowers low along the two sides and in the two top inner corners.",
 'spades-K': "An elderly Najdi king with a white beard, a red-and-white checked shemagh headcloth with a black agal cord, a white thobe under an indigo bisht cloak with gold trim, holding a sheathed curved khanjar dagger in an ornate silver and gold sheath at his chest. Instead of roses: small date-palm fronds and yellow desert flowers low along the two sides and in the two top inner corners; clay-red and indigo accents.",
 'spades-Q': "A graceful young Najdi lady (a queen) in long modest layered robes of indigo, clay red and cream with gold embroidered bands, a sheer dark indigo headscarf with a gold edge over her hair and a small gold diadem, calm dignified face, holding a sheathed curved khanjar dagger in an ornate silver and gold sheath at her chest. Small date-palm fronds and yellow desert flowers low along the two sides and in the two top inner corners.",
 'spades-J': "A young Najdi squire-knight in his twenties with a short dark beard, a red-and-white checked shemagh with a black agal, a traditional white thobe under a clay-red vest with gold trim, a sheathed curved sword at his belt with his left hand on the hilt, holding a sheathed curved khanjar dagger in his right hand at his chest. Traditional and historic, nothing modern. Small date-palm fronds and yellow desert flowers low along the two sides and in the two top inner corners.",
}
def run(name):
    body = {'model':'openai/gpt-image-2.5-flare','aspect_ratio':'2:3','quality':'max','n':1,'prompt':BASE.format(figure=CARDS[name]),'input_references':REFS}
    req = urllib.request.Request('https://openrouter.ai/api/v1/images', data=json.dumps(body).encode(), headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'}, method='POST')
    for attempt in range(2):
        try:
            d = json.load(urllib.request.urlopen(req, timeout=900)); break
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if attempt or e.code < 500: return name, f'HTTP {e.code} {msg}'
        except Exception as e:
            if attempt: return name, f'ERR {e!r}'
    imgs = d.get('data') or []
    if not imgs: return name, 'no image ' + json.dumps(d)[:300]
    open(f'deck_{name}.png','wb').write(base64.b64decode(imgs[0]['b64_json']))
    return name, 'ok cost=%s' % d.get('usage',{}).get('cost')
names = sys.argv[1:] or list(CARDS)
with cf.ThreadPoolExecutor(4) as ex:
    for n, r in ex.map(run, names): print(n, r, flush=True)
