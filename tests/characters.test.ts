import { describe, expect, it } from "vitest";
import { runController } from "../src/roguelike/RunController";
import { CHARACTERS, inCharacterPool } from "../src/roguelike/characters";
import { getBlessing } from "../src/roguelike/blessings";
import { getJokerDef, JOKER_CATALOG } from "../src/roguelike/jokers";
import { pathTo } from "../src/roguelike/mapgen";

describe("الشخصيات", () => {
  it("starts the run holding the character's rule, which can't be sold", () => {
    runController.startNewRun(7);
    runController.chooseCharacter("spade");
    const s = runController.getState();
    expect(s.character).toBe("spade");
    expect(s.jokerIds).toEqual(["spade-king"]);
    expect(runController.isStarter("spade-king")).toBe(true);
    expect(runController.sellValue("spade-king")).toBe(0);
  });

  it("الراوي offers one free, one priced, and the character's own blessing", () => {
    for (const c of CHARACTERS) {
      runController.startNewRun(11);
      runController.chooseCharacter(c.id);
      const offer = runController.getState().blessing!;
      expect(offer).toHaveLength(3);
      expect(getBlessing(offer[0])!.price).toBeUndefined();
      expect(getBlessing(offer[1])!.character).toBeUndefined();
      expect(offer[2]).toBe(c.blessing);
    }
  });

  it("العهد: a won match played the character's way brings one of its تحف — once a night", () => {
    runController.startNewRun(3);
    runController.chooseCharacter("hara");
    runController.takeBlessing(2);
    const s = runController.getState();
    expect(s.jokerIds).toEqual(["trash-beats-ace"]); // nothing up front
    const fight = () => {
      const node = runController.getAvailableNodes().find((n) => n.type !== "shop" && n.type !== "diwaniya")!;
      runController.enterNode(node.id);
    };
    fight();
    // Not enough 7/8 tricks: no gift, and it says how far you got.
    expect(runController.resolveMatchNode(true, { lowTricks: 2, spadeTricks: 0 }).vow).toEqual({ count: 2, need: 3, label: "أكلات بالصغار" });
    runController.skipReward();
    fight();
    const kept = runController.resolveMatchNode(true, { lowTricks: 3, spadeTricks: 0 }).vow!;
    expect(kept.gift).toBeDefined();
    expect(s.jokerIds).toHaveLength(2);
    expect(inCharacterPool(getJokerDef(s.jokerIds[1])!.tags, "spade")).toBe(false); // it's a حارة تحفة
    runController.skipReward();
    fight();
    // Kept once a night: after that it's done.
    expect(runController.resolveMatchNode(true, { lowTricks: 9, spadeTricks: 0 }).vow).toBeUndefined();
  });

  it("never offers another character's تحف, in shops or spoils", () => {
    for (const c of CHARACTERS) {
      const foreign = JOKER_CATALOG.filter((d) => d.kind === "joker" && !inCharacterPool(d.tags, c.id)).map((d) => d.id);
      expect(foreign.length).toBeGreaterThan(0);
      for (let seed = 1; seed <= 40; seed++) {
        runController.startNewRun(seed);
        runController.chooseCharacter(c.id);
        const s = runController.getState();
        const shop = s.nodes.find((n) => n.type === "shop")!;
        const route = pathTo(s.nodes, shop.id)!.map((n) => n.id);
        // Walk to the shop, winning every fight on the way and looking at its spoils.
        for (const id of route) {
          runController.enterNode(id);
          const node = runController.getState().nodes[runController.getState().currentIndex];
          if (node.type === "shop") break;
          if (node.type === "diwaniya") {
            const open = [0, 1, 2, 3].find((i) => !runController.whyNotEventOption(i))!;
            runController.chooseEventOption(open);
            continue;
          }
          runController.resolveMatchNode(true);
          for (const item of runController.getState().pendingRewards?.items ?? []) expect(foreign).not.toContain(item);
          runController.skipReward();
        }
        for (const item of runController.shopOffering()) expect(foreign).not.toContain(item);
      }
    }
  });

  it("general تحف turn up for everyone; a character's own only for it", () => {
    expect(inCharacterPool(getJokerDef("low-luck")!.tags, "hara")).toBe(true);
    expect(inCharacterPool(getJokerDef("low-luck")!.tags, "spade")).toBe(false);
    expect(inCharacterPool(getJokerDef("dyer")!.tags, "hara")).toBe(false);
    expect(inCharacterPool(getJokerDef("breaker")!.tags, "hara")).toBe(true);
    expect(inCharacterPool(getJokerDef("breaker")!.tags, "spade")).toBe(true);
  });
});

describe("تحف الشخصيات الجديدة", () => {
  it("التسعة الشقية: with ثورة الصغار your side's 9 takes the Ace of its suit (outside the trump)", async () => {
    const { resolveTrick } = await import("../src/engine/trick");
    const trick = {
      leader: 1 as const,
      order: [1, 2, 3, 0] as const,
      cards: { 1: { suit: "H", rank: "A" }, 2: { suit: "H", rank: "9" }, 3: { suit: "H", rank: "K" }, 0: { suit: "H", rank: "7" } },
      rules: { trashBeatsAce: 0 as const },
    };
    // Without it, the 7 takes it (ثورة الصغار) — played last, over the 9 that can't.
    expect(resolveTrick({ ...trick, order: [...trick.order] } as never, "sun")).toBe(0);
    const nines = { ...trick, order: [1, 2, 3] as const, cards: { 1: trick.cards[1], 2: trick.cards[2], 3: trick.cards[3] } };
    expect(resolveTrick({ ...nines, order: [...nines.order], rules: { trashBeatsAce: 0 } } as never, "sun")).toBe(1);
    expect(resolveTrick({ ...nines, order: [...nines.order], rules: { trashBeatsAce: 0, trashNine: true } } as never, "sun")).toBe(2);
  });

  it("البوصلة: your first five hold the spade Jack or 9 (both at level 2)", async () => {
    const { Round } = await import("../src/engine/round");
    const { mulberry32 } = await import("../src/engine/rng");
    for (let seed = 1; seed <= 30; seed++) {
      const round = new Round(0, mulberry32(seed), { guaranteeJackFor: 0, guaranteedJacks: 0, guaranteedTopSpades: 2 });
      const top = round.hands[0].filter((c) => c.suit === "S" && (c.rank === "J" || c.rank === "9"));
      const onGround = round.groundCard.suit === "S" && (round.groundCard.rank === "J" || round.groundCard.rank === "9");
      expect(top.length).toBeGreaterThanOrEqual(onGround ? 1 : 2);
    }
  });
});
