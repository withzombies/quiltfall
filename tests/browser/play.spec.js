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
    host.getByRole("heading", { name: "You won the quilt!" }),
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

// Pause real native animations so assertions inspect their intermediate frames.
async function inspectMotion(page) {
  await page.evaluate(() => {
    window.motionLog = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.matches(".piece")) {
        animation.pause();
        window.motionLog.push({ animation, node: this });
      }
      return animation;
    };
  });
}

async function finishMotion(page, index) {
  await page.evaluate((i) => window.motionLog[i].animation.finish(), index);
}

test("quilt alternates ice and dusty blue without striped columns", async ({
  browser,
}) => {
  const pair = await createPair(browser);
  const colors = await pair.host
    .locator(".square")
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).backgroundColor),
    );
  expect([...new Set(colors)]).toEqual([
    "rgb(231, 238, 243)",
    "rgb(185, 206, 222)",
  ]);
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++)
      expect(colors[y * 6 + x]).toBe(colors[(x + y) % 2]);
  }
  await pair.hostContext.close();
  await pair.guestContext.close();
});

test("placement lands and rebounds before a neighbor hops on both phones", async ({
  browser,
}) => {
  const pair = await createPair(browser);
  const snapshot = await (
    await pair.host.request.get(`/api/games/${pair.id}`)
  ).json();
  const first = snapshot.game.state.turn === 0 ? pair.host : pair.guest;
  const second = first === pair.host ? pair.guest : pair.host;
  for (const page of [first, second]) await inspectMotion(page);
  await first.getByRole("button", { name: "C3: Empty", exact: true }).click();
  for (const page of [first, second]) {
    await expect
      .poll(() => page.evaluate(() => window.motionLog.length))
      .toBe(1);
    expect(
      await page.evaluate(
        () => window.motionLog[0].animation.effect.getTiming().duration,
      ),
    ).toBe(650);
    const cell = await page.locator('[data-x="2"][data-y="2"]').boundingBox();
    const initial = await page.evaluate(
      () => window.motionLog[0].node.getBoundingClientRect().y,
    );
    expect(initial).toBeLessThan(cell.y - cell.height / 2);
    await page.evaluate(() => {
      window.motionLog[0].animation.currentTime = 650 * 0.42;
    });
    const landing = await page.evaluate(
      () => window.motionLog[0].node.getBoundingClientRect().height,
    );
    expect(landing).toBeLessThan(cell.height);
    await page.evaluate(() => {
      window.motionLog[0].animation.currentTime = 650 * 0.65;
    });
    const rebound = await page.evaluate(
      () => window.motionLog[0].node.getBoundingClientRect().y,
    );
    expect(rebound).toBeLessThan(cell.y - 5);
    await expect(page.locator(".square.available:enabled")).toHaveCount(0);
    await finishMotion(page, 0);
    await expect(page.locator("#app")).toHaveAttribute("aria-busy", "false");
  }
  await second.getByRole("button", { name: "D3: Empty", exact: true }).click();
  for (const page of [first, second]) {
    await expect
      .poll(() => page.evaluate(() => window.motionLog.length))
      .toBe(2);
    // The old kitten remains on C3 until the newcomer has landed.
    expect(
      await page.evaluate(() => window.motionLog[0].node.isConnected),
    ).toBe(true);
    await finishMotion(page, 1);
    await expect
      .poll(() => page.evaluate(() => window.motionLog.length))
      .toBe(3);
    expect(
      await page.evaluate(
        () => window.motionLog[2].animation.effect.getTiming().duration,
      ),
    ).toBe(750);
    await page.evaluate(() => {
      window.motionLog[2].animation.currentTime = 750 * 0.4;
    });
    const moving = await page.evaluate(() =>
      window.motionLog[2].node.getBoundingClientRect().toJSON(),
    );
    const start = await page.locator('[data-x="2"][data-y="2"]').boundingBox();
    const end = await page.locator('[data-x="1"][data-y="2"]').boundingBox();
    expect(moving.x).toBeLessThan(start.x);
    expect(moving.x).toBeGreaterThan(end.x);
    expect(moving.y).toBeLessThan(start.y - 5);
    await finishMotion(page, 2);
    await expect(page.locator("#app")).toHaveAttribute("aria-busy", "false");
    expect(await page.evaluate(() => window.motionLog.length)).toBe(3);
    await expect(
      page.getByRole("button", { name: /B3:.*kitten/ }),
    ).toBeVisible();
  }
  const a = await (await first.request.get(`/api/games/${pair.id}`)).json();
  const b = await (await second.request.get(`/api/games/${pair.id}`)).json();
  expect(a.game).toEqual(b.game);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

async function seedBoard(pair, setup) {
  const snapshot = await (
    await pair.host.request.get(`/api/games/${pair.id}`)
  ).json();
  const state = snapshot.game.state;
  state.turn = 0;
  state.phase = { type: "placement" };
  state.move_count = 0;
  for (const piece of state.pieces) {
    piece.pos = null;
    piece.kind = "kitten";
  }
  setup(state);
  execFileSync("python3", [
    "-c",
    'import sqlite3,sys; c=sqlite3.connect("target/browser-data/quiltfall.db"); c.execute("UPDATE games SET state=?,revision=revision+1 WHERE id=?", (sys.argv[2],sys.argv[1])); c.commit()',
    pair.id,
    JSON.stringify(state),
  ]);
  for (const page of [pair.host, pair.guest]) {
    await page.reload();
    await expect(page.locator("#connection")).toContainText("Connected");
  }
}

test("cats and kittens tumble visibly over every edge in the push direction", async ({
  browser,
}, testInfo) => {
  const pair = await createPair(browser);
  const edges = [
    { x: 0, y: 2, dx: -1, dy: 0 },
    { x: 5, y: 2, dx: 1, dy: 0 },
    { x: 2, y: 0, dx: 0, dy: -1 },
    { x: 2, y: 5, dx: 0, dy: 1 },
    { x: 0, y: 0, dx: -1, dy: -1 },
    { x: 5, y: 0, dx: 1, dy: -1 },
    { x: 0, y: 5, dx: -1, dy: 1 },
    { x: 5, y: 5, dx: 1, dy: 1 },
  ];
  for (const [index, edge] of edges.entries()) {
    await seedBoard(pair, (state) => {
      state.pieces[0].kind = index % 2 ? "cat" : "kitten";
      state.pieces[8].kind = index % 2 ? "cat" : "kitten";
      state.pieces[8].pos = { x: edge.x, y: edge.y };
    });
    for (const page of [pair.host, pair.guest]) await inspectMotion(page);
    if (index % 2)
      await pair.host
        .getByRole("button", { name: /Cat 1 in your pool/ })
        .click();
    await pair.host
      .locator(`[data-x="${edge.x - edge.dx}"][data-y="${edge.y - edge.dy}"]`)
      .click();
    for (const page of [pair.host, pair.guest]) {
      await expect
        .poll(() => page.evaluate(() => window.motionLog.length))
        .toBe(1);
      const cell = await page
        .locator(`[data-x="${edge.x}"][data-y="${edge.y}"]`)
        .boundingBox();
      await finishMotion(page, 0);
      await expect
        .poll(() => page.evaluate(() => window.motionLog.length))
        .toBe(2);
      await page.evaluate(() => {
        window.motionLog[1].animation.currentTime = 750 * 0.7;
      });
      const frame = await page.evaluate(() => {
        const node = window.motionLog[1].node;
        const rect = node.getBoundingClientRect();
        return {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          opacity: getComputedStyle(node).opacity,
          connected: node.isConnected,
          transform: getComputedStyle(node).transform,
          width: document.documentElement.scrollWidth,
        };
      });
      expect(frame.connected).toBe(true);
      expect(Number(frame.opacity)).toBe(1);
      if (edge.dx)
        expect((frame.x - cell.x - cell.width / 2) * edge.dx).toBeGreaterThan(
          cell.width / 2,
        );
      if (edge.dy)
        expect((frame.y - cell.y - cell.height / 2) * edge.dy).toBeGreaterThan(
          cell.height / 2,
        );
      expect(frame.transform).not.toMatch(/^matrix\(1, 0, 0, 1,/);
      expect(frame.width).toBeLessThanOrEqual(390);
      if (index === 5 && page === pair.host)
        await page.screenshot({
          path: `test-results/${testInfo.project.name}-diagonal-tumble.png`,
        });
      await finishMotion(page, 1);
      await expect(page.locator('.piece[data-piece="8"]')).toHaveCount(0);
      await expect(page.locator("#app")).toHaveAttribute("aria-busy", "false");
    }
    const saved = await (
      await pair.host.request.get(`/api/games/${pair.id}`)
    ).json();
    expect(saved.game.state.pieces[8].pos).toBeNull();
  }
  await pair.hostContext.close();
  await pair.guestContext.close();
});

test("automatic graduation follows placement and visibly returns adult cats to the pool", async ({
  browser,
}, testInfo) => {
  const pair = await createPair(browser);
  await seedBoard(pair, (state) => {
    state.pieces[0].kind = "cat";
    for (let id = 0; id < 3; id++) state.pieces[id].pos = { x: id, y: 0 };
  });
  for (const page of [pair.host, pair.guest]) await inspectMotion(page);
  await pair.host
    .getByRole("button", { name: "F6: Empty", exact: true })
    .click();
  for (const page of [pair.host, pair.guest]) {
    await expect
      .poll(() => page.evaluate(() => window.motionLog.length))
      .toBe(1);
    await finishMotion(page, 0);
    await expect
      .poll(() => page.evaluate(() => window.motionLog.length))
      .toBe(4);
    await page.evaluate(() => {
      for (const { animation } of window.motionLog.slice(1))
        animation.currentTime = 600 * 0.45;
    });
    for (let id = 0; id < 3; id++) {
      const node = page.locator(`.piece[data-piece="${id}"]`);
      await expect(node).toHaveClass(/cat/);
      await expect(node.locator("img")).toHaveAttribute("src", "/adult.svg");
      const r = await node.boundingBox();
      const cell = await page
        .locator(`[data-x="${id}"][data-y="0"]`)
        .boundingBox();
      expect(r.y).toBeLessThan(cell.y - 5);
      expect(r.height).toBeGreaterThan(cell.height);
    }
    if (page === pair.host)
      await page.screenshot({
        path: `test-results/${testInfo.project.name}-graduation-bounce.png`,
      });
    await page.evaluate(() => {
      for (const { animation } of window.motionLog.slice(1)) animation.finish();
    });
    await expect(page.locator(".piece")).toHaveCount(1);
    await expect(page.locator(".owner-0.player-card")).toContainText(
      "3 cats in pool",
    );
    await expect(page.locator("#app")).toHaveAttribute("aria-busy", "false");
  }
  expect(pair.errors).toEqual([]);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

test("navigation cancels motion and returning shows the saved position without replay", async ({
  browser,
}) => {
  const pair = await createPair(browser);
  await seedBoard(pair, () => {});
  await inspectMotion(pair.host);
  await pair.host
    .getByRole("button", { name: "C3: Empty", exact: true })
    .click();
  await expect
    .poll(() => pair.host.evaluate(() => window.motionLog.length))
    .toBe(1);
  await pair.host.getByRole("link", { name: "Your games" }).click();
  await expect(
    pair.host.getByRole("button", { name: "Start a game" }),
  ).toBeVisible();
  expect(
    await pair.host.evaluate(() => window.motionLog[0].animation.playState),
  ).toBe("idle");
  await pair.host.locator(`a[href="/game/${pair.id}"]`).click();
  await expect(
    pair.host.getByRole("button", { name: /C3:.*kitten/ }),
  ).toBeVisible();
  await expect(pair.host.locator("#app")).toHaveAttribute("aria-busy", "false");
  expect(await pair.host.evaluate(() => window.motionLog.length)).toBe(1);
  expect(pair.errors).toEqual([]);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

test("reduced motion can cancel a bounce and future turns appear immediately", async ({
  browser,
}) => {
  const pair = await createPair(browser);
  await seedBoard(pair, () => {});
  await inspectMotion(pair.host);
  await pair.host
    .getByRole("button", { name: "C3: Empty", exact: true })
    .click();
  await expect
    .poll(() => pair.host.evaluate(() => window.motionLog.length))
    .toBe(1);
  await pair.host.emulateMedia({ reducedMotion: "reduce" });
  await expect(pair.host.locator("#app")).toHaveAttribute("aria-busy", "false");
  expect(
    await pair.host.evaluate(() => window.motionLog[0].animation.playState),
  ).toBe("idle");
  await pair.guest
    .getByRole("button", { name: "D3: Empty", exact: true })
    .click();
  await expect(
    pair.host.getByRole("button", { name: /B3:.*kitten/ }),
  ).toBeVisible();
  expect(await pair.host.evaluate(() => window.motionLog.length)).toBe(1);
  await expect(pair.host.locator('[data-x="5"][data-y="5"]')).toBeEnabled();
  expect(pair.errors).toEqual([]);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

test("multiple neighbors hop together after landing", async ({ browser }) => {
  const pair = await createPair(browser);
  await seedBoard(pair, (state) => {
    state.pieces[8].pos = { x: 1, y: 2 };
    state.pieces[9].pos = { x: 3, y: 2 };
  });
  for (const page of [pair.host, pair.guest]) await inspectMotion(page);
  await pair.host
    .getByRole("button", { name: "C3: Empty", exact: true })
    .click();
  for (const page of [pair.host, pair.guest]) {
    await expect
      .poll(() => page.evaluate(() => window.motionLog.length))
      .toBe(1);
    await finishMotion(page, 0);
    await expect
      .poll(() => page.evaluate(() => window.motionLog.length))
      .toBe(3);
    await page.evaluate(() => {
      for (const { animation } of window.motionLog.slice(1))
        animation.currentTime = 750 * 0.4;
    });
    for (const [id, x, dx] of [
      [8, 1, -1],
      [9, 3, 1],
    ]) {
      const cell = await page
        .locator(`[data-x="${x}"][data-y="2"]`)
        .boundingBox();
      const r = await page.locator(`.piece[data-piece="${id}"]`).boundingBox();
      expect((r.x - cell.x) * dx).toBeGreaterThan(5);
      expect(r.y).toBeLessThan(cell.y - 5);
    }
    await page.evaluate(() => {
      for (const { animation } of window.motionLog.slice(1)) animation.finish();
    });
    await expect(page.locator("#app")).toHaveAttribute("aria-busy", "false");
    await expect(
      page.getByRole("button", { name: /A3:.*kitten/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /E3:.*kitten/ }),
    ).toBeVisible();
  }
  await pair.hostContext.close();
  await pair.guestContext.close();
});

test("hiding the page cancels motion and resumes from the saved board", async ({
  browser,
}) => {
  const pair = await createPair(browser);
  await seedBoard(pair, () => {});
  await inspectMotion(pair.host);
  await pair.host
    .getByRole("button", { name: "C3: Empty", exact: true })
    .click();
  await expect
    .poll(() => pair.host.evaluate(() => window.motionLog.length))
    .toBe(1);
  // Headless contexts do not hide tabs; deliver the same visibility state/event
  // as a phone sleeping, while exercising the real cancellation/reconnect code.
  await pair.host.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(pair.host.locator("#connection")).toContainText("Reconnecting");
  expect(
    await pair.host.evaluate(() => window.motionLog[0].animation.playState),
  ).toBe("idle");
  await expect(
    pair.host.getByRole("button", { name: /C3:.*kitten/ }),
  ).toBeVisible();
  await pair.host.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(pair.host.locator("#connection")).toContainText("Connected");
  await expect(pair.host.locator("#app")).toHaveAttribute("aria-busy", "false");
  expect(await pair.host.evaluate(() => window.motionLog.length)).toBe(1);
  expect(pair.errors).toEqual([]);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

const sevenPositions = [
  [0, 0],
  [2, 0],
  [4, 0],
  [1, 2],
  [3, 2],
  [5, 2],
  [0, 4],
];

async function fullQuiltChoice(pair, mixed = false) {
  await seedBoard(pair, (state) => {
    sevenPositions.forEach(([x, y], id) => {
      state.pieces[id].pos = { x, y };
    });
    if (mixed) state.pieces[0].kind = "cat";
    state.pieces[8].pos = { x: 5, y: 0 };
  });
  await pair.host
    .getByRole("button", { name: "F6: Empty", exact: true })
    .click();
  await expect(pair.host.locator("#app")).toHaveAttribute("aria-busy", "false");
  await expect(pair.host.locator(".square.upgradeable:enabled")).toHaveCount(8);
}

test("the eighth kitten lets you tap a piece directly after refresh", async ({
  browser,
}, testInfo) => {
  const pair = await createPair(browser);
  await fullQuiltChoice(pair);
  await expect(pair.host.locator(".game-status")).toContainText(
    "Your quilt is full. Tap a kitten to upgrade it.",
  );
  await expect(pair.host.locator(".option")).toHaveCount(0);
  await expect(pair.host.locator("#graduate")).toHaveCount(0);
  await expect(pair.host.locator(".square.chosen")).toHaveCount(0);
  await expect(pair.host.locator('[data-x="5"][data-y="0"]')).toBeDisabled();
  await expect(pair.host.locator('[data-x="5"][data-y="3"]')).toBeDisabled();
  await expect(pair.guest.locator(".square:enabled")).toHaveCount(0);
  await pair.host.reload();
  await expect(pair.host.locator(".square.upgradeable:enabled")).toHaveCount(8);
  await pair.hostContext.setOffline(true);
  await expect(pair.host.locator("#connection")).toContainText("Reconnecting");
  await expect(pair.host.locator(".square:enabled")).toHaveCount(0);
  await pair.hostContext.setOffline(false);
  await expect(pair.host.locator("#connection")).toContainText("Connected");
  await expect(pair.host.locator(".square.upgradeable:enabled")).toHaveCount(8);
  expect(
    (await new AxeBuilder({ page: pair.host }).analyze()).violations,
  ).toEqual([]);
  await pair.host.screenshot({
    path: `test-results/${testInfo.project.name}-tap-upgrade.png`,
  });
  const before = await (
    await pair.host.request.get(`/api/games/${pair.id}`)
  ).json();
  let submissions = 0;
  pair.host.on("request", (request) => {
    if (
      request.url().endsWith(`/api/games/${pair.id}/actions`) &&
      request.method() === "POST"
    )
      submissions++;
  });
  // Two rapid activation attempts must commit only one graduation.
  await pair.host.locator('[data-x="2"][data-y="0"]').evaluate((node) => {
    node.addEventListener("click", () => node.click(), { once: true });
  });
  await pair.host.locator('[data-x="2"][data-y="0"]').tap();
  await expect(pair.host.locator("#app")).toHaveAttribute("aria-busy", "false");
  await expect(pair.host.locator(".square.upgradeable")).toHaveCount(0);
  await expect(pair.guest.locator(".owner-0.player-card")).toContainText(
    "1 cats in pool",
  );
  const after = await (
    await pair.host.request.get(`/api/games/${pair.id}`)
  ).json();
  expect(after.game.state.pieces[1].kind).toBe("cat");
  expect(after.game.state.pieces[1].pos).toBeNull();
  expect(after.game.revision).toBe(before.game.revision + 1);
  expect(after.game.state.turn).toBe(1);
  expect(submissions).toBe(1);
  expect(pair.errors).toEqual([]);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

test("mixed full quilts allow an adult return with keyboard activation", async ({
  browser,
}) => {
  const pair = await createPair(browser);
  await fullQuiltChoice(pair, true);
  await expect(pair.host.locator(".game-status")).toContainText(
    "Kittens become cats; cats return to your pool.",
  );
  const target = pair.host.locator('[data-x="0"][data-y="0"]');
  await expect(target).toHaveAccessibleName(/Return cat/);
  await target.focus();
  await pair.host.keyboard.press("Enter");
  await expect(pair.guest.locator(".owner-0.player-card")).toContainText(
    "1 cats in pool",
  );
  const after = await (
    await pair.host.request.get(`/api/games/${pair.id}`)
  ).json();
  expect(after.game.state.pieces[0].kind).toBe("cat");
  expect(after.game.state.pieces[0].pos).toBeNull();
  expect(
    after.game.state.pieces.filter((p) => p.owner === 0 && p.pos),
  ).toHaveLength(7);
  expect(after.game.state.turn).toBe(1);
  expect(pair.errors).toEqual([]);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

test("full quilts keep triple choices alongside direct piece taps", async ({
  browser,
}) => {
  const pair = await createPair(browser);
  await seedBoard(pair, (state) => {
    // Pre-existing triple is resolved by the actual eighth placement.
    const positions = [
      [0, 0],
      [1, 0],
      [2, 0],
      [4, 0],
      [1, 2],
      [3, 2],
      [5, 2],
    ];
    positions.forEach(([x, y], id) => {
      state.pieces[id].pos = { x, y };
    });
  });
  await pair.host
    .getByRole("button", { name: "F6: Empty", exact: true })
    .click();
  await expect(pair.host.locator(".square.upgradeable:enabled")).toHaveCount(8);
  await expect(pair.host.locator(".option")).toHaveCount(1);
  await expect(pair.host.locator(".square.chosen")).toHaveCount(3);
  await expect(pair.host.locator(".game-status")).toContainText(
    "Tap one piece to return it, or choose a group below.",
  );
  await pair.host
    .getByRole("button", { name: "Confirm selection", exact: false })
    .click();
  await expect(pair.guest.locator(".owner-0.player-card")).toContainText(
    "3 cats in pool",
  );
  const after = await (
    await pair.host.request.get(`/api/games/${pair.id}`)
  ).json();
  expect(
    after.game.state.pieces.filter(
      (p) => p.owner === 0 && p.kind === "cat" && !p.pos,
    ),
  ).toHaveLength(3);
  expect(after.game.state.turn).toBe(1);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

async function resignGuest(pair) {
  await pair.guest.getByRole("button", { name: "Resign this game" }).click();
  await pair.guest.getByRole("button", { name: "Resign", exact: true }).click();
  await expect(
    pair.host.getByRole("heading", { name: "You won the quilt!", exact: true }),
  ).toBeVisible();
  await expect(
    pair.guest.getByRole("heading", {
      name: "Roo wins the quilt!",
      exact: true,
    }),
  ).toBeVisible();
}

test("both phones celebrate the winner with dancing cats and can inspect the final quilt", async ({
  browser,
}, testInfo) => {
  const pair = await createPair(browser);
  await resignGuest(pair);
  for (const page of [pair.host, pair.guest]) {
    await expect(page.locator(".cat-party")).toHaveAttribute(
      "data-winner",
      "0",
    );
    await expect(page.locator(".cat-party .cat.owner-0")).toHaveCount(3);
    await expect(page.locator(".cat-party .cat.owner-1")).toHaveCount(0);
    await expect(page.locator(".champion .cat")).toHaveAttribute(
      "src",
      "/adult.svg",
    );
    await expect(page.locator(".kitten-dancer .cat")).toHaveCount(2);
    await expect(page.locator(".result-reason")).toHaveText(
      "Won by resignation",
    );
    await expect(page.locator(".board")).toHaveCount(0);
    await page.evaluate(() => {
      window.savedParty = document.querySelector(".cat-party");
      const actor = document.querySelector(".champion");
      window.dance = actor.getAnimations()[0];
      window.dance.pause();
      window.dance.currentTime = 300;
    });
    const motion = await page
      .locator(".champion")
      .evaluate((node) => getComputedStyle(node).transform);
    expect(motion).not.toBe("none");
    expect(motion).not.toBe("matrix(1, 0, 0, 1, 0, 0)");
    const timing = await page.evaluate(() =>
      window.dance.effect.getComputedTiming(),
    );
    expect(timing.activeDuration).toBe(4800);
    await page.evaluate(() => window.dance.finish());
    expect(
      await page
        .locator(".champion")
        .evaluate((node) => getComputedStyle(node).transform),
    ).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await expect(page.locator(".result-card")).toHaveCSS("opacity", "1");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `test-results/${testInfo.project.name}-${page === pair.host ? "winner" : "loser"}.png`,
    });
  }
  // Reconnect carries the same revision; it must preserve the finished dance.
  await pair.hostContext.setOffline(true);
  await pair.hostContext.setOffline(false);
  // Await a real SSE snapshot after the online handler reconnects. Observing
  // the native stream avoids asserting identity before the reply arrives.
  await pair.host.evaluate(
    () =>
      new Promise((resolve) => {
        const NativeEventSource = window.EventSource;
        window.EventSource = class extends NativeEventSource {
          constructor(url) {
            super(url);
            this.addEventListener(
              "snapshot",
              () => {
                window.EventSource = NativeEventSource;
                setTimeout(resolve, 0);
              },
              { once: true },
            );
          }
        };
        window.dispatchEvent(new Event("online"));
      }),
  );
  await expect
    .poll(() =>
      pair.host.evaluate(
        () => window.savedParty === document.querySelector(".cat-party"),
      ),
    )
    .toBe(true);
  await pair.host
    .getByRole("button", { name: "View final quilt", exact: true })
    .click();
  await expect(pair.host.locator(".square")).toHaveCount(36);
  await expect(pair.host.locator(".square:enabled")).toHaveCount(0);
  await pair.host
    .getByRole("button", { name: "Back to celebration", exact: false })
    .click();
  await expect(pair.host.locator(".champion")).toBeVisible();
  expect(
    await pair.host.evaluate(
      () => window.savedParty === document.querySelector(".cat-party"),
    ),
  ).toBe(false);
  await pair.host.reload();
  await expect(
    pair.host.getByRole("heading", { name: "You won the quilt!", exact: true }),
  ).toBeVisible();
  await pair.host
    .getByRole("link", { name: "Your games", exact: true })
    .click();
  await pair.host.getByRole("tab", { name: "Past games" }).click();
  await pair.host.locator(`a[href="/game/${pair.id}"]`).click();
  await expect(
    pair.host.getByRole("heading", { name: "You won the quilt!", exact: true }),
  ).toBeVisible();
  await pair.host
    .getByRole("link", { name: "Start another game", exact: false })
    .click();
  await expect(
    pair.host.getByRole("button", { name: "Start a game", exact: true }),
  ).toBeVisible();
  expect(pair.errors).toEqual([]);
  await pair.hostContext.close();
  await pair.guestContext.close();
});

for (const win of ["three_cats", "eight_cats"]) {
  test(`${win} waits for the last landing before showing a crowned winner`, async ({
    browser,
  }) => {
    const pair = await createPair(browser);
    await seedBoard(pair, (state) => {
      state.turn = 1;
      for (const p of state.pieces.filter((p) => p.owner === 1)) p.kind = "cat";
      if (win === "three_cats") {
        state.pieces[8].pos = { x: 0, y: 0 };
        state.pieces[9].pos = { x: 1, y: 0 };
        state.pieces[10].pos = { x: 2, y: 0 };
      } else
        sevenPositions.forEach(([x, y], i) => {
          state.pieces[8 + i].pos = { x, y };
        });
    });
    for (const page of [pair.host, pair.guest]) await inspectMotion(page);
    await pair.guest
      .getByRole("button", { name: /Cat .* in your pool/ })
      .click();
    await pair.guest
      .getByRole("button", { name: "F6: Empty", exact: true })
      .click();
    for (const page of [pair.host, pair.guest]) {
      await expect
        .poll(() => page.evaluate(() => window.motionLog.length))
        .toBe(1);
      await expect(page.locator(".cat-party")).toHaveCount(0);
      await expect(page.locator(".board")).toBeVisible();
      await finishMotion(page, 0);
      await expect(page.locator(".cat-party")).toHaveAttribute(
        "data-winner",
        "1",
      );
      await expect(page.locator(".cat-party .cat.owner-1")).toHaveCount(3);
      await expect(page.locator(".result-reason")).toHaveText(
        win === "three_cats"
          ? "Three cats in a row"
          : "Eight cats on the quilt",
      );
    }
    await expect(
      pair.guest.getByRole("heading", {
        name: "You won the quilt!",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      pair.host.getByRole("heading", {
        name: "Bean wins the quilt!",
        exact: true,
      }),
    ).toBeVisible();
    expect(pair.errors).toEqual([]);
    await pair.hostContext.close();
    await pair.guestContext.close();
  });
}

test("reduced-motion finales are static and long names fit at 320px", async ({
  browser,
}) => {
  const pair = await createPair(browser);
  for (const page of [pair.host, pair.guest]) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 780 });
  }
  // Exercise an actual user name through creation in the existing long-name test;
  // this fixture additionally checks rendering/escaping in the loss heading.
  execFileSync("python3", [
    "-c",
    'import sqlite3,sys; c=sqlite3.connect("target/browser-data/quiltfall.db"); c.execute("UPDATE players SET name=? WHERE id=(SELECT host_id FROM games WHERE id=?)",(sys.argv[2],sys.argv[1])); c.commit()',
    pair.id,
    "W".repeat(32),
  ]);
  await pair.host.reload();
  await pair.guest.reload();
  await pair.guest.getByRole("button", { name: "Resign this game" }).click();
  await pair.guest.getByRole("button", { name: "Resign", exact: true }).click();
  for (const page of [pair.host, pair.guest]) {
    await expect(page.locator(".cat-party")).toBeVisible();
    expect(
      await page
        .locator(".cat-party")
        .evaluate((node) => node.getAnimations({ subtree: true }).length),
    ).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await expect(
      page.getByRole("button", { name: "View final quilt", exact: true }),
    ).toBeVisible();
  }
  await pair.hostContext.close();
  await pair.guestContext.close();
});
