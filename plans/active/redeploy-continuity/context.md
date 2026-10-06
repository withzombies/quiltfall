# Evidence

The reported desktop Safari host refresh happened before the guest joined and
without a server restart. Its cause is unconfirmed. Current code treats all
401/403 reads as an invitation and relies on native EventSource retries; both
can mislead a host. Create/join currently expose the returned board before
verifying the browser retained the session cookie. Production SQLite is /tmp.

Research read before implementation (primary sources):
- https://github.com/tokio-rs/axum/blob/main/examples/jwt/src/main.rs
- https://github.com/tokio-rs/axum/blob/main/examples/sse/src/main.rs
- https://github.com/tokio-rs/axum/blob/main/examples/error-handling/src/main.rs
- https://raw.githubusercontent.com/superfly/litefs/main/Dockerfile
- https://raw.githubusercontent.com/superfly/litefs-example/main/Dockerfile
- https://github.com/GoogleContainerTools/distroless/blob/main/examples/rust/Dockerfile
- https://docs.fly.io/litefs/config/
- https://docs.fly.io/litefs/import/ and https://docs.fly.io/litefs/export/
- https://raw.githubusercontent.com/superfly/litefs/v0.5.14/cmd/litefs/main.go
- https://raw.githubusercontent.com/superfly/litefs/v0.5.14/cmd/litefs/mount_linux.go
- https://raw.githubusercontent.com/tokio-rs/axum/main/examples/graceful-shutdown/src/main.rs
- https://tokio.rs/tokio/topics/shutdown
- https://html.spec.whatwg.org/multipage/server-sent-events.html
- https://ogp.me/
- https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages
- https://docs.slack.dev/messaging/unfurling-links-in-messages/

LiteFS forwards termination to its child and waits before unmounting. Use
exit-on-error=true (verified source, despite misleading sample comment). SQLx
bundles SQLite; musl permits a static runtime. FUSE works on Colima with
/dev/fuse, SYS_ADMIN and apparmor=unconfined. Existing AMD64 baseline image was
built locally: 33.0 MiB content, 96.6 MiB unpacked. Fly has one iad machine,
8076ddb66e5318, and no volumes; do not replace it before backup.

No automatic failover, replication, accounts, session recovery credential or
uninterrupted-availability promise is in scope. A lost cookie explains recovery
limits and offers GET-only Retry. Invalid cookies are never silently replaced.

Implementation evidence: API regression failed with 404 before invite status
was added, then passed. Preview regression failed on missing OG tags, then
passed. Baseline container guard test failed because it served without a volume;
new entrypoint refuses that condition. Browser host-refresh regression failed
because copied URLs were game URLs; invite separation fixes it. A cookie-strip
fixture must clear the APIRequestContext cookie jar too: route.fetch itself
stores Set-Cookie. One concurrent Playwright attempt cleaned another run's trace
files; avoid overlapping browser runners. The affected assertions had passed;
rerun the full suite alone.

The illustration was generated with the built-in image tool. Prompt: peach and
sage rounded cats gently nudging on a stitched blue patchwork quilt, cream
background, soft outlines, cozy storybook mood, centered crop-safe subjects,
no lettering or watermark. Saved as web/link-preview-v1.png: 1200×630 opaque
PNG, 407,190 bytes after palette optimization.

Live inspection found /tmp/quiltfall.db valid but empty (0 players, 0 games).
The encrypted 1 GB iad volume vol_vwnkz260ye69kx8v was provisioned without
replacing the current machine. Old-root SQLite CLI/procps installed only to
perform a safe backup; neither is present in the new runtime.

Desktop Safari WebDriver was attempted, but Safari's Allow remote automation
setting is disabled. Do not silently change the user's browser setting.
Desktop WebKit and HTTPS smoke are still tested; manual Safari is a remaining
platform-specific check, not evidence of the original incident's cause.

Fresh local verification: all 68 browser tests pass (mobile Chromium, mobile
WebKit, desktop WebKit invite suite); all 40 Rust tests and six Node UI tests
pass; fmt, clippy -D warnings, ESLint --max-warnings=0 and Prettier pass. The
previous image passes the full disposable-volume continuity suite, including
waiting, a committed move with lost reply, SIGKILL, graduation, results and a
pending rematch across replacements. Final existing-only DB opens and the
portable signal helper are being rebuilt and rechecked before deployment.
Slim image measured 11,540,666 bytes compressed content and 26,852 KiB unpacked
before those final guards (both comfortably inside the approved budgets).

Final AMD64 image locally built and tested with the earlier frontend:
sha256:cc6fecf43078ab526893ea537574a133a4c050eab4ddec3d625cc3bebf36979b.
Compressed content 11,540,746 bytes; unpacked filesystem 26,852 KiB. Full
container gates pass under 256 MiB. The registry push preserved that digest.
Fly configuration validates. No production machine has yet been replaced.

Initial cutover completed: consistent /tmp backup integrity-checked, all schema
and table rows compared after LiteFS import, marker created only after equality.
Bootstrap removed by a normal rolling deploy. Two live desktop WebKit HTTPS
contexts retained identities, board, turn and revision, resumed without any
navigation, then accepted another move. Same encrypted volume remains attached.
Public OG tags and immutable PNG verified over HTTPS.

Screenshot follow-up exposed a separate recovery dead end: with an unrecognized
cookie, /api/me returns session_invalid and Your games renders the same error.
Reproduced in desktop WebKit; regression fails because Clear old session is
absent. Add an explicit home-page reset for unrecognized cookies only. Valid
sessions are protected; no stored identities/games are deleted and resume URLs
still never offer a new seat. Reset is a JSON POST requiring explicit intent.
Research examples read before this fix: axum-extra CookieJar::remove docs,
Express response.clearCookie implementation, Django session logout example:
https://docs.rs/axum-extra/latest/axum_extra/extract/cookie/struct.CookieJar.html
https://raw.githubusercontent.com/expressjs/express/master/lib/response.js
https://docs.djangoproject.com/en/5.2/topics/http/sessions/#examples

User confirmed the screenshot was on Home / Your games. Explicit reset now
passes its API and browser regressions: it clears only an unrecognized cookie,
refuses valid sessions, preserves every saved row and allows a fresh verified
identity. All 71 browser cases, 41 Rust cases, six Node cases, lint/format and
the full container gate pass. New AMD64 tested/pushed digest:
sha256:fae5f66ca5d93c72f74918f17eb5074279a6921eb8f294eb9627a17ebf630a88.
