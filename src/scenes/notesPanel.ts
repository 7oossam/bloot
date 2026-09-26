import type { Seat } from "../engine/types";
import type { HandSnapshot, PlayLogEntry } from "../game/GameController";
import { explainPlay } from "../game/explain";
import { clearGames, clearNotes, exportGames, exportNotes, gamesCount, loadNotes, saveNote } from "../game/notes";

/**
 * «ليش؟ 📝»: a page over the table (plain HTML, so typing Arabic just works). For this hand —
 * and the one before, once it's over — it shows everyone's cards as play began and every
 * trick card by card. Tap a computer's card to read why it played it; pick any card and write
 * a note or a question about it; copy every note to paste to Claude.
 */
export interface HandView {
  title: string;
  plays: readonly PlayLogEntry[];
  snapshot: () => HandSnapshot;
}

export interface NotesPanelOptions {
  views: HandView[];
  /** Every hand of the صكة so far, for «انسخ الصكة». */
  seatName: (seat: Seat) => string;
  onClose: () => void;
}

const CSS = `
.bn-wrap{position:fixed;inset:0;z-index:50;background:rgba(10,24,30,.72);display:flex;justify-content:center;align-items:stretch;direction:rtl;font-family:Tajawal,Tahoma,sans-serif}
.bn-panel{width:min(560px,100%);margin:10px;background:#f3e9d6;color:#3a2620;border-radius:18px;border:3px solid #2e9c9a;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.45)}
.bn-head{background:#1f5e5c;color:#f3e9d6;padding:10px 14px;font-size:19px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
.bn-head button{background:none;border:0;color:#f3e9d6;font-size:26px;line-height:1;cursor:pointer}
.bn-tabs{display:flex;gap:6px;padding:8px 10px 0;background:#e8d9bd}
.bn-tab{flex:1;padding:8px;border:0;border-radius:10px 10px 0 0;font:700 15px Tajawal,Tahoma,sans-serif;background:#d9c6a5;color:#3a2620;cursor:pointer}
.bn-tab.on{background:#f3e9d6}
.bn-body{overflow:auto;padding:8px 10px;flex:1}
.bn-contract{font-weight:700;margin:4px 2px 8px}
.bn-sec{font-weight:700;font-size:15px;margin:10px 2px 6px;color:#1f5e5c;cursor:pointer}
.bn-hands{background:#fffaf0;border:2px solid #e2d3b8;border-radius:12px;padding:6px 8px}
.bn-hrow{display:flex;align-items:center;gap:6px;padding:3px 0;flex-wrap:wrap}
.bn-hname{min-width:64px;font-weight:700;font-size:14px}
.cd{display:inline-block;min-width:34px;text-align:center;padding:2px 4px;border-radius:6px;background:#fff;border:1px solid #d8c7a7;font:700 15px Tajawal,Arial,sans-serif;direction:ltr}
.cd.gone{opacity:.35;text-decoration:line-through}
.bn-trick{background:#fffaf0;border:2px solid #e2d3b8;border-radius:12px;padding:6px 8px;margin-bottom:6px}
.bn-thead{font-size:13px;color:#7a5a44;margin-bottom:4px}
.bn-plays{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.bn-p{border:2px solid transparent;border-radius:10px;padding:3px;text-align:center;cursor:pointer;font-size:12px}
.bn-p.ai{background:#eef7f5}
.bn-p.sel{border-color:#e3a33b;background:#fff4dc}
.bn-p .who{display:block;color:#7a5a44;margin-bottom:2px}
.bn-why{font-size:14px;line-height:1.7;margin-top:6px;white-space:pre-line;color:#4a3428;background:#fff4dc;border-radius:10px;padding:6px 8px}
.bn-foot{border-top:2px solid #e2d3b8;padding:8px 10px;background:#efe1c6}
.bn-about{font-size:13px;color:#7a5a44;margin-bottom:4px}
.bn-foot textarea{width:100%;box-sizing:border-box;min-height:44px;height:44px;border-radius:10px;border:2px solid #cdb893;padding:8px;font:16px Tajawal,Tahoma,sans-serif;direction:rtl;resize:vertical}
.bn-row{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap}
.bn-row button{flex:1;min-width:90px;padding:9px 8px;border-radius:12px;border:0;font:700 15px Tajawal,Tahoma,sans-serif;cursor:pointer}
.bn-save{background:#e3a33b;color:#3a2620}.bn-match{background:#1f5e5c;color:#fff}.bn-copy{background:#2e9c9a;color:#fff}.bn-clear{background:#d9c6a5;color:#3a2620}
.bn-msg{font-size:14px;margin-top:4px;min-height:18px;color:#1f5e5c}
`;

