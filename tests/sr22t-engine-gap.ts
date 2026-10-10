/** Surface-gap audit shared by the SR22T engine clearance tests (injector nozzles, manifold valve). */
import { Box3, BufferGeometry, Euler, Line3, Matrix4, Quaternion, Ray, Triangle, TubeGeometry, Vector3 } from "three";
import type { PartSpec } from "@/lib/catalogue";
import { CAT, CYLS, NOSE_CASTER, NOSE_GEAR, PROP, YOKES, YOKE_X, YOKE_Y } from "@/aircraft/sr22t/parts";
import { cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { doorHinge, type DoorKey } from "@/aircraft/sr22t/geometry";
import { bladeDisplayPitch, initialSim } from "@/aircraft/sr22t/model";
import { AIL_SECTOR, CARR, ETT, PULLEYS, RUD_HORN } from "@/aircraft/sr22t/rig";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";

const faces = (g: BufferGeometry) => {
  const position = g.getAttribute("position"),
    index = g.index;
  return Array.from({ length: (index?.count ?? position.count) / 3 }, (_, i) => {
    const points = [0, 1, 2].map((j) =>
      new Vector3().fromBufferAttribute(position, index ? index.getX(i * 3 + j) : i * 3 + j),
    ) as [Vector3, Vector3, Vector3];
    return { triangle: new Triangle(...points), box: new Box3().setFromPoints(points) };
  });
};
export type Shape = { name: string; key?: string; parent?: string; faces: ReturnType<typeof faces>; box: Box3 };
export const shape = (g: BufferGeometry, name: string, extra: Partial<Shape> = {}): Shape => {
  g.computeBoundingBox();
  const s = { name, faces: faces(g), box: g.boundingBox!.clone(), ...extra };
  g.dispose();
  return s;
};
/**
 * World transform of a part group at the rest pose Airplane.tsx and ControlRig.tsx start from: gear and controls
 * neutral, doors closed, propeller unrotated with blades at the initial display pitch. An unknown group throws, so a
 * new group cannot be audited at its local origin.
 */
const parentMatrix = (parent?: string): Matrix4 => {
  const m = new Matrix4();
  if (!parent || parent === "rig:pedL" || parent === "rig:pedR") return m;
  const [group, key] = [parent.slice(0, parent.indexOf(":")), parent.slice(parent.indexOf(":") + 1)];
  if (parent === "noseGear") return m.makeTranslation(toV(NOSE_GEAR));
  if (parent === "caster") return m.makeTranslation(toV(NOSE_GEAR).add(toV(NOSE_CASTER)));
  if (group === "blade" && ["0", "1", "2"].includes(key))
    return m
      .makeTranslation(toV(PROP))
      .multiply(new Matrix4().makeRotationX((Number(key) * Math.PI * 2) / 3))
      .multiply(new Matrix4().makeRotationY(bladeDisplayPitch(initialSim)));
  const c = group === "cyl" && CYLS.find((c) => String(c.n) === key);
  if (c) return m.makeTranslation(...cylOrigin(c));
  const yoke = (group === "yoke" || group === "grip") && YOKES.find((y) => y.side === key);
  if (yoke) return m.makeTranslation(YOKE_X, YOKE_Y, yoke.z);
  if (group === "door" && ["L", "R", "bag"].includes(key)) return m.makeTranslation(doorHinge(key as DoorKey).pivot);
  const surface = group === "surf" && CAT.surfaces.find((s) => s.key === key);
  if (surface) return m.makeTranslation(toV(surface.pivot));
  if (parent === "rig:ett") return m.makeTranslation(toV(ETT.c));
  if (parent === "rig:ailSector") return m.makeTranslation(toV(AIL_SECTOR.c));
  if (parent === "rig:rudHorn") return m.makeTranslation(toV(RUD_HORN.c));
  if (parent === "rig:carr:L" || parent === "rig:carr:R")
    return m.makeTranslation(CARR.x, CARR.y, parent.endsWith("L") ? -CARR.z : CARR.z);
  if (parent.startsWith("rig:pul:") && PULLEYS[parent.slice(8)])
    return m.makeTranslation(toV(PULLEYS[parent.slice(8)].c));
  throw new Error(`sr22t-engine-gap: no rest-pose transform for part group "${parent}"; add it to parentMatrix()`);
};
/** A catalogue part in airplane coordinates, placed through its group's rest-pose transform. */
export const solid = (p: PartSpec) => {
  const g = p.geo();
  g.applyMatrix4(
    new Matrix4().compose(
      toV(p.pos ?? [0, 0, 0]),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      toV(p.scale ?? [1, 1, 1]),
    ),
  );
  g.applyMatrix4(parentMatrix(p.parent));
  return shape(g, p.name ?? p.id, { parent: p.parent });
};
/** A flow tube rebuilt with the curve, radius and tessellation Flows.tsx renders. */
export const tube = (f: (typeof FLOWS)[number]) => {
  const curve = curveOf(f.pts, f.tension ?? 0.3);
  const g = new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false);
  return shape(g, `flow ${f.key}`, { key: f.key });
};
export const allSolids = () => CAT.parts.map(solid);
export const allTubes = () => FLOWS.filter((f) => f.tube !== false).map(tube);

