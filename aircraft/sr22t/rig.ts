/**
 * Flight-control mechanisms laid out after POH Figures 7-1 (elevator), 7-2 (aileron) and 7-3 (rudder), with the cable runs,
 * pulley gangs, turnbuckles and stops from AMM 13773-002 Rev 7 27-10, 27-20 and 27-30.
 *
 * Elevator: yoke tubes → drop links → lever arms on a lateral torque tube under the panel → forward
 *   sector → crossed cable pair → forward pulley gang → rudder/elevator pulley gang on the FS 186 bulkhead →
 *   turnbuckles at access hole CF5 → elevator empennage bellcrank (POH: aft sector pulley) → push-pull tube → elevator
 *   bellcrank between the elevator halves.
 * Aileron: yokes rotate in pivoting bearing carriages → lateral push rod → central pulley sector → forward pulley gang →
 *   direct turnbuckles at CF3C → along the longerons to kick-out pulleys → each wing, through fairleads at the flap
 *   hinges → aileron actuation pulley (vertical sector / crank arm) at the aileron (conical drive arm); a cross-over cable
 *   over cross-over pulleys, with its turnbuckle at CF4C, links the two actuation pulleys.
 * Rudder: four pedals on a pedal torque tube → cable horn → forward pulley gang → rudder/elevator pulley gang →
 *   turnbuckles at CF5 → rudder empennage bellcrank, on a shaft it shares with the elevator one at the FS 306 bulkhead →
 *   push-pull tube → rudder bellcrank.
 */
import * as THREE from "three";
import type { Axis } from "@/lib/geometry";
import { D2R, V, type Vec3 } from "@/lib/math";
import { FW, hingeX, sC, sLE, EF, SY, wingP } from "./geometry";
import type { Sim } from "./model";

export { pulleyGeo, sectorGeo } from "@/lib/geometry";
export interface PulleyDef {
  c: Vec3;
  r: number;
  axis: Axis;
  double?: boolean;
  gap?: number;
}

/* ---------- geometry constants (airplane coordinates, metres) ---------- */
export const ETT = { c: [2.3, -0.36, 0] as Vec3, half: 0.48, lever: 0.1, sectorR: 0.12, sectorZ: 0.06 };
export const CARR = { x: 2.46, y: -0.06, z: 0.46, armX: 0.08, arm: 0.14 };
export const AIL_SECTOR = { c: [2.54, -0.3, 0] as Vec3, r: 0.1 };
export const RUD_HORN = { c: [2.4, -0.58, 0.13] as Vec3, half: 0.06 };
export const PEDAL_TT = { x: 2.46, y: -0.61, half: 0.4 };
export const ELEV_HORN = { c: [sLE(0) - EF * sC(0), SY, 0] as Vec3, arm: 0.1 };
const rudHingeH = -0.1;
export const RUD_HORN_AFT = { c: [hingeX(rudHingeH), rudHingeH, 0] as Vec3, arm: 0.06 };

/** Torque-tube levers point up-forward; drop links run forward-down to them at right angles (Fig. 7-1). */
export const LEVER_ANG = Math.PI / 4;
const TIP0 = [ETT.c[0] + ETT.lever * Math.sin(LEVER_ANG), ETT.c[1] + ETT.lever * Math.cos(LEVER_ANG)];
const EYE_Y = CARR.y - 0.02;
const DROP_LEN = (EYE_Y - TIP0[1]) / Math.sin(LEVER_ANG);
/** Drop-link eye on the yoke tube with the yoke at neutral. */
export const EYE_X0 = TIP0[0] - DROP_LEN * Math.cos(LEVER_ANG);
/** Yoke tube travel for full pitch input (the Yokes group slides by this much). */
export const YOKE_TRAVEL = 0.07;

/** Right-angle drive at each aileron: crank on the wing sector → link → short arm up from the aileron hinge. */
export const AIL_DRIVE = { crank: 0.075, lift: 0.016, arm: 0.025, z: 3.72 };

/** Fuselage station (inches) → x: FS 100 is the firewall, `FW` (POH Fig. 1-1). */
export const fsX = (fs: number) => FW - (fs - 100) * 0.0254;
/**
 * Floor access holes the cable turnbuckles and pulleys are reached through, as boxes in plan (centre x, z; half-sizes hx,
 * hz). AMM Fig 6-00-6 Floor Access Panels (PDF p. 123) is not dimensioned: scaled from its firewall (FS 100) and aft
 * bulkhead (FS 222) edges, positions approximate; CF5 sits about 2 in right of the centreline. CF3C: rudder-aileron
 * interconnect; CF4C: trim system relays; CF4L / CF4R: flight control cables; CF5: marker beacon antenna (the figure's
 * legend).
 */
