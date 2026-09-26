import type { Mode, Seat, Suit } from "../engine/types";
import { cardId } from "../engine/cards";
import type { HandSnapshot, PlayLogEntry } from "../game/GameController";
import { cardNameAr, explainPlay } from "../game/explain";
import { clearNotes, exportNotes, loadNotes, saveNote } from "../game/notes";

/**
 * «ليش؟ 📝»: a page over the table (plain HTML, so typing Arabic just works) listing the
 * computer's plays this hand, newest first. Tap one to read why it played it; write a note or
 * a question about it; copy every note to paste to Claude.
 */
export interface NotesPanelOptions {
  plays: readonly PlayLogEntry[];
  seatName: (seat: Seat) => string;
  mode?: Mode;
  trumpSuit?: Suit;
  snapshot: () => HandSnapshot;
  onClose: () => void;
}

const CSS = `
.bn-wrap{position:fixed;inset:0;z-index:50;background:rgba(10,24,30,.72);display:flex;justify-content:center;align-items:stretch;direction:rtl;font-family:Tajawal,Tahoma,sans-serif}
.bn-panel{width:min(520px,100%);margin:12px;background:#f3e9d6;color:#3a2620;border-radius:18px;border:3px solid #2e9c9a;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.45)}
.bn-head{background:#1f5e5c;color:#f3e9d6;padding:12px 16px;font-size:20px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
.bn-head button{background:none;border:0;color:#f3e9d6;font-size:26px;line-height:1;cursor:pointer}
.bn-body{overflow:auto;padding:10px 12px;flex:1}
.bn-hint{font-size:14px;color:#7a5a44;margin:4px 2px 10px}
.bn-play{background:#fffaf0;border:2px solid #e2d3b8;border-radius:12px;padding:8px 10px;margin-bottom:8px;cursor:pointer}
.bn-play.sel{border-color:#e3a33b;box-shadow:0 0 0 2px rgba(227,163,59,.35)}
.bn-title{font-weight:700;font-size:16px}
.bn-why{font-size:14px;line-height:1.7;margin-top:6px;white-space:pre-line;color:#4a3428}
.bn-empty{padding:18px;text-align:center;color:#7a5a44}
.bn-foot{border-top:2px solid #e2d3b8;padding:10px 12px;background:#efe1c6}
.bn-foot textarea{width:100%;box-sizing:border-box;min-height:70px;border-radius:10px;border:2px solid #cdb893;padding:8px;font:16px Tajawal,Tahoma,sans-serif;direction:rtl;resize:vertical}
.bn-row{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
.bn-row button{flex:1;min-width:120px;padding:10px 8px;border-radius:12px;border:0;font:700 15px Tajawal,Tahoma,sans-serif;cursor:pointer}
.bn-save{background:#e3a33b;color:#3a2620}.bn-copy{background:#2e9c9a;color:#fff}.bn-clear{background:#d9c6a5;color:#3a2620}
.bn-msg{font-size:14px;margin-top:6px;min-height:18px;color:#1f5e5c}
`;

export function openNotesPanel(o: NotesPanelOptions): () => void {
  if (!document.getElementById("bn-style")) {
    const style = document.createElement("style");
    style.id = "bn-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const wrap = document.createElement("div");
  wrap.className = "bn-wrap";
  const plays = [...o.plays].reverse();
  let selected = 0;

  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const list = plays.length
    ? plays
        .map((p, i) => {
          const why = explainPlay(p, o.seatName(p.seat), o.mode ?? "sun", o.trumpSuit);
          return `<div class="bn-play${i === 0 ? " sel" : ""}" data-i="${i}">
            <div class="bn-title">${esc(o.seatName(p.seat))} — ${esc(cardNameAr(p.trace.card))} <span style="font-weight:400;color:#7a5a44">(الأكلة ${p.trick})</span></div>
            <div class="bn-why" ${i === 0 ? "" : 'style="display:none"'}>${esc(why.slice(1).join("\n"))}</div>
          </div>`;
        })
        .join("")
    : `<div class="bn-empty">ما لعب الكمبيوتر شي في هاليد للحين. تقدر تكتب ملاحظة عامة عن اللعب.</div>`;

  wrap.innerHTML = `<div class="bn-panel">
    <div class="bn-head"><span>ليش؟ — ملاحظاتك للـ AI</span><button aria-label="رجوع">×</button></div>
    <div class="bn-body">
      <div class="bn-hint">اضغط على أي لعبة تشوف ليش لعبها. اختر اللعبة واكتب ملاحظتك أو سؤالك عنها.</div>
      ${list}
    </div>
    <div class="bn-foot">
      <textarea placeholder="مثلاً: غلط، كان المفروض يلعب الإكة — أو: ليش ما لعبت الإكة؟"></textarea>
      <div class="bn-row">
        <button class="bn-save">احفظ الملاحظة</button>
        <button class="bn-copy">انسخ كل الملاحظات (${loadNotes().length})</button>
      </div>
      <div class="bn-row"><button class="bn-clear">امسح الملاحظات المحفوظة</button></div>
      <div class="bn-msg"></div>
    </div>
  </div>`;
  document.body.appendChild(wrap);

  const $ = <T extends Element>(sel: string) => wrap.querySelector(sel) as T;
  const msg = $<HTMLDivElement>(".bn-msg");
  const copyBtn = $<HTMLButtonElement>(".bn-copy");
  const refreshCount = () => (copyBtn.textContent = `انسخ كل الملاحظات (${loadNotes().length})`);

  wrap.querySelectorAll<HTMLDivElement>(".bn-play").forEach((el) =>
    el.addEventListener("click", () => {
      selected = Number(el.dataset.i);
      wrap.querySelectorAll<HTMLDivElement>(".bn-play").forEach((x) => {
        const on = x === el;
        x.classList.toggle("sel", on);
        (x.querySelector(".bn-why") as HTMLDivElement).style.display = on ? "" : "none";
      });
    }),
  );

  const close = () => {
    wrap.remove();
    o.onClose();
  };
  $<HTMLButtonElement>(".bn-head button").addEventListener("click", close);

  $<HTMLButtonElement>(".bn-save").addEventListener("click", () => {
    const area = $<HTMLTextAreaElement>("textarea");
    const text = area.value.trim();
    if (!text) {
      msg.textContent = "اكتب شي أول";
      return;
    }
    const p = plays[selected];
    const count = saveNote({
      at: new Date().toISOString(),
      text,
      about: p ? { seat: p.seat, trick: p.trick, card: cardId(p.trace.card) } : undefined,
      snapshot: o.snapshot(),
    });
    area.value = "";
    msg.textContent = `انحفظت ✔️ — عندك ${count} ملاحظة. لما تخلص انسخها وأرسلها لـ Claude.`;
    refreshCount();
  });

  copyBtn.addEventListener("click", async () => {
    const text = exportNotes();
    try {
      await navigator.clipboard.writeText(text);
      msg.textContent = "انسخت ✔️ — الصقها في المحادثة مع Claude.";
    } catch {
      // No clipboard (older browser, or not allowed): show the text to copy by hand.
      const area = $<HTMLTextAreaElement>("textarea");
      area.value = text;
      area.select();
      msg.textContent = "انسخ النص اللي في المربع يدوياً.";
    }
  });

  $<HTMLButtonElement>(".bn-clear").addEventListener("click", () => {
    if (!confirm("تمسح كل الملاحظات المحفوظة؟")) return;
    clearNotes();
    refreshCount();
    msg.textContent = "انمسحت.";
  });

  return close;
}
