import { test, expect } from "@playwright/test";

async function createInvite(page) {
  await page.goto("/");
  await page.getByLabel("Your name").fill("Roo");
  await page.getByRole("button", { name: "Start a game" }).click();
  await expect(page.getByLabel("Invite link")).toBeVisible();
  return page.getByLabel("Invite link").inputValue();
}

test("host refresh before a late join keeps the same seat; resume never asks for a name", async ({
  page,
  browser,
}) => {
  const invite = await createInvite(page);
  expect(invite).toContain("/invite/");
  const resume = page.url();
  const original = await (await page.request.get("/api/me")).json();
  await page.reload();
  await expect(page.locator("#connection")).toContainText("Connected");
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  expect((await (await page.request.get("/api/me")).json()).player.id).toBe(
    original.player.id,
  );
  const guest = await browser.newContext();
  const partner = await guest.newPage();
  await partner.goto(invite);
  await partner.getByLabel("Your name").fill("Late cat");
  await partner.getByRole("button", { name: "Join the quilt" }).click();
  await expect(page.locator(".players")).toContainText("Late cat");
  await page.context().clearCookies();
  await page.goto(resume);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  await guest.close();
});

test("a rejected session cookie cannot expose a board or invite after creation", async ({
  page,
}) => {
  let creations = 0;
  await page.route("**/api/games", async (route) => {
    creations++;
    const response = await route.fetch();
    const headers = response.headers();
    delete headers["set-cookie"];
    await page.context().clearCookies();
    await route.fulfill({ response, headers });
  });
  await page.goto("/");
  await page.getByLabel("Your name").fill("No cookie");
  await page.getByRole("button", { name: "Start a game" }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByLabel("Invite link")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  expect(creations).toBe(1);
});

test("copy invite works without the secure clipboard API", async ({ page }) => {
  const url = await createInvite(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", { value: undefined }),
  );
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.locator("#notice")).toHaveText(
    "Invite copied. Send it to your person.",
  );
  await page.evaluate(() => {
    const paste = document.createElement("textarea");
    paste.id = "paste-check";
    paste.setAttribute("aria-label", "Paste check");
    document.body.append(paste);
  });
  await page.getByLabel("Paste check").focus();
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.getByLabel("Paste check")).toHaveValue(url);
});

test("blocked copying explains manual copy and selects the entire invite", async ({
  page,
}) => {
  const url = await createInvite(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined });
    // Simulate a browser refusing the clipboard operation.
    document.execCommand = () => false;
  });
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  await expect(page.locator("#notice")).toHaveText(
    "Your browser blocked copying. Link selected — touch and hold to copy.",
  );
  expect(
    await page
      .getByLabel("Invite link")
      .evaluate((input) => [input.selectionStart, input.selectionEnd]),
  ).toEqual([0, url.length]);
  await expect(page.getByLabel("Invite link")).toBeFocused();
});

test("invalid cookies and full invites explain the problem without offering another seat", async ({
  page,
  browser,
}) => {
  const invite = await createInvite(page);
  const resume = page.url();
  await page.context().addCookies([
    {
      name: "quiltfall_session",
      value: "invalid",
      domain: new URL(resume).hostname,
      path: "/",
      httpOnly: true,
      secure: false,
    },
  ]);
  await page.goto(resume);
  await expect(
    page.getByText("Your game session is unavailable", { exact: true }),
  ).toBeVisible();
  await page.goto(invite);
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  const guest = await browser.newContext();
  const partner = await guest.newPage();
  await partner.goto(invite);
  await partner.getByLabel("Your name").fill("Guest");
  await partner.getByRole("button", { name: "Join the quilt" }).click();
  await expect(partner.locator("#connection")).toContainText("Connected");
  const gameUrl = partner.url();
  await partner.goto(invite);
  await expect(partner).toHaveURL(gameUrl);
  await page.context().clearCookies();
  await page.goto(invite);
  await expect(
    page.getByText("Both seats are taken.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  await page.goto("/invite/missing");
  await expect(
    page.getByText("That game link was not found.", { exact: true }),
  ).toBeVisible();
  await guest.close();
});

test("a closed event stream retries snapshots through 503 failures and ignores stale callbacks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.EventSource;
    window.streams = [];
    window.EventSource = class extends Native {
      constructor(url) {
        super(url);
        window.streams.push(this);
      }
    };
  });
  await createInvite(page);
  await expect(page.locator("#connection")).toContainText("Connected");
  let reads = 0;
  await page.route("**/api/games/*", async (route) => {
    if (++reads <= 2)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Restarting"}',
      });
    else await route.continue();
  });
  const original = await (await page.request.get("/api/me")).json();
  await page.evaluate(() => {
    const stream = window.streams.at(-1);
    stream.close(); // Native CLOSED never reconnects on its own.
    stream.dispatchEvent(new Event("error"));
  });
  await expect(page.locator("#connection")).toContainText("Reconnecting");
  await expect(page.locator("#connection")).toContainText("Connected", {
    timeout: 12000,
  });
  expect(reads).toBe(3);
  expect((await (await page.request.get("/api/me")).json()).player.id).toBe(
    original.player.id,
  );
  await page.evaluate(() =>
    window.streams[0].dispatchEvent(new Event("error")),
  );
  await expect(page.locator("#connection")).toContainText("Connected");
  await page.getByRole("link", { name: "Your games" }).click();
  await page.evaluate(() =>
    window.streams.at(-1).dispatchEvent(new Event("error")),
  );
  await expect(
    page.getByRole("button", { name: "Start a game" }),
  ).toBeVisible();
});

test("an unrecognized cookie cannot trap Your games; clearing it is explicit", async ({
  page,
}) => {
  const invite = await createInvite(page);
  const originalGame = page.url();
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: "quiltfall_session",
      value: "unrecognized",
      domain: new URL(invite).hostname,
      path: "/",
      httpOnly: true,
      secure: false,
    },
  ]);
  await page.goto(originalGame);
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Clear old session" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Your games" }).click();
  await expect(page).toHaveURL(new URL("/", invite).href);
  await expect(
    page.getByRole("button", { name: "Clear old session" }),
  ).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear old session" }).click();
  await expect(
    page.getByRole("button", { name: "Start a game" }),
  ).toBeVisible();
  await page.getByLabel("Your name").fill("New session");
  await page.getByRole("button", { name: "Start a game" }).click();
  await expect(page.locator("#connection")).toContainText("Connected");
  expect(page.url()).not.toBe(originalGame);
});
