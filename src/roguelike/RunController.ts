import { mulberry32 } from "../engine/rng";
import { generateMap } from "./mapgen";
import {
  CONSUMABLE_CATALOG,
  getJokerDef,
  JOKER_CATALOG,
  maxLevel,
  sellPrice,
  UPGRADE_CATALOG,
  upgradeCost,
  activeSynergies,
  type Rarity,
  type ShopItemDef,
} from "./jokers";
import { getOpponent, isWeakened, type OpponentDef } from "./opponents";
import { MAX_LIVES, type Blessing, type MapNode, type RunState } from "./types";

/** How often each rarity turns up in a shop slot. */
const RARITY_WEIGHT: Record<Rarity, number> = { common: 60, rare: 32, legendary: 8 };
/** Treasury joker: 1 gold per 10 held, capped by level. */
const TREASURY_CAP = [5, 8, 12];
/** زبون مميز: everything in the shop costs this much. */
const VIP_DISCOUNT = 0.85;
/** The دفعة consumable: start the next match this far ahead. */
const BOOST_POINTS = 10;
/** Rewards after a match: rarer after the elite. */
const REWARD_RARITY: Record<"match" | "elite", Record<Rarity, number>> = {
  match: { common: 55, rare: 35, legendary: 10 },
  elite: { common: 15, rare: 55, legendary: 30 },
};
/** الحوت's treasure gift. */
export const BLESSING_GOLD = 60;
/** Jokers whose worth comes from the rest of your row. */
const BUILD_MAKERS = new Set(["wild", "chief", "maestro", "copycat"]);

export interface MatchOutcome {
  /** A shield took the hit, so no life was lost. */
  shieldUsed: boolean;
  /** Gold paid for the win: the node's reward plus الراتب. */
  goldEarned: number;
}

/**
 * Owns the run state (map position, lives, gold, jokers, upgrades) across nodes.
 * A single shared instance — MapScene and TableScene both import it directly
 * rather than passing the whole state through Phaser scene data.
 */
class RunController {
  private state: RunState = withBlessing(generateMap(Date.now()));
  private shopRolls = 0;

  startNewRun(seed: number = Date.now()): void {
    this.state = withBlessing(generateMap(seed));
    this.shopRolls = 0;
  }

  /** Takes one of الحوت's gifts (by its place in the offer). */
  takeBlessing(index: number): void {
    const offer = this.state.blessing?.[index];
    if (!offer) throw new Error(`No blessing ${index}`);
    for (const id of offer.items) this.grant(id);
    this.state.gold += offer.gold;
    this.state.lives = Math.max(1, this.state.lives - offer.lifeCost);
    this.state.blessing = undefined;
  }

  /** Who a fight node is played against, and whether your jokers have weakened them. */
  opponentFor(node: MapNode): { def: OpponentDef; weak: boolean } | undefined {
    const def = getOpponent(node.opponent);
    if (!def) return undefined;
    const families = this.state.jokerIds.flatMap((id) => getJokerDef(id)?.tags ?? []);
    return { def, weak: isWeakened(def, families) };
  }

  getState(): Readonly<RunState> {
    return this.state;
  }

