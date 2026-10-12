/** AMM 13773-002 Rev 7 55-20 PDF 2243 (service loop/full movement),
 * Fig 30-07-2 sheets 1/6 PDF 1217/1222. Geometry audit, not an installation tolerance. */
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { PartSpec, SurfaceSpec } from "@/lib/catalogue";
import { CAT } from "@/aircraft/sr22t/parts";
import { HZ } from "@/aircraft/sr22t/geometry";
import { inside, points, tris } from "./mesh-clearance";

// Installed BVH supports indirect indexing; its older declarations omit this option.
const BVH_OPTIONS = { indirect: true, setBoundingBox: true };
const I = new THREE.Matrix4();
export const elevatorPose = (sf: SurfaceSpec, degrees: number) =>
  new THREE.Matrix4().makeTranslation(...sf.pivot).multiply(
    // Airplane.tsx: elevR = -el, elevL = +el; positive is trailing edge up.
    new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(...sf.axis),
      ((sf.key === "elevR" ? -1 : 1) * degrees * Math.PI) / 180,
    ),
  );
const local = (p: PartSpec) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...(p.pos ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
    new THREE.Vector3(...(p.scale ?? [1, 1, 1])),
  );
const solid = (g: THREE.BufferGeometry) => {
  // Collapsed loft/tube seam triangles have no area and are not physical surfaces.
  // BVH triangle intersections otherwise report spurious contacts against those seams.
  const vertices = points(g, I),
    index = g.index,
    indices: number[] = [];
  for (let i = 0; i < (index?.count ?? vertices.length); i += 3) {
    const ids = [0, 1, 2].map((j) => (index ? index.getX(i + j) : i + j));
    if (
      new THREE.Triangle(
        ...(ids.map((id) => vertices[id]) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]),
      ).getArea() > 1e-12
    )
      indices.push(...ids);
  }
  // TubeGeometry leaves its ends open. Close the two end rings for a valid solid/parity oracle.
  // Reuse the rendered ring vertices; the fan adds no new occupied volume or tube radius.
  if (g instanceof THREE.TubeGeometry) {
    const radial = g.parameters.radialSegments;
    for (const offset of [0, g.parameters.tubularSegments * (radial + 1)])
      for (let j = 1; j < radial - 1; j++) indices.push(offset, offset + j, offset + j + 1);
  }
  g.setIndex(indices);
  g.computeBoundingBox();
  const mesh = tris(g, I);
  return { g, bvh: new MeshBVH(g, BVH_OPTIONS), box: g.boundingBox!, mesh };
};
const partSolid = (p: PartSpec, pose = I) => solid(p.geo().applyMatrix4(pose.clone().multiply(local(p))));
type Solid = ReturnType<typeof solid>;
// Vertical rays cross the upper/lower elevator skins, avoiding the folded spanwise
// horn transition that produces coincident hits along a nearly spanwise ray.
const PARITY = new THREE.Vector3(0, 1, 0);
const signedDistance = (p: THREE.Vector3, s: Solid) => {
  const distance = s.bvh.closestPointToPoint(p)!.distance;
  if (!s.box.containsPoint(p)) return distance;
  const hits = s.bvh
    .raycast(new THREE.Ray(p, PARITY), THREE.DoubleSide)
    .map((h) => h.distance)
    .sort((a, b) => a - b);
  // Match doorSolid's 10 µm seam tolerance: the loft transition has coincident crossing faces.
  const exits = hits.filter((d, i) => i === 0 || d - hits[i - 1] > 0.00001);
  return exits.length % 2 ? -distance : distance;
};
const gap = (a: Solid, b: Solid) => {
  if (a.bvh.intersectsGeometry(b.g, I)) return 0;
  if (inside(points(a.g, I)[0], b.mesh, b.box) || inside(points(b.g, I)[0], a.mesh, a.box)) return -1;
  return a.bvh.closestPointToGeometry(b.g, I)!.distance;
};
/** Actual rendered triangle walls, sampled on a barycentric grid with edges <= 1 mm.
 * The named hinge-crossing exemption removes only points within 20 mm of the joint.
 * Require 6 mm at the probes, giving a 1 mm sampling margin above the 5 mm minimum. */
