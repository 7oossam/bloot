"""Place the model-drawn corner index so both corners match.
The index art is cut from the top-left white step of `index_src` (a model-drawn card),
then centred inside each step of `card`, where a step is the box bounded by the frame
lines: from the frame's outer left/top line level to the step's lines. The bottom-right
copy is the exact same pixels rotated 180 degrees. Only plain paper pixels are touched."""
import sys, numpy as np
from PIL import Image, ImageFilter
from measure import load, geometry, bbox

def cut_index(src, gap=6):
    im, paper, diff = load(src); g = geometry(diff)
    x0, y0, x1, y1 = bbox(diff[:g['step_y'] - gap, :g['step_x'] - gap], 0, 0)
    pad = 4; x0, y0 = max(0, x0 - pad), max(0, y0 - pad); x1, y1 = x1 + pad + 1, y1 + pad + 1
    crop = im[y0:y1, x0:x1].astype(float)
    alpha = np.clip((np.abs(crop - paper).sum(2) - 12) / 40, 0, 1)
    return crop, alpha

def place(card, index_src, dst, fill_w=0.72, fill_h=0.80, gap=6):
    im, paper, diff = load(card); H, W = diff.shape; g = geometry(diff)
    out = im.astype(float).copy(); rng = np.random.default_rng(0)
    # white area of each step (to clear), and the frame-bounded box to centre in
    clear = [(0, 0, g['step_x'] - gap, g['step_y'] - gap), (g['bstep_x'] + gap, g['bstep_y'] + gap, W, H)]
    boxes = [(g['fx_left'], g['fy_top'], g['step_x'], g['step_y']), (g['bstep_x'], g['bstep_y'], g['fx_right'], g['fy_bot'])]
    for (a, b, c, d) in clear:
        m = diff[b:d, a:c]
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
        r = out[b:d, a:c]; r[m] = paper + rng.normal(0, 1.6, (int(m.sum()), 3))
    crop, alpha = cut_index(index_src)
    bw = min(b[2] - b[0] for b in boxes); bh = min(b[3] - b[1] for b in boxes)
    s = min(bw * fill_w / crop.shape[1], bh * fill_h / crop.shape[0])
    nw, nh = int(round(crop.shape[1] * s)), int(round(crop.shape[0] * s))
    rgb = np.asarray(Image.fromarray(crop.clip(0, 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(float)
    al = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)).astype(float)[..., None] / 255
    placed = []
    for box, (r_, a_) in zip(boxes, [(rgb, al), (rgb[::-1, ::-1], al[::-1, ::-1])]):
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        px, py = int(round(cx - nw / 2)), int(round(cy - nh / 2))
        reg = out[py:py + nh, px:px + nw]; out[py:py + nh, px:px + nw] = reg * (1 - a_) + r_ * a_
        placed.append((px, py, px + nw, py + nh))
    Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(dst)
    return dict(geom=g, boxes=boxes, index=(nw, nh), placed=placed)

if __name__ == '__main__':
    print(place(sys.argv[1], sys.argv[2], sys.argv[3]))
