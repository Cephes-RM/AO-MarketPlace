import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

// Run against a populated local site or an accessible preview; never mutate data.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    player: { type: "string" },
    guild: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log("Usage: pnpm check:a11y [http://localhost:3000] [--player=ID] [--guild=ID]");
  console.log("Without IDs, the checker follows the first player and guild ranking links.");
  process.exit(0);
}

assert(positionals.length <= 1, "Pass only one base URL.");
const base = new URL(positionals[0] ?? "http://localhost:3000");
assert(["http:", "https:"].includes(base.protocol), "Use an HTTP or HTTPS base URL.");
assert(!base.username && !base.password, "Do not put credentials in the URL.");
const output = new URL("../../artifacts/accessibility/", import.meta.url);
const report = { baseURL: base.origin, createdAt: new Date().toISOString(), scans: [], checks: [] };
const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
  { name: "narrow", width: 320, height: 800 },
  { name: "landscape", width: 844, height: 390 },
];

async function navigate(page, path) {
  const target = new URL(path, base.origin);
  const response = await page.goto(target.href, { waitUntil: "networkidle" });
  assert.equal(response?.status(), 200, `${target.pathname} must return HTTP 200.`);
  assert.equal(new URL(page.url()).pathname, target.pathname, "A redirect cannot stand in for the requested page.");
  await page.locator("main#main-content h1").waitFor();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  assert.equal(await page.locator("main .recovery-page, main [role=alert]").count(), 0,
    "A recovery or database error screen cannot pass as a real profile or landing page.");
}

async function scan(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  const violations = results.violations.map(({ id, impact, help, helpUrl, nodes }) => ({
    id, impact, help, helpUrl,
    nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
  }));
  report.scans.push({ label, url: page.url(), violations, incomplete: results.incomplete });
  for (const violation of violations) {
    console.error(`${label}: ${violation.id} — ${violation.help}`);
    for (const node of violation.nodes) console.error(`  ${node.target.join(", ")}: ${node.failureSummary}`);
  }
  console.log(`${label}: ${violations.length} axe violations; ${results.incomplete.length} checks need manual review.`);
}

async function checkLayout(page, label) {
  const issues = await page.evaluate(() => {
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push("Page scrolls sideways.");
    for (const element of document.querySelectorAll("a, button, input, summary, [role=option]")) {
      if (element.matches(":disabled") || !element.getClientRects().length) continue;
      const rect = element.getBoundingClientRect();
      // Ignore visually hidden controls, including the off-screen skip link.
      if (rect.width <= 1 || rect.height <= 1 || rect.bottom <= 0 || rect.right <= 0) continue;
      if (rect.width < 44 || rect.height < 44) {
        issues.push(`Small target: ${element.textContent?.trim().slice(0, 60) || element.getAttribute("aria-label") || element.tagName} (${Math.round(rect.width)}×${Math.round(rect.height)}px).`);
      }
    }
    return issues;
  });
  report.checks.push({ label, issues });
  for (const issue of issues) console.error(`${label}: ${issue}`);
}

async function checkTabOrder(page, label) {
  const selector = "a, button, input, summary, [tabindex]";
  const expected = await page.locator(selector).evaluateAll((elements) => elements.flatMap((element, index) => {
    const rect = element.getBoundingClientRect();
    return element.tabIndex >= 0 && !element.matches(":disabled") && rect.width > 1 && rect.height > 1
      && getComputedStyle(element).visibility !== "hidden" ? [index] : [];
  }));
  const visited = new Set();
  const issues = [];
  for (let step = 0; step <= expected.length; step++) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate((selector) => {
      const element = document.activeElement;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        index: [...document.querySelectorAll(selector)].indexOf(element),
        name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 50) || element.tagName,
        outlined: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2,
        visible: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
      };
    }, selector);
    if (focus.index < 0 || visited.has(focus.index)) break;
    visited.add(focus.index);
    if (!focus.outlined || !focus.visible) issues.push(`Focus is not visibly outlined: ${focus.name}`);
  }
  for (const index of expected) if (!visited.has(index)) issues.push(`Control ${index} was not reachable by Tab.`);
  report.checks.push({ label: `${label}/tab-order`, focusedControls: visited.size, issues });
  for (const issue of issues) console.error(`${label}: ${issue}`);
}

