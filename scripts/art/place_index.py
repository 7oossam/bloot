"""Move the model-drawn corner index so both corners match.
Takes the top-left index the model drew, clears both white steps back to plain paper,
and puts that same index centred in the top-left step and an exact 180-degree copy
centred in the bottom-right step. Only plain paper pixels are touched."""
import sys, numpy as np
from PIL import Image, ImageFilter
from measure import load, geometry, bbox

def place(src, dst, fill=0.62, gap=6):
    im, paper, diff = load(src); H, W = diff.shape; g = geometry(diff)
    out = im.astype(float).copy()
    rng = np.random.default_rng(0)
    noise = lambda shape: paper + rng.normal(0, 1.6, shape + (3,))
    # the two white step areas (card edge to the inside of the frame's outer line, minus a small gap)
    tl = (0, 0, g['step_x'] - gap, g['step_y'] - gap)
    br = (g['bstep_x'] + gap, g['bstep_y'] + gap, W, H)
    # 1. cut the top-left index out with a soft alpha from its distance to paper
    x0, y0, x1, y1 = bbox(diff[:tl[3], :tl[2]], 0, 0)
    pad = 4; x0, y0, x1, y1 = max(0, x0 - pad), max(0, y0 - pad), x1 + pad + 1, y1 + pad + 1
    crop = im[y0:y1, x0:x1].astype(float)
    dist = np.abs(crop - paper).sum(2)
    alpha = np.clip((dist - 12) / 40, 0, 1)
    # 2. clear both steps to paper (only pixels that differ from paper inside those areas)
    for (a, b, c, d) in (tl, br):
        m = diff[b:d, a:c]
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
        region = out[b:d, a:c]; region[m] = noise((int(m.sum()),))
    # 3. one size for both corners: fit the index into the smaller step with `fill` of its height/width
    aw = min(tl[2] - tl[0], br[2] - br[0]); ah = min(tl[3] - tl[1], br[3] - br[1])
    s = min(aw * fill / crop.shape[1], ah * fill * 1.25 / crop.shape[0], 1.6)
    nw, nh = int(round(crop.shape[1] * s)), int(round(crop.shape[0] * s))
    rgb = np.asarray(Image.fromarray(crop.clip(0, 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(float)
    al = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(float)[..., None] / 255
    def paste(rgb, al, box):
        cx = (box[0] + box[2]) / 2; cy = (box[1] + box[3]) / 2
        px, py = int(round(cx - nw / 2)), int(round(cy - nh / 2))
        region = out[py:py + nh, px:px + nw]
        out[py:py + nh, px:px + nw] = region * (1 - al) + rgb * al
        return px, py
    p1 = paste(rgb, al, tl)
    p2 = paste(rgb[::-1, ::-1], al[::-1, ::-1], br)
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(dst)
    return dict(geom=g, index_size=(nw, nh), top_at=p1, bottom_at=p2, tl_box=tl, br_box=br)

if __name__ == '__main__':
    for src in sys.argv[1:]:
        print(src, place(src, src.replace('.png', '_placed.png')))
