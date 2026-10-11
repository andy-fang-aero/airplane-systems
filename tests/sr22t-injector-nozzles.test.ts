/** SR22T POH 7-38; AMM 13773-002 Rev 7 73-00 PDF 2582, Fig 71-00-2 sheet 1 PDF 2487. Geometry approximate. */
import { describe, expect, it } from "vitest";
import { Box3, Vector3 } from "three";
import { CAT, CYLS } from "@/aircraft/sr22t/parts";
import { CRANKCASE, CRANKCASE_SIZE, CYL_ENVELOPE, cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { SPIDER, SPIDER_H, SPIDER_R } from "@/aircraft/sr22t/parts/fuel";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
import { allSolids, allTubes, gap, outside, type Shape } from "./sr22t-engine-gap";

const nozzles = CAT.parts.filter((p) => p.name?.startsWith("Fuel injector nozzle, cyl "));

describe("SR22T cylinder-head fuel injector nozzles", () => {
  it("has six nozzles, one mounted on each cylinder head (POH 7-38; AMM 73-00 PDF 2582)", () => {
    expect(nozzles).toHaveLength(6);
    for (const c of CYLS) {
      const matching = nozzles.filter((p) => p.name === `Fuel injector nozzle, cyl ${c.n}`);
      expect(matching).toHaveLength(1);
      const nozzle = matching[0];
      expect(nozzle.parent).toBe(`cyl:${c.n}`);
      expect(nozzle.sys).toContain("engine");
      expect(nozzle.sys).toContain("fuel");
      const head = CAT.parts.find((p) => p.name === `Cylinder head ${c.n}`)!;
      expect(head.parent).toBe(nozzle.parent);
      const bounds = (p: typeof head) => {
        const geo = p.geo();
        geo.computeBoundingBox();
        const box = new Box3().copy(geo.boundingBox!).translate(new Vector3(...p.pos!));
        geo.dispose();
        return box;
      };
      const h = bounds(head),
        n = bounds(nozzle);
      // Upper-head attachment: the base touches the head and stays within its x/z footprint.
      expect(n.intersectsBox(h)).toBe(true);
      expect(n.min.y).toBeLessThanOrEqual(h.max.y);
      expect(n.max.y).toBeGreaterThan(h.max.y);
      for (const axis of ["x", "z"] as const) {
        expect(n.min[axis]).toBeGreaterThanOrEqual(h.min[axis]);
        expect(n.max[axis]).toBeLessThanOrEqual(h.max[axis]);
      }
    }
  });

  it("each injector line ends within 0.01 m of its own nozzle (AMM Fig 71-00-2 sheet 1 PDF 2487)", () => {
    expect(FLOWS.filter((f) => /^inj[1-6]$/.test(f.key))).toHaveLength(6);
    for (const c of CYLS) {
      const nozzle = nozzles.find((p) => p.name === `Fuel injector nozzle, cyl ${c.n}`)!;
      const world = new Vector3(...cylOrigin(c)).add(new Vector3(...nozzle.pos!));
      const line = FLOWS.find((f) => f.key === `inj${c.n}`)!;
      expect(toV(line.pts.at(-1)!).distanceTo(world)).toBeLessThanOrEqual(0.01);
    }
  });

  it("each nozzle stands upright and its line drops onto it from above (Continental M-18 p. 2-1; Fig 17-39, p. 17-71)", () => {
    for (const c of CYLS) {
      const nozzle = nozzles.find((p) => p.name === `Fuel injector nozzle, cyl ${c.n}`)!;
      const geo = nozzle.geo();
      geo.computeBoundingBox();
      const size = geo.boundingBox!.getSize(new Vector3());
      geo.dispose();
      expect(nozzle.rot ?? [0, 0, 0]).toEqual([0, 0, 0]);
      expect(size.y).toBeGreaterThan(size.x);
      expect(size.y).toBeGreaterThan(size.z);
      const pts = FLOWS.find((f) => f.key === `inj${c.n}`)!.pts.map(toV);
      const [above, end] = pts.slice(-2);
      expect(above.x).toBeCloseTo(end.x, 9);
      expect(above.z).toBeCloseTo(end.z, 9);
      expect(above.y).toBeGreaterThan(end.y + geo.boundingBox!.max.y);
    }
  });

  it("each injector line runs above the crankcase and keeps 5 mm off its cylinder's fins", () => {
    const crankTop = CRANKCASE[1] + CRANKCASE_SIZE[1] / 2;
    for (const c of CYLS) {
      const f = FLOWS.find((f) => f.key === `inj${c.n}`)!;
      const curve = curveOf(f.pts, f.tension ?? 0.3),
        r = f.r ?? 0.012,
        o = toV(cylOrigin(c));
      for (let i = 0; i <= 400; i++) {
        const q = curve.getPointAt(i / 400);
        // Over the crankcase footprint the tube stays above its top face.
        if (Math.abs(q.z - CRANKCASE[2]) <= CRANKCASE_SIZE[2] / 2)
          expect(q.y - r).toBeGreaterThanOrEqual(crankTop + 0.005);
        // Fin discs: radius CYL_ENVELOPE / 2 about the cylinder axis, 0.07 m either side of the origin plus 5 mm thickness.
        const along = (q.z - o.z) * c.s;
        if (Math.abs(along) <= 0.075 && Math.abs(q.x - o.x) <= CYL_ENVELOPE / 2 + r + 0.005)
          expect(Math.hypot(q.x - o.x, q.y - o.y) - r).toBeGreaterThanOrEqual(CYL_ENVELOPE / 2 + 0.005);
      }
    }
  });

  it("nozzles and injector lines clear every catalogue solid and every rendered flow tube by 5 mm (POH 7-38; M-18 Fig 17-39)", () => {
    const margin = 0.005;
    const solids = allSolids();
    const flows = allTubes();
    const isInj = (s: Shape) => /^inj[1-6]$/.test(s.key ?? "");
    const owned = [...solids.filter((s) => s.name.startsWith("Fuel injector nozzle, cyl ")), ...flows.filter(isInj)];
    expect(owned).toHaveLength(12);
    // Coverage the brief names: spark plugs, plug lead terminals, ignition leads and CHT sensors are all audited.
    for (const name of [
      "Spark plug — cyl 1 upper",
      "Plug lead terminal",
      "Ignition lead — right magneto",
      "CHT sensor — cyl 1",
    ])
      expect(solids.some((s) => s.name === name)).toBe(true);
    const spider = new Box3().setFromCenterAndSize(toV(SPIDER), new Vector3(2 * SPIDER_R, SPIDER_H, 2 * SPIDER_R));
    const cylOf = (s: Shape) => s.parent ?? (s.key ? `cyl:${s.key.slice(3)}` : s.name.replace(/^.* cyl /, "cyl:"));
    const hits: string[] = [];
    for (const a of owned) {
      const own = cylOf(a);
      for (const b of [...solids, ...flows]) {
        if (b === a) continue;
        // Physical joints: nozzle in its own head; line into its own nozzle; every line out of the manifold valve.
        if (b.name.startsWith("Cylinder head ") && b.parent === own && !isInj(a)) continue;
        if (
          isInj(a) !== isInj(b) &&
          cylOf(a) === cylOf(b) &&
          (isInj(a) || isInj(b)) &&
          (a.name.startsWith("Fuel injector") || b.name.startsWith("Fuel injector"))
        )
          continue;
        if (isInj(a) && b.name === "Fuel manifold valve (“spider”)") continue;
        let d = gap(a, b, margin);
        // Lines and the supply/drain tubes meet only at the valve body; measure them clear of it.
        if (d < margin && (isInj(a) || isInj(b)) && (isInj(b) || /^flow /.test(b.name))) {
          const near = spider.clone().expandByScalar(0.03);
          const [x, y] = [outside(a, near), outside(b, near)];
          d = x && y ? gap(x, y, margin, false) : Infinity;
        }
        if (d < margin - 1e-7) hits.push(`${a.name}${a.key ? "" : " " + own} / ${b.name}: ${(d * 1000).toFixed(1)} mm`);
      }
    }
    expect(hits).toEqual([]);
  }, 60000);
});
