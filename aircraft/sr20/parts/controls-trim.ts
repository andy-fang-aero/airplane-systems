/**
 * SR20 G6 spring trim, GFC 700 capstan/bridle drives and coupled electric flaps.
 * POH 11934-005 7-6–11, 7-22–24; AMM 12137-002 Reissue A/A1 ATA 22-10 and 27.
 * No dimensions are implied by the drawing: positions, diameters and motion rates are illustrative.
 */
import * as THREE from "three";
import type { PartAnim } from "@/lib/catalogue";
import { D2R, type Vec3 } from "@/lib/math";
import { box, cyl, tubeGeo, wingP } from "../geometry";
import { live, type Sim } from "../model";
import { AIL_SECTOR, ELEV_HORN, ETT, PEDAL_TT, PULLEYS, alongCable, rigPose, type RigPose } from "../rig";
import { useSR20 } from "../store";
import { FT, YOKES } from "./cabin";
import { CAT, part, surfacePivot } from "./catalogue";

const STEEL = "#8C959C",
  CART = "#9F85E6",
  MOTOR = "#5E6B75";
const neutral = () => rigPose({ ctrl: { pitch: 0, roll: 0, yaw: 0 } } as Sim);
let previousControls: [number, number, number] | undefined;
let previousPose: RigPose | undefined;
const current = () => {
  const s = useSR20.getState().s;
  const c = s.ctrl;
  if (
    !previousControls ||
    previousControls[0] !== c.pitch ||
    previousControls[1] !== c.roll ||
    previousControls[2] !== c.yaw
  ) {
    previousControls = [c.pitch, c.roll, c.yaw];
    previousPose = rigPose(s);
  }
  return previousPose!;
};
const owns = new WeakMap<THREE.Mesh, { g: THREE.BufferGeometry; key: number }>();
/** Replace only when the control changes; only dispose geometry owned by this animation. */
const movingTube =
  (key: () => number, pts: () => Vec3[], r: number): PartAnim =>
  (m) => {
    const value = key(),
      last = owns.get(m);
    if (last?.key === value && last.g === m.geometry) return;
    const g = tubeGeo(pts(), r, 0);
    if (last?.g === m.geometry) last.g.dispose();
    m.geometry = g;
    owns.set(m, { g, key: value });
  };

