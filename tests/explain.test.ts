import { describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { decideDouble } from "../src/ai/doubling-ai";
import { mulberry32 } from "../src/engine/rng";
import type { Card } from "../src/engine/types";
import { GameController, HUMAN_SEAT, type PlayLogEntry } from "../src/game/GameController";
import { explainPlay } from "../src/game/explain";
import { exportNotes } from "../src/game/notes";

const c = (rank: Card["rank"], suit: Card["suit"]): Card => ({ rank, suit });

function entry(over: Partial<PlayLogEntry>): PlayLogEntry {
  return { seat: 1, trick: 3, position: 1, trace: { kind: "only", card: c("J", "H") }, partnerAsks: [], partnerBarqiya: [], ...over };
}

describe("«ليش؟»: the AI explains its plays", () => {
  it("names the card and the reason", () => {
    const lines = explainPlay(entry({}), "يمين");
    expect(lines[0]).toContain("ولد هاص");
    expect(lines.join("\n")).toContain("مجبور");
  });

  it("shows the search's numbers and marks the card it played", () => {
    const e = entry({
      trace: {
        kind: "search",
        card: c("J", "H"),
        ruleChoice: c("A", "H"),
        worlds: 40,
        scores: [
          { card: c("J", "H"), avg: 3.2 },
          { card: c("A", "H"), avg: 1.1 },
        ],
      },
      partnerAsks: ["D"],
    });
    const text = explainPlay(e, "يسار").join("\n");
    expect(text).toContain("40 احتمال");
    expect(text).toContain("ولد هاص: \u2066+3.2\u2069  ← لعبها");
    expect(text).toContain("عادته كانت بتقول إكة هاص");
    expect(text).toContain("طالب بتهريبه: ديمن");
  });

  it("explains the cards the player's rules ruled out", () => {
    const e = entry({ position: 0, trace: { kind: "rules", card: c("7", "H"), ruledOut: [c("J", "S")], rules: ["اللي مو مشتري ما يبدأ بالحكم"] } });
    const text = explainPlay(e, "يمين").join("\n");
    expect(text).toContain("ولد سبيت");
    expect(text).toContain("ما يبدأ بالحكم");
  });
});

describe("the play log and the note snapshot", () => {
  it("logs every computer play with a reason, and the snapshot round-trips as JSON", () => {
    const g = new GameController(mulberry32(3), { matchTarget: 9999, searchAI: true });
    g.startMatch();
    for (let i = 0; i < 3000 && g.getRound().tricks.length < 4; i++) {
      const status = g.step();
      if (status !== "waiting-human") continue;
      const round = g.getRound();
      if (g.getPendingAction() && round.phase === "playing") g.skipPlayerAction();
      else if (round.phase === "bidding") g.submitPlayerBid(decideBid(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.bidding));
      else if (round.phase === "doubling") g.submitPlayerDouble(decideDouble(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.doubling!, round.bidding.result!.trumpSuit));
      else {
        const res = round.bidding.result!;
        g.submitPlayerCard(decideCard(round.hands[HUMAN_SEAT], round.currentTrick!, res.mode, res.trumpSuit, HUMAN_SEAT, { tricks: round.tricks, closed: round.closed }));
      }
    }
    const log = g.getPlayLog();
    expect(log.length).toBeGreaterThanOrEqual(9);
    expect(log.every((p) => p.seat !== HUMAN_SEAT)).toBe(true);
    const snap = g.snapshot();
    expect(snap.plays.length).toBe(log.length);
    expect(Object.values(snap.initialHands).every((h) => h.length === 5)).toBe(true);
    const text = exportNotes([{ at: "now", text: "ليش؟", snapshot: snap }]);
    const json = text.slice(text.indexOf("```json") + 7, text.lastIndexOf("```"));
    expect(JSON.parse(json)[0].snapshot.tricks.length).toBe(snap.tricks.length);
  });
});
