import Phaser from "phaser";

const ARABIC_FONT = "Tahoma, 'Segoe UI', Arial, sans-serif";

export function arabicText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, { fontFamily: ARABIC_FONT, color: "#ffffff", align: "center", ...style })
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
  const color = opts.color ?? 0x1f6f43;

  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.25);
  bg.fillRoundedRect(-width / 2 + 3, -height / 2 + 5, width, height, 18);
  bg.fillStyle(color, 1);
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, 18);
  bg.lineStyle(3, 0xffffff, 0.45);
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 18);

  const text = arabicText(scene, 0, 0, label, {
    fontSize: opts.fontSize ?? "30px",
    color: opts.textColor ?? "#ffffff",
  });

  const container = scene.add.container(x, y, [bg, text]);
  setBoxHitArea(container, width, height);
  container.input!.cursor = "pointer";
  container.on("pointerover", () => bg.setAlpha(0.85));
  container.on("pointerout", () => bg.setAlpha(1));
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
