# Context
web/app.js renders 36 native square buttons with an aria-hidden visual piece
layer (pointer-events:none), so taps can use the existing square hit targets.
Currently only empty placement squares enabled; singleton graduations appear as
coordinate option buttons, first selected automatically. Server supplies options
as stable piece-ID arrays; client can filter singleton vs triple without rules.
Mixed eight-piece phase can include both singles and triples. Preserve indices
into original options for triple selection. Empty/opponent squares disabled.
Studied before implementation:
https://www.w3.org/WAI/ARIA/apg/patterns/button/
https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/button
https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/layout-grids/
Use native button semantics, no new grid keyboard-navigation system or dependency.

Completion evidence — October 6, 2026:
Three new scenarios were RED: all eight occupied squares disabled, zero eligible
board targets. GREEN now filters server options into singles/groups, preserves
original group indices and only enables singleton targets for the active,
connected, idle player. Rings replace single-piece preselection; group highlights
remain. Labels explain Upgrade kitten or Return cat to assistive technologies.
Three scenarios pass in Chromium and WebKit: eighth placement -> direct tap
(after refresh and offline/reconnect), mixed adult return via Enter, and full
quilt with both singleton and triple choices. Native touch tap hits the visible
kitten; rapid duplicate activation produces one POST and one committed revision.
Empty/opponent squares and all observer squares remain disabled. Group-only
existing graduation tests pass. Reviewed tap-upgrade screenshot; axe audit passes.
Fresh verification: cargo build/test/fmt/Clippy -D warnings; npm test/lint/format;
full 34-browser suite passed. Final touch/offline refinement passed both engines
and JS lint/format again. Totals: 27 Rust + 6 Node + 34 browser = 67 tests.
Review against approved plan complete, no unfinished code placeholders, no new
dependencies, no public API/schema/rule changes. Existing DB saves retained.
Headless mobile browser verification does not claim a physical-phone test.
