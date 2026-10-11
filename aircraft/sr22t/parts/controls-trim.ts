/**
 * Trim systems and servo mechanical drives.
 * May import anchors only from earlier sections:
 * catalogue.ts, airframe.ts, surfaces.ts, cowl.ts, gear.ts, engine.ts, engine-ignition.ts, engine-oil.ts, engine-air.ts, engine-sensors.ts, structure.ts, cabin.ts, cockpit.ts, electrical.ts, avionics.ts, pitot.ts, fuel.ts, environment.ts, aircon.ts, caps.ts, lights.ts, controls.ts.
 * Side-effect-free helpers may come from ../geometry, ../model and ../rig.
 * Shared constants belong in catalogue.ts; later sections must never be imported here.
 *
 * Pitch trim: spring cartridge from the trim motor on the FS 306 bulkhead to the elevator bellcrank (POH 7-6 – 7-7; AMM 27-30
 * PDF pp. 1008, 1023–1029; Fig 27-30-6). Roll trim: spring cartridge from the trim motor on the wing spar to the LH aileron
 * actuation pulley (POH 7-9; AMM 27-10 PDF pp. 946, 979–983; Fig 27-10-7), and the roll relays (Fig 27-10-8). Yaw trim: the
 * ground-adjustable spring cartridge on the rudder pedal torque tube (POH 7-11; AMM 27-20 PDF p. 986). Neutral-trim marks
 * (POH 7-7, 7-9), the rudder-aileron interconnect (AMM Fig 6-00-6), and the GFC 700 servo capstans with their bridle cables
 * clamped to the control cables (AMM 22-10 PDF pp. 555, 577–599).
 */
import * as THREE from "three";
import type { PartAnim } from "@/lib/catalogue";
import { mergeGeos, tubeGeo } from "@/lib/geometry";
import type { Vec3 } from "@/lib/math";
import type { Chan } from "@/lib/systems";
import { box, cyl, wingP } from "../geometry";
import {
  CAPSTAN,
  ELEV_HORN,
  FLOOR_HOLES,
  PEDAL_TT,
  PULLEYS,
  alongCable,
  cable,
  cableTravel,
  fsX,
  rigPose,
  type RigPose,
} from "../rig";
import { part } from "./catalogue";
import { BAT2_SHELF } from "./electrical";
import { useSR22T } from "../store";
import { ELT_POS, ELT_SHELF, ELT_SHELF_OUTLINE, ELT_SHELF_THICKNESS, ELT_SIZE, YOKES, YOKE_X, YOKE_Y } from "./cabin";
import { GTA82, SERVO_BODIES, SERVO_CAPSTANS, YAW_DECK_THICKNESS } from "./controls";

const CART = "#9F85E6",
  MOTOR = "#5E6B75",
  STEEL = "#8C959C",
  MARK = "#F2F4F5";
const TRIM_PWR = (axis: string) => `2 A ${axis} TRIM breaker, ESS BUS 2 (POH 7-7, 7-9).`;

/* ---------- pitch trim (POH 7-6 – 7-7; AMM 27-30; Fig 27-30-6 PDF p. 1028; Fig 6-00-8 PDF p. 125) ---------- */
// The motor bolts to the forward face of the FS 306 bulkhead (AMM 27-30 PDF pp. 1026–1027) on the right (panel RE1); its
// shaft points left to the actuation arm, and the cartridge runs aft on the left (panel LE2), clear of the empennage
// bellcranks, to the elevator bellcrank (AMM 27-30 PDF pp. 1023–1024, 1026; Fig 27-30-6 items 10, 16, 19). Positions approximate.
const ea = PULLEYS.ea;
const PT = {
  x: ea.c[0] + 0.045,
  motorY: -0.02,
  motorZ: 0.035,
  motorLen: 0.07,
  armZ: -0.044,
  cartY: -0.075,
  cartZ: -0.06,
};
const PT_AFT = ELEV_HORN.c[0] + 0.006;
part(() => cyl(0.02, PT.motorLen, "z"), ["controls"], {
  chan: ["elevator"],
  pos: [PT.x, PT.motorY, PT.motorZ],
  color: MOTOR,
  name: "Pitch trim motor",
  note: `Electric trim motor on a bracket bolted to the forward face of the FS 306 bulkhead, behind access panel RE1 "Pitch Trim Motor Assembly" (AMM 27-30 PDF pp. 1026–1027; Fig 27-30-6 item 1 PDF p. 1028; Fig 6-00-8 PDF p. 125). It turns the actuation arm that moves the spring cartridge's neutral position (POH 7-6); upper and lower limit switches stop its travel (AMM 27-30 PDF pp. 1024–1025). ${TRIM_PWR("PITCH")} Position approximate.`,
  pin: true,
});
// motor shaft, from the motor's left end to the actuation arm
const ptShaft = [PT.motorZ - PT.motorLen / 2, PT.armZ + 0.004];
part(() => cyl(0.005, ptShaft[0] - ptShaft[1], "z"), ["controls"], {
  chan: ["elevator"],
  pos: [PT.x, PT.motorY, (ptShaft[0] + ptShaft[1]) / 2],
  color: STEEL,
});
part(() => box(0.012, PT.motorY - PT.cartY + 0.012, 0.008), ["controls"], {
  chan: ["elevator"],
  pos: [PT.x, (PT.motorY + PT.cartY) / 2, PT.armZ],
  color: STEEL,
  name: "Pitch trim actuation arm",
  note: "Set-screwed to the flat of the pitch trim motor shaft; the cartridge's rod end bolts to it (AMM 27-30 PDF pp. 1026–1027; Fig 27-30-7 PDF p. 1029).",
});
part(() => cyl(0.012, PT.x - PT_AFT, "x"), ["controls"], {
  chan: ["elevator"],
  pos: [(PT.x + PT_AFT) / 2, PT.cartY, PT.cartZ],
  color: CART,
  name: "Pitch trim cartridge",
  note: `Compression spring cartridge from the trim motor's actuation arm to the elevator bellcrank, behind access panel LE2 "Pitch Trim Cartridge" (AMM 27-30 PDF pp. 1008, 1023–1024; Fig 27-30-6 item 16 PDF p. 1028; Fig 6-00-8 PDF p. 125). The motor changes its neutral position (POH 7-6); it centres the elevator either way (AMM 27-30 PDF p. 1008) and acts as a gust damper (POH 7-11). Attached directly to the elevator, it is a backup if the primary elevator control fails (POH 3-22). Normal control inputs easily override full trim or autopilot inputs (POH 7-6). Position approximate.`,
  pin: true,
});
// bolt from the cartridge's aft end to the elevator bellcrank
part(() => cyl(0.005, -PT.cartZ - 0.022, "z"), ["controls"], {
  chan: ["elevator"],
  pos: [PT_AFT - 0.006, PT.cartY, (PT.cartZ + 0.012 - 0.01) / 2],
  color: STEEL,
});