export const FLOOR_HOLES = {
  CF3C: { x: fsX(158.5), z: 0, hx: 0.12, hz: 0.12 },
  CF4C: { x: fsX(177.2), z: 0, hx: 0.13, hz: 0.13 },
  CF4L: { x: fsX(177.2), z: -0.357, hx: 0.13, hz: 0.13 },
  CF4R: { x: fsX(177.2), z: 0.357, hx: 0.13, hz: 0.13 },
  CF5: { x: fsX(201.4), z: 0.056, hx: 0.239, hz: 0.262 },
};
export type FloorHole = keyof typeof FLOOR_HOLES;
/** Forward pulley gang: six pulleys on one bolt at the bottom of the center console (AMM Fig 27-10-5 PDF p. 976); position approximate. */
export const FWD_GANG = { x: 2.15, y: -0.62 };
/**
 * Rudder/elevator pulley gang: four pulleys on a bracket bolted to the forward face of the FS 186 bulkhead, with a backing
 * plate on its aft face (AMM 27-20 PDF p. 986; Fig 27-20-5 items 6, 7 PDF p. 1005, FWD arrow). The figure dimensions only
 * the bulkhead: the 2 in standoff forward of it and the height are approximate.
 */
export const AFT_GANG = { x: fsX(184), y: -0.57 };
/**
 * Empennage bellcranks: separate rudder and elevator bellcranks on a shared shaft mounted directly to the FS 306 bulkhead
 * (AMM 27-20 PDF p. 986; Fig 27-20-6 PDF p. 1006). The shaft runs athwartships, so both bellcranks turn in the vertical
 * plane; height approximate.
 */
export const BELLCRANK_SHAFT = { x: fsX(306), y: -0.14 };
/** Aileron kick-out pulleys, under the longerons (AMM 27-10 PDF p. 946; Fig 27-10-6 Detail A PDF p. 977); position approximate. */
const KICK = { x: FLOOR_HOLES.CF4R.x + 0.1, y: -0.6, z: 0.45, r: 0.05 };
/** Aileron cross-over pulleys, on the aft floor (Fig 27-10-6 Detail B); position approximate. */
const XOVER = { x: 0.74, y: -0.6, z: 0.28, r: 0.04 };
/**
 * Flap hinge stations (the flap hinge brackets in parts/surfaces.ts; three hinges per flap, POH 7-22): the hinge ribs at
 * WS ≈ 36.5, 89.0 and 142.4, scaled from AMM Fig 51-10-18 (PDF p. 1889) and Fig 6-00-4 (PDF p. 121); the inboard and
 * outboard ones held 20 mm inside the model flap's ends (z 0.94 and 3.62). Approximate.
 */
export const FLAP_HINGE_Z = [0.96, 2.261, 3.6];

const wingSectorAt = (s: number) => {
  const p = wingP(s * 3.6, 0.66, 0);
  return [p.x, p.y, p.z] as Vec3;
};
const RETAINER =
  " A cable retainer (pulley guard pin) keeps each cable in its groove (AMM 27-10 PDF p. 946, 27-30 PDF p. 1008).";
const FWD_NOTE =
  " One of the three pulley pairs of the forward pulley gang at the bottom of the center console (AMM 27-10, 27-20, 27-30; Fig 27-10-5 PDF p. 976)." +
  RETAINER;
const AFT_NOTE =
  " Rudder/elevator pulley gang on the forward face of the FS 186 bulkhead, under the floor (AMM 27-20 PDF p. 986, 27-30 PDF p. 1008; Fig 27-20-5 PDF p. 1005)." +
  RETAINER;
const KICK_NOTE =
  "Under the fuselage longeron on each side: turns the aileron cable outboard into the wing area between the aft spar and flap cove (AMM 27-10 PDF p. 946; Fig 27-10-6 Detail A PDF p. 977). Reached through floor access hole CF4L / CF4R (AMM Fig 6-00-6). Position approximate." +
  RETAINER;
const XOVER_NOTE =
  "On the aft floor: carries the cross-over cable from one wing to the other (AMM 27-10 PDF p. 946; Fig 27-10-1 item 8 PDF p. 950, Fig 27-10-6 Detail B PDF p. 977). Position approximate." +
  RETAINER;
const AW_NOTE =
  "Vertical sector at the inboard end of each aileron (POH 7-9: sector / crank arm); drives the aileron through a right-angle conical drive arm. The AMM calls it the aileron actuation pulley: the direct cable from the kick-out pulley and the cross-over cable both end on it, and its adjustable stop screws limit aileron travel (AMM 27-10 PDF pp. 946, 953). A cable guard keeps the cables on the pulley (AMM 27-10 PDF pp. 946–948; Fig 27-10-1 item 4 PDF p. 950).";

