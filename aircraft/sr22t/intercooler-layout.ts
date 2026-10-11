/**
 * Intercooler anchors, registered from the dimensioned Continental installation drawing to the scene.
 * Continental M-18 (21 Sep 2017) drawing 657645: Fig 5-33 sheet 1 p. 5-53 (PDF p. 148; rear view), Fig 5-34 sheet 2
 * p. 5-54 (PDF p. 149; plan view) and Fig 5-35 sheet 3 p. 5-55 (PDF p. 150; RH side view). Cirrus AMM 13773-002 Rev 7
 * Fig 71-60-2 sheet 2 (PDF p. 2558: intercooler 18, a long box with a forward taper and an aft hood, on seal 16, held by
 * screws 15 and stiffener 21, bracket 14 at the aft end, cabin-heat nozzle 19 on the aft hood), 71-60 (PDF p. 2555:
 * "screws and washers securing intercooler to engine baffling") and Fig 71-00-2 sheets 1–2 (PDF pp. 2487–2488, item
 * 18 on top of each bank's baffle) agree qualitatively: one long, flat fore-and-aft box per side, over its bank's
 * rocker covers. "Dimensioned" values are printed on the drawing; "scaled" values were measured off it against a
 * printed dimension on the same view (±0.5 in.); "illustrative" values are fits to the study model. Pure anchors, so
 * the engine section, the flows and the later baffles section can share them without a registration cycle.
 */
import type { Vec3 } from "@/lib/math";
import { ACCESSORY_FACE_X, CRANK_Y, IN } from "./engine-datum";
import { COMPRESSOR_OUTLET } from "./turbo-layout";

/** Core length per side, dimensioned on the Fig 5-34 plan view: 12.28 in. on the RH core, 11.54 in. on the LH core.
 * Both run forward from the core's aft end; the aft ends share one station. */
export const INTERCOOLER_LENGTH = (s: number) => (s < 0 ? 11.54 : 12.28) * IN;
/** Core outer edge from the crankshaft CL per side, dimensioned on the Fig 5-34 plan view: 21.15 in. [537.33] on the
 * #1/3/5 (RH) side and 21.23 in. [539.36] on the #2/4/6 (LH) side; 42.39 in. [1076.68] overall. */
export const INTERCOOLER_OUTER_Z = (s: number) => (s < 0 ? 21.23 : 21.15) * IN;
/** Core width 0.16 m: scaled, the inner edge reads ≈14.8 in. from the CL on both sides (Fig 5-34 plan view). */
export const INTERCOOLER_WIDTH = 0.16;
/** Core bottom ≈1.9 in. and top ≈5.0 in. above the crankshaft CL: scaled, Fig 5-35 side and Fig 5-33 rear views agree. */
export const INTERCOOLER_BASE_Y = CRANK_Y + 1.9 * IN;
const TOP_Y = CRANK_Y + 5.0 * IN;
/** Core aft face 0.4 in. forward of the accessory mounting face: scaled, the drawing puts it between the face and +1.6 in. */
export const INTERCOOLER_AFT_FACE_X = ACCESSORY_FACE_X + 0.4 * IN;
/** Core box size per side: length (dimensioned) × height (scaled) × width (scaled). */
export const INTERCOOLER_SIZE = (s: number): Vec3 => [
  INTERCOOLER_LENGTH(s),
  TOP_Y - INTERCOOLER_BASE_Y,
  INTERCOOLER_WIDTH,
];
/** Core centre per side. */
export const INTERCOOLER = (s: number): Vec3 => [
  INTERCOOLER_AFT_FACE_X + INTERCOOLER_LENGTH(s) / 2,
  (INTERCOOLER_BASE_Y + TOP_Y) / 2,
  s * (INTERCOOLER_OUTER_Z(s) - INTERCOOLER_WIDTH / 2),
];
/** Core forward face per side, where the pyramid transition starts. */
export const INTERCOOLER_FRONT_X = (s: number) => INTERCOOLER_AFT_FACE_X + INTERCOOLER_LENGTH(s);

/**
 * Seat: the core's bottom face, which sits on the side-baffle top flange through seal 16 (AMM Fig 71-60-2 sheet 2
 * items 14/16/21; 71-60 PDF p. 2555). The baffles section seats its side-baffle top on this plane.
 */
