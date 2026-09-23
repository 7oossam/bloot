import { mulberry32 } from "../engine/rng";
import { generateMap } from "./mapgen";
import { CONSUMABLE_CATALOG, getJokerDef, JOKER_CATALOG, type Rarity } from "./jokers";
import {
  MAX_JOKERS,
  MAX_LIVES,
  REROLL_BASE_COST,
  REROLL_STEP,
  SHOP_JOKER_SLOTS,
  type MapNode,
  type RunState,
} from "./types";

/** How often each rarity turns up in a shop slot. */
const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, legendary: 10 };

export interface MatchOutcome {
  /** A shield took the hit, so no life was lost. */
  shieldUsed: boolean;
}

/**
 * Owns the meta-run state (map position, lives, gold, jokers) across nodes.
 * A single shared instance — MapScene and TableScene both import it directly
 * rather than passing the whole state through Phaser scene data.
 */
class RunController {
  private state: RunState = generateMap(Date.now());
  private shopRolls = 0;

  startNewRun(seed: number = Date.now()): void {
    this.state = generateMap(seed);
    this.shopRolls = 0;
  }

  getState(): Readonly<RunState> {
    return this.state;
  }

  /** The node the player can currently walk into, or undefined if the run is over / finished. */
  getAvailableNode(): MapNode | undefined {
    if (this.state.over) return undefined;
    const nextIndex = this.state.currentIndex + 1;
    return this.state.nodes[nextIndex];
  }

  enterNode(nodeId: string): void {
    const node = this.getAvailableNode();
    if (!node || node.id !== nodeId) {
      throw new Error(`Node ${nodeId} is not the next available node`);
    }
    this.state.currentIndex++;
    if (node.type === "shop") {
      this.state.rerollCost = REROLL_BASE_COST;
      this.rollShop();
    }
  }

  /** Called once a match/elite/boss node's GameController match finishes. */
  resolveMatchNode(won: boolean): MatchOutcome {
    const node = this.state.nodes[this.state.currentIndex];
    this.state.cleared[this.state.currentIndex] = true;

    if (won) {
      this.state.gold += node.reward;
      if (node.type === "boss") {
        this.state.over = true;
        this.state.won = true;
      }
      return { shieldUsed: false };
    }
    if (this.state.shields > 0) {
      this.state.shields--;
      return { shieldUsed: true };
    }
    this.state.lives--;
    if (this.state.lives <= 0) {
      this.state.over = true;
      this.state.won = false;
    }
    return { shieldUsed: false };
  }

  /** Gold picked up mid-match (e.g. from a joker). */
  addGold(amount: number): void {
    this.state.gold += amount;
  }

  /** Called once the player is done shopping at the current (shop) node. */
  leaveShopNode(): void {
    this.state.cleared[this.state.currentIndex] = true;
  }

  /** Why an item can't be bought right now, or undefined if it can. */
  whyNot(itemId: string): string | undefined {
    const def = getJokerDef(itemId);
    if (!def) return "غير موجود";
    if (def.kind === "joker") {
      if (this.state.jokerIds.includes(itemId)) return "عندك";
      if (this.state.jokerIds.length >= MAX_JOKERS) return "الخانات مليانة";
    }
    if (itemId === "extra-life" && this.state.lives >= MAX_LIVES) return "أرواحك كاملة";
    if (this.state.gold < def.cost) return "ذهبك ما يكفي";
    return undefined;
  }

  canAfford(itemId: string): boolean {
    return this.whyNot(itemId) === undefined;
  }

  /** Buys a joker or consumable. Consumables act immediately. */
  buyJoker(itemId: string): void {
    const reason = this.whyNot(itemId);
    if (reason) throw new Error(`Cannot buy ${itemId}: ${reason}`);
    const def = getJokerDef(itemId)!;
    this.state.gold -= def.cost;
    if (def.kind === "joker") {
      this.state.jokerIds.push(itemId);
    } else if (itemId === "extra-life") {
      this.state.lives++;
    } else if (itemId === "shield") {
      this.state.shields++;
    }
    this.state.shopStock = this.state.shopStock.filter((id) => id !== itemId);
  }

  shopOffering(): string[] {
    return this.state.shopStock;
  }

  canReroll(): boolean {
    return this.state.gold >= this.state.rerollCost;
  }

  /** Pays for a fresh set of items; each reroll in the same visit costs more. */
  reroll(): void {
    if (!this.canReroll()) throw new Error("Not enough gold to reroll");
    this.state.gold -= this.state.rerollCost;
    this.state.rerollCost += REROLL_STEP;
    this.rollShop();
  }

  /** Picks SHOP_JOKER_SLOTS jokers the run doesn't own, weighted by rarity, plus one consumable. */
  private rollShop(): void {
    const rand = mulberry32(this.state.seed + this.state.currentIndex * 7919 + ++this.shopRolls * 104729);
    const pool = JOKER_CATALOG.filter((j) => !this.state.jokerIds.includes(j.id));
    const picks: string[] = [];
    while (picks.length < SHOP_JOKER_SLOTS && pool.length > 0) {
      const total = pool.reduce((sum, j) => sum + RARITY_WEIGHT[j.rarity], 0);
      let roll = rand() * total;
      const index = pool.findIndex((j) => (roll -= RARITY_WEIGHT[j.rarity]) < 0);
      const [picked] = pool.splice(index === -1 ? pool.length - 1 : index, 1);
      picks.push(picked.id);
    }
    const consumable = CONSUMABLE_CATALOG[Math.floor(rand() * CONSUMABLE_CATALOG.length)];
    this.state.shopStock = [...picks, consumable.id];
  }
}

export const runController = new RunController();
