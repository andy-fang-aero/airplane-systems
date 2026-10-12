#!/usr/bin/env node
/**
 * Airplane load in the browser, on the production build. Once each airplane's scene is complete, its final scene must equal
 * the reviewed baseline (main a1d3cdf0 plus PR47 seat placement): every mesh and line, compared as a sorted multiset of exact keys (kind, part name, attribute
 * layout, vertex and index counts, index hash) plus sums of their geometry under their local transforms, within tolerances
 * (the last bit of trig differs between runtimes; tests/scene-snapshot.test.ts measures it and checks each part to the
 * micrometre). Objects an animation moves are left out and counted. The camera framing must equal a1d3cdf0's too: the
 * SR22T overview, a system view and Reset view after a drag. Each load shows the loader, then a frame with every skin
 * shell, then no loader. The SR22T builds progressively: the deep-linked system's parts come first; a part that mounts
 * late is still found by "tap to locate"; a browser that refuses the fuselage worker builds the same scene; no build-in
 * glow under prefers-reduced-motion. Run after npm run build (it starts next start), or pass an existing server URL.
 * `--update` rewrites the baseline (scripts/test-load-ui.baseline.json): only on main before this change, or for an
 * intended model change.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const update = args.includes("--update");
const url = args.find((a) => !a.startsWith("--"));

const root = resolve(import.meta.dirname, "..");
const BASELINE = resolve(import.meta.dirname, "test-load-ui.baseline.json");

/** Starts next start on a free-ish port (as scripts/test-m20c-ui.mjs does) and waits until it answers. */
async function startServer() {
  const port = 4100 + Math.floor(Math.random() * 800);
  const base = `http://localhost:${port}`;
  const server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log = (log + d).slice(-8000)));
  server.stderr.on("data", (d) => (log = (log + d).slice(-8000)));
  let ready = false;
  for (let i = 0; i < 120; i++) {
    assert.equal(server.exitCode, null, `Server exited: ${log}`);
    try {
      ready = (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok;
    } catch {}
    if (ready) break;
    await delay(500);
  }
  assert.ok(ready, `Server did not start: ${log}`);
  return { server, base };
}

/** Before any page script: catch the three.js scene and the camera each frame renders with (three's devtools hook). */
function hookThree() {
  // the load's timeline: when the loader was first and last seen, and each frame's count of drawn skin shells
  const marks = (window.__marks = { loaderSeen: null, loaderGone: null, frames: 0, shells: [], parts: [] });
  new MutationObserver(() => {
    const shown = !!document.querySelector(".loader");
    if (shown) marks.loaderSeen ??= performance.now();
    else if (marks.loaderSeen !== null && marks.loaderGone === null) marks.loaderGone = performance.now();
  }).observe(document, { childList: true, subtree: true });
  const objs = (window.__three = { scenes: [], camera: null });
  const dev = new EventTarget();
  dev.addEventListener("observe", (e) => {
    const d = e.detail;
    if (d?.isScene) objs.scenes.push(d);
    else if (d?.isWebGLRenderer) {
      const render = d.render.bind(d);
      d.render = (scene, camera) => {
        objs.camera = camera;
        marks.frames++;
        let n = 0;
        scene.traverse((o) => {
          if (o.isMesh && o.userData.pick?.shell && o.userData.pick.sys.every((s) => s === "airframe")) n++;
        });
        if (n !== marks.shells.at(-1)?.n) marks.shells.push({ t: performance.now(), n });
        // parts mounted so far: all and electrical; and how many glow (a highlight material: emissive >= 0.4 × colour)
        const c = {
          total: 0,
          electrical: 0,
          glow: 0,
          building: !!document.querySelector("[data-building]"),
        };
        scene.traverse((o) => {
          // a catalogue part's mesh (components/scene/Part.tsx): its pick carries a `shell` key, unset unless ghosted;
          // skin shells set it, and flows, tanks, screens, linkages and control surfaces leave it out
          if (!o.isMesh || !o.userData.pick || !("shell" in o.userData.pick) || o.userData.pick.shell) return;
          c.total++;
          const pick = o.userData.pick;
          if (pick?.sys.includes("electrical")) c.electrical++;
          const m = o.material;
          if (
            m.isMeshStandardMaterial &&
            Math.max(m.emissive.r, m.emissive.g, m.emissive.b) >= 0.4 * Math.max(m.color.r, m.color.g, m.color.b)
          )
            c.glow++;
        });
        const last = marks.parts.at(-1);
        if (!last || Object.keys(c).some((k) => c[k] !== last[k])) marks.parts.push({ t: performance.now(), ...c });
        return render(scene, camera);
      };
    }
  });
  window.__THREE_DEVTOOLS__ = dev;
  localStorage.setItem("tourDone", "1");
}

