# Scoring

This document defines the mathematical rules for timeline placements. The system rewards chronological precision, accuracy over time, and fast consecutive answers, while utilizing non-linear decay to strictly prevent score-farming exploits in long games. It was designed by iterating on thousands of simulated games with pre-defined player archetypes to ensure a fun, skill-based experience that still offers hope for underdogs.

All scores and components are rounded to the nearest integer. The final turn score is the sum of correct placement points and consolation points (if applicable). The player's total score is the cumulative sum of all turn scores, plus any completion bonus when they reach their target goal.

## Correct Placements

A correct placement instantly calculates a turn score:
$$\text{Score} = (\text{Base} + \text{Diff} + \text{Mastery}) \times \text{Speed} \times \text{StreakMult}$$

### Base Points ($\text{Base}$)

The guaranteed base value of a correct placement before any bonuses or multipliers. This is the primary tuning constant for the value of simply being correct.
$$\text{Base} = 1000$$

### Difficulty Bonus ($\text{Diff}$)

Rewards two distinct types of difficulty: placing correctly in a historically dense period, and threading the needle close to a known anchor year. The two terms are additive and independently tunable.

$$\text{Diff} = \underbrace{\text{GapWeight} \times \frac{10}{\text{Gap} + 10}}_{\text{Gap Term}} + \underbrace{\text{PrecisionWeight} \times \frac{10}{d_{\min} + 10}}_{\text{Precision Term}}$$

where $\text{GapWeight} = 1000$ and $\text{PrecisionWeight} = 400$.

- **Total Gap ($\text{Gap}$):** The chronological distance between the two neighboring boundary years around the correct slot. Edge placements use the dataset boundary as the missing neighbor. To prevent degenerate score spikes from near-identical years, $\text{Gap}$ is floored at 25 years after boundary substitution.
- **Nearest Boundary Distance ($d_{\min}$):** Distance from the placed card's year to the nearest **real** boundary card (never the dataset boundary). Edge placements have exactly one real boundary card, so $d_{\min}$ is simply the distance to that card. Each player is dealt a random card at the beginning of the game, so at least one real boundary always exists.
- **Gap Term:** The first term is the primary difficulty signal. It is high when cards must be placed inside a short chronological window, and approaches zero for wide, easy gaps. It is unaffected by where within the gap the card's year falls.
- **Precision Term:** The second term is a supplementary reward for placing a card whose year sits close to an existing boundary. A card dated 1799 placed correctly in a [1600, 1800] slot scores materially more than 1700 in the same slot, because knowing the year to within 1 year of a boundary demonstrates tighter historical knowledge than knowing only the broad era.

### Mastery Bonus ($\text{Mastery}$)

Rewards high historical accuracy. The formula provides exactly 1 "free mistake" grace, after which the bonus decays quadratically. ($\text{Correct}$ = current correct cards; $\text{Attempts}$ = total attempts; $\text{MasteryCap}=500$).
$$\text{Mastery} = \text{MasteryCap} \times \min\left(1, \frac{\text{Correct}}{\max(\text{Correct}, \text{Attempts} - 1)}\right)^2$$

### Speed Multiplier ($\text{Speed}$)

Scales from $1\times$ (20+ seconds) up to $1.25\times$ (1 second). The quadratic curve forgives slight hesitations but heavily rewards instant instinct. ($\text{Seconds}$ = seconds taken; $\text{SpeedBonus}=0.25$).
$$\text{Speed} = 1 + \text{SpeedBonus} \times \left(\frac{\max(0, 20 - \text{Seconds})}{19}\right)^2$$

## Streaks

Consecutive correct answers build a streak ($\text{Streak}$).

- **Multiplier ($\text{StreakMult}$):**
  $$
  \text{StreakMult}(\text{Streak})=
  \begin{cases}
  1.00,& \text{Streak}\le 1\\
  1.10,& \text{Streak}=2\\
  1.35,& \text{Streak}=3\\
  1.55,& \text{Streak}=4\\
  1.75,& \text{Streak}=5\\
  2.00,& \text{Streak}\ge 6
  \end{cases}
  $$
- **Miss Penalty:** A wrong placement decays the streak, ensuring players cannot randomly guess to maintain momentum. It stops short of a full reset to preserve some hope for recovery.
  $$\text{Streak}_{\text{new}} = \max\left(0, \min\left(\lfloor \text{Streak}/2 \rfloor, \text{Streak} - 3\right)\right)$$

## Wrong Placements (Consolation)

Missed attempts yield a minor consolation score. It rewards players who "almost had it", but mathematically fades to $0$ if a game drags on, preventing bot-farming.
$$\text{Consolation} = \max\left(1, \text{round}(75 \times \text{GapF} \times \text{EdgeF})\right) \times \text{TimeF}$$

- **Gap Factor ($\text{GapF}$):** Rewards missing in a narrow window (shrinks to 0 if the gap is $\ge 150$ years).
  $$\text{GapF} = \max\left(0, \frac{150 - \text{Gap}}{150}\right)$$
  - **Edge-slot Gap:** If the correct slot is outside the current timeline, consolation does not use the dataset boundary gap. It uses the distance from the missed card to the single real boundary card ($d_{\text{boundary}}$), so far-out edge misses fade quickly:
    $$\text{Gap} = 4 \times d_{\text{boundary}}$$
- **Edge Factor ($\text{EdgeF}$):** Rewards missing close to the actual correct slot boundary ($d_{\text{err}}$). Drops to 0 if off by $\ge 50$ years.
  $$\text{EdgeF} = \max\left(0, \frac{50 - d_{\text{err}}}{50}\right)$$
- **Time Fade ($\text{TimeF}$):** Stays at $1.0$ through $3 \times \text{Target}$ attempts, then linearly fades to $0$ by $4 \times \text{Target}$.
  $$\text{TimeF} = \max\left(0, \min\left(1, \frac{4\text{Target} - \text{Attempts}}{\text{Target}}\right)\right)$$

## Completion Bonus

Awarded instantly when a player places their target goal ($\text{Target}$) of cards. The squared ratio punishes players who require excessive attempts, preserving solo leaderboard integrity. $\text{CompletionRate}=750$.
$$\text{Completion} = \left(\frac{\text{Target}}{\text{Attempts}}\right)^2 \times (\text{Target} \times \text{CompletionRate})$$
