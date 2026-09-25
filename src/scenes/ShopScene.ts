import Phaser from "phaser";
import { activeSynergies, getJokerDef, maxLevel, type Rarity } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import { HEIGHT, WIDTH } from "./layout";
import { arabicText, makeButton, setBoxHitArea } from "./ui";

const RARITY_STYLE: Record<Rarity, { border: number; label: string; text: string }> = {
  common: { border: 0x6fae8c, label: "عادي", text: "#9fd3b4" },
  rare: { border: 0x5b9bff, label: "نادر", text: "#9cc3ff" },
  legendary: { border: 0xffb33a, label: "أسطوري", text: "#ffd27a" },
};

const MAX_CARD_H = 236;
const CARD_GAP = 18;
const FIRST_CARD_Y = 330;
/** Your jokers, as tappable chips (tap to sell). */
const OWNED_Y = 200;
const OWNED_CHIP_W = 118;
/** Everything on the shelf fits between FIRST_CARD_Y and here, however many items there are. */
const SHELF_BOTTOM = 1530;
const REROLL_Y = 1600;

/**
 * A shop node: random jokers (new ones or levels for yours), a consumable and a run upgrade,
 * with a reroll that gets pricier each use. Your own jokers sit on top as chips — tap one to
 * sell it for half its worth.
 */
