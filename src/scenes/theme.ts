import Phaser from "phaser";

/**
 * The look shared by the menus and the map, taken from the deck: cream card stock, ink,
 * crimson and burnished gold, with terracotta and teal from the sunset title screen.
 */
export const PAL = {
  paper: 0xf5eddc,
  paperDeep: 0xe9dcc0,
  paperShade: 0xd9c7a2,
  ink: 0x221a16,
  inkSoft: 0x5a4a3c,
  crimson: 0x9e1b26,
  gold: 0xc9973e,
  goldHi: 0xf0cb7a,
  goldLo: 0x8c5a1c,
  terracotta: 0x8f3a22,
  terracottaDeep: 0x5e2014,
  teal: 0x1f4a4d,
  olive: 0x3e4a2a,
} as const;

export const CSS = {
  ink: "#221a16",
  inkSoft: "#5a4a3c",
  crimson: "#9e1b26",
  gold: "#c9973e",
  goldHi: "#f6dfa5",
  paper: "#f5eddc",
} as const;

/** Headings and buttons: El Messiri (OFL, self-hosted in public/fonts). */
export const HEAD_FONT = "'El Messiri', Tajawal, serif";

/** Paper grain dots, deterministic so a panel looks the same every time it's drawn. */
function grain(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, n: number): void {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    g.fillStyle(rnd() < 0.5 ? PAL.inkSoft : PAL.goldLo, 0.05 + rnd() * 0.05);
    g.fillRect(x + rnd() * w, y + rnd() * h, 1.6, 1.6);
  }
}

/** A diamond, the deck's small ornament. */
export function diamond(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number): void {
  g.fillStyle(color, 1);
  g.fillPoints([new Phaser.Geom.Point(x, y - r), new Phaser.Geom.Point(x + r, y), new Phaser.Geom.Point(x, y + r), new Phaser.Geom.Point(x - r, y)], true);
}

/**
 * A panel of card stock: cream, a double gold frame, diamonds at the corners, drawn around
 * (0,0). Returns the graphics so callers can add it to a container.
 */
export function paperPanel(scene: Phaser.Scene, w: number, h: number, opts: { radius?: number; accent?: number } = {}): Phaser.GameObjects.Graphics {
  const r = opts.radius ?? 26;
  const g = scene.add.graphics();
  g.fillStyle(0x1a0e08, 0.45);
  g.fillRoundedRect(-w / 2 + 4, -h / 2 + 10, w, h, r);
  g.fillStyle(PAL.paper, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  grain(g, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, Math.round((w * h) / 900));
  g.lineStyle(3, opts.accent ?? PAL.gold, 1);
  g.strokeRoundedRect(-w / 2 + 12, -h / 2 + 12, w - 24, h - 24, r - 8);
  g.lineStyle(1.5, opts.accent ?? PAL.gold, 0.85);
  g.strokeRoundedRect(-w / 2 + 20, -h / 2 + 20, w - 40, h - 40, r - 12);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) diamond(g, (sx * (w - 24)) / 2, (sy * (h - 24)) / 2, 7, opts.accent ?? PAL.gold);
  return g;
}

/** A thin gold rule with a diamond in the middle, under a heading. */
export function goldRule(scene: Phaser.Scene, x: number, y: number, w: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.lineStyle(2, PAL.gold, 0.9);
  g.lineBetween(x - w / 2, y, x - 14, y);
  g.lineBetween(x + 14, y, x + w / 2, y);
  diamond(g, x, y, 7, PAL.gold);
  g.fillStyle(PAL.gold, 1);
  g.fillCircle(x - w / 2, y, 2.5);
  g.fillCircle(x + w / 2, y, 2.5);
  return g;
}

/** The menus' ground: an old engraved chart — cream paper, a darker rim, a double gold border. */
export function paintParchment(scene: Phaser.Scene, opts: { compass?: boolean } = {}): void {
  const WIDTH = scene.scale.width, HEIGHT = scene.scale.height;
  const g = scene.add.graphics().setDepth(-20);
  g.fillStyle(PAL.paperDeep, 1);
  g.fillRect(0, 0, WIDTH, HEIGHT);
  // A lighter heart fading to the burnt rim, in rings.
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    g.fillStyle(i < 20 ? PAL.paper : PAL.paperDeep, 0.05 + 0.03 * t);
    g.fillEllipse(WIDTH / 2, HEIGHT / 2, WIDTH * (1.5 - t), HEIGHT * (1.25 - t * 0.9));
  }
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle(rnd() < 0.6 ? PAL.inkSoft : PAL.goldLo, 0.05 + rnd() * 0.06);
    g.fillRect(rnd() * WIDTH, rnd() * HEIGHT, 2, 2);
  }
  if (opts.compass !== false) {
    // Faint compass rose behind the path.
  g.lineStyle(1.5, PAL.goldLo, 0.18);
  g.strokeCircle(WIDTH / 2, HEIGHT * 0.56, 300);
  g.strokeCircle(WIDTH / 2, HEIGHT * 0.56, 290);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 250 : 330;
    g.lineBetween(WIDTH / 2, HEIGHT * 0.56, WIDTH / 2 + Math.cos(a) * r, HEIGHT * 0.56 + Math.sin(a) * r);
  }
  }
  // Burnt edge and the double gold border.
  g.lineStyle(40, PAL.paperShade, 0.35);
  g.strokeRect(0, 0, WIDTH, HEIGHT);
  g.lineStyle(4, PAL.gold, 1);
  g.strokeRect(22, 22, WIDTH - 44, HEIGHT - 44);
  g.lineStyle(1.5, PAL.gold, 0.85);
  g.strokeRect(32, 32, WIDTH - 64, HEIGHT - 64);
  for (const [x, y] of [[22, 22], [WIDTH - 22, 22], [22, HEIGHT - 22], [WIDTH - 22, HEIGHT - 22]]) diamond(g, x, y, 11, PAL.gold);
}

/** Ink text for paper surfaces: El Messiri, ink colour, no glow. */
export function inkText(scene: Phaser.Scene, x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: HEAD_FONT,
      color: CSS.ink,
      align: "center",
      ...style,
    })
    .setRTL(true)
    .setOrigin(0.5);
}
