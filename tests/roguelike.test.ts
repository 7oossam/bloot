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
  sellPrice,
  shopDiscount,
  UPGRADE_CATALOG,
} from "../src/roguelike/jokers";
import { MAX_JOKERS, REROLL_BASE_COST, REROLL_STEP, STARTING_GOLD, STARTING_LIVES } from "../src/roguelike/types";

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
    expect(runController.getState().gold).toBe(STARTING_GOLD + node.reward);
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
    expect(runController.canAfford("head-start")).toBe(false); // only the starting purse

    // Force some gold by winning a node.
    const node = runController.getAvailableNode()!;
    runController.enterNode(node.id);
    runController.resolveMatchNode(true);

    expect(runController.getState().gold).toBeGreaterThan(0);
    if (runController.canAfford("head-start")) {
      runController.buyJoker("head-start");
      expect(runController.getState().jokerIds).toContain("head-start");
      // Buying it again is a level-up, not a second copy.
      if (runController.canAfford("head-start")) runController.buyJoker("head-start");
      expect(runController.getState().jokerIds.filter((id) => id === "head-start")).toHaveLength(1);
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

  it("offers three jokers, a consumable and a run upgrade", () => {
    enterFirstShop();
    const stock = runController.shopOffering();
    expect(stock).toHaveLength(5);
    const jokers = stock.slice(0, 3);
    expect(new Set(jokers).size).toBe(3);
    for (const id of jokers) expect(JOKER_CATALOG.some((j) => j.id === id)).toBe(true);
    expect(CONSUMABLE_CATALOG.some((c) => c.id === stock[3])).toBe(true);
    expect(UPGRADE_CATALOG.some((u) => u.id === stock[4])).toBe(true);
  });

  it("the first shop affords two commons or a rare (the balance target)", () => {
    enterFirstShop();
    const gold = runController.getState().gold;
    const commons = JOKER_CATALOG.filter((j) => j.rarity === "common").map((j) => j.cost).sort((a, b) => a - b);
    const rares = JOKER_CATALOG.filter((j) => j.rarity === "rare").map((j) => j.cost).sort((a, b) => a - b);
    expect(gold).toBeGreaterThanOrEqual(commons[0] + commons[1]);
    expect(gold).toBeGreaterThanOrEqual(rares[Math.floor(rares.length / 2)]);
  });

  it("rerolling costs gold and gets pricier each time", () => {
    enterFirstShop();
    const s0 = runController.getState();
    expect(s0.rerollCost).toBe(REROLL_BASE_COST);
    const gold = s0.gold;
    runController.reroll();
    expect(runController.getState().gold).toBe(gold - REROLL_BASE_COST);
    expect(runController.getState().rerollCost).toBe(REROLL_BASE_COST + REROLL_STEP);
    expect(runController.shopOffering()).toHaveLength(5);
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
      // The treasury pays at the shop; الوايلد, النسخة and الحصالة need the rest of a row / a run to do anything.
      if (["treasury", "wild", "copycat", "piggy", "chief", "maestro"].includes(j.id)) continue;
      for (let lvl = 1; lvl <= maxLevel(j); lvl++) {
        expect(Object.keys(matchOptionsFromJokers([j.id], { [j.id]: lvl })).length, `${j.id} Lv${lvl}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("treasury", () => {
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

describe("run upgrades, selling and the new consumables", () => {
  beforeEach(() => runController.startNewRun(3));

  it("upgrades are bought with gold, level by level, and change the run at once", () => {
    runController.addGold(1000);
    const s = runController.getState();
    runController.buyJoker("joker-slot");
    expect(s.maxJokers).toBe(MAX_JOKERS + 1);
    expect(runController.priceOf("joker-slot")).toBe(45); // the second level costs more
    runController.buyJoker("joker-slot");
    expect(s.maxJokers).toBe(MAX_JOKERS + 2);
    expect(runController.whyNot("joker-slot")).toBe("مكتمل");
    runController.buyJoker("shop-slot");
    expect(s.shopSlots).toBe(4);
    runController.buyJoker("cheap-reroll");
    expect(s.rerollBase).toBe(1);
    runController.buyJoker("salary");
    const node = runController.getAvailableNode()!;
    runController.enterNode(node.id);
    const gold = s.gold;
    expect(runController.resolveMatchNode(true).goldEarned).toBe(node.reward + 4);
    expect(s.gold).toBe(gold + node.reward + 4);
  });

  it("زبون مميز takes 15% off everything", () => {
    runController.addGold(1000);
    const before = runController.priceOf("royal-sun");
    runController.buyJoker("vip");
    expect(runController.priceOf("royal-sun")).toBe(Math.round(before * 0.85));
  });

  it("selling a joker frees its slot and pays half its worth", () => {
    runController.addGold(1000);
    runController.buyJoker("hokum-master");
    runController.buyJoker("hokum-master"); // Lv2
    const def = getJokerDef("hokum-master")!;
    const value = runController.sellValue("hokum-master");
    expect(value).toBe(sellPrice(def, 2));
    expect(value).toBe(Math.floor((14 + 11) / 2));
    const gold = runController.getState().gold;
    runController.sellJoker("hokum-master");
    expect(runController.getState().gold).toBe(gold + value);
    expect(runController.getState().jokerIds).not.toContain("hokum-master");
    expect(runController.levelOf("hokum-master")).toBe(0);
  });

  it("دفعة starts the next match ahead once; the ticket levels up a joker for free", () => {
    runController.addGold(1000);
    runController.buyJoker("boost");
    expect(runController.takeMatchBoost()).toBe(10);
    expect(runController.takeMatchBoost()).toBe(0);
    expect(runController.whyNot("upgrade-ticket")).toBe("ما عندك جوكر يترقى");
    runController.buyJoker("spy");
    runController.buyJoker("upgrade-ticket");
    expect(runController.levelOf("spy")).toBe(2);
  });
});

describe("the new jokers", () => {
  it("each one turns into its match option, scaling with level", () => {
    expect(matchOptionsFromJokers(["project-engineer"], { "project-engineer": 3 }).projectMultiplier).toBe(3);
    expect(matchOptionsFromJokers(["royal-baloot"]).balootBonus).toEqual({ points: 4, gold: 4 });
    expect(matchOptionsFromJokers(["ground-keeper"], { "ground-keeper": 2 }).groundGold).toBe(6);
    expect(matchOptionsFromJokers(["trap"]).rivalLossBonus).toBe(5);
    expect(matchOptionsFromJokers(["qahwaji"], { qahwaji: 2 }).doubleWinBonus).toBe(1);
    expect(matchOptionsFromJokers(["akka-gold"]).akkaGold).toBe(3);
    expect(matchOptionsFromJokers(["patience"]).lossGold).toBe(3);
    expect(matchOptionsFromJokers(["golden-kaboot"]).kabootBonus).toEqual({ points: 15, gold: 15 });
  });

  it("the new synergies: مشروع pays per hand with projects, دفاع stacks on الفخ and الصبر", () => {
    expect(matchOptionsFromJokers(["project-engineer", "royal-baloot"]).projectSynergyBonus).toBe(3);
    const two = matchOptionsFromJokers(["trap", "comeback"]);
    expect(two.rivalLossBonus).toBe(5 + 4);
    const three = matchOptionsFromJokers(["trap", "comeback", "patience"]);
    expect(three.rivalLossBonus).toBe(5 + 8);
    expect(three.lossGold).toBe(3 + 2);
  });
});

describe("build-makers: jokers that depend on your row", () => {
  it("الوايلد joins every family you've started", () => {
    const hokum = activeSynergies(["hokum-master", "wild"]).find((x) => x.tag === "حكم")!;
    expect(hokum.count).toBe(2);
    expect(hokum.tier?.count).toBe(2);
    expect(activeSynergies(["wild"])).toEqual([]);
    expect(matchOptionsFromJokers(["hokum-master", "wild"]).hokumSynergyBonus).toBe(3);
  });

  it("شيخ القبيلة pays for one big family; المايسترو for many active synergies", () => {
    const mono = matchOptionsFromJokers(["chief", "hokum-master", "forged-jack", "burn"]);
    expect(mono.winBonuses).toContainEqual({ label: "شيخ القبيلة", points: 3 });
    const wide = matchOptionsFromJokers(["maestro", "hokum-master", "royal-baloot", "trap", "comeback"], {}, {});
    // حكم 2 (tier 1), دفاع 2 (tier 1), مشروع 1 (none) → 2 tiers × 2.
    expect(wide.winBonuses).toContainEqual({ label: "المايسترو", points: 4 });
  });

  it("النسخة copies the joker on its right — the one before it in the row", () => {
    const o = matchOptionsFromJokers(["hokum-master", "copycat"], { "hokum-master": 2 });
    expect(o.hokumMadeBonus).toBe(20);
    const sun = matchOptionsFromJokers(["royal-sun", "copycat"]);
    expect(sun.sunMultiplier).toBeCloseTo(2); // 1.5 + its 0.5 again
    // On the far right it has nothing to copy; order matters.
    expect(matchOptionsFromJokers(["copycat", "hokum-master"]).hokumMadeBonus).toBe(5);
    runController.startNewRun(1);
    runController.addGold(500);
    runController.buyJoker("hokum-master");
    runController.buyJoker("copycat");
    runController.moveJoker("copycat", -1);
    expect(runController.getState().jokerIds).toEqual(["copycat", "hokum-master"]);
  });

  it("الحصالة grows with every match won and pays on every hand won", () => {
    runController.startNewRun(2);
    runController.addGold(100);
    runController.buyJoker("piggy");
    for (let i = 0; i < 2; i++) {
      const node = runController.getAvailableNode()!;
      runController.enterNode(node.id);
      runController.resolveMatchNode(true);
      runController.skipReward();
    }
    const s = runController.getState();
    expect(s.jokerCounters["piggy"]).toBe(2);
    expect(matchOptionsFromJokers(s.jokerIds, s.jokerLevels, { counters: s.jokerCounters }).winBonuses).toContainEqual({
      label: "الحصالة",
      points: 2,
    });
  });

  it("الصراف, المقامر and دفتر المشاريع turn into their options", () => {
    expect(matchOptionsFromJokers(["money-changer"], {}, { gold: 57 }).goldToPoints).toEqual({ per: 10, cap: 4, startingGold: 57 });
    const g = matchOptionsFromJokers(["gambler"], { gambler: 2 });
    expect(g.gamblerMultiplier).toBe(1.5);
    expect(g.lossGoldCost).toBe(4);
    expect(matchOptionsFromJokers(["ledger"]).projectGold).toBe(1);
    expect(matchOptionsFromJokers(["cutter"], { cutter: 3 }).ruffBonus).toBe(3);
    // ذهب at 4 pays gold per hand won; مشروع at 3 makes your projects always count.
    expect(matchOptionsFromJokers(["golden-touch", "treasury", "ledger", "gambler"]).winGold).toBe(2);
    expect(matchOptionsFromJokers(["project-engineer", "royal-baloot", "ledger"]).projectsAlwaysCount).toBe(true);
  });
});

describe("غنائم الصكة — rewards after every match won", () => {
  beforeEach(() => runController.startNewRun(11));
  const winNext = () => {
    const node = runController.getAvailableNode()!;
    runController.enterNode(node.id);
    return runController.resolveMatchNode(true);
  };

  it("a won match offers three free spoils; a lost one offers none", () => {
    winNext();
    const r = runController.getState().pendingRewards!;
    expect(r.items).toHaveLength(3);
    expect(new Set(r.items).size).toBe(3);
    const id = r.items.find((x) => !runController.whyNotReward(x))!;
    const gold = runController.getState().gold;
    runController.takeReward(id);
    expect(runController.getState().gold).toBe(gold); // free
    expect(runController.getState().pendingRewards).toBeUndefined();
    const node = runController.getAvailableNode()!;
    runController.enterNode(node.id);
    runController.resolveMatchNode(false);
    expect(runController.getState().pendingRewards).toBeUndefined();
  });

  it("skipping pays a little gold instead", () => {
    winNext();
    const gold = runController.getState().gold;
    runController.skipReward();
    expect(runController.getState().gold).toBe(gold + 8);
  });

  it("offers lean towards your build: jokers sharing your families show up far more", () => {
    let aligned = 0, total = 0;
    for (let seed = 1; seed <= 60; seed++) {
      runController.startNewRun(seed);
      runController.addGold(200);
      runController.buyJoker("hokum-master");
      runController.buyJoker("cutter");
      winNext();
      for (const id of runController.getState().pendingRewards!.items) {
        const def = getJokerDef(id)!;
        total++;
        if (def.kind === "joker" && (def.tags.includes("حكم") || ["hokum-master", "cutter"].includes(id))) aligned++;
      }
    }
    // حكم jokers are ~7 of 33 jokers; weighted, they fill well over a quarter of the offers.
    expect(aligned / total).toBeGreaterThan(0.3);
  });

  it("the elite's spoils are rarer, and the boss ends the run without any", () => {
    let rare = 0, count = 0;
    for (let seed = 1; seed <= 20; seed++) {
      runController.startNewRun(seed);
      for (;;) {
        const node = runController.getAvailableNode()!;
        runController.enterNode(node.id);
        if (node.type === "shop") { runController.leaveShopNode(); continue; }
        runController.resolveMatchNode(true);
        if (node.type === "elite") break;
        runController.skipReward();
      }
      const r = runController.getState().pendingRewards!;
      expect(r.elite).toBe(true);
      for (const id of r.items) {
        const def = getJokerDef(id)!;
        if (def.kind !== "joker") continue;
        count++;
        if (def.rarity !== "common") rare++;
      }
    }
    expect(rare / count).toBeGreaterThan(0.6);
    runController.skipReward();
    let node = runController.getAvailableNode();
    while (node) {
      runController.enterNode(node.id);
      if (node.type === "shop") runController.leaveShopNode();
      else { runController.resolveMatchNode(true); runController.skipReward(); }
      node = runController.getAvailableNode();
    }
    expect(runController.getState().won).toBe(true);
    expect(runController.getState().pendingRewards).toBeUndefined();
  });
});
