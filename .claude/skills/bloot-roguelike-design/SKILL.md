---
name: bloot-roguelike-design
description: "The ultimate game design bible for Bloot Roguelike. Combines true Baloot rules with masterclass Roguelike Deckbuilder design philosophies (Slay the Spire, Balatro, etc.)."
---

# Bloot Roguelike: The Design Bible

This knowledge base merges the strict, traditional rules of **Baloot** with the modern, dopamine-driven game design philosophies of **Roguelike Deckbuilders** (inspired by Slay the Spire, Balatro, and general card game mechanics).

---

## PART 1: The Roguelike Philosophy (The "Sauce")

### 1. The "Balatro" Effect: Tension & Score Previews
- **Hidden Math = Excitement:** A core design philosophy from Balatro is intentionally *not* showing the player the exact final score of their hand before they play it. If the UI explicitly says "You will score 150 points," the tension is gone. The player should know their base multipliers, but calculating the exact explosive combo should be slightly opaque, creating a "cross your fingers and hope" moment when the multipliers trigger.
- **Loss Aversion:** Players hate losing more than they love winning. Roguelikes use this by creating "Push Your Luck" scenarios where the player risks everything for a huge payoff (e.g., Doubling/Gahwa in Baloot).

### 2. The "Slay the Spire" Synergy Model
- **No Boring Upgrades:** Upgrades and Jokers shouldn't just be "+10 points." They need to fundamentally break or alter the rules of the game.
- **Warping Effects:** A Joker should make the player completely change their playstyle. For example, Slay the Spire's *Dead Branch* + *Corruption* combo. In Bloot, a Joker that makes "7s beat Aces" forces the player to hunt for 7s.
- **Data-Driven Balance:** True balance isn't making every card equal. Some cards *should* be overpowered if they require a massive setup, while others are reliable staples.

### 3. Core Card Game Mechanisms to Exploit
- **Push Your Luck:** Bidding (Meshytar) is inherently push-your-luck. We can amplify this by adding Jokers that reward you for bidding blindly or buying Sun with terrible hands.
- **Trick-Taking:** The core engine. Jokers can reverse the hierarchy (Top-to-Bottom), change the Trump suit mid-round, or allow players to play out of turn.
- **Tableau Building:** The Jokers the player collects act as their Tableau. The order of the Jokers matters (e.g., +Chips triggering before xMultipliers).

---

## PART 2: The Baloot Core Engine (The Rules We Break)

To break the rules, we must accurately implement them first. This is a short summary: the official regulation (`docs/baloot-regulation.md`) is the authority, and the `baloot-rules` skill says how the code follows it.

### 1. Bidding (Meshytar) & Ashkal
- **Two Rounds:** 1st round (Ground card suit). 2nd round (Any other suit or Sun).
- **Ashkal (أشكل):** Only the dealer and the player on the dealer's left may call it. The caller buys **Sun**, and the caller's partner takes the ground card.

### 2. Scoring, Math, and Rounding
- **Sun (26 Points):** 130 in total (120 in cards + 10 for the last trick). 11 pts for Ace, 10 for Ten. Rounding: 1-4 down, 5-9 up.
- **Hokum (16 Points):** 162 in total (152 in cards + 10 for the last trick). Jack is **20 pts**, Nine is **14 pts**. Rounding: 1-5 down, 6-9 up.
- **Counting:** Only the non-buyer is counted; the buyer takes the rest. If the non-buyer's points beat the buyer's, the buyer loses (خسارة) and the other team takes the whole hand.
- **Kaboot:** Winning all tricks (44 in Sun, 25 in Hokum).

### 3. Doubling (Gaid / Gahwa)
- It is a push-your-luck multiplier.
- **Hokum:** Dabal (x2), Thri (x3), Four (x4), then Gahwa.
- **Sun:** Dabal (x2) only, and only by a team at 100 or less against a team over 100.
- **Gahwa (قهوة):** Whoever wins the hand wins the whole match.

### 4. Projects (Mashareea)
- Declared on trick 1, revealed on trick 2. Only the strongest project wins.
- **Sira (3-run), Khamsin (4-run), Miya (5-run / 4-of-a-kind), Arbaamiya (4 Aces in Sun).** Four Aces in Sun score 400, not 100.
- **Baloot:** King & Queen of Trump, declared dynamically during play.

