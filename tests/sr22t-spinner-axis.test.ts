/** Spinner/hub seating: AMM 13773-002 Rev 7 61-10 p. 1 (PDF 2438), 30-60 pp. 1–2 (PDF 1258–1259), Fig 30-60-1 (PDF 1267). */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FUSE, fRing, fus, SPINNER_BASE_X, COWL_NOSE_BLEND_X } from "@/aircraft/sr22t/geometry";
import { CAT, PROP } from "@/aircraft/sr22t/parts";
import { points, tris } from "./mesh-clearance";

const spinner = () => CAT.shells.find((s) => s.name === "Spinner")!.geo();
const parts = (name: string) => CAT.parts.filter((p) => p.name === name);

describe("SR22T spinner and prop hub", () => {
  it("the spinner and slinger ring are coaxial with the propeller (AMM 61-10 p. 1; 30-60 p. 2)", () => {
    const g = spinner();
    g.computeBoundingBox();
    const centre = g.boundingBox!.getCenter(new THREE.Vector3());
    expect(centre.y).toBeCloseTo(PROP[1], 7);
    expect(centre.z).toBeCloseTo(PROP[2], 7);
    g.dispose();
    const [ring] = parts("Propeller slinger ring");
    expect(ring.pos!.slice(1)).toEqual(PROP.slice(1));
  });

  it.each([0, 1, 2])("blade %i feed tube stays within the 20 mm external budget (AMM Fig 30-60-1)", (blade) => {
    const g = spinner();
    const skin = tris(g, new THREE.Matrix4());
    const [tube] = parts("Boot feed tube").filter((p) => p.parent === `blade:${blade}`);
    // Mirror Airplane.tsx's nested groups at rest, including each blade's 120-degree clocking.
    const m = new THREE.Matrix4().makeRotationX((blade * Math.PI * 2) / 3);
    m.setPosition(...PROP);
    const tubeGeo = tube.geo();
    const triangle = new THREE.Triangle(),
      closest = new THREE.Vector3();
    const depth = Math.max(
      ...points(tubeGeo, m).map((p) => {
        let distance = Infinity;
        for (const face of skin)
          distance = Math.min(
            distance,
            triangle
              .set(...face)
              .closestPointToPoint(p, closest)
              .distanceTo(p),
          );
        return distance;
      }),
    );
    console.info(`Boot feed tube blade ${blade}: ${(depth * 1000).toFixed(3)} mm`);
    expect(depth).toBeLessThanOrEqual(0.02);
    tubeGeo.dispose();
    g.dispose();
  });

  it("all three boots remain on the blade roots (AMM 30-60 p. 1, Fig 30-60-1 item 14)", () => {
    for (const blade of [0, 1, 2]) {
      const parent = `blade:${blade}`;
      const [boot] = parts("Grooved blade boot").filter((p) => p.parent === parent);
      const [prop] = parts("Propeller blade").filter((p) => p.parent === parent);
      const bootGeo = boot.geo(),
        bladeGeo = prop.geo();
      bootGeo.computeBoundingBox();
      bladeGeo.computeBoundingBox();
      expect(
        bootGeo
          .boundingBox!.clone()
          .translate(new THREE.Vector3(...boot.pos!))
          .intersectsBox(bladeGeo.boundingBox!),
      ).toBe(true);
      bootGeo.dispose();
      bladeGeo.dispose();
    }
  });
});

it("the rendered cowl lip meets the spinner rim within 5 mm all round (POH 13772-007 Fig 1-1 p. 1-4; AMM 61-10 p. 1)", () => {
  const dome = spinner();
  dome.computeBoundingBox();
  const x = dome.boundingBox!.min.x;
  const radius = dome.boundingBox!.getSize(new THREE.Vector3()).z / 2;
  const cowl = CAT.shells.find((s) => s.name === "Fuselage")!.geo();
  const rim = points(cowl, new THREE.Matrix4()).filter((p) => Math.abs(p.x - x) < 1e-6);
  expect(rim.length).toBeGreaterThan(32);
  for (const p of rim) expect(Math.abs(Math.hypot(p.y - PROP[1], p.z - PROP[2]) - radius)).toBeLessThanOrEqual(0.005);
  cowl.dispose();
  dome.dispose();
}, 120_000);

it("the nose skin and containment agree while blending into the unchanged aft cowl (POH Fig 1-1 p. 1-4)", () => {
  for (const x of [SPINNER_BASE_X, 3.735, 3.73, 3.725, COWL_NOSE_BLEND_X]) {
    const { cy } = fus(x);
    for (const p of fRing(x, 1, 64)) {
      const inward = p.clone().lerp(new THREE.Vector3(x, cy, 0), 0.00001);
      const outward = p
        .clone()
        .sub(new THREE.Vector3(x, cy, 0))
        .multiplyScalar(1.001)
        .add(new THREE.Vector3(x, cy, 0));
      expect(FUSE.inside(inward), `inside at x ${x}`).toBe(true);
      expect(FUSE.inside(outward), `outside at x ${x}`).toBe(false);
      const side = p.z < 0 ? -1 : 1;
      // At the poles, inversion amplifies floating-point height error; containment above covers them.
      if (Math.abs(p.z) > 1e-8) expect(FUSE.onSkin(x, p.y, side, 1).distanceTo(p)).toBeLessThan(1e-7);
    }
  }
  // Published outline stations retain their original illustrative geometry aft of the lip.
  for (const [x, hw, hh, cy] of [
    [3.66, 0.42, 0.24, -0.16],
    [3.52, 0.5, 0.3, -0.19],
  ]) {
    const actual = fus(x);
    expect(actual.hw).toBeCloseTo(hw, 10);
    expect(actual.hh).toBeCloseTo(hh, 10);
    expect(actual.cy).toBeCloseTo(cy, 10);
  }
});
