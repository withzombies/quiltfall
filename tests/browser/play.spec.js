import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";

async function createPair(browser) {
  const hostContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const errors = [];
  host.on("pageerror", (error) => errors.push(error.message));
  guest.on("pageerror", (error) => errors.push(error.message));
  await host.goto("http://127.0.0.1:3001/");
  await host.getByLabel("Your name").fill("Roo");
  await host.getByRole("button", { name: "Start a game" }).click();
  await expect(
    host.getByRole("heading", { name: "Waiting for your partner…" }),
  ).toBeVisible();
  const url = host.url();
  await guest.goto(url);
  await guest.getByLabel("Your name").fill("Bean");
  await guest.getByRole("button", { name: "Join the quilt" }).click();
  await expect(host.locator("#connection")).toContainText("Connected");
  await expect(guest.locator("#connection")).toContainText("Connected");
  await expect(host.locator(".players")).toContainText("Bean");
  const id = url.split("/").at(-1);
  return { host, guest, hostContext, guestContext, id, errors };
}

test("long player names fit a 320px board without horizontal scrolling", async ({
  browser,
}) => {
  const a = await browser.newContext({ viewport: { width: 320, height: 780 } });
  const b = await browser.newContext({ viewport: { width: 320, height: 780 } });
  const host = await a.newPage();
  const guest = await b.newPage();
  const name = "W".repeat(32);
  await host.goto("http://127.0.0.1:3001/");
  await host.getByLabel("Your name").fill(name);
  await host.getByRole("button", { name: "Start a game" }).click();
  await expect(
    host.getByRole("heading", { name: "Waiting for your partner…" }),
  ).toBeVisible();
  await guest.goto(host.url());
  await guest.getByLabel("Your name").fill(name);
  await guest.getByRole("button", { name: "Join the quilt" }).click();
  await expect(host.locator("#connection")).toContainText("Connected");
  await expect(guest.locator("#connection")).toContainText("Connected");
  for (const page of [host, guest]) {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= 320),
    ).toBe(true);
    expect(
      (await page.locator(".square").first().boundingBox()).width,
    ).toBeGreaterThanOrEqual(44);
  }
  await host.getByRole("button", { name: "Resign this game" }).click();
  await host.getByRole("button", { name: "Resign", exact: true }).click();
  await expect(host.locator(".result-card")).toBeVisible();
  expect(
    await host.evaluate(() => document.documentElement.scrollWidth <= 320),
  ).toBe(true);
  await host.getByRole("link", { name: "Your games" }).click();
  await host.getByRole("tab", { name: "Past games" }).click();
  expect(
    await host.evaluate(() => document.documentElement.scrollWidth <= 320),
  ).toBe(true);
  await a.close();
  await b.close();
});