/* ---------- roll trim (POH 7-9; AMM 27-10 PDF pp. 946, 979–983; Fig 27-10-7 PDF p. 983) ---------- */
// The motor sits against the aft face of the wing spar (aft of the fuel tank) and the cartridge, drawn at the AMM's 9.4 in
// initial length, runs spanwise along it to the LH aileron actuation pulley, below the aileron cables. The motor sits aft of
// the cartridge, clear of the LH direct aileron cable that climbs past it to the pulley (rig.ts). Chord and height approximate;
// the motor's height keeps it inside the lower wing skin (AMM Fig 6-00-2 loft).
const RT = {
  chord: 0.625,
  motorChord: 0.66,
  cartDy: -0.033,
  motorDy: -0.025,
  motorR: 0.016,
  len: 0.2388,
  arm: 0.008,
  motorLen: 0.09,
};
const onWing = (z: number, dy: number, chord = RT.chord): Vec3 => {
  const p = wingP(z, chord, 0);
  return [p.x, p.y + dy, p.z];
};
// outboard (pulley) end of the cartridge; the inboard end, at the motor's offset arm, is RT.len along the spar from it
const rtZ0 = PULLEYS.awL.c[2] + 0.0182,
  rtA = onWing(rtZ0, RT.cartDy),
  rtSpan = onWing(rtZ0 + 1, RT.cartDy).map((v, i) => v - rtA[i]),
  rtB = rtA.map((v, i) => v + (rtSpan[i] * RT.len) / Math.hypot(...rtSpan)) as Vec3,
  rtZ1 = rtB[2];
part(() => tubeGeo([rtA, rtB], 0.012, 0), ["controls"], {
  chan: ["aileron"],
  color: CART,
  name: "Roll trim cartridge",
  note: `Captured compression spring cartridge bolted directly to the LH aileron actuation pulley (AMM 27-10 PDF p. 946; POH 7-9: "attached to the left actuation pulley in the wing"); its other end is on the roll trim motor's offset arm (AMM 27-10 PDF p. 979; Fig 27-10-7 item 14 PDF p. 983). Drawn at the initial length the AMM gives, "If required, adjust initial length of trim cartridge to 9.4 inches (24.1 cm)"; the final rigged length is whatever gives 6 ± 1° of aileron trim deflection, set by lengthening or shortening the cartridge and, if needed, the trim motor adjustment screws (AMM 27-10 PDF p. 980, Adjustment/Test step (g)). The motor moves its neutral position; the autopilot uses the electric roll trim to position the ailerons (POH 7-9). Normal control inputs easily override it. ${TRIM_PWR("ROLL")} Position approximate.`,
  pin: true,
});
part(() => cyl(RT.motorR, RT.motorLen, "z"), ["controls"], {
  chan: ["aileron"],
  pos: onWing(rtZ1 + RT.arm + RT.motorLen / 2, RT.motorDy, RT.motorChord),
  color: MOTOR,
  name: "Roll trim motor",
  note: `Electric roll trim motor with limit switches, bolted to the wing spar beside the LH aileron actuation pulley (AMM 27-10 PDF pp. 981–982; Fig 27-10-7 items 9, 10 PDF p. 983). The 4-way switch on either yoke grip, or the autopilot, drives it (AMM 27-10 PDF p. 946; POH 7-9). ${TRIM_PWR("ROLL")} Position approximate.`,
  pin: true,
});
// chordwise from the cartridge's inboard end to the motor's axis
const rtArm = [onWing(rtZ1 + RT.arm / 2, RT.cartDy), onWing(rtZ1 + RT.arm / 2, RT.motorDy, RT.motorChord)];
part(
  () => box(Math.abs(rtArm[0][0] - rtArm[1][0]) + 0.024, Math.abs(rtArm[0][1] - rtArm[1][1]) + 0.012, RT.arm),
  ["controls"],
  {
    chan: ["aileron"],
    pos: rtArm[0].map((v, i) => (v + rtArm[1][i]) / 2) as Vec3,
    color: STEEL,
    name: "Roll trim motor offset arm",
    note: "Joins the roll trim motor to the inboard end of the cartridge (AMM 27-10 PDF pp. 979, 982).",
  },
);

/* ---------- yaw trim (POH 7-11; AMM 27-20 PDF p. 986) ---------- */
part(() => box(0.08, 0.04, 0.06), ["controls"], {
  pos: [PEDAL_TT.x - 0.014 - 0.042, PEDAL_TT.y, -0.22],
  color: CART,
  chan: ["rudder"],
  name: "Yaw trim spring cartridge",
  note: "Ground-adjustable captured compression spring cartridge between the rudder pedal torque tube and the console structure (POH 7-11); the AMM bolts it to the left rudder pedal torque tube and the center console assembly (AMM 27-20 PDF p. 986). It centres the rudder either way; yaw trim is ground adjustable only (POH 7-11).",
  pin: true,
});