let browser;
try {
  browser = await chromium.launch();
  let playerPath = values.player ? `/players/${encodeURIComponent(values.player)}` : null;
  let guildPath = values.guild ? `/guilds/${encodeURIComponent(values.guild)}` : null;

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.name !== "desktop",
      hasTouch: viewport.name !== "desktop",
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      await navigate(page, "/");
      playerPath ??= await page.locator("#players a.directory-row").first().getAttribute("href");
      guildPath ??= await page.locator("#guilds a.directory-row").first().getAttribute("href");
      assert(playerPath && guildPath, "Use a populated database or supply --player and --guild IDs.");
      assert((await page.locator("#players a.directory-row").count()) > 0,
        "Landing-page rankings need real player data for the contrast and layout checks.");
      assert((await page.locator("#guilds a.directory-row").count()) > 0,
        "Landing-page rankings need real guild data for the contrast and layout checks.");

      // The first Tab reaches the skip link; Enter moves focus into main.
      await page.keyboard.press("Tab");
      assert.equal(await page.locator("a.skip-link").evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("main#main-content").evaluate((element) => element === document.activeElement), true);

      for (const [kind, path] of [["landing", "/"], ["player", playerPath], ["guild", guildPath]]) {
        await navigate(page, path);
        if (kind !== "landing") {
          assert.equal((await page.locator("main .profile-heading .eyebrow").innerText()).trim(),
            `${kind.toUpperCase()} PROFILE`, "Expected an actual profile.");
        }
        const label = `${viewport.name}/${kind}`;
        await scan(page, label);
        await checkLayout(page, label);
        await checkTabOrder(page, label);

        if (kind === "player") {
          const toggles = page.locator(".combat-equipment > summary");
          const count = await toggles.count();
          assert(count > 0, "Choose --player=ID for a player with recorded fights so equipment toggles are covered.");
          for (let index = 0; index < count; index++) {
            await toggles.nth(index).focus();
            await page.keyboard.press("Space");
            assert.equal(await toggles.nth(index).evaluate((element) => element.parentElement.open), true,
              "Equipment must open with the keyboard.");
          }
          await scan(page, `${label}/equipment-open`);
          await checkLayout(page, `${label}/equipment-open`);
          await toggles.first().focus();
          await page.keyboard.press("Enter");
          assert.equal(await toggles.first().evaluate((element) => element.parentElement.open), false);

          const search = page.locator("header").getByRole("combobox");
          const playerName = (await page.locator("main h1").innerText()).trim().slice(0, 64);
          assert(playerName.length >= 2, "Choose a player whose name has at least two characters.");
          await search.fill(playerName);
          const listbox = page.locator("header").getByRole("listbox");
          await listbox.waitFor();
          await search.press("ArrowDown");
          assert.equal(await search.getAttribute("aria-activedescendant"),
            await listbox.getByRole("option").first().getAttribute("id"), "Down must select the first result.");
          await scan(page, `${label}/search-open`);
          await checkLayout(page, `${label}/search-open`);
          await search.press("Escape");
          assert.equal(await search.getAttribute("aria-expanded"), "false");
          await search.press("ArrowUp");
          assert.equal(await search.getAttribute("aria-activedescendant"),
            await listbox.getByRole("option").last().getAttribute("id"), "Up must select the last result.");
          await search.press("Escape");
          await search.press("ArrowDown");
          await search.press("Tab");
          const clear = page.locator("header").getByRole("button", { name: "Clear search" });
          assert.equal(await clear.evaluate((element) => element === document.activeElement), true,
            "Tab should reach Clear search without tabbing through suggestions.");
          assert.equal(await search.getAttribute("aria-expanded"), "false");
          await clear.press("Space");
          assert.equal(await search.inputValue(), "");
          assert.equal(await search.evaluate((element) => element === document.activeElement), true);
          await search.fill(playerName);
          await listbox.waitFor();
          await search.press("ArrowDown");
          const destination = await listbox.getByRole("option").first().getAttribute("href");
          await search.press("Enter");
          await page.waitForURL(new URL(destination, base.origin).href);
          assert.equal(await page.locator("main .profile-heading .eyebrow").innerText(), "PLAYER PROFILE",
            "Enter should open the selected player profile.");
        }
      }
    } finally {
      await context.close();
    }
  }
  const failures = report.scans.reduce((sum, scan) => sum + scan.violations.length, 0)
    + report.checks.reduce((sum, check) => sum + check.issues.length, 0);
  assert.equal(failures, 0, `${failures} accessibility or layout issues need attention.`);
  console.log("Automated checks passed. Complete Lighthouse, screen-reader, and real-phone checks separately.");
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await mkdir(output, { recursive: true });
  await writeFile(new URL("axe-report.json", output), JSON.stringify(report, null, 2) + "\n");
  console.log("Report: artifacts/accessibility/axe-report.json");
}
