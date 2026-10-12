/** POH 13772-007 7-40–7-43, Fig 7-8; AMM 13773-002 Rev 7 28-00/10/20. */
import { describe, expect, it } from "vitest";
import { CAT, CYLS, MIXTURE_ARM, MIXTURE_CABLE, TANK_SPAN, THROTTLE, tankTop } from "@/aircraft/sr22t/parts";
import { cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { FW, wingP } from "@/aircraft/sr22t/geometry";
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { initialSim, solve } from "@/aircraft/sr22t/model";
import { toV } from "@/lib/math";
import { patched } from "./helpers";

const part = (name: string) => {
  const found = CAT.parts.find((p) => p.name === name);
  expect(found, name).toBeDefined();
  return found!;
};
const flow = (key: string) => FLOWS.find((f) => f.key === key)!;
const end = (key: string) => toV(flow(key).pts.at(-1)!);

describe("SR22T fuel distribution", () => {
  it("fuel reaches the nozzles in AMM 28-00 order (PDF 1078)", () => {
    const names = [
      "Fuel selector valve",
      "Electric fuel pump",
      "Gascolator",
      "Engine-driven fuel pump",
      "Fuel flow transducer",
      "Throttle body / fuel-metering valve",
      "Fuel manifold valve (“spider”)",
    ];
    const positions = names.map((name) => toV(part(name).pos!));
    // Walk only the supply route; ignore under-floor routing points far from any component.
    const visited: number[] = [];
    for (const point of flow("fuelMain").pts) {
      const distances = positions.map((pos) => pos.distanceTo(toV(point)));
      const nearest = distances.indexOf(Math.min(...distances));
      if (distances[nearest] < 0.06 && visited.at(-1) !== nearest) visited.push(nearest);
    }
    expect(visited).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const c of CYLS) {
      expect(toV(flow("inj" + c.n).pts[0]).toArray()).toEqual(positions.at(-1)!.toArray());
      const nozzle = toV(part(`Fuel injector nozzle, cyl ${c.n}`).pos!).add(toV(cylOrigin(c)));
      expect(end("inj" + c.n).distanceTo(nozzle)).toBeLessThanOrEqual(0.01);
    }
  });

  it("return fuel enters the top of the selected tank (AMM 28-10 PDF 1088; POH Fig 7-8)", () => {
    for (const side of [-1, 1]) {
      const key = side < 0 ? "fuelRetL" : "fuelRetR";
      const p = end(key);
      expect(p.toArray()).toEqual(tankTop(side).toArray());
      expect(Math.abs(p.z)).toBeGreaterThanOrEqual(TANK_SPAN[0]);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(TANK_SPAN[1]);
      // On the tank's top skin (0.85 of the wing thickness, Airplane.tsx): above the mean line, and far enough below the
      // upper wing skin that the return tube's wall stays inside the wing.
      expect(p.y).toBeGreaterThan(wingP(p.z, 0.45, 0).y);
      expect(wingP(p.z, 0.45, 1).y - p.y).toBeGreaterThan(flow(key).r!);
      for (const sel of ["L", "R", "OFF"] as const) {
        const s = patched(initialSim, { eng: { running: true }, fuel: { sel } });
        const rates = flowRates(s, solve(s));
        expect(rates[key]).toBe(sel === (side < 0 ? "L" : "R") ? 1 : 0);
      }
    }
  });

  it("a selector enclosure and an aft firewall enclosure keep fuel out of the cabin (AMM 28-20 PDF 1113)", () => {
    const selector = part("Selector valve enclosure");
    const firewall = part("Firewall fuel enclosure");
    expect(selector.pos).toEqual([1.24, -0.36, 0]);
    expect(selector.pos![1] + 0.08).toBeLessThan(part("Fuel selector valve").pos![1]);
    expect(firewall.pos).toEqual([FW - 0.035, -0.6, 0.15]);
    expect(firewall.pos![0] + 0.025).toBeLessThan(FW);
    expect(selector.fairing).toBe(true);
    expect(firewall.fairing).toBe(true);
  });

  it("engine and fuel drains meet at the bottom centre of the firewall (AMM 28-20 PDF 1113)", () => {
    const p = toV(part("Drain manifold").pos!);
    expect(p.x - FW).toBeLessThan(0.15);
    expect(Math.abs(p.z)).toBeLessThan(0.1);
    expect(p.x).toBeGreaterThan(FW);
    expect(p.y).toBeLessThan(part("Engine-driven fuel pump").pos![1]);
    for (const key of ["fuelDrainAux", "fuelDrainGas", "fuelDrainEngine", "fuelDrainSpider", "fuelDrainHeads"]) {
      expect(end(key).toArray()).toEqual(p.toArray());
    }
    const check = part("Cylinder drain manifold check valve");
    expect(check.pos![0]).toBeGreaterThan(FW); // Fig 71-70-2 detail A item 12, PDF 2565.
    expect(toV(check.pos!).distanceTo(p)).toBeLessThan(0.1);
    expect(check.pos![1] - 0.03).toBeCloseTo(p.y - 0.06); // Both sit on the schematic manifold base.
    const heads = flow("fuelDrainHeads").pts.map((point) => toV(point).toArray());
    expect(heads[0]).toEqual([3.05, -0.42, 0]); // Unnamed under-engine collector retained.
    for (const c of CYLS) expect(end("fuelDrainCyl" + c.n).toArray()).toEqual(heads[0]);
    expect(heads.at(-2)).toEqual(check.pos);
    expect(heads.at(-1)).toEqual(p.toArray());
  });

  it("the gascolator drain is one of the 5 drains (POH Fig 7-8; AMM Fig 28-20-1 PDF 1116)", () => {
    const drain = part("Gascolator drain");
    expect(drain.sys).toContain("fuel");
    expect(drain.pos![0]).toBeGreaterThan(FW);
    expect(drain.pos![0] - FW).toBeLessThan(0.15);
    expect(Math.abs(drain.pos![2])).toBeLessThan(0.1);
    expect(drain.ext).toBe(true);
    expect(end("fuelDrainOutlet").toArray()).toEqual(drain.pos);
    expect(
      CAT.parts.filter((p) => ["Tank drain", "Collector drain", "Gascolator drain"].includes(p.name ?? "")),
    ).toHaveLength(5);
  });

  it("fuel pump is left rear and boost pump is forward of firewall (AMM Fig 71-00-2 sheet 3 PDF 2489)", () => {
    const pump = part("Engine-driven fuel pump");
    expect(pump.pos).toEqual([2.8, -0.3, -0.12]);
    expect(pump.pos![2]).toBeLessThan(0);
    expect(pump.pos![0]).toBeGreaterThan(FW);
    expect(pump.pos![0]).toBeLessThan(THROTTLE[0]);
    expect(part("Electric fuel pump").pos![0]).toBeGreaterThan(FW);
    // Fig 71-00-2 sheet 3 shows item 31 inboard of the filter (item 27); the vertical filter now stands at its dimensioned
    // M-18 Fig 5-33 station while the pump's coded station is unchanged (approximate, re-check pending), so only
    // their separation is asserted: the pump sits forward of and below the filter canister and its adapter.
    const box = (name: string) => {
      const p = part(name),
        g = p.geo();
      g.computeBoundingBox();
      const b = g.boundingBox!.clone().translate(toV(p.pos!));
      g.dispose();
      return b;
    };
    for (const name of ["Oil filter (full-flow)", "Oil filter adapter"])
      expect(box("Engine-driven fuel pump").intersectsBox(box(name)), name).toBe(false);
    expect(MIXTURE_ARM).toEqual(pump.pos);
    expect(MIXTURE_CABLE.at(-1)).toEqual(pump.pos);
    expect(toV(flow("fuelRetL").pts[0]).toArray()).toEqual(pump.pos);
    expect(toV(flow("fuelRetR").pts[0]).toArray()).toEqual(pump.pos);
  });

  it("fuel pressure switch mounts below the injector manifold (POH Fig 7-8 7-42; AMM Fig 28-00-3 PDF 1086)", () => {
    const switchPos = toV(part("Fuel pressure switch").pos!);
    const spider = toV(part("Fuel manifold valve (“spider”)").pos!);
    // Approximate, hung below the valve beside the induction manifold; figures undimensioned.
    expect(switchPos.y).toBeLessThan(spider.y);
    expect(switchPos.distanceTo(spider)).toBeLessThan(0.15);
    expect(flow("fuelMain").pts.map((p) => toV(p).toArray())).not.toContainEqual(switchPos.toArray());
  });

  it("supply and return crossings fit the firewall enclosure (AMM Fig 28-20-3 items 10, 15–16 PDF 1131)", () => {
    const center = part("Firewall fuel enclosure").pos!;
    for (const key of ["fuelMain", "fuelRetL", "fuelRetR"]) {
      const pts = flow(key).pts.map(toV);
      const i = pts.findIndex((p, n) => n > 0 && (p.x - FW) * (pts[n - 1].x - FW) <= 0);
      expect(i).toBeGreaterThan(0);
      const a = pts[i - 1],
        b = pts[i];
      const crossing = a.clone().lerp(b, (center[0] - a.x) / (b.x - a.x));
      expect(Math.abs(crossing.y - center[1])).toBeLessThan(0.07);
      expect(Math.abs(crossing.z - center[2])).toBeLessThan(0.09);
    }
  });

  it("dry drain hoses never animate as feeds (AMM 28-20 PDF 1113; static default)", () => {
    const drains = FLOWS.filter((f) => f.key.startsWith("fuelDrain"));
    expect(drains).toHaveLength(12);
    for (const running of [false, true]) {
      for (const pump of ["OFF", "BOOST", "HIGH"] as const) {
        const s = patched(initialSim, { eng: { running }, fuel: { pump } });
        const rates = flowRates(s, solve(s));
        for (const f of drains) {
          expect(rates[f.key]).toBe(0);
          expect(f.count).toBe(0);
        }
      }
    }
  });
});
