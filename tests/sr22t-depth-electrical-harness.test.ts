/**
 * Electrical distribution, harness runs and circuit protection: SR22T POH 13772-007 7-37, 7-47 – 7-57,
 * Fig 7-10 (7-48), Fig 7-11 (7-52); AMM 13773-002 Rev 7 24-50 PDF pp. 750–752.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { AB, FW } from "@/aircraft/sr22t/geometry";
import { extLit, initialSim, solve, type Sim } from "@/aircraft/sr22t/model";
import { CAT, MD302_POS } from "@/aircraft/sr22t/parts";
import { CABLES } from "@/aircraft/sr22t/rig";
import { useSR22T } from "@/aircraft/sr22t/store";
import { curveOf } from "@/lib/geometry";
import { mats } from "@/lib/materials";
import { toV } from "@/lib/math";
import { useView } from "@/lib/view";
import { patched, type Patch } from "./helpers";

const at = (patch: Patch<Sim> = {}) => {
  const s = patched(initialSim, patch);
  return { s, E: solve(s), R: flowRates(s, solve(s)) };
};
const rates = (patch: Patch<Sim> = {}) => at(patch).R;
/** Everything dark but the named batteries, engine stopped. */
const parked = (bat1: boolean, bat2: boolean): Patch<Sim> => ({ eng: { running: false }, elec: { bat1, bat2 } });

