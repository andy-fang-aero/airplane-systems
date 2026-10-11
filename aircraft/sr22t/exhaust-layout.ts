/**
 * SR22T exhaust connectivity: POH 13772-007 7-38–7-39; AMM 13773-002 Rev 7
 * 78-00 PDF p. 2732, Fig 78-10-2 PDF p. 2740, Fig 78-20-4 PDF p. 2756.
 * These figures are undimensioned: every coordinate, radius and bend below is
 * an illustrative fit to the study model, not an aircraft installation dimension.
 * Side-effect-free anchors let the cowl, parts and flows share the same exits.
 */
import { BufferAttribute } from "three";
import { GATE_TRANSITION, TURBINE_INLET, TURBINE_OUTLET, TURBO_X, WASTEGATE } from "./turbo-layout";
import { ACCESSORY_FACE_X, REAR_CYL_X } from "./engine-datum";
import { bentPoints } from "@/lib/geometry";
import type { Vec3 } from "@/lib/math";

/** Illustrative tube radius, AMM Fig 78-10-2 PDF 2740 (undimensioned);
 * sized to leave 10-mm clearance at the existing plug bosses. */
export const EXHAUST_RADIUS = 0.016;
export const TAILPIPE_RADIUS = 0.028;
/** Header centreline bend radius: one tube diameter, approximate. Neither the AMM (Fig 78-10-2 PDF 2740, undimensioned)
 * nor the local Continental M-18 excerpt gives a bend radius; the design proposed about 1.5 D, but the 0.057-m neck below
 * each port only leaves room for 1 D before the EGT probe station. `bentCurve` tightens a corner further
 * only where its legs are shorter (the collector joints). */
export const EXHAUST_BEND = 2 * EXHAUST_RADIUS;
/** Cylinder exhaust port joint: AMM 78-10 PDF p. 2738, installation (a)–(b), "Install new exhaust flange gaskets on
 * cylinder port studs. Position exhaust header assembly over cylinder port studs and secure with nuts"; Fig 78-10-2
 * PDF p. 2740 draws a square four-stud flange on top of each riser with gasket 5 between it and the cylinder. The
 * figure is undimensioned, so all three sizes are approximate: a 0.038-m square (the Ø0.032-m tube plus a 3-mm rim),
 * a 0.5-mm gasket and a 1.5-mm flange. They are held that small by cylinder baffle 43 (parts/engine-baffles.ts),
 * drawn 6 mm under the head and 23 mm forward of the port centre: this size keeps the baffles' 5-mm clearance. */
export const EXHAUST_PORT_FLANGE_W = 0.038; // approximate, Fig 78-10-2 PDF p. 2740
export const EXHAUST_PORT_GASKET_T = 0.0005; // approximate, Fig 78-10-2 PDF p. 2740 item 5
export const EXHAUST_PORT_FLANGE_T = 0.0015; // approximate, Fig 78-10-2 PDF p. 2740
/** Crossover radius (unchanged) and its centreline bend radius, one diameter; approximate, Fig 21-40-2 / 78-10-2. */
export const CROSSOVER_RADIUS = 0.02;
export const CROSSOVER_BEND = 2 * CROSSOVER_RADIUS;
/**
 * A bent run through `corners` (ghta's `bentCurve`, lib/geometry.ts), sampled every 10 mm, with its two ends exact. Each
 * point of `joints` found among the corners splits the run there: a tee or flange the run must pass through exactly
 * (the crossover branch, the heat-exchanger station), drawn as a fitting rather than a bend.
 */
export const bentRun = (corners: Vec3[], bend: number, joints: Vec3[] = []): Vec3[] => {
  const cut = corners
    .map((p, i) => (i > 0 && i < corners.length - 1 && joints.some((j) => j.every((v, k) => v === p[k])) ? i : -1))
    .filter((i) => i > 0);
  const runs = [0, ...cut].map((from, k) => corners.slice(from, (cut[k] ?? corners.length - 1) + 1));
  return runs.flatMap((run, k) => {
    const pts = bentPoints(run, bend);
    pts[0] = run[0];
    pts[pts.length - 1] = run.at(-1)!;
    return k === 0 ? pts : pts.slice(1);
  });
};
/** Top turbine inlet and aft discharge, distinct from the turbo shaft centre. */
export { TURBINE_INLET, TURBINE_OUTLET } from "./turbo-layout";
/** Outboard collector rail height and plane: unchanged illustrative fit below the lower ignition leads (AMM Fig 74-20-1
 * PDF 2624; Fig 78-10-2 PDF 2740). */
