import { describe, expect, it } from "vitest";
import { DoubleSide, Euler, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Vector3 } from "three";
import { CAT } from "@/aircraft/sr22t/parts";
import { NACA_INDUCTION } from "@/aircraft/sr22t/parts/cowl";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { fuselageGeo, inFus, lowerSkinY } from "@/aircraft/sr22t/geometry";
import { toV } from "@/lib/math";
import { points, tris } from "./mesh-clearance";

const skinY = (p: Vector3) => lowerSkinY(p.x, p.z);
const ducts = () => CAT.parts.filter((p) => p.name === "NACA induction duct");
const transform = (p: ReturnType<typeof ducts>[number]) =>
  new Matrix4().compose(
    new Vector3(...(p.pos ?? [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
    new Vector3(...(p.scale ?? [1, 1, 1])),
  );

describe("lower-cowl NACA induction inlets (POH 13772-007 7-37; AMM 71-60)", () => {
  it("both ramps are submerged, with flush lips and no surface more than 1 mm outside the cowl", () => {
    expect(ducts()).toHaveLength(2);
    for (const duct of ducts()) {
      const g = duct.geo(),
        m = transform(duct);
      const vertices = points(g, m);
      const depths = vertices.map((p) => p.y - skinY(p));
      expect(Math.min(...depths)).toBeGreaterThanOrEqual(-0.001);
      expect(Math.max(...depths)).toBeGreaterThan(0.005);
      expect(depths.filter((d) => Math.abs(d) < 0.001).length).toBeGreaterThan(2);
      // Check triangle interiors too: a chord between skin vertices must not bulge outside.
      for (const t of tris(g, m))
        for (let a = 0; a <= 4; a++)
          for (let b = 0; b <= 4 - a; b++) {
            const p = t[0]
              .clone()
              .multiplyScalar(a / 4)
              .addScaledVector(t[1], b / 4)
              .addScaledVector(t[2], (4 - a - b) / 4);
            expect(inFus(p, -0.001)).toBe(true);
          }
      g.dispose();
    }
  });

  it("every ramp faces down and every recessed wall faces into its duct on both sides", () => {
    for (const duct of ducts()) {
      const g = duct.geo();
      try {
        let floors = 0,
          walls = 0;
        for (const [a, b, c] of tris(g, transform(duct))) {
          const normal = b.clone().sub(a).cross(c.clone().sub(a));
          // At the flush leading lip, one triangle of each wall collapses to a line.
          if (normal.lengthSq() < 1e-16) continue;
          normal.normalize();
          if (Math.abs(normal.y) > 1e-6) {
            expect(normal.y).toBeLessThan(0);
            floors++;
          } else {
            const centre = a.clone().add(b).add(c).divideScalar(3);
            const centrelineZ = Math.sign(centre.z) * 0.36;
            expect(normal.z * (centrelineZ - centre.z)).toBeGreaterThan(0);
            walls++;
          }
        }
        expect(floors).toBeGreaterThan(0);
        expect(walls).toBeGreaterThan(0);
      } finally {
        g.dispose();
      }
    }
  });

  it("the opaque cowl has an opening above each ramp, with intact skin beside it", () => {
    const g = fuselageGeo(),
      material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(g, material);
    for (const side of [-1, 1]) {
      for (const x of [3.32, 3.36, 3.4]) {
        const p = new Vector3(x, -1, side * 0.36);
        const hits = new Raycaster(p, new Vector3(0, 1, 0)).intersectObject(mesh);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].point.y - skinY(p)).toBeGreaterThan(0.005);
      }
      const p = new Vector3(3.36, -1, side * 0.4);
      const hit = new Raycaster(p, new Vector3(0, 1, 0)).intersectObject(mesh)[0];
      expect(Math.abs(hit.point.y - skinY(p))).toBeLessThan(0.001);
    }
    g.dispose();
    material.dispose();
  }, 120000);

  it("the inlet flow anchors lie on the skin and retain the existing internal particle clearance", () => {
    for (const side of [-1, 1]) {
      const anchor = new Vector3(...NACA_INDUCTION(side));
      expect(Math.abs(anchor.y - skinY(anchor))).toBeLessThan(0.000001);
      const inlet = FLOWS.find((f) => f.key === (side < 0 ? "inletL" : "inletR"))!;
      expect(toV(inlet.pts[0]).distanceTo(anchor.clone().add(new Vector3(0, 0.028, 0)))).toBeLessThan(0.000001);
    }
  });
});
