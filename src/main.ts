import Phaser from "phaser";
import { MapScene } from "./scenes/MapScene";
import { ShopScene } from "./scenes/ShopScene";
import { TableScene } from "./scenes/TableScene";
import { HEIGHT, WIDTH } from "./scenes/layout";

function config(type: number): Phaser.Types.Core.GameConfig {
  return {
    type,
    parent: "app",
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: "#0b3d2e",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [MapScene, TableScene, ShopScene],
  };
}

// Phaser.AUTO prefers WebGL, which can fail on a real device (driver, low memory, or a
// blocked context) in ways a desktop/headless browser never shows. Fall back to the Canvas
// renderer rather than leaving the player staring at an empty page.
try {
  new Phaser.Game(config(Phaser.AUTO));
} catch {
  new Phaser.Game(config(Phaser.CANVAS));
}

// Tells the boot diagnostics in index.html that the bundle loaded and the game started.
(window as unknown as { __blootBooted?: boolean }).__blootBooted = true;