/* ---------- trim system relays and the rudder-aileron interconnect (AMM Fig 6-00-6 PDF p. 123) ---------- */
// Fig 6-00-6 labels CF4C "Trim System Relays"; AMM 27-10 PDF p. 984 reaches the roll relays through CF3R and Fig 27-10-8 shows
// them on the RH longeron. Drawn under CF4C as specified (open question); position approximate.
const CF4C = FLOOR_HOLES.CF4C;
[-1, 1].forEach((sd, i) =>
  part(() => box(0.03, 0.03, 0.03), ["controls"], {
    chan: ["aileron"],
    pos: [CF4C.x - 0.03, -0.63, sd * 0.045],
    color: "#3C4A57",
    name: "Trim system relays",
    note: 'Roll relays, left and right, plugged into relay sockets (AMM 27-10 PDF p. 946; Fig 27-10-8 items 7–9 PDF p. 985): "Failure of either relay is cause for replacing both relays." Drawn under floor panel CF4C "Trim System Relays" (Fig 6-00-6 PDF p. 123); AMM 27-10 PDF p. 984 removes them through CF3R and Fig 27-10-8 mounts them on the RH longeron. Position approximate.',
    pin: i === 0,
  }),
);
part(() => box(0.08, 0.03, 0.06), ["controls"], {
  chan: ["aileron", "rudder"],
  pos: [FLOOR_HOLES.CF3C.x, -0.615, 0],
  color: "#6D7F8C",
  name: "Rudder-aileron interconnect",
  note: 'Under floor access panel CF3C "Rudder-Aileron Interconnect" (AMM Fig 6-00-6 PDF p. 123). The inspection requires that "Aileron trim functions fully left and right without rudder movement caused by the rudder-aileron interconnect" (AMM PDF p. 95). Neither the POH nor the AMM text describes its mechanism or coupling ratio, so it is drawn as a labelled part only, with no coupling in the controls (open question). Position approximate.',
  pin: true,
});

/* ---------- neutral-trim reference marks (POH 7-7, 7-9) ---------- */
// The sim does not track a trim position, so the marks are drawn aligned (neutral trim). Pilot's side only: the POH names a
// single mark for each axis.
const yokeL = YOKES.find((y) => y.side === "L")!;
const MARK_X = 2.176;
part(() => box(0.003, 0.002, 0.012), ["controls"], {
  chan: ["elevator"],
  parent: "yoke:L",
  pos: [MARK_X - YOKE_X, 0.0195, 0],
  color: MARK,
  name: "Pitch trim reference mark",
  note: "Reference mark on the yoke tube: neutral (takeoff) pitch trim is indicated by its alignment with the tab on the instrument panel bolster (POH 7-7). Drawn at neutral trim.",
});
part(() => box(0.008, 0.002, 0.065), ["controls"], {
  chan: ["elevator"],
  pos: [MARK_X, YOKE_Y + 0.03, yokeL.z + 0.0275],
  color: MARK,
  name: "Pitch trim reference tab",
  note: "Tab attached to the instrument panel bolster: the reference mark on the yoke tube lines up with it at neutral (takeoff) trim (POH 7-7). Shape approximate.",
  pin: true,
});
part(() => box(0.03, 0.001, 0.002), ["controls"], {
  chan: ["aileron"],
  parent: "grip:L",
  pos: [0.016, 0.0225, 0],
  color: MARK,
  name: "Roll trim reference line",
  note: "Line etched on the control yoke: neutral roll trim is indicated by its alignment with the centering indication marked on the instrument panel (POH 7-9). Drawn at neutral trim.",
});
part(() => box(0.004, 0.012, 0.002), ["controls"], {
  chan: ["aileron"],
  pos: [2.276, YOKE_Y + 0.048, yokeL.z],
  color: MARK,
  name: "Roll trim centering mark",
  note: "Centering indication marked on the instrument panel above the yoke: the line etched on the control yoke lines up with it at neutral roll trim (POH 7-9). Shape approximate.",
});

/* ---------- GFC 700 servo capstans, bridle cables and clamps (AMM 22-10 PDF pp. 555, 577–599) ---------- */
/** Point on a control cable at station x, on the first segment that spans it (rig.ts `alongCable`). */
export function onCableAtX(key: string, x: number): Vec3 {
  const p = cable(key).pts;
  const i = p.findIndex((a, j) => j < p.length - 1 && (a[0] - x) * (p[j + 1][0] - x) <= 0);
  if (i < 0)
    throw new Error(`Cable ${key} does not reach x = ${x}: move the bridle clamp onto the cable run in rig.ts`);
  return alongCable(key, i, (x - p[i][0]) / (p[i + 1][0] - p[i][0]));
}
export type Axis3 = "pitch" | "roll" | "yaw";
/** Where each servo bridle clamps to its control cables; yaw uses fore/aft segments on one strand (modelling choice). */
export const BRIDLES: Record<
  Axis3,
  { chan: Chan; name: string; keys: [string, string]; clamps: [Vec3, Vec3]; turns: number; clock: number; note: string }
