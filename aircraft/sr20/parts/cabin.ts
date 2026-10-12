/**
 * Cockpit and cabin: instrument panel and glareshield, bolster switches, ignition switch, console, seats, side yokes,
 * trim cartridges, flap drive and switch, fuel selector and boost pump switch, CAPS handle, fire extinguisher, armrest,
 * ELT and ALT AIR knob.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeos, roundEnds, sweepGeo } from "@/lib/geometry";
import { clamp, ease, type Vec3 } from "@/lib/math";
import { box, cyl, sectionSlab, tubeGeo } from "../geometry";
import { useSR20 } from "../store";
import { live } from "../model";
import { part, selPtrAnim } from "./catalogue";

/* ---------- cockpit / cabin ---------- */
part(() => sectionSlab(2.3, -0.18, 0.3, 0.97, 0.04, 2.32), ["avionics", "cabin"], {
  color: "#2B3238",
  name: "Instrument panel",
  note: "All-metal sectional panel under a composite glareshield.",
});
part(() => sectionSlab(2.24, 0.3, 0.35, 0.95, 0.2, 2.36), ["cabin"], {
  color: "#2B3238",
  name: "Glareshield",
  note: "Projects over the panel; windshield diffuser outlet runs along its base.",
});
/** Prism: a profile in the x–y plane (side view) extruded across z0…z1. */
function prism(pts: [number, number][], z0: number, z1: number) {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), {
    depth: z1 - z0,
    bevelEnabled: false,
  });
  g.translate(0, 0, z0);
  return g;
}
/**
 * Sloped face seen from the side, from its lower aft edge a up to its upper forward edge b. `at(t, out, z)` is the point t up
 * the slope and `out` off it into the cabin; `rot` turns a part drawn facing aft (−x) to face out of the slope.
 */
function slope(a: [number, number], b: [number, number]) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]),
    dx = (b[0] - a[0]) / L,
    dy = (b[1] - a[1]) / L;
  const tilt = Math.atan2(-dx, dy);
  return {
    at: (t: number, out: number, z: number): Vec3 => [a[0] + dx * t - dy * out, a[1] + dy * t + dx * out, z],
    tilt,
    rot: [0, 0, tilt] as Vec3,
  };
}
// POH Fig. 7-4: the bolster runs between the yokes directly under the displays, about 10 cm deep. Its flat top carries the switch
// strip, facing up at the pilot; the MD302 is on its aft face. The avionics stack of the centre console (item 15) leans back from
// the displays down to the console between the bolster halves.
const BOLSTER_TOP = slope([2.18, -0.005], [2.28, -0.005]);
// Separate bolster halves leave the centre-console avionics stack unobstructed (POH Fig. 7-4).
part(
  () => mergeGeos([-1, 1].map((s) => box(0.1, 0.145, 0.305).translate(0, 0, s * 0.2475))),
  ["cabin", "lighting", "electrical"],
  {
    pos: [2.23, -0.0775, 0],
    color: "#39424A",
    name: "Bolster switch panel",
    note: "Below the PFD (POH Fig. 7-4 item 18, Fig. 7-12): a placard, then MASTER (BAT 2, BAT 1, ALT 1, ALT 2, AVIONICS) and EXTERIOR LIGHTS (NAV, STROBE, LAND), PITOT HEAT, the ICE PROTECT positions (blank without FIKI), and the PANEL and INSTRUMENT dimmers at the right end. The MD302 standby is below the switches, under the PFD.",
  },
);
/**
 * Bolster switch strip under the PFD, laid out from POH Fig. 7-12: the strip spans the PFD's width (z −0.385 … −0.10) and
 * `slot` maps the figure's horizontal position (its pixel column, strip 205–625) onto it. The rockers sit close together,
 * five MASTER then the EXTERIOR LIGHTS; PITOT HEAT and the ICE PROTECT positions follow after a gap. Up = ON.
 */
