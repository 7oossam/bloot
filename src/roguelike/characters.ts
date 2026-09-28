/**
 * الشخصيات: the run opens with picking who you are (like Slay the Spire's characters). Each one
 * starts the night holding its rule-breaker, and has its own تحف that feed it — they show up in
 * the shop and the spoils only for that character. Every other تحفة is general (buying, doubling,
 * counting, the economy) and turns up for everyone.
 *
 * The player's call (Sept 28): start with two, ولد الحارة and صاحب السبيت; the partner pick is
 * hidden for now.
 */
import type { Tag } from "./jokers";

export interface CharacterDef {
  id: string;
  name: string;
  icon: string;
  /** The rule you hold from the start, in a line. */
  rule: string;
  /** A line on how the character plays. */
  style: string;
  /** Jokers held from the start, with their level. */
  start: Array<[string, number]>;
  /** The families whose تحف belong to this character (no one else is offered them). */
  tags: Tag[];
  /** الراوي's character-only offer (a blessing id). */
  blessing: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "hara",
    name: "ولد الحارة",
    icon: "slingshot",
    rule: "سبعاتك وثمانياتك (من غير الحكم) تاكل الإكة في شكلها",
    style: "يلعب بالورق اللي يرميه غيره",
    start: [["trash-beats-ace", 1]],
    tags: ["صغار"],
    blessing: "hara-pocket",
  },
  {
    id: "spade",
    name: "صاحب السبيت",
    icon: "spade",
    rule: "تشتري حكم سبيت في أي دورة، وفي الصن السبيت اللي في يدك حكم",
    style: "كل شي عنده يرجع للسبيت",
    start: [
      ["spade-king", 1],
      ["spade-always", 1],
    ],
    tags: ["سبيت"],
    blessing: "spade-chest",
  },
];

export function getCharacter(id: string | undefined): CharacterDef | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

/** Every family some character owns. */
const OWNED_TAGS = new Set<Tag>(CHARACTERS.flatMap((c) => c.tags));

/**
 * Whether a joker (by its families) can be offered to `character`: general ones always, a
 * character's own only to that character. With no character (an old run, or a test) everything is.
 */
export function inCharacterPool(tags: readonly Tag[], character: string | undefined): boolean {
  const own = getCharacter(character);
  if (!own) return true;
  return !tags.some((t) => OWNED_TAGS.has(t) && !own.tags.includes(t));
}
