# Context

User approved saved whole-move replay on the quilt. This includes graduation
choices resolved so far and must remain available after reopening.

## Existing implementation

- src/server.rs persists GameState with revisioned actions and broadcasts transient
  effects. GET/reconnect send effects=[]; no prior state/effects are retained.
- web/app.js animates place/nudge/graduate in order using AbortController.
  A serialized snapshot queue and route epochs guard live updates.
- GameState.move_count identifies placement, while one or two owner-authorized
  Graduate actions can complete the same placement. Record these as separate steps.
- Existing migrations are 001_initial.sql and 002_rematches.sql.
- The working tree was clean at implementation start (355601b).

## Research read in full before coding

- https://github.com/lichess-org/chessground/blob/master/src/anim.ts
  Records pre-animation pieces and cancels rendering independently of game logic.
- https://github.com/lichess-org/lila/blob/master/ui/round/src/view/replay.ts
  Explicit replay navigation and current-step highlighting on the board.
- https://github.com/boardgameio/boardgame.io/blob/main/src/client/debug/log/Log.svelte
  Uses previewState and clears that view on exit without replacing live state.

Supporting references:
- https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel
- https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion

## Verification

- RED: server tests failed on missing last_move and the missing pre-placement
  state in a placement followed by both owners' graduation choices.
- GREEN: 28 server tests pass, including durable replay across restart, replacement
  on placement, rejection without mutation, resignation/rematch preservation,
  new-rematch clearing, and consecutive graduation steps. Existing saves retain
  null recording when completing a legacy pending graduation.
- RED: replayFrames export was missing. GREEN: eight UI helper tests pass,
  including phase order, simultaneous effects, piece kinds and clone isolation.
- RED: browser could not find Replay last move. GREEN: playback works after
  reload on either phone without mutation requests; replay shows original piece
  kinds before graduation and restores pending decisions and final boards.
- RED: Return to live lost keyboard focus when playback rerendered its controls.
  GREEN: preserve the focused replay control through rendering and return focus
  to Replay last move afterward.
- An interruption fixture initially paused the original live animation by
  changing motion preference before its response reached the host. Corrected
  the fixture to await the enabled replay control before pausing replay motion.
- All 14 focused Chromium/WebKit replay and graduation scenarios passed.
- Rust build, all 50 Rust tests, formatting and warnings-denied Clippy pass;
  all 12 JS tests, ESLint and formatting pass. Full browser run: 99 passed in
  4.2 minutes across mobile Chromium, mobile WebKit and desktop WebKit.

Final commands (all exit 0):

```sh
cargo build --locked
cargo test --locked
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
npm test
npm run lint
npm run format:check
npm run test:browser
git diff --check
```

## Implementation notes

- The SQL migration adds nullable TEXT for the recording, leaving GameState JSON
  unchanged. Typed replay JSON is validated alongside saved state at startup.
- Recording contains GameState snapshots, not Game/Snapshot envelopes, so it
  cannot recursively accumulate earlier recordings. Only one placement's steps
  are stored; live transient effects remain separate.
- A local replay session supplies displayed pieces/pool counts while current
  remains authoritative. Existing animations run against each saved step.
- Pure replayFrames builds cloned still frames for reduced motion; empty phases
  are omitted. Existing animation cancellation also clears replay, and session
  identity guards prevent stale completion handlers from restoring an old view.
- New accepted revisions cancel replay before entering the live update queue;
  same-revision reconnect snapshots leave a static replay active.

## Acceptance review — October 19, 2026

- Recordings save with successful state updates and survive reopening the real
  SQLite database; requests rejected by revision or rules leave them unchanged.
- Both owners' manual graduations append in order to one placement. A following
  placement replaces all steps; resignation and rematch offers retain them,
  while a newly accepted rematch has last_move=null.
- GET/SSE keep their original live effects behavior; persistent replay data is
  inside game, and recordings contain only GameState snapshots plus effects.
- Browser tests replay blocked nudges/off-board cats and automatic graduation
  using native animations, plus both owners' consecutive choices in still frames.
- Either phone can repeatedly replay after refresh without mutation requests;
  canonical game state/revision, partner view and profile statistics stay intact.
- A newer live update cancels replay and its recording becomes the next replay.
  Return, resize, preference changes, page hiding, navigation and simulated
  animation failure restore the live quilt with no unhandled browser errors.
- Offline static replay survives reconnect to the same revision. Reduced-motion
  steps retain the final frame; Return restores pending graduation or placement.
- Winning replay opens the final quilt and does not trigger another celebration.
- Enter activation, replay-control focus preservation, axe accessibility and
  320 px layouts pass in both mobile engines. Inspected the narrow replay image;
  heading, quilt, pool counts and Return to live are clear and fit the viewport.
- README describes replay and the next-placement capture rule for existing games.
- No unfinished implementation, undo behavior or unrelated production changes.

## Release preparation

User requested commit, push and deployment. Before pushing, inspected the actual
main deployment workflow and found that its live smoke test compared the whole
pre/post-deployment Game JSON exactly. The production version predates last_move,
so a migrated game adds last_move=null and would incorrectly fail continuity
verification after an otherwise successful deployment.

Added a focused release-verification helper that treats absent and null recording
as equivalent while comparing every other field and existing recording exactly.
RED: the new regression failed before the helper existed. GREEN: both release
regressions pass, including rejection of board/revision/player/rematch changes,
unexpected recording creation and loss of an existing saved recording.

Deployment uses the existing main-push CI workflow, which builds/tests one image,
checks its compatibility with the previous production frontend, and verifies live
game continuity, source-matching assets, health and the deployed immutable digest.

The first CI release run passed 98 browser tests but exposed a WebKit fixture
race in the remaining replay test. Its trace shows a reduced-motion Next step
control after changing the emulated preference to no-preference, then replay
cancellation when the delayed media change arrives. Apply the preference before
reloading, so the new document starts with the intended preference. Preserve all
replay assertions and the production preference-change cancellation behavior.
Verification: 20 consecutive replay runs pass (10 Chromium, 10 WebKit), along
with all 14 JavaScript tests, ESLint, Prettier and git diff checks.

The next release run passed the full application suite and current-image
container gate, then exposed the same absent/null comparison in the separate
old-frontend compatibility gate's waiting-game snapshot. Its only diff was
last_move=null. Reuse assertGameContinuity for that Game and continue comparing
the entire remaining snapshot envelope exactly. Subsequent same-version
replacement comparisons remain exact, including their saved recordings.
Verified locally with the exact CI release artifact and current production
digest: full old-frontend container compatibility gate passes. All 14 JavaScript
tests, ESLint, Prettier and diff checks pass as well.
