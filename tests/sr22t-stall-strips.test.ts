/** AMM 13773-002 Rev 7 57-20 PDF 2378, Fig 57-20-2 PDF 2389; 30-00 PDF 1168. */
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { CAT } from "@/aircraft/sr22t/parts";
import { inFus } from "@/aircraft/sr22t/geometry";
import { useSR22T } from "@/aircraft/sr22t/store";
import { stallStripPath, STALL_STRIP_RADIUS } from "@/aircraft/sr22t/stall-strip-layout";

const saved = useSR22T.getState().s;
afterEach(() => useSR22T.setState({ s: saved }));
const get = (name: string) => {
  const matches = CAT.parts.filter((p) => p.name === name);
  expect(matches, name).toHaveLength(1);
  return matches[0];
};
describe("SR22T stall strips — AMM Fig 57-20-2 (PDF 2389)", () => {
  it.each([false, true])("fits two strips per wing with FIKI=%s", (fiki) => {
    useSR22T.setState({ s: { ...saved, equip: { ...saved.equip, fiki } } });
    for (const label of ["Left", "Right"]) {
      const plain = get(`${label} inboard stall strip`);
      const porous = get(`${label} porous stall strip`);
      const outboard = get(`${label} outboard stall strip`);
      expect(plain.fitted!()).toBe(!fiki);
      expect(porous.fitted!()).toBe(fiki);
      expect(outboard.fitted?.() ?? true).toBe(true);
      expect(plain.sys).toContain("airframe");
      expect(outboard.sys).toContain("airframe");
      expect(porous.sys).toContain("airframe");
      expect(porous.sys).toContain("ice");
      const fittedInboard = CAT.partsFor().filter((p) => p.sys.includes("airframe") && [plain, porous].includes(p));
      expect(fittedInboard).toEqual([fiki ? porous : plain]);
      const pinnedInboard = CAT.pinned("airframe").filter((p) => [plain, porous].includes(p));
      expect(pinnedInboard).toEqual(fittedInboard);
      for (const [p, expected] of [
        [plain, !fiki],
        [porous, fiki],
      ] as const) {
        const mesh = new THREE.Mesh();
        p.anim!(mesh, 0);
        expect(mesh.visible).toBe(expected);
      }
    }
  });
  it("cites both preflight strip checks — POH 13772-007 4-7 item 7a, 4-9 item 11g", () => {
    for (const label of ["Left", "Right"]) {
      for (const section of ["inboard", "outboard"]) {
        expect(get(`${label} ${section} stall strip`).note).toContain("POH 13772-007 preflight 4-7, 4-9");
        expect(get(`${label} ${section} stall strip`).note).not.toContain("preflight 4-6");
      }
    }
  });
  it("shares the root strip anchor and terminates the capillary there — AMM 30-00 PDF 1168", () => {
    for (const side of [-1, 1]) {
      const label = side < 0 ? "Left" : "Right";
      const expected = stallStripPath(side, "inboard");
      for (const name of [`${label} inboard stall strip`, `${label} porous stall strip`]) {
        const geo = get(name).geo() as THREE.TubeGeometry;
        expect(geo.parameters.path.getPoint(0).distanceTo(new THREE.Vector3(...expected[0]))).toBeLessThan(1e-8);
        expect(geo.parameters.path.getPoint(1).distanceTo(new THREE.Vector3(...expected[2]))).toBeLessThan(1e-8);
        geo.dispose();
      }
      // The capillary ends behind the skin at the strip's root end (inside the LE bay), not out on the strip itself.
      const geo = get(`${label} stall strip capillary tube`).geo() as THREE.TubeGeometry;
      expect(geo.parameters.path.getPoint(1).distanceTo(new THREE.Vector3(...expected[0]))).toBeLessThanOrEqual(0.03);
      geo.dispose();
      expect(Math.abs(expected[2][2])).toBeLessThan(1.2);
      expect(Math.abs(stallStripPath(side, "outboard")[0][2])).toBeGreaterThan(3);
    }
  });
  it("clears the fuselage and TKS tank with the moved root strip and capillary", () => {
    for (const label of ["Left", "Right"]) {
      const tank = get(`${label} TKS tank`);
      const tankGeo = tank.geo();
      tankGeo.computeBoundingBox();
      const box = tankGeo.boundingBox!.clone().translate(new THREE.Vector3(...tank.pos!));
      for (const name of [
        `${label} inboard stall strip`,
        `${label} outboard stall strip`,
        `${label} porous stall strip`,
        `${label} stall strip capillary tube`,
      ]) {
        const geo = get(name).geo() as THREE.TubeGeometry;
        const radius = name.endsWith("tube") ? geo.parameters.radius : STALL_STRIP_RADIUS;
        const positions = geo.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(positions, i);
          expect(inFus(p), `${name} vertex ${i}`).toBe(false);
        }
        for (let i = 0; i <= 100; i++) {
          const p = geo.parameters.path.getPoint(i / 100);
          expect(box.distanceToPoint(p), `${name} tank clearance ${i}`).toBeGreaterThan(radius);
        }
        geo.dispose();
      }
      tankGeo.dispose();
    }
  });
});