export class ShopScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private ownedText!: Phaser.GameObjects.Text;
  private itemsLayer!: Phaser.GameObjects.Container;
  private ownedLayer!: Phaser.GameObjects.Container;
  private dialog?: Phaser.GameObjects.Container;
  private rerollBtn?: ReturnType<typeof makeButton>;

  constructor() {
    super("shop");
  }

  create(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x2a1a3a).setOrigin(0);
    arabicText(this, WIDTH / 2, 58, "المتجر", { fontSize: "44px" });
    this.goldText = arabicText(this, WIDTH / 2, 118, "", { fontSize: "26px", color: "#ffd54a" });
    this.ownedText = arabicText(this, WIDTH / 2, 268, "", {
      fontSize: "21px",
      color: "#cfc8e0",
      wordWrap: { width: WIDTH - 80 },
    });
    this.itemsLayer = this.add.container(0, 0);
    this.ownedLayer = this.add.container(0, 0);

    this.refresh();

    makeButton(this, WIDTH / 2, HEIGHT - 95, "متابعة الرحلة", () => {
      runController.leaveShopNode();
      this.scene.start("map");
    });
  }

  private refresh(): void {
    this.itemsLayer.removeAll(true);
    this.rerollBtn?.destroy();
    const state = runController.getState();

    const shields = state.shields > 0 ? `   🛡️ ${state.shields}` : "";
    const interest = state.lastInterest ? `   (🏦 +${state.lastInterest} فايدة)` : "";
    const salary = state.salary ? `   💼 +${state.salary}` : "";
    this.goldText.setText(`💰 ${state.gold}${interest}   ❤️ ${state.lives}${shields}${salary}`);

    // Your jokers as chips (no cap — like STS relics); tap one to sell it. They shrink to fit.
    this.ownedLayer.removeAll(true);
    const ids = state.jokerIds;
    const chipW = Math.min(OWNED_CHIP_W, (WIDTH - 40) / Math.max(ids.length, 1) - 10);
    const startX = WIDTH / 2 + ((ids.length - 1) * (chipW + 10)) / 2;
    ids.forEach((id, i) => {
      const x = startX - i * (chipW + 10); // right to left, like the reading order
      const g = this.add.graphics();
      g.fillStyle(0x2f2452, 1);
      g.fillRoundedRect(-chipW / 2, -36, chipW, 72, 16);
      g.lineStyle(3, 0x9c8ad6, 1);
      g.strokeRoundedRect(-chipW / 2, -36, chipW, 72, 16);
      const chip = this.add.container(x, OWNED_Y, [g]);
      const def = getJokerDef(id)!;
      const roomy = chipW >= 100;
      chip.add(this.add.text(roomy ? -22 : 0, 0, def.icon, { fontSize: "34px" }).setOrigin(0.5));
      if (roomy) chip.add(arabicText(this, 30, 0, levelBadge(runController.levelOf(id)), { fontSize: "20px", color: "#cfc8e0" }));
      setBoxHitArea(chip, chipW, 72);
      chip.on("pointerdown", () => this.confirmSell(id));
      this.ownedLayer.add(chip);
    });
    const synergies = activeSynergies(state.jokerIds)
      .filter((x) => x.tier || x.next)
      .map((x) => `${x.tag} ${x.count}${x.tier ? " ✓" : `/${x.next!.count}`}`)
      .join("  •  ");
    this.ownedText.setText(
      (state.jokerIds.length ? "اضغط جوكر: بيع أو ترتيب" : "ما عندك جوكرز للحين") + (synergies ? `  —  تآزر: ${synergies}` : ""),
    );

    const offering = runController.shopOffering();
    if (offering.length === 0) {
      this.itemsLayer.add(arabicText(this, WIDTH / 2, 600, "خلصت البضاعة! جرّب تغيّرها 🎲", { fontSize: "30px" }));
    }
    const slot = Math.min(MAX_CARD_H + CARD_GAP, (SHELF_BOTTOM - FIRST_CARD_Y) / Math.max(offering.length, 1));
    const cardH = slot - CARD_GAP;
    offering.forEach((id, i) => this.drawItem(id, FIRST_CARD_Y + i * slot + cardH / 2, cardH));

    const rerollY = REROLL_Y;
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

  private drawItem(id: string, y: number, cardH: number): void {
    const def = getJokerDef(id)!;
    const style = RARITY_STYLE[def.rarity];
    const reason = runController.whyNot(id);
    const owned = runController.levelOf(id);
    const isUpgrade = (def.kind === "joker" || def.kind === "upgrade") && owned > 0;
    // A new joker shows what it does; an upgrade shows what the next level adds.
    const description = def.levels[Math.min(owned, maxLevel(def) - 1)];
    const price = runController.priceOf(id);
    const cardW = WIDTH - 90;

    const bg = this.add.graphics();
    bg.fillStyle(def.kind === "consumable" ? 0x2a1d3a : def.kind === "upgrade" ? 0x1d2a3f : 0x241a3f, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 24);
    bg.lineStyle(def.rarity === "legendary" ? 6 : 4, style.border, reason ? 0.45 : 1);
    bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 24);
    const card = this.add.container(WIDTH / 2, y, [bg]);
    setBoxHitArea(card, cardW, cardH);
    card.on('pointerover', () => this.tweens.add({ targets: card, scale: 1.02, duration: 150 }));
    card.on('pointerout', () => this.tweens.add({ targets: card, scale: 1, duration: 150 }));

    // Layout: buy button on the left (RTL reading ends there), icon on the right, text between.
    const buttonW = 160;
    const buttonX = -cardW / 2 + 24 + buttonW / 2;
    const iconX = cardW / 2 - 70;
    const columnLeft = buttonX + buttonW / 2 + 24;
    const columnRight = iconX - 60;
    const textX = (columnLeft + columnRight) / 2;
    const textW = columnRight - columnLeft;

    card.add(this.add.text(iconX, -8, def.icon, { fontSize: "64px" }).setOrigin(0.5));
    const kindLabel = def.kind === "consumable" ? "يُستخدم مرة" : def.kind === "upgrade" ? "تطوير للرن" : style.label;
    card.add(arabicText(this, iconX, 62, kindLabel, { fontSize: "19px", color: style.text }));

    // Tags ride on the title, which starts with Arabic, so right-to-left layout keeps them in order.
    const tags = def.tags.length ? ` · ${def.tags.join(" · ")}` : "";
    const title = isUpgrade ? `${def.name}${tags}  ${levelBadge(owned)} ← ${levelBadge(owned + 1)}` : `${def.name}${tags}`;
    card.add(arabicText(this, textX, -80, title, { fontSize: "29px", color: isUpgrade ? "#9cc3ff" : "#ffffff" }));
    card.add(
      arabicText(this, textX, -16, (isUpgrade ? "ترقية: " : "") + description, {
        fontSize: "21px",
        color: "#d8d1ea",
        align: "center",
        wordWrap: { width: textW },
      }),
    );
    card.add(arabicText(this, textX, 76, `${price} ذهب`, { fontSize: "24px", color: "#ffd54a" }));

    const btn = makeButton(
      this,
      buttonX,
      reason ? -14 : 0,
      isUpgrade ? "ترقية" : "شراء",
      () => {
        if (runController.whyNot(id)) return;
        runController.buyJoker(id);
        this.celebrate(def.icon);
        if (id === "upgrade-ticket" && runController.getState().lastTicket) {
          const t = getJokerDef(runController.getState().lastTicket!)!;
          this.toast(`🎟️ ${t.icon} ${t.name} صار ${levelBadge(runController.levelOf(t.id))}`);
        }
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

  /** Asks before selling one of your jokers. */
  private confirmSell(id: string): void {
    this.dialog?.destroy();
    const def = getJokerDef(id)!;
    const value = runController.sellValue(id);
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(40);
    const w = WIDTH - 120;
    // The shade swallows taps so nothing behind the dialog can be bought meanwhile.
    const shade = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.55).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(0x241a3f, 1);
    g.fillRoundedRect(-w / 2, -170, w, 420, 26);
    g.lineStyle(4, 0xffd54a, 1);
    g.strokeRoundedRect(-w / 2, -170, w, 420, 26);
    panel.add([shade, g]);
    panel.add(this.add.text(0, -100, def.icon, { fontSize: "64px" }).setOrigin(0.5));
    panel.add(arabicText(this, 0, -30, `تبيع ${def.name}؟`, { fontSize: "30px" }));
    panel.add(arabicText(this, 0, 20, `مستوى ${runController.levelOf(id)} — بـ ${value} ذهب`, { fontSize: "26px", color: "#ffd54a" }));
    const close = () => {
      panel.destroy();
      this.dialog = undefined;
    };
    const sell = makeButton(this, 140, 110, "بيع", () => {
      runController.sellJoker(id);
      close();
      this.toast(`💰 +${value}`);
      this.refresh();
    }, { width: 220, height: 76, color: 0x8a3a3a });
    const keep = makeButton(this, -140, 110, "لا، خلّه", close, { width: 220, height: 76 });
    panel.add([sell.container, keep.container]);
    // The row's order matters to النسخة (it copies the joker on its right).
    if (runController.getState().jokerIds.indexOf(id) > 0) {
      const move = makeButton(this, 0, 205, "➡️ حرّكه يمين", () => {
        runController.moveJoker(id, -1);
        close();
        this.refresh();
      }, { width: 300, height: 66, fontSize: "24px", color: 0x5a3d99 });
      panel.add(move.container);
    }
    this.dialog = panel;
  }

  /** A short line that floats up and fades, for things that happened. */
  private toast(text: string): void {
    const t = arabicText(this, WIDTH / 2, HEIGHT / 2 - 200, text, { fontSize: "34px", color: "#ffd54a" }).setDepth(60);
    this.tweens.add({ targets: t, y: t.y - 80, alpha: 0, delay: 700, duration: 700, onComplete: () => t.destroy() });
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

function levelBadge(level: number): string {
  return level > 0 ? `Lv${level}` : "";
}
