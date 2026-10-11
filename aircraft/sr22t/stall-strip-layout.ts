import type { Vec3 } from "@/lib/math";
import { wLE, wY } from "./geometry";

/** AMM 13773-002 Rev 7 Fig 57-20-2 Details A/B (PDF 2389): root and mid-span strips.
 * Stations, 0.30 m length, 0.012 m radius and LE offsets are illustrative, not maintenance dimensions.
 * Both inboard variants use the same anchor; the FIKI capillary ends at its root end (30-00, PDF 1168).
 */
export const STALL_STRIP_RADIUS = 0.012;
export function stallStripPath(side: number, section: "inboard" | "outboard"): Vec3[] {
  const start = section === "inboard" ? 0.85 : 3.5;
  return [start, start + 0.15, start + 0.3].map((z) => [wLE(z) + 0.004, wY(z) - 0.012, side * z]);
}