const RAIL_Y = -0.32;
const RAIL_Z = 0.5;
/** The turbine inlets sit aft of every cylinder (Continental M-18 Fig 5-33/5-35), so all three
 * risers of a bank flow aft. The rear riser lands on its own slip joint; the collector junction is 0.03 m aft of it
 * (illustrative), or halfway to the turbine inlet where that is closer (RH: #1 is only 0.42 in. forward of it). */
export const REAR_SLIP = (s: number): Vec3 => [REAR_CYL_X(s), RAIL_Y, s * RAIL_Z];
export const COLLECTOR_JUNCTION = (s: number): Vec3 => [
  REAR_CYL_X(s) - Math.min(0.03, (REAR_CYL_X(s) - TURBINE_INLET(s)[0]) / 2),
  RAIL_Y,
  s * RAIL_Z,
];
/** Height of the transition's inboard run, 0.04 m below the rail (illustrative): it clears the aft riser's outboard leg
 * where the RH turbine inlet sits under cylinder #1. */
export const APPROACH_Y = RAIL_Y - 0.04;
/** Above the turbine inlet; the transition drops below the rail, runs inboard, aft, then drops onto the flange. */
export const TURBINE_APPROACH = (s: number): Vec3 => [TURBINE_INLET(s)[0], APPROACH_Y, TURBINE_INLET(s)[2]];
/** Inboard end of the transition's inboard run, where the crossover branches off: 0.27 m off the CL, inboard of the
 * turbine inlet and its TIT probe (illustrative). */
export const TRANSITION_BRANCH = (s: number): Vec3 => [COLLECTOR_JUNCTION(s)[0], APPROACH_Y, s * 0.27];
/** Foot of the transition's drop below the junction, 0.03 m inboard of the rail (approximate): the drop runs down and
 * inboard so the RH transition keeps 10 mm from the RH intercooler inlet duct, which passes outboard of it at
 * |z| ≈ 0.55 (2.4 mm when the drop was vertical). Undimensioned in AMM Fig 78-10-2 PDF 2740. */
export const TRANSITION_DROP = (s: number): Vec3 => [COLLECTOR_JUNCTION(s)[0], APPROACH_Y, s * (RAIL_Z - 0.03)];
/** Continuous tailpipe, aft and down from the turbine discharge through the lower cowl (POH 7-38; AMM Fig 78-20-4
 * PDF 2756). The head runs aft from the V-band level to just past the accessory face, then bends down (Fig 5-33 prints
 * 37° 54′); the bend and the lower-cowl exit keep their stations.
 * Offsets illustrative. The last three points are the bend and the exit (`openExhaustExits`). */
const TAILPIPE_HEAD_X = ACCESSORY_FACE_X - 0.02;
const TAILPIPE_BEND_X = ACCESSORY_FACE_X - 0.06;
export const TAILPIPE = (s: number): Vec3[] => {
  const [, y, z] = TURBINE_OUTLET(s);
  return [
    TURBINE_OUTLET(s),
    [TAILPIPE_HEAD_X, y, z],
    [TAILPIPE_BEND_X, -0.625, z],
    [TAILPIPE_BEND_X - 0.015, -0.665, z],
    [TAILPIPE_BEND_X - 0.04, -0.75, z],
  ];
};
/** Pre-turbine crossover: off the inboard end of each transition's inboard run, then forward and down just
 * forward of the engine mount's aft cross tube, forward of the turbine housings and inboard of the centre
 * housings, through the heat-exchanger shroud (AMM 21-40, Fig 21-40-2; `HEAT_X` below)
 * and the LH wastegate transition. Waypoints are illustrative clearance fits. The run through the shroud is straight
 * from z −0.06 to 0.20 (approximate), so `HEAT_X`, the shroud centre, lies on it rather than on a bend. */
const CROSS_X = TURBO_X + 0.004;
const CROSS_Z = 0.26;
const crossoverSide = (s: number): Vec3[] => [
  TRANSITION_BRANCH(s),
  [CROSS_X, -0.4, s * CROSS_Z],
  [CROSS_X, -0.46, s * CROSS_Z],
];
/** Exhaust crossover heat exchanger, below the engine near the aft RH side of the oil pan (AMM 21-40, Fig 21-40-2). */
export const HEAT_X: Vec3 = [2.88, -0.52, 0.14];
/** Corner points of the bent crossover tube (`bentTubeGeo`, radius `CROSSOVER_BEND`). */
export const CROSSOVER_CORNERS: Vec3[] = [
  ...crossoverSide(-1),
  GATE_TRANSITION,
  [2.88, -0.52, -0.06],
  [2.88, -0.52, 0.2], // approximate: the straight run through the shroud ends past its RH face
  [2.88, -0.48, 0.245],
  ...crossoverSide(1).reverse(),
];
/** Tie-rod seat on the crossover: halfway down its RH vertical leg, a straight run (AMM 78-10 PDF 2734: "between the RH
 * turbocharger transition and crossover"). Station approximate. */
