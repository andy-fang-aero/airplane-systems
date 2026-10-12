/** Four-point mount and pressure-baffle enclosure. All dimensions illustrative; not maintenance geometry.
 * POH11934-005 7-34, 7-40; AMM12137-002 71-00 pp. 1,19, 71-20 p. 1 and Fig71-20-1.
 */
import { box, cyl, tubeGeo } from "@/lib/geometry";
import type { Vec3 } from "@/lib/math";
import { FW } from "../geometry";
import { part } from "./catalogue";

export const MOUNT_ATTACH: Vec3[] = [
  [FW + 0.016, 0.065, -0.25],
  [FW + 0.016, 0.065, 0.25],
  [FW + 0.016, -0.42, -0.25],
  [FW + 0.016, -0.42, 0.25],
];
export const MOUNT_FEET: Vec3[] = [
  [2.83, -0.045, -0.175],
  [2.83, -0.045, 0.175],
  [2.83, -0.29, -0.175],
  [2.83, -0.29, 0.175],
];
export const MOUNT_RUNS: Vec3[][] = [
  ...MOUNT_ATTACH.map((p, i) => [p, MOUNT_FEET[i]]),
  [MOUNT_ATTACH[0], MOUNT_FEET[2]],
  [MOUNT_ATTACH[1], MOUNT_FEET[3]],
  [MOUNT_ATTACH[2], MOUNT_FEET[0]],
  [MOUNT_ATTACH[3], MOUNT_FEET[1]],
];
MOUNT_RUNS.forEach((run, i) =>
  part(() => tubeGeo(run, 0.009), ["engine"], {
    color: "#758188",
    name: "Tubular steel engine mount",
    pin: i === 0,
    note: "Four-point tubular steel weldment with dyna-focal fittings and elastomeric vibration isolators; four reinforced firewall attachments transfer thrust and bending loads into the composite fuselage (POH 7-34; AMM 71-20 p. 1, Fig 71-20-1). Brace layout and dimensions approximate.",
    groups: [],
  }),
);
MOUNT_FEET.forEach((pos) =>
  part(() => cyl(0.029, 0.033, "x"), ["engine"], {
    pos,
    color: "#4A5054",
    name: "Engine mount vibration isolator",
    note: "Elastomeric isolator at each of the four dyna-focal engine attachments (AMM 71-20 p. 1). Tilt, dimensions and position approximate.",
    groups: [],
  }),
);
for (const side of [-1, 1]) {
  part(() => box(0.75, 0.145, 0.006), ["engine"], {
    pos: [3.14, -0.015, side * 0.432],
    color: "#6D8994",
    fairing: true,
    name: "Side cooling baffle",
    pin: side === 1,
    note: "Baffle walls contain inlet air above the cylinder fins, forcing cooling air past the engine rather than allowing it to leak around it (POH 7-40; AMM 71-00 pp. 1,19). POH calls them composite; AMM describes sheet metal with reinforced silicone seals. This schematic enclosure represents their function; dimensions approximate.",
    groups: [],
  });
  part(() => box(0.75, 0.018, 0.012), ["engine"], {
    pos: [3.14, 0.066, side * 0.432],
    color: "#332F35",
    name: "Cooling baffle seal",
    note: "Flexible reinforced silicone seal against the cowling; leaks can divert air from other cylinders and raise temperatures (AMM 71-00 pp. 1,19). Shape and cowling contact schematic.",
    groups: [],
  });
  part(() => box(0.115, 0.09, 0.23), ["engine"], {
    pos: [side === 1 ? 3.18 : 3.035, -0.24, side * 0.28],
    color: "#6D8994",
    fairing: true,
    name: "Inter-cylinder cooling baffle",
    note: "Representative baffle below the gap in each cylinder bank to direct air through the cooling fins (POH 7-40; AMM71-00 pp. 1,19, Fig71-00-2). Shape and placement approximate.",
    groups: [],
  });
}
part(() => box(0.006, 0.145, 0.84), ["engine"], {
  pos: [2.755, -0.015, 0],
  color: "#6D8994",
  fairing: true,
  name: "Aft cooling baffle",
  note: "Rear wall of the schematic inlet-air pressure enclosure. Hoses, wiring and control cables pass through the baffles; correct seals preserve cylinder cooling (AMM71-00 pp. 1,19). Shape, openings and coordinates approximate.",
  groups: [],
});
