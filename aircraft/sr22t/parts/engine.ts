/**
 * Propeller and engine (TSIO-550-K): cylinders, plugs, magnetos, governor, oil, induction (air boxes, alternate air),
 * exhaust (crossover heat exchanger, tailpipes), alternators, starter; the turbochargers and intercoolers at the anchors
 * registered in ../turbo-layout.ts and ../intercooler-layout.ts. Positions are approximate unless a note cites a
 * dimensioned Continental M-18 value: the POH and AMM text don't dimension the engine compartment.
 */
import * as THREE from "three";
import { mergeGeos } from "@/lib/geometry";
import type { Vec3 } from "@/lib/math";
import { firingPhase, magAnim, plugAnim } from "@/lib/anims";
import { box, cyl, loft, tubeGeo } from "../geometry";
import { HEAT_X, TAILPIPE as TAILPIPE_RUN, TAILPIPE_RADIUS, EXHAUST_RADIUS, TURBINE_INLET } from "../exhaust-layout";
import {
  AIR_BOX,
  AIR_BOX_BASE_LEN,
  AIR_BOX_BASE_R,
  AIR_BOX_RISE,
  AIR_BOX_SIZE,
  COMPRESSOR_INLET,
  COMPRESSOR_INLET_R,
  GATE_TRANSITION,
  TURBO,
  TURBO_HOUSINGS,
  TURBO_OIL_RES,
  TIT_PROBE,
  WASTEGATE,
  WASTEGATE_ACTUATOR,
} from "../turbo-layout";
import {
  INTERCOOLER,
  INTERCOOLER_AFT,
  INTERCOOLER_AFT_FACE_X,
  INTERCOOLER_AFT_R,
  INTERCOOLER_FRONT_X,
  INTERCOOLER_NECK,
  INTERCOOLER_NECK_LEN,
  INTERCOOLER_NECK_R,
  INTERCOOLER_SIZE,
  DUCT7_R,
  OVERBOOST_SEAT,
} from "../intercooler-layout";
import { ACCESSORY_FACE_X, CRANK_Y, CYL_PITCH, CYL_RIGHT_REAR_X, CYL_STAGGER, IN } from "../engine-datum";
export { CYL_CENTER_X, CYL_PITCH, CYL_STAGGER } from "../engine-datum";
export {
  AIR_BOX,
  COMPRESSOR_INLET,
  COMPRESSOR_OUTLET,
  GATE_TRANSITION,
  TURBO,
  TURBO_OIL_RES,
  TIT_PROBE,
  WASTEGATE,
} from "../turbo-layout";
export {
  COMPRESSOR_DUCT,
  INTERCOOLER,
  INTERCOOLER_AFT,
  INTERCOOLER_IN,
  INTERCOOLER_OUT,
  INTERCOOLER_SEAT,
} from "../intercooler-layout";
import { part, fires, altAnim, altDoorAnim, wastegateAnim } from "./catalogue";

/* ---------- propeller (78 in., 3 blade) ---------- */
export const PROP: Vec3 = [3.8, CRANK_Y, 0];
/** Blade tip radius: 78.0 in. diameter (POH 1-7, 2-8) → 39 in. = 0.991 m. The blade outline is drawn to a 0.94 m tip and scaled. */
const BLADE_TIP = 0.991;
const bladeGeo = () => {
  const sh = new THREE.Shape();
  sh.moveTo(-0.06, 0.12);
  sh.quadraticCurveTo(-0.09, 0.5, -0.045, 0.94);
  sh.lineTo(0.03, 0.94);
  sh.quadraticCurveTo(0.075, 0.5, 0.06, 0.12);
  sh.lineTo(-0.06, 0.12);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: false });
  g.scale(BLADE_TIP / 0.94, BLADE_TIP / 0.94, 1);
  g.translate(0, 0, -0.009);
  g.rotateY(Math.PI / 2);
  return g;
};
for (let i = 0; i < 3; i++)
  part(bladeGeo, ["propeller", "engine"], {
    parent: "blade:" + i,
    color: "#3A4148",
    name: "Propeller blade",
    note: "Hartzell Compact Series lightweight hub, composite blades, three-blade constant speed, 78.0 in. (PHC-J3Y1F-1N/N7605(B) or N7605C(B), POH 1-7, 2-8). Non-feathering (AMM 61-00).",
    ext: true,
    groups: [],
  });

/* ---------- engine (TSIO-550-K, inside the cowl) ---------- */
const EY = -0.16;
/** Exhaust crossover heat exchanger (AMM 21-40, Fig 21-40-2); the crossover runs straight through it. */
export { HEAT_X } from "../exhaust-layout";
/** Throttle body on top of the engine (top induction, POH 7-31). */
export const THROTTLE: Vec3 = [3.36, 0.06, 0];
/** Drawn throttle body: a Ø0.1 × 0.12 m cylinder along x, approximate (undimensioned in POH 7-31 / AMM Fig 71-00-2). */
export const THROTTLE_R = 0.05;
export const THROTTLE_LEN = 0.12;
/** Alternate air assembly, lower front of the engine (POH 7-37). */
export const ALT_AIR: Vec3 = [3.46, -0.42, 0];
/** Propeller governor, on the lower left forward portion of the crankcase (AMM 61-20; position approximate); the oil circuit ends here. */
export const GOV: Vec3 = [3.58, -0.24, -0.09];
/** Crankcase box centre and size; its right face carries ALT 1's drive pad (AMM 13773-002 Rev 7 Fig 24-30-3, PDF p. 714), its left face the ALT 2 bracket. */
export const CRANKCASE: Vec3 = [3.15, EY, 0];
export const CRANKCASE_SIZE: Vec3 = [0.8, 0.28, 0.3];
part(() => box(...CRANKCASE_SIZE), ["engine"], {
  pos: CRANKCASE,
  name: "Continental TSIO-550-K",
  note: "Six-cylinder, horizontally opposed, twin-turbocharged, fuel-injected, 550 cu in. 315 bhp at 2500 RPM; 2000-hour TBO; six-point steel mount (POH 7-31). Size approximate.",
  pin: true,
  groups: [],
});
/** Anchor for flows.ts. */
export const OIL_SUMP: Vec3 = [3.12, -0.38, 0];
part(() => box(0.6, 0.12, 0.28), ["engine"], {
  pos: OIL_SUMP,
  name: "Oil sump",
  note: "Wet sump, 8 quart capacity (SR22T POH 13772-007 1-8, 7-36). Contains the suction screen / pickup; gravity return from engine galleries (AMM 13773-002 Rev 7 79-00 PDF p. 2764). Filler cap/dipstick at the left rear, door on the top left of the cowling (POH 7-37).",
  groups: ["oil"],
});
// Cylinder pitch, stagger and station: Continental M-18 Fig 5-34 (PDF p. 149), registered in ../engine-datum.ts.
// Preserve registration order: part ids and label ownership depend on it.
export const CYLS = [
  { n: 5, x: CYL_RIGHT_REAR_X + 2 * CYL_PITCH, s: 1 },
  { n: 6, x: CYL_RIGHT_REAR_X + 2 * CYL_PITCH + CYL_STAGGER, s: -1 },
  { n: 3, x: CYL_RIGHT_REAR_X + CYL_PITCH, s: 1 },
  { n: 4, x: CYL_RIGHT_REAR_X + CYL_PITCH + CYL_STAGGER, s: -1 },
  { n: 1, x: CYL_RIGHT_REAR_X, s: 1 },
  { n: 2, x: CYL_RIGHT_REAR_X + CYL_STAGGER, s: -1 },
];
/**
 * External shapes remain illustrative (AMM Fig 71-00-2 / 72-00-2; M-18
 * Fig 5-34 and D-8). The 5.25-in. BORE is internal (M-18 Table 2-1), not
 * the fin diameter. Neither source dimensions the outside fins or barrel
 * length. Keep the existing 0.17-m barrel diameter; the drawn length ends at the head (`CYL_BARREL_END`);
 * fit fins and head width inside the documented pitch with 5% visual clearance,
 * rather than overlapping adjacent cylinders. This is a display envelope,
 * not a measured Continental cylinder dimension.
 */
