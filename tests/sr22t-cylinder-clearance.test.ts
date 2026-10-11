import { ACCESSORY_FACE_X } from "@/aircraft/sr22t/engine-datum";
import { describe, expect, it } from "vitest";
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
import { toV } from "@/lib/math";
import { curveOf } from "@/lib/geometry";
import { FLOWS } from "@/aircraft/sr22t/flows";
import type { PartSpec } from "@/lib/catalogue";
import { CAT, CYLS, HEADER } from "@/aircraft/sr22t/parts";
import { cylExhaust, cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { NECK_DROP } from "@/aircraft/sr22t/parts/engine-air";

const material = new MeshBasicMaterial({ side: DoubleSide });
const solid = (p: PartSpec) => {
  const g = p.geo();
  g.applyMatrix4(
    new Matrix4().compose(
      new Vector3(...(p.pos ?? [0, 0, 0])),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      new Vector3(...(p.scale ?? [1, 1, 1])),
    ),
  );
  const c = CYLS.find((c) => p.parent === `cyl:${c.n}`);
  if (c) g.translate(...cylOrigin(c));
  g.computeBoundingBox();
  return { p, g, box: g.boundingBox!.clone(), mesh: new Mesh(g, material) };
};

// A tube's whole AABB covers empty space between its bends. Test actual triangle
// edges in both directions, rather than treating that entire space as solid.
const edgeCrosses = (a: ReturnType<typeof solid>, b: ReturnType<typeof solid>) => {
  const position = a.g.getAttribute("position"),
    index = a.g.index;
  const count = index?.count ?? position.count;
  const ray = new Raycaster(),
    start = new Vector3(),
    end = new Vector3();
  for (let i = 0; i < count; i += 3) {
    for (let j = 0; j < 3; j++) {
      start.fromBufferAttribute(position, index ? index.getX(i + j) : i + j);
      end.fromBufferAttribute(position, index ? index.getX(i + ((j + 1) % 3)) : i + ((j + 1) % 3));
      const direction = end.clone().sub(start),
        length = direction.length();
      if (length < 0.00001) continue;
      ray.set(start, direction.normalize());
      ray.near = 0.00001;
      ray.far = length - 0.00001;
      if (ray.intersectObject(b.mesh).length) return true;
    }
  }
  return false;
};

// Also catch complete containment (closed solids have an odd number of exits).
const inside = (point: Vector3, s: ReturnType<typeof solid>) => {
  if (!s.box.containsPoint(point)) return false;
  const hits = new Raycaster(point, new Vector3(0.137, 0.419, 1).normalize(), 0).intersectObject(s.mesh);
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
    inside(new Vector3().fromBufferAttribute(b.g.getAttribute("position"), 0), a)
  );
};

