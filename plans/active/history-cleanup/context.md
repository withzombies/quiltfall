# Context

Only main, no tags/remotes, clean initial tree. Retired project identity existed
in early manifest/crate imports, old task folder, initial commit message and
credits. Push verb also used in Rust Motion enum, browser effects and tests.
Effects are transient and not stored in SQLite, so coordinated rename needs no
saved-game migration. External recovery bundle verified before rewriting.

Research: official callback examples, repository cleanup and object integrity:
- https://raw.githubusercontent.com/newren/git-filter-repo/main/Documentation/examples-from-user-filed-issues.md
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- https://git-scm.com/docs/git-fsck

RED: existing engine serialization check changed to expect nudge; failed with old
motion tag. Transformation updates that tag in both server/client, test names,
historical package/import/task paths, documentation and messages. Remove retired
brand/publisher paragraph and source URL; use project-only wording
and original third-party MIT notices. User explicitly requires clean notices too.

Source verification: all92 tests pass (32 Rust,6 Node,54 Chromium/WebKit), build,
fmt/clippy -D warnings, eslint with zero warnings, prettier and diff checks pass.
Trial full rewrite in disposable mirror passed a scan of all165 retained Git
objects, paths, refs, reflogs/config and strict fsck. All9 original commits retain
sequence/authors/dates. Trial latest tracked files match reviewed source cleanup.
Historical checkpoints (engine root, initial server, animated-motion feature)
pass tests and formatting with fresh app artifacts. Archive timestamps require
clearing app build artifacts to prevent reuse across same-version snapshots.
Next: commit verified cleanup, apply transformation to complete local history,
audit all actual objects/metadata and exact latest-tree equality, restart server.
