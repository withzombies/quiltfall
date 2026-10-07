# Context

Frontend assets are embedded by src/server.rs; edits require a server rebuild.
Implementation seams: web/index.html rules-dialog, web/style.css rules-list styles,
web/app.js rules handlers and shared reducedMotion query. Do not introduce another
asset module/route. Tests/browser/play.spec.js already checks axe, native animations
and saved snapshots. Playwright runs mobile Chromium/WebKit; explicit desktop
contexts can be covered within those projects.

Studied completely during planning (October 7, 2026):
- https://en.boardgamearena.com/gamepanel?game=boop — organized movement/growth rules;
  external edge-rule wording is not authoritative for Quiltfall.
- https://www.chess.com/learn-how-to-play-chess — examples beside movement lessons.
- https://gabrielecirulli.github.io/2048/ — short action-first instruction copy.

Implementation references researched during planning:
- https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver/root
- https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel
- https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished
- https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html

Choose native animations with percentage transforms so resize needs no pixel
measurements. Each demo remains independent of live board selectors/state. Static
final positions, labeled captions and arrows carry meaning without motion.

Complete: implementation committed as 60591b9; task docs archived after review.

RED evidence: all six new browser tests failed on the original implementation
(missing cards/demo nodes). First GREEN: 11/12 engine checks passed. Safari closing
failed focus return because pointer activation does not focus its trigger button;
explicit focus on close is required. Reference:
https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button#clicking_and_focus
Stronger graduation frame assertions caught inverted image opacity (adult shown
before graduation, kitten during flight). Swapped fade directions after RED.

All 12 targeted browser checks now pass. Cargo build/test/fmt/Clippy and npm
unit/lint/format checks pass. The first full suite was then run. Interactive
browser connection is unavailable (empty discovery); review test screenshots.

First full suite: 79/83 passed, including all guide tests. Four Safari timeouts
affected existing rematch/connection flows (including a stable Start a game click
stalling after scrolling). System process inspection showed several unrelated
processes consuming full CPU cores. No guide animations run while the dialog is
closed. Re-run affected tests unchanged to distinguish timing from a regression.

Affected Safari flows passed unchanged on rerun (six checks, 30.8s). Final
polish removed unused demo metadata and the arrow-path string special case,
reduced non-pool spacing, preserved explicit list semantics, and added real
desktop contexts plus graduation/strength/winning screenshots. All 12 guide
checks pass again (17.4s). Reviewed Safari graduation/pool, adult-strength and
winning screenshots and Chromium 320px/960px layouts. Fresh build, 41 Rust tests,
6 Node tests, fmt/Clippy/lint/format pass. The final full suite was then run. No physical
phone or interactive-browser review is claimed.

Final verification, October 7, 2026: all 83 browser tests passed in one run
(3.5 minutes), including mobile Chromium, mobile Safari and desktop Safari.
All 41 Rust tests and 6 Node UI tests passed. Cargo build/fmt/Clippy (warnings
denied) and npm lint (warnings denied)/format passed. git diff --check passed.
The final local preview was rebuilt/restarted on 127.0.0.1:3002 with a separate
target/guide-preview database; health and the served final assets were verified.

Implementation review: all acceptance checks are covered by the six guide tests
in both engines, with actual desktop contexts and native intermediate frames,
plus reviewed screenshots. Existing state/game/connection code, backend APIs and
dependencies are unchanged. Obsolete list styling is removed; no unfinished work.

Deployed October 7, 2026 to https://quiltfall.fly.dev using the locally built and
container-tested image (no remote rebuild):
- Registry tag: how-to-play-20261007-60591b9.
- Immutable index: sha256:8dfb2982fe8bff450d35866778bef05a59b64745d022d6700444413ddd387b90.
- Fly AMD64 manifest: sha256:9f0c8f52d89f95aeeb349edb2a4f2fcf3aacc4e4f6552dcd7f9f17494c1b32d7.
- Retained machine 80ee651b66d6d8 and volume vol_vwnkz260ye69kx8v; no bootstrap.
- Previous production manifest retained as quiltfall:local-previous:
  sha256:1d263ab17e3ff5c1c5d4d8daea7cef135abee0c7d1bd97ff960cc3b097f43c38.
- Private backup: backups/predeploy-2026-10-07T16-47-30-961Z.db; integrity_check ok.

Container gates passed against the actual previous production frontend: waiting,
moves, graduation, rematches/results, graceful replacement/crash, identities,
open-tab resume, no uncertain-action replay and image size budgets at 256 MiB.
The HTTPS deployment smoke passed: two desktop WebKit tabs resumed without
navigation, retained identity/state/revision, and continued play. The smoke game
was finished. Fly health checks pass. Live app.js/style.css match local bytes,
and the homepage contains all five cards. All 10 home-only guide browser tests
passed against production in mobile Chromium/WebKit, including animation frames,
Replay, keyboard closing, accessibility and reduced motion.

Spacing follow-up, October 7, 2026: user screenshot shows the pool label against
the quilt shadow, with captions crowded on all cards. Root cause: the shadow
extends 9px outside the stage, while the absolute pool label starts only 8px
below it; stage margins also leave little clearance around the pool pieces.
Increase shared stage/caption spacing and move the pool label and pool landing
positions down together, leaving arrow tips above the label. Keep the five existing
storyboards and use existing guide/layout browser checks and screenshots for
this reversible visual adjustment.

Reviewed CSS layout examples/references before editing:
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/margin-bottom
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/outline
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/box-shadow

Spacing verification: all 83 browser checks pass in one full run (3.5m), with
reviewed 320px/960px and completed graduation screenshots. All 41 Rust tests,
6 Node tests, build/fmt/Clippy/lint/format and diff checks pass. The AMD64 release
image built successfully and all container continuity/size gates passed against
the current production image. Ready to deploy the tested immutable image:
sha256:7f799230ee04bc495c562618a75b75afd503b0099412636c9822ddbc10d3f792.
