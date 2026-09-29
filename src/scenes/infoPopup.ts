import Phaser from "phaser";
import { getJokerDef, type Rarity } from "../roguelike/jokers";
import { getBlessing } from "../roguelike/blessings";
import { getCurse } from "../roguelike/curses";
import { getStamp, GROW_STARS, type StampId } from "../roguelike/stamps";
import { HEIGHT, WIDTH } from "./layout";
import { INK, addIcon } from "./icons";
import { CSS, PAL, goldRule, inkText, paperPanel } from "./theme";
import { RANK_NAME_AR, SUIT_NAME_AR } from "./cardArt";
import type { Card } from "../engine/types";

/**
 * «وش تسوي؟» — tap any تحفة, نحس, وصية or وسم anywhere and its explanation comes up on a card;
 * tap anywhere to close it. One look for every screen.
 */
const RARITY_AR: Record<Rarity, string> = { common: "عادية", rare: "نادرة", legendary: "أسطورية" };

let open: Phaser.GameObjects.Container | undefined;

function show(scene: Phaser.Scene, opts: { icon?: string; title: string; sub?: string; body: string[]; accent?: number; iconColor?: number }): void {
  open?.destroy();
  const w = WIDTH - 100;
  const texts: Phaser.GameObjects.Text[] = [];
  let y = 0;
  const top: Phaser.GameObjects.GameObject[] = [];
  if (opts.icon) {
    top.push(addIcon(scene, 0, 0, opts.icon, 84, opts.iconColor ?? INK));
    y += 70;
  }
  const title = inkText(scene, 0, y, opts.title, { fontSize: "36px", color: CSS.crimson }).setOrigin(0.5, 0);
  texts.push(title);
  y += title.height + 6;
  if (opts.sub) {
    const sub = inkText(scene, 0, y, opts.sub, { fontSize: "22px", color: CSS.inkSoft }).setOrigin(0.5, 0);
    texts.push(sub);
    y += sub.height + 4;
  }
  const rule = goldRule(scene, 0, y + 14, 300);
  y += 34;
  for (const line of opts.body) {
    const t = inkText(scene, 0, y, line, { fontSize: "27px", lineSpacing: 8, wordWrap: { width: w - 90 } }).setOrigin(0.5, 0);
    texts.push(t);
    y += t.height + 14;
  }
  const hint = inkText(scene, 0, y + 6, "اضغط في أي مكان وتقفل", { fontSize: "19px", color: CSS.inkSoft }).setOrigin(0.5, 0);
  texts.push(hint);
  y += hint.height + 10;
  const h = y + 80;
  const shade = scene.add.rectangle(0, 0, WIDTH * 2, HEIGHT * 2, 0x000000, 0.5).setInteractive();
  const panel = scene.add.container(WIDTH / 2, HEIGHT / 2).setDepth(200);
  const inner = scene.add.container(0, -h / 2 + 50, [...top, ...texts, rule]);
  panel.add([shade, paperPanel(scene, w, h, { accent: opts.accent }), inner]);
  panel.setScale(0.9).setAlpha(0);
  scene.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 160, ease: "Back.Out" });
  const close = () => {
    panel.destroy();
    if (open === panel) open = undefined;
  };
  shade.on("pointerdown", close);
  open = panel;
}

export function closeInfo(): void {
  open?.destroy();
  open = undefined;
}

/** A تحفة: what it does at your level, what the next level adds, and its group. */
export function showJokerInfo(scene: Phaser.Scene, id: string, level = 1): void {
  const def = getJokerDef(id);
  if (!def) return;
  const lv = Math.max(1, Math.min(level, def.levels.length));
  const body = [def.levels[lv - 1]];
  if (lv < def.levels.length) body.push(`الترقية الجاية: ${def.levels[lv]}`);
  if (def.tags.length) body.push(`من مجموعة «${def.tags.join("» و«")}» — كمّل تحف من نفس المجموعة وتاخذ مكافأة زيادة.`);
  const kind = def.kind === "consumable" ? "تُستخدم مرة" : def.kind === "upgrade" ? "تطوير لليلة" : `تحفة ${RARITY_AR[def.rarity]}`;
  show(scene, { icon: def.icon, title: def.name, sub: def.levels.length > 1 ? `${kind} · المستوى ${lv} من ${def.levels.length}` : kind, body, accent: def.rarity === "legendary" ? 0xc9973e : undefined });
}

/** One نحس, or all you carry. */
export function showCurseInfo(scene: Phaser.Scene, ids: string | string[]): void {
  const defs = (Array.isArray(ids) ? ids : [ids]).map(getCurse).filter((d) => !!d);
  if (!defs.length) return;
  const one = defs.length === 1;
  const body = defs.map((d) => (one ? d!.text : `«${d!.name}»: ${d!.text}`));
  body.push("تفكّه في الدكّان بـ 30 ريال، أو عند الراقي.");
  show(scene, { icon: defs[0]!.icon, iconColor: PAL.crimson, title: one ? `نحس: ${defs[0]!.name}` : "النحس اللي عليك", body, accent: PAL.crimson });
}

export function showBlessingInfo(scene: Phaser.Scene, id: string): void {
  const def = getBlessing(id);
  if (!def) return;
  show(scene, { icon: def.icon, title: def.name, sub: "وصية الراوي", body: [def.gift, def.note ?? (def.price ? `الثمن: ${def.price}` : "")].filter(Boolean) });
}

const cardName = (id: string) => {
  const card: Card = { suit: id[0] as Card["suit"], rank: id.slice(1) as Card["rank"] };
  return `${RANK_NAME_AR[card.rank]} ${SUIT_NAME_AR[card.suit]}`;
};

/** One card's stamps (tapped in your hand). */
export function showCardStamps(scene: Phaser.Scene, cardId: string, stamps: StampId[], stars = 0): void {
  if (!stamps.length) return;
  const body = stamps.map((s) => {
    const def = getStamp(s)!;
    return `«${def.name}»: ${def.text}${s === "grow" ? ` (معها ${Math.min(stars, GROW_STARS)} من ${GROW_STARS})` : ""}`;
  });
  show(scene, { icon: getStamp(stamps[0])!.icon, title: `وسوم ${cardName(cardId)}`, body });
}

/** Every stamped card of the night, as a list (the map's «وسومك»). */
export function showAllStamps(scene: Phaser.Scene, stamps: Record<string, StampId[]>, stars: Record<string, number> = {}): void {
  const cards = Object.entries(stamps).filter(([, ids]) => ids.length);
  const body = cards.length
    ? cards.map(([card, ids]) => `${cardName(card)}: ${ids.map((s) => `${getStamp(s)!.name}${s === "grow" ? ` ${Math.min(stars[card] ?? 0, GROW_STARS)}/${GROW_STARS}` : ""}`).join(" + ")}`)
    : ["ما عندك وسوم للحين. كل صكّة تفوزها تعطيك وسم تحطه على ورقة."];
  const kinds = [...new Set(cards.flatMap(([, ids]) => ids))];
  for (const k of kinds) body.push(`«${getStamp(k)!.name}»: ${getStamp(k)!.text}`);
  show(scene, { icon: "wax-seal", title: "وسومك", sub: "تشتغل بس إذا الورقة في يدك", body });
}
