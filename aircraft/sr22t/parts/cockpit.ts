/**
 * Centre panel and console controls.
 * May import anchors only from earlier sections:
 * catalogue.ts, airframe.ts, surfaces.ts, cowl.ts, gear.ts, engine.ts, engine-ignition.ts, engine-oil.ts, engine-air.ts, engine-sensors.ts, structure.ts, cabin.ts.
 * Side-effect-free helpers may come from ../geometry, ../model and ../rig.
 * Shared constants belong in catalogue.ts; later sections must never be imported here.
 *
 * Units from the POH 13772-007 Figure 7-4 (2 of 2) audit (7-15) that no other system file owns: magnetic compass, ADF, flap
 * panel and position lights, power and mixture levers, friction wheel, 12 V outlet, USB ports, audio input and passenger
 * audio jacks. The CAPS activation handle cover (item 1) lives in cabin.ts. The POH and AMM give no dimensions for any of them, so every size and position here is
 * approximate.
 */
import * as THREE from "three";
import { mergeGeos } from "@/lib/geometry";
import { mats } from "@/lib/materials";
import type { Vec3 } from "@/lib/math";
import { box, cyl, topY } from "../geometry";
import { flapPositionLit, live } from "../model";
import { useSR22T } from "../store";
import { STACK } from "./cabin";
import { CONSOLE_QUADRANT, part } from "./catalogue";

/** Headliner surface below the outer skin on the centreline, for the compass; oxygen.ts uses its own 40 mm inset. */
const HEADLINER = 0.07;
const ceiling = (x: number) => topY(x) - HEADLINER;
const SR = () => useSR22T.getState().s;

/* ---------- ceiling: magnetic compass ---------- */
// Fig 7-4 (2 of 2) item 1, the CAPS activation handle cover and its black forward tab, lives in cabin.ts.
// POH 7-22: on the headliner immediately above the windshield, whose top edge meets the roof at x 1.73 (geometry.ts WIN);
// on the centreline at the top of Fig 7-4 (item 2).
const COMPASS: Vec3 = [1.69, ceiling(1.69) - 0.03, 0];
part(() => mergeGeos([box(0.05, 0.05, 0.07), cyl(0.024, 0.06, "z").translate(-0.03, -0.005, 0)]), ["cabin"], {
  pos: COMPASS,
  color: "#20262B",
  name: "Magnetic compass",
  pin: true,
  pinIn: ["cabin"],
  note: "Conventional, internally lighted, liquid-filled magnetic compass on the cabin headliner immediately above the windshield, with its correction card (POH 13772-007 7-22; Fig 7-4 (2 of 2) item 2, 7-15). Size approximate.",
});

/* ---------- RH bolster: ADF ---------- */
// AMM 34-50 PDF p. 1723: KR 87 in the co-pilot side bolster panel for 22T-1460 … 22T-9749 (the modelled airplane is in range); Fig 7-4
// (2 of 2) item 7 puts it on the RH bolster, mirroring the MD302 on the LH bolster's aft face (x 2.18), outboard of the
// inboard bolster eyeball outlet (environment.ts, z 0.14; Fig 7-4 item 4).
part(() => box(0.012, 0.05, 0.16), ["cabin"], {
  pos: [2.174, -0.07, 0.26],
  color: "#20262B",
  name: "ADF (optional)",
  pin: true,
  pinIn: ["cabin"],
  note: "Honeywell KR 87 ADF, optional: digitally tuned receiver for 200–1799 kHz bearings and AM audio, in the co-pilot side bolster panel for serials 22T-1460, 22T-1471, 22T-1473 thru 22T-9749; antenna on the belly. 3 A DME / ADF breaker on the Avionics Bus (AMM 13773-002 Rev 7 34-50, PDF p. 1723; POH 13772-007 Fig 7-4 (2 of 2) item 7, 7-15; DME/ADF breaker on AVIONICS, POH 7-85). Installation on the modelled airplane unconfirmed; face size approximate.",
});

