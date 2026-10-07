# Build, test, and deploy with GitHub Actions

Implement the approved plan: build and test PRs targeting main and every main
push. Each successful main push deploys its final SHA once. Queue main workflows
with `queue: max` and `cancel-in-progress: false`; do not replace pending runs.

Use Ubuntu 24.04, Rust 1.95.0, Node 24, Docker 28.4.0 with the containerd image
store, and commit-pinned actions. Run all Rust, frontend, browser and container
gates. Build AMD64 once, transfer that tested image between jobs, and verify its
identity. Only the dependent main-push deploy job receives an app-scoped Fly
token. Pull the actual live image and prove old-frontend/new-server continuity
before pushing and deploying an immutable digest. Preserve the existing single
machine and volume; check open game continuity, health and served assets.

Make the container Docker context configurable, defaulting to Colima locally.
Remove automatic predeployment backup creation and retention. Existing stored
backups and disposable test database fixtures are outside that removal.
Document CI, token rotation and local release commands in HOSTING.md.

Acceptance: reproduce the missing-Colima failure before fixing it; pass local
build/test/lint/browser/container gates; configure FLY_API_TOKEN without exposing
it; commit and push; verify the first automatic workflow succeeds and production
uses its tested digest. Pull requests cannot deploy or access the Fly token.

No public API or schema changes, remote image rebuilds, test disabling,
production fixture imports, extra machines or production backup artifacts.
