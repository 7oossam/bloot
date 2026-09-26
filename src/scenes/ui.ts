import Phaser from "phaser";
import { RANKS, SUITS, type Rank, type Suit } from "../engine/types";

const ARABIC_FONT = "Tajawal, Tahoma, 'Segoe UI', Arial, sans-serif";
export const MENU_FONT = "'Aref Ruqaa', Amiri, Tajawal, serif";

export function arabicText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: ARABIC_FONT,
      color: "#ffffff",
      align: "center",
      // A soft dark halo keeps text readable over the lit sky and the table.
      shadow: { offsetX: 0, offsetY: 2, color: "rgba(20,10,8,0.65)", blur: 6, fill: true },
      ...style,
    })
    .setRTL(true)
    .setOrigin(0.5);
}

export interface ButtonHandle {
  container: Phaser.GameObjects.Container;
  destroy: () => void;
}

/**
 * Two kinds of button (docs/art-direction.md, review/ui-buttons.html):
 * - "menu": an illustrated plate (generated art, ornaments at both ends, a plain middle that
 *   stretches), labelled in Aref Ruqaa like the card index: gold with an ink edge on dark plates,
 *   a deep colour with a gold edge on light ones. For continue/start/shop/event choices.
 * - "play": a plain colour tile with one gold line and a big Tajawal label, coloured by meaning
 *   so it reads at a glance during a hand. For buying, doubling, سوا, تخطّي, ترتيب.
 */
export type MenuTone = "burgundy" | "sun" | "navy" | "teal" | "paper" | "olive";
export type PlayTone = "sun" | "hokum" | "ashkal" | "pass" | "sawa" | "double" | "quiet";

/** Source plate sizes in public/assets/ui: `slice` = width of each ornamented end. */
const PLATES: Record<MenuTone, { w: number; h: number; slice: number }> = {
  burgundy: { w: 643, h: 128, slice: 142 },
  sun: { w: 629, h: 128, slice: 150 },
  navy: { w: 603, h: 128, slice: 149 },
  teal: { w: 622, h: 128, slice: 147 },
  paper: { w: 581, h: 128, slice: 96 },
  olive: { w: 609, h: 128, slice: 132 },
};
const LIGHT_PLATES: ReadonlySet<MenuTone> = new Set(["sun", "paper"]);
const plateKey = (tone: MenuTone) => `ui-plate-${tone}`;

/** Queue the menu plates; call from every scene's preload(). Textures are global, so this loads once. */
export function preloadUi(scene: Phaser.Scene): void {
  for (const tone of Object.keys(PLATES) as MenuTone[]) {
    if (!scene.textures.exists(plateKey(tone))) scene.load.image(plateKey(tone), `assets/ui/plate-${tone}.webp`);
  }
  // The deck: 32 finished faces (index, pips and crest baked in) and the engraved back.
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const key = cardArtKey(suit, rank);
      if (!scene.textures.exists(key)) scene.load.image(key, `assets/cards/${suit}-${rank}.webp`);
    }
  }
  if (!scene.textures.exists(CARD_BACK_ART)) scene.load.image(CARD_BACK_ART, "assets/cards/back.webp");
  if (!scene.textures.exists("bg-table")) scene.load.image("bg-table", "assets/bg/table.webp");
  if (!scene.textures.exists("bg-home")) scene.load.image("bg-home", "assets/bg/home.webp");
}

/** Texture key of a card's finished face (see public/assets/cards). */
export const cardArtKey = (suit: Suit, rank: Rank) => `card-${suit}-${rank}`;
export const CARD_BACK_ART = "card-back";

const PLAY_TONES: Record<PlayTone, { fill: number; alpha: number; text: string; border: number; line: number; shadow: boolean }> = {
  sun: { fill: 0xe3a33b, alpha: 1, text: "#281e19", border: 0xd6a44a, line: 3, shadow: true },
  hokum: { fill: 0x1c2b4a, alpha: 1, text: "#faf7f0", border: 0xd6a44a, line: 3, shadow: true },
  ashkal: { fill: 0x2d4a4d, alpha: 1, text: "#faf7f0", border: 0xd6a44a, line: 3, shadow: true },
  pass: { fill: 0xfaf7f0, alpha: 1, text: "#281e19", border: 0xbda57a, line: 3, shadow: true },
  sawa: { fill: 0x3e4a2a, alpha: 1, text: "#faf7f0", border: 0xd6a44a, line: 3, shadow: true },
  double: { fill: 0x5e1f24, alpha: 1, text: "#faf7f0", border: 0xd6a44a, line: 3, shadow: true },
  quiet: { fill: 0xfaf7f0, alpha: 0.07, text: "#f0cb7a", border: 0xd6a44a, line: 2, shadow: false },
};

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: string;
  /** "menu" (default) draws an illustrated plate; "play" draws a plain tile. */
  kind?: "menu" | "play";
  /** Menu plate colour (default burgundy). */
  plate?: MenuTone;
  /** Play tile colour by meaning (default hokum/navy). */
  tone?: PlayTone;
  /** Greyed out and not clickable. */
  disabled?: boolean;
}

