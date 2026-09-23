import { beforeEach, describe, expect, it } from "vitest";
import { generateMap } from "../src/roguelike/mapgen";
import { runController } from "../src/roguelike/RunController";
import { CONSUMABLE_CATALOG, JOKER_CATALOG, matchOptionsFromJokers } from "../src/roguelike/jokers";
import { MAX_JOKERS, REROLL_BASE_COST, REROLL_STEP, STARTING_LIVES } from "../src/roguelike/types";

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
  it("applies head-start and the strongest الأرض joker owned", () => {
    const opts = matchOptionsFromJokers(["head-start", "ard-gold", "ard-giant"]);
    expect(opts.headStart?.[0]).toBe(5);
    expect(opts.lastTrickBonus).toBe(40);
    expect(matchOptionsFromJokers(["ard-gold"]).lastTrickBonus).toBe(20);
  });

  it("maps every joker in the catalog to an effect", () => {
    for (const j of JOKER_CATALOG) {
      expect(Object.keys(matchOptionsFromJokers([j.id])).length, j.id).toBeGreaterThan(0);
    }
  });

  it("names the last trick الأرض, not كوت", () => {
    for (const j of [...JOKER_CATALOG, ...CONSUMABLE_CATALOG]) {
      expect(j.name + j.description).not.toMatch(/كوت/);
    }
  });

  it("returns an empty object for no jokers", () => {
    expect(matchOptionsFromJokers([])).toEqual({});
  });
});

describe("shop", () => {
  const enterFirstShop = () => {
    runController.startNewRun(7);
    // Walk up to the first shop, winning the matches on the way for gold.
    for (;;) {
      const node = runController.getAvailableNode()!;
      runController.enterNode(node.id);
      if (node.type === "shop") return;
      runController.resolveMatchNode(true);
    }
  };

  it("offers three unowned jokers and one consumable", () => {
    enterFirstShop();
    const stock = runController.shopOffering();
    expect(stock).toHaveLength(4);
    const jokers = stock.slice(0, 3);
    expect(new Set(jokers).size).toBe(3);
    for (const id of jokers) expect(JOKER_CATALOG.some((j) => j.id === id)).toBe(true);
    expect(CONSUMABLE_CATALOG.some((c) => c.id === stock[3])).toBe(true);
  });

  it("rerolling costs gold and gets pricier each time", () => {
    enterFirstShop();
    const s0 = runController.getState();
    expect(s0.rerollCost).toBe(REROLL_BASE_COST);
    const gold = s0.gold;
    runController.reroll();
    expect(runController.getState().gold).toBe(gold - REROLL_BASE_COST);
    expect(runController.getState().rerollCost).toBe(REROLL_BASE_COST + REROLL_STEP);
    expect(runController.shopOffering()).toHaveLength(4);
  });

  it("a bought joker leaves the shelf and never shows up again", () => {
    enterFirstShop();
    runController.addGold(500);
    const id = runController.shopOffering()[0];
    runController.buyJoker(id);
    expect(runController.getState().jokerIds).toContain(id);
    expect(runController.shopOffering()).not.toContain(id);
    for (let i = 0; i < 10; i++) {
      runController.reroll();
      expect(runController.shopOffering()).not.toContain(id);
    }
  });

  it("joker slots are capped", () => {
    enterFirstShop();
    runController.addGold(10_000);
    let bought = 0;
    for (let i = 0; i < 20 && bought < MAX_JOKERS; i++) {
      for (const id of runController.shopOffering().slice(0, 3)) {
        if (runController.canAfford(id)) { runController.buyJoker(id); bought++; }
      }
      runController.reroll();
    }
    expect(runController.getState().jokerIds).toHaveLength(MAX_JOKERS);
    const more = JOKER_CATALOG.find((j) => !runController.getState().jokerIds.includes(j.id))!;
    expect(runController.whyNot(more.id)).toBeDefined();
  });

  it("a shield absorbs one lost match; an extra life adds a life", () => {
    runController.startNewRun(9);
    runController.addGold(500);
    const livesBefore = runController.getState().lives;
    // Consumables can be bought directly by id regardless of the current shelf.
    runController.buyJoker("shield");
    runController.buyJoker("extra-life");
    expect(runController.getState().lives).toBe(livesBefore + 1);
    const node = runController.getAvailableNode()!;
    runController.enterNode(node.id);
    expect(runController.resolveMatchNode(false).shieldUsed).toBe(true);
    expect(runController.getState().lives).toBe(livesBefore + 1);
    expect(runController.getState().shields).toBe(0);
  });
});
