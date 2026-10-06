# Quiltfall for two phones

Build Quiltfall for two invited players in phone browsers: Rust/Axum,
SQLite saves, anonymous remembered identities, cozy SVG cats and a quilt,
immediate final moves, live updates, and results with wins/losses.
Run locally on a shared Wi-Fi first; provide optional Fly.io instructions.

## Contract
- Original 6x6 rules, eight active pieces per player, blocked/non-chaining
  nudges, kitten/cat immunity, mixed graduation, one graduation per turn,
  eight-piece choices, and active-player-only victory after nudges.
- Server validates actions; all committed state including graduation survives
  refresh, phone sleep, and server restart.
- Explicit join reserves seat two. Unguessable invitations, cookie identity,
  membership checks, revision checks, HTTP actions and SSE snapshots.
- Results and basic stats only; no accounts, bots, replay, chat, or undo.
- Mobile Safari and Chrome, reduced motion, original SVG art.

## Approach
One Rust crate and static browser assets. Pure rules in src/game.rs.
SQLx SQLite with one connection serializes transactions; persist before
broadcast. Revisioned snapshots resynchronize on reconnect. Stable piece IDs
drive browser animation. SQLite is the source of truth.

## Acceptance
Two distinct browser sessions create/join/play, see matching boards,
resume after interruption, finish/resign, and see correct results/stats.
Rules, authorization, concurrent joins/actions, SSE, restart during graduation,
and single-counted results have automated coverage. Compile/tests/format/Clippy
with warnings denied pass before each incremental commit.

## Research
Studied completely before implementation:
- https://github.com/tokio-rs/axum/blob/main/examples/sse/src/main.rs
- https://github.com/tokio-rs/axum/blob/main/examples/chat/src/main.rs
- https://github.com/transact-rs/sqlx/blob/main/examples/sqlite/todos/src/main.rs
Rules: https://rules.dized.com/game/3_U-I3tNQyW4X0aaWER7YA/faq
Fly: https://docs.fly.io/about/pricing and https://docs.fly.io/volumes/overview

Rejected: WebSocket command protocol (unnecessary for turn-based actions),
frontend framework/build system (small static UI), distributed DB/server setup.
