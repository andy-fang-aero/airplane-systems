/**
 * Flight-control mechanisms (POH Figures 7-1, 7-2, 7-3; AMM 27-10, 27-20, 27-30): elevator torque tube and sectors,
 * aileron carriages and central sector, rudder pedal torque tube and horn, pulley gangs, bellcranks, turnbuckles,
 * fairleads, control stops and rudder springs; GFC 700 autopilot servos and pitch trim adapter (POH Fig. 7-17; AMM 22-10).
 */
import * as THREE from "three";
import { chanOfKey, type PartAnim } from "@/lib/catalogue";
import { glowAnim } from "@/lib/anims";
import { mats } from "@/lib/materials";
import type { Vec3 } from "@/lib/math";
import type { Chan } from "@/lib/systems";
import { useView } from "@/lib/view";
import { useSR22T } from "../store";
import { FW, box, cyl, wingP } from "../geometry";
import {
  AFT_GANG,
  AIL_DRIVE,
  AIL_SECTOR,
  BELLCRANK_SHAFT,
  CARR,
  ELEV_HORN,
  ETT,
  FAIRLEADS,
  FWD_GANG,
  LEVER_ANG,
  PEDAL_TT,
  PULLEYS,
  RUD_HORN,
  RUD_HORN_AFT,
  TURNBUCKLES,
  cable,
  pulleyGeo,
  sectorGeo,
  stopsInContact,
} from "../rig";
import { part, surfacePivot } from "./catalogue";
import { BAT2_SHELF } from "./electrical";

/* ---------- flight-control mechanisms (POH Figures 7-1, 7-2, 7-3) ---------- */
const CTL = "#7C57CF",
  STEEL = "#8C959C";