  /** An owned joker's level, or a bought run upgrade's level; 0 if neither. */
  levelOf(itemId: string): number {
    return this.state.jokerLevels[itemId] ?? (this.state.jokerIds.includes(itemId) ? 1 : (this.state.upgrades[itemId] ?? 0));
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

  /** The دفعة bonus for the match about to start; it's used up by asking. */
  takeMatchBoost(): number {
    const boost = this.state.nextMatchBoost;
    this.state.nextMatchBoost = 0;
    return boost;
  }

  private payInterest(): void {
    const lvl = this.state.jokerLevels["treasury"] ?? 0;
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
    let goldEarned = 0;

    if (won) {
      goldEarned = node.reward + this.state.salary;
      this.state.gold += goldEarned;
      if (node.type === "boss") {
        this.state.over = true;
        this.state.won = true;
      } else {
        this.rollRewards(node.type === "elite");
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
    return { shieldUsed, goldEarned };
  }

  /** Gold picked up mid-match (e.g. from a joker). */
  addGold(amount: number): void {
    this.state.gold += amount;
  }

  /** Called once the player is done shopping at the current (shop) node. */
  leaveShopNode(): void {
    this.state.cleared[this.state.currentIndex] = true;
  }

  private discount(): number {
    return this.state.upgrades["vip"] ? VIP_DISCOUNT : 1;
  }

  /** What an item costs right now: a new joker, a level of one you own, a consumable, or an upgrade. */
  priceOf(itemId: string): number {
    const def = getJokerDef(itemId);
    if (!def) return Infinity;
    const lvl = this.levelOf(itemId);
    let base = def.cost;
    if (def.kind === "joker" && lvl > 0) base = upgradeCost(def, lvl);
    if (def.kind === "upgrade") base = def.costs?.[lvl] ?? Infinity;
    return Math.round(base * this.discount());
  }

  /** Why an item can't be bought right now, or undefined if it can. */
  whyNot(itemId: string): string | undefined {
    const def = getJokerDef(itemId);
    if (!def) return "غير موجود";
    const lvl = this.levelOf(itemId);
    if (def.kind === "joker") {
      if (lvl >= maxLevel(def)) return "أعلى مستوى";
      if (lvl === 0 && this.state.jokerIds.length >= this.state.maxJokers) return "الخانات مليانة";
    }
    if (def.kind === "upgrade" && lvl >= maxLevel(def)) return "مكتمل";
    if (itemId === "extra-life" && this.state.lives >= MAX_LIVES) return "أرواحك كاملة";
    if (itemId === "upgrade-ticket" && this.upgradeable().length === 0) return "ما عندك جوكر يترقى";
    if (this.state.gold < this.priceOf(itemId)) return "ذهبك ما يكفي";
    return undefined;
  }

  canAfford(itemId: string): boolean {
    return this.whyNot(itemId) === undefined;
  }

  private upgradeable(): string[] {
    return this.state.jokerIds.filter((id) => this.levelOf(id) < maxLevel(getJokerDef(id)!));
  }

  /** Buys a joker (or levels up one you own), a consumable, or a run upgrade. */
  buyJoker(itemId: string): void {
    const reason = this.whyNot(itemId);
    if (reason) throw new Error(`Cannot buy ${itemId}: ${reason}`);
    this.state.gold -= this.priceOf(itemId);
    this.grant(itemId);
    this.state.shopStock = this.state.shopStock.filter((id) => id !== itemId);
  }

  /** Gives an item's effect, however it was paid for. */
  private grant(itemId: string): void {
    const def = getJokerDef(itemId)!;
    if (def.kind === "joker") {
      const lvl = this.levelOf(itemId);
      if (!this.state.jokerIds.includes(itemId)) this.state.jokerIds.push(itemId);
      this.state.jokerLevels[itemId] = lvl + 1;
    } else if (def.kind === "upgrade") {
      this.state.upgrades[itemId] = (this.state.upgrades[itemId] ?? 0) + 1;
      this.applyUpgrade(itemId);
    } else if (itemId === "extra-life") {
      this.state.lives++;
    } else if (itemId === "shield") {
      this.state.shields++;
    } else if (itemId === "boost") {
      this.state.nextMatchBoost += BOOST_POINTS;
    } else if (itemId === "upgrade-ticket") {
      const pool = this.upgradeable();
      const pick = pool[Math.floor(mulberry32(this.state.seed + this.state.gold * 31 + pool.length)() * pool.length)];
      this.state.jokerLevels[pick] = this.levelOf(pick) + 1;
      this.state.lastTicket = pick;
    }
  }

  // ------------------------------------------------------------ rewards

  /** Why a reward can't be taken (a new joker with no free slot, or nothing to upgrade). */
  whyNotReward(itemId: string): string | undefined {
    const def = getJokerDef(itemId);
    if (!def) return "غير موجود";
    const lvl = this.levelOf(itemId);
    if (def.kind === "joker" && lvl === 0 && this.state.jokerIds.length >= this.state.maxJokers) return "الخانات مليانة — بِع جوكر أول";
    if ((def.kind === "joker" || def.kind === "upgrade") && lvl >= maxLevel(def)) return "أعلى مستوى";
    if (itemId === "extra-life" && this.state.lives >= MAX_LIVES) return "أرواحك كاملة";
    if (itemId === "upgrade-ticket" && this.upgradeable().length === 0) return "ما عندك جوكر يترقى";
    return undefined;
  }

  /** Takes one of the spoils for free. */
  takeReward(itemId: string): void {
    const pending = this.state.pendingRewards;
    if (!pending?.items.includes(itemId)) throw new Error(`${itemId} isn't on offer`);
    const reason = this.whyNotReward(itemId);
    if (reason) throw new Error(`Cannot take ${itemId}: ${reason}`);
    this.grant(itemId);
    this.state.pendingRewards = undefined;
  }

  /** Leaves the spoils for some gold instead. */
  skipReward(): void {
    const pending = this.state.pendingRewards;
    if (!pending) return;
    this.state.gold += pending.skipGold;
    this.state.pendingRewards = undefined;
  }

  /**
   * Why a reward suits the current run, if it does: it shares a family with jokers you own,
   * levels one of yours, or is a build-maker that pays for what you've gathered.
   */
  rewardHint(itemId: string): string | undefined {
    const def = getJokerDef(itemId);
    if (!def || def.kind !== "joker") return undefined;
    if (this.levelOf(itemId) > 0) return `ترقية لجوكرك`;
    const owned = new Set(this.state.jokerIds.flatMap((id) => getJokerDef(id)?.tags ?? []));
    const shared = def.tags.filter((t) => owned.has(t));
    if (shared.length) return `يناسب بناءك: ${shared.join("، ")}`;
    if (BUILD_MAKERS.has(itemId) && this.state.jokerIds.length >= 2) return "يكبر مع صفّك";
    return undefined;
  }

  /**
   * Three spoils, leaning towards the run you're building: jokers sharing a family with
   * yours count triple, levels for your own double, build-makers once you have a row.
   */
  private rollRewards(elite: boolean): void {
    const s = this.state;
    const rand = mulberry32(s.seed * 31 + s.currentIndex * 1009 + s.gold);
    const rarity = REWARD_RARITY[elite ? "elite" : "match"];
    const ownedTags = new Set(s.jokerIds.flatMap((id) => getJokerDef(id)?.tags ?? []));
    // Beaten opponents leave their secrets behind: their family is favoured, and an elite's
    // own joker is always on offer.
    const rival = getOpponent(s.nodes[s.currentIndex]?.opponent);
    const signature = elite && rival && !this.whyNotReward(rival.signature) ? rival.signature : undefined;
    const weight = (def: ShopItemDef): number => {
      if (this.whyNotReward(def.id) || def.id === signature) return 0;
      let w = def.kind === "joker" ? rarity[def.rarity] : def.kind === "upgrade" ? 14 : 10;
      if (def.kind === "joker" && rival && def.tags.includes(rival.family)) w *= 4;
      if (def.kind === "joker") {
        if (this.levelOf(def.id) > 0) w *= 2;
        else if (def.tags.some((t) => ownedTags.has(t))) w *= 3;
        if (BUILD_MAKERS.has(def.id) && s.jokerIds.length >= 2) w *= 2;
        // A build-maker is worth more once your families are growing.
        if (def.id === "maestro" && activeSynergies(s.jokerIds).some((x) => x.tier)) w *= 2;
      }
      return w;
    };
    const pool = [...JOKER_CATALOG, ...UPGRADE_CATALOG, ...CONSUMABLE_CATALOG].map((def) => ({ def, w: weight(def) })).filter((x) => x.w > 0);
    const items: string[] = signature ? [signature] : [];
    while (items.length < 3 && pool.length > 0) {
      const total = pool.reduce((n, x) => n + x.w, 0);
      let roll = rand() * total;
      const i = pool.findIndex((x) => (roll -= x.w) < 0);
      const [picked] = pool.splice(i === -1 ? pool.length - 1 : i, 1);
      items.push(picked.def.id);
    }
    s.pendingRewards = { items, skipGold: elite ? 15 : 8, elite };
  }

  /** Why this reward is here, if an opponent left it (shown on the reward screen). */
  rivalHint(itemId: string): string | undefined {
    const rival = getOpponent(this.state.nodes[this.state.currentIndex]?.opponent);
    if (!rival) return undefined;
    if (itemId === rival.signature) return `سر ${rival.name}`;
    return getJokerDef(itemId)?.tags.includes(rival.family) ? `من عائلة ${rival.name}` : undefined;
  }

  private applyUpgrade(itemId: string): void {
    const s = this.state;
    switch (itemId) {
      case "joker-slot":
        s.maxJokers++;
        break;
      case "shop-slot":
        s.shopSlots++;
        break;
      case "cheap-reroll":
        s.rerollBase = 1;
        s.rerollStep = 1;
        s.rerollCost = Math.min(s.rerollCost, 1);
        break;
      case "salary":
        s.salary += 4;
        break;
    }
  }

  /** What selling an owned joker would pay. */
  sellValue(jokerId: string): number {
    const def = getJokerDef(jokerId);
    const lvl = this.levelOf(jokerId);
    return def && lvl > 0 && def.kind === "joker" ? sellPrice(def, lvl) : 0;
  }

  /** Sells an owned joker for half its worth, freeing its slot. */
  sellJoker(jokerId: string): void {
    const value = this.sellValue(jokerId);
    if (!value) throw new Error(`You don't own ${jokerId}`);
    this.state.gold += value;
    this.state.jokerIds = this.state.jokerIds.filter((id) => id !== jokerId);
    delete this.state.jokerLevels[jokerId];
  }

  /** Moves an owned joker one place along the row (−1 = to the right). Order matters to النسخة. */
  moveJoker(jokerId: string, delta: -1 | 1): void {
    const ids = this.state.jokerIds;
    const i = ids.indexOf(jokerId);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
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
    this.state.rerollCost += this.state.rerollStep;
    this.rollShop();
  }

  /**
   * Fills the shelf: `shopSlots` jokers weighted by rarity — new ones and levels for ones you
   * own — then one consumable and one run upgrade you haven't maxed.
   */
  private rollShop(): void {
    const rand = mulberry32(this.state.seed + this.state.currentIndex * 7919 + ++this.shopRolls * 104729);
    const pool = JOKER_CATALOG.filter((j) => this.levelOf(j.id) < maxLevel(j));
    const picks: string[] = [];
    while (picks.length < this.state.shopSlots && pool.length > 0) {
      const total = pool.reduce((sum, j) => sum + RARITY_WEIGHT[j.rarity], 0);
      let roll = rand() * total;
      const index = pool.findIndex((j) => (roll -= RARITY_WEIGHT[j.rarity]) < 0);
      const [picked] = pool.splice(index === -1 ? pool.length - 1 : index, 1);
      picks.push(picked.id);
    }
    const consumable = CONSUMABLE_CATALOG[Math.floor(rand() * CONSUMABLE_CATALOG.length)];
    const upgrades = UPGRADE_CATALOG.filter((u) => this.levelOf(u.id) < maxLevel(u));
    const upgrade = upgrades.length > 0 ? [upgrades[Math.floor(rand() * upgrades.length)].id] : [];
    this.state.shopStock = [...picks, consumable.id, ...upgrade];
  }
}

export const runController = new RunController();

/**
 * الحوت: four gifts before the first node — a rare joker, two commons from one family, a
 * pile of gold, or a legendary joker that costs a life.
 */
function withBlessing(state: RunState): RunState {
  const rand = mulberry32(state.seed * 7 + 13);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const jokers = JOKER_CATALOG.filter((d) => d.kind === "joker");
  const rare = pick(jokers.filter((d) => d.rarity === "rare"));
  const legendary = pick(jokers.filter((d) => d.rarity === "legendary"));
  const commons = jokers.filter((d) => d.rarity === "common");
  const families = [...new Set(commons.flatMap((d) => d.tags))].filter((t) => commons.filter((d) => d.tags.includes(t)).length >= 2);
  const family = pick(families);
  const pair = commons.filter((d) => d.tags.includes(family));
  const first = pick(pair);
  const second = pick(pair.filter((d) => d.id !== first.id));
  const offers: Blessing[] = [
    { kind: "rare", items: [rare.id], gold: 0, lifeCost: 0 },
    { kind: "pair", items: [first.id, second.id], gold: 0, lifeCost: 0 },
    { kind: "gold", items: [], gold: BLESSING_GOLD, lifeCost: 0 },
    { kind: "cursed", items: [legendary.id], gold: 0, lifeCost: 1 },
  ];
  return { ...state, blessing: offers };
}