const SYM: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_AR: Record<string, string> = { S: "سبيت", H: "هاص", D: "ديمن", C: "شرية" };
const RED = new Set(["H", "D"]);

function chip(id: string, gone = false): string {
  const suit = id[0];
  const rank = id.slice(1);
  return `<span class="cd${gone ? " gone" : ""}" style="color:${RED.has(suit) ? "#b5362a" : "#2a1e1a"}">${rank}${SYM[suit]}</span>`;
}

const parse = (entry: string) => {
  const [seat, id] = entry.split(":");
  return { seat: Number(seat) as Seat, id };
};

export function openNotesPanel(o: NotesPanelOptions): () => void {
  if (!document.getElementById("bn-style")) {
    const style = document.createElement("style");
    style.id = "bn-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const wrap = document.createElement("div");
  wrap.className = "bn-wrap";
  let viewIndex = 0;
  let selected: { trick: number; seat: Seat; id: string } | undefined;
  let showHands = true;

  wrap.innerHTML = `<div class="bn-panel">
    <div class="bn-head"><span>ليش؟ — اللعب وملاحظاتك للـ AI</span><button aria-label="رجوع">×</button></div>
    ${o.views.length > 1 ? `<div class="bn-tabs">${o.views.map((v, i) => `<button class="bn-tab${i === 0 ? " on" : ""}" data-v="${i}">${v.title}</button>`).join("")}</div>` : ""}
    <div class="bn-body"></div>
    <div class="bn-foot">
      <div class="bn-about"></div>
      <textarea placeholder="مثلاً: ليش ما لعبت الإكة؟"></textarea>
      <div class="bn-row">
        <button class="bn-save">احفظ</button>
        <button class="bn-copy"></button>
        <button class="bn-clear" style="flex:0 0 auto;min-width:0">🗑️</button>
      </div>
      <div class="bn-row"><button class="bn-match"></button><button class="bn-games-clear bn-clear" style="flex:0 0 auto;min-width:0">🗑️</button></div>
      <div class="bn-msg"></div>
    </div>
  </div>`;
  document.body.appendChild(wrap);

  const $ = <T extends Element>(sel: string) => wrap.querySelector(sel) as T;
  const body = $<HTMLDivElement>(".bn-body");
  const msg = $<HTMLDivElement>(".bn-msg");
  const about = $<HTMLDivElement>(".bn-about");
  const copyBtn = $<HTMLButtonElement>(".bn-copy");
  const refreshCount = () => (copyBtn.textContent = `انسخ الملاحظات (${loadNotes().length})`);
  refreshCount();
  const matchBtn = $<HTMLButtonElement>(".bn-match");
  const refreshGames = () => {
    const { hands } = gamesCount();
    matchBtn.textContent = `📋 انسخ كل لعبك للتحليل — ${hands} يد`;
  };
  refreshGames();
  matchBtn.addEventListener("click", async () => {
    const text = exportGames();
    try {
      await navigator.clipboard.writeText(text);
      msg.textContent = "انسخت كل لعبك ✔️ — الصقه لـ Claude وبيحلله. بعدها تقدر تمسحه بـ 🗑️ اللي جنبه.";
    } catch {
      const area = $<HTMLTextAreaElement>("textarea");
      area.value = text;
      area.select();
      msg.textContent = "انسخ النص اللي في المربع يدوياً.";
    }
  });
  $<HTMLButtonElement>(".bn-games-clear").addEventListener("click", () => {
    if (!window.confirm("تمسح كل اللعب المحفوظ للتحليل؟ (ملاحظاتك تبقى)")) return;
    clearGames();
    refreshGames();
    msg.textContent = "انمسح اللعب المحفوظ.";
  });

  const render = () => {
    const view = o.views[viewIndex];
    const snap = view.snapshot();
    const tricks = [...snap.tricks, ...(snap.currentTrick.length ? [{ leader: parse(snap.currentTrick[0]).seat, cards: snap.currentTrick, winner: undefined }] : [])];
    const played = new Set(tricks.flatMap((t) => t.cards.map((c) => parse(c).id)));
    const entryOf = (trick: number, seat: Seat) => view.plays.find((p) => p.trick === trick && p.seat === seat);
    if (!selected) {
      const last = view.plays[view.plays.length - 1];
      if (last) {
        const t = tricks[last.trick - 1];
        const id = t?.cards.map(parse).find((c) => c.seat === last.seat)?.id;
        if (id) selected = { trick: last.trick, seat: last.seat, id };
      }
    }
    const c = snap.contract;
    const contract = c
      ? `${c.mode === "sun" ? "صن" : `حكم ${SYM[c.trumpSuit!]} ${SUIT_AR[c.trumpSuit!]}`} — المشتري: ${o.seatName(c.declarer)}${snap.doubleLevel && snap.doubleLevel > 1 ? ` — دبل ×${snap.doubleLevel}` : ""}`
      : "المزايدة للحين";
    const hands = ([0, 1, 2, 3] as Seat[])
      .map((s) => {
        const cards = (snap.startHands?.[s] ?? snap.hands[s]).map((id) => chip(id, played.has(id))).join(" ");
        return `<div class="bn-hrow"><span class="bn-hname">${o.seatName(s)}</span>${cards}</div>`;
      })
      .join("");
    const trickHtml = tricks
      .map((t, i) => {
        const n = i + 1;
        const cells = t.cards
          .map(parse)
          .map(({ seat, id }) => {
            const ai = !!entryOf(n, seat);
            const sel = selected && selected.trick === n && selected.seat === seat;
            return `<div class="bn-p${ai ? " ai" : ""}${sel ? " sel" : ""}" data-t="${n}" data-s="${seat}" data-id="${id}"><span class="who">${o.seatName(seat)}</span>${chip(id)}</div>`;
          })
          .join("");
        let why = "";
        if (selected && selected.trick === n) {
          const e = entryOf(n, selected.seat);
          why = `<div class="bn-why">${e ? explainPlay(e, o.seatName(e.seat)).join("\n") : selected.seat === 0 ? "هذي لعبتك." : "ما انسجل سبب لهذي اللعبة."}</div>`;
        }
        const head = `الأكلة ${n} — بدأ ${o.seatName(t.leader)}${t.winner !== undefined ? ` — أكلها ${o.seatName(t.winner)}` : " — للحين"}`;
        return `<div class="bn-trick"><div class="bn-thead">${head}</div><div class="bn-plays">${cells}</div>${why}</div>`;
      })
      .join("");
    body.innerHTML = `
      <div class="bn-contract">${contract}</div>
      <div class="bn-sec" data-toggle="1">${showHands ? "▾" : "◂"} أوراق الكل (المشطوبة انلعبت)</div>
      ${showHands ? `<div class="bn-hands">${hands}</div>` : ""}
      <div class="bn-sec">الأكلات — اضغط على أي ورقة: ورق الكمبيوتر يقول لك ليش لعبه</div>
      ${trickHtml || '<div class="bn-thead">ما انلعب شي للحين.</div>'}`;
    about.textContent = selected ? `ملاحظتك عن: ${o.seatName(selected.seat)} — الأكلة ${selected.trick}` : "ملاحظة عامة عن اليد";

    body.querySelectorAll<HTMLDivElement>(".bn-p").forEach((el) =>
      el.addEventListener("click", () => {
        selected = { trick: Number(el.dataset.t), seat: Number(el.dataset.s) as Seat, id: el.dataset.id! };
        const top = body.scrollTop;
        render();
        body.scrollTop = top;
      }),
    );
    body.querySelector<HTMLDivElement>("[data-toggle]")?.addEventListener("click", () => {
      showHands = !showHands;
      render();
    });
  };
  render();
  body.scrollTop = body.scrollHeight;

  wrap.querySelectorAll<HTMLButtonElement>(".bn-tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      viewIndex = Number(tab.dataset.v);
      selected = undefined;
      wrap.querySelectorAll(".bn-tab").forEach((x) => x.classList.toggle("on", x === tab));
      render();
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
    const count = saveNote({
      at: new Date().toISOString(),
      text,
      about: selected ? { seat: selected.seat, trick: selected.trick, card: selected.id } : undefined,
      snapshot: o.views[viewIndex].snapshot(),
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
