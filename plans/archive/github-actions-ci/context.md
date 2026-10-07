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
and GitHub accepted the complete queue-enabled workflow. Local interactive Fly
registry credentials are short-lived; refresh before pulling/pushing. CI uses
the authorized app-scoped token's one-year lifetime.

All 83 Playwright tests passed with one worker. The default Colima context also
passed the container gate with the freshly built/reloaded image and the actual
live production image as the previous frontend. Registry pull initially failed
because the local three-minute credential had expired; reauthentication fixed it.

Automatic approval review rejected token creation/storage because it requires
explicit authorization to send this credential to the GitHub repository.
Requested that exact approval asynchronously. No token was created or disclosed.

The user explicitly approved token creation and transfer. Configured the
Quiltfall-scoped one-year token as repository secret FLY_API_TOKEN on October 7,
2026; verified its name through gh secret list without reading the secret value.

First Linux main run 37672031908 passed all 134 tests, Rust/JS lint/format, image
budgets, artifact identity and actual-production-frontend compatibility. It
stopped before deployment because `RepoDigests[0]` was the local quiltfall alias.
Reproduced RED locally by tagging the pushed CI image as quiltfall:publish-regression:
the first digest is quiltfall@..., followed by the correct registry.fly.io digest.
Read the remote manifest with buildx imagetools inspect and pull its immutable
digest back to verify the tested identity; no positional alias selection.

Research for this correction:
- [Moby digest aliases](https://github.com/moby/moby/issues/48747)
- [Registry manifest inspection](https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/)
- [Immutable digest pulls](https://docs.docker.com/reference/cli/docker/image/pull/)

The draft verification PR #1 run 37672405907 passed with deploy skipped. Node 20
deprecation warnings identified in cache/upload/download actions; updated to
verified Node 24 commit pins for cache v5 and upload/download-artifact v7.
GREEN: registry manifest inspection and immutable pull correctly verified the
aliased published CI image against e921a9e28a9652a2099fcbbd7a7f96545fdbf68d11a09d90fc41d74ddfa295a4.

Completion evidence:
- [Main run 37674805606](https://github.com/withzombies/quiltfall/actions/runs/37674805606)
  succeeded for commit 7b70fe4: all 134 tests, formatting/lint, image budgets,
  saved/loaded identity, current-production compatibility, registry pull-back,
  live HTTPS game continuity, health/assets and deployed digest checks.
- [PR run 37672405907](https://github.com/withzombies/quiltfall/actions/runs/37672405907)
  passed its build/test job and skipped deployment. Draft PR #1 was closed
  without merging, and its remote/local verification branches were deleted.
- Independently verified immutable live digest
  4bb7b37dbcb18bde9e5062e98f89a05ff00262819bef69066420112b92e31639
  on the same single machine 80ee651b66d6d8 and volume vol_vwnkz260ye69kx8v.
  Public health and app.js/style.css/state.mjs match the tested source.
- CI created only the one-day release-image artifact; no database backup
  artifacts. Existing stored backups and volume settings remain outside scope.

No further implementation work remains. The final archive-only push will run
the same automatic pipeline; production code and workflow match the green run.
