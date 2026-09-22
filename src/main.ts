import Phaser from "phaser";
import { MapScene } from "./scenes/MapScene";
import { ShopScene } from "./scenes/ShopScene";
import { TableScene } from "./scenes/TableScene";
import { HEIGHT, WIDTH } from "./scenes/layout";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#0b3d2e",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MapScene, TableScene, ShopScene],
});

// Tells the boot-recovery guard in index.html that the bundle actually loaded.
(window as unknown as { __blootBooted?: boolean }).__blootBooted = true;