export const PULLEYS: Record<string, PulleyDef & { name: string; note: string; sys: "controls" }> = {
  ef: {
    c: [FWD_GANG.x, FWD_GANG.y, 0.06],
    r: 0.035,
    axis: "z",
    double: true,
    gap: 0.03,
    sys: "controls",
    name: "Forward elevator pulleys",
    note: "Turn the crossed cable pair from the forward sector aft under the cabin floor (POH Fig. 7-1)." + FWD_NOTE,
  },
  em: {
    c: [AFT_GANG.x, AFT_GANG.y, 0.06],
    r: 0.035,
    axis: "z",
    double: true,
    gap: 0.03,
    sys: "controls",
    name: "Aft elevator pulleys",
    note: "Turn the elevator cables up into the tailcone." + AFT_NOTE,
  },
  ea: {
    c: [BELLCRANK_SHAFT.x, BELLCRANK_SHAFT.y, -0.03],
    r: 0.09,
    axis: "z",
    sys: "controls",
    name: "Elevator empennage bellcrank",
    note: "POH 7-6: the aft elevator sector pulley. On the shaft it shares with the rudder empennage bellcrank at the FS 306 bulkhead (AMM 27-20 PDF p. 986; Fig 27-20-6 PDF p. 1006). The top arm takes the red-marked cable, the bottom arm the black (AMM 27-30 PDF p. 1009); its crank pin drives the push-pull tube to the elevator bellcrank, and fixed stops here limit elevator travel (AMM 27-30 PDF p. 1008).",
  },
  af: {
    c: [FWD_GANG.x, FWD_GANG.y, -0.05],
    r: 0.035,
    axis: "z",
    double: true,
    gap: 0.03,
    sys: "controls",
    name: "Forward aileron pulleys",
    note: "Route both aileron cables from the console pulley under the cabin floor (AMM 27-10 PDF p. 946)." + FWD_NOTE,
  },
  atR: {
    c: [KICK.x, KICK.y, KICK.z],
    r: KICK.r,
    axis: "y",
    sys: "controls",
    name: "Aileron kick-out pulleys",
    note: KICK_NOTE,
  },
  atL: {
    c: [KICK.x, KICK.y, -KICK.z],
    r: KICK.r,
    axis: "y",
    sys: "controls",
    name: "Aileron kick-out pulleys",
    note: KICK_NOTE,
  },
  awR: {
    c: wingSectorAt(1),
    r: 0.06,
    axis: "y",
    sys: "controls",
    name: "Aileron wing sector / crank arm",
    note: AW_NOTE,
  },
  awL: {
    c: wingSectorAt(-1),
    r: 0.06,
    axis: "y",
    sys: "controls",
    name: "Aileron wing sector / crank arm",
    note: AW_NOTE,
  },
  rf: {
    c: [FWD_GANG.x, FWD_GANG.y, 0.13],
    r: 0.035,
    axis: "z",
    double: true,
    gap: 0.06,
    sys: "controls",
    name: "Forward rudder pulleys",
    note: "Take the rudder cables from the pedal cable horn aft (POH Fig. 7-3)." + FWD_NOTE,
  },
  rm: {
    c: [AFT_GANG.x, AFT_GANG.y, 0.13],
    r: 0.035,
    axis: "z",
    double: true,
    gap: 0.06,
    sys: "controls",
    name: "Aft rudder pulleys",
    note: "Turn the rudder cables up into the tailcone." + AFT_NOTE,
  },
  ra: {
    c: [BELLCRANK_SHAFT.x, BELLCRANK_SHAFT.y, 0.035],
    r: 0.07,
    axis: "z",
    sys: "controls",
    name: "Rudder empennage bellcrank",
    note: "POH 7-11: the sector next to the elevator sector pulley. Separate from the elevator bellcrank but on the same shaft at the FS 306 bulkhead (AMM 27-20 PDF p. 986; Fig 27-20-6 PDF p. 1006). The top arm takes the blue-marked cable, the bottom arm the yellow (AMM 27-20 PDF p. 987); its crank pin drives the push-pull tube to the rudder bellcrank, and fixed stops here limit rudder travel (AMM 27-20 PDF p. 986).",
  },
  axR: {
    c: [XOVER.x, XOVER.y, XOVER.z],
    r: XOVER.r,
    axis: "x",
    sys: "controls",
    name: "Aileron cross-over pulleys",
    note: XOVER_NOTE,
  },
  axL: {
    c: [XOVER.x, XOVER.y, -XOVER.z],
    r: XOVER.r,
    axis: "x",
    sys: "controls",
    name: "Aileron cross-over pulleys",
    note: XOVER_NOTE,
  },
};

