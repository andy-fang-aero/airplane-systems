/**
 * SR22T accessory case: A/C compressor, drive unit, belt, and the vertical oil filter below it.
 * Sources: AMM 13773-002 Rev 7 21-50 (PDF pp. 499–503), Fig 21-50-1 sheet 2 (PDF p. 520), Fig 21-50-2 (PDF p. 523),
 * Fig 71-00-1 sheet 2 (PDF p. 2484); Continental M-18 Fig 5-33 (p. 5-53, PDF p. 148) and Fig 13-10 (p. 13-13, PDF p. 374).
 */
import { describe, expect, it } from "vitest";
import { Box3, Euler, Line3, Matrix4, Quaternion, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { ACCESSORY_FACE_X, CRANK_Y, IN } from "@/aircraft/sr22t/engine-datum";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { FW, inFus } from "@/aircraft/sr22t/geometry";
import { AC, CAT } from "@/aircraft/sr22t/parts";
import {
  AC_CLUTCH_PULLEY,
  AC_CLUTCH_PULLEY_R,
  AC_DRIVE_PULLEY,
  AC_DRIVE_PULLEY_R,
  AC_FITTING,
  AC_PAD,
  acBeltLoop,
} from "@/aircraft/sr22t/parts/aircon";
import { OIL_FILTER } from "@/aircraft/sr22t/parts/engine";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
import { gap, outside, solid, tube, type Shape } from "./sr22t-engine-gap";

const MARGIN = 0.005;
const part = (name: string) => {
  const found = CAT.parts.filter((p) => p.name === name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
/** World-space mesh of a part, with a BVH for closest-point queries. */
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
const surfaceGap = (bvh: MeshBVH, p: Vector3) => bvh.closestPointToPoint(p)!.distance;
/** Points round a pulley rim in the plane x = c[0]. */
const rim = (c: number[], r: number, n = 24) =>
  Array.from(
    { length: n },
    (_, i) => new Vector3(c[0], c[1] + r * Math.cos((2 * Math.PI * i) / n), c[2] + r * Math.sin((2 * Math.PI * i) / n)),
  );

describe("A/C compressor drive", () => {
  it("the drive unit pulley is coaxial with the LH upper-rear AND20000 pad, aft of the accessory face (M-18 Fig 5-33 PDF p. 148; AMM 21-50 PDF p. 501; Fig 71-00-1 sheet 2 PDF p. 2484)", () => {
    // the pad: 5.8 in. above and 2.5 in. left of the crankshaft CL on the accessory mounting face (scaled)
    expect(AC_PAD[0]).toBe(ACCESSORY_FACE_X);
    expect(AC_PAD[1]).toBeCloseTo(CRANK_Y + 5.8 * IN, 6);
    expect(AC_PAD[2]).toBeCloseTo(-2.5 * IN, 6);
    expect([AC_DRIVE_PULLEY[1], AC_DRIVE_PULLEY[2]]).toEqual([AC_PAD[1], AC_PAD[2]]);
    expect(AC_DRIVE_PULLEY[0]).toBeLessThan(ACCESSORY_FACE_X);
    // drawn: the compressor assembly carries both pulley rims
    const { bvh, g } = placed("A/C compressor");
    for (const p of rim(AC_DRIVE_PULLEY, AC_DRIVE_PULLEY_R)) expect(surfaceGap(bvh, p)).toBeLessThan(0.001);
    for (const p of rim(AC_CLUTCH_PULLEY, AC_CLUTCH_PULLEY_R)) expect(surfaceGap(bvh, p)).toBeLessThan(0.001);
    g.dispose();
  });

  it("the two pulleys are coplanar and one continuous belt wraps both, drawn on the assembly (AMM 21-50 PDF p. 503 straight edge; Fig 21-50-2 item 10)", () => {
    expect(AC_CLUTCH_PULLEY[0]).toBe(AC_DRIVE_PULLEY[0]);
    const loop = acBeltLoop().map(toV);
    expect(loop.length).toBeGreaterThan(20);
    for (const p of loop) expect(p.x).toBe(AC_DRIVE_PULLEY[0]);
    const d = toV(AC_DRIVE_PULLEY),
      c = toV(AC_CLUTCH_PULLEY);
    // continuous and closed (last point back to the first): short steps round each rim, and exactly two straight spans,
    // each joining the two pulleys and passing outside both
    const spans = loop
      .map((p, i) => new Line3(p, loop[(i + 1) % loop.length]))
      .filter((s) => s.distance() >= AC_DRIVE_PULLEY_R / 2);
    expect(spans).toHaveLength(2);
    for (const s of spans) {
      const ends = [s.start, s.end].map((p) => p.distanceTo(d) < p.distanceTo(c));
      expect(ends[0]).not.toBe(ends[1]);
      for (const [o, r] of [
        [d, AC_DRIVE_PULLEY_R],
        [c, AC_CLUTCH_PULLEY_R],
      ] as const)
        expect(s.closestPointToPoint(o, true, new Vector3()).distanceTo(o)).toBeGreaterThanOrEqual(r);
    }
    // it rides on each rim and never cuts through either pulley
    for (const p of loop) {
      expect(p.distanceTo(d)).toBeGreaterThanOrEqual(AC_DRIVE_PULLEY_R);
      expect(p.distanceTo(c)).toBeGreaterThanOrEqual(AC_CLUTCH_PULLEY_R);
    }
    expect(loop.some((p) => p.distanceTo(d) < AC_DRIVE_PULLEY_R + 0.01)).toBe(true);
    expect(loop.some((p) => p.distanceTo(c) < AC_CLUTCH_PULLEY_R + 0.01)).toBe(true);
    // the closed loop is drawn: every pitch point lies inside the rendered belt section
    const { bvh, g } = placed("A/C compressor");
    for (const p of loop) expect(surfaceGap(bvh, p)).toBeLessThan(0.006);
    g.dispose();
  });

  it("the compressor runs fore-and-aft, clutch aft and head forward, outboard of and above the drive unit, beside the left magneto, not over it (Fig 21-50-1 sheet 2 PDF p. 520; Fig 71-00-2 sheets 1–2 item 2)", () => {
    const body = toV(AC.compressor);
    expect(body.z).toBeLessThan(AC_DRIVE_PULLEY[2]);
    expect(body.y).toBeGreaterThan(AC_DRIVE_PULLEY[1]);
    expect([AC_CLUTCH_PULLEY[1], AC_CLUTCH_PULLEY[2]]).toEqual([body.y, body.z]);
    expect(AC_CLUTCH_PULLEY[0]).toBeLessThan(body.x);
    for (const k of ["discharge", "suction"] as const) expect(AC_FITTING[k][0]).toBeGreaterThan(body.x);
    // the compressor axis lies outboard of the left magneto, and its body is wholly aft of the cylinders
    const mag = placed("Left magneto");
    expect(body.z).toBeLessThan(mag.box.min.z);
    mag.g.dispose();
  });

  it("the compressor hoses leave the head fittings and clear every other part, flow tube and ignition lead by 5 mm, inside the cowl, to the firewall (AMM 21-50 PDF pp. 499, 501)", () => {
    const fittings = (["discharge", "suction"] as const).map((k) =>
      new Box3().setFromCenterAndSize(toV(AC_FITTING[k]), new Vector3(0.05, 0.05, 0.05)),
    );
    const hoses = ["acDischarge", "acSuction"].map((key) => {
      const f = FLOWS.find((f) => f.key === key)!;
      // the run forward of the firewall, outside the fitting bosses it starts in
      const full = tube(f);
      const run = outside({ ...full, faces: full.faces.filter(({ box }) => box.min.x > FW) }, fittings[0]);
      return { f, run: outside(run!, fittings[1])! };
    });
    expect(toV(hoses[0].f.pts[0]).toArray()).toEqual(AC_FITTING.discharge);
    expect(toV(hoses[1].f.pts.at(-1)!).toArray()).toEqual(AC_FITTING.suction);
    const others: Shape[] = [
      ...CAT.parts
        .filter((p) => !p.name?.startsWith("Firewall") && (!p.parent || p.parent.startsWith("cyl:")))
        .map(solid),
      ...FLOWS.filter((f) => f.tube !== false && !["acDischarge", "acSuction"].includes(f.key)).map(tube),
    ];
    expect(others.filter((s) => s.name.startsWith("Ignition lead")).length).toBeGreaterThanOrEqual(12);
    expect(others.some((s) => s.name === "A/C compressor")).toBe(true);
    const hits: string[] = [];
    for (const { f, run } of hoses) {
      for (const s of others) {
        const g = gap(run, s, MARGIN, false);
        if (g < MARGIN - 1e-7) hits.push(`${f.key} / ${s.name}: ${(g * 1000).toFixed(2)} mm`);
      }
      const verts = run.faces.flatMap(({ triangle: t }) => [t.a, t.b, t.c]);
      expect(
        verts.filter((v) => !inFus(v)).map((v) => v.toArray()),
        `${f.key} inside the cowl`,
      ).toEqual([]);
    }
    const g = gap(hoses[0].run, hoses[1].run, MARGIN, false);
    if (g < MARGIN - 1e-7) hits.push(`acDischarge / acSuction: ${(g * 1000).toFixed(2)} mm`);
    expect(hits).toEqual([]);
  }, 120000);
});

describe("oil filter", () => {
  it("the spin-on filter stands vertical on its adapter at the M-18 rear-view position (Fig 5-33 PDF p. 148; Fig 13-10 PDF p. 374)", () => {
    const filter = placed("Oil filter (full-flow)");
    const size = filter.box.getSize(new Vector3());
    // vertical axis: taller than it is wide, round in plan
    expect(size.y).toBeGreaterThan(size.x);
    expect(size.x).toBeCloseTo(size.z, 3);
    expect(size.x).toBeCloseTo(3.65 * IN, 3);
    // top 2.42 in. above the crankshaft CL (dimensioned); centre 4.0 in. left of it (scaled, ±0.3 in.)
    expect(filter.box.max.y).toBeCloseTo(CRANK_Y + 2.42 * IN, 4);
    const centre = filter.box.getCenter(new Vector3());
    expect(Math.abs(centre.z + 4.0 * IN)).toBeLessThanOrEqual(0.3 * IN);
    expect(centre.x).toBeGreaterThan(FW);
    expect(centre.x).toBeLessThan(ACCESSORY_FACE_X);
    // the adapter sits under it and reaches the oil pump housing
    const adapter = placed("Oil filter adapter");
    expect(adapter.box.max.y).toBeCloseTo(filter.box.min.y, 6);
    expect(adapter.box.min.x).toBeLessThan(centre.x + size.x / 2);
    expect(adapter.box.min.z).toBeLessThan(centre.z);
    expect(adapter.box.max.z).toBeGreaterThan(centre.z);
    const pump = placed("Oil pump");
    expect(Math.abs(adapter.box.max.x - pump.box.min.x)).toBeLessThan(0.001);
    for (const m of [filter, adapter, pump]) m.g.dispose();
  });

  it("the oil runs pump → adapter → filter → cooler (AMM 79-00 PDF p. 2764; M-18 Fig 13-10 PDF p. 374)", () => {
    const pts = FLOWS.find((f) => f.key === "oil")!.pts.map(toV);
    const at = (name: string) => pts.findIndex((p) => p.distanceTo(toV(part(name).pos!)) < 1e-9);
    const order = ["Oil pump", "Oil filter adapter", "Oil filter (full-flow)", "Oil cooler"].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("the compressor stands directly above the filter, clear of its 0.56-in. removal space (operator observation of the modelled airplane; M-18 Fig 5-33 PDF p. 148; Fig 71-00-1 sheet 2 items 14–15 PDF p. 2484)", () => {
    const filter = placed("Oil filter (full-flow)"),
      comp = placed("A/C compressor");
    // overlapping footprints in plan: the drive unit and compressor stand over the canister
    const plan = (b: Box3) => new Box3(new Vector3(b.min.x, 0, b.min.z), new Vector3(b.max.x, 0, b.max.z));
    expect(plan(comp.box).intersectsBox(plan(filter.box))).toBe(true);
    // the drive unit pulley's axis passes over the canister
    expect(toV(AC_DRIVE_PULLEY).setY(0).distanceTo(toV(OIL_FILTER).setY(0))).toBeLessThan((3.65 / 2) * IN);
    expect(comp.box.min.y).toBeGreaterThanOrEqual(filter.box.max.y + 0.56 * IN);
    for (const m of [filter, comp]) m.g.dispose();
  });

  it("the filter and adapter clear every other part, flow tube and ignition lead by 5 mm, except the pump housing they bolt to and the oil flow through them", () => {
    const own = ["Oil filter (full-flow)", "Oil filter adapter"];
    const hosts = new Set([...own, "Oil pump", "Continental TSIO-550-K", "flow oil"]);
    const others: Shape[] = [
      ...CAT.parts.filter((p) => !p.parent || p.parent.startsWith("cyl:")).map(solid),
      ...FLOWS.filter((f) => f.tube !== false).map(tube),
    ].filter((s) => !hosts.has(s.name));
    expect(others.filter((s) => s.name.startsWith("Ignition lead")).length).toBeGreaterThanOrEqual(12);
    const hits: string[] = [];
    for (const name of own) {
      const s = solid(part(name));
      for (const o of others) {
        const g = gap(s, o, MARGIN);
        if (g < MARGIN - 1e-7) hits.push(`${name} / ${o.name}: ${(g * 1000).toFixed(2)} mm`);
      }
      for (const { triangle: t } of s.faces) for (const v of [t.a, t.b, t.c]) expect(inFus(v), name).toBe(true);
    }
    expect(hits).toEqual([]);
  }, 120000);
});

describe("cabin-heat duct", () => {
  it("passes under the starter, clear of the vertical filter (POH 7-64; AMM Fig 21-40-2 PDF p. 486)", () => {
    const f = FLOWS.find((f) => f.key === "hotIn")!;
    const curve = curveOf(f.pts, f.tension ?? 0.3);
    const starter = placed("Starter");
    // where the duct crosses the starter's lateral span, aft of its forward face, it is below the starter
    let crossings = 0;
    for (let i = 0; i <= 400; i++) {
      const p = curve.getPointAt(i / 400);
      if (p.x < starter.box.max.x + 0.02 && p.z > starter.box.min.z && p.z < starter.box.max.z && p.y < 0) {
        crossings++;
        expect(p.y, `${p.toArray()}`).toBeLessThan(starter.box.min.y);
      }
    }
    expect(crossings).toBeGreaterThan(0);
    expect(gap(tube(f), solid(part("Oil filter (full-flow)")), MARGIN)).toBeGreaterThanOrEqual(MARGIN);
    starter.g.dispose();
  });
});
