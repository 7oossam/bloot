/**
 * Puts the Baloot questions in src/ai/exam.ts to the three AIs and writes docs/ai-exam.md.
 *
 *   npx vite-node scripts/ai-exam.ts -- [--hands 200 --worlds 60]
 *
 * Add a question to EXAM in src/ai/exam.ts and rerun to see how the AIs answer it.
 */
import { writeFileSync } from "node:fs";
import { EXAM, cardName, runExam, type ExamPosition, type ExamResult } from "../src/ai/exam";
import { SUIT_NAME_AR } from "../src/scenes/cardArt";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const hands = Number(arg("hands", "200"));
const worlds = Number(arg("worlds", "60"));

const WHO = { search: "البحث (الذكاء اللي في اللعبة)", rule: "الذكاء بالقواعد", trained: "الشبكة المدرّبة (self-play)" } as const;
const handText = (pos: ExamPosition) => pos.hand.map(cardName).join("، ");
const contract = (pos: ExamPosition) => (pos.mode === "sun" ? "صن" : `حكم ${SUIT_NAME_AR[pos.trumpSuit!]}`);

function answers(result: ExamResult): string[] {
  return [
    "| الذكاء | يلعب | ليش |",
    "|---|---|---|",
    ...(["search", "rule", "trained"] as const).map((who) => `| ${WHO[who]} | **${cardName(result[who].card)}** | ${result[who].why} |`),
  ];
}

const out: string[] = [
  "# امتحان الذكاء",
  "",
  "> يتولّد بالأمر `npx vite-node scripts/ai-exam.ts` من الأسئلة في `src/ai/exam.ts`. أضف سؤالك هناك وأعد التشغيل.",
  ">",
  "> ثلاث ذكاءات تجاوب: **البحث** (اللي يلعب في اللعبة: يجرب كل ورقة على توزيعات محتملة ويلعب اليد لآخرها)،",
  "> **الذكاء بالقواعد** (قواعد الدليل — يقول أي قاعدة استخدم)، و**الشبكة المدرّبة** (تعلمت من لعب البحث ضد نفسه).",
  "> أنت دايم المقعد اللي تحت؛ خويك مقابلك.",
  "",
];

for (const q of EXAM) {
  const started = Date.now();
  const report = runExam(q, { hands, worlds });
  out.push(`## ${q.question}`, "", "**كيف قريت السؤال:**", ...q.assumptions.map((a) => `- ${a}`), "");
  if (report.single) {
    const { pos, result } = report.single;
    out.push(`**اللعب:** ${contract(pos)} — **يدك:** ${handText(pos)}`, "", ...answers(result), "");
  } else if (report.spread) {
    const { counts, examples } = report.spread;
    const kinds = [...new Set(Object.values(counts).flatMap((c) => Object.keys(c)))];
    out.push(
      `**على ${report.spread.hands} يد عشوائية تناسب السؤال — كم مرة اختار كل ذكاء كل نوع جواب:**`,
      "",
      `| الجواب | ${WHO.search} | ${WHO.rule} | ${WHO.trained} |`,
      "|---|---|---|---|",
      ...kinds.map(
        (k) => `| ${k} | ${(["search", "rule", "trained"] as const).map((w) => `${Math.round((100 * (counts[w][k] ?? 0)) / report.spread!.hands)}٪`).join(" | ")} |`,
      ),
      "",
    );
    examples.forEach((ex, i) => {
      out.push(`**مثال ${i + 1}:** ${contract(ex.pos)} — **يدك:** ${handText(ex.pos)}`, "", ...answers(ex.result), "");
    });
  }
  console.log(`${q.id}: ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

writeFileSync(new URL("../docs/ai-exam.md", import.meta.url), out.join("\n"));
console.log("→ docs/ai-exam.md");
