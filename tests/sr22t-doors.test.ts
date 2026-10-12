/** SR22T POH 13772-007 Fig 1-2/7-31/7-26; AMM 13773-002 Rev 7 ch. 52. */
import * as THREE from "three";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { SR22T } from "@/aircraft/sr22t";
import {
  BAG_DOOR,
  BAG_CORNERS,
  BAG_HINGE,
  DOOR_CUT,
  DOOR_HINGE,
  DOOR_HINGE_MOUNTS,
  DOOR_OPENING,
  DOOR_SEAM,
  WIN,
  onSkin,
  doorCutParam,
  doorEdge,
  doorHinge,
  doorParam,
  doorPanelGeo,
  doorPoint,
  doorRotation,
  doorSkin,
  doorWindowGeo,
  fuselageGeo,
  inFus,
  wLE,
  wC,
  wingP,
  type DoorKey,
} from "@/aircraft/sr22t/geometry";
import { CAT } from "@/aircraft/sr22t/parts";
import { ARMREST_SIZE, armrestCentre, strutEnds, strutMount, plainDoorInterior } from "@/aircraft/sr22t/parts/doors";
import { casMessages, initialSim, live, solve, type Sim } from "@/aircraft/sr22t/model";
import { applyDoorCommand, setDoor, useSR22T } from "@/aircraft/sr22t/store";
import { mats } from "@/lib/materials";
import { useView } from "@/lib/view";
import { SYS } from "@/aircraft/sr22t/systems";

const keys: DoorKey[] = ["L", "R", "bag"];
const inside = (polygon: THREE.Vector2[], p: THREE.Vector2) => {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) yes = !yes;
  }
  return yes;
};
const distanceToEdge = (p: THREE.Vector3, loop: THREE.Vector3[]) =>
  Math.min(
    ...loop.map((a, i) => {
      const b = loop[(i + 1) % loop.length],
        d = b.clone().sub(a);
      return p.distanceTo(
        a.clone().addScaledVector(d, THREE.MathUtils.clamp(p.clone().sub(a).dot(d) / d.lengthSq(), 0, 1)),
      );
    }),
  );
const sampleEdge = (key: DoorKey, inset = false) => {
  const poly = inset ? doorEdge(key).map(doorParam) : doorCutParam(key);
  return poly.flatMap((a, i) =>
    Array.from({ length: 20 }, (_, j) => {
      const p = a.clone().lerp(poly[(i + 1) % poly.length], j / 20);
      return doorSkin(p.x, p.y, key === "R" ? 1 : -1);
    }),
  );
};
// Both checks read the same immutable fixed mesh; build it once rather than triangulating
// the complete loft again for the strut raycasts. Dispose only after all readers finish.
let fixedHull: THREE.BufferGeometry | undefined;
const fixedHullGeo = () => (fixedHull ??= fuselageGeo());
afterAll(() => fixedHull?.dispose());
const saved = useSR22T.getState().s;
const savedView = useView.getState();
afterEach(() => {
  useSR22T.setState({ s: saved, E: solve(saved) });
  useView.setState(savedView);
});

