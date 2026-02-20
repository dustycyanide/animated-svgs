const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { createWebFixture } = require("./web-fixture");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

async function captureStableScreenshot(page, name) {
  await page.locator("h1").first().click();
  await page.waitForTimeout(120);
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: "disabled",
  });
}

async function waitForWorkbenchReady(page) {
  await expect.poll(async () => page.locator("#prompt-select option").count()).toBeGreaterThan(0);
  await expect(page.locator("#generation-mode-select")).toBeEnabled();
}

test("UI loop covers workbench and grid visual states plus key interactions", async ({ page }) => {
  const fixture = await createWebFixture(PROJECT_ROOT);

  try {
    await page.goto(`${fixture.baseUrl}/generate`);
    await expect(page.locator("main.app")).toBeVisible();
    await waitForWorkbenchReady(page);
    await expect(page.locator("#library-list .library-item")).toHaveCount(2);
    await expect(page.locator("#generation-mode-select")).toHaveValue("examples");

    await captureStableScreenshot(page, "workbench-examples.png");

    await page.selectOption("#generation-mode-select", "custom");
    await expect(page.locator("#custom-controls-block")).toBeVisible();
    await page.fill("#custom-prompt-input", "A floating lighthouse icon with gentle sway.");
    await captureStableScreenshot(page, "workbench-custom.png");

    await page.selectOption("#generation-mode-select", "paste");
    await expect(page.locator("#paste-controls-block")).toBeVisible();
    await expect(page.locator("#paste-svg-input")).toBeEditable();
    await page.fill(
      "#paste-svg-input",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#0f172a"/><circle cx="24" cy="24" r="14" fill="#38bdf8"/></svg>',
    );
    await page.fill("#paste-label-input", "Playwright paste import");
    await captureStableScreenshot(page, "workbench-paste.png");

    await page.goto(`${fixture.baseUrl}/`);
    await page.waitForTimeout(2_500);
    await page.waitForFunction(() => {
      const status = document.getElementById("grid-status")?.textContent || "";
      const count = document.querySelectorAll("#svg-grid .card").length;
      return status.includes("Loaded 2 SVGs") && count === 3;
    });
    await captureStableScreenshot(page, "grid-created.png");

    await page.check("#include-hidden-toggle");
    await page.waitForFunction(() => {
      const status = document.getElementById("grid-status")?.textContent || "";
      const count = document.querySelectorAll("#svg-grid .card").length;
      return status.includes("including hidden") && count === 4;
    });
    await captureStableScreenshot(page, "grid-with-hidden.png");

    await page.locator("#svg-grid .card button", { hasText: "Open in Page" }).first().click();
    await expect(page.locator("#svg-detail-panel")).toBeVisible();
    await expect(page.locator("#detail-viewer-stage")).toHaveClass(/has-content/);
    await expect(page).toHaveURL(/view=detail/);
    await captureStableScreenshot(page, "grid-detail.png");

    await page.click("#detail-back-btn");
    await expect(page.locator("#svg-detail-panel")).toBeHidden();

    await page.selectOption("#grid-cut-mode-select", "ratio");
    await page.fill("#grid-cut-ratio-input", "1:1");
    await page.dispatchEvent("#grid-cut-ratio-input", "change");
    await expect(page).toHaveURL(/cut=ratio/);

    await page.goto(`${fixture.baseUrl}/generate`);
    await waitForWorkbenchReady(page);
    await page.selectOption("#generation-mode-select", "paste");
    await expect(page.locator("#paste-controls-block")).toBeVisible();
    await expect(page.locator("#paste-svg-input")).toBeEditable();
    await page.fill(
      "#paste-svg-input",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#0b3b2e"/><rect x="10" y="10" width="28" height="28" fill="#5eead4"/></svg>',
    );
    await page.fill("#paste-label-input", "Loop mutation check");
    await page.click("#create-from-svg-btn");
    await expect(page.locator("#status")).toContainText("Done. Saved", { timeout: 20_000 });
    await expect(page.locator("#library-list .library-item")).toHaveCount(3);

    const firstActionSelect = page.locator("#library-list .library-action-select").first();
    await firstActionSelect.selectOption("hide");
    await expect(page.locator("#status")).toContainText("Hidden", { timeout: 15_000 });
    await expect(page.locator("#library-list .library-item")).toHaveCount(2);

    await page.check("#show-hidden-toggle");
    await expect(page.locator("#library-list .library-item")).toHaveCount(2);

    const archivedActionSelect = page.locator("#library-list .library-action-select").first();
    await archivedActionSelect.selectOption("unhide");
    await expect(page.locator("#status")).toContainText("Unhidden", { timeout: 15_000 });
    await expect(page.locator("#library-list .library-item")).toHaveCount(1);
  } finally {
    await fixture.cleanup();
  }
});
