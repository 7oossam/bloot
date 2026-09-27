import Phaser from "phaser";

/**
 * The canvas is 860 wide and a phone shows it at about 0.4×, so a 24px label lands at 9–10px
 * on screen. Every size below 40px is lifted to one that reads at arm's length (≈13px and up).
 */
export function readableSize(size: string | number | undefined): string | undefined {
  if (size === undefined) return undefined;
  const px = typeof size === "number" ? size : parseFloat(size);
  if (!Number.isFinite(px) || px >= 40) return typeof size === "number" ? `${size}px` : size;
  const lifted = px <= 18 ? 28 : px <= 22 ? 31 : px <= 26 ? 33 : px <= 30 ? 35 : px <= 34 ? 37 : 40;
  return `${Math.max(px, lifted)}px`;
}

const RLE = "\u202B";
const PDF = "\u202C";

/**
 * Phaser's RTL text is unreliable: the browser still orders each line left to right, so a line
 * that starts with a number or ends with a full stop comes out scrambled ("+24 ريال — معك 140"
 * printed back to front), and the canvas direction it sets doesn't survive every redraw, so a
 * line can land off its canvas. Here each drawn line is wrapped in a right-to-left embedding and
 * placed by its own measured width, honouring the text's alignment over several lines.
 */
export function rtlLines<T extends Phaser.GameObjects.Text>(t: T): T {
  const ctx = t.context as CanvasRenderingContext2D & { rtlLines?: boolean };
  if (ctx.rtlLines) return t;
  ctx.rtlLines = true;
  const fill = ctx.fillText.bind(ctx);
  const stroke = ctx.strokeText.bind(ctx);
  // The right end of a line, in the padded, resolution-scaled space Phaser draws in.
  const rightEnd = (s: string): number => {
    const edge = t.style.strokeThickness / 2;
    const box = ctx.canvas.width / (t.style.resolution || 1) - (t.padding.left ?? 0) - (t.padding.right ?? 0);
    const w = ctx.measureText(s).width;
    if (t.style.align === "center") return (box + w) / 2;
    if (t.style.align === "left") return edge + w;
    return box - edge;
  };
  // A maxWidth of undefined is not the same as none: some browsers squeeze the line to nothing.
  const draw = (paint: typeof fill) => (s: string, x: number, y: number, max?: number) => {
    if (t.style.rtl) {
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      [s, x] = [RLE + s + PDF, rightEnd(s)];
    }
    if (max === undefined) paint(s, x, y);
    else paint(s, x, y, max);
  };
  ctx.fillText = draw(fill);
  ctx.strokeText = draw(stroke);
  t.updateText();
  return t;
}
