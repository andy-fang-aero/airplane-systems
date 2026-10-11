/**
 * Engine ignition and starting.
 * May import anchors only from earlier sections:
 * catalogue.ts, airframe.ts, surfaces.ts, cowl.ts, gear.ts, engine.ts.
 * Side-effect-free helpers may come from ../geometry, ../model, ../rig and ../store.
 * Shared constants belong in catalogue.ts; later sections must never be imported here.
 */
import { ConeGeometry, Curve, Quaternion, TubeGeometry, Vector3 } from "three";
import { box, cyl, sph } from "@/lib/geometry";
import type { Vec3 } from "@/lib/math";
import { firingPhase, leadAnim, glowAnim } from "@/lib/anims";
import { useSR22T } from "../store";
import { part, fires, IGNITION_SWITCH } from "./catalogue";
import {
  CYLS,
  MAGNETO,
  MAGNETO_CAP_END,
  MAGNETO_DRIVE_END,
  MAGNETO_R,
  FIRING_ORDER,
  PLUG_LENGTH,
  cylPoint,
  plugMagneto,
  plugOffset,
  THROTTLE,
  THROTTLE_R,
} from "./engine";

// Illustrative metres, not measured dimensions: AMM 13773-002 Rev 7 74-00 PDF p. 2604, Fig 74-10-2 PDF p. 2618,
// Fig 74-20-1 PDF p. 2624, Fig 74-20-2 PDF p. 2625, 80-10 PDF p. 2798, Fig 80-10-1 PDF p. 2800.

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
/** Rotation taking +y onto `dir` (a unit vector). */
const fromUp = (dir: Vec3) => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...dir));

/** Straight spans between illustrative clamps avoid curve overshoot into equipment (AMM Fig 74-20-1 PDF p. 2624). The
 * path is parametrised per span, so tube rings land on every corner instead of cutting it into nearby parts or the cowl. */
