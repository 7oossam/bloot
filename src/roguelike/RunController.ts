import { mulberry32 } from "../engine/rng";
import { ACTS, generateAct, generateMap } from "./mapgen";
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
import { getEvent, type EventDef, type EventRun } from "./events";
import { getOpponent, type OpponentDef } from "./opponents";
import { getPartner } from "./partners";
import { CROWN_TARGET, VOWS, rollBlessings, SCHOOL_PENALTY, TREASURE_GOLD, WAVE_HEAD_START } from "./blessings";
import { getCharacter, inCharacterPool } from "./characters";
import { CURSES, DEBT_PER_LOSS, ENVY_HEAD_START, getCurse, UNCURSE_PRICE } from "./curses";
import { MAX_STAMPS_PER_CARD, rollStampOffers, stampRules, type StampId, type StampRules } from "./stamps";
import type { MatchOptions } from "../game/GameController";
import { MAX_LIVES, type MapNode, type RunState } from "./types";

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
/** Jokers whose worth comes from the rest of your row. */
const BUILD_MAKERS = new Set(["wild", "chief", "maestro", "copycat"]);

export interface MatchOutcome {
  /** A shield took the hit, so no life was lost. */
  shieldUsed: boolean;
  /** The run's عهد this match: how far you got, and the تحفة it gave if it was kept. */
  vow?: { count: number; need: number; label: string; gift?: string };
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
    if (this.testKit) this.giveTestKit(this.testKit);
  }

  private testKit?: string;

  /**
   * A playtest kit, opened from the page's address (?loop=cut): the run starts holding one
   * joker loop so the player can feel it without hunting for it in shops.
   */
  giveTestKit(kit: string): void {
    const kits: Record<string, Array<[string, number]>> = {
      // الحلقة: القطّاع cuts and trades for their best trump, الختم seals the next one, الحكم الحر buys
      // hokum in any suit, and صاحب الكلمة lets you speak first — your hokum can't be taken as sun.
      cut: [["cutter", 2], ["burn", 1], ["free-hokum", 1], ["first-word", 2]],
    };
    const items = kits[kit];
    if (!items) return;
    this.testKit = kit;
    for (const [id, level] of items) for (let i = this.levelOf(id); i < level; i++) this.grant(id);
  }

  /** Takes one of الحوت's blessings (by its place in the offer); what's instant happens now. */
  takeBlessing(index: number): void {
    const s = this.state;
    const id = s.blessing?.[index];
    if (!id) throw new Error(`No blessing ${index}`);
    const rand = mulberry32(s.seed * 23 + 5);
    const jokers = JOKER_CATALOG.filter((d) => d.kind === "joker" && !s.jokerIds.includes(d.id) && this.inPool(d));
    // الراوي's gift between maps: instant, and it doesn't join your وصايا.
    if (id.startsWith("act-")) {
      if (id === "act-rest") s.lives = Math.min(MAX_LIVES, s.lives + 2);
      if (id === "act-gold") s.gold += 60;
      if (id === "act-shield") s.shields += 2;
      if (id === "act-rare") {
        const own = new Set(getCharacter(s.character)?.tags ?? []);
        const pool = jokers.filter((d) => d.rarity === "rare" && (own.size === 0 || d.tags.some((t) => own.has(t))));
        const from = pool.length ? pool : jokers.filter((d) => d.rarity === "rare");
        const pick = from[Math.floor(rand() * from.length)];
        if (pick) this.grant(pick.id);
      }
      s.blessing = undefined;
      return;
    }
    switch (id) {
      case "heart":
        s.lives = Math.min(MAX_LIVES, s.lives + 1);
        break;
      case "treasure":
        s.gold += TREASURE_GOLD;
        s.shopSlots = Math.max(1, s.shopSlots - 1);
        break;
      case "crown": {
        const pool = jokers.filter((d) => d.rarity === "legendary");
        this.grant(pool[Math.floor(rand() * pool.length)].id);
        break;
      }
      case "school": {
        const commons = jokers.filter((d) => d.rarity === "common");
        const families = [...new Set(commons.flatMap((d) => d.tags))].filter((t) => commons.filter((d) => d.tags.includes(t)).length >= 2);
        const family = families[Math.floor(rand() * families.length)];
        commons.filter((d) => d.tags.includes(family)).sort(() => rand() - 0.5).slice(0, 3).forEach((d) => this.grant(d.id));
        s.nextMatchPenalty += SCHOOL_PENALTY;
        break;
      }
    }
    s.blessings.push(id);
    s.blessing = undefined;
  }

  /**
   * Picks who you are this run: you start holding the character's rule-breaker, and الراوي's
   * offer is rolled again so its third choice is the character's own.
   */
  chooseCharacter(id: string): void {
    const def = getCharacter(id);
    if (!def) throw new Error(`No character ${id}`);
    const s = this.state;
    s.character = id;
    for (const [jokerId, level] of def.start) for (let i = this.levelOf(jokerId); i < level; i++) this.grant(jokerId);
    if (s.blessing) s.blessing = rollBlessings(mulberry32(s.seed * 7 + 13), id);
  }

  /** Whether a joker can turn up for this run's character (its own, or a general one). */
  private inPool(def: ShopItemDef): boolean {
    return def.kind !== "joker" || inCharacterPool(def.tags, this.state.character);
  }

  /** Picks who sits across from you this run (before الحوت). */
  choosePartner(id: string): void {
    if (!getPartner(id)) throw new Error(`No partner ${id}`);
    this.state.partner = id;
  }

  hasBlessing(id: string): boolean {
    return this.state.blessings.includes(id);
  }

  /** A fight's target, with تاج الحوت's price on it. */
  matchTargetFor(node: MapNode): number | undefined {
    return node.matchTarget === undefined ? undefined : node.matchTarget + (this.hasBlessing("crown") ? CROWN_TARGET : 0);
  }

  /** What the run's blessings add to a match's options. */
  applyBlessings(o: MatchOptions): void {
    const partner = getPartner(this.state.partner);
    if (partner) {
      o.partner = partner.options;
      o.partnerLabel = partner.name;
    }
    // النحس.
    const curses = this.state.curses ?? [];
    if (curses.includes("debt")) o.curseDebt = DEBT_PER_LOSS;
    if (curses.includes("envy")) o.headStart = { ...o.headStart, 1: (o.headStart?.[1] ?? 0) + ENVY_HEAD_START };
    if (this.hasBlessing("wave")) o.headStart = { ...o.headStart, 0: (o.headStart?.[0] ?? 0) + WAVE_HEAD_START };
    if (this.hasBlessing("projects")) {
      o.projectMultiplier = (o.projectMultiplier ?? 1) * 2;
      o.noSun = true;
    }
  }

  /** Who a fight node is played against. */
  opponentFor(node: MapNode): OpponentDef | undefined {
    return getOpponent(node.opponent);
  }

  /** المعطّل: your strongest joker — the rarest, then the highest level, then the first bought. */
  strongestJoker(): string | undefined {
    const rank = { common: 0, rare: 1, legendary: 2 } as const;
    const score = (id: string) => rank[getJokerDef(id)?.rarity ?? "common"] * 10 + this.levelOf(id);
    return [...this.state.jokerIds].sort((a, b) => score(b) - score(a))[0];
  }

  getState(): Readonly<RunState> {
    return this.state;
  }

  /** An owned joker's level, or a bought run upgrade's level; 0 if neither. */
  levelOf(itemId: string): number {
    return this.state.jokerLevels[itemId] ?? (this.state.jokerIds.includes(itemId) ? 1 : (this.state.upgrades[itemId] ?? 0));
  }

  /**
   * The nodes the player can walk into next: the bottom row at the start, then the ones the
   * current node leads to once it's done. None once the run is over. (الحوت's gift is taken
   * first on the map screen.)
   */
  getAvailableNodes(): MapNode[] {
    const s = this.state;
    if (s.over) return [];
    if (s.currentIndex === -1) return s.nodes.filter((n) => n.floor === 0);
    if (!s.cleared[s.currentIndex]) return [];
    const next = new Set(s.nodes[s.currentIndex].next);
    return s.nodes.filter((n) => next.has(n.id));
  }

  /** The first node you could walk into (the leftmost), for callers that don't choose. */
  getAvailableNode(): MapNode | undefined {
    return this.getAvailableNodes()[0];
  }

  enterNode(nodeId: string): void {
    const index = this.state.nodes.findIndex((n) => n.id === nodeId);
    const node = this.state.nodes[index];
    if (!node || !this.getAvailableNodes().some((n) => n.id === nodeId)) {
      throw new Error(`Node ${nodeId} is not reachable from here`);
    }
    this.state.currentIndex = index;
    if (node.type === "shop") {
      this.state.rerollCost = this.state.rerollBase;
      this.payInterest();
      this.rollShop();
    }
  }

  /** How far ahead the opponents start the match about to begin (a ديوانية's price); used up by asking. */
  takeMatchPenalty(): number {
    const penalty = this.state.nextMatchPenalty;
    this.state.nextMatchPenalty = 0;
    return penalty;
  }

  /** What's happening at a ديوانية node. */
  eventFor(node: MapNode): EventDef | undefined {
    return getEvent(node.event, this.state.character);
  }

  /** Why a ديوانية choice can't be picked, if it can't. */
  whyNotEventOption(index: number): string | undefined {
    const event = getEvent(this.state.nodes[this.state.currentIndex]?.event, this.state.character);
    return event?.options[index]?.blocked?.(this.eventRun());
  }

  /** Makes a ديوانية choice at the current node; returns what happened. */
  chooseEventOption(index: number): string {
    const node = this.state.nodes[this.state.currentIndex];
    const option = getEvent(node?.event, this.state.character)?.options[index];
    if (!option || node.type !== "diwaniya") throw new Error("No event choice here");
    const reason = this.whyNotEventOption(index);
    if (reason) throw new Error(reason);
    const text = option.apply(this.eventRun(), mulberry32(this.state.seed * 13 + this.state.currentIndex * 101 + this.state.gold));
    this.state.cleared[this.state.currentIndex] = true;
    return text;
  }

  /** The run as a ديوانية event sees it. */
  private eventRun(): EventRun {
    const s = this.state;
    const rand = mulberry32(s.seed * 17 + s.currentIndex * 7 + s.jokerIds.length);
    const cheapest = () => {
      const owned = s.jokerIds.filter((id) => !this.isStarter(id)).map((id) => ({ id, value: this.sellValue(id) })).sort((a, b) => a.value - b.value);
      return owned[0];
    };
    return {
      gold: () => s.gold,
      addGold: (amount) => (s.gold = Math.max(0, s.gold + amount)),
      addLife: () => (s.lives < MAX_LIVES ? (s.lives++, true) : false),
      lives: () => s.lives,
      loseLife: () => void (s.lives = Math.max(1, s.lives - 1)),
      addShield: () => void s.shields++,
      boostNext: (points) => void (s.nextMatchBoost += points),
      penalizeNext: (points) => void (s.nextMatchPenalty += points),
      grantRandomJoker: (rarity) => {
        const pool = JOKER_CATALOG.filter((d) => d.kind === "joker" && d.rarity === rarity && !s.jokerIds.includes(d.id) && this.inPool(d));
        if (pool.length === 0) return undefined;
        const pick = pool[Math.floor(rand() * pool.length)];
        this.grant(pick.id);
        return pick.name;
      },
      grantOwnJoker: () => {
        const own = new Set(getCharacter(s.character)?.tags ?? []);
        const mine = JOKER_CATALOG.filter((d) => d.kind === "joker" && d.tags.some((t) => own.has(t)) && !this.isStarter(d.id));
        const fresh = mine.filter((d) => !s.jokerIds.includes(d.id));
        const pick = fresh.length ? fresh[Math.floor(rand() * fresh.length)] : mine.find((d) => this.upgradeable().includes(d.id));
        if (!pick) return undefined;
        if (s.jokerIds.includes(pick.id)) s.jokerLevels[pick.id] = this.levelOf(pick.id) + 1;
        else this.grant(pick.id);
        return pick.name;
      },
      offerStamps: (count, title, first) => {
        const rolled = rollStampOffers(s.seed * 59 + s.currentIndex * 13 + s.gold, count + 1).filter((x) => x !== first);
        const stamps = first ? [first, ...rolled].slice(0, count) : rolled.slice(0, count);
        s.pendingRewards = { items: [], stamps, skipGold: 0, elite: false, title };
      },
      growCards: () => Object.values(s.stamps ?? {}).filter((ids) => ids.includes("grow")).length,
      stampCard: (stamp, cardId) => {
        s.stamps = s.stamps ?? {};
        const now = s.stamps[cardId] ?? [];
        if (now.includes(stamp)) return false;
        s.stamps[cardId] = [...now, stamp].slice(-MAX_STAMPS_PER_CARD);
        return true;
      },
      growAll: () => {
        const cards = Object.entries(s.stamps ?? {}).filter(([, ids]) => ids.includes("grow")).map(([c]) => c);
        for (const c of cards) this.addStampStar(c);
        return cards.length;
      },
      addCurse: () => this.addCurse(rand),
      removeCurse: () => this.removeCurse(),
      curseCount: () => (s.curses ?? []).length,
      canUpgrade: () => this.upgradeable().length > 0,
      upgradeRandomJoker: () => {
        const pool = this.upgradeable();
        if (pool.length === 0) return undefined;
        const pick = pool[Math.floor(rand() * pool.length)];
        s.jokerLevels[pick] = this.levelOf(pick) + 1;
        const def = getJokerDef(pick)!;
        return def.name;
      },
      cheapestJoker: () => {
        const c = cheapest();
        return c ? { name: getJokerDef(c.id)!.name, value: c.value } : undefined;
      },
      sellCheapest: (times) => {
        const c = cheapest();
        if (!c) return undefined;
        const gold = c.value * times;
        s.jokerIds = s.jokerIds.filter((id) => id !== c.id);
        delete s.jokerLevels[c.id];
        s.gold += gold;
        const def = getJokerDef(c.id)!;
        return { name: def.name, gold };
      },
    };
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
  resolveMatchNode(won: boolean, stats?: { lowTricks: number; spadeTricks: number }): MatchOutcome {
    const node = this.state.nodes[this.state.currentIndex];
    this.state.cleared[this.state.currentIndex] = true;
    this.state.nodeWon[this.state.currentIndex] = won;
    let shieldUsed = false;
    let goldEarned = 0;
    const vow = stats ? this.checkVow(won, stats) : undefined;

    if (won) {
      const mult = (this.hasBlessing("catch") ? 1.5 : 1) * (getPartner(this.state.partner)?.goldMultiplier ?? 1);
      goldEarned = Math.round(node.reward * mult) + this.state.salary;
      this.state.gold += goldEarned;
      if (node.type === "boss" && this.state.act >= ACTS.length - 1) {
        this.state.over = true;
        this.state.won = true;
      } else if (node.type === "boss") {
        this.rollBossRewards();
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
    return { shieldUsed, goldEarned, vow };
  }

  /** The run's عهد after a match: kept if you won and your side took enough tricks its way. */
  private checkVow(won: boolean, stats: { lowTricks: number; spadeTricks: number }): MatchOutcome["vow"] {
    const s = this.state;
    const id = s.blessings.find((b) => VOWS[b]);
    // An عهد is kept once a night.
    if (!id || (s.vowsKept ?? 0) >= 1) return undefined;
    const v = VOWS[id];
    const need = v.need + v.step * (s.vowsKept ?? 0);
    const count = stats[v.stat];
    if (!won || count < need) return { count, need, label: v.label };
    s.vowsKept = (s.vowsKept ?? 0) + 1;
    // One of the character's own تحف you don't have yet — or a level on one you do.
    const own = new Set(getCharacter(s.character)?.tags ?? []);
    const mine = JOKER_CATALOG.filter((d) => d.kind === "joker" && d.tags.some((t) => own.has(t)));
    const rand = mulberry32(s.seed * 29 + s.currentIndex * 13 + (s.vowsKept ?? 0));
    const fresh = mine.filter((d) => !s.jokerIds.includes(d.id));
    const grow = mine.filter((d) => s.jokerIds.includes(d.id) && this.levelOf(d.id) < maxLevel(d));
    const pool = fresh.length ? fresh : grow;
    if (pool.length === 0) return { count, need, label: v.label };
    const pick = pool[Math.floor(rand() * pool.length)];
    this.grant(pick.id);
    return { count, need, label: v.label, gift: pick.name };
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
    }
    if (def.kind === "upgrade" && lvl >= maxLevel(def)) return "مكتمل";
    if (itemId === "extra-life" && this.state.lives >= MAX_LIVES) return "ساعات ليلك كاملة";
    if (itemId === "upgrade-ticket" && this.upgradeable().length === 0) return "ما عندك تحفة تترقى";
    if (this.state.gold < this.priceOf(itemId)) return "ريالاتك ما تكفي";
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
    if ((def.kind === "joker" || def.kind === "upgrade") && lvl >= maxLevel(def)) return "أعلى مستوى";
    if (itemId === "extra-life" && this.state.lives >= MAX_LIVES) return "ساعات ليلك كاملة";
    if (itemId === "upgrade-ticket" && this.upgradeable().length === 0) return "ما عندك تحفة تترقى";
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
    if (pending.boss) this.advanceAct();
  }

  /** Leaves the spoils for some gold instead. */
  skipReward(): void {
    const pending = this.state.pendingRewards;
    if (!pending) return;
    this.state.gold += pending.skipGold;
    this.state.pendingRewards = undefined;
    if (pending.boss) this.advanceAct();
  }

  /** A map's boss beaten: three legendary تحف to choose from (rares if the legendaries run out). */
  private rollBossRewards(): void {
    const s = this.state;
    const rand = mulberry32(s.seed * 41 + s.act * 97);
    const open = (rarity: string) => JOKER_CATALOG.filter((d) => d.kind === "joker" && d.rarity === rarity && !s.jokerIds.includes(d.id) && this.inPool(d));
    const pool = [...open("legendary")].sort(() => rand() - 0.5);
    const items = pool.slice(0, 3).map((d) => d.id);
    for (const d of open("rare").sort(() => rand() - 0.5)) if (items.length < 3) items.push(d.id);
    s.pendingRewards = { items, skipGold: 30, elite: true, boss: true };
  }

  /**
   * Through the next door: the next map, an hour of the night back, and الراوي's gift for the
   * new map (one of three, taken on the map screen).
   */
  advanceAct(): void {
    const s = this.state;
    if (s.act >= ACTS.length - 1) return;
    s.act++;
    s.nodes = generateAct(s.seed, s.act);
    s.currentIndex = -1;
    s.cleared = s.nodes.map(() => false);
    s.nodeWon = s.nodes.map(() => false);
    s.lives = Math.min(MAX_LIVES, s.lives + 1);
    const rand = mulberry32(s.seed * 53 + s.act);
    const gifts = ["act-rest", "act-rare", "act-gold", "act-shield"].sort(() => rand() - 0.5);
    s.blessing = gifts.slice(0, 3);
    s.actIntro = ACTS[s.act].name;
  }

  /**
   * Why a reward suits the current run, if it does: it shares a family with jokers you own,
   * levels one of yours, or is a build-maker that pays for what you've gathered.
   */
  rewardHint(itemId: string): string | undefined {
    const def = getJokerDef(itemId);
    if (!def || def.kind !== "joker") return undefined;
    if (this.levelOf(itemId) > 0) return `ترقية لتحفتك`;
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
    // A plain match pays in الوسوم; تحف come from the big مجالس (and the shop).
    const count = (this.hasBlessing("catch") ? 2 : 3) + (getPartner(s.partner)?.extraRewards ?? 0);
    if (!elite) {
      s.pendingRewards = { items: [], stamps: rollStampOffers(s.seed * 37 + s.currentIndex * 211 + s.gold, count), skipGold: 8, elite: false };
      return;
    }
    const rand = mulberry32(s.seed * 31 + s.currentIndex * 1009 + s.gold);
    const rarity = REWARD_RARITY[elite ? "elite" : "match"];
    const ownedTags = new Set(s.jokerIds.flatMap((id) => getJokerDef(id)?.tags ?? []));
    const weight = (def: ShopItemDef): number => {
      if (this.whyNotReward(def.id) || !this.inPool(def)) return 0;
      let w = def.kind === "joker" ? rarity[def.rarity] : def.kind === "upgrade" ? 14 : 10;
      if (def.kind === "joker") {
        if (this.levelOf(def.id) > 0) w *= 2;
        else if (def.tags.some((t) => ownedTags.has(t))) w *= 3;
        if (BUILD_MAKERS.has(def.id) && s.jokerIds.length >= 2) w *= 2;
        // A build-maker is worth more once your families are growing.
        if (def.id === "maestro" && activeSynergies(s.jokerIds).some((x) => x.tier)) w *= 2;
      }
      return w;
    };
    const pool = JOKER_CATALOG.filter((d) => d.kind === "joker").map((def) => ({ def, w: weight(def) })).filter((x) => x.w > 0);
    const items: string[] = [];
    while (items.length < count && pool.length > 0) {
      const total = pool.reduce((n, x) => n + x.w, 0);
      let roll = rand() * total;
      const i = pool.findIndex((x) => (roll -= x.w) < 0);
      const [picked] = pool.splice(i === -1 ? pool.length - 1 : i, 1);
      items.push(picked.def.id);
    }
    // At least one rare or legendary on every مجلس's offer.
    const rare = (id: string) => getJokerDef(id)?.rarity !== "common";
    if (items.length > 0 && !items.some(rare)) {
      const better = pool.filter((x) => x.def.rarity !== "common");
      if (better.length) items[items.length - 1] = better[Math.floor(rand() * better.length)].def.id;
    }
    s.pendingRewards = { items, skipGold: elite ? 15 : 8, elite };
  }

  /** Puts the chosen stamp on a card (a card holds two at most; a third pushes the oldest off). */
  applyStamp(stamp: StampId, cardId: string): void {
    const s = this.state;
    if (!s.pendingRewards?.stamps?.includes(stamp)) throw new Error(`${stamp} isn't on offer`);
    s.stamps = s.stamps ?? {};
    const now = (s.stamps[cardId] ?? []).filter((x) => x !== stamp);
    now.push(stamp);
    s.stamps[cardId] = now.slice(-MAX_STAMPS_PER_CARD);
    s.pendingRewards = undefined;
  }

  /** الكبّارة: a trick won with this card. */
  addStampStar(cardId: string): void {
    const s = this.state;
    s.stampStars = s.stampStars ?? {};
    s.stampStars[cardId] = (s.stampStars[cardId] ?? 0) + 1;
  }

  /** A نحس you don't have yet (random); its name, or undefined if you have them all. */
  addCurse(rand: () => number = mulberry32(this.state.seed * 71 + this.state.currentIndex * 5 + this.state.gold)): string | undefined {
    const s = this.state;
    const fresh = CURSES.filter((c) => !(s.curses ?? []).includes(c.id));
    if (!fresh.length) return undefined;
    const pick = fresh[Math.floor(rand() * fresh.length)];
    s.curses = [...(s.curses ?? []), pick.id];
    return pick.name;
  }

  /** Lifts a نحس (the given one, or the oldest); its name. */
  removeCurse(id?: string): string | undefined {
    const s = this.state;
    const at = id ? (s.curses ?? []).indexOf(id) : 0;
    const gone = s.curses?.[at];
    if (!gone) return undefined;
    s.curses = s.curses!.filter((_, i) => i !== at);
    return getCurse(gone)?.name;
  }

  /** At the دكّان: pay to lift a نحس. */
  buyUncurse(id: string): void {
    if (this.state.gold < UNCURSE_PRICE) throw new Error("ريالاتك ما تكفي");
    if (!this.removeCurse(id)) throw new Error(`No curse ${id}`);
    this.state.gold -= UNCURSE_PRICE;
  }

  /** Your stamps as the table needs them. */
  stampRules(): StampRules {
    return stampRules(this.state.stamps ?? {}, this.state.stampStars ?? {});
  }

  private applyUpgrade(itemId: string): void {
    const s = this.state;
    switch (itemId) {
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

  /** A joker the run's character starts with: it is the character, so it can't be sold. */
  isStarter(jokerId: string): boolean {
    return !!getCharacter(this.state.character)?.start.some(([id]) => id === jokerId);
  }

  /** What selling an owned joker would pay (nothing for the character's own rule). */
  sellValue(jokerId: string): number {
    if (this.isStarter(jokerId)) return 0;
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
    const pool = JOKER_CATALOG.filter((j) => this.levelOf(j.id) < maxLevel(j) && this.inPool(j));
    const picks: string[] = [];
    // الكساد (a نحس): one fewer on the shelf.
    const slots = Math.max(1, this.state.shopSlots - (this.state.curses?.includes("slump") ? 1 : 0));
    while (picks.length < slots && pool.length > 0) {
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

/** الحوت: three blessings to choose from before the first node. */
function withBlessing(state: RunState): RunState {
  return { ...state, blessing: rollBlessings(mulberry32(state.seed * 7 + 13)) };
}
