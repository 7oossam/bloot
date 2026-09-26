import Phaser from "phaser";
import { activeSynergies, getJokerDef, matchOptionsFromJokers } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import { getBlessing } from "../roguelike/blessings";
import { getPartner, PARTNERS } from "../roguelike/partners";
import type { MapNode, RunState } from "../roguelike/types";
import { HEIGHT, WIDTH } from "./layout";
import { arabicText, makeButton, setBoxHitArea, type ButtonHandle } from "./ui";
import { addAmbience, addCameraGrade, paintBackdrop } from "./fx";
import type { TableSceneData } from "./TableScene";

const NODE_TYPE_LABEL_AR: Record<MapNode["type"], string> = {
  match: "مباراة",
  elite: "نخبة",
  shop: "متجر",
  boss: "الزعيم",
  diwaniya: "الديوانية",
};

const NODE_TYPE_ICON: Record<MapNode["type"], string> = {
  match: "♠",
  elite: "♛",
  shop: "🛒",
  boss: "👑",
  diwaniya: "🫖",
};

const RADIUS = 44;
/** How far apart the map's lanes are. */
const LANE_GAP = 250;
const THEME_BG = 0x2a1a3a;
const THEME_NODE = 0x1c102a;
const THEME_GOLD = 0xd4af37;
const TOP_MARGIN = 320;
const BOTTOM_MARGIN = 130;

/** Renders the linear run map as a vertical, bottom-to-top climb (node 0 near the bottom). */
export class MapScene extends Phaser.Scene {
  private hudText!: Phaser.GameObjects.Text;
  private nodeLayer!: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Container;

  constructor() {
    super("map");
  }

  create(): void {
    paintBackdrop(this);
    addAmbience(this);
    addCameraGrade(this);
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
    // The run opens with your partner, then الحوت's blessing.
    if (!state.partner) this.showPartnerPanel();
    else if (state.blessing) this.showBlessingPanel(state);
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
    const blessings = state.blessings.map((id) => getBlessing(id)?.icon ?? "").join(" ");
    const partner = getPartner(state.partner);
    this.hudText.setText(
      `${partner ? `${partner.icon}   ` : ""}❤️ ${state.lives}   💰 ${state.gold}${shields}${state.nextMatchBoost ? `   ⚡ +${state.nextMatchBoost}` : ""}${blessings ? `   🐋 ${blessings}` : ""}\nالجوكرز: ${jokerNames}` +
        (synergies ? `\nتآزر: ${synergies}` : ""),
    );
  }