export const CYL_ENVELOPE = CYL_PITCH * 0.95;
/** Engine firing order (AMM 13773-002 Rev 7 Fig 74-20-2 PDF p. 2625). */
export const FIRING_ORDER = [1, 6, 3, 2, 5, 4] as const;
/** Origin of the `cyl:<n>` group Airplane.tsx draws each cylinder in; part positions on a cylinder are relative to it. */
export const cylOrigin = (c: { x: number; s: number }): Vec3 => [c.x, CRANK_Y, c.s * 0.25];
/** Translate an illustrative local attachment offset through the shared cylinder anchor. */
export const cylPoint = (c: { x: number; s: number }, offset: Vec3): Vec3 => {
  const origin = cylOrigin(c);
  return [origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]];
};
/** Upper intake and lower exhaust: AMM Fig 71-00-2 / 72-00-2; M-18 Fig 5-34.
 * Intake retains the drawn manifold endpoint; exhaust seats on the lower head face.
 * Both are illustrative, not dimensioned port locations. */
export const cylIntake = (c: { x: number; s: number }): Vec3 => cylPoint(c, [0, 0.09, c.s * 0.05]);
export const cylExhaust = (c: { x: number; s: number }): Vec3 => {
  const head = cylHeadOffset(c);
  return cylPoint(c, [head[0], head[1] - CYL_HEAD_SIZE[1] / 2, head[2]]);
};
/**
 * Head: the rocker covers span 1.76 in. above to 4.26 in. below the crankshaft CL (scaled, Continental M-18 Fig 5-35
 * p. 5-55), so the head sits low enough for the intercooler base above it. The plugs, nozzle and exhaust
 * port follow it. Its inboard face meets the barrel's outer end (`CYL_BARREL_END`), which leaves the upright upper plug
 * and nozzle room between the barrel and the intercooler's inner edge. Width and depth are illustrative
 * (AMM Fig 72-00-2 PDF 2574 / M-18 Fig 5-34 p. 5-54).
 */
export const CYL_HEAD_TOP = CRANK_Y + 1.76 * IN;
export const CYL_HEAD_BOTTOM = CRANK_Y - 4.26 * IN;
/** Barrel span from the crankcase out to the head, distance from the crankshaft CL; the drawn length is illustrative. */
export const CYL_BARREL_START = 0.15;
export const CYL_BARREL_END = 0.335;
/** Head outboard face, distance from the crankshaft CL. */
const CYL_HEAD_OUTER = 0.415;
export const CYL_HEAD_SIZE: Vec3 = [CYL_ENVELOPE, CYL_HEAD_TOP - CYL_HEAD_BOTTOM, CYL_HEAD_OUTER - CYL_BARREL_END];
export const cylHeadOffset = (c: { s: number }): Vec3 => [
  0,
  (CYL_HEAD_TOP + CYL_HEAD_BOTTOM) / 2 - CRANK_Y,
  c.s * ((CYL_HEAD_OUTER + CYL_BARREL_END) / 2 - cylOrigin({ x: 0, s: 1 })[2]),
];
/** Upper head nozzle, based on AMM Fig 71-00-2 sheet 1 (PDF p. 2487); POH 7-38 / AMM 73-00 PDF p. 2582 describe
 * six nozzles but neither locates nor angles them. Continental M-18 (21 Sep 2017) p. 2-1 puts one "at each cylinder
 * intake port" and Fig 17-39 (K/N fuel injection system, p. 17-71) shows each nozzle threaded vertically into the top
 * of its cylinder, fed from above. So the nozzle sits upright at the head's inboard (intake) edge, its base 5 mm into
 * the head top. Offset, radius (0.012 m) and length (0.03 m) are illustrative, not document dimensions.
 */
export const injectorOffset = (c: { s: number }): Vec3 => [0, CYL_HEAD_TOP - CRANK_Y + 0.01, c.s * 0.11];
/** Nozzle centre in airplane coordinates, shared by the part and its fuel line. */
export const injectorAnchor = (c: { x: number; s: number }): Vec3 => cylPoint(c, injectorOffset(c));
/** Uniform 50 mm illustrative plug envelope, shortened for the integrated turbo installation;
 * AMM Fig 74-20-1 Detail B PDF p. 2624, Fig 71-00-2 items 23/35 PDF pp. 2489–2490 give no dimensions. */
export const PLUG_LENGTH = 0.05;
/** Upper/lower head faces (AMM Fig 74-20-2 PDF p. 2625; POH 7-37).
 * Keep upper plugs away from the nozzles and lower bosses inside their own
 * head footprints, with 2 mm drawn hex-edge clearance. Lower bosses remain
 * 15 mm inboard of the head centre and forward, clear of the exhaust risers.
 * Cylinder 2's aft-footprint exception is gone with the LH turbine approach it
 * cleared (The turbos sit aft of every cylinder). Upper plugs sit
 * `UPPER_PLUG_INBOARD` toward the intake edge, between the barrel's outer end
 * and the intercooler's inner edge. These undimensioned placements and
 * the 10 mm seating depth are illustrative (AMM Fig 74-20-1 PDF p. 2624;
 * Fig 71-00-2 items 23/35 PDF pp. 2489–2490), not source measurements. */
export const UPPER_PLUG_INBOARD = 0.019;
export const plugOffset = (c: { s: number; n: number }, pos: "U" | "L"): Vec3 => {
  const head = cylHeadOffset(c);
  return [
    head[0] + (pos === "U" ? -CYL_HEAD_SIZE[0] / 4 : CYL_HEAD_SIZE[0] / 2 - 0.02),
    head[1] + (pos === "U" ? 1 : -1) * (CYL_HEAD_SIZE[1] / 2 + PLUG_LENGTH / 2 - 0.01),
    head[2] - c.s * (pos === "L" ? 0.015 : UPPER_PLUG_INBOARD),
  ];
};
/** Magneto firing a plug: the right magneto fires the lower right and upper left plugs, the left the others (POH 7-37). */
export const plugMagneto = (c: { s: number }, pos: "U" | "L"): "R" | "L" => (c.s > 0 === (pos === "L") ? "R" : "L");
/** Magneto body length and radius. The length is inferred from the undimensioned M-18 Fig 5-33 LH side view (p. 5-53),
 * where the magnetos fill the box from the accessory mounting face to 2.8–3.6 in. forward of it; illustrative. */
