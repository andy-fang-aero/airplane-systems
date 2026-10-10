/** The modelled airplane (before 22T-9750): AMM 13773-002 Rev 7 22-10, Figs 22-10-3/-4/-5/-6; POH 13772-007 Figs 7-17/7-20. */
import * as THREE from "three";
import { OBB } from "three/addons/math/OBB.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  CAT,
  CYLS,
  cylOrigin,
  NOSE_GEAR,
  NOSE_CASTER,
  PROP,
  BAT2_BOX,
  BAT2_SIZE,
  BAT2_SHELF,
  ELT_POS,
  ELT_SIZE,
  ELT_SHELF,
  ELT_SHELF_OUTLINE,
  ELT_SHELF_THICKNESS,
} from "@/aircraft/sr22t/parts";
import { doorHinge, inFus, type DoorKey } from "@/aircraft/sr22t/geometry";
import { initialSim, solve } from "@/aircraft/sr22t/model";
import { useSR22T } from "@/aircraft/sr22t/store";
import {
  AIL_SECTOR,
  CARR,
  ETT,
  RUD_HORN,
  CAPSTAN,
  CABLES,
  FLOOR_HOLES,
  PULLEYS,
  cableTravel,
  fsX,
  rigPose,
} from "@/aircraft/sr22t/rig";
import {
  SERVO_BODIES,
  SERVO_CAPSTANS,
  GTA82,
  YAW_DECK_THICKNESS,
  YAW_DECK_RISE,
} from "@/aircraft/sr22t/parts/controls";
import {
  BRIDLES,
  BRIDLE_EXIT,
  BRIDLE_PULLEYS,
  GTA82_HARNESS,
  YAW_BRACKET,
  bridleExit,
  bridleRun,
  capstanAngle,
  clampPosition,
  stopBallPosition,
  grooveExit,
  wrapPoints,
  type Axis3,
} from "@/aircraft/sr22t/parts/controls-trim";
import { OXY, OXY_BOTTLE_RADIUS, OXY_BOTTLE_LENGTH, OXY_CONNECTIONS } from "@/aircraft/sr22t/parts/oxygen";
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { curveOf } from "@/lib/geometry";
import type { PartSpec } from "@/lib/catalogue";
import type { Vec3 } from "@/lib/math";
import { patched } from "./helpers";

const axes = ["pitch", "roll", "yaw"] as const;
const title = (k: Axis3) => k[0].toUpperCase() + k.slice(1);
const actuatorName = (k: Axis3) => `${title(k)} servo actuator (GSA ${k === "yaw" ? "80" : "81"})`;
const named = (n: string) => CAT.parts.filter((p) => p.name === n);
const one = (n: string) => {
  expect(named(n), n).toHaveLength(1);
  return named(n)[0];
};
const V = (p: Vec3) => new THREE.Vector3(...p);
const poseAt = (k: Axis3, v: number) => rigPose(patched(initialSim, { ctrl: { [k]: v } }));
const meshOf = (p: PartSpec) => {
  const m = new THREE.Mesh(p.geo());
  m.position.set(...(p.pos ?? [0, 0, 0]));
  m.rotation.set(...(p.rot ?? [0, 0, 0]));
  return m;
};
/** Neutral parent transforms, including every primary-control and surface group (same anchors as ControlRig). */
function parentOrigin(parent?: string): Vec3 | null {
  if (!parent || parent === "rig:pedL" || parent === "rig:pedR") return [0, 0, 0];
  if (parent.startsWith("cyl:")) return cylOrigin(CYLS.find((c) => c.n === Number(parent.slice(4)))!);
  if (parent === "noseGear") return NOSE_GEAR;
  if (parent === "caster") return V(NOSE_GEAR).add(V(NOSE_CASTER)).toArray() as Vec3;
  if (parent.startsWith("blade:")) return PROP;
  if (parent.startsWith("door:")) return doorHinge(parent.slice(5) as DoorKey).pivot.toArray() as Vec3;
  if (parent.startsWith("surf:")) return CAT.surfacePivot(parent.slice(5));
  if (parent.startsWith("rig:pul:")) return PULLEYS[parent.slice(8)].c;
  if (parent === "rig:ett") return ETT.c;
  if (parent.startsWith("rig:carr:")) return [CARR.x, CARR.y, parent.endsWith("L") ? -CARR.z : CARR.z];
  if (parent === "rig:ailSector") return AIL_SECTOR.c;
  if (parent === "rig:rudHorn") return RUD_HORN.c;
  if (parent.startsWith("yoke:") || parent.startsWith("grip:"))
    return [2.02, -0.06, parent.endsWith("L") ? -0.46 : 0.46];
  return null;
}
const detailStart = CAT.parts.findIndex((p) => p.name === "Battery 2 shelf");
const detailEnd = CAT.parts.findIndex((p) => p.name === "Pitch trim adapter → pitch servo harness");
const detail = CAT.parts.slice(detailStart, detailEnd + 1);
const clamps = named("Bridle cable clamp");
const distanceToCable = (q: THREE.Vector3, key: string) => {
  const pts = CABLES.find((c) => c.key === key)!.pts;
  return Math.min(
    ...pts
      .slice(1)
      .map((b, i) => new THREE.Line3(V(pts[i]), V(b)).closestPointToPoint(q, true, new THREE.Vector3()).distanceTo(q)),
  );
};
/** Arc length along the strand's forward-to-aft polyline to the point nearest q. */
const stationOnCable = (q: Vec3, key: string) => {
  const pts = CABLES.find((c) => c.key === key)!.pts;
  let base = 0,
    best = Infinity,
    at = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const line = new THREE.Line3(V(pts[i]), V(pts[i + 1])),
      t = line.closestPointToPointParameter(V(q), true),
      gap = line.at(t, new THREE.Vector3()).distanceTo(V(q));
    if (gap < best) [best, at] = [gap, base + t * line.distance()];
    base += line.distance();
  }
  return at;
};
/** Exact oriented bounds for our baked, rotated bracket boxes; world AABBs alone falsely fill the space under a sloping bracket. */
function solidBox(m: THREE.Mesh): OBB {
  const g = m.geometry as THREE.BoxGeometry,
    a = g.getAttribute("position");
  m.updateMatrixWorld(true);
  const point = (i: number) => new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld);
  const y = point(0).sub(point(2)).normalize(),
    z = point(0).sub(point(1)).normalize(),
    x = y.clone().cross(z).normalize();
  const centre = new THREE.Box3().setFromPoints(vertices(m)).getCenter(new THREE.Vector3());
  const size = new THREE.Vector3(g.parameters.width, g.parameters.height, g.parameters.depth)
    .multiplyScalar(0.5)
    .addScalar(-0.001);
  return new OBB(centre, size, new THREE.Matrix3().set(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z));
}
/** A rotated box is its oriented volume; a cylinder against it uses actual surface triangles. */
function triangleInOBB(t: THREE.Triangle, obb: OBB) {
  const inverse = obb.rotation.clone().transpose();
  const local = (v: THREE.Vector3) => v.clone().sub(obb.center).applyMatrix3(inverse);
  return new THREE.Box3(obb.halfSize.clone().negate(), obb.halfSize).intersectsTriangle(
    new THREE.Triangle(local(t.a), local(t.b), local(t.c)),
  );
}
function meshTriangles(m: THREE.Mesh) {
  const points = vertices(m),
    index = m.geometry.index;
  const order = index ? Array.from(index.array) : points.map((_, i) => i);
  return Array.from(
    { length: order.length / 3 },
    (_, i) => new THREE.Triangle(points[order[i * 3]], points[order[i * 3 + 1]], points[order[i * 3 + 2]]),
  );
}
function vertices(m: THREE.Mesh) {
  m.updateMatrixWorld(true);
  const a = m.geometry.getAttribute("position");
  return Array.from({ length: a.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld),
  );
}
/** Exact distance between two finite segments (including degenerate/parallel segments). */
function segmentGap(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  const u = b.clone().sub(a),
    v = d.clone().sub(c),
    w = a.clone().sub(c);
  const A = u.dot(u),
    B = u.dot(v),
    C = v.dot(v),
    D = u.dot(w),
    E = v.dot(w);
  if (A < 1e-16) return new THREE.Line3(c, d).closestPointToPoint(a, true, new THREE.Vector3()).distanceTo(a);
  if (C < 1e-16) return new THREE.Line3(a, b).closestPointToPoint(c, true, new THREE.Vector3()).distanceTo(c);
  const den = A * C - B * B;
  let x = den > 1e-16 ? THREE.MathUtils.clamp((B * E - C * D) / den, 0, 1) : 0;
  let y = (B * x + E) / C;
  if (y < 0) {
    y = 0;
    x = THREE.MathUtils.clamp(-D / A, 0, 1);
  } else if (y > 1) {
    y = 1;
    x = THREE.MathUtils.clamp((B - D) / A, 0, 1);
  }
  return a.clone().addScaledVector(u, x).distanceTo(c.clone().addScaledVector(v, y));
}
function segmentTriangleGap(a: THREE.Vector3, b: THREE.Vector3, t: THREE.Triangle) {
  const direction = b.clone().sub(a),
    length = direction.length();
  const hit =
    length > 1e-12
      ? new THREE.Ray(a, direction.clone().divideScalar(length)).intersectTriangle(
          t.a,
          t.b,
          t.c,
          false,
          new THREE.Vector3(),
        )
      : null;
  if (hit && hit.distanceTo(a) <= length + 1e-12) return 0;
  return Math.min(
    t.closestPointToPoint(a, new THREE.Vector3()).distanceTo(a),
    t.closestPointToPoint(b, new THREE.Vector3()).distanceTo(b),
    segmentGap(a, b, t.a, t.b),
    segmentGap(a, b, t.b, t.c),
    segmentGap(a, b, t.c, t.a),
  );
}
const boundsGap = (a: THREE.Box3, b: THREE.Box3) =>
  Math.hypot(
    Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0),
    Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0),
    Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0),
  );