export const PITCH_TRIM_MOTOR: Vec3 = [PULLEYS.ea.c[0] + 0.045, -0.025, 0.025];
export const PITCH_TRIM_ARM: Vec3 = [PITCH_TRIM_MOTOR[0], -0.075, -0.05];
/** Direct aft-elevator bellcrank attachment: motion follows the same hinge as the rendered elevator. */
export function pitchTrimEnd(p: RigPose): Vec3 {
  return [ELEV_HORN.c[0] - Math.sin(p.elevAng) * 0.075, ELEV_HORN.c[1] - Math.cos(p.elevAng) * 0.075, -0.05];
}
part(() => cyl(0.02, 0.07, "z"), ["controls"], {
  chan: ["elevator"],
  pos: PITCH_TRIM_MOTOR,
  color: MOTOR,
  name: "Pitch trim motor",
  pin: true,
  note: "Electric motor bolted to FS 306 bulkhead, behind RE1 access panel (AMM 27-30 pp. 18–20, Fig 27-30-6; 6-00 access panel figure). Moves the spring cartridge’s neutral position; 2 A PITCH TRIM on ESS BUS 2 (POH 7-6–7). Position approximate.",
});
part(() => box(0.006, 0.095, 0.08), ["controls"], {
  chan: ["elevator"],
  pos: [PITCH_TRIM_MOTOR[0] + 0.025, PITCH_TRIM_MOTOR[1], PITCH_TRIM_MOTOR[2]],
  color: STEEL,
  name: "Pitch trim motor bracket",
  note: "Motor and two limit switches mount to the bulkhead bracket (AMM Fig 27-30-6).",
});
part(
  () => tubeGeo([PITCH_TRIM_MOTOR, [PITCH_TRIM_MOTOR[0], PITCH_TRIM_MOTOR[1], -0.05], PITCH_TRIM_ARM], 0.005, 0),
  ["controls"],
  {
    chan: ["elevator"],
    color: STEEL,
    name: "Pitch trim actuation arm",
    note: "Set-screwed to the motor shaft; rod end attaches to the spring cartridge (AMM 27-30 pp. 18–21).",
  },
);
part(() => tubeGeo([PITCH_TRIM_ARM, pitchTrimEnd(neutral())], 0.012, 0), ["controls"], {
  chan: ["elevator"],
  color: CART,
  name: "Pitch trim cartridge",
  pin: true,
  dynamicGeo: true,
  anim: movingTube(
    () => useSR20.getState().s.ctrl.pitch,
    () => [PITCH_TRIM_ARM, pitchTrimEnd(current())],
    0.012,
  ),
  note: "Captured compression spring between trim-motor actuation arm and aft elevator bellcrank (AMM 27-30 pp. 1, 15–20). Centres either elevator deflection and damps gusts; normal control force overrides its bias (POH 7-6, 7-11). Direct surface connection provides secondary pitch control after a primary-system failure that does not jam the elevator (POH 7-7).",
});
for (const [label, y] of [
  ["Upper", 0.015],
  ["Lower", -0.06],
] as const)
  part(() => box(0.017, 0.014, 0.015), ["controls"], {
    chan: ["elevator"],
    pos: [PITCH_TRIM_MOTOR[0] - 0.008, y, -0.046],
    color: "#D6A04A",
    name: "Pitch trim limit switch",
    note: `${label} limit switch stops trim motor travel (AMM 27-30 pp. 16–19; Fig 27-30-7).`,
  });
const leftWing = PULLEYS.awL.c;
export const ROLL_TRIM_MOTOR: Vec3 = [leftWing[0] + 0.015, leftWing[1] - 0.015, leftWing[2] + 0.3];
export const ROLL_TRIM_ARM: Vec3 = [leftWing[0] + 0.01, leftWing[1] - 0.035, leftWing[2] + 0.24];
/** Cartridge rod bolts directly to LH actuation pulley, not the aileron trailing edge. */
export function rollTrimEnd(p: RigPose): Vec3 {
  const a = p.pulley.awL;
  return [leftWing[0] + 0.025 * Math.sin(a), leftWing[1] - 0.035, leftWing[2] + 0.025 * Math.cos(a)];
}
part(() => tubeGeo([ROLL_TRIM_ARM, rollTrimEnd(neutral())], 0.012, 0), ["controls"], {
  chan: ["aileron"],
  color: CART,
  name: "Roll trim cartridge",
  pin: true,
  dynamicGeo: true,
  anim: movingTube(
    () => useSR20.getState().s.ctrl.roll,
    () => [ROLL_TRIM_ARM, rollTrimEnd(current())],
    0.012,
  ),
  note: "Captured compression spring bolts to LH aileron actuation pulley and motor offset arm (POH 7-9; AMM 27-10 pp. 31–36, Fig 27-10-7). Electric motor shifts its centring bias; right aileron tab is a separate ground adjustment. Illustrated length and endpoints approximate.",
});
part(() => cyl(0.017, 0.09, "z"), ["controls"], {
  chan: ["aileron"],
  pos: ROLL_TRIM_MOTOR,
  color: MOTOR,
  name: "Roll trim motor",
  pin: true,
  note: "Motor bolted to wing spar beside LH actuation pulley, accessed through LW11 (AMM 27-10 pp. 34–36). 2 A ROLL TRIM on ESS BUS 2 (POH 7-9).",
});
part(() => tubeGeo([ROLL_TRIM_MOTOR, ROLL_TRIM_ARM], 0.005, 0), ["controls"], {
  chan: ["aileron"],
  color: STEEL,
  name: "Roll trim motor offset arm",
  note: "Offset arm links motor shaft and compression cartridge (AMM Fig 27-10-7).",
});
for (const z of [ROLL_TRIM_MOTOR[2] - 0.03, ROLL_TRIM_MOTOR[2] + 0.03])
  part(() => box(0.013, 0.013, 0.015), ["controls"], {
    chan: ["aileron"],
    pos: [ROLL_TRIM_MOTOR[0] + 0.025, ROLL_TRIM_MOTOR[1], z],
    color: "#D6A04A",
    name: "Roll trim limit switch",
    note: "Adjustable stops and limit switches bound motor travel (AMM 27-10 pp. 33–36).",
  });
