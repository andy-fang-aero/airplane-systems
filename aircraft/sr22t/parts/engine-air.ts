/**
 * Engine induction and exhaust.
 * May import anchors only from earlier sections:
 * catalogue.ts, airframe.ts, surfaces.ts, cowl.ts, gear.ts, engine.ts, engine-ignition.ts, engine-oil.ts.
 * Side-effect-free helpers may come from ../geometry, ../model and ../rig.
 * Shared constants belong in catalogue.ts; later sections must never be imported here.
 */
import * as THREE from "three";
import { toV as toVec, type Vec3 } from "@/lib/math";
import {
  AIR_BOX_SIZE,
  COMPRESSOR_INLET,
  COMPRESSOR_OUTLET,
  DISCHARGE_NECK,
  TURBO,
  TURBO_HOUSINGS,
  WASTEGATE,
  WASTEGATE_ACTUATOR,
} from "../turbo-layout";
import {
  COMPRESSOR_DUCT,
  COMPRESSOR_DUCT_BEND,
  COMPRESSOR_DUCT_R,
  DUCT7,
  DUCT7_BEND,
  DUCT7_R,
  DUCT7_TENSION,
  INDUCTION_Y_INLET,
  INTERCOOLER_IN,
  INTERCOOLER_OUT,
} from "../intercooler-layout";
import { bandGeo, bentCurve, bentPoints, bentTubeGeo, curveOf } from "@/lib/geometry";
import { box, cyl, FW, tubeGeo } from "../geometry";
import { part, CONSOLE_QUADRANT } from "./catalogue";
import { NACA_INDUCTION } from "./cowl";
import {
  AIR_BOX,
  ALT_AIR,
  CYLS,
  cylExhaust,
  cylIntake,
  GATE_CONTROLLER,
  HEAT_X,
  THROTTLE,
  THROTTLE_LEN,
  THROTTLE_R,
} from "./engine";
import { OIL_SOURCE } from "./engine-oil";
import {
  bentRun,
  CROSSOVER_BEND,
  CROSSOVER_CORNERS,
  CROSSOVER_RADIUS,
  CROSSOVER_TIE_SEAT,
  COLLECTOR_JUNCTION,
  EXHAUST_BEND,
  EXHAUST_PORT_FLANGE_T,
  EXHAUST_PORT_FLANGE_W,
  EXHAUST_PORT_GASKET_T,
  REAR_SLIP,
  TURBINE_APPROACH,
  TRANSITION_BRANCH,
  TRANSITION_DROP,
  EXHAUST_RADIUS,
  TAILPIPE,
  TAILPIPE_RADIUS,
  TURBINE_INLET,
  WASTEGATE_BYPASS,
} from "../exhaust-layout";

// Undimensioned schematic positions and tube diameters: POH 13772-007 7-31, 7-37;
// AMM 13773-002 Rev 7 Fig 71-00-2 sheets 2–4 (PDF pp. 2488–2490),
// Fig 71-60-2 (PDF pp. 2557–2558), Fig 78-10-2 (PDF p. 2740).
export const INDUCTION_Y: Vec3 = [3.48, 0.06, 0];
export const INTAKE_MANIFOLD: Vec3 = [3.24, 0.05, 0];
/** Drawn manifold tube centreline and radius; the fuel manifold valve sits on its top surface. */
export const INTAKE_MANIFOLD_PATH: Vec3[] = [[3.3, 0.05, 0], INTAKE_MANIFOLD, [2.86, 0.04, 0]];
export const INTAKE_MANIFOLD_R = 0.032;
/** Mixture valve at the left aft engine-driven pump, inboard of the filter; POH 7-32, 7-38;
 * AMM 28-20 PDF p. 1112, Fig 71-00-2 sheet 3 items 25–27, 31 PDF p. 2489.
 * Position approximate; kept with the relocated fuel pump. */
export const MIXTURE_ARM: Vec3 = [2.8, -0.3, -0.12];
const inductionRef = "POH 13772-007 7-37; AMM 13773-002 Rev 7 Fig 71-60-2 (PDF pp. 2557–2558). Geometry approximate.";
// Schematic colors distinguish induction/exhaust, matching the existing flow colors;
// component identity: POH 13772-007 7-37–7-38; AMM Fig 78-10-2 (PDF p. 2740).
const INDUCTION_COLOR = "#8A969E";
const EXHAUST_COLOR = "#8A5A3C";
const exhaustRef =
  "AMM 13773-002 Rev 7 78-00 (PDF p. 2732), 78-10 (PDF p. 2734), Fig 78-10-2 (PDF p. 2740). Geometry approximate.";

// Keep paths as anchors for flows and later engine-sensor placement, without importing later sections.
/**
 * Induction duct runs. Every run is a bent tube (`bentCurve`, lib/geometry.ts) through the corner
 * points below; the flows read the same centrelines (`bentPoints`). Sources: POH 13772-007 7-37 (NACA ducts → air boxes
 * → compressors → intercoolers → "Y" → throttle body → intake manifold → intake pipes; alternate air assembly at the
 * lower front, connected to both air boxes); AMM 13773-002 Rev 7 71-60 (PDF p. 2542) and Fig 71-60-2 sheets 1–2 (PDF
 * pp. 2557–2558: duct 7, clamps 4, hose connectors 10, alternate air assembly 8). None of them dimensions a duct, a pipe or
 * a bend: every diameter, bend radius and corner point below is approximate unless its own note cites a value.
 */
/** A duct that may not sleeve into a turbo-group solid stops this far short of its face (approximate). */
const FACE_GAP = 0.0005;
/** Induction inlet duct, Ø44 mm (approximate): sized to the ≈5-cm NACA throat (parts/cowl.ts) inside the lower cowl. */
export const INLET_DUCT_R = 0.022;
/** Centreline bend radius of the inlet and alternate air ducts, approximate. */
const DUCT_BEND = 0.04;
/** The NACA duct's internal end, 0.028 m above its anchor on the skin: the inlet duct and the `inlet*` flows start here. */
export const INLET_PORT = (s: number): Vec3 => {
  const n = NACA_INDUCTION(s);
  return [n[0], n[1] + 0.028, n[2]]; // the inlet flows' existing offset above the skin anchor; approximate
};
/** Air box forward face, on the filter body's centre: the inlet duct clamps on here (Fig 71-60-2 sheet 1 items 1, 4, 7). */
export const AIR_BOX_FRONT = (s: number): Vec3 => [AIR_BOX(s)[0] + AIR_BOX_SIZE[0] / 2, AIR_BOX(s)[1], AIR_BOX(s)[2]];
/** Air box inboard face port for the alternate air tube ("A tube from each air box leads to the alternate air assembly",
 * AMM 71-60 PDF p. 2542); 0.03 m aft of the forward face, approximate. */
export const AIR_BOX_ALT = (s: number): Vec3 => [
  AIR_BOX_FRONT(s)[0] - 0.03,
  AIR_BOX(s)[1],
  AIR_BOX(s)[2] - (s * AIR_BOX_SIZE[2]) / 2,
];
/** Inlet duct corners: aft out of the NACA duct, an S-bend onto the air box axis, square into its forward face. */
export const INLET_DUCT = (s: number): Vec3[] => {
  const a = INLET_PORT(s),
    b = AIR_BOX_FRONT(s);
  // straight legs 0.05 m off the NACA duct and 0.045 m into the air box face: approximate
  return [a, [a[0] - 0.05, a[1], a[2]], [b[0] + 0.045, b[1], b[2]], [b[0] + FACE_GAP, b[1], b[2]]];
};
export const inletDuctCurve = (s: number) => bentCurve(INLET_DUCT(s), DUCT_BEND);
/** The inlet duct's centreline, sampled: the `inlet*` flows follow it. */
export const INLET_RUN = (s: number): Vec3[] => bentPoints(INLET_DUCT(s), DUCT_BEND);
/** Alternate air assembly box (engine.ts, 0.16 m wide, approximate) half width: the tubes leave its side faces. */
const ALT_AIR_HALF_W = 0.08;
/** Alternate air tube Ø48 mm (approximate). */
export const ALTERNATE_DUCT_R = 0.024;
/** Alternate air tube corners: out of the assembly's side face and down ahead of the oil sump, aft under it and outboard
 * of the ALT 1 output cable's low run (flows.ts), square into the air box's inboard face. */
