/**
 * Writes docs/jokers.md from the catalog in src/roguelike/jokers.ts, so the doc can't drift from
 * the game. Run with: npx vite-node scripts/gen-jokers-doc.ts
 */
import { writeFileSync } from "node:fs";
import { CONSUMABLE_CATALOG, JOKER_CATALOG, SYNERGIES, UPGRADE_CATALOG, type ShopItemDef, type Tag } from "../src/roguelike/jokers";

const RARITY: Record<ShopItemDef["rarity"], string> = { common: "عادي", rare: "نادر", legendary: "أسطوري" };
const SECTION: Record<Tag, string> = {
  صغار: "الصغار",
  ولد: "الولد",
  أرض: "الأرض",
  حكم: "الحكم",
  مشروع: "المشاريع",
  حلة: "الحلة",
  سبيت: "السبيت",
  عين: "العين",
  تهريب: "التهريب",
  دفاع: "الدفاع",
  دبل: "الدبل",
  كبوت: "الكبوت",
  سرقة: "السرقة",
};

const out: string[] = [
  "# الجواكر والأغراض",
  "",
  "> يتولّد من `src/roguelike/jokers.ts` بالأمر `npx vite-node scripts/gen-jokers-doc.ts` — لا تعدّله باليد.",
  "> كل عائلة حزمة (دليل التصميم، الجزء الرابع): كاسر قانون، ومصدر يجيب لك الورق، ومصنع يحوّل ورقك، وجائزة تدفع لما تنجح. المستوى الثالث من تآزر العائلة يعطيك كاسر قانونها ببلاش.",
  "",
];

const groups = new Map<string, ShopItemDef[]>();
for (const j of JOKER_CATALOG) {
  const key = j.tags.length ? SECTION[j.tags[0]] : "بناة الصف وغيرهم";
  groups.set(key, [...(groups.get(key) ?? []), j]);
}
for (const [title, jokers] of groups) {
  out.push(`## ${title}`, "", "| الجوكر | الندرة | السعر | العائلات | وش يسوي (كل مستوى) |", "|---|---|---|---|---|");
  for (const j of jokers) {
    out.push(`| ${j.icon} ${j.name} | ${RARITY[j.rarity]} | ${j.cost} | ${j.tags.join("، ") || "—"} | ${j.levels.join(" ← ")} |`);
  }
  out.push("");
}

out.push("## التآزر", "", "| العائلة | المستويات |", "|---|---|");
for (const [tag, tiers] of Object.entries(SYNERGIES)) {
  out.push(`| ${tag} | ${tiers.map((t) => `${t.count}: ${t.text}`).join(" ← ")} |`);
}
out.push("", "## تُستخدم مرة", "", "| الغرض | السعر | وش يسوي |", "|---|---|---|");
for (const c of CONSUMABLE_CATALOG) out.push(`| ${c.icon} ${c.name} | ${c.cost} | ${c.levels.join(" ")} |`);
out.push("", "## تطويرات الرن", "", "| التطوير | السعر | وش يسوي |", "|---|---|---|");
for (const u of UPGRADE_CATALOG) out.push(`| ${u.icon} ${u.name} | ${(u.costs ?? [u.cost]).join(" ثم ")} | ${u.levels.join(" ← ")} |`);
out.push("");

writeFileSync(new URL("../docs/jokers.md", import.meta.url), out.join("\n"));
console.log(`docs/jokers.md: ${JOKER_CATALOG.length} jokers`);
