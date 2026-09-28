import Phaser from "phaser";
import { INK, addIcon, iconRow } from "./icons";
import { activeSynergies, getJokerDef, maxLevel, type Rarity } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import { HEIGHT, WIDTH } from "./layout";
import { makeButton, preloadUi, setBoxHitArea } from "./ui";
import { addAmbience } from "./fx";
import { CSS, PAL, inkText, paintParchment, fitWidth } from "./theme";
import { getStamp, MAX_STAMPS_PER_CARD, type StampId } from "../roguelike/stamps";
import { CardView } from "./CardView";
import { installStampView } from "./stampView";
import { SUITS, type Card } from "../engine/types";
import { cardId } from "../engine/cards";

const RARITY_STYLE: Record<Rarity, { border: number; label: string; text: string }> = {
  common: { border: PAL.olive, label: "عادي", text: "#3e4a2a" },
  rare: { border: PAL.teal, label: "نادر", text: "#1f4a4d" },
  legendary: { border: PAL.gold, label: "أسطوري", text: "#8c5a1c" },
};

export interface RewardSceneData {
  /** Gold the match paid, shown on top. */
  goldEarned: number;
}

const CARD_TOP = 420;
const CARD_H = 330;
const CARD_GAP = 26;

/**
 * غنائم الصكة: after every match you win, pick one of three spoils — free — or skip them for a
 * little gold. The offers lean towards the build you're making (see RunController.rollRewards),
 * and each card says why it fits.
 */
export class RewardScene extends Phaser.Scene {
  private goldEarned = 0;

  constructor() {
    super("reward");
  }

  init(data: RewardSceneData): void {
    this.goldEarned = data?.goldEarned ?? 0;
  }

  preload(): void {
    preloadUi(this);
  }

  create(): void {
    const state = runController.getState();
    const pending = state.pendingRewards;
    if (!pending) {
      this.scene.start("map");
      return;
    }
    paintParchment(this, { compass: false });
    addAmbience(this);
    if (pending.stamps?.length) {
      installStampView();
      this.showStampOffers(pending.stamps, pending.skipGold);
      return;
    }
    inkText(this, WIDTH / 2, 86, pending.elite ? "غنائم المجلس الكبير" : "غنائم الصكّة", { fontSize: "46px" });
    inkText(this, WIDTH / 2, 156, `+${this.goldEarned} ريال  —  معك ${state.gold} ريال`, { fontSize: "27px", color: CSS.crimson });

    // Your row as it stands, so the choice is made against it.
    if (state.jokerIds.length) {
      iconRow(this, WIDTH / 2, 236, state.jokerIds.map((id) => ({ icon: getJokerDef(id)?.icon ?? "", mark: "★".repeat(Math.max(0, runController.levelOf(id) - 1)) })), {
        size: Math.min(46, (WIDTH - 120) / state.jokerIds.length - 12),
        color: INK,
      });
    } else inkText(this, WIDTH / 2, 236, "صفّك فاضي — اختر أول قطعة في بناءك", { fontSize: "28px" });
    const synergies = activeSynergies(state.jokerIds)
      .filter((x) => x.tier || x.next)
      .map((x) => `${x.tag} ${x.count}${x.tier ? " ✓" : `/${x.next!.count}`}`)
      .join("  •  ");
    if (synergies) inkText(this, WIDTH / 2, 296, `المجموعات: ${synergies}`, { fontSize: "22px", color: CSS.inkSoft, wordWrap: { width: WIDTH - 100 } });
    inkText(this, WIDTH / 2, 356, "اختر وحدة ببلاش:", { fontSize: "26px", color: CSS.inkSoft });

    pending.items.forEach((id, i) => this.drawOffer(id, CARD_TOP + i * (CARD_H + CARD_GAP) + CARD_H / 2));

    makeButton(
      this,
      WIDTH / 2,
      HEIGHT - 150,
      `تخطي (+${pending.skipGold} ريال)`,
      () => {
        runController.skipReward();
        this.scene.start("map");
      },
      { width: 420, height: 84, plate: "paper" },
    );
  }

