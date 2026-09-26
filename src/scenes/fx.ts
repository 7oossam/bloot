import Phaser from "phaser";
import { HEIGHT, TABLE_RECT, WIDTH } from "./layout";

/**
 * The game's look until the real art lands (docs/art-direction.md): a dusk sky, a zellige-and-
 * sadu table under a warm lamp, gold dust in the light, soft shadows and glows, and cards that
 * travel in arcs. Everything is painted procedurally into canvas textures, so it works on the
 * Canvas renderer too; the few WebGL-only touches (the camera's vignette) are skipped there.
 */

export const PALETTE = {
  sun: 0xe3a33b,
  orange: 0xe8763a,
  peach: 0xf4c7a1,
  terracotta: 0xb5573a,
  teal: 0x2e9c9a,
  tealLight: 0x8fd6cb,
  indigo: 0x243b5a,
  marble: 0xf3e9d6,
  ink: 0x3a2620,
};


export function isWebGL(scene: Phaser.Scene): boolean {
  return scene.renderer.type === Phaser.WEBGL;
}

function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  paint(tex.getContext());
  tex.refresh();
}

/** Soft round light, used for dust motes, glows and flares. */
function softDot(ctx: CanvasRenderingContext2D, size: number): void {
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** An eight-pointed star, the unit of every zellige pattern. */
function star8(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.62;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function zelligeLattice(ctx: CanvasRenderingContext2D, w: number, h: number, step: number, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let y = -step; y < h + step; y += step) {
    for (let x = -step; x < w + step; x += step) {
      const ox = (Math.round(y / step) % 2) * (step / 2);
      star8(ctx, x + ox, y, step * 0.34);
      ctx.stroke();
    }
  }
}

/**
 * Draw `path` blurred, without ctx.filter (Safari has none): the shape is drawn far off the
 * canvas and only its shadow, offset back into place, lands on it.
 */
function blurred(ctx: CanvasRenderingContext2D, blur: number, color: string, path: () => void, mode: "fill" | "stroke" = "fill"): void {
  const far = 10000;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = far;
  ctx.translate(-far, 0);
  path();
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  if (mode === "fill") ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  for (let i = 0; i < amount; i++) {
    const v = Math.random() < 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

/** The textures every effect draws with. Idempotent; call from a scene's create(). */
export function ensureFxTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, "fx-dot", 64, 64, (ctx) => softDot(ctx, 64));
  canvasTexture(scene, "fx-spark", 16, 16, (ctx) => softDot(ctx, 16));
  // A four-pointed flare: two thin light streaks over a soft core.
  canvasTexture(scene, "fx-flare", 256, 256, (ctx) => {
    ctx.globalCompositeOperation = "lighter";
    for (const [w, h] of [[256, 10], [10, 256]]) {
      const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(128 - w / 2, 128 - h / 2, w, h);
    }
    const core = ctx.createRadialGradient(128, 128, 0, 128, 128, 70);
    core.addColorStop(0, "rgba(255,255,255,0.9)");
    core.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, 256, 256);
  });
  // A long shaft of light, bright along its middle and fading at both ends.
  canvasTexture(scene, "fx-ray", 160, 1600, (ctx) => {
    const across = ctx.createLinearGradient(0, 0, 160, 0);
    across.addColorStop(0, "rgba(255,255,255,0)");
    across.addColorStop(0.5, "rgba(255,255,255,1)");
    across.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, 160, 1600);
    ctx.globalCompositeOperation = "destination-in";
    const along = ctx.createLinearGradient(0, 0, 0, 1600);
    along.addColorStop(0, "rgba(0,0,0,1)");
    along.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = along;
    ctx.fillRect(0, 0, 160, 1600);
  });
  // An eight-pointed star for celebrations.
  canvasTexture(scene, "fx-star", 48, 48, (ctx) => {
    ctx.fillStyle = "#ffffff";
    star8(ctx, 24, 24, 22);
    ctx.fill();
  });
}

