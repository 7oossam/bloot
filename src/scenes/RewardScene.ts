import Phaser from "phaser";
import { activeSynergies, getJokerDef, maxLevel, type Rarity } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import { HEIGHT, WIDTH } from "./layout";
import { arabicText, makeButton } from "./ui";

const RARITY_STYLE: Record<Rarity, { border: number; label: string; text: string }> = {
  common: { border: 0x6fae8c, label: "عادي", text: "#9fd3b4" },
  rare: { border: 0x5b9bff, label: "نادر", text: "#9cc3ff" },
  legendary: { border: 0xffb33a, label: "أسطوري", text: "#ffd27a" },
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

  create(): void {
    const state = runController.getState();
    const pending = state.pendingRewards;
    if (!pending) {
      this.scene.start("map");
      return;
    }
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1d1433).setOrigin(0);
    arabicText(this, WIDTH / 2, 86, pending.elite ? "غنائم النخبة 👑" : "غنائم الصكة 🎁", { fontSize: "46px" });
    arabicText(this, WIDTH / 2, 156, `+${this.goldEarned} ذهب  —  معك ${state.gold} 💰`, { fontSize: "27px", color: "#ffd54a" });

    // Your row as it stands, so the choice is made against it.
    const row = state.jokerIds.map((id) => `${getJokerDef(id)?.icon ?? ""}${levelSup(runController.levelOf(id))}`).join("  ");
    arabicText(this, WIDTH / 2, 236, row ? `صفّك: ${row}` : "صفّك فاضي — اختر أول قطعة في بناءك", { fontSize: "28px" });
    const synergies = activeSynergies(state.jokerIds)
      .filter((x) => x.tier || x.next)
      .map((x) => `${x.tag} ${x.count}${x.tier ? " ✓" : `/${x.next!.count}`}`)
      .join("  •  ");
    if (synergies) arabicText(this, WIDTH / 2, 296, `تآزر: ${synergies}`, { fontSize: "22px", color: "#cfc8e0" });
    arabicText(this, WIDTH / 2, 356, "اختر وحدة ببلاش:", { fontSize: "26px", color: "#d8d1ea" });

    pending.items.forEach((id, i) => this.drawOffer(id, CARD_TOP + i * (CARD_H + CARD_GAP) + CARD_H / 2));

    makeButton(
      this,
      WIDTH / 2,
      HEIGHT - 150,
      `تخطي (+${pending.skipGold} ذهب)`,
      () => {
        runController.skipReward();
        this.scene.start("map");
      },
      { width: 420, height: 84, color: 0x5d5d5d },
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
    bg.fillStyle(def.kind === "joker" ? 0x2a1f4a : def.kind === "upgrade" ? 0x1d2a3f : 0x2a1d3a, 1);
    bg.fillRoundedRect(-cardW / 2, -CARD_H / 2, cardW, CARD_H, 26);
    bg.lineStyle(def.rarity === "legendary" ? 6 : 4, style.border, 1);
    bg.strokeRoundedRect(-cardW / 2, -CARD_H / 2, cardW, CARD_H, 26);
    const card = this.add.container(WIDTH / 2, y, [bg]);

    const iconX = cardW / 2 - 80;
    card.add(this.add.text(iconX, -40, def.icon, { fontSize: "78px" }).setOrigin(0.5));
    const kind = def.kind === "consumable" ? "يُستخدم مرة" : def.kind === "upgrade" ? "تطوير للرن" : style.label;
    card.add(arabicText(this, iconX, 50, kind, { fontSize: "20px", color: style.text }));

    const textX = -50;
    const textW = cardW - 260;
    const tags = def.tags.length ? ` · ${def.tags.join(" · ")}` : "";
    const title = levelUp ? `${def.name}  Lv${owned} ← Lv${owned + 1}` : `${def.name}${tags}`;
    card.add(arabicText(this, textX, -120, title, { fontSize: "31px", color: levelUp ? "#9cc3ff" : "#ffffff" }));
    card.add(
      arabicText(this, textX, -50, (levelUp ? "ترقية: " : "") + def.levels[Math.min(owned, maxLevel(def) - 1)], {
        fontSize: "22px",
        color: "#d8d1ea",
        wordWrap: { width: textW },
      }),
    );
    if (hint) card.add(arabicText(this, textX, 34, `✦ ${hint}`, { fontSize: "22px", color: "#5ad469" }));

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
      { width: reason ? 420 : 240, height: 74, fontSize: reason ? "21px" : "28px", color: reason ? 0x3a3a3a : 0x1f6f43 },
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
