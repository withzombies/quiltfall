# Replay the latest move

Save only the latest placement and all graduation decisions resolved so far.
Either player can replay it on the quilt after refresh, reconnect or reopening.
Replay is local, sends no actions, and never changes the authoritative game.

## Data

Add a nullable last_move JSON column and expose game.last_move in existing
snapshots. Store the pre-placement GameState and ordered {state, effects} steps.
Placement replaces the recording; graduation appends. Persist with the game in
the same transaction. Preserve it on resignation/rematch offers; new games start
empty. Older games start recording at their next placement. Keep live effects
separate so reconnect does not automatically replay a saved move.

## UI

Replay last move appears beside move information and on the result screen.
Hide without recording; disable during submission/live animation. Replay can
use loaded data while disconnected. Display a distinct replay view, accurate
pieces/pools, Replaying move N, and Return to live. Disable all gameplay handlers
and controls. Reuse existing motion; finish at the latest live board, remaining
on the final quilt for finished games. Never replay the celebration.

Cancel on a newer snapshot, route change, hiding, resize, preference change or
failure. New snapshots continue through normal processing. Reduced-motion users
get still frames with Next step and Return to live, keeping the final frame
visible until they return. Preserve focus and announce replay status.

## Acceptance

- Real placement, nudges, off-board returns, automatic and consecutive manual
  graduations, including opponent-owned decisions, replay in order.
- Recording is atomic, durable, replaced at the next placement, and unchanged by
  invalid or duplicate actions. Rematches start without the previous recording.
- Replay never mutates state/revisions/stats or the partner's view.
- Refresh/reconnect and all cancellation paths restore the correct live board.
- Keyboard, reduced motion, 320 px layouts and both browser engines work.
- Required Rust/JS/browser build, tests, formatting and lint pass before commit.

No full history, undo, new game actions or deployment are included.