export const MAGNETO_LEN = 0.09;
export const MAGNETO_R = 0.05;
/** Right and left magneto centres, side by side on horizontal fore-aft axes. Each mounting flange and drive coupling is
 * aft, piloted into the accessory case at the accessory mounting face; the distributor (harness) cap is forward and its
 * leads leave forward (AMM 74-00 PDF p. 2604; Fig 74-10-2 PDF p. 2618; Fig 74-20-1 Detail A PDF p. 2624; Fig 71-00-2
 * sheet 2 items 19, 20 PDF p. 2488; Continental M-18 Fig 10-8 item 9 p. 10-21). Pad centres 2.7 in. either side of the
 * centreline (M-18 Fig 5-33 rear view, scaled); height approximate. */
export const MAGNETO = (mag: "R" | "L"): Vec3 => [
  ACCESSORY_FACE_X + MAGNETO_LEN / 2,
  0.02,
  (mag === "R" ? 1 : -1) * 2.7 * IN,
];
/** Aft drive end, on the accessory mounting face, and forward cap end of a magneto body, on its axis. */
export const MAGNETO_DRIVE_END = (mag: "R" | "L"): Vec3 => [ACCESSORY_FACE_X, MAGNETO(mag)[1], MAGNETO(mag)[2]];
export const MAGNETO_CAP_END = (mag: "R" | "L"): Vec3 => [
  ACCESSORY_FACE_X + MAGNETO_LEN,
  MAGNETO(mag)[1],
  MAGNETO(mag)[2],
];
CYLS.forEach((c) => {
  const parent = "cyl:" + c.n;
  const barrel = CYL_BARREL_END - CYL_BARREL_START;
  part(() => cyl(0.085, barrel, "z", 18), ["engine"], {
    parent,
    pos: [0, 0, c.s * ((CYL_BARREL_START + CYL_BARREL_END) / 2 - cylOrigin(c)[2] * c.s)],
    color: "#7C858C",
    name: "Cylinder " + c.n,
    note:
      (c.s > 0 ? "Right" : "Left") +
      " bank, numbered from the rear (AMM Fig 74-20-2 PDF p. 2625). Cooling fins; aluminum baffles direct the cooling air over them, no cowl flaps (POH 7-38).",
  });
  for (let k = -2; k <= 2; k++)
    part(() => cyl(CYL_ENVELOPE / 2, 0.01, "z", 18), ["engine"], { parent, pos: [0, 0, k * 0.035], color: "#8C959C" });
  part(() => box(...CYL_HEAD_SIZE), ["engine"], {
    parent,
    pos: cylHeadOffset(c),
    color: "#6A737A",
    name: "Cylinder head " + c.n,
    note: "Outboard head, upper intake and lower exhaust (AMM Fig 72-00-2 PDF p. 2574; Continental M-18 Fig 5-34 p. 5-54). Two spark plugs, CHT probe, fuel injector nozzle; EGT probe in the exhaust pipe (POH 7-35, 7-37, 7-38). Shape and attachment offsets illustrative; fin diameter and head width fit within the documented 7.31-in. cylinder pitch.",
  });
  part(() => cyl(0.012, 0.03, "y"), ["engine", "fuel"], {
    parent,
    pos: injectorOffset(c),
    color: "#B89B52",
    name: "Fuel injector nozzle, cyl " + c.n,
    note: "One continuous-flow injector nozzle at each cylinder, fed by the fuel manifold valve (SR22T POH 13772-007 7-38; AMM 13773-002 Rev 7 73-00 PDF p. 2582). Upper head placement follows Fig 71-00-2 sheet 1 (PDF p. 2487). Upright, at the intake port, per Continental M-18 p. 2-1 and Fig 17-39 (p. 17-71), where the Cirrus documents are silent. Size, brass colour and exact position approximate; the documents do not dimension the nozzle boss.",
    groups: ["fuel"],
  });
  (["U", "L"] as const).forEach((pos) => {
    const mag = plugMagneto(c, pos);
    part(
      () => {
        const sign = pos === "U" ? 1 : -1;
        return mergeGeos([
          cyl(0.012, 0.012, "y", 12).translate(0, -sign * (PLUG_LENGTH / 2 - 0.006), 0),
          cyl(0.018, 0.018, "y", 6).translate(0, -sign * (PLUG_LENGTH / 2 - 0.015), 0),
          cyl(0.014, PLUG_LENGTH - 0.018, "y", 12).translate(0, sign * 0.009, 0),
        ]);
      },
      ["engine"],
      {
        parent,
        pos: plugOffset(c, pos),
        color: "#DADFE2",
        // both plugs of a cylinder flash together, the cylinders in firing order, one at a time (timing illustrative)
        anim: plugAnim(fires(mag), firingPhase(FIRING_ORDER, c.n), Math.cos(Math.PI / FIRING_ORDER.length)),
        name: `Spark plug — cyl ${c.n} ${pos === "U" ? "upper" : "lower"}`,
        note: `Fired by the ${mag === "R" ? "right" : "left"} magneto (POH 7-37). Shielded, like the harness (AMM 74-00 PDF p. 2604). Upper/lower head faces per AMM Fig 71-00-2 items 23, 35 (PDF pp. 2489–2490), Fig 74-20-1 (PDF p. 2624). Hex, barrel size (0.036 m across; 0.050 m overall envelope), vertical boss angle and seating position illustrative, not measured dimensions. Firing order 1-6-3-2-5-4 (AMM Fig 74-20-2 PDF p. 2625).`,
        groups: ["ignition"],
      },
    );
  });
});
const MAGNETO_COMMON =
  "Drive coupling aft into the accessory case, distributor cap and lead outlets forward (AMM Fig 74-20-1 Detail A PDF p. 2624; Fig 74-10-2 PDF p. 2618). Impulse coupling for engine starting (AMM 74-00 PDF p. 2604). Pressurized from the upper-deck reference through the desiccant filter (AMM 74-00 PDF p. 2604; Fig 74-10-2 PDF p. 2618).";
