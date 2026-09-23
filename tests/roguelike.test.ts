import { beforeEach, describe, expect, it } from "vitest";
import { generateMap } from "../src/roguelike/mapgen";
import { runController } from "../src/roguelike/RunController";
import {
  activeSynergies,
  CONSUMABLE_CATALOG,
  getJokerDef,
  JOKER_CATALOG,
  matchOptionsFromJokers,
  maxLevel,
  shopDiscount,
} from "../src/roguelike/jokers";
import { gloryForRun, metaController } from "../src/roguelike/meta";
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
    metaController.reset();
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
  it("applies head-start and الأرض by level", () => {
    const opts = matchOptionsFromJokers(["head-start", "ard-gold"], { "ard-gold": 3 });
    expect(opts.headStart?.[0]).toBe(5);
    expect(opts.lastTrickBonus).toBe(40);
    expect(matchOptionsFromJokers(["ard-gold"]).lastTrickBonus).toBe(20);
  });

  it("names the last trick الأرض, not كوت", () => {
    for (const j of [...JOKER_CATALOG, ...CONSUMABLE_CATALOG]) {
      expect(j.name + j.levels.join(" ")).not.toMatch(/كوت/);
    }
  });

  it("returns an empty object for no jokers", () => {
    expect(matchOptionsFromJokers([])).toEqual({});
  });
});