class Polyline extends Curve<Vector3> {
  constructor(private pts: Vector3[]) {
    super();
  }
  private at(t: number) {
    const n = this.pts.length - 1,
      u = Math.min(Math.max(t, 0), 1) * n,
      i = Math.min(Math.floor(u), n - 1);
    return { i, f: u - i };
  }
  override getPoint(t: number, target = new Vector3()) {
    const { i, f } = this.at(t);
    return target.lerpVectors(this.pts[i], this.pts[i + 1], f);
  }
  override getPointAt(t: number, target = new Vector3()) {
    return this.getPoint(t, target);
  }
  override getTangent(t: number, target = new Vector3()) {
    const { i } = this.at(t);
    return target.subVectors(this.pts[i + 1], this.pts[i]).normalize();
  }
  override getTangentAt(t: number, target = new Vector3()) {
    return this.getTangent(t, target);
  }
}
const SPAN_RINGS = 4;
const ignitionTube = (pts: Vec3[], r: number, at: Vec3) => () => {
  const v = pts.map((p) => new Vector3(...p)).filter((p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > 1e-9);
  return new TubeGeometry(new Polyline(v), (v.length - 1) * SPAN_RINGS, r, 8, false).translate(-at[0], -at[1], -at[2]);
};

/* ---------- ignition harness: one shielded lead per plug from its magneto (AMM 74-00 PDF p. 2604; Fig 74-20-1) ---------- */
type Mag = "R" | "L";
/** Harness cap and terminal cylinder sizes, and the terminal circle radius; illustrative. */
const CAP_R = 0.03,
  CAP_LEN = 0.012,
  TERMINAL_R = 0.006,
  TERMINAL_CIRCLE = 0.018; // approximate: Fig 74-20-2 (PDF p. 2625) is undimensioned
/** Distributor-cap centre on the magneto's forward face, its six-terminal cluster on the outboard half (AMM Fig 74-20-1
 * item 9 PDF p. 2624; Fig 74-20-2 PDF p. 2625, cap faces drawn from the front); dimensions illustrative. */
export const HARNESS_CAP = (mag: Mag): Vec3 =>
  add(MAGNETO_CAP_END(mag), [CAP_LEN / 2 - 0.002, 0, (mag === "R" ? 1 : -1) * (MAGNETO_R - CAP_R - 0.002)]);
/** Six numbered outlets on the forward cap face, as Fig 74-20-2 (PDF p. 2625) draws them seen from the front: right
 * magneto 1 low outboard, then 2, 3 (top), 4, 5, 6 (bottom) counterclockwise; left magneto 1 high outboard, then 2, 3
 * (bottom), 4, 5, 6 (top) clockwise. Angle from +z (airplane right) toward +y; dimensions illustrative. */
export const capTerminal = (mag: Mag, terminal: number): Vec3 => {
  const angle = (mag === "R" ? -Math.PI / 6 : (5 * Math.PI) / 6) + ((terminal - 1) * Math.PI) / 3;
  return add(HARNESS_CAP(mag), [CAP_LEN / 2, Math.sin(angle) * TERMINAL_CIRCLE, Math.cos(angle) * TERMINAL_CIRCLE]);
};
/** Illustrative ferrule length (AMM Fig 74-20-1 Detail B PDF p. 2624; 74-20 PDF p. 2622).
 * Cylinder 2 lower uses a compact 6 mm long, 12 mm radius nut to clear the ALT 2 cable without moving its plug. */
export const terminalLength = (c: { n: number }, pos: "U" | "L") => (c.n === 2 && pos === "L" ? 0.006 : 0.024);
/** Coaxial ferrule/nut at the barrel end (AMM 74-20 PDF p. 2622, Fig 74-20-1 Detail B PDF p. 2624). */
export const plugTerminal = (c: { x: number; s: number; n: number }, pos: "U" | "L"): Vec3 =>
  add(cylPoint(c, plugOffset(c, pos)), [0, (pos === "U" ? 1 : -1) * (PLUG_LENGTH / 2 + terminalLength(c, pos) / 2), 0]);
/* Routing: every waypoint stays under the cowl loft (POH 13772-007 Fig 1-1), so nothing rides above the
 * cowl top. Upper-plug leads run along the top of each bank inboard of the plugs (AMM Fig 74-20-1 PDF p. 2624); lower-plug
 * leads drop aft of the intercooler cores and run forward below the heads to each lower plug. The leads leave
 * the forward cap faces forward and fan out just aft of the cylinder 1 and 2 intake runners, then run in four bundles
 *: the crossing upper leads over the spider drain, the lower leads out beside each magneto and down to
 * their drops, clear of the A/C compressor and hoses, BAT 1, the oil hardware and the crankcase. All coordinates
 * illustrative. */
/** Upper (inboard) lane height along the banks. */
export const UPPER_LANE_Y = 0.05;
/** Lower-lead descent stations: [x, innermost |z|]. RH stays inboard of the core and clear of BAT 1;
 * LH stays below the core and clear of ALT 2, the oil cooler and its fittings. Runs sit below the heads
 * and above the exhaust necks. LH drops move forward/outboard to clear the turbo oil hoses;
 * approximate: AMM Fig 74-20-1 PDF p. 2624; Fig 79-30-2 sheet 3 PDF p. 2787 are undimensioned. */
export const LOWER_DROP = (s: number): [number, number] => (s > 0 ? [2.785, 0.34] : [2.765, 0.405]);
export const LOWER_RUN_Y = -0.265;
/** Separate lateral/short forward heights; the longer runs return to LOWER_RUN_Y ahead of all the drops. Approximate 12 mm pitch: AMM 74-20 PDF p. 2622 / Fig 74-20-1 PDF p. 2624 does not dimension routing. */
const LOWER_EXIT_RUN = 0.05; // approximate forward distance before returning to the common height; AMM Fig 74-20-1 PDF p. 2624
const lowerExitY = (k: number) => LOWER_RUN_Y - (2 - k) * 0.012;
/** Lane z for the k-th cylinder from aft on side `s`: aft leads ride outermost on top and innermost below, so each
 * branches off without crossing the leads that run on. */
export const upperLane = (s: number, k: number) => s * (0.324 - k * 0.012);
export const lowerLane = (s: number, k: number) => s * (0.428 + k * 0.012);
/** Clamps hold the upper lanes at each cylinder, centred on the leads still running there (AMM 74-20 PDF p. 2621;
 * Fig 74-20-1 PDF p. 2624); position approximate. */
export const harnessClamp = (c: { x: number; s: number }): Vec3 => {
  const k = CYLS.filter((b) => b.s === c.s && b.x < c.x).length;
  return [c.x, UPPER_LANE_Y, upperLane(c.s, (k + 2) / 2)];
};
/** Station of the crossing upper bundles, ahead of the cap faces and aft of the cylinder 1 and 2 intake runners.
 * approximate: a routing station fitted between the cap faces (x 2.861) and the runners (x 2.877). */
const CAP_FAN_X = 2.868;
type Bundle = { via: Vec3[]; entry?: number };
/** Bundle continuations after the staggered cap departure, keyed by plug position and destination side. */
const BUNDLES: Record<"U1" | "U-1" | "L1" | "L-1", Bundle> = {
  // left magneto → right uppers: up inboard of the A/C compressor, across over the spider drain and the intake
  // manifold's aft end, forward over the cylinder 1 intake runner under the A/C suction hose, then down ahead of the
  // runner and back out to the right lanes (AMM 21-50 PDF pp. 499–503, Fig 71-00-2 sheets 1–2 PDF
  // pp. 2487–2488)
  U1: {
    via: [
      [CAP_FAN_X, 0.112, 0.1],
      [2.92, 0.112, 0.1],
      [2.92, 0.06, 0.15],
      [2.92, 0.06, 0.25],
      [2.88, 0.06, 0.29],
    ],
    entry: 2.88,
  },
  // right magneto → left uppers: up outboard of the right cap, across above the left-to-right bundle and under the A/C
  // discharge hose, then forward over the manifold-valve drain where it runs aft over the intake manifold (AMM
  // Fig 71-00-2 sheet 1 item 4 PDF p. 2487), under the A/C suction hose
  "U-1": {
    via: [
      [CAP_FAN_X, 0.14, 0.045],
      [2.95, 0.124, -0.04],
    ],
    entry: 2.95,
  },
  // right magneto → right lowers: outboard below the filter, aft beside the magneto to the accessory face, down aft of
  // the crankcase, then under BAT 1 and the A/C hoses' low run (AMM 21-50 PDF pp. 499–503) out to the drop
  L1: {
    via: [
      [2.738, -0.215, 0.135],
      [2.755, -0.215, 0.245],
    ],
  },
  // left magneto → left lowers: outboard, aft beside the magneto and down between the crankcase and the oil cooler, oil
  // filler tube, oil lines and sensors, then outboard ahead of the oil filter, oil valve/tee and ALT 2 to the drop
  "L-1": {
    via: [
      [2.846, -0.215, -0.172],
      // Approximate outboard pass around the cooler-base check valve/tee at the cooler base:
      // AMM Fig 74-20-1 PDF p. 2624; oil hardware Fig 79-30-2 sheet 3 PDF p. 2787.
      [2.846, -0.215, -0.3],
      [2.846, -0.215, -0.395],
    ],
  },
};
/** Approximate outlet-specific departure stations (metres): AMM 13773-002 Rev 7 74-20 PDF pp. 2621–2622,
 * Fig 74-20-1 PDF p. 2624 and Fig 74-10-2 PDF p. 2618 show clamped harnesses but do not dimension their routes.
 * Stagger the fan and the first two bundle stations to leave at least one wire diameter between cap departures;
 * the later tied bundles retain their illustrative compact spacing. The right 5L/2U departures also pass
 * aft of the opposite magneto's upper-bundle descent, rather than intersecting that separate bundle. */
const CAP_DEPARTURE: Record<string, Vec3[]> = {
  "5U": [
    [2.86702, 0.06098, -0.05847],
    [2.87189, 0.06014, -0.0505],
    [2.86842, 0.1045, -0.0075],
  ],
  "5L": [
    [2.91629, 0.01502, 0.06427],
    [2.90388, 0.07112, 0.18027],
    [2.86496, -0.0001, 0.15572],
    [2.75701, 0.0155, 0.20037],
    [2.738, 0.012, 0.147],
  ],
  "6U": [
    [2.88718, 0.0995, 0.19271],
    [2.89299, 0.03551, 0.14707],
    [2.87703, 0.14358, 0.13081],
  ],
  "6L": [
    [2.87574, 0.01045, -0.13633],
    [2.867, 0.01055, -0.17775],
    [2.8, 0.012, -0.184],
  ],
  "3U": [
    [2.86923, -0.00851, -0.10044],
    [2.87932, 0.06421, -0.06167],
    [2.88106, 0.112, 0.0],
  ],
  "3L": [
    [2.89742, 0.0616, 0.11147],
    [2.87113, 0.02239, 0.13056],
    [2.738, 0.0, 0.135],
  ],
  "4U": [
    [2.92953, 0.00061, 0.13385],
    [2.89566, 0.03128, 0.19263],
    [2.83117, 0.13907, 0.13175],
  ],
  "4L": [
    [2.87084, 0.07523, -0.10759],
    [2.88498, -0.00117, -0.17157],
    [2.8, 0, -0.172],
  ],
  "1U": [
    [2.89225, 0.04628, -0.13552],
    [2.867, 0.07733, -0.05047],
    [2.85031, 0.1195, 0.0075],
  ],
  "1L": [
    [2.868, 0.002, 0.11776],
    [2.86892, -0.00962, 0.123],
    [2.738, -0.012, 0.123],
  ],
  "2U": [
    [2.91643, -0.00437, 0.03008],
    [2.91431, 0.01886, 0.1433],
    [2.84152, 0.12948, 0.10731],
  ],
  "2L": [
    [2.87507, 8e-5, -0.0579],
    [2.89044, -0.00897, -0.14924],
    [2.8, -0.012, -0.16],
  ],
};
export const IGNITION_LEADS = CYLS.flatMap((c) =>
  (["U", "L"] as const).map((pos) => {
    const mag = plugMagneto(c, pos),
      terminal = FIRING_ORDER.indexOf(c.n as (typeof FIRING_ORDER)[number]) + 1,
      end = plugTerminal(c, pos),
      phase = firingPhase(FIRING_ORDER, c.n),
      // Each wire follows every intervening clamp rather than crossing straight through the engine.
      bank = CYLS.filter((b) => b.s === c.s && b.x <= c.x).sort((a, b) => a.x - b.x),
      k = bank.length - 1,
      lane = pos === "U" ? upperLane(c.s, k) : lowerLane(c.s, k),
      bundle = BUNDLES[`${pos}${c.s}` as keyof typeof BUNDLES],
      // Three separate wires per bundle, stacked 6 mm apart and fanning out to their 12 mm lanes.
      stack = (lane - (pos === "U" ? upperLane(c.s, 1) : lowerLane(c.s, 1))) / 2,
      // Lower bundles have approximate 12 mm y/z pitch. Opposite y/z signs on the LH bank keep
      // each down-then-outboard turn nested without crossing (AMM Fig 74-20-1 PDF p. 2624).
      spread = (pos === "L" ? 2 : 1.25) * stack,
      bundleY = pos === "L" ? c.s * spread : spread,
      runY = lowerExitY(k),
      [dropX, dropZ] = [LOWER_DROP(c.s)[0] - c.s * k * 0.012, c.s * (LOWER_DROP(c.s)[1] + k * 0.012)],
      // Approximate forward lane-transition offset: the undimensioned AMM 74-20 PDF p. 2622 / Fig 74-20-1
      // PDF p. 2624 supplies no routing dimensions. Cylinder 2 turns outboard ahead of the hotL cabin-heat line.
      laneX = dropX + (c.n === 2 ? 0.04 : 0),
      run: Vec3[] =
        pos === "U"
          ? [
              [bundle.entry!, UPPER_LANE_Y, lane],
              ...bank.map((b): Vec3 => [b.x, UPPER_LANE_Y, lane]),
              // Back from the clamp and out over the plug, then down onto the ferrule.
              [end[0], end[1] + 0.035, (lane + end[2]) / 2],
              [end[0], end[1] + 0.025, end[2]],
            ]
          : [
              // Descend to the separate stations beside/below the cores, then run forward below the heads, turn in and rise
              // into the ferrule's outer end along the barrel axis (AMM 74-20 PDF p. 2622; Fig 74-20-1
              // Detail B PDF p. 2624); offsets illustrative.
              // LH leads first step aft/outboard of the new cooler-base valve, tee and oil hoses,
              // then descend without a dip or additional reversal, clear of ALT 2. Approximate:
              // AMM 74-20 PDF p. 2622 / Fig 74-20-1 PDF p. 2624; Fig 79-30-2 sh 3 PDF p. 2787.
              ...(c.s < 0 ? [[dropX, bundle.via.at(-1)![1] + bundleY, bundle.via.at(-1)![2] + spread] as Vec3] : []),
              // Cylinder 6 descends below the side baffle before its outboard step. Approximate:
              // AMM Fig 74-20-1 PDF p. 2624; Fig 71-60-2 sheet 2 PDF p. 2558.
              ...(c.n === 6 ? [[dropX, runY + 0.01, bundle.via.at(-1)![2] + spread] as Vec3] : []),
              [dropX, runY, dropZ],
              ...(laneX !== dropX ? [[laneX, runY, dropZ] as Vec3] : []),
              [laneX, runY, lane],
              [laneX + LOWER_EXIT_RUN, runY, lane],
              ...(k < 2 ? [[laneX + LOWER_EXIT_RUN, LOWER_RUN_Y, lane] as Vec3] : []),
              [end[0], LOWER_RUN_Y, lane],
              [end[0], LOWER_RUN_Y, end[2] + c.s * 0.03],
              [end[0], end[1] - terminalLength(c, pos) / 2 - 0.012, end[2] + c.s * 0.03],
              [end[0], end[1] - terminalLength(c, pos) / 2 - 0.012, end[2]],
            ],
      outlet = capTerminal(mag, terminal),
      departure = CAP_DEPARTURE[`${c.n}${pos}`];
    return {
      cyl: c.n,
      pos,
      mag,
      terminal,
      phase,
      pts: [
        outlet,
        // Approximate straight release from the ferrule before fanning: AMM Fig 74-20-1 PDF p. 2624.
        [2.867, outlet[1], outlet[2]],
        ...departure,
        ...bundle.via.map((p): Vec3 => [p[0], p[1] + bundleY, p[2] + spread]),
        ...run,
        end,
      ] as Vec3[],
    };
  }),
);
(["R", "L"] as const).forEach((mag) => {
  part(() => cyl(CAP_R, CAP_LEN, "x"), ["engine"], {
    pos: HARNESS_CAP(mag),
    color: "#655344",
    name: "Harness cap",
    pin: mag === "R",
    note: `${mag === "R" ? "Right" : "Left"} magneto harness cap on the forward face, six terminals on its outboard half; the leads leave forward (AMM 74-10 PDF p. 2615; Fig 74-20-1 item 9 PDF p. 2624; Fig 74-20-2 PDF p. 2625). Shape and size illustrative.`,
    groups: ["ignition"],
  });
  for (let terminal = 1; terminal <= 6; terminal++)
    part(() => cyl(TERMINAL_R, CAP_LEN, "x"), ["engine"], {
      pos: capTerminal(mag, terminal),
      color: "#B7A480",
      name: `Harness cap terminal ${terminal}`,
      note: `Terminal ${terminal}: cylinder ${FIRING_ORDER[terminal - 1]} (AMM Fig 74-20-2 PDF p. 2625). Figure numbering retained by firing order; plug assignment follows POH 7-37 where the AMM differs. Outlet position illustrative.`,
      groups: ["ignition"],
    });
  IGNITION_LEADS.filter((l) => l.mag === mag).forEach((l, i) =>
    part(ignitionTube(l.pts, 0.005, l.pts[2]), ["engine"], {
      pos: l.pts[2],
      color: "#26333D",
      name: `Ignition lead — ${mag === "R" ? "right" : "left"} magneto`,
      pin: i === 0,
      anim: leadAnim(fires(mag), l.phase, Math.cos(Math.PI / FIRING_ORDER.length)),
      note: `Shielded lead: ${mag === "R" ? "right" : "left"} magneto terminal ${l.terminal} → cylinder ${l.cyl} ${l.pos === "U" ? "upper" : "lower"} plug (POH 7-37; AMM Fig 74-20-1 PDF p. 2624). Cap numbering by engine firing order 1-6-3-2-5-4 (AMM Fig 74-20-2 PDF p. 2625); POH plug assignment governs the conflicting AMM. Routing, diameter and flash timing illustrative.`,
      groups: ["ignition"],
    }),
  );
});
CYLS.forEach((c) => {
  part(() => box(0.025, 0.023, 0.035), ["engine"], {
    pos: harnessClamp(c),
    color: "#A6ADB2",
    name: "Harness clamp",
    pin: c.n === 5,
    note: "Clamp securing the shielded leads along the top of the cylinder bank (AMM 74-20 PDF p. 2621; Fig 74-20-1 PDF p. 2624, Fig 71-00-2 item 37 PDF p. 2490). Position and size approximate.",
    groups: ["ignition"],
  });
  (["U", "L"] as const).forEach((pos) =>
    part(() => cyl(c.n === 2 && pos === "L" ? 0.012 : 0.018, terminalLength(c, pos), "y", 6), ["engine"], {
      pos: plugTerminal(c, pos),
      color: "#B7A480",
      name: "Plug lead terminal",
      pin: c.n === 5 && pos === "U",
      note: `Cylinder ${c.n} ${pos === "U" ? "upper" : "lower"} shielded terminal: ferrule and nut coaxial with the plug barrel (AMM Fig 74-20-1 Detail B PDF p. 2624; 74-20 PDF p. 2622). Size and boss angle illustrative.`,
      groups: ["ignition"],
    }),
  );
});
/** Condenser (P-lead) terminal, low on the magneto's forward face below the cap. INFERRED: AMM 74-10 (PDF p. 2615,
 * removal step (c)) takes the P-leads off the magneto condensers without locating them; Fig 74-10-2 (PDF p. 2618)
 * draws an unlabelled stud at each body's lower forward corner, taken to be the condenser terminal. Position
 * illustrative. */
export const CONDENSER_STUD = (mag: Mag): Vec3 => add(MAGNETO_CAP_END(mag), [0, -0.032, 0]);
/** Housing ground attachment, a separate point on the magneto body's lower outboard side. The ground wire is not on the
 * condenser terminal: AMM 74-10 (PDF p. 2615) removes the P-leads from the condensers (step (c)) and the ground wires
 * from the magnetos (step (d)) as separate items, and a P-lead tied to engine ground would keep the magneto grounded in
 * BOTH (Fig 74-00-1 PDF p. 2612; POH 13772-007 7-37). Neither document locates it; position illustrative. */
export const MAGNETO_GROUND = (mag: Mag): Vec3 =>
  add(MAGNETO(mag), [0, -0.6 * MAGNETO_R, (mag === "R" ? 1 : -1) * 0.8 * MAGNETO_R]);
export const P_LEADS = (["R", "L"] as const).map((mag) => {
  const z = MAGNETO(mag)[2],
    side = mag === "R" ? 1 : -1,
    stud = CONDENSER_STUD(mag),
    dy = mag === "R" ? 0.012 : 0;
  // Off the stud, inboard below the caps and aft between the magnetos above the crankcase, up aft of the accessory
  // face and the pressurization tee, then aft through the firewall below the cowl top (AMM 74-10
  // PDF p. 2615). Routing illustrative.
  return {
    mag,
    pts: [
      stud,
      add(stud, [0.005, 0, 0]),
      [stud[0] + 0.005, stud[1], side * 0.008],
      [2.72, stud[1], side * 0.008],
      [2.72, 0.12, side * 0.008],
      [2.66, 0.16 + dy, side * 0.008],
      [2.58, 0.165 + dy, z],
      [2.5, 0.165 + dy, -0.2],
      [2.48, 0.12 + dy, -0.38],
      [2.38, 0.08 + dy, -0.45],
      IGNITION_SWITCH,
    ] as Vec3[],
  };
});
P_LEADS.forEach(({ mag, pts }) => {
  const grounded = () => {
    const key = useSR22T.getState().s.eng.key;
    return key === "OFF" || key === (mag === "R" ? "L" : "R");
  };
  part(ignitionTube(pts, 0.004, pts[1]), ["engine", "electrical"], {
    pos: pts[1],
    color: "#45484B",
    name: "Magneto P-lead",
    pin: mag === "R",
    anim: glowAnim("#45484B", grounded, ["engine", "electrical"]),
    note: `${mag === "R" ? "Right" : "Left"} magneto condenser → ignition switch through firewall; highlighted when grounded by OFF or ${mag === "R" ? "L" : "R"} (POH 7-37; AMM 74-10 PDF p. 2615, Fig 74-00-1 PDF p. 2612; 74-30 PDF p. 2631). Routing and wire size approximate.`,
    groups: ["ignition"],
  });
  // From the housing ground attachment outboard and down to a lug on the crankcase top beside the magneto
  // (illustrative).
  const side = mag === "R" ? 1 : -1,
    housing = MAGNETO_GROUND(mag);
  const ground: Vec3[] = [
    housing,
    [housing[0], housing[1] - 0.004, housing[2] + side * 0.0074],
    [housing[0], housing[1] - 0.016, housing[2] + side * 0.0074],
  ];
  part(() => cyl(0.009, 0.004, "x"), ["engine", "electrical"], {
    pos: ground.at(-1)!,
    color: "#B7A480",
    name: "Engine ground lug",
    note: "Engine ground attachment (AMM 74-10 PDF p. 2615; Fig 74-00-1 PDF p. 2612). Surface lug position and size illustrative.",
    groups: ["ignition"],
  });
  part(ignitionTube(ground, 0.004, ground[1]), ["engine", "electrical"], {
    pos: ground[1],
    color: "#727A80",
    name: "Magneto ground wire",
    pin: mag === "R",
    note: `${mag === "R" ? "Right" : "Left"} magneto ground wire to engine ground (AMM 74-10 PDF p. 2615; Fig 74-00-1 PDF p. 2612). Lug positions, wire size and routing illustrative.`,
    groups: ["ignition"],
  });
});

/* ---------- magneto pressurization (SR22T): throttle-body fitting → desiccant filter → tee → both magnetos ---------- */
// AMM 13773-002 Rev 7 74-00 PDF p. 2604; 74-10 Installation – Magneto Filter PDF p. 2616; Fig 74-10-2 Detail A PDF
// p. 2618; Fig 71-00-2 sheets 1–2 PDF pp. 2487–2488; Continental M-18 Fig 5-35 (657645 sheet 3) View F-F PDF p. 150.
/** Hose radius: 0.25 in. I.D. (M-18 Fig 5-35 View F-F "MAGNETO PRESSURE 0.25 HOSE I.D."), Ø12 mm outside, approximate. */
const MAG_HOSE_R = 0.006;
/** Dedicated "MAGNETO PRESSURE" fitting on the throttle body's upstream (upper-deck) half, beside but separate from the
 * controller's "TO THROTTLE BODY" fitting (M-18 Fig 5-35 View F-F PDF p. 150; AMM 74-00 PDF p. 2604 "upper deck
 * reference pressure"): at the controller tap's station, 20° left of top. Station, clock position and the Ø12 × 10 mm
 * boss approximate (View F-F does not state its viewing direction); its base is seated 2 mm into the body. */
const MAG_PRESSURE_DIR: Vec3 = [0, Math.cos(Math.PI / 9), -Math.sin(Math.PI / 9)];
const MAG_PRESSURE_FITTING_LEN = 0.01; // approximate
const magPressureAt = (out: number): Vec3 =>
  add([THROTTLE[0] + 0.04, THROTTLE[1], THROTTLE[2]], scale(MAG_PRESSURE_DIR, THROTTLE_R + out)); // station approximate
/** The fitting's outer face, where the magneto pressure hose starts. */
export const MAG_PRESSURE_TAP: Vec3 = magPressureAt(MAG_PRESSURE_FITTING_LEN - 0.002);
/** Desiccant filter in the gap between the magnetos, on the engine centreline, axis fore-aft, arrow aft, drain down
 * (AMM 74-10 PDF p. 2616; Fig 74-10-2 items 11, 13 PDF p. 2618; Fig 71-00-2 sheets 1–2 PDF pp. 2487–2488). Position
 * approximate; the Ø26 × 50 mm body is drawn under the real Ø1.5 in. (scaled) to fit the coded magneto gap. The filter's installed orientation is drawn: a flow
 * arrow on its top pointing aft and a drain boss on its underside pointing down (AMM 74-10 Installation – Magneto Filter
 * PDF p. 2616: "arrow pointing aft and the drain pointed down"). */
export const MAG_FILTER: Vec3 = [2.795, 0.028, 0];
const FILTER_LEN = 0.05,
  FILTER_R = 0.013,
  NIPPLE_LEN = 0.008, // approximate
  // the hose's drawn outside radius, so the hose end ring sits on the nipple's rim (Fig 74-10-2 hose 9 on the filter)
  NIPPLE_R = MAG_HOSE_R;
/** Hose nipple ends of the filter: the forward one from the throttle body, the aft one to the tee (Fig 74-10-2). */
export const MAG_FILTER_NIPPLE = (end: 1 | -1): Vec3 => add(MAG_FILTER, [end * (FILTER_LEN / 2 + NIPPLE_LEN), 0, 0]);
/** Tee above the gap between the magnetos (Fig 74-10-2 item 10; Fig 71-00-2 sheets 1–2). Position approximate. */
export const MAG_TEE: Vec3 = [MAGNETO_DRIVE_END("R")[0] + 0.02, 0.088, 0];
const TEE_R = 0.012; // approximate
/** Elbow fitting on top of each magneto (Fig 74-10-2 item 14), on the aft half of the body so its hose clears the spider
 * drain crossing above the right magneto; Ø10 × 15 mm, seated 3 mm into the body, approximate. */
const ELBOW_R = MAG_HOSE_R, // the hose's drawn outside radius, so the hose end ring sits on the elbow's rim; approximate
  ELBOW_LEN = 0.015;
const magFitting = (mag: "R" | "L"): Vec3 => add(MAGNETO_DRIVE_END(mag), [0.02, MAGNETO_R, 0]);
export const MAG_ELBOW_TOP = (mag: "R" | "L"): Vec3 => add(magFitting(mag), [0, ELBOW_LEN - 0.003, 0]);
/** Bracket (13) and P-clamp (8) from the RH magneto's inboard top edge over the filter (Fig 74-10-2 items 8, 12, 13);
 * a 20 × 4 × 28 mm plate on the filter's top, its outboard end seated into the magneto, approximate. */
const BRACKET: Vec3 = [MAG_FILTER[0], MAG_FILTER[1] + FILTER_R + 0.002, 0.014];
export const PRESSURIZATION_LINES: { key: string; pts: Vec3[] }[] = [
  {
    key: "throttle",
    // off the fitting aft along the throttle body's top, up over the fuel manifold valve on the centreline, down ahead
    // of the crossing upper leads and aft under them on the RH side of the manifold's aft end, then down past the caps
    // between the magnetos into the filter's forward nipple (Fig 71-00-2 sheet 1: the hose drops forward past the caps).
    // Corners approximate: placed clear of the drawn throttle body, MAT sensor, spider and injector lines, the spider
    // drain, the manifold pressure line and the cowl.
    pts: [
      MAG_PRESSURE_TAP,
      magPressureAt(MAG_PRESSURE_FITTING_LEN + 0.002), // 4 mm straight off the boss, approximate
      [3.385, 0.119, -0.02],
      [3.18, 0.12, -0.02],
      [3.15, 0.15, 0],
      [3.005, 0.15, 0],
      [2.935, 0.08, 0.02],
      [2.85, 0.08, 0.02],
      [2.838, 0.06, 0.02],
      [2.838, 0.036, 0.006],
      [2.838, MAG_FILTER[1], 0],
      MAG_FILTER_NIPPLE(1),
    ],
  },
  {
    key: "filter",
    // aft off the filter's aft nipple, up beside the manifold pressure line and into the tee (Fig 74-10-2 hose 9 between
    // items 11 and 10); routing approximate
    pts: [
      MAG_FILTER_NIPPLE(-1),
      [2.752, MAG_FILTER[1], 0], // straight off the nipple, approximate
      [2.752, 0.036, 0.005],
      [2.752, 0.078, 0.005],
      add(MAG_TEE, [-0.02, 0, 0]), // straight into the tee, approximate
      add(MAG_TEE, [-TEE_R + 0.002, 0, 0]),
    ],
  },
  ...(["R", "L"] as const).map((mag): { key: string; pts: Vec3[] } => ({
    key: mag,
    pts: [MAG_TEE, [MAG_TEE[0], MAG_TEE[1], MAGNETO(mag)[2]], MAG_ELBOW_TOP(mag)],
  })),
];
part(() => cyl(MAG_HOSE_R, MAG_PRESSURE_FITTING_LEN, "y").applyQuaternion(fromUp(MAG_PRESSURE_DIR)), ["engine"], {
  pos: magPressureAt(MAG_PRESSURE_FITTING_LEN / 2 - 0.002),
  color: "#B4B8BC",
  name: "Magneto pressure fitting",
  note: "The magnetos' pressurizing air: a dedicated \"MAGNETO PRESSURE\" fitting (0.25 in. I.D. hose) on the throttle body's upstream (upper-deck) half, separate from the wastegate controller's fitting beside it (Continental M-18 Fig 5-35 View F-F PDF p. 150; AMM 74-00 PDF p. 2604). Station, clock position and size approximate.",
  groups: ["ignition"],
});
part(() => cyl(FILTER_R, FILTER_LEN, "x"), ["engine"], {
  pos: MAG_FILTER,
  color: "#E8E4D6",
  name: "Magneto desiccant filter",
  pin: true,
  note: "SR22T pressurized magnetos: one filter in the gap between the magnetos, on a bracket on the RH magneto's inboard edge, arrow aft, drain down; it traps moisture that could cause arcing at altitude. Serviceable desiccant is white; replace the filter when it turns dark (AMM 74-00 PDF p. 2604; 74-10 PDF p. 2616, Fig 74-10-2 items 11, 13 PDF p. 2618; Fig 71-00-2 sheets 1–2 PDF pp. 2487–2488). Size and position approximate.",
  groups: ["ignition"],
});
([1, -1] as const).forEach((end) =>
  part(() => cyl(NIPPLE_R, NIPPLE_LEN, "x"), ["engine"], {
    pos: add(MAG_FILTER, [(end * (FILTER_LEN + NIPPLE_LEN)) / 2, 0, 0]),
    color: "#9AA3AA",
    name: "Magneto desiccant filter",
    groups: ["ignition"],
  }),
);
/** Flow arrow on the filter's top, forward of the bracket, apex aft: a Ø7 × 12 mm cone seated 1 mm into the body, approximate
 * (AMM 74-10 PDF p. 2616: "arrow pointing aft"). */
const ARROW_R = 0.0035,
  ARROW_LEN = 0.012;
part(
  () => new ConeGeometry(ARROW_R, ARROW_LEN, 12).applyQuaternion(fromUp([-1, 0, 0])), // the cone's apex is +y: turn it aft
  ["engine"],
  {
    pos: [MAG_FILTER[0] + 0.018, MAG_FILTER[1] + FILTER_R + ARROW_R - 0.001, 0], // forward of the bracket; approximate
    color: "#C2412D",
    name: "Magneto filter flow arrow",
    note: "Flow-direction arrow on the desiccant filter: installed pointing aft, toward the tee and the magnetos (AMM 74-10 Installation – Magneto Filter PDF p. 2616; Fig 74-10-2 item 11 PDF p. 2618). Size approximate.",
    groups: ["ignition"],
  },
);
/** Drain boss on the filter's underside, pointing down: Ø6 × 8 mm, seated 2 mm into the body, approximate (AMM 74-10 PDF
 * p. 2616: "the drain pointed down"). */
const DRAIN_R = 0.003,
  DRAIN_LEN = 0.008;
part(() => cyl(DRAIN_R, DRAIN_LEN, "y"), ["engine"], {
  pos: [MAG_FILTER[0], MAG_FILTER[1] - FILTER_R - DRAIN_LEN / 2 + 0.002, 0],
  color: "#9AA3AA",
  name: "Magneto filter drain",
  note: "Drain on the desiccant filter, installed pointing down (AMM 74-10 Installation – Magneto Filter PDF p. 2616; Fig 74-10-2 item 11 PDF p. 2618). Size approximate.",
  groups: ["ignition"],
});
part(() => box(0.02, 0.004, 0.028), ["engine"], {
  pos: BRACKET,
  color: "#5E6B73",
  name: "Magneto filter bracket",
  note: "Bracket and P-clamp holding the desiccant filter, bolted to the RH magneto (AMM Fig 74-10-2 items 8, 12, 13 PDF p. 2618; 74-10 PDF p. 2616). Shape and size approximate.",
  groups: ["ignition"],
});
part(() => sph(TEE_R), ["engine"], {
  pos: MAG_TEE,
  color: "#9AA3AA",
  name: "Magneto pressurization tee",
  note: "Splits the filtered reference air to both magnetos (AMM Fig 74-10-2 item 10 PDF p. 2618). Position approximate.",
  groups: ["ignition"],
});
(["R", "L"] as const).forEach((mag) =>
  part(() => cyl(ELBOW_R, ELBOW_LEN, "y"), ["engine"], {
    pos: add(magFitting(mag), [0, ELBOW_LEN / 2 - 0.003, 0]),
    color: "#9AA3AA",
    name: "Magneto pressurization elbow",
    note: "Elbow fitting on top of the magneto for the pressurization hose (AMM Fig 74-10-2 item 14 PDF p. 2618). Size approximate.",
    groups: ["ignition"],
  }),
);
PRESSURIZATION_LINES.forEach((l, i) =>
  part(ignitionTube(l.pts, MAG_HOSE_R, l.pts[1]), ["engine"], {
    pos: l.pts[1],
    color: "#2E3A42",
    name: "Magneto pressurization line",
    pin: i === 0,
    note: 'Hose from the "MAGNETO PRESSURE" fitting on the throttle body, through the desiccant filter between the magnetos and a tee, to an elbow on top of each magneto (Continental M-18 Fig 5-35 View F-F PDF p. 150: 0.25 in. I.D.; AMM 74-00 PDF p. 2604; Fig 74-10-2 items 9, 10, 14 PDF p. 2618; Fig 71-00-2 sheets 1–2 PDF pp. 2487–2488). Routing approximate.',
    groups: ["ignition"],
  }),
);

/* ---------- starting (AMM 80-00 PDF p. 2794, 80-10 PDF p. 2798) ---------- */
/** Right-angle starter drive adapter on the rear of the accessory case, the starter across its aft end; the turbo oil scavenge pump sits outboard of it (AMM 79-00 PDF p. 2764). */
export const STARTER_ADAPTER: Vec3 = [2.725, -0.25, 0.03];
part(() => box(0.05, 0.1, 0.1), ["engine"], {
  pos: STARTER_ADAPTER,
  color: "#5E6B73",
  name: "Starter drive adapter",
  pin: true,
  note: "Right-angle drive between the starter motor and the accessory case: the adapter worm shaft and gear turn the starter shaft gear through a spring and clutch, which turns the crankshaft gear, and release it when the engine starts (AMM 80-00 PDF p. 2794; 80-10 PDF p. 2798, Fig 80-10-1 PDF p. 2800). Shape and position approximate.",
  groups: ["ignition"],
});