const ALTERNATE_CORNERS = (s: number): Vec3[] => {
  const p = AIR_BOX_ALT(s);
  return [
    [ALT_AIR[0], ALT_AIR[1], s * ALT_AIR_HALF_W],
    [ALT_AIR[0], -0.47, s * 0.16], // corner points approximate: no source dimensions the tubes
    [ALT_AIR[0] - 0.08, -0.472, s * 0.235], // approximate
    [p[0], p[1], s * 0.235], // approximate
    p,
  ];
};
export const alternateDuctCurve = (s: number) => bentCurve(ALTERNATE_CORNERS(s), DUCT_BEND);
/** The alternate air tube's centreline, sampled: the part draws it and the `altAir*` flows follow it. */
export const ALTERNATE_DUCT = (s: number): Vec3[] => bentPoints(ALTERNATE_CORNERS(s), DUCT_BEND);
export const BLAST_TUBE: Vec3[] = [HEAT_X, [3.04, -0.54, 0.15], [3.35, -0.51, 0.06], ALT_AIR];
/** The "Y" junction's drawn outlet arm: LH inlet spigot → junction → into the throttle body's bore. Radius unchanged from
 * Approximate. The curve uses tubeGeo's default 0.15 tension (lib/geometry.ts), so it is the drawn tube's. */
