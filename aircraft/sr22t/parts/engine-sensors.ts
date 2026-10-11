/**
 * Engine sensors, mount and baffles.
 * May import anchors only from earlier sections:
 * catalogue.ts, airframe.ts, surfaces.ts, cowl.ts, gear.ts, engine.ts, engine-ignition.ts, engine-oil.ts, engine-air.ts.
 * Side-effect-free helpers may come from ../geometry, ../model and ../rig.
 * Shared constants belong in catalogue.ts; later sections must never be imported here.
 */
import { Matrix4, Vector3 } from "three";
import { curveOf, mergeGeos } from "@/lib/geometry";
import { toVec3 } from "@/lib/math";
import type { Vec3 } from "@/lib/math";
import { box, cyl, FW, tubeGeo } from "../geometry";
import { CRANK_Y, IN } from "../engine-datum";
import { part } from "./catalogue";
import { CYLS, THROTTLE, CYL_BARREL_END, CYL_HEAD_BOTTOM } from "./engine";
import { HEADER, INTAKE_MANIFOLD, MIXTURE_ARM } from "./engine-air";
import { EXHAUST_RADIUS } from "../exhaust-layout";
import { NOSE_GEAR } from "./gear";

// All dimensions, offsets and colors below are illustrative, not measured stations.
// Sensor shapes: AMM 13773-002 Rev 7 Figs 77-20-2 (PDF p. 2713),
// 77-10-4 (2702), 77-20-5 (2721), 71-00-2 sheets 2–3 (2488–2489).
// Unpinned sensors remain hoverable without obscuring cylinder labels.
const sensorRef =
  "POH 13772-007 7-35; AMM 13773-002 Rev 7 77-20 (PDF p. 2706), Fig 77-20-2 (PDF p. 2713). Geometry approximate.";
// CHT port under each head, 5.25 in. below the crankshaft CL (Continental M-18 Fig 5-34 View D-D "0.375-24UNF-3B 6X CHT",
// p. 5-54, dimensioned). The port's lateral station is scaled at ≈10.7 in., inside the model's illustrative
// barrel, so the probe stays under the model head at its inboard face. View D-D is a front view and gives no fore-aft
// station: the probe sits 0.03 m forward of the cylinder CL, clear of the exhaust port and of the cylinder fuel drain
// fitting (AMM 77-20 caution, ≥ 0.2 in.). Lateral and fore-aft stations approximate.
export const CHT_PORT_Y = CRANK_Y - 5.25 * IN;
export const CHT_PORT_Z = CYL_BARREL_END + 0.009;
const CHT_PORT_FWD = 0.03;
// Housing 0.016 m long at the port; bayonet 0.004 m radius up to the head underside (approximate).
const CHT_HOUSING_LEN = 0.016;
const CHT_STEM = CYL_HEAD_BOTTOM - (CHT_PORT_Y + CHT_HOUSING_LEN / 2);
for (const c of CYLS) {
  part(
    () =>
      mergeGeos([
        cyl(0.009, CHT_HOUSING_LEN, "y", 10),
        cyl(0.004, CHT_STEM, "y", 8).translate(0, (CHT_HOUSING_LEN + CHT_STEM) / 2, 0),
      ]),
    ["engine", "avionics"],
    {
      name: `CHT sensor — cyl ${c.n}`,
      pos: [c.x + CHT_PORT_FWD, CHT_PORT_Y, c.s * CHT_PORT_Z],
      color: "#D4B776",
      note:
        "Bayonet probe inserted upward into the port on the underside of the head, beside the cylinder drain fitting; " +
        "the housing hangs below the head and feeds the GEA 71 (Continental M-18 p. 2-1 'bottom side of the cylinder head', " +
        "Fig 5-34 View D-D p. 5-54: 5.25 in. below the crankshaft CL, dimensioned; AMM 13773-002 Rev 7 77-20 PDF p. 2706 " +
        "caution: at least 0.2 in. clear of the cylinder fuel drain line; Fig 77-20-2 item 3 PDF p. 2713). Lateral station " +
        "and housing size approximate.",
    },
  );
  const bankIndex = CYLS.filter((b) => b.s === c.s).findIndex((b) => b.n === c.n);
  const h = HEADER(c.s);
  const header = [h.elbow, h.riser, h.aftRiser][bankIndex];
  const curve = curveOf(header, 0);
  // Fig 77-20-2: near the port, before the header collector. The 30 mm
  // arc-length station is illustrative and follows the actual port/neck curve
  // regardless of how many collector anchors the exhaust owner adds.
  const fraction = 0.03 / curve.getLength();
  const tip = curve.getPointAt(fraction);
  const tangent = curve.getTangentAt(fraction);
  const outward = new Vector3(0, 0, c.s);
  const normal = outward.addScaledVector(tangent, -outward.dot(tangent)).normalize();
  // Fig 77-20-2 (PDF 2713): sensing end enters its header, housing outside.
  // Existing pipe radius follows EXHAUST_RADIUS; 0.024 probe length, with 2 mm illustrative seating.
  const probe = tip.clone().addScaledVector(normal, EXHAUST_RADIUS + 0.012 - 0.002);
  const frame = new Matrix4().makeBasis(new Vector3().crossVectors(tangent, normal), tangent, normal);
  part(() => cyl(0.007, 0.024, "z", 10).applyMatrix4(frame), ["engine", "avionics"], {
    name: `EGT probe — cyl ${c.n}`,
    pos: toVec3(probe),
    color: "#D4B776",
    note:
      "Probe sensing end seated in this cylinder's exposed header below the port; exterior housing feeds the GEA 71. " +
      sensorRef,
  });
}
// MAP sender threads straight into a boss on the throttle body, no line (AMM 13773-002 Rev 7 Fig 77-10-4 PDF p. 2702),
// on the RIGHT side (Continental M-18 Fig 5-34 plan "MANIFOLD PRESS. 0.125-27 NPTF", p. 5-54). The AMM
// relation outranks the scaled Continental station (≈2.0 in. aft of #5), which falls on the model's intake manifold.
// The sender's axis is lateral, as drawn. Fore-aft station on the throttle body: forward half, clear of the
// fuel-metering outlet on its right side (approximate). 0.05 is the drawn throttle-body radius (engine.ts).
const THROTTLE_BODY_R = 0.05;
// Threaded stub 0.008 m long, seated 0.004 m into the boss; body Ø0.022 × 0.03 m (approximate).
const MAP_STUB = 0.008,
  MAP_BODY = 0.03;
