import Phaser from "phaser";
import { MapScene } from "./scenes/MapScene";
import { ShopScene } from "./scenes/ShopScene";
import { RewardScene } from "./scenes/RewardScene";
import { TableScene } from "./scenes/TableScene";
import { HEIGHT, WIDTH } from "./scenes/layout";
import { runController } from "./roguelike/RunController";

function config(type: number): Phaser.Types.Core.GameConfig {
  return {
    type,
    parent: "app",
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: "#173a4a",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // Phaser allocates one touch pointer by default, so a finger left resting on the screen
    // occupies it and every other tap is ignored until it lifts. A couple of spare pointers
    // costs nothing and keeps the game responsive when a hand is holding the phone.
    input: {
      activePointers: 3,
      touch: true,
      mouse: true,
    },
    scene: [MapScene, TableScene, ShopScene, RewardScene],
  };
}

// Phaser draws text once, so the Arabic webfont has to be loaded before the first scene
// writes anything. Wait for it, but never more than a moment: offline, the fallback font is
// fine.
function fontsReady(): Promise<unknown> {
  const fonts = document.fonts;
  if (!fonts?.load) return Promise.resolve();
  const load = Promise.all([fonts.load('400 30px "Tajawal"'), fonts.load('700 30px "Tajawal"'), fonts.load('800 30px "Tajawal"'), fonts.load('700 30px "Aref Ruqaa"', "ابدأ")]);
  return Promise.race([load, new Promise((r) => setTimeout(r, 2500))]).catch(() => undefined);
}

// Phaser.AUTO prefers WebGL, which can fail on a real device (driver, low memory, or a
// blocked context) in ways a desktop/headless browser never shows. Fall back to the Canvas
// renderer rather than leaving the player staring at an empty page.
function boot(): Phaser.Game {
  try {
    return new Phaser.Game(config(Phaser.AUTO));
  } catch {
    return new Phaser.Game(config(Phaser.CANVAS));
  }
}

fontsReady().then(start);

function start(): void {
  const game = boot();

  // When the mobile URL bar slides in or out the visible viewport changes without a normal
  // resize, leaving Phaser with stale canvas bounds — which shifts where taps are thought to
  // land. Re-measure whenever the visual viewport moves.
  const vv = window.visualViewport;
  if (vv) {
    const refresh = () => game.scale.refresh();
    vv.addEventListener("resize", refresh);
    vv.addEventListener("scroll", refresh);
  }

  // Tells the boot diagnostics in index.html that the bundle loaded and the game started.
  // The game instance is exposed alongside it so an automated input test can ask the running
  // scene where a card actually is, instead of re-deriving the layout maths and testing its
  // own assumptions.
  (window as unknown as { __blootBooted?: boolean; __blootGame?: Phaser.Game }).__blootBooted = true;
  (window as unknown as { __blootGame?: Phaser.Game }).__blootGame = game;
  (window as unknown as { __blootRun?: typeof runController }).__blootRun = runController;
}
