import type { Card, Seat, Suit } from "../engine/types";
import { SUITS } from "../engine/types";

// Portrait, phone-first reference resolution. A real 4-seat table: partner across from you at
// the top edge, opponents at the left and right edges (like actually sitting at the table),
// you at the bottom. Seats 1-3 render as a compact widget (card-back + live count) rather than
// a full fanned stack — there's no width for that on a phone — but they sit where that seat
// actually is, not squeezed into a top strip.
export const WIDTH = 430;
export const HEIGHT = 900;
export const CENTER_X = WIDTH / 2;
export const CENTER_Y = HEIGHT / 2;

export const TABLE_RECT = { left: 20, top: 150, right: WIDTH - 20, bottom: 660 };

export const HAND_ANCHOR: Record<Seat, { x: number; y: number; axis: "h" | "v" }> = {
  0: { x: CENTER_X, y: HEIGHT - 90, axis: "h" }, // you, below the table's bottom edge
  1: { x: TABLE_RECT.left + 50, y: CENTER_Y, axis: "v" }, // left seat, on the table's left edge
  2: { x: CENTER_X, y: TABLE_RECT.top + 40, axis: "h" }, // partner, on the table's top edge
  3: { x: TABLE_RECT.right - 50, y: CENTER_Y, axis: "v" }, // right seat, on the table's right edge
};

export const TRICK_ANCHOR: Record<Seat, { x: number; y: number }> = {
  0: { x: CENTER_X, y: CENTER_Y + 140 },
  1: { x: CENTER_X - 85, y: CENTER_Y },
  2: { x: CENTER_X, y: CENTER_Y - 140 },
  3: { x: CENTER_X + 85, y: CENTER_Y },
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
