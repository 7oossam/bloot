import type { Card, Seat, Suit } from "../engine/types";
import { SUITS } from "../engine/types";

// Portrait, phone-first. The canvas is authored at ~2x a phone's CSS width (860 rather than
// 430) so that on a high-DPI screen the backing store lands near 1:1 with device pixels —
// authoring at 430 meant the browser stretched every glyph ~2x and everything looked fuzzy.
// Nothing is drawn shrunk-down either: cards are drawn at their real size (see CardView's
// sizeScale) instead of being rendered large and scaled down, which resamples text to mush.
export const WIDTH = 860;
export const HEIGHT = 1800;
export const CENTER_X = WIDTH / 2;
export const CENTER_Y = HEIGHT / 2;

export const TABLE_RECT = { left: 40, top: 300, right: WIDTH - 40, bottom: 1320 };

// A real 4-seat table: partner across the top edge, opponents on the left and right edges,
// you at the bottom. Seats 1-3 show a compact card-back + live count rather than a full fan.
//
// Turn order in the engine is always 0 -> 1 -> 2 -> 3. Baloot deals and plays
// counter-clockwise, so seat 1 (who follows you) sits on your RIGHT and seat 3 on your
// LEFT: bottom -> right -> top -> left reads counter-clockwise on screen. Seating them the
// other way round made play run clockwise. This is a seating/label change only — the engine
// keeps its plain 0,1,2,3 rotation.
export const HAND_ANCHOR: Record<Seat, { x: number; y: number; axis: "h" | "v" }> = {
  // Sits clear of the activity log pinned to the bottom-left corner: the log grows upward
  // from y=1788 over 4 lines (~1652), so the hand's lowest edge has to stay above that.
  0: { x: CENTER_X, y: 1545, axis: "h" },
  1: { x: TABLE_RECT.right - 90, y: CENTER_Y, axis: "v" },
  2: { x: CENTER_X, y: TABLE_RECT.top + 80, axis: "h" },
  3: { x: TABLE_RECT.left + 90, y: CENTER_Y, axis: "v" },
};

export const TRICK_ANCHOR: Record<Seat, { x: number; y: number }> = {
  0: { x: CENTER_X, y: CENTER_Y + 230 },
  1: { x: CENTER_X + 165, y: CENTER_Y },
  2: { x: CENTER_X, y: CENTER_Y - 230 },
  3: { x: CENTER_X - 165, y: CENTER_Y },
};

export const GROUND_CARD_POS = { x: CENTER_X, y: 640, labelY: 515 };
// Sits below the left/right seats' card-count labels so the button row never covers them.
export const BID_BUTTON_ROW_Y = 1130;
export const BID_BUTTON_ROW_GAP = 96;

export const SEAT_LABEL_AR: Record<Seat, string> = {
  0: "أنت",
  1: "يمين",
  2: "شريكك",
  3: "يسار",
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

/**
 * World positions for `count` cards fanned across the player's hand anchor. Cards overlap
 * slightly when the hand is full — that's why each card carries a corner rank+suit index,
 * so a covered card is still identifiable by its exposed left edge.
 */
export function handPositions(seat: Seat, count: number, cardWidth: number): Array<{ x: number; y: number }> {
  const anchor = HAND_ANCHOR[seat];
  if (count === 0) return [];
  const usable = WIDTH - 40 - cardWidth;
  const spacing = count > 1 ? Math.min(cardWidth + 10, usable / (count - 1)) : 0;
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