const slot = (px: number) => -0.385 + (px - 205) * (0.285 / 420);
/** Point on the bolster top at the strip's centre line (dt up the slope), `out` off its surface. */
const onStrip = (z: number, out: number, dt = 0) => BOLSTER_TOP.at(0.05 + dt, out, z);
const SR = () => useSR20.getState().s;
part(() => box(0.004, 0.048, 0.285), ["cabin", "lighting", "electrical"], {
  pos: onStrip(slot(415), 0.001),
  rot: BOLSTER_TOP.rot,
  color: "#20262B",
});
part(() => box(0.003, 0.03, 0.06), ["cabin"], {
  pos: onStrip(slot(255), 0.004),
  rot: BOLSTER_TOP.rot,
  color: "#9AA3AA",
});
(
  [
    [312, "BAT 2", "Battery 2 relay: BAT 2 feeds ESS BUS 1 and charges from it.", () => SR().elec.bat2],
    [
      329,
      "BAT 1",
      "Battery 1 relay: BAT 1 on the Main Dist Bus 1 side, for starting; ALT 1 needs it on.",
      () => SR().elec.bat1,
    ],
    [346, "ALT 1", "Alternator 1 field; needs BAT 1 on.", () => SR().elec.alt1],
    [363, "ALT 2", "Alternator 2 field.", () => SR().elec.alt2],
    [380, "AVIONICS", "AVIONICS bus.", () => SR().elec.avionics],
    [397, "NAV", "Wingtip position and aft position lights.", () => SR().lights.nav],
    [414, "STROBE", "Wingtip anti-collision strobes.", () => SR().lights.strobe],
    [431, "LAND", "Both wingtip landing lights.", () => SR().lights.land],
    [
      448,
      "ICE",
      "Wing ice inspection lights. Fig. 7-12 shows only NAV, STROBE and LAND (exterior lighting is in the Spectra wing tip light supplement): shown after LAND, position approximate.",
      () => SR().lights.ice,
    ],
    [470, "PITOT HEAT", "Heated pitot tube; a current sensor drives PITOT HEAT FAIL.", () => SR().pitot.heat],
  ] as [number, string, string, () => boolean][]
).forEach(([px, label, note, on]) =>
  part(() => box(0.01, 0.02, 0.0095), ["electrical", "lighting"], {
    pos: onStrip(slot(px), 0.007),
    rot: BOLSTER_TOP.rot,
    color: "#D8DDE0",
    anim: (m) => {
      m.rotation.z = BOLSTER_TOP.tilt + (on() ? -0.3 : 0.3);
    },
    name: label + " switch",
    note: note + " Bolster switch panel (POH Fig. 7-12), up = ON.",
  }),
);
// ICE PROTECT positions (blank on a non-FIKI airplane) and the wider blank slot before the dimmers
(
  [
    [495, 0.0095],
    [512, 0.0095],
    [537, 0.02],
  ] as [number, number][]
).forEach(([px, w]) =>
  part(() => box(0.004, 0.02, w), ["cabin"], { pos: onStrip(slot(px), 0.004), rot: BOLSTER_TOP.rot, color: "#3A4148" }),
);
(
  [
    [0.012, "PANEL dimmer"],
    [-0.012, "INSTRUMENT dimmer"],
  ] as [number, string][]
).forEach(([dt, name]) =>
  part(() => cyl(0.008, 0.014, "x", 16), ["lighting"], {
    pos: onStrip(slot(588), 0.008, dt),
    rot: BOLSTER_TOP.rot,
    color: "#20262B",
    name,
    note: "Right end of the bolster switch panel: PANEL forward, INSTRUMENT aft of it (POH Fig. 7-12).",
  }),
);
// POH 7-13, Fig. 7-4 item 19: left side of the instrument panel, outboard of the PFD; above the yoke tube here (height approximate)
part(() => cyl(0.016, 0.01, "x"), ["engine", "electrical"], { pos: [2.276, 0.03, -0.47], color: "#3E4A52" });
part(() => box(0.012, 0.03, 0.008), ["engine", "electrical"], {
  pos: [2.266, 0.03, -0.47],
  color: "#C9D0D5",
  anim: (m) => {
    m.rotation.x = ({ OFF: -1, R: -0.5, L: 0, BOTH: 0.5, START: 1 } as const)[SR().eng.key];
  },
  name: "Ignition key switch",
  pin: true,
  pinIn: ["engine"],
  note: "Keyed rotary switch on the left side of the instrument panel, outboard of the PFD: OFF – R – L – BOTH – START, spring-loaded from START to BOTH (POH 7-13, Fig. 7-4 item 19).",
});
part(() => box(0.9, 0.26, 0.26), ["cabin"], {
  pos: [1.63, -0.4, 0],
  color: "#39424A",
  name: "Center console",
  note: "Horizontal section between the seats: power and mixture levers, fuel selector, armrest; breakers, ALT AIR, ELT switch and alternate static on its left side. The avionics stack and flap switch are on its sloping front section.",
});
// front section of the console (Fig. 7-4 item 15, POH 7-13, 7-76), leaning back from the displays down to the console top; top to
// bottom: GCU 479 FMS keyboard, GMC 707 autopilot mode controller, GMA 350 audio panel, then the flap control at its foot (order
// from Fig. 7-4; slope and heights approximate)
export const STACK = slope([2.0, -0.27], [2.22, -0.005]);
part(
  () =>
    prism(
      [
        [2.0, -0.27],
        [2.22, -0.005],
        [2.28, -0.005],
        [2.28, -0.53],
        [2.0, -0.53],
      ],
      -0.08,
      0.09,
    ),
  ["cabin", "avionics"],
  {
    color: "#39424A",
    name: "Avionics panel (centre console)",
    note: "Sloping front section of the centre console, rising between the bolster halves to meet the displays: FMS keyboard, autopilot mode controller and audio panel, with the flap control at its foot (POH 7-13, Fig. 7-4 items 10 and 15).",
  },
);
part(() => box(0.4, 0.18, 0.02), ["electrical"], {
  pos: [1.78, -0.4, -0.14],
  color: "#5A4A1C",
  name: "Circuit breaker panel",
  note: "Left side of the center console. Holds ESS 1/2, MAIN 1/2/3, NON ESS, A/C 1/2 and AVIONICS bus breakers.",
  pin: true,
});
for (const [z, name] of [
  [-0.33, "Pilot seat"],
  [0.33, "Front passenger seat"],
] as const) {
  part(() => box(0.48, 0.1, 0.4), ["cabin"], {
    pos: [1.25, -0.4, z],
    color: "#6B5A48",
    name,
    fairing: true,
    pin: true,
    note: "Individually adjustable front seat on upward-angled fore/aft tracks, with an integral aluminum-honeycomb energy-absorption core. Do not kneel or stand on the seat (POH11934-0057-27–28;AMM12137-00225-10p1). Upholstery is translucent in X-ray to expose hardware; dimensions approximate.",
  });
  part(() => box(0.09, 0.58, 0.368), ["cabin"], {
    pos: [0.98, -0.08, z],
    rot: [0, 0, 0.2],
    color: "#6B5A48",
    name,
    fairing: true,
    note: "Reclining front seat back with integral headrest, four-point inflatable restraint and seat-back dual inertia reels. Folds forward for rear-seat access (POH7-28–30;AMM25-10p1). Back angle and dimensions approximate.",
  });
}
part(() => box(0.48, 0.1, 0.98), ["cabin"], {
  pos: [0.35, -0.4, 0],
  color: "#6B5A48",
  name: "Rear seat (2+1 bench)",
  fairing: true,
  pin: true,
  note: "One-piece rear bench in the optional 2+1 configuration; wider LH seat back provides a center seat/restraint area, with 60/40 split seat backs (POH7-29). Three-restraint option shown. Other SR20s have an observer's seat or two rear harnesses (AMM25-10p1). Bench proportions schematic.",
});
for (const [z, w, name] of [
  [-0.196, 0.588, "Rear seat (2+1 bench)"],
  [0.294, 0.392, "Rear seat"],
] as const)
  part(() => box(0.09, 0.58, w * 0.96), ["cabin"], {
    pos: [0.08, -0.08, z],
    rot: [0, 0, 0.2],
    color: "#6B5A48",
    name,
    fairing: true,
    note: "60/40 split rear seat back, independently reclinable and foldable forward for long cargo. Cargo net is not functional with backs folded; use tie-down straps (POH7-27,7-29). Geometry and recline angle approximate.",
  });
