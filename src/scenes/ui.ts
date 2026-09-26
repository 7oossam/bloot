import Phaser from "phaser";

const ARABIC_FONT = "Tajawal, Tahoma, 'Segoe UI', Arial, sans-serif";

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

/** A simple rounded, clickable button with Arabic-shaped text. */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { width?: number; height?: number; color?: number; textColor?: string; fontSize?: string } = {},
): ButtonHandle {
  const width = opts.width ?? 280;
  const height = opts.height ?? 84;
  const color = opts.color === undefined || opts.color === 0xd4af37 ? 0xe3a33b : opts.color;
  const light = color === 0xe3a33b;
  const textColor = opts.textColor ?? (light ? "#3a2620" : "#ffffff");

  // A raised tile: soft shadow, the face, a lighter upper half for depth, and a warm rim.
  const bg = scene.add.graphics();
  bg.fillStyle(0x140804, 0.35);
  bg.fillRoundedRect(-width / 2 + 2, -height / 2 + 7, width, height, 20);
  bg.fillStyle(color, 1);
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, 20);
  bg.fillStyle(0xffffff, 0.16);
  bg.fillRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height / 2 - 4, { tl: 16, tr: 16, bl: 6, br: 6 });
  bg.lineStyle(3, 0xfff1d6, 0.6);
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 20);

  const text = arabicText(scene, 0, 0, label, {
    fontSize: opts.fontSize ?? "30px",
    color: textColor,
    fontStyle: "bold",
    ...(light ? { shadow: { offsetX: 0, offsetY: 1, color: "rgba(255,241,214,0.5)", blur: 0, fill: true } } : {}),
  });

  const container = scene.add.container(x, y, [bg, text]);
  setBoxHitArea(container, width, height);
  container.input!.cursor = "pointer";
  container.on('pointerover', () => { bg.setAlpha(0.9); scene.tweens.add({ targets: container, scale: 1.05, duration: 100 }); });
  container.on('pointerout', () => { bg.setAlpha(1); scene.tweens.add({ targets: container, scale: 1, duration: 100 }); });
  container.on("pointerdown", () => {
    // A quick press-down squash reads as "this responded to your click" before onClick
    // possibly tears the button down (e.g. bidding/continue buttons destroy themselves).
    scene.tweens.add({ targets: container, scale: 0.92, duration: 70, yoyo: true, ease: "Quad.Out" });
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
