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
    arabicText(this, WIDTH / 2, 40, "المتجر", { fontSize: "24px" });
    this.goldText = arabicText(this, WIDTH / 2, 74, "", { fontSize: "13px", color: "#ffd54a" });
    this.cardsLayer = this.add.container(0, 0);

    this.refresh();

    makeButton(this, WIDTH / 2, HEIGHT - 50, "متابعة الرحلة", () => {
      runController.leaveShopNode();
      this.scene.start("map");
    });
  }

  private refresh(): void {
    this.cardsLayer.removeAll(true);
    const state = runController.getState();
    this.goldText.setText(`ذهبك: ${state.gold}   —   جوكرزك: ${state.jokerIds.length}/${MAX_JOKERS}`);

    const offering = runController.shopOffering();
    const cardWidth = WIDTH - 60;
    const cardHeight = 130;
    const spacing = 16;
    const startY = 110;

    if (offering.length === 0) {
      this.cardsLayer.add(arabicText(this, WIDTH / 2, HEIGHT / 2, "اشتريت كل الجوكرز المتاحة!", { fontSize: "15px" }));
      return;
    }

    offering.forEach((id, i) => {
      const def = getJokerDef(id)!;
      const x = WIDTH / 2;
      const y = startY + i * (cardHeight + spacing) + cardHeight / 2;
      const affordable = runController.canAfford(id);

      const bg = this.add.graphics();
      bg.fillStyle(0x241a3f, 1);
      bg.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 12);
      bg.lineStyle(2, affordable ? 0xffd54a : 0x554a77, 1);
      bg.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 12);

      const card = this.add.container(x, y, [bg]);
      card.add(arabicText(this, -cardWidth / 2 + 90, -38, def.name, { fontSize: "16px" }));
      card.add(
        arabicText(this, -cardWidth / 2 + 90, -8, def.description, {
          fontSize: "12px",
          color: "#cfc8e0",
          align: "right",
          wordWrap: { width: cardWidth - 120 },
        }),
      );
      card.add(arabicText(this, -cardWidth / 2 + 90, 28, `${def.cost} ذهب`, { fontSize: "13px", color: "#ffd54a" }));

      const btn = makeButton(
        this,
        cardWidth / 2 - 45,
        0,
        "شراء",
        () => {
          if (!runController.canAfford(id)) return;
          runController.buyJoker(id);
          this.refresh();
        },
        { color: affordable ? 0x1f6f43 : 0x3a3a3a, width: 76, height: 36, fontSize: "13px" },
      );
      card.add(btn.container);

      this.cardsLayer.add(card);
    });
  }
}
