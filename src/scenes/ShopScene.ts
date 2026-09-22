import Phaser from "phaser";
import { getJokerDef } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import { MAX_JOKERS } from "../roguelike/types";
import { HEIGHT, WIDTH } from "./layout";
import { arabicText, makeButton } from "./ui";

/** A simple shop node: spend gold on jokers before continuing the run. */
export class ShopScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private cardsLayer!: Phaser.GameObjects.Container;

  constructor() {
    super("shop");
  }

  create(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1a1230).setOrigin(0);
    arabicText(this, WIDTH / 2, 50, "المتجر", { fontSize: "28px" });
    this.goldText = arabicText(this, WIDTH / 2, 90, "", { fontSize: "16px", color: "#ffd54a" });
    this.cardsLayer = this.add.container(0, 0);

    this.refresh();

    makeButton(this, WIDTH / 2, HEIGHT - 70, "متابعة الرحلة", () => {
      runController.leaveShopNode();
      this.scene.start("map");
    });
  }

  private refresh(): void {
    this.cardsLayer.removeAll(true);
    const state = runController.getState();
    this.goldText.setText(`ذهبك: ${state.gold}   —   جوكرزك: ${state.jokerIds.length}/${MAX_JOKERS}`);

    const offering = runController.shopOffering();
    const cardWidth = 220;
    const spacing = 240;
    const startX = WIDTH / 2 - ((offering.length - 1) * spacing) / 2;

    if (offering.length === 0) {
      this.cardsLayer.add(
        arabicText(this, WIDTH / 2, HEIGHT / 2, "اشتريت كل الجوكرز المتاحة!", { fontSize: "16px" }),
      );
      return;
    }

    offering.forEach((id, i) => {
      const def = getJokerDef(id)!;
      const x = startX + i * spacing;
      const y = HEIGHT / 2 - 20;
      const affordable = runController.canAfford(id);

      const bg = this.add.graphics();
      bg.fillStyle(0x241a3f, 1);
      bg.fillRoundedRect(-cardWidth / 2, -140, cardWidth, 260, 12);
      bg.lineStyle(2, affordable ? 0xffd54a : 0x554a77, 1);
      bg.strokeRoundedRect(-cardWidth / 2, -140, cardWidth, 260, 12);

      const card = this.add.container(x, y, [bg]);
      card.add(arabicText(this, 0, -100, def.name, { fontSize: "18px" }));
      card.add(
        arabicText(this, 0, -50, def.description, {
          fontSize: "13px",
          color: "#cfc8e0",
          wordWrap: { width: cardWidth - 30 },
        }),
      );
      card.add(arabicText(this, 0, 40, `${def.cost} ذهب`, { fontSize: "16px", color: "#ffd54a" }));

      const btn = makeButton(
        this,
        0,
        95,
        "شراء",
        () => {
          if (!runController.canAfford(id)) return;
          runController.buyJoker(id);
          this.refresh();
        },
        { color: affordable ? 0x1f6f43 : 0x3a3a3a },
      );
      card.add(btn.container);

      this.cardsLayer.add(card);
    });
  }
}
