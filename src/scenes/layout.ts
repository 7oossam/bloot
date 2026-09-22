import type { Card, Seat, Suit } from "../engine/types";
import { SUITS } from "../engine/types";

// Portrait, phone-first reference resolution. The table is a 4-seat card game, but on a
// narrow screen there's no room for full left/right hand stacks — opponents become compact
// corner widgets instead (see OPPONENT_WIDGET), freeing the vertical space a phone actually has.
export const WIDTH = 430;
export const HEIGHT = 900;
export const CENTER_X = WIDTH / 2;
export const CENTER_Y = HEIGHT / 2;

/** Only seat 0 (you) fans a full hand; seats 1-3 render as a compact widget instead. */
export const HAND_ANCHOR: Record<Seat, { x: number; y: number; axis: "h" | "v" }> = {
  0: { x: CENTER_X, y: HEIGHT - 90, axis: "h" },
  1: { x: 62, y: 118, axis: "h" },
  2: { x: CENTER_X, y: 108, axis: "h" },
  3: { x: WIDTH - 62, y: 118, axis: "h" },
};

export const TRICK_ANCHOR: Record<Seat, { x: number; y: number }> = {
  0: { x: CENTER_X, y: CENTER_Y - 20 },
  1: { x: CENTER_X - 78, y: CENTER_Y - 105 },
  2: { x: CENTER_X, y: CENTER_Y - 190 },
  3: { x: CENTER_X + 78, y: CENTER_Y - 105 },
};

export const SEAT_LABEL_AR: Record<Seat, string> = {
  0: "أنت",
  1: "يسار",
  2: "شريكك",
  3: "يمين",
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

/** World positions for `count` cards fanned around the player's (seat 0) hand anchor. */
export function handPositions(seat: Seat, count: number): Array<{ x: number; y: number }> {
  const anchor = HAND_ANCHOR[seat];
  if (count === 0) return [];
  const spacing = Math.min(40, (WIDTH - 40) / count);
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
