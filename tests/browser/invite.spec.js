import { test, expect } from "@playwright/test";

async function createInvite(page) {
  await page.goto("/");
  await page.getByLabel("Your name").fill("Roo");
  await page.getByRole("button", { name: "Start a game" }).click();
  await expect(page.getByLabel("Invite link")).toBeVisible();
  return page.getByLabel("Invite link").inputValue();
}

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
