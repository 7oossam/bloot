import Phaser from "phaser";
import { activeSynergies, getJokerDef, maxLevel, type Rarity } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import { HEIGHT, WIDTH } from "./layout";
import { makeButton, preloadUi, setBoxHitArea } from "./ui";
import { addAmbience } from "./fx";
import { CSS, PAL, inkText, paintParchment } from "./theme";

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
    inkText(this, WIDTH / 2, 86, pending.elite ? "غنائم النخبة 👑" : "غنائم الصكة 🎁", { fontSize: "46px" });
    inkText(this, WIDTH / 2, 156, `+${this.goldEarned} ريال  —  معك ${state.gold} 💰`, { fontSize: "27px", color: CSS.crimson });

    // Your row as it stands, so the choice is made against it.
    const row = state.jokerIds.map((id) => `${getJokerDef(id)?.icon ?? ""}${levelSup(runController.levelOf(id))}`).join("  ");
    inkText(this, WIDTH / 2, 236, row ? `صفّك: ${row}` : "صفّك فاضي — اختر أول قطعة في بناءك", { fontSize: "28px" });
    const synergies = activeSynergies(state.jokerIds)
      .filter((x) => x.tier || x.next)
      .map((x) => `${x.tag} ${x.count}${x.tier ? " ✓" : `/${x.next!.count}`}`)
      .join("  •  ");
    if (synergies) inkText(this, WIDTH / 2, 296, `تآزر: ${synergies}`, { fontSize: "22px", color: CSS.inkSoft });
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
    card.add(this.add.text(iconX, -40, def.icon, { fontSize: "78px" }).setOrigin(0.5));
    const kind = def.kind === "consumable" ? "يُستخدم مرة" : def.kind === "upgrade" ? "تطوير للرن" : style.label;
    card.add(inkText(this, iconX, 50, kind, { fontSize: "20px", color: style.text }));

    const textX = -50;
    const textW = cardW - 260;
    const tags = def.tags.length ? ` · ${def.tags.join(" · ")}` : "";
    const title = levelUp ? `${def.name}  Lv${owned} ← Lv${owned + 1}` : `${def.name}${tags}`;
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

  private celebrate(icon: string): void {
    const pop = this.add.text(WIDTH / 2, HEIGHT / 2, icon, { fontSize: "130px" }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: pop, scale: 2.4, alpha: 0, duration: 650, ease: "Cubic.Out", onComplete: () => pop.destroy() });
    this.cameras.main.flash(200, 255, 213, 74);
  }
}

function levelSup(level: number): string {
  return ["", "", "²", "³"][level] ?? "";
}
