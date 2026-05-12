[![Stargazers][stars-shield]][stars-url]
[![Forks][forks-shield]][forks-url]
[![Issues][issues-shield]][issues-url]
[![Contributors][contributors-shield]][contributors-url]
[![Apache License][license-shield]][license-url]

<div align="center">
  <h3 align="center">Liszt’n Up!</h3>

  <p align="center">
    The Classical Music Guessing Game.
    <br />
    <a href="https://lisztnup.com/"><strong>Play »</strong></a>
  </p>
  <a href="https://lisztnup.com/">
    <img src="https://i.imgur.com/YPbd1Lq.png" width="600px" alt="Liszt’n Up!"/>
  </a>
</div>

## About

**_Liszt’n Up!_** is a web-based party game designed for classical music enthusiasts. Inspired by mechanics from board games like _Hitster_, players compete to guess composers, works, and eras, or place tracks on a timeline.

The game is built on a massive dataset of more than 10,500 works from over 900 composers sourced from [MusicBrainz](https://musicbrainz.org/), totaling 27,000+ tracks (each work may contribute multiple movements/parts). Rather than manual curation, the system filters works based on the number of available recordings. Predefined tracklists are generated automatically, with only the Beginner tracklist being manually curated. Users can also create custom tracklists from the entire library.

Designed as a modern web app, _Liszt’n Up!_ is optimized for tablet usage (ideal for placing in the center of a table during a game night) and includes a custom audio engine that performs real-time volume normalization for a consistent listening experience.

### Game Modes

|                                                                            Timeline                                                                            |                                                                  Buzzer                                                                   |                                                                              Bingo                                                                               |                                                                                    Classic                                                                                     |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| <img src="https://i.imgur.com/4PzRT3w.png" width="300" alt="Timeline Mode"><br><br>Build a chronological timeline by placing tracks in the correct year order. | <img src="https://i.imgur.com/MBdGu6j.png" width="300" alt="Buzzer Mode"><br><br>Multiplayer speed round. Hit the buzzer first to answer. | <img src="https://i.imgur.com/jdbgY8N.png" width="300" alt="Bingo Mode"><br><br>Players generate unique Bingo grids on their own phones and mark off categories. | <img src="https://i.imgur.com/XsckCOQ.png" width="300" alt="Classic Mode"><br><br>Listen to a track and guess the Composer, Work, or Era. Harder categories yield more points. |

## Tech Stack

- **Framework:** [SvelteKit](https://kit.svelte.dev/) (Svelte 5 with Runes) + Cloudflare Pages & D1 (Analytics)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **State Management:** Svelte Stores & LocalStorage persistence
- **Audio:** Web Audio API (with custom LUFS normalization implementation)
- **Icons:** Lucide Svelte
- **I18n:** `svelte-i18n`

> [!IMPORTANT]
> This project relies on the Deezer API for audio previews. Usage is subject to Deezer's Terms of Service. Commercial use of this application is prohibited without explicit permission from rightsholders.

## Getting Started

To get a local copy up and running, follow these steps.

### Prerequisites

- Node.js (Latest LTS recommended)
- pnpm

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/jacbz/lisztnup.git
    cd lisztnup
    ```

2.  Install dependencies:

    ```bash
    pnpm install
    ```

3.  Start the development server:

    ```bash
    pnpm dev
    ```

4.  Open [http://localhost:5173](http://localhost:5173) in your browser.

> [!NOTE]
> **Browser Compatibility:** To bypass Web Audio API autoplay restrictions on WebKit, the game automatically falls back to standard HTML5 Audio on Safari.

### Dataset Generation

Unlike many trivia games with manually curated lists, _Liszt’n Up!_ uses an algorithmic approach to generate its library, with only little manual tweaking. You can inspect the generation logic in the [`/data`](data) directory. The build process compiles this into a compressed `lisztnup.json` file served to the client.

### Analytics Database (Optional)

The game works fully without a dedicated server, but includes an optional backend (leaderboard, pageviews, game sessions, feedback, problem reports) via Cloudflare D1. To set it up:

1. Install the [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/):

   ```bash
   pnpm add -g wrangler
   ```

2. Create a D1 database:

   ```bash
   wrangler d1 create lisztnup-analytics
   ```

3. Update `wrangler.toml` with the `database_id` from the output.

4. Initialize the schema:

   ```bash
   wrangler d1 execute lisztnup-analytics --file=database.sql
   ```

5. (Optional) Copy the remote database into your local D1:

   ```bash
   wrangler d1 export lisztnup-analytics --remote --output=./d1-remote.sql
   wrangler d1 execute lisztnup-analytics --local --file=./d1-remote.sql
   ```

6. (Optional) For Telegram notifications on feedback/reports, set the `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` secrets:

   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put TELEGRAM_CHAT_ID
   ```

Without the D1 binding, the app runs normally — analytics endpoints return 503 and the client silently ignores failures.

> [!NOTE]
> **Privacy:** Analytics are GDPR-compliant — no personal data is stored. IP addresses are hashed with a daily-rotating salt (SHA-256) and immediately discarded. No cookies, no tracking pixels, no third-party analytics.

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are greatly appreciated.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

[build-shield]: https://img.shields.io/github/actions/workflow/status/jacbz/lisztnup/main.yml?style=for-the-badge
[contributors-shield]: https://img.shields.io/github/contributors/jacbz/lisztnup?style=for-the-badge
[contributors-url]: https://github.com/jacbz/lisztnup/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/jacbz/lisztnup?style=for-the-badge
[forks-url]: https://github.com/jacbz/lisztnup/network/members
[stars-shield]: https://img.shields.io/github/stars/jacbz/lisztnup?style=for-the-badge
[stars-url]: https://github.com/jacbz/lisztnup/stargazers
[issues-shield]: https://img.shields.io/github/issues/jacbz/lisztnup?style=for-the-badge
[issues-url]: https://github.com/jacbz/lisztnup/issues
[license-shield]: https://img.shields.io/github/license/jacbz/lisztnup?style=for-the-badge
[license-url]: https://github.com/jacbz/lisztnup/blob/main/LICENSE
