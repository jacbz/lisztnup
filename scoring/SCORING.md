# Scoring

This document defines the mathematical rules for timeline placements. The system rewards chronological precision, accuracy over time, and fast consecutive answers, while utilizing non-linear decay to strictly prevent score-farming exploits in long games. It was designed by iterating on thousands of simulated games with pre-defined player archetypes to ensure a fun, skill-based experience that still offers hope for underdogs.

All scores and components are rounded to the nearest integer. The final turn score is the sum of correct placement points and consolation points (if applicable). The player's total score is the cumulative sum of all turn scores, plus any completion bonus when they reach their target goal. Production constants live in `PRODUCTION_TIMELINE_SCORING` so gameplay and simulations use the same parameters.

## Correct Placements

A correct placement instantly calculates a turn score:

$$\text{Score} = (\text{Base} + \text{Diff}) \times \text{Speed} \times \text{StreakMult}$$

### Base Points ($\text{Base}$)

The guaranteed base value of a correct placement before any bonuses or multipliers. This is the primary tuning constant for the value of simply being correct.

$$\text{Base} = 1000$$

### Difficulty Bonus ($\text{Diff}$)

Rewards chronological difficulty. It is highest when cards are placed inside a short historical window. The reward utilizes a Weibull decay curve, ensuring a noticeable initial point penalty for slightly wide gaps while maintaining a generous middle ground, before dropping off an aggressive mathematical cliff for gaps wider than 50 years.

$$\text{Diff} = \text{round}\left( \text{DiffMax} \times e^{-\text{DecayRate} \times \text{Gap}^{\text{CliffShape}}} \right)$$

- **Total Gap ($\text{Gap}$):** The chronological distance between the two neighboring boundary years around the correct slot. Edge placements use the dataset boundary as the missing neighbor.
- **$\text{DiffMax} = 1000$:** The maximum possible bonus, awarded for threading a flawless 0-year gap.
- **$\text{DecayRate} = 0.004$:** The scale parameter. Controls the overall "speed" of the point loss. Increasing this value causes points to drop faster across all gap sizes. Decreasing it makes the entire timeline more forgiving.
- **$\text{CliffShape} = 1.4$:** The shape parameter. Controls the "bend" of the curve. A value of $1.0$ would yield a standard steady exponential drop, leaving wide gaps too highly rewarded. A value $> 1.0$ creates the "cliff" effect. It forces the curve to stay relatively flat for small gaps (protecting the 0–25 year range) before accelerating downward to aggressively crush the value of wide gaps (75+ years).

| Gap Size (Years) | Difficulty Bonus |
| :--------------- | :--------------- |
| 0                | 1000             |
| 5                | 963              |
| 10               | 904              |
| 25               | 696              |
| 50               | 384              |
| 75               | 185              |
| 100              | 80               |
| 150+             | < 15             |

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

Missed attempts yield a minor consolation score. It strictly evaluates chronological accuracy using a half-life decay, rewarding players who "almost had it" but mathematically fading to $0$ if a game drags on to prevent bot-farming.

$$\text{Consolation} = \text{round}\left(100 \times 0.5^{\frac{d_{\text{err}}}{20}}\right) \times \text{TimeF}$$

- **Error Distance ($d_{\text{err}}$):** The absolute chronological distance in years between the drawn card's actual year and the nearest boundary of the incorrect slot the player chose.
  - _Example:_ If an `1888` card is placed between `1865` and `1879`, the nearest boundary to the card's true year is 1879. Therefore, $d_{\text{err}} = 1888 - 1879 = 9$ years.
  - _Example 2:_ If a `1943` card is placed on the left edge of the timeline before an `1870` card, the only valid boundary of that chosen slot is 1870. Therefore, $d_{\text{err}} = 1943 - 1870 = 73$ years.
- **Cards Needed ($\text{CardsNeeded}$):** The actual number of correct placements required to finish the game ($\text{Target} - 1$, since every player begins with 1 card automatically on their timeline).
- **Time Fade ($\text{TimeF}$):** Stays at $1.0$ through $3 \times \text{CardsNeeded}$ attempts, then linearly fades to $0$ by $4 \times \text{CardsNeeded}$.

$$\text{TimeF} = \max\left(0, \min\left(1, \frac{4\times\text{CardsNeeded} - \text{Attempts}}{\text{CardsNeeded}}\right)\right)$$

## Completion Bonus

Awarded instantly when a player places their target goal ($\text{Target}$) of cards.

Because every player begins the game with 1 card automatically placed on their timeline, the baseline for efficiency is $\text{CardsNeeded}$. The squared ratio severely punishes players who require excessive attempts, ensuring that an incomplete timeline cannot win. $\text{CompletionRate}=1000$.

$$\text{Completion} = \left(\frac{\text{CardsNeeded}}{\text{Attempts}}\right)^2 \times (\text{Target} \times \text{CompletionRate})$$

### Flawless Bonus

If a player successfully completes their timeline without making a single mistake throughout the entire game ($\text{Attempts} == \text{CardsNeeded}$), their mastery is explicitly rewarded with `CompletionFlawlessMultiplier = 1.2` applied directly to the Completion Bonus.

## Simulation Suite

The TypeScript suite in this directory runs seeded Timeline simulations with the real dataset, `TracklistGenerator` filtering, modeled player personas, and one or more `TimelineScoringParameters` presets. See [README.md](README.md) for commands, profiles, metrics, and JSON report details.
