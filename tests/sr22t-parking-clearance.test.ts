import { expect, it } from "vitest";
import * as THREE from "three";
import { Box3, BufferGeometry, Line3, Ray, Triangle, Vector3 } from "three";
import {
  CAT,
  NOSE_GEAR,
  NOSE_CASTER,
  PROP,
  CYLS,
  YOKES,
  YOKE_X,
  YOKE_Y,
  PARK_ARM,
  parkArmAngle,
  parkClevis,
  parkStop,
  parkWire,
  parkWrap,
} from "@/aircraft/sr22t/parts";
import { doorHinge, tubeGeo, type DoorKey } from "@/aircraft/sr22t/geometry";
import { ETT, CARR, AIL_SECTOR, RUD_HORN, PULLEYS } from "@/aircraft/sr22t/rig";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { curveOf } from "@/lib/geometry";
import type { PartSpec } from "@/lib/catalogue";
import { faceCandidates } from "./helpers/faceCandidates";
const margin = 0.001; // Same illustrative faceMargin as the brake-solids audit.
const triangles = (g: BufferGeometry) => {
  const position = g.getAttribute("position"),
    index = g.index;
  return Array.from({ length: (index?.count ?? position.count) / 3 }, (_, i) => {
    const points = [0, 1, 2].map((j) =>
      new Vector3().fromBufferAttribute(position, index ? index.getX(i * 3 + j) : i * 3 + j),
    );
    const triangle = new Triangle(...(points as [Vector3, Vector3, Vector3]));
    return { triangle, box: new Box3().setFromPoints(points) };
  });
};
const edges = (t: Triangle) => [new Line3(t.a, t.b), new Line3(t.b, t.c), new Line3(t.c, t.a)];
const segmentDistance = (a: Line3, b: Line3) => {
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
  if (t < 0) {
    t = 0;
    s = aa > 1e-20 ? Math.max(0, Math.min(1, -dd / aa)) : 0;
  } else if (t > 1) {
    t = 1;
    s = aa > 1e-20 ? Math.max(0, Math.min(1, (bb - dd) / aa)) : 0;
  }
  return a.at(s, new Vector3()).distanceTo(b.at(t, new Vector3()));
};
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
      if (length > 1e-12) {
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
  }
  for (const x of edges(a)) for (const y of edges(b)) gap = Math.min(gap, segmentDistance(x, y));
  return gap;
};
// Surface distances alone miss a small solid wholly enclosed in a larger tube.
// Match the existing cylinder audit's odd-exit containment check as well.
const inside = (point: Vector3, faces: ReturnType<typeof triangles>, box: Box3) => {
  if (!box.containsPoint(point)) return false;
  const ray = new Ray(point, new Vector3(0.137, 0.419, 1).normalize());
  const exits = faces
    .flatMap(({ triangle }) => {
      const hit = ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, new Vector3());
      return hit ? [point.distanceTo(hit)] : [];
    })
    .sort((a, b) => a - b);
  if (exits.some((d) => d < 1e-7)) return false;
  return exits.filter((d, i) => i === 0 || d - exits[i - 1] > 1e-7).length % 2 === 1;
};
const groupMatrix = (parent?: string): THREE.Matrix4 => {
  const matrix = new THREE.Matrix4();
  if (!parent || parent === "rig:pedL" || parent === "rig:pedR") return matrix;
  let origin: number[];
  if (parent === "noseGear") origin = NOSE_GEAR;
  else if (parent === "caster") origin = NOSE_GEAR.map((v, i) => v + NOSE_CASTER[i]);
  else if (parent.startsWith("blade:"))
    return matrix.makeRotationX((Number(parent.split(":")[1]) * Math.PI * 2) / 3).setPosition(...PROP);
  else if (parent.startsWith("cyl:")) {
    const c = CYLS.find((c) => c.n === Number(parent.split(":")[1]))!;
    origin = [c.x, -0.14, c.s * 0.25];
  } else if (parent.startsWith("yoke:") || parent.startsWith("grip:"))
    origin = [YOKE_X, YOKE_Y, YOKES.find((y) => y.side === parent.split(":")[1])!.z];
  else if (parent.startsWith("door:")) origin = doorHinge(parent.slice(5) as DoorKey).pivot.toArray();
  else if (parent.startsWith("surf:")) origin = CAT.surfaces.find((p) => p.key === parent.slice(5))!.pivot;
  else if (parent === "rig:ett") origin = ETT.c;
  else if (parent === "rig:ailSector") origin = AIL_SECTOR.c;
  else if (parent === "rig:rudHorn") origin = RUD_HORN.c;
  else if (parent.startsWith("rig:carr:")) origin = [CARR.x, CARR.y, parent.endsWith("L") ? -CARR.z : CARR.z];
  else if (parent.startsWith("rig:pul:")) origin = PULLEYS[parent.slice(8)].c;
  else throw new Error("Missing world transform for " + parent);
  return matrix.makeTranslation(origin[0], origin[1], origin[2]);
};

