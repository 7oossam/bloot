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

# ⚠️ CRITICAL SYSTEM RULE: THE "SHARED DECK" LAW ⚠️
**NEVER EVER refer to "Your Deck" or "The Player's Deck".**
Baloot does NOT have individual player decks. There is exactly ONE shared 32-card deck in the center of the table. 
1. **The Deal:** All 32 cards are distributed evenly (8 cards per player) across the 4 players (You, Partner, Opponent 1, Opponent 2).
2. **The Symmetry Problem:** If a card is permanently modified, added, or removed, it affects the ENTIRE game. If a 7 is upgraded to an Ace, the opponents have a 50% chance to draw that overpowered Ace in the next round.
3. **No Deleting:** You cannot delete a card. Baloot strictly requires 8 tricks (4 players x 8 cards = 32 cards). Deleting a card breaks the game loop.
4. **Agent Mandate:** Any future game design ideas MUST account for the fact that the deck is shared. If you propose "Deck Modification", you must explicitly explain how the player avoids handing an advantage to the AI.
