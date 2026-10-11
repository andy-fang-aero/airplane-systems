import { describe, expect, it } from "vitest";
import { CAT } from "@/aircraft/sr22t/parts";
import { CYLS, cylExhaust, cylIntake, cylOrigin, cylPoint } from "@/aircraft/sr22t/parts/engine";
import { IGNITION_LEADS, plugTerminal } from "@/aircraft/sr22t/parts/engine-ignition";

describe("TSIO-550-K installation drawing 657645 (Continental M-18, 21 Sep 2017, Fig 5-34 p. 5-54)", () => {
  it("places 5-3-1 right and 6-4-2 left, with #1 rearmost (also AMM Fig 74-20-2 PDF p. 2625)", () => {
    const frontToRear = (side: number) => CYLS.filter((c) => c.s === side).sort((a, b) => b.x - a.x);
    expect(frontToRear(1).map((c) => c.n)).toEqual([5, 3, 1]);
    expect(frontToRear(-1).map((c) => c.n)).toEqual([6, 4, 2]);
    expect([...CYLS].sort((a, b) => a.x - b.x)[0].n).toBe(1);
  });

  it("spaces each bank 7.31 in. and advances the left bank 7.89 minus 5.42 in.", () => {
    // Literal converted drawing values: fail if model constants drift together.
    for (const [aft, mid, front] of [
      [1, 3, 5],
      [2, 4, 6],
    ]) {
      const x = (n: number) => CYLS.find((c) => c.n === n)!.x;
      expect(x(mid) - x(aft)).toBeCloseTo(0.185674, 8);
      expect(x(front) - x(mid)).toBeCloseTo(0.185674, 8);
    }
    for (const [right, left] of [
      [1, 2],
      [3, 4],
      [5, 6],
    ]) {
      expect(CYLS.find((c) => c.n === left)!.x - CYLS.find((c) => c.n === right)!.x).toBeCloseTo(0.062738, 8);
    }
  });

  it("keeps illustrative cylinder solids apart and attachment points on their cylinder", () => {
    for (const c of CYLS) {
      const parts = CAT.parts.filter((p) => p.parent === `cyl:${c.n}`);
      for (const p of parts) {
        const g = p.geo();
        g.computeBoundingBox();
        expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeLessThan(0.185674);
        g.dispose();
      }
      const leads = IGNITION_LEADS.filter((l) => l.cyl === c.n);
      expect(leads).toHaveLength(2);
      for (const lead of leads) {
        const plug = plugTerminal(c, lead.pos);
        // The harness now seats on the coaxial plug lead terminal.
        expect(lead.pts.at(-1)!).toEqual(plug);
      }
      expect(cylPoint(c, [0, 0, 0])).toEqual(cylOrigin(c));
      expect(cylIntake(c)[0]).toBe(c.x);
      expect(cylExhaust(c)[0]).toBe(c.x);
      expect(cylIntake(c)[1]).toBeGreaterThan(cylOrigin(c)[1]);
      expect(cylExhaust(c)[1]).toBeLessThan(cylOrigin(c)[1]);
    }
  });
});