// elevator: lateral torque tube under the panel with end levers and the forward cable sector
part(() => cyl(0.016, ETT.half * 2, "z"), ["controls"], {
  chan: ["elevator"],
  parent: "rig:ett",
  color: STEEL,
  name: "Elevator torque tube",
  note: "Lateral torque tube under the panel. Drop links from both yoke tubes rotate it; its forward sector drives the elevator cables (POH Fig. 7-1).",
  pin: true,
});
[-1, 1].forEach((sd) =>
  part(() => box(0.02, ETT.lever, 0.02), ["controls"], {
    chan: ["elevator"],
    parent: "rig:ett",
    pos: [(Math.sin(LEVER_ANG) * ETT.lever) / 2, (Math.cos(LEVER_ANG) * ETT.lever) / 2, sd * CARR.z],
    rot: [0, 0, -LEVER_ANG],
    color: STEEL,
    name: "Torque tube lever",
    note: "Lever arm at each end of the elevator torque tube; the yoke drop link attaches to its tip.",
  }),
);
part(() => sectorGeo(ETT.sectorR), ["controls"], {
  chan: ["elevator"],
  parent: "rig:ett",
  pos: [0, 0, ETT.sectorZ],
  color: CTL,
  name: "Forward elevator sector",
  note: "Cable sector on the torque tube. The two elevator cables leave it as a crossed pair to the forward pulleys.",
  pin: true,
});
part(() => cyl(0.02, 0.05, "z"), ["controls"], {
  chan: ["elevator"],
  pos: [ETT.c[0], ETT.c[1], -0.25],
  color: "#5A636A",
  name: "Torque tube bearing block",
  note: "Bearing blocks support the elevator torque tube.",
});
part(() => cyl(0.02, 0.05, "z"), ["controls"], {
  chan: ["elevator"],
  pos: [ETT.c[0], ETT.c[1], 0.25],
  color: "#5A636A",
});
// aileron: pivoting bearing carriages, central pulley sector
[-1, 1].forEach((sd) => {
  const parent = "rig:carr:" + (sd < 0 ? "L" : "R");
  part(() => box(0.2, 0.02, 0.05), ["controls"], {
    chan: ["aileron"],
    parent,
    pos: [0, -0.03, 0],
    color: STEEL,
    name: "Aileron bearing carriage",
    note: "The yoke tube rotates this pivoting carriage for roll and slides through it for pitch (POH Fig. 7-2).",
    pin: sd > 0,
  });
  part(() => box(0.02, CARR.arm, 0.02), ["controls"], {
    chan: ["aileron"],
    parent,
    pos: [CARR.armX, -CARR.arm / 2, 0],
    color: STEEL,
    name: "Carriage arm",
    note: "Drives the lateral push rod to the central aileron sector.",
  });
});
part(
  () => {
    const g = new THREE.CylinderGeometry(AIL_SECTOR.r, AIL_SECTOR.r, 0.014, 32);
    g.rotateZ(Math.PI / 2);
    return g;
  },
  ["controls"],
  {
    chan: ["aileron"],
    parent: "rig:ailSector",
    color: CTL,
    name: "Central aileron pulley sector",
    note: "Centrally located pulley sector: the push rod turns it and it drives both aileron cables down to the floor pulleys.",
    pin: true,
  },
);
part(() => box(0.012, 0.02, 0.012), ["controls"], {
  chan: ["aileron"],
  parent: "rig:ailSector",
  pos: [0, AIL_SECTOR.r, 0],
  color: STEEL,
});
// rudder: pedal torque tube and cable horn
part(() => cyl(0.014, PEDAL_TT.half * 2, "z"), ["controls", "gear"], {
  chan: ["rudder"],
  pos: [PEDAL_TT.x, PEDAL_TT.y, 0],
  color: STEEL,
  name: "Rudder pedal torque tube",
  note: "Carries the four pedals; springs and a ground-adjustable spring cartridge here centre the rudder.",
  pin: true,
});
part(() => box(0.03, 0.02, RUD_HORN.half * 2 + 0.02), ["controls"], {
  chan: ["rudder"],
  parent: "rig:rudHorn",
  color: CTL,
  name: "Rudder cable horn",
  note: "Pedal links pivot this horn; its ends pull the two rudder cable strands.",
  pin: true,
});
part(() => cyl(0.008, 0.05, "y"), ["controls"], { chan: ["rudder"], pos: RUD_HORN.c, color: STEEL });
// arm from each pedal pair's inboard pedal across to its pedal link
[-1, 1].forEach((sd) => {
  const z0 = sd * 0.14,
    z1 = RUD_HORN.c[2] + sd * RUD_HORN.half;
  part(() => box(0.02, 0.015, Math.abs(z1 - z0) + 0.02), ["controls"], {
    chan: ["rudder"],
    parent: sd < 0 ? "rig:pedL" : "rig:pedR",
    pos: [PEDAL_TT.x, RUD_HORN.c[1], (z0 + z1) / 2],
    color: STEEL,
    name: "Pedal arm",
    note: "Ties each pedal pair to its pedal link; pushing a pedal forward pulls the horn.",
  });
});
// pulleys (each in its own group so it can turn with cable travel)
const pulleyPart = (k: string) => {
  const d = PULLEYS[k];
  part(() => pulleyGeo(d.r, d.axis, d.double, d.gap), ["controls"], {
    chan: chanOfKey(k === "ef" || k === "em" || k === "ea" ? "el" : k.startsWith("a") ? "ail" : "rud"),
    parent: "rig:pul:" + k,
    color: k === "ea" || k === "ra" || k.startsWith("aw") ? CTL : "#A6AEB4",
    name: d.name,
    note: d.note,
    pin: true,
  });
};
// the cross-over pulleys are new to this block, so they register after its existing parts (AGENTS.md "Part order")
const XOVER_PULLEYS = ["axR", "axL"];
Object.keys(PULLEYS)
  .filter((k) => !XOVER_PULLEYS.includes(k))
  .forEach(pulleyPart);
