import { expect, it } from "vitest";
import * as THREE from "three";
import { cutCowlInlets } from "@/lib/cowl";
import { cowlOpeningGeo } from "@/lib/geometry";
import { COWL_INLETS } from "@/aircraft/cowl-inlets";
import { FLEET } from "@/aircraft";

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const hits = (g: THREE.BufferGeometry, y: number, z: number, far: number, start = 5) => {
  const ray = new THREE.Raycaster(new THREE.Vector3(start, y, z), new THREE.Vector3(-1, 0, 0), 0, far);
  return ray.intersectObject(new THREE.Mesh(g, material));
};

// Mesh construction and repeated raycasts can exceed 5 s on shared CI workers.
it.each(FLEET)(
  "$id nose skin and inlet throats admit rays through every aperture",
  (aircraft) => {
    const cat = aircraft.labels!.cat;
    const skins = cat.shells.filter((s) => s.name === "Fuselage" || s.name === "Cowling nose").map((s) => s.geo());
    expect(skins.length).toBeGreaterThan(0);
    for (const inlet of COWL_INLETS[aircraft.id]) {
      for (const fy of [-0.4, 0, 0.4]) {
        for (const fz of [-0.4, 0, 0.4]) {
          const y = inlet.y + (fy * inlet.height) / 2,
            z = inlet.z + (fz * inlet.width) / 2;
          for (const skin of skins) expect(hits(skin, y, z, 5 - inlet.minX)).toHaveLength(0);
          const throat = cowlOpeningGeo(() => 4, inlet.y, inlet.z, inlet.width, inlet.height, inlet.exponent);
          expect(hits(throat, y, z, 2)).toHaveLength(0);
          throat.dispose();
        }
      }
      // The surrounding skin must remain opaque just outside the lip.
      expect(skins.some((skin) => hits(skin, inlet.y + inlet.height * 0.6, inlet.z, 5 - inlet.minX).length > 0)).toBe(
        true,
      );
    }
    for (const skin of skins) {
      expect(Array.from(skin.attributes.normal.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(skin.attributes.uv.array).every(Number.isFinite)).toBe(true);
      skin.dispose();
    }
  },
  120_000,
);

it("cuts the front cap without punching the back or changing interpolated UVs", () => {
  const source = new THREE.BoxGeometry(2, 2, 2);
  const cut = cutCowlInlets(source, [{ y: 0, z: 0, width: 1, height: 1, exponent: 3, minX: 0 }]);
  expect(hits(cut, 0, 0, 1.5, 2)).toHaveLength(0);
  expect(hits(cut, 0, 0, 4, 2)[0].point.x).toBeCloseTo(-1);
  expect(hits(cut, 0.7, 0, 4, 2)[0].point.x).toBeCloseTo(1);
  const p = cut.attributes.position,
    uv = cut.attributes.uv,
    n = cut.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    if (n.getX(i) > 0.99) {
      expect(uv.getX(i)).toBeCloseTo((1 - p.getZ(i)) / 2, 5);
      expect(uv.getY(i)).toBeCloseTo((1 + p.getY(i)) / 2, 5);
    }
  }
  cut.dispose();
});
