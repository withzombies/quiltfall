# Friendlier How to play

Approved: five animated rule cards inside the existing scrollable rules dialog.
Keep Get comfy. Get clever. and add: Two players, one cozy quilt. Here's how to
make yourself at home. Cards teach placement, nudges, graduation, adult strength,
and winning. Keep full rules in contextual expandable details and save reassurance.
Add Got it—let's play, keeping the close control reachable during scrolling.

Use the existing kitten/adult SVGs and full 6×6 miniature quilts. Play each example
once when half visible, for at most four seconds; offer Replay. Leave readable
static diagrams with arrows afterwards. Reset examples on reopening. Cancel on
leaving view, closing, page hiding, or reduced-motion changes. Reduced motion uses
static diagrams and hides Replay. Preserve keyboard behavior and focus return.

Graduation/win storyboards: B3, C3, D4; placement at D5 nudges D4 to D3. The kitten
line returns as adult cats to the pool; the adult line wins and stays on the quilt.
Nudges are simultaneous, including diagonals and an off-quilt pool return. Compare
kitten vs adult strength in two explicitly labeled separate turns.

No backend, rules, API, dependency, or database changes. Dedicated rules-demo
selectors must keep live-game state/control/motion isolated. Fit 320px phones,
normal phones and desktop; stack cards on narrow screens and place art beside
copy on wide screens. Preserve all current edge rules, including mixed graduation
groups, the eight-piece retrieval option and both win conditions on your own turn.

Acceptance: real native frame/position assertions; visible-only once-per-opening
autoplay and Replay; cancellation/reduced-motion; focus/Escape/closing; full rules;
axe accessibility; responsive overflow checks; active-game state remains unchanged.
Run all Cargo and npm build/test/format/lint/browser gates, warnings denied, before
incremental commits. Keep task docs current and archive after verification.