export const YOKES = [
  { side: "L", z: -0.46 },
  { side: "R", z: 0.46 },
];
export const YOKE_X = 2.02,
  YOKE_Y = -0.06;
/**
 * Side-yoke grip in its roll group's frame (origin where the yoke tube meets the grip; s −1 left, +1 right): a handle rising
 * up and inboard from the tube end to a head that carries the trim switch (outboard) and the red A/P DISC button (inboard).
 * The POH gives no dimensions: shape and proportions are from photos of the Perspective panel.
 */
const GRIP_LEAN = 37 * (Math.PI / 180);
/** Point in side s's grip frame: xo fore-aft, d along the handle (+ up, toward the head), w across it (+ toward the right wing). */
const onGrip = (s: number, xo: number, d: number, w: number): Vec3 => [
  xo,
  d * Math.cos(GRIP_LEAN) + w * s * Math.sin(GRIP_LEAN),
  -s * d * Math.sin(GRIP_LEAN) + w * Math.cos(GRIP_LEAN),
];
const gripRot = (s: number): Vec3 => [-s * GRIP_LEAN, 0, 0];
const HEAD = { d: 0.114, x: -0.01, l: 0.04 };
function sideYokeGeo(s: number) {
  const handle = sweepGeo(
    [
      onGrip(s, 0.002, -0.05, 0),
      onGrip(s, 0.006, 0, 0),
      onGrip(s, 0.003, 0.05, 0),
      onGrip(s, -0.006, HEAD.d - 0.01, 0),
    ],
    (t) => {
      const e = roundEnds(t, 0.14, 0);
      return [(0.019 + 0.002 * Math.sin(Math.PI * t)) * e, 0.017 * e];
    },
  );
  const head = new RoundedBoxGeometry(0.054, HEAD.l, 0.048, 3, 0.013);
  head.rotateX(gripRot(s)[0]);
  head.translate(...onGrip(s, HEAD.x, HEAD.d, 0));
  const boss = cyl(0.022, 0.036, "x");
  boss.translate(0.016, 0, 0);
  return mergeGeos([handle, head, boss]);
}
YOKES.forEach(({ side }) => {
  const s = side === "L" ? -1 : 1,
    grip = "grip:" + side,
    top = HEAD.d + HEAD.l / 2;
  part(() => cyl(0.018, 0.5, "x"), ["controls"], {
    parent: "yoke:" + side,
    chan: ["elevator", "aileron"],
    pos: [0.27, 0, 0],
    color: "#555E66",
    name: "Yoke tube",
    note: "Slides fore/aft in its bearing carriage for pitch (driving the elevator drop link) and rotates the carriage for roll.",
  });
  part(() => sideYokeGeo(s), ["controls"], {
    parent: grip,
    chan: ["elevator", "aileron"],
    color: "#20262B",
    name: "Side yoke",
    note: "Single-handed grip on the end of each yoke tube, angled up and inboard. Push or pull to slide the tube for pitch; rotate the grip to turn the tube and its bearing carriage for roll. Conical trim switch and red A/P DISC button on the head; PTT switch for COM.",
  });
  part(
    () => {
      const g = new THREE.CylinderGeometry(0.004, 0.008, 0.012, 16);
      g.translate(0, 0.006, 0);
      return g;
    },
    ["controls"],
    {
      parent: grip,
      chan: ["elevator", "aileron"],
      pos: onGrip(s, HEAD.x - 0.004, top, s * 0.01),
      rot: gripRot(s),
      color: "#4A535B",
      name: "Trim switch",
      note: "Conical switch on the head of each yoke: fore/aft = pitch trim, left/right = roll trim. The trim motors move the spring cartridges' neutral point (PITCH TRIM and ROLL TRIM breakers, ESS BUS 2).",
    },
  );
  part(() => cyl(0.0065, 0.006), ["controls"], {
    parent: grip,
    chan: ["elevator", "aileron"],
    pos: onGrip(s, HEAD.x + 0.004, top + 0.002, -s * 0.011),
    rot: gripRot(s),
    color: "#C8313B",
    name: "A/P DISC button",
    note: "Red autopilot disconnect button on the head of each yoke: disengages the GFC 700.",
  });
});
export const FT = { x: 0.66, y: -0.54 };
// POH 7-23: at the bottom of the console's vertical section. Fig. 7-4 (7-14/7-15) item 10 is the panel between the avionics panel
// (15) and the engine controls (13), knob on its right: here at the foot of the upright avionics panel, right of centre.
part(() => box(0.04, 0.04, 0.07), ["flaps"], {
  pos: STACK.at(0.08, 0.02, 0.04),
  rot: STACK.rot,
  color: "#7C57CF",
  name: "FLAPS switch",
  pin: true,
  note: "Airfoil-shaped knob at the bottom of the console's vertical section, with detents at UP (0%), 50% and 100%; VFE is marked at 50% and 100%. A light at each position comes on when the flaps reach it: UP green, 50% and 100% yellow (POH 7-23, Fig. 7-4 item 10). Position in the model is approximate.",
});
part(() => cyl(0.045, 0.03, "y"), ["fuel"], {
  pos: [1.24, -0.25, 0],
  name: "Fuel selector valve",
  note: "LEFT / RIGHT / OFF at the rear of the console. Lift the release to select OFF.",
  pin: true,
});
part(() => box(0.09, 0.02, 0.02), ["fuel"], { pos: [1.24, -0.23, 0], color: "#F2F5F7", anim: selPtrAnim });
part(() => box(0.04, 0.03, 0.04), ["fuel"], {
  pos: [1.34, -0.26, 0.08],
  name: "BOOST PUMP switch",
  note: "Next to the selector. On for takeoff, climb, maneuvering, landing and tank switching.",
});
/** Horizontal stowed handle above the front-seat shoulder/back reference (POH 7-98).
 * Longitudinal station 1.04 and all recess dimensions are illustrative, not surveyed installation dimensions. */
