# Quiltfall

A cozy browser game for two people: cats, a patchwork quilt, and a little
friendly rivalry. Rust server, SQLite saves, original SVG art, Open Props,
Animate.css, and animations that show each placement and nudge.

<p align="center">
  <img src="web/hero.svg" width="360" alt="Peach and sage cats perched on a blue patchwork quilt">
</p>

<p align="center">
  <img src="docs/images/quiltfall-game.png" width="260" alt="Quiltfall on a phone: two players, a blue quilt, and kittens ready to nudge">
  <img src="docs/images/quiltfall-celebration.png" width="260" alt="The victory screen with a crowned cat and two celebrating kittens">
</p>

**Two phones · One invite · Saved after every move**

## Quick start

### 1. Prepare the host computer

Install **Rust 1.95 or newer** using [rustup](https://rustup.rs/).
Check the installation with `rustc --version` and `cargo --version`.
If you already use rustup, `rustup update stable` updates your toolchain.

Download or clone this repository, then open a terminal in its root directory
(the folder containing `Cargo.toml`). No separate SQLite installation, frontend
build, or Node installation is needed to play: the server embeds the checked-in
browser assets and CSS libraries.

### 2. Start the server

```sh
cargo run --locked
```

The first run downloads Rust dependencies and compiles the app, so give it a
little time. Once the terminal says **Quiltfall is ready**, open
[http://localhost:3000](http://localhost:3000) on the computer. The server creates
`data/quiltfall.db` and applies its database migrations automatically.

Leave this terminal running while you play. Press **Ctrl-C** to stop; run the
same command from the same directory to resume with your existing saves.

### 3. Connect both phones

1. Connect both phones and the computer to the same Wi-Fi.
2. Find the computer's local address. On a Mac with Wi-Fi on `en0`:
   `ipconfig getifaddr en0`. You can also find it in System Settings → Wi-Fi →
   Details → TCP/IP.
3. On your phone, open `http://YOUR-COMPUTER-IP:3000`.
4. Enter your name, start a game, and send the invite link to your partner.
5. Your partner opens the link in their browser and taps **Join the quilt**.
6. After a game, choose **Play again with your partner**. They can accept on the
   finished-game screen; both phones open the next quilt without another invite.
   Offers survive refreshes, and the original game stays in your history.

For example, if your computer's address is `192.168.1.42`, both phones should
open `http://192.168.1.42:3000`. On Linux, use `hostname -I` to find the local
address; on Windows, run `ipconfig` and look for the Wi-Fi adapter's IPv4 address.
Use the address of the computer running Quiltfall.

Use the same computer address consistently so your browser remembers you.
`localhost` refers to each phone itself and won't reach your computer. If macOS
asks about incoming connections, allow Quiltfall. Guest Wi-Fi networks may
prevent devices from talking to each other. Keep the computer awake and the
server running while playing.

On the computer you can use `http://localhost:3000`. To simulate two players,
open a second browser or a private browsing window. Two ordinary tabs in the
same browser share one player identity.

### Run a release build

For a longer-running host, build the optimized binary once and start it directly.
See the [Cargo guide](https://doc.rust-lang.org/book/ch01-03-hello-cargo.html#building-for-release)
for release builds.

```sh
cargo build --locked --release
./target/release/quiltfall
```

On Windows, use `.\target\release\quiltfall.exe`. Run from the repository root
to keep using the same relative `data/` directory. Browser assets are compiled
into the binary, so rebuild and restart after changing files in `web/`.

## What you get

- A 6×6 quilt, eight kittens per player, graduation into cats, and both winning
  conditions. The server enforces the rules.
- Pick a kitten or cat, then tap an empty square. Moves are immediate and final.
- When all eight pieces are on the quilt, tap a ringed kitten to upgrade it
  immediately, or tap an adult cat to return it to your pool. Groups of three
  still use highlighted selection and confirmation.
- Bouncy placements, simultaneous hopping nudges, rotating off-bed tumbles,
  graduation and win animations. A placement followed by nudges takes about
  1.4 seconds. Reduced-motion
  preferences are respected.
- Saved games that survive phone sleep, refresh and server restart.
- Ongoing games, past results, games played, wins and losses. Resignation counts
  as a loss; unfinished games don't count toward results.
- Invite links without accounts. Each browser's persistent cookie remembers
  its player. Clearing it, using private browsing, switching browser, or changing
  host address creates a new identity; names alone do not recover a player.

The Copy link button uses the Clipboard API when available and a browser copy
fallback on local HTTP. If both operations are blocked, it explains that copying
failed and selects the entire link: touch and hold to copy it manually. Share invitations
privately; the first invited person to explicitly join gets the second seat.

## Configuration and saves

| Variable | Default | Purpose |
| --- | --- | --- |
| `BIND_ADDR` | `0.0.0.0:3000` | Listen address, reachable on the local network |
| `DATABASE_URL` | `sqlite://data/quiltfall.db` | SQLite file; custom parent directories must exist |
| `COOKIE_SECURE` | `false` | Set to `true` for HTTPS hosting |
| `RUST_LOG` | `info` | Server log level |

To use another port on macOS or Linux:

```sh
BIND_ADDR=0.0.0.0:4000 cargo run --locked
```

Then use port `4000` in both the computer and phone URLs. In PowerShell, set
`$env:BIND_ADDR = "0.0.0.0:4000"` before running `cargo run --locked`.

To keep saves in a different directory on macOS or Linux:

```sh
mkdir -p "$HOME/quiltfall-data"
DATABASE_URL="sqlite://$HOME/quiltfall-data/quiltfall.db" cargo run --locked
```

Use that same `DATABASE_URL` each time you start the server. Keep `COOKIE_SECURE`
unset for local HTTP play; HTTPS hosting should set it to `true`.

Schema migrations run at startup. Accepted actions are committed to SQLite
before being published to either phone. Stale submissions are rejected and the
client reloads the saved board instead of retrying a potentially accepted move.

To back up locally, stop the server with Ctrl-C, copy `data/quiltfall.db` somewhere
safe, then restart. To restore, stop the server, replace the database with the
backup, then restart. A database backup contains identities and results; the
matching browser cookie is still required to resume as an existing player.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `cargo: command not found` | Install Rust with rustup, then reopen your terminal. |
| The build reports a missing linker | Install the host's compiler tools: Xcode Command Line Tools on macOS (`xcode-select --install`), a C compiler/build tools on Linux, or the C++ build tools requested by rustup on Windows. |
| `Address already in use` | Stop the other server or set `BIND_ADDR` to a different port as shown above. |
| The computer works, but a phone cannot connect | Use the computer's Wi-Fi IP, the correct port, and the same network. Allow incoming connections through its firewall and avoid isolated guest Wi-Fi. |
| The invite opens as the same player | Use separate phones, browsers, or a private window. Tabs in one browser share a player cookie. |
| Your games appear to be missing | Check the hostname, browser cookies, working directory, and `DATABASE_URL`. Each browser identity and database has its own history. |
| A custom database cannot open | Create its parent directory first and check that the server can write there. |

To check whether the server is responding, open `/health` on the same host and
port, or run `curl http://localhost:3000/health`. A healthy server replies `ok`.

## Optional Fly.io hosting

The included Dockerfile embeds the browser assets into the Rust binary. The Fly
configuration uses one small machine in `iad`, HTTPS, and a 1 GB volume at
`/data`. Fly's root filesystem is ephemeral, so the SQLite file belongs on the
volume. This intentionally accepts downtime during deployment and a single
machine failure; it does not implement replication.

Fly.io has no ongoing free tier for new organizations. As checked October 6,
2026, a 256 MB machine running continuously in `iad` costs $2.19 per 30 days,
plus $0.15 for a 1 GB volume and outbound traffic. Auto-stop can reduce compute
usage. A visible game has an open event stream, so close the game tabs when done.
See [current pricing](https://docs.fly.io/about/pricing) and
[volume documentation](https://docs.fly.io/volumes/overview).

Install [flyctl](https://docs.fly.io/flyctl/install), then run these commands
from the repository root when you choose to deploy:

```sh
flyctl auth login
flyctl launch --copy-config --no-deploy --ha=false --name YOUR-UNIQUE-APP-NAME
flyctl volumes create quiltfall_data --region iad --size 1
flyctl deploy --ha=false
flyctl open
```

Choose a globally unique app name and keep the supplied mounts, environment,
port and machine settings. Skip provisioning managed Postgres or Redis; the
application uses SQLite. If Fly Launch already creates the named 1 GB volume,
reuse it rather than creating a second one (`flyctl volumes list`). Keep daily
volume snapshots enabled and make separate backups of games you care about.
Deploy one machine only: additional independent SQLite volumes would create
separate histories. Automatic startup restores the latest committed board.

Local identities don't automatically transfer to a new Fly hostname because
cookies are scoped to the original host. Start fresh there in the first version.
No Fly resources were created as part of development. The container configuration
is supplied for later; Docker wasn't installed in the development environment,
so its image build has not been exercised here.

## Development

Install a current **Node.js LTS** release for the checks below. `npm ci` installs
exactly the versions in the lockfile. Playwright also needs its browser binaries;
see the [Playwright installation guide](https://playwright.dev/docs/intro).
On Linux, use `npx playwright install --with-deps chromium webkit` if system
browser dependencies are missing.

```sh
npm ci
npx playwright install chromium webkit
cargo build
cargo test
cargo fmt --check
cargo clippy --all-targets -- -D warnings
npm test
npm run lint
npm run format:check
npm run test:browser
```

Browser tests run an isolated server on port 3001 and use an ignored SQLite file
under `target/browser-data/`. They cover distinct players, nudges, refresh,
offline/reconnect, graduation selection, resignation/results, 320 px layouts,
reduced motion and axe accessibility checks in Chromium and WebKit. Browser
emulation is not a substitute for checking your own physical phones.

The rules are in `src/game.rs`, HTTP/persistence in `src/server.rs`, and the
browser UI in `web/`. HTTP actions include the expected game revision; server-sent
events carry complete snapshots and animation effects. No game rules run in the
browser. CSS library versions are locked and vendored with their licenses.
After updating those packages, run `npm run vendor:css` to refresh the copies.