/* ---------- flap panel: bezel and position lights ---------- */
// AMM Fig 27-50-3 Flap Switch Panel Installation (PDF p. 1065; 22T-1460, 22T-1471, 22T-1473 thru 22T-9749): one panel face
// carries the airfoil knob with the UP, 50% and 100% indicator positions in a column along its RIGHT side, UP at the top
// (POH 7-23: a light at each switch position). The bezel surrounds the knob (cabin.ts "FLAPS switch" at
// STACK.at(0.08, 0.02, 0.04), 0.04 × 0.07, not moved) through an opening, with the lights to its right. In the slope frame:
// t up the slope from FLAP_T, z across. The oxygen display in the same integrated panel is modelled in oxygen.ts.
const FLAP_T = 0.08;
/** Flap panel face (slope frame, relative to FLAP_T): outline and the knob opening, each [t0, t1, z0, z1]. */
const FLAP_FACE = { outer: [-0.035, 0.035, -0.005, 0.09], opening: [-0.021, 0.021, 0.004, 0.076] } as const;
/** Lights' column across the slope, right of the knob (knob z 0.005 … 0.075). */
const FLAP_LIGHT_Z = 0.083;
/** Bezel plate 4 mm thick on the slope, drawn in the part frame (x = off the slope, y = up the slope, z = across). */
function flapFaceGeo() {
  const rect = (path: THREE.Path, [t0, t1, z0, z1]: readonly number[]) => {
    // shape coordinates (−z, t) so that after rotateY(π/2) shape x lands on +z
    path.moveTo(-z0, t0);
    path.lineTo(-z1, t0);
    path.lineTo(-z1, t1);
    path.lineTo(-z0, t1);
    path.closePath();
  };
  const shape = new THREE.Shape();
  rect(shape, FLAP_FACE.outer);
  const hole = new THREE.Path();
  rect(hole, FLAP_FACE.opening);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false });
  g.translate(0, 0, -0.002);
  g.rotateY(Math.PI / 2);
  return g;
}
part(flapFaceGeo, ["flaps"], {
  pos: STACK.at(FLAP_T, 0.002, 0),
  rot: STACK.rot,
  color: "#20262B",
  name: "Flap panel",
  note: "Flap switch panel at the foot of the console's vertical section: the airfoil FLAPS knob with the UP, 50% and 100% position lights in a column on its right (POH 13772-007 7-23; Fig 7-4 (2 of 2) item 10, 7-15; AMM 13773-002 Rev 7 Fig 27-50-3, PDF p. 1065). Size approximate.",
});
(
  [
    [0, 0.02, "#3FBF5F", "UP (0%)"],
    [50, 0, "#F2C230", "50%"],
    [100, -0.02, "#F2C230", "100%"],
  ] as [0 | 50 | 100, number, string, string][]
).forEach(([pos, dt, color, label], i) =>
  part(() => cyl(0.0045, 0.006, "x", 12), ["flaps"], {
    pos: STACK.at(FLAP_T + dt, 0.007, FLAP_LIGHT_Z),
    rot: STACK.rot,
    color,
    anim: (m) => {
      const { s, E } = useSR22T.getState();
      const lit = s.flaps.cmd === pos && flapPositionLit(pos, live.flapAng, E.flapsPwr);
      m.material = lit ? mats(color).hi : mats("#3A3F44").on;
    },
    name: "Flap position light",
    pin: i === 0,
    pinIn: ["flaps"],
    note: `${label} light (${i === 0 ? "green" : "yellow"}), right of the knob at its detent: comes on when the flaps reach the selected position (POH 13772-007 7-23; Fig 7-4 (2 of 2) item 10, 7-15; AMM 13773-002 Rev 7 Fig 27-50-3, PDF p. 1065). Powered with the switch and actuator through the 10 A FLAPS breaker on NON ESS BUS.`,
  }),
);

/* ---------- engine controls ---------- */
// POH 7-32, Fig 7-7 (7-34) items 8–10: power lever, FRICTION wheel on the right side of the console, mixture lever. The
// levers pivot at CONSOLE_QUADRANT, where the throttle and mixture cables start (engine-air.ts); forward is MAX / RICH.
// Lever travel is illustrative: the POH gives no angles.
const LEVER_SWING = 0.35;
/** Lever pitch for a control position 0 (aft: IDLE / CUTOFF) … 1 (forward: MAX / RICH); negative leans forward (+x). */
const leverPitch = (v: number) => LEVER_SWING * (1 - 2 * v);
/** Lever in its pivot frame: a shaft from just above the console top (y −0.27, cabin.ts) to the grip. */
const leverGeo = (grip: THREE.BufferGeometry) =>
  mergeGeos([box(0.012, 0.13, 0.01).translate(0, 0.125, 0), grip.translate(0, 0.2, 0)]);