export const CAPS_HANDLE_POS: Vec3 = [1.04, 0.63, 0];
export const CAPS_HANDLE_ATTACH: Vec3 = [CAPS_HANDLE_POS[0] - 0.045, CAPS_HANDLE_POS[1] + 0.012, 0];
/** Slack take-up is shown as a five-centimeter downward handle movement; timing is illustrative. */
export const capsHandleDrop = (t: number) => (t < 0 ? 0 : 0.05 * ease(clamp(t / 0.15, 0, 1)));
part(
  () =>
    mergeGeos([cyl(0.012, 0.09, "x", 20).translate(-0.0125, 0, 0), cyl(0.012, 0.15, "z", 20).translate(0.045, 0, 0)]),
  ["caps", "cabin"],
  {
    pos: CAPS_HANDLE_POS,
    color: "#D32640",
    name: "CAPS activation T-handle",
    pin: true,
    anim: (m) => {
      m.position.y = CAPS_HANDLE_POS[1] - capsHandleDrop(live.capsT);
    },
    note: "Ceiling centerline above the pilot's right shoulder; retained in its receptacle by an O-ring. Remove the placarded hook-and-loop cover using its black forward tab; take out approximately 2 in. (5 cm) cable slack, then pull straight downward with both hands and steady continuous force. Up to 45 lb (20.4 kg), or greater, may be required to arm and release the electronic igniter switch plunger (POH 11934-005 7-98). Longitudinal station follows the model's front-seat shoulder reference; horizontal stowed orientation, position, geometry and animation timing illustrative.",
  },
);
part(
  () =>
    mergeGeos([
      box(0.188, 0.03, 0.016).translate(0, 0, -0.096),
      box(0.188, 0.03, 0.016).translate(0, 0, 0.096),
      box(0.016, 0.03, 0.176).translate(-0.086, 0, 0),
      box(0.016, 0.03, 0.176).translate(0.086, 0, 0),
    ]),
  ["caps", "cabin"],
  {
    pos: CAPS_HANDLE_POS,
    color: "#4A535B",
    name: "CAPS handle receptacle",
    pin: true,
    pinIn: ["caps"],
    note: "Overhead handle retainer/receptacle, with the O-ring retaining the handle and provisions for the maintenance safety pin (POH 7-98–99). Open rim exposes the handle in X-ray. Dimensions and placement approximate.",
  },
);
part(() => box(0.18, 0.006, 0.21), ["caps", "cabin"], {
  pos: [CAPS_HANDLE_POS[0], 0.612, 0],
  color: "#D32640",
  name: "CAPS activation handle cover",
  pin: true,
  anim: (m) => {
    m.visible = live.capsT < 0;
  },
  note: "Placarded cover retained by hook-and-loop fasteners, preventing tampering with the activation handle (POH 7-98). Removed before the handle is pulled; hidden during the deployment sequence. Size approximate.",
});
part(() => box(0.03, 0.004, 0.025), ["caps", "cabin"], {
  pos: [CAPS_HANDLE_POS[0] + 0.1, 0.607, 0],
  color: "#151515",
  name: "CAPS cover black forward tab",
  pin: true,
  pinIn: ["caps"],
  anim: (m) => {
    m.visible = live.capsT < 0;
  },
  note: "Black tab on the forward edge of the activation-handle cover (POH 7-98). Pulling it removes the cover. Size approximate.",
});
part(() => cyl(0.04, 0.24), ["cabin"], {
  pos: [2.18, -0.45, -0.44],
  color: "#D32640",
  name: "Fire extinguisher",
  note: "Halon 1211, class B & C. Forward outboard in the pilot footwell. About 2.5 lb; check gauge/pin preflight. Case dimensions and mounting coordinates are approximate.",
  pin: true,
});
part(() => box(0.22, 0.05, 0.12), ["cabin"], {
  pos: [1.45, -0.24, 0],
  color: "#8A6A3A",
  name: "Armrest: egress hammer & hour meters",
  note: "8 oz ball-peen hammer for breaking the acrylic windows. HOBBS runs with BAT 1 + either ALT on; FLIGHT starts ~35 KIAS.",
  pin: true,
});
part(() => box(0.16, 0.09, 0.11), ["cabin", "caps"], {
  pos: [-0.8, -0.28, 0.13],
  color: "#EB7A12",
  name: "ELT — Artex ELT 1000",
  note: "406 MHz + 121.5 MHz. Triggers at 4–5 ft/s longitudinal Δv or on CAPS deployment. Removable for portable use.",
  pin: true,
});
// both stand proud of the circuit breaker panel face (z −0.15) on the left side of the console
part(() => box(0.05, 0.04, 0.02), ["cabin"], {
  pos: [1.92, -0.44, -0.161],
  color: "#EB7A12",
  name: "ELT remote switch (RCPI)",
  note: "ON – ARM/OFF – TEST, red LED flashes when transmitting. Below the ALT AIR knob by the pilot's right knee (POH Section 7, ELT Remote Switch and Indicator Panel).",
});
part(() => box(0.05, 0.05, 0.03), ["engine"], {
  pos: [1.92, -0.36, -0.166],
  color: "#E0B040",
  name: "ALT AIR – PULL knob",
  note: "On the left side of the console near the pilot's right knee. Press the lock button, pull, release: opens the alternate air door. Use if induction filter blockage is suspected (POH Section 7, Alternate Air Control).",
});

