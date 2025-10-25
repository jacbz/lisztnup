# Liszt'n Up! 🎵

A serverless, web-based classical music guessing game inspired by Hitster. Optimized for tablet touch interaction and designed for local multiplayer fun!

## Features

- 🎼 **Extensive Music Library**: Access thousands of classical works from hundreds of composers
- 🎡 **Interactive Spinning Wheel**: Touch-friendly wheel to select guess categories
- 🎹 **Multiple Game Modes**: Piano, Concerto, Chamber, Ballet, Opera, or mix them all
- 🎯 **Customizable Settings**: Filter by time period, composer, or work type
- 🌙 **Dark Mode Design**: Clean neon aesthetic optimized for tablets
- 📱 **Fully Responsive**: Works great on tablets in landscape or portrait
- 💾 **Serverless**: Runs entirely in the browser - no backend needed!

## Tech Stack

- **Framework**: SvelteKit 2.x with TypeScript
- **Styling**: Tailwind CSS 4.x
- **Icons**: Lucide Svelte
- **Audio**: Deezer Widget API
- **State**: Svelte 5 Stores

## Project Structure

```
lisztnup/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── game/          # Game-specific components
│   │   │   │   ├── GameScreen.svelte
│   │   │   │   ├── SpinningWheel.svelte
│   │   │   │   └── RevealPopup.svelte
│   │   │   └── ui/            # UI components
│   │   │       ├── LoadingScreen.svelte
│   │   │       ├── HomeScreen.svelte
│   │   │       ├── SettingsScreen.svelte
│   │   │       └── PlayerControl.svelte
│   │   ├── services/          # Business logic
│   │   │   ├── TracklistGenerator.ts
│   │   │   ├── SettingsService.ts
│   │   │   └── DeezerPlayer.ts
│   │   ├── stores/            # Svelte stores
│   │   │   ├── gameData.ts
│   │   │   ├── settings.ts
│   │   │   └── gameState.ts
│   │   ├── types/             # TypeScript types
│   │   │   ├── composer.ts
│   │   │   ├── work.ts
│   │   │   ├── track.ts
│   │   │   └── settings.ts
│   │   └── utils/             # Utilities
│   │       ├── formatters.ts
│   │       └── random.ts
│   └── routes/                # SvelteKit routes
│       ├── +layout.svelte
│       └── +page.svelte
├── static/
│   └── lisztnup.json          # Music data (2.5MB)
└── .vscode/                   # VS Code configs
    ├── launch.json
    ├── tasks.json
    └── settings.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd lisztnup
```

2. Install dependencies:

```bash
npm install
```

3. Ensure `static/lisztnup.json` exists with your music data

4. Start the development server:

```bash
npm run dev
```

5. Open your browser to `http://localhost:5173`

### Development with VS Code

The project includes VS Code launch configurations. To debug:

1. Open the project in VS Code
2. Press `F5` or go to Run & Debug
3. Select "Launch Chrome (Dev Server)"
4. The browser will open automatically with debugging enabled

**Note**: Never launch the debugger on your own - always let the user start it manually.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run check` - Run type checking
- `npm run lint` - Lint code
- `npm run format` - Format code with Prettier

## How to Play

1. **Home Screen**: Press START to begin a new game
2. **Spin the Wheel**: Swipe or tap the wheel to spin
3. **Listen**: Press play to hear a classical music excerpt
4. **Guess**: The wheel selects what you need to guess:
   - Composer name
   - Decade of composition
   - Exact year
   - Work name
   - Type of composition
5. **Reveal**: After guessing, press the center button to see the answer
6. **Next Round**: Continue through all tracks

## Settings

- **Number of Tracks**: Choose how many rounds to play (5-50)
- **Presets**:
  - Default: All music
  - Piano: Piano works only
  - Concerto: Concertos only
  - Chamber: Chamber music only
  - Ballet: Ballet music only
  - Opera: Opera only
  - Custom: Mix categories with custom weights

### Custom Settings

In custom mode, you can:

- Adjust category weights (0-10)
- Set to 0 to exclude a category
- Higher weights = more likely to appear

## Architecture

### Services

**TracklistGenerator**: Creates weighted random track selections based on user settings. Uses logarithmic weighting for composers to prevent over-representation.

**SettingsService**: Manages settings persistence via localStorage.

**DeezerPlayer**: Abstracts Deezer iframe API for audio playback.

### Stores

**gameData**: Holds the loaded music database (~2.5MB JSON)

**settings**: User preferences (tracks, presets, filters)

**gameState**: Current app state (loading/home/settings/game)

**tracklist**: Current game's track queue

**currentRound**: Active round state

## Data Format

The `lisztnup.json` file structure:

```json
{
  "composers": [
    {
      "gid": "unique-id",
      "name": "Bach, Johann Sebastian",
      "birth_year": 1685,
      "death_year": 1750
    }
  ],
  "works": {
    "piano": [...],
    "concerto": [...],
    "chamber": [...],
    "ballet": [...],
    "opera": [...],
    "orchestral": [...],
    "vocal": [...],
    "unknown": [...]
  }
}
```

Each work contains:

```json
{
	"gid": "work-id",
	"composer": "composer-gid",
	"name": "Work Title",
	"type": "piano",
	"begin_year": 1800,
	"end_year": 1805,
	"score": 100,
	"parts": [
		{
			"name": "Movement Name",
			"deezer": 123456,
			"score": 50
		}
	]
}
```

## Styling

The app uses a dark-mode-first "clean neon" aesthetic:

- **Colors**: Cyan (#06b6d4) and Purple (#a855f7) gradients
- **Glow Effects**: CSS shadows for neon appearance
- **Typography**: System fonts optimized for readability
- **Animations**: Smooth transitions and physics-based wheel spinning

## Browser Support

- Modern Chrome/Edge (recommended for debugging)
- Firefox
- Safari (iOS/macOS)

Optimized for tablet viewports (768px+) but works on all screen sizes.

## License

See LICENSE file for details.

## Credits

Built with SvelteKit, Tailwind CSS, and Lucide Icons.
Music data sourced from MusicBrainz and Deezer APIs.