(
  [
    [
      -0.035,
      "Power lever",
      "#20262B",
      box(0.03, 0.03, 0.05),
      () => SR().eng.lever,
      "Single-lever power (throttle) control, labelled MAX-POWER-IDLE: cable-linked to the throttle body / fuel-metering valve; toward MAX opens the throttle and meters more fuel. No propeller control; the governor holds 2500 RPM (POH 13772-007 7-32; Fig 7-7 item 8, 7-34; Fig 7-4 (2 of 2) item 13, 7-15).",
    ],
    [
      0.04,
      "Mixture lever",
      "#C8313B",
      cyl(0.014, 0.02, "z", 16),
      () => SR().eng.mix,
      "Mixture control lever, labelled RICH-MIXTURE-CUTOFF: cable-linked to the mixture valve in the engine-driven fuel pump; forward enriches, full aft (CUTOFF) closes the valve (POH 13772-007 7-32; Fig 7-7 item 10, 7-34; Fig 7-4 (2 of 2) item 13, 7-15).",
    ],
  ] as [number, string, string, THREE.BufferGeometry, () => number, string][]
).forEach(([dz, name, color, grip, value, note]) =>
  part(() => leverGeo(grip.clone()), ["engine", "cabin"], {
    pos: [CONSOLE_QUADRANT[0], CONSOLE_QUADRANT[1], CONSOLE_QUADRANT[2] + dz],
    color,
    anim: (m) => {
      m.rotation.z = leverPitch(value());
    },
    name,
    pin: true,
    pinIn: ["engine"],
    note: note + " Travel and size illustrative.",
  }),
);
// Right side face of the console box (cabin.ts: z 0.13), level with the lever pivot.
part(() => cyl(0.025, 0.012, "z", 24), ["engine", "cabin"], {
  pos: [CONSOLE_QUADRANT[0], CONSOLE_QUADRANT[1] + 0.01, 0.136],
  color: "#4A535B",
  name: "Friction control wheel",
  pin: true,
  pinIn: ["engine"],
  note: "Wheel labelled FRICTION on the right side of the console: sets the levers' resistance to rotation for feel and setting stability (POH 13772-007 7-13, 7-32; Fig 7-7 item 9, 7-34; Fig 7-4 (2 of 2) item 13, 7-15). Size approximate.",
});

/* ---------- console outlets and jacks ---------- */
// POH 7-13: the accessory outlet and audio jacks are in the console armrest; 7-94: two USB ports near the 12 V outlet, two
// on the aft console; 7-90: AUDIO INPUT near the outlet. Front group on the armrest's forward face (cabin.ts: x 1.56,
// y −0.265 … −0.215), rear group on the console's aft face (x 1.18), outboard of the fuel selector valve enclosure
// (fuel.ts, |z| ≤ 0.09).
const ARM_FWD = 1.56,
  CONSOLE_AFT = 1.18,
  ARM_Y = -0.24;
const USB =
  "USB high-power charging port: charging only, no data or audio; 12V & USB POWER, 5 A on MAIN BUS 3 (POH 13772-007 7-94).";
part(() => cyl(0.011, 0.01, "x", 20), ["electrical", "cabin"], {
  pos: [ARM_FWD + 0.005, ARM_Y, 0],
  color: "#15181B",
  name: "12 V convenience outlet",
  pin: true,
  pinIn: ["cabin"],
  note: '12-volt outlet for a standard cigarette-lighter plug; draw must not exceed 3.5 A. 5 A 12V & USB POWER breaker on MAIN BUS 3 (POH 13772-007 7-94; 7-13 puts it in the console armrest; Fig 7-4 (2 of 2) console inset "USB POWER … AUDIO INPUT", 7-15). Position approximate.',
});
[-1, 1].forEach((s, i) =>
  part(() => box(0.008, 0.008, 0.014), ["electrical", "cabin"], {
    pos: [ARM_FWD + 0.004, ARM_Y, s * 0.028],
    color: "#15181B",
    name: "USB charging port (front)",
    pin: i === 0,
    pinIn: ["cabin"],
    note:
      USB +
      " One of the two near the 12 V outlet, for the pilot and front passenger; label 5 VDC, 2.1 AMPS MAX PER PORT (Fig 7-4 (2 of 2), 7-15).",
  }),
);
part(() => cyl(0.004, 0.008, "x", 12), ["cabin"], {
  pos: [ARM_FWD + 0.004, ARM_Y, 0.046],
  color: "#15181B",
  name: "AUDIO INPUT jack",
  pin: true,
  pinIn: ["cabin"],
  note: 'Single 3.5 mm AUDIO INPUT jack on the centre console near the convenience outlet, for a personal entertainment device; distributed through MUS 1 on the audio panel (POH 13772-007 7-90; Fig 7-4 (2 of 2) console inset "AUDIO INPUT", 7-15). Position approximate.',
});
[-1, 1].forEach((s, i) =>
  part(() => box(0.008, 0.008, 0.014), ["electrical", "cabin"], {
    pos: [CONSOLE_AFT - 0.004, -0.31, s * 0.11],
    color: "#15181B",
    name: "USB charging port (rear)",
    pin: i === 0,
    pinIn: ["cabin"],
    note:
      USB +
      " One of the two on the aft portion of the centre console, for the rear passengers (Fig 7-4 (2 of 2) item 12, 7-15; Fig 7-20 item 12, 7-88).",
  }),
);
[-1, 1].forEach((s, i) =>
  part(() => cyl(0.0045, 0.008, "x", 12), ["cabin"], {
    pos: [CONSOLE_AFT - 0.004, -0.35, s * 0.11],
    color: "#15181B",
    name: "Passenger audio jacks (if equipped)",
    pin: i === 0,
    pinIn: ["cabin"],
    note: "Rear-seat headset jacks on the aft console, if equipped (POH 13772-007 Fig 7-4 (2 of 2) item 12, 7-15; Fig 7-20 item 12, 7-88). Rear headsets have no COM transmit (POH 7-90). Position approximate.",
  }),
);
