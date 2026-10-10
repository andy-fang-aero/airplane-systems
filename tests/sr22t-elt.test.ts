/** ELT installation: POH 13772-007 7-91–7-92; AMM 13773-002 Rev 7 Fig 25-60-1, PDF 912–913. */
import * as THREE from "three";
import { expect, it } from "vitest";
import {
  CAT,
  NOSE_GEAR,
  NOSE_CASTER,
  PROP,
  CYLS,
  cylOrigin,
  YOKES,
  YOKE_X,
  YOKE_Y,
  ELT_POS,
  ELT_SHELF,
  ELT_GROMMET,
  ELT_RCPI,
  ELT_ANTENNA_BASE,
  ELT_ANTENNA_FEED,
  ELT_BUZZER,
  ELT_ANTENNA_JACK,
  ELT_REMOTE_JACK,
  ELT_RCPI_JACK,
  ELT_ANTENNA_CABLE,
  ELT_REMOTE_CABLE,
} from "@/aircraft/sr22t/parts";
import { ELT_RCPI_SIZE, ELT_REMOTE_FLOOR_Y, ELT_CLAMP, eltRemoteCable } from "@/aircraft/sr22t/parts/cabin";
import { doorHinge, inFus, type DoorKey } from "@/aircraft/sr22t/geometry";
import { ETT, CARR, AIL_SECTOR, RUD_HORN, PULLEYS } from "@/aircraft/sr22t/rig";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { curveOf } from "@/lib/geometry";
import type { PartSpec } from "@/lib/catalogue";
const only = (name: string) => {
  const parts = CAT.parts.filter((p) => p.name === name);
  expect(parts, name).toHaveLength(1);
  return parts[0];
};
const v = (p: [number, number, number] | THREE.Vector3) =>
  p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(...p);