test("two phones play, reconnect, resign and see saved results", async ({
  browser,
}, testInfo) => {
  const pair = await createPair(browser);
  const { host, guest, id, errors } = pair;
  const snapshot = await (await host.request.get(`/api/games/${id}`)).json();
  const first = snapshot.game.state.turn === 0 ? host : guest;
  const second = first === host ? guest : host;
  await first.getByRole("button", { name: "C3: Empty", exact: true }).click();
  await expect(second.locator(".board-footnote")).toContainText("MOVE 1");
  await second.getByRole("button", { name: "D3: Empty", exact: true }).click();
  await expect(first.locator(".board-footnote")).toContainText("MOVE 2");
  await expect(
    first.getByRole("button", { name: /B3:.*kitten/ }),
  ).toBeVisible();
  const before = await (await host.request.get(`/api/games/${id}`)).json();
  const other = await (await guest.request.get(`/api/games/${id}`)).json();
  expect(before.game).toEqual(other.game);
  expect(before.game.state.move_count).toBe(2);
  await expect(host.locator("#app")).toHaveAttribute("aria-busy", "false");
  expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual(
    [],
  );
  await host.screenshot({
    path: `test-results/${testInfo.project.name}-board.png`,
    fullPage: true,
  });
  expect(
    await host.evaluate(
      (width) => document.documentElement.scrollWidth <= width,
      host.viewportSize().width,
    ),
  ).toBe(true);
  const square = await host.locator(".square").first().boundingBox();
  expect(square.width).toBeGreaterThanOrEqual(44);
  await host.reload();
  await expect(host.locator(".board-footnote")).toContainText("MOVE 2");
  await pair.guestContext.setOffline(true);
  await expect(guest.locator("#connection")).toContainText("Reconnecting");
  await pair.guestContext.setOffline(false);
  await expect(guest.locator("#connection")).toContainText("Connected");
  await guest.getByRole("button", { name: "Resign this game" }).click();
  await guest
    .getByRole("button", { name: "Keep playing", exact: true })
    .click();
  await expect(guest.locator(".result-card")).toHaveCount(0);
  await guest.getByRole("button", { name: "Resign this game" }).click();
  await guest.getByRole("button", { name: "Resign", exact: true }).click();
  await expect(
    host.getByRole("heading", { name: "You win! Nicely played." }),
  ).toBeVisible();
  await expect(host.locator(".result-card")).toHaveClass(/animate__bounceIn/);
  await host.getByRole("link", { name: "Your games" }).click();
  await expect(
    host.locator(".stat").filter({ hasText: "Wins" }).locator("strong"),
  ).toHaveText("1");
  await host.getByRole("tab", { name: "Past games" }).click();
  await expect(host.locator(".game-row")).toContainText("Bean");
  await expect(host.locator(".game-row")).toContainText("You won");
  expect(errors).toEqual([]);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

test("graduation choices highlight one group and persist after refresh", async ({
  browser,
}) => {
  const pair = await createPair(browser);
  const { host, guest, id } = pair;
  const snapshot = await (await host.request.get(`/api/games/${id}`)).json();
  const state = snapshot.game.state;
  state.turn = 0;
  for (let i = 0; i < 4; i++) state.pieces[i].pos = { x: i, y: 0 };
  // Fixture is confined to the isolated browser-test SQLite database.
  execFileSync("python3", [
    "-c",
    'import sqlite3,sys; c=sqlite3.connect("target/browser-data/quiltfall.db"); c.execute("UPDATE games SET state=?,revision=revision+1 WHERE id=?", (sys.argv[2],sys.argv[1])); c.commit()',
    id,
    JSON.stringify(state),
  ]);
  await host.reload();
  await host.getByRole("button", { name: "F6: Empty", exact: true }).click();
  await expect(
    host.getByRole("heading", { name: "Choose pieces to graduate" }),
  ).toBeVisible();
  await expect(host.locator(".option")).toHaveCount(2);
  await expect(host.locator(".square.chosen")).toHaveCount(3);
  await host.reload();
  await expect(host.locator(".option")).toHaveCount(2);
  await host
    .getByRole("button", { name: "Graduate B1 · C1 · D1", exact: true })
    .click();
  await host.getByRole("button", { name: "Confirm selection" }).click();
  await expect(guest.locator(".owner-0.player-card")).toContainText(
    "3 cats in pool",
  );
  await expect(host.locator(".graduation")).toHaveCount(0);
  const after = await (await host.request.get(`/api/games/${id}`)).json();
  expect(after.game.state.turn).toBe(1);
  expect(
    after.game.state.pieces.filter(
      (p) => p.owner === 0 && p.kind === "cat" && !p.pos,
    ),
  ).toHaveLength(3);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

test("design fits narrow screens, loads art, and respects reduced motion", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start a game" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= 320),
  ).toBe(true);
  expect(
    await page
      .locator(".hero-art")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  expect(
    await page
      .locator(".hero-art")
      .evaluate((img) => getComputedStyle(img).animationName),
  ).toBe("none");
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations).toEqual([]);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-home-narrow.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Close rules" }).click();
});