describe("SR22T cylinder clearance (AMM Fig 72-00-2 PDF 2574; M-18 Fig 5-34 p. 5-54)", () => {
  it("audits every non-cylinder engine-bay solid against barrels, fins and heads", () => {
    const cylinders = CAT.parts
      .filter((p) => /^cyl:/.test(p.parent ?? "") && (!p.name || /^Cylinder/.test(p.name)))
      .map(solid);
    const others = CAT.parts.filter((p) => !p.parent).map(solid);
    try {
      const hits = new Set<string>();
      for (const other of others)
        for (const c of cylinders) {
          if (intersects(other, c)) hits.add(`${c.p.parent}: ${other.p.name ?? other.p.id}`);
        }
      expect([...hits]).toEqual([]);
    } finally {
      for (const s of [...cylinders, ...others]) s.g.dispose();
      material.dispose();
    }
  });

  it("seats all 12 plugs on their own head and clears every other cylinder", () => {
    const cylinders = CAT.parts.filter((p) => /^cyl:/.test(p.parent ?? "")).map(solid);
    try {
      const plugs = cylinders.filter((s) => s.p.name?.startsWith("Spark plug"));
      expect(plugs).toHaveLength(12);
      for (const plug of plugs) {
        const head = cylinders.find((s) => s.p.parent === plug.p.parent && s.p.name?.startsWith("Cylinder head"))!;
        expect(plug.box.intersectsBox(head.box), plug.p.name).toBe(true);
        // Exact own-head penetration of 10 mm, and x remains inside its footprint.
        const upper = plug.p.name!.endsWith("upper");
        expect(upper ? head.box.max.y - plug.box.min.y : plug.box.max.y - head.box.min.y).toBeCloseTo(0.01, 6);
        expect(plug.box.min.x).toBeGreaterThan(head.box.min.x);
        expect(plug.box.max.x).toBeLessThan(head.box.max.x);
        for (const other of cylinders.filter((s) => s.p.parent !== plug.p.parent)) {
          expect(plug.box.intersectsBox(other.box), `${plug.p.name} vs ${other.p.name ?? other.p.id}`).toBe(false);
        }
      }
    } finally {
      for (const s of cylinders) s.g.dispose();
    }
  });

  it("clears cylinders with the heat duct and transducer supply tube (POH 7-43, 7-64; AMM Fig 21-40-2 PDF 486)", () => {
    const cylinders = CAT.parts
      .filter((p) => /^cyl:/.test(p.parent ?? "") && (!p.name || /^Cylinder/.test(p.name)))
      .map(solid);
    const tubes = ["hotL", "fuelMain", ...CYLS.map((c) => `exh${c.n}`)].map((key) => {
      const f = FLOWS.find((f) => f.key === key)!;
      // Same curve and tessellation as components/scene/Flows.tsx.
      const curve = curveOf(f.pts, f.tension ?? 0.3);
      return solid({
        id: key,
        sys: f.sys,
        name: key,
        geo: () => new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
      });
    });
    try {
      for (const t of tubes)
        for (const c of cylinders) expect(intersects(t, c), `${t.p.id} vs ${c.p.parent}`).toBe(false);
      for (const c of CYLS) {
        const bank = CYLS.filter((b) => b.s === c.s);
        const i = bank.findIndex((b) => b.n === c.n);
        const h = HEADER(c.s);
        const riser = [h.elbow, h.riser, h.aftRiser][i];
        // the riser seats on the head's lower face (The trimmed head, Continental M-18 Fig 5-35)
        expect(riser[0]).toEqual(cylExhaust(c));
        expect(riser[1][0]).toBe(c.x);
        expect(riser[1][1]).toBeCloseTo(cylExhaust(c)[1] - NECK_DROP, 8); // illustrative harness clearance, AMM Figs 74-20-1 / 78-10-2 PDF 2624 / 2740
        expect(riser[1][2]).toBeCloseTo(cylExhaust(c)[2], 8);
        const intake = toV(FLOWS.find((f) => f.key === `man${c.n}`)!.pts.at(-1)!);
        expect(intake.x).toBe(c.x);
        expect(intake.y).toBeCloseTo(-0.05, 8);
        expect(intake.z).toBeCloseTo(c.s * 0.3, 8);
      }
      // The LH duct drops from the rear port aft of the accessory face, behind the bank.
      expect((FLOWS.find((f) => f.key === "hotL")!.pts[1] as [number, number, number])[0]).toBeLessThan(
        ACCESSORY_FACE_X,
      );
      expect(CAT.parts.find((p) => p.name === "Fuel flow transducer")!.pos).toEqual([2.96, -0.32, 0.28]);
      expect(FLOWS.find((f) => f.key === "fuelMain")!.pts).toContainEqual([2.96, -0.32, 0.28]);
      // Replace only the lower waypoint pin. An earlier version guarded a supply leg
      // beneath the right bank followed by a rise above the injector fan. The original coordinate was on the sump.
      // Keep the existing all-cylinder rendered-tube intersection checks above and the upper anchor below.
      const fuel = FLOWS.find((f) => f.key === "fuelMain")!;
      const fuelCurve = curveOf(fuel.pts, fuel.tension ?? 0.3);
      const samples = fuelCurve.getSpacedPoints(Math.ceil(fuelCurve.getLength() / 0.002));
      const bankBottom = Math.min(
        ...cylinders
          .filter((c) => c.p.parent === "cyl:1" && c.p.name?.startsWith("Cylinder head"))
          .map((c) => c.box.min.y),
      );
      // Same transducer station band as the old lower waypoint, with the entire tube below the cylinder bank.
      expect(
        samples.filter((p) => p.x >= 2.94 && p.x <= 3.02 && p.y + fuel.r! + 0.005 <= bankBottom).length,
      ).toBeGreaterThanOrEqual(10);
      // The upper rise clears the injector fan rather than merely visiting a particular control point.
      const injectorTubes = FLOWS.filter((f) => /^inj[1-6]$/.test(f.key)).flatMap((f) =>
        curveOf(f.pts, f.tension ?? 0.3)
          .getSpacedPoints(200)
          .map((p) => ({ p, r: f.r! })),
      );
      const upper = samples.filter((p) => p.x >= 2.96 && p.x <= 3.02 && p.y >= 0.12);
      expect(upper.length).toBeGreaterThan(0);
      expect(
        Math.min(...upper.map((p) => Math.min(...injectorTubes.map((i) => p.distanceTo(i.p) - fuel.r! - i.r)))),
      ).toBeGreaterThanOrEqual(0.005);
      expect(FLOWS.find((f) => f.key === "fuelMain")!.pts).toContainEqual([2.99, 0.15, 0.1]);
    } finally {
      for (const s of [...cylinders, ...tubes]) s.g.dispose();
    }
  });
});
