/**
 * SR22T alternator placement, orientation and drive, against SR22T POH 13772-007 7-31 and 7-47,
 * AMM 13773-002 Rev 7 24-30 (PDF pp. 694, 708, 712–717: Figures 24-30-3 and 24-30-4) and Fig 71-00-2 sheets 1–2 (PDF
 * pp. 2487–2488), and Continental M-18 Figs 5-34 and 5-35 (pp. 5-54, 5-55). The Cirrus figures aren't dimensioned: ALT 1
 * is registered to the Continental accessory mounting face; ALT 2 is pinned to the modelled values and the relations
 * its figure shows.
 */
import * as THREE from "three";
import { expect, it } from "vitest";
import { FLOWS } from "@/aircraft/sr22t/flows";
import {
  ALT1,
  ALT1_LEN,
  ALT1_PAD,
  ALT1_R,
  ALT1_TERM,
  ALT2,
  ALT2_BRACKET,
  ALT2_BRACKET_SIZE,
  ALT2_LEN,
  ALT2_PULLEY,
  ALT2_R,
  ALT2_TERM,
  CAT,
  CRANK_PULLEY,
  CRANKCASE,
  CRANKCASE_SIZE,
  CYLS,
  GOV,
  MCU,
  MCU_SIZE,
  PROP,
  SHEAVE_X,
  cylOrigin,
} from "@/aircraft/sr22t/parts";
import { ACCESSORY_FACE_X, IN } from "@/aircraft/sr22t/engine-datum";
import { ALT1_END_IN, ALT1_PAD_IN, ALT1_STATION_IN, CYL_ENVELOPE } from "@/aircraft/sr22t/parts/engine";
import { inFus } from "@/aircraft/sr22t/geometry";
import type { PartSpec } from "@/lib/catalogue";
import { curveOf } from "@/lib/geometry";

