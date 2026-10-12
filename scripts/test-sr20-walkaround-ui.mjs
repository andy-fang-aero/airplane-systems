#!/usr/bin/env node
/** SR20 source-specific study walk: desktop/phone browser regression, against an already-running app server.
 * Usage: node scripts/test-sr20-walkaround-ui.mjs http://localhost:3000 [screenshot-directory]
 * The physical inspections are never marked as evidence of aircraft airworthiness.
 */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const base = process.argv[2];
if (!base) throw new Error("Pass the URL of a running app server.");
const shots = resolve(process.argv[3] ?? ".shots/sr20-preflight");
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const phone of [false, true]) {
    const kind = phone ? "phone" : "desktop";
    const context = await browser.newContext({
      viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      isMobile: phone,
      hasTouch: phone,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      localStorage.setItem("tourDone", "1");
      // Observe the actual two display backing canvases, independently of the DOM readouts.
      window.__sr20ScreenContexts = new Map();
      const fill = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
        if (this.canvas.width === 640 && this.canvas.height === 480 && x === 0 && y === 0 && w === 640 && h === 480)
          window.__sr20ScreenContexts.set(this.canvas, { ctx: this, fill: this.fillStyle });
        return fill.call(this, x, y, w, h);
      };
    });
    const page = await context.newPage(),
      errors = [];
    // Software WebGL and the geometry worker can be slow on a shared CI host.
    page.setDefaultTimeout(90_000);
    page.setDefaultNavigationTimeout(90_000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/_vercel/**", (route) => route.abort());
    const item = async (id) =>
      page.waitForFunction((wanted) => document.querySelector(".walk-id")?.textContent === wanted, id);
    const shot = async (name) => {
      await page.waitForTimeout(1600);
      await page.screenshot({ path: join(shots, `${kind}-${name}.png`), fullPage: phone });
    };
    await page.goto(`${base}/sr20?walk=7`);
    await page.waitForFunction(() => !document.querySelector("[data-building]"), null, { timeout: 120_000 });
    await page.getByRole("button", { name: "Begin at station 7", exact: true }).waitFor();
    assert.ok(!page.url().includes("walk="), "deep link consumed");
    await shot("intro-station7");
    await page.getByRole("button", { name: "Begin at station 7", exact: true }).click();
    await item("7a");
    if (phone) {
      const stage = await page.locator(".stage").boundingBox();
      assert.ok(stage.height > 0.5 * 844 && stage.height < 0.6 * 844, `phone scene height ${stage.height}`);
      assert.equal(await page.locator(".rail").isVisible(), false);
    } else assert.ok(await page.locator(".panel .walk").isVisible());
    await page.getByRole("button", { name: "Next item", exact: true }).click();
    await page.getByRole("button", { name: "Next item", exact: true }).click();
    await item("7c");
    assert.match(await page.locator(".walk-card").innerText(), /Fuel Drains \(2 underside\)/);
    assert.equal(await page.locator(".walk-nm").count(), 0, "both drain types are modelled");
    await shot("right-two-drains");
    if (!phone) {
      await page.keyboard.press("ArrowRight");
      await item("7d");
      await page.keyboard.press("ArrowLeft");
      await item("7c");
    }
    await page.getByRole("button", { name: "✓ Reviewed", exact: true }).click();
    await item("7d");
    await page.reload();
    await page.getByRole("heading", { name: "Resume SR20 study walk?", exact: true }).waitFor();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await item("7d");
    await shot("resumed");
    await page.getByRole("button", { name: /^Station 8: Nose, Right Side/ }).click();
    await item("8a");
    assert.equal(await page.locator(".walk-std").innerText(), "CHECK 6–7 QUARTS, LEAKS");
    await shot("oil-source-standard");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next item", exact: true }).click();
    await item("8d");
    await page
      .locator(".pin")
      .filter({ hasText: /^8d Cowling$/ })
      .waitFor();
    await shot("cowling-region");
    await page.getByRole("button", { name: "Exit the SR20 study walk", exact: true }).click();
    await page.locator(".walk").waitFor({ state: "detached" });
    assert.equal(await page.locator(".walk").count(), 0);
    assert.equal(await page.locator('.syslist button[aria-current="true"] .nm').innerText(), "Overview");
    assert.equal(
      await page
        .locator(".toolbar")
        .getByRole("button", { name: "Preflight", exact: true })
        .getAttribute("aria-pressed"),
      "false",
    );
    await shot("exit-restored");
    // Fresh study entry reconstructs the early BAT 2-only stage; no SR22T oxygen checklist is introduced.
    await page.locator(".toolbar").getByRole("button", { name: "Preflight", exact: true }).click();
    await page.getByRole("button", { name: "Start over", exact: true }).click();
    await page.getByRole("button", { name: "Begin study walk", exact: true }).click();
    await item("1a");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next item", exact: true }).click();
    await item("1d");
    assert.equal(await page.locator(".walk-prog").innerText(), "Station 1 of 13 · item 4 of 24");
    await page.waitForFunction(() => !document.querySelector(".cas .hd")?.textContent.includes("NO DISPLAY PWR"));
    await page.waitForFunction(() => {
      const screens = [...window.__sr20ScreenContexts.values()];
      return (
        screens.length === 2 &&
        screens.filter(
          ({ ctx, fill }) =>
            fill === "#05070a" && [...ctx.getImageData(500, 200, 1, 1).data].join(",") === "5,7,10,255",
        ).length === 1
      );
    });
    // Give software-rendered WebGL time to upload the changed display texture before capturing it.
    await page.waitForTimeout(6000);
    await shot("bat2-pfd");
    // A multi-part cockpit action must anchor probe verification to the probe, not the average of the switch and wing.
    for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "Next item", exact: true }).click();
    await item("1p");
    await page
      .locator(".pin")
      .filter({ hasText: /^1p Pitot Heat$/ })
      .waitFor();
    await shot("pitot-heat-probe");
    await page.getByRole("button", { name: /^Station 6: Right Wing Tip/ }).click();
    await item("6a");
    await page
      .locator(".pin")
      .filter({ hasText: /^6a Tip$/ })
      .waitFor();
    await shot("right-tip-target");
    await page.getByRole("button", { name: /^Station 7: Right Forward Wing/ }).click();
    await item("7a");
    await page
      .locator(".pin")
      .filter({ hasText: /^7a Leading Edge and Stall Strips$/ })
      .waitFor();
    assert.equal(await page.locator(".walk-nm").count(), 0, "leading edge and actual SR20 inboard strips are modelled");
    await shot("leading-edge-strips");
    await page.getByRole("button", { name: /^Station 4: Right Fuselage/ }).click();
    await item("4a");
    await page.getByRole("button", { name: "Next item", exact: true }).click();
    await item("4b");
    await page
      .locator(".pin")
      .filter({ hasText: /^4b Wing\/Fuselage Fairings$/ })
      .waitFor();
    assert.equal(await page.locator(".walk-nm").count(), 0, "the actual wing/fuselage junction is highlighted");
    await shot("wing-root-fairing");
    if (phone) await page.getByRole("button", { name: "Exit the SR20 study walk", exact: true }).click();
    await page.locator(".fleet").getByRole("button", { name: "SR22T", exact: true }).click();
    await page.locator(".walk").waitFor({ state: "detached" });
    assert.equal(await page.locator(".walk").count(), 0, "switching aircraft closes the SR20 walk");
    await page.locator(".toolbar").getByRole("button", { name: "Preflight", exact: true }).click();
    await page.getByRole("button", { name: "Begin walk-around", exact: true }).click();
    await item("1a");
    assert.equal(await page.locator(".walk-prog").innerText(), "Station 1 of 13 · item 1 of 26");
    await shot("sr22t-unaffected");
    for (let i = 0; i < 17; i++) await page.getByRole("button", { name: "Next item", exact: true }).click();
    await item("1r");
    await page
      .locator(".pin")
      .filter({ hasText: /^1r Pitot Heat$/ })
      .waitFor();
    await shot("sr22t-pitot-heat-probe");
    assert.deepEqual(errors, [], `${kind} browser runtime errors`);
    await context.close();
    console.log(
      `${kind}: deep link, sourced drains/oil, resume, BAT 2, exit, precise inspection targets and SR22T isolation passed`,
    );
  }
} finally {
  await browser.close();
}
