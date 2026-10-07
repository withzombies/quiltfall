import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const image = process.env.CONTAINER_IMAGE || "quiltfall:local";
const previous = process.env.CONTAINER_PREVIOUS_IMAGE || image;
const dockerContext = process.env.CONTAINER_DOCKER_CONTEXT || "colima";
const prefix = `quiltfall-test-${process.pid}`;
const volume = `${prefix}-data`;
const base = "http://127.0.0.1:3103";
const directory = mkdtempSync(join(tmpdir(), "quiltfall-test-"));
const containers = new Set();
const docker = (...args) =>
  execFileSync("docker", ["--context", dockerContext, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(250);
  }
  throw new Error("Container readiness/continuity deadline exceeded");
}
function start(name, options = [], selected = image) {
  containers.add(name);
  docker(
    "run",
    "-d",
    "--name",
    name,
    "--platform",
    "linux/amd64",
    "--memory=256m",
    "--memory-swap=256m",
    "--stop-timeout=15",
    "--device=/dev/fuse",
    "--cap-add=SYS_ADMIN",
    "--security-opt=apparmor=unconfined",
    ...options,
    selected,
  );
}
async function refuses(name, options) {
  start(name, options);
  await sleep(1500);
  assert.equal(
    docker("inspect", "-f", "{{.State.Running}}", name),
    "false",
    `${name} must fail closed`,
  );
  assert.notEqual(docker("inspect", "-f", "{{.State.ExitCode}}", name), "0");
}
let browser;
try {
  await refuses(`${prefix}-unmounted`, []);
  docker("volume", "create", volume);
  const mount = ["-v", `${volume}:/data`];
  await refuses(`${prefix}-uninitialized`, mount);
  const name = `${prefix}-app`;
  const runtime = [
    ...mount,
    "-p",
    "127.0.0.1:3103:8080",
    "-e",
    "COOKIE_SECURE=false",
    "-e",
    `PUBLIC_ORIGIN=${base}`,
  ];
  start(name, [...runtime, "-e", "QUILTFALL_BOOTSTRAP=1"], previous);
  await waitFor(() => docker("logs", name).includes("Bootstrap: waiting"));
  assert.equal(
    await fetch(`${base}/health`).then(
      () => true,
      () => false,
    ),
    false,
  );
  const seed = join(directory, "seed.db");
  execFileSync("python3", [
    "-c",
    "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('PRAGMA user_version=1'); c.close()",
    seed,
  ]);
  docker("cp", seed, `${name}:/data/seed.db`);
  docker(
    "exec",
    name,
    "litefs",
    "import",
    "-name",
    "quiltfall.db",
    "/data/seed.db",
  );
  docker("exec", name, "touch", "/data/.quiltfall-initialized");
  await waitFor(() =>
    fetch(`${base}/health`).then(
      (r) => r.ok,
      () => false,
    ),
  );
  browser = await chromium.launch();
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const a = await host.newPage();
  const b = await guest.newPage();
  let reloads = 0;
  for (const page of [a, b]) page.on("framenavigated", () => reloads++);
  await a.goto(base);
  await a.getByLabel("Your name").fill("Container host");
  await a.getByRole("button", { name: "Start a game" }).click();
  const invite = await a.getByLabel("Invite link").inputValue();
  const id = invite.split("/").at(-1);
  await waitFor(async () =>
    (await a.locator("#connection").textContent()).includes("Connected"),
  );
  const hostIdentity = await (await host.request.get(`${base}/api/me`)).json();
  // Both loaded frontends remain open through every replacement.
  const beforeWaiting = await (
    await host.request.get(`${base}/api/games/${id}`)
  ).json();
  const isConnected = async (page) => {
    if (await page.locator("#connection").count())
      return (await page.locator("#connection").textContent()).includes(
        "Connected",
      );
    return (await page.locator(".rematch-controls button:enabled").count()) > 0;
  };
  const replace = async (signal = "TERM") => {
    const navigations = reloads;
    if (signal === "KILL") docker("kill", "--signal=KILL", name);
    else docker("stop", "--time=15", name);
    assert.equal(
      docker("inspect", "-f", "{{.State.OOMKilled}}", name),
      "false",
    );
    if (signal === "TERM")
      assert.equal(
        docker("inspect", "-f", "{{.State.ExitCode}}", name),
        "0",
        "shutdown must drain SSE before forced kill",
      );
    docker("rm", name);
    start(name, runtime);
    await waitFor(() =>
      fetch(`${base}/health`).then(
        (r) => r.ok,
        () => false,
      ),
    );
    await waitFor(() => isConnected(a));
    if (b.url() !== "about:blank") await waitFor(() => isConnected(b));
    assert.equal(reloads, navigations, "redeploy cannot reload either tab");
    assert.equal(
      (await (await host.request.get(`${base}/api/me`)).json()).player.id,
      hostIdentity.player.id,
    );
  };
  await replace();
  assert.deepEqual(
    await (await host.request.get(`${base}/api/games/${id}`)).json(),
    beforeWaiting,
  );
  await b.goto(invite);
  await b.getByLabel("Your name").fill("Container guest");
  await b.getByRole("button", { name: "Join the quilt" }).click();
  await waitFor(async () =>
    (await b.locator("#connection").textContent()).includes("Connected"),
  );
  let snapshot = await (
    await host.request.get(`${base}/api/games/${id}`)
  ).json();
  const first = snapshot.game.state.turn === 0 ? a : b;
  let actions = 0;
  await first.route("**/actions", async (route) => {
    actions++;
    await route.fetch(); // Commit succeeds but HTTP reply is deliberately lost.
    await route.abort();
  });
  await first.getByRole("button", { name: "C3: Empty", exact: true }).click();
  await waitFor(
    async () =>
      (await (await host.request.get(`${base}/api/games/${id}`)).json()).game
        .state.move_count === 1,
  );
  snapshot = await (await host.request.get(`${base}/api/games/${id}`)).json();
  await replace("KILL");
  assert.deepEqual(
    (await (await host.request.get(`${base}/api/games/${id}`)).json()).game,
    snapshot.game,
  );
  assert.equal(actions, 1, "uncertain actions are never replayed");
  await first.unroute("**/actions");
  // Import a persisted graduation fixture only in this disposable test volume.
  docker(
    "exec",
    name,
    "litefs",
    "export",
    "-name",
    "quiltfall.db",
    "/data/phase-fixture.db",
  );
  const phaseFile = join(directory, "phase.db");
  docker("cp", `${name}:/data/phase-fixture.db`, phaseFile);
  execFileSync("python3", [
    "-c",
    `import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]); s=json.loads(c.execute('SELECT state FROM games WHERE id=?',(sys.argv[2],)).fetchone()[0])
s['turn']=0; s['phase']={'type':'graduation','options':[[0,1,2],[1,2,3]]}
for p in s['pieces']: p['pos']=None
for i in range(4): s['pieces'][i]['pos']={'x':i,'y':0}
c.execute('UPDATE games SET state=?,revision=revision+1 WHERE id=?',(json.dumps(s),sys.argv[2])); c.commit(); c.close()`,
    phaseFile,
    id,
  ]);
  docker("cp", phaseFile, `${name}:/data/phase-fixture.db`);
  docker(
    "exec",
    name,
    "litefs",
    "import",
    "-name",
    "quiltfall.db",
    "/data/phase-fixture.db",
  );
  snapshot = await (await host.request.get(`${base}/api/games/${id}`)).json();
  await replace();
  assert.deepEqual(
    (await (await host.request.get(`${base}/api/games/${id}`)).json()).game,
    snapshot.game,
  );
  assert.equal(await a.locator(".option").count(), 2);
  await a.getByRole("button", { name: "Confirm selection" }).click();
  await waitFor(
    async () =>
      (await (await host.request.get(`${base}/api/games/${id}`)).json()).game
        .state.phase.type === "placement",
  );
  // Finish and retain a pending rematch and statistics through a graceful redeploy.
  await a.getByRole("button", { name: "Resign this game" }).click();
  await a.getByRole("button", { name: "Resign", exact: true }).click();
  await a.getByRole("button", { name: /Play again with/ }).click();
  snapshot = await (await host.request.get(`${base}/api/games/${id}`)).json();
  const profile = await (await host.request.get(`${base}/api/me`)).json();
  await replace();
  assert.deepEqual(
    (await (await host.request.get(`${base}/api/games/${id}`)).json()).game,
    snapshot.game,
  );
  assert.deepEqual(
    await (await host.request.get(`${base}/api/me`)).json(),
    profile,
  );
  await b.getByRole("button", { name: "Play again", exact: true }).click();
  await waitFor(() => a.url() !== `${base}/game/${id}`);
  assert.equal(a.url(), b.url());
  await browser.close();
  browser = undefined;
  docker("stop", "--time=15", name);
  docker("rm", name);
  // A marker cannot authorize silently creating a replacement database.
  docker(
    "run",
    "--rm",
    "-v",
    `${volume}:/data`,
    "--entrypoint",
    "sh",
    image,
    "-c",
    "rm -rf /data/litefs",
  );
  await refuses(`${prefix}-missing-db`, mount);
  const size = Number(docker("image", "inspect", "-f", "{{.Size}}", image));
  assert.ok(
    size < 20 * 1024 * 1024,
    `compressed image content ${size} exceeds budget`,
  );
  const usage = docker(
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    image,
    "-c",
    "du -skx / 2>/dev/null | tail -1",
  );
  assert.ok(
    Number(usage.split(/\s/)[0]) < 50 * 1024,
    `unpacked filesystem ${usage} exceeds budget`,
  );
  console.log(
    "Container gates passed: guards, 256 MiB, waiting/moves/rematches/results, crash/replacement, open-tab automatic resume, no replay, image budgets.",
  );
} finally {
  await browser?.close();
  for (const name of containers) {
    try {
      docker("rm", "-f", name);
    } catch {
      /* Already removed. */
    }
  }
  try {
    docker("volume", "rm", volume);
  } catch {
    /* Creation may have failed. */
  }
  rmSync(directory, { recursive: true, force: true });
}
