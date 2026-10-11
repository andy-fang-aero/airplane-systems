/**
 * Duct 7 and the "Y" junction: the solid charge-air ducts from each intercooler's forward neck to the
 * throttle body's "Y". AMM 13773-002 Rev 7 Fig 71-60-2 sheet 2 (PDF p. 2558) items 4, 7, 10, 17; 71-60 (PDF p. 2542:
 * the overboost valve on the LH intercooler's outlet tube); Continental M-18 Fig 12-16 p. 12-27 (PDF p. 324) items 38–40.
 */
import { describe, expect, it } from "vitest";
import {
  DoubleSide,
  Euler,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  TubeGeometry,
  Vector3,
} from "three";
import { curveOf } from "@/lib/geometry";
import type { PartSpec } from "@/lib/catalogue";
import { toV } from "@/lib/math";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { inFus } from "@/aircraft/sr22t/geometry";
import { CAT, CYLS, INDUCTION_Y, THROTTLE } from "@/aircraft/sr22t/parts";
import { cylOrigin, OVERBOOST } from "@/aircraft/sr22t/parts/engine";
import { DUCT7_CLAMP_W, DUCT7_JOINTS, duct7Joint, duct7Span } from "@/aircraft/sr22t/parts/engine-air";
import {
  DUCT7,
  DUCT7_R,
  DUCT7_TENSION,
  INDUCTION_Y_INLET,
  INTERCOOLER_NECK_R,
  INTERCOOLER_OUT,
  OVERBOOST_SEAT,
} from "@/aircraft/sr22t/intercooler-layout";

const material = new MeshBasicMaterial({ side: DoubleSide });
const solid = (p: PartSpec) => {
  const g = p.geo();
  g.applyMatrix4(
    new Matrix4().compose(
      new Vector3(...(p.pos ?? [0, 0, 0])),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      new Vector3(...(p.scale ?? [1, 1, 1])),
    ),
  );
  const c = CYLS.find((c) => p.parent === `cyl:${c.n}`);
  if (c) g.translate(...cylOrigin(c));
  g.computeBoundingBox();
  return { p, g, box: g.boundingBox!.clone(), mesh: new Mesh(g, material) };
};
type Solid = ReturnType<typeof solid>;
// Triangle edges against the other mesh in both directions, plus containment, as in the intercooler audit.
const edgeCrosses = (a: Solid, b: Solid) => {
  const position = a.g.getAttribute("position"),
    index = a.g.index;
  const count = index?.count ?? position.count;
  const ray = new Raycaster(),
    start = new Vector3(),
    end = new Vector3();
  for (let i = 0; i < count; i += 3)
    for (let j = 0; j < 3; j++) {
      start.fromBufferAttribute(position, index ? index.getX(i + j) : i + j);
      end.fromBufferAttribute(position, index ? index.getX(i + ((j + 1) % 3)) : i + ((j + 1) % 3));
      const direction = end.clone().sub(start),
        length = direction.length();
      if (length < 0.00001) continue;
      ray.set(start, direction.normalize());
      ray.near = 0.00001;
      ray.far = length - 0.00001;
      if (ray.intersectObject(b.mesh).length) return true;
    }
  return false;
};
const inside = (point: Vector3, s: Solid) => {
  if (!s.box.containsPoint(point)) return false;
  const hits = new Raycaster(point, new Vector3(0.137, 0.419, 1).normalize(), 0).intersectObject(s.mesh);
  if (hits.some((h) => h.distance < 0.00001)) return false;
  const exits = hits.filter((h, i) => i === 0 || Math.abs(h.distance - hits[i - 1].distance) > 0.00001);
  return exits.length % 2 === 1;
};
const intersects = (a: Solid, b: Solid) => {
  if (!a.box.clone().expandByScalar(-0.00001).intersectsBox(b.box.clone().expandByScalar(-0.00001))) return false;
  return (
    edgeCrosses(a, b) ||
    edgeCrosses(b, a) ||
    inside(new Vector3().fromBufferAttribute(a.g.getAttribute("position"), 0), b) ||
    inside(new Vector3().fromBufferAttribute(b.g.getAttribute("position"), 0), a)
  );
};
const ducts = () => CAT.parts.filter((p) => p.name === "Intercooler outlet duct");
/** The drawn duct 7 of one side: its pieces' centrelines, neck end first (registration order). */
const drawn = (s: number) =>
  ducts()
    .map((p) => {
      const g = p.geo() as TubeGeometry,
        r = { path: g.parameters.path, radius: g.parameters.radius };
      g.dispose();
      return r;
    })
    .filter((d) => Math.sign(d.path.getPoint(0.5).z) === s);

