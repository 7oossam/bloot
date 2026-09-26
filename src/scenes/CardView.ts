import Phaser from "phaser";
import type { Card } from "../engine/types";
import { SUIT_COLOR_HEX, SUIT_SYMBOL } from "./cardArt";
import { cardBackKey, cardFaceKey, cardHaloKey, cardShadowKey } from "./fx";

/** Base card size, in the 860x1800 authoring space. */
export const CARD_W = 132;
export const CARD_H = 190;

const CARD_FONT = "Tajawal, Arial, Helvetica, sans-serif";

/**
 * One playing card. Everything is drawn at the card's real on-screen size (via `sizeScale`)
 * rather than drawn big and shrunk with setScale — scaling a rendered text texture down is
 * what made the ranks blurry. The container's own scale is left at 1 for animation only.
 *
 * Layers, bottom to top: a soft shadow that grows as the card lifts, a glow for a playable
 * card, the paper (or the zellige back), the rank and suit, and the shade over an unplayable
 * card.
 */
export class CardView extends Phaser.GameObjects.Container {
  readonly card: Card;
  readonly displayW: number;
  readonly displayH: number;
  private faceUp: boolean;
  private readonly sizeScale: number;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly halo: Phaser.GameObjects.Image;
  private readonly paper: Phaser.GameObjects.Image;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly shade: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private haloTween?: Phaser.Tweens.Tween;
  private lifted = false;

  constructor(scene: Phaser.Scene, x: number, y: number, card: Card, faceUp: boolean, sizeScale = 1) {
    super(scene, x, y);
    this.card = card;
    this.faceUp = faceUp;
    this.sizeScale = sizeScale;
    this.displayW = CARD_W * sizeScale;
    this.displayH = CARD_H * sizeScale;
    const w = this.displayW;
    const h = this.displayH;
    const r = 16 * sizeScale;

    this.shadow = scene.add.image(4 * sizeScale, 8 * sizeScale, cardShadowKey(scene, w, h, r)).setAlpha(0.8);
    this.halo = scene.add.image(0, 0, cardHaloKey(scene, w, h, r)).setTint(0xffd98a).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.paper = scene.add.image(0, 0, cardFaceKey(scene, w, h, r)).setDisplaySize(w, h);
    this.frame = scene.add.graphics();
    this.shade = scene.add.graphics().setVisible(false);
    this.add([this.shadow, this.halo, this.paper, this.frame, this.shade]);
    this.setSize(w, h);
    this.redraw();
    scene.add.existing(this);

    this.on("pointerover", () => this.lift(true));
    this.on("pointerout", () => this.lift(false));
  }

  setFaceUp(faceUp: boolean): void {
    this.faceUp = faceUp;
    this.redraw();
  }

  setHighlighted(on: boolean): void {
    this.redraw(on);
  }

  /** A playable card breathes a warm glow while it's your turn. */
  setPlayable(on: boolean): void {
    this.haloTween?.stop();
    this.haloTween = undefined;
    if (!on) {
      this.halo.setAlpha(0);
      return;
    }
    this.halo.setAlpha(0.5);
    this.haloTween = this.scene.tweens.add({ targets: this.halo, alpha: { from: 0.45, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: "Sine.InOut" });
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
      this.shade.fillStyle(0x1a2a2e, 0.5);
      this.shade.fillRoundedRect(-w / 2, -h / 2, w, h, 16 * this.sizeScale);
      this.setPlayable(false);
    }
    this.shade.setVisible(on);
  }

  /** Hover: the card rises toward you, its shadow spreading and softening beneath it. */
  private lift(up: boolean): void {
    if (this.lifted === up) return;
    this.lifted = up;
    const s = this.sizeScale;
    this.scene.tweens.add({ targets: this, scaleX: up ? 1.08 : 1, scaleY: up ? 1.08 : 1, angle: up ? (Math.random() - 0.5) * 4 : 0, duration: 160, ease: up ? "Back.Out" : "Cubic.Out" });
    this.scene.tweens.add({ targets: this.shadow, x: (up ? 10 : 4) * s, y: (up ? 20 : 8) * s, alpha: up ? 0.55 : 0.8, scale: up ? 1.06 : 1, duration: 160, ease: "Cubic.Out" });
  }

  destroy(fromScene?: boolean): void {
    this.haloTween?.stop();
    super.destroy(fromScene);
  }

  private redraw(highlighted = false): void {
    this.frame.clear();
    for (const t of this.texts) t.destroy();
    this.texts = [];

    const s = this.sizeScale;
    const w = this.displayW;
    const h = this.displayH;
    const r = 16 * s;

    if (this.faceUp) {
      this.paper.setTexture(cardFaceKey(this.scene, w, h, r)).setDisplaySize(w, h);
      if (highlighted) {
        this.frame.lineStyle(6 * s, 0xe3a33b, 1);
        this.frame.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      }

      const color = SUIT_COLOR_HEX[this.card.suit];
      const shadow = { offsetX: 0, offsetY: 1, color: "rgba(255,255,255,0.6)", blur: 0, fill: true };

      // Corner index (rank over suit) — this is the part that stays visible when cards overlap.
      const rank = this.scene.add.text(-w / 2 + 11 * s, -h / 2 + 7 * s, this.card.rank, {
        fontFamily: CARD_FONT,
        fontSize: `${Math.round(40 * s)}px`,
        color,
        fontStyle: "bold",
        shadow,
      });
      const cornerSuit = this.scene.add.text(-w / 2 + 11 * s, -h / 2 + 48 * s, SUIT_SYMBOL[this.card.suit], {
        fontFamily: CARD_FONT,
        fontSize: `${Math.round(32 * s)}px`,
        color,
      });
      const centerSuit = this.scene.add
        .text(13 * s, 16 * s, SUIT_SYMBOL[this.card.suit], {
          fontFamily: CARD_FONT,
          fontSize: `${Math.round(66 * s)}px`,
          color,
          shadow: { offsetX: 0, offsetY: 3 * s, color: "rgba(58,38,32,0.25)", blur: 4 * s, fill: true },
        })
        .setOrigin(0.5);

      this.texts = [rank, cornerSuit, centerSuit];
      this.add(this.texts);
      this.bringToTop(this.shade);
    } else {
      this.paper.setTexture(cardBackKey(this.scene, w, h, r)).setDisplaySize(w, h);
      if (highlighted) {
        this.frame.lineStyle(6 * s, 0xe3a33b, 1);
        this.frame.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      }
    }
  }
}