// crank pins on the aft sectors
part(() => cyl(0.008, 0.03, "z"), ["controls"], {
  chan: ["elevator"],
  parent: "rig:pul:ea",
  pos: [0, -0.06, 0],
  color: STEEL,
});
part(() => cyl(0.008, 0.03, "z"), ["controls"], {
  chan: ["rudder"],
  parent: "rig:pul:ra",
  pos: [0, -0.05, 0],
  color: STEEL,
});
// bellcranks on the surfaces
{
  const pv = surfacePivot("elevR"),
    c = ELEV_HORN.c;
  part(() => box(0.02, ELEV_HORN.arm, 0.02), ["controls"], {
    parent: "surf:elevR",
    pos: [c[0] - pv[0], c[1] - ELEV_HORN.arm / 2 - pv[1], c[2] - pv[2]],
    color: CTL,
    name: "Elevator bellcrank",
    note: "Between the elevator halves; the push-pull tube from the elevator empennage bellcrank (POH: aft sector pulley) drives it. The AMM calls it the aft elevator bellcrank (AMM 27-30 PDF p. 1008).",
    pin: true,
  });
  part(() => cyl(0.014, 0.2, "z"), ["controls"], {
    parent: "surf:elevR",
    pos: [c[0] - pv[0], c[1] - pv[1], c[2] - pv[2]],
    color: STEEL,
    name: "Elevator torque tube (tail)",
    note: "Joins the two elevator halves on the hinge line.",
  });
  const rv = surfacePivot("rudder"),
    r = RUD_HORN_AFT.c;
  part(() => box(0.02, 0.02, RUD_HORN_AFT.arm), ["controls"], {
    parent: "surf:rudder",
    pos: [r[0] - rv[0], r[1] - rv[1], RUD_HORN_AFT.arm / 2 - rv[2]],
    color: CTL,
    name: "Rudder bellcrank",
    note: "Horn at the bottom of the rudder; the push-pull tube from the rudder empennage bellcrank drives it. The AMM calls it the aft rudder bellcrank, bolted directly to the rudder (AMM 27-20 PDF p. 986).",
    pin: true,
  });
  [1, -1].forEach((sd) => {
    const key = "ail" + (sd > 0 ? "R" : "L"),
      av = surfacePivot(key);
    const hz = wingP(sd * AIL_DRIVE.z, 0.75, 0);
    part(() => box(0.012, AIL_DRIVE.arm, 0.012), ["controls"], {
      chan: ["aileron"],
      parent: "surf:" + key,
      pos: [hz.x - av[0], hz.y + AIL_DRIVE.arm / 2 - av[1], hz.z - av[2]],
      color: CTL,
      name: "Aileron conical drive arm",
      note: "Right-angle drive: the arm on the aileron hinge that the wing sector's crank turns.",
    });
    part(() => box(0.012, 0.012, AIL_DRIVE.crank), ["controls"], {
      chan: ["aileron"],
      parent: "rig:pul:aw" + (sd > 0 ? "R" : "L"),
      pos: [0, AIL_DRIVE.lift, (sd * AIL_DRIVE.crank) / 2],
      color: STEEL,
      name: "Wing sector crank arm",
      note: "Swings fore-aft as the sector turns and drives the aileron's conical drive arm.",
    });
  });
}
// turnbuckles at their access holes (rig.ts TURNBUCKLES), each inline with the cable segment it sits on
const tbAxis = (key: string, p: Vec3): "x" | "y" | "z" => {
  const pts = cable(key).pts,
    q = new THREE.Vector3(...p),
    gap = (i: number) =>
      new THREE.Line3(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1]))
        .closestPointToPoint(q, true, new THREE.Vector3())
        .distanceTo(q);
  const i = pts.slice(1).reduce((best, _, j) => (gap(j) < gap(best) ? j : best), 0);
  const dir = pts[i + 1].map((v, k) => Math.abs(v - pts[i][k]));
  return (["x", "y", "z"] as const)[dir.indexOf(Math.max(...dir))];
};
TURNBUCKLES.forEach((t, j) =>
  part(() => cyl(0.009, 0.07, tbAxis(t.key, t.pos)), ["controls"], {
    chan: chanOfKey(t.key),
    pos: t.pos,
    color: "#C9B98F",
    name: t.name,
    note: t.note,
    pin: j === 0 || TURNBUCKLES[j - 1].name !== t.name,
  }),
);
// a fairlead at each flap hinge
FAIRLEADS.forEach((p, j) =>
  part(() => box(0.16, 0.03, 0.02), ["controls"], {
    chan: ["aileron"],
    pos: p,
    color: "#C9D0D5",
    name: "Aileron cable fairlead",
    note: "At each flap hinge the direct and cross-over aileron cables pass through a fairlead on their way to the aileron actuation pulley (AMM 27-10 PDF p. 946); three flap hinges per wing (POH 7-22). Position approximate.",
    pin: j === 0,
  }),
);
// pulley gang brackets and the shared empennage bellcrank shaft
part(() => box(0.06, 0.012, 0.27), ["controls"], {
  pos: [FWD_GANG.x, FWD_GANG.y + 0.045, 0.045],
  color: STEEL,
  name: "Forward pulley gang bracket",
  note: "One bracket at the bottom of the center console carries the aileron, elevator and rudder pulleys on one bolt (AMM 27-10, 27-20, 27-30; Fig 27-10-5 PDF p. 976). Position approximate.",
  pin: true,
});
part(() => box(0.012, 0.06, 0.15), ["controls"], {
  pos: [AFT_GANG.x - 0.038, AFT_GANG.y, 0.1],
  color: STEEL,
  name: "Rudder/elevator pulley gang bracket",
  note: "Bolted to the forward face of the FS 186 bulkhead, with a backing plate on the aft face; carries the two elevator and two rudder pulleys (AMM 27-20 PDF p. 986; Fig 27-20-5 items 6, 7 PDF p. 1005). Offset and height approximate.",
  pin: true,
});
part(() => cyl(0.01, 0.13, "z"), ["controls"], {
  pos: [BELLCRANK_SHAFT.x, BELLCRANK_SHAFT.y, 0.0025],
  color: STEEL,
  name: "Empennage bellcrank shaft (FS 306)",
  note: "Shared shaft mounted directly to the FS 306 bulkhead: the rudder and elevator empennage bellcranks turn on it separately (AMM 27-20 PDF p. 986; Fig 27-20-6 item 10 PDF p. 1006).",
  pin: true,
});
// control stops: lit when their surface is at full travel (rig.ts stopsInContact)
const STOP = "#B5523B";
const stopOn = (k: keyof ReturnType<typeof stopsInContact>) => () => stopsInContact(useSR22T.getState().s.ctrl)[k];
/** Stop glow that also fades with the other channels when the controls view is focused on one cable run, as `Part` does. */
const stopAnim = (chan: Chan, k: keyof ReturnType<typeof stopsInContact>): PartAnim => {
  const glow = glowAnim(STOP, stopOn(k), ["controls"]);
  return (m, t) => {
    const v = useView.getState();
    if (v.sys === "controls" && v.ctrlFocus !== "all" && v.ctrlFocus !== chan) m.material = mats(STOP).dim;
    else glow(m, t);
  };
};
[1, -1].forEach((sd) => {
  const c = (sd > 0 ? PULLEYS.awR : PULLEYS.awL).c;
  part(() => box(0.02, 0.025, 0.03), ["controls"], {
    chan: ["aileron"],
    pos: [c[0] - 0.075, c[1], c[2]],
    color: STOP,
    name: "Aileron control stop",
    note: "Adjustable stop screws on each aileron actuation pulley limit aileron travel to 12.5 ± 1° up and down. In full left roll the LH lower stop contacts first, in full right roll the RH lower stop; the opposite upper stop then shows a 0.035 ± 0.020 in gap (AMM 27-10 PDF pp. 946, 953). Lights at full travel.",
    pin: sd > 0,
    anim: stopAnim("aileron", sd > 0 ? "ailR" : "ailL"),
  });
});
(
  [
    [
      "ea",
      "elevator",
      "Elevator control stop",
      "elev",
      "Fixed stops at the elevator empennage bellcrank limit elevator travel (AMM 27-30 PDF p. 1008): 25° up, 15° down (AMM 6-00 PDF p. 117). Lights at full travel.",
    ],
    [
      "ra",
      "rudder",
      "Rudder control stop",
      "rud",
      "Fixed stops at the rudder empennage bellcrank limit rudder travel (AMM 27-20 PDF p. 986): 20° left and right (AMM 6-00 PDF p. 117). Lights at full travel.",
    ],
  ] as const
).forEach(([k, chan, name, stop, note]) => {
  const d = PULLEYS[k];
  part(() => box(0.02, 0.02, 0.016), ["controls"], {
    chan: [chan],
    pos: [d.c[0] - d.r - 0.015, d.c[1], d.c[2]],
    color: STOP,
    name,
    note,
    pin: true,
    anim: stopAnim(chan, stop),
  });
});
// rudder springs: pedal assembly to firewall
[1, -1].forEach((sd) =>
  part(() => cyl(0.008, FW - PEDAL_TT.x, "x"), ["controls"], {
    chan: ["rudder"],
    pos: [(FW + PEDAL_TT.x) / 2, PEDAL_TT.y + 0.03, sd * 0.2],
    color: "#B7BEC4",
    name: "Rudder return spring",
    note: "Springs connected to the rudder pedal assembly tension the cables and provide centering force (POH 7-11); the AMM puts two springs between the rudder assembly and the firewall, which also set the rudder cable tension (AMM 27-20 PDF p. 986). Position approximate.",
    pin: sd > 0,
  }),
);
XOVER_PULLEYS.forEach(pulleyPart);