// Convex shelf outline in its x/z plane (AMM Fig 25-60-1 item 9, PDF 912).
// Independent polygon check: every circle is inside each edge, including the tapered edge.
const expectShelfFootprint = (center: [number, number, number], radius: number, margin: number) => {
  const polygon = [
    [-0.1, -0.08],
    [0.14, -0.08],
    [0.14, 0.08],
    [-0.1, 0.035],
  ];
  const x = center[0] - ELT_SHELF[0],
    z = center[2] - ELT_SHELF[2];
  polygon.forEach(([ax, az], i) => {
    const [bx, bz] = polygon[(i + 1) % polygon.length];
    const distance = ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / Math.hypot(bx - ax, bz - az);
    expect(distance, `shelf edge ${i}: circle radius ${radius}`).toBeGreaterThanOrEqual(radius + margin);
  });
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
    origin = cylOrigin(c);
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

it("transmitter and RCPI retain their POH locations (POH 7-91; Fig 7-20 item 22, 7-88)", () => {
  expect(only("ELT — Artex ELT 1000").note).toContain(
    "Removable for use as a portable locator (POH 13772-007 7-93, To Use ELT portably).",
  );
  expect(only("ELT — Artex ELT 1000").pos).toEqual([-0.98, -0.28, 0.13]);
  expect(only("ELT remote switch (RCPI)").pos).toEqual([2.02, -0.44, -0.14]);
});
it("shelf supports the ELT aft of the bulkhead (POH 7-91; AMM Fig 25-60-1 item 9, PDF 912)", () => {
  const p = only("ELT shelf");
  expect(p.pos).toEqual(ELT_SHELF);
  expect(ELT_SHELF[1] + 0.004).toBeCloseTo(ELT_POS[1] - 0.045, 9);
  expect(p.note).toContain("illustrative");
});
it("internal whip stands on the shelf (POH Fig 7-21 item 3, 7-92; AMM item 4, PDF 912)", () => {
  const p = only("ELT antenna");
  expect(p.pos).toEqual(ELT_ANTENNA_BASE);
  expect(ELT_ANTENNA_BASE).toEqual([ELT_POS[0] + 0.11, ELT_POS[1] - 0.045, ELT_POS[2] + 0.06]);
  // Undimensioned figure: model margins 5 mm beyond base and 15 mm beyond mounting hole.
  expectShelfFootprint(ELT_ANTENNA_BASE, 0.018, 0.005);
  expectShelfFootprint(ELT_ANTENNA_BASE, 0.006, 0.015);
  expect(ELT_ANTENNA_BASE[1]).toBeCloseTo(ELT_SHELF[1] + 0.004, 9);
  const g = p.geo();
  g.computeBoundingBox();
  expect(g.boundingBox!.min.y).toBeCloseTo(-0.022, 6);
  expect(g.boundingBox!.max.y).toBeCloseTo(0.35, 6);
  g.dispose();
  expect(p.note).toContain("illustrative");
});
it("warning buzzer rests on the shelf and uses ELT batteries (POH 7-91; AMM item 11, PDF 912)", () => {
  const p = only("ELT buzzer");
  expect(p.pos).toEqual(ELT_BUZZER);
  expect(ELT_BUZZER[1] - 0.015).toBeCloseTo(ELT_SHELF[1] + 0.004, 9);
  expectShelfFootprint(ELT_BUZZER, 0.012, 0.005);
  expect(p.note).toContain("ELT batteries");
  expect(p.note).toContain("illustrative");
});
it.each([
  ["ELT antenna cable", ELT_ANTENNA_CABLE, ELT_ANTENNA_JACK, ELT_ANTENNA_FEED],
  ["ELT remote cable", ELT_REMOTE_CABLE, ELT_RCPI_JACK, ELT_REMOTE_JACK],
] as const)(
  "%s connects anchored hardware (POH Fig 7-21, 7-92; AMM item 1/2, PDF 912–913)",
  (name, points, from, to) => {
    const g = only(name).geo() as THREE.TubeGeometry;
    expect(g.parameters.path.getPoint(0).distanceTo(v(from))).toBeLessThan(1e-9);
    expect(g.parameters.path.getPoint(1).distanceTo(v(to))).toBeLessThan(1e-9);
    expect(points[0]).toBe(from);
    expect(only(name).note).toContain("illustrative");
    g.dispose();
  },
);

it("RCPI cable leaves the rear and drops through the console opening (AMM Fig 25-60-1 sheet 2, PDF 913)", () => {
  expect(ELT_RCPI_JACK[1]).toBe(ELT_RCPI[1]);
  expect(ELT_RCPI_JACK[2]).toBeCloseTo(ELT_RCPI[2] + ELT_RCPI_SIZE[2] / 2, 12);
  const cable = only("ELT remote cable").geo() as THREE.TubeGeometry;
  const start = cable.parameters.path.getPoint(0),
    next = cable.parameters.path.getPoint(0.001);
  expect(next.z).toBeGreaterThan(start.z);
  expect(next.x).toBeCloseTo(start.x, 8);
  expect(next.y).toBeCloseTo(start.y, 8);
  // Moving the RCPI moves all local connector bends with it; their x coordinates share the anchor.
  const shifted: [number, number, number] = [ELT_RCPI[0] - 0.1, ELT_RCPI[1] + 0.01, ELT_RCPI[2] + 0.01];
  const moved = eltRemoteCable(shifted);
  for (let i = 0; i < 4; i++) {
    expect(moved[i][0] - ELT_REMOTE_CABLE[i][0]).toBeCloseTo(-0.1, 10);
    expect(moved[i][2] - ELT_REMOTE_CABLE[i][2]).toBeCloseTo(0.01, 10);
  }
  expect(moved[0][1] - ELT_REMOTE_CABLE[0][1]).toBeCloseTo(0.01, 10);
  expect(moved[1][1] - ELT_REMOTE_CABLE[1][1]).toBeCloseTo(0.01, 10);
  expect(moved.slice(2, 10).every((p) => p[1] === ELT_REMOTE_FLOOR_Y)).toBe(true);
  cable.dispose();
});
it("console side cutout matches the RCPI and the cable exits underneath on a level run (AMM Fig 25-60-1 sheet 2, PDF 913)", () => {
  const consolePart = only("Center console");
  const geo = consolePart.geo().translate(...consolePart.pos!);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const sideHit = (x: number, y: number) => {
    ray.set(new THREE.Vector3(x, y, -0.2), new THREE.Vector3(0, 0, 1));
    return ray.intersectObject(mesh)[0].point.z;
  };
  expect(sideHit(ELT_RCPI[0], ELT_RCPI[1])).toBeGreaterThan(ELT_RCPI_JACK[2]);
  expect(sideHit(ELT_RCPI[0], ELT_RCPI[1] - ELT_RCPI_SIZE[1] / 2 - 0.001)).toBeCloseTo(-0.13, 6);
  expect(sideHit(ELT_RCPI[0], ELT_RCPI[1] + ELT_RCPI_SIZE[1] / 2 + 0.001)).toBeCloseTo(-0.13, 6);
  expect(sideHit(ELT_RCPI[0] - ELT_RCPI_SIZE[0] / 2 - 0.001, ELT_RCPI[1])).toBeCloseTo(-0.13, 6);
  expect(sideHit(ELT_RCPI[0] + ELT_RCPI_SIZE[0] / 2 + 0.001, ELT_RCPI[1])).toBeCloseTo(-0.13, 6);
  const bottom = consolePart.pos![1] - 0.105;
  expect(ELT_REMOTE_CABLE.slice(2, 10).every((p) => p[1] === ELT_REMOTE_FLOOR_Y)).toBe(true);
  expect(ELT_REMOTE_FLOOR_Y + 0.002).toBeLessThan(bottom);
  // Drop through the underside passage before turning toward the pilot's side.
  ray.set(new THREE.Vector3(...ELT_REMOTE_CABLE[1]), new THREE.Vector3(0, -1, 0));
  ray.far = ELT_REMOTE_CABLE[1][1] - ELT_REMOTE_FLOOR_Y;
  expect(ray.intersectObject(mesh)).toHaveLength(0);
  geo.dispose();
  (mesh.material as THREE.Material).dispose();
});
it("grommet lining seats against all three notch walls (AMM Fig 25-60-1 sheet 1 item 12, PDF 912)", () => {
  const geo = only("ELT shelf cable grommet").geo() as THREE.TubeGeometry;
  const path = geo.parameters.path;
  const radius = geo.parameters.radius;
  expect(path.getPoint(0).x - radius).toBeCloseTo(ELT_GROMMET[0] - 0.01, 9);
  expect(path.getPoint(1).x + radius).toBeCloseTo(ELT_GROMMET[0] + 0.01, 9);
  expect(path.getPoint(0.5).z + radius).toBeCloseTo(ELT_SHELF[2] - 0.055, 9);
  geo.dispose();
});
it("clamp 5 encircles the antenna cable beside grommet 12 and mounts on the shelf (AMM Fig 25-60-1 sheet 1, PDF 912)", () => {
  const clamp = only("ELT antenna cable clamp");
  expect(clamp.pos).toEqual(ELT_CLAMP);
  const cable = only("ELT antenna cable").geo() as THREE.TubeGeometry;
  const path = cable.parameters.path;
  const distance = Math.min(
    ...Array.from({ length: 2001 }, (_, i) => path.getPointAt(i / 2000).distanceTo(v(clamp.pos!))),
  );
  expect(distance).toBeLessThan(0.0002);
  const geo = clamp.geo().translate(...clamp.pos!);
  geo.computeBoundingBox();
  expect(geo.boundingBox!.min.y).toBeCloseTo(ELT_SHELF[1] + 0.004, 7);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(v(clamp.pos!), new THREE.Vector3(-1, 0, 0));
  expect(ray.intersectObject(mesh)[0].distance).toBeCloseTo(cable.parameters.radius, 6);
  geo.dispose();
  cable.dispose();
  (mesh.material as THREE.Material).dispose();
});
it("antenna cable crosses the shelf at grommet 12 (AMM Fig 25-60-1 sheet 1, PDF 912)", () => {
  const cable = only("ELT antenna cable").geo() as THREE.TubeGeometry;
  const path = cable.parameters.path;
  const samples = Array.from({ length: 1001 }, (_, i) => path.getPointAt(i / 1000));
  const crossing = samples.reduce((a, b) => (Math.abs(a.y - ELT_SHELF[1]) < Math.abs(b.y - ELT_SHELF[1]) ? a : b));
  expect(crossing.distanceTo(v(ELT_GROMMET))).toBeLessThan(0.001);
  expect(only("ELT shelf cable grommet").note).toContain("per AMM Fig 25-60-1");
  expect(only("ELT antenna cable").note).toContain("per AMM Fig 25-60-1");
  expect(only("ELT remote cable").note).toContain("per AMM Fig 25-60-1");
  cable.dispose();
});

// Actual mesh interiors and faces, rather than treating hollow rings as filled bounding boxes.
it("ELT hardware and cables clear every solid and rendered flow tube (AMM Fig 25-60-1, PDF 912–913)", () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const solid = (name: string, geo: THREE.BufferGeometry, matrix = new THREE.Matrix4(), part?: PartSpec) => {
    geo.applyMatrix4(matrix);
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, material);
    return { name, geo, mesh, box: geo.boundingBox!.clone(), part };
  };
  const solids = CAT.parts.map((p) =>
    solid(
      p.name ?? p.id,
      p.geo(),
      groupMatrix(p.parent).multiply(
        new THREE.Matrix4().compose(
          v(p.pos ?? [0, 0, 0]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
          v(p.scale ?? [1, 1, 1]),
        ),
      ),
      p,
    ),
  );
  solids.push(...CAT.surfaces.map((s) => solid(s.name, s.geo(), new THREE.Matrix4().makeTranslation(...s.pivot))));
  solids.push(
    ...FLOWS.filter((f) => f.tube !== false).map((f) => {
      const curve = curveOf(f.pts, f.tension ?? 0.3);
      return solid(
        `flow ${f.key}`,
        new THREE.TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
      );
    }),
  );
  const owned = solids.filter((s) => s.name.startsWith("ELT "));
  const ray = new THREE.Raycaster();
  const dirs = [new THREE.Vector3(0.31, 0.83, 0.47).normalize(), new THREE.Vector3(-0.6, 0.2, -0.77).normalize()];
  const inside = (s: (typeof solids)[number], q: THREE.Vector3) =>
    s.box.clone().expandByScalar(-1e-5).containsPoint(q) &&
    dirs.every((d) => {
      ray.set(q, d);
      const hits = ray
        .intersectObject(s.mesh)
        .map((h) => h.distance)
        .filter((d) => d > 1e-5);
      return hits.filter((d, i) => i === 0 || Math.abs(d - hits[i - 1]) > 1e-5).length % 2 === 1;
    });
  const vertices = (s: (typeof solids)[number]) => {
    const a = s.geo.getAttribute("position");
    return Array.from({ length: a.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(a, i));
  };
  const terminal = (a: (typeof solids)[number], b: (typeof solids)[number], q: THREE.Vector3) => {
    if (!(a.geo instanceof THREE.TubeGeometry)) return false;
    const pairs: Record<string, string[]> = {
      "ELT remote cable": ["ELT — Artex ELT 1000", "ELT remote switch (RCPI)"],
      "ELT antenna cable": ["ELT — Artex ELT 1000", "ELT antenna"],
    };
    return (
      pairs[a.name]?.includes(b.name) &&
      [0, 1].some((t) => a.geo instanceof THREE.TubeGeometry && a.geo.parameters.path.getPoint(t).distanceTo(q) < 0.005)
    );
  };
  // Supporting surfaces meet at the shelf's top face; contact is not penetration.
  const mountContact = (a: (typeof solids)[number], b: (typeof solids)[number], q: THREE.Vector3) =>
    [a.name, b.name].includes("ELT shelf") &&
    [a.name, b.name].some((n) =>
      ["ELT — Artex ELT 1000", "ELT antenna", "ELT buzzer", "ELT antenna cable clamp"].includes(n),
    ) &&
    Math.abs(q.y - (ELT_SHELF[1] + 0.004)) < 1e-5;
  const joined = (a: (typeof solids)[number], b: (typeof solids)[number], q: THREE.Vector3) =>
    ([a.name, b.name].includes("ELT shelf") &&
      [a.name, b.name].includes("ELT shelf cable grommet") &&
      (Math.abs(Math.abs(q.x - ELT_GROMMET[0]) - 0.01) < 1e-5 || Math.abs(q.z - (ELT_SHELF[2] - 0.055)) < 1e-5)) ||
    terminal(a, b, q) ||
    terminal(b, a, q) ||
    mountContact(a, b, q) ||
    ([a.name, b.name].includes("ELT antenna cable") &&
      [a.name, b.name].includes("ELT antenna cable clamp") &&
      Math.abs(q.y - ELT_CLAMP[1]) <= 0.002);
  const failures: string[] = [];
  try {
    for (const a of owned) {
      const points = vertices(a);
      expect(points.length, a.name).toBeGreaterThan(0);
      expect(
        points.every((q) => inFus(q)),
        a.name + " inside skin",
      ).toBe(true);
      for (const b of solids) {
        if (a === b || !a.box.intersectsBox(b.box)) continue;
        const hit = points.find((q) => inside(b, q) && !joined(a, b, q));
        const reverse = vertices(b).find((q) => inside(a, q) && !joined(a, b, q));
        if (hit || reverse)
          failures.push(`${a.name} × ${b.name} at ${(hit ?? reverse)!.toArray().map((n) => n.toFixed(4))}`);
        // Edge crossings catch a thin plate slicing a solid whose vertices lie on both sides.
        const attr = a.geo.getAttribute("position"),
          idx = a.geo.index,
          n = idx?.count ?? attr.count;
        const from = new THREE.Vector3(),
          to = new THREE.Vector3(),
          direction = new THREE.Vector3();
        let crossing = false;
        outerEdges: for (let i = 0; !(a.geo instanceof THREE.TubeGeometry) && i < n; i += 3)
          for (const [u, w] of [
            [0, 1],
            [1, 2],
            [2, 0],
          ]) {
            from.fromBufferAttribute(attr, idx ? idx.getX(i + u) : i + u);
            to.fromBufferAttribute(attr, idx ? idx.getX(i + w) : i + w);
            const length = direction.subVectors(to, from).length();
            if (length < 2e-5) continue;
            ray.set(from, direction.divideScalar(length));
            ray.near = 1e-5;
            ray.far = length - 1e-5;
            if (ray.intersectObject(b.mesh).some((h) => !joined(a, b, h.point))) {
              crossing = true;
              break outerEdges;
            }
          }
        ray.near = 0;
        ray.far = Infinity;
        if (crossing) failures.push(`${a.name} edge crosses ${b.name}`);
      }
      if (a.geo instanceof THREE.TubeGeometry) {
        const path = a.geo.parameters.path,
          radius = a.geo.parameters.radius;
        const steps = Math.ceil(path.getLength() / 0.002);
        const points = Array.from({ length: steps + 1 }, (_, i) => path.getPointAt(i / steps));
        const triangle = new THREE.Triangle(),
          closest = new THREE.Vector3();
        for (const b of solids) {
          if (a === b) continue;
          // Installed lining may touch the shelf, but still must not penetrate it.
          const seatedLining = a.name === "ELT shelf cable grommet" && b.name === "ELT shelf";
          const minimum = seatedLining ? radius - 1e-5 : radius + 0.0005;
          const near = b.box.clone().expandByScalar(radius + 0.0005);
          const candidates = points.filter((q) => near.containsPoint(q) && !joined(a, b, q));
          const attr = b.geo.getAttribute("position"),
            idx = b.geo.index,
            count = idx?.count ?? attr.count;
          outer: for (const q of candidates) {
            for (let j = 0; j < count; j += 3) {
              triangle.a.fromBufferAttribute(attr, idx ? idx.getX(j) : j);
              triangle.b.fromBufferAttribute(attr, idx ? idx.getX(j + 1) : j + 1);
              triangle.c.fromBufferAttribute(attr, idx ? idx.getX(j + 2) : j + 2);
              triangle.closestPointToPoint(q, closest);
              if (closest.distanceTo(q) < minimum) {
                failures.push(`${a.name} too close to ${b.name} at ${q.toArray().map((n) => n.toFixed(4))}`);
                break outer;
              }
            }
          }
        }
        failures.push(
          ...points
            .filter((q) => !inFus(q, radius))
            .slice(0, 1)
            .map((q) => a.name + " outside skin " + q.toArray()),
        );
      }
    }
    expect([...new Set(failures)]).toEqual([]);
  } finally {
    for (const s of solids) s.geo.dispose();
    material.dispose();
  }
}, 120000);
