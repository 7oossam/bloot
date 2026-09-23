import Phaser from "phaser";
import { JOKER_CATALOG, SYNERGIES, type Tag } from "../roguelike/jokers";
import { META_UPGRADES, metaController } from "../roguelike/meta";
import { HEIGHT, WIDTH } from "./layout";
import { arabicText, makeButton, type ButtonHandle } from "./ui";

type Tab = "upgrades" | "unlocks" | "synergies";

const ROW_H = 158;
const ROW_GAP = 16;
const FIRST_ROW_Y = 330;

/**
 * الديوانية: spend glory (المجد) earned across runs on permanent upgrades, and unlock the
 * advanced jokers so they can start appearing in shops. A third tab explains the synergy
 * families so combos can be planned before a run.
 */
export class MetaScene extends Phaser.Scene {
  private tab: Tab = "upgrades";
  private layer!: Phaser.GameObjects.Container;
  private headerText!: Phaser.GameObjects.Text;
  private tabButtons: ButtonHandle[] = [];

  constructor() {
    super("meta");
  }

  create(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x1d1a12).setOrigin(0);
    arabicText(this, WIDTH / 2, 60, "🏛️ الديوانية", { fontSize: "44px" });
    this.headerText = arabicText(this, WIDTH / 2, 130, "", { fontSize: "24px", color: "#ffd54a" });
    this.layer = this.add.container(0, 0);
    makeButton(this, WIDTH / 2, HEIGHT - 95, "رجوع للخريطة", () => this.scene.start("map"));
    this.refresh();
  }

  private refresh(): void {
    this.layer.removeAll(true);
    for (const b of this.tabButtons) b.destroy();
    this.tabButtons = [];

    const p = metaController.getProfile();
    this.headerText.setText(`🏆 مجدك: ${p.glory}   —   رنات ${p.runs}  •  فوز ${p.wins}  •  أبعد عقدة ${p.bestFloor}`);

    const tabs: Array<[Tab, string]> = [
      ["upgrades", "تطويرات"],
      ["unlocks", "فتح جوكرز"],
      ["synergies", "التآزر"],
    ];
    tabs.forEach(([id, label], i) => {
      const x = WIDTH / 2 + (1 - i) * 250; // RTL: first tab on the right
      this.tabButtons.push(
        makeButton(this, x, 225, label, () => {
          this.tab = id;
          this.refresh();
        }, { width: 230, height: 70, fontSize: "25px", color: this.tab === id ? 0x8a6a1f : 0x3a342a }),
      );
    });

    if (this.tab === "upgrades") this.drawUpgrades();
    else if (this.tab === "unlocks") this.drawUnlocks();
    else this.drawSynergies();
  }

  private row(i: number, icon: string, title: string, body: string, button?: { label: string; reason?: string; onClick: () => void }): void {
    const y = FIRST_ROW_Y + i * (ROW_H + ROW_GAP) + ROW_H / 2;
    const w = WIDTH - 80;
    const bg = this.add.graphics();
    bg.fillStyle(0x2c261a, 1);
    bg.fillRoundedRect(-w / 2, -ROW_H / 2, w, ROW_H, 20);
    bg.lineStyle(3, button && !button.reason ? 0xe0b04a : 0x5a5040, 1);
    bg.strokeRoundedRect(-w / 2, -ROW_H / 2, w, ROW_H, 20);
    const row = this.add.container(WIDTH / 2, y, [bg]);

    const iconX = w / 2 - 60;
    const buttonW = 170;
    const buttonX = -w / 2 + 22 + buttonW / 2;
    const textX = (buttonX + buttonW / 2 + 20 + iconX - 50) / 2;
    const textW = iconX - 50 - (buttonX + buttonW / 2 + 20);

    row.add(this.add.text(iconX, 0, icon, { fontSize: "56px" }).setOrigin(0.5));
    row.add(arabicText(this, textX, -40, title, { fontSize: "28px" }));
    row.add(arabicText(this, textX, 22, body, { fontSize: "21px", color: "#d9cfb8", wordWrap: { width: textW } }));

    if (button) {
      const btn = makeButton(this, buttonX, button.reason ? -16 : 0, button.label, () => {
        if (button.reason) return;
        button.onClick();
        this.cameras.main.flash(200, 120, 90, 20);
        this.refresh();
      }, { width: buttonW, height: 70, fontSize: "24px", color: button.reason ? 0x3a3a3a : 0x1f6f43 });
      row.add(btn.container);
      if (button.reason) row.add(arabicText(this, buttonX, 42, button.reason, { fontSize: "18px", color: "#a89a80" }));
    }
    this.layer.add(row);
  }

  private drawUpgrades(): void {
    META_UPGRADES.forEach((u, i) => {
      const lvl = metaController.level(u.id);
      const done = lvl >= u.costs.length;
      const body = done ? `✓ ${u.levels[u.levels.length - 1]}` : u.levels[lvl];
      const title = `${u.name}  ${lvl}/${u.costs.length}`;
      this.row(i, u.icon, title, body, {
        label: done ? "مكتمل" : `${u.costs[lvl]} 🏆`,
        reason: metaController.whyNotUpgrade(u.id),
        onClick: () => metaController.buyUpgrade(u.id),
      });
    });
  }

  private drawUnlocks(): void {
    const locked = JOKER_CATALOG.filter((j) => j.unlockCost > 0);
    locked.forEach((j, i) => {
      const open = metaController.isUnlocked(j.id);
      const tags = j.tags.length ? ` · ${j.tags.join(" · ")}` : "";
      this.row(i, j.icon, `${j.name}${tags}`, j.levels[0], {
        label: open ? "مفتوح ✓" : `${j.unlockCost} 🏆`,
        reason: open ? "يطلع في المتجر" : metaController.whyNotUnlock(j.id),
        onClick: () => metaController.unlock(j.id),
      });
    });
  }

  private drawSynergies(): void {
    (Object.keys(SYNERGIES) as Tag[]).forEach((tag, i) => {
      const members = JOKER_CATALOG.filter((j) => j.tags.includes(tag)).map((j) => j.icon).join(" ");
      // Each line opens with Arabic ("بـ2 جوكر") so right-to-left layout keeps the number in place.
      const tiers = SYNERGIES[tag].map((t) => `بـ${t.count} جوكر: ${t.text}`).join("\n");
      this.row(i, members.split(" ")[0] ?? "✨", `${tag}   ${members}`, tiers);
    });
  }
}
