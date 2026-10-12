/** CAPS: parachute canister and harness straps. */
import type * as THREE from "three";
import { curveOf, densify } from "@/lib/geometry";
import type { PartAnim } from "@/lib/catalogue";
import { clamp, ease, type Vec3 } from "@/lib/math";
import { AB, FW, box, cyl, onSkin, tubeGeo } from "../geometry";
import { live } from "../model";
import { part } from "./catalogue";
import { CAPS_HANDLE_ATTACH, capsHandleDrop } from "./cabin";

/* ---------- CAPS ---------- */
export const CAPS_BOX: Vec3 = [-0.76, 0.22, 0];
part(() => box(0.4, 0.18, 0.26), ["caps"], {
  pos: CAPS_BOX,
  name: "CAPS canister",
  fairing: true,
  note: "Composite box immediately aft of the baggage-compartment bulkhead, containing the 2,400 ft² canopy in its deployment bag and the solid-propellant extraction rocket. A thin composite cover protects the installation (POH 11934-005 7-97). Housing dimensions and location approximate.",
  pin: true,
});

/**
 * Forward strap path (x, y), canister to firewall: down behind the rear window, then low along the side below the door
 * and above the wing root, then up to the firewall fitting. The SR20 POH (7-98) says only that the straps run just under
 * the fuselage skin to firewall attach points; this side-path shape is illustrative, after the SR22/SR22T AMM
 * Figure 95-00-1. Fitting heights are not surveyed.
 */
const FWD_PATH = [
  [-0.6, 0.3],
  [-0.3, 0.18],
  [0, 0.04],
  [0.35, -0.2],
  [0.7, -0.36],
  [2.05, -0.36],
  [2.3, -0.15],
  [FW, 0.1],
];
/** Lateral inset for the 12 mm model radius and curved shoulder; keep the strap near the skin on the wider cabin too. */
const STRAP_INSET = 0.025;
/** Forward strap centreline on side s (-1 left, +1 right): out of the canister, then under the skin to the firewall. */
export const fwdStrap = (s: number): Vec3[] => [
  [-0.6, 0.3, s * 0.12],
  ...densify(FWD_PATH, 0.03, false).map(([x, y]) => {
    const p = onSkin(x, y, s, 1);
    p.z -= s * STRAP_INSET;
    return p.toArray() as Vec3;
  }),
];
/** Deployment times (s): the rocket fires and starts pulling the bag out, and the lines come taut (`CAPS_PHASES`). */
export const ROCKET_T = 0.3,
  TAUT_T = 1.6;
/**
 * Fraction of each forward strap pulled out through the skin covering at deployment time t, from the canister end toward
 * the firewall (POH 7-98): 0 stowed, 1 fully out when the lines are taut. The POH gives the order, not a rate; this follows
 * the bag's rise, before the canopy starts to inflate at about two seconds (POH 7-99).
 */
export const strapOut = (t: number) => (t < ROCKET_T ? 0 : ease(clamp((t - ROCKET_T) / (TAUT_T - ROCKET_T), 0, 1)));
const strapCurves = new Map<number, THREE.Curve<THREE.Vector3>>();
/** Point (airplane coordinates) where the forward strap on side s leaves the skin when a fraction `out` is pulled out. */
export const strapPeel = (s: number, out: number) => {
  let c = strapCurves.get(s);
  if (!c) strapCurves.set(s, (c = curveOf(fwdStrap(s))));
  return c.getPointAt(out);
};
/** Stowed forward strap: the part still under the skin, ahead of the peel point; gone once the lines are taut. */
const tearOut: PartAnim = (m) => {
  const out = strapOut(live.capsT),
    g = m.geometry as THREE.TubeGeometry,
    { tubularSegments, radialSegments } = g.parameters;
  m.visible = out < 1;
  g.setDrawRange(Math.round(out * tubularSegments) * radialSegments * 6, Infinity);
};
export const HARNESS: Record<"fwdL" | "fwdR" | "aft", Vec3> = {
  fwdL: fwdStrap(-1).at(-1)!,
  fwdR: fwdStrap(1).at(-1)!,
  aft: [AB, 0.2, 0],
};
[-1, 1].forEach((s) =>
  part(() => tubeGeo(fwdStrap(s), 0.012), ["caps"], {
    anim: tearOut,
    name: "Forward harness strap",
    note: "Runs from the canister just under the fuselage skin to a firewall attach point, and pulls through the skin covering when the parachute deploys (POH 7-98). The path along the side, below the door, and the fitting height are illustrative.",
    pin: s > 0,
  }),
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
    // stowed in the canister, so it leaves with the bag
    anim: (m) => {
      m.visible = live.capsT < ROCKET_T;
    },
    name: "Aft harness strap",
    note: "Stowed in the parachute canister; attached to structure at the aft baggage compartment bulkhead (POH 7-98). Snubbed short at first; the snub line is cut eight seconds after deployment (POH 7-99).",
  },
);