export const CROSSOVER_TIE_SEAT: Vec3 = [CROSS_X, -0.43, CROSS_Z];
/** The crossover's centreline as the flow draws it: the bent tube sampled every 10 mm, through `HEAT_X` and the tie-rod
 * seat exactly (both lie on straight legs, so the tube does not bend there). */
export const CROSSOVER: Vec3[] = bentRun(
  [
    ...CROSSOVER_CORNERS.slice(0, 5),
    HEAT_X,
    ...CROSSOVER_CORNERS.slice(5, 8),
    CROSSOVER_TIE_SEAT,
    ...CROSSOVER_CORNERS.slice(8),
  ],
  CROSSOVER_BEND,
  [HEAT_X, CROSSOVER_TIE_SEAT],
);
/** Fig 78-20-4: the single LH tailpipe also receives the wastegate discharge. Waypoints illustrative. The run stays
 * at x ≥ 2.715 past the rising leg of the LH intercooler inlet duct (x 2.65), then steps aft to the
 * wastegate inboard of its oil supply line, 10 mm clear of the duct (it was 5.9 mm); approximate. */
export const WASTEGATE_BYPASS: Vec3[] = [
  GATE_TRANSITION,
  [2.8, -0.46, -0.17],
  [2.72, -0.44, -0.17],
  [2.715, -0.44, -0.225], // approximate
  [WASTEGATE[0], WASTEGATE[1], -0.255], // approximate
  WASTEGATE,
  [WASTEGATE[0] - 0.02, -0.56, WASTEGATE[2]],
  TAILPIPE(-1).at(-3)!,
];

/** Two lower-cowl apertures around the swept exits (POH 7-38; AMM Fig 78-20-4).
 * Remove intersecting loft triangles conservatively; the coarse loft makes the rims
 * schematic. Upper skin and unrelated stations are retained byte for byte. */
export function openExhaustExits(g: import("three").BufferGeometry) {
  const index = g.getIndex();
  const positions = g.getAttribute("position");
  const retained: number[] = [];
  const count = index?.count ?? positions.count;
  const margin = TAILPIPE_RADIUS + 0.012; // unchanged illustrative exit clearance
  const exits = [-1, 1].map((s) => {
    const path = TAILPIPE(s),
      bend = path.at(-3)!;
    return {
      x0: path.at(-1)![0] - margin,
      x1: bend[0] + margin,
      y: bend[1],
      z0: bend[2] - margin,
      z1: bend[2] + margin,
    };
  });
  for (let i = 0; i < count; i += 3) {
    const a = index ? index.getX(i) : i,
      b = index ? index.getX(i + 1) : i + 1,
      c = index ? index.getX(i + 2) : i + 2;
    const minY = Math.min(positions.getY(a), positions.getY(b), positions.getY(c));
    let opening = false;
    if (minY < exits[0].y) {
      const minX = Math.min(positions.getX(a), positions.getX(b), positions.getX(c)),
        maxX = Math.max(positions.getX(a), positions.getX(b), positions.getX(c));
      if (maxX >= exits[0].x0 && minX <= exits[0].x1) {
        const minZ = Math.min(positions.getZ(a), positions.getZ(b), positions.getZ(c)),
          maxZ = Math.max(positions.getZ(a), positions.getZ(b), positions.getZ(c));
        for (const exit of exits) if (maxZ >= exit.z0 && minZ <= exit.z1) opening = true;
      }
    }
    if (!opening) retained.push(a, b, c);
  }
  if (index) g.setIndex(retained);
  else {
    // Main's door hull is non-indexed. Remove complete triangles from every
    // attribute together, preserving the normals/UVs of all retained skin.
    for (const [name, attribute] of Object.entries(g.attributes)) {
      const array = new (attribute.array.constructor as typeof Float32Array)(retained.length * attribute.itemSize);
      for (let i = 0; i < retained.length; i++)
        for (let c = 0; c < attribute.itemSize; c++)
          array[i * attribute.itemSize + c] = attribute.array[retained[i] * attribute.itemSize + c];
      g.setAttribute(name, new BufferAttribute(array, attribute.itemSize, attribute.normalized));
    }
  }
  g.boundingBox = null;
  g.boundingSphere = null;
  return g;
}