/** The colour a bidding/doubling choice gets, from its label. */
export function playToneFor(label: string): PlayTone {
  if (label.startsWith("صن")) return "sun";
  if (label.startsWith("أشكل")) return "ashkal";
  if (label === "بس" || label === "ولا") return "pass";
  if (label.startsWith("حكم")) return "hokum";
  return "double";
}

/** A clickable button with Arabic-shaped text; see ButtonOptions for the two kinds. */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: ButtonOptions = {},
): ButtonHandle {
  const width = opts.width ?? 280;
  const height = opts.height ?? 84;
  const plate = opts.plate ?? "burgundy";
  const menu = (opts.kind ?? "menu") === "menu" && scene.textures.exists(plateKey(plate));
  const parts: Phaser.GameObjects.GameObject[] = [];
  let face: Phaser.GameObjects.GameObject;

  if (menu) {
    // 3-slice at the plate's own height, then scaled, so the ornamented ends keep their shape.
    const src = PLATES[plate];
    const k = height / src.h;
    const w = Math.max(width / k, src.slice * 2 + 8);
    const ns = scene.add.nineslice(0, 0, plateKey(plate), undefined, w, src.h, src.slice, src.slice, 0, 0);
    ns.setScale(k);
    face = ns;
    parts.push(ns);
  } else {
    const t = PLAY_TONES[opts.tone ?? "hokum"];
    const r = Math.min(16, height * 0.19);
    const g = scene.add.graphics();
    if (t.shadow) {
      g.fillStyle(0x0a0502, 0.55);
      g.fillRoundedRect(-width / 2, -height / 2 + 6, width, height, r);
    }
    g.fillStyle(t.fill, t.alpha);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, r);
    g.lineStyle(t.line, t.border, 1);
    g.strokeRoundedRect(-width / 2 + t.line / 2, -height / 2 + t.line / 2, width - t.line, height - t.line, r);
    face = g;
    parts.push(g);
  }

  let text: Phaser.GameObjects.Text;
  if (menu) {
    const light = LIGHT_PLATES.has(plate);
    text = arabicText(scene, 0, -height * 0.02, label, {
      fontFamily: MENU_FONT,
      fontSize: opts.fontSize ?? `${Math.round(height * 0.4)}px`,
      color: light ? (plate === "sun" ? "#5e1f24" : "#281e19") : "#f2c96b",
      stroke: light ? "#d6a44a" : "#281e19",
      strokeThickness: Math.max(3, Math.round(height * 0.06)),
      shadow: light
        ? { offsetX: 0, offsetY: 2, color: "rgba(255,244,220,0.75)", blur: 0, fill: true, stroke: true }
        : { offsetX: 0, offsetY: 2, color: "rgba(0,0,0,0.55)", blur: 0, fill: true, stroke: true },
    });
    // Keep a long label inside the plain middle of the plate.
    const room = width - 2 * PLATES[plate].slice * (height / PLATES[plate].h) * 0.55;
    if (text.width > room) text.setScale(Math.max(0.6, room / text.width));
  } else {
    const t = PLAY_TONES[opts.tone ?? "hokum"];
    text = arabicText(scene, 0, -1, label, {
      fontFamily: ARABIC_FONT,
      fontSize: opts.fontSize ?? `${Math.round(height * 0.43)}px`,
      fontStyle: "800",
      color: t.text,
      shadow: { offsetX: 0, offsetY: 0, color: "rgba(0,0,0,0)", blur: 0, fill: false },
    });
    if (text.width > width - 20) text.setScale((width - 20) / text.width);
  }
  parts.push(text);

  const container = scene.add.container(x, y, parts);
  const pressY = menu ? 3 : 5;
  if (opts.disabled) {
    container.setAlpha(0.5);
    if (face instanceof Phaser.GameObjects.NineSlice) face.setTint(0x8a8a8a);
    return { container, destroy: () => container.destroy() };
  }

  setBoxHitArea(container, width, height);
  container.input!.cursor = "pointer";
  container.on("pointerover", () => scene.tweens.add({ targets: container, scale: 1.04, duration: 100 }));
  container.on("pointerout", () => scene.tweens.add({ targets: container, scale: 1, duration: 100 }));
  container.on("pointerdown", () => {
    // A quick press-down reads as "this responded" before onClick possibly tears the button
    // down (e.g. bidding/continue buttons destroy themselves).
    scene.tweens.add({ targets: parts, y: `+=${pressY}`, duration: 70, yoyo: true, ease: "Quad.Out" });
    onClick();
  });

  container.setScale(0.85);
  container.setAlpha(0);
  scene.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 160, ease: "Back.Out" });

  return { container, destroy: () => container.destroy() };
}

/**
 * Give a Container a hit area matching the box it draws around its own origin.
 *
 * Phaser normalises the hit test by the object's display origin
 * (`pointWithinHitArea` does `x += gameObject.displayOriginX`), and `setSize(w, h)` on a
 * Container sets that origin to (w/2, h/2). So the rectangle has to be expressed from the
 * TOP-LEFT as (0, 0, w, h) — passing (-w/2, -h/2, w, h), which is what the drawing code
 * uses, shifts the whole tappable area half a box up and to the left. That is why taps on
 * the lower-right of a button did nothing and why tapping a card played its left neighbour.
 */
export function setBoxHitArea(container: Phaser.GameObjects.Container, width: number, height: number): void {
  container.setSize(width, height);
  container.setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
}