/** Seat and restraint hardware: POH 7-27–31; AMM 12137-002 25-10 pp. 1, 18–27. */
export const RESTRAINT_EMA: Vec3 = [1.05, -0.61, -0.22];
export const RESTRAINT_INFLATOR = (s: number): Vec3 => [0.91, -0.25, s * 0.33];
for (const side of [-1, 1]) {
  const z = side * 0.33;
  for (const d of [-0.14, 0.14])
    part(() => box(0.64, 0.015, 0.025), ["cabin"], {
      pos: [1.25, -0.482, z + d],
      rot: [0, 0, 0.09],
      color: "#7A858E",
      name: "Front seat track",
      pin: side < 0 && d < 0,
      note: "Two tracks per crew seat, angled upward toward the front so forward adjustment also raises the occupant. The handle below the forward cushion releases the lock pins; verify the seat relocks after adjustment (POH 7-28; AMM 25-10 pp. 3–8). Track dimensions, slope and holes schematic.",
    });
  part(() => box(0.04, 0.025, 0.07), ["cabin"], {
    pos: [1.51, -0.46, z],
    color: "#8B949B",
    name: "Front seat position control",
    pin: side < 0,
    note: "Lift handle below the forward edge of the seat cushion to slide the seat, then release and check locked engagement (POH 7-28). Shown with an illustrative lock-pin carrier; no moving-seat simulation.",
  });
  part(() => box(0.02, 0.05, 0.025), ["cabin"], {
    pos: [0.98, -0.3, z + side * 0.19],
    color: "#42494D",
    name: "Seat recline release lever",
    pin: side < 0,
    note: "Release lever on each side of each front seat back. With the back unloaded, operating the release returns it upright; it also permits folding forward for rear access (POH 7-28). Geometry and lever position approximate.",
  });
  part(() => box(0.32, 0.055, 0.3), ["cabin"], {
    pos: [1.25, -0.435, z],
    color: "#D7B970",
    fairing: true,
    name: "Seat energy-absorption core",
    pin: side < 0,
    note: "Aluminum honeycomb energy-absorption module integral to the seat bottom; designed to crush under downward impact loads. Do not kneel or stand on the seat (POH 7-27; AMM 25-10 p. 1). Core outline and thickness schematic.",
  });
  part(() => mergeGeos([-1, 1].map((d) => cyl(0.022, 0.025, "z").translate(0, 0, d * 0.045))), ["cabin"], {
    pos: [0.935, 0.145, z],
    color: "#717D85",
    name: "Front shoulder-harness inertia reels",
    pin: side < 0,
    note: "Dual inertia-reel retractor mounted in each front seat back. Allows upper-torso movement and locks automatically during sudden deceleration; shoulder harness joins the lap restraint as a four-point system (POH 7-29; AMM 25-10 Fig 25-10-4 sheet 1). Size and position approximate.",
  });
  for (const d of [-1, 1])
    part(
      () =>
        tubeGeo(
          [
            [0.94, 0.15, z + d * 0.055],
            [1.01, 0.19, z + d * 0.1],
            [1.14, -0.02, z + d * 0.07],
            [1.4, -0.28, z],
          ],
          0.009,
        ),
      ["cabin"],
      {
        color: "#454A4D",
        name: "Front inflatable shoulder harness",
        pin: side < 0 && d < 0,
        note: "Inflatable shoulder straps of the four-point front restraint, fed by the inflator hose from the seat-mounted inflator. Airbag inflates in a qualifying crash pulse then deflates for egress (POH 7-29–30; AMM 25-10 pp. 1, 18–21). Webbing path and width illustrative, shown without an occupant.",
      },
    );
  part(() => cyl(0.019, 0.13, "z"), ["cabin"], {
    pos: RESTRAINT_INFLATOR(side),
    color: "#8B9EAA",
    name: "Front seat restraint inflator",
    pin: side < 0,
    note: "Stored-gas inflator clamped to the aft seat frame; receives the crash-sensor signal and feeds the inflatable shoulder harness through a hose (POH 7-30; AMM 25-10 pp. 20–21, Fig 25-10-4 sheet 1). Size and mounting offsets approximate; the study model does not simulate airbag deployment.",
  });
}
part(() => box(0.12, 0.035, 0.09), ["cabin"], {
  pos: RESTRAINT_EMA,
  color: "#C9A755",
  name: "Inflatable restraint electronic module",
  pin: true,
  note: "Below the cabin floor: crash sensor, battery and circuitry evaluate deceleration and signal both front-seat inflators. It has its own battery; independent of aircraft bus power (POH 7-30; AMM 25-10 pp. 1, 18–24). Installation under the LH crew seat is accessible through CF2L. Position and dimensions schematic.",
});
for (const z of [-0.34, -0.04, 0.3]) {
  part(() => cyl(0.025, 0.04, "z"), ["cabin"], {
    pos: [-0.44, 0.14, z],
    color: "#717D85",
    name: "Rear shoulder-harness inertia reel",
    pin: z < -0.3,
    note: "Baggage-compartment rear bulkhead inertia reel feeds a rear three-point harness; lap belts attach to cabin-floor fittings (POH 7-29). Three-harness option shown for the 2+1 bench; the AMM also lists a two-harness standard configuration (AMM 25-10 p. 1). Attachment offsets and reel size schematic.",
  });
  part(() => box(0.035, 0.035, 0.025), ["cabin"], {
    pos: [-0.46, 0.22, z],
    color: "#7A858E",
    name: "Child-seat top tether anchor",
    pin: z < -0.3,
    note: "One of three top-tether anchors on the rear bulkhead for the 2+1 configuration. Route the tether through the seat-back pass-through, never over or around the back (POH 7-31; AMM 25-10 pp. 1–2). Size and spacing approximate.",
  });
}
for (const z of [-0.42, -0.18, 0.18, 0.42])
  part(() => cyl(0.008, 0.05, "z", 12), ["cabin"], {
    pos: [0.11, -0.36, z],
    color: "#7A858E",
    name: "Child-seat lower LATCH anchor",
    pin: z < -0.4,
    note: "Lower anchors in the two outboard rear bench positions accept two LATCH-compliant child seats; the center position instead uses the center seat belt (POH 7-31). Anchor shape and station schematic.",
  });
