import type { Rank, Suit } from "../engine/types";

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_COLOR_HEX: Record<Suit, string> = {
  S: "#1a1a1a",
  C: "#1a1a1a",
  H: "#b3261e",
  D: "#b3261e",
};
export const SUIT_NAME_AR: Record<Suit, string> = { S: "بستوني", H: "هرت", D: "دينار", C: "كلاوي" };

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
