# Deployment invariants

`start-litefs` requires an actual `/data` mount. LiteFS is a single static
primary, with its API bound to loopback. `start-app` runs after FUSE is mounted,
requires an initialization marker and existing DB, fixes the mounted database
URL and enables existing-only SQLx opens. Bootstrap waits for an explicit
operator-verified import; it never initializes or overwrites a database itself.

See [HOSTING.md](../HOSTING.md) for backup/import, local release gates, pushing
an immutable tested image and compatible rollback. Never use a Fly release
command for migrations: release-command machines do not have the app volume.

Future changes must preserve active GameState JSON and snapshot/action formats
used by the last deployed frontend. Keep the previous image and run
`CONTAINER_PREVIOUS_IMAGE=... npm run test:container` before every deploy.
Storage, session and reconnection changes require Rust and browser regression
coverage, in addition to the container gate. Do not add a second static primary.