const solid = (p: PartSpec, fraction?: number) => {
  let g = p.geo();
  let pos = p.pos ?? [0, 0, 0],
    rot = p.rot ?? [0, 0, 0];
  if (fraction !== undefined) {
    if (p.name === "Parking brake actuation arm") {
      pos = PARK_ARM;
      rot = [parkArmAngle(fraction), 0, 0];
    }
    if (p.name === "Parking brake clevis pin") pos = parkClevis(fraction);
    if (p.name === "Parking brake cable stop") pos = parkStop(fraction);
    if (p.name === "Parking brake cable core" || p.name === "Parking brake clevis cable wrap") {
      const radius = (g as THREE.TubeGeometry).parameters.radius;
      g.dispose();
      g = tubeGeo(p.name.endsWith("core") ? parkWire(fraction) : parkWrap(fraction), radius, 0);
    }
  }
  g.applyMatrix4(
    groupMatrix(p.parent).multiply(
      new THREE.Matrix4().compose(
        new Vector3(...pos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
        new Vector3(...(p.scale ?? [1, 1, 1])),
      ),
    ),
  );
  g.computeBoundingBox();
  const result = { name: p.name!, faces: triangles(g), box: g.boundingBox!.clone() };
  g.dispose();
  return result;
};
type Solid = ReturnType<typeof solid>;
const gap = (a: Solid, b: Solid) => {
  if (!a.box.clone().expandByScalar(margin).intersectsBox(b.box)) return Infinity;
  let result = Infinity;
  for (const x of a.faces)
    for (const y of faceCandidates(b.faces, x.box.clone().expandByScalar(margin))) {
      if (!x.box.clone().expandByScalar(margin).intersectsBox(y.box)) continue;
      result = Math.min(result, distance(x.triangle, y.triangle));
      if (result < margin - 1e-7) return result;
    }
  if (inside(a.faces[0].triangle.a, b.faces, b.box) || inside(b.faces[0].triangle.a, a.faces, a.box)) return 0;
  return result;
};
const flows = () =>
  FLOWS.filter((f) => f.tube !== false).map((f) => {
    const curve = curveOf(f.pts, f.tension ?? 0.3);
    return solid({
      id: `flow-${f.key}`,
      name: `flow ${f.key}`,
      sys: f.sys,
      geo: () =>
        new THREE.TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
    });
  });
it("every Parking brake part clears rendered FLOWS by the brake faceMargin (AMM Fig 32-42-4 sheets 4/5 PDF 1479/1480)", () => {
  const tubes = flows();
  const hits: string[] = [];
  for (const p of CAT.parts.filter((p) => p.name?.startsWith("Parking brake "))) {
    const a = solid(p);
    for (const b of tubes) if (gap(a, b) < margin - 1e-7) hits.push(`${a.name} / ${b.name}`);
  }
  expect(hits).toEqual([]);
}, 30000);
it("moving arm, pin, stop, core and wrap clear every solid and rendered flow at 21 travel fractions (AMM Fig 32-42-4 PDF 1479/1480)", () => {
  const names = [
    "Parking brake actuation arm",
    "Parking brake clevis pin",
    "Parking brake cable stop",
    "Parking brake cable core",
    "Parking brake clevis cable wrap",
  ];
  const moving = CAT.parts.filter((p) => names.includes(p.name!));
  expect(moving).toHaveLength(5);
  const fixed = CAT.parts.filter((p) => !names.includes(p.name!)).map((p) => solid(p));
  const tubes = flows();
  // Documented physical joints only, not exemptions for foreign solids or flow tubes.
  const joints = [
    ["Parking brake actuation arm", "Parking brake valve"],
    ["Parking brake actuation arm", "Parking brake clevis pin"],
    ["Parking brake clevis pin", "Parking brake clevis cable wrap"],
    ["Parking brake cable core", "Parking brake clevis pin"],
    ["Parking brake cable core", "Parking brake clevis cable wrap"],
    ["Parking brake cable core", "Parking brake control cable"],
  ];
  const hits: string[] = [];
  for (let i = 0; i <= 20; i++) {
    const poses = moving.map((p) => solid(p, i / 20));
    for (const a of poses)
      for (const b of [...fixed, ...poses, ...tubes]) {
        if (a === b || joints.some((pair) => pair.includes(a.name) && pair.includes(b.name))) continue;
        const clearance = gap(a, b);
        if (clearance < margin - 1e-7) hits.push(`${i / 20}: ${a.name} / ${b.name}: ${clearance * 1000} mm`);
      }
  }
  expect(hits).toEqual([]);
}, 30000);