describe("shop", () => {
  beforeEach(() => metaController.reset());
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

  it("a bought joker leaves the shelf; once maxed it never shows up again", () => {
    enterFirstShop();
    runController.addGold(5000);
    const id = runController.shopOffering()[0];
    runController.buyJoker(id);
    expect(runController.getState().jokerIds).toContain(id);
    expect(runController.levelOf(id)).toBe(1);
    expect(runController.shopOffering()).not.toContain(id);
    // Level it to the max by buying it whenever it comes back as an upgrade.
    const def = getJokerDef(id)!;
    for (let i = 0; i < 60 && runController.levelOf(id) < maxLevel(def); i++) {
      runController.reroll();
      if (runController.shopOffering().includes(id)) runController.buyJoker(id);
    }
    expect(runController.levelOf(id)).toBe(maxLevel(def));
    expect(runController.getState().jokerIds.filter((x) => x === id)).toHaveLength(1);
    for (let i = 0; i < 15; i++) {
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

describe("joker levels and synergies", () => {
  it("levels scale a joker's effect", () => {
    expect(matchOptionsFromJokers(["hokum-master"], { "hokum-master": 1 }).hokumMadeBonus).toBe(5);
    expect(matchOptionsFromJokers(["hokum-master"], { "hokum-master": 2 }).hokumMadeBonus).toBe(10);
    expect(matchOptionsFromJokers(["hokum-master"], { "hokum-master": 3 }).hokumMadeBonus).toBe(15);
    expect(matchOptionsFromJokers(["jack-hunt"], { "jack-hunt": 1 }).jackHunt).toEqual({ preferTrump: false, nineToo: false, partnerToo: false });
    expect(matchOptionsFromJokers(["jack-hunt"], { "jack-hunt": 2 }).jackHunt?.preferTrump).toBe(true);
    expect(matchOptionsFromJokers(["jack-hunt"], { "jack-hunt": 3 }).jackHunt?.nineToo).toBe(true);
    expect(matchOptionsFromJokers(["forged-jack"], { "forged-jack": 3 }).forgedJack).toEqual({ nine: true, partnerToo: true });
  });

  it("counts tags and switches on synergy tiers", () => {
    const two = activeSynergies(["hokum-master", "forged-jack"]).find((s) => s.tag === "حكم")!;
    expect(two.count).toBe(2);
    expect(two.tier?.count).toBe(2);
    expect(two.next?.count).toBe(3);
    // حكم 2: +3 on a made hokum, on top of سيد الحكم's own +5.
    const pair = matchOptionsFromJokers(["hokum-master", "forged-jack"]);
    expect(pair.hokumMadeBonus).toBe(5);
    expect(pair.hokumSynergyBonus).toBe(3);
    expect(pair.lockedHokum).toBeUndefined();
    // حكم 3: hokum is locked and the synergy pays +6.
    const three = matchOptionsFromJokers(["hokum-master", "forged-jack", "burn"]);
    expect(three.lockedHokum).toBe(true);
    expect(three.hokumSynergyBonus).toBe(6);
    // The synergy works without سيد الحكم itself.
    expect(matchOptionsFromJokers(["forged-jack", "burn"]).hokumMadeBonus).toBeUndefined();
  });

  it("the ولد combo stacks: collector + synergy, and a guaranteed Jack at 3", () => {
    const o = matchOptionsFromJokers(["jack-collector", "lucky-jack", "jack-hunt"], { "jack-collector": 2 });
    expect(o.jackTrickBonus).toBe(2 + 2); // collector Lv2 + ولد tier 2
    expect(o.guaranteedJacks).toBe(1);
  });

  it("the سرقة synergy lets the hunt and the burn fire on your partner's Jack", () => {
    const o = matchOptionsFromJokers(["jack-hunt", "burn"]);
    expect(o.jackHunt?.partnerToo).toBe(true);
    expect(o.burn?.partnerToo).toBe(true);
    expect(matchOptionsFromJokers(["jack-hunt"]).jackHunt?.partnerToo).toBe(false);
  });

  it("the ذهب synergy discounts the shop", () => {
    expect(shopDiscount(["golden-touch"])).toBe(1);
    expect(shopDiscount(["golden-touch", "treasury"])).toBe(0.8);
  });

  it("every joker has a match effect at every level (the treasury pays at the shop instead)", () => {
    for (const j of JOKER_CATALOG) {
      if (j.id === "treasury") continue;
      for (let lvl = 1; lvl <= maxLevel(j); lvl++) {
        expect(Object.keys(matchOptionsFromJokers([j.id], { [j.id]: lvl })).length, `${j.id} Lv${lvl}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("treasury", () => {
  beforeEach(() => metaController.reset());
  it("pays interest when you walk into a shop, capped by level", () => {
    runController.startNewRun(5);
    runController.addGold(200);
    runController.buyJoker("treasury");
    const goldBefore = runController.getState().gold;
    for (;;) {
      const node = runController.getAvailableNode()!;
      runController.enterNode(node.id);
      if (node.type === "shop") break;
      runController.resolveMatchNode(true);
    }
    const s = runController.getState();
    expect(s.lastInterest).toBe(5);
    expect(s.gold).toBeGreaterThan(goldBefore);
  });
});

describe("meta progression (الديوانية)", () => {
  beforeEach(() => metaController.reset());

  it("a finished run banks glory once, more for wins than losses", () => {
    runController.startNewRun(1);
    let outcome;
    do {
      const node = runController.getAvailableNode()!;
      runController.enterNode(node.id);
      if (node.type === "shop") { runController.leaveShopNode(); continue; }
      outcome = runController.resolveMatchNode(false);
    } while (!runController.getState().over);
    const lossGlory = outcome!.gloryEarned!;
    expect(lossGlory).toBeGreaterThan(0);
    expect(metaController.getProfile().glory).toBe(lossGlory);
    expect(metaController.getProfile().runs).toBe(1);

    runController.startNewRun(2);
    while (!runController.getState().over) {
      const node = runController.getAvailableNode()!;
      runController.enterNode(node.id);
      if (node.type === "shop") { runController.leaveShopNode(); continue; }
      runController.resolveMatchNode(true);
    }
    expect(runController.getState().won).toBe(true);
    expect(runController.getState().gloryEarned!).toBeGreaterThan(lossGlory);
    expect(gloryForRun(runController.getState())).toBe(runController.getState().gloryEarned);
  });

  it("permanent upgrades change how the next run starts", () => {
    metaController["profile"].glory = 500;
    const base = (runController.startNewRun(3), runController.getState());
    const baseLives = base.lives, baseGold = base.gold, baseSlots = base.maxJokers, baseShelf = base.shopSlots;
    for (const id of ["start-life", "start-gold", "joker-slot", "shop-slot", "cheap-reroll", "starter-joker"]) metaController.buyUpgrade(id);
    runController.startNewRun(3);
    const s = runController.getState();
    expect(s.lives).toBe(baseLives + 1);
    expect(s.gold).toBe(baseGold + 10);
    expect(s.maxJokers).toBe(baseSlots + 1);
    expect(s.shopSlots).toBe(baseShelf + 1);
    expect(s.rerollBase).toBe(2);
    expect(s.jokerIds).toHaveLength(1);
    expect(getJokerDef(s.jokerIds[0])!.rarity).toBe("common");
  });

  it("locked jokers never show up in shops until unlocked", () => {
    const locked = JOKER_CATALOG.filter((j) => j.unlockCost > 0).map((j) => j.id);
    runController.startNewRun(8);
    runController.addGold(10_000);
    for (;;) {
      const node = runController.getAvailableNode()!;
      runController.enterNode(node.id);
      if (node.type === "shop") break;
      runController.resolveMatchNode(true);
    }
    for (let i = 0; i < 40; i++) {
      for (const id of runController.shopOffering()) expect(locked).not.toContain(id);
      runController.reroll();
    }
    metaController["profile"].glory = 100;
    metaController.unlock("forged-jack");
    let seen = false;
    for (let i = 0; i < 60 && !seen; i++) {
      runController.reroll();
      seen = runController.shopOffering().includes("forged-jack");
    }
    expect(seen).toBe(true);
  });

  it("upgrades and unlocks cost glory and can't be bought twice past their max", () => {
    metaController["profile"].glory = 12;
    expect(metaController.whyNotUpgrade("joker-slot")).toBe("مجدك ما يكفي");
    metaController.buyUpgrade("start-gold");
    expect(metaController.getProfile().glory).toBe(2);
    metaController["profile"].glory = 100;
    metaController.buyUpgrade("cheap-reroll");
    expect(metaController.whyNotUpgrade("cheap-reroll")).toBe("مكتمل");
    metaController.unlock("burn");
    expect(metaController.whyNotUnlock("burn")).toBe("مفتوح");
  });
});
