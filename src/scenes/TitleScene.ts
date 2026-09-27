import Phaser from "phaser";
import { HOME_ART, addAmbience, addCameraGrade, paintBackdrop } from "./fx";
import { CENTER_X, HEIGHT, WIDTH } from "./layout";
import { HEAD_FONT } from "./theme";
import { arabicText, makeButton, preloadUi } from "./ui";

const LOGO = "ui-logo";

/**
 * The home screen: the diwaniya on a far dune at sunset (public/assets/bg/home.webp), the game's
 * logo (public/assets/ui/logo.webp: a gold sun and key behind «المعزّب», «ليلة الأربعين» under a
 * gold rule), and the way in.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  preload(): void {
    preloadUi(this);
    if (!this.textures.exists(LOGO)) this.load.image(LOGO, "assets/ui/logo.webp");
  }

  create(): void {
    if (this.textures.exists(HOME_ART)) {
      this.add.image(WIDTH / 2, HEIGHT / 2, HOME_ART).setDisplaySize(WIDTH, HEIGHT);
      // The dunes run dark at the foot of the art: a soft lift keeps the button's gold readable.
      const g = this.add.graphics();
      g.fillGradientStyle(0x2a1208, 0x2a1208, 0x2a1208, 0x2a1208, 0, 0, 0.55, 0.55);
      g.fillRect(0, HEIGHT - 460, WIDTH, 460);
    } else {
      paintBackdrop(this);
    }
    addAmbience(this);
    addCameraGrade(this);

    if (this.textures.exists(LOGO)) {
      const logo = this.add.image(CENTER_X, 250, LOGO);
      logo.setScale((WIDTH * 0.98) / logo.width).setAlpha(0);
      this.tweens.add({ targets: logo, alpha: 1, y: 240, duration: 700, ease: "Cubic.Out" });
    }

    makeButton(this, CENTER_X, HEIGHT - 250, "ادخل الديوانية", () => this.scene.start("map"), { width: 500, height: 116, plate: "burgundy" });
    arabicText(this, CENTER_X, HEIGHT - 140, "الأبواب مفتوحة حتى الفجر", { fontFamily: HEAD_FONT, fontSize: "30px", color: "#f2e3c2" });
  }
}
