export type Suit = "S" | "H" | "D" | "C"; // spades, hearts, diamonds, clubs
export type Rank = "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export const SUITS: readonly Suit[] = ["S", "H", "D", "C"];
export const RANKS: readonly Rank[] = ["7", "8", "9", "10", "J", "Q", "K", "A"];

export interface Card {
  suit: Suit;
  rank: Rank;
}

/** Seat 0 = you, 2 = your AI partner, 1 & 3 = the opposing AI team. Turn order is 0→1→2→3→0. */
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1; // team 0 = seats 0/2 (you + partner), team 1 = seats 1/3 (opponents)

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export type Mode = "hokum" | "sun";

export interface Bid {
  seat: Seat;
  /**
   * "ashkal" (أشكل): the dealer or the player on the dealer's left takes an opposing hokum as
   * sun, and the ground card goes to the caller's partner (البند 8).
   */
  call: "hokum" | "sun" | "pass" | "ashkal";
  suit?: Suit; // present when call === "hokum"
}

export interface BiddingResult {
  mode: Mode;
  trumpSuit?: Suit; // present when mode === "hokum"
  declarer: Seat;
  declarerTeam: Team;
  history: Bid[];
  /**
   * Set when the contract came from أشكل: who called it (the buyer, `declarer`), the partner who
   * takes the ground card, and which suits it asks that partner to play.
   */
  ashkal?: { caller: Seat; groundTo: Seat; signalSuits: Suit[] };
}

/** Joker rules that bend who wins a trick. */
export interface TrickRules {
  /** This seat's cards of `suit` act as trumps — above the led suit, below a real trump (ملك السبيت). */
  personalTrump?: { seat: Seat; suit: Suit };
  /** This seat's card counts as the top card of its suit (الورقة الأخيرة). */
  topCard?: Seat;
  /** This team's 7s and 8s beat everything else in their tier (Underdog). The deck is shared, so it never helps the other side. */
  trashBeatsAce?: Team;
}

export interface Trick {
  leader: Seat;
  cards: Partial<Record<Seat, Card>>;
  order: Seat[]; // seats in the order they played, for resolving ties/precedence
  winner?: Seat;
  rules?: TrickRules;
}

export interface HandResult {
  mode: Mode;
  trumpSuit?: Suit;
  declarerTeam: Team;
  rawPoints: Record<Team, number>; // card points + last-trick bonus, before mode multiplier
  scoredPoints: Record<Team, number>; // after the sun x2 multiplier
  /** Game points ("abnat") — what a match is played to: a hokum hand is worth 16, a sun hand 26. */
  gamePoints: Record<Team, number>;
  tricksWon: Record<Team, number>;
  /** Game points from المشاريع (projects) and بلوت, already included in `gamePoints`. */
  projectPoints?: Record<Team, number>;
  /** Which seat scored بلوت this hand, if anyone did. */
  baloot?: Seat;
  /** The النشرة: the hand's score sheet, row by row. */
  sheet?: HandSheet;
}

export interface SheetProject {
  name: string;
  /** Raw points (أبناط) — سرا 20, خمسين 50, مئة 100, أربعمئة 200, بلوت 20. */
  raw: number;
  seat: Seat;
}

/** النشرة — what the score sheet shows after a hand. */
export interface HandSheet {
  /** الأكلات: card points won in tricks. */
  cards: Record<Team, number>;
  /** الأرض: the last-trick bonus. */
  ground: Record<Team, number>;
  /** المشاريع that counted for each side, بلوت included. */
  projects: Record<Team, SheetProject[]>;
  /** الأبناط: cards + الأرض + projects, raw. */
  abnat: Record<Team, number>;
  /** النتيجة: game points banked (before any joker). */
  result: Record<Team, number>;
  /** How the buy went for the buyer: ربحانة / خسرانة / متعادلة. */
  outcome: "won" | "lost" | "tie";
  /** The side that took all eight tricks, if one did. */
  kaboot?: Team;
  /** The side `outcome` is about: the buyer, or after a دبل whoever raised last. */
  judgedTeam: Team;
  /** Set when the hand was doubled: the level (2 دبل … 5 قهوة) and whether it was مقفل. */
  double?: { level: 2 | 3 | 4 | 5; closed: boolean };
  /** The side that took the hand — set for doubled hands, where the winner takes all. */
  winner?: Team;
}

