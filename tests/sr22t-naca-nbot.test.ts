import { afterEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import type * as Lib from "@/lib/geometry";

// Rebuild the SR22T loft with a different lower-skin exponent and check that the NACA inlet
// lips (POH 13772-007 7-37; AMM 71-60) follow the skin rather than a fixed nBot = 3 curve.
const load = async (nBot?: number) => {
  vi.resetModules();
  if (nBot !== undefined)
    vi.doMock("@/lib/geometry", async (importOriginal) => {
      const lib = await importOriginal<typeof Lib>();
      return {
        ...lib,
        fuselage: (o: Parameters<typeof lib.fuselage>[0]) =>
          lib.fuselage({ ...o, nBot, section: (x) => ({ ...o.section!(x), nBot }) }),
      };
    });
  return import("@/aircraft/sr22t/geometry");
};
// 0.1 mm: well above Float32 rounding of the vertices (~1e-7 m), far below the nBot 3 -> 4 lip shift (millimetres).
const SKIN_TOL = 0.0001;
// inFus (the loft's own containment test) is the skin oracle: on the skin = inside when grown, outside when shrunk.
const onSkin = (geo: Awaited<ReturnType<typeof load>>, p: Vector3) =>
  geo.inFus(p, -SKIN_TOL) && !geo.inFus(p, SKIN_TOL);
// The inlet planform: 15 lip stations from x 3.44 aft to 3.30, each with an inboard and outboard lip about z = ±0.36.
const lipStations = (side: number) =>
  Array.from({ length: 15 }, (_, i) => {
    const t = i / 14,
      width = 0.004 + 0.021 * t * t * (3 - 2 * t);
    return [-1, 1].map((edge) => ({ i, edge, x: 3.44 - 0.14 * t, z: side * (0.36 + edge * width) }));
  }).flat();

afterEach(() => {
  vi.doUnmock("@/lib/geometry");
  vi.resetModules();
});

describe("NACA inlet lips follow the loft's lower-skin exponent", () => {
  it("with nBot = 4 every lip station on both edges and both sides moves onto the new skin", async () => {
    const base = await load();
    const geo = await load(4);
    for (const side of [-1, 1]) {
      const before = base.inductionAnchor(side),
        anchor = geo.inductionAnchor(side);
      expect(onSkin(geo, anchor)).toBe(true);
      expect(Math.abs(anchor.y - before.y)).toBeGreaterThan(0.001);

      const g = geo.inductionGeo(side),
        pos = g.getAttribute("position");
      const vertices = Array.from({ length: pos.count }, (_, i) => new Vector3().fromBufferAttribute(pos, i));
      for (const p of vertices) expect(geo.inFus(p, -0.001)).toBe(true);
      for (const { i, edge, x, z } of lipStations(side)) {
        const at = vertices.filter((p) => Math.abs(p.x - x) < 1e-5 && Math.abs(p.z - z) < 1e-5);
        expect(at.length, `side ${side} station ${i} edge ${edge} has no vertex`).toBeGreaterThan(0);
        // The lip is the outermost (lowest) vertex at the station; the recessed floor sits above it.
        const lip = at.reduce((a, b) => (b.y < a.y ? b : a));
        expect(onSkin(geo, lip), `side ${side} station ${i} edge ${edge} lip y ${lip.y} is off the skin`).toBe(true);
      }
      g.dispose();
    }
  }, 60000);
});