> = {
  pitch: {
    chan: "elevator",
    keys: ["elB", "elA"],
    turns: 2.5,
    clock: 9,
    name: "Pitch servo bridle cable",
    clamps: [onCableAtX("elB", SERVO_CAPSTANS.pitch.c[0] - 0.25), onCableAtX("elA", SERVO_CAPSTANS.pitch.c[0] - 0.24)],
    note: "About two and one-half wraps on the pitch servo capstan, held by a stop-ball, exiting the bottom of the capstan; the short end is clamped to the inboard elevator cable and the long end to the outboard one, rigged to 25.0 +2.0/−0.0 lb forward of the clamps (AMM 22-10 PDF pp. 577–579). The servo drives the elevator cables through it. Clamp positions approximate. The outboard strand is elB (+z farther from centreline), the inboard elA (Fig 22-10-4 sheet 3, PDF p. 586; Fig 27-30-1, PDF p. 1011).",
  },
  roll: {
    chan: "aileron",
    keys: ["ailR", "ailL"],
    turns: 3,
    clock: 6,
    name: "Roll servo bridle cable",
    clamps: [onCableAtX("ailR", SERVO_CAPSTANS.roll.c[0] + 0.06), onCableAtX("ailL", SERVO_CAPSTANS.roll.c[0] + 0.06)],
    note: "Three wraps on the roll servo capstan, stop-ball at the 6 o'clock position, both cable ends exiting the top of the capstan; its RH end is clamped to the RH aileron cable and its LH end to the LH aileron cable, rigged to 25.0 +2.0/−0.0 lb inboard of the clamps (AMM 22-10 PDF pp. 587–589; AMM 27-10 PDF p. 947). It passes over the elevator and rudder cables. Clamp stations are capstan x + 0.06 m, approximate; adjacent static plumbing and stall wiring are routed clear of their complete travel; clamps align with their local cable tangent (AMM 22-10 PDF p. 589, Fig 22-10-5 PDF p. 594).",
  },
  yaw: {
    chan: "rudder",
    keys: ["rudR", "rudR"],
    turns: 3,
    clock: 12,
    name: "Yaw servo bridle cable",
    clamps: [onCableAtX("rudR", SERVO_CAPSTANS.yaw.c[0] + 0.1), onCableAtX("rudR", SERVO_CAPSTANS.yaw.c[0] - 0.1)],
    note: 'Three wraps on the yaw servo capstan, stop-ball at the 12 o\'clock position, exiting forward and aft at the bottom of the capstan; the AMM clamps the "short end of bridle cable and clamp assembly to aft rudder cable" and the long end to the forward rudder cable, rigged to 25.0 +2.0/−0.0 lb forward of the clamps (AMM 22-10 PDF pp. 596–599; AMM 27-20 PDF p. 988). Modelling choice: both clamps on rudR, fore and aft of the capstan. Forward/aft name cable segments, not RH/LH strands (AMM 27-20 PDF p. 988; Fig 22-10-6 sheet 3, PDF p. 606). Clamp positions approximate.',
  },
};
/**
 * Which side of the capstan the bridle ends leave from: the bottom for the pitch and yaw servos (AMM 22-10 PDF pp. 577, 597),
 * the top for the roll servo (AMM 22-10 PDF pp. 587–589), which also carries it over the elevator and rudder cables.
 */
export const BRIDLE_EXIT: Record<Axis3, 1 | -1> = { pitch: -1, roll: 1, yaw: -1 };
/** Walk on the actual primary polyline, including across segment boundaries, rather than translate in world x. */
export function clampPosition(k: Axis3, end: number, pose?: RigPose): Vec3 {
  const b = BRIDLES[k],
    pts = cable(b.keys[end]).pts,
    q = new THREE.Vector3(...b.clamps[end]);
  let base = 0,
    best = Infinity,
    station = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]),
      z = new THREE.Vector3(...pts[i + 1]),
      line = new THREE.Line3(a, z);
    const t = line.closestPointToPointParameter(q, true),
      gap = line.at(t, new THREE.Vector3()).distanceTo(q),
      len = a.distanceTo(z);
    if (gap < best) {
      best = gap;
      station = base + t * len;
    }
    base += len;
  }
  let distance = station + (pose ? cableTravel(pose, b.keys[end]) : 0);
  for (let i = 0; i < pts.length - 1; i++) {
    const length = Math.hypot(...pts[i + 1].map((v, j) => v - pts[i][j]));
    if (distance <= length) return alongCable(b.keys[end], i, Math.max(0, distance / length));
    distance -= length;
  }
  throw new Error(`Bridle ${k}/${end} travels beyond cable ${b.keys[end]}`);
}
/** Opposite bottom tangents (pitch/yaw) reverse the drum sign relative to long-end cable travel;
 * roll top exits retain it. AMM 22-10 PDF 577/589/598, Figs 22-10-4/-5/-6. */
export const capstanAngle = (k: Axis3, pose: RigPose) =>
  ((k === "roll" ? 1 : -1) * cableTravel(pose, BRIDLES[k].keys[0])) / CAPSTAN.r;
/** Local primary-cable tangent for clamp alignment (AMM 22-10 PDF 589, Fig 22-10-5). */
export function clampTangent(k: Axis3, end: number, pose?: RigPose): Vec3 {
  const q = new THREE.Vector3(...clampPosition(k, end, pose)),
    pts = cable(BRIDLES[k].keys[end]).pts;
  let gap = Infinity,
    tangent = new THREE.Vector3();
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]),
      b = new THREE.Vector3(...pts[i + 1]);
    const distance = new THREE.Line3(a, b).closestPointToPoint(q, true, new THREE.Vector3()).distanceTo(q);
    if (distance < gap) {
      gap = distance;
      tangent = b.sub(a).normalize();
    }
  }
  return tangent.toArray() as Vec3;
}
const clampFrame = (k: Axis3, end: number, pose?: RigPose) =>
  new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(...clampTangent(k, end, pose)),
  );
let poseCache: { pitch: number; roll: number; yaw: number; pose: RigPose } | undefined;
const livePose = () => {
  const s = useSR22T.getState().s,
    c = s.ctrl;
  if (!poseCache || c.pitch !== poseCache.pitch || c.roll !== poseCache.roll || c.yaw !== poseCache.yaw)
    poseCache = { ...c, pose: rigPose(s) };
  return poseCache.pose;
};
const shift = (p: Vec3, axis: "x" | "z", d: number): Vec3 =>
  axis === "x" ? [p[0] + d, p[1], p[2]] : [p[0], p[1], p[2] + d];
