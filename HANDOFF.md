# PROJECT HANDOFF & STATE

**Last Updated By:** Claude Code
**Current Phase:** The run is a real roguelike (branching map, rule-bending opponents, events, blessings, partners). The theme is chosen: «المعزّب — ليلة الأربعين» (`docs/theme.md`). Next: apply the theme's names in the code, three maps (acts), art.

## 1. What We Just Did

### Baloot play and AI
- **التهريب follows the player's video** (`docs/baloot-guide.md` §4 is the source): a discarded suit is NOT wanted and asks for its brother (ديمن → هاص); two suits of one colour, or the led suit's brother, ask for the other colour; climbing in one suit (7→8→بنت) asks for that suit. Reading: `src/ai/beliefs.ts`; sending/answering: `chooseDiscard` / `chooseLead` in `src/ai/play-ai.ts`. The partner answers your signal with its biggest card once it has no winners of its own; a برقية comes first always.
- **حل الحكم:** the side that didn't buy the hokum never leads trumps, unless it holds 4+ trumps or 3+ sure side winners (`defenderMayLeadTrump`, obeyed by the search AI's hard rules too). +0.3 to +0.5 a hand over the previous AI.
- **السوا is part of the game** (not a joker): whenever you lead. Either way the rest plays itself out; a wrong one hands the whole hand to the other side (full value, doubled if doubled, plus every project and your بلوت: you score zero). The السوا joker just pays a bonus on a right call.
- **اللعب طلوع** (from the player's terms video): when trumps are led in hokum you must follow with a higher trump than the best on the table if you hold one (`legalMoves` in `src/engine/trick.ts`).
- **سوالف الطاولة** (`src/game/chatter.ts`): the computer players react in the words Baloot players use — فن / حكيم when their partner buys, تعيش سنين for a خمسين, بالزنوبة when an Ace is ruffed with a tiny trump, خسرانة, كبوت, الأولى للغشمان, قامت. Your seat never talks for you.
- **السوا is judged by order** (`src/engine/sawa.ts`): right when some order of your cards wins every trick whatever they hold (9 of trumps first to draw the King). The play-out follows that order. A wrong one reads خسرانة on the sheet.
- **الدبل is decided on the first five** (six for the ground card's taker); the last three are dealt after the دبل round. The AI's bars carry a margin for the unseen three (measured so it doubles as often as before).
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

### Theme (docs/theme.md) and art direction (docs/art-direction.md) — chosen by the player
- **«المعزّب — ليلة الأربعين»:** once every forty years hidden ديوانيات open for one night; whoever loses to المعزّب becomes **مرهون** (bound as a host, each with a **شرط** = the opponent rule) until someone beats them. You're looking for your grandfather; everything ends before الفجر.
- **Outside the doors it's night, inside it's a frozen hour** (the player didn't want dark art): the neighbourhood at sunset, Andalusia at midday, the Host's palace at sunrise. Only the map screen is night. The Host has hosted card games since cards came through the Mamluks and Andalusia (naipes ← نائب), so Baloot is just this era's game. Andalusian hostages keep their house keys; three keys (one per map) open the last door.
- Renames (not yet in the code): jokers → **التحف**, gold → **ريال**, lives → **ساعات الليل**, the whale → **الراوي** and his **وصايا**, opponents → **المرهونين**, events → **الطرقات**, shop → **دكّان التحف**.
- **Art:** the player makes the assets with Gemini + Higgsfield from `docs/art-direction.md` (style: fine ink line + layered painterly shading with depth — the player rejected flat colour; palette, per-place lighting, content rules, prompt kit, file specs, the asset list with prompts). Claude reviews uploaded images against its checklist and wires them into the game. The player's reference images (R1–R8) stay with the player.
- The player's lines: a warm legend, not horror; jinn and أم الصبيان are fine; no fortune-telling (العرّاف joker → الدربيل); تحف chosen over غنايم.

### The look (src/scenes/fx.ts) — until the real art lands
- Every scene has a painted dusk backdrop (sky gradient, low sun, zellige lattice, grain), shafts of light and drifting gold dust, and (WebGL only) a camera vignette. The table: a teal zellige top under a lamp, a wooden rim and a sadu band.
- Cards (`CardView`): cream paper face, teal zellige back with the Host's sun, a soft shadow that spreads when the card lifts, and a breathing glow on playable cards (`setPlayable`).
- Motion: cards travel in arcs (`arcTo`) and land askew with a puff; the trick winner flares and motes rise; كبوت gets fireworks and a flash; a won match celebrates.
- Arabic text uses Tajawal (Google Fonts; `main.ts` waits for it up to 2.5 s, then falls back) with a soft dark shadow. Buttons are raised sun-gold tiles.
- All textures are painted into canvases at runtime, with blur done through `shadowBlur` (Safari has no canvas `filter`). When the Higgsfield art is approved, these are the places to swap in images.

### «ليش؟» and the player's notes (the AI-teaching loop)
- The table's «ليش؟ 📝» button (top-left) pauses the game and opens an HTML panel (`src/scenes/notesPanel.ts`): every computer play this hand, newest first, each with why (`src/game/explain.ts`, from the `PlayTrace` that `searchCardTraced` in `src/ai/mcts.ts` records: forced / convention / rules / the search's average margin per candidate / habit / سوا).
- The player writes a note or question about a play; it's saved in localStorage with a full `HandSnapshot` (deal, bids, contract, tricks, every hand, the AI's scores). «انسخ» copies them all as JSON to paste to Claude.
- **When the player pastes notes:** rebuild the moment from the snapshot, decide whether the AI was wrong (check the rules skill and `docs/baloot-guide.md`), fix the rule in `play-ai.ts` / `mcts.ts`, and add the moment as a test so it never comes back. If the AI was right, explain why. Stage 2 (later, if wanted): Claude answering in-game through a small server holding the API key.

### The player's first notes (5), all fixed — `tests/player-notes.test.ts` rebuilds each moment
- A defender led a lone trump Ace into the buyer's hokum → `defenderMayLeadTrump` tightened.
- The partner threw a 10 into the opponents' trick to keep it from being bare → points into their trick weigh 4× in `chooseDiscard`.
- A defender went back into the buyer's opening suit in sun → hard rule.
- The partner discarded from his Ace's suit instead of signalling with the brother suit → hard rule + the signal now comes before feeding a 10 into our own trick.
- A hokum defender didn't cash his side Ace → hard rule.
- The rule AI is +0.7 a hand stronger than before (≈6,900 hands head to head, twice); the search's lead over it is now ≈2.0 a hand (400 hands), and the strength test runs 240 hands.
- Second batch (5 notes, tests 6–10): no underleading your own Ace; no فرنكة in hokum (the Ace plays the first time its suit comes round, even onto the partner's trick); ruff with the تسعة while the ولد is out; no برقية into a partner known void in the suit. The rule AI gained another +0.7 a hand; the search still leads it by ≈1.9.
- «ليش؟» now shows every trick card by card (tap a computer card for its reason, any card to write about it), every seat's full hand as play began (played cards struck), and a tab for the previous hand once it's over (`getLastHand`, `startHands` in the snapshot).
- الذاكرة now shows four suit tiles between the table and your hand (left in each suit; at level 2 which Ace/10 are still out).

### Where the truth lives
- Theme/story: `docs/theme.md`. Art (style, prompts, asset specs): `docs/art-direction.md`.
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
- **Apply the theme's names** (`docs/theme.md` §3–§8): text-only, no system changes.
- **Higgsfield is connected as an MCP connector** (`mcp__higgsfield__*`, OAuth, ~70 credits on the basic plan at the start). The first reference shots (art-direction §8 step 1), each place with two models, waiting on the player's pick:
  - nano_banana_pro (served as nano_banana_2, 1536×2752, 2 credits): hara `d7908342-e753-47cf-9167-336896092796`, andalus `d6875141-5f66-4d50-b466-491f90d0f409`, qasr `14d34da7-86f1-48c0-8069-9534925d4371`
  - gpt_image_2_5 medium 1k (752×1344, 0.5 credits): hara `4e0245b9-72b7-427e-9b6c-5314a9001356`, andalus `5e27cb37-5ac9-42e3-8af2-897edde84790`, qasr `94c93f78-e483-47fc-ad17-611cbfb63fc0`
  - Result images live on `d8j0ntlcm91z4.cloudfront.net`; a session whose network blocks that host can't download them (show them with `show_generation_by_ids`). Use an environment with full network to fetch, review and wire them in. The approved shots become the style references (`medias` role `image_references`) for every later generation.
- **Assets:** when the player uploads a batch, check it against `docs/art-direction.md` §6.4, then crop/convert to webp at the §7 sizes and load it in the scenes (cards first: faces leave the corners empty; the code draws ranks and suits).
- **Three maps (acts)** — the player wants it, "but not now": after the boss, a harder map; الحوت appears at the start of each map (never mid-map) with stronger blessings.
- Playtest on a phone; tune numbers in `baseOptions` (`src/roguelike/jokers.ts`), `opponents.ts` and `blessings.ts`.
- Build `JokerView.ts` to show the joker art (row above the table, shop cards).
- Before pushing: `npm test` and `npm run build` must pass — CI blocks the deploy otherwise. UI changes get a Playwright check at 359×685 (the player's phone).

---
*Note to AI Agent: Please update this file with your progress, edited files, and the next step before you finish your turn so the other model can seamlessly take over. Save it as UTF-8.*