/** Soft shadow and halo for a card of this size, cached per size. */
export function cardShadowKey(scene: Phaser.Scene, w: number, h: number, r: number): string {
  const key = `fx-cardshadow-${Math.round(w)}x${Math.round(h)}`;
  const pad = 28;
  canvasTexture(scene, key, Math.round(w + pad * 2), Math.round(h + pad * 2), (ctx) => {
    blurred(ctx, 18, "rgba(20,8,4,0.6)", () => roundRect(ctx, pad, pad, w, h, r));
  });
  return key;
}

export function cardHaloKey(scene: Phaser.Scene, w: number, h: number, r: number): string {
  const key = `fx-cardhalo-${Math.round(w)}x${Math.round(h)}`;
  const pad = 30;
  canvasTexture(scene, key, Math.round(w + pad * 2), Math.round(h + pad * 2), (ctx) => {
    ctx.lineWidth = 14;
    blurred(ctx, 20, "rgba(255,255,255,1)", () => roundRect(ctx, pad, pad, w, h, r), "stroke");
    blurred(ctx, 8, "rgba(255,255,255,0.9)", () => roundRect(ctx, pad, pad, w, h, r), "stroke");
  });
  return key;
}

/** The card back: teal with a gold zellige lattice, a sadu border and the Host's sun at the centre. */
export function cardBackKey(scene: Phaser.Scene, w: number, h: number, r: number): string {
  const key = `fx-cardback-${Math.round(w)}x${Math.round(h)}`;
  const W = Math.round(w * 2);
  const H = Math.round(h * 2);
  const R = r * 2;
  canvasTexture(scene, key, W, H, (ctx) => {
    roundRect(ctx, 0, 0, W, H, R);
    ctx.save();
    ctx.clip();
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#1f6b68");
    bg.addColorStop(1, "#123f47");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    zelligeLattice(ctx, W, H, W / 3.2, "rgba(227,163,59,0.45)", 2);
    // Sun disc
    const sun = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.3);
    sun.addColorStop(0, "#f7d27a");
    sun.addColorStop(0.7, "#e3a33b");
    sun.addColorStop(1, "rgba(227,163,59,0)");
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, W * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7a3f1c";
    ctx.lineWidth = 3;
    star8(ctx, W / 2, H / 2, W * 0.14);
    ctx.stroke();
    // Sadu border: terracotta and cream triangles
    const b = W * 0.075;
    ctx.fillStyle = "#b5573a";
    ctx.fillRect(0, 0, W, b);
    ctx.fillRect(0, H - b, W, b);
    ctx.fillRect(0, 0, b, H);
    ctx.fillRect(W - b, 0, b, H);
    ctx.fillStyle = "#f3e9d6";
    const tri = b * 0.9;
    for (let x = 0; x < W; x += tri) {
      for (const y of [0, H - b]) {
        ctx.beginPath();
        ctx.moveTo(x, y + b * 0.8);
        ctx.lineTo(x + tri / 2, y + b * 0.2);
        ctx.lineTo(x + tri, y + b * 0.8);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = "#e3a33b";
    ctx.lineWidth = 4;
    roundRect(ctx, 2, 2, W - 4, H - 4, R);
    ctx.stroke();
  });
  return key;
}

/** Cream paper for card faces: a faint warm gradient and grain. */
export function cardFaceKey(scene: Phaser.Scene, w: number, h: number, r: number): string {
  const key = `fx-cardface-${Math.round(w)}x${Math.round(h)}`;
  const W = Math.round(w * 2);
  const H = Math.round(h * 2);
  const R = r * 2;
  canvasTexture(scene, key, W, H, (ctx) => {
    roundRect(ctx, 0, 0, W, H, R);
    ctx.save();
    ctx.clip();
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#fdf8ee");
    bg.addColorStop(1, "#efe1c6");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    zelligeLattice(ctx, W, H, W / 2.4, "rgba(181,87,58,0.07)", 2);
    grain(ctx, W, H, 900);
    ctx.restore();
    ctx.strokeStyle = "rgba(181,87,58,0.55)";
    ctx.lineWidth = 3;
    roundRect(ctx, 10, 10, W - 20, H - 20, R * 0.7);
    ctx.stroke();
    ctx.strokeStyle = "#8a5a3a";
    ctx.lineWidth = 3;
    roundRect(ctx, 1.5, 1.5, W - 3, H - 3, R);
    ctx.stroke();
  });
  return key;
}

/**
 * The scene's backdrop: a dusk sky (deep teal above, rose and apricot toward the horizon), the
 * sun low on the right, a faint zellige lattice and paper grain. With `table`, the lamp-lit
 * table: a teal zellige top, a carved wooden rim and a sadu band.
 */
export function paintBackdrop(scene: Phaser.Scene, opts: { table?: boolean } = {}): void {
  const key = opts.table ? "fx-backdrop-table" : "fx-backdrop";
  canvasTexture(scene, key, WIDTH, HEIGHT, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#173a4a");
    sky.addColorStop(0.35, "#3b4a63");
    sky.addColorStop(0.62, "#8a4d52");
    sky.addColorStop(0.85, "#c9704a");
    sky.addColorStop(1, "#e39a5c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const sun = ctx.createRadialGradient(WIDTH * 0.85, HEIGHT * 0.1, 0, WIDTH * 0.85, HEIGHT * 0.1, WIDTH * 0.9);
    sun.addColorStop(0, "rgba(255,214,140,0.55)");
    sun.addColorStop(0.3, "rgba(232,118,58,0.18)");
    sun.addColorStop(1, "rgba(232,118,58,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    zelligeLattice(ctx, WIDTH, HEIGHT, 150, "rgba(243,233,214,0.05)", 2);

    if (opts.table) {
      const { left, top, right, bottom } = TABLE_RECT;
      const w = right - left;
      const h = bottom - top;
      // Shadow under the table
      blurred(ctx, 48, "rgba(20,8,4,0.65)", () => roundRect(ctx, left + 8, top + 30, w, h, 56));
      // Wooden rim
      const wood = ctx.createLinearGradient(0, top, 0, bottom);
      wood.addColorStop(0, "#7a4a2a");
      wood.addColorStop(0.5, "#5a3420");
      wood.addColorStop(1, "#40241a");
      ctx.fillStyle = wood;
      roundRect(ctx, left, top, w, h, 56);
      ctx.fill();
      // Sadu band
      const band = 22;
      const inset = 18;
      ctx.save();
      roundRect(ctx, left + inset, top + inset, w - inset * 2, h - inset * 2, 44);
      ctx.clip();
      ctx.fillStyle = "#9e2b25";
      ctx.fillRect(left, top, w, h);
      ctx.fillStyle = "#f3e9d6";
      for (let x = left; x < right; x += band) {
        for (const y of [top + inset, bottom - inset - band]) {
          ctx.beginPath();
          ctx.moveTo(x, y + band);
          ctx.lineTo(x + band / 2, y + 4);
          ctx.lineTo(x + band, y + band);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
      // Table top: teal zellige under a warm lamp
      const tl = left + inset + band;
      const tt = top + inset + band;
      const tw = w - (inset + band) * 2;
      const th = h - (inset + band) * 2;
      ctx.save();
      roundRect(ctx, tl, tt, tw, th, 32);
      ctx.clip();
      const felt = ctx.createRadialGradient(WIDTH / 2, top + h * 0.48, 40, WIDTH / 2, top + h * 0.48, h * 0.75);
      felt.addColorStop(0, "#2f8581");
      felt.addColorStop(0.6, "#1d5a5a");
      felt.addColorStop(1, "#0f3439");
      ctx.fillStyle = felt;
      ctx.fillRect(tl, tt, tw, th);
      zelligeLattice(ctx, WIDTH, HEIGHT, 96, "rgba(143,214,203,0.10)", 2);
      const lamp = ctx.createRadialGradient(WIDTH / 2, top + h * 0.45, 0, WIDTH / 2, top + h * 0.45, h * 0.55);
      lamp.addColorStop(0, "rgba(255,210,140,0.22)");
      lamp.addColorStop(1, "rgba(255,210,140,0)");
      ctx.fillStyle = lamp;
      ctx.fillRect(tl, tt, tw, th);
      // Inner shadow along the edge, so the top sits below the rim
      ctx.lineWidth = 30;
      blurred(ctx, 24, "rgba(10,20,20,0.45)", () => roundRect(ctx, tl, tt, tw, th, 32), "stroke");
      ctx.restore();
      ctx.strokeStyle = "#e3a33b";
      ctx.lineWidth = 3;
      roundRect(ctx, tl, tt, tw, th, 32);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,220,160,0.35)";
      ctx.lineWidth = 2;
      roundRect(ctx, left + 3, top + 3, w - 6, h - 6, 54);
      ctx.stroke();
    }
    grain(ctx, WIDTH, HEIGHT, 9000);
  });
  scene.add.image(0, 0, key).setOrigin(0).setDepth(-20);
}

/** Shafts of evening light from the upper right, and gold dust drifting in them. */
export function addAmbience(scene: Phaser.Scene): void {
  ensureFxTextures(scene);
  const rays: Phaser.GameObjects.Image[] = [];
  for (let i = 0; i < 4; i++) {
    const ray = scene.add
      .image(WIDTH * (0.95 - i * 0.14), -60, "fx-ray")
      .setOrigin(0.5, 0)
      .setAngle(28 + i * 3)
      .setScale(0.6 + i * 0.25, 1.2)
      .setTint(0xffc98a)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-15);
    rays.push(ray);
    scene.tweens.add({
      targets: ray,
      alpha: { from: 0.04, to: 0.1 + i * 0.015 },
      duration: 3800 + i * 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
      delay: i * 500,
    });
  }
  scene.add
    .particles(0, 0, "fx-dot", {
      x: { min: 0, max: WIDTH },
      y: { min: 0, max: HEIGHT },
      speedX: { min: -8, max: 8 },
      speedY: { min: -22, max: -6 },
      scale: { start: 0.06, end: 0.22 },
      alpha: { values: [0, 0.55, 0.5, 0] },
      tint: [0xffe0a8, 0xfff1d6, 0xffc98a, 0x9fe3d8],
      lifespan: { min: 6000, max: 11000 },
      frequency: 280,
      blendMode: Phaser.BlendModes.ADD,
      advance: 8000,
    })
    .setDepth(-14);
}

/** A soft vignette on WebGL, pulling the eye to the table. */
export function addCameraGrade(scene: Phaser.Scene): void {
  if (!isWebGL(scene)) return;
  const cam = scene.cameras.main as Phaser.Cameras.Scene2D.Camera & { postFX?: Phaser.GameObjects.Components.FX };
  cam.postFX?.addVignette(0.5, 0.5, 0.92, 0.28);
}

/**
 * Move a card (or anything) along a lifted arc, turning as it goes, and settle it with a small
 * squash. `lift` bends the path sideways, like a card tossed by hand.
 */
export function arcTo(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container | Phaser.GameObjects.Image,
  to: { x: number; y: number },
  opts: { duration: number; delay?: number; lift?: number; angle?: number; scale?: number; ease?: string; onComplete?: () => void; land?: boolean },
): void {
  const from = { x: target.x, y: target.y };
  const startAngle = target.angle;
  const endAngle = opts.angle ?? 0;
  const startScale = target.scaleX;
  const endScale = opts.scale ?? startScale;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const lift = opts.lift ?? Math.min(140, len * 0.25);
  // Control point: the midpoint pushed out perpendicular to the path.
  const cx = (from.x + to.x) / 2 + (-dy / len) * lift;
  const cy = (from.y + to.y) / 2 + (dx / len) * lift;
  const spin = (Math.random() < 0.5 ? -1 : 1) * 8;
  const state = { t: 0 };
  scene.tweens.add({
    targets: state,
    t: 1,
    delay: opts.delay ?? 0,
    duration: opts.duration,
    ease: opts.ease ?? "Cubic.Out",
    onUpdate: () => {
      if (!target.active) return;
      const t = state.t;
      const u = 1 - t;
      target.x = u * u * from.x + 2 * u * t * cx + t * t * to.x;
      target.y = u * u * from.y + 2 * u * t * cy + t * t * to.y;
      target.angle = startAngle + (endAngle - startAngle) * t + Math.sin(t * Math.PI) * spin;
      const s = startScale + (endScale - startScale) * t;
      // Swell a little at the top of the arc, as if nearer the eye.
      target.setScale(s * (1 + Math.sin(t * Math.PI) * 0.08));
    },
    onComplete: () => {
      if (!target.active) return;
      if (opts.land) {
        scene.tweens.add({ targets: target, scaleX: endScale * 1.06, scaleY: endScale * 0.94, duration: 70, yoyo: true, ease: "Quad.Out" });
        landingPuff(scene, target.x, target.y + 30);
      }
      opts.onComplete?.();
    },
  });
}

/** A few motes kicked up where a card lands. */
export function landingPuff(scene: Phaser.Scene, x: number, y: number): void {
  ensureFxTextures(scene);
  const e = scene.add
    .particles(x, y, "fx-dot", {
      speed: { min: 30, max: 90 },
      angle: { min: 180, max: 360 },
      scale: { start: 0.12, end: 0 },
      alpha: { start: 0.45, end: 0 },
      tint: [0xffe0a8, 0xf3e9d6],
      lifespan: 500,
      quantity: 8,
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
    })
    .setDepth(50);
  e.explode(8);
  scene.time.delayedCall(600, () => e.destroy());
}

/** A light flare over a point: the winning card, a won hand. */
export function flare(scene: Phaser.Scene, x: number, y: number, color = 0xffd98a, size = 1): void {
  ensureFxTextures(scene);
  const f = scene.add.image(x, y, "fx-flare").setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.2 * size).setAlpha(0).setDepth(60);
  scene.tweens.add({ targets: f, scale: 1.1 * size, alpha: { from: 1, to: 0 }, angle: 45, duration: 700, ease: "Cubic.Out", onComplete: () => f.destroy() });
}

/** Gold motes rising from a point. */
export function rise(scene: Phaser.Scene, x: number, y: number, colors = [0xffd98a, 0xfff1d6], count = 14): void {
  ensureFxTextures(scene);
  const e = scene.add
    .particles(x, y, "fx-dot", {
      x: { min: -50, max: 50 },
      speedY: { min: -140, max: -60 },
      speedX: { min: -20, max: 20 },
      scale: { start: 0.14, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: colors,
      lifespan: { min: 700, max: 1200 },
      quantity: count,
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
    })
    .setDepth(55);
  e.explode(count);
  scene.time.delayedCall(1300, () => e.destroy());
}

/** A celebration: stars and sparks thrown outward, falling back under gravity. */
export function celebrate(scene: Phaser.Scene, x: number, y: number, colors = [0xe3a33b, 0x8fd6cb, 0xf3e9d6, 0xe8763a], count = 60): void {
  ensureFxTextures(scene);
  const stars = scene.add
    .particles(x, y, "fx-star", {
      speed: { min: 250, max: 750 },
      angle: { min: 200, max: 340 },
      rotate: { min: 0, max: 360 },
      scale: { start: 1.3, end: 0.4 },
      alpha: { start: 1, end: 0 },
      tint: colors,
      gravityY: 900,
      lifespan: { min: 900, max: 1600 },
      quantity: count,
      emitting: false,
    })
    .setDepth(70);
  stars.explode(count);
  const sparks = scene.add
    .particles(x, y, "fx-dot", {
      speed: { min: 100, max: 500 },
      scale: { start: 0.25, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: colors,
      lifespan: 900,
      quantity: 40,
      emitting: false,
      blendMode: Phaser.BlendModes.ADD,
    })
    .setDepth(70);
  sparks.explode(40);
  flare(scene, x, y, 0xffe6b0, 2.2);
  scene.time.delayedCall(1800, () => {
    stars.destroy();
    sparks.destroy();
  });
}

/** A brief colour wash over the whole screen. */
export function screenFlash(scene: Phaser.Scene, color = 0xffe6b0, alpha = 0.35, duration = 380): void {
  const r = scene.add.rectangle(0, 0, WIDTH, HEIGHT, color).setOrigin(0).setAlpha(alpha).setDepth(90).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: r, alpha: 0, duration, ease: "Quad.Out", onComplete: () => r.destroy() });
}

/** Everything freezes for a beat before a big moment lands. */
export function hitStop(scene: Phaser.Scene, ms: number): void {
  scene.tweens.timeScale = 0.05;
  scene.time.delayedCall(ms, () => (scene.tweens.timeScale = 1));
}