part(
  () =>
    tubeGeo(
      [
        [PEDAL_TT.x - 0.06, PEDAL_TT.y, -0.27],
        [PEDAL_TT.x - 0.22, PEDAL_TT.y, -0.09],
      ],
      0.012,
      0,
    ),
  ["controls"],
  {
    chan: ["rudder"],
    color: CART,
    name: "Yaw trim spring cartridge",
    pin: true,
    note: "Ground-adjustable spring cartridge connects left rudder pedal torque tube to console structure. Provides centring force in both directions (POH 7-11; AMM 27-20 pp. 1,22). No cockpit yaw-trim motor.",
  },
);
for (const [side, z] of [
  [-1, -0.36],
  [1, 0.36],
] as const)
  part(
    () =>
      tubeGeo(
        [
          [PEDAL_TT.x - 0.12, PEDAL_TT.y, z],
          [PEDAL_TT.x - 0.28, PEDAL_TT.y, z],
        ],
        0.006,
        0,
      ),
    ["controls"],
    {
      chan: ["rudder"],
      color: STEEL,
      name: "Rudder centering spring",
      note: "Pedal springs and yaw cartridge tension the primary rudder cable loop (POH 7-11; AMM 27-20 p. 1).",
      anim: (m) => {
        m.position.x = side * current().pedal;
      },
    },
  );
for (const z of [-0.05, 0.05])
  part(() => box(0.03, 0.025, 0.03), ["controls"], {
    chan: ["aileron"],
    pos: [0.52, -0.63, z],
    color: "#3C4A57",
    name: "Roll trim relay",
    note: "Paired roll relays in sockets on RH longeron (AMM 27-10 pp. 37–38, Fig 27-10-8). Relay dimensions/location approximate.",
  });
for (const y of YOKES) {
  part(() => box(0.003, 0.006, 0.018), ["controls"], {
    parent: "yoke:" + y.side,
    chan: ["elevator"],
    pos: [0.045, 0.025, 0],
    color: "#F2F4F5",
    name: "Pitch neutral-trim reference mark",
    note: "Takeoff trim: yoke-tube reference mark aligns with fixed instrument-panel bolster tab (POH 7-7). Mark placement schematic.",
  });
  part(() => box(0.025, 0.006, 0.012), ["controls"], {
    chan: ["elevator"],
    pos: [2.24, -0.035, y.z],
    color: "#F2F4F5",
    name: "Pitch neutral-trim bolster tab",
    note: "Fixed bolster reference for the moving yoke-tube mark (POH 7-7).",
  });
}