export const MAP_BOSS: Vec3 = [THROTTLE[0] + 0.03, THROTTLE[1], THROTTLE[2] + THROTTLE_BODY_R];
part(
  () =>
    mergeGeos([
      cyl(0.011, MAP_BODY, "z", 12),
      cyl(0.005, MAP_STUB, "z", 8).translate(0, 0, -(MAP_BODY + MAP_STUB) / 2),
    ]),
  ["engine", "avionics"],
  {
    name: "MAP sensor",
    pos: [MAP_BOSS[0], MAP_BOSS[1], MAP_BOSS[2] + MAP_STUB / 2 + MAP_BODY / 2],
    color: "#D4B776",
    note: "Sender threaded straight into the boss on the RIGHT side of the throttle body, no line, its connector outboard (AMM 13773-002 Rev 7 Fig 77-10-4 PDF p. 2702; right side per Continental M-18 Fig 5-34 p. 5-54 'MANIFOLD PRESS.' port). Manifold pressure feeds the GEA and gates HIGH BOOST/PRIME; existing fuel-pump logic is unchanged (POH 13772-007 7-36; AMM 28-20 PDF p. 1113, 77-10 PDF p. 2694). Fore-aft station on the throttle body and sensor size approximate.",
  },
);
part(() => cyl(0.008, 0.04, "y", 10), ["engine", "avionics"], {
  name: "MAT sensor",
  pos: [INTAKE_MANIFOLD[0], INTAKE_MANIFOLD[1] + 0.051, 0],
  color: "#D4B776",
  note: "Sensor seated into the induction manifold, with housing above it and sensing tip in the airflow. AMM 77-40 identifies MAT among the percent-power inputs; POH 7-36 attributes calculation to the display units; on the SR22T MAT is not depicted on either display (AMM 13773-002 Rev 7 77-20 PDF p. 2706, Fig 77-20-5 PDF p. 2721; 77-40 PDF p. 2722; POH 13772-007 7-36). Geometry approximate.",
});
for (const [name, pos, ref] of [
  ["Throttle position sensor", [THROTTLE[0], THROTTLE[1], -0.0615], "sheet 2, item 14 (PDF p. 2488)"],
  [
    "Mixture position sensor",
    [MIXTURE_ARM[0] + 0.0315, MIXTURE_ARM[1] + 0.026, MIXTURE_ARM[2] - 0.05],
    "sheet 3, item 26 (PDF p. 2489)",
  ],
] as const) {
  part(() => box(0.025, 0.025, 0.025), ["engine"], {
    name,
    pos: [...pos],
    color: "#D4B776",
    note:
      "Housing seated on its control assembly. Function not described in POH/AMM text; modelled as a part only, with no invented logic (AMM 13773-002 Rev 7 Fig 71-00-2 " +
      ref +
      "). Geometry approximate.",
    groups: ["sensors"],
  });
}