export const INDUCTION_Y_R = 0.028;
const yCurve = curveOf([INDUCTION_Y_INLET(-1), INDUCTION_Y, THROTTLE], 0.15); // tubeGeo's tension; not a dimension
/** Arc-length fraction along `curve` where its x falls to `x`; the curve runs aft monotonically from `from`. */
const fractionAtX = (curve: THREE.Curve<THREE.Vector3>, x: number, from = 0) => {
  let lo = from,
    hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (curve.getPointAt(mid).x > x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
/** Throttle body ports: the "Y" outlet crosses the forward face on its drawn centreline and sleeves into the bore; the
 * manifold leaves the aft face on its own drawn centreline. */
export const THROTTLE_FRONT = yCurve
  .getPointAt(fractionAtX(yCurve, THROTTLE[0] + THROTTLE_LEN / 2, 0.3))
  .toArray() as Vec3;
export const THROTTLE_AFT: Vec3 = [
  THROTTLE[0] - THROTTLE_LEN / 2,
  INTAKE_MANIFOLD_PATH[0][1],
  INTAKE_MANIFOLD_PATH[0][2],
];
// tubeGeo's tension, so this is the drawn manifold's (approximate) centreline; the 0.15 is not a dimension
const manifoldCurve = curveOf(INTAKE_MANIFOLD_PATH, 0.15);
/** Manifold centreline point at station `x`; the drawn tube runs aft monotonically. */
const manifoldAt = (x: number) => {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (manifoldCurve.getPoint(mid).x > x) lo = mid;
    else hi = mid;
  }
  return manifoldCurve.getPoint((lo + hi) / 2);
};
/** Intake pipe Ø28 mm, a little under half the Ø2.5-in. duct 7 bore (Fig 71-60-2 proportion; no source
 * dimensions it), so it keeps 5 mm from its injector line. Approximate. */
export const INTAKE_PIPE_R = 0.014;
/** Intake pipe centreline bend radius, approximate. */
const PIPE_BEND = 0.03;
/** Forward-most manifold outlet: cylinder 6 sits forward of the drawn manifold (Continental M-18 Fig 5-34), so its pipe
 * leaves 0.04 m aft of the throttle body's aft face and runs forward to the head. Approximate. */
const OUTLET_MAX_X = THROTTLE_AFT[0] - 0.04;
/** Manifold outlet for cylinder `c`, on the manifold's side toward its bank at the cylinder's station (POH 7-37: "divided
 * by the intake pipes flowing to each cylinder"). Positions approximate. */
export const MANIFOLD_OUTLET = (c: { x: number; s: number }): Vec3 => {
  const p = manifoldAt(Math.min(c.x, OUTLET_MAX_X));
  return [p.x, p.y, c.s * INTAKE_MANIFOLD_R];
};
/**
 * Intake pipe corners for cylinder `c`: from inside the manifold out of its side, then straight down and outboard to a
 * point above the intake port (`cylIntake`, engine.ts), passing under the upper ignition lanes and under the cylinder's
 * injector line, then straight down onto the port, where a flange seats it. The vertical last leg keeps the open end
 * square to the port, 5 mm above the barrel fins. Cylinder 6's pipe, from the forward-most outlet, first runs out level
 * under its injector line's fan beside the fuel manifold valve (flows.ts). Approximate (POH 7-31, 7-37: top induction;
 * the port position is engine.ts's illustrative anchor).
 */
export const INTAKE_PIPE = (c: { x: number; s: number }): Vec3[] => {
  const o = MANIFOLD_OUTLET(c),
    port = cylIntake(c);
  // start 8 mm inside the manifold wall and leave it square through the outlet; the vertical drop onto the port is
  // 20 mm, under the injector line (its bend may use the whole drop); corners approximate
  const above: Vec3 = [port[0], port[1] + 0.02, port[2]];
  return [
    [o[0], o[1], c.s * 0.024],
    [o[0], o[1], c.s * 0.044], // 12 mm square exit past the outlet, approximate
    ...(c.x > OUTLET_MAX_X
      ? ([
          [port[0], 0, c.s * 0.105], // approximate
          [port[0], 0, c.s * 0.165], // approximate
        ] as Vec3[])
      : []),
    above,
    port,
  ];
};
/** Intake port flange on the head, round the pipe's end (POH 7-37 "intake pipes flowing to each cylinder"; the port
 * flange is not dimensioned in the sources): Ø44 mm × 4 mm, its underside on the port plane, approximate. */
export const PORT_FLANGE_R = 0.022;
export const PORT_FLANGE_T = 0.004;
export const intakePipeCurve = (c: { x: number; s: number }) => bentCurve(INTAKE_PIPE(c), PIPE_BEND, true);
/** The intake pipe's centreline, sampled every 0.01 m (a sampling step, not a dimension): the `man*` flows follow it. */
export const INTAKE_RUN = (c: { x: number; s: number }): Vec3[] =>
  bentPoints(INTAKE_PIPE(c), PIPE_BEND, undefined, true);
/** Wastegate controller sensing lines (AMM Fig 78-10-3 PDF p. 2742: hoses "TO THROTTLE BODY" and "TO MANIFOLD"; AMM
 * 81-00 PDF p. 2808: upper deck vs manifold pressure). Ø11 mm hose, approximate. */
export const SENSE_LINE_R = 0.0055;
/** Upper-deck pressure fitting on the throttle body (AMM Fig 78-10-3 PDF p. 2742: the controller hose "TO THROTTLE
 * BODY"; the controller senses the differential across the throttle plate, POH 13772-007 7-39): a boss on the body's
 * upstream (forward) half, top left, clear of the throttle position sensor (LH) and the MAP sensor (RH). Station, 45°
 * clock position and the Ø12 × 12 mm boss approximate; its base is seated 2 mm into the body. */
const UPPER_DECK_FITTING_LEN = 0.012;
const UPPER_DECK_FITTING_R = 0.006;
const DECK_TAP_DIR = new THREE.Vector3(0, Math.SQRT1_2, -Math.SQRT1_2);
const DECK_TAP_X = THROTTLE[0] + 0.04; // forward half, approximate
const deckTapAt = (out: number): Vec3 =>
  toVec([DECK_TAP_X, THROTTLE[1], THROTTLE[2]])
    .addScaledVector(DECK_TAP_DIR, THROTTLE_R + out)
    .toArray() as Vec3;
/** The fitting's outer face, where the upper-deck hose starts. */
export const UPPER_DECK_TAP: Vec3 = deckTapAt(UPPER_DECK_FITTING_LEN - 0.002);
/** Upper-deck reference run (the `deckRef` flow and its drawn hose): from the throttle body fitting, in one straight
 * run above the ignition harness, left of the spider and the magneto pressurization line, inboard of the A/C compressor
 * head; then right across the centreline over the magneto P-lead risers, aft to the firewall and down onto the
 * controller's top face (its box is 0.06 m tall, engine.ts). Corners approximate, under the cowl. */
export const UPPER_DECK_LINE: Vec3[] = [
  UPPER_DECK_TAP,
  [2.75, 0.172, -0.1085], // approximate
  [2.69, 0.184, GATE_CONTROLLER[2]], // approximate
  [GATE_CONTROLLER[0], 0.184, GATE_CONTROLLER[2]], // approximate
  [GATE_CONTROLLER[0], GATE_CONTROLLER[1] + 0.03, GATE_CONTROLLER[2]], // the box's top face, approximate
];
/** Aft end cap of the manifold, 4 mm thick inside the drawn tube's end: the manifold pressure fitting is on it.
 * Approximate. */
export const MANIFOLD_CAP_T = 0.004;
const MANIFOLD_END = INTAKE_MANIFOLD_PATH[INTAKE_MANIFOLD_PATH.length - 1];
/** Manifold pressure line: down out of the controller's underside, forward of the A/C belt plane and inboard of the belt
 *, left under the magneto P-leads and outboard of the left one's riser, between the two magnetos
 * below their pressurization lines, aft of the harness caps, into a fitting on the manifold's aft end cap. Approximate. */
export const MANIFOLD_PRESSURE_LINE: Vec3[] = [
  [GATE_CONTROLLER[0] + 0.02, GATE_CONTROLLER[1] - 0.03, GATE_CONTROLLER[2] - 0.03],
  [2.69, 0.09, -0.035], // approximate
  [2.74, 0.055, -0.015],
  [MANIFOLD_END[0] - MANIFOLD_CAP_T, MANIFOLD_END[1] + 0.01, -0.012], // fitting station on the cap, approximate
];
/** The compressor housing's forward face on the inlet axis: the inlet neck's aft end (turbo-layout.ts housings). */
const COMPRESSOR_FACE = (s: number): Vec3 => [
  TURBO(s)[0] + TURBO_HOUSINGS[TURBO_HOUSINGS.length - 1].x1,
  COMPRESSOR_INLET(s)[1],
  COMPRESSOR_INLET(s)[2],
];
/** Coupler 9 (AMM Fig 81-20-1 PDF p. 2815): a hose sleeve over the scroll outlet and the duct's first straight rise, with
 * a clamp 3 near each end. Its 0.03-m length (the straight rise the route leaves) and 4-mm wall are approximate. */
export const COUPLER_LEN = 0.03;
const COUPLER_WALL = 0.004;
export const COUPLER_TOP = (s: number): Vec3 => {
  const p = COMPRESSOR_DUCT(s)[0];
  return [p[0], p[1] + COUPLER_LEN, p[2]];
};
export const compressorDuctCurve = (s: number) => bentCurve(COMPRESSOR_DUCT(s), COMPRESSOR_DUCT_BEND);
/** The compressor duct's centreline, sampled: the `compressor*` flows follow it. */
export const COMPRESSOR_RUN = (s: number): Vec3[] => bentPoints(COMPRESSOR_DUCT(s), COMPRESSOR_DUCT_BEND);
/** Hose connector 10 with its two clamps 4 (Fig 71-60-2 sheet 2 PDF p. 2558) joins the duct to the intercooler's inlet
 * spigot on a straight piece below the baffle deck: LH on the riser above the lower-lead lane (y −0.215), RH midway along
 * the leg in to the inlet, clear of the aft baffle's edge. Stations, 0.03-m length and 4-mm wall approximate. */
const INLET_CONNECTOR_AT = (s: number): Vec3 => {
  const p = COMPRESSOR_DUCT(s);
  const [a, b] = [p[p.length - 3], p[p.length - 2]];
  return s < 0 ? [a[0], -0.215, a[2]] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
};
const INLET_CONNECTOR_LEN = 0.03; // approximate (Fig 71-60-2 sheet 2 is undimensioned)
/** Arc length along the drawn duct to its point nearest the connector station (0.5-mm samples: a search step). */
const connectorStation = (s: number) => {
  const curve = compressorDuctCurve(s),
    length = curve.getLength(),
    target = toVec(INLET_CONNECTOR_AT(s));
  let best = 0;
  for (let i = 0, n = Math.ceil(length / 0.0005), d = Infinity; i <= n; i++) {
    const di = curve.getPointAt(i / n).distanceTo(target);
    if (di < d) [d, best] = [di, (i / n) * length];
  }
  return best;
};
/** The baffle deck window's cut-out around each duct: the duct's radius plus 6 mm, centred on the duct's
 * vertical pass at `INTERCOOLER_IN` (engine-baffles.ts notches the window and seal 16 to it). Approximate. */
export const INLET_CUTOUT_R = COMPRESSOR_DUCT_R + 0.006;
/**
 * The induction path as connected runs, side `s`, in flow order: each run's part name and its centreline end points (a
 * solid's run is its inlet and outlet ports). Consecutive runs meet at a joint. One chain from the NACA inlet through
 * the compressor, the intercooler inlet duct and the intercooler to the intake manifold, then one manifold → intake pipe
 * branch per cylinder. Tests and flows read these points.
 */
export const INDUCTION_PATH = (s: number): { part: string; pts: Vec3[]; wall?: boolean }[][] => [
  [
    { part: "Induction inlet duct", pts: INLET_DUCT(s) },
    { part: "Air box / induction filter", pts: [AIR_BOX_FRONT(s), COMPRESSOR_INLET(s)] },
    { part: "Compressor inlet neck", pts: [COMPRESSOR_INLET(s), COMPRESSOR_FACE(s)] },
    { part: `${s < 0 ? "LH" : "RH"} turbocharger`, pts: [COMPRESSOR_FACE(s), COMPRESSOR_OUTLET(s)] },
    { part: "Compressor outlet coupler", pts: [COMPRESSOR_DUCT(s)[0], COUPLER_TOP(s)] },
    { part: "Intercooler inlet duct", pts: [COUPLER_TOP(s), COMPRESSOR_DUCT(s).at(-1)!] },
    { part: `${s < 0 ? "LH" : "RH"} intercooler`, pts: [INTERCOOLER_IN(s), INTERCOOLER_OUT(s)] },
    { part: "Intercooler outlet duct", pts: [INTERCOOLER_OUT(s), INDUCTION_Y_INLET(s)] },
    { part: "Induction Y junction", pts: [INDUCTION_Y_INLET(s), INDUCTION_Y, THROTTLE_FRONT] },
    { part: "Throttle body / fuel-metering valve", pts: [THROTTLE_FRONT, THROTTLE_AFT] },
    { part: "Intake manifold", pts: INTAKE_MANIFOLD_PATH },
  ],
  // the manifold divides into the intake pipes (POH 7-37): one branch per cylinder on this side, from the manifold
  // centreline at the outlet station, out through the outlet, along the pipe to its end over the intake port
  ...CYLS.filter((c) => c.s === s).map((c) => {
    const o = MANIFOLD_OUTLET(c);
    return [
      // the outlet is on the manifold's wall
      { part: "Intake manifold", pts: [[o[0], o[1], 0] as Vec3, o], wall: true },
      { part: `Intake pipe — cyl ${c.n}`, pts: [o, INTAKE_PIPE(c).at(-1)!] },
      { part: "Intake port flange", pts: [cylIntake(c)] },
    ];
  }),
];
/** Three slip-jointed pieces feed the top turbine flange (AMM Fig 78-10-2
 * PDF 2740; Fig 81-20-1 PDF 2815). Scene routing is illustrative. The turbines
 * sit aft of every cylinder (Continental M-18 Fig 5-33/5-35), so
 * all three risers flow aft and none runs past the turbo and back. */
/** Vertical neck below each exhaust port before it turns outboard; illustrative, it keeps the EGT probe station and
 * the lower harness clearance when the head moves. */
export const NECK_DROP = 0.057;
export const HEADER = (s: number) => {
  const bank = CYLS.filter((c) => c.s === s);
  const port = (i: number): Vec3 => cylExhaust(bank[i]);
  const junction = COLLECTOR_JUNCTION(s);
  const rail = (x: number): Vec3 => [x, junction[1], junction[2]];
  // AMM Figs 78-10-2 PDF 2740 / 74-20-1 PDF 2624: illustrative necks
  // leave their port vertically, then run outboard and slightly down, below the
  // lower harness, straight onto the collector rail. One 0.125-m leg instead of an
  // outboard leg and a 0.015-m drop, so each bend keeps its full radius.
  const neck = (i: number): Vec3[] => [port(i), [bank[i].x, port(i)[1] - NECK_DROP, port(i)[2]], rail(bank[i].x)];
  const frontSlip = rail((bank[0].x + bank[1].x) / 2);
  const rearSlip = REAR_SLIP(s);
  const approach = TURBINE_APPROACH(s);
  return {
    elbow: [...neck(0), frontSlip],
    tee: [frontSlip, rail(bank[1].x), junction],
    riser: neck(1),
    // The aft riser lands on its own slip joint (`rearSlip` is its rail point); the transition runs from that slip
    // through the junction, drops down and inboard below the rail, runs inboard past the turbine inlet to the crossover
    // branch, back aft and outboard over the inlet, then drops onto the flange.
    transition: [rearSlip, junction, TRANSITION_DROP(s), TRANSITION_BRANCH(s), approach, TURBINE_INLET(s)],
    aftRiser: neck(2),
  };
};
/** Corner points of each cylinder's complete run after its riser, monotonically toward the turbine station. */
const exhaustCorners = (c: (typeof CYLS)[number]): Vec3[] => {
  const h = HEADER(c.s);
  const junction = COLLECTOR_JUNCTION(c.s);
  const junctionIndex = h.transition.findIndex((p) => p === junction || p.every((v, i) => v === junction[i]));
  const entry = h.transition.slice(junctionIndex + 1);
  const bank = CYLS.filter((b) => b.s === c.s);
  if (c.n === bank[0].n) return [...h.elbow, ...h.tee.slice(1), ...entry];
  if (c.n === bank[2].n) return [...h.aftRiser, ...h.transition.slice(1)];
  const collector = c.x > junction[0] ? h.tee : h.transition.slice(0, junctionIndex + 1);
  return [...h.riser, ...collector.filter((p) => (c.x > junction[0] ? p[0] < c.x : p[0] > c.x)), ...entry];
};
/** Each cylinder's exhaust centreline from its port to its turbine inlet, following the bent header tubes (sampled every
 * 10 mm). The joints between pieces are fittings, not bends: a middle or aft riser's tee onto the collector, the
 * collector junction and the crossover tee; the run passes through each exactly, as the tubes do. */
export const EXHAUST_RUN = (c: (typeof CYLS)[number]): Vec3[] => {
  const i = CYLS.filter((b) => b.s === c.s).findIndex((b) => b.n === c.n);
  const fittings = [COLLECTOR_JUNCTION(c.s), TRANSITION_BRANCH(c.s)];
  if (i > 0) fittings.push(HEADER(c.s)[i === 1 ? "riser" : "aftRiser"].at(-1)!);
  return bentRun(exhaustCorners(c), EXHAUST_BEND, fittings);
};
/** Corner indices of a header piece kept as sharp fittings: the collector junction and the crossover tee. */
const headerSharp = (path: Vec3[], s: number) =>
  [COLLECTOR_JUNCTION(s), TRANSITION_BRANCH(s)]
    .map((j) => path.findIndex((p) => p.every((v, i) => v === j[i])))
    .filter((i) => i > 0 && i < path.length - 1);
/** A header piece's bent tube. */
const headerTubeGeo = (path: Vec3[], s: number) =>
  bentTubeGeo(path, EXHAUST_RADIUS, EXHAUST_BEND, 12, false, headerSharp(path, s));
/** RH transition's drop corner → the crossover's RH vertical leg (AMM 78-10 PDF 2734: "A tie rod with a slotted hole and
 * bushing is installed between the RH turbocharger transition and crossover"); clears the mount's aft cross tube and
 * the TIT probe. Both ends approximate. */
export const EXHAUST_TIE_ROD: Vec3[] = [HEADER(1).transition[2], CROSSOVER_TIE_SEAT];
/** Where the seat-to-seat line leaves a host tube's wall (`r` from its drawn centreline): the rod's drawn end, so it
 * stops on the transition and crossover surfaces instead of running to their centrelines. Bisection on the line. */
const wallExit = (host: THREE.Curve<THREE.Vector3>, r: number, from: Vec3, to: Vec3): Vec3 => {
  const n = Math.ceil(host.getLength() / 0.0005);
  const axis = Array.from({ length: n + 1 }, (_, i) => host.getPointAt(i / n));
  const a = toVec(from),
    b = toVec(to);
  const off = (t: number) => {
    const p = a.clone().lerp(b, t);
    return Math.min(...axis.map((q) => q.distanceTo(p))) - r;
  };
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (off(mid) < 0) lo = mid;
    else hi = mid;
  }
  return a.lerp(b, hi).toArray() as Vec3;
};
/** The drawn tie rod: from the RH transition's wall to the crossover's wall along the seat-to-seat line. */
export const TIE_ROD_ENDS = (): Vec3[] => {
  const t = HEADER(1).transition;
  const [a, b] = EXHAUST_TIE_ROD;
  return [
    wallExit(bentCurve(t, EXHAUST_BEND, false, headerSharp(t, 1)), EXHAUST_RADIUS, a, b),
    wallExit(bentCurve(CROSSOVER_CORNERS, CROSSOVER_BEND), CROSSOVER_RADIUS, b, a),
  ];
};
export const THROTTLE_CABLE: Vec3[] = [
  CONSOLE_QUADRANT,
  [2.1, -0.48, -0.07],
  [2.63, -0.35, -0.12],
  [3.12, 0.1, -0.1],
  THROTTLE,
];
export const MIXTURE_CABLE: Vec3[] = [CONSOLE_QUADRANT, [2.1, -0.5, 0.07], [2.63, -0.38, 0.15], MIXTURE_ARM];

