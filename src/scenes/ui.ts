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
  opts: { width?: number; height?: number; color?: number; textColor?: string } = {},
): ButtonHandle {
  const width = opts.width ?? 140;
  const height = opts.height ?? 44;
  const color = opts.color ?? 0x1f6f43;

  const bg = scene.add.graphics();
  bg.fillStyle(color, 1);
  bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
  bg.lineStyle(2, 0xffffff, 0.4);
  bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);

  const text = arabicText(scene, 0, 0, label, { fontSize: "18px", color: opts.textColor ?? "#ffffff" });

  const container = scene.add.container(x, y, [bg, text]);
  container.setSize(width, height);
  container.setInteractive(
    new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
    Phaser.Geom.Rectangle.Contains,
  );
  container.input!.cursor = "pointer";
  container.on("pointerover", () => bg.setAlpha(0.85));
  container.on("pointerout", () => bg.setAlpha(1));
  container.on("pointerdown", onClick);

  return { container, destroy: () => container.destroy() };
}
