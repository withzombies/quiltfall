# Context

Clean starting worktree at 9f7f767. User selected distinct silhouettes and
authorized implementing the complete plan, including verification and commit.

web/app.js cat() selects /cat.svg or /adult.svg. pieceNode(), graduation motion,
picker and celebration reuse it; rules demos load the same SVGs directly.
web/index.html also uses cat.svg for the wordmark and favicon.
web/style.css renders board adults at 85%, kittens at 78% with a 3% downward
translation, picker images at 38px and rules images at 85%. Sage is a hue filter.
Keep these styles and the existing 100x100 asset view boxes.
src/server.rs embeds assets at compile time, so rebuild for browser checks.
tests/browser/play.spec.js createPair/seedBoard provide real two-player states;
seedBoard writes only the disposable target/browser-data SQLite database.

Study completed during planning, before production edits:
- https://github.com/lichess-org/lila/tree/master/public/piece/cburnett
  Read complete wP.svg and wQ.svg: shared view box and color, different outlines.
- https://atlassian.design/foundations/iconography
  Reviewed complete guidance: simple familiar forms remain legible at small sizes.
- https://www.carbondesignsystem.com/building-blocks/foundations/icons/guidelines
  Reviewed icon sizing/alignment examples: validate actual display sizes and keep
  artwork sizing separate from interactive targets.
- https://www.w3.org/WAI/WCAG21/Techniques/general/G111
  Supplementary reference: game distinctions should have non-color cues.

Planning-time Chromium rasterization at 100x100 measured kitten visible height
79px (rows 12..90) and adult height 87px (rows 5..91), ratio 1.1013.
The new >=1.35 regression should fail on this baseline for the intended reason.

RED observed: the new real-browser regression failed at the intended height
assertion, received 1.1012658227848102 versus required >=1.35. No SVG edits had
been made. Updated only the two SVGs after observing RED.

GREEN: silhouette test passes in mobile Chromium and WebKit. Inspected 320px
Chromium board/picker, 390px WebKit board/picker and 320px WebKit grayscale:
short broad kittens and long-bodied collared cats are visibly distinct on both
quilt colors; all pieces fit their cells. The header wordmark remains
recognizable. npm test (10 tests), lint and format checks pass.

Fresh rasterization measures kitten height 63px (rows 29..91) and adult height
87px (rows 5..91), ratio 1.38095 at equal scale. Existing board CSS reinforces
this to approximately 1.50 times visible adult height relative to kittens.
Rust build, all 41 Rust tests, fmt and Clippy -D warnings passed.
Inspected Chromium graduation bounce, upgrade rings, crowned finale and rules
growing/strength/winning examples: no clipping, collar visible, shared art
consistently distinguishes the kinds. Existing highlights remain legible.

Review so far: production diff contains only the two original SVGs; no public
API, behavior, CSS, dependency, state or data changes. The browser regression
uses decoded real assets, measures nontransparent pixels (not just img boxes),
checks both owners/both quilt colors and verifies cell fit and accessible labels.
No mocks, production test hooks, disabled tests, or new placeholders.

Final verification: all 85 browser scenarios passed in 3.6 minutes across
mobile Chromium, mobile WebKit and desktop WebKit. This includes the new
silhouette regression, animation/graduation, accessibility, reduced motion and
narrow layouts. Together with 41 Rust and 10 Node tests: 136 passing tests.
Build, fmt, Clippy -D warnings, ESLint --max-warnings=0, Prettier and
git diff --check passed. Browser checks ran with NO_COLOR unset to avoid the
runner's unrelated FORCE_COLOR/NO_COLOR environment warning observed in RED.

Inspected WebKit graduation, upgrade rings, crowned finale and rules growing,
grown-pool and adult-strength screenshots as well. Both renderers preserve the
cozy artwork and make kind recognizable by shape at board/picker/demo sizes.
Screenshots are disposable test-results artifacts, including
mobile-{chromium,webkit}-piece-silhouettes-{320,390}{,-grayscale}.png.

Acceptance review approved: original SVGs only for production changes, no
anti-goal violations or unfinished functionality. No container/release/deploy
work is needed for this asset-only change. Task docs are ready for archive and
the verified change is ready for the local commit authorized by the plan.
