import Phaser from "phaser";
import type { Card } from "../engine/types";
import { cardBackKey, cardHaloKey, cardShadowKey } from "./fx";

export const CARD_W = 128;
export const CARD_H = 185;

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
    
    // Instead of generating a paper texture, we use our loaded image
    this.paper = scene.add.image(0, 0, faceUp ? this.getTextureKey() : "card_back").setDisplaySize(w, h);
    
    this.frame = scene.add.graphics();
    this.shade = scene.add.graphics().setVisible(false);
    this.add([this.shadow, this.halo, this.paper, this.frame, this.shade]);
    this.setSize(w, h);
    this.redraw();
    scene.add.existing(this);

    this.on("pointerover", () => this.lift(true));
    this.on("pointerout", () => this.lift(false));
  }

  private getTextureKey(): string {
    return this.card.suit + '_' + this.card.rank;
  }

  setFaceUp(faceUp: boolean): void {
    this.faceUp = faceUp;
    this.redraw();
  }

  setHighlighted(on: boolean): void {
    this.redraw(on);
  }

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
    const s = this.sizeScale;
    const w = this.displayW;
    const h = this.displayH;
    const r = 16 * s;

    if (this.faceUp) {
      this.paper.setTexture(this.getTextureKey()).setDisplaySize(w, h);
    } else {
      this.paper.setTexture("card_back").setDisplaySize(w, h);
    }

    if (highlighted) {
      this.frame.lineStyle(6 * s, 0xe3a33b, 1);
      this.frame.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    }
    
    this.bringToTop(this.shade);
  }
}
