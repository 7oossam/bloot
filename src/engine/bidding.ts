import type { Bid, BiddingResult, Card, Seat, Suit } from "./types";
import { nextSeat, teamOf } from "./types";

export type BiddingRound = 1 | 2;

export interface BiddingState {
  dealer: Seat;
  groundCard: Card;
  round: BiddingRound;
  turnSeat: Seat;
  history: Bid[];
  /** Set once a player buys hokum or sun. */
  result?: BiddingResult;
  /** Set true if both rounds passed all the way around — the caller should redeal with the next dealer. */
  redeal?: boolean;
}

/** A legal call a seat may make right now, for building AI/UI choices. */
export interface LegalCall {
  call: "hokum" | "sun" | "pass";
  suit?: Suit;
}

export function startBidding(dealer: Seat, groundCard: Card): BiddingState {
  return {
    dealer,
    groundCard,
    round: 1,
    turnSeat: nextSeat(dealer),
    history: [],
  };
}

/** Round 1: hokum must match the ground card's suit. Round 2: hokum must NOT match it. Sun is always legal. */
export function legalCalls(state: BiddingState): LegalCall[] {
  if (state.result || state.redeal) return [];
  const calls: LegalCall[] = [{ call: "pass" }, { call: "sun" }];
  if (state.round === 1) {
    calls.push({ call: "hokum", suit: state.groundCard.suit });
  } else {
    const otherSuits: Suit[] = (["S", "H", "D", "C"] as Suit[]).filter(
      (s) => s !== state.groundCard.suit,
    );
    for (const suit of otherSuits) calls.push({ call: "hokum", suit });
  }
  return calls;
}

/** Applies one seat's bid and returns the next state. Throws on an illegal call. */
export function submitBid(state: BiddingState, bid: Bid): BiddingState {
  if (bid.seat !== state.turnSeat) {
    throw new Error(`It is seat ${state.turnSeat}'s turn, not ${bid.seat}'s`);
  }
  const allowed = legalCalls(state).some(
    (c) => c.call === bid.call && (c.call !== "hokum" || c.suit === bid.suit),
  );
  if (!allowed) {
    throw new Error(`Illegal call: ${JSON.stringify(bid)} in round ${state.round}`);
  }

  const history = [...state.history, bid];

  if (bid.call === "hokum" || bid.call === "sun") {
    return {
      ...state,
      history,
      result: {
        mode: bid.call,
        trumpSuit: bid.call === "hokum" ? bid.suit : undefined,
        declarer: bid.seat,
        declarerTeam: teamOf(bid.seat),
        history,
      },
    };
  }

  // pass
  if (bid.seat === state.dealer) {
    if (state.round === 1) {
      return { ...state, history, round: 2, turnSeat: nextSeat(state.dealer) };
    }
    return { ...state, history, redeal: true };
  }
  return { ...state, history, turnSeat: nextSeat(bid.seat) };
}
