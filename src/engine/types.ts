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
  call: "hokum" | "sun" | "pass";
  suit?: Suit; // present when call === "hokum"
}

export interface BiddingResult {
  mode: Mode;
  trumpSuit?: Suit; // present when mode === "hokum"
  declarer: Seat;
  declarerTeam: Team;
  history: Bid[];
}

export interface Trick {
  leader: Seat;
  cards: Partial<Record<Seat, Card>>;
  order: Seat[]; // seats in the order they played, for resolving ties/precedence
  winner?: Seat;
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
}