### 5. Tahreeb (The Secret Language)
Tahreeb is the advanced meta-game of discarding to signal your partner.
- **Brother Suit (أخو اللون):** Discard Red = "I want the other Red". Discard Black = "I want Black".
- **Double Discard:** Discarding two Reds = "I want Black".
- **Bottom-to-Top:** Discard 7 then 8 = "I WANT this suit".
- **Top-to-Bottom:** Discard 10 then 7 = "I DO NOT want this suit".
- **Ace Discard:** "Stop playing this suit" or "Give me the lead."

---

## PART 3: Design Mandates for Bloot Roguelike

1. **Jokers Must Break Rules, Not Just Buff Math:** If a Joker just gives flat points, it's boring. Jokers should interact with Tahreeb, Mashareea, or the Meshytar phase.
2. **The "Tahreeb" Opportunity:** Since the player controls one seat, we can create Jokers that *force* the AI partner to perfectly understand and execute Tahreeb, or Jokers that trigger massive multipliers when a Tahreeb signal is successfully completed.
3. **Keep the Math Opaque During Play:** Let the Jokers light up and trigger sound effects sequentially (like Balatro). Don't give the player a flat "You will win this trick" preview. Make them feel the impact of the chain reaction.

4. **Never Ship a Lonely Joker:** Every joker ships as part of a package. See PART 4.

---

## PART 4: The Build Package Law (never ship a lonely joker)

A joker that makes something powerful is worthless if the player can't get that something. When a joker makes a card, suit or play powerful, design the **whole package** with it, so the player can build around it on purpose instead of hoping the deal cooperates.

### The four roles
Example: a joker that makes the **8** the strongest card needs these alongside it:

| Role | What it does | The 8 example |
|---|---|---|
| **1. The Payoff** (the rule-breaker) | Makes the thing powerful. Usually rare or legendary. | Your 8s beat Aces. |
| **2. The Supply** (odds) | Raises your chance of being **dealt** the thing. | You're always dealt an 8 in your first five cards; two 8s at level 2. |
| **3. The Forge** (transform) | Turns a card **in your hand** into the thing, for this hand. | Pick a card in your hand; it becomes an 8 of its suit. |
| **4. The Reward** (the scorer) | Pays every time the thing does its job. Scales with level. | Every trick your team wins with an 8: +3 / +5 / +8 points, plus gold at level 3. |

### Rules for packages
1. **Each piece works on its own.** The Supply and the Reward must be decent without the Payoff (an 8-reward still pays for the odd 8 you win with), so a half-built package is never a dead slot. The full set is where it explodes.
2. **One family tag for the whole package.** All four share a family tag, so the synergy tiers (2 and 3) fire as the build grows, and the shop's ×3 weighting for owned families brings the rest of the package to the player.
3. **Rarity follows role.** Supply and Reward are commons (cheap, early, the "seed" of the build). Forge is rare. Payoff is rare or legendary. A player should usually find the enablers first and the payoff later, which creates the "I'm one joker away" tension.
4. **Obey the Shared Deck Law:**
   - **Supply** never creates cards. It pulls real cards from the shared deck into your hand at the deal, so the opponents simply don't get them (الولد المضمون already works this way).
   - **Forge** changes a card in **your hand for this hand only**. The next deal uses the normal 32 cards again. Duplicates are fine (the engine already handles a duplicated Jack: the first one played keeps the trick).
   - **Payoff** applies to **your team only**. Underdog was broken until it was scoped this way: its first version made the opponents' 7s and 8s beat Aces too.
5. **Check the numbers with `sim.ts`.** A Reward that fires on 70%+ of hands is just a flat buff; one under 5% is dead. Aim for 30–60% for commons, 10–30% (with a big payoff) for rule-breakers. With the Supply owned, the target should roughly double.
6. **Don't cut a joker without asking the player.** A review once removed المخلّي, الحكم المقفول, الوجه البارد and زبون مميز and was reverted: المخلّي is a risk you get paid for, the anti-double pair protects you from opponents who double a lot, and زبون مميز is a good shop upgrade (it was only weak as a whale blessing).
7. **Anti-synergies are allowed and should be visible.** If two jokers fight each other (الحكم المقفول stops doubling; a doubling build wants it), say so in the text so the player learns rather than feels cheated.

The **Jack (الولد) family** is the model package the rest should copy: الولد المضمون (Supply), الولد المزوّر (Forge), جامع الأولاد (Reward), صيد الولد and الحرقة (Payoffs).

