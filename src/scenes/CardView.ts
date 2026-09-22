import Phaser from "phaser";
import type { Card } from "../engine/types";
import { SUIT_COLOR_HEX, SUIT_SYMBOL } from "./cardArt";

export const CARD_W = 64;
export const CARD_H = 92;

/** One playing card as a Phaser container: a rounded rect face plus rank/suit text, or a card-back pattern. */
export class CardView extends Phaser.GameObjects.Container {
  readonly card: Card;
  private faceUp: boolean;
  private readonly bg: Phaser.GameObjects.Graphics;
  private rankText?: Phaser.GameObjects.Text;
  private suitText?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, card: Card, faceUp: boolean) {
    super(scene, x, y);
    this.card = card;
    this.faceUp = faceUp;
    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.setSize(CARD_W, CARD_H);
    this.redraw();
    scene.add.existing(this);
  }

  setFaceUp(faceUp: boolean): void {
    this.faceUp = faceUp;
    this.redraw();
  }

  setHighlighted(on: boolean): void {
    this.redraw(on);
  }

  setDimmed(on: boolean): void {
    this.setAlpha(on ? 0.55 : 1);
  }

  private redraw(highlighted = false): void {
    this.bg.clear();
    this.rankText?.destroy();
    this.suitText?.destroy();
    this.rankText = undefined;
    this.suitText = undefined;

    const w = CARD_W;
    const h = CARD_H;
    const r = 8;

    if (this.faceUp) {
      this.bg.fillStyle(0xfaf7f0, 1);
      this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      this.bg.lineStyle(highlighted ? 3 : 1.5, highlighted ? 0xffd54a : 0x333333, 1);
      this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

      const color = SUIT_COLOR_HEX[this.card.suit];
      this.rankText = this.scene.add.text(-w / 2 + 6, -h / 2 + 2, this.card.rank, {
        fontFamily: "Arial",
        fontSize: "14px",
        color,
        fontStyle: "bold",
      });
      this.suitText = this.scene.add
        .text(0, 6, SUIT_SYMBOL[this.card.suit], { fontFamily: "Arial", fontSize: "28px", color })
        .setOrigin(0.5);
      this.add([this.rankText, this.suitText]);
    } else {
      this.bg.fillStyle(0x1d4f8a, 1);
      this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      this.bg.lineStyle(1.5, 0x0b2a52, 1);
      this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      this.bg.lineStyle(2, 0x3a6fb5, 1);
      this.bg.strokeRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, r - 2);
    }
  }
}
