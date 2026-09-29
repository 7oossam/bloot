import Phaser from "phaser";
import { INK, addIcon } from "./icons";
import { activeSynergies, getJokerDef, maxLevel, type Rarity } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import { getCurse, UNCURSE_PRICE } from "../roguelike/curses";
import { showJokerInfo } from "./infoPopup";
import { HEIGHT, WIDTH } from "./layout";
import { makeButton, preloadUi, setBoxHitArea } from "./ui";
import { addAmbience } from "./fx";
import { CSS, PAL, fitBox, fitWidth, inkText, paintParchment } from "./theme";

const RARITY_STYLE: Record<Rarity, { border: number; label: string; text: string }> = {
  common: { border: PAL.olive, label: "عادي", text: "#3e4a2a" },
  rare: { border: PAL.teal, label: "نادر", text: "#1f4a4d" },
  legendary: { border: PAL.gold, label: "أسطوري", text: "#8c5a1c" },
};

const MAX_CARD_H = 236;
const CARD_GAP = 18;
const FIRST_CARD_Y = 380;
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

  preload(): void {
    preloadUi(this);
  }

  create(): void {
    paintParchment(this, { compass: false });
    addAmbience(this);
    inkText(this, WIDTH / 2, 70, "دكّان التحف", { fontSize: "50px", fontStyle: "700", color: CSS.crimson });
    this.goldText = inkText(this, WIDTH / 2, 118, "", { fontSize: "26px", color: CSS.crimson });
    this.ownedText = inkText(this, WIDTH / 2, 246, "", {
      fontSize: "21px",
      color: CSS.inkSoft,
      lineSpacing: 4,
      wordWrap: { width: WIDTH - 100 },
    }).setOrigin(0.5, 0);
    this.itemsLayer = this.add.container(0, 0);
    this.ownedLayer = this.add.container(0, 0);

    this.refresh();

    makeButton(this, WIDTH / 2, HEIGHT - 95, "متابعة الرحلة", () => {
      runController.leaveShopNode();
      this.scene.start("map");
    }, { width: 380 });
  }

  private refresh(): void {
    this.itemsLayer.removeAll(true);
    this.rerollBtn?.destroy();
    const state = runController.getState();

    const shields = state.shields > 0 ? `   ·   درع ${state.shields}` : "";
    const interest = state.lastInterest ? ` (+${state.lastInterest} فايدة)` : "";
    const salary = state.salary ? `   ·   راتب +${state.salary}` : "";
    this.goldText.setText(`${state.gold} ريال${interest}   ·   ساعات الليل ${state.lives}${shields}${salary}`);

    // Your jokers as chips (no cap — like STS relics); tap one to sell it. They shrink to fit.
    // Your نحس come last, in crimson; tap one to lift it.
    this.ownedLayer.removeAll(true);
    const curses = state.curses ?? [];
    const ids = [...state.jokerIds, ...curses.map((c) => `curse:${c}`)];
    const chipW = Math.min(OWNED_CHIP_W, (WIDTH - 40) / Math.max(ids.length, 1) - 10);
    const startX = WIDTH / 2 + ((ids.length - 1) * (chipW + 10)) / 2;
    ids.forEach((id, i) => {
      const x = startX - i * (chipW + 10); // right to left, like the reading order
      const g = this.add.graphics();
      g.fillStyle(PAL.paper, 1);
      g.fillRoundedRect(-chipW / 2, -36, chipW, 72, 16);
      const curse = id.startsWith("curse:") ? getCurse(id.slice(6)) : undefined;
      g.lineStyle(3, curse ? PAL.crimson : PAL.gold, 1);
      g.strokeRoundedRect(-chipW / 2, -36, chipW, 72, 16);
      const chip = this.add.container(x, OWNED_Y, [g]);
      if (curse) {
        chip.add(addIcon(this, 0, 0, curse.icon, 44, PAL.crimson));
        setBoxHitArea(chip, chipW, 72);
        chip.on("pointerdown", () => this.confirmUncurse(curse.id));
        this.ownedLayer.add(chip);
        return;
      }
      const def = getJokerDef(id)!;
      const roomy = chipW >= 100;
      chip.add(addIcon(this, roomy ? -20 : 0, 0, def.icon, 44, INK));
      if (roomy) chip.add(inkText(this, 30, 0, levelBadge(runController.levelOf(id)), { fontSize: "20px", color: CSS.gold }));
      setBoxHitArea(chip, chipW, 72);
      chip.on("pointerdown", () => this.confirmSell(id));
      this.ownedLayer.add(chip);
    });
    const synergies = activeSynergies(state.jokerIds)
      .filter((x) => x.tier || x.next)
      .map((x) => `${x.tag} ${x.count}${x.tier ? " ✓" : `/${x.next!.count}`}`)
      .join("  •  ");
    this.ownedText.setText(
      (state.jokerIds.length ? "اضغط تحفة: بيع أو ترتيب" : "ما عندك تحف للحين") + (synergies ? `\nالمجموعات: ${synergies}` : ""),
    );

    const offering = runController.shopOffering();
    if (offering.length === 0) {
      this.itemsLayer.add(inkText(this, WIDTH / 2, 600, "خلصت البضاعة! جرّب تغيّرها", { fontSize: "30px" }));
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
      `غيّر البضاعة (${state.rerollCost} ريال)`,
      () => {
        if (!runController.canReroll()) return;
        runController.reroll();
        this.cameras.main.flash(180, 90, 60, 160);
        this.refresh();
      },
      { width: 440, height: 76, plate: "teal", disabled: !canReroll },
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
    bg.fillStyle(PAL.paper, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 24);
    bg.lineStyle(def.rarity === "legendary" ? 6 : 4, style.border, reason ? 0.45 : 1);
    bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 24);
    const card = this.add.container(WIDTH / 2, y, [bg]);
    setBoxHitArea(card, cardW, cardH);
    card.on('pointerover', () => this.tweens.add({ targets: card, scale: 1.02, duration: 150 }));
    card.on('pointerout', () => this.tweens.add({ targets: card, scale: 1, duration: 150 }));
    // Tap the card (not its button) for the whole explanation.
    card.on("pointerdown", () => (def.kind === "joker" ? showJokerInfo(this, id, Math.max(1, owned)) : showJokerInfo(this, id)));

    // Layout: buy button on the left (RTL reading ends there), icon on the right, text between.
    const buttonW = 160;
    const buttonX = -cardW / 2 + 24 + buttonW / 2;
    const iconX = cardW / 2 - 70;
    const columnLeft = buttonX + buttonW / 2 + 24;
    const columnRight = iconX - 60;
    const textX = (columnLeft + columnRight) / 2;
    const textW = columnRight - columnLeft;

    card.add(addIcon(this, iconX, -8, def.icon, 76, INK));
    const kindLabel = def.kind === "consumable" ? "يُستخدم مرة" : def.kind === "upgrade" ? "تطوير لليلة" : style.label;
    card.add(fitWidth(inkText(this, iconX, 62, kindLabel, { fontSize: "19px", color: style.text }), 120));

    // Tags ride on the title, which starts with Arabic, so right-to-left layout keeps them in order.
    // Just the name (the groups next to it confused more than they told — they're in the ⓘ card).
    const title = isUpgrade ? `${def.name}  ${levelBadge(owned)} ← ${levelBadge(owned + 1)}` : def.name;
    card.add(inkText(this, textX, -80, title, { fontSize: "29px", color: isUpgrade ? "#1f4a4d" : CSS.ink }));
    // Between the title and the price; a long one (الورقة الشبح) shrinks to fit.
    card.add(
      fitBox(
        inkText(this, textX, -4, (isUpgrade ? "ترقية: " : "") + description, {
          fontSize: "21px",
          color: CSS.inkSoft,
          align: "center",
          wordWrap: { width: textW },
        }),
        textW + 24,
        112,
      ),
    );
    card.add(inkText(this, textX, 76, `${price} ريال`, { fontSize: "24px", color: CSS.crimson }));

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
          this.toast(`${t.name} صارت ${levelBadge(runController.levelOf(t.id))}`);
        }
        this.refresh();
      },
      { plate: "sun", disabled: !!reason, width: buttonW, height: 74 },
    );
    card.add(btn.container);
    if (reason) card.add(inkText(this, buttonX, 50, reason, { fontSize: "18px", color: CSS.inkSoft }));

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
    g.fillStyle(PAL.paper, 1);
    g.fillRoundedRect(-w / 2, -330, w, 620, 26);
    g.lineStyle(4, PAL.gold, 1);
    g.strokeRoundedRect(-w / 2, -330, w, 620, 26);
    panel.add([shade, g]);
    // What it does first (tap a تحفة anywhere and you read it), then selling.
    const level = runController.levelOf(id);
    panel.add(addIcon(this, 0, -255, def.icon, 80, INK));
    panel.add(inkText(this, 0, -185, def.name, { fontSize: "34px", color: CSS.crimson }));
    panel.add(fitBox(inkText(this, 0, -95, def.levels[Math.min(level, def.levels.length) - 1], { fontSize: "26px", wordWrap: { width: w - 90 } }), w - 60, 140));
    const starter = runController.isStarter(id);
    panel.add(inkText(this, 0, 20, starter ? "تحفة شخصيتك — ما تنباع" : `تبيعها؟ مستوى ${level} — بـ ${value} ريال`, { fontSize: "26px", color: CSS.crimson }));
    const close = () => {
      panel.destroy();
      this.dialog = undefined;
    };
    const sell = makeButton(this, 140, 110, "بيع", () => {
      if (starter) return;
      runController.sellJoker(id);
      close();
      this.toast(`+${value} ريال`);
      this.refresh();
    }, { width: 220, height: 76, plate: "paper" });
    const keep = makeButton(this, -140, 110, starter ? "تمام" : "لا، خلّه", close, { width: 220, height: 76, plate: "navy" });
    panel.add([sell.container, keep.container]);
    if (starter) sell.container.setVisible(false).disableInteractive();
    // The row's order matters to النسخة (it copies the joker on its right).
    if (runController.getState().jokerIds.indexOf(id) > 0) {
      const move = makeButton(this, 0, 205, "حرّكها يمين", () => {
        runController.moveJoker(id, -1);
        close();
        this.refresh();
      }, { width: 300, height: 66, plate: "teal" });
      panel.add(move.container);
    }
    this.dialog = panel;
  }

  /** النحس: what it does, and lifting it for riyals. */
  private confirmUncurse(id: string): void {
    this.dialog?.destroy();
    const def = getCurse(id)!;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(40);
    const w = WIDTH - 120;
    const shade = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0.55).setInteractive();
    const g = this.add.graphics();
    g.fillStyle(PAL.paper, 1);
    g.fillRoundedRect(-w / 2, -170, w, 360, 26);
    g.lineStyle(4, PAL.crimson, 1);
    g.strokeRoundedRect(-w / 2, -170, w, 360, 26);
    panel.add([shade, g]);
    panel.add(addIcon(this, 0, -100, def.icon, 80, PAL.crimson));
    panel.add(inkText(this, 0, -30, `نحس: ${def.name}`, { fontSize: "30px", color: CSS.crimson }));
    panel.add(inkText(this, 0, 20, def.text, { fontSize: "26px", wordWrap: { width: w - 80 } }));
    const close = () => {
      panel.destroy();
      this.dialog = undefined;
    };
    const poor = runController.getState().gold < UNCURSE_PRICE;
    const lift = makeButton(this, 140, 110, `فكّه (${UNCURSE_PRICE} ريال)`, () => {
      if (poor) return;
      runController.buyUncurse(id);
      close();
      this.toast(`راح عنك «${def.name}»`);
      this.refresh();
    }, { width: 260, height: 76, plate: "paper", disabled: poor });
    const keep = makeButton(this, -150, 110, "بعدين", close, { width: 200, height: 76, plate: "navy" });
    panel.add([lift.container, keep.container]);
    this.dialog = panel;
  }

  /** A short line that floats up and fades, for things that happened. */
  private toast(text: string): void {
    const t = inkText(this, WIDTH / 2, HEIGHT / 2 - 200, text, { fontSize: "34px", color: CSS.crimson }).setDepth(60);
    this.tweens.add({ targets: t, y: t.y - 80, alpha: 0, delay: 700, duration: 700, onComplete: () => t.destroy() });
  }

  /** A quick burst of the item's icon so a purchase feels like getting something. */
  private celebrate(icon: string): void {
    const pop = addIcon(this, WIDTH / 2, HEIGHT / 2, icon, 140, INK).setDepth(50);
    this.tweens.add({
      targets: pop,
      scale: pop.scale * 2.2,
      alpha: 0,
      duration: 650,
      ease: "Cubic.Out",
      onComplete: () => pop.destroy(),
    });
    this.cameras.main.shake(120, 0.004);
  }
}

function levelBadge(level: number): string {
  return level > 0 ? "★".repeat(level) : "";
}
