import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { webkit, expect } from "@playwright/test";
import { verifyRelease } from "./verify-release.mjs";

const image = process.env.RELEASE_IMAGE;
assert.match(
  image || "",
  /^registry\.fly\.io\/quiltfall@sha256:[a-f0-9]{64}$/,
  "RELEASE_IMAGE must be the locally tested immutable digest",
);
const base = "https://quiltfall.fly.dev";
await fetch(`${base}/health`).then((response) => {
  assert.ok(response.ok, "deployment needs a healthy existing primary");
});
const browser = await webkit.launch();
try {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const a = await host.newPage();
  const b = await guest.newPage();
  await a.goto(base);
  await a.getByLabel("Your name").fill("Deploy host");
  await a.getByRole("button", { name: "Start a game" }).click();
  const invite = await a.getByLabel("Invite link").inputValue();
  await a.reload(); // Desktop WebKit over real HTTPS, before guest arrives.
  await expect(a.locator("#connection")).toContainText("Connected");
  await expect(a.getByLabel("Your name")).toHaveCount(0);
  await b.goto(invite);
  await b.getByLabel("Your name").fill("Deploy guest");
  await b.getByRole("button", { name: "Join the quilt" }).click();
  await expect(b.locator("#connection")).toContainText("Connected");
  const id = invite.split("/").at(-1);
  let saved = await (await host.request.get(`${base}/api/games/${id}`)).json();
  const first = saved.game.state.turn === 0 ? a : b;
  await first.getByRole("button", { name: "C3: Empty", exact: true }).click();
  await expect(a.locator(".board-footnote")).toContainText("MOVE 1");
  await expect(b.locator(".board-footnote")).toContainText("MOVE 1");
  saved = await (await host.request.get(`${base}/api/games/${id}`)).json();
  const profiles = await Promise.all(
    [host, guest].map(async (context) =>
      (await context.request.get(`${base}/api/me`)).json(),
    ),
  );
  let navigations = 0;
  for (const page of [a, b]) page.on("framenavigated", () => navigations++);
  await new Promise((resolve, reject) => {
    const child = spawn(
      "flyctl",
      [
        "deploy",
        "--app",
        "quiltfall",
        "--image",
        image,
        "--ha=false",
        "--strategy",
        "rolling",
        "--wait-timeout",
        "5m",
      ],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`deploy exited ${code}`)),
    );
  });
  for (const page of [a, b]) {
    await expect(page.locator("#connection")).toContainText("Connected", {
      timeout: 30000,
    });
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    await expect(page.locator(".board-footnote")).toContainText("MOVE 1");
  }
  assert.equal(navigations, 0);
  const restored = await (
    await host.request.get(`${base}/api/games/${id}`)
  ).json();
  assert.deepEqual(restored.game, saved.game);
  for (const [index, context] of [host, guest].entries()) {
    assert.deepEqual(
      await (await context.request.get(`${base}/api/me`)).json(),
      profiles[index],
    );
  }
  // Confirm play really continues, then finish the smoke game.
  const second = restored.game.state.turn === 0 ? a : b;
  await second.getByRole("button", { name: "F6: Empty", exact: true }).click();
  await expect(a.locator(".board-footnote")).toContainText("MOVE 2");
  await expect(b.locator(".board-footnote")).toContainText("MOVE 2");
  await expect(a.locator("#app")).toHaveAttribute("aria-busy", "false");
  await a.getByRole("button", { name: "Resign this game" }).click();
  await a.getByRole("button", { name: "Resign", exact: true }).click();
  await expect(a.locator(".result-card")).toBeVisible();
  await verifyRelease(base);
  console.log(
    "Live HTTPS redeploy passed: two desktop WebKit tabs resumed automatically, identity/state/revision retained, no navigation, continued play.",
  );
} finally {
  await browser.close();
}
