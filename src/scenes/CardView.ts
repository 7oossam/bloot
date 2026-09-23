import Phaser from "phaser";
import type { Card } from "../engine/types";
import { SUIT_COLOR_HEX, SUIT_SYMBOL } from "./cardArt";

/** Base card size, in the 860x1800 authoring space. */
export const CARD_W = 132;
export const CARD_H = 190;

/**
 * One playing card. Everything is drawn at the card's real on-screen size (via `sizeScale`)
 * rather than drawn big and shrunk with setScale — scaling a rendered text texture down is
 * what made the ranks blurry. The container's own scale is left at 1 for animation only.
 */
export class CardView extends Phaser.GameObjects.Container {
  readonly card: Card;
  readonly displayW: number;
  readonly displayH: number;
  private faceUp: boolean;
  private readonly sizeScale: number;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly shade: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, card: Card, faceUp: boolean, sizeScale = 1) {
    super(scene, x, y);
    this.card = card;
    this.faceUp = faceUp;
    this.sizeScale = sizeScale;
    this.displayW = CARD_W * sizeScale;
    this.displayH = CARD_H * sizeScale;
    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.shade = scene.add.graphics().setVisible(false);
    this.add(this.shade);
    this.setSize(this.displayW, this.displayH);
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

  /**
   * Greys out an unplayable card with an opaque shade drawn over it. Dimming by alpha made
   * the card see-through, and in an overlapping hand the card underneath showed through
   * every greyed card as a pale stripe.
   */
  setDimmed(on: boolean): void {
    this.shade.clear();
    if (on) {
      const w = this.displayW, h = this.displayH;
      this.shade.fillStyle(0x0b2a1e, 0.45);
      this.shade.fillRoundedRect(-w / 2, -h / 2, w, h, 16 * this.sizeScale);
    }
    this.shade.setVisible(on);
  }

  private redraw(highlighted = false): void {
    this.bg.clear();
    for (const t of this.texts) t.destroy();
    this.texts = [];

    const s = this.sizeScale;
    const w = this.displayW;
    const h = this.displayH;
    const r = 16 * s;

    if (this.faceUp) {
      // A soft drop shadow gives the card some lift off the felt.
      this.bg.fillStyle(0x000000, 0.28);
      this.bg.fillRoundedRect(-w / 2 + 3 * s, -h / 2 + 5 * s, w, h, r);

      this.bg.fillStyle(0xfdfbf6, 1);
      this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      this.bg.lineStyle(highlighted ? 6 * s : 2 * s, highlighted ? 0xffd54a : 0x2a2a2a, 1);
      this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

      const color = SUIT_COLOR_HEX[this.card.suit];
      const font = "Arial, Helvetica, sans-serif";

      // Corner index (rank over suit) — this is the part that stays visible when cards overlap.
      const rank = this.scene.add.text(-w / 2 + 11 * s, -h / 2 + 7 * s, this.card.rank, {
        fontFamily: font,
        fontSize: `${Math.round(40 * s)}px`,
        color,
        fontStyle: "bold",
      });
      const cornerSuit = this.scene.add.text(-w / 2 + 11 * s, -h / 2 + 48 * s, SUIT_SYMBOL[this.card.suit], {
        fontFamily: font,
        fontSize: `${Math.round(32 * s)}px`,
        color,
      });
      const centerSuit = this.scene.add
        .text(13 * s, 16 * s, SUIT_SYMBOL[this.card.suit], {
          fontFamily: font,
          fontSize: `${Math.round(66 * s)}px`,
          color,
        })
        .setOrigin(0.5);

      this.texts = [rank, cornerSuit, centerSuit];
      this.add(this.texts);
      this.bringToTop(this.shade);
    } else {
      this.bg.fillStyle(0x000000, 0.28);
      this.bg.fillRoundedRect(-w / 2 + 3 * s, -h / 2 + 5 * s, w, h, r);

      this.bg.fillStyle(0x1d4f8a, 1);
      this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      this.bg.lineStyle(2 * s, 0x0b2a52, 1);
      this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      this.bg.lineStyle(4 * s, 0x3a6fb5, 1);
      this.bg.strokeRoundedRect(-w / 2 + 12 * s, -h / 2 + 12 * s, w - 24 * s, h - 24 * s, r * 0.7);
    }
  }
}
