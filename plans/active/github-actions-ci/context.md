# Context

Repository: withzombies/quiltfall, public, main. Production: quiltfall.fly.dev,
single Fly machine 80ee651b66d6d8 and existing volume vol_vwnkz260ye69kx8v.
User approved implementation and activation, once per push, without CI backups.

Studied official implementations before coding:
- [Fly CI](https://docs.fly.io/launch/continuous-deployment-with-github-actions)
- [Playwright CI](https://playwright.dev/docs/ci)
- [GitHub Rust CI](https://docs.github.com/en/actions/tutorials/build-and-test-code/rust)
- [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [Docker setup action](https://github.com/docker/setup-docker-action)
- [Fly tokens](https://docs.fly.io/security/tokens)

Concurrency queue max supports 100 pending runs; FIFO follows when runs enter
the queue, not strict event dispatch order. Use workflow-level serialization.
Containerd preserves image identity and the existing compressed image-size gate.
Linux uses context ci. Token lifetime: one year (8760 hours), app-scoped.

RED: original test-container.mjs failed with `context colima: context not found`
using isolated target/ci-docker-config with only a ci context pointing to the
real local engine. This reproduces the runner context mismatch without mocks.
No production resources were touched by that failing test.

Asset-verification RED: new HTTP tests failed before verify-release.mjs existed.
GREEN: 10 Node tests, Rust build/41 tests, format and Clippy passed; ESLint has
zero warnings. The context override passes the real container gate. Saved and
reloaded the provenance-free AMD64 image; its manifest identity remained exact.
Local actionlint predates queue max: it accepts the remainder of the workflow,
and the original file parses/formats cleanly. GitHub must validate the queue key.
Fly Docker registry credentials expire after three minutes: refresh immediately
before both pulling and pushing, since continuity tests run between those steps.

All 83 Playwright tests passed with one worker. The default Colima context also
passed the container gate with the freshly built/reloaded image and the actual
live production image as the previous frontend. Registry pull initially failed
because the local three-minute credential had expired; reauthentication fixed it.

Automatic approval review rejected token creation/storage because it requires
explicit authorization to send this credential to the GitHub repository.
Requested that exact approval asynchronously. No token was created or disclosed.

Resume: local implementation is verified. Await credential authorization, then
configure the secret, push main and monitor the first Linux workflow through
actual deployment and digest checks.