describe("SR22T door geometry", () => {
  it("the cabin door opening matches POH Fig 1-2 (PDF p. 15)", () => {
    for (const side of [-1, 1]) {
      const p = DOOR_OPENING(side),
        cut = DOOR_CUT(side);
      expect(Math.abs(Math.hypot(p[1].x - p[2].x, p[1].y - p[2].y) - 0.813)).toBeLessThan(0.025);
      expect(Math.abs(p[2].y - p[3].y)).toBeGreaterThan(0.846 - 0.025);
      expect(Math.abs(p[2].y - p[3].y)).toBeLessThan(0.846 + 0.025);
      // POH 13772-007 Fig 1-2, 1-5 (PDF 15): sill derived from the 32.0-in top
      // plus the drawn edge offsets (~0.41 forward / ~0.29 aft), fitted to the loft.
      // ~35.5 in is not a separately dimensioned sill; 15 mm excludes the former 34-in claim.
      expect(Math.abs(p[0].x - p[3].x - 35.5 * 0.0254)).toBeLessThan(0.015);
      // Straight-edge slopes measured from our 800-dpi Fig 1-2 render; undimensioned drawing estimates.
      expect((p[0].x - p[1].x) / (p[1].y - p[0].y)).toBeCloseTo(0.41, 1);
      expect((p[3].x - p[2].x) / (p[2].y - p[3].y)).toBeCloseTo(0.29, 1);
      expect(p[0].x - p[1].x).toBeGreaterThan(p[3].x - p[2].x + 0.05);
      const height = Math.max(...p.map((v) => v.y)) - Math.min(...p.map((v) => v.y));
      expect(Math.abs(height - 0.848)).toBeLessThan(0.025);
      expect(Math.abs(Math.abs(p[3].z) - Math.abs(p[2].z) - 0.508)).toBeLessThan(0.05);
      for (let i = 0; i < p.length; i++) {
        expect(inside(doorCutParam("L"), doorParam(p[i]))).toBe(true);
        expect(distanceToEdge(p[i], cut)).toBeLessThan(0.05);
      }
    }
    expect(Math.min(...DOOR_SEAM.map(([, y]) => y))).toBeGreaterThan(-0.3);
  });
  it("the fixed strut bracket has a continuous arm to the forward jamb (AMM Fig 52-10-1 sheet 1, PDF 2011)", () => {
    const arms = CAT.parts.filter((p) => p.name === "Gas strut jamb return arm");
    expect(arms).toHaveLength(2);
    for (const [i, side] of [-1, 1].entries()) {
      const anchor = strutMount(side),
        end = strutEnds(side, 0).fixed;
      const loop = doorCutParam(side < 0 ? "L" : "R");
      const q = doorParam(anchor);
      expect(
        Math.min(
          ...loop.map((a, j) =>
            new THREE.Line3(
              new THREE.Vector3(a.x, a.y, 0),
              new THREE.Vector3(loop[(j + 1) % loop.length].x, loop[(j + 1) % loop.length].y, 0),
            )
              .closestPointToPoint(new THREE.Vector3(q.x, q.y, 0), true, new THREE.Vector3())
              .distanceTo(new THREE.Vector3(q.x, q.y, 0)),
          ),
        ),
      ).toBeLessThan(0.05);
      expect(inside(loop, q)).toBe(false);
      expect(anchor.distanceTo(onSkin(anchor.x, anchor.y, side, 1))).toBeLessThan(0.0001);
      const geo = arms[i].geo() as THREE.TubeGeometry;
      // The arm starts on the jamb flange just inside the skin at its anchor, not on the outer surface.
      const foot = geo.parameters.path.getPoint(0);
      expect(foot.distanceTo(anchor)).toBeLessThan(0.01);
      expect(inFus(foot, 0.008)).toBe(true);
      expect(geo.parameters.path.getPoint(1).distanceTo(end)).toBeLessThan(1e-9);
      expect(anchor.distanceTo(end)).toBeGreaterThan(0.1);
      expect(arms[i].parent).toBeUndefined();
      geo.dispose();
    }
  });
  it("solid door interiors omit the exterior texture while exterior faces retain it", () => {
    const material = plainDoorInterior(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
    const shader = { fragmentShader: "#include <map_fragment>", vertexShader: "", uniforms: {} } as Parameters<
      typeof material.onBeforeCompile
    >[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain("#include <map_fragment>");
    expect(shader.fragmentShader).toContain("if (!gl_FrontFacing) diffuseColor = vec4(diffuse, opacity);");
    material.dispose();
  });
  it("door state is appended with unchanged initial closed/latched defaults", () => {
    expect(Object.keys(initialSim).at(-1)).toBe("doors");
    expect(initialSim.doors).toEqual({ L: "latched", R: "latched", bag: "closed", bagLocked: false });
  });
  it("an open door leaves an opening in the fuselage (POH 7-31)", () => {
    const geo = fixedHullGeo(),
      p = geo.attributes.position;
    // Conservative world-space boxes for each cut's entire (x,q) rectangle. Scan all rounded
    // 1-mm loft stations used by doorParam, so the rejection cannot hide a centroid in a cut.
    const cuts = keys.map((key) => {
      const polygon = doorCutParam(key);
      const xmin = Math.min(...polygon.map((v) => v.x)),
        xmax = Math.max(...polygon.map((v) => v.x));
      const qmin = Math.min(...polygon.map((v) => v.y)),
        qmax = Math.max(...polygon.map((v) => v.y));
      const bounds = new THREE.Box3();
      for (let station = Math.floor(xmin * 1000); station <= Math.ceil(xmax * 1000); station++) {
        bounds.expandByPoint(doorSkin(station / 1000, qmin, 1));
        bounds.expandByPoint(doorSkin(station / 1000, qmax, 1));
      }
      bounds.min.x = xmin;
      bounds.max.x = xmax;
      // Membership depends on x/y and side; don't reject a curved triangle's inward chord in z.
      bounds.min.z = key === "R" ? 0 : -Infinity;
      bounds.max.z = key === "R" ? Infinity : 0;
      bounds.expandByScalar(1e-6);
      return { key, polygon, bounds };
    });
    const triangle = new THREE.Triangle(),
      center = new THREE.Vector3(),
      closest = new THREE.Vector3();
    const gaps = (["L", "R"] as const).map((key) => {
      const samples = sampleEdge(key, true).filter((_, i) => i % 20 === 0);
      return {
        key,
        samples,
        distances: samples.map(() => Infinity),
        bounds: new THREE.Box3().setFromPoints(samples).expandByScalar(Math.sqrt(0.015)),
      };
    });
    const intrusions: string[] = [];
    let minArea = Infinity;
    // Reuse vectors, test every triangle's area once, and visit nearby gap candidates in the same pass.
    for (let i = 0; i < p.count; i += 3) {
      triangle.a.fromBufferAttribute(p, i);
      triangle.b.fromBufferAttribute(p, i + 1);
      triangle.c.fromBufferAttribute(p, i + 2);
      minArea = Math.min(minArea, triangle.getArea());
      center
        .copy(triangle.a)
        .add(triangle.b)
        .add(triangle.c)
        .multiplyScalar(1 / 3);
      for (const cut of cuts)
        if (cut.bounds.containsPoint(center) && inside(cut.polygon, doorParam(center)))
          intrusions.push(`${cut.key} triangle ${i}`);
      for (const gap of gaps) {
        if (
          !gap.bounds.containsPoint(triangle.a) &&
          !gap.bounds.containsPoint(triangle.b) &&
          !gap.bounds.containsPoint(triangle.c)
        )
          continue;
        for (let j = 0; j < gap.samples.length; j++) {
          const q = gap.samples[j];
          if (
            triangle.a.distanceToSquared(q) > 0.015 &&
            triangle.b.distanceToSquared(q) > 0.015 &&
            triangle.c.distanceToSquared(q) > 0.015
          )
            continue;
          triangle.closestPointToPoint(q, closest);
          gap.distances[j] = Math.min(gap.distances[j], q.distanceTo(closest));
        }
      }
    }
    expect(intrusions).toEqual([]);
    expect(minArea).toBeGreaterThan(0);
    for (const gap of gaps)
      for (const distance of gap.distances) {
        expect(distance).toBeGreaterThanOrEqual(0.0015);
        expect(distance).toBeLessThanOrEqual(0.0032);
      }
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld();
    for (const key of keys) {
      const poly = doorCutParam(key),
        center = poly.reduce((a, b) => a.add(b), new THREE.Vector2()).divideScalar(poly.length);
      const skin = doorSkin(center.x, center.y, key === "R" ? 1 : -1);
      const side = key === "R" ? 1 : -1;
      const dx = doorSkin(center.x + 0.001, center.y, side).sub(doorSkin(center.x - 0.001, center.y, side));
      const dq = doorSkin(center.x, center.y + 0.001, side).sub(doorSkin(center.x, center.y - 0.001, side));
      const inward = dx.cross(dq).normalize();
      if (inward.z * side > 0) inward.negate();
      const ray = new THREE.Raycaster(skin.clone().addScaledVector(inward, -0.05), inward, 0, Math.abs(skin.z));
      expect(ray.intersectObject(mesh)).toHaveLength(0);
    }
    mesh.material.dispose();
  }, 120000);
  it("closed cabin doors fill the fuselage opening (Fig 52-10-2 PDF 2016)", () => {
    for (const key of ["L", "R"] as const) {
      const edge = sampleEdge(key);
      for (const p of sampleEdge(key, true)) {
        const gap = distanceToEdge(p, edge);
        expect(gap).toBeGreaterThanOrEqual(0.0015);
        expect(gap).toBeLessThanOrEqual(0.0032);
        expect(inside(doorCutParam(key), doorParam(p))).toBe(true);
      }
    }
  });
  it("each cabin door turns about its forward-edge upper and lower hinges (POH 7-31; AMM Fig 52-10-1 PDF 2013)", () => {
    for (const side of [-1, 1]) {
      const key = side < 0 ? "L" : "R",
        hinges = DOOR_HINGE(side);
      const mounts = DOOR_HINGE_MOUNTS(side);
      // The fix uses bracket-mounted pins; mount locations remain at the forward corners.
      const opening = DOOR_OPENING(side);
      expect(mounts.upper.distanceTo(opening[1])).toBeLessThan(0.05);
      expect(mounts.lower.distanceTo(opening[0])).toBeLessThan(0.05);
      // Each pin sits in a pocket ahead of the door corner, inside the skin line (Fig 52-10-1 sheet 3 Details C/D).
      for (const name of ["upper", "lower"] as const) {
        expect(hinges[name].x - mounts[name].x, `${key} ${name} pin ahead of the door`).toBeGreaterThan(0.02);
        expect(hinges[name].distanceTo(mounts[name]), `${key} ${name} pin near its corner`).toBeLessThan(0.15);
        expect(inFus(hinges[name], 0.01), `${key} ${name} pin 10 mm inside the skin`).toBe(true);
      }
      expect(doorHinge(key).axis.distanceTo(hinges.upper.clone().sub(hinges.lower).normalize())).toBeLessThan(1e-10);
      expect(doorPoint(key, hinges.upper, 1).distanceTo(hinges.upper)).toBeLessThan(1e-10);
      expect(doorPoint(key, hinges.lower, 1).distanceTo(hinges.lower)).toBeLessThan(1e-10);
      expect(doorRotation(key, 1).angleTo(new THREE.Quaternion())).toBeCloseTo((70 * Math.PI) / 180);
    }
  });
  it("the whole cabin panel, including its forward edge, clears the hull and wing through the swing (AMM Fig 52-10-1 PDF 2013; 70° approximate)", () => {
    for (const key of ["L", "R"] as const) {
      const geo = doorPanelGeo(key),
        positions = geo.attributes.position;
      const samples = sampleEdge(key, true);
      for (let i = 0; i < positions.count; i++) samples.push(new THREE.Vector3().fromBufferAttribute(positions, i));
      const window = doorWindowGeo(key === "R" ? 1 : -1);
      for (let i = 0; i < window.attributes.position.count; i++)
        samples.push(new THREE.Vector3().fromBufferAttribute(window.attributes.position, i));
      const violations: number[][] = [];
      // No forward-edge exemption: cover every mesh vertex and densely sampled perimeter.
      const { pivot } = doorHinge(key),
        open = new THREE.Vector3();
      for (let step = 1; step <= 24; step++) {
        const rotation = doorRotation(key, step / 24);
        for (const p of samples) {
          open.copy(p).sub(pivot).applyQuaternion(rotation).add(pivot);
          const chord = (wLE(open.z) - open.x) / wC(open.z);
          if (inFus(open, 0.003) || (chord >= 0 && chord <= 1 && open.y <= wingP(open.z, chord, 1).y)) {
            if (violations.length < 10) violations.push([step / 24, ...open.toArray()]);
          }
        }
      }
      expect(violations, `${key} whole panel clearance`).toEqual([]);
      geo.dispose();
      window.dispose();
    }
  });
  it("the baggage opening has a 10.5-in top flat and 5.0-in chamfer drop within its 21 x 20-in outline (POH Fig 1-2 PDF 15)", () => {
    const p = BAG_CORNERS;
    expect(p[2][0] - p[3][0]).toBeCloseTo(10.5 * 0.0254, 4);
    expect(p[2][1] - p[1][1]).toBeCloseTo(5 * 0.0254, 4);
    expect(p[0][0] - p[3][0]).toBeCloseTo(21 * 0.0254, 4);
    expect(p[3][1] - p[4][1]).toBeCloseTo(20 * 0.0254, 4);
  });
  it("the baggage door is left, aft of wing, hinged forward, aft latched and key locked (POH 7-26; Fig 52-30-1 PDF 2055)", () => {
    const center = BAG_DOOR.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(BAG_DOOR.length);
    expect(center.z).toBeLessThan(0);
    expect(center.x).toBeLessThan(wLE(0.35) - wC(0.35));
    const lock = CAT.parts.find((p) => p.name === "Baggage door lock")!;
    expect(lock.parent).toBe("door:bag");
    const geo = lock.geo();
    geo.computeBoundingBox();
    expect(geo.boundingBox!.getCenter(new THREE.Vector3()).x + BAG_HINGE.lower.x).toBeLessThan(BAG_HINGE.lower.x);
    geo.dispose();
    expect(CAT.parts.some((p) => p.name === "Baggage door lanyard")).toBe(true);
    expect(CAT.parts.some((p) => /Baggage.*strut/.test(p.name ?? ""))).toBe(false);
  });
  it("the moving window and aft latches fit the raked cabin outline (POH Fig 1-2 PDF 15; AMM Figs 52-10-6/8 PDF 2037/2046)", () => {
    for (const key of ["L", "R"] as const) {
      const side = key === "R" ? 1 : -1;
      for (const [x, y] of WIN.front) expect(inside(doorCutParam(key), doorParam(onSkin(x, y, side, 1)))).toBe(true);
      for (const part of CAT.partsFor("door:" + key).filter((p) => p.name === "Door latch")) {
        const geo = part.geo();
        geo.computeBoundingBox();
        const center = geo.boundingBox!.getCenter(new THREE.Vector3()).add(doorHinge(key).pivot);
        expect(inside(doorCutParam(key), doorParam(center))).toBe(true);
        geo.dispose();
      }
    }
  });
  it("each cabin door carries its window, seal, handles, lock and two aft latches (AMM ch. 52 figures)", () => {
    for (const key of ["L", "R"] as const) {
      const moving = CAT.partsFor("door:" + key);
      for (const name of [
        "Door window",
        "Door seal",
        "Interior door handle",
        "Exterior door handle",
        "Door lock cylinder",
        "Door armrest",
      ])
        expect(
          moving.some((p) => p.name === name),
          `${key}: ${name}`,
        ).toBe(true);
      expect(moving.filter((p) => p.name === "Door latch")).toHaveLength(2);
    }
    expect(CAT.partsFor().filter((p) => p.name === "Striker pin")).toHaveLength(4);
    expect(CAT.partsFor().filter((p) => p.name === "Door gas strut")).toHaveLength(2);
  });
  it("both locks sit at the aft end and exterior levers pivot forward (AMM Figs 52-10-3/-5, PDF 2027/2031)", () => {
    for (const key of ["L", "R"] as const) {
      const parts = CAT.partsFor("door:" + key);
      const housing = parts.find((p) => p.name === "Exterior handle housing")!;
      const lock = parts.find((p) => p.name === "Door lock cylinder")!;
      const handle = parts.find((p) => p.name === "Exterior door handle")!;
      const h = housing.geo(),
        l = lock.geo(),
        lever = handle.geo();
      h.computeBoundingBox();
      l.computeBoundingBox();
      lever.computeBoundingBox();
      const hb = h.boundingBox!,
        lb = l.boundingBox!;
      expect(lb.min.x).toBeGreaterThanOrEqual(hb.min.x);
      expect(lb.max.x).toBeLessThan(hb.getCenter(new THREE.Vector3()).x);
      expect(lb.getCenter(new THREE.Vector3()).x - hb.min.x).toBeLessThan(0.025);
      expect(handle.pos![0]).toBeGreaterThan(hb.max.x - 0.015);
      expect(handle.pos![0]).toBeLessThanOrEqual(hb.max.x);
      expect(lever.boundingBox!.max.x).toBeCloseTo(0, 6);
      const leverBounds = lever.boundingBox!.clone().translate(new THREE.Vector3(...handle.pos!));
      expect(leverBounds.intersectsBox(lb), `${key} latched lever clears the lock cylinder`).toBe(false);
      expect(leverBounds.min.x - lb.max.x, `${key} aft-end clearance`).toBeGreaterThanOrEqual(0.003);
      const mesh = new THREE.Mesh(lever);
      setDoor({ cabin: key, position: "unlatched" });
      handle.anim!(mesh, 0);
      const grip = new THREE.Vector3(lever.boundingBox!.min.x, 0, 0).applyEuler(mesh.rotation);
      expect(grip.y).toBeGreaterThan(0);
      h.dispose();
      l.dispose();
      lever.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
  it("the interior handles rise when unlatched and nest when latched (AMM 52-10 PDF 2006)", () => {
    for (const key of ["L", "R"] as const) {
      const handle = CAT.partsFor("door:" + key).find((p) => p.name === "Interior door handle")!;
      const mesh = new THREE.Mesh(handle.geo());
      setDoor({ cabin: key, position: "latched" });
      handle.anim!(mesh, 0);
      expect(mesh.rotation.z).toBe(0);
      setDoor({ cabin: key, position: "unlatched" });
      handle.anim!(mesh, 0);
      expect(Math.abs(mesh.rotation.z)).toBeGreaterThan(0.5);
      mesh.geometry.dispose();
    }
  });
  // Closed door, so the door group is at its hinge pivot with no rotation: world = pivot + pos + lever pose.
  const interiorLeverPose = (key: "L" | "R", position: "latched" | "unlatched") => {
    const handle = CAT.partsFor("door:" + key).find((p) => p.name === "Interior door handle")!;
    const mesh = new THREE.Mesh(handle.geo());
    setDoor({ cabin: key, position });
    handle.anim!(mesh, 0);
    mesh.position.fromArray(handle.pos!).add(doorHinge(key).pivot);
    mesh.updateMatrixWorld(true);
    const p = mesh.geometry.attributes.position;
    const points = Array.from({ length: p.count }, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld),
    );
    mesh.geometry.dispose();
    const grip = points.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(points.length);
    return { hub: mesh.position.clone(), grip, points };
  };
  const armrestBox = (side: number) =>
    new THREE.Box3().setFromCenterAndSize(armrestCentre(side), new THREE.Vector3(...ARMREST_SIZE));
  it("each interior lever lies forward of its aft hub, nested on the armrest when latched (AMM Fig 52-10-3 PDF 2027)", () => {
    for (const key of ["L", "R"] as const) {
      const side = key === "L" ? -1 : 1,
        armrest = armrestBox(side);
      const { hub, grip, points } = interiorLeverPose(key, "latched");
      expect(grip.x - hub.x, `${key} grip runs forward of the hub`).toBeGreaterThan(0.05);
      const bottom = Math.min(...points.map((p) => p.y));
      expect(bottom - armrest.max.y, `${key} latched lever seated on the armrest`).toBeGreaterThanOrEqual(0.001);
      expect(bottom - armrest.max.y, `${key} latched lever seated on the armrest`).toBeLessThanOrEqual(0.004);
      for (const p of points) {
        expect(p.x, `${key} lever over the armrest length`).toBeGreaterThanOrEqual(armrest.min.x);
        expect(p.x, `${key} lever over the armrest length`).toBeLessThanOrEqual(armrest.max.x);
        expect(p.z, `${key} lever over the armrest width`).toBeGreaterThanOrEqual(armrest.min.z);
        expect(p.z, `${key} lever over the armrest width`).toBeLessThanOrEqual(armrest.max.z);
      }
    }
  });
  it("unlatching swings each interior lever's forward end up out of the armrest (AMM 52-10 PDF 2006; Fig 52-10-3 PDF 2027)", () => {
    for (const key of ["L", "R"] as const) {
      const latched = interiorLeverPose(key, "latched"),
        unlatched = interiorLeverPose(key, "unlatched");
      expect(unlatched.hub.distanceTo(latched.hub), `${key} hub stays put`).toBeLessThan(1e-9);
      const tip = (pose: typeof latched) => pose.points.reduce((a, b) => (b.x > a.x ? b : a));
      expect(tip(unlatched).y - tip(latched).y, `${key} forward end rises`).toBeGreaterThan(0.05);
      expect(unlatched.grip.y - latched.grip.y, `${key} grip rises`).toBeGreaterThan(0.04);
      expect(unlatched.grip.x - unlatched.hub.x, `${key} grip still forward of the hub`).toBeGreaterThan(0);
    }
  });
  it("interior levers clear the armrest and door panel latched and unlatched (AMM Fig 52-10-3 PDF 2027)", () => {
    for (const key of ["L", "R"] as const) {
      const side = key === "L" ? -1 : 1,
        armrest = armrestBox(side).expandByScalar(0.001),
        panel = new THREE.Mesh(doorPanelGeo(key), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      for (const position of ["latched", "unlatched"] as const) {
        for (const p of interiorLeverPose(key, position).points) {
          expect(armrest.containsPoint(p), `${key} ${position} lever vertex inside armrest`).toBe(false);
          // Outboard of the lever is the door skin; the lever stays at least 10 mm inboard of it.
          const hit = new THREE.Raycaster(p, new THREE.Vector3(0, 0, side), 0, 0.5).intersectObject(panel)[0];
          expect(hit, `${key} ${position} door panel outboard of lever`).toBeDefined();
          expect(hit.distance, `${key} ${position} lever-to-door clearance`).toBeGreaterThan(0.01);
        }
      }
      panel.geometry.dispose();
    }
  });
  it("gas struts extend monotonically on opening and stay in the aperture without crossing fixed skin (POH 7-31; AMM Fig 52-10-1 PDF 2011)", () => {
    const mesh = new THREE.Mesh(fixedHullGeo(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld();
    for (const side of [-1, 1]) {
      const key = side < 0 ? "L" : "R",
        shut = strutEnds(side, 0);
      expect(inside(doorCutParam(key), doorParam(shut.fixed))).toBe(true);
      expect(inside(doorCutParam(key), doorParam(shut.moving))).toBe(true);
      expect(shut.fixed.y).toBeGreaterThan(shut.moving.y);
      let previous = shut.fixed.distanceTo(shut.moving);
      for (let step = 1; step <= 70; step++) {
        const end = strutEnds(side, step / 70);
        const length = end.fixed.distanceTo(end.moving);
        expect(length).toBeGreaterThan(previous);
        expect(end.fixed.distanceTo(shut.fixed)).toBe(0);
        expect(end.moving.distanceTo(doorPoint(key, shut.moving, step / 70))).toBeLessThan(1e-10);
        previous = length;
      }
      for (const fraction of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
        const end = strutEnds(side, fraction),
          direction = end.moving.clone().sub(end.fixed);
        const length = direction.length();
        expect(
          new THREE.Raycaster(end.fixed, direction.normalize(), 0, length).intersectObject(mesh),
          `${key} strut at ${fraction}`,
        ).toHaveLength(0);
      }
    }
    // Rendered barrel is rigid; exposed piston grows with the end-to-end extension.
    for (const key of ["L", "R"] as const) {
      const savedFraction = live.doors[key];
      const all = CAT.partsFor();
      const index = key === "L" ? 0 : 1;
      const barrelPart = all.filter((p) => p.name === "Door gas strut")[index];
      const pistonPart = all.filter((p) => p.name === "Gas strut piston")[index];
      const barrel = new THREE.Mesh(barrelPart.geo()),
        piston = new THREE.Mesh(pistonPart.geo());
      try {
        live.doors[key] = 0;
        barrelPart.anim!(barrel, 0);
        pistonPart.anim!(piston, 0);
        const closedPiston = piston.scale.y;
        expect(barrel.scale.y).toBeCloseTo(0.27);
        live.doors[key] = 1;
        barrelPart.anim!(barrel, 0);
        pistonPart.anim!(piston, 0);
        expect(barrel.scale.y).toBeCloseTo(0.27);
        expect(piston.scale.y).toBeGreaterThan(closedPiston);
      } finally {
        live.doors[key] = savedFraction;
        barrel.geometry.dispose();
        piston.geometry.dispose();
      }
    }
    mesh.material.dispose();
  }, 20000);
});

describe("SR22T door operation", () => {
  it("tap-to-locate keeps the highlight material on solid cabin/baggage doors and windows across animation frames", () => {
    const names = ["Left cabin door", "Right cabin door", "Baggage door", "Door window"];
    for (const part of CAT.parts.filter((p) => names.includes(p.name ?? ""))) {
      const highlight = mats(part.color!).hi;
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), highlight);
      useView.setState({ xray: false, focus: part.name! });
      for (let frame = 0; frame < 5; frame++) {
        part.anim!(mesh, frame / 60);
        expect(mesh.material).toBe(highlight);
      }
      mesh.geometry.dispose();
    }
  });

  it("lights.door follows opening, unlatching and latching either cabin door (POH 7-60)", () => {
    const s = structuredClone(initialSim);
    for (const cabin of ["L", "R"] as const) {
      applyDoorCommand(s, { cabin, position: "unlatched" });
      expect(s.lights.door).toBe(true);
      applyDoorCommand(s, { cabin, position: "open" });
      expect(s.lights.door).toBe(true);
      applyDoorCommand(s, { cabin, position: "latched" });
      expect(s.lights.door).toBe(false);
    }
    applyDoorCommand(s, { cabin: "L", position: "open" });
    applyDoorCommand(s, { cabin: "R", position: "open" });
    applyDoorCommand(s, { cabin: "L", position: "latched" });
    expect(s.lights.door).toBe(true);
    applyDoorCommand(s, { cabin: "R", position: "latched" });
    expect(s.lights.door).toBe(false);
    applyDoorCommand(s, { cabin: "R", position: "open" });
    applyDoorCommand(s, { cabinLights: false });
    expect(s.doors.L).toBe("latched");
    expect(s.doors.R).toBe("latched");
    applyDoorCommand(s, { cabinLights: true });
    expect(s.doors.L).toBe("open");
    expect(s.lights.door).toBe(true);
    setDoor({ cabin: "L", position: "open" });
    expect(useSR22T.getState().s.lights.door).toBe(true);
    expect(useSR22T.getState().E).toEqual(solve(useSR22T.getState().s));
  });
  it("a locked baggage door stays closed and an open door cannot lock (POH 7-26)", () => {
    const s: Sim = structuredClone(initialSim);
    applyDoorCommand(s, { bagLocked: true });
    applyDoorCommand(s, { baggage: "open" });
    expect(s.doors.bag).toBe("closed");
    expect(s.lights.bag).toBe(false);
    applyDoorCommand(s, { bagLocked: false });
    applyDoorCommand(s, { baggage: "open" });
    expect(s.doors.bag).toBe("open");
    expect(s.lights.bag).toBe(true);
    applyDoorCommand(s, { bagLocked: true });
    expect(s.doors.bagLocked).toBe(false);
    applyDoorCommand(s, { baggage: "closed" });
    expect(s.lights.bag).toBe(false);
  });
  it("the doors rail follows airframe with page 7-31 and links to cabin safety", () => {
    expect(SYS[SYS.findIndex((s) => s.id === "airframe") + 1]).toMatchObject({ id: "doors", pg: "7-31" });
    expect(SR22T.panels.doors).toBeDefined();
    const html = renderToStaticMarkup(createElement(SR22T.panels.doors!));
    expect(html).toContain("Cabin &amp; safety");
    expect(html).toContain("Airplane Control … MAINTAIN");
    expect(html).toContain("1-3 inches open in flight");
    expect(renderToStaticMarkup(createElement(SR22T.panels.cabin!))).toContain("Door operation and latches");
    const s = structuredClone(initialSim);
    applyDoorCommand(s, { cabin: "L", position: "open" });
    expect(casMessages(s, solve(s)).filter(([, text]) => /DOOR/.test(text))).toHaveLength(0);
  });
});
