import { describe, expect, it } from "vitest";
import { ismcts } from "../src/ai/mcts";
import { decideBid } from "../src/ai/bidding-ai";
import { Round } from "../src/engine/round";
import { mulberry32 } from "../src/engine/rng";
import { cardId } from "../src/engine/cards";

describe("ismcts", () => {
  it("never touches the real round while it searches (the live-site crash)", async () => {
    const r = new Round(0, mulberry32(4));
    for (let i = 0; i < 20 && r.phase === "bidding"; i++) r.bid(decideBid(r.bidding.turnSeat, r.hands[r.bidding.turnSeat], r.bidding));
    if (r.phase === "redeal" || r.phase === "bidding") return;
    while (r.phase === "doubling") r.double({ seat: r.doubling!.turnSeat, call: "pass" });
    // Put a card on the table first, so the search starts mid-trick.
    const lead = r.turnSeat!;
    r.playCard(lead, r.legalMovesFor(lead)[0]);
    const seat = r.turnSeat!;
    const before = JSON.stringify({ hands: r.hands, trick: r.currentTrick, tricks: r.tricks });
    const card = await ismcts(r, seat, 40);
    expect(JSON.stringify({ hands: r.hands, trick: r.currentTrick, tricks: r.tricks })).toBe(before);
    expect(r.legalMovesFor(seat).map(cardId)).toContain(cardId(card));
  });
});
