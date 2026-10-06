# Context
Existing finished game is full board + small result-card underneath, with
Animate.css bounceIn/fadeIn and text-only winner heading. Renderer repeats after
HTTP/SSE results and reconnect; must preserve scene DOM for same revision.
current.game.state.phase has winner/reason and move_count; existing player names
and owner-filtered cat(kind,owner) SVGs support the scene without backend changes.
Research before coding: official examples for finite/reduced-motion CSS animation:
https://animate.style/
https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-iteration-count
https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Animations/Using
Accessibility reference: https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide
Native dance1.2s x4=4.8s, no indefinite auto dance or pause controls required.

Implementation/review: web/app.js renders a dedicated, revision-keyed result
scene after the existing motion queue settles; final-quilt/back buttons switch
local views. Original adult/kitten SVGs share the winner's owner color. CSS uses
a crown entrance, 18 finite confetti pieces and 1.2s x4 dances; reduced motion
removes every scene animation. No backend, rules, schema or dependency changes.

Verification: four new Chromium scenarios failed against the old UI (RED).
Fresh full suite passed: 27 Rust, 6 Node, 42 mobile browser checks (75 total).
Browser checks cover both winners/colors, all finish reasons, final landing
ordering, actual animated frames and settling, real SSE reconnect snapshot and
scene identity, refresh/history, final-board toggle, new-game navigation,
320px long names/reduced motion and axe on both phones. Accessibility checks
await the card's entrance opacity before assessing its settled contrast.
Chromium and WebKit winner/partner screenshots inspected; crown and all cats fit,
clear heading/actions, quilt floor, wrapped names, no horizontal overflow.
cargo build/test/fmt --check/clippy --all-targets -D warnings, npm test/lint/
format:check and git diff --check all passed. No remaining spec gaps or TODOs.
