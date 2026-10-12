/**
 * TKS empennage seating: the tail porous panels sit on the leading edge they are bonded to, and the tail feed
 * lines and stall-strip capillaries run inside the structure. AMM 13773-002 Rev 7 Fig. 30-00-1 (PDF 1169); Fig. 30-07-2
 * sheet 6 Details F and G (PDF 1222); 30-00 (PDF 1167–1168).
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAT, type PartSpec } from "@/aircraft/sr22t/parts";
import { fLE, inFus, sLE, SY } from "@/aircraft/sr22t/geometry";
import { inside, tris, type Tri } from "./mesh-clearance";

const one = (name: string) => {
  const found = CAT.parts.filter((p) => p.name === name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
/** Airplane-frame offset of a part's group at rest (elevator tips ride the elevator). */
const origin = (p: PartSpec) =>
  p.parent?.startsWith("surf:") ? new THREE.Vector3(...CAT.surfacePivot(p.parent.slice(5))) : new THREE.Vector3();
/** Points along a tube part's centreline, in airplane coordinates. */
const centreline = (p: PartSpec, n = 50) => {
  const g = p.geo() as THREE.TubeGeometry,
    path = g.parameters.path;
  const pts = Array.from({ length: n + 1 }, (_, i) => path.getPoint(i / n).add(origin(p)));
  g.dispose();
  return pts;
};

describe("SR22T TKS empennage seating", () => {
  it("the fin panel runs up the fin leading edge, through the dorsal-fillet kink (Fig. 30-07-2 sheet 6 Detail G, PDF 1222)", () => {
    const pts = centreline(one("Vertical stabilizer porous panel"));
    // h 0.52 to 1.39 spans the fillet blend row at h 0.58, where the old five-sample spline ran ~9 cm ahead of the LE.
    expect(Math.min(...pts.map((p) => p.y))).toBeLessThan(0.58);
    for (const p of pts) {
      expect(Math.abs(p.x - fLE(p.y)), `fin panel at h ${p.y.toFixed(3)}`).toBeLessThanOrEqual(0.01);
      expect(Math.abs(p.z)).toBeLessThan(1e-6);
    }
  });

  it("each elevator tip panel wraps the rounded horn leading edge outboard of the stabilizer (Fig. 30-07-2 sheet 6 Detail F, PDF 1222)", () => {
    for (const side of ["Left", "Right"]) {
      const pts = centreline(one(`${side} elevator tip porous panel`));
      for (const p of pts) {
        const z = Math.abs(p.z);
        // The horn cut-back moves the LE ~0.2 m aft across the panel; the panel must follow it, not stand ahead of it.
        expect(Math.abs(p.x - sLE(z)), `${side} tip panel at |z| ${z.toFixed(3)}`).toBeLessThanOrEqual(0.01);
        expect(Math.abs(p.y - SY)).toBeLessThan(1e-6);
        expect(Math.sign(p.z)).toBe(side === "Left" ? -1 : 1);
      }
      expect(sLE(Math.abs(pts[0].z)) - sLE(Math.abs(pts.at(-1)!.z))).toBeGreaterThan(0.1);
    }
  });

  it("the tail feed lines and stall-strip capillaries stay inside the fuselage, wing, stabilizer, fin and elevator skins (Fig. 30-00-1, PDF 1169)", () => {
    const I = new THREE.Matrix4();
    const hulls: { mesh: Tri[]; box: THREE.Box3 }[] = [
      ...CAT.shells.filter((s) => s.name !== "Fuselage").map((s) => tris(s.geo(), I)),
      ...CAT.surfaces.map((s) => tris(s.geo(), new THREE.Matrix4().makeTranslation(...s.pivot))),
    ].map((mesh) => ({ mesh, box: new THREE.Box3().setFromPoints(mesh.flat()) }));
    const inSkin = (p: THREE.Vector3) => inFus(p) || hulls.some((h) => inside(p, h.mesh, h.box));
    const names = ["Vertical panel feed line"];
    for (const side of ["Left", "Right"])
      names.push(
        `${side} horizontal panel feed line`,
        `${side} elevator tip feed line`,
        `${side} stall strip capillary tube`,
      );
    for (const name of names) {
      const p = one(name),
        g = p.geo(),
        pos = g.attributes.position;
      const outside: string[] = [];
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).add(origin(p));
        if (!inSkin(v))
          outside.push(
            v
              .toArray()
              .map((x) => x.toFixed(3))
              .join(", "),
          );
      }
      g.dispose();
      expect(outside, name).toEqual([]);
    }
  });

  it("the tail panel fittings sit at the panel ends on the leading edge (AMM 30-00, PDF 1167–1168)", () => {
    const fittings = CAT.parts
      .filter((p) => p.name === "Panel inlet fitting" || p.name === "Panel vent and check valve")
      .map((p) => new THREE.Vector3(...p.pos!).add(origin(p)));
    const ends = [
      one("Vertical stabilizer porous panel"),
      one("Left elevator tip porous panel"),
      one("Right elevator tip porous panel"),
    ].flatMap((p) => {
      const pts = centreline(p);
      return [pts[0], pts.at(-1)!];
    });
    for (const end of ends)
      expect(
        fittings.some((f) => f.distanceTo(end) <= 0.005),
        `fitting at [${end.toArray().map((x) => x.toFixed(3))}]`,
      ).toBe(true);
  });
});