/* ---------- cable strands (each pair forms a closed loop through its sectors) ---------- */
const E = ETT,
  ef = PULLEYS.ef,
  em = PULLEYS.em,
  ea = PULLEYS.ea,
  af = PULLEYS.af,
  rf = PULLEYS.rf,
  rm = PULLEYS.rm,
  ra = PULLEYS.ra;
const FLOOR = -0.655;
const wp = (z: number, xc: number): Vec3 => {
  const p = wingP(z, xc, 0);
  return [p.x, p.y, p.z];
};
const sectorPt = (a: number, z: number): Vec3 => [
  E.c[0] + Math.sin(a) * E.sectorR,
  E.c[1] - Math.cos(a) * E.sectorR,
  z,
];
const aw = (s: number) => (s > 0 ? PULLEYS.awR : PULLEYS.awL).c;
/** Under the aft (rudder/elevator) gang: the cables pass beneath its pulleys and turn up into the tailcone. */
const underAft = (p: PulleyDef, z: number): Vec3[] => [
  [p.c[0] + 0.03, p.c[1] - p.r, z],
  [p.c[0] - 0.025, p.c[1] - p.r + 0.008, z],
];
/** Aileron direct cable, side s: forward gang → CF3C → along the longeron → kick-out pulley → wing → actuation pulley. */
const ailRun = (s: number, zSector: number, zGang: number): Vec3[] => [
  [AIL_SECTOR.c[0], AIL_SECTOR.c[1] - AIL_SECTOR.r + 0.01, zSector],
  [af.c[0] + af.r, af.c[1], zGang],
  [af.c[0] - 0.02, FLOOR, zGang],
  [FLOOR_HOLES.CF3C.x - 0.15, FLOOR, s * 0.06],
  [KICK.x + 0.12, KICK.y, s * (KICK.z - KICK.r)],
  [KICK.x, KICK.y, s * (KICK.z - KICK.r)],
  [KICK.x - KICK.r, KICK.y, s * KICK.z],
  [KICK.x, KICK.y, s * (KICK.z + KICK.r)],
  wp(s * 0.6, 0.62),
  ...FLAP_HINGE_Z.map((z) => wp(s * z, 0.62)),
  [aw(s)[0] + 0.06, aw(s)[1], aw(s)[2]],
];
/** Cross-over cable, from the right actuation pulley's aft side through the cross-over pulleys to the left one. */
const xoverRun = (s: number): Vec3[] => [
  [aw(s)[0] - 0.06, aw(s)[1], aw(s)[2]],
  ...[...FLAP_HINGE_Z].reverse().map((z) => wp(s * z, 0.7)),
  wp(s * 0.6, 0.7),
  [XOVER.x, XOVER.y, s * (XOVER.z + XOVER.r)],
  [XOVER.x, XOVER.y - XOVER.r, s * XOVER.z],
];