/** The independent run exits are tangential: pitch/yaw below the drum, roll above it (AMM 22-10 PDF 579/589/598). */
export function bridleExit(k: Axis3, end: number): Vec3 {
  const { c, axis } = SERVO_CAPSTANS[k],
    e = BRIDLE_EXIT[k];
  const groove = ((end === 0 ? 1 : -1) * CAPSTAN.width) / 3;
  return axis === "z"
    ? [c[0], c[1] + e * (CAPSTAN.r + CAPSTAN.cableR), c[2] + groove]
    : [c[0] + groove, c[1] + e * (CAPSTAN.r + CAPSTAN.cableR), c[2]];
}
/** Pitch redirects its short end through the bracket pulley; yaw redirects the long end forward. */
export const BRIDLE_PULLEYS: Partial<Record<Axis3, { c: Vec3; r: number; end: number }>> = {
  pitch: {
    c: [SERVO_CAPSTANS.pitch.c[0] + 0.048, SERVO_CAPSTANS.pitch.c[1] - 0.045, SERVO_CAPSTANS.pitch.c[2]],
    r: 0.014,
    end: 1,
  },
  yaw: {
    c: [SERVO_CAPSTANS.yaw.c[0] + 0.065, SERVO_CAPSTANS.yaw.c[1] - 0.055, SERVO_CAPSTANS.yaw.c[2]],
    r: 0.014,
    end: 0,
  },
};
export function bridleRun(k: Axis3, end: number, pose?: RigPose): Vec3[] {
  const exit = bridleExit(k, end),
    clamp = clampPosition(k, end, pose),
    side = end === 0 ? 1 : -1;
  const tangent: Vec3 =
    k === "roll"
      ? [exit[0], exit[1], exit[2] + side * 0.035]
      : [exit[0] + (k === "pitch" ? -side : side) * 0.035, exit[1], exit[2]];
  const pulley = BRIDLE_PULLEYS[k];
  const points = [exit, tangent];
  if (pulley && pulley.end === end) {
    // Upper half of the pulley groove, ending toward the control cable, with its keeper below.
    for (let i = 0; i <= 12; i++) {
      const a = (Math.PI * i) / 12;
      points.push([pulley.c[0] + -pulley.r * Math.cos(a), pulley.c[1] + pulley.r * Math.sin(a), pulley.c[2]]);
    }
  }
  if (k === "yaw") {
    // Pass above the paired rudder strands before approaching from the strand's own lateral side; the outer run must
    // not cross through the inner strand during pedal travel. Routing between the AMM anchors is illustrative.
    const lane = 0.14; // Illustrative lane, AMM Fig 22-10-6 sh 3, PDF 606; clears the oxygen envelope.
    points.push([clamp[0], SERVO_CAPSTANS.yaw.c[1] - 0.08, clamp[2] + lane]);
    points.push([clamp[0], clamp[1] + 0.025, clamp[2] + lane], clamp);
    return points;
  }
  if (k === "pitch") {
    // Separate under-cable lanes approach each elevator strand from its own side (Fig 22-10-4 sh 3, PDF 586).
    const lane = end === 0 ? 0.025 : -0.025;
    if (end === 1) {
      const departure = points.at(-1)!;
      points.push([departure[0] + 0.025, departure[1], departure[2]]);
    }
    points.push([points.at(-1)![0], SERVO_CAPSTANS.pitch.c[1] - 0.075, clamp[2] + lane]);
    points.push([clamp[0], clamp[1] - 0.035, clamp[2] + lane]);
    points.push([clamp[0], clamp[1] - 0.018, clamp[2] + lane], clamp);
    return points;
  }
  // Leave a clear lane over/under the primary cable until the final clamp approach (geometry illustrative).
  points.push([
    (points.at(-1)![0] + clamp[0]) / 2,
    (points.at(-1)![1] + clamp[1]) / 2 + BRIDLE_EXIT[k] * 0.018,
    (points.at(-1)![2] + clamp[2]) / 2,
  ]);
  points.push(clamp);
  return points;
}
/** Wound cable. Nominal wrap counts follow the AMM adjustment steps; pitch reassembly also says about 480° per end.
 * Groove pitch, diameter and the transition from the grooves to the two exits are illustrative, not a rigging template. */
export function wrapPoints(k: Axis3): Vec3[] {
  const b = BRIDLES[k],
    { axis } = SERVO_CAPSTANS[k];
  const centreAngle = b.clock === 9 ? 0 : b.clock === 6 ? -Math.PI / 2 : Math.PI / 2;
  return Array.from({ length: 181 }, (_, i) => {
    const u = i / 180 - 0.5,
      a = centreAngle + u * b.turns * Math.PI * 2;
    const radial = CAPSTAN.r + CAPSTAN.cableR,
      axial = u * b.turns * CAPSTAN.groove;
    return axis === "z"
      ? [radial * Math.cos(a), radial * Math.sin(a), axial]
      : [axial, radial * Math.sin(a), radial * Math.cos(a)];
  });
}
/** Connect the moving groove ends to the fixed tangential exits. These undimensioned transitions are illustrative. */
export function grooveExit(k: Axis3, end: number, angle = 0): Vec3[] {
  const { c, axis } = SERVO_CAPSTANS[k],
    local = wrapPoints(k)[end === 0 ? 180 : 0];
  const start = new THREE.Vector3(...local).applyAxisAngle(
    axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0),
    angle,
  );
  const from = Math.atan2(start.y, axis === "z" ? start.x : start.z),
    to = (BRIDLE_EXIT[k] * Math.PI) / 2;
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const a0 = axis === "z" ? start.z : start.x,
    a1 = ((end === 0 ? 1 : -1) * CAPSTAN.width) / 3;
  return Array.from({ length: 25 }, (_, i) => {
    const t = i / 24,
      theta = from + delta * t,
      r = CAPSTAN.r + CAPSTAN.cableR + 0.002 * Math.sin(Math.PI * t),
      axial = a0 + (a1 - a0) * t;
    return axis === "z"
      ? [c[0] + r * Math.cos(theta), c[1] + r * Math.sin(theta), c[2] + axial]
      : [c[0] + axial, c[1] + r * Math.sin(theta), c[2] + r * Math.cos(theta)];
  });
}
export function stopBallPosition(k: Axis3, angle = 0): Vec3 {
  const { c, axis } = SERVO_CAPSTANS[k],
    clock = BRIDLES[k].clock;
  const a = (clock === 9 ? 0 : clock === 6 ? -Math.PI / 2 : Math.PI / 2) + (axis === "z" ? angle : -angle);
  return axis === "z"
    ? [c[0] + CAPSTAN.r * Math.cos(a), c[1] + CAPSTAN.r * Math.sin(a), c[2]]
    : [c[0], c[1] + CAPSTAN.r * Math.sin(a), c[2] + CAPSTAN.r * Math.cos(a)];
}
const rotationAnim =
  (k: Axis3): PartAnim =>
  (m) => {
    m.rotation[SERVO_CAPSTANS[k].axis] = capstanAngle(k, livePose());
  };
