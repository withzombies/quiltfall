# Tasks

## Now
- [ ] Verify the registry digest correction against the aliased published image,
  push the fix, and monitor the next main workflow through live deployment.
- [ ] Configure the app-scoped secret, commit/push and verify the first automatic
  main build, tests and deployment. Record evidence and archive these docs.

## Done
- [x] Study official CI implementations and approve the plan.
- [x] Reproduce missing-Colima failure using the real Docker engine.
- [x] Implement workflow, configurable Docker context, deploy checks and docs;
  verify Rust/Node/browser/container gates and the image save/load handoff.
- [x] Configure the authorized app-scoped Fly secret and activate main CI.
- [x] Verify real Linux build/134 tests/container gates and a draft PR with deploy
  skipped; reproduce the registry digest alias bug before fixing it.
