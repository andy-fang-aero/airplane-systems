/**
 * Sampled clearance between a drawn tube and solid obstacles (induction ducts; the exhaust reuses it).
 * The tube is sampled along its centreline every `step` metres: each sample's distance to an obstacle's surface, minus
 * the tube radius, is the local surface gap (a sphere of the tube's radius; their union is the tube). Within one radius
 * of an open end those spheres would reach past the end, so there the tube's real wall is sampled instead, in rings.
 * A sample inside a closed obstacle counts as a negative gap.
 */
import { DoubleSide, Ray, Vector3, type BufferGeometry, type Curve } from "three";
import { MeshBVH } from "three-mesh-bvh";

/** A world-space obstacle. `closed` solids also catch a tube wholly inside them. */
export type Obstacle = { name: string; bvh: MeshBVH; closed: boolean };

/** Wraps a world-space geometry (already placed) as an obstacle; the geometry must stay alive while it is used. */
export const obstacle = (name: string, geometry: BufferGeometry, closed = true): Obstacle => ({
  name,
  bvh: new MeshBVH(geometry),
  closed,
});

// A skewed direction, so the parity ray never runs along a face or an edge of an axis-aligned box.
const PARITY_DIR = new Vector3(0.137, 0.419, 1).normalize();
/** Odd number of distinct surface crossings along a ray: the point is inside the closed solid. */
const inside = (o: Obstacle, p: Vector3) => {
  const hits = o.bvh
    .raycast(new Ray(p, PARITY_DIR), DoubleSide)
    .map((h) => h.distance)
    .sort((a, b) => a - b);
  return hits.filter((d, i) => i === 0 || d - hits[i - 1] > 1e-7).length % 2 === 1;
};

/** Centreline samples every `step` metres along `curve`, both ends included. */
export const samplesAlong = (curve: Curve<Vector3>, step = 0.01) => {
  const n = Math.max(1, Math.ceil(curve.getLength() / step));
  return Array.from({ length: n + 1 }, (_, i) => curve.getPointAt(i / n));
};

/** Points on the surface of a tube of radius `r` around `curve`: `around` per ring, one ring every `step` metres. */
export const surfaceSamples = (curve: Curve<Vector3>, r: number, step = 0.01, around = 8) => {
  const n = Math.max(1, Math.ceil(curve.getLength() / step));
  const points: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n,
      at = curve.getPointAt(u),
      axis = curve.getTangentAt(u);
    const a =
      new Vector3(axis.y, -axis.x, 0).lengthSq() > 1e-6 ? new Vector3(axis.y, -axis.x, 0) : new Vector3(0, 1, 0);
    a.normalize();
    const b = new Vector3().crossVectors(axis, a).normalize();
    for (let k = 0; k < around; k++) {
      const t = (2 * Math.PI * k) / around;
      points.push(
        at
          .clone()
          .addScaledVector(a, r * Math.cos(t))
          .addScaledVector(b, r * Math.sin(t)),
      );
    }
  }
  return points;
};

/** Wall points of a tube of radius `r` around `curve` at fraction `u` of its length. */
const ring = (curve: Curve<Vector3>, r: number, u: number, around = 16) => {
  const at = curve.getPointAt(u),
    axis = curve.getTangentAt(u);
  const a = new Vector3().crossVectors(axis, Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0));
  a.normalize();
  const b = new Vector3().crossVectors(axis, a).normalize();
  return Array.from({ length: around }, (_, k) => {
    const t = (2 * Math.PI * k) / around;
    return at
      .clone()
      .addScaledVector(a, r * Math.cos(t))
      .addScaledVector(b, r * Math.sin(t));
  });
};

/** The smallest surface gap from a tube of radius `r` along `curve` to any obstacle, with the obstacle and the sample. */
export const sampledClearance = (curve: Curve<Vector3>, r: number, obstacles: Obstacle[], step = 0.01) => {
  const length = curve.getLength(),
    cap = Math.min(r, length / 2);
  const n = Math.max(1, Math.ceil((length - 2 * cap) / step));
  // centreline spheres over the body; wall rings over the last radius at each end
  const probes = [
    ...Array.from({ length: n + 1 }, (_, i) => ({
      p: curve.getPointAt((cap + ((length - 2 * cap) * i) / n) / length),
      r,
    })),
    ...[0, cap / 2, cap, length - cap, length - cap / 2, length].flatMap((d) =>
      ring(curve, r, d / length).map((p) => ({ p, r: 0 })),
    ),
  ];
  let worst = { gap: Infinity, name: "", at: new Vector3() };
  for (const { p, r: reach } of probes)
    for (const o of obstacles) {
      const hit = o.bvh.closestPointToPoint(p);
      if (!hit) continue;
      const gap = o.closed && inside(o, p) ? -hit.distance - reach : hit.distance - reach;
      if (gap < worst.gap) worst = { gap, name: o.name, at: p };
    }
  return worst;
};
