# Context

## Decisions

- User explicitly chose immediate opponent graduation and piece-owner selection
  when several lines qualify. This is an intentional variant of standard Boop.
- Resolve the placing player's choice first. Keep active-player-only wins and
  placing-player-only eight-piece retrieval.
- Existing phase options identify the chooser without new serialized fields.

## Investigation

- src/game.rs filters lines to self.turn and unconditionally ends the turn after
  Graduate; the blanket actor guard prevents opponent-owned decisions.
- web/state.mjs and web/app.js also assume turn identifies the graduation chooser.
- src/server.rs already delegates validation to GameState.apply, persists before
  broadcasting full revisioned snapshots, and reloads the same JSON on restart.
- Baseline: all 16 rules tests passed. A scratch reproduction under target/
  confirmed the reported opponent mixed line remains on the board.

## Research completed during planning

Read complete implementation modules before coding:

- https://github.com/richoux/pobo/blob/master/app/src/main/java/fr/richoux/pobo/engine/Game.kt
- https://github.com/lilyyllyyllyly/Boop/blob/main/src/game_manager.c
- https://github.com/Davidgl1987/boop-3d/blob/main/src/core/gameRules.ts

All three graduate active-player lines. Pobo and Boop in C also check only the
active player's victory; Boop 3D's both-owner victory scan must not be copied.

Primary rules references:

- https://boardgamegeek.com/thread/2991155/can-you-force-your-opponent-to-graduate-kittens
- https://rules.dized.com/game/3_U-I3tNQyW4X0aaWER7YA/IVrYQ2VrRpawzrWlKu9tQg/graduating-kittens-into-cats
- https://rules.dized.com/game/3_U-I3tNQyW4X0aaWER7YA/faq

The designer explicitly defers opponent graduation to their own turn; user chose
the variant after reviewing that clarification.

## Verification

- RED: four new rule regressions failed because opponent lines did not graduate
  or offer choices; all prior rule tests passed.
- GREEN: all 22 rules tests pass, including 64 actual-nudge combinations of
  actor, line owner, mixed/all-kitten composition, and line direction.
- RED: UI status test and two-phone Chromium choice test failed because the
  placing player still controlled the opponent's pending graduation.
- GREEN: all seven UI helper tests and all four new browser cases pass across
  mobile Chromium and WebKit, including animated returns and consecutive choices
  across refresh with the opponent then placing normally.
- All 27 server tests pass, including HTTP/SSE effects, saved opponent-owned
  choices across restart, invalid requests preserving revision, and next placement.
- Rust build/test/format/Clippy with warnings denied and JS test/lint/format pass.
- Full browser suite: 89 passed in 7.0 minutes across mobile Chromium,
  mobile WebKit and desktop WebKit.

Final verification commands (all exit 0):

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

## Acceptance review — October 19, 2026

- Exact reported mixed-cat nudge graduates three cats immediately, emits ordered
  place/nudge/graduate effects, increments the move once, and passes placement.
- Parameterized rules tests exercise both actors/owners, both piece compositions,
  and horizontal, vertical and both diagonal lines using actual nudges.
- Choices resume from the correct owner; none, automatic and manual placing-player
  graduation paths lead to opponent choices. Both automatic lines resolve in order.
- Wrong actors, placement while pending, duplicate/mixed/invalid selections fail
  without state or revision changes. The opponent then places normally.
- Existing movement, resignation, active-player wins and full-board retrieval
  tests pass; additional protections keep opponent all-cat lines/full boards intact.
- HTTP/SSE snapshots/effects match committed state. A real persisted opponent-owned
  graduation survives server restart and both phones restore it across refresh.
- Browser tests verify owner-directed cat returns, controls/highlighting, selection
  reset when the chooser changes, and the subsequent opponent placement.
- README and displayed rules describe the selected variant and decision order.
- Review found no unfinished implementation or changes outside the accepted scope.

## Implementation notes

- Lines accept an explicit owner. After the placing player's win check and
  graduation, resolve the opponent's kitten-containing lines, then end the turn.
- Pending graduation options contain only one owner's pieces; authorization and
  the UI derive the chooser from those IDs. No persistence/API schema changes.
- Manual graduation resumes at the next owner rather than rescanning an owner
  that already graduated. Placement count and turn switch occur only once.
