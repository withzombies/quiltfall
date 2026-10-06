# Context

A verified recovery bundle is stored outside the repository. GitHub origin has
one main branch; snapshot its exact tip before any remote history replacement.
Local history has 13 commits before the documentation change. Runtime behavior
and player saves are out of scope. Apache 2.0 license matches the official text.

Rust build/tests/fmt/clippy and Node tests/lint/format pass. All 54 Chromium/WebKit
browser tests pass. Documentation changes need link and rule verification.

## Verification

Trial and actual rewrite passed complete scans of 203 retained Git objects,
paths, refs, reflogs and local config; strict fsck passed. All 14 commits retain
order, author/committer identities, timestamps and cleaned messages. The latest
tree exactly matches the verified documentation/license change, so runtime
files, images and mandatory vendor licenses are unchanged by rewriting.

All 32 Rust tests, six Node tests and 54 phone browser tests passed. Rust build,
formatting and clippy with warnings denied passed; npm lint and format passed.
README and HOSTING relative links/images resolve. LICENSE exactly matches the
official Apache 2.0 text; Rust and npm package metadata agree.

Origin URL was restored after filtering. A subsequent fresh GitHub mirror
passed the complete 203-object/metadata scan and strict fsck. Its README,
HOSTING, LICENSE and package metadata exactly match the reviewed local files.
GitHub main has moved to the rewritten documentation commit; no further
remote history replacement is needed for the requested cleanup.