export const ELT_POS: Vec3 = [-0.8, -0.28, 0.13];
export const ELT_REMOTE: Vec3 = [1.92, -0.44, -0.161];
part(() => box(0.24, 0.012, 0.2), ["cabin", "caps"], {
  pos: [ELT_POS[0], ELT_POS[1] - 0.053, ELT_POS[2]],
  color: "#70828F",
  name: "ELT mounting shelf",
  pin: true,
  pinIn: ["cabin"],
  note: "Immediately aft of the cabin bulkhead, slightly right of centerline. Longitudinal mounting aligns the ELT's deceleration sensor; removable attach straps retain the transmitter (POH 7-92–94; AMM 25-60 p. 1). Geometry approximate.",
});
part(() => cyl(0.018, 0.018, "y"), ["cabin", "caps"], {
  pos: [-0.8, -0.323, -0.005],
  color: "#444B50",
  name: "ELT warning buzzer",
  pin: true,
  pinIn: ["cabin"],
  note: "Shelf-mounted buzzer beeps periodically when the ELT transmits, alongside the remote LED. Powered by the ELT's own batteries (POH 7-92; AMM 25-60 p. 1). Position and size approximate.",
});

for (const z of [-0.34, -0.04, 0.3]) {
  part(
    () =>
      tubeGeo(
        [
          [-0.44, 0.14, z],
          [0.075, 0.16, z + 0.045],
          [0.46, -0.28, z],
        ],
        0.008,
      ),
    ["cabin"],
    {
      color: "#454A4D",
      name: "Rear three-point shoulder restraint",
      pin: z < -0.3,
      note: "Rear shoulder belt from the baggage-compartment bulkhead inertia reel joins the lap belt; lap belts attach to floor fittings. Three-harness 2+1 option shown (POH7-29;AMM25-10p1). Webbing paths illustrative without occupants.",
    },
  );
  part(
    () =>
      tubeGeo(
        [
          [0.33, -0.4, z - 0.12],
          [0.46, -0.28, z],
          [0.33, -0.4, z + 0.12],
        ],
        0.008,
        0,
      ),
    ["cabin"],
    {
      color: "#454A4D",
      name: "Rear lap restraint",
      pin: z < -0.3,
      note: "Rear lap belt anchored to cabin-floor fittings, part of the three-point restraint (POH7-29). Three-restraint 2+1 option shown. Paths and width approximate.",
    },
  );
}
part(
  () =>
    mergeGeos([
      ...[-0.4, -0.2, 0, 0.2, 0.4].map((z) =>
        tubeGeo(
          [
            [-0.43, 0.16, z],
            [0.08, 0.12, z],
          ],
          0.003,
          0,
        ),
      ),
      ...[-0.43, -0.26, -0.09, 0.08].map((x) =>
        tubeGeo(
          [
            [x, 0.14, -0.4],
            [x, 0.14, 0.4],
          ],
          0.003,
          0,
        ),
      ),
    ]),
  ["cabin"],
  {
    color: "#665B46",
    name: "Retractable baggage cargo net",
    pin: true,
    note: "2+1 configuration retractable net extends from inertia reels at the rear bulkhead over baggage and secures to the seat backs with four latch assemblies. It does not function with the rear backs folded forward; then use conventional tie-down straps (POH7-27). Schematic net shape, reel station and mesh spacing.",
  },
);
for (const z of [-0.4, -0.2, 0.2, 0.4])
  part(() => box(0.025, 0.03, 0.025), ["cabin"], {
    pos: [0.08, 0.15, z],
    color: "#818C93",
    name: "Cargo-net seat-back latch",
    pin: z < -0.3,
    note: "One of four cargo-net latch attachments at the rear seat backs (POH7-27). Shape and station schematic.",
  });