function bottleBoxGap(bounds: THREE.Box3) {
  const c = OXY.bottle,
    gap = (v: number, lo: number, hi: number) => Math.max(lo - v, v - hi, 0);
  return Math.hypot(
    Math.max(bounds.min.x - c[0] - OXY_BOTTLE_LENGTH / 2, c[0] - OXY_BOTTLE_LENGTH / 2 - bounds.max.x, 0),
    Math.max(
      Math.hypot(gap(c[1], bounds.min.y, bounds.max.y), gap(c[2], bounds.min.z, bounds.max.z)) - OXY_BOTTLE_RADIUS,
      0,
    ),
  );
}
/** Conservative subdivision resolves a curved tube's empty whole-AABB space; no tube exemption. */
function triangleClearsBottle(t: THREE.Triangle, depth = 0): boolean {
  if (bottleBoxGap(new THREE.Box3().setFromPoints([t.a, t.b, t.c])) >= 0.01) return true;
  const signed = (q: THREE.Vector3) => {
    const dx = Math.abs(q.x - OXY.bottle[0]) - OXY_BOTTLE_LENGTH / 2,
      dr = Math.hypot(q.y - OXY.bottle[1], q.z - OXY.bottle[2]) - OXY_BOTTLE_RADIUS;
    return Math.hypot(Math.max(dx, 0), Math.max(dr, 0)) + Math.min(Math.max(dx, dr), 0);
  };
  if ([t.a, t.b, t.c].some((q) => signed(q) < 0.01) || depth === 16) return false;
  const edges = [
    [t.a, t.b, t.c],
    [t.b, t.c, t.a],
    [t.c, t.a, t.b],
  ].sort((a, b) => b[0].distanceToSquared(b[1]) - a[0].distanceToSquared(a[1]));
  const [a, b, c] = edges[0],
    m = a.clone().add(b).multiplyScalar(0.5);
  return (
    triangleClearsBottle(new THREE.Triangle(a, m, c), depth + 1) &&
    triangleClearsBottle(new THREE.Triangle(m, b, c), depth + 1)
  );
}
afterEach(() => useSR22T.setState({ s: structuredClone(initialSim) }));