// Schematic tubular frame and feet: POH 13772-007 7-31; AMM 13773-002 Rev 7
// 71-20 (PDF p. 2522), Fig 71-20-1 (PDF p. 2527). Four firewall points,
// six semi-focal isolator fittings. NOSE_GEAR stays owned by the earlier gear section.
// Every node, member and fitting stays inside the POH Fig 1-1 cowl loft
// (inFus) with margin. The upper firewall points sit below the cowl tumblehome,
// outboard of BAT 1 and the MCU; the lower points sit outboard of the A/C
// discharge line and the oil separator breather hose that run down the firewall.
export const MOUNT_ATTACH: Vec3[] = [-1, 1].flatMap(
  (s) =>
    [
      [FW + 0.015, -0.07, s * 0.48],
      [FW + 0.015, -0.45, s * 0.52],
    ] as Vec3[],
);
export const MOUNT_FEET: Vec3[] = [-1, 1].flatMap(
  (s) =>
    [
      [2.79, -0.34, s * 0.22],
      [3.04, -0.36, s * 0.2],
      [3.4, -0.34, s * 0.2],
    ] as Vec3[],
);
/** Node on the aft lower cross member where the nose-gear support leaves it. */
const NOSE_ROOT: Vec3 = [2.77, -0.6, -0.04];
export const MOUNT_RUNS: Vec3[][] = [];
for (let side = 0; side < 2; side++) {
  const [upper, lower] = MOUNT_ATTACH.slice(side * 2, side * 2 + 2);
  const [aft, mid, fwd] = MOUNT_FEET.slice(side * 3, side * 3 + 3);
  const s = side === 0 ? -1 : 1;
  const support: Vec3 = [3.02, -0.29, aft[2]];
  const outerAft: Vec3 = [2.82, -0.4, s * 0.5];
  const innerAft: Vec3 = [2.82, -0.4, aft[2]];
  const lowerForward: Vec3 = [2.86, -0.48, s * 0.5];
  // AMM Fig 71-20-1 (PDF 2527): four firewall attachments, six feet and
  // triangulated side frames. Undimensioned runs pass outboard of the cylinder
  // banks between the exhaust and the cowl side, and over the turbos
  // to the aft feet.
  MOUNT_RUNS.push(
    [upper, [2.64, -0.15, s * 0.54], outerAft, innerAft, aft],
    [aft, support],
    [lower, lowerForward, [2.86, -0.4, s * 0.5], outerAft],
    [aft, mid, fwd],
    [support, [3.4, -0.29, s * 0.2], fwd],
  );
}
MOUNT_RUNS.push(
  // Aft lower transverse frame, under the engine and above the lower cowl.
  [
    MOUNT_FEET[0],
    [2.76, -0.4, -0.22],
    [2.77, -0.6, -0.22],
    NOSE_ROOT,
    [2.77, -0.6, 0.22],
    [2.76, -0.4, 0.22],
    MOUNT_FEET[3],
  ],
  // Nose-gear support (AMM 32-00 PDF p. 1390): rises off the cross member
  // between the fuel drain lines, passes under the oil sump and above the
  // exhaust crossover and the hot-air line, then drops onto the strut top.
  [NOSE_ROOT, [2.79, -0.47, -0.04], [3.03, -0.47, -0.04], NOSE_GEAR],
);
const mountRef =
  "POH 13772-007 7-31; AMM 13773-002 Rev 7 71-20 (PDF p. 2522), Fig 71-20-1 (PDF p. 2527). Shape and dimensions approximate.";
// Each straight member has its own geometry; bends never spline through a
// neighbouring solid or fill empty space with a whole-frame bounding box.
const members = new Map<string, Vec3[]>();
for (const path of MOUNT_RUNS)
  for (let i = 1; i < path.length; i++) {
    const member = [path[i - 1], path[i]];
    const key = member
      .map((p) => p.join(","))
      .sort()
      .join(" / ");
    if (!members.has(key)) members.set(key, member);
  }
