import Phaser from "phaser";
import { getJokerDef, type Rarity } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import { MAX_JOKERS } from "../roguelike/types";
import { HEIGHT, WIDTH } from "./layout";
import { arabicText, makeButton } from "./ui";

const RARITY_STYLE: Record<Rarity, { border: number; label: string; text: string }> = {
  common: { border: 0x6fae8c, label: "عادي", text: "#9fd3b4" },
  rare: { border: 0x5b9bff, label: "نادر", text: "#9cc3ff" },
  legendary: { border: 0xffb33a, label: "أسطوري", text: "#ffd27a" },
};

const CARD_H = 236;
const CARD_GAP = 22;
const FIRST_CARD_Y = 262;

/** A shop node: three random jokers and a consumable, with a reroll that gets pricier each use. */
export class ShopScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private ownedText!: Phaser.GameObjects.Text;
  private itemsLayer!: Phaser.GameObjects.Container;
  private rerollBtn?: ReturnType<typeof makeButton>;

  constructor() {
    super("shop");
  }

  create(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1a1230).setOrigin(0);
    arabicText(this, WIDTH / 2, 70, "المتجر", { fontSize: "46px" });
    this.goldText = arabicText(this, WIDTH / 2, 136, "", { fontSize: "27px", color: "#ffd54a" });
    this.ownedText = arabicText(this, WIDTH / 2, 190, "", {
      fontSize: "21px",
      color: "#cfc8e0",
      wordWrap: { width: WIDTH - 80 },
    });
    this.itemsLayer = this.add.container(0, 0);

    this.refresh();

    makeButton(this, WIDTH / 2, HEIGHT - 100, "متابعة الرحلة", () => {
      runController.leaveShopNode();
      this.scene.start("map");
    });
  }

  private refresh(): void {
    this.itemsLayer.removeAll(true);
    this.rerollBtn?.destroy();
    const state = runController.getState();

    const shields = state.shields > 0 ? `   🛡️ ${state.shields}` : "";
    this.goldText.setText(`💰 ${state.gold}   ❤️ ${state.lives}${shields}   —   جوكرز ${state.jokerIds.length}/${MAX_JOKERS}`);
    const owned = state.jokerIds.map((id) => `${getJokerDef(id)?.icon ?? ""} ${getJokerDef(id)?.name ?? id}`).join("   ");
    this.ownedText.setText(owned ? `معك: ${owned}` : "ما عندك جوكرز للحين");

    const offering = runController.shopOffering();
    if (offering.length === 0) {
      this.itemsLayer.add(arabicText(this, WIDTH / 2, 600, "خلصت البضاعة! جرّب تغيّرها 🎲", { fontSize: "30px" }));
    }
    offering.forEach((id, i) => this.drawItem(id, FIRST_CARD_Y + i * (CARD_H + CARD_GAP) + CARD_H / 2));

    const rerollY = FIRST_CARD_Y + 4 * (CARD_H + CARD_GAP) + 50;
    const canReroll = runController.canReroll();
    this.rerollBtn = makeButton(
      this,
      WIDTH / 2,
      rerollY,
      `🎲 غيّر البضاعة (${state.rerollCost} ذهب)`,
      () => {
        if (!runController.canReroll()) return;
        runController.reroll();
        this.cameras.main.flash(180, 90, 60, 160);
        this.refresh();
      },
      { width: 440, height: 76, fontSize: "26px", color: canReroll ? 0x5a3d99 : 0x3a3a3a },
    );
  }

  private drawItem(id: string, y: number): void {
    const def = getJokerDef(id)!;
    const style = RARITY_STYLE[def.rarity];
    const reason = runController.whyNot(id);
    const cardW = WIDTH - 90;

    const bg = this.add.graphics();
    bg.fillStyle(def.kind === "consumable" ? 0x2a1d3a : 0x241a3f, 1);
    bg.fillRoundedRect(-cardW / 2, -CARD_H / 2, cardW, CARD_H, 24);
    bg.lineStyle(def.rarity === "legendary" ? 6 : 4, style.border, reason ? 0.45 : 1);
    bg.strokeRoundedRect(-cardW / 2, -CARD_H / 2, cardW, CARD_H, 24);
    const card = this.add.container(WIDTH / 2, y, [bg]);

    // Layout: buy button on the left (RTL reading ends there), icon on the right, text between.
    const buttonW = 160;
    const buttonX = -cardW / 2 + 24 + buttonW / 2;
    const iconX = cardW / 2 - 70;
    const columnLeft = buttonX + buttonW / 2 + 24;
    const columnRight = iconX - 60;
    const textX = (columnLeft + columnRight) / 2;
    const textW = columnRight - columnLeft;

    card.add(this.add.text(iconX, -8, def.icon, { fontSize: "64px" }).setOrigin(0.5));
    const kindLabel = def.kind === "consumable" ? "يُستخدم مرة" : style.label;
    card.add(arabicText(this, iconX, 62, kindLabel, { fontSize: "19px", color: style.text }));

    card.add(arabicText(this, textX, -72, def.name, { fontSize: "31px" }));
    card.add(
      arabicText(this, textX, -6, def.description, {
        fontSize: "22px",
        color: "#d8d1ea",
        align: "center",
        wordWrap: { width: textW },
      }),
    );
    card.add(arabicText(this, textX, 74, `${def.cost} ذهب`, { fontSize: "25px", color: "#ffd54a" }));

    const btn = makeButton(
      this,
      buttonX,
      reason ? -14 : 0,
      "شراء",
      () => {
        if (runController.whyNot(id)) return;
        runController.buyJoker(id);
        this.celebrate(def.icon);
        this.refresh();
      },
      { color: reason ? 0x3a3a3a : 0x1f6f43, width: buttonW, height: 74, fontSize: "27px" },
    );
    card.add(btn.container);
    if (reason) card.add(arabicText(this, buttonX, 50, reason, { fontSize: "18px", color: "#b9a9c9" }));

    if (def.rarity === "legendary" && !reason) {
      this.tweens.add({ targets: bg, alpha: 0.75, duration: 700, yoyo: true, repeat: -1, ease: "Sine.InOut" });
    }
    this.itemsLayer.add(card);
  }

  /** A quick burst of the item's icon so a purchase feels like getting something. */
  private celebrate(icon: string): void {
    const pop = this.add.text(WIDTH / 2, HEIGHT / 2, icon, { fontSize: "120px" }).setOrigin(0.5).setDepth(50);
    this.tweens.add({
      targets: pop,
      scale: 2.2,
      alpha: 0,
      duration: 650,
      ease: "Cubic.Out",
      onComplete: () => pop.destroy(),
    });
    this.cameras.main.shake(120, 0.004);
  }
}
