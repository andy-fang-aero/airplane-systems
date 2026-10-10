/** Rear occupants: POH 13772-007 Fig 6-3, 6-6; cable bulkhead: AMM 13773-002 Rev 7 Fig 27-20-5 (PDF 1005). */
import { Box3, Euler, Group, Matrix4, Mesh, Quaternion, Vector3, type TubeGeometry } from "three";
import { OBB } from "three/examples/jsm/math/OBB.js";
import { describe, expect, it } from "vitest";
import { curveOf } from "@/lib/geometry";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { doorHinge, doorRotation, inFus, type DoorKey } from "@/aircraft/sr22t/geometry";
import { CAT, NOSE_GEAR, NOSE_CASTER, YOKE_X, YOKE_Y, YOKES, surfacePivot } from "@/aircraft/sr22t/parts";
import { REAR_SEAT } from "@/aircraft/sr22t/parts/cabin";
import { fsX, PULLEYS, ETT, CARR, AIL_SECTOR, RUD_HORN, rigPose } from "@/aircraft/sr22t/rig";
import { CYLS, PROP, cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { initialSim } from "@/aircraft/sr22t/model";
import type { Vec3 } from "@/lib/math";
import type { PartSpec } from "@/lib/catalogue";

const rear = CAT.parts.filter((p) => p.name?.startsWith("Rear seat"));
const named = (name: string) => CAT.parts.filter((p) => p.name === name);
const cushions = [named("Rear seat (2+1 bench)")[0], named("Rear seat")[0]];
// Every solid whose world placement changed when the rear seats were corrected.
const moved = [
  ...rear,
  ...named("Convenience system controller"),
  ...named("Stall warning computer"),
  ...named("Traffic antenna, bottom (optional)"),
  ...named("Reading light").slice(2),
  ...named("Reading light push button").slice(2),
];
/** Neutral transforms from ControlRig.tsx / Airplane.tsx. Unknown parents fail rather than silently disappearing. */
const groupMatrix = (parent?: string) => {
  let pos: Vec3 = [0, 0, 0],
    rot: Vec3 = [0, 0, 0];
  const pose = rigPose(initialSim);
  if (!parent) return new Matrix4();
  if (parent.startsWith("door:")) {
    // Same hinge-relative transform as catalogue door parts and Airplane.tsx, closed at fraction 0.
    // Geometry owns the source-derived pivots (AMM 13773-002 Rev 7 ch. 52); no copied coordinates.
    const key = parent.slice(5) as DoorKey;
    expect(["L", "R", "bag"], parent).toContain(key);
    return new Matrix4().compose(doorHinge(key).pivot, doorRotation(key, 0), new Vector3(1, 1, 1));
  }
  if (parent.startsWith("rig:pul:")) {
    const key = parent.slice(8),
      pulley = PULLEYS[key];
    expect(pulley, parent).toBeDefined();
    pos = pulley.c;
    rot[{ x: 0, y: 1, z: 2 }[pulley.axis]] = pose.pulley[key];
  } else if (parent === "rig:ett") {
    pos = ETT.c;
    rot[2] = pose.ett;
  } else if (parent === "rig:carr:L" || parent === "rig:carr:R") {
    pos = [CARR.x, CARR.y, parent.endsWith("L") ? -CARR.z : CARR.z];
    rot[0] = pose.carr;
  } else if (parent === "rig:ailSector") {
    pos = AIL_SECTOR.c;
    rot[0] = pose.ailSector;
  } else if (parent === "rig:rudHorn") {
    pos = RUD_HORN.c;
    rot[1] = pose.rudHorn;
  } else if (parent === "rig:pedL" || parent === "rig:pedR") pos[0] = parent.endsWith("L") ? -pose.pedal : pose.pedal;
  else if (parent.startsWith("surf:")) pos = surfacePivot(parent.slice(5));
  else if (parent === "noseGear") pos = NOSE_GEAR;
  else if (parent === "caster") pos = NOSE_GEAR.map((x, i) => x + NOSE_CASTER[i]) as Vec3;
  else if (parent.startsWith("cyl:")) {
    const cylinder = CYLS.find((c) => c.n === Number(parent.slice(4)));
    expect(cylinder, parent).toBeDefined();
    pos = cylOrigin(cylinder!);
  } else if (parent.startsWith("blade:")) {
    pos = PROP;
    rot[0] = (Number(parent.slice(6)) * Math.PI * 2) / 3;
  } else if (parent.startsWith("yoke:") || parent.startsWith("grip:")) {
    const yoke = YOKES.find((y) => y.side === parent.split(":")[1]);
    expect(yoke, parent).toBeDefined();
    pos = [YOKE_X, YOKE_Y, yoke!.z];
  } else throw new Error(`Unresolved part parent: ${parent}`);
  return new Matrix4().compose(
    new Vector3(...pos),
    new Quaternion().setFromEuler(new Euler(...rot)),
    new Vector3(1, 1, 1),
  );
};
const meshOf = (p: PartSpec) => {
  const m = new Mesh(p.geo());
  m.position.set(...(p.pos ?? [0, 0, 0]));
  m.rotation.set(...(p.rot ?? [0, 0, 0]));
  m.scale.set(...(p.scale ?? [1, 1, 1]));
  const group = new Group();
  group.applyMatrix4(groupMatrix(p.parent));
  group.add(m);
  group.updateMatrixWorld(true);
  return m;
};
const oriented = (p: PartSpec) => {
  const m = meshOf(p);
  m.geometry.computeBoundingBox();
  const b = new OBB().fromBox3(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
  m.geometry.dispose();
  return b;
};
const bounds = (p: PartSpec) => {
  const m = meshOf(p);
  const b = new Box3().setFromObject(m, true);
  m.geometry.dispose();
  return b;
};
/** Bound individual curved-tube strips, rather than the empty interior of a harness or hoop. */
const boxes = (p: PartSpec) => {
  const m = meshOf(p);
  try {
    if (m.geometry.type !== "TubeGeometry") return [oriented(p)];
    const g = m.geometry as TubeGeometry;
    const a = g.getAttribute("position");
    const { tubularSegments, radialSegments } = g.parameters;
    return Array.from({ length: tubularSegments }, (_, i) => {
      const points = [];
      for (let ring = i; ring <= i + 1; ring++)
        for (let j = 0; j <= radialSegments; j++)
          points.push(
            new Vector3().fromBufferAttribute(a, ring * (radialSegments + 1) + j).applyMatrix4(m.matrixWorld),
          );
      return new OBB().fromBox3(new Box3().setFromPoints(points));
    });
  } finally {
    m.geometry.dispose();
  }
};

describe("SR22T rear passenger station", () => {
  it("pins the occupant reference at FS 180, inside both cushions (POH Fig 6-3, 6-6)", () => {
    expect(rear).toHaveLength(4);
    // Independent inverse of the published model station scale; 39.37 is rounded inches/metre.
    expect(100 + (2.61 - REAR_SEAT.referenceX) * 39.37).toBeCloseTo(180, 3);
    for (const p of cushions) {
      const b = bounds(p);
      expect(REAR_SEAT.referenceX).toBeGreaterThan(b.min.x);
      expect(REAR_SEAT.referenceX).toBeLessThan(b.max.x);
      expect(p.pos![0] - REAR_SEAT.cushionOffset).toBeCloseTo(REAR_SEAT.referenceX, 8);
    }
  });

  it("pins seat-derived controller and CF3R computer anchors (POH Fig 7-20 item 15, 7-88; AMM Fig 27-31-2 Detail A, PDF p. 1044)", () => {
    // The cited figures are undimensioned; these are explicit model clearance offsets.
    const x = cushions[1].pos![0];
    expect(named("Convenience system controller")[0].pos).toEqual([x, -0.58, 0.17]);
    expect(named("Stall warning computer")[0].pos).toEqual([x + 0.2, -0.58, 0.12]);
    expect(moved).toHaveLength(11);
  });

  it("keeps the entire reclined back ahead of FS 186 (AMM Fig 27-20-5, PDF p. 1005)", () => {
    for (const p of rear) expect(bounds(p).min.x, `${p.name} aft edge`).toBeGreaterThan(fsX(186));
  });

  it("clears the FS 186 cable gang, CAPS routing and cabin solids in world coordinates (AMM Fig 27-20-5; schematic geometry)", () => {
    expect(CAT.parts.filter((p) => p.name === "Rudder/elevator pulley gang bracket")).toHaveLength(1);
    for (const pulley of [PULLEYS.em, PULLEYS.rm]) {
      const centre = new Vector3(...pulley.c);
      for (const seat of rear)
        expect(oriented(seat).clampPoint(centre, new Vector3()).distanceTo(centre)).toBeGreaterThan(pulley.r);
    }
    const cache = new Map<PartSpec, OBB[]>();
    const bs = (p: PartSpec) => {
      if (!cache.has(p)) cache.set(p, boxes(p));
      return cache.get(p)!;
    };
    // No parent filter: pulleys, sectors, pedals and every other catalogue solid use world transforms.
    for (const target of moved) {
      const tb = bs(target).map((b) => {
        const copy = b.clone();
        copy.halfSize.addScalar(-1e-6);
        return copy;
      });
      for (const other of CAT.parts) {
        if (other === target) continue;
        // A seat's back is joined to its own cushion by design (POH 7-28).
        if (rear.includes(target) && rear.includes(other) && target.name === other.name) continue;
        expect(
          tb.some((b) => bs(other).some((ob) => b.intersectsOBB(ob))),
          `${target.name} / ${other.name ?? other.id} (${other.parent ?? "fixed"})`,
        ).toBe(false);
      }
    }
  }, 120000);

  it("keeps moved interior parts inside the skin and all moved solids clear of flows (POH 7-28; approximate routes)", () => {
    for (const seat of moved.filter((p) => !p.ext)) {
      const m = meshOf(seat);
      try {
        const a = m.geometry.getAttribute("position");
        for (let i = 0; i < a.count; i++)
          expect(inFus(new Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld)), seat.name).toBe(true);
      } finally {
        m.geometry.dispose();
      }
    }
    for (const seat of moved) {
      const b = oriented(seat);
      for (const f of FLOWS) {
        const curve = curveOf(f.pts, f.tension ?? 0.3);
        // Same interpolant as the renderer, at most 5 mm apart. The half-step margin covers points between samples.
        const n = Math.ceil(curve.getLength() / 0.005);
        for (let i = 0; i <= n; i++) {
          const point = curve.getPointAt(i / n);
          const distance = b.clampPoint(point, new Vector3()).distanceTo(point);
          const clearance = (f.r ?? 0.012) + 0.0025;
          // Only the intended wire-to-case terminal contact is allowed (AMM Fig 27-31-2, PDF p. 1044).
          if (seat.name === "Stall warning computer" && f.key === "stallWire") {
            const endpoint = curve.getPointAt(1);
            expect(b.clampPoint(endpoint, new Vector3()).distanceTo(endpoint)).toBeLessThan(1e-8);
            expect(b.containsPoint(endpoint.clone().add(new Vector3(0, 0.001, 0)))).toBe(false);
            if (point.distanceTo(endpoint) <= clearance) continue;
          }
          expect(distance, `${seat.name} / ${f.key}`).toBeGreaterThan(clearance);
        }
      }
    }
  });
});
