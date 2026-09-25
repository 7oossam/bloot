import Phaser from "phaser";
import { activeSynergies, getJokerDef, matchOptionsFromJokers } from "../roguelike/jokers";
import { BLESSING_GOLD, runController } from "../roguelike/RunController";
import { weakRuleText } from "../roguelike/opponents";
import type { MapNode, RunState } from "../roguelike/types";
import { HEIGHT, WIDTH } from "./layout";
import { arabicText, makeButton, setBoxHitArea, type ButtonHandle } from "./ui";
import type { TableSceneData } from "./TableScene";

const NODE_TYPE_LABEL_AR: Record<MapNode["type"], string> = {
  match: "مباراة",
  elite: "نخبة",
  shop: "متجر",
  boss: "الزعيم",
};

const NODE_TYPE_ICON: Record<MapNode["type"], string> = {
  match: "♠",
  elite: "♛",
  shop: "🛒",
  boss: "👑",
};

const RADIUS = 54;
const THEME_BG = 0x2a1a3a;
const THEME_NODE = 0x1c102a;
const THEME_GOLD = 0xd4af37;
const TOP_MARGIN = 320;
const BOTTOM_MARGIN = 130;
// Slight zigzag so the path isn't a dead-straight line, cycling through these x offsets.
const X_OFFSETS = [0, -92, 92, -60, 60, -92, 0];

/** Renders the linear run map as a vertical, bottom-to-top climb (node 0 near the bottom). */
export class MapScene extends Phaser.Scene {
  private hudText!: Phaser.GameObjects.Text;
  private nodeLayer!: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Container;

  constructor() {
    super("map");
  }