part(
  () =>
    tubeGeo([INDUCTION_Y_INLET(-1), INDUCTION_Y, THROTTLE], INDUCTION_Y_R).translate(
      -INDUCTION_Y[0],
      -INDUCTION_Y[1],
      -INDUCTION_Y[2],
    ),
  ["engine"],
  {
    name: "Induction Y junction",
    pos: INDUCTION_Y,
    color: INDUCTION_COLOR,
    note: "Both intercooler outlet tubes join before the throttle body. " + inductionRef,
    groups: ["induction"],
  },
);
part(
  () =>
    tubeGeo(INTAKE_MANIFOLD_PATH, INTAKE_MANIFOLD_R).translate(
      -INTAKE_MANIFOLD[0],
      -INTAKE_MANIFOLD[1],
      -INTAKE_MANIFOLD[2],
    ),
  ["engine"],
  {
    name: "Intake manifold",
    pos: INTAKE_MANIFOLD,
    color: INDUCTION_COLOR,
    note: "Top induction: throttle body → manifold → individual intake pipes. " + inductionRef,
    groups: ["induction"],
  },
);
// Second inlet arm of the Y; one named assembly, no extra label over the turbo group.
part(() => tubeGeo([INDUCTION_Y_INLET(1), INDUCTION_Y], INDUCTION_Y_R), ["engine"], {
  color: INDUCTION_COLOR,
  groups: ["induction"],
});
// Duct 7: intercooler forward neck → "Y" inlet; its ends sleeve over the neck and Y spigots, as hose connectors 10 do.
// One centreline (shared with the charge-air flow), drawn as two pieces split at the forward bend so each piece's
// bounds stay tight: the outboard run along the bank and the front run to the Y.
class DuctSpan extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly full: THREE.Curve<THREE.Vector3>,
    private readonly u0: number,
    private readonly u1: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()) {
    return this.full.getPoint(this.u0 + (this.u1 - this.u0) * t, target);
  }
}
/** Duct 7 piece `i` (0 = outboard run, 1 = front run) as a curve on the duct's one centreline. */
export const duct7Span = (s: number, i: 0 | 1) => {
  const path = DUCT7(s),
    bend = DUCT7_BEND / (path.length - 1);
  return new DuctSpan(curveOf(path, DUCT7_TENSION), i ? bend : 0, i ? 1 : bend);
};
for (const s of [-1, 1])
  for (const i of [0, 1] as const) {
    const span = duct7Span(s, i);
    part(() => new THREE.TubeGeometry(span, 40, DUCT7_R, 8, false), ["engine"], {
      name: "Intercooler outlet duct",
      color: INDUCTION_COLOR,
      note:
        (s < 0 ? "LH" : "RH") +
        " duct 7: charge air from the intercooler's forward neck, forward and inboard across the front of the cylinders to the throttle body's \"Y\" junction, clamped at each end through a hose connector" +
        (s < 0 ? "; the overboost valve sits on this duct (AMM 13773-002 Rev 7 71-60 PDF p. 2542)" : "") +
        ". AMM 13773-002 Rev 7 Fig 71-60-2 sheet 2 (PDF p. 2558) items 4, 7, 10; Continental M-18 Fig 12-16 p. 12-27 (PDF p. 324) items 38–40. Ø2.5 in. from the scaled neck (M-18 Fig 5-34); routing approximate.",
      groups: ["induction"],
    });
  }