part(() => cyl(MAGNETO_R, MAGNETO_LEN, "x"), ["engine"], {
  pos: MAGNETO("R"),
  color: "#3E4A52",
  anim: magAnim(fires("R")),
  name: "Right magneto",
  note: `Fires the lower right and upper left plugs (POH 7-37); AMM 74-00 PDF p. 2604 says upper right and lower left; POH governs. ${MAGNETO_COMMON} Also the tachometer's RPM pickup (POH 7-35).`,
  pin: true,
  groups: ["ignition"],
});
part(() => cyl(MAGNETO_R, MAGNETO_LEN, "x"), ["engine"], {
  pos: MAGNETO("L"),
  color: "#3E4A52",
  anim: magAnim(fires("L")),
  name: "Left magneto",
  note: `Fires the lower left and upper right plugs (POH 7-37); AMM 74-00 PDF p. 2604 says upper left and lower right; POH governs. ${MAGNETO_COMMON}`,
  pin: true,
  groups: ["ignition"],
});
part(() => box(0.1, 0.09, 0.12), ["engine", "propeller"], {
  pos: GOV,
  color: "#C0602F",
  name: "Propeller governor",
  note: "Engine-driven RPM sensor and high-pressure oil pump. No cockpit control: factory-set to 2500 RPM (AMM 61-20, POH 7-32). Oil pressure to the hub piston twists the blades to high pitch; without it the spring and centrifugal force take them to low pitch (POH 7-39).",
  pin: true,
  groups: [],
});
/** Oil cooler centre: the Continental M-18 Fig 5-33 sheet 1 rear view (p. 5-53, PDF p. 148) puts the
 * cooler from 6.5 in. above to 2.9 in. below the crankshaft CL and 5.4–13.9 in. left of it (scaled against the
 * 17.02-in. dimension on that view, ±0.5 in.). The fore-aft station is approximate: the rear view does not give it. */
export const OIL_COOLER: Vec3 = [2.745, CRANK_Y + ((6.5 - 2.9) / 2) * IN, -((5.4 + 13.9) / 2) * IN];
/** Illustrative box, smaller than the scaled 8.5 × 9.4 in. face so it clears the oil filter inboard of it, the MCU heat
 * shield aft and the left lower ignition leads forward; the depth is undimensioned. */
export const OIL_COOLER_SIZE: Vec3 = [0.06, 0.14, 0.12];
part(() => box(...OIL_COOLER_SIZE), ["engine"], {
  pos: OIL_COOLER,
  color: "#9A6A48",
  name: "Oil cooler",
  note: "Engine mounted, at the aft end; the oil temperature and pressure sensors are below it (POH 7-35, 7-36; AMM 79-30). Temperature control valve bypasses it below approximately 180 °F (82 °C) (POH 7-36). Left rear per AMM 13773-002 Rev 7 Fig 71-00-2 sheet 3 item 32 (PDF p. 2489); turbo oil leaves its bottom (SR22T POH 13772-007 7-38). Centre height and lateral from the Continental M-18 Fig 5-33 rear view (p. 5-53, PDF p. 148): 6.5 in. above to 2.9 in. below the crankshaft, 5.4–13.9 in. left of it (scaled). Size and fore-aft station approximate.",
  groups: ["oil"],
});
/** The two filter elements the air box houses ("air boxes which house dual air filters", AMM 71-60 PDF p. 2542; Fig 71-60-2
 * sheet 1 item 2): side-by-side panels across the airflow in the box's forward half. Panel size and spacing approximate. */
export const AIR_FILTER_PANEL: Vec3 = [0.012, 0.055, 0.034];
export const AIR_FILTER_OFFSET = (k: number): Vec3 => [AIR_BOX_SIZE[0] / 4, 0, k * 0.0205];
/** Housing wall, approximate: the box is drawn as a hollow shell so its filter elements sit in a real cavity. */
const AIR_BOX_WALL = 0.003;
/** Hollow filter body (outer box plus the inward-facing cavity) and the round base on the inlet axis (Fig 71-60-2 sheet
 * 1 items 1, 3); local to `AIR_BOX`. The housing ghosts in X-ray (`fairing`), so its two filter elements show. */
const airBoxGeo = () =>
  mergeGeos([
    box(...AIR_BOX_SIZE),
    box(...(AIR_BOX_SIZE.map((v) => v - 2 * AIR_BOX_WALL) as Vec3)).scale(-1, 1, 1),
    cyl(AIR_BOX_BASE_R, AIR_BOX_BASE_LEN, "x", 24).translate(
      -AIR_BOX_SIZE[0] / 2 + AIR_BOX_BASE_LEN / 2,
      -AIR_BOX_RISE,
      0,
    ),
  ]);
[1, -1].forEach((s) => {
  part(airBoxGeo, ["engine"], {
    pos: AIR_BOX(s),
    color: "#C9B98F",
    name: "Air box / induction filter",
    note: `${s > 0 ? "Right" : "Left"} side, behind the NACA duct in the lower cowl, clamped straight onto the forward-facing compressor inlet (AMM 13773-002 Rev 7 Fig 81-20-1 PDF p. 2815 items 1/3). The air boxes house dual air filters (AMM 71-60 PDF p. 2542; Fig 71-60-2 PDF pp. 2557–2558): the housing ghosts in X-ray to show the two elements. The inlet duct clamps onto its forward face and the alternate air tube onto its inboard face (Fig 71-60-2 sheet 1). Induction air is filtered here, then enters the turbocharger compressor (POH 7-37). Its round base covers the whole Ø3.00-in. inlet (Fig 71-60-2 sheet 1 item 3); the filter body is raised 0.03 m above the inlet axis to fit the lower cowl. Sizes illustrative.`,
    pin: true,
    fairing: true,
    groups: ["induction"],
  });
  for (const k of [-1, 1])
    part(() => box(...AIR_FILTER_PANEL), ["engine"], {
      pos: AIR_BOX(s).map((v, i) => v + AIR_FILTER_OFFSET(k)[i]) as Vec3,
      color: "#E8DFC0",
      name: "Air filter element",
      note: `${s > 0 ? "Right" : "Left"} air box, ${k * s > 0 ? "outboard" : "inboard"} element of the dual air filters (AMM 13773-002 Rev 7 71-60 PDF p. 2542; Fig 71-60-2 sheet 1 PDF p. 2557 item 2). Shape and size approximate.`,
      groups: ["induction"],
    });
});
/** Full-flow oil filter. The spin-on canister stands VERTICALLY on the upward boss of the filter
 * adapter bolted to the oil pump housing (Continental M-18 Fig 13-10 p. 13-13, PDF p. 374, items 21–23), directly
 * below the A/C drive unit and compressor. The M-18 Fig 5-33 rear view (p. 5-53, PDF p. 148) dimensions its top
 * 2.42 in. above the crankshaft CL, with 0.56 in. removal clearance above it; its bottom about 2.1 in. below the CL,
 * Ø ≈ 3.65 in. and centre about 4.0 in. left of the CL are scaled (±0.3 in.). The fore-aft station is approximate: no
 * view gives it (aft of the pump housing, inside the firewall). */
export const OIL_FILTER_R = (3.65 / 2) * IN;
export const OIL_FILTER_TOP_Y = CRANK_Y + 2.42 * IN;
export const OIL_FILTER_LEN = (2.42 + 2.1) * IN;
export const OIL_FILTER: Vec3 = [2.68, OIL_FILTER_TOP_Y - OIL_FILTER_LEN / 2, -4.0 * IN];
/** Filter adapter (M-18 Fig 13-10 items 21, 23): a block under the canister reaching forward to the pump housing's aft
 * face (x 2.745, engine-oil.ts OIL_PUMP). Drawn 0.03 m deep, above the schematic throttle cable; Fig 5-33 (scaled) shows
 * its neck to about 4.3 in. below the CL. Approximate. */
