/**
 * Cowl openings: two front cooling inlets (POH 7-38), the NACA induction ducts in the lower LH and RH cowls (POH 7-37;
 * AMM 71-60), louvered cooling-air exits in the bottom of the cowlings (POH 7-38) and the oil filler access door on the top
 * left (POH 7-37, 8-15; AMM Fig 71-10-2). Positions approximate.
 */
import * as THREE from "three";
import type { Vec3 } from "@/lib/math";
import { box, FUSE, inFus, inductionAnchor, inductionGeo } from "../geometry";
import { part } from "./catalogue";

/* ---------- cooling inlets ---------- */
[1, -1].forEach((s) => {
  part(
    () => {
      const g = new THREE.TorusGeometry(0.075, 0.018, 8, 20);
      g.rotateY(Math.PI / 2);
      g.translate(3.7, -0.13, s * 0.22);
      return g;
    },
    ["engine", "airframe"],
    {
      color: "#1E2A33",
      ext: true,
      pin: true,
      name: "Cowl inlet — cooling",
      note: "Cooling air enters through the two inlets in the cowling; aluminum baffles direct it over the cylinder fins (POH 7-38).",
      groups: [],
    },
  );
  part(
    () => {
      const g = new THREE.CircleGeometry(0.075, 20);
      g.rotateY(Math.PI / 2);
      g.translate(3.695, -0.13, s * 0.22);
      return g;
    },
    ["engine", "airframe"],
    { color: "#0B1014", ext: true, groups: [] },
  );
});

/* ---------- induction ducts, cooling exits, oil filler door: on the skin, tilted to its slope ---------- */
/** Anchors for flows.ts. */
export const NACA_INDUCTION = (s: number): Vec3 => inductionAnchor(s).toArray() as Vec3;
export const COWL_LOUVERS = (s: number): Vec3 => [2.95, -0.622, s * 0.18];
[1, -1].forEach((s) => {
  part(() => inductionGeo(s).translate(...(NACA_INDUCTION(s).map((v) => -v) as Vec3)), ["engine", "airframe"], {
    pos: NACA_INDUCTION(s),
    color: "#0B1014",
    ext: true,
    pin: true,
    name: "NACA induction duct",
    note: `${s > 0 ? "Lower right" : "Lower left"} cowl. Flush submerged inlet: induction air enters here and goes to the air box (POH 13772-007 7-37; AMM 13773-002 Rev 7 71-60, PDF p. 2542). Position, 140 × 50 mm footprint, widening and 12 mm recessed ramp are approximate: the cited sections do not dimension the inlet. Lip follows the POH Fig 1-1 (1-4)-derived model skin.`,
    groups: ["induction"],
  });
  part(() => box(0.16, 0.012, 0.12), ["engine", "airframe"], {
    pos: COWL_LOUVERS(s),
    rot: [s * 0.06, 0, 0.18],
    color: "#1E2A33",
    ext: true,
    name: "Cowl exit louvers",
    note: "The heated cooling air leaves through louvered vents in the bottom of the cowlings; no movable cowl flaps (POH 7-38).",
    groups: [],
  });
});
/** Upper-left oil door over the unchanged filler (POH 13772-007 7-37, 8-15;
 * AMM 13773-002 Rev 7 Fig 71-10-2 item 7, PDF 2510). The figure shows a flush cover,
 * but gives no dimensions: 120 × 100 mm footprint and 2 mm thickness and 0.5 mm display offset approximate (within the 1 mm flush tolerance).
 * Project each vertex onto the POH Fig 1-1 (1-4)-derived loft rather than tilting a flat block. */
function oilDoorY(x: number, z: number) {
  let low = FUSE.section(x).cy,
    high = FUSE.topY(x);
  for (let i = 0; i < 40; i++) {
    const y = (low + high) / 2;
    if (inFus(new THREE.Vector3(x, y, z))) low = y;
    else high = y;
  }
  return (low + high) / 2;
}
const OIL_DOOR: Vec3 = [2.82, oilDoorY(2.82, -0.26), -0.26];
part(
  () => {
    const g = new THREE.BoxGeometry(0.12, 0.002, 0.1, 12, 1, 10);
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i) + OIL_DOOR[0],
        z = a.getZ(i) + OIL_DOOR[2];
      a.setY(i, oilDoorY(x, z) - OIL_DOOR[1] + a.getY(i) - 0.0005);
    }
    g.computeVertexNormals();
    return g;
  },
  ["engine", "airframe"],
  {
    pos: OIL_DOOR,
    color: "#3A4148",
    ext: true,
    pin: true,
    name: "Oil filler access door",
    note: "Top left of the engine cowling, over the oil filler cap and dipstick at the left rear of the engine (POH 13772-007 7-37, 8-15; AMM 13773-002 Rev 7 Fig 71-10-2 item 7 PDF p. 2510). Flush cover follows the POH Fig 1-1 (1-4)-derived model skin; undimensioned footprint, thickness and position approximate.",
    groups: ["oil"],
  },
);