/**
 * Hose connector 10 and its two clamps 4 at each end of duct 7 (AMM 13773-002 Rev 7 Fig 71-60-2 sheet 2 Detail B, PDF
 * p. 2558; M-18 Fig 12-16 hoses 40 / clamps 42). Detail B draws each connector about as long as its bore, half over the
 * spigot and half over the duct, with a clamp band near each end. At the Y the sleeve keeps those proportions; at the
 * intercooler neck the cowl leaves only ≈2 mm around the Ø2.5-in. joint, so that sleeve is thin-walled and short and its bands sit
 * nearly flush.
 * `back` runs over the spigot, `fwd` over the duct. All sizes approximate.
 */
export const DUCT7_JOINTS = [
  { end: "neck", back: 0.02, fwd: 0.01, wall: 0.0015, proud: 0.001 },
  { end: "y", back: 0.02, fwd: 0.03, wall: 0.004, proud: 0.003 },
] as const;
/** Clamp band width and its inset from the connector end, approximate (Detail B). */
export const DUCT7_CLAMP_W = 0.005;
const CLAMP_INSET = 0.002;
/** Joint `j` of duct 7 side `s`: the duct end point, the unit axis pointing into the duct (its end tangent), the sleeve
 * span along that axis, and the two clamp centres (signed offsets along the axis). */
export const duct7Joint = (s: number, j: 0 | 1) => {
  const spec = DUCT7_JOINTS[j],
    curve = curveOf(DUCT7(s), DUCT7_TENSION);
  const at = curve.getPoint(j),
    axis = curve.getTangent(j).multiplyScalar(j ? -1 : 1);
  const r = DUCT7_R + spec.wall,
    edge = DUCT7_CLAMP_W / 2 + CLAMP_INSET;
  return { ...spec, at, axis, r, clampR: r + spec.proud, clamps: [-spec.back + edge, spec.fwd - edge] };
};
const sleeveGeo = (at: THREE.Vector3, axis: THREE.Vector3, r: number, from: number, to: number) =>
  new THREE.CylinderGeometry(r, r, to - from, 24, 1, true)
    .translate(0, (from + to) / 2, 0)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis))
    .translate(at.x, at.y, at.z);
for (const s of [-1, 1])
  for (const j of [0, 1] as const) {
    const joint = duct7Joint(s, j),
      where = (s < 0 ? "LH" : "RH") + (j ? ' duct 7 at the "Y" inlet' : " duct 7 at the intercooler neck");
    part(() => sleeveGeo(joint.at, joint.axis, joint.r, -joint.back, joint.fwd), ["engine"], {
      name: "Hose connector",
      color: "#3A3A3A",
      note:
        where +
        ": flexible hose connector over the spigot and the duct end (AMM 13773-002 Rev 7 Fig 71-60-2 sheet 2 Detail B, PDF p. 2558, item 10). Length and wall approximate" +
        (j ? "." : "; thin-walled here to stay inside the cowl."),
      groups: ["induction"],
    });
    for (const c of joint.clamps)
      part(
        () => sleeveGeo(joint.at, joint.axis, joint.clampR, c - DUCT7_CLAMP_W / 2, c + DUCT7_CLAMP_W / 2),
        ["engine"],
        {
          name: "Hose clamp",
          color: "#B4B8BC",
          note:
            where +
            ": band clamp, one at each end of the hose connector (AMM 13773-002 Rev 7 Fig 71-60-2 sheet 2 Detail B, PDF p. 2558, item 4). Size approximate.",
          groups: ["induction"],
        },
      );
  }