  private drawOffer(id: string, y: number): void {
    const def = getJokerDef(id)!;
    const style = RARITY_STYLE[def.rarity];
    const owned = runController.levelOf(id);
    const reason = runController.whyNotReward(id);
    const hint = runController.rewardHint(id);
    const levelUp = (def.kind === "joker" || def.kind === "upgrade") && owned > 0;
    const cardW = WIDTH - 80;

    const bg = this.add.graphics();
    bg.fillStyle(PAL.paper, 1);
    bg.fillRoundedRect(-cardW / 2, -CARD_H / 2, cardW, CARD_H, 26);
    bg.lineStyle(def.rarity === "legendary" ? 6 : 4, style.border, 1);
    bg.strokeRoundedRect(-cardW / 2, -CARD_H / 2, cardW, CARD_H, 26);
    const card = this.add.container(WIDTH / 2, y, [bg]);
      setBoxHitArea(card, cardW, CARD_H);
      card.on('pointerover', () => this.tweens.add({ targets: card, scale: 1.02, duration: 150 }));
      card.on('pointerout', () => this.tweens.add({ targets: card, scale: 1, duration: 150 }));

    const iconX = cardW / 2 - 80;
    card.add(addIcon(this, iconX, -40, def.icon, 88, INK));
    const kind = def.kind === "consumable" ? "يُستخدم مرة" : def.kind === "upgrade" ? "تطوير لليلة" : style.label;
    card.add(fitWidth(inkText(this, iconX, 50, kind, { fontSize: "20px", color: style.text }), 130));

    const textX = -50;
    const textW = cardW - 260;
    const tags = def.tags.length ? ` · ${def.tags.join(" · ")}` : "";
    const title = levelUp ? `${def.name}  ${"★".repeat(owned)} ← ${"★".repeat(owned + 1)}` : `${def.name}${tags}`;
    card.add(inkText(this, textX, -120, title, { fontSize: "31px", color: levelUp ? "#1f4a4d" : CSS.ink }));
    card.add(
      inkText(this, textX, -50, (levelUp ? "ترقية: " : "") + def.levels[Math.min(owned, maxLevel(def) - 1)], {
        fontSize: "22px",
        color: CSS.inkSoft,
        wordWrap: { width: textW },
      }),
    );
    if (hint) card.add(inkText(this, textX, 34, `✦ ${hint}`, { fontSize: "22px", color: "#3e4a2a" }));

    const btn = makeButton(
      this,
      textX,
      CARD_H / 2 - 56,
      reason ? reason : "خذها",
      () => {
        if (runController.whyNotReward(id)) return;
        runController.takeReward(id);
        this.celebrate(def.icon);
        this.time.delayedCall(650, () => this.scene.start("map"));
      },
      { width: reason ? 420 : 240, height: 74, plate: "sun", disabled: !!reason },
    );
    card.add(btn.container);
    if (def.rarity === "legendary") this.tweens.add({ targets: bg, alpha: 0.78, duration: 700, yoyo: true, repeat: -1 });
  }

  // ------------------------------------------------------------------ الوسوم

  private stampLayer?: Phaser.GameObjects.Container;

