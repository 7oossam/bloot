import Phaser from "phaser";
import { getJokerDef } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import { MAX_JOKERS } from "../roguelike/types";
import { HEIGHT, WIDTH } from "./layout";
import { arabicText, makeButton } from "./ui";

/** A simple shop node: spend gold on jokers before continuing the run. Cards stack vertically for phone width. */
export class ShopScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private cardsLayer!: Phaser.GameObjects.Container;

  constructor() {
    super("shop");
  }

  create(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1a1230).setOrigin(0);
    arabicText(this, WIDTH / 2, 84, "المتجر", { fontSize: "46px" });
    this.goldText = arabicText(this, WIDTH / 2, 150, "", { fontSize: "26px", color: "#ffd54a" });
    this.cardsLayer = this.add.container(0, 0);

    this.refresh();

    makeButton(this, WIDTH / 2, HEIGHT - 110, "متابعة الرحلة", () => {
      runController.leaveShopNode();
      this.scene.start("map");
    });
  }

  private refresh(): void {
    this.cardsLayer.removeAll(true);
    const state = runController.getState();
    this.goldText.setText(`ذهبك: ${state.gold}   —   جوكرزك: ${state.jokerIds.length}/${MAX_JOKERS}`);

    const offering = runController.shopOffering();
    const cardWidth = WIDTH - 120;
    const cardHeight = 270;
    const spacing = 34;
    const startY = 230;

    if (offering.length === 0) {
      this.cardsLayer.add(arabicText(this, WIDTH / 2, HEIGHT / 2, "اشتريت كل الجوكرز المتاحة!", { fontSize: "30px" }));
      return;
    }

    offering.forEach((id, i) => {
      const def = getJokerDef(id)!;
      const x = WIDTH / 2;
      const y = startY + i * (cardHeight + spacing) + cardHeight / 2;
      const affordable = runController.canAfford(id);

      const bg = this.add.graphics();
      bg.fillStyle(0x241a3f, 1);
      bg.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 24);
      bg.lineStyle(4, affordable ? 0xffd54a : 0x554a77, 1);
      bg.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 24);

      const card = this.add.container(x, y, [bg]);
      card.add(arabicText(this, -cardWidth / 2 + 190, -80, def.name, { fontSize: "32px" }));
      card.add(
        arabicText(this, -cardWidth / 2 + 190, -14, def.description, {
          fontSize: "24px",
          color: "#cfc8e0",
          align: "right",
          wordWrap: { width: cardWidth - 260 },
        }),
      );
      card.add(arabicText(this, -cardWidth / 2 + 190, 66, `${def.cost} ذهب`, { fontSize: "26px", color: "#ffd54a" }));

      const btn = makeButton(
        this,
        cardWidth / 2 - 95,
        0,
        "شراء",
        () => {
          if (!runController.canAfford(id)) return;
          runController.buyJoker(id);
          this.refresh();
        },
        { color: affordable ? 0x1f6f43 : 0x3a3a3a, width: 150, height: 74, fontSize: "26px" },
      );
      card.add(btn.container);

      this.cardsLayer.add(card);
    });
  }
}