for (const s of [-1, 1]) {
  const side = s < 0 ? "LH" : "RH";
  part(() => bentTubeGeo(ALTERNATE_CORNERS(s), ALTERNATE_DUCT_R, DUCT_BEND), ["engine"], {
    name: "Alternate air duct",
    color: INDUCTION_COLOR,
    note:
      side +
      " tube from the alternate air assembly's side, down and aft under the oil sump into the air box's inboard face (AMM 13773-002 Rev 7 71-60 PDF p. 2542: \"A tube from each air box leads to the alternate air assembly\"; Fig 71-60-2 sheet 1 PDF p. 2557 item 8; POH 13772-007 7-37), clamped at both ends. Ø48 mm, bends and routing approximate.",
    groups: ["induction"],
  });
  const h = HEADER(s);
  // Bent tube runs (ghta's bentTubeGeo, lib/geometry.ts) at the approximate EXHAUST_BEND radius; tighter only at the
  // collector joints, where the legs are shorter. The routing is illustrative.
  for (const [name, path] of [
    ["Elbow riser", h.elbow],
    ["Exhaust tee", h.tee],
    ["Turbocharger transition", h.transition],
  ] as const) {
    const anchor = name === "Turbocharger transition" ? TURBINE_INLET(s) : path[0];
    part(() => headerTubeGeo(path, s).translate(-anchor[0], -anchor[1], -anchor[2]), ["engine"], {
      name,
      pos: anchor,
      color: EXHAUST_COLOR,
      note:
        side +
        " header assembly; the three pieces are connected by slip joints to accommodate expansion. " +
        exhaustRef,
      groups: ["exhaust"],
    });
  }
  part(() => bentTubeGeo(h.riser, EXHAUST_RADIUS, EXHAUST_BEND), ["engine"], {
    name: "Cylinder exhaust riser",
    pin: false,
    color: EXHAUST_COLOR,
    note: side + " middle cylinder → tee. " + exhaustRef,
    groups: ["exhaust"],
  });
  part(() => bentTubeGeo(h.aftRiser, EXHAUST_RADIUS, EXHAUST_BEND), ["engine"], {
    name: "Cylinder exhaust riser",
    pin: false,
    color: EXHAUST_COLOR,
    note: side + " aft cylinder → turbocharger transition, feeding forward to the turbine. " + exhaustRef,
    groups: ["exhaust"],
  });
  // Telescoping sleeves at the two collector slip joints on each bank (Fig 78-10-2).
  for (const joint of [h.tee[0], h.transition[0]]) {
    part(() => new THREE.CylinderGeometry(0.02, 0.02, 0.045, 16).rotateZ(Math.PI / 2), ["engine"], {
      pos: joint,
      color: "#B4B8BC",
      name: "Exhaust slip joint",
      note: side + " telescoping header joint; not a tailpipe V-band clamp. " + exhaustRef,
      groups: ["exhaust"],
    });
  }
  // Housing discharge neck reaches the butt joint; the start is inside its own housing,
  // not a separate pipe crossing the crankcase (AMM Fig 78-20-4 PDF p. 2756).
  part(() => tubeGeo([...DISCHARGE_NECK(s), TAILPIPE(s)[0]], TAILPIPE_RADIUS), ["engine"], {
    name: "Turbine discharge neck",
    pin: false,
    color: EXHAUST_COLOR,
    note:
      side +
      " turbine housing discharge → tailpipe butt joint (POH 7-38; AMM Fig 78-20-4 PDF p. 2756). Shape and position approximate.",
    groups: ["exhaust"],
  });
  // Bolted header / turbine inlet flange, AMM Fig 81-20-1 item 7 PDF 2815.
  // Illustrative ring size; its bottom face meets the inlet plane without burial.
  const inlet = TURBINE_INLET(s);
  part(() => new THREE.TorusGeometry(0.024, 0.004, 8, 20).rotateX(Math.PI / 2), ["engine"], {
    pos: [inlet[0], inlet[1] + 0.004, inlet[2]],
    name: "Turbine inlet flange",
    pin: false,
    color: "#B4B8BC",
    note:
      side +
      " bolted header / turbine inlet flange with gasket (AMM 13773-002 Rev 7 Fig 81-20-1 PDF 2815 item 7). Ring dimensions illustrative.",
    groups: ["exhaust"],
  });
  // V-band lies at the turbine discharge / tailpipe butt joint (Fig 78-20-4 item 2).
  const path = TAILPIPE(s);
  const direction = new THREE.Vector3(...path[1]).sub(new THREE.Vector3(...path[0])).normalize();
  const clampRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  part(
    () => new THREE.TorusGeometry(TAILPIPE_RADIUS + 0.003, 0.004, 8, 20).applyQuaternion(clampRotation),
    ["engine"],
    {
      pos: path[0],
      color: "#B4B8BC",
      name: "Turbocharger / tailpipe clamp",
      note: side + " V-band clamp at the turbine discharge / tailpipe butt joint. " + exhaustRef,
      groups: ["exhaust"],
    },
  );
}
// Each riser's flange and its gasket under the cylinder's exhaust port, the gasket's top face on the port plane
// (AMM 78-10 PDF p. 2738; Fig 78-10-2 PDF p. 2740 item 5). Sizes approximate (../exhaust-layout).
for (const c of CYLS) {
  const port = cylExhaust(c);
  for (const [name, t, y, color] of [
    ["Exhaust port gasket", EXHAUST_PORT_GASKET_T, port[1] - EXHAUST_PORT_GASKET_T / 2, "#9A9A92"],
    [
      "Exhaust port flange",
      EXHAUST_PORT_FLANGE_T,
      port[1] - EXHAUST_PORT_GASKET_T - EXHAUST_PORT_FLANGE_T / 2,
      EXHAUST_COLOR,
    ],
  ] as const)
    part(() => box(EXHAUST_PORT_FLANGE_W, t, EXHAUST_PORT_FLANGE_W), ["engine"], {
      name: `${name} — cyl ${c.n}`,
      pos: [port[0], y, port[2]],
      color,
      note:
        name === "Exhaust port gasket"
          ? `Cylinder ${c.n}: exhaust flange gasket on the port studs, replaced at every header installation (AMM 13773-002 Rev 7 78-10 PDF p. 2738; Fig 78-10-2 PDF p. 2740 item 5). Size approximate.`
          : `Cylinder ${c.n}: the header riser's four-stud flange, nutted to the cylinder port studs over the gasket (AMM 13773-002 Rev 7 78-10 PDF p. 2738; Fig 78-10-2 PDF p. 2740). Size approximate.`,
      groups: ["exhaust"],
    });
}
// The crossover joins the headers upstream of the turbines, not their shaft centres.
part(() => bentTubeGeo(CROSSOVER_CORNERS, CROSSOVER_RADIUS, CROSSOVER_BEND), ["engine", "environment"], {
  name: "Exhaust crossover pipe",
  color: EXHAUST_COLOR,
  note: "LH wastegate transition → heat-exchanger shroud → RH header. " + exhaustRef,
  groups: ["exhaust"],
});
part(() => tubeGeo(WASTEGATE_BYPASS, 0.02), ["engine"], {
  name: "Wastegate bypass pipe",
  color: EXHAUST_COLOR,
  note: "Left crossover transition → wastegate → branch into the LH tailpipe (AMM Fig 78-20-4 PDF p. 2756; POH 7-38). Geometry approximate.",
  groups: ["exhaust"],
});
part(() => tubeGeo(BLAST_TUBE, 0.012), ["engine"], {
  name: "Alternate air blast tube",
  color: "#D69D57",
  note: "Heat exchanger → alternate air assembly; heat prevents the magnetic flap from freezing (AMM 13773-002 Rev 7 71-60 PDF p. 2542; Fig 71-60-2 PDF p. 2557). Geometry approximate.",
  groups: ["induction"],
});
part(() => box(0.025, 0.02, 0.025), ["engine"], {
  pos: [ALT_AIR[0], ALT_AIR[1] + 0.045, ALT_AIR[2]],
  name: "Alternate air door switch",
  note: "Door opening signals ALT AIR OPEN; no pilot alternate-air control. " + inductionRef,
  groups: ["induction"],
});
part(() => tubeGeo(TIE_ROD_ENDS(), 0.006), ["engine"], {
  name: "Exhaust tie rod",
  color: "#B4B8BC",
  note: "RH turbocharger transition → crossover; slotted hole and bushing allow thermal expansion. " + exhaustRef,
  groups: ["exhaust"],
});
for (const [name, path, ref, group] of [
  ["Throttle control cable", THROTTLE_CABLE, "Fig 76-10-2 (PDF p. 2665)", "induction"],
  ["Mixture control cable", MIXTURE_CABLE, "Fig 76-10-3 (PDF p. 2674)", "fuel"],
] as const) {
  part(() => tubeGeo(path, 0.006), ["engine"], {
    name,
    groups: [group],
    color: "#B4B8BC",
    note:
      "Console lever → firewall → " +
      (name.startsWith("Throttle") ? "throttle body/fuel-metering valve" : "mixture valve in the engine-driven pump") +
      ". Static cable; travel and routing schematic (POH 13772-007 7-32; AMM 13773-002 Rev 7 " +
      ref +
      ").",
  });
}

/* ---------- Inlet ducts, intake pipes, joint clamps, controller sensing lines ---------- */
const CLAMP_COLOR = "#B4B8BC";
const clamp = (geo: () => THREE.BufferGeometry, where: string) =>
  part(geo, ["engine"], {
    name: "Induction clamp",
    color: CLAMP_COLOR,
    note:
      where +
      ": band clamp at the duct joint (AMM 13773-002 Rev 7 Fig 71-60-2 sheets 1–2, PDF pp. 2557–2558, item 4). Size approximate.",
    groups: ["induction"],
  });
