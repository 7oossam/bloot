import Phaser from "phaser";
import { activeSynergies, getJokerDef, matchOptionsFromJokers } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import { getBlessing } from "../roguelike/blessings";
import { CHARACTERS, getCharacter } from "../roguelike/characters";
import type { MapNode, RunState } from "../roguelike/types";
import { ACTS } from "../roguelike/mapgen";
import { EVENT_KINDS } from "../roguelike/events";
import { getCurse } from "../roguelike/curses";
import { showAllStamps, showBlessingInfo, showCurseInfo, showJokerInfo } from "./infoPopup";
import { HEIGHT, WIDTH } from "./layout";
import { arabicText, makeButton, preloadUi, setBoxHitArea, type ButtonHandle } from "./ui";
import { addAmbience } from "./fx";
import { CSS, HEAD_FONT, PAL, goldRule, paintParchment, paperPanel } from "./theme";
import { INK, UI_ICON, addIcon, iconRow } from "./icons";
import type { TableSceneData } from "./TableScene";

const NODE_TYPE_LABEL_AR: Record<MapNode["type"], string> = {
  match: "ديوانية",
  elite: "مجلس كبير",
  shop: "دكّان التحف",
  boss: "ديوانية الزعيم",
  diwaniya: "باب غريب",
};

/** Each kind of stop gets an engraved ink symbol drawn in its medallion (no emoji). */
function drawNodeIcon(g: Phaser.GameObjects.Graphics, type: MapNode["type"], ink: number): void {
  g.fillStyle(ink, 1);
  g.lineStyle(3, ink, 1);
  switch (type) {
    case "match": {
      // A spade.
      g.fillCircle(-9, 2, 10);
      g.fillCircle(9, 2, 10);
      g.fillTriangle(-18, 0, 18, 0, 0, -20);
      g.fillTriangle(-3, 6, 3, 6, 0, 0);
      g.fillTriangle(-9, 18, 9, 18, 0, 6);
      break;
    }
    case "elite": {
      // A crown.
      g.fillPoints([
        new Phaser.Geom.Point(-20, 12), new Phaser.Geom.Point(-22, -12), new Phaser.Geom.Point(-10, 0),
        new Phaser.Geom.Point(0, -18), new Phaser.Geom.Point(10, 0), new Phaser.Geom.Point(22, -12),
        new Phaser.Geom.Point(20, 12),
      ], true);
      g.fillStyle(PAL.crimson, 1);
      g.fillCircle(0, 3, 4);
      break;
    }
    case "shop": {
      // A dallah: body, neck, lid and beak.
      g.fillEllipse(0, 8, 26, 22);
      g.fillRect(-5, -10, 10, 12);
      g.fillTriangle(-8, -10, 8, -10, 0, -20);
      g.lineStyle(4, ink, 1);
      g.beginPath(); g.moveTo(10, 2); g.lineTo(22, -12); g.strokePath();
      g.lineStyle(3, ink, 1);
      g.strokeEllipse(-14, 4, 10, 16);
      break;
    }
    case "diwaniya": {
      // A horseshoe-arched door.
      g.lineStyle(4, ink, 1);
      g.beginPath();
      g.moveTo(-14, 18); g.lineTo(-14, -2);
      g.arc(0, -2, 14, Math.PI, 0, false);
      g.lineTo(14, 18);
      g.strokePath();
      g.fillRect(-18, 16, 36, 4);
      g.fillCircle(5, 6, 2.5);
      break;
    }
    case "boss": {
      // The sun.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.lineBetween(Math.cos(a) * 13, Math.sin(a) * 13, Math.cos(a) * 22, Math.sin(a) * 22);
      }
      g.fillStyle(PAL.crimson, 1);
      g.fillCircle(0, 0, 11);
      break;
    }
  }
}

const RADIUS = 46;
/** How far apart the map's lanes are. */
const LANE_GAP = 250;
const TOP_MARGIN = 360;
const BOTTOM_MARGIN = 130;

/** Renders the linear run map as a vertical, bottom-to-top climb (node 0 near the bottom). */
export class MapScene extends Phaser.Scene {
  private hudText!: Phaser.GameObjects.Text;
  private hudLine?: Phaser.GameObjects.Container;
  private hudRow?: Phaser.GameObjects.Container;
  private nodeLayer!: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Container;

  constructor() {
    super("map");
  }

  preload(): void {
    preloadUi(this);
  }