/** The scene is complete: a frame has rendered, and no load is still building (the stage carries no data-building). */
async function sceneComplete(page) {
  await page.waitForFunction(() => window.__three?.camera && !document.querySelector("[data-building]"), null, {
    timeout: 120_000,
  });
}

/** Clipped skin patches whose triangulation changes with the runtime (see tests/scene-snapshot.test.ts): compared by area
 * and area centroid, not by their vertices. */
const REMESHED = ["Fuselage", "Left cabin door", "Right cabin door", "Baggage door"];
/** Absolute tolerances of the scene sums (m for positions); measured noise across runtimes: 7.2e-7, 2.3e-6, 1.5e-8. */
const TOL = {
  position: 5e-6,
  normal: 5e-5,
  uv: 5e-6,
  transform: 1e-8 /* relative above 1 */,
  area: 1e-3,
  centroid: 1e-3,
};

/** Every mesh and line, in scene order: an exact key (FNV-1a over text and integers) and its numbers. */
const objectSummaries = (page, remeshed) =>
  page.evaluate((remeshed) => {
    const fnv = (h, ints) => {
      for (let i = 0; i < ints.length; i++) h = Math.imul(h ^ ints[i], 16777619) >>> 0;
      return h;
    };
    const text = (s) => Array.from(s, (c) => c.charCodeAt(0));
    const scene = window.__three.scenes.find((s) => s.children.length);
    const out = [];
    scene.traverse((o) => {
      if (!o.isMesh && !o.isLine) return;
      const g = o.geometry,
        p = g.attributes.position.array,
        n = p.length / 3,
        name = o.userData.pick?.name ?? "",
        skin = remeshed.includes(name);
      o.updateMatrix();
      const e = o.matrix.elements;
      const layout = Object.keys(g.attributes)
        .sort()
        .map((k) => `${k}:${g.attributes[k].itemSize}`)
        .join(" ");
      let key = fnv(0x811c9dc5, text(`${o.type}|${name}|${layout}`));
      if (!skin) key = fnv(fnv(key, [n, g.index?.count ?? -1]), g.index?.array ?? []);
      // positions under the local transform, summed: A·Σv + n·t
      const v = [0, 0, 0];
      for (let i = 0; i < p.length; i++) v[i % 3] += p[i];
      const pos = [0, 1, 2].map((r) => e[r] * v[0] + e[r + 4] * v[1] + e[r + 8] * v[2] + n * e[r + 12]);
      const sum = (a, k, fold) => {
        const s = new Array(k).fill(0);
        if (a) for (let i = 0; i < a.length; i++) s[i % k] += fold && i % k === 0 ? Math.min(a[i], 1 - a[i]) : a[i];
        return s;
      };
      const transform = [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()];
      let area = [0, 0, 0, 0];
      if (skin) {
        const idx = g.index?.array,
          m = idx ? idx.length : n;
        for (let t = 0; t < m; t += 3) {
          const [a, b, d] = [0, 1, 2].map((j) => 3 * (idx ? idx[t + j] : t + j));
          const u = [0, 1, 2].map((i) => p[b + i] - p[a + i]),
            w = [0, 1, 2].map((i) => p[d + i] - p[a + i]);
          const s = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
          area[0] += s;
          for (let i = 0; i < 3; i++) area[i + 1] += (s * (p[a + i] + p[b + i] + p[d + i])) / 3;
        }
        area = [area[0], area[1] / area[0], area[2] / area[0], area[3] / area[0]];
      }
      out.push({
        key,
        name,
        skin,
        position: skin ? [0, 0, 0] : pos,
        normal: skin ? [0, 0, 0] : sum(g.attributes.normal?.array, 3),
        // u or 1 − u on a few seam vertices depends on the runtime: u is summed as min(u, 1 − u)
        uv: skin ? [0, 0] : sum(g.attributes.uv?.array, 2, true),
        transform,
        area,
      });
    });
    return out;
  }, remeshed);

/** Final-scene fingerprint: summaries taken twice, at least 400 ms and one rendered frame apart; objects that changed in
 * between are animated and left out. The exact keys form a sorted multiset hash; the numbers are summed over the scene. */