const mountSections = [...members.values()];
for (const path of mountSections) {
  const anchor = path[0];
  part(() => tubeGeo(path, 0.013, 0).translate(-anchor[0], -anchor[1], -anchor[2]), ["engine", "gear"], {
    name: "Engine mount weldment",
    pos: anchor,
    color: "#A0A9AD",
    note:
      "Tubular steel weldment with six semi-focal fittings, bolted at four gusset-reinforced firewall locations. Nose gear strut attaches to the mount (AMM 13773-002 Rev 7 32-00 PDF p. 1390). " +
      mountRef,
    pin: true,
  });
}
for (const pos of MOUNT_FEET) {
  part(() => cyl(0.034, 0.04, "y", 16), ["engine", "gear"], {
    name: "Engine mount isolator",
    pos,
    color: "#3B4248",
    note:
      "Conventional elastomeric vibration isolator; upper and lower cushions shown as one fitting assembly. " +
      mountRef,
  });
}
for (const pos of MOUNT_ATTACH) {
  part(() => box(0.035, 0.075, 0.06), ["engine", "gear"], {
    name: "Firewall attach fitting",
    pos,
    color: "#A0A9AD",
    note: "One of four gusset-reinforced firewall attachment locations. " + mountRef,
  });
}
// AMM 13773-002 Rev 7 Fig 71-20-1, note 1 and items 1/7/8/10 (PDF p. 2527):
// the strap spans the isolator from the engine-foot bracket to the tab washer's screw.
// All sizes/offsets below are approximate: the figure is exploded and does not dimension these shapes.
// Keep the complete local assembly within 50 mm of the existing foot.
for (const i of [2, 3]) {
  const foot = MOUNT_FEET[i]; // forward LH, aft RH (negative z = LH)
  const side = Math.sign(foot[2]);
  const engineEnd: Vec3 = [foot[0] + 0.014, foot[1] + 0.024, foot[2] + side * 0.038];
  const mountEnd: Vec3 = [engineEnd[0], foot[1] - 0.023, engineEnd[2]];
  const location = i === 2 ? "Forward LH" : "Aft RH";
  part(
    () =>
      mergeGeos([
        box(0.05, 0.008, 0.08),
        box(0.008, 0.024, 0.05).translate(0.021, 0.008, 0),
        cyl(0.004, 0.01, "y", 6).translate(0.014, 0.004, side * 0.038),
      ]),
    ["engine", "gear"],
    {
      name: "Engine foot bracket",
      pos: [foot[0], foot[1] + 0.024, foot[2]],
      color: "#A0A9AD",
      note:
        location + " engine-foot-side bracket supporting the upper isolator cushion and strap attachment. " + mountRef,
    },
  );
  part(
    () =>
      mergeGeos([
        cyl(0.034, 0.006, "y", 16),
        box(0.018, 0.006, 0.02).translate(0.014, 0, side * 0.034),
        cyl(0.004, 0.01, "y", 6).translate(0.014, -0.004, side * 0.038),
      ]),
    ["engine", "gear"],
    {
      name: "Engine mount tab washer",
      pos: [foot[0], foot[1] - 0.023, foot[2]],
      color: "#A0A9AD",
      note: location + " mount-side tab washer (item 10); the strap attaches to its tab with screw 7. " + mountRef,
    },
  );
  part(
    () => mergeGeos([cyl(0.006, 0.06, "y", 12), cyl(0.01, 0.008, "y", 6).translate(0, -0.032, 0)]),
    ["engine", "gear"],
    {
      name: "Engine mount bolt",
      pos: foot,
      color: "#B7A480",
      note: location + " bolt through the bracket, isolator and tab washer (item 1). " + mountRef,
    },
  );
  // Strap bows outboard around the isolator instead of passing through its rubber; approximate (Fig 71-20-1).
  const path: Vec3[] = [engineEnd, [engineEnd[0], foot[1], foot[2] + side * 0.044], mountEnd];
  part(() => tubeGeo(path, 0.003, 0).translate(-foot[0], -foot[1], -foot[2]), ["engine", "electrical"], {
    name: "Engine grounding strap",
    pos: foot,
    color: "#C1A875",
    note:
      location +
      " grounding strap bridging the isolator from the engine-foot bracket to the mount-side tab washer (AMM 13773-002 Rev 7 Fig 71-20-1 note 1, PDF p. 2527). Routing and dimensions approximate; the figure is undimensioned.",
    groups: [],
  });
}