  create(): void {
    paintParchment(this);
    addAmbience(this);
    // Header: a crimson title on the parchment, a gold rule, and the run's state in chips.
    const act = runController.getState().act ?? 0;
    arabicText(this, WIDTH / 2, 70, `${ACTS[act].name}  ·  ${act + 1} من ${ACTS.length}`, { fontFamily: HEAD_FONT, fontSize: "50px", fontStyle: "700", color: CSS.crimson, shadow: { offsetX: 0, offsetY: 0, color: "rgba(0,0,0,0)", blur: 0, fill: false } });
    this.add.existing(goldRule(this, WIDTH / 2, 118, 320));
    // Three lines: where you stand, your تحف as a row of icons, and your complete sets.
    this.hudText = this.pt(WIDTH / 2, 164, "", { fontSize: "24px", wordWrap: { width: WIDTH - 90 } });
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
    // The run opens with who you are, then الراوي's وصية. (The partner pick is hidden for now.)
    if (!state.character) this.showCharacterPanel();
    else if (state.blessing) this.showBlessingPanel(state);
  }

  private updateHud(state: RunState): void {
    const shields = state.shields > 0 ? `   ·   درع ${state.shields}` : "";
    const boost = state.nextMatchBoost ? `   ·   دفعة +${state.nextMatchBoost}` : "";
    const character = getCharacter(state.character);
    const curses = (state.curses ?? []).map((c) => getCurse(c)?.name).filter(Boolean);
    this.hudText.setText(`${character ? `${character.name}   ·   ` : ""}ساعات الليل ${state.lives}   ·   ${state.gold} ريال${shields}${boost}`);

    // Your وصايا, then your تحف with their level in stars.
    this.hudRow?.destroy();
    const items = [
      ...state.blessings.map((id) => ({ icon: getBlessing(id)?.icon ?? "", mark: "" })),
      ...state.jokerIds.map((id) => ({ icon: getJokerDef(id)?.icon ?? "", mark: "★".repeat(Math.max(0, (state.jokerLevels[id] ?? 1) - 1)) })),
    ];
    // Tap any of them for what it does.
    const tap = (i: number) =>
      i < state.blessings.length ? showBlessingInfo(this, state.blessings[i]) : showJokerInfo(this, state.jokerIds[i - state.blessings.length], state.jokerLevels[state.jokerIds[i - state.blessings.length]] ?? 1);
    this.hudRow = items.length
      ? iconRow(this, WIDTH / 2, 214, items, { size: Math.min(46, (WIDTH - 120) / items.length - 12), color: INK, onTap: tap })
      : this.add.container(WIDTH / 2, 214, [this.pt(0, 0, "ما عندك تحف للحين", { fontSize: "22px", color: CSS.inkSoft })]);

    const synergies = activeSynergies(state.jokerIds)
      .filter((x) => x.tier)
      .map((x) => `${x.tag} ${x.count} ✓`)
      .join("   ");
    // One line under your تحف, each part tappable: your stamps, your نحس (crimson), your
    // complete groups. One line only — two ran into the boss.
    this.hudLine?.destroy();
    const stamped = Object.values(state.stamps ?? {}).filter((ids) => ids.length).length;
    const parts: Array<{ text: string; color: string; tap?: () => void }> = [];
    if (stamped) parts.push({ text: `وسومك: ${stamped} ورق`, color: "#1f4a4d", tap: () => showAllStamps(this, state.stamps ?? {}, state.stampStars ?? {}) });
    if (curses.length) parts.push({ text: `نحس: ${curses.join("، ")}`, color: CSS.crimson, tap: () => showCurseInfo(this, state.curses!) });
    if (synergies) parts.push({ text: synergies, color: CSS.inkSoft });
    const line = this.add.container(WIDTH / 2, 258);
    const texts = parts.map((p) => {
      const t = this.pt(0, 0, p.text, { fontSize: "22px", color: p.color });
      if (p.tap) t.setInteractive({ useHandCursor: true }).on("pointerdown", p.tap);
      return t;
    });
    const gap = 36;
    const total = texts.reduce((n, t) => n + t.width, 0) + gap * Math.max(0, texts.length - 1);
    // Right to left, like the reading.
    let x = total / 2;
    for (const t of texts) {
      t.setX(x - t.width / 2);
      x -= t.width + gap;
      line.add(t);
    }
    if (total > WIDTH - 80) line.setScale((WIDTH - 80) / total);
    this.hudLine = line;
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
        const x1 = xFor(node), y1 = yFor(node), x2 = xFor(up), y2 = yFor(up);
        if (walked) {
          lineGfx.lineStyle(7, PAL.crimson, 0.95);
          lineGfx.lineBetween(x1, y1, x2, y2);
          continue;
        }
        // An inked dotted trail; the ones you can take now are bolder, in crimson.
        const len = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.floor(len / 22);
        lineGfx.fillStyle(open ? PAL.crimson : PAL.inkSoft, open ? 0.95 : 0.55);
        for (let k = 1; k < steps; k++) {
          const t = k / steps;
          lineGfx.fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, open ? 5 : 3.5);
        }
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
    const big = node.type === "boss" ? 1.3 : 1;
    const r = radius * big;
    // A medallion: gold rim, cream face, the stop's ink symbol.
    const disc = this.add.graphics();
    disc.fillStyle(0x3a2412, 0.35);
    disc.fillCircle(3, 6, r + 6);
    disc.fillStyle(state.isCleared ? PAL.gold : PAL.goldLo, 1);
    disc.fillCircle(0, 0, r + 6);
    disc.fillStyle(state.isCleared ? PAL.goldHi : PAL.paper, 1);
    disc.fillCircle(0, 0, r - 2);
    disc.lineStyle(2, PAL.gold, 1);
    disc.strokeCircle(0, 0, r - 8);
    const icon = this.add.graphics();
    drawNodeIcon(icon, node.type, state.isCleared ? PAL.goldLo : PAL.ink);
    icon.setScale(big);
    const ring = this.add.graphics();
    if (state.isAvailable) {
      ring.lineStyle(6, PAL.crimson, 1);
      ring.strokeCircle(0, 0, r + 14);
    }
    const target = runController.matchTargetFor(node);
    const label = arabicText(this, 0, r + 30, NODE_TYPE_LABEL_AR[node.type] + (target !== undefined ? ` ${target}` : ""), {
      fontFamily: HEAD_FONT,
      fontSize: "22px",
      fontStyle: "700",
      color: state.isAvailable ? CSS.crimson : CSS.inkSoft,
      shadow: { offsetX: 0, offsetY: 0, color: "rgba(0,0,0,0)", blur: 0, fill: false },
    });
    const circle = disc;