// Clamp bands sit 5–6 mm in from a duct end, or along it from a face (approximate; Fig 71-60-2 does not dimension them).
for (const s of [-1, 1]) {
  const side = s < 0 ? "LH" : "RH";
  part(() => bentTubeGeo(INLET_DUCT(s), INLET_DUCT_R, DUCT_BEND), ["engine"], {
    name: "Induction inlet duct",
    color: INDUCTION_COLOR,
    note:
      side +
      ' duct 7 from the NACA inlet in the lower cowl aft into the air box\'s forward face, clamped there (POH 13772-007 7-37: "two NACA ducts located in the lower engine cowls … air boxes where it is filtered"; AMM 13773-002 Rev 7 Fig 71-60-2 sheet 1 PDF p. 2557 items 1, 4, 7, "INDUCTION AIR INLET (REF)"). Ø44 mm, sized to the NACA throat; bends and routing approximate.',
    groups: ["induction"],
  });
  clamp(() => bandGeo(inletDuctCurve(s), INLET_DUCT_R, -0.005), side + " inlet duct at the air box");
  clamp(() => bandGeo(alternateDuctCurve(s), ALTERNATE_DUCT_R, 0.005), side + " alternate air tube at the assembly");
  clamp(() => bandGeo(alternateDuctCurve(s), ALTERNATE_DUCT_R, -0.005), side + " alternate air tube at the air box");
}
// The "Y" outlet clamps where it enters the throttle body; the manifold clamps where it leaves it (POH 13772-007 7-31,
// 7-37; Continental M-18 Fig 12-16 p. 12-27 hoses 40 at the throttle body). Band 6 mm off each face, approximate.
clamp(
  () => bandGeo(yCurve, INDUCTION_Y_R, fractionAtX(yCurve, THROTTLE_FRONT[0] + 0.006, 0.3) * yCurve.getLength()),
  '"Y" outlet at the throttle body',
);
clamp(() => bandGeo(manifoldCurve, INTAKE_MANIFOLD_R, 0.006), "intake manifold at the throttle body");
for (const c of CYLS) {
  part(() => bentTubeGeo(INTAKE_PIPE(c), INTAKE_PIPE_R, PIPE_BEND, 12, true), ["engine"], {
    name: `Intake pipe — cyl ${c.n}`,
    color: INDUCTION_COLOR,
    note: `Intake manifold → cylinder ${c.n} intake port on top of the head: "divided by the intake pipes flowing to each cylinder" (POH 13772-007 7-37; top induction, 7-31). Hose-clamped at the manifold outlet. Ø28 mm, a little under half the duct 7 bore (no source dimensions it); routing approximate.`,
    groups: ["induction"],
  });
  clamp(() => bandGeo(intakePipeCurve(c), INTAKE_PIPE_R, 0.022), `cylinder ${c.n} intake pipe at the manifold`);
  const port = cylIntake(c);
  part(() => cyl(PORT_FLANGE_R, PORT_FLANGE_T, "y"), ["engine"], {
    name: "Intake port flange",
    pos: [port[0], port[1] + PORT_FLANGE_T / 2, port[2]],
    color: CLAMP_COLOR,
    note: `Cylinder ${c.n}: the intake pipe's flange on the intake port at the top of the head (POH 13772-007 7-31, 7-37; top induction). Size approximate; the sources do not dimension it.`,
    groups: ["induction"],
  });
}
part(
  () =>
    cyl(UPPER_DECK_FITTING_R, UPPER_DECK_FITTING_LEN, "y").applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), DECK_TAP_DIR),
    ),
  ["engine"],
  {
    name: "Upper-deck pressure fitting",
    pos: deckTapAt(UPPER_DECK_FITTING_LEN / 2 - 0.002),
    color: "#B4B8BC",
    note: "Upper-deck (throttle inlet) pressure fitting on the throttle body's upstream half, where the wastegate controller's hose \"TO THROTTLE BODY\" connects (AMM 13773-002 Rev 7 Fig 78-10-3 PDF p. 2742; POH 13772-007 7-39). Station and size approximate.",
    groups: ["induction"],
  },
);
part(() => tubeGeo(UPPER_DECK_LINE, SENSE_LINE_R, 0), ["engine"], {
  name: "Upper-deck pressure line",
  color: "#3A3A3A",
  note: 'Upper-deck (throttle inlet) pressure to the wastegate controller: the hose "TO THROTTLE BODY" (AMM 13773-002 Rev 7 Fig 78-10-3 PDF p. 2742). The controller senses the differential across the throttle plate (POH 13772-007 7-39; AMM 81-00 PDF p. 2808). It starts on the upper-deck pressure fitting on the throttle body\'s upstream half. Ø11 mm hose, routing approximate.',
  groups: ["induction"],
});
// The manifold's aft end cap, under the manifold's name (the cap carries the manifold pressure fitting).
part(() => cyl(INTAKE_MANIFOLD_R, MANIFOLD_CAP_T, "x"), ["engine"], {
  pos: [MANIFOLD_END[0] - MANIFOLD_CAP_T / 2, MANIFOLD_END[1], MANIFOLD_END[2]],
  color: INDUCTION_COLOR,
  groups: ["induction"],
});
part(() => tubeGeo(MANIFOLD_PRESSURE_LINE, SENSE_LINE_R, 0), ["engine"], {
  name: "Manifold pressure line",
  color: "#3A3A3A",
  note: 'Manifold (below-throttle) pressure to the wastegate controller: the hose "TO MANIFOLD" (AMM 13773-002 Rev 7 Fig 78-10-3 PDF p. 2742; AMM 81-00 PDF p. 2808: "the difference between the upper deck and manifold pressures"). From the controller\'s underside, between the magnetos, to a fitting on the manifold\'s aft end cap. Ø11 mm hose, fitting station and routing approximate.',
  groups: ["induction"],
});

/* ---------- The wastegate controller's oil lines and the wastegate drain ---------- */
/**
 * The wastegate is oil-actuated: engine oil pressure closes it, and the controller meters the oil returning from it to the
 * engine (POH 13772-007 7-38–7-39; AMM 81-20 PDF p. 2812; AMM 79-00 PDF p. 2764). AMM Fig 78-10-3 (PDF p. 2742) draws the
 * controller's hoses 6 to the WASTEGATE (REF) and "TO ENGINE" (the sensing hoses are phase A). The `gateOil` flow follows
 * the three oil lines below, in order. None of the figures dimensions a hose: the Ø12 mm bore, every corner point and every
 * fitting station is approximate, routed clear of the lower ignition leads, the oil cooler, the ALT 2 cable and the
 * wastegate bypass pipe. Hose end fittings are not drawn; each line stops 0.5 mm off a turbo-group solid.
 */
export const OIL_LINE_R = 0.006;
const OIL_BEND = 0.02; // hose bend radius, approximate
/** Actuator as drawn in engine.ts (a Ø0.05-m cylinder along z, 0.07 m long; shape illustrative per its note, approximate);
 * its underside and outboard end carry the fittings. */
const ACTUATOR_R = 0.025; // approximate (engine.ts)
const ACTUATOR_LEN = 0.07; // approximate (engine.ts)
const ACTUATOR_BOTTOM: Vec3 = [
  WASTEGATE_ACTUATOR[0],
  WASTEGATE_ACTUATOR[1] - ACTUATOR_R - FACE_GAP,
  WASTEGATE_ACTUATOR[2],
];
const ACTUATOR_END: Vec3 = [
  WASTEGATE_ACTUATOR[0],
  WASTEGATE_ACTUATOR[1],
  WASTEGATE_ACTUATOR[2] - ACTUATOR_LEN / 2 - FACE_GAP,
];
/** Controller box (engine.ts, 0.055 × 0.06 × 0.09 m, approximate): the oil hoses leave its underside. */
const CONTROLLER_BOTTOM_Y = GATE_CONTROLLER[1] - 0.03;
/** Oil supply: from the oil cooler's outlet fitting (`OIL_SOURCE`, engine-oil.ts), the separate wastegate hose in
 * AMM Fig 79-30-2 sheet 3 (PDF p. 2787); the turbo check valve and tee hang beside it, forward of the oil circuit's cooler feed, down beside the oil filter and forward of the wastegate, then
 * outboard under it onto the actuator's underside: the LH intercooler inlet duct passes over the actuator. Approximate. */
export const WASTEGATE_SUPPLY: Vec3[] = [
  OIL_SOURCE,
  [2.755, -0.22, -0.285], // approximate
  [2.73, -0.235, -0.295], // approximate
  [2.73, -0.37, -0.3], // approximate
  [2.72, -0.395, -0.28], // approximate
  [2.735, -0.485, -0.28], // approximate
  [2.735, -0.485, -0.32], // approximate
  [2.725, -0.49, -0.375], // approximate
  [ACTUATOR_BOTTOM[0], -0.49, ACTUATOR_BOTTOM[2]], // approximate
  ACTUATOR_BOTTOM,
];
/** Wastegate → controller hose (Fig 78-10-3 item 6, "WASTEGATE (REF)"): out of the actuator's outboard end, up near the
 * firewall outboard of the oil cooler, the lower-lead drops, the landing light feed and the LH intercooler inlet
 * duct, over the MCU, its CONV fuse and heat shield and forward of the oil separator, then inboard along the firewall
 * between it and the A/C pulleys and belt, up into the controller's underside. Approximate. */
export const WASTEGATE_RETURN: Vec3[] = [
  ACTUATOR_END,
  [ACTUATOR_END[0], ACTUATOR_END[1], -0.46], // approximate
  [2.685, -0.41, -0.46], // approximate
  [2.68, -0.36, -0.47], // approximate
  [2.68, 0.01, -0.47], // approximate (Fig 78-10-3 PDF p. 2742)
  [2.69, 0.039, -0.315], // over the MCU and its fuse, forward of the oil separator; approximate (Fig 78-10-3 PDF p. 2742)
  [GATE_CONTROLLER[0] - 0.0155, 0.035, -0.255], // approximate
  [GATE_CONTROLLER[0] - 0.0155, 0.035, GATE_CONTROLLER[2] - 0.03], // approximate
  [GATE_CONTROLLER[0] - 0.0155, CONTROLLER_BOTTOM_Y, GATE_CONTROLLER[2] - 0.03], // approximate
];
/** Controller → engine hose (Fig 78-10-3 "TO ENGINE"): from the controller's underside, forward over the A/C hoses
 *, down between them and the magneto P-lead risers, then forward under the P-leads and inboard of the oil filter
 * onto the crankcase's aft face above the oil pump. Approximate. */
