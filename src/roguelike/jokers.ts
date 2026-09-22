import type { MatchOptions } from "../game/GameController";

export interface JokerDef {
  id: string;
  name: string;
  description: string;
  cost: number;
}

/** A small first catalog — each effect hooks into a MatchOptions field GameController already accepts. */
export const JOKER_CATALOG: JokerDef[] = [
  {
    id: "head-start",
    name: "بداية قوية",
    description: "فريقك يبدأ كل مباراة متقدم بـ 15 نقطة.",
    cost: 25,
  },
  {
    id: "double-kaboot",
    name: "كوت مضاعف",
    description: "آخر أكلة بكل يد تسوي 20 نقطة بدل 10.",
    cost: 30,
  },
  {
    id: "giant-kaboot",
    name: "كوت العمالقة",
    description: "آخر أكلة بكل يد تسوي 30 نقطة بدل 10.",
    cost: 45,
  },
];

export function getJokerDef(id: string): JokerDef | undefined {
  return JOKER_CATALOG.find((j) => j.id === id);
}

/** Folds a run's owned jokers into the MatchOptions a node's GameController is built with. */
export function matchOptionsFromJokers(jokerIds: string[]): MatchOptions {
  const options: MatchOptions = {};
  for (const id of jokerIds) {
    if (id === "head-start") {
      options.headStart = { 0: (options.headStart?.[0] ?? 0) + 15 };
    } else if (id === "double-kaboot") {
      options.lastTrickBonus = 20;
    } else if (id === "giant-kaboot") {
      options.lastTrickBonus = 30;
    }
  }
  return options;
}
