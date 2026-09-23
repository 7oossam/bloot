import { mulberry32 } from "../engine/rng";
import { generateMap } from "./mapgen";
import {
  CONSUMABLE_CATALOG,
  getJokerDef,
  JOKER_CATALOG,
  maxLevel,
  shopDiscount,
  upgradeCost,
  type Rarity,
} from "./jokers";
import { metaController } from "./meta";
import { MAX_LIVES, REROLL_STEP, type MapNode, type RunState } from "./types";

/** How often each rarity turns up in a shop slot. */
const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, legendary: 10 };
/** Treasury joker: 1 gold per 10 held, capped by level. */
const TREASURY_CAP = [5, 8, 12];

export interface MatchOutcome {
  /** A shield took the hit, so no life was lost. */
  shieldUsed: boolean;
  /** Set when this match ended the run: glory banked into الديوانية. */
  gloryEarned?: number;
}

/**
 * Owns the meta-run state (map position, lives, gold, jokers) across nodes.
 * A single shared instance — MapScene and TableScene both import it directly
 * rather than passing the whole state through Phaser scene data.
 */
class RunController {
  private state: RunState = this.freshRun(Date.now());
  private shopRolls = 0;

  /** A new run with the permanent الديوانية upgrades applied. */
  private freshRun(seed: number): RunState {
    const state = generateMap(seed);
    const setup = metaController.runSetup();
    state.lives += setup.lives;
    state.gold += setup.gold;
    state.maxJokers += setup.maxJokers;
    state.shopSlots += setup.shopSlots;
    state.rerollBase = setup.rerollBase;
    state.rerollCost = setup.rerollBase;
    if (setup.starterJoker) {
      const commons = JOKER_CATALOG.filter((j) => j.rarity === "common" && metaController.isUnlocked(j.id));
      const pick = commons[Math.floor(mulberry32(seed)() * commons.length)];
      state.jokerIds.push(pick.id);
      state.jokerLevels[pick.id] = 1;
    }
    return state;
  }

  startNewRun(seed: number = Date.now()): void {
    this.state = this.freshRun(seed);
    this.shopRolls = 0;
  }

  getState(): Readonly<RunState> {
    return this.state;
  }

  levelOf(jokerId: string): number {
    return this.state.jokerLevels[jokerId] ?? 0;
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
      this.state.rerollCost = this.state.rerollBase;
      this.payInterest();
      this.rollShop();
    }
  }

  private payInterest(): void {
    const lvl = this.levelOf("treasury");
    this.state.lastInterest = 0;
    if (!lvl) return;
    const interest = Math.min(Math.floor(this.state.gold / 10), TREASURY_CAP[lvl - 1]);
    this.state.gold += interest;
    this.state.lastInterest = interest;
  }

  /** Called once a match/elite/boss node's GameController match finishes. */
  resolveMatchNode(won: boolean): MatchOutcome {
    const node = this.state.nodes[this.state.currentIndex];
    this.state.cleared[this.state.currentIndex] = true;
    this.state.nodeWon[this.state.currentIndex] = won;
    let shieldUsed = false;

    if (won) {
      this.state.gold += node.reward;
      if (node.type === "boss") {
        this.state.over = true;
        this.state.won = true;
      }
    } else if (this.state.shields > 0) {
      this.state.shields--;
      shieldUsed = true;
    } else {
      this.state.lives--;
      if (this.state.lives <= 0) {
        this.state.over = true;
        this.state.won = false;
      }
    }

    if (this.state.over && this.state.gloryEarned === undefined) {
      this.state.gloryEarned = metaController.recordRun(this.state);
    }
    return { shieldUsed, gloryEarned: this.state.over ? this.state.gloryEarned : undefined };
  }

  /** Gold picked up mid-match (e.g. from a joker). */
  addGold(amount: number): void {
    this.state.gold += amount;
  }

  /** Called once the player is done shopping at the current (shop) node. */
  leaveShopNode(): void {
    this.state.cleared[this.state.currentIndex] = true;
  }

  /** What an item costs right now: a new joker, an upgrade of one you own, or a consumable. */
  priceOf(itemId: string): number {
    const def = getJokerDef(itemId);
    if (!def) return Infinity;
    const lvl = this.levelOf(itemId);
    const base = def.kind === "joker" && lvl > 0 ? upgradeCost(def, lvl) : def.cost;
    return Math.round(base * shopDiscount(this.state.jokerIds));
  }

  /** Why an item can't be bought right now, or undefined if it can. */
  whyNot(itemId: string): string | undefined {
    const def = getJokerDef(itemId);
    if (!def) return "غير موجود";
    if (def.kind === "joker") {
      const lvl = this.levelOf(itemId);
      if (lvl >= maxLevel(def)) return "أعلى مستوى";
      if (lvl === 0 && this.state.jokerIds.length >= this.state.maxJokers) return "الخانات مليانة";
    }
    if (itemId === "extra-life" && this.state.lives >= MAX_LIVES) return "أرواحك كاملة";
    if (this.state.gold < this.priceOf(itemId)) return "ذهبك ما يكفي";
    return undefined;
  }

  canAfford(itemId: string): boolean {
    return this.whyNot(itemId) === undefined;
  }

  /** Buys a joker (or levels up one you own) or a consumable. Consumables act immediately. */
  buyJoker(itemId: string): void {
    const reason = this.whyNot(itemId);
    if (reason) throw new Error(`Cannot buy ${itemId}: ${reason}`);
    const def = getJokerDef(itemId)!;
    this.state.gold -= this.priceOf(itemId);
    if (def.kind === "joker") {
      const lvl = this.levelOf(itemId);
      if (lvl === 0) this.state.jokerIds.push(itemId);
      this.state.jokerLevels[itemId] = lvl + 1;
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

  /**
   * Fills the shelf: `shopSlots` jokers weighted by rarity — unlocked ones you don't own yet,
   * plus upgrades for ones you own below max level — and one consumable.
   */
  private rollShop(): void {
    const rand = mulberry32(this.state.seed + this.state.currentIndex * 7919 + ++this.shopRolls * 104729);
    const pool = JOKER_CATALOG.filter((j) => {
      if (!metaController.isUnlocked(j.id)) return false;
      const lvl = this.levelOf(j.id);
      return lvl === 0 || lvl < maxLevel(j);
    });
    const picks: string[] = [];
    while (picks.length < this.state.shopSlots && pool.length > 0) {
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
