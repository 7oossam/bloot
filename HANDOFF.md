# PROJECT HANDOFF & STATE

**Last Updated By:** Claude Code
**Current Phase:** The run is a real roguelike (branching map, rule-bending opponents, events, blessings, partners). The theme is chosen: «المعزّب — ليلة الأربعين» (`docs/theme.md`). Next: apply the theme's names in the code, three maps (acts), art.

## 1. What We Just Did

### Baloot play and AI
- **التهريب follows the player's video** (`docs/baloot-guide.md` §4 is the source): a discarded suit is NOT wanted and asks for its brother (ديمن → هاص); two suits of one colour, or the led suit's brother, ask for the other colour; climbing in one suit (7→8→بنت) asks for that suit. Reading: `src/ai/beliefs.ts`; sending/answering: `chooseDiscard` / `chooseLead` in `src/ai/play-ai.ts`. The partner answers your signal with its biggest card once it has no winners of its own; a برقية comes first always.
- **حل الحكم:** the side that didn't buy the hokum never leads trumps, unless it holds 4+ trumps or 3+ sure side winners (`defenderMayLeadTrump`, obeyed by the search AI's hard rules too). +0.3 to +0.5 a hand over the previous AI.
- **السوا is part of the game** (not a joker): whenever you lead. Either way the rest plays itself out; a wrong one hands the whole hand to the other side (full value, doubled if doubled, plus every project; only your own بلوت stays). The السوا joker just pays a bonus on a right call.
- **اللعب طلوع** (from the player's terms video): when trumps are led in hokum you must follow with a higher trump than the best on the table if you hold one (`legalMoves` in `src/engine/trick.ts`).
- **سوالف الطاولة** (`src/game/chatter.ts`): the computer players react in the words Baloot players use — فن / حكيم when their partner buys, تعيش سنين for a خمسين, بالزنوبة when an Ace is ruffed with a tiny trump, خسرانة, كبوت, الأولى للغشمان, قامت. Your seat never talks for you.
- **Sun doubling uses the regulation's real 100** (7-2), no longer scaled to the match target.

### The run (src/roguelike/)
- **Branching map** (`mapgen.ts`): 9 rows × 2–3 nodes in 3 lanes, links never cross; row 0 matches, elites and shops from row 3, a shop row before the boss. Targets/gold grow with the row. `pathTo()` finds a route (used by tests). `RunController.getAvailableNodes()`.
- **Opponents** (`opponents.ts`): each is a rule bent against YOU (Balatro boss-blind style), hidden on the map, revealed as you walk in. Every rule's difficulty was measured by simulation (match ≈ −3 a hand, elite ≈ −4.5, boss ≈ −6); rejected rules and why are in the design bible PART 7.
- **العارفين** (match, the doubling opponent the player asked for): before doubling they play the hand out with every card known (`buyerWouldLose` in `src/ai/mcts.ts`) and double exactly the contracts you'd lose — your sun too, at any score. −2.1 a hand; الحكم المقفول stops them completely. Plain "double a lot" was tried many ways and always *helped* the player (a doubled hand is all or nothing and the buyer usually wins) — details in the design bible PART 7.
- **الديوانية** (`events.ts`): six events with a choice each (safe / gamble / price now, pay-off later).
- **شخصيات الخوي** (`partners.ts`): the run opens with picking your partner — الشايب (answers your signals first, never doubles), المتحمس (buys and doubles readily; a hand he buys and makes pays +50%), الجفرة (always dealt an Ace, plays by habit), الغشيم (weak and can't read you, but gold ×1.5 and an extra spoil). Their name replaces «شريكك» at the table. Hooks: `decideBid`/`decideDouble` take an `eager` bar, `PlayContext` has `answerFirst`/`deaf`, `RoundOptions.luckyAces`.
- **بركات الحوت** (`blessings.ts`): at the start of the map, three blessings (one free, two with a price). Permanent for the run, not jokers. The player's taste: no blessing costs a life, no shop discount.
- **Jokers are relics:** no cap (the جيب زيادة upgrade is gone); the table row and shop chips shrink to fit.
- **Item review — the player's verdict:** every joker and item stays. An attempt to cut four was reverted on the player's word, and the reasons are worth keeping: **المخلّي** is a gamble (you risk the trick and get paid for the risk); **الحكم المقفول** and **الوجه البارد** protect you from opponents who double a lot; **زبون مميز** is a good *shop* upgrade (it was only weak as a whale blessing). Don't remove them without asking. المترجم now shows you every player's تهريب instead of making your partner understand you (that's normal play now).

### Theme (docs/theme.md) — chosen by the player
- **«المعزّب — ليلة الأربعين»:** once every forty years hidden ديوانيات open for one night; the loser to المعزّب becomes **مرهون** (bound as a host, each with a **شرط** = the opponent rule) until someone beats them. You're looking for your grandfather; everything ends before الفجر.
- Renames (not yet in the code): jokers → **التحف**, gold → **ريال**, lives → **ساعات الليل**, the whale → **الراوي** and his **وصايا**, opponents → **المرهونين**, events → **الطرقات**, shop → **دكّان التحف**. Full tables, palette and the asset list in production order are in the guide.
- The player's lines: a warm legend, not horror; jinn and أم الصبيان are fine; no fortune-telling (قارئ الفنجال was dropped, العرّاف joker → الدربيل). The player hesitated between تحف and غنايم — the guide uses تحف.

### Where the truth lives
- Theme/story/assets: `docs/theme.md`.
- Rules: `.claude/skills/baloot-rules/SKILL.md` (+ `docs/baloot-regulation.md`, `docs/baloot-guide.md`).
- Design: `.claude/skills/bloot-roguelike-design/SKILL.md` — PART 7 covers opponents, map, الديوانية, blessings, سوا, relics.
- Jokers: `docs/jokers.md` is generated — `npx vite-node scripts/gen-jokers-doc.ts`.

## 2. Current Blockers / Open Questions
- **Balance of the uncapped jokers:** with no cap, the build-makers (شيخ القبيلة، المايسترو، الوايلد) scale further. Watch them in playtests.
- **Opponent strength for a human:** the margins were measured with the rule-based AI in the player's seat; a real player may find حرّاس الإكك or المدبّلين harder or easier. Retune from playtests.
- **Hokum doubling** has no score limit (the regulation only limits sun). The player noticed doubles "under 100" — the sun case is fixed; ask if they also want hokum limited. (العارفين doubles your sun at any score on purpose — it's their rule.)
- **Deploys only from `main` or `claude/gamedev-skills-install-9ybem7`** (`.github/workflows/deploy-pages.yml`). Work on another branch shows up on the page only after its PR is merged.

- **Ideas from the player's terms video, waiting on the player:** opponents built on table culture (الجفرة، أهل الرصّة، ياخذون القلم…), and the bidding rules قبلك / ما لك ثالث (a later seat's sun in round 1 can be claimed by an earlier seat who passed, not from your partner; after ولا you can't buy a third time). The terms themselves: `docs/` has no copy — ask the player for the video file if needed.

## 3. Next Steps (Where to pick up)
- **Apply the theme's names** (`docs/theme.md` §3–§8) once the player confirms the guide: text-only, no system changes.
- **Three maps (acts)** — the player wants it, "but not now": after the boss, a harder map; الحوت appears at the start of each map (never mid-map) with stronger blessings.
- Playtest on a phone; tune numbers in `baseOptions` (`src/roguelike/jokers.ts`), `opponents.ts` and `blessings.ts`.
- Build `JokerView.ts` to show the joker art (row above the table, shop cards).
- Before pushing: `npm test` and `npm run build` must pass — CI blocks the deploy otherwise. UI changes get a Playwright check at 359×685 (the player's phone).

---
*Note to AI Agent: Please update this file with your progress, edited files, and the next step before you finish your turn so the other model can seamlessly take over. Save it as UTF-8.*