  /** The branching map, bottom row first: links, then nodes (the ones you can walk into pulse). */
  private drawPath(state: RunState): void {
    const rows = Math.max(...state.nodes.map((n) => n.floor)) + 1;
    const usableHeight = HEIGHT - TOP_MARGIN - BOTTOM_MARGIN;
    const yFor = (node: MapNode) => HEIGHT - BOTTOM_MARGIN - (usableHeight * node.floor) / (rows - 1);
    const xFor = (node: MapNode) => WIDTH / 2 + ((node.col ?? 1) - 1) * LANE_GAP;
    const byId = new Map(state.nodes.map((n, i) => [n.id, { node: n, i }]));
    const available = new Set(runController.getAvailableNodes().map((n) => n.id));
    const current = state.nodes[state.currentIndex];
    const here = current?.floor ?? -1;

    const lineGfx = this.add.graphics();
    for (const { node, i } of byId.values()) {
      for (const id of node.next) {
        const { node: up, i: j } = byId.get(id)!;
        const walked = state.cleared[i] && state.cleared[j];
        const open = current?.id === node.id && available.has(id);
        lineGfx.lineStyle(walked || open ? 7 : 4, walked ? THEME_GOLD : open ? 0xffd54a : 0x4a3a5a, walked || open ? 1 : 0.6);
        lineGfx.lineBetween(xFor(node), yFor(node), xFor(up), yFor(up));
      }
    }
    this.nodeLayer.add(lineGfx);

    state.nodes.forEach((node, i) => {
      const isCleared = state.cleared[i];
      const isAvailable = available.has(node.id);
      // Rows you've passed without taking this node are behind you now.
      const missed = !isCleared && node.floor <= here;
      const view = this.drawNode(xFor(node), yFor(node), node, { isCurrent: i === state.currentIndex, isCleared, isAvailable });
      if (missed) view.setAlpha(0.35);
      this.nodeLayer.add(view);
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
    const icon = this.add.text(0, -4, NODE_TYPE_ICON[node.type], { fontSize: "32px" }).setOrigin(0.5);
    const target = runController.matchTargetFor(node);
    const label = arabicText(this, 0, radius + 20, NODE_TYPE_LABEL_AR[node.type] + (target !== undefined ? ` ${target}` : ""), {
      fontSize: "20px",
      color: state.isAvailable ? "#ffd54a" : "#bcd",
    });

    // Who you'll play stays a surprise until you walk in.
    const parts: Phaser.GameObjects.GameObject[] = [circle, icon, label];
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
    if (node.type === "diwaniya") {
      runController.enterNode(node.id);
      this.showEventPanel(node);
      return;
    }
    this.showRivalPanel(node);
  }

  /** A panel in the middle of the map; returns it with its width. */
  private openPanel(height: number, border: number): { panel: Phaser.GameObjects.Container; panelW: number } {
    this.overlay?.destroy();
    const panelW = WIDTH - 80;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(20);
    this.overlay = panel;
    const bg = this.add.graphics();
    bg.fillStyle(THEME_NODE, 0.97);
    bg.fillRoundedRect(-panelW / 2, -height / 2, panelW, height, 28);
    bg.lineStyle(6, border, 0.9);
    bg.strokeRoundedRect(-panelW / 2, -height / 2, panelW, height, 28);
    panel.add(bg);
    return { panel, panelW };
  }

  /** Who you're about to play, revealed as you walk in, and what their rule does to you. */
  private showRivalPanel(node: MapNode): void {
    const def = runController.opponentFor(node);
    if (!def) return this.startMatch(node);
    const { panel, panelW } = this.openPanel(640, 0xd45a5a);
    const wrap = { wordWrap: { width: panelW - 70 } };
    panel.add(arabicText(this, 0, -265, `${NODE_TYPE_LABEL_AR[node.type]} — الهدف ${runController.matchTargetFor(node)}`, { fontSize: "26px", color: "#bcd" }));
    panel.add(this.add.text(0, -190, def.icon, { fontSize: "64px" }).setOrigin(0.5));
    panel.add(arabicText(this, 0, -115, def.name, { fontSize: "40px", color: "#ffd54a" }));
    panel.add(arabicText(this, 0, -30, def.rule, { fontSize: "28px", ...wrap }));
    panel.add(arabicText(this, 0, 60, `💡 ${def.hits}`, { fontSize: "23px", color: "#9cc3ff", ...wrap }));
    const off = def.rules.disableJoker ? runController.strongestJoker() : undefined;
    const offDef = off ? getJokerDef(off) : undefined;
    if (offDef) panel.add(arabicText(this, 0, 125, `🔒 يتعطّل: ${offDef.icon} ${offDef.name}`, { fontSize: "24px", color: "#ffb3b3", ...wrap }));
    panel.add(makeButton(this, 0, 235, "ابدأ", () => this.startMatch(node), { width: 300 }).container);
  }

  /** الديوانية: the scene, its choices, then what happened. */
  private showEventPanel(node: MapNode): void {
    const event = runController.eventFor(node);
    if (!event) {
      runController.leaveShopNode();
      return this.refresh();
    }
    const n = event.options.length;
    const height = 380 + n * 130;
    const { panel, panelW } = this.openPanel(height, 0x4fb3d9);
    const top = -height / 2;
    const wrap = { wordWrap: { width: panelW - 90 } };
    panel.add(this.add.text(0, top + 80, event.icon, { fontSize: "64px" }).setOrigin(0.5));
    panel.add(arabicText(this, 0, top + 160, `الديوانية — ${event.name}`, { fontSize: "34px", color: "#ffd54a" }));
    panel.add(arabicText(this, 0, top + 240, event.text, { fontSize: "26px", ...wrap }));
    event.options.forEach((option, i) => {
      const reason = runController.whyNotEventOption(i);
      const y = top + 360 + i * 130;
      const btn = makeButton(this, 0, y, option.label, () => this.showEventResult(runController.chooseEventOption(i)), {
        width: panelW - 90,
        height: 100,
        fontSize: "23px",
        color: reason ? 0x3a3a3a : 0x2d4a5e,
      });
      if (reason) {
        btn.container.disableInteractive();
        btn.container.setAlpha(0.55);
        panel.add(arabicText(this, 0, y + 58, reason, { fontSize: "19px", color: "#ff9a9a" }));
      }
      panel.add(btn.container);
    });
  }

  private showEventResult(text: string): void {
    const { panel } = this.openPanel(420, 0x4fb3d9);
    panel.add(arabicText(this, 0, -80, text, { fontSize: "30px", wordWrap: { width: WIDTH - 170 } }));
    panel.add(makeButton(this, 0, 110, "كمّل", () => this.refresh(), { width: 260 }).container);
  }

  private startMatch(node: MapNode): void {
    const rival = runController.opponentFor(node);
    // المعطّل: your strongest joker sits this match out.
    const off = rival?.rules.disableJoker ? runController.strongestJoker() : undefined;
    runController.enterNode(node.id);
    const run = runController.getState();
    const jokerIds = run.jokerIds.filter((id) => id !== off);
    const modifiers = matchOptionsFromJokers(jokerIds, run.jokerLevels, { counters: run.jokerCounters, gold: run.gold });
    // دفعة: a one-off head start for this match, on top of any joker's.
    const boost = runController.takeMatchBoost();
    if (boost) modifiers.headStart = { ...modifiers.headStart, 0: (modifiers.headStart?.[0] ?? 0) + boost };
    // The opponents' head start: their own (السبّاقين) plus a ديوانية choice's price.
    const behind = (rival?.rules.headStart ?? 0) + runController.takeMatchPenalty();
    if (behind) modifiers.headStart = { ...modifiers.headStart, 1: (modifiers.headStart?.[1] ?? 0) + behind };
    if (rival) {
      modifiers.rival = rival.rules;
      modifiers.rivalLabel = `${rival.icon} ${rival.name}`;
      modifiers.rivalRule = rival.rule;
    }
    if (off) modifiers.disabledJoker = off;
    runController.applyBlessings(modifiers);
    const data: TableSceneData = { nodeType: node.type, matchTarget: runController.matchTargetFor(node)!, modifiers };
    this.scene.start("table", data);
  }

  /** شخصيات الخوي: pick who sits across from you this run. */
  private showPartnerPanel(): void {
    const panelW = WIDTH - 60;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(20);
    this.overlay = panel;
    const bg = this.add.graphics();
    bg.fillStyle(0x1c102a, 0.98);
    bg.fillRoundedRect(-panelW / 2, -700, panelW, 1400, 28);
    bg.lineStyle(6, 0xd4af37, 0.9);
    bg.strokeRoundedRect(-panelW / 2, -700, panelW, 1400, 28);
    panel.add(bg);
    panel.add(arabicText(this, 0, -630, "مين خويك هالرن؟", { fontSize: "38px", color: "#ffd54a" }));
    const cardW = panelW - 80;
    PARTNERS.forEach((def, i) => {
      const y = -470 + i * 300;
      const card = this.add.container(0, y);
      const cbg = this.add.graphics();
      cbg.fillStyle(0x2a1a3a, 1);
      cbg.fillRoundedRect(-cardW / 2, -130, cardW, 260, 22);
      cbg.lineStyle(3, 0xd4af37, 0.8);
      cbg.strokeRoundedRect(-cardW / 2, -130, cardW, 260, 22);
      card.add(cbg);
      card.add(arabicText(this, 0, -80, `${def.icon} ${def.name}`, { fontSize: "32px", color: "#ffd54a" }));
      card.add(arabicText(this, 0, -10, `✨ ${def.perk}`, { fontSize: "23px", wordWrap: { width: cardW - 60 } }));
      card.add(arabicText(this, 0, 70, `⚖️ ${def.quirk}`, { fontSize: "22px", color: "#ffc27a", wordWrap: { width: cardW - 60 } }));
      setBoxHitArea(card, cardW, 260);
      card.input!.cursor = "pointer";
      card.on("pointerdown", () => {
        runController.choosePartner(def.id);
        this.refresh();
      });
      panel.add(card);
    });
  }

  /** الحوت: pick one of three blessings before the first node. */
  private showBlessingPanel(state: RunState): void {
    const offers = state.blessing!;
    const panelW = WIDTH - 60;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(20);
    this.overlay = panel;
    const bg = this.add.graphics();
    bg.fillStyle(0x0d2a3a, 0.98);
    bg.fillRoundedRect(-panelW / 2, -560, panelW, 1120, 28);
    bg.lineStyle(6, 0x4fb3d9, 0.9);
    bg.strokeRoundedRect(-panelW / 2, -560, panelW, 1120, 28);
    panel.add(bg);
    panel.add(this.add.text(0, -470, "🐋", { fontSize: "80px" }).setOrigin(0.5));
    panel.add(arabicText(this, 0, -380, "الحوت يعطيك بركة للرن كله", { fontSize: "34px", color: "#ffd54a" }));
    panel.add(arabicText(this, 0, -330, "اختر وحدة", { fontSize: "25px", color: "#bcd" }));
    const cardW = panelW - 80;
    offers.forEach((id, i) => {
      const def = getBlessing(id)!;
      const y = -170 + i * 250;
      const card = this.add.container(0, y);
      const cbg = this.add.graphics();
      cbg.fillStyle(0x163d52, 1);
      cbg.fillRoundedRect(-cardW / 2, -105, cardW, 210, 22);
      cbg.lineStyle(3, def.price ? 0xe0a040 : 0x4fb3d9, 1);
      cbg.strokeRoundedRect(-cardW / 2, -105, cardW, 210, 22);
      card.add(cbg);
      card.add(arabicText(this, 0, -60, `${def.icon} ${def.name}`, { fontSize: "30px", color: "#ffd54a" }));
      card.add(arabicText(this, 0, 0, `✨ ${def.gift}`, { fontSize: "25px", wordWrap: { width: cardW - 60 } }));
      card.add(
        arabicText(this, 0, 55, def.price ? `⚖️ ${def.price}` : "بدون ثمن", {
          fontSize: "22px",
          color: def.price ? "#ffc27a" : "#9be6a8",
          wordWrap: { width: cardW - 60 },
        }),
      );
      setBoxHitArea(card, cardW, 210);
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