/** World bounding boxes of every part with this name. */
const boxes = (name: string) =>
  CAT.parts
    .filter((p) => p.name === name)
    .map((p) => {
      const g = p.geo();
      g.applyMatrix4(
        new THREE.Matrix4().compose(
          toV(p.pos ?? [0, 0, 0]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
          toV(p.scale ?? [1, 1, 1]),
        ),
      );
      g.computeBoundingBox();
      const b = g.boundingBox!.clone();
      g.dispose();
      return b;
    });
const box = (name: string) => {
  const b = boxes(name);
  expect(b, name).toHaveLength(1);
  return b[0];
};
const tvs = () => boxes("Harness TVS").map((b) => b.getCenter(new THREE.Vector3()));

describe("SR22T electrical distribution flows", () => {
  it("the BAT 2 feed follows the battery and its breaker (POH 7-50)", () => {
    // engine stopped, BAT 1 off: BAT 2 alone supplies ESS BUS 1
    expect(rates(parked(false, true)).bat2).toBeGreaterThan(0);
    expect(rates({ ...parked(false, true), cb: { "BAT 2": true } }).bat2).toBe(0);
    // depleted after 30 min as the sole source (POH 3-17)
    expect(rates({ eng: { running: false }, elec: { bat1: false, bat2: true, tBat: 30 } }).bat2).toBe(0);
    // engine running: charged from ESS BUS 1 (POH 7-47), the particles run back into the battery
    expect(rates({}).bat2).toBeLessThan(0);
    expect(rates({ cb: { "BAT 2": true } }).bat2).toBe(0);
    expect(rates({ elec: { bat2: false } }).bat2).toBe(0);
  });

  it("each distribution bus feeds its own breaker-panel buses (POH 7-49)", () => {
    // ALT 1 failed and BAT 1 off: Main Dist Bus 1 is dead, ALT 2 still feeds Main Dist Bus 2
    const noMdb1 = at({ elec: { bat1: false, fail: { alt1: true } } });
    expect(noMdb1.E.mdb1).toBe(0);
    expect(noMdb1.R.cbMdb1).toBe(0);
    expect(noMdb1.R.cbMdb2).toBe(1);
    expect(noMdb1.R.cbEss).toBe(1);
    // ALT 2 failed: Main Dist Bus 2 is fed from Main Dist Bus 1 through the diode, as the solver says
    const noAlt2 = at({ elec: { fail: { alt2: true } } });
    expect(noAlt2.E.mdb2).toBeGreaterThan(0);
    expect(noAlt2.R.cbMdb2).toBe(1);
    // BAT 2 alone: only the essential bundle carries power, back through ESSENTIAL POWER (POH 7-50, Fig 7-10)
    const bat2Only = rates(parked(false, true));
    expect([bat2Only.cbMdb1, bat2Only.cbMdb2, bat2Only.cbEss]).toEqual([0, 0, 1]);
    // ...and with ESSENTIAL POWER pulled BAT 2 reaches only ESS BUS 1, through its own breaker
    expect(rates({ ...parked(false, true), cb: { "ESSENTIAL POWER": true } }).cbEss).toBe(0);
    // everything off
    expect(rates(parked(false, false))).toMatchObject({ cbMdb1: 0, cbMdb2: 0, cbEss: 0 });
  });

  it("the starter cable carries current only while cranking (POH 7-37; Fig 7-10)", () => {
    const cranking = patched(initialSim, { eng: { running: false, key: "START" } });
    const crank = (patch: Patch<Sim> = {}) => {
      const s = patched(cranking, patch);
      return flowRates(s, solve(s)).starterCable;
    };
    expect(crank()).toBeGreaterThan(0);
    expect(crank({ eng: { key: "BOTH" } })).toBe(0);
    expect(crank({ cb: { STARTER: true } })).toBe(0);
    expect(crank({ elec: { bat1: false } })).toBe(0);
    expect(rates({}).starterCable).toBe(0);
  });

  it("the landing-light feed runs only through the LAND-energized MCU relay (POH 7-57)", () => {
    const cases: Patch<Sim>[] = [
      { lights: { land: false } },
      { lights: { land: true } },
      { ...parked(false, true), lights: { land: true } },
    ];
    const got = cases.map((patch) => {
      const { s, E, R } = at(patch);
      expect(R.landFeed).toBe(Number(extLit(s, E).land));
      return R.landFeed;
    });
    expect(got[0]).toBe(0);
    expect(got[1]).toBeGreaterThan(0);
    // Main Dist Bus 1 dead: no 28 VDC behind the relay
    expect(got[2]).toBe(0);
  });

  it("the single breaker-panel feed is gone: three bundles join the MCU to the breaker panel", () => {
    const keys = FLOWS.map((f) => f.key);
    expect(keys).not.toContain("cb");
    expect(keys).toEqual(expect.arrayContaining(["cbMdb1", "cbMdb2", "cbEss", "starterCable", "landFeed"]));
  });
});

describe("SR22T harness hardware", () => {
  it("harness TVS at the AMM 24-50 connectors (PDF 752)", () => {
    const pts = tvs();
    // ADAHRS 2 is installed on this airplane, so all eight are drawn
    expect(boxes("GSU 75 ADAHRS 2")).toHaveLength(1);
    expect(pts).toHaveLength(8);
    const near = (b: THREE.Box3, d: number) => pts.filter((p) => b.distanceToPoint(p) <= d).length;
    expect(near(box("GSU 75 ADAHRS 1"), 0.02)).toBe(1);
    expect(near(box("GSU 75 ADAHRS 2"), 0.02)).toBe(1);
    expect(near(box("GIA 1 (GIA 63W)"), 0.02)).toBe(1);
    expect(near(box("PFD bezel"), 0.05)).toBe(2);
    expect(near(box("Circuit breaker panel"), 0.15)).toBe(2);
    // the attitude indicator (MD302) connector, behind the instrument panel
    expect(pts.filter((p) => p.distanceTo(toV(MD302_POS)) < 0.17)).toHaveLength(1);
  });

  it("the AVIONICS master relays sit by the breaker panel (AMM 24-50 PDF 752; POH 7-51)", () => {
    expect(
      box("Circuit breaker panel").distanceToPoint(box("Avionics master relays").getCenter(new THREE.Vector3())),
    ).toBeLessThan(0.15);
  });

  it("the AVIONICS master relays light only with the AVIONICS switch on and MAIN BUS 1 powered (POH 7-51; AMM 24-50 PDF 752)", () => {
    const relay = CAT.parts.find((p) => p.name === "Avionics master relays");
    expect(relay?.anim).toBeDefined();
    const saved = useSR22T.getState(),
      sys = useView.getState().sys;
    /** The relay's rendered material with the sim patched, in the electrical view. */
    const lit = (patch: Patch<Sim>) => {
      const s = patched(initialSim, patch);
      useSR22T.setState({ s, E: solve(s) });
      const mesh = new THREE.Mesh();
      relay!.anim!(mesh, 0);
      return mesh.material === mats("#FFD34D").hi;
    };
    try {
      useView.setState({ sys: "electrical" });
      expect(lit({})).toBe(true);
      // AVIONICS off, MAIN BUS 1 still powered
      expect(at({ elec: { avionics: false } }).E.main1).toBeGreaterThan(0);
      expect(lit({ elec: { avionics: false } })).toBe(false);
      // AVIONICS on, MAIN BUS 1 dead: BAT 2 alone feeds only the essential buses
      expect(at(parked(false, true)).E.main1).toBe(0);
      expect(lit(parked(false, true))).toBe(false);
    } finally {
      useSR22T.setState({ s: saved.s, E: saved.E });
      useView.setState({ sys });
    }
  });

  it("the harness runs reach the wings, the avionics bay, the firewall and the bolster switches", () => {
    const run = (name: string) => {
      const p = CAT.parts.find((q) => q.name === name);
      expect(p, name).toBeDefined();
      const g = p!.geo() as THREE.TubeGeometry;
      return g.parameters.path;
    };
    for (const s of [-1, 1]) {
      const tip = run(`Wing harness (${s < 0 ? "LH" : "RH"})`).getPoint(1);
      expect(tip.z * s).toBeGreaterThan(4.5);
    }
    const tail = run("Tail harness").getSpacedPoints(200);
    expect(Math.min(...tail.map((p) => p.x))).toBeLessThan(AB - 0.5);
    const engine = run("Engine harness (firewall → GEA 71)");
    expect(Math.abs(engine.getPoint(0).x - FW)).toBeLessThan(0.02);
    expect(box("GEA 71 Engine Airframe Unit").distanceToPoint(engine.getPoint(1))).toBeLessThan(0.01);
    const bolster = run("Bolster switch wiring");
    expect(box("Bolster switch panel").distanceToPoint(bolster.getPoint(0))).toBeLessThan(0.01);
    expect(box("Master Control Unit").distanceToPoint(bolster.getPoint(1))).toBeLessThan(0.01);
  });

  it("the harness runs clear the control cables and fuel lines by 5 mm", () => {
    const RUNS = [
      "Wing harness (LH)",
      "Wing harness (RH)",
      "Tail harness",
      "Engine harness (firewall → GEA 71)",
      "Bolster switch wiring",
    ];
    const harness = CAT.parts.filter((p) => RUNS.includes(p.name ?? ""));
    expect(harness).toHaveLength(5);
    const cableKeys = new Set(CABLES.map((c) => c.key));
    const others = FLOWS.filter((f) => f.tube !== false && (cableKeys.has(f.key) || /^fuel/.test(f.key))).map((f) => ({
      key: f.key,
      r: f.r ?? 0.012,
      pts: curveOf(f.pts, f.tension ?? 0.3).getSpacedPoints(600),
    }));
    expect(others.length).toBeGreaterThan(10);
    const hits: string[] = [];
    for (const h of harness) {
      const g = h.geo() as THREE.TubeGeometry,
        r = g.parameters.radius;
      const pts = g.parameters.path.getSpacedPoints(800);
      for (const o of others) {
        let gap = Infinity;
        for (const p of pts) for (const q of o.pts) gap = Math.min(gap, p.distanceTo(q) - r - o.r);
        if (gap < 0.005) hits.push(`${h.name} / ${o.key}: ${(gap * 1000).toFixed(1)} mm`);
      }
    }
    expect(hits).toEqual([]);
  });
});