    // Who you'll play stays a surprise until you walk in.
    const parts: Phaser.GameObjects.GameObject[] = [ring, disc, icon, label];
    if (state.isCleared) {
      const tick = this.add.graphics();
      tick.fillStyle(PAL.crimson, 1);
      tick.fillCircle(r - 6, -r + 6, 14);
      tick.lineStyle(4, PAL.paper, 1);
      tick.beginPath(); tick.moveTo(r - 13, -r + 6); tick.lineTo(r - 8, -r + 11); tick.lineTo(r + 1, -r + 1); tick.strokePath();
      parts.push(tick);
    }

    const container = this.add.container(x, y, parts);

    if (state.isAvailable) {
      setBoxHitArea(container, radius * 2, radius * 2);
      container.input!.cursor = "pointer";
      container.on("pointerover", () => this.tweens.add({ targets: [circle, icon], scale: 1.1, duration: 150, ease: "Back.Out" }));
      container.on("pointerout", () => this.tweens.add({ targets: [circle, icon], scale: 1, duration: 150, ease: "Cubic.Out" }));
      container.on("pointerdown", () => this.enterNode(node));

      this.tweens.add({
        targets: ring,
        alpha: 0.25,
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

  /** Ink text on the paper panels (headings and body in El Messiri, no glow). */
  private pt(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle = {}): Phaser.GameObjects.Text {
    return arabicText(this, x, y, text, {
      fontFamily: HEAD_FONT,
      color: CSS.ink,
      shadow: { offsetX: 0, offsetY: 0, color: "rgba(0,0,0,0)", blur: 0, fill: false },
      ...style,
    });
  }

  /** Dims the map under a panel so the panel reads as the thing to answer. */
  private dimMap(panel: Phaser.GameObjects.Container): void {
    const dim = this.add.graphics();
    dim.fillStyle(0x1a0e08, 0.55);
    dim.fillRect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT);
    dim.setInteractive(new Phaser.Geom.Rectangle(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT), Phaser.Geom.Rectangle.Contains);
    panel.add(dim);
  }

  /** A panel in the middle of the map; returns it with its width. */
  private openPanel(height: number, border: number): { panel: Phaser.GameObjects.Container; panelW: number } {
    this.overlay?.destroy();
    const panelW = WIDTH - 80;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(20);
    this.overlay = panel;
    this.dimMap(panel);
    panel.add(paperPanel(this, panelW, height, { accent: border === PAL.crimson ? PAL.crimson : PAL.gold }));
    return { panel, panelW };
  }

  /** Who you're about to play, revealed as you walk in, and what their rule does to you. */
  private showRivalPanel(node: MapNode): void {
    const def = runController.opponentFor(node);
    if (!def) return this.startMatch(node);
    const { panel, panelW } = this.openPanel(660, PAL.crimson);
    const wrap = { wordWrap: { width: panelW - 70 } };
    panel.add(this.pt(0, -265, `${NODE_TYPE_LABEL_AR[node.type]} — الهدف ${runController.matchTargetFor(node)}`, { fontSize: "26px", color: CSS.inkSoft }));
    panel.add(goldRule(this, 0, -175, 360));
    panel.add(this.pt(0, -115, def.name, { fontSize: "40px", color: CSS.crimson }));
    panel.add(this.pt(0, -30, def.rule, { fontSize: "31px", ...wrap }));
    panel.add(this.pt(0, 70, def.hits, { fontSize: "27px", color: "#1f4a4d", ...wrap }));
    const off = def.rules.disableJoker ? runController.strongestJoker() : undefined;
    const offDef = off ? getJokerDef(off) : undefined;
    if (offDef) panel.add(this.pt(0, 125, `يتعطّل: ${offDef.name}`, { fontSize: "24px", color: CSS.crimson, ...wrap }));
    // What winning is worth: a stamp from a plain match, تحف from a مجلس كبير or a boss.
    const last = node.type === "boss" && runController.getState().act >= ACTS.length - 1;
    const prize = last ? "الباب الأخير" : node.type === "match" ? `وسم لورقة و${node.reward} ريال` : node.type === "elite" ? `ثلاث تحف تختار منها و${node.reward} ريال` : `ثلاث تحف أسطورية و${node.reward} ريال`;
    panel.add(this.pt(0, 170, `الجائزة: ${prize}`, { fontSize: "25px", color: "#8c5a1c", ...wrap }));
    panel.add(makeButton(this, 0, 250, "ابدأ", () => this.startMatch(node), { width: 300 }).container);
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
    const { panel, panelW } = this.openPanel(height, PAL.gold);
    const top = -height / 2;
    const wrap = { wordWrap: { width: panelW - 90 } };
    // The kind of door first (ضيافة، سوق، رهان…), so you know what you're walking into.
    const kind = EVENT_KINDS[event.kind];
    panel.add(this.pt(0, top + 55, kind.label, { fontSize: "26px", color: kind.color }));
    panel.add(goldRule(this, 0, top + 95, 360));
    panel.add(this.pt(0, top + 160, event.name, { fontSize: "34px", color: CSS.crimson }));
    panel.add(this.pt(0, top + 240, event.text, { fontSize: "26px", ...wrap }));
    event.options.forEach((option, i) => {
      const reason = runController.whyNotEventOption(i);
      const y = top + 360 + i * 130;
      const btn = makeButton(this, 0, y, option.label, () => this.showEventResult(runController.chooseEventOption(i)), {
        width: panelW - 90,
        height: 100,
        plate: "navy",
        disabled: !!reason,
      });
      if (reason) {
        btn.container.disableInteractive();
        btn.container.setAlpha(0.55);
        panel.add(this.pt(0, y + 58, reason, { fontSize: "19px", color: CSS.crimson }));
      }
      panel.add(btn.container);
    });
  }

  private showEventResult(text: string): void {
    const { panel } = this.openPanel(440, PAL.gold);
    panel.add(this.pt(0, -80, text, { fontSize: "30px", wordWrap: { width: WIDTH - 170 } }));
    // Some choices end in a pick (a وسم to put on a card): the spoils screen handles it.
    const next = () => (runController.getState().pendingRewards ? this.scene.start("reward", { goldEarned: 0 }) : this.refresh());
    panel.add(makeButton(this, 0, 110, "كمّل", next, { width: 260 }).container);
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
      modifiers.rivalLabel = rival.name;
      modifiers.rivalRule = rival.rule;
    }
    if (off) modifiers.disabledJoker = off;
    runController.applyBlessings(modifiers);
    // الوسوم on the deck's cards (they work only in your hand).
    modifiers.stamps = runController.stampRules();
    const data: TableSceneData = { nodeType: node.type, matchTarget: runController.matchTargetFor(node)!, modifiers };
    this.scene.start("table", data);
  }

  /** الشخصيات: pick who you are this run — its rule is yours from the first hand. */
  private showCharacterPanel(): void {
    const panelW = WIDTH - 60;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(20);
    this.overlay = panel;
    this.dimMap(panel);
    panel.add(paperPanel(this, panelW, 820));
    panel.add(this.pt(0, -340, "مين أنت الليلة؟", { fontSize: "38px", color: CSS.crimson }));
    const cardW = panelW - 80;
    CHARACTERS.forEach((def, i) => {
      const y = -150 + i * 320;
      const card = this.add.container(0, y);
      const cbg = this.add.graphics();
      cbg.fillStyle(PAL.paperDeep, 1);
      cbg.fillRoundedRect(-cardW / 2, -140, cardW, 280, 18);
      cbg.lineStyle(2.5, PAL.gold, 1);
      cbg.strokeRoundedRect(-cardW / 2, -140, cardW, 280, 18);
      card.add(cbg);
      // The icon on the right, where the eye starts; the words in the rest of the card.
      card.add(addIcon(this, cardW / 2 - 76, 0, def.icon, 92, INK));
      const tx = -52;
      const tw = cardW - 210;
      card.add(this.pt(tx, -98, def.name, { fontSize: "38px", color: CSS.crimson }));
      card.add(this.pt(tx, -8, def.rule, { fontSize: "26px", wordWrap: { width: tw } }));
      card.add(this.pt(tx, 92, def.style, { fontSize: "25px", color: "#8c5a1c", wordWrap: { width: tw } }));
      setBoxHitArea(card, cardW, 280);
      card.input!.cursor = "pointer";
      card.on("pointerdown", () => {
        runController.chooseCharacter(def.id);
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
    this.dimMap(panel);
    panel.add(paperPanel(this, panelW, 1120));
    panel.add(goldRule(this, 0, -505, 360));
    panel.add(addIcon(this, 0, -455, UI_ICON.narrator, 60, INK));
    // Between maps it's a gift for the road, with the new map's line; at the start, a وصية.
    const between = offers[0]?.startsWith("act-");
    panel.add(this.pt(0, -398, between ? `وصلت ${ACTS[state.act].name}` : "الراوي يعطيك وصية لليلة كلها", { fontSize: "34px", color: CSS.crimson }));
    panel.add(this.pt(0, -325, between ? `${ACTS[state.act].intro} — الراوي يعطيك هدية، اختر وحدة` : "اختر وحدة", { fontSize: "25px", color: CSS.inkSoft, wordWrap: { width: panelW - 90 } }));
    const cardW = panelW - 80;
    offers.forEach((id, i) => {
      const def = getBlessing(id)!;
      const y = -170 + i * 250;
      const card = this.add.container(0, y);
      const cbg = this.add.graphics();
      cbg.fillStyle(PAL.paperDeep, 1);
      cbg.fillRoundedRect(-cardW / 2, -105, cardW, 210, 18);
      cbg.lineStyle(2.5, def.price ? PAL.crimson : PAL.gold, 1);
      cbg.strokeRoundedRect(-cardW / 2, -105, cardW, 210, 18);
      card.add(cbg);
      card.add(addIcon(this, cardW / 2 - 70, 0, def.icon, 76, INK));
      const tx = -48;
      const tw = cardW - 200;
      card.add(this.pt(tx, -60, def.name, { fontSize: "30px", color: CSS.crimson }));
      card.add(this.pt(tx, 0, def.gift, { fontSize: "28px", wordWrap: { width: tw } }));
      card.add(
        this.pt(tx, 55, def.note ?? (def.price ? `الثمن: ${def.price}` : "بدون ثمن"), {
          fontSize: "25px",
          color: def.price ? "#8c5a1c" : "#3e4a2a",
          wordWrap: { width: tw },
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

    this.dimMap(panel);
    panel.add(paperPanel(this, panelW, 480, { accent: won ? PAL.gold : PAL.crimson }));

    panel.add(this.pt(0, -120, won ? "انفتح الباب اللي ما له باب" : "طلع الفجر وأنت على الطاولة", { fontSize: "40px", color: won ? CSS.crimson : CSS.ink, wordWrap: { width: panelW - 80 } }));
    panel.add(
      this.pt(0, -60, won ? "ثلاث مفاتيح، ورجع اسم جدّك لأهل الحي" : "تبقى ضيف عند المعزّب لين ليلة الأربعين الجاية", { fontSize: "25px", color: CSS.inkSoft, wordWrap: { width: panelW - 80 } }),
    );
    panel.add(
      this.pt(0, 0, `وصلت ${ACTS[state.act].name} · ${state.act + 1} من ${ACTS.length}`, {
        fontSize: "27px",
      }),
    );
    if (state.jokerIds.length) panel.add(iconRow(this, 0, 55, state.jokerIds.map((id) => ({ icon: getJokerDef(id)?.icon ?? "" })), { size: 44, color: INK }));

    const btn: ButtonHandle = makeButton(this, 0, 150, "ابدأ ليلة جديدة", () => {
      runController.startNewRun();
      this.scene.restart();
    }, { width: 300, plate: "teal" });
    panel.add(btn.container);
  }
}
