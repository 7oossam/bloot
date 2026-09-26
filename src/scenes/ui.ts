import Phaser from "phaser";
import { RANKS, SUITS, type Rank, type Suit } from "../engine/types";
import { HEAD_FONT, PAL, diamond } from "./theme";

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
 * - "menu": a pill in the menu's colour with a double gold rim and gold diamonds, labelled in
 *   El Messiri (the title screen's button). For continue/start/shop/event choices.
 * - "play": a plain colour tile with one gold line and a big Tajawal label, coloured by meaning
 *   so it reads at a glance during a hand. For buying, doubling, سوا, تخطّي, ترتيب.
 */
export type MenuTone = "burgundy" | "sun" | "navy" | "teal" | "paper" | "olive";
export type PlayTone = "sun" | "hokum" | "ashkal" | "pass" | "sawa" | "double" | "quiet";

/** Menu button colours: a lit upper face over a deeper base, and the label colour. */
const MENU_TONES: Record<MenuTone, { fill: number; deep: number; text: string }> = {
  burgundy: { fill: 0x9a4226, deep: 0x5e2014, text: "#fbe3a8" },
  teal: { fill: 0x2a5e62, deep: 0x16393c, text: "#f6dfa5" },
  navy: { fill: 0x2b3c5e, deep: 0x16213a, text: "#f6dfa5" },
  olive: { fill: 0x55633a, deep: 0x2e3820, text: "#f6dfa5" },
  sun: { fill: 0xf0c36a, deep: 0xb07d2a, text: "#3a1a10" },
  paper: { fill: 0xfaf3e3, deep: 0xe0cfa8, text: "#9e1b26" },
};

/** Queue the shared art (deck, backgrounds); call from every scene's preload(). Textures are global, so this loads once. */
export function preloadUi(scene: Phaser.Scene): void {
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
  /** "menu" (default) draws the gold-rimmed pill; "play" draws a plain tile. */
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
  const menu = (opts.kind ?? "menu") === "menu";
  const parts: Phaser.GameObjects.GameObject[] = [];

  if (menu) {
    // A pill of the menu's colour with a double gold rim, like the title screen's button.
    const m = MENU_TONES[plate];
    const r = height / 2;
    const g = scene.add.graphics();
    g.fillStyle(0x140804, 0.45);
    g.fillRoundedRect(-width / 2 + 2, -height / 2 + 7, width, height, r);
    g.fillStyle(m.deep, 1);
    g.fillRoundedRect(-width / 2, -height / 2, width, height, r);
    g.fillStyle(m.fill, 1);
    g.fillRoundedRect(-width / 2 + 3, -height / 2 + 3, width - 6, height * 0.62, { tl: r - 3, tr: r - 3, bl: r * 0.4, br: r * 0.4 });
    g.lineStyle(3, PAL.gold, 1);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, r);
    g.lineStyle(1.5, PAL.gold, 0.85);
    g.strokeRoundedRect(-width / 2 + 7, -height / 2 + 7, width - 14, height - 14, r - 7);
    for (const sx of [-1, 1]) diamond(g, sx * (width / 2 - r * 0.62), 0, Math.max(5, height * 0.08), PAL.gold);
    parts.push(g);
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
    parts.push(g);
  }

  let text: Phaser.GameObjects.Text;
  if (menu) {
    const m = MENU_TONES[plate];
    text = arabicText(scene, 0, -height * 0.03, label, {
      fontFamily: HEAD_FONT,
      fontSize: opts.fontSize ?? `${Math.round(height * 0.38)}px`,
      fontStyle: "700",
      color: m.text,
      shadow: { offsetX: 0, offsetY: 2, color: "rgba(20,8,4,0.55)", blur: 0, fill: true },
    });
    const room = width - height * 1.3;
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
