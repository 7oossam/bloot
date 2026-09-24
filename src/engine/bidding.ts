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
  /**
   * Joker rules: this seat may also buy hokum in these suits — in the first round too, and in
   * the second even in the ground card's suit (الحكم الحر، سبيت دايم).
   */
  extraHokum?: { seat: Seat; suits: Suit[] };
}

/** A legal call a seat may make right now, for building AI/UI choices. */
export interface LegalCall {
  call: "hokum" | "sun" | "pass" | "ashkal";
  suit?: Suit;
}

export function dealerPartner(dealer: Seat): Seat {
  return nextSeat(nextSeat(dealer));
}

/** The player on the dealer's left — play runs counter-clockwise, so the dealer's right bids first. */
export function dealerLeft(dealer: Seat): Seat {
  return nextSeat(dealerPartner(dealer));
}

/** The only two seats that may call أشكل: the dealer and the player on the dealer's left. */
export function canCallAshkal(seat: Seat, dealer: Seat): boolean {
  return seat === dealer || seat === dealerLeft(dealer);
}

/**
 * What أشكل asks the caller's partner to play (docs/baloot-guide.md §3): in the first round the
 * other suit of the ground card's colour ("عكس الشكل"), in the second both suits of the other
 * colour ("عكس اللون").
 */
export function ashkalSignal(groundSuit: Suit, round: BiddingRound): Suit[] {
  const red = groundSuit === "H" || groundSuit === "D";
  if (round === 1) return [({ H: "D", D: "H", S: "C", C: "S" } as Record<Suit, Suit>)[groundSuit]];
  return red ? ["S", "C"] : ["H", "D"];
}

function partnerOf(seat: Seat): Seat {
  return nextSeat(nextSeat(seat));
}

export function startBidding(
  dealer: Seat,
  groundCard: Card,
  lockedHokumTeams: Team[] = [],
  extraHokum?: BiddingState["extraHokum"],
): BiddingState {
  return {
    dealer,
    groundCard,
    round: 1,
    turnSeat: nextSeat(dealer),
    history: [],
    lockedHokumTeams,
    extraHokum,
  };
}

/**
 * Round 1: hokum must match the ground card's suit. Round 2: hokum must NOT match it. Sun is
 * legal on a seat's own turn.
 *
 * أشكل is open only to the dealer and the dealer's left: on their own turn in either round,
 * and over the OTHER team's pending hokum — but in the second round not to a player who
 * already said ولا (8-2). (The regulation's 8-1 would allow it only over a hokum; the player
 * wants it on their own turn too.)
 *
 * While a hokum is pending, anyone may take it as sun — unless the ground card is an Ace,
 * when only the dealer's right may (4-1). 4-1 limits the flip to sun only: أشكل over the
 * other team's hokum stays open to its usual callers even on an Ace (the player's rule).
 */
export function legalCalls(state: BiddingState): LegalCall[] {
  if (state.result || state.redeal) return [];
  const seat = state.turnSeat;
  if (state.pendingHokum) {
    const aceGround = state.groundCard.rank === "A";
    const calls: LegalCall[] = [{ call: "pass" }];
    if (!aceGround || seat === nextSeat(state.dealer)) calls.push({ call: "sun" });
    const opposing = teamOf(state.pendingHokum.seat) !== teamOf(seat);
    const saidWala = state.round === 2 && passedThisRound(state, seat);
    if (opposing && !saidWala && canCallAshkal(seat, state.dealer)) calls.push({ call: "ashkal" });
    return calls;
  }
  const calls: LegalCall[] = [{ call: "pass" }, { call: "sun" }];
  if (canCallAshkal(seat, state.dealer)) calls.push({ call: "ashkal" });
  if (state.round === 1) {
    calls.push({ call: "hokum", suit: state.groundCard.suit });
  } else {
    const otherSuits: Suit[] = (["S", "H", "D", "C"] as Suit[]).filter(
      (s) => s !== state.groundCard.suit,
    );
    for (const suit of otherSuits) calls.push({ call: "hokum", suit });
  }
  if (state.extraHokum?.seat === seat) {
    for (const suit of state.extraHokum.suits) {
      if (!calls.some((c) => c.call === "hokum" && c.suit === suit)) calls.push({ call: "hokum", suit });
    }
  }
  return calls;
}

/** Whether `seat` has passed in the current bidding round. */
function passedThisRound(state: BiddingState, seat: Seat): boolean {
  // Round 1 is exactly the first four bids when round 2 is reached (a buy would have ended it).
  const bids = state.round === 2 ? state.history.slice(4) : state.history;
  return bids.some((b) => b.seat === seat && b.call === "pass");
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
      // The caller is the buyer; the partner takes the ground card (البند 9: "المشكل هو المشتري").
      result: {
        mode: "sun",
        declarer: bid.seat,
        declarerTeam: teamOf(bid.seat),
        history,
        ashkal: {
          caller: bid.seat,
          groundTo: partnerOf(bid.seat),
          signalSuits: ashkalSignal(state.groundCard.suit, state.round),
        },
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
