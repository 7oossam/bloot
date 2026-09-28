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
    expect(s.jokerIds).toEqual(expect.arrayContaining(["spade-king", "spade-always"]));
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

  it("the character's blessing hands over its own تحف", () => {
    runController.startNewRun(3);
    runController.chooseCharacter("hara");
    runController.takeBlessing(2);
    expect(runController.getState().jokerIds).toEqual(expect.arrayContaining(["trash-beats-ace", "low-luck", "lowerer"]));
    expect(runController.getState().nextMatchPenalty).toBe(10);
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