describe("SR22T duct 7 and the Y junction (AMM Fig 71-60-2 sheet 2 PDF p. 2558; M-18 Fig 12-16 PDF p. 324)", () => {
  it("each duct 7 starts at its intercooler's forward neck and ends on the Y's inlet spigot", () => {
    expect(ducts()).toHaveLength(4);
    for (const s of [-1, 1]) {
      const path = DUCT7(s);
      expect(path[0]).toEqual(INTERCOOLER_OUT(s));
      expect(path.at(-1)).toEqual(INDUCTION_Y_INLET(s));
      // same bore as the neck spigot it clamps onto through hose connector 10
      expect(DUCT7_R).toBe(INTERCOOLER_NECK_R);
      // forward and inboard across the front of the cylinders, rising to the Y
      expect(path.at(-1)![0]).toBeGreaterThan(path[0][0]);
      expect(Math.abs(path.at(-1)![2])).toBeLessThan(Math.abs(path[0][2]));
      expect(path.at(-1)![1]).toBeGreaterThan(path[0][1]);
      const pieces = drawn(s);
      expect(pieces).toHaveLength(2);
      expect(pieces[0].path.getPoint(0).distanceTo(toV(INTERCOOLER_OUT(s)))).toBeLessThan(1e-9);
      expect(pieces[0].path.getPoint(1).distanceTo(pieces[1].path.getPoint(0))).toBeLessThan(1e-9);
      expect(pieces[0].path.getTangent(1).angleTo(pieces[1].path.getTangent(0))).toBeLessThan(0.05);
      expect(pieces[1].path.getPoint(1).distanceTo(toV(INDUCTION_Y_INLET(s)))).toBeLessThan(1e-9);
      for (const d of pieces) expect(d.radius).toBe(DUCT7_R);
      // the duct leaves the neck along its axis (forward), as the hose connector does
      expect(pieces[0].path.getTangent(0).x).toBeGreaterThan(0.95);
    }
  });

  it("the Y has two inlets, one per duct, and one outlet into the throttle body", () => {
    const y = CAT.parts.filter((p) => p.name === "Induction Y junction");
    expect(y).toHaveLength(1);
    const arm = y[0].geo() as TubeGeometry,
      ends = [arm.parameters.path.getPoint(0), arm.parameters.path.getPoint(1)];
    expect(ends[0].distanceTo(toV(INDUCTION_Y_INLET(-1)))).toBeLessThan(1e-9);
    // the outlet ends at the throttle body's centre, inside its Ø0.1-m bore
    expect(ends[1].distanceTo(toV(THROTTLE))).toBeLessThan(1e-9);
    arm.dispose();
    // the RH inlet arm (registered unnamed after the Y) runs from its spigot to the Y
    const rh = CAT.parts.find((p) => {
      if (p.name || p.color !== y[0].color) return false;
      const g = p.geo();
      const ok =
        g instanceof TubeGeometry &&
        g.parameters.path.getPoint(0).distanceTo(toV(INDUCTION_Y_INLET(1))) < 1e-9 &&
        g.parameters.path.getPoint(1).distanceTo(toV(INDUCTION_Y)) < 1e-9;
      g.dispose();
      return ok;
    });
    expect(rh).toBeDefined();
    const throttle = solid(CAT.parts.find((p) => p.name === "Throttle body / fuel-metering valve")!);
    expect(throttle.box.containsPoint(toV(THROTTLE))).toBe(true);
    throttle.g.dispose();
  });

  it("the charge-air flow runs inside the drawn ducts: every particle-path sample along duct 7 lies within the tube radius", () => {
    for (const s of [-1, 1]) {
      const f = FLOWS.find((f) => f.key === (s < 0 ? "compressorL" : "compressorR"))!;
      expect(f.tension ?? 0.3).toBe(DUCT7_TENSION);
      const path = DUCT7(s);
      const i0 = f.pts.findIndex((p) => p === path[0] || toV(p).distanceTo(toV(path[0])) < 1e-12);
      expect(i0).toBeGreaterThan(0);
      expect(f.pts.slice(i0, i0 + path.length)).toEqual(path);
      expect(f.pts.slice(i0 + path.length)).toEqual([INDUCTION_Y, THROTTLE]);
      const flow = curveOf(f.pts, f.tension ?? 0.3);
      // catmull-rom passes through every point: the duct span is the flow's segments i0 … i0 + n − 1
      const n = f.pts.length - 1,
        ductSamples = drawn(s).flatMap((d) => d.path.getSpacedPoints(300));
      for (let k = 0; k <= 200; k++) {
        const u = (i0 + ((path.length - 1) * k) / 200) / n;
        const p = flow.getPoint(u);
        const gap = Math.min(...ductSamples.map((q) => q.distanceTo(p)));
        expect(gap, `${f.key} at ${p.toArray()}`).toBeLessThan(DUCT7_R * 0.5);
      }
    }
  });

  it("the overboost valve sits on the LH duct's forward face (AMM 71-60 PDF p. 2542; Fig 71-60-2 sheet 2 items 17/20)", () => {
    expect(DUCT7(-1)).toContainEqual(OVERBOOST_SEAT);
    expect(DUCT7(1)).not.toContainEqual(OVERBOOST_SEAT);
    const valve = solid(CAT.parts.find((p) => p.name === "Overboost valve")!);
    // seated into the duct wall: its aft face lies inside the tube, its centre outside it, ahead of the seat
    expect(valve.box.min.x).toBeLessThan(OVERBOOST_SEAT[0] + DUCT7_R);
    expect(valve.box.min.x).toBeGreaterThan(OVERBOOST_SEAT[0] + DUCT7_R - 0.01);
    expect(toV(OVERBOOST).distanceTo(toV(OVERBOOST_SEAT))).toBeGreaterThan(DUCT7_R);
    expect(OVERBOOST[2]).toBe(OVERBOOST_SEAT[2]);
    for (const v of [valve.box.min, valve.box.max]) expect(inFus(v, 0.01)).toBe(true);
    valve.g.dispose();
  });

  it("both ducts stay at least 5 mm inside the cowl outside their hose connectors (those are checked below)", () => {
    const joints = [-1, 1].flatMap((s) => [duct7Joint(s, 0), duct7Joint(s, 1)]);
    const sleeved = (v: Vector3) =>
      joints.some((j) => {
        const d = v.clone().sub(j.at),
          along = d.dot(j.axis);
        return along >= -j.back && along <= j.fwd && d.addScaledVector(j.axis, -along).length() < j.r;
      });
    for (const p of ducts()) {
      const g = p.geo(),
        pos = g.getAttribute("position"),
        v = new Vector3();
      const out: string[] = [];
      for (let i = 0; i < pos.count; i++)
        if (!inFus(v.fromBufferAttribute(pos, i), 0.005) && !sleeved(v)) out.push(v.toArray().join());
      expect(out).toEqual([]);
      g.dispose();
    }
  });

  it("each duct end has a hose connector 10 and two clamps 4, coaxial with the duct (AMM Fig 71-60-2 sheet 2 Detail B)", () => {
    const hardware = (name: string) =>
      CAT.parts
        .filter((p) => p.name === name)
        .map((p) => {
          const g = p.geo(),
            pos = g.getAttribute("position");
          const pts = Array.from({ length: pos.count }, (_, i) => new Vector3().fromBufferAttribute(pos, i));
          g.dispose();
          return pts;
        });
    const connectors = hardware("Hose connector"),
      clamps = hardware("Hose clamp");
    expect(connectors).toHaveLength(4);
    expect(clamps).toHaveLength(8);
    // radial distance from the joint axis, and the signed station along it
    const onAxis = (pts: Vector3[], j: ReturnType<typeof duct7Joint>, r: number) =>
      pts.every((v) => {
        const d = v.clone().sub(j.at),
          along = d.dot(j.axis);
        return Math.abs(d.addScaledVector(j.axis, -along).length() - r) < 1e-5;
      });
    const span = (pts: Vector3[], j: ReturnType<typeof duct7Joint>) => {
      const t = pts.map((v) => v.clone().sub(j.at).dot(j.axis));
      return [Math.min(...t), Math.max(...t)];
    };
    for (const s of [-1, 1])
      for (const e of [0, 1] as const) {
        const j = duct7Joint(s, e);
        // the joint sits on the duct end, its axis the drawn duct's end tangent
        const piece = duct7Span(s, e);
        expect(j.at.distanceTo(toV(e ? INDUCTION_Y_INLET(s) : INTERCOOLER_OUT(s)))).toBeLessThan(1e-9);
        expect(j.axis.angleTo(piece.getTangent(e).multiplyScalar(e ? -1 : 1))).toBeLessThan(1e-3); // finite-difference tangent
        // one connector: bigger than the duct, straddling the joint (over the spigot and over the duct)
        const mine = connectors.filter((c) => onAxis(c, j, j.r));
        expect(mine, `side ${s} end ${e} connector`).toHaveLength(1);
        expect(j.r).toBeGreaterThan(DUCT7_R);
        const [a, b] = span(mine[0], j);
        expect(a).toBeCloseTo(-DUCT7_JOINTS[e].back, 6);
        expect(b).toBeCloseTo(DUCT7_JOINTS[e].fwd, 6);
        expect(a).toBeLessThan(0);
        expect(b).toBeGreaterThan(0);
        // two clamps on it, proud of the sleeve, one near each end: one over the spigot, one over the duct
        const bands = clamps.filter((c) => onAxis(c, j, j.clampR));
        expect(bands, `side ${s} end ${e} clamps`).toHaveLength(2);
        expect(j.clampR).toBeGreaterThan(j.r);
        const stations = bands.map((c) => span(c, j)).sort((x, y) => x[0] - y[0]);
        for (const [lo, hi] of stations) {
          expect(hi - lo).toBeCloseTo(DUCT7_CLAMP_W, 6);
          expect(lo).toBeGreaterThanOrEqual(a - 1e-9);
          expect(hi).toBeLessThanOrEqual(b + 1e-9);
        }
        expect(stations[0][1]).toBeLessThan(0);
        expect(stations[1][0]).toBeGreaterThan(0);
      }
  });

  it("the hose connectors and clamps stay inside the cowl (at least 1 mm; the neck joint has ≈2 mm around it)", () => {
    const hardware = CAT.parts.filter((p) => p.name === "Hose connector" || p.name === "Hose clamp");
    expect(hardware).toHaveLength(4 + 8);
    for (const p of hardware) {
      const g = p.geo(),
        pos = g.getAttribute("position"),
        v = new Vector3();
      const out: string[] = [];
      for (let i = 0; i < pos.count; i++)
        if (!inFus(v.fromBufferAttribute(pos, i), 0.001)) out.push(`${p.name} ${v.toArray().join()}`);
      expect(out).toEqual([]);
      g.dispose();
    }
  });

  it("the ducts cross no catalogue solid or rendered flow, except their own neck, Y spigot and the LH overboost valve; nor do their hose connectors and clamps", () => {
    const all = CAT.parts.map(solid);
    const flows = FLOWS.filter((f) => f.tube !== false).map((f) => {
      const curve = curveOf(f.pts, f.tension ?? 0.3);
      return solid({
        id: f.key,
        sys: f.sys,
        name: `flow ${f.key}`,
        geo: () => new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
      });
    });
    try {
      const owned = all.filter((s) =>
        ["Intercooler outlet duct", "Hose connector", "Hose clamp"].includes(s.p.name ?? ""),
      );
      expect(owned).toHaveLength(4 + 4 + 8);
      const others = [...all.filter((s) => !owned.includes(s)), ...flows];
      // the neighbouring parts stay in the audit
      for (const name of [
        "LH intercooler",
        "RH intercooler",
        "Induction Y junction",
        "Throttle body / fuel-metering valve",
        "Fuel manifold valve (“spider”)",
        "A/C compressor",
        "ALT 1 — 100 A",
        "flow acDischarge",
        "flow acSuction",
      ])
        expect(
          others.some((s) => s.p.name === name),
          name,
        ).toBe(true);
      expect(others.filter((s) => /^Ignition lead/.test(s.p.name ?? "")).length).toBeGreaterThan(0);
      expect(others.filter((s) => /^Engine mount/.test(s.p.name ?? "")).length).toBeGreaterThan(0);
      expect(others.filter((s) => /^Cylinder head /.test(s.p.name ?? "")).length).toBe(6);
      const hits: string[] = [];
      const valve = others.find((s) => s.p.name === "Overboost valve")!;
      for (const b of [...others, ...owned.filter((o) => o.p.name !== "Intercooler outlet duct")])
        if (b !== valve && b.p.name !== "Induction Y junction" && intersects(valve, b))
          hits.push(`overboost valve vs ${b.p.name ?? b.p.id}`);
      for (const a of owned) {
        const s = Math.sign(a.box.min.z + a.box.max.z);
        // hosts: its own neck spigot; on the LH side the Y (its inlet spigot) and the overboost valve bolted on; on the RH
        // side the Y's unnamed RH inlet arm
        const host = (b: Solid) =>
          b.p.name === (s < 0 ? "LH intercooler" : "RH intercooler") ||
          (s < 0 && ["Induction Y junction", "Overboost valve"].includes(b.p.name ?? "")) ||
          (s > 0 && !b.p.name && b.p.color === "#8A969E" && b.box.min.z >= -0.03 && b.box.max.z <= 0.081 + 0.03);
        for (const b of others)
          if (!host(b) && intersects(a, b)) hits.push(`${s} ${a.p.name} vs ${b.p.name ?? b.p.id}`);
      }
      expect(hits).toEqual([]);
    } finally {
      for (const s of [...all, ...flows]) s.g.dispose();
    }
  }, 120000);
});