export const CONTROLLER_RETURN: Vec3[] = [
  [GATE_CONTROLLER[0] + 0.015, CONTROLLER_BOTTOM_Y, GATE_CONTROLLER[2] + 0.03], // approximate
  [2.67, 0.045, 0.06], // approximate
  [2.7, 0.03, 0.03], // approximate
  [2.7, -0.065, 0.0], // approximate
  [2.742, -0.1, -0.012], // approximate
  [2.742, -0.16, -0.035], // approximate
  [2.75, -0.16, -0.06], // approximate
];
/** The three oil lines' sampled centrelines, joined through the actuator and the controller: the `gateOil` flow. */
export const GATE_OIL_RUN = (): Vec3[] => [
  ...bentPoints(WASTEGATE_SUPPLY, OIL_BEND),
  ...bentPoints(WASTEGATE_RETURN, OIL_BEND),
  ...bentPoints(CONTROLLER_RETURN, OIL_BEND),
];
/** The drain manifold's top (parts/fuel.ts DRAIN_MANIFOLD, FW + 0.07 at y −0.595; its body is 0.12 m tall). The drain line
 * test checks this stays on the part. */
const DRAIN_TOP: Vec3 = [FW + 0.07, -0.595 + 0.06 + FACE_GAP, 0]; // mirrors fuel.ts, approximate
/** Wastegate drain (AMM Fig 71-70-2 PDF p. 2565: the drain hose 3 labelled "TO WASTEGATE"): from a fitting low on the
 * wastegate's forward side, down and inboard under the LH intercooler inlet duct to the drain manifold's top. Ø8 mm,
 * fitting and route approximate. */
export const DRAIN_LINE_R = 0.004;
export const WASTEGATE_DRAIN: Vec3[] = [
  [WASTEGATE[0] + 0.0265, WASTEGATE[1] - 0.0435, -0.31], // approximate
  [2.725, -0.5, -0.31], // approximate
  [2.725, -0.528, -0.225], // approximate
  [2.68, -0.528, -0.17], // approximate
  [DRAIN_TOP[0], -0.528, -0.01], // approximate
  [DRAIN_TOP[0], DRAIN_TOP[1] + 0.006, 0], // approximate
  DRAIN_TOP,
];
for (const [name, path, note] of [
  [
    "Wastegate oil supply line",
    WASTEGATE_SUPPLY,
    "Engine oil from the oil cooler outlet to the wastegate actuator; oil pressure on the actuator piston closes the gate (POH 13772-007 7-38; AMM 81-20 PDF p. 2812; AMM 79-00 PDF p. 2764).",
  ],
  [
    "Wastegate oil line",
    WASTEGATE_RETURN,
    'Wastegate actuator → wastegate controller: the oil the controller meters back to the engine (AMM 13773-002 Rev 7 Fig 78-10-3 PDF p. 2742 hose 6, "WASTEGATE (REF)"; POH 13772-007 7-39).',
  ],
  [
    "Controller oil return",
    CONTROLLER_RETURN,
    'Wastegate controller → crankcase: the metered oil return (AMM 13773-002 Rev 7 Fig 78-10-3 PDF p. 2742 hose 6, "TO ENGINE"; AMM 81-00 PDF p. 2808; POH 13772-007 7-39).',
  ],
] as const)
  part(() => bentTubeGeo(path, OIL_LINE_R, OIL_BEND), ["engine"], {
    name,
    color: "#3A3A3A",
    note: note + " Ø12 mm hose; fittings and routing approximate.",
    groups: ["oil"],
  });
part(() => bentTubeGeo(WASTEGATE_DRAIN, DRAIN_LINE_R, OIL_BEND), ["engine"], {
  name: "Wastegate drain line",
  color: "#3A3A3A",
  note: 'Wastegate drain to the firewall drain manifold: the drain hose labelled "TO WASTEGATE" (AMM 13773-002 Rev 7 Fig 71-70-2 PDF p. 2565, items 3, 6). Fig 71-70-2 shows no induction drain. Ø8 mm; fitting and routing approximate.',
  groups: ["oil"],
});

/* ---------- The compressor → intercooler inlet ducts ---------- */
/** The duct as a closed solid: its tube with each end ring fanned to a centre vertex, where coupler 9 and the intercooler
 * close it (so the clearance audits' inside tests see a closed body). It stays a `TubeGeometry`, so audits that bound a
 * tube segment by segment still can; `userData` repeats the centreline and radius for the tests. */
const cappedDuctGeo = (s: number) => {
  const tube = bentTubeGeo(COMPRESSOR_DUCT(s), COMPRESSOR_DUCT_R, COMPRESSOR_DUCT_BEND, 16);
  const { path, tubularSegments, radialSegments } = tube.parameters;
  const ring = radialSegments + 1,
    pos = Array.from(tube.getAttribute("position").array),
    nor = Array.from(tube.getAttribute("normal").array),
    uv = Array.from(tube.getAttribute("uv").array),
    index = Array.from(tube.index!.array);
  for (const [u, first, flip] of [
    [0, 0, true],
    [1, tubularSegments * ring, false],
  ] as const) {
    const centre = pos.length / 3,
      at = path.getPointAt(u),
      n = path.getTangentAt(u).multiplyScalar(flip ? -1 : 1);
    pos.push(at.x, at.y, at.z);
    nor.push(n.x, n.y, n.z);
    uv.push(0, 0);
    for (let i = 0; i < radialSegments; i++)
      index.push(...(flip ? [centre, first + i + 1, first + i] : [centre, first + i, first + i + 1]));
  }
  tube.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  tube.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  tube.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  tube.setIndex(index);
  tube.userData = { path, radius: COMPRESSOR_DUCT_R };
  return tube;
};
for (const s of [-1, 1]) {
  const side = s < 0 ? "LH" : "RH";
  part(() => cappedDuctGeo(s), ["engine"], {
    name: "Intercooler inlet duct",
    color: INDUCTION_COLOR,
    note:
      side +
      ' induction tube from the compressor scroll outlet (coupler 9, AMM 13773-002 Rev 7 Fig 81-20-1 PDF p. 2815, "INDUCTION TUBE (REF)") up into the intercooler\'s aft end from below (duct 7 with hose connector 10 and clamps 4, Fig 71-60-2 sheet 2 PDF p. 2558; POH 13772-007 7-37: "ducted through the intercoolers"). It passes the side-baffle deck through a cut-out in the cooling-air window and seal 16: inferred (no figure) — Fig 71-60-2 sheet 2 draws the duct rising to the intercooler but not the baffle opening. Ø2.1 in., scaled from Fig 81-20-1; route fitted clear of the lower ignition leads, the turbo oil lines and the mount; approximate.',
    groups: ["induction"],
  });
  const curve = compressorDuctCurve(s),
    length = curve.getLength(),
    start = toVec(COMPRESSOR_DUCT(s)[0]),
    up = new THREE.Vector3(0, 1, 0);
  part(() => sleeveGeo(start, up, COMPRESSOR_DUCT_R + COUPLER_WALL, 0, COUPLER_LEN), ["engine"], {
    name: "Compressor outlet coupler",
    color: "#3A3A3A",
    note:
      side +
      " coupler 9 over the compressor scroll outlet and the induction tube, a clamp 3 near each end (AMM 13773-002 Rev 7 Fig 81-20-1 PDF p. 2815). Length and wall approximate.",
    groups: ["induction"],
  });
  for (const at of [0.006, COUPLER_LEN - 0.006])
    clamp(
      () => bandGeo(curve, COMPRESSOR_DUCT_R + COUPLER_WALL, at),
      side + " compressor outlet coupler (Fig 81-20-1 item 3)",
    );
  const mid = connectorStation(s),
    at = curve.getPointAt(mid / length),
    axis = curve.getTangentAt(mid / length);
  part(
    () => sleeveGeo(at, axis, COMPRESSOR_DUCT_R + COUPLER_WALL, -INLET_CONNECTOR_LEN / 2, INLET_CONNECTOR_LEN / 2),
    ["engine"],
    {
      name: "Intercooler inlet hose connector",
      color: "#3A3A3A",
      note:
        side +
        " hose connector 10 joining the induction tube to the intercooler's inlet spigot, a clamp 4 near each end (AMM 13773-002 Rev 7 Fig 71-60-2 sheet 2 PDF p. 2558). Station, length and wall approximate.",
      groups: ["induction"],
    },
  );
  for (const d of [-1, 1])
    clamp(
      () => bandGeo(curve, COMPRESSOR_DUCT_R + COUPLER_WALL, mid + d * (INLET_CONNECTOR_LEN / 2 - 0.006)),
      side + " intercooler inlet hose connector (Fig 71-60-2 sheet 2 item 4)",
    );
}
