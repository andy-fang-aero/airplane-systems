/**
 * The ring of fasteners around the front of the cowl, just aft of the spinner (AMM 71-10, illustrative). A section of its
 * own, registered last, so adding it leaves the part ids of every earlier section unchanged.
 */
import * as THREE from "three";
import { FUSE } from "../geometry";
import { part } from "./catalogue";

/**
 * The cowling is secured with quarter-turn fasteners and screws (AMM 13773-002 Rev 7 71-10 p. 1, PDF 2504); screws join
 * the upper and lower cowls at the forward inlets and must be installed before the engine is started (AMM 71-10 §E(1),
 * PDF 2515; Fig 71-10-2 item 11, PDF 2510). Illustrative: no source gives their number or spacing around the front of the
 * cowl, so the ring below is evenly spaced on the model's loft. The walk-around checks them at 8c, 9g+ and 10c.
 */
const FRONT_FASTENER_X = 3.68; // illustrative: 60 mm aft of the spinner base (SPINNER_BASE_X 3.74), on the cowl loft
const FRONT_FASTENERS = 12; // illustrative: count and even spacing are not from a source
const FASTENER_R = 0.007, // illustrative: screw-head radius
  FASTENER_H = 0.004, // illustrative: head height
  FASTENER_PROUD = 0.0015; // illustrative: how far the head stands off the skin
/** Point on the cowl loft at station x and ring angle th (0 = right side, π/2 = top). */
const cowlAt = (x: number, th: number) => FUSE.ring(x, 1, 1, th, th, false)[0];
/** Where each front cowl fastener sits on the skin, and the skin's outward normal there. */
export const FRONT_COWL_FASTENERS = Array.from({ length: FRONT_FASTENERS }, (_, k) => {
  const th = ((k + 0.5) / FRONT_FASTENERS) * Math.PI * 2,
    d = 0.002, // finite-difference step for the normal, m
    x = FRONT_FASTENER_X;
  const at = cowlAt(x, th);
  const along = cowlAt(x + d, th).sub(cowlAt(x - d, th)),
    around = cowlAt(x, th + d).sub(cowlAt(x, th - d));
  const n = around.cross(along).normalize();
  if (n.dot(new THREE.Vector3(0, at.y - FUSE.section(x).cy, at.z)) < 0) n.negate();
  return { at, n };
});
FRONT_COWL_FASTENERS.forEach(({ at, n }) =>
  part(
    () => {
      const g = new THREE.CylinderGeometry(FASTENER_R, FASTENER_R, FASTENER_H, 10);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
      const c = at.clone().addScaledVector(n, FASTENER_PROUD - FASTENER_H / 2);
      return g.translate(c.x, c.y, c.z);
    },
    ["engine", "airframe"],
    {
      color: "#C9D1D8",
      ext: true,
      name: "Front cowl fastener",
      note: "Screws around the front of the cowl, just aft of the spinner. The cowling is secured with quarter-turn fasteners and screws, and the screws joining the upper and lower cowls at the forward inlets must be installed before the engine is started (AMM 13773-002 Rev 7 71-10, PDF 2504, 2515; Fig 71-10-2 item 11, PDF 2510). Illustrative: the number, spacing and size are not from a source.",
      groups: [],
    },
  ),
);