/* ---------- GFC 700 servos (POH 7-73 Fig. 7-17; AMM 13773-002 Rev 7 22-10, PDF pp. 554–556) ---------- */
// The modelled airplane is before 22T-9750: GSA 80/81 actuators on GSM 86 capstan mounts (AMM 22-10 PDF pp. 555–556).
// Positions follow POH Fig 7-20 Equipment Locations (7-88), which governs over the AMM wording. The plan view
// is not dimensioned: scaled from the aft cabin bulkhead (FS 222) and the cabin speaker (item 13), about 0.23 in per pixel at
// 110 dpi, so every position is approximate. Heights are not in the figure; each servo sits under the floor next to its cable.
const SERVO = "#4F3D8F";
/** Reserved output-face envelope for the separate GSM 86 flange, illustrative (AMM 22-10 PDF 555–556). */
export const SERVO_OUTPUT_FACE = 0.006;
/** Lead ruling: AMM Fig 22-10-6 sheet 3 (PDF p. 606) governs yaw height, above the BAT 2 shelf.
 * Only y changes; FS and lateral position remain POH Fig 7-20. Bracket thickness is illustrative. */
const YAW_SIZE: Vec3 = [0.08, 0.07, 0.12];
/** Undimensioned deck: 4 mm plate above a 2 mm shelf rise, illustrative (AMM Fig 22-10-6 sh 3, PDF 606). */
export const YAW_DECK_THICKNESS = 0.004;
export const YAW_DECK_RISE = 0.002;
export const YAW_SERVO_Y = BAT2_SHELF.c[1] + YAW_DECK_RISE + YAW_DECK_THICKNESS + YAW_SIZE[1] / 2;
/**
 * Servo capstan centres and axes, where the bridle cables wrap (AMM 22-10 PDF pp. 577–579, 587–589, 596–599). Pitch and yaw
 * servos lie athwartships with the capstan on their inboard end (Fig 7-20 items 17, 23); the roll servo lies fore-aft with
 * the capstan forward (item 14). Read by parts/controls-trim.ts for the capstans, bridles and clamps.
 */
