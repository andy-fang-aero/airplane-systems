/**
 * Fuel manifold valve ("spider") on top of the induction manifold at engine centre: AMM 13773-002 Rev 7
 * Fig 71-00-2 sheet 1 item 4 (PDF p. 2487); Continental M-18 Fig 12-10 item 4 (p. 12-15). Geometry approximate.
 */
import { describe, expect, it } from "vitest";
import { Box3, Curve, TubeGeometry, Vector3 } from "three";
import { CAT, CYLS, THROTTLE } from "@/aircraft/sr22t/parts";
import { INTAKE_MANIFOLD_PATH, INTAKE_MANIFOLD_R } from "@/aircraft/sr22t/parts/engine-air";
import { FUEL_PRESSURE_SWITCH, SPIDER, SPIDER_H, SPIDER_R } from "@/aircraft/sr22t/parts/fuel";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
import { allSolids, allTubes, gap, outside, shape, solid, type Shape } from "./sr22t-engine-gap";

const NAME = "Fuel manifold valve (“spider”)";
const part = (name: string) => {
  const found = CAT.parts.find((p) => p.name === name);
  expect(found, name).toBeDefined();
  return found!;
};
const flow = (key: string) => FLOWS.find((f) => f.key === key)!;
const injKeys = CYLS.map((c) => "inj" + c.n);
/** Radial and vertical distance outside the drum; negative inside. */
const outsideDrum = (p: Vector3) =>
  Math.max(Math.hypot(p.x - SPIDER[0], p.z - SPIDER[2]) - SPIDER_R, Math.abs(p.y - SPIDER[1]) - SPIDER_H / 2);
const margin = 0.005;

describe("SR22T fuel manifold valve on the intake manifold", () => {
  it("sits on top of the manifold tube at engine centre, above and outside it by at least 5 mm", () => {
    const spider = solid(part(NAME));
    const manifold = solid(part("Intake manifold"));
    expect(SPIDER[0]).toBeCloseTo(CYLS.reduce((sum, c) => sum + c.x, 0) / CYLS.length, 9);
    expect(SPIDER[2]).toBe(0);
    const d = gap(spider, manifold, 0.05);
    expect(d).toBeGreaterThanOrEqual(margin);
    // Seated on it, not floating: the base is within 1 cm of the manifold's top surface.
    expect(d).toBeLessThanOrEqual(0.01);
    // Every manifold vertex under the valve's footprint is below the valve's base.
    const base = spider.box.min.y;
    const under = manifold.faces
      .flatMap((f) => [f.triangle.a, f.triangle.b, f.triangle.c])
      .filter((p) => Math.hypot(p.x - SPIDER[0], p.z - SPIDER[2]) <= SPIDER_R);
    expect(under.length).toBeGreaterThan(0);
    for (const p of under) expect(p.y).toBeLessThan(base - margin);
    expect(base).toBeGreaterThan(Math.max(...INTAKE_MANIFOLD_PATH.map((p) => p[1])) + INTAKE_MANIFOLD_R);
  });

  it("every injector line, the drain and the fuel supply start or end at the valve (POH 7-38; AMM 28-20 PDF 1113)", () => {
    for (const key of injKeys) {
      const pts = flow(key).pts.map(toV);
      expect(outsideDrum(pts[0]), key).toBeLessThan(0);
      // The line leaves through the drum wall.
      expect(Math.abs(outsideDrum(pts[1])), key).toBeLessThan(1e-9);
    }
    expect(Math.abs(outsideDrum(toV(flow("fuelDrainSpider").pts[0])))).toBeLessThan(1e-9);
    const supply = flow("fuelMain").pts.map(toV);
    expect(outsideDrum(supply.at(-1)!)).toBeLessThan(0);
    expect(Math.abs(outsideDrum(supply.at(-2)!))).toBeLessThan(1e-9);
  });

  it("the fuel pressure switch hangs below the valve, beside the manifold (POH Fig 7-8 7-42; AMM Fig 28-00-3 PDF 1086)", () => {
    expect(part("Fuel pressure switch").pos).toEqual(FUEL_PRESSURE_SWITCH);
    expect(FUEL_PRESSURE_SWITCH[1]).toBeLessThan(SPIDER[1] - SPIDER_H / 2);
    expect(toV(FUEL_PRESSURE_SWITCH).distanceTo(toV(SPIDER))).toBeLessThan(0.15);
  });

  it("the valve, its switch, its whole drain and the supply leg clear every solid and rendered flow tube by 5 mm", () => {
    const solids = allSolids();
    const tubes = allTubes();
    const main = flow("fuelMain");
    const full = curveOf(main.pts, main.tension ?? 0.3);
    // The supply leg from the throttle body's metering valve to the spider, on the curve Flows.tsx renders.
    const from = main.pts.findIndex((p) => toV(p).equals(toV(THROTTLE))) / (main.pts.length - 1);
    expect(from).toBeGreaterThan(0);
    class Leg extends Curve<Vector3> {
      constructor() {
        super();
      }
      getPoint(t: number, target = new Vector3()) {
        return full.getPoint(from + t * (1 - from), target);
      }
    }
    const leg = shape(new TubeGeometry(new Leg(), 48, main.r ?? 0.012, 6, false), "flow fuelMain (supply leg)", {
      key: "fuelMain",
    });
    const spider = solids.find((s) => s.name === NAME)!;
    const box = (name: string) => solids.find((s) => s.name === name)!.box.clone();
    // Joints are cropped away: the supply leg's run inside the throttle body, and the drain's end inside the firewall
    // drain manifold, where every fuel drain meets (AMM 28-20 PDF 1113). The rest of the drain, from the valve to the
    // manifold, is audited whole.
    const drain = outside(
      tubes.find((s) => s.key === "fuelDrainSpider")!,
      box("Drain manifold").expandByScalar(0.03),
    )!;
    const owned: [Shape, boolean][] = [
      [spider, true],
      [solids.find((s) => s.name === "Fuel pressure switch")!, true],
      [drain, false],
      [outside(leg, box("Throttle body / fuel-metering valve").expandByScalar(0.01))!, false],
    ];
    const near = new Box3()
      .setFromCenterAndSize(toV(SPIDER), new Vector3(2 * SPIDER_R, SPIDER_H, 2 * SPIDER_R))
      .expandByScalar(0.03);
    // Physical joints: every line, the supply and the drain meet the valve body; the leg is part of fuelMain.
    const valveFlow = (s: Shape) => /^(inj[1-6]|fuelMain|fuelDrainSpider)$/.test(s.key ?? "");
    const hits: string[] = [];
    for (const [a, closed] of owned)
      for (const b of [...solids, ...tubes]) {
        if (b.name === a.name || (b.key && b.key === a.key)) continue;
        if ((a === spider && valveFlow(b)) || (b === spider && valveFlow(a))) continue;
        // Cropped meshes are open, so they skip the nesting test.
        let d = gap(a, b, margin, closed);
        // Tubes that meet at the valve are measured clear of it.
        if (d < margin && valveFlow(a) && valveFlow(b)) {
          const [x, y] = [outside(a, near), outside(b, near)];
          d = x && y ? gap(x, y, margin, false) : Infinity;
        }
        if (d < margin - 1e-7) hits.push(`${a.name} / ${b.name}: ${(d * 1000).toFixed(1)} mm`);
      }
    expect(hits).toEqual([]);
  }, 60000);
});
