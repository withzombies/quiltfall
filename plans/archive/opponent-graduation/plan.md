# Graduate opponent lines immediately

Implement the approved Quiltfall variant: after simultaneous nudges, resolve
three-piece lines containing kittens for both owners. A unique option graduates
automatically; otherwise the piece owner chooses one group. Resolve the placing
player before the opponent, with at most one graduation per owner per placement.

Check the placing player's victory first. Opponent all-cat lines neither win nor
graduate off-turn. Eight-piece retrieval remains available only to the placing
player. Graduation does not consume another placement or increment move_count.

Keep GameState.turn as the placing player until all choices finish. Infer the
graduation chooser from the pending options, which must belong to one owner.
Keep the persisted state/action formats and existing transactional HTTP/SSE flow.
Update controls, status, selection reset, and player highlighting for the chooser.

## Acceptance

- Player 0 places a cat at (3,4), nudging player 1's cat from (3,3) to
  (3,2), alongside their cat at (1,2) and kitten at (2,2). All three return
  to player 1's pool as cats before their placement.
- Both owners and all four line directions work, with mixed and all-kitten lines.
- Multiple choices belong to the piece owner, block placement, survive refresh
  and restart, and pass to the opponent's normal placement exactly once.
- Invalid choices are rejected without mutation; existing wins, movement,
  eight-piece retrieval, and resignation remain correct.
- Both phones see matching snapshots, owner-directed animations and controls.
- Rust build/tests/format/Clippy and JS tests/lint/format/browser checks pass.

No deployments or changes to victory timing are part of this task.
