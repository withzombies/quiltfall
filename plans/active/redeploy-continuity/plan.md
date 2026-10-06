# Redeploy continuity

Implement the approved plan: persistent SQLite under LiteFS on one mounted Fly
primary, a small static Rust runtime, explicit invite/resume routes, verified
cookie readback, automatic snapshot-first reconnection, graceful draining, and
illustrated server-rendered link previews. Waiting games never expire.

An ordinary redeploy may briefly pause connections, but must preserve identities,
boards, turns, revisions, graduation choices, rematches and statistics. Open tabs
resume without refresh, a name prompt, or mutation replay. Future saved-state and
wire changes must preserve active games and the previously loaded frontend.

Storage fails closed without the volume, FUSE mount, initialization marker or DB.
Bootstrap is explicit and waits for an operator-verified import. Back up the live
temporary database before replacing any Fly machine. Deploy the locally tested
AMD64 image digest, then prove another rolling deployment retains open games.

Acceptance: Rust build/tests/fmt/clippy; JS tests/lint/format; browser suites
including desktop WebKit session cases; container restart/crash/replacement and
open-tab resume tests under 256 MiB. Runtime budgets: <20 MiB compressed content,
<50 MiB unpacked. New opaque preview: 1200×630, <1 MiB.