export const OIL_FILTER_ADAPTER_SIZE: Vec3 = [0.06, 0.03, 0.056];
export const OIL_FILTER_ADAPTER: Vec3 = [
  2.745 - OIL_FILTER_ADAPTER_SIZE[0] / 2,
  OIL_FILTER_TOP_Y - OIL_FILTER_LEN - OIL_FILTER_ADAPTER_SIZE[1] / 2,
  OIL_FILTER[2],
];
part(() => cyl(OIL_FILTER_R, OIL_FILTER_LEN, "y", 24), ["engine"], {
  pos: OIL_FILTER,
  color: "#1F3A5A",
  name: "Oil filter (full-flow)",
  note: "Full-flow spin-on disposable filter (SR22T POH 13772-007 7-31, 7-36); bypass relief valve permits unfiltered oil if the element blocks (AMM 13773-002 Rev 7 79-00 PDF p. 2764). Vertical, on the adapter on the oil pump housing (Continental M-18 Fig 13-10 p. 13-13, PDF p. 374), at the left rear (AMM Fig 71-00-2 sheet 3 item 27 PDF p. 2489) directly below the A/C drive unit and compressor (operator observation of the modelled airplane; SR22 aft view Fig 71-00-1 sheet 2 item 14 PDF p. 2484). Top 2.42 in. above the crankshaft with 0.56 in. removal clearance (M-18 Fig 5-33 PDF p. 148, dimensioned); diameter, lateral and fore-aft station scaled or approximate.",
  pin: true,
  groups: ["oil"],
});
part(() => box(...OIL_FILTER_ADAPTER_SIZE), ["engine"], {
  pos: OIL_FILTER_ADAPTER,
  color: "#5B6670",
  name: "Oil filter adapter",
  note: "Bolted with a gasket to the oil pump housing; the spin-on filter stands on its upward boss (Continental M-18 Fig 13-10 p. 13-13, PDF p. 374, items 21–23; Fig 5-33 PDF p. 148). Shape and size approximate.",
  groups: ["oil"],
});
part(() => cyl(THROTTLE_R, THROTTLE_LEN, "x"), ["engine", "fuel"], {
  pos: THROTTLE,
  color: "#7E8A93",
  name: "Throttle body / fuel-metering valve",
  note: "Engine-mounted throttle body on top of the engine (top induction, POH 7-31). The power lever's mechanical cable (AMM 13773-002 Rev 7 Fig 76-10-2 PDF p. 2665) opens its butterfly and the fuel-metering valve on it meters more fuel to the fuel manifold (POH 7-32, 7-38). The MAP sensor is in the induction manifold near the throttle body (POH 7-36; AMM Fig 77-10-4).",
  pin: true,
  groups: ["induction", "fuel"],
});
part(() => box(0.06, 0.08, 0.16), ["engine"], {
  pos: ALT_AIR,
  color: "#E0B040",
  anim: altDoorAnim(ALT_AIR[0]),
  name: "Alternate air assembly",
  note: "Lower front of the engine, with a tube to each air box. Its door is held closed by magnets; if the induction is blocked, engine suction opens it and draws unfiltered air from inside the cowl, and its switch raises ALT AIR OPEN on the PFD (POH 7-37, 3A-11; AMM 71-60). A heat-exchanger blast tube keeps the flap from freezing (AMM 13773-002 Rev 7 71-60 PDF p. 2542; Fig 71-60-2 PDF p. 2557). There is no pilot control.",
  pin: true,
  groups: ["induction"],
});
part(() => cyl(0.06, 0.2, "z"), ["environment", "engine"], {
  pos: HEAT_X,
  color: "#E0522B",
  fairing: true,
  name: "Exhaust crossover / heat exchanger",
  note: "The crossover tube joins the LH and RH exhaust header assemblies below the engine, near the aft RH side of the oil pan; the heat exchanger around it heats ram air from the intercoolers' rear ports for the cabin (AMM 78-00, Fig 21-40-2; POH 7-64). There are no mufflers (AMM 78-20).",
  groups: ["exhaust"],
});
/** Anchor for flows.ts. */
export const TAILPIPE = (s: number): Vec3 => TAILPIPE_RUN(s).at(-1)!;
[1, -1].forEach((s) =>
  part(() => tubeGeo(TAILPIPE_RUN(s), TAILPIPE_RADIUS), ["engine"], {
    color: "#8A5A3C",
    name: "Tailpipe",
    note: `${s > 0 ? "Right" : "Left"} turbocharger's continuous tailpipe, swept aft and down through a lower-cowl opening; the LH pipe also receives the wastegate outlet. Geometry approximate, no installation angle is specified (POH 13772-007 7-38; AMM 13773-002 Rev 7 Fig 78-20-4 PDF p. 2756). Turbocharger connection uses a clamped butt joint (AMM 78-00 PDF p. 2732).`,
    ext: true,
    groups: ["exhaust"],
  }),
);
// Turbo stations: Continental M-18 drawing 657645, Fig 5-33 sheet 1 p. 5-53 (PDF p. 148) and Fig 5-35 sheet 3 p. 5-55
// (PDF p. 150), registered in ../turbo-layout.ts; AMM 13773-002 Rev 7 Fig 81-20-1 (PDF p. 2815), Fig 71-60-2
// (PDF pp. 2557–2558), Fig 71-00-2 sheets 1–2 (PDF pp. 2487–2488).
const turboGeo = () =>
  mergeGeos(TURBO_HOUSINGS.map((h) => cyl(h.r, h.x1 - h.x0, "x", 24).translate((h.x0 + h.x1) / 2, 0, 0)));
/** Core box, pyramid transition to the round forward neck and its spigot, and the aft-hood nozzle, about the core centre
 * (../intercooler-layout.ts; AMM Fig 71-60-2 sheet 2 item 18 shape). */