/** World-space geometry of a part, offset by its moving group's rest origin when it has one. */
function world(p: PartSpec, origin: readonly number[] = [0, 0, 0]) {
  const g = p.geo();
  const o = new THREE.Object3D();
  const [x, y, z] = p.pos ?? [0, 0, 0];
  o.position.set(x + origin[0], y + origin[1], z + origin[2]);
  if (p.rot) o.rotation.set(...p.rot);
  if (p.scale) o.scale.set(...p.scale);
  o.updateMatrixWorld();
  g.applyMatrix4(o.matrixWorld);
  return g;
}
function bounds(p: PartSpec, origin?: readonly number[]) {
  const g = world(p, origin);
  g.computeBoundingBox();
  const b = g.boundingBox!.clone();
  g.dispose();
  return b;
}
/** A cylinder's axis: its cap vertices, the most numerous, share the cap normal. */
function axisOf(p: PartSpec) {
  const n = world(p).getAttribute("normal");
  const count = new Map<string, number>();
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i)));
    const k = v
      .toArray()
      .map((c) => c.toFixed(3))
      .join(",");
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const [k] = [...count].sort((a, b) => b[1] - a[1])[0];
  return new THREE.Vector3(...k.split(",").map(Number)).normalize();
}
const one = (name: string) => {
  const found = CAT.parts.filter((p) => p.name === name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
const FWD = new THREE.Vector3(1, 0, 0);
const RIGHT = new THREE.Vector3(0, 0, 1);
/** Shaft axes must lie within 2° of the expected axis. */
const AXIS_TOL = THREE.MathUtils.degToRad(2);

it("ALT 1 is gear-driven at the right front, shaft transverse on the crankshaft CL, terminals outboard (POH 7-47; AMM PDF 708, Fig 24-30-3; M-18 Figs 5-34/5-35)", () => {
  const alt = one("ALT 1 — 100 A");
  expect(alt.pos).toEqual(ALT1);
  // The text says only where, not how it's turned: "right front" (POH 7-47), "front of the engine on the co-pilot's side" (AMM 24-30).
  expect(alt.note).toContain("Gear-driven");
  expect(alt.note).toContain("right front");
  expect(alt.note).toContain("co-pilot's side");
  expect(alt.note).not.toContain("parallel");
  // Registration: the accessory mounting face is 5.42 in. aft of cylinder #1's CL (M-18 Fig 5-34, dimensioned), and the
  // ALT 1 axis is 27.3 in. forward of that face (Fig 5-35 RH side view, scaled).
  const cyl1 = CYLS.find((c) => c.n === 1)!;
  expect(ACCESSORY_FACE_X).toBeCloseTo(cyl1.x - 5.42 * IN, 9);
  expect(ALT1[0]).toBeCloseTo(ACCESSORY_FACE_X + ALT1_STATION_IN * IN, 9);
  // Forward of the right bank's front cylinder (#5) and aft of the crankcase front face: on the crankcase nose.
  const cyl5 = CYLS.find((c) => c.n === 5)!;
  expect(ALT1[0]).toBeGreaterThan(cyl5.x);
  expect(ALT1[0]).toBeLessThan(CRANKCASE[0] + CRANKCASE_SIZE[0] / 2);
  // On the crankshaft CL (Fig 5-34 View D-D side-on, Fig 5-35 end face-on), right of it.
  expect(ALT1[1]).toBe(PROP[1]);
  expect(ALT1[2]).toBeGreaterThan(PROP[2]);
  // Orientation: shaft transverse (along z); envelope scaled from Fig 5-34 View D-D.
  expect(axisOf(alt).angleTo(RIGHT)).toBeLessThan(AXIS_TOL);
  const b = bounds(alt);
  expect(b.max.z - b.min.z).toBeCloseTo(ALT1_LEN, 6);
  expect(b.max.x - b.min.x).toBeCloseTo(2 * ALT1_R, 3);
  expect(b.max.y - b.min.y).toBeCloseTo(2 * ALT1_R, 3);
  expect(b.min.z).toBeCloseTo(ALT1_PAD_IN * IN, 6);
  expect(b.max.z).toBeCloseTo(ALT1_END_IN * IN, 6);
  // Mount: the drive pad runs from the crankcase box's right face out to the pad face, normal +z; the body is outboard of it.
  const crankcase = bounds(one("Continental TSIO-550-K"));
  const padPart = one("ALT 1 drive pad and gasket");
  const pad = bounds(padPart);
  expect(axisOf(padPart).angleTo(RIGHT)).toBeLessThan(AXIS_TOL);
  expect(pad.min.z).toBeCloseTo(crankcase.max.z, 6);
  expect(pad.max.z).toBeCloseTo(ALT1_PAD[2], 6);
  expect(b.min.z).toBeCloseTo(pad.max.z, 6);
  expect([ALT1_PAD[0], ALT1_PAD[1]]).toEqual([ALT1[0], ALT1[1]]);
  // Terminals on the outboard end, under the cover (Fig 24-30-3 items 10–12).
  const term = bounds(one("ALT 1 terminals"));
  expect(term.min.z).toBeCloseTo(b.max.z, 6);
  expect(Math.hypot(ALT1_TERM[0] - ALT1[0], ALT1_TERM[1] - ALT1[1])).toBeLessThan(ALT1_R);
  expect(
    new THREE.Vector3(...ALT1_TERM)
      .sub(new THREE.Vector3(...ALT1))
      .normalize()
      .dot(RIGHT),
  ).toBeGreaterThan(0.8);
});

it("ALT 2 is belt-driven at the front left, its pulley in the plane of the crankshaft drive sheave (POH 7-47; Fig 24-30-4)", () => {
  const alt = one("ALT 2 — 70 A");
  expect(alt.pos).toEqual(ALT2);
  expect(alt.note).toContain("Belt-driven");
  for (const [i, v] of [3.595, -0.215, -0.215].entries()) expect(ALT2[i]).toBeCloseTo(v, 3);
  // Below and outboard (left) of the crankshaft (Fig 71-00-2 sheet 2 items 15, 16).
  expect(ALT2[2]).toBeLessThan(PROP[2] - 0.15);
  expect(ALT2[1]).toBeLessThan(PROP[1]);
  expect(axisOf(alt).angleTo(FWD)).toBeLessThan(AXIS_TOL);
  const b = bounds(alt);
  expect(b.max.x - b.min.x).toBeCloseTo(ALT2_LEN, 6);
  expect(b.max.z - b.min.z).toBeCloseTo(2 * ALT2_R, 6);
  // Pulley forward of the body, coaxial, and in the sheave plane.
  const pulley = one("ALT 2 pulley");
  expect(pulley.pos).toEqual(ALT2_PULLEY);
  expect(axisOf(pulley).angleTo(FWD)).toBeLessThan(AXIS_TOL);
  expect(ALT2_PULLEY[1]).toBe(ALT2[1]);
  expect(ALT2_PULLEY[2]).toBe(ALT2[2]);
  expect(bounds(pulley).min.x).toBeCloseTo(b.max.x, 6);
  expect(CRANK_PULLEY).toEqual([ALT2_PULLEY[0], PROP[1], PROP[2]]);
  // The drive sheave sits on its adapter at the propeller flange: forward of the crankcase, aft of the hub (items 5, 6).
  expect(SHEAVE_X).toBeCloseTo(3.66, 3);
  expect(ALT2_PULLEY[0]).toBe(SHEAVE_X);
  expect(SHEAVE_X).toBeGreaterThan(CRANKCASE[0] + CRANKCASE_SIZE[0] / 2);
  expect(SHEAVE_X).toBeLessThan(PROP[0]);
  // The belt runs in that plane, round both pulleys.
  const belt = world(one("ALT 2 drive belt")).getAttribute("position");
  let nearCrank = false,
    nearAlt = false;
  for (let i = 0; i < belt.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(belt, i);
    expect(Math.abs(p.x - ALT2_PULLEY[0])).toBeLessThan(0.007);
    const rc = Math.hypot(p.y - CRANK_PULLEY[1], p.z - CRANK_PULLEY[2]),
      ra = Math.hypot(p.y - ALT2_PULLEY[1], p.z - ALT2_PULLEY[2]);
    if (rc < 0.1) nearCrank = true;
    if (ra < 0.055) nearAlt = true;
  }
  expect(nearCrank && nearAlt).toBe(true);
});

it("ALT 2 hangs from an engine bracket bolted to the crankcase and joined to the body (AMM PDF 715–716; Fig 24-30-4 items 2, 8)", () => {
  const bracket = bounds(one("ALT 2 mounting bracket"));
  expect(one("ALT 2 mounting bracket").pos).toEqual(ALT2_BRACKET);
  expect(bracket.max.x - bracket.min.x).toBeCloseTo(ALT2_BRACKET_SIZE[0], 6);
  // Engine side: one face lies on the crankcase's left face, with real overlap in x and y.
  const crankcase = bounds(one("Continental TSIO-550-K"));
  expect(bracket.max.z).toBeCloseTo(crankcase.min.z, 6);
  expect(Math.min(bracket.max.x, crankcase.max.x) - Math.max(bracket.min.x, crankcase.min.x)).toBeGreaterThan(0.03);
  expect(Math.min(bracket.max.y, crankcase.max.y) - Math.max(bracket.min.y, crankcase.min.y)).toBeGreaterThan(0.03);
  // Alternator side: the bracket reaches into the ALT 2 cylinder, along its length and inside its radius.
  const body = bounds(one("ALT 2 — 70 A"));
  expect(Math.min(bracket.max.x, body.max.x) - Math.max(bracket.min.x, body.min.x)).toBeGreaterThan(0.03);
  const y = THREE.MathUtils.clamp(ALT2[1], bracket.min.y, bracket.max.y),
    z = THREE.MathUtils.clamp(ALT2[2], bracket.min.z, bracket.max.z);
  expect(Math.hypot(y - ALT2[1], z - ALT2[2])).toBeLessThan(ALT2_R - 0.005);
});

it("each alternator's output wiring runs from its terminals to the MCU (AMM 24-30 PDF 704)", () => {
  const mcu = new THREE.Box3(
    new THREE.Vector3(...MCU).sub(new THREE.Vector3(...MCU_SIZE).multiplyScalar(0.5)),
    new THREE.Vector3(...MCU).add(new THREE.Vector3(...MCU_SIZE).multiplyScalar(0.5)),
  ).expandByScalar(0.03);
  for (const [key, term] of [
    ["alt1", ALT1_TERM],
    ["alt2", ALT2_TERM],
  ] as const) {
    const f = FLOWS.find((x) => x.key === key)!;
    expect(f, key).toBeDefined();
    expect(new THREE.Vector3(...(f.pts[0] as number[])).distanceTo(new THREE.Vector3(...term)), key).toBeLessThan(
      0.001,
    );
    expect(mcu.containsPoint(new THREE.Vector3(...(f.pts.at(-1) as number[]))), key).toBe(true);
  }
});

/** Every other solid at rest in world space: unparented parts plus the cylinders on their `cyl:<n>` groups. */
function otherSolids(exclude: string[]) {
  const out: { name: string; box: THREE.Box3 }[] = [];
  for (const p of CAT.parts) {
    if (exclude.includes(p.name ?? "")) continue;
    if (!p.parent) {
      if (!p.fairing && !p.plate) out.push({ name: p.name ?? "(unnamed)", box: bounds(p) });
      continue;
    }
    const c = CYLS.find((k) => p.parent === "cyl:" + k.n);
    if (c) out.push({ name: p.name ?? "(unnamed)", box: bounds(p, cylOrigin(c)) });
  }
  return out;
}
const OWN = [
  "ALT 1 — 100 A",
  "ALT 1 drive pad and gasket",
  "ALT 1 terminals",
  "ALT 2 — 70 A",
  "ALT 2 pulley",
  "ALT 2 mounting bracket",
  "ALT 2 drive belt",
];

it("the alternators and their mounts don't overlap any other solid, cylinders included", () => {
  const others = otherSolids(OWN);
  expect(others.some((o) => o.name.startsWith("Cylinder "))).toBe(true);
  for (const name of OWN.filter((n) => n !== "ALT 2 drive belt")) {
    // Shrunk a little, so the mount faces that touch the crankcase or the body don't count.
    const b = bounds(one(name)).expandByScalar(-1e-4);
    for (const o of others) {
      expect(b.intersectsBox(o.box), `${name} overlaps ${o.name}`).toBe(false);
    }
  }
});

it("ALT 1 clears cylinder #5 and the engine mount by at least 1 cm (M-18 Figs 5-34/5-35)", () => {
  const alt = bounds(one("ALT 1 — 100 A"));
  const cyl5 = CYLS.find((c) => c.n === 5)!;
  const near = otherSolids(OWN).filter(
    (o) => o.name === "Engine mount weldment" || /(Cylinder|Cylinder head) 5$/.test(o.name),
  );
  expect(near.some((o) => o.name === "Cylinder head 5")).toBe(true);
  expect(near.some((o) => o.name === "Engine mount weldment")).toBe(true);
  for (const o of near) {
    // Gap between boxes: the mount members are thin tubes, so their boxes overstate them.
    const gap = Math.max(
      o.box.min.x - alt.max.x,
      alt.min.x - o.box.max.x,
      o.box.min.y - alt.max.y,
      alt.min.y - o.box.max.y,
      o.box.min.z - alt.max.z,
      alt.min.z - o.box.max.z,
    );
    expect(gap, `ALT 1 to ${o.name}`).toBeGreaterThan(0.01);
  }
  expect(alt.min.x - (cyl5.x + CYL_ENVELOPE / 2)).toBeGreaterThan(0.01);
});

it("the ALT 2 belt clears every other solid, the propeller governor included (Fig 24-30-4; Fig 71-00-2 sheet 2)", () => {
  // Mesh clearance: no belt vertex lies inside any other solid's box.
  const belt = world(one("ALT 2 drive belt")).getAttribute("position");
  const others = otherSolids(OWN);
  const v = new THREE.Vector3();
  for (const o of others) {
    let inside = 0;
    for (let i = 0; i < belt.count; i++) if (o.box.containsPoint(v.fromBufferAttribute(belt, i))) inside++;
    expect(inside, `belt vertices inside ${o.name}`).toBe(0);
  }
  // The governor stays where AMM 61-20 puts it; the belt runs forward of it.
  const gov = bounds(one("Propeller governor"));
  expect(one("Propeller governor").pos).toEqual(GOV);
  for (let i = 0; i < belt.count; i++) expect(v.fromBufferAttribute(belt, i).x).toBeGreaterThan(gov.max.x + 0.01);
});

it("ALT 1, its mount and its output cable stay 1 cm inside the cowl loft (mesh vertices and rendered tube)", () => {
  const v = new THREE.Vector3();
  for (const name of ["ALT 1 — 100 A", "ALT 1 drive pad and gasket", "ALT 1 terminals"]) {
    const pos = world(one(name)).getAttribute("position");
    for (let i = 0; i < pos.count; i++) expect(inFus(v.fromBufferAttribute(pos, i), 0.01), name).toBe(true);
  }
  const f = FLOWS.find((x) => x.key === "alt1")!;
  const curve = curveOf(f.pts, f.tension ?? 0.3);
  const tube = new THREE.TubeGeometry(curve, 200, f.r ?? 0.012, 6, false).getAttribute("position");
  for (let i = 0; i < tube.count; i++) expect(inFus(v.fromBufferAttribute(tube, i), 0.01), "alt1 cable").toBe(true);
});

it("every other rendered flow tube clears ALT 1 and its mount by 5 mm (schematic clearance)", () => {
  // The cylinder exactly, by distance from its z axis; pad and terminals by their boxes.
  const inBody = (p: THREE.Vector3, r: number, z0: number, z1: number) =>
    Math.hypot(p.x - ALT1[0], p.y - ALT1[1]) < r && p.z > z0 && p.z < z1;
  const pad = bounds(one("ALT 1 drive pad and gasket")).expandByScalar(0.005);
  const term = bounds(one("ALT 1 terminals")).expandByScalar(0.005);
  const v = new THREE.Vector3();
  let checked = 0;
  for (const f of FLOWS) {
    if (f.key === "alt1" || f.tube === false) continue;
    const curve = curveOf(f.pts, f.tension ?? 0.3);
    const g = new THREE.TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const hit =
        inBody(v, ALT1_R + 0.005, ALT1[2] - ALT1_LEN / 2 - 0.005, ALT1[2] + ALT1_LEN / 2 + 0.005) ||
        pad.containsPoint(v) ||
        term.containsPoint(v);
      expect(hit, `${f.key} reaches ALT 1`).toBe(false);
    }
    // Sample the centreline densely too, so a coarse tessellation can't step over the body.
    for (const p of curve.getSpacedPoints(400))
      expect(
        inBody(p, ALT1_R + (f.r ?? 0.012), -Infinity, Infinity) &&
          p.z > ALT1[2] - ALT1_LEN / 2 - 0.02 &&
          p.z < ALT1[2] + ALT1_LEN / 2 + 0.02,
        `${f.key} centreline`,
      ).toBe(false);
    g.dispose();
    checked++;
  }
  expect(checked).toBeGreaterThan(50);
});
