import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { edgeCrossing, inside, tris, type Tri } from "./mesh-clearance";

const mesh = (x: number, y: number, z: number) => tris(new THREE.BoxGeometry(x, y, z), new THREE.Matrix4());
describe("mesh clearance regression", () => {
  it("detects crossing solids whose vertices all lie outside the other solid", () => {
    const a = mesh(4, 1, 1),
      b = mesh(1, 4, 2);
    const ab = new THREE.Box3().setFromPoints(a.flat()),
      bb = new THREE.Box3().setFromPoints(b.flat());
    expect(a.flat().some((p) => inside(p, b, bb))).toBe(false);
    expect(b.flat().some((p) => inside(p, a, ab))).toBe(false);
    expect(edgeCrossing(a, b)).toBeDefined();
    expect(edgeCrossing(b, a)).toBeDefined();
  });
  it("does not extend an edge beyond its endpoints or depend on face winding", () => {
    const face: Tri = [new THREE.Vector3(0, -2, -2), new THREE.Vector3(0, 2, -2), new THREE.Vector3(0, 0, 2)];
    const beyond: Tri = [new THREE.Vector3(-3, 0, 0), new THREE.Vector3(-2, 0, 0), new THREE.Vector3(-2, 1, 0)];
    expect(edgeCrossing([beyond], [face])).toBeUndefined();
    const crossing: Tri = [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 1, 0)];
    expect(edgeCrossing([crossing], [face])).toBeDefined();
    expect(edgeCrossing([crossing], [[face[2], face[1], face[0]]])).toBeDefined();
  });
});

it("reads non-indexed geometry without changing its triangles", () => {
  const indexed = new THREE.BoxGeometry(4, 1, 1);
  expect(tris(indexed.toNonIndexed(), new THREE.Matrix4())).toEqual(tris(indexed, new THREE.Matrix4()));
});

it("the conservative bounds preserve interior and exterior containment", () => {
  const solid = mesh(2, 2, 2),
    bounds = new THREE.Box3().setFromPoints(solid.flat());
  expect(inside(new THREE.Vector3(0, 0, 0), solid, bounds)).toBe(true);
  expect(inside(new THREE.Vector3(2, 0, 0), solid, bounds)).toBe(false);
});

it("expanded bounds retain the exact segment-end tolerance without extending it", () => {
  const source: Tri = [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 1, 0)];
  const face = (x: number): Tri => [
    new THREE.Vector3(x, -2, -2),
    new THREE.Vector3(x, 2, -2),
    new THREE.Vector3(x, 0, 2),
  ];
  expect(edgeCrossing([source], [face(1 + 0.5e-9)])).toBeDefined();
  expect(edgeCrossing([source], [face(1 + 2e-9)])).toBeUndefined();
});

it("classifies interior points whose exit ray runs through a shared triangle edge", () => {
  const outer = mesh(2, 2, 2),
    bounds = new THREE.Box3().setFromPoints(outer.flat());
  const direction = new THREE.Vector3(0.31, 0.83, 0.47).normalize();
  for (const face of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
    for (const distance of [0.01, 0.05, 0.2, 0.5, 0.9]) {
      const p = face.clone().addScaledVector(direction, -distance);
      expect(inside(p, outer, bounds), p.toArray().join()).toBe(true);
    }
  }
});

it("detects a closed tetrahedron wholly enclosed without any surface crossings", () => {
  const outer = mesh(2, 2, 2),
    bounds = new THREE.Box3().setFromPoints(outer.flat());
  const [a, b, c, d] = [
    [0.9969091047313142, -0.008275622816158767, -0.00468619605252364],
    [0.984545523656571, -0.04137811408079384, -0.0234309802626182],
    [-0.00618179053737161, 0.9834487543676824, -0.00937239210504728],
    [-0.015454476343429025, -0.04137811408079384, 0.9765690197373817],
  ].map((p) => new THREE.Vector3(...p));
  const inner: Tri[] = [
    [a, b, c],
    [a, d, b],
    [a, c, d],
    [b, d, c],
  ];
  expect(
    Math.abs(
      b
        .clone()
        .sub(a)
        .dot(c.clone().sub(a).cross(d.clone().sub(a))),
    ) / 6,
  ).toBeGreaterThan(0.01);
  expect(edgeCrossing(inner, outer)).toBeUndefined();
  expect(edgeCrossing(outer, inner)).toBeUndefined();
  for (const point of [a, b, c, d]) expect(inside(point, outer, bounds)).toBe(true);
});
