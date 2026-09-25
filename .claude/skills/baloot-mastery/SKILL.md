---
name: baloot-mastery
description: "Comprehensive knowledge base of Baloot mechanics, scoring, bidding, projects, and Tahreeb."
---

# Baloot Mastery & Game Mechanics

This document summarises Baloot logic. The official regulation (`docs/baloot-regulation.md`) is the source of truth; where anything here disagrees with it, the regulation wins. The `baloot-rules` skill explains how the code follows it.

## 1. Game Flow & Bidding (Meshytar)
- **Deck**: 32 cards (7, 8, 9, 10, J, Q, K, A in 4 suits).
- **Tricks**: 8 tricks per round.
- **Bidding Phase 1**: Bidding on the ground card's suit (Sun or Hokum).
- **Bidding Phase 2**: Bidding on any of the other 3 suits (Sun or Hokum).
- **Ashkal (أشكل)**: Only the dealer and the player on the dealer's left may call it. The caller buys **Sun** (the caller is the buyer), and the ground card goes to the caller's partner.

## 2. Card Hierarchy & Values
| Rank | Sun Points | Hokum (Trump) Points |
|------|------------|----------------------|
| **J** | 2 | **20** |
| **9** | 0 | **14** |
| **A** | 11 | 11 |
| **10** | 10 | 10 |
| **K** | 4 | 4 |
| **Q** | 3 | 3 |
| **8** | 0 | 0 |
| **7** | 0 | 0 |

*(Note: In Hokum, non-trump suits follow the Sun hierarchy and points).*

## 3. Scoring & Rounding
- **Only the non-buyer is counted** (العدّ لغير المشتري). Round the non-buyer's points as below; the buyer takes the rest of the hand value.
- **Sun Total**: 120 (cards) + 10 (Last Trick) = 130.
  - Divide by 10 and multiply by 2 = **26 Points**.
  - **Rounding**: 1-4 rounds DOWN, 5-9 rounds UP (e.g., 75 = 80 = 8 x 2 = 16 points).
- **Hokum Total**: 152 (cards) + 10 (Last Trick) = 162.
  - Divide by 10 = **16 Points**.
  - **Rounding**: 1-5 rounds DOWN, 6-9 rounds UP (e.g., 75 = 70 = 7 points).
- **Khasara (Loss)**: The buyer loses when the non-buyer's points (cards + last trick + raw project values) are MORE than the buyer's. With no projects, the non-buyer needs **82+ in Hokum** (81 is a tie) or **66+ in Sun** (65 is a tie). On a loss, the non-buyer takes the whole hand (16 / 26) and all projects; Baloot stays with whoever holds it.
  - Raw project values used in this comparison: Sira 20, Khamsin 50, Miya 100, Arbaamiya 200, Baloot 20.
- **Kaboot (كبوت)**: Winning all 8 tricks. Sun = 44 points. Hokum = 25 points.

## 4. Doubling (Gahwa / Gaid)
Doubling multiplies the score, assuming the buying team loses. If the buying team wins, they get the doubled score.
- **Dabal (دبل)**: x2 (Sun: 52, Hokum: 32).
- **Thri (ثري)**: x3 (Sun: 78, Hokum: 48).
- **Four (فور)**: x4 (Sun: 104, Hokum: 64).
- **Gahwa (قهوة)**: Instant win (Match over, 152 points).
- *Sun Double Rule*: Sun allows Dabal only (no Thri, Four or Gahwa), and only when the doubling team has **100 or less** and the buying team has **more than 100**.
- In Hokum, Dabal is for the defenders, Thri for the buyer, Four for the defenders, Gahwa for the buyer. A tie in points goes against whoever made the last raise.

## 5. Projects (Mashareea - مشاريع)
Projects are declared in the first trick and revealed in the second trick. Only the team with the largest project scores their projects. The score values below are for Hokum; in Sun they double (Sira 4, Khamsin 10, Miya 20), and Arbaamiya is 40.
1. **Sira (سرا)**: 3 consecutive cards in a suit. (20 pts / 2 in score)
2. **Khamsin (خمسين)**: 4 consecutive cards. (50 pts / 5 in score)
3. **Miya (مية)**: 5 consecutive cards, OR 4-of-a-kind of 10, J, Q or K (in Sun and Hokum), OR 4 Aces in Hokum. (100 pts / 10 in score)
4. **Arbaamiya (أربعمية)**: 4 Aces in **Sun only**. (Called 400; counts as 200 raw / 40 in score)
5. **Baloot (بلوت)**: King & Queen of the Trump suit. Declared during play, always scores (20 pts / 2 in score) unless hidden inside a sequence project.

## 6. Tahreeb (التهريب - Signaling/Discarding)
Tahreeb is discarding a card you don't need, when you can't follow the led suit, so your partner learns what you do need. The full rules are in `docs/baloot-guide.md` §4 (from the player's video); they hold about 80% of the time, so read them as strong hints.
- **Brother suit (أخو اللون)**: ♥/♦ are red, ♠/♣ black. A discarded suit is NOT wanted; it asks for its brother (discard ♦ = "I want ♥").
- **Both suits of one colour**: discarding from both asks for the other colour.
- **Discarding the led suit's brother** (led ♦, discard ♥): asks for the other colour.
- **Bottom-to-top (من تحت لفوق)**: climbing in one suit (7, then 8, then Q) means "I WANT this suit" and overrides the rules above.
- **Top-to-bottom (من فوق لتحت)**: coming down (10, J, 9, 7) means "I don't want it"; apply the rules above.
- **Ace discard (برقية)**: stop everything and lead that suit back at once; the partner holds the rest.
- **Answering**: lead your biggest card of the suit your partner wants.
- **Don't leave a 10 bare**: with 10 + a small card (no Ace), never discard the small card.

## 7. Sawa (سوا)
If a player knows they are guaranteed to win all remaining tricks based on the cards left in their hand, they can declare "Sawa" and lay their cards down to speed up the game.

# ⚠️ CRITICAL SYSTEM RULE: THE "SHARED DECK" LAW ⚠️
**NEVER EVER refer to "Your Deck" or "The Player's Deck".**
Baloot does NOT have individual player decks. There is exactly ONE shared 32-card deck in the center of the table. 
1. **The Deal:** All 32 cards are distributed evenly (8 cards per player) across the 4 players (You, Partner, Opponent 1, Opponent 2).
2. **The Symmetry Problem:** If a card is permanently modified, added, or removed, it affects the ENTIRE game. If a 7 is upgraded to an Ace, the opponents have a 50% chance to draw that overpowered Ace in the next round.
3. **No Deleting:** You cannot delete a card. Baloot strictly requires 8 tricks (4 players x 8 cards = 32 cards). Deleting a card breaks the game loop.
4. **Agent Mandate:** Any future game design ideas MUST account for the fact that the deck is shared. If you propose "Deck Modification", you must explicitly explain how the player avoids handing an advantage to the AI.
