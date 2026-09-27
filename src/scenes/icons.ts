import Phaser from "phaser";
import { ICON_PATHS } from "./iconPaths";

/**
 * The game's icons: engraved one-colour objects from game-icons.net (CC BY 3.0), drawn from
 * their vector paths — ink on the paper screens, gold on the table. Items keep their icon's
 * name in their `icon` field; run scripts/icons/build-icons.mjs after adding a new one.
 */
export const UI_ICON = {
  lives: "candle-light",
  shield: "shield",
  gold: "two-coins",
  reroll: "rolling-dices",
  qahwa: "coffee-cup",
  crown: "crown",
  boost: "lightning-arc",
  gift: "open-treasure-chest",
  interest: "money-stack",
  salary: "cash",
  ticket: "ticket",
  notes: "notebook",
  narrator: "scroll-unfurled",
} as const;

export const INK = 0x221a16;
export const GOLD = 0xf0cb7a;

/** Texture size: icons are drawn once at this size and scaled down, so they stay crisp. */
const TEX = 128;

function textureFor(scene: Phaser.Scene, name: string, color: number): string {
  const key = `icon:${name}:${color.toString(16)}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, TEX, TEX)!;
  const ctx = tex.getContext();
  ctx.scale(TEX / 512, TEX / 512);
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  const paths = ICON_PATHS[name];
  if (paths) for (const d of paths) ctx.fill(new Path2D(d));
  else {
    // An unknown name draws the deck's diamond rather than nothing.
    ctx.beginPath();
    ctx.moveTo(256, 96);
    ctx.lineTo(416, 256);
    ctx.lineTo(256, 416);
    ctx.lineTo(96, 256);
    ctx.fill();
  }
  tex.refresh();
  return key;
}

/** An icon `size` px across, centred on (x, y). */
export function addIcon(scene: Phaser.Scene, x: number, y: number, name: string, size: number, color: number = INK): Phaser.GameObjects.Image {
  return scene.add.image(x, y, textureFor(scene, name, color)).setDisplaySize(size, size);
}

/**
 * A row of icons centred on (x, y), right to left like the reading order, each with an optional
 * mark under-right (a level's stars). Returns the container.
 */
export function iconRow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  items: { icon: string; mark?: string }[],
  opts: { size?: number; gap?: number; color?: number; markColor?: string } = {},
): Phaser.GameObjects.Container {
  const size = opts.size ?? 40;
  const gap = opts.gap ?? 14;
  const row = scene.add.container(x, y);
  const step = size + gap;
  items.forEach((it, i) => {
    const ix = ((items.length - 1) / 2 - i) * step;
    row.add(addIcon(scene, ix, 0, it.icon, size, opts.color ?? INK));
    if (it.mark) {
      row.add(
        scene.add
          .text(ix + size * 0.42, size * 0.42, it.mark, { fontFamily: "Tajawal, Arial", fontSize: `${Math.round(size * 0.42)}px`, fontStyle: "800", color: opts.markColor ?? "#9e1b26" })
          .setOrigin(0.5),
      );
    }
  });
  return row;
}
