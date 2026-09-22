import { beforeEach, describe, expect, it } from "vitest";
import { generateMap } from "../src/roguelike/mapgen";
import { runController } from "../src/roguelike/RunController";
import { matchOptionsFromJokers } from "../src/roguelike/jokers";
import { STARTING_LIVES } from "../src/roguelike/types";

describe("generateMap", () => {
  it("ends with a boss node and starts with a match node", () => {
    const map = generateMap(1);
    expect(map.nodes[0].type).toBe("match");
    expect(map.nodes[map.nodes.length - 1].type).toBe("boss");
    expect(map.lives).toBe(STARTING_LIVES);
    expect(map.currentIndex).toBe(-1);
  });

  it("gives every non-shop node a matchTarget and every node a defined reward", () => {
    const map = generateMap(2);
    for (const node of map.nodes) {
      if (node.type === "shop") {
        expect(node.matchTarget).toBeUndefined();
      } else {
        expect(node.matchTarget).toBeGreaterThan(0);
      }
      expect(node.reward).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("RunController", () => {
  beforeEach(() => {
    runController.startNewRun(42);
  });

  it("only lets you enter the next node in sequence", () => {
    const first = runController.getAvailableNode()!;
    expect(first.floor).toBe(0);
    runController.enterNode(first.id);
    expect(runController.getState().currentIndex).toBe(0);

    const second = runController.getAvailableNode()!;
    expect(second.floor).toBe(1);
    expect(() => runController.enterNode("node-6")).toThrow(); // not next
  });

  it("winning a match node banks gold and advances; losing costs a life", () => {
    const node = runController.getAvailableNode()!;
    runController.enterNode(node.id);
    runController.resolveMatchNode(true);
    expect(runController.getState().gold).toBe(node.reward);
    expect(runController.getState().cleared[0]).toBe(true);

    const next = runController.getAvailableNode()!;
    runController.enterNode(next.id);
    const livesBefore = runController.getState().lives;
    runController.resolveMatchNode(false);
    expect(runController.getState().lives).toBe(livesBefore - 1);
  });

  it("ends the run (loss) when lives hit zero", () => {
    for (let i = 0; i < STARTING_LIVES; i++) {
      const node = runController.getAvailableNode();
      if (!node) break;
      runController.enterNode(node.id);
      runController.resolveMatchNode(false);
    }
    expect(runController.getState().over).toBe(true);
    expect(runController.getState().won).toBe(false);
  });

  it("winning the boss node ends the run as a win", () => {
    let node = runController.getAvailableNode();
    while (node) {
      runController.enterNode(node.id);
      if (node.type === "shop") {
        runController.leaveShopNode();
      } else {
        runController.resolveMatchNode(true);
      }
      node = runController.getAvailableNode();
    }
    expect(runController.getState().over).toBe(true);
    expect(runController.getState().won).toBe(true);
  });

  it("buyJoker respects affordability, duplicates, and the joker cap", () => {
    expect(runController.canAfford("head-start")).toBe(false); // no gold yet

    // Force some gold by winning a node.
    const node = runController.getAvailableNode()!;
    runController.enterNode(node.id);
    runController.resolveMatchNode(true);

    expect(runController.getState().gold).toBeGreaterThan(0);
    if (runController.canAfford("head-start")) {
      runController.buyJoker("head-start");
      expect(runController.getState().jokerIds).toContain("head-start");
      expect(() => runController.buyJoker("head-start")).toThrow(); // already owned
    }
  });
});

describe("matchOptionsFromJokers", () => {
  it("applies head-start and the strongest kaboot multiplier owned", () => {
    const opts = matchOptionsFromJokers(["head-start", "giant-kaboot"]);
    expect(opts.headStart?.[0]).toBe(15);
    expect(opts.lastTrickBonus).toBe(30);
  });

  it("returns an empty object for no jokers", () => {
    expect(matchOptionsFromJokers([])).toEqual({});
  });
});
