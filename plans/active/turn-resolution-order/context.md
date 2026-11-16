Root cause: finish_placement combined singles with triples and checked eight-cat victory before opponent graduation. Graduation continuation previously skipped remaining triples.
Implemented repeated resolution and deferred full-board checks. Updated full-board browser regression and player-facing rules. Added eighth-piece and disjoint-triple rules regressions.
Research located killercup/boop and sbucule/Boop-a-two-player-game on GitHub; their implementation details were not fully studied. The external rulebook fetch returned 403. User-approved Quiltfall rules govern this change.
Rust tests, Node tests, Clippy, ESLint and formatting pass. Full browser suite in progress.

Follow-up: added repeated_graduation_continues_after_restart server integration test. It verifies persistence, decision ownership, automatic resolution of the remaining disjoint triple, six graduation effects, and exactly one turn advance.
Fresh verification: 24 rules tests and 29 server tests pass; cargo build, fmt, Clippy, ESLint, and Prettier checks pass. Prior complete browser run: 99 passed; Node run: 14 passed. Only server test/docs changed afterward.
User clarified that Quiltfall intentionally differs from Boop. External comparison stopped; confirmed Quiltfall behavior remains authoritative. Three external implementations were not fully studied. The original implementation also did not follow RED-first; this is recorded rather than claimed retroactively.
