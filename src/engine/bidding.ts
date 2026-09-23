import type { Bid, BiddingResult, Card, Seat, Suit, Team } from "./types";
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
  /**
   * Set while a hokum buy is open to challenge: every other player, in turn order starting
   * after the buyer, may take the hand as sun instead. If they all pass, the hokum stands.
   */
  pendingHokum?: { seat: Seat; suit: Suit };
  /** Seats still to answer the pending hokum, in order. `turnSeat` is always the first. */
  challengers?: Seat[];
  /** Teams whose hokum can't be taken over as sun (a joker synergy). */
  lockedHokumTeams?: Team[];
}

/** A legal call a seat may make right now, for building AI/UI choices. */
export interface LegalCall {
  call: "hokum" | "sun" | "pass" | "ashkal";
  suit?: Suit;
}

/** The dealer's partner — the only seat allowed to call أشكل (docs/baloot-guide.md §3). */
export function dealerPartner(dealer: Seat): Seat {
  return nextSeat(nextSeat(dealer));
}

/**
 * What أشكل asks the dealer to play (docs/baloot-guide.md §3): in the first round the other
 * suit of the ground card's colour ("عكس الشكل"), in the second both suits of the other
 * colour ("عكس اللون").
 */
export function ashkalSignal(groundSuit: Suit, round: BiddingRound): Suit[] {
  const red = groundSuit === "H" || groundSuit === "D";
  if (round === 1) return [({ H: "D", D: "H", S: "C", C: "S" } as Record<Suit, Suit>)[groundSuit]];
  return red ? ["S", "C"] : ["H", "D"];
}

export function startBidding(dealer: Seat, groundCard: Card, lockedHokumTeams: Team[] = []): BiddingState {
  return {
    dealer,
    groundCard,
    round: 1,
    turnSeat: nextSeat(dealer),
    history: [],
    lockedHokumTeams,
  };
}

/** Round 1: hokum must match the ground card's suit. Round 2: hokum must NOT match it. Sun is always legal. */
export function legalCalls(state: BiddingState): LegalCall[] {
  if (state.result || state.redeal) return [];
  const canAshkal = state.turnSeat === dealerPartner(state.dealer);
  // Answering someone else's hokum: sun (or أشكل) takes it over, anything else is a pass.
  if (state.pendingHokum) return [{ call: "pass" }, { call: "sun" }, ...(canAshkal ? [{ call: "ashkal" } as LegalCall] : [])];
  const calls: LegalCall[] = [{ call: "pass" }, { call: "sun" }];
  if (canAshkal) calls.push({ call: "ashkal" });
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
  if (allowed && bid.call === "ashkal") {
    const history = [...state.history, bid];
    return {
      ...state,
      history,
      pendingHokum: undefined,
      challengers: undefined,
      result: {
        mode: "sun",
        declarer: state.dealer,
        declarerTeam: teamOf(state.dealer),
        history,
        ashkal: { caller: bid.seat, signalSuits: ashkalSignal(state.groundCard.suit, state.round) },
      },
    };
  }
  if (!allowed) {
    throw new Error(`Illegal call: ${JSON.stringify(bid)} in round ${state.round}`);
  }

  const history = [...state.history, bid];

  // Sun is the top call: it ends the auction at once, including over a pending hokum.
  if (bid.call === "sun") {
    return {
      ...state,
      history,
      pendingHokum: undefined,
      challengers: undefined,
      result: { mode: "sun", declarer: bid.seat, declarerTeam: teamOf(bid.seat), history },
    };
  }

  // A locked team's hokum ("مقفول") stands at once — nobody may take it as sun.
  if (bid.call === "hokum" && state.lockedHokumTeams?.includes(teamOf(bid.seat))) {
    return {
      ...state,
      history,
      result: { mode: "hokum", trumpSuit: bid.suit, declarer: bid.seat, declarerTeam: teamOf(bid.seat), history },
    };
  }

  // A hokum buy doesn't close the auction yet — the other three get a chance at sun.
  if (bid.call === "hokum") {
    const challengers: Seat[] = [];
    for (let s = nextSeat(bid.seat); s !== bid.seat; s = nextSeat(s)) challengers.push(s);
    return {
      ...state,
      history,
      pendingHokum: { seat: bid.seat, suit: bid.suit! },
      challengers,
      turnSeat: challengers[0],
    };
  }

  // A pass while a hokum is pending just hands the question to the next challenger.
  if (state.pendingHokum) {
    const rest = state.challengers!.slice(1);
    if (rest.length > 0) return { ...state, history, challengers: rest, turnSeat: rest[0] };
    const { seat, suit } = state.pendingHokum;
    return {
      ...state,
      history,
      pendingHokum: undefined,
      challengers: undefined,
      turnSeat: seat,
      result: { mode: "hokum", trumpSuit: suit, declarer: seat, declarerTeam: teamOf(seat), history },
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
