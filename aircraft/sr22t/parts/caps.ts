/** CAPS: parachute canister, harness straps and mechanical activation system. */
import type * as THREE from "three";
import type { PartAnim } from "@/lib/catalogue";
import { curveOf } from "@/lib/geometry";
import { live } from "../model";
import { clamp, ease, lerp, toVec3, type Vec3 } from "@/lib/math";
import { AB, FW, box, onSkin, tubeGeo } from "../geometry";
import { part } from "./catalogue";
import { CAPS_HANDLE_ATTACH, capsHandleDrop } from "./cabin";

/* ---------- CAPS ---------- */
export const CAPS_BOX: Vec3 = [-0.76, 0.22, 0];
part(() => box(0.4, 0.18, 0.26), ["caps"], {
  pos: CAPS_BOX,
  name: "CAPS canister",
  // POH 13772-007 7-95: an enclosure containing the rocket; ghost its cover to expose the igniter in X-ray.
  fairing: true,
  note: "Composite box aft of the baggage bulkhead holding the 2,400 ft² canopy and solid-propellant rocket, under a thin composite cover.",
  pin: true,
});
/** Harness attach points: forward straps on the firewall (FS 100), aft strap at the aft baggage bulkhead (FS 222).
 * POH 13772-007 7-96; AMM 13773-002 Rev 7 Fig 95-00-1 (PDF 2853): below the covering.
 * Undimensioned fitting heights/offsets approximate; inset leaves room for the stowed strap radius. */
export const HARNESS: Record<"fwdL" | "fwdR" | "aft", Vec3> = {
  fwdL: [FW, 0.075, -0.38],
  fwdR: [FW, 0.075, 0.38],
  aft: [AB, 0.2, 0],
};
/** Forward strap tube radius. */
export const STRAP_R = 0.012;
/** Where each forward strap leaves the canister for the side skin, and the height of its run under the door sill. */
const EXIT_X = -0.55,
  SILL_RUN = -0.34;

/**
 * Height of a forward strap's side run at station x (AMM Fig 95-00-1 shows the shape, not dimensions): up to the
 * firewall fitting forward of the cabin door, under the door sill along the door, up over the baggage door aft of it
 * and on to the canister exit. Heights are display choices.
 */
function runY(x: number) {
  if (x >= 2) return lerp(SILL_RUN, HARNESS.fwdR[1], ease(clamp((x - 2) / (FW - 2), 0, 1)));
  if (x >= 0.75) return SILL_RUN;
  if (x >= 0.2) return lerp(0.04, SILL_RUN, ease((x - 0.2) / 0.55));
  return lerp(0.27, 0.04, ease(clamp((x - EXIT_X) / (0.2 - EXIT_X), 0, 1)));
}

/**
 * Forward strap path on side s (−1 left, +1 right): a lead inside the canister, a schematic transition to the side exit,
 * then the side run sampled every 0.01 m along x and set just inside the skin (onSkin at 0.94, a display inset), to the fitting.
 */
export function fwdStrap(s: number): { lead: Vec3[]; run: Vec3[]; fitting: Vec3 } {
  const n = Math.ceil((FW - EXIT_X) / 0.01);
  const run = Array.from({ length: n }, (_, i) => {
    const x = lerp(EXIT_X, FW, i / n);
    return toVec3(onSkin(x, runY(x), s, 0.94));
  });
  return { lead: [[-0.6, 0.3, s * 0.12]], run, fitting: s < 0 ? HARNESS.fwdL : HARNESS.fwdR };
}

/** Illustrative extraction times, shared with CAPS_PHASES; POH 13772-007 7-96–7-97 gives sequence, not peel rate. */
export const ROCKET_T = 0.3,
  TAUT_T = 1.6;
/** Forward straps tear out from canister to firewall before inflation (POH 7-96; AMM Rev 7 Fig 95-00-1, stages 2–4). */
export const strapOut = (t: number) => (t < ROCKET_T ? 0 : ease(clamp((t - ROCKET_T) / (TAUT_T - ROCKET_T), 0, 1)));
const strapCurves = new Map<number, THREE.Curve<THREE.Vector3>>();
/** Deployed leg starts where the remaining below-door stowed route leaves the skin. */
export const strapPeel = (s: number, out: number) => {
  let c = strapCurves.get(s);
  if (!c) {
    const { lead, run, fitting } = fwdStrap(s);
    strapCurves.set(s, (c = curveOf([...lead, ...run, fitting])));
  }
  return c.getPointAt(out);
};
/** Draw only the portion still under the covering; restore it when the timeline is reset or scrubbed backward. */
const tearOut: PartAnim = (m) => {
  const out = strapOut(live.capsT),
    g = m.geometry as THREE.TubeGeometry,
    { tubularSegments, radialSegments } = g.parameters;
  m.visible = out < 1;
  g.setDrawRange(Math.round(out * tubularSegments) * radialSegments * 6, Infinity);
};