export interface CableDef {
  key: string;
  name: string;
  note: string;
  pts: Vec3[];
}
export const CABLES: CableDef[] = [
  // Elevator: crossed pair from the forward sector → forward pulley gang → aft gang → turnbuckles at CF5 → empennage bellcrank
  {
    key: "elA",
    name: "Elevator cable",
    note: "Single cable loop from the forward sector under the cabin floor to the aft sector pulley (POH Fig. 7-1): through the forward and rudder/elevator pulley gangs to the elevator empennage bellcrank (AMM 27-30 PDF p. 1008). Turnbuckles at access hole CF5 join the forward and aft cables and set the tension (AMM 27-30 PDF p. 1010).",
    pts: [
      sectorPt(0.35, E.sectorZ),
      [ef.c[0] - ef.r, ef.c[1], 0.045],
      [ef.c[0] - 0.02, FLOOR, 0.045],
      ...underAft(em, 0.045),
      [ea.c[0] + 0.02, ea.c[1] + ea.r, ea.c[2] + 0.005],
    ],
  },
  {
    key: "elB",
    name: "Elevator cable",
    note: "Return strand of the elevator loop — crosses the other strand between the forward sector and pulley.",
    pts: [
      sectorPt(-0.35, E.sectorZ),
      [ef.c[0] + ef.r, ef.c[1], 0.075],
      [ef.c[0] - 0.02, FLOOR, 0.075],
      ...underAft(em, 0.075),
      [ea.c[0] + 0.02, ea.c[1] - ea.r, ea.c[2] - 0.005],
    ],
  },
  // Aileron: console pulley → forward pulley gang → along the longerons → kick-out pulleys → each wing's actuation
  // pulley; the cross-over cable joins the two actuation pulleys
  {
    key: "ailR",
    name: "Aileron cable (right wing)",
    note: "Console pulley → forward pulley gang → under the cabin floor and along the fuselage longeron → kick-out pulley → through the fairleads at the flap hinges → right aileron actuation pulley (AMM 27-10 PDF p. 946; Fig 27-10-1 PDF p. 950). The RH direct turnbuckle is at access hole CF3C (AMM 27-10 PDF p. 947).",
    pts: ailRun(1, 0.03, -0.035),
  },
  {
    key: "ailL",
    name: "Aileron cable (left wing)",
    note: "Console pulley → forward pulley gang → under the cabin floor and along the fuselage longeron → kick-out pulley → through the fairleads at the flap hinges → left aileron actuation pulley (AMM 27-10 PDF p. 946; Fig 27-10-1 PDF p. 950). The LH direct turnbuckle is at access hole CF3C (AMM 27-10 PDF p. 947).",
    pts: ailRun(-1, -0.03, -0.065),
  },
  {
    key: "ailBal",
    name: "Aileron cross-over cable",
    note: "Returns from one wing's actuation pulley to the other's over the cross-over pulleys, interconnecting the ailerons and closing the loop (AMM 27-10 PDF p. 946). Its cross-over turnbuckle is at access hole CF4C (Fig 27-10-1 item 11 PDF p. 950; AMM 27-10 PDF p. 947).",
    pts: [...xoverRun(1), ...xoverRun(-1).reverse()],
  },
  // Rudder: cable horn → forward pulley gang → aft gang → turnbuckles at CF5 → rudder empennage bellcrank
  {
    key: "rudR",
    name: "Rudder cable",
    note: "Pedal cable horn → forward and rudder/elevator pulley gangs under the floor → rudder empennage bellcrank (POH Fig. 7-3; AMM 27-20 PDF p. 986). Turnbuckles at access hole CF5 join the forward and aft cables (AMM 27-20 PDF pp. 988–989).",
    pts: [
      [RUD_HORN.c[0], RUD_HORN.c[1], RUD_HORN.c[2] + RUD_HORN.half],
      [rf.c[0], FLOOR, 0.16],
      ...underAft(rm, 0.16),
      [ra.c[0] + 0.02, ra.c[1] - ra.r, ra.c[2] - 0.005],
    ],
  },
  {
    key: "rudL",
    name: "Rudder cable",
    note: "Other half of the rudder loop.",
    pts: [
      [RUD_HORN.c[0], RUD_HORN.c[1], RUD_HORN.c[2] - RUD_HORN.half],
      [rf.c[0], FLOOR, 0.1],
      ...underAft(rm, 0.1),
      [ra.c[0] + 0.02, ra.c[1] + ra.r, ra.c[2] + 0.005],
    ],
  },
];
export const cable = (key: string) => CABLES.find((c) => c.key === key)!;