  /** A plain match's spoils: three stamps; pick one, then the card it goes on. */
  private showStampOffers(offers: StampId[], skipGold: number): void {
    this.stampLayer?.destroy();
    const layer = this.add.container(0, 0);
    this.stampLayer = layer;
    const state = runController.getState();
    layer.add(inkText(this, WIDTH / 2, 86, "غنائم الصكّة: وسم", { fontSize: "46px" }));
    layer.add(inkText(this, WIDTH / 2, 156, `+${this.goldEarned} ريال  —  معك ${state.gold} ريال`, { fontSize: "27px", color: CSS.crimson }));
    layer.add(
      inkText(this, WIDTH / 2, 236, "الوسم يبقى على الورقة طول الليل، ويشتغل بس إذا كانت في يدك", {
        fontSize: "25px",
        color: CSS.inkSoft,
        wordWrap: { width: WIDTH - 100 },
      }),
    );
    const cardW = WIDTH - 80;
    const h = 250;
    offers.forEach((id, i) => {
      const def = getStamp(id)!;
      const y = 320 + i * (h + 30) + h / 2;
      const bg = this.add.graphics();
      bg.fillStyle(PAL.paper, 1);
      bg.fillRoundedRect(-cardW / 2, -h / 2, cardW, h, 26);
      bg.lineStyle(4, PAL.gold, 1);
      bg.strokeRoundedRect(-cardW / 2, -h / 2, cardW, h, 26);
      const card = this.add.container(WIDTH / 2, y, [bg]);
      const seal = this.add.graphics();
      seal.fillStyle(0xf0cb7a, 1);
      seal.fillCircle(cardW / 2 - 80, -10, 54);
      seal.lineStyle(3, 0x3a2620, 0.9);
      seal.strokeCircle(cardW / 2 - 80, -10, 54);
      card.add(seal);
      card.add(addIcon(this, cardW / 2 - 80, -10, def.icon, 70, INK));
      card.add(inkText(this, -50, -80, def.name, { fontSize: "32px", color: CSS.crimson }));
      card.add(inkText(this, -50, -10, def.text, { fontSize: "23px", color: CSS.inkSoft, wordWrap: { width: cardW - 260 } }));
      const btn = makeButton(this, -50, h / 2 - 48, "اختر الورقة", () => this.showCardPicker(id, offers, skipGold), { width: 260, height: 70, plate: "sun" });
      card.add(btn.container);
      layer.add(card);
    });
    const skip = makeButton(
      this,
      WIDTH / 2,
      HEIGHT - 150,
      `تخطي (+${skipGold} ريال)`,
      () => {
        runController.skipReward();
        this.scene.start("map");
      },
      { width: 420, height: 84, plate: "paper" },
    );
    layer.add(skip.container);
  }

  /** The whole deck, suit by suit: tap the card that gets the stamp. */
  private showCardPicker(stamp: StampId, offers: StampId[], skipGold: number): void {
    this.stampLayer?.destroy();
    const layer = this.add.container(0, 0);
    this.stampLayer = layer;
    const def = getStamp(stamp)!;
    layer.add(inkText(this, WIDTH / 2, 90, `وين تحط «${def.name}»؟`, { fontSize: "42px", color: CSS.crimson }));
    layer.add(inkText(this, WIDTH / 2, 160, def.text, { fontSize: "24px", color: CSS.inkSoft, wordWrap: { width: WIDTH - 100 } }));
    layer.add(
      inkText(this, WIDTH / 2, 232, `الورقة تشيل ${MAX_STAMPS_PER_CARD} وسوم بالكثير — الثالث يشيل أقدمها`, { fontSize: "22px", color: CSS.inkSoft }),
    );
    const RANKS: Card["rank"][] = ["A", "10", "K", "Q", "J", "9", "8", "7"];
    const size = 0.74;
    const colW = 103;
    const rowH = 175;
    const top = 380;
    SUITS.forEach((suit, row) => {
      RANKS.forEach((rank, col) => {
        const card: Card = { suit, rank };
        const x = WIDTH / 2 + (col - 3.5) * colW;
        const y = top + row * rowH;
        const view = new CardView(this, x, y, card, true, size);
        setBoxHitArea(view, view.displayW, view.displayH);
        view.input!.cursor = "pointer";
        view.on("pointerdown", () => {
          runController.applyStamp(stamp, cardId(card));
          view.destroy();
          const fresh = new CardView(this, x, y, card, true, size);
          layer.add(fresh);
          this.tweens.add({ targets: fresh, scale: 1.35, duration: 180, yoyo: true, ease: "Back.Out" });
          this.celebrate(def.icon);
          this.time.delayedCall(800, () => this.scene.start("map"));
        });
        layer.add(view);
      });
    });
    const back = makeButton(this, WIDTH / 2 - 150, HEIGHT - 150, "رجوع", () => this.showStampOffers(offers, skipGold), { width: 240, height: 80, plate: "paper" });
    layer.add(back.container);
  }

  private celebrate(icon: string): void {
    const pop = addIcon(this, WIDTH / 2, HEIGHT / 2, icon, 150, INK).setDepth(50);
    this.tweens.add({ targets: pop, scale: pop.scale * 2.4, alpha: 0, duration: 650, ease: "Cubic.Out", onComplete: () => pop.destroy() });
    this.cameras.main.flash(200, 255, 213, 74);
  }
}
