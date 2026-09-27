import json, base64, urllib.request, concurrent.futures as cf, re
import os
KEY=os.environ["OPENROUTER_API_KEY"]
exec(open('gen2.py').read().split('C = {')[0].split('KEY=')[1].split('\n',1)[1])  # BASE
C = {
 "Q_diamonds_bold": BASE.replace("a heart below it","a diamond below it") + """
Queen of Diamonds. Full-bleed deep teal card face with a thin cream inner border; the corner letter Q and diamond in crimson. Palette only: deep teal, cream, burnished gold, crimson, near-black ink.
Double-ended court card: one big bold emblem of the queen's regalia as large flat shapes - a tall pierced brass lantern hanging from a crescent hook, framed by the outline of a mashrabiya window, a string of pearls draped across - and the same emblem rotated 180 degrees below, locking together through one large crimson diamond in the exact centre. Lots of teal negative space.""",
 "J_spades_bold": BASE.replace("a heart below it","a spade below it") + """
Jack of Spades. Full-bleed deep navy indigo card face with a thin cream inner border; the corner letter J and spade in cream. Palette only: navy, cream, burnished gold, near-black ink.
Double-ended court card: one big bold emblem of the young squire as large flat shapes - a large ornate old key standing upright crossed with a curved khanjar dagger, a small Najdi triangular crenellation motif behind them - and the same emblem rotated 180 degrees below, locking together through one large gold spade in the exact centre. Lots of navy negative space.""",
 "K_clubs_geo": BASE.replace("a heart below it","a club below it") + """
King of Clubs. Cream card stock; corner letter K and club in near-black. Palette only: deep olive green, terracotta, burnished gold, cream and near-black ink.
Double-ended court card built as a bold geometric composition inside a rounded rectangle panel: flat interlocking blocks forming a Hejazi house facade with a carved wooden roshan window, an olive branch as a big flat shape, a white turban with a gold jewel set like a crown, a dallah coffee pot and three small cups as bold simple shapes. The composition is rotated 180 degrees for the lower half and joins seamlessly through a big club roundel in the centre. Strong grid, thick even outlines, big shapes, mid-century modern poster feel.""",
 "A_spades_geo": BASE.replace("a heart below it","a spade below it") + """
Ace of Spades. Cream card stock; corner letter A and spade in near-black. Palette only: navy, burnished gold, cream and near-black ink.
One large spade in the centre, and INSIDE the spade shape a bold simple geometric Najdi motif: a mud-brick doorway with triangular crenellations above it and a small date palm frond, in flat blocks of navy, gold and cream with thick even outlines. Everything else on the card is empty cream space. Elegant, minimal, iconic.""",
 "Q_hearts_geo": BASE + """
Queen of Hearts. Cream card stock; corner letter Q and heart in crimson. Palette only: crimson, deep teal, burnished gold, cream and near-black ink.
Double-ended court card built as a bold geometric architectural composition inside a rounded rectangle panel: flat interlocking blocks forming an Andalusian mashrabiya lattice window, a hanging lantern, an orange tree as a simple round flat shape, a rose, and zellige star tiles as large pattern blocks. The composition is rotated 180 degrees for the lower half and joins seamlessly through a big heart roundel in the centre. Strong grid, thick even outlines, big shapes, mid-century modern poster feel.""",
}
def run(k):
    body={'model':'openai/gpt-image-2.5-flare','aspect_ratio':'2:3','quality':'max','n':1,'prompt':C[k]}
    req=urllib.request.Request('https://openrouter.ai/api/v1/images',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},method='POST')
    try: d=json.load(urllib.request.urlopen(req,timeout=900))
    except urllib.error.HTTPError as e: return k,'HTTP %d %s'%(e.code,e.read().decode()[:200])
    open(f'{k}.png','wb').write(base64.b64decode(d['data'][0]['b64_json'])); return k,d['usage']['cost']
with cf.ThreadPoolExecutor(5) as ex:
    for k,r in ex.map(run,C): print(k,r)
