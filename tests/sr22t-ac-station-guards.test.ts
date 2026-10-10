// Regression guards for the A/C compressor station move: the orientation, belt, filter and cowl outcomes the station move must keep
/**
 * SR22T A/C compressor station guards, The unit hangs aft of the crankcase pads and magnetos, orientation unchanged.
 * Sources: AMM 13773-002 Rev 7 Fig 21-50-2 (PDF p. 523), Fig 21-50-1 sheet 2 (PDF p. 520), Fig 71-00-2 sheet 1 (PDF
 * p. 2487), Fig 71-00-1 sheet 2 (PDF p. 2484); the belt straight edge, 21-50 Adjustment/Test (PDF p. 503).
 */
import { describe, expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { inFus } from "@/aircraft/sr22t/geometry";
import { AC, CAT } from "@/aircraft/sr22t/parts";
import {
  AC_CLUTCH_PULLEY,
  AC_COMPRESSOR_LEN,
  AC_COMPRESSOR_R,
  AC_DRIVE_PULLEY,
  AC_FITTING,
  acBeltLoop,
} from "@/aircraft/sr22t/parts/aircon";
import { toV } from "@/lib/math";
import { solid, type Shape } from "./sr22t-engine-gap";

const MARGIN = 0.005;

const part = (name: string) => {
  const found = CAT.parts.filter((p) => p.name === name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
const placed = (name: string) => {
  const p = part(name),
    g = p.geo();
  g.applyMatrix4(
    new Matrix4().compose(
      toV(p.pos ?? [0, 0, 0]),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      new Vector3(1, 1, 1),
    ),
  );
  g.computeBoundingBox();
  return { g, box: g.boundingBox!.clone(), bvh: new MeshBVH(g) };
};
const verts = (s: Shape) => s.faces.flatMap(({ triangle: t }) => [t.a, t.b, t.c]);

describe("A/C compressor station guards", () => {
  it("orientation unchanged: clutch aft, head and fittings forward, axis fore-and-aft (Fig 21-50-2 PDF p. 523; Fig 21-50-1 sheet 2 PDF p. 520)", () => {
    const comp = placed("A/C compressor");
    expect(part("A/C compressor").rot ?? [0, 0, 0]).toEqual([0, 0, 0]);
    expect(AC_CLUTCH_PULLEY[0]).toBeLessThan(AC.compressor[0]);
    // the hose fittings stand on the head's forward face, inside its circle, and are drawn there
    const head = AC.compressor[0] + AC_COMPRESSOR_LEN / 2;
    for (const k of ["discharge", "suction"] as const) {
      const f = toV(AC_FITTING[k]);
      expect(f.x, k).toBeGreaterThan(head);
      expect(f.x - head, k).toBeLessThan(0.01);
      expect(Math.hypot(f.y - AC.compressor[1], f.z - AC.compressor[2]), k).toBeLessThan(AC_COMPRESSOR_R);
      expect(comp.box.containsPoint(f), k).toBe(true);
    }
    comp.g.dispose();
  });

  it("the pulleys stay coplanar and the belt a continuous closed loop on both (AMM 21-50 PDF p. 503)", () => {
    expect(AC_CLUTCH_PULLEY[0]).toBe(AC_DRIVE_PULLEY[0]);
    const loop = acBeltLoop().map(toV);
    for (const p of loop) expect(p.x).toBe(AC_DRIVE_PULLEY[0]);
    // the rendered belt runs unbroken round the loop: every 2 mm along each arc step and tangent span, the closing span
    // included, lies inside its 5-mm section
    const { bvh, g } = placed("A/C compressor");
    loop.forEach((p, i) => {
      const q = loop[(i + 1) % loop.length],
        n = Math.ceil(p.distanceTo(q) / 0.002);
      for (let k = 0; k <= n; k++)
        expect(bvh.closestPointToPoint(p.clone().lerp(q, k / n))!.distance, `${i}:${k}`).toBeLessThan(0.0055);
    });
    g.dispose();
  });

  it("the oil filter stays vertical, directly below the drive pulley and the compressor", () => {
    const filter = placed("Oil filter (full-flow)"),
      comp = placed("A/C compressor");
    const size = filter.box.getSize(new Vector3());
    expect(size.y).toBeGreaterThan(size.x);
    // the drive pulley's centre is over the canister in plan, and the whole unit above its top
    const d = toV(AC_DRIVE_PULLEY);
    expect(d.x).toBeGreaterThan(filter.box.min.x);
    expect(d.x).toBeLessThan(filter.box.max.x);
    expect(d.z).toBeGreaterThan(filter.box.min.z);
    expect(d.z).toBeLessThan(filter.box.max.z);
    expect(comp.box.min.y).toBeGreaterThan(filter.box.max.y);
    for (const m of [filter, comp]) m.g.dispose();
  });

  it("the assembly stays inside the cowl, the belt top included", () => {
    const comp = solid(part("A/C compressor"));
    expect(
      verts(comp)
        .filter((v) => !inFus(v))
        .map((v) => v.toArray()),
    ).toEqual([]);
    // the belt's top point, 5 mm above it, is still inside: the belt is the unit's highest part
    const top = verts(comp).reduce((a, b) => (b.y > a.y ? b : a));
    expect(inFus(top.clone().add(new Vector3(0, MARGIN, 0)))).toBe(true);
  });
});
