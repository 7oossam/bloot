import { describe, expect, it } from "vitest";
import { EXAM, buildRound, askAll } from "../src/ai/exam";
import { mulberry32 } from "../src/engine/rng";
import { cardId } from "../src/engine/cards";

describe("the AI exam", () => {
  it("every question builds a legal position on your turn, and every AI answers with a legal card and a reason", () => {
    const rand = mulberry32(3);
    for (const q of EXAM) {
      for (let k = 0; k < 5; k++) {
        const pos = typeof q.position === "function" ? q.position(rand) : q.position;
        if (!pos) continue;
        const r = buildRound(pos, rand)!;
        expect(r, q.id).toBeDefined();
        expect(r.turnSeat).toBe(0);
        const all = [0, 1, 2, 3].flatMap((s) => r.hands[s as 0].map(cardId));
        const played = [...r.tricks, r.currentTrick!].flatMap((t) => t.order.map((s) => cardId(t.cards[s]!)));
        expect(new Set([...all, ...played]).size).toBe(32); // the whole deck, each card once
        const res = askAll(r, 6, rand);
        const legal = r.legalMovesFor(0).map(cardId);
        for (const who of ["rule", "trained", "search"] as const) {
          expect(legal, `${q.id} ${who}`).toContain(cardId(res[who].card));
          expect(res[who].why.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