/** Mechanical activation, source-backed sequence with illustrative cable routing (POH 7-98). */
export const ROCKET_IGNITER: Vec3 = [-0.589, 0.285, 0.06];
export const CAPS_CABLE: Vec3[] = [
  CAPS_HANDLE_ATTACH,
  [CAPS_HANDLE_ATTACH[0], 0.694, 0],
  [CAPS_HANDLE_ATTACH[0] - 0.06, 0.694, -0.12],
  [0.8, 0.655, -0.12],
  [0.35, 0.56, -0.12],
  [-0.2, 0.48, -0.12],
  [AB, 0.4, -0.12],
  [-0.54, 0.33, -0.12],
  [-0.54, 0.285, 0.06],
  [ROCKET_IGNITER[0] + 0.0175, ROCKET_IGNITER[1], ROCKET_IGNITER[2]],
];
const activationGeometries = new WeakMap<THREE.Mesh, { geometry: THREE.BufferGeometry; drop: number }>();
part(() => tubeGeo(CAPS_CABLE, 0.003, 0), ["caps"], {
  name: "CAPS activation cable",
  pin: true,
  dynamicGeo: true,
  anim: (m) => {
    const drop = capsHandleDrop(live.capsT),
      owned = activationGeometries.get(m);
    if (owned?.drop === drop && owned.geometry === m.geometry) return;
    const points = CAPS_CABLE.map((p) => [...p] as Vec3);
    points[0][1] -= drop;
    const old = m.geometry;
    m.geometry = tubeGeo(points, 0.003, 0);
    if (owned?.geometry === old) old.dispose();
    activationGeometries.set(m, { geometry: m.geometry, drop });
  },
  note: "Mechanical activation cable from the ceiling handle aft along the roof to the rocket igniter. Pulling the handle first takes up approximately two inches of cable slack, then arms and releases the igniter switch plunger (POH 11934-005 7-98). This cable requires human pull force; it is not an aircraft electrical feed. Bends, roof station and diameter schematic. The cited public SR20 AMM copy omits Chapter 95, so internal igniter geometry is not inferred from SR22T instructions.",
});
part(() => box(0.035, 0.03, 0.03), ["caps"], {
  pos: ROCKET_IGNITER,
  name: "Rocket igniter",
  color: "#D7B463",
  pin: true,
  note: "Electronic igniter actuated by the mechanical cable's arming/release of the switch plunger (POH 7-98). Placed schematically within the canister; no detailed spring, contact, power-source or maintenance arrangement is asserted from the unavailable SR20 Chapter 95.",
});
part(() => cyl(0.024, 0.12, "y", 20), ["caps"], {
  pos: [-0.637, 0.24, 0.08],
  color: "#BC855D",
  name: "CAPS extraction rocket",
  pin: true,
  anim: (m) => {
    m.visible = live.capsT < ROCKET_T;
  },
  note: "Solid-propellant rocket stored with the parachute behind the baggage bulkhead; exits upward through the thin composite cover and extracts the parachute assembly outward, then rearward in relative wind (POH 7-97, 7-99). Stowed rocket body and nozzle schematic. In-flight rocket is shown by the deployment overlay.",
});
part(() => box(0.23, 0.12, 0.18), ["caps"], {
  pos: [-0.81, 0.215, -0.025],
  color: "#A49983",
  name: "Parachute deployment bag",
  pin: true,
  anim: (m) => {
    m.visible = live.capsT < ROCKET_T;
  },
  note: "Staged deployment bag prevents canopy inflation until the rocket has pulled the suspension lines taut; the round canopy's annular slider then limits initial inflation and moves down the suspension lines (POH 7-97). Bag shape and packed dimensions schematic; deployed lines and slider are in the deployment overlay.",
});
part(() => box(0.42, 0.006, 0.28), ["caps"], {
  pos: [CAPS_BOX[0], CAPS_BOX[1] + 0.095, CAPS_BOX[2]],
  color: "#B5B9BB",
  name: "CAPS composite cover",
  pin: true,
  fairing: true,
  anim: (m) => {
    m.visible = live.capsT < ROCKET_T;
  },
  note: "Thin composite protective cover over the parachute canister. Rocket trajectory is upward through this cover (POH 7-97). The displayed plate is a schematic enclosure lid; fuselage cover shape and installation dimensions are not surveyed.",
});
part(
  () =>
    tubeGeo(
      [
        [-0.61, 0.255, 0],
        [-0.535, 0.245, 0],
        [AB, 0.2, 0],
      ],
      0.006,
      0,
    ),
  ["caps"],
  {
    name: "Aft riser snub line",
    color: "#9C784A",
    pin: true,
    anim: (m) => {
      m.visible = live.capsT < 8;
    },
    note: "The rear riser is intentionally snubbed short to limit nose-up pitch during opening. Eight seconds after deployment its snub line is cut, allowing the tail to drop into an approximately level hanging attitude (POH 7-99). Only a schematic stowed restraint segment is shown; the deployment overlay represents its released attitude.",
  },
);
part(() => cyl(0.012, 0.04, "x", 12), ["caps"], {
  pos: [-0.555, 0.245, 0],
  name: "CAPS line-cutter assembly",
  color: "#B19562",
  pin: true,
  note: "Functional schematic at the aft snub release; the SR20 AMM airworthiness limitations require replacement of CAPS reefing line cutters every six years (AMM 12137-002 4-00 p. 3, 19 Dec 2019). POH 7-99 specifies the eight-second snub-line cut. Exact cutter count, routing, initiation and mounting detail require the applicable Chapter 95/CAPS component manual; this model does not transplant those details from an SR22T.",
});
for (const [name, at] of [
  ["Forward CAPS firewall fitting (left)", HARNESS.fwdL],
  ["Forward CAPS firewall fitting (right)", HARNESS.fwdR],
  ["Aft CAPS bulkhead fitting", HARNESS.aft],
] as const)
  part(() => box(0.028, 0.04, 0.055).translate(at[2] === 0 ? 0 : -0.016, -0.01, -Math.sign(at[2]) * 0.02), ["caps"], {
    pos: at,
    name,
    color: "#82939D",
    pin: true,
    note: "Three-point CAPS harness structural attachment: two forward straps at the firewall, one aft strap at the aft baggage-compartment bulkhead (POH 7-98). Fitting shapes and attachment heights schematic; the forward strap geometry retains its existing approximate side routing.",
  });
