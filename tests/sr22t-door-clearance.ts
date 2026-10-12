// Original clearance audits moved intact; geometry and tolerances are unchanged.
/** AMM 13773-002 Rev 7 Fig 52-10-1 (PDF 2011); POH 13772-007 Fig 1-2 (PDF 15).
 * Illustrative geometry clearance, not an aircraft installation tolerance. */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
// Direct test dependency, pinned to 0.8.3 in devDependencies.
import { MeshBVH } from "three-mesh-bvh";
import {
  TubeGeometry,
  DoubleSide,
  Euler,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";
import { curveOf } from "@/lib/geometry";
import { FLOWS } from "@/aircraft/sr22t/flows";
import type { PartSpec } from "@/lib/catalogue";
import { CAT, CYLS, cylOrigin, PROP, NOSE_GEAR, NOSE_CASTER, YOKES, YOKE_X, YOKE_Y } from "@/aircraft/sr22t/parts";
import { ETT, CARR, AIL_SECTOR, RUD_HORN, PULLEYS, rigPose } from "@/aircraft/sr22t/rig";
import { doorHinge, doorRotation } from "@/aircraft/sr22t/geometry";
import { live, initialSim } from "@/aircraft/sr22t/model";
// The installed BVH supports indirect indexing; its older declarations omit that option.
const BVH_OPTIONS = { indirect: true, setBoundingBox: true };
const material = new MeshBasicMaterial({ side: DoubleSide });
const solid = (p: PartSpec, closed = !p.parent?.startsWith("door:")) => {
  const g = p.geo();
  g.applyMatrix4(
    new Matrix4().compose(
      new Vector3(...(p.pos ?? [0, 0, 0])),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      new Vector3(...(p.scale ?? [1, 1, 1])),
    ),
  );
  if (p.parent?.startsWith("door:")) {
    const key = p.parent.slice(5) as "L" | "R" | "bag";
    const pivot = doorHinge(key).pivot;
    g.applyQuaternion(doorRotation(key, live.doors[key]));
    g.translate(pivot.x, pivot.y, pivot.z);
  }
  // Other moving groups are placed at their neutral controls, matching Airplane/ControlRig.
  if (p.parent && !p.parent.startsWith("door:")) {
    const pose = rigPose(initialSim);
    const pulley = p.parent.startsWith("rig:pul:") ? PULLEYS[p.parent.slice(8)] : undefined;
    const cylinder = CYLS.find((c) => p.parent === `cyl:${c.n}`);
    const surface = CAT.surfaces.find((sf) => p.parent === `surf:${sf.key}`);
    const yoke = YOKES.find((y) => p.parent === `yoke:${y.side}` || p.parent === `grip:${y.side}`);
    if (cylinder) g.translate(...cylOrigin(cylinder));
    else if (surface) g.translate(...surface.pivot);
    else if (yoke) g.translate(YOKE_X, YOKE_Y, yoke.z);
    else if (pulley) {
      const axis = new Vector3(pulley.axis === "x" ? 1 : 0, pulley.axis === "y" ? 1 : 0, pulley.axis === "z" ? 1 : 0);
      g.applyQuaternion(new Quaternion().setFromAxisAngle(axis, pose.pulley[p.parent.slice(8)]));
      g.translate(...pulley.c);
    } else if (p.parent === "rig:ett") {
      g.rotateZ(pose.ett);
      g.translate(...ETT.c);
    } else if (p.parent === "rig:ailSector") {
      g.rotateX(pose.ailSector);
      g.translate(...AIL_SECTOR.c);
    } else if (p.parent === "rig:rudHorn") {
      g.rotateY(pose.rudHorn);
      g.translate(...RUD_HORN.c);
    } else if (p.parent.startsWith("rig:carr:")) {
      g.rotateX(pose.carr);
      g.translate(CARR.x, CARR.y, p.parent.endsWith("L") ? -CARR.z : CARR.z);
    } else if (p.parent === "rig:pedL") g.translate(-pose.pedal, 0, 0);
    else if (p.parent === "rig:pedR") g.translate(pose.pedal, 0, 0);
    else if (p.parent === "noseGear") g.translate(...NOSE_GEAR);
    else if (p.parent === "caster") g.translate(...NOSE_CASTER).translate(...NOSE_GEAR);
    else if (p.parent.startsWith("blade:")) {
      g.rotateX((Number(p.parent.slice(6)) * Math.PI * 2) / 3);
      g.translate(...PROP);
    } else throw new Error(`Unplaced catalogue parent ${p.parent}`);
  }
  g.computeBoundingBox();
  let bvh: MeshBVH | undefined;
  return {
    p,
    g,
    closed,
    box: g.boundingBox!.clone(),
    mesh: new Mesh(g, material),
    // Pair/edge AABBs reject disjoint meshes before any exact BVH query.
    get bvh() {
      return (bvh ??= new MeshBVH(g, BVH_OPTIONS));
    },
  };
};

// Only the arm's first 10 mm may dock into its supporting skin; every other contact fails.
// 8-mm illustrative arm radius plus mesh tolerance, AMM Fig 52-10-1 PDF 2011.
const atMount = (a: ReturnType<typeof solid>, b: ReturnType<typeof solid>, point: Vector3) => {
  const arm = [a, b].find((s) => s.p.name === "Gas strut jamb return arm");
  if (!arm || ![a, b].some((s) => s.p.name === "Fuselage")) return false;
  return point.distanceTo((arm.g as TubeGeometry).parameters.path.getPoint(0)) <= 0.01;
};

// A tube's whole AABB covers empty space between its bends. Test actual triangle
// edges in both directions, rather than treating that entire space as solid.
const edgeCrosses = (a: ReturnType<typeof solid>, b: ReturnType<typeof solid>) => {
  const position = a.g.getAttribute("position"),
    index = a.g.index;
  // A BVH node encloses all of its triangles. Disjoint nodes cannot contain
  // an edge crossing the target AABB; retain every edge of every candidate face.
  const faces: number[] = [];
  a.bvh.shapecast({
    intersectsBounds: (box) => box.intersectsBox(b.box),
    intersectsTriangle: (_triangle, triangleIndex) => {
      faces.push(triangleIndex * 3);
      return false;
    },
  });
  faces.sort((a, b) => a - b);
  const ray = new Raycaster(),
    start = new Vector3(),
    end = new Vector3();
  for (const i of faces) {
    for (let j = 0; j < 3; j++) {
      start.fromBufferAttribute(position, index ? index.getX(i + j) : i + j);
      end.fromBufferAttribute(position, index ? index.getX(i + ((j + 1) % 3)) : i + ((j + 1) % 3));
      if (!new THREE.Box3().setFromPoints([start, end]).intersectsBox(b.box)) continue;
      const direction = end.clone().sub(start),
        length = direction.length();
      if (length < 0.00001) continue;
      ray.set(start, direction.normalize());
      ray.near = 0.00001;
      ray.far = length - 0.00001;
      if (b.bvh.raycast(ray.ray, DoubleSide, ray.near, ray.far).some((h) => !atMount(a, b, h.point))) return true;
    }
  }
  return false;
};

// Also catch complete containment (closed solids have an odd number of exits).
const inside = (point: Vector3, s: ReturnType<typeof solid>) => {
  if (!s.closed || !s.box.containsPoint(point)) return false;
  const hits = s.bvh
    .raycast(new THREE.Ray(point, new Vector3(0.137, 0.419, 1).normalize()), DoubleSide)
    .sort((a, b) => a.distance - b.distance);
  if (hits.some((h) => h.distance < 0.00001)) return false;
  const exits = hits.filter((h, i) => i === 0 || Math.abs(h.distance - hits[i - 1].distance) > 0.00001);
  return exits.length % 2 === 1;
};
const intersects = (a: ReturnType<typeof solid>, b: ReturnType<typeof solid>) => {
  if (!a.box.clone().expandByScalar(-0.00001).intersectsBox(b.box.clone().expandByScalar(-0.00001))) return false;
  return (
    edgeCrosses(a, b) ||
    edgeCrosses(b, a) ||
    inside(new Vector3().fromBufferAttribute(a.g.getAttribute("position"), 0), b) ||
    // Door skins are open sheets: parity cannot define an interior volume for them.
    (!a.p.parent?.startsWith("door:") && inside(new Vector3().fromBufferAttribute(b.g.getAttribute("position"), 0), a))
  );
};
export const auditDoorClearance = (fractions: number[]) => {
  describe("SR22T door follow-up clearance", () => {
    it("jamb arms, opening panels and struts clear every other-system solid and rendered flow tube through opening", () => {
      const saved = { ...live.doors };
      const fixed = CAT.parts.filter((p) => !p.sys.includes("doors")).map((p) => solid(p));
      const surfaces = CAT.surfaces.map((sf) =>
        solid({ id: sf.key, name: sf.name, sys: sf.sys, geo: sf.geo, pos: sf.pivot }, false),
      );
      const shells = CAT.shells.map((sh) => solid({ id: sh.id, name: sh.name, sys: [], geo: sh.geo }, false));
      const tubes = FLOWS.filter((f) => f.tube !== false).map((f) => {
        const curve = curveOf(f.pts, f.tension ?? 0.3);
        return solid({
          id: f.key,
          name: `flow:${f.key}`,
          sys: f.sys,
          geo: () => new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
        });
      });
      expect(fixed.length).toBeGreaterThan(100);
      expect(tubes.length).toBe(FLOWS.filter((f) => f.tube !== false).length);
      const changed = CAT.parts.filter((p) =>
        [
          "Gas strut jamb return arm",
          "Left cabin door",
          "Right cabin door",
          "Door gas strut",
          "Gas strut piston",
        ].includes(p.name ?? ""),
      );
      // The arm must also clear its own door assembly, except its fixed bracket/ball mating pair.
      const doorHardware = CAT.parts.filter(
        (p) =>
          p.sys.includes("doors") &&
          !changed.includes(p) &&
          !["Gas strut forward bracket", "Gas strut forward ball fitting"].includes(p.name ?? ""),
      );
      expect(changed).toHaveLength(8);
      // Negative controls prove the collision oracle catches both a solid and a rendered pipe.
      const arm = solid(changed.find((p) => p.name === "Gas strut jamb return arm")!);
      const center = (arm.g as TubeGeometry).parameters.path.getPoint(0.5);
      const obstruction = solid({
        id: "test-box",
        sys: [],
        geo: () => new THREE.BoxGeometry(0.02, 0.02, 0.02),
        pos: center.toArray() as [number, number, number],
      });
      const pipe = solid({
        id: "test-pipe",
        sys: [],
        geo: () =>
          new TubeGeometry(
            curveOf([center.clone().add(new Vector3(0, -0.04, 0)), center.clone().add(new Vector3(0, 0.04, 0))], 0.3),
            24,
            0.012,
            6,
            false,
          ),
      });
      try {
        expect(intersects(arm, obstruction)).toBe(true);
        expect(intersects(arm, pipe)).toBe(true);
      } finally {
        [arm, obstruction, pipe].forEach((s) => s.g.dispose());
      }
      const hits = new Set<string>();
      try {
        for (const fraction of fractions) {
          live.doors.L = live.doors.R = fraction;
          const moving = changed.map((p) => {
            if (p.name === "Door gas strut" || p.name === "Gas strut piston") {
              const mesh = new THREE.Mesh(p.geo());
              p.anim!(mesh, 0);
              mesh.updateMatrix();
              const g = mesh.geometry.applyMatrix4(mesh.matrix);
              g.computeBoundingBox();
              let bvh: MeshBVH | undefined;
              return {
                p,
                g,
                closed: true,
                box: g.boundingBox!.clone(),
                mesh: new Mesh(g, material),
                get bvh() {
                  return (bvh ??= new MeshBVH(g, BVH_OPTIONS));
                },
              };
            }
            return solid(p);
          });
          try {
            for (const arm of moving.filter((s) => s.p.name === "Gas strut jamb return arm")) {
              for (const panel of moving.filter((s) => s.p.parent?.startsWith("door:"))) {
                if (intersects(arm, panel)) hits.add(`${arm.p.name} / ${panel.p.name} at ${fraction}`);
              }
              for (const part of doorHardware) {
                const hardware = solid(part);
                try {
                  if (intersects(arm, hardware)) hits.add(`${arm.p.name} / ${part.name} at ${fraction}`);
                } finally {
                  hardware.g.dispose();
                }
              }
            }
            for (const a of moving)
              for (const b of [...fixed, ...surfaces, ...shells, ...tubes]) {
                if (intersects(a, b)) hits.add(`${a.p.name} / ${b.p.name ?? b.p.id} at ${fraction}`);
              }
          } finally {
            moving.forEach((s) => s.g.dispose());
          }
        }
        expect([...hits]).toEqual([]);
      } finally {
        Object.assign(live.doors, saved);
        [...fixed, ...surfaces, ...shells, ...tubes].forEach((s) => s.g.dispose());
        material.dispose();
      }
    }, 120000);
  });
};

export { solid as doorSolid, intersects as doorIntersects };
