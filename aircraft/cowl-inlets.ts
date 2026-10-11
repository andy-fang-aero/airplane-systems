import type { CowlInlet } from "@/lib/cowl";
import type { AircraftId } from "@/lib/systems";

/** Existing photo-fit inlet outlines, shared by the cut skin, rim and open throat.
 * minX only bounds mesh subtraction; it is not a measured duct length. */
const pair = (y: number, z: number, width: number, height: number, exponent: number, minX: number): CowlInlet[] =>
  [1, -1].map((s) => ({ y, z: s * z, width, height, exponent, minX }));
export const COWL_INLETS: Record<AircraftId, CowlInlet[]> = {
  // The M20C nose is schematic; no calibrated inlet outlines are available yet.
  m20c: [],
  // The SR22T skin is not cut; its cowl inlets are modelled as their own parts in aircraft/sr22t.
  sr22t: [],
  sr20: pair(-0.13, 0.22, 0.15, 0.15, 2, 3.4),
  c172s: [
    ...pair((53.3 - 49.25) * 0.0254, 10.4 * 0.0254, 0.245, 0.185, 3.2, 3.2),
    { y: (37.8 - 49.25) * 0.0254, z: 0, width: 0.2, height: 0.08, exponent: 4, minX: 3.2 },
  ],
  c182t: [
    ...pair((53 - 50.375) * 0.0254, 11.2 * 0.0254, 0.27, 0.19, 3.2, 3.35),
    { y: (39 - 50.375) * 0.0254, z: 0, width: 0.24, height: 0.1, exponent: 4, minX: 3.35 },
  ],
  da40: [...pair(0, 0.26, 0.152, 0.152, 2, 2.2), { y: -0.27, z: 0, width: 0.16, height: 0.05, exponent: 4, minX: 2.2 }],
};