---

## PART 5: The Build Catalog (10 builds, all in the game)

Every joker below exists in `src/roguelike/jokers.ts`; `docs/jokers.md` lists their exact numbers per level. Each family's **tier 3 synergy hands over its rule-breaker for free**, so committing to a package is always rewarded. Builds 6–10 are **skill builds**: they pay for what a strong regular Baloot player already does well (defending, signalling, counting, running tricks, reading a double), so real Baloot skill is a valid way to win a run.

### 1. الصغار — the 7s and 8s build
- **ثورة الصغار** (Payoff): your team's 7s and 8s outside the trump suit beat the Ace of their suit. Opponents' stay weak (Shared Deck Law). A trump 7 is still a 7, so the trump Jack isn't trivialised.
- **الحظ الواطي** (Supply): 1 / 2 / 3 sevens or eights guaranteed in your first five, pulled from the shared deck.
- **المنزّل** (Forge): after the buy, pick 1 / 2 cards to become the 8 of their suit (optional; pointless picks are greyed out).
- **ثأر الصغار** (Reward): +2 / +3 / +5 per trick your team takes with a 7 or 8.
- **الأربع الصغار** (bonus payoff): four 7s/8s/9s are a مئة; the Supply makes it reachable.
- Synergy: 2 = +1 per 7/8 trick; 3 = ثورة الصغار free.

### 2. الولد — the Jack build (the model package)
الولد المضمون (Supply), الولد المزوّر (Forge), جامع الأولاد (Reward), صيد الولد / الحرقة (Payoffs).

### 3. السبيت — the spade build
ملك السبيت (Payoff), سارق السبيت (Supply), **الصبّاغ** (Forge: after the buy, 1 / 2 cards become the spade of the same rank), كنز السبيت (Reward), سبيت دايم.

### 4. المشاريع — the projects build
نص سرا / **الورقة الشبح** (Payoffs: projects count one size up), **المرتّب** (Supply: at the deal, two in a row get their third; level 2 also three get their fourth), صانع السرا (Reward), مهندس المشاريع, الصوت العالي.

### 5. الأرض — the last-trick build
سيد الأرض (Payoff), الورقة الأخيرة (Forge), الأرض الذهبية (Reward), المخلّي (pays for saving strength). A good player already plans the last trick; this build makes it the win condition.

### 6. الدفاع — the defender (skill build)
- الفخ: +6 / +10 / +15 when the opponents buy and lose.
- **الكاسر**: the opponents buy **Sun** and lose → your result ×2 / ×3. Rare, big (fires on ~9% of hands).
- **الصبر**: +3 / +5 / +8 gold every hand the opponents buy and you out-score them.
- القهوجي: winning a doubled hand pays +50% / +100%.