// Part rerenders replace userData; keep animation ownership attached to the mesh independently.
const cableGeometries = new WeakMap<THREE.Mesh, { geometry: THREE.BufferGeometry; travel: number }>();
/** Rebuild only when cable travel changes; release the replaced GPU geometry. No allocation when controls are unchanged. */
const cableAnim =
  (k: Axis3, build: (pose: RigPose) => THREE.BufferGeometry): PartAnim =>
  (m) => {
    const pose = livePose(),
      travel = cableTravel(pose, BRIDLES[k].keys[0]);
    const owned = cableGeometries.get(m);
    if (owned?.travel === travel && owned.geometry === m.geometry) return;
    const old = m.geometry;
    m.geometry = build(pose);
    if (owned?.geometry === old) old.dispose();
    cableGeometries.set(m, { geometry: m.geometry, travel });
  };
const DETAIL_NOTE = (k: Axis3) =>
  `AMM 13773-002 Rev 7 Fig 22-10-${k === "pitch" ? "4" : k === "roll" ? "5" : "6"} (PDF p. ${k === "pitch" ? "584" : k === "roll" ? "594" : "604"}). Dimensions approximate.`;

// The Battery 2 shelf top is the battery bottom; host geometry is unchanged (lead ruling, AMM Fig 22-10-6 sh 3, PDF 606).
// The ELT shelf is the ELT installation's own part (parts/cabin.ts; POH Fig 7-21, AMM Fig 25-60-1).
part(
  () => {
    // Front-edge cable notch; preserves the equipment-bottom top datum and outside envelope.
    // AMM Fig 22-10-6 sh 3, PDF 606 shows the shelf; notch 35 × 54 mm is illustrative.
    const [w, h, d] = BAT2_SHELF.size,
      depth = 0.035,
      gap = 0.054;
    const pieces = [
      box(w - depth, h, d).translate(-depth / 2, 0, 0),
      box(depth, h, (d - gap) / 2).translate((w - depth) / 2, 0, (d + gap) / 4),
      box(depth, h, (d - gap) / 2).translate((w - depth) / 2, 0, -(d + gap) / 4),
    ];
    const g = mergeGeos(pieces);
    pieces.forEach((p) => p.dispose());
    return g;
  },
  ["controls"],
  {
    pos: [BAT2_SHELF.c[0], BAT2_SHELF.c[1] - BAT2_SHELF.size[1] / 2, BAT2_SHELF.c[2]],
    color: STEEL,
    name: "Battery 2 shelf",
    note: "Supports the bay equipment; top face derived from its unchanged equipment anchor (lead ruling; AMM Fig 22-10-6 sheet 3, PDF p. 606). Dimensions approximate; illustrative 35 × 54 mm front cable notch (same figure/page).",
    plate: true,
  },
);
/** Strips meet the deck underside by their upper edge, never by a tilted face inside the actuator.
 * Width/thickness illustrative, AMM Fig 22-10-6 sh 3 (PDF 606). */
