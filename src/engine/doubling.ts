import type { Mode, Seat, Team } from "./types";
import { nextSeat, teamOf } from "./types";

/**
 * الدبل (the official regulation, البند 7), played once the contract is set and every hand
 * holds its 8 cards, before the first card:
 *
 * - An opponent of the buyer may say دبل (×2). In hokum they choose open or closed (مقفل);
 *   in sun there is only دبل (7-1), and only while the doubling side has 100 or less and the
 *   buyer's side is past 100 (7-2 — scaled to the match target).
 * - Hokum only: the buyer may answer ثري (×3, open); the doubler may answer فور (×4, open or
 *   closed); the buyer may answer قهوة, which wins the whole match for whoever takes the hand.
 * - The raising is between the buyer and the doubler only (7-5).
 * - Whoever made the last raise is judged as the buyer (4-10), and a tie goes against them (7-6).
 */
export type DoubleLevel = 1 | 2 | 3 | 4 | 5; // 5 = قهوة

export type DoubleCall = "double" | "triple" | "four" | "qahwa" | "pass";

export interface DoubleBid {
  seat: Seat;
  call: DoubleCall;
  /** مقفل: nobody may lead a trump while they hold anything else. */
  closed?: boolean;
}

export interface LegalDouble {
  call: DoubleCall;
  closed?: boolean;
}

export interface DoublingState {
  mode: Mode;
  buyer: Seat;
  level: DoubleLevel;
  closed: boolean;
  doubler?: Seat;
  turnSeat: Seat;
  /** Opponents still to be asked about the first دبل, `turnSeat` first. */
  askQueue: Seat[];
  history: DoubleBid[];
  done: boolean;
}

export const DOUBLE_NAME_AR: Record<Exclude<DoubleCall, "pass">, string> = {
  double: "دبل",
  triple: "ثري",
  four: "فور",
  qahwa: "قهوة",
};

/** The game-point multiplier for a level. قهوة ends the match, so its number is only for show. */
export function doubleMultiplier(level: DoubleLevel): number {
  return level === 5 ? 4 : level;
}

/** 7-2: sun may be doubled only by a side at or under the limit against a side past it. */
export function sunDoubleAllowed(buyerTeam: Team, matchScore: Record<Team, number>, limit: number): boolean {
  const other: Team = buyerTeam === 0 ? 1 : 0;
  return matchScore[buyerTeam] > limit && matchScore[other] <= limit;
}

/** Starts the doubling round, or returns a finished state when nobody may double. */
export function startDoubling(mode: Mode, buyer: Seat, allowed: boolean): DoublingState {
  const askQueue: Seat[] = allowed ? [nextSeat(buyer), nextSeat(nextSeat(nextSeat(buyer)))] : [];
  return {
    mode,
    buyer,
    level: 1,
    closed: false,
    turnSeat: askQueue[0] ?? buyer,
    askQueue,
    history: [],
    done: askQueue.length === 0,
  };
}

export function legalDoubles(state: DoublingState): LegalDouble[] {
  if (state.done) return [];
  const hokum = state.mode === "hokum";
  switch (state.level) {
    case 1:
      return hokum
        ? [{ call: "pass" }, { call: "double", closed: false }, { call: "double", closed: true }]
        : [{ call: "pass" }, { call: "double" }];
    case 2:
      return [{ call: "pass" }, { call: "triple", closed: false }];
    case 3:
      return [{ call: "pass" }, { call: "four", closed: false }, { call: "four", closed: true }];
    case 4:
      return [{ call: "pass" }, { call: "qahwa", closed: false }];
    default:
      return [];
  }
}

export function submitDouble(state: DoublingState, bid: DoubleBid): DoublingState {
  if (state.done) throw new Error("Doubling is over");
  if (bid.seat !== state.turnSeat) throw new Error(`It is seat ${state.turnSeat}'s turn to answer, not ${bid.seat}'s`);
  const ok = legalDoubles(state).some((c) => c.call === bid.call && (c.closed === undefined || c.closed === !!bid.closed));
  if (!ok) throw new Error(`Illegal double call ${JSON.stringify(bid)} at level ${state.level}`);
  const history = [...state.history, bid];

  if (bid.call === "pass") {
    if (state.level === 1) {
      const rest = state.askQueue.slice(1);
      if (rest.length > 0) return { ...state, history, askQueue: rest, turnSeat: rest[0] };
    }
    return { ...state, history, askQueue: [], done: true };
  }

  const level = (state.level + 1) as DoubleLevel;
  const closed = state.mode === "hokum" && !!bid.closed;
  const doubler = state.level === 1 ? bid.seat : state.doubler!;
  // Sun stops at دبل; قهوة is the last word.
  const done = state.mode === "sun" || level === 5;
  const turnSeat = level === 2 || level === 4 ? state.buyer : doubler;
  return { ...state, history, level, closed, doubler, askQueue: [], turnSeat, done };
}

/** The side judged as "the buyer" for the hand: whoever raised last (4-10). */
export function raiserTeam(state: DoublingState): Team {
  const last = [...state.history].reverse().find((b) => b.call !== "pass");
  return teamOf(last ? last.seat : state.buyer);
}

/** A short Arabic label: "دبل مقفل", "ثري", "قهوة"… or "" when undoubled. */
export function doubleLabel(level: DoubleLevel, closed: boolean, mode: Mode): string {
  if (level === 1) return "";
  const name = [, , "دبل", "ثري", "فور", "قهوة"][level]!;
  return mode === "hokum" && closed ? `${name} مقفل` : name;
}