/** Point a fraction t of the way along segment i of a cable (for turnbuckles and guides). */
export function alongCable(key: string, i: number, t: number): Vec3 {
  const p = cable(key).pts,
    a = p[i],
    b = p[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** Illustrative capstan dimensions: diameter and groove pitch are not dimensioned in AMM 22-10. */
export const CAPSTAN = { r: 0.02, width: 0.018, cableR: 0.001, groove: 0.004 };
/** Signed travel along each strand's forward-to-aft polyline, from the primary pulley arc (AMM ch. 27). Positive is aft,
 * the same direction as that strand's cable-flow particles (`flowRates` in ./flows). */
export function cableTravel(pose: RigPose, key: string): number {
  switch (key) {
    case "elA":
      return pose.pulley.em * PULLEYS.em.r;
    case "elB":
      return -pose.pulley.em * PULLEYS.em.r;
    case "ailR":
      return -pose.pulley.af * PULLEYS.af.r;
    case "ailL":
      return pose.pulley.af * PULLEYS.af.r;
    case "rudR":
      return -pose.pulley.rm * PULLEYS.rm.r;
    case "rudL":
      return pose.pulley.rm * PULLEYS.rm.r;
    default:
      throw new Error(`No servo travel mapping for cable ${key}`);
  }
}
/** Where segment i of a cable crosses station x. */
const atX = (key: string, i: number, x: number) => {
  const p = cable(key).pts;
  return alongCable(key, i, (x - p[i][0]) / (p[i + 1][0] - p[i][0]));
};

export interface TurnbuckleDef {
  key: string;
  name: string;
  hole: FloorHole;
  pos: Vec3;
  note: string;
}
const AIL_TB = (side: string) =>
  `${side} direct turnbuckle: joins the forward aileron cable to the ${side} aileron cable at access hole CF3C (AMM 27-10 PDF p. 947; Fig 27-10-1 items 17, 18 PDF p. 950). Safety-wired after rigging.`;
const CF5_TB = (what: string, marks: string, page: string) =>
  `Joins the forward and aft ${what} cables at floor access hole CF5, aft of the FS 186 bulkhead, and sets the cable tension (${page}). Cable clevises and turnbuckle ends are painted ${marks} so a crossed cable shows. Safety-wired after rigging.`;
/**
 * Turnbuckles where the AMM puts them: the aileron direct (LH, RH) and cross-over turnbuckles at floor access holes CF3C
 * and CF4C (AMM 27-10 PDF p. 947; Fig 27-10-1 items 11, 17, 18), and one per strand of the rudder and elevator cables at
 * CF5, just aft of the rudder/elevator pulley gang (AMM 27-20 PDF pp. 988–989, Fig 27-20-1 item 8; AMM 27-30 PDF p. 1010,
 * Fig 27-30-1 item 11).
 */
export const TURNBUCKLES: TurnbuckleDef[] = [
  {
    key: "ailR",
    name: "Aileron turnbuckle",
    hole: "CF3C",
    pos: atX("ailR", 2, FLOOR_HOLES.CF3C.x),
    note: AIL_TB("RH"),
  },
  {
    key: "ailL",
    name: "Aileron turnbuckle",
    hole: "CF3C",
    pos: atX("ailL", 2, FLOOR_HOLES.CF3C.x),
    note: AIL_TB("LH"),
  },
  {
    key: "ailBal",
    name: "Aileron turnbuckle",
    hole: "CF4C",
    pos: alongCable("ailBal", cable("ailBal").pts.length / 2 - 1, 0.5),
    note: "Cross-over turnbuckle: joins the LH and RH aileron cables of the cross-over run at access hole CF4C (AMM 27-10 PDF p. 947; Fig 27-10-1 item 11 PDF p. 950). Safety-wired after rigging.",
  },
  ...(
    [
      [
        "elA",
        "Elevator turnbuckle",
        0.1,
        CF5_TB("elevator", "red (top of the empennage bellcrank) and black (bottom)", "AMM 27-30 PDF pp. 1009–1010"),
      ],
      [
        "elB",
        "Elevator turnbuckle",
        0.1,
        CF5_TB("elevator", "red (top of the empennage bellcrank) and black (bottom)", "AMM 27-30 PDF pp. 1009–1010"),
      ],
      [
        "rudR",
        "Rudder turnbuckle",
        -0.05,
        CF5_TB("rudder", "blue (top of the empennage bellcrank) and yellow (bottom)", "AMM 27-20 PDF pp. 987–989"),
      ],
      [
        "rudL",
        "Rudder turnbuckle",
        -0.05,
        CF5_TB("rudder", "blue (top of the empennage bellcrank) and yellow (bottom)", "AMM 27-20 PDF pp. 987–989"),
      ],
    ] as [string, string, number, string][]
  ).map(([key, name, dx, note]) => ({
    key,
    name,
    hole: "CF5" as const,
    pos: atX(key, cable(key).pts.length - 2, FLOOR_HOLES.CF5.x + dx),
    note,
  })),
];
/** Fairlead at each flap hinge, per wing, where the direct and cross-over aileron cables pass (AMM 27-10 PDF p. 946). */
export const FAIRLEADS: Vec3[] = [1, -1].flatMap((s) =>
  FLAP_HINGE_Z.map((z) => {
    const a = wp(s * z, 0.62),
      b = wp(s * z, 0.7);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, s * z] as Vec3;
  }),
);

/* ---------- kinematics ---------- */
export interface RigPose {
  ett: number;
  carr: number;
  ailSector: number;
  rudHorn: number;
  pedal: number;
  elevAng: number;
  rudAng: number;
  ailAng: number;
  pulley: Record<string, number>;
}

/** Where circle (c, r1) meets circle (e, r2) in a plane — the solution nearer (nx, ny). */
function meet(
  cx: number,
  cy: number,
  r1: number,
  ex: number,
  ey: number,
  r2: number,
  nx: number,
  ny: number,
): [number, number] {
  const dx = ex - cx,
    dy = ey - cy,
    d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d),
    h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const bx = cx + (a * dx) / d,
    by = cy + (a * dy) / d;
  const p: [number, number] = [bx - (h * dy) / d, by + (h * dx) / d],
    q: [number, number] = [bx + (h * dy) / d, by - (h * dx) / d];
  return Math.hypot(p[0] - nx, p[1] - ny) <= Math.hypot(q[0] - nx, q[1] - ny) ? p : q;
}

