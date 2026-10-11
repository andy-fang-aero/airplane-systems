// Unit tests of the flow-crossings audit's inside/outside oracle (tests/winding-number.ts); they pin the oracle, not aircraft geometry.
/** The flow-crossings oracle classifies volume by generalized winding number, not ray parity. */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { insideSolid, windingNumber, type Tri } from "./winding-number";

const soup = (...geos: THREE.BufferGeometry[]): Tri[] =>
  geos.flatMap((g) => {
    const pos = g.getAttribute("position"),
      ix = g.index,
      n = ix ? ix.count : pos.count,
      v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, ix ? ix.getX(i) : i);
    return Array.from({ length: n / 3 }, (_, i) => [v(3 * i), v(3 * i + 1), v(3 * i + 2)] as const);
  });
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe("generalized winding number", () => {
  it("is 1 inside and 0 outside a closed box, including points whose rays leave through shared triangle edges", () => {
    const box = soup(new THREE.BoxGeometry(2, 2, 2));
    expect(windingNumber(V(0, 0, 0), box)).toBeCloseTo(1, 9);
    expect(windingNumber(V(3, 0.2, -0.4), box)).toBeCloseTo(0, 9);
    // Strict interior points on the face-diagonal seams of the old ray direction
    const d = V(0.31, 0.83, 0.47).normalize();
    for (const face of [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)])
      for (const t of [0.05, 0.2, 0.5, 0.9]) {
        const p = face.clone().addScaledVector(d, -t);
        if (Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) < 1)
          expect(insideSolid(p, box), p.toArray().join()).toBe(true);
      }
  });

  it("treats two closed boxes that share an internal face as one solid", () => {
    const left = new THREE.BoxGeometry(1, 1, 1).translate(-0.5, 0, 0),
      right = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0),
      mesh = soup(left, right);
    for (const x of [-0.9, -0.3, -0.001, 0, 0.001, 0.3, 0.9])
      expect(insideSolid(V(x, 0.1, -0.2), mesh), `x ${x}`).toBe(true);
    for (const p of [V(1.01, 0, 0), V(0, 0.51, 0), V(-1.2, 0.3, 0.3)]) expect(insideSolid(p, mesh)).toBe(false);
  });

  it("treats concatenated overlapping closed components as their union", () => {
    const mesh = soup(new THREE.BoxGeometry(2, 2, 2), new THREE.BoxGeometry(2, 2, 2).translate(0.2, 0, 0));
    expect(insideSolid(V(0, 0, 0), mesh)).toBe(true);
    expect(insideSolid(V(1.1, 0, 0), mesh)).toBe(true);
    expect(insideSolid(V(1.3, 0, 0), mesh)).toBe(false);
  });

  it("finds the inside of an uncapped tube along its axis", () => {
    const D = V(0.31, 0.83, 0.47).normalize();
    const tube = soup(new THREE.TubeGeometry(new THREE.LineCurve3(D.clone().negate(), D), 24, 0.04, 8, false));
    expect(insideSolid(V(0, 0, 0), tube)).toBe(true);
    expect(insideSolid(D.clone().multiplyScalar(0.5), tube)).toBe(true);
    expect(insideSolid(V(0.1, 0, 0), tube)).toBe(false);
  });

  it("never puts a point beside a single open plate inside it", () => {
    const plate = soup(new THREE.PlaneGeometry(1, 1));
    for (const z of [-0.001, 0.001, 0.05]) expect(insideSolid(V(0.1, 0.1, z), plate)).toBe(false);
  });

  it("reads a mirrored (negative-scale) closed part as inside", () => {
    const box = soup(new THREE.BoxGeometry(1, 1, 1).scale(-1, 1, 1));
    expect(windingNumber(V(0, 0, 0), box)).toBeCloseTo(-1, 9);
    expect(insideSolid(V(0, 0, 0), box)).toBe(true);
  });
});