export const SERVO_CAPSTANS = {
  pitch: { c: [0.26, -0.535, 0.001] as Vec3, axis: "z" as const },
  roll: { c: [0.829, -0.6, 0] as Vec3, axis: "x" as const },
  yaw: { c: [-0.92, YAW_SERVO_Y, -0.001] as Vec3, axis: "z" as const },
};
/** Actuator connector and mounting face anchors, from the retained body dimensions. */
export const SERVO_BODIES = {
  pitch: { c: [0.26, -0.51, 0.07] as Vec3, size: [0.08, 0.07, 0.12] as Vec3 },
  roll: { c: [0.76, -0.6, 0] as Vec3, size: [0.12, 0.06, 0.08] as Vec3 },
  yaw: { c: [-0.92, YAW_SERVO_Y, -0.07] as Vec3, size: YAW_SIZE },
};
export const GTA82 = { c: [0.5, -0.47, 0.1] as Vec3, size: [0.14, 0.035, 0.04] as Vec3 };
const FIG_7_20 = "POH Fig 7-20 (7-88)";
(
  [
    [
      "Pitch servo actuator (GSA 81)",
      SERVO_BODIES.pitch.c,
      SERVO_BODIES.pitch.size,
      "elevator",
      `On the centreline at the forward end of the baggage floor (${FIG_7_20} item 17), below the baggage compartment at access panel CF5 (AMM 22-10 PDF p. 554). GSA 81 actuator on a GSM 86 capstan mount, whose slip clutch lets the pilot override it; its bridle cable is clamped to both elevator cables (AMM 22-10 PDF pp. 555, 579). 5 A AP SERVOS breaker, MAIN BUS 1 (AMM 22-10). Position approximate.`,
    ],
    [
      "Roll servo actuator (GSA 81)",
      SERVO_BODIES.roll.c,
      SERVO_BODIES.roll.size,
      "aileron",
      `On the centreline just aft of the front seats (${FIG_7_20} item 14), below the passenger seat at access panel CF4C (AMM 22-10 PDF p. 555). GSA 81 actuator on a GSM 86 capstan mount, whose slip clutch lets the pilot override it; its bridle cable is clamped to the LH and RH aileron cables (AMM 22-10 PDF p. 589). 5 A AP SERVOS breaker, MAIN BUS 1 (AMM 22-10). Position approximate.`,
    ],
    [
      "Yaw servo actuator (GSA 80)",
      SERVO_BODIES.yaw.c,
      SERVO_BODIES.yaw.size,
      "rudder",
      `Yaw damper servo aft of the FS 222 bulkhead, just left of the centreline between Battery 2 and the ELT (${FIG_7_20} item 23); in the empennage avionics bay, reached through access panel RE3 "Avionics Bay" (AMM 22-10 PDF p. 556; Fig 6-00-8 PDF p. 125). GSA 80 actuator on a GSM 86 capstan mount with slip clutch; its bridle cable is clamped to the rudder cables (AMM 22-10 PDF p. 598). Height above the Battery 2 shelf follows the lead ruling: AMM Fig 22-10-6 sheet 3 (PDF p. 606), rather than the previous illustrative height. Optional on the SR22T; installed on this airplane. 3 A YAW SERVO breaker, MAIN BUS 3 (AMM 22-10). Position approximate.`,
    ],
    [
      "Pitch trim adapter",
      GTA82.c,
      GTA82.size,
      "elevator",
      `GTA 82, right of the centreline at the aft edge of the rear-seat bay (${FIG_7_20} item 16); the AMM says below the passenger seat (AMM 22-10 PDF p. 554), bolted to the RH aft longeron behind access panels CF4C and CF4R (AMM 22-10 PDF p. 571), and the POH figure governs. Takes input from the trim switches, Integrated Avionics Units and the pitch servo to allow the GFC 700 to drive the pitch servo; yoke trim commands are routed through it when the autopilot is disconnected. 2 A PITCH TRIM breaker, ESS BUS 2 (AMM 22-10). Position approximate.`,
    ],
  ] as [string, Vec3, Vec3, "elevator" | "aileron" | "rudder", string][]
).forEach(([name, pos, size, chan, note]) =>
  part(
    () => {
      if (name === "Pitch trim adapter") return box(...size);
      // Reserve 6 mm of the previous output-face envelope for the GSM 86 mounting flange. Anchor positions are unchanged.
      const axis = name.startsWith("Roll") ? 0 : 2;
      const dimensions = [...size] as Vec3;
      dimensions[axis] -= SERVO_OUTPUT_FACE;
      const g = box(...dimensions),
        offset: Vec3 = [0, 0, 0];
      offset[axis] = ((name.startsWith("Pitch") ? 1 : -1) * SERVO_OUTPUT_FACE) / 2;
      return g.translate(...offset);
    },
    ["controls"],
    { chan: [chan], pos, color: SERVO, name, note, pin: true },
  ),
);
