/** Sample every rendered vertex, as in the skin-QA audit.
 * This cluster is entirely within the cowl region, so the analytic fuselage loft
 * is the closed hull here (POH 13772-007 Fig 1-1, p. 1-4).
 * The 1 mm flush tolerance and 30 mm external-drain budget are QA limits,
 * not installation dimensions from the undimensioned manuals. */
import { expect, it } from "vitest";
import { Euler, Matrix4, Quaternion, TubeGeometry, Vector3 } from "three";
import { CAT } from "@/aircraft/sr22t/parts";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { FW, inFus } from "@/aircraft/sr22t/geometry";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
import { points } from "./mesh-clearance";

const internalParts = ["Drain manifold", "Cylinder drain manifold check valve"];
it("the manifold and check valve stay inside the cowl; only the preflight exit projects (POH 8-17; AMM Fig 71-70-2 items 6/12/13, PDF 2565)", () => {
  for (const name of [...internalParts, "Gascolator drain"]) {
    const part = CAT.parts.find((p) => p.name === name)!;
    expect(part, name).toBeDefined();
    const geometry = part.geo();
    const matrix = new Matrix4().compose(
      toV(part.pos ?? [0, 0, 0]),
      new Quaternion().setFromEuler(new Euler(...(part.rot ?? [0, 0, 0]))),
      toV(part.scale ?? [1, 1, 1]),
    );
    const vertices = points(geometry, matrix);
    geometry.dispose();
    if (internalParts.includes(name)) {
      expect(
        vertices.filter((v) => !inFus(v, -0.001)),
        name,
      ).toEqual([]);
    } else {
      expect(part.ext).toBe(true);
      expect(vertices.some((v) => !inFus(v))).toBe(true);
      // A vertical lift of at most 30 mm puts the complete short stub inside.
      // This bounds its distance to the hull even more strictly than the audit's
      // nearest-surface distance, and rejects a valve floating below the cowl.
      expect(
        vertices.filter((v) => !inFus(v.clone().add(new Vector3(0, 0.03, 0)))),
        name,
      ).toEqual([]);
    }
  }
});

it("dry firewall drain hoses stay inside except at the short preflight outlet (POH 8-17; AMM 28-20 PDF 1113, Fig 28-20-1 PDF 1116)", () => {
  const keys = [
    "fuelDrainAux",
    "fuelDrainGas",
    "fuelDrainEngine",
    "fuelDrainSpider",
    "fuelDrainHeads",
    "fuelDrainOutlet",
  ];
  for (const key of keys) {
    const flow = FLOWS.find((f) => f.key === key)!;
    expect(flow, key).toBeDefined();
    const curve = curveOf(flow.pts, flow.tension ?? 0.3);
    const geometry = new TubeGeometry(
      curve,
      Math.max(24, Math.round(curve.getLength() * 28)),
      flow.r ?? 0.012,
      6,
      false,
    );
    const vertices = points(geometry, new Matrix4());
    geometry.dispose();
    const outside = vertices.filter((v) => !inFus(v, -0.001));
    if (key !== "fuelDrainOutlet") expect(outside, key).toEqual([]);
    else {
      expect(outside.length).toBeGreaterThan(0);
      for (const v of outside) {
        expect(v.x).toBeGreaterThan(FW);
        expect(v.x - FW).toBeLessThan(0.15);
        expect(Math.abs(v.z)).toBeLessThan(0.1);
        expect(inFus(v.clone().add(new Vector3(0, 0.03, 0))), key).toBe(true);
      }
    }
  }
});