/* ---------- GFC 700 mechanical drives (AMM 22-10 pp. 3–4, 17–28) ---------- */
export type ServoAxis = "pitch" | "roll";
export const SERVO = {
  pitch: {
    c: [0.25, -0.57, -0.11] as Vec3,
    keys: ["elA", "elB"],
    segments: [4, 4],
    fraction: [0.075, 0.11],
    turns: 2.5,
    exit: -1,
  },
  roll: {
    c: [0.54, -0.56, 0.23] as Vec3,
    keys: ["ailR", "ailL"],
    segments: [3, 3],
    fraction: [0.4, 0.7],
    turns: 3,
    exit: 1,
  },
};
export const CAPSTAN_RADIUS = 0.02;
export function servoTravel(axis: ServoAxis, p: RigPose, end = 0) {
  const t = axis === "pitch" ? p.ett * ETT.sectorR : p.ailSector * AIL_SECTOR.r;
  return end === 0 ? t : -t;
}
/** Clamps translate along the primary cable tangent, preserving channel independence. */
export function bridleClamp(axis: ServoAxis, end: number, p = neutral()): Vec3 {
  const s = SERVO[axis],
    a = alongCable(s.keys[end], s.segments[end], s.fraction[end]),
    b = alongCable(s.keys[end], s.segments[end], s.fraction[end] + 0.01);
  const v = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize();
  return new THREE.Vector3(...a).addScaledVector(v, servoTravel(axis, p, end)).toArray() as Vec3;
}
export function bridleRun(axis: ServoAxis, end: number, p = neutral()): Vec3[] {
  const s = SERVO[axis],
    start: Vec3 = [
      s.c[0] + (end === 0 ? 0.018 : -0.018),
      s.c[1] + s.exit * CAPSTAN_RADIUS,
      s.c[2] + (end === 0 ? 0.008 : -0.008),
    ];
  return [start, [start[0] - 0.035, start[1] + s.exit * 0.014, start[2]], bridleClamp(axis, end, p)];
}
/** Helical groove and its fixed exits are undimensioned illustrations; ends remain connected in motion. */
export function servoWrap(axis: ServoAxis): Vec3[] {
  const s = SERVO[axis];
  return Array.from({ length: 181 }, (_, i) => {
    const u = i / 180 - 0.5,
      a = u * s.turns * 2 * Math.PI + (axis === "pitch" ? 0 : -Math.PI / 2);
    return [CAPSTAN_RADIUS * Math.cos(a), CAPSTAN_RADIUS * Math.sin(a), u * 0.024] as Vec3;
  });
}
export function grooveTransition(axis: ServoAxis, end: number, p = neutral()): Vec3[] {
  const s = SERVO[axis],
    a = servoTravel(axis, p) / CAPSTAN_RADIUS;
  const start = vector3(servoWrap(axis)[end === 0 ? 180 : 0])
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), a)
    .add(vector3(s.c));
  const target = bridleRun(axis, end, p)[0],
    from = Math.atan2(start.y - s.c[1], start.x - s.c[0]);
  const to = Math.atan2(target[1] - s.c[1], target[0] - s.c[0]),
    delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const radiusEnd = Math.hypot(target[0] - s.c[0], target[1] - s.c[1]);
  return Array.from({ length: 25 }, (_, i) => {
    const t = i / 24,
      theta = from + delta * t,
      r = CAPSTAN_RADIUS + (radiusEnd - CAPSTAN_RADIUS) * t;
    return [s.c[0] + r * Math.cos(theta), s.c[1] + r * Math.sin(theta), start.z + (target[2] - start.z) * t] as Vec3;
  });
}
const vector3 = (p: Vec3) => new THREE.Vector3(...p);
for (const axis of ["pitch", "roll"] as const) {
  const s = SERVO[axis],
    chan = axis === "pitch" ? "elevator" : "aileron",
    name = axis === "pitch" ? "Pitch" : "Roll";
  part(() => box(0.065, 0.07, 0.07), ["controls"], {
    chan: [chan],
    pos: [s.c[0], s.c[1], s.c[2] + 0.065],
    color: MOTOR,
    name: `${name} servo — GSA 81`,
    pin: true,
    note: `GSA 81 electromechanical ${axis} actuator with motor control/monitor boards and engagement solenoid. ${axis === "pitch" ? "Below baggage floor at CF5" : "Below passenger seat at CF4C"}; 5 A AP SERVOS, Main Bus 1 (AMM 22-10 pp. 3–4). No autopilot steering is simulated here; manual cable travel animates the mechanical drive. Location approximate.`,
  });
  part(() => box(0.007, 0.08, 0.08), ["controls"], {
    chan: [chan],
    pos: [s.c[0] + 0.04, s.c[1], s.c[2] + 0.05],
    color: STEEL,
    name: "Servo mounting bracket",
    note: `GSM 86 mount and bracket transmit servo torque to the ${axis} bridle (AMM Fig 22-10-${axis === "pitch" ? 4 : 5}). Position approximate.`,
  });
  part(() => cyl(CAPSTAN_RADIUS, 0.026, "z", 32), ["controls"], {
    chan: [chan],
    pos: s.c,
    color: CART,
    name: `${name} servo capstan`,
    anim: (m) => {
      m.rotation.z = servoTravel(axis, current()) / CAPSTAN_RADIUS;
    },
    note: "GSM 86 capstan and slip clutch transfer servo torque to the primary cable through a bridle; pilot force can override slip-clutch torque (AMM 22-10 pp. 3–4). Drum diameter and motion approximate.",
  });
  part(() => cyl(0.008, 0.015, "z"), ["controls"], {
    chan: [chan],
    pos: s.c,
    color: "#D6A04A",
    name: "Servo slip clutch",
    note: "Slip-clutch cartridge allows capstan rotation independently of servo actuator under sufficient pilot force (AMM 22-10 pp. 3–4, Figs 22-10-4/5).",
  });
  part(() => new THREE.TorusGeometry(0.028, 0.002, 8, 32), ["controls"], {
    chan: [chan],
    pos: [s.c[0], s.c[1], s.c[2] - 0.016],
    color: STEEL,
    name: "Capstan cable guard ring",
    note: "Cable guards and stiffener ring prevent bridle fouling at the GSM 86 capstan (AMM Figs 22-10-4/5).",
  });
  part(() => tubeGeo(servoWrap(axis), 0.0015, 0), ["controls"], {
    chan: [chan],
    pos: s.c,
    color: "#DDD3B6",
    name: "Servo capstan bridle wrap",
    anim: (m) => {
      m.rotation.z = servoTravel(axis, current()) / CAPSTAN_RADIUS;
    },
    note: `Approximately ${s.turns} bridle wraps at centre travel; stop-ball at ${axis === "pitch" ? 9 : 6} o’clock (AMM 22-10 p. ${axis === "pitch" ? 21 : 26}). Pitch reassembly separately describes approximately 480° per cable end; illustrated groove/exit geometry is approximate.`,
  });
  part(() => new THREE.SphereGeometry(0.003, 12, 8), ["controls"], {
    chan: [chan],
    pos: [s.c[0] + (axis === "pitch" ? CAPSTAN_RADIUS : 0), s.c[1] + (axis === "roll" ? -CAPSTAN_RADIUS : 0), s.c[2]],
    color: "#D6A04A",
    name: "Servo bridle stop-ball",
    anim: (m) => {
      const a = (axis === "pitch" ? 0 : -Math.PI / 2) + servoTravel(axis, current()) / CAPSTAN_RADIUS;
      m.position.set(s.c[0] + CAPSTAN_RADIUS * Math.cos(a), s.c[1] + CAPSTAN_RADIUS * Math.sin(a), s.c[2]);
    },
    note: "Stop-ball seats in capstan recess and remains at the centre of the cable wrap (AMM 22-10 pp. 21,26). Motion and diameter approximate.",
  });
  for (const end of [0, 1]) {
    part(() => tubeGeo(grooveTransition(axis, end), 0.0015, 0), ["controls"], {
      chan: [chan],
      color: "#DDD3B6",
      name: "Capstan groove exit transition",
      dynamicGeo: true,
      anim: movingTube(
        () => servoTravel(axis, current()),
        () => grooveTransition(axis, end, current()),
        0.0015,
      ),
      note: "Illustrative transition connects moving groove end to fixed tangential bridle exit; capstan groove pitch and exit position undimensioned (AMM Figs 22-10-4/5).",
    });
    part(() => tubeGeo(bridleRun(axis, end), 0.002, 0), ["controls"], {
      chan: [chan],
      color: "#D8DDE1",
      name: `${name} servo bridle cable`,
      pin: end === 0,
      dynamicGeo: true,
      anim: movingTube(
        () => servoTravel(axis, current()),
        () => bridleRun(axis, end, current()),
        0.002,
      ),
      note: `Bridle clamp connects to ${s.keys[end]} primary cable. ${axis === "pitch" ? "Long and short ends join the outboard/inboard elevator strands" : "Ends join the left and right aileron runs"} (AMM 22-10 pp. ${axis === "pitch" ? 21 : 26}). Routing, pulley transitions and cable travel illustrative.`,
    });
    part(() => box(0.026, 0.01, 0.012), ["controls"], {
      chan: [chan],
      pos: bridleClamp(axis, end),
      color: "#C9B98F",
      name: "Servo bridle cable clamp",
      anim: (m) => {
        m.position.set(...bridleClamp(axis, end, current()));
      },
      note: "Bolted clamp attaches bridle end to primary control cable; opposing strands translate in opposite directions (AMM 22-10 Figs 22-10-4/5).",
    });
  }
}
part(() => box(0.065, 0.026, 0.05), ["controls"], {
  chan: ["elevator"],
  pos: [0.65, -0.585, 0.33],
  color: MOTOR,
  name: "GTA 82 pitch trim adapter",
  pin: true,
  note: "Below passenger seat. Receives trim-switch, GIA and pitch-servo input and interfaces through dual RS-485 paths. Manual yoke trim routes through GTA 82 with autopilot disconnected; 2 A PITCH TRIM on ESS BUS 2 (AMM 22-10 p. 3). Location approximate.",
});