/** Bisection root of a monotonic f on [lo, hi]. */
function solve(f: (x: number) => number, lo: number, hi: number) {
  let flo = f(lo);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2,
      fm = f(mid);
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Aileron drive-arm pin: rotates with the aileron about its hinge line (same pivot/axis as the surface). */
function ailPin(side: number, ang: number) {
  const pv = wingP(side * 3.68, 0.75, 0),
    ax = wingP(side * 5.0, 0.75, 0)
      .sub(pv)
      .normalize();
  const h = wingP(side * AIL_DRIVE.z, 0.75, 0).add(V(0, AIL_DRIVE.arm, 0));
  return pv.clone().add(h.sub(pv).applyAxisAngle(ax, ang));
}
/** Crank pin on the wing sector, which turns about a vertical axis. */
function crankPin(side: number, a: number) {
  const c = (side > 0 ? PULLEYS.awR : PULLEYS.awL).c;
  return V(
    c[0] + side * AIL_DRIVE.crank * Math.sin(a),
    c[1] + AIL_DRIVE.lift,
    c[2] + side * AIL_DRIVE.crank * Math.cos(a),
  );
}
const CONE_LEN = [-1, 1].map((sd) => ailPin(sd, 0).distanceTo(crankPin(sd, 0)));
/**
 * Full control-surface travel, degrees (AMM 13773-002 Rev 7 6-00, PDF p. 117): aileron 12.5 up and down, elevator 25.0 up
 * and 15.0 down, rudder 20.0 left and right. The POH gives no travels. Shared by the rig pose and the surfaces in
 * Airplane.tsx so the two stay in sync.
 */
export const SURF_TRAVEL = { ail: 12.5, elevUp: 25, elevDown: 15, rud: 20 };

/**
 * Surface deflections (radians) for control inputs in −1…1: aileron (positive roll raises the right aileron), elevator
 * (positive pitch, a pull, raises the trailing edge) and rudder (positive yaw, right pedal, swings it right).
 */
export function surfDeflection({ pitch, roll, yaw }: { pitch: number; roll: number; yaw: number }) {
  const T = SURF_TRAVEL;
  return {
    ail: roll * T.ail * D2R,
    elev: pitch * (pitch >= 0 ? T.elevUp : T.elevDown) * D2R,
    rud: yaw * T.rud * D2R,
  };
}
/**
 * Which control stops are in contact: each surface stops at its full travel (`SURF_TRAVEL`). Adjustable stops on each
 * aileron actuation pulley, the LH lower stop contacting first in full left roll and the RH lower stop in full right roll
 * (AMM 27-10 PDF pp. 946, 953); fixed stops at the elevator and rudder empennage bellcranks (AMM 27-30 PDF p. 1008, 27-20
 * PDF p. 986).
 */
export function stopsInContact(ctrl: { pitch: number; roll: number; yaw: number }) {
  const T = SURF_TRAVEL,
    d = surfDeflection(ctrl),
    at = (rad: number, deg: number) => Math.abs(rad) >= deg * D2R - 1e-9;
  return {
    ailL: d.ail < 0 && at(d.ail, T.ail),
    ailR: d.ail > 0 && at(d.ail, T.ail),
    elev: at(d.elev, d.elev >= 0 ? T.elevUp : T.elevDown),
    rud: at(d.rud, T.rud),
  };
}
const ailSurfAng = (roll: number) => -surfDeflection({ pitch: 0, roll, yaw: 0 }).ail; // matches ControlSurface for both ailerons

export function rigPose(s: Sim): RigPose {
  const { pitch, roll, yaw } = s.ctrl,
    defl = surfDeflection(s.ctrl);
  // elevator: the yoke eye slides aft; the lever turns so the drop link keeps its length
  const [tx, ty] = meet(ETT.c[0], ETT.c[1], ETT.lever, EYE_X0 - pitch * YOKE_TRAVEL, EYE_Y, DROP_LEN, TIP0[0], TIP0[1]);
  const ett = LEVER_ANG - Math.atan2(tx - ETT.c[0], ty - ETT.c[1]);
  const carr = roll * 0.6; // bearing carriages rotate with the yokes
  const ailSector = Math.asin(Math.max(-1, Math.min(1, (-CARR.arm * Math.sin(carr)) / AIL_SECTOR.r)));
  // wing sectors turn until the drive link to each aileron arm is back at its rigged length
  const aw = [-1, 1].map((sd, i) => {
    const pin = ailPin(sd, ailSurfAng(roll));
    return solve((a) => pin.distanceTo(crankPin(sd, a)) - CONE_LEN[i], -1.2, 1.2);
  });
  const rudHorn = yaw * 0.5;
  const tE = ett * ETT.sectorR,
    tA = ailSector * AIL_SECTOR.r,
    tR = rudHorn * RUD_HORN.half;
  const P = PULLEYS;
  return {
    ett,
    carr,
    ailSector,
    rudHorn,
    pedal: RUD_HORN.half * Math.sin(rudHorn),
    elevAng: defl.elev,
    rudAng: defl.rud,
    ailAng: defl.ail,
    pulley: {
      ef: tE / P.ef.r,
      em: tE / P.em.r,
      ea: -tE / P.ea.r,
      af: tA / P.af.r,
      atR: tA / P.atR.r,
      atL: -tA / P.atL.r,
      awR: aw[1],
      awL: aw[0],
      rf: tR / P.rf.r,
      rm: tR / P.rm.r,
      ra: tR / P.ra.r,
      axR: tA / P.axR.r,
      axL: -tA / P.axL.r,
    },
  };
}

/* ---------- dynamic link end points ---------- */
const rotX = (y: number, z: number, a: number): [number, number] => [
  y * Math.cos(a) - z * Math.sin(a),
  y * Math.sin(a) + z * Math.cos(a),
];

export function linkPoints(s: Sim, p: RigPose) {
  const out: Record<string, [THREE.Vector3, THREE.Vector3]> = {};
  // elevator drop links: yoke eye → lever tip on the torque tube
  [-1, 1].forEach((side) => {
    const eye = V(EYE_X0 - s.ctrl.pitch * YOKE_TRAVEL, EYE_Y, side * CARR.z);
    const phi = LEVER_ANG - p.ett;
    const tip = V(ETT.c[0] + Math.sin(phi) * ETT.lever, ETT.c[1] + Math.cos(phi) * ETT.lever, side * CARR.z);
    out["drop" + side] = [eye, tip];
  });
  // aileron lateral push rod between the two carriage arms (passes the central sector pin)
  const tip = (side: number) => {
    const [y, z] = rotX(-CARR.arm, 0, p.carr);
    return V(CARR.x + CARR.armX, CARR.y + y, side * CARR.z + z);
  };
  out.ailRod = [tip(-1), tip(1)];
  // elevator push-pull tube: aft pulley crank pin → bellcrank arm (rotates with the elevator)
  const ea = PULLEYS.ea,
    pa = p.pulley.ea;
  const pin = V(ea.c[0] + Math.sin(pa) * 0.06, ea.c[1] - Math.cos(pa) * 0.06, ea.c[2]);
  const eh = ELEV_HORN,
    ea2 = -p.elevAng;
  const horn = V(eh.c[0] + Math.sin(ea2) * eh.arm, eh.c[1] - Math.cos(ea2) * eh.arm, 0);
  out.elevPush = [pin, horn];
  // rudder push-pull tube: crank pin on the rudder empennage bellcrank (turns on the lateral FS 306 shaft) → rudder horn
  // (rotates with the rudder about ~vertical)
  const ra = PULLEYS.ra,
    pr = p.pulley.ra;
  const rpin = V(ra.c[0] + Math.sin(pr) * 0.05, ra.c[1] - Math.cos(pr) * 0.05, ra.c[2]);
  const rh = RUD_HORN_AFT;
  const rhorn = V(rh.c[0] + Math.sin(p.rudAng) * rh.arm, rh.c[1], rh.c[2] + Math.cos(p.rudAng) * rh.arm);
  out.rudPush = [rpin, rhorn];
  // pedal links: fore-aft link from each pedal pair's arm to the matching end of the cable horn
  [-1, 1].forEach((side) => {
    const hz = RUD_HORN.c[2] + side * RUD_HORN.half;
    const end = V(
      RUD_HORN.c[0] + side * RUD_HORN.half * Math.sin(p.rudHorn),
      RUD_HORN.c[1],
      RUD_HORN.c[2] + side * RUD_HORN.half * Math.cos(p.rudHorn),
    );
    out["ped" + side] = [V(PEDAL_TT.x + side * p.pedal, RUD_HORN.c[1], hz), end];
  });
  // aileron right-angle drives: wing-sector crank pin → arm on the aileron
  [-1, 1].forEach((side) => {
    out["cone" + side] = [
      crankPin(side, side > 0 ? p.pulley.awR : p.pulley.awL),
      ailPin(side, ailSurfAng(s.ctrl.roll)),
    ];
  });
  return out;
}
