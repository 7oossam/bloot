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

  it("3b. the buyer's partner goes back to the buyer's suit freely", () => {
    // Same deal as note 3, but the buyer's partner took the first trick and leads.
    const r = at({
      dealer: 3, mode: "sun", declarer: 0, ground: "HA",
      hands: {
        0: ["H8", "DJ", "H10", "D10", "HA", "D9", "C9"],
        1: ["S9", "S7", "SQ", "C8", "CJ", "D8", "D7"],
        2: ["C10", "CA", "S8", "S10", "CK", "H9", "DA"],
        3: ["SJ", "SA", "H7", "SK", "HQ", "HK", "CQ"],
      },
      tricks: [trick(0, ["0:DK", "1:DQ", "2:HJ", "3:C7"], 2)], current: trick(2, []),
    });
    expect(think(r, 2).rules ?? []).not.toContain("خصم المشتري ما يرجع في حلته إلا بورقة ماكلة");
  });

  it("3c. against the buyer, only a sure winner of his suit may be led", () => {
    // Note 3's moment, with يمين holding the شايب ديمن. Only the 10 still beats it — but the 10
    // is most likely the buyer's, so the شايب would just feed him: ruled out like the 7. With
    // the 10 gone, the شايب is the top card and may go.
    const r = at({
      dealer: 3, mode: "sun", declarer: 0, ground: "HA",
      hands: {
        0: ["H8", "DJ", "H10", "D10", "HA", "D9", "C9"],
        1: ["S9", "S7", "SQ", "C8", "CJ", "DK", "D7"],
        2: ["C10", "CA", "S8", "S10", "CK", "H9", "HJ"],
        3: ["SJ", "SA", "H7", "SK", "HQ", "HK", "CQ"],
      },
      tricks: [trick(0, ["0:D8", "1:DA", "2:C7", "3:DQ"], 1)], current: trick(1, []),
    });
    const t = think(r, 1);
    expect((t.ruledOut ?? []).map((c) => c.suit + c.rank)).toEqual(expect.arrayContaining(["D7", "DK"]));
    const later = at({
      dealer: 3, mode: "sun", declarer: 0, ground: "HA",
      hands: {
        0: ["H8", "DJ", "H10", "HA", "D9", "C9"],
        1: ["S9", "S7", "SQ", "C8", "CJ", "DK"],
        2: ["C10", "CA", "S8", "S10", "CK", "H9"],
        3: ["SJ", "SA", "H7", "SK", "HQ", "HK"],
      },
      tricks: [trick(0, ["0:D8", "1:DA", "2:C7", "3:DQ"], 1), trick(1, ["1:D7", "2:HJ", "3:CQ", "0:D10"], 0)],
      current: trick(1, []),
    });
    expect((think(later, 1).ruledOut ?? []).map((c) => c.suit + c.rank)).not.toContain("DK");
  });

  it("4b. a guarded 10 isn't left bare just to keep off the Ace's suit", () => {
    // Your partner, no hearts: إكة، عشرة وسبعة شرية, and عشرة سبيت guarded by the ثمانية.
    // Everything outside clubs costs (the 10 itself, or leaving it bare), so the 7 شرية may go.
    const r = at({
      dealer: 3, mode: "sun", declarer: 0, ground: "HA",
      hands: {
        0: ["H8", "D9", "D10", "C9"],
        1: ["SQ", "CJ", "S9", "D8"],
        2: ["CA", "C10", "C7", "S10", "S8"],
        3: ["SA", "HK", "HQ", "SJ", "D7"],
      },
      tricks: [trick(0, ["0:DK", "1:DA", "2:CK", "3:DQ"], 1), trick(1, ["1:D7", "2:HJ", "3:CQ", "0:DJ"], 0), trick(0, ["0:HA", "1:C8", "2:H9", "3:H7"], 0)],
      current: trick(0, ["0:H10", "1:S7"]),
    });
    const out = (think(r, 2).ruledOut ?? []).map((c) => c.suit + c.rank);
    expect(out).not.toContain("C7");
    expect(out).toContain("C10");
  });

  // ---- the second batch of notes

  it("6. in hokum the partner plays his Ace the first time its suit comes round", () => {
    // You bought hokum ♦; يمين led the ولد سبيت; your partner holds إكة، شايب، عشرة and 7 سبيت.
    const r = at({
      dealer: 0, mode: "hokum", trumpSuit: "D", declarer: 0, ground: "S8",
      hands: {
        0: ["CQ", "DA", "D7", "DJ", "D8", "S8", "DK", "D9"],
        1: ["C7", "H10", "C10", "HQ", "DQ", "CJ", "D10"],
        2: ["S7", "CK", "C8", "HA", "HK", "S10", "SA", "SK"],
        3: ["HJ", "H7", "C9", "CA", "H8", "S9", "H9", "SQ"],
      },
      tricks: [], current: trick(1, ["1:SJ"]),
    });
    expect(think(r, 2).card).toEqual(card("SA"));
  });

  it("7. the buyer doesn't lead a small card under his own Ace", () => {
    // Your partner bought sun and leads, holding إكة، شايب and 7 سبيت.
    const r = at({
      dealer: 1, mode: "sun", declarer: 2, ground: "SA",
      hands: {
        0: ["DJ", "H9", "CQ", "CK", "C9", "HQ", "DK", "DQ"],
        1: ["C10", "S10", "C7", "CJ", "H7", "C8", "S8", "H10"],
        2: ["D10", "D7", "HJ", "HA", "SA", "CA", "SK", "S7"],
        3: ["SJ", "S9", "HK", "D9", "D8", "DA", "H8", "SQ"],
      },
      tricks: [], current: trick(2, []),
    });
    const played = think(r, 2).card;
    expect(["S7", "SK", "HJ"]).not.toContain(played.suit + played.rank);
  });

  it("8. no برقية when the partner has shown he has none of the suit to come back with", () => {
    const tricks = [
      trick(2, ["2:S7", "3:SQ", "0:H9", "1:S10"], 1), // you showed no spades here
      trick(1, ["1:CJ", "2:CA", "3:HK", "0:CK"], 2),
      trick(2, ["2:D10", "3:DA", "0:DJ", "1:S8"], 3),
      trick(3, ["3:H8", "0:HQ", "1:H10", "2:HA"], 2),
      trick(2, ["2:D7", "3:D8", "0:DK", "1:C7"], 0),
    ];
    const current = trick(0, ["0:DQ", "1:C8"]);
    expect(decideCard(cards("HJ", "SK", "SA"), current, "sun", undefined, 2, { tricks, declarer: 2 })).not.toEqual(card("SA"));
    const r = at({
      dealer: 1, mode: "sun", declarer: 2, ground: "SA",
      hands: { 0: ["CQ", "C9"], 1: ["C10", "H7"], 2: ["HJ", "SK", "SA"], 3: ["SJ", "S9", "D9"] },
      tricks, current,
    });
    expect(think(r, 2).card).not.toEqual(card("SA"));
  });

  it("9. ruffing while the buyer's ولد is out, the partner ruffs with the تسعة", () => {
    // يسار bought hokum ♠ and still holds the ولد; your partner has the بنت and the تسعة.
    const r = at({
      dealer: 2, mode: "hokum", trumpSuit: "S", declarer: 3, ground: "S10",
      hands: { 0: ["CJ", "C8", "S8", "SK"], 1: ["DK", "CQ", "CK"], 2: ["SQ", "S9", "H9", "HQ"], 3: ["CA", "S10", "SJ", "SA"] },
      tricks: [
        trick(3, ["3:DJ", "0:DQ", "1:DA", "2:D9"], 1),
        trick(1, ["1:D8", "2:D10", "3:D7", "0:C10"], 2),
        trick(2, ["2:H7", "3:HK", "0:HA", "1:H10"], 0),
        trick(0, ["0:HJ", "1:S7", "2:H8", "3:C9"], 1),
      ],
      current: trick(1, ["1:C7"]),
    });
    expect(think(r, 2).card).toEqual(card("S9"));
  });

  it("10. no فرنكة in hokum: the Ace goes on the partner's trick the first time round", () => {
    // You bought hokum ♠. Your partner led هاص; يسار's 10 is winning; يمين holds the إكة هاص.
    const r = at({
      dealer: 3, mode: "hokum", trumpSuit: "S", declarer: 0, ground: "S9",
      hands: {
        0: ["CA", "S10", "S9", "C10", "D10"],
        1: ["HQ", "S8", "HA", "H9", "D8", "H7"],
        2: ["D9", "HK", "CK", "CQ", "D7"],
        3: ["C7", "SQ", "C8", "CJ", "C9"],
      },
      tricks: [trick(0, ["0:S7", "1:SK", "2:SJ", "3:SA"], 3), trick(3, ["3:DQ", "0:DJ", "1:DK", "2:DA"], 2)],
      current: trick(2, ["2:H8", "3:H10", "0:HJ"]),
    });
    expect(think(r, 1).card).toEqual(card("HA"));
  });

  // ---- the player's corrections to the second batch

  it("9b. no ruffing with the تسعة when the player after may ruff over it with the ولد", () => {
    // Hokum ♠ bought by يسار, who has shown he has no clubs — and still holds the ولد.
    const tricks = [trick(0, ["0:C7", "1:C8", "2:C9", "3:H7"], 2)];
    const current = trick(1, ["1:CA"]);
    const play = decideCard(cards("S9", "SQ", "H8", "D8"), current, "hokum", "S", 2, { tricks, declarer: 3 });
    expect(play).not.toEqual(card("S9"));
    const r = at({
      dealer: 2, mode: "hokum", trumpSuit: "S", declarer: 3, ground: "S10",
      hands: { 0: ["H9", "HQ", "D7", "DK"], 1: ["D9", "DQ", "HK"], 2: ["S9", "SQ", "H8", "D8"], 3: ["SJ", "S10", "HA", "DA"] },
      tricks, current,
    });
    expect(think(r, 2).card).not.toEqual(card("S9"));
  });

  it("8b. in the last tricks an Ace may fatten the partner's trick (تكبير), no برقية needed", () => {
    // Sun; يمين's partner (يسار) is winning; يمين has two cards left, no hearts.
    const r = at({
      dealer: 0, mode: "sun", declarer: 0, ground: "HA",
      hands: { 0: ["DA"], 1: ["SA", "S7"], 2: ["DK"], 3: ["HK", "HQ"] },
      tricks: [],
      current: trick(3, ["3:HA", "0:D10"]),
    });
    expect((think(r, 1).ruledOut ?? []).map((c) => c.suit + c.rank)).not.toContain("SA");
  });

  it("7b. leading under your own Ace is a soft rule: marked down, not forbidden", () => {
    const r = at({
      dealer: 1, mode: "sun", declarer: 2, ground: "SA",
      hands: {
        0: ["DJ", "H9", "CQ", "CK", "C9", "HQ", "DK", "DQ"],
        1: ["C10", "S10", "C7", "CJ", "H7", "C8", "S8", "H10"],
        2: ["D10", "D7", "HJ", "HA", "SA", "CA", "SK", "S7"],
        3: ["SJ", "S9", "HK", "D9", "D8", "DA", "H8", "SQ"],
      },
      tricks: [], current: trick(2, []),
    });
    const t = think(r, 2);
    expect((t.ruledOut ?? []).map((c) => c.suit + c.rank)).not.toContain("S7");
    expect((t.softRules ?? []).map((x) => x.card.suit + x.card.rank)).toContain("S7");
  });
});
