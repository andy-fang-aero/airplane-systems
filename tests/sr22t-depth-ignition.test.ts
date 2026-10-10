/** Engine ignition and starting: SR22T POH 13772-007 7-35, 7-37; AMM 13773-002 Rev 7 chapters 74 and 80. Metres are illustrative. */
import { describe, expect, it } from "vitest";
import { Box3, TubeGeometry, Vector3 } from "three";
import { CAT, CYLS, TURBO_SCAVENGE } from "@/aircraft/sr22t/parts";
import { FIRING_ORDER, cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { plugTerminal } from "@/aircraft/sr22t/parts/engine-ignition";
import { SPARK_RATE, firingPhase } from "@/lib/anims";

const parts = (re: RegExp) => CAT.parts.filter((p) => re.test(p.name ?? ""));
const part = (name: string) => {
  const p = CAT.parts.find((p) => p.name === name);
  expect(p, name).toBeDefined();
  return p!;
};
const position = (name: string) => new Vector3(...part(name).pos!);
const bounds = (name: string) => {
  const p = part(name),
    geo = p.geo();
  geo.computeBoundingBox();
  const b = new Box3().copy(geo.boundingBox!).translate(new Vector3(...p.pos!));
  geo.dispose();
  return b;
};
const cylinder = (n: number) => CYLS.find((c) => c.n === n)!;
/** Spark plugs in airplane coordinates: the plug's position on its cylinder plus the cylinder's origin. */
const plugs = () =>
  parts(/^Spark plug — cyl /).map((p) => {
    const [, n, pos] = /cyl (\d) (upper|lower)$/.exec(p.name!)!;
    const c = cylinder(Number(n));
    return { c, upper: pos === "upper", note: p.note!, at: new Vector3(...cylOrigin(c)).add(new Vector3(...p.pos!)) };
  });

describe("SR22T ignition", () => {
  it("cylinders 1 and 2 are the aft pair; odd cylinders on the right (AMM Fig 74-20-2 PDF 2625)", () => {
    const right = CYLS.filter((c) => c.s > 0),
      left = CYLS.filter((c) => c.s < 0);
    expect(cylinder(1).s).toBe(1);
    expect(cylinder(1).x).toBe(Math.min(...right.map((c) => c.x)));
    expect(cylinder(2).s).toBe(-1);
    expect(cylinder(2).x).toBe(Math.min(...left.map((c) => c.x)));
    // right bank 5-3-1 and left bank 6-4-2, front to rear
    const frontToRear = (bank: typeof CYLS) => [...bank].sort((a, b) => b.x - a.x).map((c) => c.n);
    expect(frontToRear(right)).toEqual([5, 3, 1]);
    expect(frontToRear(left)).toEqual([6, 4, 2]);
  });

  it("the right magneto fires the lower right and upper left plugs (POH 7-37)", () => {
    const all = plugs();
    expect(all).toHaveLength(12);
    for (const p of all) {
      const right = (p.c.s > 0 && !p.upper) || (p.c.s < 0 && p.upper);
      expect(p.note, `cyl ${p.c.n} ${p.upper ? "upper" : "lower"}`).toContain(
        `Fired by the ${right ? "right" : "left"} magneto`,
      );
    }
  });

  it("twelve ignition leads, six per magneto (AMM 74-20)", () => {
    const leads = parts(/^Ignition lead — /);
    expect(leads).toHaveLength(12);
    const all = plugs(),
      reached = new Set<number>();
    for (const side of ["right", "left"] as const) {
      const mine = leads.filter((l) => l.name === `Ignition lead — ${side} magneto`);
      expect(mine).toHaveLength(6);
      const magneto = position(`${side === "right" ? "Right" : "Left"} magneto`);
      for (const l of mine) {
        const geo = l.geo() as TubeGeometry,
          start = geo.parameters.path.getPoint(0),
          end = geo.parameters.path.getPoint(1);
        geo.dispose();
        expect(start.distanceTo(magneto)).toBeLessThanOrEqual(0.1);
        const i = all.findIndex((p) => new Vector3(...plugTerminal(p.c, p.upper ? "U" : "L")).distanceTo(end) <= 0.01);
        expect(i, `${l.name} ends at a plug`).toBeGreaterThanOrEqual(0);
        expect(all[i].note).toContain(`Fired by the ${side} magneto`);
        reached.add(i);
      }
    }
    expect(reached.size).toBe(12);
  });

  it("plugs fire in the 1-6-3-2-5-4 order (AMM Fig 74-20-2)", () => {
    expect([...FIRING_ORDER]).toEqual([1, 6, 3, 2, 5, 4]);
    const period = (2 * Math.PI) / SPARK_RATE;
    // each cylinder's flash peaks when sin(t · SPARK_RATE + phase) = 1
    const peak = (n: number) =>
      ((((Math.PI / 2 - firingPhase(FIRING_ORDER, n)) / SPARK_RATE) % period) + period) % period;
    const cylinders = CYLS.map((c) => c.n);
    expect([...cylinders].sort((a, b) => peak(a) - peak(b))).toEqual([1, 6, 3, 2, 5, 4]);
    // with the threshold the SR22T plugs use, only one cylinder flashes at each peak
    const on = Math.cos(Math.PI / FIRING_ORDER.length);
    for (const n of cylinders) {
      const lit = cylinders.filter((m) => Math.sin(peak(n) * SPARK_RATE + firingPhase(FIRING_ORDER, m)) > on);
      expect(lit).toEqual([n]);
    }
  });

  it("an unknown cylinder has no firing phase", () => {
    expect(() => firingPhase(FIRING_ORDER, 7)).toThrow(/not in the firing order/);
  });

  it("magneto pressurization runs from its own throttle-body fitting through one filter between the magnetos (AMM 74-10 PDF 2616; Fig 74-10-2; M-18 Fig 5-35 View F-F)", () => {
    const filter = position("Magneto desiccant filter"),
      right = position("Right magneto"),
      left = position("Left magneto"),
      fitting = position("Magneto pressure fitting"),
      throttle = position("Throttle body / fuel-metering valve");
    expect(filter.z).toBeGreaterThan(left.z);
    expect(filter.z).toBeLessThan(right.z);
    expect(Math.abs(filter.x - right.x)).toBeLessThan(0.05);
    expect(fitting.distanceTo(throttle)).toBeLessThan(0.1);
    const lines = parts(/^Magneto pressurization line$/).map((l) => {
      const geo = l.geo() as TubeGeometry;
      const ends = [geo.parameters.path.getPoint(0), geo.parameters.path.getPoint(1)];
      geo.dispose();
      return ends;
    });
    expect(lines.some(([start]) => start.distanceTo(fitting) <= 0.02)).toBe(true);
    // each branch ends on the elbow fitting on top of its magneto (Fig 74-10-2 item 14)
    for (const name of ["Right magneto", "Left magneto"]) {
      const magneto = position(name);
      expect(
        lines.some(([, end]) => end.distanceTo(magneto) <= 0.075 && end.y > magneto.y + 0.05),
        name,
      ).toBe(true);
    }
  });

  it("the starter drives through its adapter at the rear; the scavenge pump sits outboard, clear of it (AMM 80-10 PDF 2798; 79-00 PDF 2764)", () => {
    const adapter = bounds("Starter drive adapter"),
      starter = bounds("Starter"),
      engine = bounds("Continental TSIO-550-K"),
      pump = bounds("Turbo oil scavenge pump");
    expect(adapter.max.x).toBeLessThanOrEqual(engine.min.x + 0.005);
    expect(starter.max.x).toBeLessThanOrEqual(adapter.min.x + 0.005);
    expect(pump.min.z).toBeGreaterThan(adapter.max.z);
    expect(pump.intersectsBox(adapter)).toBe(false);
    expect(pump.intersectsBox(starter)).toBe(false);
    expect(TURBO_SCAVENGE[2]).toBeGreaterThan(0);
    expect(part("Starter").note).toContain("2-amp STARTER circuit breaker on the NON-ESSENTIAL BUS");
  });

  it("the ignition key switch is left of centre on the instrument panel (POH 7-37; AMM 74-00 PDF 2604)", () => {
    expect(position("Ignition key switch").z).toBeLessThan(0);
  });
});
