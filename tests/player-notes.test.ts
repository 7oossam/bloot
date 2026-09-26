import { describe, expect, it } from "vitest";
import { searchCardTraced } from "../src/ai/mcts";
import { decideCard } from "../src/ai/play-ai";
import { Round } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { teamOf, type Card, type Mode, type Seat, type Suit, type Trick } from "../src/engine/types";

/**
 * The player's notes from the table (the «ليش؟» panel), each frozen as the moment it was
 * written about. Cards are the snapshot's ids: suit then rank ("CA" = إكة شرية).
 */
const card = (id: string): Card => ({ suit: id[0] as Suit, rank: id.slice(1) as Card["rank"] });
const cards = (...ids: string[]) => ids.map(card);
function trick(leader: Seat, plays: string[], winner?: Seat): Trick {
  const t: Trick = { leader, cards: {}, order: [] };
  for (const p of plays) {
    const [s, id] = p.split(":");
    t.cards[Number(s) as Seat] = card(id);
    t.order.push(Number(s) as Seat);
  }
  if (winner !== undefined) t.winner = winner;
  return t;
}

interface Moment {
  dealer: Seat;
  mode: Mode;
  trumpSuit?: Suit;
  declarer: Seat;
  ground: string;
  hands: Record<Seat, string[]>;
  tricks: Trick[];
  current: Trick;
}

/** A round set to exactly this moment of play. */
function at(m: Moment): Round {
  const r = new Round(m.dealer, mulberry32(1));
  const hands = Object.fromEntries(([0, 1, 2, 3] as Seat[]).map((s) => [s, cards(...m.hands[s])])) as Record<Seat, Card[]>;
  const state = r as unknown as Record<string, unknown>;
  state.phase = "playing";
  state.hands = hands;
  state.tricks = m.tricks;
  state.currentTrick = m.current;
  state.initial = { hands, stock: [card(m.ground)] };
  state.bidding = { ...r.bidding, result: { mode: m.mode, trumpSuit: m.trumpSuit, declarer: m.declarer, declarerTeam: teamOf(m.declarer) } };
  return r;
}

const think = (r: Round, seat: Seat) => searchCardTraced(r, seat, { worlds: 40, rand: mulberry32(9) });

describe("the player's notes", () => {
  it("1. a defender doesn't lead a lone trump Ace into the buyer's hokum", () => {
    // You bought hokum ♣; يمين led the إكة شرية holding nothing else in trumps.
    const r = at({
      dealer: 0, mode: "hokum", trumpSuit: "C", declarer: 0, ground: "C10",
      hands: {
        0: ["SQ", "HK", "H9", "CQ", "C10", "S9", "C8", "CJ"],
        1: ["D7", "D8", "SJ", "S10", "H8", "SA", "HA", "CA"],
        2: ["DK", "D9", "S7", "DA", "H7", "HJ", "H10", "CK"],
        3: ["DJ", "D10", "C7", "HQ", "SK", "S8", "DQ", "C9"],
      },
      tricks: [], current: trick(1, []),
    });
    const t = think(r, 1);
    expect(t.card.suit).not.toBe("C");
  });

  it("2. no 10 thrown into the other side's trick when a 7 will do", () => {
    // Sun, يمين leads the إكة سبيت; your partner has no spades: ديمن 10 and 7, هاص شايب and 10.
    const tricks = [trick(3, ["3:CK", "0:C8", "1:C10", "2:DJ"], 1), trick(1, ["1:CA", "2:H7", "3:CJ", "0:S8"], 1), trick(1, ["1:CQ", "2:SQ", "3:C9", "0:H9"], 1), trick(1, ["1:C7", "2:SK", "3:S7", "0:D8"], 1)];
    const current = trick(1, ["1:SA"]);
    const hand = cards("HK", "H10", "D10", "D7");
    expect(decideCard(hand, current, "sun", undefined, 2, { tricks, declarer: 0 })).toEqual(card("D7"));
    const r = at({
      dealer: 2, mode: "sun", declarer: 0, ground: "DK",
      hands: { 0: ["DQ", "DA", "H8", "DK"], 1: ["D9", "SJ", "S9"], 2: ["HK", "H10", "D10", "D7"], 3: ["HJ", "HA", "HQ", "S10"] },
      tricks, current,
    });
    expect(think(r, 2).card).not.toEqual(card("D10"));
  });

  it("3. a defender doesn't go back into the buyer's opening suit", () => {
    // You bought sun and led ديمن; يمين took it with the إكة and came back with a small ديمن.
    const r = at({
      dealer: 3, mode: "sun", declarer: 0, ground: "HA",
      hands: {
        0: ["H8", "DJ", "H10", "D10", "HA", "D9", "C9"],
        1: ["S9", "S7", "SQ", "C8", "CJ", "D8", "D7"],
        2: ["C10", "CA", "S8", "S10", "CK", "H9", "HJ"],
        3: ["SJ", "SA", "H7", "SK", "HQ", "HK", "CQ"],
      },
      tricks: [trick(0, ["0:DK", "1:DA", "2:C7", "3:DQ"], 1)], current: trick(1, []),
    });
    expect(think(r, 1).card.suit).not.toBe("D");
  });

  it("4. the partner signals with the brother suit instead of discarding from his Ace's suit", () => {
    // Sun, you lead the 10 هاص; your partner (no hearts) holds the إكة and 10 شرية and two spades.
    const tricks = [trick(0, ["0:DK", "1:DA", "2:C7", "3:DQ"], 1), trick(1, ["1:D7", "2:HJ", "3:CQ", "0:DJ"], 0), trick(0, ["0:D10", "1:D8", "2:CK", "3:SK"], 0), trick(0, ["0:HA", "1:C8", "2:H9", "3:H7"], 0)];
    const r = at({
      dealer: 3, mode: "sun", declarer: 0, ground: "HA",
      hands: { 0: ["H8", "C9", "D9"], 1: ["SQ", "CJ", "S9"], 2: ["CA", "S8", "C10", "S10"], 3: ["SA", "HK", "HQ", "SJ"] },
      tricks, current: trick(0, ["0:H10", "1:S7"]),
    });
    expect(think(r, 2).card.suit).toBe("S");
    expect(decideCard(cards("CA", "S8", "C10", "S10"), trick(0, ["0:H10", "1:S7"]), "sun", undefined, 2, { tricks, declarer: 0 })).toEqual(card("S8"));
  });

  it("5. in hokum a defender cashes his Ace before the buyer can ruff it", () => {
    // يمين bought hokum ♠; your partner leads first holding the إكة هاص.
    const r = at({
      dealer: 1, mode: "hokum", trumpSuit: "S", declarer: 1, ground: "SJ",
      hands: {
        0: ["H9", "SA", "DQ", "C9", "H8", "CQ", "S10", "HK"],
        1: ["CA", "SQ", "D7", "HJ", "S9", "SJ", "S8", "C10"],
        2: ["S7", "DK", "CK", "D10", "HQ", "C7", "HA", "CJ"],
        3: ["D9", "SK", "H10", "D8", "DA", "DJ", "H7", "C8"],
      },
      tricks: [], current: trick(2, []),
    });
    expect(think(r, 2).card).toEqual(card("HA"));
  });
});
