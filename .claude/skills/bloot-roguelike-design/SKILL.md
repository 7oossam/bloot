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
6. **Anti-synergies are allowed and should be visible.** If two jokers fight each other (الحكم المقفول stops doubling; a doubling build wants it), say so in the text so the player learns rather than feels cheated.

The **Jack (الولد) family** is the model package the rest should copy: الولد المضمون (Supply), الولد المزوّر (Forge), جامع الأولاد (Reward), صيد الولد and الحرقة (Payoffs).

---

## PART 5: The Build Catalog (10 target builds)

✅ = exists in the game. 🆕 = to be made. Builds 6–10 are **skill builds**: they pay for things a strong regular Baloot player already does well (defending, signalling, counting, running tricks, reading a double), so real Baloot skill is a valid way to win a run.

### 1. الزبالة الذهبية — the 7s and 8s build
- ✅ **Underdog**, *Payoff*: your team's 7s and 8s beat Aces.
- 🆕 **الحظ الواطي**, *Supply*: you're always dealt an 8 in your first five cards (level 2: two 8s; level 3: any four 7s/8s become more likely).
- 🆕 **المنزّل**, *Forge*: once a hand, turn one card in your hand into the 8 of its suit.
- 🆕 **ثأر الصغار**, *Reward*: every trick your team wins with a 7 or 8: +3 / +5 / +8.
- ✅ **الأربع الصغار**, *Bonus payoff*: four 7s or 8s make مئة. The Supply makes this reachable.

### 2. الولد — the Jack build (the model package)
- ✅ **الولد المضمون**, *Supply*: always dealt a Jack.
- ✅ **الولد المزوّر**, *Forge*: a card becomes the trump Jack when you buy Hokum.
- ✅ **جامع الأولاد**, *Reward*: points per trick won with a Jack.
- ✅ **صيد الولد** / **الحرقة**, *Payoffs*: winning with the trump Jack steals a card or burns the opponents' best trump.

### 3. ملك السبيت — the spade build
- ✅ **ملك السبيت**, *Payoff*: your spades count as trump, even in Sun.
- ✅ **سارق السبيت**, *Supply*: swap a card for an opponent's spade each hand.
- 🆕 **الصبّاغ**, *Forge*: once a hand, one card in your hand becomes a spade of the same rank (if that spade isn't in your hand already).
- ✅ **كنز السبيت**, *Reward*: points per trick won with a spade.
- ✅ **سبيت دايم**: buy spade Hokum in any round.

### 4. المهندس — the projects build
- ✅ **نص سرا** / **Phantom Card**, *Payoff*: shorter runs count as bigger projects.
- 🆕 **المرتّب**, *Supply*: at the deal, if you're one card away from a سرا, you're dealt that card (from the shared deck).
- ✅ **صانع السرا**, *Reward*: points and gold per سرا.
- ✅ **مهندس المشاريع**: projects ×2 / ×2.5 / ×3.
- ✅ **الصوت العالي**: your projects always count, even under a bigger rival project.

### 5. سيد الأرض — the last-trick build
- ✅ **سيد الأرض**, *Payoff*: take the last trick and you take the whole hand.
- ✅ **الورقة الأخيرة**, *Forge*: your card in the last trick is the top of its suit.
- ✅ **الأرض الذهبية**, *Reward*: the last trick is worth 20 / 30 / 40.
- ✅ **المخلّي**: points for ducking a trick you could have won (saving strength for the end).
- *Skill angle:* a good player already plans the last trick; this build turns that planning into the win condition.

### 6. الحصن — the defender (skill build)
Rewards what good defenders do: making the buyer lose without buying yourself.
- ✅ **الفخ**: when the opponents buy and lose (خسرانة): +6 / +10 / +15.
- 🆕 **الكاسر**: when the opponents buy **Sun** and lose, your result ×2.
- 🆕 **الصبر**: every hand you pass on (don't buy) and your team still scores more than the buyer: +4 gold.
- ✅ **القهوجي**: win a doubled hand, +50% / +100%. A defender who doubles at the right moment cashes in.

### 7. المهرّب — the Tahreeb build (skill build)
Rewards correct signalling to your partner (PART 2.5).
- 🆕 **المترجم**, *Payoff*: your partner always reads your discard signal correctly and leads that suit back.
- 🆕 **الإشارة الذهبية**, *Reward*: when your partner answers your signal and wins that trick, your points for the hand ×1.5.
- 🆕 **البرقية المضمونة**, *Forge*: a برقية is allowed even when you can't promise every trick after it.
- ✅ **عين الشريك**: see your partner's cards, so you know what to ask for.
- *Tier 3 rule-breaker:* once a hand, you choose the suit your partner leads.

### 8. العدّاد — the card counter (skill build)
Rewards remembering what's been played.
- ✅ **ملك الآكه**, *Reward*: points for every trick won with a card you called آكه on.
- 🆕 **الذاكرة**: shows how many cards of each suit are still out (what a counting player keeps in their head).
- 🆕 **الآكه الذهبية**: every correct آكه call pays 2 gold; a wrong call (someone beats it) costs 3 points. Real push-your-luck.
- ✅ **الجاسوس**: see cards from each opponent's hand; counting gets exact.

### 9. الكبوت — run every trick (skill build)
Rewards squeezing the most out of a strong hand, including a real سوا.
- ✅ **ملك الكبوت**, *Payoff*: a كبوت wins the match on the spot.
- 🆕 **السوا**, *Reward*: declare سوا (you lay your cards down, sure of every remaining trick). If it's right: +5 / +8 / +12 and the tricks are counted. If it's wrong, the opponents take the rest.
- 🆕 **الزحف**, *Reward*: +1 point per trick in a row your team wins, growing each trick, resetting when you lose one.
- ✅ **صاحب الحلة**: you always lead the first trick; kaboots start with the lead.

### 10. المقامر — the doubling build (push-your-luck)
Makes الدبل / الثري / الفور / القهوة the heart of the run.
- ✅ **القهوجي**, *Reward*: winning a doubled hand pays +50% / +100%.
- 🆕 **الجريء**, *Payoff*: your team may double in Sun without the 100-points condition.
- 🆕 **رأس المال**, *Reward*: every doubled hand you win pays gold equal to the double level × 5.
- 🆕 **الوجه البارد**, *Supply for bluffs*: the AI can't see your doubles coming. It never doubles back against you after you raise.
- ⚠️ *Anti-synergy:* الحكم المقفول stops anyone doubling against you, which also removes the doubled hands this build feeds on.


# ⚠️ CRITICAL SYSTEM RULE: THE "SHARED DECK" LAW ⚠️
**NEVER EVER refer to "Your Deck" or "The Player's Deck".**
Baloot does NOT have individual player decks. There is exactly ONE shared 32-card deck in the center of the table. 
1. **The Deal:** All 32 cards are distributed evenly (8 cards per player) across the 4 players (You, Partner, Opponent 1, Opponent 2).
2. **The Symmetry Problem:** If a card is permanently modified, added, or removed, it affects the ENTIRE game. If a 7 is upgraded to an Ace, the opponents have a 50% chance to draw that overpowered Ace in the next round.
3. **No Deleting:** You cannot delete a card. Baloot strictly requires 8 tricks (4 players x 8 cards = 32 cards). Deleting a card breaks the game loop.
4. **Agent Mandate:** Any future game design ideas MUST account for the fact that the deck is shared. If you propose "Deck Modification", you must explicitly explain how the player avoids handing an advantage to the AI.
