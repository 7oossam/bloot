import type { Rank, Suit } from "../engine/types";

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_COLOR_HEX: Record<Suit, string> = {
  S: "#2a1e1a",
  C: "#2a1e1a",
  H: "#b5362a",
  D: "#b5362a",
};
/** The player's names for the suits (docs/baloot-guide.md §1). */
export const SUIT_NAME_AR: Record<Suit, string> = { S: "سبيت", H: "هاص", D: "ديمن", C: "شرية" };

/** What Baloot players call each rank. */
export const RANK_NAME_AR: Record<Rank, string> = {
  "7": "سبعة",
  "8": "ثمانية",
  "9": "تسعة",
  "10": "عشرة",
  J: "ولد",
  Q: "بنت",
  K: "شايب",
  A: "إكة",
};