/* ---------- one actuator, one torque tube, two flap pushrods (AMM 27-50 Fig 27-50-2) ---------- */
export const FLAP_ACTUATOR_BASE: Vec3 = [FT.x + 0.38, FT.y + 0.1, 0];
export function flapMechanism(angle: number) {
  const a = -angle * D2R,
    rotate = (dx: number, dy: number, z: number): Vec3 => [
      FT.x + dx * Math.cos(a) - dy * Math.sin(a),
      FT.y + dx * Math.sin(a) + dy * Math.cos(a),
      z,
    ];
  const coupler = rotate(0.1, 0.06, 0),
    bodyEnd = new THREE.Vector3(...coupler)
      .sub(new THREE.Vector3(...FLAP_ACTUATOR_BASE))
      .normalize()
      .multiplyScalar(0.13)
      .add(new THREE.Vector3(...FLAP_ACTUATOR_BASE))
      .toArray() as Vec3;
  const pushrods = ([-1, 1] as const).map((side) => {
    const key = "flap" + (side > 0 ? "R" : "L"),
      surface = CAT.surfaces.find((s) => s.key === key)!;
    const pivot = new THREE.Vector3(...surface.pivot),
      arm = wingP(side * 1.08, 0.79, 0).add(new THREE.Vector3(0, -0.035, 0));
    const endpoint = arm
      .sub(pivot)
      .applyAxisAngle(new THREE.Vector3(...surface.axis), side * angle * D2R)
      .add(pivot)
      .toArray() as Vec3;
    return [rotate(0.07, -0.045, side * 0.9), endpoint] as [Vec3, Vec3];
  });
  return { coupler, bodyEnd, pushrods };
}
part(() => cyl(0.017, 1.8, "z"), ["flaps"], {
  pos: [FT.x, FT.y, 0],
  color: STEEL,
  name: "Flap torque tube",
  pin: true,
  note: "Torque-tube interconnect mechanically couples left and right flaps. Its coupler is driven by a single linear actuator (POH 7-22; AMM 27-50 p. 1, Fig 27-50-2).",
});
part(() => tubeGeo([FLAP_ACTUATOR_BASE, flapMechanism(0).bodyEnd], 0.023, 0), ["flaps"], {
  color: MOTOR,
  name: "Flap actuator",
  pin: true,
  dynamicGeo: true,
  anim: movingTube(
    () => live.flapAng,
    () => [FLAP_ACTUATOR_BASE, flapMechanism(live.flapAng).bodyEnd],
    0.023,
  ),
  note: "Motorized linear actuator under baggage floor (AMM 27-50 p. 1). Load-limiting clutch protects against deployment under excessive airload; it does not replace VFE limits. 10 A FLAPS on NON ESS BUS (POH 7-23). Location/movement approximate; clutch slip is not simulated.",
});
part(() => tubeGeo([flapMechanism(0).bodyEnd, flapMechanism(0).coupler], 0.009, 0), ["flaps"], {
  color: STEEL,
  name: "Flap actuator shaft / rod end",
  dynamicGeo: true,
  anim: movingTube(
    () => live.flapAng,
    () => [flapMechanism(live.flapAng).bodyEnd, flapMechanism(live.flapAng).coupler],
    0.009,
  ),
  note: "Threaded rod end connects actuator shaft to torque-tube coupler (AMM 27-50 pp. 2–4, Fig 27-50-2). Geometry follows both pins through travel; stroke illustrative.",
});
part(() => tubeGeo([[FT.x, FT.y, 0], flapMechanism(0).coupler], 0.012, 0), ["flaps"], {
  color: CART,
  name: "Flap torque tube coupler",
  dynamicGeo: true,
  anim: movingTube(
    () => live.flapAng,
    () => [[FT.x, FT.y, 0], flapMechanism(live.flapAng).coupler],
    0.012,
  ),
  note: "Coupler arm transmits linear actuator force into torque-tube rotation (AMM Fig 27-50-2). The illustrated arm remains attached to the torque-tube centre and actuator rod-end pin through travel; thickness approximate.",
});
for (const pos of [0, 50, 100])
  part(() => box(0.014, 0.014, 0.018), ["flaps"], {
    pos: [FT.x + 0.17 + pos * 0.0008, FT.y + 0.1, 0.024],
    color: "#D6A04A",
    name: "Flap proximity sensor",
    note: `${pos === 0 ? "UP" : pos + "%"} proximity switch identifies actuator travel and provides position indication (POH 7-22; AMM 27-50 pp. 8–13, Fig 27-50-2). Sensor placements schematic.`,
  });