const intercoolerGeo = (s: number) => {
  const c = INTERCOOLER(s),
    [, hy, hz] = INTERCOOLER_SIZE(s).map((v) => v / 2),
    neck = INTERCOOLER_NECK(s),
    aft = INTERCOOLER_AFT(s),
    n = 32;
  const rings = [0, 1].map((k) =>
    Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n,
        cos = Math.cos(a),
        sin = Math.sin(a);
      if (k === 1)
        return new THREE.Vector3(
          neck[0] - c[0],
          neck[1] - c[1] + INTERCOOLER_NECK_R * cos,
          neck[2] - c[2] + INTERCOOLER_NECK_R * sin,
        );
      const r = 1 / Math.max(Math.abs(cos) / hy, Math.abs(sin) / hz);
      return new THREE.Vector3(INTERCOOLER_FRONT_X(s) - c[0], r * cos, r * sin);
    }),
  );
  const nozzleLen = INTERCOOLER_AFT_FACE_X - aft[0] + 0.005;
  return mergeGeos([
    box(...INTERCOOLER_SIZE(s)),
    loft(rings),
    cyl(INTERCOOLER_NECK_R, INTERCOOLER_NECK_LEN, "x", 20).translate(
      neck[0] + INTERCOOLER_NECK_LEN / 2 - c[0],
      neck[1] - c[1],
      neck[2] - c[2],
    ),
    cyl(INTERCOOLER_AFT_R, nozzleLen, "x", 20).translate(aft[0] + nozzleLen / 2 - c[0], aft[1] - c[1], aft[2] - c[2]),
  ]);
};
for (const side of [-1, 1]) {
  const name = side < 0 ? "LH" : "RH";
  part(turboGeo, ["engine"], {
    pos: TURBO(side),
    color: "#AD7656",
    name: name + " turbocharger",
    pin: true,
    note: "Exhaust drives the turbine and a common shaft drives the compressor; hot compressed air goes to the intercooler (POH 7-38; AMM 81-20 PDF p. 2812). Oil supply from the oil cooler; TIT probe in the turbine inlet (AMM 79-00 PDF p. 2764, 77-20 PDF p. 2706). Low in the aft engine, shaft fore-and-aft: turbine housing aft face 3.97 in. forward of the accessory mounting face and the shaft 14.8 in. below the crankshaft (Continental M-18 Fig 5-33 / 5-35, dimensioned); centre housing (oil inlet) ≈7.5 in. and the turbine inlet / TIT ≈5 in. forward of that face (scaled); compressor forward, its Ø3.00-in. inlet clamped to the air box (AMM Fig 81-20-1 PDF 2815); turbine aft. Housing sizes illustrative.",
    groups: ["induction", "exhaust"],
  });
  part(() => intercoolerGeo(side), ["engine", "environment"], {
    pos: INTERCOOLER(side),
    color: "#7BABB4",
    name: name + " intercooler",
    pin: true,
    note: "Cools compressed air before the Y junction and throttle body (POH 7-37). A long, flat fore-and-aft box screwed down on top of the side baffle over its bank's rocker covers, on a seal, with a pyramid transition forward to the outlet duct and the compressor duct entering the aft hood from below (AMM 13773-002 Rev 7 Fig 71-60-2 sheet 2 PDF p. 2558 items 14, 16, 18, 21; 71-60 PDF p. 2555; Fig 71-00-2 sheets 1–2 PDF pp. 2487–2488). Core 12.28 in. (RH) / 11.54 in. (LH) long, outer edge 21.15 in. (RH) / 21.23 in. (LH) from the crankshaft CL (Continental M-18 Fig 5-34 p. 5-54, dimensioned); height and inner edge scaled (Fig 5-33 / 5-35). The aft-hood nozzle (item 19), 18.13 in. outboard and 3.75 in. above the crankshaft CL (Fig 5-33, dimensioned), supplies the cabin heat exchanger's ram air (POH 7-64). Transition and nozzle sizes illustrative.",
    groups: ["induction"],
  });
  part(() => cyl(0.009, 0.06, "z"), ["engine"], {
    pos: TIT_PROBE(side),
    color: "#E6D580",
    name: "TIT probe — " + name,
    pin: true,
    note: "One probe inserted sideways into each turbine inlet duct (POH 1-12, 7-35; AMM 81-20 PDF 2812, 77-20 PDF 2706, Fig 77-20-3 PDF 2716). Boss 5.3 in. (LH) / 5.6 in. (RH) forward of the accessory mounting face and 9.35 in. below the crankshaft (Continental M-18 Fig 5-33 / 5-35, scaled). Boss tilt not modelled.",
    groups: ["sensors"],
  });
  part(() => box(0.03, 0.02, 0.04), ["engine"], {
    pos: TURBO_OIL_RES(side),
    color: "#897348",
    name: name + " turbo oil reservoir",
    pin: true,
    note: "Under each turbo's centre housing (AMM Fig 81-20-1 PDF 2815 item 2); scavenge return to the rear crankcase (AMM 79-00 PDF p. 2764). Shape approximate.",
    groups: ["oil"],
  });
}
// Upper firewall, AMM 13773-002 Rev 7 Fig 71-00-2 sheet 3 item 30 (PDF 2489). Undimensioned: approximate. Seated
// on the firewall just right of the centreline, inboard of the A/C belt and clutch pulley, which hang in the firewall
// bay at their AMM station (AMM Fig 21-50-1 sheet 2 PDF p. 520), and below the magneto P-leads and
// the cowl. Box 0.055 × 0.06 × 0.09 m, approximate.
export const GATE_CONTROLLER: Vec3 = [2.6405, 0.11, 0.06];
export const GATE_CONTROLLER_SIZE: Vec3 = [0.055, 0.06, 0.09];
/** Overboost valve body centre: bolted to the forward face of the LH duct 7 at its seat (AMM Fig 71-60-2 sheet 2
 * items 17/20), axis fore-and-aft, its aft face seated 6 mm into the duct wall; body Ø0.05 × 0.05 m, approximate. */
