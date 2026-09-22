import Phaser from "phaser";
import { matchOptionsFromJokers, getJokerDef } from "../roguelike/jokers";
import { runController } from "../roguelike/RunController";
import type { MapNode, RunState } from "../roguelike/types";
import { HEIGHT, WIDTH } from "./layout";
import { arabicText, makeButton, type ButtonHandle } from "./ui";
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

const RADIUS = 26;
const TOP_MARGIN = 150;
const BOTTOM_MARGIN = 60;
// Slight zigzag so the path isn't a dead-straight line, cycling through these x offsets.
const X_OFFSETS = [0, -46, 46, -30, 30, -46, 0];

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
    arabicText(this, WIDTH / 2, 34, "بلوت روغلايك", { fontSize: "22px" });
    this.hudText = arabicText(this, WIDTH / 2, 66, "", { fontSize: "12px", color: "#ffd54a" });
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
    const jokerNames = state.jokerIds.map((id) => getJokerDef(id)?.name ?? id).join("، ") || "لا يوجد";
    this.hudText.setText(`الأرواح ${state.lives}   الذهب ${state.gold}\nالجوكرز: ${jokerNames}`);
  }

  private drawPath(state: RunState): void {
    const n = state.nodes.length;
    const usableHeight = HEIGHT - TOP_MARGIN - BOTTOM_MARGIN;
    const yFor = (i: number) => HEIGHT - BOTTOM_MARGIN - (n === 1 ? 0 : (usableHeight * i) / (n - 1));
    const xFor = (i: number) => WIDTH / 2 + X_OFFSETS[i % X_OFFSETS.length];

    const lineGfx = this.add.graphics();
    for (let i = 0; i < n - 1; i++) {
      const cleared = state.cleared[i];
      lineGfx.lineStyle(4, cleared ? 0x5ad469 : 0x2c6b4a, 1);
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

    const circle = this.add.circle(0, 0, radius, color).setStrokeStyle(state.isAvailable ? 4 : 2, strokeColor);
    const icon = this.add.text(0, -3, NODE_TYPE_ICON[node.type], { fontSize: "17px" }).setOrigin(0.5);
    const label = arabicText(this, radius + 46, 0, NODE_TYPE_LABEL_AR[node.type], {
      fontSize: "12px",
      color: state.isAvailable ? "#ffd54a" : "#bcd",
    });
    const targetLabel =
      node.matchTarget !== undefined
        ? arabicText(this, radius + 46, 16, `هدف ${node.matchTarget}`, { fontSize: "10px", color: "#8fae9a" })
        : null;

    const parts = [circle, icon, label];
    if (targetLabel) parts.push(targetLabel);
    if (state.isCleared) {
      parts.push(this.add.text(radius - 8, -radius + 2, "✓", { fontSize: "15px", color: "#5ad469" }));
    }

    const container = this.add.container(x, y, parts);

    if (state.isAvailable) {
      container.setSize(radius * 2, radius * 2);
      container.setInteractive(
        new Phaser.Geom.Rectangle(-radius, -radius, radius * 2, radius * 2),
        Phaser.Geom.Rectangle.Contains,
      );
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
    const data: TableSceneData = {
      nodeType: node.type,
      matchTarget: node.matchTarget!,
      modifiers: matchOptionsFromJokers(runController.getState().jokerIds),
    };
    this.scene.start("table", data);
  }

  private showRunOverPanel(state: RunState): void {
    const won = state.won;
    const panelW = WIDTH - 60;
    const panel = this.add.container(WIDTH / 2, HEIGHT / 2);
    this.overlay = panel;

    const bg = this.add.graphics();
    bg.fillStyle(0x0a2318, 0.97);
    bg.fillRoundedRect(-panelW / 2, -110, panelW, 220, 14);
    bg.lineStyle(3, won ? 0x5ad469 : 0xd45a5a, 0.9);
    bg.strokeRoundedRect(-panelW / 2, -110, panelW, 220, 14);
    panel.add(bg);

    panel.add(arabicText(this, 0, -60, won ? "أكملتم الرن! 🏆" : "انتهى الرن 💀", { fontSize: "22px" }));
    panel.add(
      arabicText(this, 0, -15, `جمعت ${state.gold} ذهب وقطعت ${state.cleared.filter(Boolean).length} عقدة`, {
        fontSize: "14px",
      }),
    );

    const btn: ButtonHandle = makeButton(this, 0, 55, "ابدأ رن جديد", () => {
      runController.startNewRun();
      this.refresh();
    });
    panel.add(btn.container);
  }
}
