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
| `PUBLIC_ORIGIN` | `http://localhost:3000` | Public HTTP(S) origin for link previews |
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

Production runs one static LiteFS primary in `iad`, with one shared CPU and
256 MiB RAM. The encrypted 1 GB `quiltfall_data` Fly volume is mounted at
`/data`; LiteFS stores its replication files in `/data/litefs` and exposes
`/litefs/quiltfall.db` to the app. Keep exactly one machine. There is no replica
or automatic failover. Local `cargo run` still uses `data/quiltfall.db`.

Accepted moves, sessions, rematches and results survive container replacement.
SIGTERM rejects new requests, closes event streams and drains admitted requests
for up to ten seconds. Open game tabs pause and automatically read the latest
saved snapshot before reconnecting. A redeploy can briefly interrupt connections.
Keep the same browser and its cookie: a name cannot recover a lost session.
`/game/:id` resumes a participant; `/invite/:id` offers the second seat explicitly.

The runtime contains only Alpine, FUSE, certificates, LiteFS and the static app.
Its startup refuses an absent volume, FUSE mount, marker or database. Never
replace a missing production database with an empty one automatically.

### Local build and release gate

Docker/Colima is required. Every release must preserve stored GameState JSON and
snapshot/action formats used by the previously loaded frontend. Capture the last
compatible image as `quiltfall:local-previous` before building the next version.
The container gate runs that frontend against the new server across replacement,
with no refresh or mutation replay. Keep persisted phase/session fixtures too.

```sh
cargo build --locked
cargo test --locked
cargo fmt --check
cargo clippy --all-targets -- -D warnings
npm test
npm run lint
npm run format:check
npm run test:browser
docker --context colima buildx build --builder colima --platform linux/amd64 \
  --load --tag quiltfall:local .
CONTAINER_PREVIOUS_IMAGE=quiltfall:local-previous npm run test:container
```

Container tests use disposable named volumes, `/dev/fuse`, `SYS_ADMIN` and
`apparmor=unconfined`; cap RAM and swap at 256 MiB. They check missing storage,
bootstrap, graceful shutdown, forced crash, retained identities/state/results,
open-tab automatic resume, lost HTTP replies and image size budgets. To test
public routes against an already-running container, use
`PLAYWRIGHT_BASE_URL=http://127.0.0.1:8080 npx playwright test tests/browser/invite.spec.js`.
The full play suite uses its own isolated local SQLite fixture database.

Deploy the exact locally tested image; do not rebuild remotely:

```sh
flyctl auth docker
docker --context colima tag quiltfall:local registry.fly.io/quiltfall:RELEASE_TAG
docker --context colima push registry.fly.io/quiltfall:RELEASE_TAG
# Use the immutable digest printed by push:
RELEASE_IMAGE=registry.fly.io/quiltfall@sha256:TESTED_DIGEST npm run deploy
flyctl checks list
```

The deploy script exports and verifies a backup, opens two desktop WebKit tabs
over HTTPS, then deploys and checks automatic resume and continued play. It
creates a small finished smoke game. Run the local release gate first.

Use SIGTERM and the configured 15-second timeout. Attached volumes support
rolling deployments, not blue-green/canary. Before each release, export a
consistent backup outside FUSE and download it to private storage:

```sh
flyctl ssh console -C 'litefs export -name quiltfall.db /data/predeploy.db'
flyctl ssh sftp get /data/predeploy.db ./PRIVATE_BACKUP.db
```

Verify `PRAGMA integrity_check` locally. Fly takes daily volume snapshots (retain
five days); these complement an external backup. Never roll back to a /tmp
image, detach the volume, or restore a stale backup over newer accepted moves.
Roll back only to a compatible image against the same mounted database.

### Initial migration or disaster recovery

Preserve the current live database **before replacing its machine**. For an old
/tmp deployment, use SQLite's backup API, not a raw copy of a live file. During
cutover acquire `BEGIN IMMEDIATE`, freeze the actual app PID while that writer
lock is held, release the lock, then `.backup` the database (including WAL).
Download and integrity-check the backup; retain the original machine until it
is safe to replace. Resume its PID if any step fails before cutover.

Provision the encrypted volume in `iad`:

```sh
flyctl volumes create quiltfall_data --region iad --size 1 --snapshot-retention 5
```

The first migration deploy uses `--env QUILTFALL_BOOTSTRAP=1 --strategy immediate`.
LiteFS mounts, but the app waits until `/data/.quiltfall-initialized` exists.
Upload a verified SQLite backup to `/data/import/quiltfall.db` **outside FUSE**,
then run `litefs import -name quiltfall.db /data/import/quiltfall.db`. Import
replaces that database: never use it during an ordinary deployment. Export the
imported database, download it and compare integrity, players/token hashes,
games, revisions, phase JSON, rematches and stats with the original. Only then
create `/data/.quiltfall-initialized`. The app applies migrations and validates
all saved games before health becomes ready. Remove the bootstrap environment
and deploy the same tested image normally; prove two open tabs resume.

For a deliberately new empty server, explicitly create and import a valid empty
SQLite database and verify it before creating the marker. A marker without the
DB causes startup to fail. Store staged imports/backups outside `/litefs`.

`PUBLIC_ORIGIN` must be an HTTP(S) origin with no path, credentials, query or
fragment. Fly sets `https://quiltfall.fly.dev`; local default is
`http://localhost:3000`. Link previews use that configured origin, require no
cookie or JavaScript, and never reveal player names or game state.

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

