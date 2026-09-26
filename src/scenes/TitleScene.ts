import Phaser from "phaser";
import { CardView } from "./CardView";
import { HOME_ART, addAmbience, addCameraGrade, paintBackdrop } from "./fx";
import { CENTER_X, HEIGHT, WIDTH } from "./layout";
import { MENU_FONT, arabicText, makeButton, preloadUi } from "./ui";

/**
 * The home screen: the engraved diwaniya door at night (public/assets/bg/home.webp), the title
 * in Ruqaa, a small fan of the deck's cards, and the way in.
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  preload(): void {
    preloadUi(this);
  }

  create(): void {
    if (this.textures.exists(HOME_ART)) {
      this.add.image(WIDTH / 2, HEIGHT / 2, HOME_ART).setDisplaySize(WIDTH, HEIGHT);
      // A soft darkening at the top and bottom so the title and the button read over the art.
      const g = this.add.graphics();
      g.fillGradientStyle(0x0b1330, 0x0b1330, 0x0b1330, 0x0b1330, 0.55, 0.55, 0, 0);
      g.fillRect(0, 0, WIDTH, 420);
      g.fillGradientStyle(0x0b1330, 0x0b1330, 0x0b1330, 0x0b1330, 0, 0, 0.85, 0.85);
      g.fillRect(0, HEIGHT - 520, WIDTH, 520);
    } else {
      paintBackdrop(this);
    }
    addAmbience(this);
    addCameraGrade(this);

    arabicText(this, CENTER_X, 410, "ليلة الأربعين", {
      fontFamily: MENU_FONT,
      fontSize: "42px",
      color: "#f3e9d6",
      shadow: { offsetX: 0, offsetY: 3, color: "rgba(0,0,0,0.7)", blur: 8, fill: true },
    });
    const title = arabicText(this, CENTER_X, 250, "المعزّب", {
      fontFamily: MENU_FONT,
      fontSize: "150px",
      color: "#f2c96b",
      stroke: "#281e19",
      strokeThickness: 12,
      shadow: { offsetX: 0, offsetY: 6, color: "rgba(0,0,0,0.6)", blur: 0, fill: true, stroke: true },
    });
    title.setPadding(0, 30, 0, 30);

    // Three cards fanned low over the door's step: the deck is the first thing you meet.
    const fanY = HEIGHT - 470;
    const fan: Array<[CardView, number]> = [
      [new CardView(this, CENTER_X - 120, fanY + 18, { suit: "S", rank: "A" }, true, 0.9), -14],
      [new CardView(this, CENTER_X + 120, fanY + 18, { suit: "D", rank: "J" }, true, 0.9), 14],
      [new CardView(this, CENTER_X, fanY, { suit: "H", rank: "K" }, true, 1), 0],
    ];
    fan.forEach(([card, angle], i) => {
      card.setAngle(angle).setAlpha(0);
      this.tweens.add({ targets: card, alpha: 1, y: card.y - 12, delay: 200 + i * 120, duration: 420, ease: "Cubic.Out" });
    });

    makeButton(this, CENTER_X, HEIGHT - 230, "ادخل الديوانية", () => this.scene.start("map"), { width: 460, height: 104, plate: "burgundy" });
    arabicText(this, CENTER_X, HEIGHT - 120, "الأبواب مفتوحة حتى الفجر", { fontSize: "26px", color: "#d9c9a8" });
  }
}
