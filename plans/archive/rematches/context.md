# Context

Server/store/routes all in src/server.rs; migrations/001_initial.sql stores games
and players. One-connection SQLite pool serializes write transactions. SSE notices
hold full Game and effects; revision is the ordering gate. GameState::new resets
pieces; finished state/results must be immutable across rematch updates.
web/app.js renderResult currently keys mounted scene by id:revision and routes
CTA home. Change finished-scene identity to game id, patch rematch controls only.
Existing enqueue serial queue must not await route() from within itself (deadlock);
switch synchronously then let route load asynchronously with epoch guards.

Research completed in planning before implementation:
- https://raw.githubusercontent.com/lichess-org/lila/master/modules/round/src/main/Rematcher.scala
- https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- https://www.sqlite.org/lang_transaction.html
Inspected offer/accept/cancel examples, native SSE lifecycle, atomic transactions.
User chose explicit acceptance, game screens only; no further confirmation needed.

Implementation/review: additive migration002 stores requester seat and linked
child ID on original game. Dedicated rematch POST authenticates both members,
checks finished phase/roles/revision, atomically creates two-seat child and links
it, emits empty-effect snapshot via existing SSE. Duplicate accept/offer returns
saved link; same-sender repeated offer is a no-op, crossed offers need acceptance.
New game retains seats and random starter; history/stats/result state immutable.

Frontend: finished result keyed by game id, independently keyed rematch controls
avoid remounting dance/focus on duplicate snapshots. Shared submit path handles
rematch payloads and guards epochs across response/recovery/finally. New saved
link transitions automatically navigate phones already viewing parent; initial
history read shows Open next game. Route and SSE guard epochs; navigation closes
old stream, never awaits route inside serial queue. Controls work on final quilt
and celebration, disabled while pending/disconnected, escaped wrapping names.
README explains rematch flow. No rules/dependencies/home notification changes.

Verification: five new server tests failed against missing route, four Chromium
UI cases failed against absent button (RED). Fresh full checks: cargo build/test/
fmt --check/clippy --all-targets -D warnings, npm test/lint/format:check and git
diff --check pass. 32 Rust + 6 Node + 54 Chromium/WebKit scenarios = 92 tests.
Coverage includes sender either seat, authorization/roles/stale/duplicate/race,
SSE and restart persistence, unchanged old state/stats, repeat rematches, decline/
cancel/re-offer, refresh/history/final-board controls, mounted animation identity,
320px long names/reduced motion/axe, real reconnect, lost HTTP acceptance with
SSE closed forcing read recovery, delayed real response after opening other game.
Mobile offer screenshots inspected: clear partner text/accept/decline controls,
cozy finale retained. Reviewed all plan acceptance checks; no remaining gaps.

Local server restarted with migration applied once, /health ok, existing game
and finished-game counts both5 before/after; original rematch fields all null.
