// The cowl-containment case is a deliberate regression guard; the placement, continuity and clearance cases fail on the base.
// The magneto pressurization system, from its own throttle-body fitting through the desiccant filter between
// the magnetos and a tee to both magnetos (AMM 13773-002 Rev 7 74-10 PDF p. 2616; Fig 74-10-2 PDF p. 2618; Fig 71-00-2
// sheets 1–2 PDF pp. 2487–2488; Continental M-18 Fig 5-35 View F-F PDF p. 150).
import { afterAll, describe, expect, it } from "vitest";
import { Box3, BufferGeometry, DoubleSide, Euler, Matrix4, Quaternion, Ray, TubeGeometry, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { PartSpec } from "@/lib/catalogue";
import { curveOf } from "@/lib/geometry";
import { CAT, CYLS } from "@/aircraft/sr22t/parts";
import { cylOrigin, MAGNETO, MAGNETO_R } from "@/aircraft/sr22t/parts/engine";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { inFus } from "@/aircraft/sr22t/geometry";

/** Surface clearance from every non-owned solid and flow tube; above the ignition leads' own (non-intersection) margin. */
const MARGIN = 0.005;
/** A drawn joint: the two parts' surfaces meet within this. */
const JOINT = 0.001;

type Solid = { name: string; p?: PartSpec; g: BufferGeometry; box: Box3; bvh: MeshBVH; closed: boolean };
const make = (name: string, g: BufferGeometry, p?: PartSpec): Solid => {
  g.computeBoundingBox();
  const bvh = new MeshBVH(g);
  (g as BufferGeometry & { boundsTree?: MeshBVH }).boundsTree = bvh;
  return { name, p, g, box: g.boundingBox!.clone(), bvh, closed: !(g instanceof TubeGeometry) };
};
const placed = (p: PartSpec): Solid => {
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
  return make(p.name ?? p.id, g, p);
};
// a skewed direction, so the parity ray never runs along a face or an edge of an axis-aligned box
const SKEW = new Vector3(0.137, 0.419, 1).normalize();
/** Odd number of distinct crossings: `point` is inside the closed solid `s`. */
const inside = (point: Vector3, s: Solid) => {
  if (!s.closed || !s.box.containsPoint(point)) return false;
  const hits = s.bvh
    .raycast(new Ray(point, SKEW), DoubleSide)
    .map((h) => h.distance)
    .sort((a, b) => a - b);
  return hits.filter((d, i) => i === 0 || d - hits[i - 1] > 1e-7).length % 2 === 1;
};
/** Points every `step` along each triangle edge of `s` (vertices included) that fall inside `box`. */
const edgePoints = (s: Solid, box: Box3, step = 0.002) => {
  const at = s.g.getAttribute("position"),
    index = s.g.index,
    count = index?.count ?? at.count,
    out: Vector3[] = [];
  const v = (i: number) => new Vector3().fromBufferAttribute(at, index ? index.getX(i) : i);
  for (let i = 0; i < count; i += 3)
    for (let j = 0; j < 3; j++) {
      const a = v(i + j),
        b = v(i + ((j + 1) % 3));
      if (!new Box3().setFromPoints([a, b]).intersectsBox(box)) continue;
      const n = Math.max(1, Math.ceil(a.distanceTo(b) / step));
      for (let k = 0; k <= n; k++) {
        const p = a.clone().lerp(b, k / n);
        if (box.containsPoint(p)) out.push(p);
      }
    }
  return out;
};
/** An edge of `a` passes through a face of `b`. */
const edgeCrosses = (a: Solid, b: Solid) => {
  const at = a.g.getAttribute("position"),
    index = a.g.index,
    count = index?.count ?? at.count;
  const v = (i: number) => new Vector3().fromBufferAttribute(at, index ? index.getX(i) : i);
  for (let i = 0; i < count; i += 3)
    for (let j = 0; j < 3; j++) {
      const start = v(i + j),
        end = v(i + ((j + 1) % 3));
      if (!new Box3().setFromPoints([start, end]).intersectsBox(b.box)) continue;
      const length = start.distanceTo(end);
      if (length < 1e-5) continue;
      const ray = new Ray(start, end.clone().sub(start).normalize());
      if (b.bvh.raycast(ray, DoubleSide, 1e-5, length - 1e-5).length) return true;
    }
  return false;
};
/** Where the last `gap` call found its smallest gap (for failure messages). */
let where = new Vector3();
/** Surface gap between two placed solids, sampled along their edges every 2 mm; 0 when they cross or one holds the
 * other. */
const gap = (a: Solid, b: Solid) => {
  if (!a.box.clone().expandByScalar(MARGIN).intersectsBox(b.box)) return Infinity;
  const v = (s: Solid) => new Vector3().fromBufferAttribute(s.g.getAttribute("position"), 0);
  if (inside(v(a), b) || inside(v(b), a) || edgeCrosses(a, b) || edgeCrosses(b, a)) return 0;
  let d = Infinity;
  where.set(0, 0, 0);
  for (const [x, y] of [
    [a, b],
    [b, a],
  ])
    for (const p of edgePoints(x, y.box.clone().expandByScalar(MARGIN))) {
      const hit = y.bvh.closestPointToPoint(p)!.distance;
      if (hit < d) [d, where] = [hit, p];
    }
  return d;
};
/** The drawn wall vertices of a hose's open end (`end` 0: start, 1: end). */
const endRing = (hose: Solid, end: 0 | 1) => {
  const g = hose.g as TubeGeometry,
    ring = g.parameters.radialSegments + 1,
    at = g.getAttribute("position"),
    first = end === 0 ? 0 : g.parameters.tubularSegments * ring;
  return Array.from({ length: ring }, (_, i) => new Vector3().fromBufferAttribute(at, first + i));
};
/** Surface gaps from a hose's drawn end ring to a mating part's drawn surface (0 inside it): the nearest and the
 * farthest ring vertex. */
const ringGap = (hose: Solid, end: 0 | 1, mate: Solid) => {
  const d = endRing(hose, end).map((v) => (inside(v, mate) ? 0 : mate.bvh.closestPointToPoint(v)!.distance));
  return { min: Math.min(...d), max: Math.max(...d) };
};

const OWNED =
  /^(Magneto pressure fitting|Magneto desiccant filter|Magneto filter (bracket|flow arrow|drain)|Magneto pressurization (tee|elbow|line))$/;
const all = CAT.parts.map(placed);
const owned = all.filter((s) => OWNED.test(s.name));
const flows = FLOWS.filter((f) => f.tube !== false).map((f) => {
  const curve = curveOf(f.pts, f.tension ?? 0.3);
  return make(
    `flow ${f.key}`,
    new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
  );
});
const others = [...all.filter((s) => !OWNED.test(s.name)), ...flows];
afterAll(() => {
  for (const s of [...all, ...flows]) s.g.dispose();
});
const one = (name: string) => {
  const found = all.filter((s) => s.name === name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
const lines = () => owned.filter((s) => s.name === "Magneto pressurization line");
/** Unit direction of a cone's apex from the centroid of its distinct vertices (most of them on the base). */
const coneDirection = (s: Solid) => {
  const at = s.g.getAttribute("position"),
    seen = new Map<string, Vector3>();
  for (let i = 0; i < at.count; i++) {
    const v = new Vector3().fromBufferAttribute(at, i);
    seen.set(
      v
        .toArray()
        .map((x) => x.toFixed(6))
        .join(),
      v,
    );
  }
  const vs = [...seen.values()],
    mean = vs.reduce((a, v) => a.add(v), new Vector3()).divideScalar(vs.length);
  const apex = vs.reduce((a, v) => (v.distanceTo(mean) > a.distanceTo(mean) ? v : a));
  return apex.clone().sub(mean).normalize();
};

describe("magneto pressurization (AMM 74-10 PDF p. 2616; Fig 74-10-2 PDF p. 2618; M-18 Fig 5-35 View F-F)", () => {
  it("the filter sits in the gap between the magnetos, on the bracket on the RH magneto's inboard edge, axis fore-aft", () => {
    const right = one("Right magneto"),
      left = one("Left magneto"),
      bracket = one("Magneto filter bracket");
    const filter = all.filter((s) => s.name === "Magneto desiccant filter");
    const body = filter.reduce((a, b) => (a.box.getSize(new Vector3()).y > b.box.getSize(new Vector3()).y ? a : b));
    const c = body.box.getCenter(new Vector3()),
      size = body.box.getSize(new Vector3());
    // between the two magnetos in plan, inside their fore-aft span, and below their tops
    expect(body.box.min.z).toBeGreaterThan(left.box.max.z - MAGNETO_R);
    expect(body.box.max.z).toBeLessThan(right.box.min.z + MAGNETO_R);
    expect(Math.abs(c.z)).toBeLessThan(0.005);
    expect(c.x).toBeGreaterThan(right.box.min.x);
    expect(c.x).toBeLessThan(right.box.max.x);
    expect(body.box.max.y).toBeLessThan(right.box.max.y);
    expect(size.x).toBeGreaterThan(size.y);
    // clear of both magneto bodies; the bracket joins it to the RH magneto's inboard side only
    expect(gap(body, right)).toBeGreaterThanOrEqual(MARGIN);
    expect(gap(body, left)).toBeGreaterThanOrEqual(MARGIN);
    expect(gap(bracket, body)).toBeLessThan(JOINT);
    expect(gap(bracket, right)).toBeLessThan(JOINT);
    expect(gap(bracket, left)).toBeGreaterThanOrEqual(MARGIN);
    expect(bracket.box.getCenter(new Vector3()).z).toBeLessThan(MAGNETO("R")[2]);
  });

  it("is installed arrow aft and drain down (AMM 74-10 Installation – Magneto Filter PDF p. 2616)", () => {
    const filter = all.filter((s) => s.name === "Magneto desiccant filter");
    const body = filter.reduce((a, b) => (a.box.getSize(new Vector3()).y > b.box.getSize(new Vector3()).y ? a : b));
    const c = body.box.getCenter(new Vector3()),
      r = body.box.getSize(new Vector3()).y / 2;
    const arrow = one("Magneto filter flow arrow"),
      drain = one("Magneto filter drain");
    // the arrow is on the filter body and points aft (−x), within 5°
    expect(gap(arrow, body)).toBe(0);
    expect(coneDirection(arrow).dot(new Vector3(-1, 0, 0))).toBeGreaterThan(Math.cos((5 * Math.PI) / 180));
    // the drain is on the body's underside, directly below its axis, and points down (−y): it leaves the body
    // downward and is longest vertically
    expect(gap(drain, body)).toBe(0);
    const d = drain.box.getCenter(new Vector3()),
      ds = drain.box.getSize(new Vector3());
    expect(d.y).toBeLessThan(c.y - r);
    expect(drain.box.min.y).toBeLessThan(body.box.min.y - 0.003);
    expect(drain.box.max.y).toBeLessThan(c.y);
    expect(Math.abs(d.z - c.z)).toBeLessThan(0.002);
    expect(d.x).toBeGreaterThan(body.box.min.x);
    expect(d.x).toBeLessThan(body.box.max.x);
    expect(ds.y).toBeGreaterThan(Math.max(ds.x, ds.z));
  });

  it("is continuous: throttle-body fitting → hose → filter → hose → tee → hoses → an elbow on top of each magneto, each joint ≤ 1 mm", () => {
    const throttle = one("Throttle body / fuel-metering valve"),
      fitting = one("Magneto pressure fitting"),
      tee = one("Magneto pressurization tee");
    const filter = all.filter((s) => s.name === "Magneto desiccant filter");
    expect(filter).toHaveLength(3);
    const elbows = all.filter((s) => s.name === "Magneto pressurization elbow");
    expect(elbows).toHaveLength(2);
    // the fitting is on the throttle body's upstream (forward) half
    expect(gap(fitting, throttle)).toBe(0);
    expect(fitting.box.getCenter(new Vector3()).x).toBeGreaterThan(throttle.box.getCenter(new Vector3()).x);
    const ls = lines();
    expect(ls).toHaveLength(4);
    const body = filter.reduce((a, b) => (a.box.getSize(new Vector3()).y > b.box.getSize(new Vector3()).y ? a : b));
    const [aftNipple, foreNipple] = filter.filter((f) => f !== body).sort((a, b) => a.box.min.x - b.box.min.x);
    // the hose end's drawn wall meets the drawn mate within 1 mm (touches), and sits on its rim or inside it all round (seated)
    const touches = (l: Solid, end: 0 | 1, mate: Solid) => ringGap(l, end, mate).min <= JOINT;
    const seated = (l: Solid, end: 0 | 1, mate: Solid) => ringGap(l, end, mate).max <= JOINT;
    // one hose leaves the fitting and ends on the filter's forward nipple; one leaves the aft nipple and ends on the tee
    const feed = ls.filter((l) => touches(l, 0, fitting));
    expect(feed).toHaveLength(1);
    expect(seated(feed[0], 0, fitting)).toBe(true);
    expect(seated(feed[0], 1, foreNipple)).toBe(true);
    const out = ls.filter((l) => touches(l, 0, aftNipple));
    expect(out).toHaveLength(1);
    expect(seated(out[0], 0, aftNipple)).toBe(true);
    expect(seated(out[0], 1, tee)).toBe(true);
    // two hoses leave the tee, one to an elbow on each magneto; each elbow is seated on its magneto's top
    const branches = ls.filter((l) => seated(l, 0, tee));
    expect(branches).toHaveLength(2);
    for (const name of ["Right magneto", "Left magneto"]) {
      const magneto = one(name);
      const elbow = elbows.find((e) => gap(e, magneto) === 0);
      expect(elbow, name).toBeDefined();
      expect(elbow!.box.min.y).toBeGreaterThan(magneto.box.max.y - 0.01);
      expect(
        branches.filter((l) => seated(l, 1, elbow!)),
        name,
      ).toHaveLength(1);
    }
    // the nipples are joined to the filter body
    for (const n of [aftNipple, foreNipple]) expect(gap(n, body)).toBeLessThan(JOINT);
  });

  it(`every part clears every non-owned solid and flow tube by ${MARGIN * 1000} mm, except where it is mounted`, () => {
    // mountings: the fitting on the throttle body, the bracket on the RH magneto, each elbow on its magneto
    const mounted = (a: Solid, b: Solid) =>
      (a.name === "Magneto pressure fitting" && b.name === "Throttle body / fuel-metering valve") ||
      (a.name === "Magneto filter bracket" && b.name === "Right magneto") ||
      (a.name === "Magneto pressurization elbow" &&
        b.name === (a.box.getCenter(new Vector3()).z > 0 ? "Right magneto" : "Left magneto"));
    expect(owned.length).toBe(14);
    expect(others.filter((s) => /^Ignition lead/.test(s.name)).length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const a of owned)
      for (const b of others) {
        if (mounted(a, b)) continue;
        const g = gap(a, b);
        if (g < MARGIN - 1e-7)
          hits.push(
            `${a.name} / ${b.name}: ${(g * 1000).toFixed(2)} mm at ${where.toArray().map((v) => v.toFixed(3))}`,
          );
      }
    expect(hits).toEqual([]);
  }, 60000);

  it(`every vertex is at least ${MARGIN * 1000} mm inside the cowl loft`, () => {
    const out: string[] = [];
    for (const s of owned) {
      const at = s.g.getAttribute("position");
      for (let i = 0; i < at.count; i++) {
        const v = new Vector3().fromBufferAttribute(at, i);
        if (!inFus(v, MARGIN)) {
          out.push(`${s.name} ${v.toArray()}`);
          break;
        }
      }
    }
    expect(out).toEqual([]);
  });
});
