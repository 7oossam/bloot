"""Like place_index, but re-stacks the model's letter and suit with a tight gap so the
group fills the frame-bounded step (letter width = fill_w of the step width)."""
import sys, numpy as np
from PIL import Image, ImageFilter
from measure import load, geometry
import place_index as P

def trim(rgb, a):
    ys, xs = np.nonzero(a > 0.05); return rgb[ys.min():ys.max()+1, xs.min():xs.max()+1], a[ys.min():ys.max()+1, xs.min():xs.max()+1]

def build_group(index_src, gap_frac=0.10):
    crop, alpha = P.cut_index(index_src)
    rows = alpha.max(1) > 0.2
    empty = [i for i in range(len(rows)) if not rows[i]]
    cut = min(empty, key=lambda i: abs(i - len(rows) // 2))
    L = trim(crop[:cut], alpha[:cut]); S_ = trim(crop[cut:], alpha[cut:])
    w = max(L[0].shape[1], S_[0].shape[1]); gap = int(L[0].shape[0] * gap_frac)
    h = L[0].shape[0] + gap + S_[0].shape[0]
    rgb = np.zeros((h, w, 3)); a = np.zeros((h, w))
    for (r, al), y in ((L, 0), (S_, L[0].shape[0] + gap)):
        x = (w - r.shape[1]) // 2; rgb[y:y+r.shape[0], x:x+r.shape[1]] = r; a[y:y+r.shape[0], x:x+r.shape[1]] = al
    return rgb, a

def place(card, index_src, dst, fill_w=0.90, fill_h=0.90, gap=6):
    im, paper, diff = load(card); H, W = diff.shape; g = geometry(diff)
    out = im.astype(float).copy(); rng = np.random.default_rng(0)
    clear = [(0, 0, g['step_x'] - gap, g['step_y'] - gap), (g['bstep_x'] + gap, g['bstep_y'] + gap, W, H)]
    boxes = [(g['fx_left'], g['fy_top'], g['step_x'], g['step_y']), (g['bstep_x'], g['bstep_y'], g['fx_right'], g['fy_bot'])]
    for (a, b, c, d) in clear:
        m = diff[b:d, a:c]
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
        r = out[b:d, a:c]; r[m] = paper + rng.normal(0, 1.6, (int(m.sum()), 3))
    rgb0, a0 = build_group(index_src)
    # composite group onto paper colour so resizing keeps clean edges
    bw = min(b[2] - b[0] for b in boxes); bh = min(b[3] - b[1] for b in boxes)
    s = min(bw * fill_w / rgb0.shape[1], bh * fill_h / rgb0.shape[0])
    nw, nh = int(round(rgb0.shape[1] * s)), int(round(rgb0.shape[0] * s))
    prem = (rgb0 * a0[..., None]).clip(0, 255).astype(np.uint8)
    rgb = np.asarray(Image.fromarray(prem).resize((nw, nh), Image.LANCZOS)).astype(float)
    al = np.asarray(Image.fromarray((a0 * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(float)[..., None] / 255
    placed = []
    for box, (r_, a_) in zip(boxes, [(rgb, al), (rgb[::-1, ::-1], al[::-1, ::-1])]):
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        px, py = int(round(cx - nw / 2)), int(round(cy - nh / 2))
        reg = out[py:py + nh, px:px + nw]; out[py:py + nh, px:px + nw] = reg * (1 - a_) + r_   # premultiplied
        placed.append((px, py, px + nw, py + nh))
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(dst)
    return dict(boxes=boxes, index=(nw, nh), placed=placed)

if __name__ == '__main__':
    print(place(sys.argv[1], sys.argv[2], sys.argv[3]))
