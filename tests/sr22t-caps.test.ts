/** SR22T POH 13772-007 7-96–7-97; AMM 13773-002 Rev 7 Fig 95-00-1 (PDF p. 2853).
 * Extraction times/rate and routing offsets are illustrative; the documents specify the sequence and topology.
 */
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { CAT } from "@/aircraft/sr22t/parts";
import { live } from "@/aircraft/sr22t/model";
import { DOOR_SEAM } from "@/aircraft/sr22t/geometry";
import { HARNESS, ROCKET_T, TAUT_T, fwdStrap, strapOut, strapPeel } from "@/aircraft/sr22t/parts/caps";

const forward = "Forward harness strap",
  aft = "Aft harness strap";
const meshes: THREE.Mesh[] = [];
const drawn = (name: string, t: number) => {
  live.capsT = t;
  return CAT.parts
    .filter((p) => p.name === name)
    .map((p) => {
      const m = new THREE.Mesh(p.geo());
      meshes.push(m);
      p.anim!(m, 0);
      return m;
    });
};
afterEach(() => {
  live.capsT = -1;
  for (const m of meshes) m.geometry.dispose();
  meshes.length = 0;
});

describe("SR22T stowed CAPS harness tears out before inflation (POH 7-96–7-97)", () => {
  it("draws all straps before extraction", () => {
    for (const t of [-1, 0, ROCKET_T - 0.01])
      for (const m of [...drawn(forward, t), ...drawn(aft, t)]) {
        expect(m.visible).toBe(true);
        expect(m.geometry.drawRange.start).toBe(0);
      }
  });
  it("peels forward legs along the corrected route from canister to firewall", () => {
    for (const side of [-1, 1]) {
      const { lead, run, fitting } = fwdStrap(side);
      expect(strapPeel(side, 0).toArray()).toEqual(lead[0]);
      let previousX = lead[0][0];
      for (const t of [ROCKET_T, 0.5, 0.8, 1.0, 1.3, TAUT_T]) {
        const p = strapPeel(side, strapOut(t));
        expect(p.x).toBeGreaterThanOrEqual(previousX);
        previousX = p.x;
      }
      expect(strapPeel(side, 1).distanceTo(new THREE.Vector3(...fitting))).toBeLessThan(1e-6);
      expect(fitting).toEqual(side < 0 ? HARNESS.fwdL : HARNESS.fwdR);
      const sill = Math.min(...DOOR_SEAM.map(([, y]) => y));
      for (const [x, y] of run) if (x >= 0.8 && x <= 1.94) expect(y + 0.012).toBeLessThan(sill);
    }
    const straps = drawn(forward, 1.0);
    expect(straps).toHaveLength(2);
    for (const m of straps) {
      expect(m.visible).toBe(true);
      expect(m.geometry.drawRange.start).toBeGreaterThan(0);
      expect(m.geometry.drawRange.start).toBeLessThan(m.geometry.index!.count);
      // The deployed leg joins the first remaining tube ring (within one tube segment).
      const g = m.geometry as THREE.TubeGeometry;
      const ring = g.drawRange.start / (g.parameters.radialSegments * 6);
      const side = straps.indexOf(m) === 0 ? -1 : 1;
      expect(
        g.parameters.path.getPointAt(ring / g.parameters.tubularSegments).distanceTo(strapPeel(side, strapOut(1.0))),
      ).toBeLessThan(0.03);
    }
  });
  it("removes the canister-stowed aft strap at extraction, before the eight-second three-link release", () => {
    expect(drawn(aft, ROCKET_T - 0.01)[0].visible).toBe(true);
    for (const t of [ROCKET_T, 1.0, 6.0, 8.0, 12.0]) expect(drawn(aft, t)[0].visible).toBe(false);
  });
  it("leaves no stowed strap inside the fuselage once the deployed legs reach the fittings", () => {
    for (const t of [TAUT_T, 1.8, 3.0, 6.0, 8.0, 12.0])
      for (const m of [...drawn(forward, t), ...drawn(aft, t)]) expect(m.visible, `T+${t}`).toBe(false);
  });
  it("restores the same meshes on reset and backward scrubbing", () => {
    const specs = CAT.parts.filter((p) => [forward, aft].includes(p.name!));
    const drawnMeshes = specs.map((p) => {
      const m = new THREE.Mesh(p.geo());
      meshes.push(m);
      return m;
    });
    for (const t of [6, 1, -1]) {
      live.capsT = t;
      specs.forEach((p, i) => p.anim!(drawnMeshes[i], 0));
      drawnMeshes.forEach((m, i) => {
        expect(m.visible).toBe(t < 0 || (t === 1 && specs[i].name === forward));
        if (t < 0) expect(m.geometry.drawRange.start).toBe(0);
      });
    }
  });
});