async function fingerprint(page) {
  const a = await objectSummaries(page, REMESHED);
  // Animations advance only on rendered frames, and the software renderer can stall past 400 ms: wait for a frame too.
  const frame = await page.evaluate(() => window.__marks.frames);
  await page.waitForTimeout(400);
  await page.waitForFunction((f) => window.__marks.frames > f, frame);
  const b = await objectSummaries(page, REMESHED);
  assert.equal(a.length, b.length, "the scene changed size while settled");
  const stable = a.filter((x, i) => JSON.stringify(x) === JSON.stringify(b[i]));
  let h = 0x811c9dc5;
  for (const k of stable.map((x) => x.key).sort((x, y) => x - y)) h = Math.imul(h ^ k, 16777619) >>> 0;
  const total = (f) =>
    stable.reduce(
      (s, x) => s.map((v, i) => v + f(x)[i]),
      f(stable[0]).map(() => 0),
    );
  return {
    objects: a.length,
    animated: a.length - stable.length,
    multiset: h.toString(16),
    sums: { position: total((x) => x.position), normal: total((x) => x.normal), uv: total((x) => x.uv) },
    transform: total((x) => x.transform),
    skins: stable
      .filter((x) => x.skin)
      .map((x) => [x.name, ...x.area])
      .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1])),
  };
}

/** Differences beyond tolerance between two scene fingerprints, as readable lines. */
function sceneDiff(got, want) {
  const out = [];
  for (const k of ["objects", "animated", "multiset"]) if (got[k] !== want[k]) out.push(`${k} ${got[k]} vs ${want[k]}`);
  for (const k of ["position", "normal", "uv"])
    got.sums[k].forEach(
      (v, i) => !(Math.abs(v - want.sums[k][i]) <= TOL[k]) && out.push(`${k} sum ${got.sums[k]} vs ${want.sums[k]}`),
    );
  got.transform.forEach(
    (v, i) =>
      !(Math.abs(v - want.transform[i]) <= TOL.transform * Math.max(1, Math.abs(want.transform[i]))) &&
      out.push(`transform sum ${got.transform} vs ${want.transform}`),
  );
  if (got.skins.length !== want.skins.length) out.push(`skins ${got.skins.length} vs ${want.skins.length}`);
  got.skins.forEach(([name, area, ...c], i) => {
    const [wname, warea, ...wc] = want.skins[i] ?? [];
    if (
      name !== wname ||
      !(Math.abs(area - warea) <= TOL.area * warea) ||
      c.some((v, j) => !(Math.abs(v - wc[j]) <= TOL.centroid))
    )
      out.push(`skin ${name} ${[area, ...c]} vs ${wname} ${[warea, ...wc]}`);
  });
  return [...new Set(out)];
}
const cameraDiff = (got, want) => got.length !== want.length || got.some((v, i) => !(Math.abs(v - want[i]) <= 1e-3));

/** The camera once it has stopped (flights take 1 s; damping settles after): position and view direction, rounded. */
async function settledCamera(page) {
  // Wait for rendered frames after a camera request; timers alone can sample stale OrbitControls orientation.
  const frame = await page.evaluate(() => window.__marks.frames);
  await page.waitForFunction((f) => window.__marks.frames >= f + 2, frame);
  const read = () =>
    page.evaluate(() => {
      const c = window.__three.camera;
      c.updateMatrixWorld();
      const d = c.getWorldDirection(c.position.clone());
      return [...c.position.toArray(), ...d.toArray()].map((v) => Math.round(v * 1e4) / 1e4 + 0); // + 0: JSON writes -0 as 0
    });
  let last = await read();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(250);
    const now = await read();
    if (now.every((v, k) => v === last[k])) return now;
    last = now;
  }
  throw new Error(`camera never settled: ${last}`);
}

/** The loader is up from the first paint, a frame then draws every skin shell, and the loader goes once the scene is complete. */
async function loaderThenScene(page, route) {
  const m = await page.evaluate(() => window.__marks);
  const all = m.shells.at(-1)?.n ?? 0;
  const shellsAt = m.shells.find((x) => x.n === all)?.t;
  assert.ok(all > 0, `${route}: skin shells drawn`);
  assert.ok(m.loaderSeen !== null, `${route}: loader shown`);
  assert.ok(m.loaderGone !== null, `${route}: loader gone`);
  assert.ok(
    m.loaderSeen <= shellsAt && shellsAt <= m.loaderGone,
    `${route}: loader, then shells, then no loader ${JSON.stringify(m)}`,
  );
}