const OVERBOOST_LEN = 0.05;
export const OVERBOOST: Vec3 = [
  OVERBOOST_SEAT[0] + DUCT7_R + OVERBOOST_LEN / 2 - 0.006,
  OVERBOOST_SEAT[1],
  OVERBOOST_SEAT[2],
];
export const TURBO_SCAVENGE: Vec3 = [2.74, -0.29, 0.14];
part(() => cyl(0.05, 0.07, "z"), ["engine"], {
  pos: WASTEGATE,
  color: "#C39660",
  name: "Wastegate",
  pin: true,
  anim: wastegateAnim,
  note: 'Single oil-pressure-actuated gate on the LH tailpipe sets exhaust flow through the turbines (POH 7-38; AMM 81-20 PDF p. 2812). Oil pressure on the actuator piston closes it; with the engine stopped the spring holds it open (Teledyne Continental Motors Overhaul Manual excerpt, section 81-20 "Hydraulic Wastegate", page 81-04 (NTSB docket, document ID 40265210)). Aft of the LH turbine, actuator outboard (Continental M-18 Fig 5-33 PDF p. 148, scaled). Plate motion and shape illustrative.',
  groups: ["induction", "exhaust"],
});
part(() => cyl(0.025, 0.07, "z"), ["engine"], {
  pos: WASTEGATE_ACTUATOR,
  color: "#8F7650",
  name: "Wastegate actuator",
  pin: false,
  note: "Hydraulic actuator, outboard of the wastegate (Continental M-18 Fig 5-33 rear view PDF p. 148, scaled; AMM 81-20 PDF p. 2812). Shape illustrative.",
  groups: ["induction", "exhaust"],
});
part(() => box(...GATE_CONTROLLER_SIZE), ["engine"], {
  pos: GATE_CONTROLLER,
  color: "#B7A16D",
  name: "Wastegate controller",
  pin: true,
  note: "Upper firewall: diaphragm senses upper-deck vs manifold pressure across the throttle and meters wastegate oil return (POH 7-39; AMM 81-20 PDF p. 2812, Fig 78-10-3 PDF p. 2742; Fig 71-00-2 sheet 3 item 30 PDF p. 2489). Shape and position approximate; undimensioned upper-firewall placement seated below the cowl.",
  groups: ["induction", "exhaust"],
});
part(() => cyl(0.025, OVERBOOST_LEN, "x"), ["engine"], {
  pos: OVERBOOST,
  color: "#D8BE7A",
  name: "Overboost valve",
  pin: true,
  note: "LH intercooler outlet tube (duct 7), on its forward face ahead of the Y (AMM 13773-002 Rev 7 Fig 71-60-2 sheet 2 PDF p. 2558 items 17/20; position approximate); protects against overly high manifold pressure (POH 7-39; AMM 71-60 PDF p. 2542). With the wastegate seized closed, MAP rises to the 37.5 in.Hg red line (POH 2-9); the overboost relief valve may lift (its setting is not published consistently: AMM 81-20 PDF p. 2812 gives 35, POH 4-17 normal is 36.0). Shape approximate.",
  groups: ["induction"],
});
part(() => box(0.07, 0.07, 0.06), ["engine"], {
  pos: TURBO_SCAVENGE,
  color: "#897348",
  name: "Turbo oil scavenge pump",
  pin: true,
  note: "Outboard of starter adapter, returns reservoir oil to the sump (AMM 79-00 PDF p. 2764). Shape approximate.",
  groups: ["oil"],
});
part(() => cyl(0.03, 0.06, "z"), ["engine"], {
  pos: GATE_TRANSITION,
  color: "#AD7656",
  name: "Wastegate transition",
  pin: true,
  note: "Between LH turbocharger transition and crossover (AMM 78-00 PDF p. 2732, Fig 78-10-2 PDF p. 2740). Shape approximate.",
  groups: ["exhaust"],
});
/*
 * Alternators, both front engine accessories (POH 7-31). ALT 1 is gear-driven at the "right front" (POH 7-47),
 * "mounted directly to the front of the engine on the co-pilot's side" (AMM 13773-002 24-30 PDF p. 708); neither text
 * gives its orientation. That comes from the drawings: AMM Fig 24-30-3 (PDF p. 714) shows it on gasket 5 at a pad facing
 * outboard on the right side of the crankcase nose, terminal cover 11 and retainer 12 on its outboard end; AMM Fig 71-00-2
 * sheet 1 (PDF p. 2487) item 7 shows that end outboard; Continental M-18 Fig 5-34 (installation drawing 657645 sheet 2,
 * p. 5-54, PDF p. 149) View D-D shows the body side-on on the crankshaft CL, and Fig 5-35 (sheet 3, p. 5-55, PDF p. 150)
 * shows its round end face-on on the crankshaft CL. So the shaft is transverse (along z). Its station and envelope are
 * scaled from those Continental views against their printed dimensions (±0.5 in.); none is dimensioned.
 * ALT 2 hangs from an engine bracket on its upper and lower mounting bosses, front left, below and outboard of the
 * crankshaft, shaft parallel to it; its pulley sits in the plane of the drive sheave on the propeller flange (POH 7-47;
 * AMM 24-30 PDF pp. 715–716; Fig 24-30-4 PDF p. 717 items 1, 5–9; Fig 71-00-2 sheet 2 PDF p. 2488 items 15, 16). That
 * figure isn't dimensioned: ALT 2's centre and size are approximate, derived from the crankcase and propeller anchors. The
 * drive sheave sits on its adapter at the propeller flange, forward of the crankcase and aft of the spinner bulkhead
 * (Fig 24-30-4 items 5, 6), so the belt runs forward of the propeller governor; ALT 2 sits outboard of the governor.
 */