export const INTERCOOLER_SEAT = (s: number) => ({
  y: INTERCOOLER_BASE_Y,
  x: [INTERCOOLER_AFT_FACE_X, INTERCOOLER_FRONT_X(s)] as [number, number],
  z: [s * (INTERCOOLER_OUTER_Z(s) - INTERCOOLER_WIDTH), s * INTERCOOLER_OUTER_Z(s)].sort((a, b) => a - b) as [
    number,
    number,
  ],
});

/** Forward round neck Ø≈2.5 in. (scaled), its face ≈17.5 in. forward of the accessory face and slightly inboard of the
 * core centre (scaled, Fig 5-34 plan view). The pyramid transition runs from the core front to it. */
export const INTERCOOLER_NECK_R = 1.25 * IN;
export const INTERCOOLER_NECK_X = ACCESSORY_FACE_X + 17.5 * IN;
/** Short spigot ahead of the neck for hose connector 10 (AMM Fig 71-60-2 sheet 2); length illustrative. */
export const INTERCOOLER_NECK_LEN = 0.025;
export const INTERCOOLER_NECK = (s: number): Vec3 => [INTERCOOLER_NECK_X, INTERCOOLER(s)[1], s * 0.44];
/** Charge-air outlet: the forward end of the neck spigot, where duct 7 clamps on toward the "Y" junction. */
export const INTERCOOLER_OUT = (s: number): Vec3 => [
  INTERCOOLER_NECK_X + INTERCOOLER_NECK_LEN,
  INTERCOOLER_NECK(s)[1],
  INTERCOOLER_NECK(s)[2],
];

/** Aft port: cabin-heat ram-air nozzle 19 on the aft hood (AMM Fig 71-60-2 sheet 2; POH 7-64). 18.13 in. from the CL
 * and 3.75 in. above the crank CL, dimensioned (Fig 5-33 rear view); 0.6 in. aft of the accessory face, scaled. */
export const INTERCOOLER_AFT = (s: number): Vec3 => [ACCESSORY_FACE_X - 0.6 * IN, CRANK_Y + 3.75 * IN, s * 18.13 * IN];
/** Nozzle radius, illustrative: kept under the 2.05-cm gap between the dimensioned port and BAT 1's approximate box. */
export const INTERCOOLER_AFT_R = 0.018;

/** Charge-air inlet: the compressor duct enters the aft hood from below (Fig 5-35; AMM Fig 71-60-2 sheet 2, the turbo
 * duct to the aft end). Station 1 in. inside the aft face, illustrative. */
export const INTERCOOLER_IN = (s: number): Vec3 => [INTERCOOLER_AFT_FACE_X + IN, INTERCOOLER_BASE_Y, INTERCOOLER(s)[2]];

/**
 * Compressor → intercooler duct corners (coupler 9 / induction tube, AMM Fig 81-20-1 PDF p. 2815; duct 7 with hose
 * connector 10 and clamps 4 rising to the intercooler's aft end, Fig 71-60-2 sheet 2 PDF p. 2558): up off the compressor
 * scroll outlet, then each side's clear route past the lower ignition leads, the turbo oil lines and the mount, up
 * and inboard into `INTERCOOLER_IN` from below through the notched baffle window. The
 * figures are undimensioned and the routes were fitted to the model's clear space: every corner is
 * approximate. The drawn duct (parts/engine-air.ts) and the `compressor*` flows follow `bentCurve` of these corners.
 * LH: forward and inboard of the turbo, under it, aft to the firewall, up outboard, then up at |z| ≈ 0.49 forward of the
 * mount's diagonal member. RH: up and outboard to |z| 0.55, aft, then up and inboard. Both keep the mount members' segment
 * boxes clear (the weldment audit compares boxes).
 */
