/** Cowling consistency, not surveyed installation dimensions. Check complete geometry and curved tube walls,
 * rather than only a component anchor or hose control points. Exterior propeller/inlet/exhaust remain intentional.
 */
import { describe, expect, it } from "vitest";
import { Matrix4, TubeGeometry, Vector3 } from "three";
import { CAT } from "@/aircraft/sr20/parts";
import { CYLS, INDUCTION_ENTRY, cylOrigin } from "@/aircraft/sr20/engine-anchors";
import { ENGINE_DEPTH_FLOWS } from "@/aircraft/sr20/engine-depth-flow";
import { inFus } from "@/aircraft/sr20/geometry";
import { curveOf } from "@/lib/geometry";
import { points, worldGeometry } from "./placement-helpers";

const CORRECTED_PARTS = [
  "Oil cooler diffuser / bracket",
  "Air/oil separator",
  "Air/oil separator and booster bracket",
  "Propeller governor",
  "Side cooling baffle",
  "Cooling baffle seal",
  "Aft cooling baffle",
];

describe("SR20 engine cowling containment", () => {
  it("fits full baffle, governor and oil hardware envelopes and cylinder-local geometry within the curved cowling", () => {
    const parts = CAT.parts.filter((p) => CORRECTED_PARTS.includes(p.name ?? "") || p.parent?.startsWith("cyl:"));
    expect(parts.length).toBeGreaterThan(CORRECTED_PARTS.length);
    for (const part of parts) {
      const c = CYLS.find((c) => part.parent === "cyl:" + c.n);
      const parent = c ? new Matrix4().makeTranslation(...cylOrigin(c)) : undefined;
      const geometry = worldGeometry(part, parent);
      try {
        const outside = points(geometry).filter((p) => !inFus(p, 0.002));
        expect(
          outside.map((p) => p.toArray()),
          part.name ?? part.id,
        ).toEqual([]);
      } finally {
        geometry.dispose();
      }
    }
  });

  it("keeps every internal engine hose and wire inside including curve bulges and tube radii", () => {
    const routes = ENGINE_DEPTH_FLOWS.filter((f) => f.tube !== false && !f.ext);
    expect(routes.some((f) => f.key === "chtWire1")).toBe(true);
    expect(routes.some((f) => f.key === "egtWire1")).toBe(true);
    for (const route of routes) {
      // Dense longitudinal/radial sampling is stricter than the scene's six-sided rendered tubes.
      const geometry = new TubeGeometry(curveOf(route.pts, route.tension ?? 0.3), 300, route.r ?? 0.012, 16, false);
      try {
        const outside = points(geometry).filter((p) => !inFus(p, 0.002));
        expect(
          outside.map((p) => p.toArray()),
          route.key,
        ).toEqual([]);
      } finally {
        geometry.dispose();
      }
    }
  });

  it("preserves the exterior propeller and inlet while beginning the solid induction duct inside the cowling", () => {
    const hub = CAT.parts.find((p) => p.name === "Propeller hub / pitch piston")!;
    const intake = ENGINE_DEPTH_FLOWS.find((f) => f.key === "intake")!;
    const inlet = ENGINE_DEPTH_FLOWS.find((f) => f.key === "intakeEntrance")!;
    expect(hub.ext).toBe(true);
    expect(inlet.ext).toBe(true);
    expect(inlet.tube).toBe(false);
    expect(inlet.pts.at(-1)).toEqual(INDUCTION_ENTRY);
    expect(intake.pts[0]).toEqual(INDUCTION_ENTRY);
    expect(inFus(new Vector3(...INDUCTION_ENTRY), 0.02)).toBe(true);
  });
});
