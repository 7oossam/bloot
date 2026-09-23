import Phaser from "phaser";
import { activeSynergies, getJokerDef, matchOptionsFromJokers } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
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
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0b3d2e).setOrigin(0);
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
      lineGfx.lineStyle(8, cleared ? 0x5ad469 : 0x2c6b4a, 1);
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
    const color = state.isCleared ? 0x1f6f43 : state.isAvailable ? 0x2f8f5b : 0x33443c;
    const strokeColor = state.isAvailable ? 0xffd54a : state.isCleared ? 0x5ad469 : 0x55665c;

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

    const parts = [circle, icon, label];
    if (targetLabel) parts.push(targetLabel);
    if (state.isCleared) {
      parts.push(this.add.text(radius - 18, -radius + 4, "✓", { fontSize: "32px", color: "#5ad469" }));
    }

    const container = this.add.container(x, y, parts);

    if (state.isAvailable) {
      setBoxHitArea(container, radius * 2, radius * 2);
      container.input!.cursor = "pointer";
      container.on("pointerover", () => circle.setScale(1.08));
      container.on("pointerout", () => circle.setScale(1));
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
    runController.enterNode(node.id);
    if (node.type === "shop") {
      this.scene.start("shop");
      return;
    }
    const modifiers = matchOptionsFromJokers(runController.getState().jokerIds, runController.getState().jokerLevels);
    // دفعة: a one-off head start for this match, on top of any joker's.
    const boost = runController.takeMatchBoost();
    if (boost) modifiers.headStart = { ...modifiers.headStart, 0: (modifiers.headStart?.[0] ?? 0) + boost };
    const data: TableSceneData = { nodeType: node.type, matchTarget: node.matchTarget!, modifiers };
    this.scene.start("table", data);
  }

  private showRunOverPanel(state: RunState): void {
    const won = state.won;
    const panelW = WIDTH - 120;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(20);
    this.overlay = panel;

    const bg = this.add.graphics();
    bg.fillStyle(0x0a2318, 1);
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