const segment = (a: Line3, b: Line3) => {
  const u = a.delta(new Vector3()),
    v = b.delta(new Vector3()),
    w = a.start.clone().sub(b.start);
  const aa = u.dot(u),
    bb = u.dot(v),
    cc = v.dot(v),
    dd = u.dot(w),
    ee = v.dot(w);
  const det = aa * cc - bb * bb;
  let s = det > 1e-20 ? Math.max(0, Math.min(1, (bb * ee - cc * dd) / det)) : 0;
  let t = cc > 1e-20 ? (bb * s + ee) / cc : 0;
  if (t < 0) [t, s] = [0, aa > 1e-20 ? Math.max(0, Math.min(1, -dd / aa)) : 0];
  else if (t > 1) [t, s] = [1, aa > 1e-20 ? Math.max(0, Math.min(1, (bb - dd) / aa)) : 0];
  return a.at(s, new Vector3()).distanceTo(b.at(t, new Vector3()));
};
const edges = (t: Triangle) => [new Line3(t.a, t.b), new Line3(t.b, t.c), new Line3(t.c, t.a)];
const distance = (a: Triangle, b: Triangle) => {
  let gap = Infinity;
  for (const [first, second] of [
    [a, b],
    [b, a],
  ]) {
    for (const point of [first.a, first.b, first.c])
      gap = Math.min(gap, point.distanceTo(second.closestPointToPoint(point, new Vector3())));
    for (const edge of edges(first)) {
      const delta = edge.delta(new Vector3()),
        length = delta.length();
      if (length < 1e-12) continue;
      const hit = new Ray(edge.start, delta.divideScalar(length)).intersectTriangle(
        second.a,
        second.b,
        second.c,
        false,
        new Vector3(),
      );
      if (hit && hit.distanceTo(edge.start) <= length + 1e-10) return 0;
    }
  }
  for (const x of edges(a)) for (const y of edges(b)) gap = Math.min(gap, segment(x, y));
  return gap;
};
/** Surface distance misses a shape wholly inside another; count ray exits as well. */
const inside = (point: Vector3, s: Shape) => {
  if (!s.box.containsPoint(point)) return false;
  const ray = new Ray(point, new Vector3(0.137, 0.419, 1).normalize());
  const exits = s.faces
    .flatMap(({ triangle: t }) => {
      const hit = ray.intersectTriangle(t.a, t.b, t.c, false, new Vector3());
      return hit ? [point.distanceTo(hit)] : [];
    })
    .sort((a, b) => a - b);
  if (exits.some((d) => d < 1e-7)) return false;
  return exits.filter((d, i) => i === 0 || d - exits[i - 1] > 1e-7).length % 2 === 1;
};
/** Closest surface distance between two shapes, 0 when they touch, cross or nest; Infinity beyond `margin`. The nesting
 * test counts ray crossings, so it is skipped for meshes cropped by `outside`, which are no longer closed. */
export const gap = (a: Shape, b: Shape, margin: number, nest = true) => {
  if (!a.box.clone().expandByScalar(margin).intersectsBox(b.box)) return Infinity;
  if (nest && (inside(a.faces[0].triangle.a, b) || inside(b.faces[0].triangle.a, a))) return 0;
  let g = Infinity;
  for (const x of a.faces) {
    const near = x.box.clone().expandByScalar(margin);
    for (const y of b.faces) if (near.intersectsBox(y.box)) g = Math.min(g, distance(x.triangle, y.triangle));
  }
  return g;
};
/** `s` without the faces inside `region`, keeping its bounds, for measuring a joint's tubes clear of the joint body. */
export const outside = (s: Shape, region: Box3): Shape | undefined => {
  const kept = s.faces.filter((f) => !region.intersectsBox(f.box));
  return kept.length ? { ...s, faces: kept } : undefined;
};