const bracketStrip = (a: Vec3, top: Vec3) => {
  const end = new THREE.Vector3(...top),
    start = new THREE.Vector3(...a);
  const orientation = () =>
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), end.clone().sub(start).normalize());
  // Solve the terminal centre so the tilted section's highest corner meets the underside.
  for (let i = 0; i < 16; i++) {
    const q = orientation();
    const extent =
      Math.abs(new THREE.Vector3(0.025, 0, 0).applyQuaternion(q).y) +
      Math.abs(new THREE.Vector3(0, 0.002, 0).applyQuaternion(q).y);
    end.y = top[1] - extent;
  }
  const g = box(0.05, 0.004, end.distanceTo(start));
  g.applyQuaternion(orientation());
  g.translate(...start.add(end).multiplyScalar(0.5).toArray());
  return g;
};
/** Attachment edges and raised deck of the yaw bracket, derived from the two shelf anchors and actuator bottom. */
const yawDeck: Vec3 = [
  SERVO_BODIES.yaw.c[0],
  SERVO_BODIES.yaw.c[1] - SERVO_BODIES.yaw.size[1] / 2 - YAW_DECK_THICKNESS / 2,
  SERVO_BODIES.yaw.c[2],
];
const yawUnderside: Vec3 = [yawDeck[0], yawDeck[1] - YAW_DECK_THICKNESS / 2, yawDeck[2]];
/** Inboard (straight) edge of the ELT shelf; the ELT strip's outermost corner stops 1 mm short of it. */
const ELT_SHELF_EDGE_Z = ELT_SHELF[2] + Math.min(...ELT_SHELF_OUTLINE.map(([, z]) => z));
const eltAnchor = (): Vec3 => {
  // Strip just forward of the ELT, at the shelf underside; solve z from the tilted strip's actual corners.
  const a: Vec3 = [ELT_POS[0] + ELT_SIZE[0] / 2 + 0.025, ELT_SHELF[1] - ELT_SHELF_THICKNESS / 2, ELT_SHELF_EDGE_Z];
  for (let i = 0; i < 8; i++) {
    const g = bracketStrip(a, yawUnderside);
    g.computeBoundingBox();
    a[2] -= g.boundingBox!.max.z - (ELT_SHELF_EDGE_Z - 0.001);
    g.dispose();
  }
  return a;
};
export const YAW_BRACKET = {
  battery: [
    BAT2_SHELF.c[0] - BAT2_SHELF.size[0] / 2 - 0.025,
    BAT2_SHELF.c[1] - BAT2_SHELF.size[1] / 2,
    BAT2_SHELF.c[2] + BAT2_SHELF.size[2] / 2,
  ] as Vec3,
  elt: eltAnchor(),
  deck: yawDeck,
};
function detail(geo: () => THREE.BufferGeometry, k: Axis3, name: string, opts: Parameters<typeof part>[2] = {}) {
  part(geo, ["controls"], { chan: [BRIDLES[k].chan], color: STEEL, name, note: DETAIL_NOTE(k), ...opts });
}
(["pitch", "roll", "yaw"] as const).forEach((k) => {
  const { c, axis } = SERVO_CAPSTANS[k],
    b = BRIDLES[k],
    body = SERVO_BODIES[k];
  // Mount is at the actuator's output face, rather than overlapping its body.
  const sign = k === "pitch" ? 1 : -1;
  const mountC = shift(c, axis, sign * (CAPSTAN.width / 2 + 0.003));
  detail(() => cyl(0.03, 0.006, axis), k, "GSM 86 servo mount", { pos: mountC });
  detail(() => cyl(CAPSTAN.r, CAPSTAN.width, axis), k, k[0].toUpperCase() + k.slice(1) + " servo capstan", {
    pos: c,
    color: "#B9A3F0",
    fairing: true,
    anim: rotationAnim(k),
    note: `GSM 86 capstan transmits actuator torque through its slip clutch; sufficient pilot force overrides it (AMM 22-10 PDF pp. 555–556). Diameter 0.04 m approximate; rate is illustrative, driven by primary pulley cable travel, not an autopilot simulation. ${DETAIL_NOTE(k)}`,
  });
  detail(() => cyl(0.008, 0.014, axis), k, "Slip clutch cartridge", { pos: c, color: "#E0A146" });
  // Wire-sized guard rods and a stiffener ring outside the wrap envelope, so the bridle can move freely.
  const ring = () => {
    const g = new THREE.TorusGeometry(0.027, 0.0015, 8, 48);
    if (axis === "x") g.rotateY(Math.PI / 2);
    return g;
  };
  detail(ring, k, "Capstan stiffener ring", { pos: shift(c, axis, -sign * 0.013) });
  for (const sd of [-1, 1]) {
    const guardC: Vec3 = axis === "z" ? [c[0], c[1] + sd * 0.027, c[2]] : [c[0], c[1] + sd * 0.027, c[2]];
    detail(() => cyl(0.0015, 0.026, axis), k, "Capstan cable guard", { pos: guardC });
  }
  detail(
    () =>
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(
          wrapPoints(k).map((p) => new THREE.Vector3(...p)),
          false,
          "catmullrom",
          0,
        ),
        180,
        CAPSTAN.cableR,
        8,
        false,
      ),
    k,
    "Capstan bridle wrap",
    {
      pos: c,
      color: "#DDD3B6",
      anim: rotationAnim(k),
      note: `${b.turns} nominal turns, stop-ball at ${b.clock} o'clock at centre travel (AMM 22-10 PDF p. ${k === "pitch" ? "579" : k === "roll" ? "589" : "598"}). ${k === "pitch" ? "Pitch reassembly gives about 480° each way (PDF p. 577); this illustrative wrap follows the adjustment step's approximately 2.5 turns." : `Reassembly wraps each end about 540° (PDF p. ${k === "roll" ? "587" : "597"}), three turns in all.`} Diameter, groove pitch and exit transitions approximate.`,
    },
  );
  detail(() => new THREE.SphereGeometry(0.003, 12, 8), k, "Bridle stop-ball", {
    pos: stopBallPosition(k),
    color: "#E0A146",
    anim: (m) => m.position.set(...stopBallPosition(k, capstanAngle(k, livePose()))),
  });
  if (k === "yaw") {
    detail(() => box(body.size[0], YAW_DECK_THICKNESS, body.size[2]), k, "Servo mounting bracket", {
      pos: YAW_BRACKET.deck,
      note: "Horizontal deck beneath the unchanged actuator footprint; 4 mm thick, approximate (AMM Fig 22-10-6 sh 3, PDF 606).",
    });
    for (const edge of [YAW_BRACKET.battery, YAW_BRACKET.elt])
      detail(() => bracketStrip(edge, yawUnderside), k, "Servo mounting bracket", {
        note: "Raised bracket spans Battery 2 and ELT shelves; actuator sits above its deck (lead ruling; AMM Fig 22-10-6 sheet 3, PDF p. 606). ELT shelf per POH Fig 7-21 (7-92) and AMM Fig 25-60-1 (PDF 912). Dimensions approximate.",
      });
  } else {
    detail(
      // Pitch plate matches the actuator height so the ELT remote cable's floor run passes above it.
      () => box(...((axis === "z" ? [0.004, body.size[1], 0.12] : [0.004, 0.055, 0.075]) as Vec3)),
      k,
      "Servo mounting bracket",
      {
        pos:
          axis === "z"
            ? [body.c[0] + body.size[0] / 2 + 0.002, body.c[1], body.c[2]]
            : [body.c[0] - body.size[0] / 2 - 0.002, body.c[1], body.c[2]],
        note: `${k === "pitch" ? "Bracket toward bulkhead FS 186" : "Bracket follows the POH centreline servo position; AMM names the RH aft longeron"}. ${DETAIL_NOTE(k)} Position approximate; POH Fig 7-20 (7-88) governs plan position.`,
      },
    );
  }
  if (k === "pitch") {
    const face = body.c[0] + body.size[0] / 2,
      bulkhead = fsX(186);
    detail(() => box(bulkhead - face, 0.014, 0.006), k, "Servo mounting bracket", {
      pos: [(face + bulkhead) / 2, body.c[1], body.c[2] + body.size[2] / 2 + 0.003],
      note: "Pitch bracket flange reaches bulkhead FS 186 (AMM Fig 22-10-4, PDF p. 584); dimensions approximate. Endpoints derive from actuator and bulkhead anchors.",
    });
  }
  const pulley = BRIDLE_PULLEYS[k];
  if (pulley) {
    detail(() => cyl(pulley.r - 0.002, 0.009, "z"), k, "Bridle pulley", {
      pos: pulley.c,
      anim: (m) => {
        m.rotation.z = cableTravel(livePose(), b.keys[pulley.end]) / pulley.r;
      },
    });
    detail(() => box(0.036, 0.003, 0.012), k, "Cable keeper", {
      pos: [pulley.c[0], pulley.c[1] - pulley.r - 0.002, pulley.c[2]],
    });
    detail(() => box(0.003, 0.012, 0.018), k, "Cable diverter", { pos: [c[0], c[1] - 0.037, c[2]] });
  }
  for (const end of [0, 1])
    detail(() => tubeGeo(grooveExit(k, end), CAPSTAN.cableR, 0), k, "Capstan groove exit transitions", {
      color: "#DDD3B6",
      note: `Bridle joins the groove ends to the tangential exits; routing and motion illustrative. ${DETAIL_NOTE(k)}`,
      dynamicGeo: true,
      anim: cableAnim(k, (pose) => tubeGeo(grooveExit(k, end, capstanAngle(k, pose)), CAPSTAN.cableR, 0)),
    });
  // One tube per run, exit to clamp: the groove exit transitions and the wrap already join the two exits on the drum.
  for (const end of [0, 1])
    detail(() => tubeGeo(bridleRun(k, end), CAPSTAN.cableR, 0), k, b.name, {
      color: "#D8DDE1",
      note: b.note + " Motion and routing illustrative; clamp travel derives from primary pulley arc length.",
      pin: end === 0,
      dynamicGeo: true,
      anim: cableAnim(k, (pose) => tubeGeo(bridleRun(k, end, pose), CAPSTAN.cableR, 0)),
    });
  b.clamps.forEach((p, end) => {
    const q = clampFrame(k, end),
      euler = new THREE.Euler().setFromQuaternion(q);
    const rot: Vec3 = [euler.x, euler.y, euler.z];
    const at = (offset: Vec3): Vec3 =>
      new THREE.Vector3(...offset)
        .applyQuaternion(q)
        .add(new THREE.Vector3(...p))
        .toArray() as Vec3;
    const anim =
      (offset: Vec3): PartAnim =>
      (m) => {
        const pose = livePose(),
          frame = clampFrame(k, end, pose);
        m.quaternion.copy(frame);
        m.position.copy(
          new THREE.Vector3(...offset).applyQuaternion(frame).add(new THREE.Vector3(...clampPosition(k, end, pose))),
        );
      };
    detail(() => box(0.03, 0.012, 0.012), k, "Bridle cable clamp", {
      pos: p,
      rot,
      color: "#C9B98F",
      anim: anim([0, 0, 0]),
      note: `Bolted clamp on ${b.keys[end]} holding the ${k === "roll" ? (end === 0 ? "RH wing" : "LH wing") : end === 0 ? "long" : "short"} bridle end to its primary segment (${DETAIL_NOTE(k)}). Aligned with the local cable tangent through travel (AMM 22-10 PDF p. 589). Positions and motion illustrative. Clamp nuts 50 ± 5 in-lb (AMM 22-10 PDF p. ${k === "pitch" ? "579" : k === "roll" ? "589" : "598"}).${k === "roll" ? " The AMM names the roll ends by wing (PDF p. 587)." : ""}`,
    });
    const fitting: Vec3 = [0, BRIDLE_EXIT[k] * 0.008, 0];
    detail(() => cyl(0.003, 0.02, "x"), k, "Bridle cable end fitting", {
      pos: at(fitting),
      rot,
      color: "#C9B98F",
      anim: anim(fitting),
    });
    if (k === "pitch") {
      const spacer: Vec3 = [0, 0, 0.007];
      detail(() => box(0.022, 0.002, 0.012), k, "Bridle clamp spacer", {
        pos: at(spacer),
        rot,
        anim: anim(spacer),
      });
    }
  });
});
part(() => box(GTA82.size[0] + 0.012, 0.003, GTA82.size[2] + 0.012), ["controls"], {
  chan: ["elevator"],
  pos: [GTA82.c[0], GTA82.c[1] - GTA82.size[1] / 2 - 0.0015, GTA82.c[2]],
  color: STEEL,
  name: "GTA 82 mounting plate",
  note: "Mounting plate on RH aft longeron (AMM Fig 22-10-3, PDF p. 572). Plate follows retained POH Fig 7-20 item 16 (7-88) adapter position; dimensions approximate.",
});
export const GTA82_HARNESS: Vec3[] = [
  [GTA82.c[0] - GTA82.size[0] / 2, GTA82.c[1], GTA82.c[2]],
  [GTA82.c[0] - GTA82.size[0] / 2 - 0.01, GTA82.c[1] - 0.015, GTA82.c[2] + 0.015],
  [SERVO_BODIES.pitch.c[0], SERVO_BODIES.pitch.c[1], SERVO_BODIES.pitch.c[2] + SERVO_BODIES.pitch.size[2] / 2 + 0.02],
  [SERVO_BODIES.pitch.c[0], SERVO_BODIES.pitch.c[1], SERVO_BODIES.pitch.c[2] + SERVO_BODIES.pitch.size[2] / 2],
];
part(() => tubeGeo(GTA82_HARNESS, 0.002, 0), ["controls"], {
  chan: ["elevator"],
  color: "#E0A146",
  name: "Pitch trim adapter → pitch servo harness",
  note: "GTA 82 receives pitch servo input (AMM 22-10 PDF p. 554); harness terminates at the actuator connector (Fig 22-10-4 item 2, PDF p. 584). Routing approximate.",
});