  create(): void {
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, THEME_BG).setOrigin(0);
    arabicText(this, WIDTH / 2, 74, "بلوت روغلايك", { fontSize: "44px" });
    this.hudText = arabicText(this, WIDTH / 2, 150, "", {
      fontSize: "23px",
      color: "#ffd54a",
      wordWrap: { width: WIDTH - 60 },
    });
    this.nodeLayer = this.add.container(0, 0);
    this.refresh();
  }

  private refresh(): void {
    this.nodeLayer.removeAll(true);
    this.overlay?.destroy();
    this.overlay = undefined;

    const state = runController.getState();
    this.updateHud(state);

    if (state.over) {
      this.showRunOverPanel(state);
      return;
    }

    this.drawPath(state);
    if (state.blessing) this.showBlessingPanel(state);
  }

  private updateHud(state: RunState): void {
    // Icons with a level digit keep the line short enough not to wrap on a phone.
    const SUP = ["", "¹", "²", "³"];
    const jokerNames =
      state.jokerIds.map((id) => `${getJokerDef(id)?.icon ?? id}${SUP[state.jokerLevels[id] ?? 1] ?? ""}`).join("  ") ||
      "لا يوجد";
    const shields = state.shields > 0 ? `   🛡️ ${state.shields}` : "";
    const synergies = activeSynergies(state.jokerIds)
      .filter((x) => x.tier)
      .map((x) => `${x.tag} ${x.count}✓`)
      .join("  ");
    this.hudText.setText(
      `❤️ ${state.lives}   💰 ${state.gold}${shields}${state.nextMatchBoost ? `   ⚡ +${state.nextMatchBoost}` : ""}\nالجوكرز: ${jokerNames}` +
        (synergies ? `\nتآزر: ${synergies}` : ""),
    );
  }

  private drawPath(state: RunState): void {
    const n = state.nodes.length;
    const usableHeight = HEIGHT - TOP_MARGIN - BOTTOM_MARGIN;
    const yFor = (i: number) => HEIGHT - BOTTOM_MARGIN - (n === 1 ? 0 : (usableHeight * i) / (n - 1));
    const xFor = (i: number) => WIDTH / 2 + X_OFFSETS[i % X_OFFSETS.length];

    const lineGfx = this.add.graphics();
    for (let i = 0; i < n - 1; i++) {
      const cleared = state.cleared[i];
      lineGfx.lineStyle(8, cleared ? THEME_GOLD : 0x1c102a, cleared ? 1 : 0.5);
      lineGfx.lineBetween(xFor(i), yFor(i), xFor(i + 1), yFor(i + 1));
    }
    this.nodeLayer.add(lineGfx);

    const availableNode = runController.getAvailableNode();

    state.nodes.forEach((node, i) => {
      const isCurrent = i === state.currentIndex;
      const isCleared = state.cleared[i];
      const isAvailable = availableNode?.id === node.id;
      this.nodeLayer.add(this.drawNode(xFor(i), yFor(i), node, { isCurrent, isCleared, isAvailable }));
    });
  }

  private drawNode(
    x: number,
    y: number,
    node: MapNode,
    state: { isCurrent: boolean; isCleared: boolean; isAvailable: boolean },
  ): Phaser.GameObjects.Container {
    const radius = RADIUS;
const color = state.isCleared ? THEME_BG : state.isAvailable ? THEME_BG : THEME_NODE;
    const strokeColor = state.isAvailable ? THEME_GOLD : state.isCleared ? 0xf1c40f : 0x3a2a4a;

    const circle = this.add.circle(0, 0, radius, color).setStrokeStyle(state.isAvailable ? 8 : 4, strokeColor);
    const icon = this.add.text(0, -6, NODE_TYPE_ICON[node.type], { fontSize: "36px" }).setOrigin(0.5);
    const label = arabicText(this, radius + 92, -14, NODE_TYPE_LABEL_AR[node.type], {
      fontSize: "26px",
      color: state.isAvailable ? "#ffd54a" : "#bcd",
    });
    const targetLabel =
      node.matchTarget !== undefined
        ? arabicText(this, radius + 92, 22, `هدف ${node.matchTarget}`, { fontSize: "21px", color: "#8fae9a" })
        : null;

    const parts: Phaser.GameObjects.GameObject[] = [circle, icon, label];
    if (targetLabel) parts.push(targetLabel);
    const rival = runController.opponentFor(node);
    if (rival) {
      parts.push(
        arabicText(this, radius + 92, 56, `${rival.def.icon} ${rival.def.name}${rival.weak ? " 🔓" : ""}`, {
          fontSize: "21px",
          color: rival.weak ? "#9be6a8" : "#ffb3b3",
        }),
      );
    }
    if (state.isCleared) {
      parts.push(this.add.text(radius - 18, -radius + 4, "✓", { fontSize: "32px", color: "#5ad469" }));
    }

    const container = this.add.container(x, y, parts);

    if (state.isAvailable) {
      setBoxHitArea(container, radius * 2, radius * 2);
      container.input!.cursor = "pointer";
      container.on('pointerover', () => this.tweens.add({ targets: circle, scale: 1.15, duration: 150, ease: 'Back.Out' }));
      container.on('pointerout', () => this.tweens.add({ targets: circle, scale: 1, duration: 150, ease: 'Cubic.Out' }));
      container.on("pointerdown", () => this.enterNode(node));

      this.tweens.add({
        targets: circle,
        alpha: 0.6,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: "Sine.InOut",
      });
    }

    return container;
  }

  private enterNode(node: MapNode): void {
    if (node.type === "shop") {
      runController.enterNode(node.id);
      this.scene.start("shop");
      return;
    }
    this.showRivalPanel(node);
  }

  /** Who you're about to play, what their rule is, and whether your jokers have weakened it. */
  private showRivalPanel(node: MapNode): void {
    const rival = runController.opponentFor(node);
    if (!rival) return this.startMatch(node);
    this.overlay?.destroy();
    const { def, weak } = rival;
    const panelW = WIDTH - 80;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(20);
    this.overlay = panel;
    const bg = this.add.graphics();
    bg.fillStyle(THEME_NODE, 0.97);
    bg.fillRoundedRect(-panelW / 2, -330, panelW, 660, 28);
    bg.lineStyle(6, weak ? 0x5ad469 : 0xd45a5a, 0.9);
    bg.strokeRoundedRect(-panelW / 2, -330, panelW, 660, 28);
    panel.add(bg);
    const wrap = { wordWrap: { width: panelW - 70 } };
    panel.add(arabicText(this, 0, -270, `${NODE_TYPE_LABEL_AR[node.type]} — الهدف ${node.matchTarget}`, { fontSize: "26px", color: "#bcd" }));
    panel.add(this.add.text(0, -195, def.icon, { fontSize: "64px" }).setOrigin(0.5));
    panel.add(arabicText(this, 0, -120, def.name, { fontSize: "40px", color: "#ffd54a" }));
    panel.add(arabicText(this, 0, -40, weak ? weakRuleText(def) : def.rule, { fontSize: "27px", ...wrap }));
    const hint = weak
      ? `🔓 جوكرك من عائلة «${def.family}» أضعفهم`
      : `💡 أي جوكر من عائلة «${def.family}» يضعفهم`;
    panel.add(arabicText(this, 0, 60, hint, { fontSize: "24px", color: weak ? "#9be6a8" : "#9cc3ff", ...wrap }));
    const signature = getJokerDef(def.signature);
    if (signature && node.type === "elite") {
      panel.add(arabicText(this, 0, 130, `إذا فزت: ${signature.icon} ${signature.name} ضمن الجوايز`, { fontSize: "23px", color: "#e0c3ff", ...wrap }));
    } else if (node.type === "match") {
      panel.add(arabicText(this, 0, 130, `إذا فزت: جوايزك تميل لعائلة «${def.family}»`, { fontSize: "23px", color: "#e0c3ff", ...wrap }));
    }
    panel.add(makeButton(this, 80, 245, "ابدأ", () => this.startMatch(node), { width: 220 }).container);
    panel.add(
      makeButton(this, -170, 245, "رجوع", () => {
        panel.destroy();
        this.overlay = undefined;
      }, { width: 180, color: 0x5d5d5d }).container,
    );
  }

  private startMatch(node: MapNode): void {
    const rival = runController.opponentFor(node);
    runController.enterNode(node.id);
    const run = runController.getState();
    const modifiers = matchOptionsFromJokers(run.jokerIds, run.jokerLevels, { counters: run.jokerCounters, gold: run.gold });
    // دفعة: a one-off head start for this match, on top of any joker's.
    const boost = runController.takeMatchBoost();
    if (boost) modifiers.headStart = { ...modifiers.headStart, 0: (modifiers.headStart?.[0] ?? 0) + boost };
    if (rival) {
      modifiers.rival = rival.def.rules(rival.weak);
      modifiers.rivalLabel = `${rival.def.icon} ${rival.def.name}`;
      modifiers.rivalRule = rival.weak ? weakRuleText(rival.def) : rival.def.rule;
    }
    const data: TableSceneData = { nodeType: node.type, matchTarget: node.matchTarget!, modifiers };
    this.scene.start("table", data);
  }

  /** الحوت: pick one gift before the first node. */
  private showBlessingPanel(state: RunState): void {
    const offers = state.blessing!;
    const panelW = WIDTH - 60;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(20);
    this.overlay = panel;
    const bg = this.add.graphics();
    bg.fillStyle(0x0d2a3a, 0.98);
    bg.fillRoundedRect(-panelW / 2, -640, panelW, 1280, 28);
    bg.lineStyle(6, 0x4fb3d9, 0.9);
    bg.strokeRoundedRect(-panelW / 2, -640, panelW, 1280, 28);
    panel.add(bg);
    panel.add(this.add.text(0, -560, "🐋", { fontSize: "80px" }).setOrigin(0.5));
    panel.add(arabicText(this, 0, -470, "الحوت يعطيك هدية قبل تبدأ", { fontSize: "34px", color: "#ffd54a" }));
    panel.add(arabicText(this, 0, -420, "اختر وحدة", { fontSize: "25px", color: "#bcd" }));
    const title: Record<string, string> = { rare: "🎁 جوكر نادر", pair: "🤝 باقة من عائلة", gold: "💰 كنز", cursed: "🌊 عرض خطير" };
    offers.forEach((offer, i) => {
      const y = -290 + i * 230;
      const names = offer.items.map((id) => `${getJokerDef(id)?.icon ?? ""} ${getJokerDef(id)?.name ?? id}`).join(" + ");
      const body =
        offer.kind === "gold" ? `${BLESSING_GOLD} ذهب` : offer.kind === "cursed" ? `${names} (أسطوري) — مقابل حياة ❤️` : names;
      const card = this.add.container(0, y);
      const cbg = this.add.graphics();
      cbg.fillStyle(0x163d52, 1);
      cbg.fillRoundedRect(-(panelW - 80) / 2, -95, panelW - 80, 190, 22);
      cbg.lineStyle(3, offer.kind === "cursed" ? 0xd45a5a : 0x4fb3d9, 1);
      cbg.strokeRoundedRect(-(panelW - 80) / 2, -95, panelW - 80, 190, 22);
      card.add(cbg);
      card.add(arabicText(this, 0, -45, title[offer.kind], { fontSize: "28px", color: "#ffd54a" }));
      card.add(arabicText(this, 0, 20, body, { fontSize: "25px", wordWrap: { width: panelW - 140 } }));
      const tip = offer.items.length === 1 ? getJokerDef(offer.items[0])?.levels[0] : undefined;
      if (tip) card.add(arabicText(this, 0, 62, tip, { fontSize: "19px", color: "#9fc4d6", wordWrap: { width: panelW - 140 } }));
      setBoxHitArea(card, panelW - 80, 190);
      card.input!.cursor = "pointer";
      card.on("pointerdown", () => {
        runController.takeBlessing(i);
        this.refresh();
      });
      panel.add(card);
    });
  }

  private showRunOverPanel(state: RunState): void {
    const won = state.won;
    const panelW = WIDTH - 120;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(20);
    this.overlay = panel;

    const bg = this.add.graphics();
    bg.fillStyle(THEME_NODE, 1);
    bg.fillRoundedRect(-panelW / 2, -220, panelW, 440, 28);
    bg.lineStyle(6, won ? 0x5ad469 : 0xd45a5a, 0.9);
    bg.strokeRoundedRect(-panelW / 2, -220, panelW, 440, 28);
    panel.add(bg);

    panel.add(arabicText(this, 0, -120, won ? "أكملتم الرن! 🏆" : "انتهى الرن 💀", { fontSize: "42px" }));
    panel.add(
      arabicText(this, 0, -50, `جمعت ${state.gold} ذهب وقطعت ${state.cleared.filter(Boolean).length} عقدة`, {
        fontSize: "27px",
      }),
    );
    const jokers = state.jokerIds.map((id) => getJokerDef(id)?.icon ?? "").join(" ");
    if (jokers) panel.add(arabicText(this, 0, 5, `جوكرزك: ${jokers}`, { fontSize: "30px" }));

    const btn: ButtonHandle = makeButton(this, 0, 120, "ابدأ رن جديد", () => {
      runController.startNewRun();
      this.scene.restart();
    }, { width: 300 });
    panel.add(btn.container);
  }
}
