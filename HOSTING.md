# Hosting Quiltfall

Run one Rust server for both players. Phones only need a browser; saved games
live in SQLite on the host. For the rules and player controls, see the
[gameplay guide](README.md).

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

## Fly.io hosting

The deployed app is [quiltfall.fly.dev](https://quiltfall.fly.dev).

The included Dockerfile embeds the browser assets into the Rust binary. The Fly
configuration uses **one shared CPU, 256 MB RAM**, in `iad`, with HTTPS and
**no persistent volume**. SQLite uses `/tmp/quiltfall.db` on the machine's
unmounted, temporary filesystem.

Games, browser identities, rematch offers, and stats are temporary on Fly.
They may be lost when the machine is restarted, redeployed, migrated, or
replaced. Browser cookies can remain after server data is lost; open the home
page and start a new game if an old invite no longer exists. Local play still
uses `data/quiltfall.db` and the backup instructions above.

The machine stops when idle and starts on the next request. The first visit may
take a few seconds. A visible game keeps an event stream open, so close game
tabs when done. Fly charges for compute and outbound traffic; this setup does
not provision paid volumes or a dedicated IPv4 address. Check
[current pricing](https://docs.fly.io/about/pricing).

Install [flyctl](https://docs.fly.io/flyctl/install), then deploy from the
repository root:

```sh
flyctl auth login
# For a new account/app, choose a globally unique name:
flyctl apps create YOUR-UNIQUE-APP-NAME --org personal
# Set app = "YOUR-UNIQUE-APP-NAME" at the top of fly.toml.
flyctl ips allocate-v6
flyctl ips allocate-v4 --shared
flyctl deploy --remote-only --ha=false
flyctl open
```

For the already-created app named in `fly.toml`, skip app creation and IP
allocation; use `flyctl deploy --remote-only --ha=false` for updates. The remote
builder means Docker does not need to be installed on your computer.

Keep exactly one app machine: each machine has its own temporary database.
Do not add a volume, managed database, or additional app machines to this setup.

To inspect the deployment:

```sh
flyctl status
flyctl checks list
flyctl machine list
flyctl volumes list
```

The volumes list should be empty. Local player identities do not transfer to
Fly because cookies are scoped to the hostname; start fresh on the public URL.

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

