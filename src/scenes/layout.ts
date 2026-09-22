import type { Card, Seat, Suit } from "../engine/types";
import { SUITS } from "../engine/types";

export const WIDTH = 1280;
export const HEIGHT = 720;
export const CENTER_X = WIDTH / 2;
export const CENTER_Y = HEIGHT / 2;

export const HAND_ANCHOR: Record<Seat, { x: number; y: number; axis: "h" | "v" }> = {
  0: { x: CENTER_X, y: 650, axis: "h" }, // you, bottom
  1: { x: 110, y: CENTER_Y, axis: "v" }, // opponent, left
  2: { x: CENTER_X, y: 100, axis: "h" }, // partner, top
  3: { x: WIDTH - 110, y: CENTER_Y, axis: "v" }, // opponent, right
};

export const TRICK_ANCHOR: Record<Seat, { x: number; y: number }> = {
  0: { x: CENTER_X, y: CENTER_Y + 95 },
  1: { x: CENTER_X - 110, y: CENTER_Y },
  2: { x: CENTER_X, y: CENTER_Y - 95 },
  3: { x: CENTER_X + 110, y: CENTER_Y },
};

export const SEAT_LABEL_AR: Record<Seat, string> = {
  0: "أنت",
  1: "الخصم (يسار)",
  2: "شريكك",
  3: "الخصم (يمين)",
};

const RANK_DISPLAY_ORDER: readonly Card["rank"][] = ["7", "8", "9", "10", "J", "Q", "K", "A"];

/** A stable, readable sort for hand display: trump suit grouped first, then a fixed suit order, then rank. */
export function sortHandForDisplay(cards: Card[], trumpSuit?: Suit): Card[] {
  const suitOrder = trumpSuit ? [trumpSuit, ...SUITS.filter((s) => s !== trumpSuit)] : SUITS;
  return [...cards].sort((a, b) => {
    const sa = suitOrder.indexOf(a.suit);
    const sb = suitOrder.indexOf(b.suit);
    if (sa !== sb) return sa - sb;
    return RANK_DISPLAY_ORDER.indexOf(a.rank) - RANK_DISPLAY_ORDER.indexOf(b.rank);
  });
}

/** World positions for `count` cards fanned around a seat's hand anchor. */
export function handPositions(seat: Seat, count: number): Array<{ x: number; y: number }> {
  const anchor = HAND_ANCHOR[seat];
  if (count === 0) return [];
  const spacing = Math.min(48, 360 / count);
  const positions: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spacing;
    if (anchor.axis === "h") {
      positions.push({ x: anchor.x + offset, y: anchor.y });
    } else {
      positions.push({ x: anchor.x, y: anchor.y + offset });
    }
  }
  return positions;
}
