import { describe, expect, it } from "vitest";
import { decideBid } from "../src/ai/bidding-ai";
import { decideCard } from "../src/ai/play-ai";
import { GameController, HUMAN_SEAT, MATCH_TARGET } from "../src/game/GameController";
import { mulberry32 } from "../src/engine/rng";

/** Drives the human seat with the same AI policy, purely to exercise the full loop deterministically. */
function playMatchToCompletion(controller: GameController, maxSteps = 5000): void {
  for (let i = 0; i < maxSteps; i++) {
    const status = controller.step();
    if (status === "match-complete") return;
    if (status === "waiting-human") {
      const round = controller.getRound();
      if (round.phase === "bidding") {
        const bid = decideBid(HUMAN_SEAT, round.hands[HUMAN_SEAT], round.bidding);
        controller.submitPlayerBid(bid);
      } else if (round.phase === "playing") {
        const card = decideCard(
          round.hands[HUMAN_SEAT],
          round.currentTrick!,
          round.bidding.result!.mode,
          round.bidding.result!.trumpSuit,
          HUMAN_SEAT,
        );
        controller.submitPlayerCard(card);
      } else {
        throw new Error(`Unexpected phase while waiting-human: ${round.phase}`);
      }
    }
  }
  throw new Error("Match did not complete within the step budget");
}

describe("GameController", () => {
  it("plays a full match end to end and reaches the target score", () => {
    const events: string[] = [];
    const controller = new GameController(mulberry32(7));
    for (const evt of [
      "hand:dealt",
      "bidding:resolved",
      "trick:complete",
      "hand:complete",
      "match:complete",
    ] as const) {
      controller.on(evt, () => events.push(evt));
    }

    controller.startMatch();
    playMatchToCompletion(controller);

    expect(events).toContain("match:complete");
    const score = controller.getMatchScore();
    expect(score[0] >= MATCH_TARGET || score[1] >= MATCH_TARGET).toBe(true);
    expect(score[0]).not.toBe(score[1]);
  });

  it("emits trick:complete exactly 8 times per completed hand", () => {
    const trickCounts: number[] = [];
    let tricksThisHand = 0;
    const controller = new GameController(mulberry32(99));
    controller.on("trick:complete", () => {
      tricksThisHand++;
    });
    controller.on("hand:complete", () => {
      trickCounts.push(tricksThisHand);
      tricksThisHand = 0;
    });

    controller.startMatch();
    playMatchToCompletion(controller);

    expect(trickCounts.length).toBeGreaterThan(0);
    for (const count of trickCounts) expect(count).toBe(8);
  });
});

describe("GameController match length", () => {
  it("a match to 41 lasts several hands, not one", () => {
    // Regression: hands used to add raw card points (162 a hokum hand) to a target of 41,
    // so every match ended on its first hand.
    for (const seed of [3, 11, 29, 57]) {
      const controller = new GameController(mulberry32(seed), { matchTarget: 41 });
      let hands = 0;
      controller.on("hand:complete", () => hands++);
      controller.startMatch();
      playMatchToCompletion(controller);
      expect(hands).toBeGreaterThanOrEqual(2);
      const s = controller.getMatchScore();
      expect(Math.max(s[0], s[1])).toBeLessThan(41 + 26);
    }
  });
});