### 7. التهريب — signalling (skill build)
- **المترجم**: shows you over each player what their التهريب (and any برقية) asks for. Understanding your signals is normal play, not a joker: your partner comes to your asked suit once it has no winners of its own.
- **الإشارة الذهبية** (Reward): a hand where your partner led a suit you asked for and your team took that trick is ×1.5 / ×2.
- **المرسال** (Forge): after the buy, give your partner a card; they give you their best card of that suit. (Replaces the planned "البرقية المضمونة": a swap is clearer to use and builds long suits for signalling.)
- عين الشريك: see your partner's cards, so you know what to ask for.
- Synergy: 2 = +2 per answered signal trick; 3 = المترجم free (see every player's signals).

### 8. العين — the card counter (skill build)
- **الذاكرة**: a line under your jokers showing how many cards of each suit you haven't seen; level 2 also lists the Aces and 10s still out.
- **الآكه الذهبية**: every آكه your team leads that takes its trick pays +2 / +4 gold; every one that gets cut costs 3 points. The risk is real: leading a آكه into a void opponent in hokum.
- ملك الآكه (Reward), الجاسوس (see opponents' cards).

### 9. الكبوت — run every trick (skill build)
- **السوا**: the سوا button is part of the game now (see PART 7); this joker pays +6 / +10 / +15 for a right call.
- **الزحف**: from the third trick in a row, each trick pays 1, 1, 2, 2, 3, 3 (level 2: 1, 2, 3, 4, 5, 6).
- ملك الكبوت (Payoff): a كبوت wins the match. صاحب الحلة helps start a run.
- Synergy: 2 = +10 per كبوت; 3 = ملك الكبوت free.

### 10. الدبل — the doubling build (push-your-luck)
- **الجريء** (Payoff): your team may double the opponents' Sun at any score.
- **رأس المال** (Reward): every doubled hand you win pays (double level × 4 / × 7) gold.
- **الوجه البارد**: once your team raises, the opponents never raise back.
- القهوجي: +50% / +100% on doubled hands won.
- ⚠️ Anti-synergy (stated in its text): الحكم المقفول stops anyone doubling you, which removes the doubled hands this build feeds on.
- Synergy: 2 = +5 per doubled hand won; 3 = الجريء free.

### Measured balance (300 simulated hands, AI playing your seat)
| Jokers | Bonus / hand | Fires on |
|---|---|---|
| جامع الأولاد (existing common, for scale) | +0.7 | 32% |
| ثأر الصغار alone | +0.4 | 20% |
| ثأر الصغار + ثورة الصغار | +6.7 (and base score 12.9 → 19.6) | 93% |
| الزحف | +1.7 | 51% |
| الكاسر | +2.9 | 9% |
| المرتّب + صانع السرا | +3.7 and 1 gold | 57% |

ثورة الصغار is the strongest Payoff in the game; watch it if runs get too easy.

## PART 6: Feedback the table gives (so the player always knows what their jokers are doing)
- **The joker row** above the table: tap a joker to read what it does at its level and its family.
- **It lights up when it pays**: a pulse and the amount floating off it, the moment the trick is won (and a log line).
- **The hand summary counts the jokers up one at a time**, each lighting its joker, before the match total appears (Mandate 3).
- **Your hand**: a "🔀 ترتيب" button cycles suit / strongest first / alternating colours, and dragging a card sideways reorders it by hand.
- **Every joker pick is optional** (a تخطّي button), and picks that would change nothing are greyed out.

## PART 7: Opponents, الديوانية and الحوت

### Opponents bend the game against YOU (src/roguelike/opponents.ts)
The player's design, like Balatro's boss blinds: an opponent isn't a stronger player with a
power of its own, it's a rule that changes the game on you (your first Ace scores nothing,
your projects don't count, الأرض is theirs…). Each rule hits one way of playing, so the
jokers you gathered make some fights harder and others easier. That is the whole link
between enemies and items; there is no "own a joker of their family to weaken them"
mechanic (tried and rejected by the player).
- **Hidden:** the map never says who is where. You find out as you walk in (a reveal panel
  with their rule and the way of playing it hurts).
- **Never impossible:** every rule is measured so a run can beat it without a counter.

| Tier | Opponent | Rule | Margin/hand |
|---|---|---|---|
| match | حرّاس الإكك | you can't lead a trick with an Ace or a 10 (unless that's all you hold) | −2.3 |
| match | ماسحين المشاريع | your projects don't count (بلوت does) | −4.1 |
| match | أهل الأرض | الأرض's 10 is theirs whoever takes the last trick | −3.1 |
| match | خاطفين الولد | your trump Jack is the weakest trump (still worth 20) | −2.8 |
| match | العارفين | they play the hand out with every card known and double exactly the contracts you'd lose (your sun too, at any score) | −2.1 |
| elite | أهل الحكم | the one on your right is dealt the J and 9 of the ground suit: buy sun or they buy hokum | −4.8 |
| elite | المدبّلين | a hand you buy and lose counts double for them | −4.4 |
| boss | أبو قهوة | المدبّلين + حرّاس الإكك | −6.1 |
| boss | السبّاقين | they start 40 ahead | (fixed) |
| boss | المعطّل | your strongest joker is off for the match + أهل الأرض | (depends on your row) |

Margins: the rule-based AI in your seat over 1500 hands; with no rule it's −0.8.
Also rejected: "your first Ace scores nothing" (−2.8, but it's only a smaller score, nothing
to play around — the player found it dull). A rule should change a decision, not a total.
Measured and **rejected**: "they double everything you buy" (+5 for you), "they double on a
lower bar" (+0 to +3), "they double when your hand is weak" (+1 to +5) — even with you kept as
the judged side. Why: a doubled hand is all or nothing (the winner takes the whole hand ×2),
and a buyer usually wins, so any double that doesn't truly KNOW you'll lose hands you more.
Only العارفين (a foreseen play-out) makes doubling a threat — and الحكم المقفول / الوجه البارد
are its counters, which is why the player wanted them kept. Also rejected: "you can't buy
sun" (≈0) and "they always lead" (≈0). Re-measure any new rule the same way before shipping it.

### The map branches (src/roguelike/mapgen.ts)
Like Slay the Spire: 9 rows, 2–3 nodes a row in 3 lanes, each linked to the node above and
diagonally one way per row (so links never cross). Row 0 is all matches, elites from row 3,
shops from row 3 (rare), the row before the boss is all shops, then the boss. A match's
target and gold grow with its row (41 + 10×row, 20 + 3×row). You choose your route: more
fights for more rewards, a ديوانية for a gamble, an elite for rarer spoils.

### السوا is for everyone
The سوا button shows whenever you lead; either way the rest plays itself out. Right keeps the
hand as it falls; **wrong hands the whole hand to the other side** (26 or 16, doubled if
doubled, plus every project — only your own بلوت stays yours; your jokers' bonuses don't count).
The السوا joker only adds a bonus on a right call.

### Jokers are relics (no cap)
Like Slay the Spire's relics there's no limit on how many jokers you hold. The row on the table
and the chips in the shop shrink to fit. (The جيب زيادة upgrade is gone.)

### الديوانية (src/roguelike/events.ts)
Map nodes with a short scene and a choice:
safe, a gamble, or a price now for something later. The events are فنجال المعزّب، الرهان،
الشايب الخبير، البسطة، الورق الملعون and الضيف الثقيل. A choice you can't afford is greyed out
with the reason, and every event has at least one choice that's always open.

### بركات الحوت (src/roguelike/blessings.ts)
At the start of the map the whale offers three **blessings** — one free, two stronger ones
with a price. They're not jokers: they hold for the whole run, never show in a shop, can't be
sold. The player's taste: no blessing that costs a life, and no shop discount.

| Blessing | Gift | Price |
|---|---|---|
| موجة البداية | every match starts 10 ahead | — |
| قلب الحوت | +1 life | — |
| كنز الحوت | 100 gold | the shop shows one joker fewer |
| تاج الحوت | a legendary joker | every match's target +10 |
| بحر المشاريع | your projects ×2 | you can't buy sun (nor call أشكل) |
| صيد وفير | match gold ×1.5 | two spoils after a match instead of three |
| سرب الجوكرات | three commons of one family | your first opponents start 20 ahead |

It appears at the start of the map only (never in the middle).

### شخصيات الخوي (src/roguelike/partners.ts)
The run opens with picking who sits across from you (before الحوت), like picking a
character in Slay the Spire. Each has a perk and a quirk; the table shows their name.

| Partner | Perk | Quirk | Margin/hand (sim, no search AI) |
|---|---|---|---|
| الشايب 👴 | answers your تهريب before cashing his own winners | never doubles | −1.08 |
| المتحمس 🔥 | a hand he buys and makes pays +50% | buys (−10 bar) and doubles (−20 bar) readily; lands خسرانة on you | +0.83 (was −1.14 with no perk) |
| الجفرة 🍀 | always dealt an Ace in his first five (shared deck) | plays by habit (no search AI in the game) | +1.18 |
| الغشيم 🙃 | match gold ×1.5 and one more spoil to choose from | can't read your تهريب, plays weakly (no search AI) | −0.98 |

No partner: −0.84. The sim can't show the search AI's quirks (الجفرة and الغشيم are weaker
in the real game) or a human's deliberate signals (which make الشايب's perk real).

# ⚠️ CRITICAL SYSTEM RULE: THE "SHARED DECK" LAW ⚠️
**NEVER EVER refer to "Your Deck" or "The Player's Deck".**
Baloot does NOT have individual player decks. There is exactly ONE shared 32-card deck in the center of the table. 
1. **The Deal:** All 32 cards are distributed evenly (8 cards per player) across the 4 players (You, Partner, Opponent 1, Opponent 2).
2. **The Symmetry Problem:** If a card is permanently modified, added, or removed, it affects the ENTIRE game. If a 7 is upgraded to an Ace, the opponents have a 50% chance to draw that overpowered Ace in the next round.
3. **No Deleting:** You cannot delete a card. Baloot strictly requires 8 tricks (4 players x 8 cards = 32 cards). Deleting a card breaks the game loop.
4. **Agent Mandate:** Any future game design ideas MUST account for the fact that the deck is shared. If you propose "Deck Modification", you must explicitly explain how the player avoids handing an advantage to the AI.