describe("SR22T servo mechanical drives (AMM 22-10)", () => {
  it("lead-ruled illustrative oxygen bottle clears the sourced yaw bay by 10 mm (AMM Fig 22-10-6 sh 3 PDF 606)", () => {
    expect(OXY.bottle).toEqual([-1.33, -0.045, 0]);
    expect(OXY_BOTTLE_RADIUS).toBe(0.105);
    expect(OXY_BOTTLE_LENGTH).toBe(0.66);
    for (const end of [0, 1]) {
      const points = bridleRun("yaw", end);
      expect(points.at(-2)![2] - clampPosition("yaw", end)[2]).toBeCloseTo(0.14, 10);
    }
    expect(one("Oxygen bottle — 77 cu ft").note).toContain("Illustrative: no bottle drawing");
    const parts = [
      ...detail.filter((p) => p.chan?.includes("rudder") || p.name?.includes("shelf") || p.name?.includes("Yaw")),
      one(actuatorName("yaw")),
    ];
    for (const input of [-1, -0.5, 0, 0.5, 1]) {
      useSR22T.setState({ s: patched(initialSim, { ctrl: { yaw: input } }) });
      for (const p of parts) {
        const mesh = meshOf(p);
        p.anim?.(mesh, 0);
        const bounds = new THREE.Box3().setFromPoints(vertices(mesh));
        const gap = (v: number, lo: number, hi: number) => Math.max(lo - v, v - hi, 0);
        const dx = Math.max(
          bounds.min.x - (OXY.bottle[0] + OXY_BOTTLE_LENGTH / 2),
          OXY.bottle[0] - OXY_BOTTLE_LENGTH / 2 - bounds.max.x,
          0,
        );
        const radial = Math.hypot(
          gap(OXY.bottle[1], bounds.min.y, bounds.max.y),
          gap(OXY.bottle[2], bounds.min.z, bounds.max.z),
        );
        const distance = Math.hypot(dx, Math.max(radial - OXY_BOTTLE_RADIUS, 0));
        if (distance < 0.01 && mesh.geometry.type === "TubeGeometry")
          expect(
            meshTriangles(mesh).every((t) => triangleClearsBottle(t)),
            `${p.name} actual tube at yaw ${input}`,
          ).toBe(true);
        else expect(distance, `${p.name} at yaw ${input}`).toBeGreaterThanOrEqual(0.01);
        mesh.geometry.dispose();
      }
    }
  });

  it("oxygen bottle clears ALL catalogue solids including ghosted CAPS by 10 mm (POH 7-95; fix2 N1)", () => {
    // These exact interfaces physically connect to the bottle; no unrelated oxygen part is waived.
    const interfaces = new Set([
      "Oxygen bottle — 77 cu ft",
      "Oxygen bottle ground strap",
      "Oxygen bottle → regulator fitting",
      "Oxygen bottle → filler fitting",
    ]);
    const audited = new Set<string>();
    const gap = (v: number, lo: number, hi: number) => Math.max(lo - v, v - hi, 0);
    const clearance = (c: Vec3, bounds: THREE.Box3) => {
      const dx = Math.max(
        bounds.min.x - (c[0] + OXY_BOTTLE_LENGTH / 2),
        c[0] - OXY_BOTTLE_LENGTH / 2 - bounds.max.x,
        0,
      );
      const radial = Math.hypot(gap(c[1], bounds.min.y, bounds.max.y), gap(c[2], bounds.min.z, bounds.max.z));
      return Math.hypot(dx, Math.max(radial - OXY_BOTTLE_RADIUS, 0));
    };
    // Static catalogue geometry is built once; only moving servo details are recomputed through yaw travel.
    const solids = CAT.parts
      .filter((p) => !interfaces.has(p.name ?? ""))
      .map((p) => {
        const origin = parentOrigin(p.parent);
        expect(origin, `unhandled catalogue parent ${p.parent}`).not.toBeNull();
        if (!origin) throw new Error(`Unhandled catalogue parent ${p.parent}`);
        const mesh = meshOf(p);
        mesh.position.add(V(origin));
        const boundsOf = () => {
          let points = vertices(mesh);
          if (p.name === "Filler line") {
            // Only this 25 mm terminal neighborhood connects through the accepted bottle fitting.
            points = points.filter((q) => q.distanceTo(V(OXY_CONNECTIONS.fillerPort)) > 0.025);
            expect(points.length).toBeGreaterThan(0);
          }
          return new THREE.Box3().setFromPoints(points);
        };
        return { p, mesh, boundsOf, bounds: boundsOf(), triangles: meshTriangles(mesh) };
      });
    for (const input of [-1, -0.5, 0, 0.5, 1]) {
      useSR22T.setState({ s: patched(initialSim, { ctrl: { yaw: input } }) });
      for (const solid of solids) {
        if (detail.includes(solid.p) && solid.p.anim) {
          solid.p.anim(solid.mesh, 0);
          solid.bounds = solid.boundsOf();
          solid.triangles = meshTriangles(solid.mesh);
        }
        const distance = clearance(OXY.bottle, solid.bounds);
        if (distance < 0.01 && solid.mesh.geometry.type === "TubeGeometry")
          expect
            .soft(
              solid.triangles.every((t) => triangleClearsBottle(t)),
              `${solid.p.name} full curved tube at yaw ${input}`,
            )
            .toBe(true);
        else expect.soft(distance, `${solid.p.name ?? solid.p.id} at yaw ${input}`).toBeGreaterThanOrEqual(0.01);
        audited.add(solid.p.id);
      }
    }
    const caps = solids.find((s) => s.p.name === "CAPS canister")!.bounds;
    expect(clearance([-1.12, 0.06626274175957725, 0.016670442002837703], caps)).toBe(0);

    for (const solid of solids) solid.mesh.geometry.dispose();
    expect(audited.has(one("CAPS canister").id)).toBe(true);
    expect(audited.size).toBe(CAT.parts.length - interfaces.size);
    const canister = meshOf(one("CAPS canister"));
    const aft = new THREE.Box3().setFromPoints(vertices(canister)).min.x;
    expect(aft - (OXY.bottle[0] + OXY_BOTTLE_LENGTH / 2)).toBeCloseTo(0.04, 6);
    // The preceding fix's position must be caught even though CAPS is fairing:true.
    expect(one("CAPS canister").fairing).toBe(true);
    canister.geometry.dispose();
  });

  it("oxygen regulator and filler/supply connections follow the bottle anchor (AFMS Fig 1 p. 10)", () => {
    expect(OXY.regulator).toEqual([OXY.bottle[0] + 0.37, OXY.bottle[1] + 0.08, OXY.bottle[2]]);
    const path = (name: string) => (one(name).geo() as THREE.TubeGeometry).parameters.path;
    for (const [name, a, b] of [
      ["Oxygen bottle → regulator fitting", OXY_CONNECTIONS.bottlePort, OXY_CONNECTIONS.regulatorIn],
      ["Oxygen regulator → hose fitting", OXY_CONNECTIONS.regulatorOut, OXY_CONNECTIONS.hoseStart],
      ["Oxygen bottle → filler fitting", OXY_CONNECTIONS.fillerPort, OXY_CONNECTIONS.fillerStart],
    ] as const) {
      expect(path(name).getPointAt(0).distanceTo(V(a))).toBeLessThan(1e-9);
      expect(path(name).getPointAt(1).distanceTo(V(b))).toBeLessThan(1e-9);
    }
    expect(path("Non-conductive oxygen hose").getPointAt(0).distanceTo(V(OXY_CONNECTIONS.hoseStart))).toBeLessThan(
      1e-9,
    );
    expect(
      path("Non-conductive oxygen hose")
        .getPointAt(1)
        .distanceTo(path("Center cabin low pressure oxygen line").getPointAt(0)),
    ).toBeLessThan(1e-9);
    expect(path("Filler line").getPointAt(0).distanceTo(V(OXY_CONNECTIONS.fillerStart))).toBeLessThan(1e-9);
    expect(
      path("Filler line")
        .getPointAt(1)
        .distanceTo(V([OXY.filler[0] - 0.02, OXY.filler[1], OXY.filler[2]])),
    ).toBeLessThan(1e-9);
    expect(one("Oxygen bottle ground strap").pos).toEqual([
      OXY.bottle[0] - OXY_BOTTLE_LENGTH / 2 - 0.08,
      OXY.bottle[1],
      OXY.bottle[2],
    ]);
  });

  it("each servo is a GSA actuator on a GSM 86 mount with capstan and slip clutch (AMM 22-10 PDF 555–556)", () => {
    for (const k of axes) {
      const b = BRIDLES[k],
        actuator = one(actuatorName(k)),
        cap = one(title(k) + " servo capstan");
      expect(actuator.pos).toEqual(SERVO_BODIES[k].c);
      expect(actuator.note).toContain("GSM 86");
      expect(cap.fairing).toBe(true); // X-ray exposes the internal cartridge.
      for (const name of [
        "GSM 86 servo mount",
        "Slip clutch cartridge",
        "Capstan cable guard",
        "Capstan stiffener ring",
        "Servo mounting bracket",
      ])
        expect(named(name).filter((p) => p.chan?.[0] === b.chan).length, name + " " + k).toBeGreaterThan(0);
      const clutch = named("Slip clutch cartridge").find((p) => p.chan?.[0] === b.chan)!;
      expect(clutch.pos).toEqual(cap.pos);
      expect(cap.note).toMatch(/pilot force overrides/);
      expect(cap.note).toMatch(/illustrative/);
    }
  });

  it("bridle clamps stay on their named cable through full travel (AMM 22-10 PDF 579, 589, 598)", () => {
    // Fig 22-10-4/27-30-1: elB is outboard (+z .075), elA inboard (+z .045), so long/short → elB/elA.
    // Fig 22-10-5/27-10-1: RH/LH wing ends → ailR/ailL.
    // Modelling choice: fore/aft segments on one rudR strand (AMM 27-20 PDF 988, Fig 22-10-6 sh 3).
    expect(axes.map((k) => BRIDLES[k].keys)).toEqual([
      ["elB", "elA"],
      ["ailR", "ailL"],
      ["rudR", "rudR"],
    ]);
    expect(clamps).toHaveLength(6);
    for (const [i, k] of axes.entries())
      for (const input of [-1, -0.5, 0, 0.5, 1]) {
        const s = patched(initialSim, { ctrl: { [k]: input } }),
          pose = rigPose(s);
        useSR22T.setState({ s });
        for (const end of [0, 1]) {
          const p = clamps[i * 2 + end],
            m = meshOf(p);
          p.anim!(m, 0);
          expect(distanceToCable(m.position, BRIDLES[k].keys[end]), `${k} ${input} end ${end}`).toBeLessThan(0.02);
          expect(m.position.distanceTo(V(clampPosition(k, end, pose)))).toBeLessThan(1e-6);
          const strand = CABLES.find((c) => c.key === BRIDLES[k].keys[end])!;
          const segment = strand.pts
            .slice(1)
            .map((q, j) => new THREE.Line3(V(strand.pts[j]), V(q)))
            .sort(
              (a, b) =>
                a.closestPointToPoint(m.position, true, new THREE.Vector3()).distanceTo(m.position) -
                b.closestPointToPoint(m.position, true, new THREE.Vector3()).distanceTo(m.position),
            )[0];
          const tangent = segment.end.clone().sub(segment.start).normalize();
          for (const attachment of [
            p,
            named("Bridle cable end fitting")[i * 2 + end],
            ...(k === "pitch" ? [named("Bridle clamp spacer")[end]] : []),
          ]) {
            const mesh = meshOf(attachment);
            attachment.anim!(mesh, 0);
            expect(
              new THREE.Vector3(1, 0, 0).applyQuaternion(mesh.quaternion).dot(tangent),
              `${k}/${end}: clamp, fitting and spacer align with actual strand`,
            ).toBeCloseTo(1, 10);
            mesh.geometry.dispose();
          }
          const runs = named(BRIDLES[k].name);
          expect(runs, `${k}: one tube per bridle run`).toHaveLength(2);
          const run = runs[end],
            wire = meshOf(run);
          run.anim!(wire, 0);
          const path = (wire.geometry as THREE.TubeGeometry).parameters.path;
          expect(path.getPointAt(1).distanceTo(m.position)).toBeLessThan(1e-5);
          // Each run starts at its own tangential exit, where its groove exit transition ends; no bridge across the drum.
          expect(path.getPointAt(0).distanceTo(V(bridleExit(k, end)))).toBeLessThan(1e-6);
          const first = wire.geometry;
          run.anim!(wire, 1);
          expect(wire.geometry).toBe(first);
          m.geometry.dispose();
          wire.geometry.dispose();
        }
      }
    // Nonzero primary travel: opposite on pitch/roll strands, same on the yaw strand (lead ruling, AMM 27-20 PDF 988).
    for (const k of axes) {
      const p = poseAt(k, 1),
        keys = BRIDLES[k].keys;
      expect(Math.abs(cableTravel(p, keys[0]))).toBeGreaterThan(0.01);
      expect(cableTravel(p, keys[0])).toBeCloseTo((k === "yaw" ? 1 : -1) * cableTravel(p, keys[1]), 12);
      // Travel is along the strand, so compare arc length rather than chord where the strand bends.
      expect(
        stationOnCable(clampPosition(k, 0, p), keys[0]) - stationOnCable(clampPosition(k, 0), keys[0]),
      ).toBeCloseTo(cableTravel(p, keys[0]), 5);
    }
  });

  it("capstan rotation follows the cable: sign and travel/radius (AMM 22-10 PDF 555)", () => {
    for (const k of axes)
      for (const input of [-1, -0.5, 0.5, 1]) {
        const s = patched(initialSim, { ctrl: { [k]: input } }),
          pose = rigPose(s);
        useSR22T.setState({ s });
        const travel = cableTravel(pose, BRIDLES[k].keys[0]),
          p = one(title(k) + " servo capstan"),
          m = meshOf(p);
        p.anim!(m, 0);
        const angle = m.rotation[SERVO_CAPSTANS[k].axis];
        expect(Math.abs(angle)).toBeCloseTo(Math.abs(travel / CAPSTAN.r), 10);
        for (const end of [0, 1]) {
          const neutral = bridleRun(k, end),
            moved = bridleRun(k, end, pose);
          const length = (points: Vec3[]) =>
            points.slice(1).reduce((sum, q, i) => sum + V(q).distanceTo(V(points[i])), 0);
          const change = length(moved) - length(neutral);
          const radial = V(neutral[0]).sub(V(SERVO_CAPSTANS[k].c));
          const spinAxis = SERVO_CAPSTANS[k].axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
          const direction = V(neutral[1]).sub(V(neutral[0])).normalize();
          const feed = spinAxis.cross(radial).multiplyScalar(angle).dot(direction);
          expect(Math.abs(change), `${k}/${end}: run actually pays cable`).toBeGreaterThan(0.0001);
          expect(Math.sign(feed), `${k}/${end} input=${input}: surface feed follows run length`).toBe(
            Math.sign(change),
          );
        }
        expect(capstanAngle(k, pose)).toBeCloseTo(angle, 10);
        m.geometry.dispose();
      }
    const p = poseAt("pitch", 1);
    expect(cableTravel(p, "elA")).toBeCloseTo(p.pulley.em * PULLEYS.em.r, 12);
    const a = poseAt("roll", 1);
    expect(cableTravel(a, "ailR")).toBeCloseTo(-a.pulley.af * PULLEYS.af.r, 12);
    const r = poseAt("yaw", 1);
    expect(cableTravel(r, "rudR")).toBeCloseTo(-r.pulley.rm * PULLEYS.rm.r, 12);
    expect(() => cableTravel(p, "unknown")).toThrow(/No servo travel mapping/);
  });

  it("bridle clamps move with the primary cable particles: positive rate is aft along the strand", () => {
    for (const k of axes)
      for (const input of [-1, -0.5, 0.5, 1]) {
        const s = patched(initialSim, { ctrl: { [k]: input } }),
          pose = rigPose(s),
          rates = flowRates(s, solve(s));
        for (const end of [0, 1]) {
          const key = BRIDLES[k].keys[end],
            travel = cableTravel(pose, key);
          expect(Math.sign(travel), `${k}/${key} input=${input}: clamp travel sign`).toBe(Math.sign(rates[key]));
          // The clamp actually moves aft (toward the strand's last point) when its particles flow aft.
          const moved = stationOnCable(clampPosition(k, end, pose), key) - stationOnCable(clampPosition(k, end), key);
          expect(Math.sign(moved), `${k}/${key} input=${input}: clamp moves with particles`).toBe(
            Math.sign(rates[key]),
          );
        }
      }
  });

  it("roll clamps clear brake lines throughout travel (AMM 22-10 PDF 589, Fig 22-10-5)", () => {
    for (const [end, side] of [
      [0, "R"],
      [1, "L"],
    ] as const) {
      expect(BRIDLES.roll.clamps[end][0]).toBeCloseTo(SERVO_CAPSTANS.roll.c[0] + 0.06, 12);
      const brake = one(`Brake line (${side})`),
        tube = meshOf(brake);
      const g = tube.geometry as THREE.TubeGeometry;
      tube.updateMatrixWorld(true);
      const points = Array.from({ length: 1001 }, (_, i) =>
        g.parameters.path.getPointAt(i / 1000).applyMatrix4(tube.matrixWorld),
      );
      for (let step = -100; step <= 100; step++) {
        useSR22T.setState({ s: patched(initialSim, { ctrl: { roll: step / 20 } }) });
        const clamp = clamps[2 + end],
          m = meshOf(clamp);
        clamp.anim!(m, 0);
        const volume = solidBox(m);
        volume.halfSize.addScalar(0.001); // exact volume, without contact shrink
        const gap =
          Math.min(...points.map((q) => volume.clampPoint(q, new THREE.Vector3()).distanceTo(q))) - g.parameters.radius;
        expect(gap, `${side} roll=${step / 20}: brake tube clears entire clamp volume`).toBeGreaterThan(0);
        m.geometry.dispose();
      }
      g.dispose();
    }
  });

  it("yaw bracket supports the actuator without penetration (AMM Fig 22-10-6 sh 3, PDF 606)", () => {
    expect(YAW_DECK_THICKNESS).toBe(0.004);
    expect(YAW_DECK_RISE).toBe(0.002);
    const bottom = SERVO_BODIES.yaw.c[1] - SERVO_BODIES.yaw.size[1] / 2;
    const brackets = named("Servo mounting bracket").filter((p) => p.chan?.[0] === "rudder");
    expect(brackets).toHaveLength(3); // deck and two supporting strips
    for (const p of brackets) {
      const m = meshOf(p),
        points = vertices(m);
      const highest = Math.max(...points.map((v) => v.y));
      expect(highest).toBeLessThanOrEqual(bottom + 1e-7);
      if (!p.pos) expect(highest).toBeCloseTo(YAW_BRACKET.deck[1] - YAW_DECK_THICKNESS / 2, 7);
      m.geometry.dispose();
    }
    expect(YAW_BRACKET.deck[1] + YAW_DECK_THICKNESS / 2).toBeCloseTo(bottom, 12);
    expect(BRIDLES.yaw.keys).toEqual(["rudR", "rudR"]);
    expect(BRIDLES.yaw.clamps[0][0]).toBeGreaterThan(SERVO_CAPSTANS.yaw.c[0]);
    expect(BRIDLES.yaw.clamps[1][0]).toBeLessThan(SERVO_CAPSTANS.yaw.c[0]);
    expect(BRIDLES.yaw.note).toMatch(/Forward\/aft name cable segments/);
    expect(BRIDLE_PULLEYS.pitch!.c[0]).toBeCloseTo(SERVO_CAPSTANS.pitch.c[0] + 0.048, 12);
  });

  it("wrap count and stop-ball match the AMM (PDF 579, 589, 598)", () => {
    expect(axes.map((k) => BRIDLES[k].turns)).toEqual([2.5, 3, 3]);
    expect(axes.map((k) => BRIDLES[k].clock)).toEqual([9, 6, 12]);
    for (const k of axes) {
      const wrap = named("Capstan bridle wrap").find((p) => p.chan?.[0] === BRIDLES[k].chan)!;
      const g = wrap.geo() as THREE.TubeGeometry,
        curve = g.parameters.path;
      const angles = Array.from({ length: 181 }, (_, i) => {
        const v = curve.getPoint(i / 180);
        return Math.atan2(v.y, SERVO_CAPSTANS[k].axis === "z" ? v.x : v.z);
      });
      let winding = 0;
      for (let i = 1; i < angles.length; i++) {
        const d = angles[i] - angles[i - 1];
        winding += Math.atan2(Math.sin(d), Math.cos(d));
      }
      expect(winding / (2 * Math.PI)).toBeCloseTo(BRIDLES[k].turns, 2);
      const c = V(SERVO_CAPSTANS[k].c),
        ball = V(stopBallPosition(k));
      expect(ball.distanceTo(c)).toBeCloseTo(CAPSTAN.r, 10);
      if (k === "pitch")
        expect(ball.x).toBeGreaterThan(c.x); // 9 o'clock = forward side.
      else expect(Math.sign(ball.y - c.y)).toBe(k === "roll" ? -1 : 1);
      for (const end of [0, 1]) {
        const start = bridleRun(k, end)[0];
        expect(Math.sign(start[1] - c.y)).toBe(BRIDLE_EXIT[k]);
      }
      g.dispose();
    }
    expect(BRIDLE_PULLEYS.pitch!.end).toBe(1);
    expect(BRIDLE_PULLEYS.yaw!.end).toBe(0);
  });

  it("the moving wound ends stay connected to their fixed tangential exits (AMM 22-10, illustrative transitions)", () => {
    for (const k of axes)
      for (const v of [-1, 0, 1])
        for (const end of [0, 1]) {
          const pose = poseAt(k, v),
            angle = capstanAngle(k, pose),
            points = grooveExit(k, end, angle),
            local = wrapPoints(k)[end === 0 ? 180 : 0];
          const actual = V(local)
            .applyAxisAngle(
              SERVO_CAPSTANS[k].axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0),
              angle,
            )
            .add(V(SERVO_CAPSTANS[k].c));
          expect(V(points[0]).distanceTo(actual)).toBeLessThan(1e-6);
          expect(V(points.at(-1)!).distanceTo(V(bridleRun(k, end, pose)[0]))).toBeLessThan(1e-6);
        }
  });

  it("each servo is inside its bay (POH Fig 7-20; AMM Fig 22-10-6 sh 3 PDF 606 lead ruling)", () => {
    const pitch = one(actuatorName("pitch")).pos!,
      roll = one(actuatorName("roll")).pos!,
      yaw = one(actuatorName("yaw")).pos!;
    expect(pitch[0]).toBeLessThan(fsX(186));
    expect(pitch[0]).toBeGreaterThan(fsX(200));
    expect(pitch[1]).toBeLessThan(-0.4);
    expect(Math.abs(pitch[2])).toBeLessThan(0.15);
    expect(Math.abs(roll[0] - FLOOR_HOLES.CF4C.x)).toBeLessThan(FLOOR_HOLES.CF4C.hx);
    expect(roll[1]).toBeLessThan(-0.5);
    expect(yaw[0]).toBeLessThan(fsX(222));
    expect(yaw[0]).toBeGreaterThan(ELT_POS[0]);
    expect(yaw[0]).toBe(-0.92);
    expect(yaw[2]).toBe(-0.07); // unchanged station and lateral position.
    expect(yaw[1] - SERVO_BODIES.yaw.size[1] / 2).toBeGreaterThan(BAT2_SHELF.c[1]);
    expect(yaw[1] - SERVO_BODIES.yaw.size[1] / 2).toBeGreaterThan(ELT_SHELF[1] + ELT_SHELF_THICKNESS / 2);
    for (const k of axes) {
      const m = meshOf(one(actuatorName(k)));
      for (const v of vertices(m)) expect(inFus(v), `${k} skin clearance`).toBe(true);
      m.geometry.dispose();
    }
    expect(BAT2_SHELF.c[1]).toBe(BAT2_BOX[1] - BAT2_SIZE[1] / 2);
    // One ELT shelf, owned by the ELT installation (POH Fig 7-21; AMM Fig 25-60-1); its top face is the ELT bottom.
    expect(named("ELT shelf")).toHaveLength(1);
    expect(one("ELT shelf").pos).toEqual(ELT_SHELF);
    expect(ELT_SHELF[1] + ELT_SHELF_THICKNESS / 2).toBeCloseTo(ELT_POS[1] - ELT_SIZE[1] / 2, 12);
    expect(one("ELT — Artex ELT 1000").pos).toEqual(ELT_POS);
    expect(one("BAT 2 — 2 × 12 V, 7 Ah").pos).toEqual(BAT2_BOX);
    expect(YAW_BRACKET.battery[1] + BAT2_SHELF.size[1] / 2).toBeCloseTo(BAT2_SHELF.c[1], 12);
    // ELT strip meets the shelf underside just outside its straight inboard edge, within its fore-aft extent.
    expect(YAW_BRACKET.elt[1]).toBeCloseTo(ELT_SHELF[1] - ELT_SHELF_THICKNESS / 2, 12);
    const edgeZ = ELT_SHELF[2] + Math.min(...ELT_SHELF_OUTLINE.map(([, z]) => z));
    const xs = ELT_SHELF_OUTLINE.map(([x]) => ELT_SHELF[0] + x);
    expect(YAW_BRACKET.elt[0] - 0.025).toBeGreaterThanOrEqual(Math.min(...xs));
    expect(YAW_BRACKET.elt[0] + 0.025).toBeLessThanOrEqual(Math.max(...xs));
    {
      // The tilted strip stays out of the shelf plate: every vertex is inboard of the edge or below the underside.
      const strips = named("Servo mounting bracket").filter((p) => !p.pos);
      const eltStrip = strips.map((p) => vertices(meshOf(p))).find((vs) => vs.some((v) => v.z > 0));
      expect(eltStrip).toBeDefined();
      for (const v of eltStrip!)
        expect(v.z < edgeZ || v.y < ELT_SHELF[1] - ELT_SHELF_THICKNESS / 2 + 1e-9, `${v.toArray()}`).toBe(true);
      expect(Math.max(...eltStrip!.map((v) => v.z))).toBeCloseTo(edgeZ - 0.001, 6);
    }
    expect(YAW_BRACKET.deck[1] + 0.002).toBeCloseTo(yaw[1] - SERVO_BODIES.yaw.size[1] / 2, 10);
  });

  it("GTA 82 plate and harness meet the adapter and pitch actuator connector (AMM PDF 554, Fig 22-10-3/-4 PDF 572/584)", () => {
    const plate = one("GTA 82 mounting plate"),
      body = SERVO_BODIES.pitch;
    expect(plate.pos![0]).toBe(GTA82.c[0]);
    expect(plate.pos![1] + 0.0015).toBeCloseTo(GTA82.c[1] - GTA82.size[1] / 2, 10);
    const g = one("Pitch trim adapter → pitch servo harness").geo() as THREE.TubeGeometry;
    expect(g.parameters.path.getPointAt(0).distanceTo(V(GTA82_HARNESS[0]))).toBeLessThan(1e-6);
    expect(
      g.parameters.path.getPointAt(1).distanceTo(V([body.c[0], body.c[1], body.c[2] + body.size[2] / 2])),
    ).toBeLessThan(1e-6);
    g.dispose();
  });

  it("servo assemblies clear other solids through the travel range (all catalogue solids, AMM 22-10)", () => {
    // Attached parts within an assembly intentionally meet their host (mount, cartridge, clamp fittings, shelf/bracket).
    // This checks the complete assembly against every OTHER solid, including trim parts. Surface parents use their pivots;
    // controls on moving rig parents are covered by the existing depth-trim/depth-cables geometry tests.
    const mine = [...detail, ...axes.map((k) => one(actuatorName(k))), one("Pitch trim adapter")];
    const boxes = CAT.parts.flatMap((p) => {
      const origin = parentOrigin(p.parent);
      expect.soft(origin, `unhandled catalogue parent: ${p.parent}`).not.toBeNull();
      if (!origin) throw new Error(`Unhandled catalogue parent: ${p.parent}`);
      const m = meshOf(p);
      if (p.parent?.startsWith("blade:")) {
        m.geometry.rotateX((Number(p.parent.slice(6)) * Math.PI * 2) / 3);
      }
      m.position.add(V(origin));
      const b = new THREE.Box3().setFromPoints(vertices(m)).expandByScalar(-0.001);
      const tube = m.geometry.type === "TubeGeometry" ? (m.geometry as THREE.TubeGeometry) : null;
      const line = tube
        ? Array.from({ length: 401 }, (_, i) => tube.parameters.path.getPointAt(i / 400).applyMatrix4(m.matrixWorld))
        : null;
      // Curved door panels enclose empty space in their AABB: test their actual surface triangles.
      const triangles =
        p.parent?.startsWith("door:") && p.fairing
          ? (() => {
              const points = vertices(m),
                index = m.geometry.index;
              const order = index ? Array.from(index.array) : points.map((_, i) => i);
              return Array.from(
                { length: order.length / 3 },
                (_, i) => new THREE.Triangle(points[order[i * 3]], points[order[i * 3 + 1]], points[order[i * 3 + 2]]),
              );
            })()
          : null;
      const obb = m.geometry.type === "BoxGeometry" ? solidBox(m) : null;
      const radius = tube?.parameters.radius ?? 0;
      m.geometry.dispose();
      return [{ p, b, line, radius, triangles, obb }];
    });
    for (const k of axes)
      for (const input of [-1, -0.5, 0, 0.5, 1]) {
        useSR22T.setState({ s: patched(initialSim, { ctrl: { [k]: input } }) });
        for (const p of mine.filter((p) => !p.chan || p.chan.includes(BRIDLES[k].chan))) {
          const m = meshOf(p);
          p.anim?.(m, 0);
          const vs = vertices(m),
            box = new THREE.Box3().setFromPoints(vs);
          for (const { p: b, b: bb, line, radius, triangles, obb: otherOBB } of boxes) {
            if (b === p || !box.intersectsBox(bb)) continue;
            const pair = [p.name ?? "", b.name ?? ""];
            const attached = (a: string, z: string) =>
              (pair[0] === a && pair[1] === z) || (pair[0] === z && pair[1] === a);
            const sameAxis = p.chan?.[0] === b.chan?.[0] && !!p.chan;
            // Explicit component interfaces, rather than exempting the whole assembly from collision checks.
            if (
              sameAxis &&
              ((pair.some((n) => n.endsWith("servo capstan")) &&
                pair.some((n) => ["Slip clutch cartridge", "Capstan bridle wrap", "Bridle stop-ball"].includes(n))) ||
                attached("Capstan bridle wrap", "Bridle stop-ball") ||
                (pair.includes("Capstan bridle wrap") && pair.some((n) => n.endsWith("bridle cable"))) ||
                attached("Capstan cable guard", "Capstan stiffener ring") ||
                attached("Capstan cable guard", "GSM 86 servo mount") ||
                attached("Servo mounting bracket", "Servo mounting bracket") ||
                (pair.includes("Bridle cable clamp") &&
                  pair.some((n) => ["Bridle cable end fitting", "Bridle clamp spacer"].includes(n))) ||
                attached("Bridle cable end fitting", "Bridle clamp spacer") ||
                (pair.some((n) => n.endsWith("bridle cable")) &&
                  pair.some((n) =>
                    ["Bridle cable clamp", "Bridle cable end fitting", "Bridle clamp spacer", "Bridle pulley"].includes(
                      n,
                    ),
                  )))
            )
              continue;
            if (
              sameAxis &&
              pair.includes("Capstan groove exit transitions") &&
              pair.some((n) => n.endsWith("servo capstan") || n.endsWith("bridle cable") || n === "Capstan bridle wrap")
            )
              continue;
            // The yaw bracket bears on the Battery 2 shelf; the ELT shelf (cabin.ts) stays an audited, non-touching solid.
            if (attached("Servo mounting bracket", "Battery 2 shelf")) continue;
            // GTA harness terminates on the adapter connector; shelves support their equipment.
            if (
              attached("Pitch trim adapter → pitch servo harness", "Pitch trim adapter") ||
              attached("GTA 82 mounting plate", "Pitch trim adapter") ||
              (p.name === "Battery 2 shelf" && (b.name ?? "").startsWith("BAT 2"))
            )
              continue;
            if (triangles) {
              expect
                .soft(
                  triangles.some((t) => box.intersectsTriangle(t)),
                  `${p.name} / ${b.name} (${k}=${input})`,
                )
                .toBe(false);
            } else if (line && m.geometry.type === "BoxGeometry") {
              // Tube centreline against the entire solid volume: vertices alone miss a face/edge crossing.
              const obb = solidBox(m);
              const hit = line.find((q) => {
                // Only the harness terminal attaches to the pitch actuator connector (AMM Fig 22-10-4 item 2, PDF 584).
                if (
                  p.name === actuatorName("pitch") &&
                  b.name === "Pitch trim adapter → pitch servo harness" &&
                  q.distanceTo(V(GTA82_HARNESS.at(-1)!)) < 0.005
                )
                  return false;
                return obb.clampPoint(q, new THREE.Vector3()).distanceTo(q) < radius;
              });
              expect.soft(hit, `${p.name} / ${b.name} (${k}=${input})`).toBeUndefined();
            } else if (line) {
              // A long routed tube's world AABB is not a solid volume. Compare against its actual swept centreline.
              const points =
                m.geometry.type === "TubeGeometry"
                  ? Array.from({ length: 301 }, (_, i) =>
                      (m.geometry as THREE.TubeGeometry).parameters.path
                        .getPointAt(i / 300)
                        .applyMatrix4(m.matrixWorld),
                    )
                  : vs;
              const r = m.geometry.type === "TubeGeometry" ? (m.geometry as THREE.TubeGeometry).parameters.radius : 0;
              const hit = points.find((q) =>
                line
                  .slice(1)
                  .some(
                    (v, i) =>
                      new THREE.Line3(line[i], v).closestPointToPoint(q, true, new THREE.Vector3()).distanceTo(q) <
                      radius + r - 0.001,
                  ),
              );
              expect.soft(hit, `${p.name} / ${b.name} (${k}=${input})`).toBeUndefined();
            } else if (m.geometry.type === "TubeGeometry") {
              const path = (m.geometry as THREE.TubeGeometry).parameters.path;
              const samples = Array.from({ length: 301 }, (_, i) =>
                path.getPointAt(i / 300).applyMatrix4(m.matrixWorld),
              );
              const hits = samples.filter((q) => {
                if (
                  p.name === "Pitch trim adapter → pitch servo harness" &&
                  b.name === actuatorName("pitch") &&
                  q.distanceTo(V(GTA82_HARNESS.at(-1)!)) < 0.005
                )
                  return false;
                return otherOBB
                  ? otherOBB.clampPoint(q, new THREE.Vector3()).distanceTo(q) <
                      (m.geometry as THREE.TubeGeometry).parameters.radius
                  : bb.containsPoint(q);
              });
              expect
                .soft(hits.length, `${p.name} intersects ${b.name} at ${hits[0]?.toArray()} (${k}=${input})`)
                .toBe(0);
            } else if (otherOBB && m.geometry.type !== "BoxGeometry") {
              expect
                .soft(
                  meshTriangles(m).some((t) => triangleInOBB(t, otherOBB)),
                  `${p.name} / ${b.name} (${k}=${input})`,
                )
                .toBe(false);
            } else
              expect
                .soft(
                  m.geometry.type === "BoxGeometry"
                    ? otherOBB
                      ? solidBox(m).intersectsOBB(otherOBB)
                      : solidBox(m).intersectsBox3(bb)
                    : box.clone().expandByScalar(-0.001).intersectsBox(bb),
                  `${p.name} / ${b.name} (${k}=${input})`,
                )
                .toBe(false);
          }
          m.geometry.dispose();
        }
      }
  });
  it("servo and moved oxygen meshes clear EVERY rendered flow tube through control travel (fix3 N1/N2; AMM 22-10/34-10)", () => {
    const shelf = meshOf(one("Battery 2 shelf"));
    const box = new THREE.Box3().setFromPoints(vertices(shelf));
    expect(box.max.y).toBeCloseTo(BAT2_SHELF.c[1], 7);
    expect(one("Battery 2 shelf").note).toContain("35 × 54 mm");
    shelf.geometry.dispose();
    expect(FLOWS.find((f) => f.key === "static2")!.pts).toContainEqual([0.5, -0.6, 0.1]);
    expect(FLOWS.find((f) => f.key === "static2")!.pts).toContainEqual([0.65, -0.59, 0.44]);
    expect(FLOWS.find((f) => f.key === "static2")!.pts).toContainEqual([0.95, -0.59, 0.44]);
    expect(FLOWS.find((f) => f.key === "static2")!.pts).toContainEqual([1.05, -0.61, 0.4]);
    expect(FLOWS.find((f) => f.key === "stallWire")!.pts).toContainEqual([0.8, -0.52, 0.44]);
    const rendered = FLOWS.filter((f) => f.tube !== false);
    const streams = rendered.map((f) => {
      // Same curve, segment count, radius and radial tessellation as components/scene/Flows.tsx.
      const curve = curveOf(f.pts, f.tension ?? 0.3),
        g = new THREE.TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false);
      if (f.key === "static2") {
        const position = g.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          const q = new THREE.Vector3().fromBufferAttribute(position, i);
          if (q.x >= 0.4 && q.x <= 1.2) expect(inFus(q), "rerouted static tube stays inside the skin").toBe(true);
        }
      }
      const n = g.parameters.tubularSegments,
        points = Array.from({ length: n + 1 }, (_, i) => curve.getPointAt(i / n));
      const segments = points
        .slice(1)
        .map((b, i) => ({ a: points[i], b, bounds: new THREE.Box3().setFromPoints([points[i], b]) }));
      const bounds = new THREE.Box3().setFromBufferAttribute(g.getAttribute("position") as THREE.BufferAttribute);
      const flowTriangles = meshTriangles(new THREE.Mesh(g));
      g.dispose();
      return { f, segments, bounds, flowTriangles, r: g.parameters.radius };
    });
    expect(streams.map((s) => s.f.key)).toEqual(FLOWS.filter((f) => f.tube !== false).map((f) => f.key));
    const oxygenNames = [
      "Oxygen bottle — 77 cu ft",
      "Regulator / latching solenoid",
      "Oxygen bottle ground strap",
      "Filler line",
      "Non-conductive oxygen hose",
      "Oxygen bottle → regulator fitting",
      "Oxygen regulator → hose fitting",
      "Oxygen bottle → filler fitting",
    ];
    const mine = [
      ...detail,
      ...axes.map((k) => one(actuatorName(k))),
      one("Pitch trim adapter"),
      ...oxygenNames.map(one),
    ];
    const audited = new Set<string>();
    const cableKeys = new Set(CABLES.map((c) => c.key));
    for (const k of axes)
      for (let step = -100; step <= 100; step++) {
        const input = step / 100,
          s = patched(initialSim, { ctrl: { [k]: input } }),
          pose = rigPose(s);
        useSR22T.setState({ s });
        for (const p of mine) {
          // Static parts need one full audit, moving parts are swept on their control channel.
          if (p.anim ? p.chan && !p.chan.includes(BRIDLES[k].chan) : k !== "pitch" || step !== -100) continue;
          const m = meshOf(p);
          p.anim?.(m, 0);
          const bounds = new THREE.Box3().setFromPoints(vertices(m));
          const triangles = meshTriangles(m).map((t) => ({ t, b: new THREE.Box3().setFromPoints([t.a, t.b, t.c]) }));
          const obb = m.geometry.type === "BoxGeometry" ? solidBox(m) : null;
          if (obb) obb.halfSize.addScalar(0.001);
          for (const stream of streams) {
            audited.add(stream.f.key);
            const required =
              p.name === oxygenNames[0]
                ? 0.01
                : ["static2", "stallWire", "static", "staticL"].includes(stream.f.key)
                  ? 0.005
                  : 0;
            const threshold = stream.r + required;
            if (boundsGap(bounds, stream.bounds) > required) continue;
            // Retained POH actuator anchor and primary overlay have an existing face contact (reviewer deliberately-not-flagged).
            if (p.name === actuatorName("roll") && stream.f.key === "elA") continue;
            for (const segment of stream.segments) {
              if (boundsGap(bounds, segment.bounds) > threshold) continue;
              if (cableKeys.has(stream.f.key)) {
                const terminals = [0, 1]
                  .filter((e) => BRIDLES[k].keys[e] === stream.f.key)
                  .map((e) => V(clampPosition(k, e, pose)));
                const attached = [
                  "Bridle cable clamp",
                  "Bridle cable end fitting",
                  "Bridle clamp spacer",
                  BRIDLES[k].name,
                ].includes(p.name ?? "");
                if (
                  attached &&
                  terminals.some((q) => Math.min(q.distanceTo(segment.a), q.distanceTo(segment.b)) < 0.03)
                )
                  continue;
              }
              let distance = Infinity;
              if (obb && (obb.containsPoint(segment.a) || obb.containsPoint(segment.b))) distance = 0;
              if (p.name === oxygenNames[0]) {
                for (const q of [segment.a, segment.b]) {
                  const dx = Math.abs(q.x - OXY.bottle[0]) - OXY_BOTTLE_LENGTH / 2,
                    dr = Math.hypot(q.y - OXY.bottle[1], q.z - OXY.bottle[2]) - OXY_BOTTLE_RADIUS;
                  if (dx < 0 && dr < 0) distance = 0;
                }
              }
              for (const triangle of triangles) {
                if (boundsGap(triangle.b, segment.bounds) > threshold) continue;
                distance = Math.min(distance, segmentTriangleGap(segment.a, segment.b, triangle.t));
                if (distance < threshold) break;
              }
              if (
                required === 0 &&
                distance < stream.r &&
                obb &&
                !stream.flowTriangles.some((t) => triangleInOBB(t, obb))
              )
                continue;
              expect
                .soft(distance - stream.r, `${p.name} / ${stream.f.key} ${k}=${input} at ${segment.a.toArray()}`)
                .toBeGreaterThanOrEqual(required);
            }
          }
          m.geometry.dispose();
        }
      }
    expect([...audited].sort()).toEqual(rendered.map((f) => f.key).sort());
  }, 15000);

  it("primary cables clear the servo solids and bridle runs except their own clamps (AMM ch. 22-10/27)", () => {
    const mine = [...detail, ...axes.map((k) => one(actuatorName(k))), one("Pitch trim adapter")];
    for (const k of axes)
      for (const input of [-1, -0.5, 0, 0.5, 1]) {
        const s = patched(initialSim, { ctrl: { [k]: input } });
        useSR22T.setState({ s });
        for (const p of mine.filter((p) => !p.chan || p.chan.includes(BRIDLES[k].chan))) {
          if (["Bridle cable clamp", "Bridle cable end fitting", "Bridle clamp spacer"].includes(p.name ?? ""))
            continue;
          const m = meshOf(p);
          p.anim?.(m, 0);
          m.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromPoints(vertices(m));
          const obb = m.geometry.type === "BoxGeometry" ? solidBox(m) : null;
          const tube = m.geometry.type === "TubeGeometry" ? (m.geometry as THREE.TubeGeometry) : null;
          const path = tube
            ? Array.from({ length: 301 }, (_, i) =>
                tube.parameters.path.getPointAt(i / 300).applyMatrix4(m.matrixWorld),
              )
            : null;
          for (const c of CABLES) {
            const q = c.pts
              .slice(1)
              .flatMap((b, i) =>
                Array.from({ length: 81 }, (_, j) =>
                  new THREE.Line3(V(c.pts[i]), V(b)).at(j / 80, new THREE.Vector3()),
                ),
              );
            if (path) {
              const ends = [path[0], path.at(-1)!];
              const hit = path
                .filter((v) => !((p.name ?? "").endsWith("bridle cable") && ends.some((e) => e.distanceTo(v) < 0.03)))
                .find((v) => distanceToCable(v, c.key) < tube!.parameters.radius + 0.005);
              expect(hit, `${p.name} touches ${c.key} at ${hit?.toArray()} (${k}=${input})`).toBeUndefined();
            } else {
              const hit = q.find((v) => (obb ? obb.containsPoint(v) : bb.containsPoint(v)));
              expect(hit, `${p.name} contains ${c.key} at ${hit?.toArray()} (${k}=${input})`).toBeUndefined();
            }
          }
          m.geometry.dispose();
        }
      }
  });
});