[-1, 1].forEach((s) =>
  part(
    () => {
      const { lead, run, fitting } = fwdStrap(s);
      return tubeGeo([...lead, ...run, fitting], STRAP_R);
    },
    ["caps"],
    {
      anim: tearOut,
      name: "Forward harness strap",
      note: "Two forward harness straps run from the canister immediately beneath the fuselage skin to attach points on the firewall and pull through their covering on deployment (POH 7-96; AMM Figure 95-00-1). Fitting heights and offsets are illustrative.",
      pin: s > 0,
    },
  ),
);
part(
  () =>
    tubeGeo(
      [
        [-0.62, 0.24, 0],
        [AB, 0.2, 0],
      ],
      0.014,
    ),
  ["caps"],
  {
    // Stowed in the canister: leaves with the bag, independently of the later three-link release.
    anim: (m) => {
      m.visible = live.capsT < ROCKET_T;
    },
    name: "Aft harness strap",
    note: "Stowed in the parachute canister; attaches at the aft baggage-compartment bulkhead (FS 222). A variable-length strap: held short at first, released by pyrotechnic cutters and a three-link release about eight seconds after deployment (POH 7-96, 7-97; AMM 95-00 General, Description). Shown schematically.",
  },
);

/**
 * Activation system: POH 13772-007 7-96; AMM 13773-002 Rev 7 95-00 (PDF p. 2852), Fig 95-00-1 (PDF p. 2853).
 * The figure supplies topology, not dimensions. Cable radius, roof inset, bends and igniter size are illustrative.
 * Keep the run below the roll cage and enter the enclosure on its forward face; no existing hardware moves.
 */
export const ROCKET_IGNITER: Vec3 = [-0.589, 0.285, 0.06];
const IGNITER_SIZE: Vec3 = [0.035, 0.03, 0.03];
// POH 7-96 / AMM Fig 95-00-1: cable attaches to the ceiling handle, then runs aft to the igniter.
// First roof bend is aft of the shoulder-station attachment (POH 7-96; AMM Fig 95-00-1); bends undimensioned.
// Contact on the horizontal stem's upper surface; the vertical roof lead is schematic (POH 7-96).
export const CAPS_CABLE: Vec3[] = [
  CAPS_HANDLE_ATTACH,
  [CAPS_HANDLE_ATTACH[0], 0.7, CAPS_HANDLE_ATTACH[2]],
  [0.85, 0.685, -0.06],
  [0.82, 0.59, -0.12],
  [0.75, 0.58, -0.12],
  [0.4, 0.58, -0.12],
  [0.05, 0.55, -0.12],
  [-0.25, 0.49, -0.12],
  [AB, 0.44, -0.12],
  [-0.535, 0.36, -0.12],
  [-0.54, 0.32, 0.06],
  [-0.54, 0.285, 0.06],
  [ROCKET_IGNITER[0] + IGNITER_SIZE[0] / 2, ROCKET_IGNITER[1], ROCKET_IGNITER[2]],
];
// Like the servo cables, retain ownership independently of replaceable mesh.userData.
const activationGeometries = new WeakMap<THREE.Mesh, { geometry: THREE.BufferGeometry; drop: number }>();
// Zero tangents keep the short vertical attachment lead from bowing forward or into the handle.
part(() => tubeGeo(CAPS_CABLE, 0.003, 0), ["caps"], {
  dynamicGeo: true,
  anim: (m) => {
    const drop = capsHandleDrop(live.capsT);
    const owned = activationGeometries.get(m);
    if (owned?.drop === drop && owned.geometry === m.geometry) return;
    const points = CAPS_CABLE.map((p) => [...p] as Vec3);
    points[0][1] -= drop;
    const old = m.geometry;
    m.geometry = tubeGeo(points, 0.003, 0);
    if (owned?.geometry === old) old.dispose();
    activationGeometries.set(m, { geometry: m.geometry, drop });
  },
  name: "CAPS activation cable",
  note: "Mechanical cable from the ceiling T-handle aft along the cabin roof, through the baggage bulkhead to the rocket igniter (SR22T POH 13772-007 7-96; AMM 13773-002 Rev 7 Fig 95-00-1, PDF p. 2853). Pulling the handle takes out slack, exposing approximately two inches (5 cm) of cable, then arms and releases the igniter switch plunger (POH 7-96). Routing and diameter approximate; this is not electrical wiring.",
  pin: true,
});
part(() => box(...IGNITER_SIZE), ["caps"], {
  pos: ROCKET_IGNITER,
  name: "Rocket igniter",
  note: "Electronic igniter at the forward end of the rocket inside the canister (SR22T POH 13772-007 7-95–7-96; AMM 13773-002 Rev 7 95-00, PDF p. 2852; Fig 95-00-1, PDF p. 2853). The activation cable compresses a steel spring and cocks the plunger; one half-inch of plunger travel releases captured ball-bearings so the contacts close and ignite the primary booster (AMM PDF p. 2852). Position and size schematic.",
  pin: true,
});