const CASE_FRONT = CRANKCASE[0] + CRANKCASE_SIZE[0] / 2;
const CASE_LEFT = CRANKCASE[2] - CRANKCASE_SIZE[2] / 2;
const CASE_RIGHT = CRANKCASE[2] + CRANKCASE_SIZE[2] / 2;
/** ALT 1 axis station: 27.3 in. forward of the accessory mounting face (`ACCESSORY_FACE_X`, ../engine-datum.ts; M-18 Fig 5-35 p. 5-55 RH side view, scaled against its 3.97 in. dimension). */
export const ALT1_STATION_IN = 27.3;
/** ALT 1 drive-pad face and outboard end face, right of the crankshaft CL (M-18 Fig 5-34 View D-D, scaled against its 10.52 in. dimension). */
export const ALT1_PAD_IN = 6.7;
export const ALT1_END_IN = 9.45;
/** ALT 1 housing diameter 5.75 in. (M-18 Fig 5-34 View D-D and Fig 5-35, scaled). */
export const ALT1_R = (5.75 / 2) * IN;
export const ALT1_LEN = (ALT1_END_IN - ALT1_PAD_IN) * IN;
/** ALT 1's drive pad face, on the crankshaft CL (Fig 5-34 View D-D, Fig 5-35); its normal is +z (outboard, AMM Fig 24-30-3). */
export const ALT1_PAD: Vec3 = [ACCESSORY_FACE_X + ALT1_STATION_IN * IN, PROP[1], ALT1_PAD_IN * IN];
/** ALT 1 body centre: outboard of its pad and gasket, shaft along z. */
export const ALT1: Vec3 = [ALT1_PAD[0], ALT1_PAD[1], ALT1_PAD[2] + ALT1_LEN / 2];
/** ALT 1 power terminal, under its cover on the outboard end face (Fig 24-30-3 items 10–12); height on the face approximate. */
export const ALT1_TERM: Vec3 = [ALT1[0], ALT1[1] + 0.03, ALT1[2] + ALT1_LEN / 2 + 0.006];
export const ALT2_R = 0.06;
export const ALT2_LEN = 0.11;
/** Plane of the crankshaft drive sheave, on its adapter at the propeller flange (Fig 24-30-4 items 5, 6). */
export const SHEAVE_X = PROP[0] - 0.14;
/** ALT 2 pulley centre, in the plane of the crankshaft drive sheave (CRANK_PULLEY in electrical.ts). */
export const ALT2_PULLEY: Vec3 = [SHEAVE_X, PROP[1] - 0.075, CASE_LEFT - 0.065];
/** ALT 2 body centre: aft of its pulley. */
export const ALT2: Vec3 = [ALT2_PULLEY[0] - 0.01 - ALT2_LEN / 2, ALT2_PULLEY[1], ALT2_PULLEY[2]];
/** ALT 2 terminals, on top of the body near its rear (Fig 24-30-4 items 10, 11 and the cables). */
export const ALT2_TERM: Vec3 = [ALT2[0] - ALT2_LEN / 2 + 0.02, ALT2[1] + ALT2_R + 0.006, ALT2[2]];
part(() => cyl(ALT1_R, ALT1_LEN, "z"), ["electrical", "engine"], {
  pos: ALT1,
  color: "#D9960F",
  anim: altAnim("alt1"),
  name: "ALT 1 — 100 A",
  note: "Gear-driven, internally rectified, at the right front (SR22T POH 13772-007 7-31, 7-47), mounted directly to the front of the engine on the co-pilot's side, on studs and a gasket (AMM 13773-002 24-30 PDF pp. 694, 708). The drawings show its shaft across the engine on the crankshaft CL, the drive flange on a pad on the right side of the crankcase nose and the terminal end outboard (AMM Fig 24-30-3 PDF p. 714; Fig 71-00-2 sheet 1 item 7; Continental M-18 Fig 5-34 View D-D p. 5-54, Fig 5-35 p. 5-55). Regulated to 28 V by its voltage regulator in the MCU; feeds Main Distribution Bus 1 through a 100 A fuse. Self-exciting: needs battery voltage for field excitation to start up (POH 7-47, 7-49). Position and size approximate.",
  pin: true,
  groups: [],
});
part(() => cyl(ALT1_R + 0.005, ALT1_PAD[2] - CASE_RIGHT, "z"), ["electrical", "engine"], {
  pos: [ALT1_PAD[0], ALT1_PAD[1], (CASE_RIGHT + ALT1_PAD[2]) / 2],
  color: "#8C8C84",
  name: "ALT 1 drive pad and gasket",
  note: "ALT 1 bolts to the gear-drive pad on the right side of the crankcase nose, its face outboard, with a new gasket, its nuts torqued 180 to 220 in-lb in an alternating pattern (AMM 13773-002 24-30 PDF p. 712; Fig 24-30-3 PDF p. 714 items 2–5). The drive gear inside the case is not drawn. Drawn from the crankcase box's right face out to the pad face; size approximate.",
  groups: [],
});
part(() => box(0.035, 0.035, 0.012), ["electrical", "engine"], {
  pos: ALT1_TERM,
  color: "#2F3A44",
  name: "ALT 1 terminals",
  note: "Power and field terminals on the outboard end of ALT 1, under the terminal cover and its retainer; cable shielding goes to the ground terminal, never the AUX terminal (AMM 13773-002 24-30 PDF pp. 712–713; Fig 24-30-3 PDF p. 714 items 6, 10–12). Position approximate.",
  groups: [],
});
part(() => cyl(ALT2_R, ALT2_LEN, "x"), ["electrical", "engine"], {
  pos: ALT2,
  color: "#D9960F",
  anim: altAnim("alt2"),
  name: "ALT 2 — 70 A",
  note: "Belt-driven (the ALT 2 drive belt), internally rectified, front left of the engine, its shaft parallel to the crankshaft with the pulley forward (SR22T POH 13772-007 7-31, 7-47; AMM 13773-002 24-30 PDF p. 708; Fig 24-30-4 PDF p. 717; Fig 71-00-2 item 15). Regulated to 28.75 V by its voltage regulator in the MCU, slightly above ALT 1, which further assures bus separation; feeds Main Distribution Bus 2 through an 80 A fuse. Self-exciting: needs battery voltage for field excitation to start up (POH 7-47, 7-49). Position and size approximate.",
  pin: true,
  groups: [],
});
part(() => cyl(0.045, 0.02, "x"), ["electrical", "engine"], {
  pos: ALT2_PULLEY,
  color: "#6E7378",
  name: "ALT 2 pulley",
  note: "Driven by the belt from the drive sheave on the propeller flange; belt tension 50 to 70 lb at the centre of the span, no more than 0.11 in. deflection under a 5 lb load, re-tensioned after 5 hours (AMM 13773-002 24-30 PDF p. 715; Fig 24-30-4 PDF p. 717 items 5–7, 9). Diameter approximate.",
  groups: [],
});
/** ALT 2 bracket: from the crankcase's left face out over the governor to the top of the ALT 2 body. */
export const ALT2_BRACKET: Vec3 = [CASE_FRONT - 0.01, ALT2[1] + 0.045, CASE_LEFT - 0.025];
export const ALT2_BRACKET_SIZE: Vec3 = [0.12, 0.04, 0.05];
part(() => box(...ALT2_BRACKET_SIZE), ["electrical", "engine"], {
  pos: ALT2_BRACKET,
  color: "#8C8C84",
  name: "ALT 2 mounting bracket",
  note: "Engine bracket carrying the ALT 2 upper mounting boss (bolt torqued 400 to 450 in-lb) and the lower boss with the belt tension adjustment bolt (200 to 275 in-lb) (AMM 13773-002 24-30 PDF pp. 715–716; Fig 24-30-4 PDF p. 717 items 2, 8). Bolted to the left side of the crankcase; the bosses are not drawn separately. Shape approximate.",
  groups: [],
});
/** Starter motor, across the rear of its right-angle drive adapter (engine-ignition.ts); position approximate. */
export const STARTER: Vec3 = [2.655, -0.25, 0.03];
part(() => cyl(0.045, 0.12, "z"), ["engine"], {
  pos: STARTER,
  color: "#4B5860",
  name: "Starter",
  note: "24-volt starter motor on a right-angle starter drive adapter at the rear of the engine (AMM 80-10 PDF p. 2798; Fig 80-10-1 PDF p. 2800). START energizes it and activates both magnetos; springs back to BOTH (POH 7-37). 28 VDC through the 2-amp STARTER circuit breaker on the NON-ESSENTIAL BUS (POH 7-37), switched by the starter relay in the MCU (AMM 24-00 PDF p. 697). Limit cranking to 10 s, 20 s cooling (POH 4-12). Position approximate.",
  groups: ["ignition"],
});

// Direct compressor inlet, not a long air-box hose (AMM Fig 81-20-1 items 1/3 PDF 2815).
for (const s of [-1, 1]) {
  const inlet = COMPRESSOR_INLET(s);
  const housingFront = TURBO(s)[0] + TURBO_HOUSINGS.at(-1)!.x1;
  part(() => cyl(COMPRESSOR_INLET_R, inlet[0] - housingFront, "x"), ["engine"], {
    pos: [(inlet[0] + housingFront) / 2, inlet[1], inlet[2]],
    name: "Compressor inlet neck",
    pin: false,
    color: "#AD7656",
    note: "Forward-facing Ø3.00-in. compressor inlet (Continental M-18 Fig 5-33 / 5-35, dimensioned) meeting the aft face of the air box (AMM 13773-002 Rev 7 Fig 81-20-1 PDF 2815). Length scaled.",
    groups: ["induction"],
  });
  part(() => new THREE.TorusGeometry(COMPRESSOR_INLET_R + 0.002, 0.004, 8, 20).rotateY(Math.PI / 2), ["engine"], {
    pos: inlet,
    name: "Air box / compressor clamp",
    pin: false,
    color: "#B4B8BC",
    note: "Direct air-box / compressor inlet clamp, item 3 (AMM 13773-002 Rev 7 Fig 81-20-1 PDF 2815). Ring dimensions illustrative.",
    groups: ["induction"],
  });
}

// Cast turbine-housing inlet duct, on top of the turbine housing (AMM Fig 81-20-1 PDF 2815;
// Fig 77-20-3 PDF 2716). Illustrative 0.04-m neck seats into the housing and
// ends on the header flange; this is housing geometry, not a collector run.
for (const s of [-1, 1]) {
  const inlet = TURBINE_INLET(s);
  part(() => cyl(EXHAUST_RADIUS, 0.04, "y"), ["engine"], {
    pos: [inlet[0], inlet[1] - 0.02, inlet[2]],
    name: "Turbine housing inlet neck",
    pin: false,
    color: "#AD7656",
    note: "Cast inlet duct on top of the aft turbine housing, bolted to the exhaust transition (AMM 13773-002 Rev 7 Fig 81-20-1 PDF 2815 item 7; Fig 77-20-3 PDF 2716). Size and station illustrative.",
    groups: ["exhaust"],
  });
}