// 0.5 mm below the core base, so the duct and the intercooler stay distinct meshes (approximate)
const IN_TOP = (s: number): Vec3 => [INTERCOOLER_IN(s)[0], INTERCOOLER_IN(s)[1] - 0.0005, INTERCOOLER_IN(s)[2]];
export const COMPRESSOR_DUCT = (s: number): Vec3[] => {
  const out = COMPRESSOR_OUTLET(s);
  // the duct starts 0.5 mm above the compressor housing, rising straight through coupler 9 (approximate)
  const start: Vec3 = [out[0], out[1] + 0.0005, out[2]],
    rise: Vec3 = [out[0], -0.4, out[2]];
  return s < 0
    ? [
        start,
        rise,
        [3.07, -0.4, -0.32], // corners approximate (fitted route)
        [3.08, -0.43, -0.24], // approximate
        [2.97, -0.55, -0.24], // approximate
        [2.79, -0.52, -0.17], // approximate
        [2.65, -0.48, -0.17], // approximate
        [2.65, -0.39, -0.23], // approximate
        [2.65, -0.36, -0.31], // approximate
        [2.65, -0.37, -0.39], // approximate
        [2.69, -0.37, -0.43], // approximate
        [2.73, -0.35, -0.45], // approximate
        [2.77, -0.31, -0.46], // approximate
        [2.83, -0.31, -0.46], // approximate
        [2.81, -0.28, -0.49], // approximate
        [2.79, -0.19, -0.485], // approximate
        [IN_TOP(s)[0], -0.15, IN_TOP(s)[2]], // approximate
        IN_TOP(s),
      ]
    : [
        start,
        rise,
        [2.92, -0.37, 0.54], // corners approximate (fitted route)
        [2.83, -0.37, 0.55], // approximate
        [2.83, -0.3, 0.55], // approximate
        [IN_TOP(s)[0], -0.16, IN_TOP(s)[2]], // approximate
        IN_TOP(s),
      ];
};
/** Compressor duct Ø2.1 in., approximate: Fig 81-20-1 item 1 draws the scroll outlet ≈0.74× the housing's dimensioned
 * Ø3.00-in. inlet (scaled on the same housing, ±0.2 in.), so Ø2.1–2.3 in.; the low end, the bore the routes clear. */
export const COMPRESSOR_DUCT_R = 1.05 * IN;
/** Centreline bend radius, approximate (≈1.1× the duct radius: the fitted routes leave no room for more). */
export const COMPRESSOR_DUCT_BEND = 0.03;

/** Inlet spigots of the "Y" junction ahead of the throttle body, one per duct 7. Continental M-18 Fig 12-16 p. 12-27
 * (PDF p. 324) shows the two FWD induction tubes 38/39 joined to the throttle body by hoses 40; AMM Fig 71-00-2 sheet 2
 * (PDF p. 2488) puts throttle body 17 at the top front. Station illustrative, the study model's Y (parts/engine-air.ts). */
export const INDUCTION_Y_INLET = (s: number): Vec3 => [3.48, 0.06, s * 0.08];
/** Duct 7 outer radius: hose connectors 10 join it to the Ø≈2.5-in. neck spigot (scaled, Fig 5-34), so the same bore. */
export const DUCT7_R = INTERCOOLER_NECK_R;
/** Duct 7 centreline tension; the charge-air flow shares the curve, so its particles run inside the tube. */
export const DUCT7_TENSION = 0.3;
/** LH duct 7 waypoint where the overboost valve 17 bolts on (AMM 71-60 PDF p. 2542; Fig 71-60-2 sheet 2 items 17/20).
 * Approximate. */
export const OVERBOOST_SEAT: Vec3 = [3.47, 0.05, -0.15];
/**
 * Duct 7 centreline per side (AMM 13773-002 Rev 7 Fig 71-60-2 sheet 2, PDF p. 2558, item 7 with hose connectors 10 and
 * clamps 4; M-18 Fig 12-16 items 38/39): a short axial run off the forward neck, then inboard, forward and up across
 * the front of the cylinders, under the top cowl, to the "Y" inlet spigot. The overboost valve sits on the LH duct
 * (AMM 71-60 PDF p. 2542). The figures are undimensioned: waypoints approximate.
 */
/** Index of the forward-bend waypoint in `DUCT7`, where the drawn duct splits into its outboard and front pieces. */
export const DUCT7_BEND = 5;
export const DUCT7 = (s: number): Vec3[] => {
  const out = INTERCOOLER_OUT(s);
  return [
    out,
    [out[0] + 0.012, out[1], out[2]],
    [3.28, -0.058, s * 0.41],
    [3.33, -0.056, s * 0.408],
    [3.38, -0.05, s * 0.38],
    [3.45, -0.02, s * 0.3],
    [OVERBOOST_SEAT[0], OVERBOOST_SEAT[1], s * -OVERBOOST_SEAT[2]],
    INDUCTION_Y_INLET(s),
  ];
};