for (const end of [0, 1]) {
  part(() => tubeGeo(flapMechanism(0).pushrods[end], 0.009, 0), ["flaps"], {
    color: STEEL,
    name: "Flap push-pull rod",
    // Exposed drive at the flap cove follows the surface below the wing when deployed.
    ext: true,
    dynamicGeo: true,
    anim: movingTube(
      () => live.flapAng,
      () => flapMechanism(live.flapAng).pushrods[end],
      0.009,
    ),
    note: "Adjustable pushrod from torque tube to inboard flap drive arm (POH Fig 7-6; AMM Fig 27-50-2). Endpoints follow the rendered torque and flap hinge motion; dimensions approximate.",
  });
  const side = end === 0 ? -1 : 1,
    key = "flap" + (side > 0 ? "R" : "L"),
    pivot = surfacePivot(key),
    p = wingP(side * 1.08, 0.79, 0).add(new THREE.Vector3(0, -0.0175, 0));
  part(() => box(0.02, 0.035, 0.02), ["flaps"], {
    parent: "surf:" + key,
    pos: [p.x - pivot[0], p.y - pivot[1], p.z - pivot[2]],
    color: CART,
    name: "Flap inboard drive arm",
    ext: true,
    note: "Inboard arm moves with its flap and receives torque-tube pushrod input (AMM Fig 27-50-2).",
  });
}
for (const z of [-0.035, 0.035])
  part(() => box(0.03, 0.025, 0.03), ["flaps"], {
    pos: [FT.x + 0.2, FT.y - 0.07, z],
    color: "#3C4A57",
    name: "Flap relay",
    note: "Paired flap relays and EMI suppressors form the actuator harness (AMM 27-50 pp. 1,17–18). Location approximate.",
  });