const ROUTES = ["/sr22t", "/sr22t/electrical", "/sr20", "/c172s", "/c182t", "/da40", "/m20c"];
// explicit views: a bare /sr22t reopens the last system viewed in this browser
const CAMERAS = ["/sr22t/overview", "/sr22t/electrical"];

let server, browser;
try {
  let base = url;
  if (!url) ({ server, base } = await startServer());
  browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(hookThree);
  // analytics has no bearing on the scene and need not contact a deployment
  await context.route("**/_vercel/**", (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const got = { scenes: {}, cameras: {} };

  for (const route of ROUTES) {
    await page.goto(base + route);
    await sceneComplete(page);
    if (!update) await loaderThenScene(page, route);
    got.scenes[route] = await fingerprint(page);
    const { objects, animated, multiset } = got.scenes[route];
    console.log(`${route}: ${JSON.stringify({ objects, animated, multiset })}`);
  }
  for (const route of CAMERAS) {
    await page.goto(base + route);
    await sceneComplete(page);
    got.cameras[route] = await settledCamera(page);
  }
  // Reset view after a drag: back to the overview framing
  await page.goto(base + "/sr22t/overview");
  await sceneComplete(page);
  await settledCamera(page);
  const box = await page.locator("canvas").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await page.locator(".toolbar").getByRole("button", { name: "Reset view", exact: true }).click();
  got.cameras["/sr22t/overview Reset view after a drag"] = await settledCamera(page);
  console.log(`cameras: ${JSON.stringify(got.cameras)}`);
  assert.ok(
    !cameraDiff(got.cameras["/sr22t/overview Reset view after a drag"], got.cameras["/sr22t/overview"]),
    "Reset view restores the overview position and direction",
  );
  // This invariant replaces a redundant baseline that previously captured an unsettled post-drag direction.
  delete got.cameras["/sr22t/overview Reset view after a drag"];

  if (!update) {
    // the deep-linked system's parts are added first; the overview adds them later
    const firstDone = async (route, key) => {
      await page.goto(base + route);
      await sceneComplete(page);
      const h = await page.evaluate(() => window.__marks.parts);
      const final = h.at(-1);
      const done = h.find((x) => x[key] === final[key]);
      return done.total / final.total;
    };
    const el = await firstDone("/sr22t/electrical", "electrical"),
      elOverview = await firstDone("/sr22t/overview", "electrical");
    assert.ok(
      el < 0.6 && el < elOverview,
      `electrical parts first on /sr22t/electrical: ${el} of the parts (overview ${elOverview})`,
    );
    console.log(`Build order: electrical done at ${el.toFixed(2)} (overview ${elOverview.toFixed(2)})`);
  }

  assert.deepEqual(errors, [], "No application runtime errors");
  await context.close();

  if (!update) {
    // "tap to locate" on a part not mounted yet: the camera goes to it once it mounts
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      await ctx.addInitScript(() => (window.__buildHold = ["Oxygen bottle — 77 cu ft"]));
      const p = await ctx.newPage();
      await p.goto(base + "/sr22t/oxygen");
      await p.waitForSelector(".loader-bar");
      await p.locator(".parts button", { hasText: "Oxygen bottle — 77 cu ft" }).click();
      await p.evaluate(() => delete window.__buildHold);
      await sceneComplete(p);
      await settledCamera(p);
      const d = await p.evaluate(() => {
        let part;
        window.__three.scenes
          .find((s) => s.children.length)
          .traverse((o) => {
            if (o.isMesh && o.userData.pick?.name === "Oxygen bottle — 77 cu ft") part ??= o;
          });
        const g = part.geometry;
        g.computeBoundingSphere();
        return part.localToWorld(g.boundingSphere.center.clone()).distanceTo(window.__three.camera.position);
      });
      assert.ok(Math.abs(d - 2.6) < 0.01, `located the late part: camera ${d} m from it (2.6 m expected)`);
      console.log(`Tap to locate a part before it mounts: the camera flies to it once it does (${d.toFixed(3)} m)`);
      await ctx.close();
    }

    // A newer system request supersedes a locate request for a part still being built.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      await ctx.addInitScript(() => (window.__buildHold = ["Oxygen bottle — 77 cu ft"]));
      const p = await ctx.newPage();
      await p.goto(base + "/sr22t/oxygen");
      await p.waitForSelector(".loader-bar");
      await p.locator(".parts button", { hasText: "Oxygen bottle — 77 cu ft" }).click();
      await p.locator(".syslist button").filter({ hasText: "Electrical" }).click();
      const before = await settledCamera(p);
      await p.evaluate(() => delete window.__buildHold);
      await sceneComplete(p);
      assert.ok(!cameraDiff(await settledCamera(p), before), "late part cannot override a newer system view");
      console.log("Late locate cancelled: electrical camera remains after the oxygen bottle mounts");
      await ctx.close();
    }

    // A one-shot airplane must paint an opaque loader before synchronous geometry construction on a fleet switch.
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      const p = await ctx.newPage();
      await p.goto(base + "/sr20/overview");
      await sceneComplete(p);
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await p.evaluate(() => {
        window.__switchFrames = [];
        window.__switchSampling = true;
        const sample = () => {
          if (!window.__switchSampling) return;
          const loader = document.querySelector(".loader");
          let parts = 0;
          window.__three.scenes
            .find((s) => s.children.length)
            ?.traverse((o) => {
              if (o.isMesh && o.userData.pick) parts++;
            });
          window.__switchFrames.push({
            stage: loader?.dataset.building,
            opacity: loader ? Number(getComputedStyle(loader).opacity) : 0,
            parts,
          });
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await p.getByRole("button", { name: "C182T", exact: true }).click();
      await sceneComplete(p);
      const frames = await p.evaluate(() => {
        window.__switchSampling = false;
        return window.__switchFrames;
      });
      assert.ok(
        frames.some((f) => f.stage === "airframe" && f.opacity === 1 && f.parts === 0),
        `opaque loader painted before the C182T model mounted: ${JSON.stringify(frames)}`,
      );
      console.log("One-shot fleet switch: opaque loader paints before uncached C182T geometry (4x CPU slowdown)");
      await ctx.close();
    }

    // a browser that refuses to create the fuselage worker: the page builds the fuselage itself and completes the same scene
    {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      await ctx.addInitScript(() => {
        window.Worker = class {
          constructor() {
            throw new DOMException("Worker construction denied", "SecurityError");
          }
        };
      });
      const p = await ctx.newPage();
      const errs = [];
      p.on("pageerror", (e) => errs.push(e.message));
      await p.goto(base + "/sr22t/overview");
      await sceneComplete(p);
      await loaderThenScene(p, "/sr22t/overview, worker refused");
      const fp = await fingerprint(p);
      assert.deepEqual(errs, [], "no page errors with the worker refused");
      assert.deepEqual(
        sceneDiff(fp, JSON.parse(readFileSync(BASELINE, "utf8")).scenes["/sr22t"]),
        [],
        "the same final scene without the worker",
      );
      console.log(`Worker refused: the scene completes on the main thread, identical (${fp.multiset})`);
      await ctx.close();
    }

    // the build-in glow: shown with motion, never with prefers-reduced-motion
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
      await ctx.addInitScript(hookThree);
      await ctx.route("**/_vercel/**", (route) => route.abort());
      const p = await ctx.newPage();
      await p.goto(base + "/sr22t");
      await sceneComplete(p);
      await p.waitForTimeout(500);
      const h = await p.evaluate(() => window.__marks.parts);
      const steady = h.at(-1).glow,
        during = Math.max(...h.filter((x) => x.building).map((x) => x.glow));
      if (reducedMotion === "reduce")
        assert.ok(during <= steady, `no build-in glow with reduced motion: ${during} > ${steady}`);
      else assert.ok(during > steady, `build-in glow with motion: ${during} vs ${steady} after`);
      console.log(`${reducedMotion}: most parts glowing while building ${during}, after ${steady}`);
      await ctx.close();
    }
  }

  if (update) {
    // numbers to 1e-9, well inside every tolerance
    const round = (_k, v) => (typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v);
    writeFileSync(BASELINE, JSON.stringify(got, round, 2) + "\n");
    console.log(`baseline written: ${BASELINE}`);
  } else {
    const want = JSON.parse(readFileSync(BASELINE, "utf8"));
    for (const route of ROUTES)
      assert.deepEqual(sceneDiff(got.scenes[route], want.scenes[route]), [], `final scene of ${route}`);
    for (const [k, v] of Object.entries(want.cameras))
      assert.ok(!cameraDiff(got.cameras[k], v), `camera for ${k}: ${got.cameras[k]} vs ${v}`);
    console.log("Final scenes and camera framing match the reviewed baseline");
  }
} finally {
  await browser?.close();
  server?.kill();
}