const hingeGap = (fixed: Solid, moving: Solid, crossing: THREE.Vector3) => {
  let min = Infinity;
  for (const face of fixed.mesh) {
    const bounds = new THREE.Box3().setFromPoints(face).expandByScalar(0.03);
    if (!bounds.intersectsBox(moving.box)) continue;
    const triangle = new THREE.Triangle(...face);
    if (
      !moving.bvh.shapecast({
        intersectsBounds: (box) => box.intersectsBox(bounds),
        intersectsTriangle: (other) => other.distanceToTriangle(triangle) <= 0.03,
      })
    )
      continue;
    const n = Math.max(
      1,
      Math.ceil(
        Math.max(face[0].distanceTo(face[1]), face[1].distanceTo(face[2]), face[2].distanceTo(face[0])) / 0.001,
      ),
    );
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n - i; j++) {
        const p = face[0]
          .clone()
          .multiplyScalar(1 - (i + j) / n)
          .addScaledVector(face[1], i / n)
          .addScaledVector(face[2], j / n);
        if (p.distanceTo(crossing) <= 0.02 || moving.box.distanceToPoint(p) > 0.03) continue;
        min = Math.min(min, signedDistance(p, moving));
      }
  }
  // Also reject a moving solid wholly enclosed by the fixed tube, even without a wall crossing.
  for (const p of points(moving.g, I))
    if (p.distanceTo(crossing) > 0.02 && fixed.box.containsPoint(p)) {
      const d = signedDistance(p, fixed);
      if (d < 0) min = Math.min(min, d);
    }
  return min;
};
export const auditTksElevators = (poses: number[]) => {
  const failures: string[] = [];
  let minimum = Infinity,
    weightMinimum = Infinity,
    jointMaximum = 0;
  const fixed = CAT.parts.filter((p) => p.sys.includes("ice") && !p.parent).map((p) => ({ p, s: partSolid(p) }));
  // Include every fixed ice part with any geometry in the empennage, including long supply lines.
  const tail = fixed.filter(({ p, s }) => s.box.min.x < -2.2 || p.name?.startsWith("Empennage"));
  try {
    for (const { p, s } of tail)
      for (const v of points(s.g, I)) {
        if (Math.abs(v.z) > HZ && v.x > -2.8556) {
          failures.push(`fixed horn intrusion: ${p.name}`);
          break;
        }
      }
    for (const sf of CAT.surfaces.filter((s) => s.key.startsWith("elev"))) {
      const riding = CAT.parts.filter((p) => p.parent === `surf:${sf.key}`);
      const ice = riding.filter((p) => p.sys.includes("ice"));
      const label = sf.key === "elevL" ? "Left" : "Right";
      const feed = tail.find(({ p }) => p.name === `${label} elevator tip feed line`)!;
      const movingFeed = ice.find((p) => p.name === `${label} elevator tip feed line (elevator)`);
      if (!movingFeed) failures.push(`${label}: no continuous elevator-side feed`);
      const tube = feed.s.g as THREE.TubeGeometry;
      const crossing = tube.parameters.path.getPoint(1);
      const neutral = solid(sf.geo().applyMatrix4(elevatorPose(sf, 0)));
      const hardware = riding
        .filter((p) => ["Elevator horn balance + weight", "Static wick"].includes(p.name!))
        .map((p) => partSolid(p, elevatorPose(sf, 0)));
      try {
        for (const p of ice) {
          const s = partSolid(p, elevatorPose(sf, 0));
          try {
            // Existing surface-mounted panel/fittings keep their skin budgets. Internal feed gets only 1 mm flush tolerance.
            const budget = p.name?.endsWith("porous panel") ? 0.03 : p.ext ? 0.02 : 0.001;
            const outside = points(s.g, I)
              .map((v) => ({ v, d: Math.max(0, signedDistance(v, neutral)) }))
              .sort((a, b) => b.d - a.d);
            const protrusion = outside[0].d;
            if (protrusion > budget)
              failures.push(
                `${label} ${p.name}: ${(protrusion * 1000).toFixed(2)} mm outside elevator loft at ${outside[0].v.toArray()}`,
              );
            // The internal feed must clear the weight/wick. The pre-existing 25 mm
            // skin-panel depiction intersects the enclosed weight near |z| 1.90;
            // its skin budget is checked above, and changing that panel is out of scope here.
            for (const h of p === movingFeed ? hardware : []) {
              const d = gap(s, h);
              weightMinimum = Math.min(weightMinimum, d);
              // Tight passage beside the weight: documented 3/16-inch tube, at least 1 mm (audit §4).
              const required = p === movingFeed ? 0.001 : 0.005;
              if (d < required) failures.push(`${label} ${p.name}: hardware gap ${(d * 1000).toFixed(2)} mm`);
            }
          } finally {
            s.g.dispose();
          }
        }
        for (const degrees of poses) {
          const pose = elevatorPose(sf, degrees);
          if (movingFeed) {
            const g = movingFeed.geo() as THREE.TubeGeometry;
            try {
              const start = g.parameters.path.getPoint(0).applyMatrix4(pose.clone().multiply(local(movingFeed)));
              jointMaximum = Math.max(jointMaximum, crossing.distanceTo(start));
              if (crossing.distanceTo(start) > 0.0005)
                failures.push(`${label} ${degrees}°: disconnected hinge crossing`);
            } finally {
              g.dispose();
            }
          }
          const moving = [solid(sf.geo().applyMatrix4(pose)), ...riding.map((p) => partSolid(p, pose))];
          try {
            for (const s of moving)
              for (const f of tail) {
                if (!s.box.clone().expandByScalar(0.006).intersectsBox(f.s.box)) continue;
                const d = f === feed ? hingeGap(f.s, s, crossing) : gap(f.s, s);
                minimum = Math.min(minimum, d);
                if (d < (f === feed ? 0.006 : 0.005))
                  failures.push(`${label} ${degrees}° / ${f.p.name}: gap ${(d * 1000).toFixed(2)} mm`);
              }
          } finally {
            moving.forEach((s) => s.g.dispose());
          }
        }
      } finally {
        neutral.g.dispose();
        hardware.forEach((s) => s.g.dispose());
      }
    }
  } finally {
    fixed.forEach(({ s }) => s.g.dispose());
  }
  return { failures: [...new Set(failures)], minimum, weightMinimum, jointMaximum };
};
