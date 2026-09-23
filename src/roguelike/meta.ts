import { JOKER_CATALOG } from "./jokers";
import type { RunState } from "./types";

/**
 * Meta progression ("الديوانية"): what carries over between runs. Glory (المجد) is earned
 * at the end of every run, won or lost, and spent on permanent upgrades and on unlocking
 * the advanced jokers so they can start turning up in shops.
 */

export interface MetaUpgradeDef {
  id: string;
  name: string;
  icon: string;
  /** What each level gives; `costs[i]` buys level i + 1. */
  levels: string[];
  costs: number[];
}

export const META_UPGRADES: MetaUpgradeDef[] = [
  { id: "start-life", name: "نفس طويل", icon: "❤️", levels: ["+1 روح في بداية كل رن", "+2 روح"], costs: [15, 30] },
  {
    id: "start-gold",
    name: "رأس مال",
    icon: "💰",
    levels: ["تبدأ الرن بـ 10 ذهب", "تبدأ بـ 20 ذهب", "تبدأ بـ 35 ذهب"],
    costs: [10, 20, 35],
  },
  { id: "joker-slot", name: "جيب زيادة", icon: "🎒", levels: ["+1 خانة جوكر (5 بدل 4)"], costs: [40] },
  { id: "shop-slot", name: "بسطة أكبر", icon: "🛒", levels: ["المتجر يعرض 4 جوكرز بدل 3"], costs: [30] },
  { id: "cheap-reroll", name: "بياع صاحبك", icon: "🎲", levels: ["تغيير البضاعة يبدأ بـ 2 ذهب بدل 5"], costs: [15] },
  { id: "starter-joker", name: "هدية البداية", icon: "🎁", levels: ["تبدأ كل رن بجوكر عادي عشوائي"], costs: [30] },
];

export interface MetaProfile {
  glory: number;
  totalGlory: number;
  upgrades: Record<string, number>;
  unlocked: string[];
  runs: number;
  wins: number;
  bestFloor: number;
}

const STORAGE_KEY = "bloot:meta:v1";

function emptyProfile(): MetaProfile {
  return { glory: 0, totalGlory: 0, upgrades: {}, unlocked: [], runs: 0, wins: 0, bestFloor: 0 };
}

/** Storage that survives a private window or a test runner with no localStorage. */
function storage(): Pick<Storage, "getItem" | "setItem"> | undefined {
  try {
    return typeof localStorage !== "undefined" ? localStorage : undefined;
  } catch {
    return undefined;
  }
}

class MetaController {
  private profile: MetaProfile = this.load();

  private load(): MetaProfile {
    try {
      const raw = storage()?.getItem(STORAGE_KEY);
      if (raw) return { ...emptyProfile(), ...JSON.parse(raw) };
    } catch {
      /* corrupt or unavailable storage: start fresh */
    }
    return emptyProfile();
  }

  private save(): void {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      /* private mode / quota: progress just won't persist */
    }
  }

  /** For tests: forget everything. */
  reset(): void {
    this.profile = emptyProfile();
    this.save();
  }

  getProfile(): Readonly<MetaProfile> {
    return this.profile;
  }

  level(upgradeId: string): number {
    return this.profile.upgrades[upgradeId] ?? 0;
  }

  isUnlocked(jokerId: string): boolean {
    const def = JOKER_CATALOG.find((j) => j.id === jokerId);
    return !!def && (def.unlockCost === 0 || this.profile.unlocked.includes(jokerId));
  }

  /** Why an upgrade can't be bought right now, or undefined if it can. */
  whyNotUpgrade(upgradeId: string): string | undefined {
    const def = META_UPGRADES.find((u) => u.id === upgradeId);
    if (!def) return "غير موجود";
    const lvl = this.level(upgradeId);
    if (lvl >= def.costs.length) return "مكتمل";
    if (this.profile.glory < def.costs[lvl]) return "مجدك ما يكفي";
    return undefined;
  }

  buyUpgrade(upgradeId: string): void {
    const reason = this.whyNotUpgrade(upgradeId);
    if (reason) throw new Error(`Cannot buy ${upgradeId}: ${reason}`);
    const def = META_UPGRADES.find((u) => u.id === upgradeId)!;
    this.profile.glory -= def.costs[this.level(upgradeId)];
    this.profile.upgrades[upgradeId] = this.level(upgradeId) + 1;
    this.save();
  }

  whyNotUnlock(jokerId: string): string | undefined {
    const def = JOKER_CATALOG.find((j) => j.id === jokerId);
    if (!def) return "غير موجود";
    if (this.isUnlocked(jokerId)) return "مفتوح";
    if (this.profile.glory < def.unlockCost) return "مجدك ما يكفي";
    return undefined;
  }

  unlock(jokerId: string): void {
    const reason = this.whyNotUnlock(jokerId);
    if (reason) throw new Error(`Cannot unlock ${jokerId}: ${reason}`);
    this.profile.glory -= JOKER_CATALOG.find((j) => j.id === jokerId)!.unlockCost;
    this.profile.unlocked.push(jokerId);
    this.save();
  }

  /** Banks a finished run and returns the glory it earned. */
  recordRun(run: Readonly<RunState>): number {
    const earned = gloryForRun(run);
    this.profile.glory += earned;
    this.profile.totalGlory += earned;
    this.profile.runs++;
    if (run.won) this.profile.wins++;
    this.profile.bestFloor = Math.max(this.profile.bestFloor, run.cleared.filter(Boolean).length);
    this.save();
    return earned;
  }

  /** Starting conditions for a new run, from the permanent upgrades. */
  runSetup(): { lives: number; gold: number; maxJokers: number; shopSlots: number; rerollBase: number; starterJoker: boolean } {
    return {
      lives: this.level("start-life"),
      gold: [0, 10, 20, 35][this.level("start-gold")],
      maxJokers: this.level("joker-slot"),
      shopSlots: this.level("shop-slot"),
      rerollBase: this.level("cheap-reroll") ? 2 : 5,
      starterJoker: this.level("starter-joker") > 0,
    };
  }
}

/** Glory for a finished run: every match node cleared counts, more for elites and the boss. */
export function gloryForRun(run: Readonly<RunState>): number {
  let glory = 2; // just for playing
  run.nodes.forEach((node, i) => {
    if (!run.cleared[i] || node.type === "shop") return;
    if (!run.nodeWon[i]) {
      glory += 1; // a loss still teaches you something
      return;
    }
    glory += node.type === "boss" ? 15 : node.type === "elite" ? 8 : 4;
  });
  if (run.won) glory += 10;
  glory += Math.floor(run.gold / 20);
  return glory;
}

export const metaController = new MetaController();
