# Scoring

This document defines the mathematical rules for timeline placements. The system rewards chronological precision, accuracy over time, and fast consecutive answers, while utilizing non-linear decay to strictly prevent score-farming exploits in long games. It was designed by iterating on thousands of simulated games with pre-defined player archetypes to ensure a fun, skill-based experience that still offers hope for underdogs.

All scores and components are rounded to the nearest integer. The final turn score is the sum of correct placement points and consolation points (if applicable). The player's total score is the cumulative sum of all turn scores, plus any completion bonus when they reach their target goal.

## Correct Placements

A correct placement instantly calculates a turn score:

$$\text{Score} = (\text{Base} + \text{Diff}) \times \text{Speed} \times \text{StreakMult}$$

### Base Points ($\text{Base}$)

The guaranteed base value of a correct placement before any bonuses or multipliers. This is the primary tuning constant for the value of simply being correct.

$$\text{Base} = 1000$$

### Difficulty Bonus ($\text{Diff}$)

Rewards chronological difficulty. It is highest when cards are placed inside a short historical window. The reward utilizes an exponential decay curve, ensuring a swift but smooth point penalty for slightly wide gaps, while allowing massive century-wide gaps to still yield a tiny trickle of consolation points.

$$\text{Diff} = \text{round}\left( \text{DiffMax} \times e^{-\text{DecayRate} \times \text{Gap}} \right)$$

- **Total Gap ($\text{Gap}$):** The chronological distance between the two neighboring boundary years. For edge slots, the relevant virtual boundary year is used.
  - Virtual boundary years are calculated as $\text{tracklistMin} - \text{EdgeBoundaryPadding}$ and $\text{tracklistMax} + \text{EdgeBoundaryPadding}$. We set $\text{EdgeBoundaryPadding} = 25$. $\text{tracklistMin}$ may not be lower than then dataset's min year and $\text{tracklistMax}$ may not be higher than the dataset's max year.
- **$\text{DiffMax} = 1000$:** The maximum possible bonus, awarded for threading a flawless 0-year gap.
- **$\text{DecayRate} = 0.0115$:** The exponential decay constant. At this rate, a 10-year gap loses approximately 11% of its value, a 60-year gap loses half of its value (the half-life), and a 200-year gap retains exactly 10%.

| Gap Size (Years) | Difficulty Bonus |
| :--------------- | :--------------- |
| 0                | 1000             |
| 5                | 944              |
| 10               | 891              |
| 25               | 750              |
| 50               | 563              |
| 75               | 422              |
| 100              | 317              |
| 150              | 178              |
| 200              | 100              |
| 300              | 32               |

### Speed Multiplier ($\text{Speed}$)

Scales from $1\times$ (20+ seconds) up to $1.4\times$ (1 second). The quadratic curve forgives slight hesitations but heavily rewards instant instinct. ($\text{Seconds}$ = seconds taken; $\text{SpeedBonus}=0.4$).

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

- **Error Distance ($d_{\text{err}}$):** The absolute chronological distance in years between the drawn card's actual year and the nearest boundary of the incorrect slot. For edge slots, the relevant virtual boundary year (see above) is used.
  - _Example:_ If an `1888` card is placed between `1865` and `1879`, the nearest boundary to the card's true year is 1879. Therefore, $d_{\text{err}} = 1888 - 1879 = 9$ years.
  - _Example 2:_ If a `1943` card is placed on the left edge of the timeline before an `1870` card, the nearest boundary is `1870`. Therefore, $d_{\text{err}} = 1943 - 1870 = 73$ years.
- **Cards Needed ($\text{CardsNeeded}$):** The actual number of correct placements required to finish the game ($\text{Target} - 1$, since every player begins with 1 card automatically on their timeline).
- **Time Fade ($\text{TimeF}$):** Stays at $1.0$ through $3 \times \text{CardsNeeded}$ attempts, then linearly fades to $0$ by $4 \times \text{CardsNeeded}$.

$$\text{TimeF} = \max\left(0, \min\left(1, \frac{4\times\text{CardsNeeded} - \text{Attempts}}{\text{CardsNeeded}}\right)\right)$$

## Completion Bonus

Awarded instantly when a player places their target goal ($\text{Target}$) of cards.

Because every player begins the game with 1 card automatically placed on their timeline, the baseline for efficiency is $\text{CardsNeeded}$. The squared ratio severely punishes players who require excessive attempts, ensuring that an incomplete timeline cannot win. $\text{CompletionRate}=1000$.

$$\text{Completion} = \left(\frac{\text{CardsNeeded}}{\text{Attempts}}\right)^2 \times (\text{CardsNeeded} \times \text{CompletionRate})$$

### Flawless Bonus

If a player successfully completes their timeline without making a single mistake throughout the entire game ($\text{Attempts} == \text{CardsNeeded}$), their mastery is explicitly rewarded with `CompletionFlawlessMultiplier = 1.2` applied directly to the Completion Bonus.

## Simulation Suite

The TypeScript suite in this directory runs seeded Timeline simulations with the real dataset, `TracklistGenerator` filtering, modeled player personas, and one or more `TimelineScoringParameters` presets. See [README.md](README.md) for commands, profiles, metrics, and JSON report details.
