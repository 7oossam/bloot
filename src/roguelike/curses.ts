/**
 * النحس: the other side of the night's deals — a curse sits in your row like a تحفة but works
 * against you, until you pay to lift it (at the دكّان, or الراقي's باب غريب). Some أبواب غريبة give you
 * something good and a نحس with it; that's the price that isn't money.
 */
export interface CurseDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

export const CURSES: CurseDef[] = [
  { id: "debt", name: "الدَّين", icon: "scroll-quill", text: "كل يد تخسرونها: −3 ريال." },
  { id: "envy", name: "الحسد", icon: "evil-eyes", text: "الخصم يبدأ كل صكّة قدامكم بـ 5." },
  { id: "slump", name: "الكساد", icon: "shop", text: "الدكّان يعرض تحفة أقل." },
];

/** What lifting a نحس costs at the دكّان. */
export const UNCURSE_PRICE = 30;
/** الحسد's head start for them, per match. */
export const ENVY_HEAD_START = 5;
/** الدَّين: riyals per hand lost. */
export const DEBT_PER_LOSS = 3;

export function getCurse(id: string | undefined): CurseDef | undefined {
  return CURSES.find((c) => c.id === id);
}
