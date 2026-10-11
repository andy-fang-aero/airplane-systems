/**
 * Cockpit and cabin: instrument panel and glareshield, bolster switches, ignition switch, console, seats, side yokes,
 * flap drive and switch, fuel selector and boost pump switch, CAPS handle, fire extinguisher, armrest
 * and ELT.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeos, roundEnds, sweepGeo, tubeGeo } from "@/lib/geometry";
import { clamp, ease, type Vec3 } from "@/lib/math";
import { box, cyl, sectionSlab } from "../geometry";
import { live } from "../model";
import { fsX } from "../rig";
import { useSR22T } from "../store";
import { part, selPtrAnim, IGNITION_SWITCH, ELT_BULKHEAD_PASS } from "./catalogue";
import { glowAnim } from "@/lib/anims";

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
part(() => box(0.1, 0.145, 0.8), ["cabin", "lighting", "electrical"], {
  pos: [2.23, -0.0775, 0],
  color: "#39424A",
  name: "Bolster switch panel",
  note: "Below the PFD (POH Fig. 7-4 item 18, Fig. 7-12): a placard, then MASTER (BAT 2, BAT 1, ALT 1, ALT 2, AVIONICS) and EXTERIOR LIGHTS (NAV, STROBE, LAND), PITOT HEAT, ICE PROTECT switches with FIKI; blank positions without (switch layout awaits the supplement), and the PANEL and INSTRUMENT dimmers at the right end. The MD302 standby is below the switches, under the PFD.",
});
/**
 * Bolster switch strip under the PFD, laid out from POH Fig. 7-12: the strip spans the PFD's width (z −0.385 … −0.10) and
 * `slot` maps the figure's horizontal position (its pixel column, strip 205–625) onto it. The rockers sit close together,
 * five MASTER then the EXTERIOR LIGHTS; PITOT HEAT and the ICE PROTECT positions follow after a gap. Up = ON.
 */
const slot = (px: number) => -0.385 + (px - 205) * (0.285 / 420);
/** Point on the bolster top at the strip's centre line (dt up the slope), `out` off its surface. */
const onStrip = (z: number, out: number, dt = 0) => BOLSTER_TOP.at(0.05 + dt, out, z);
const SR = () => useSR22T.getState().s;
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
    [431, "LAND", "Lower-cowl HID landing light and wingtip recognition lights.", () => SR().lights.land],
    [
      448,
      "ICE",
      "Wing ice inspection lights. The AMM names an ICE LIGHT switch on the bolster panel (AMM 33-40); POH Fig. 7-12 shows only NAV, STROBE and LAND, so it is shown after LAND, position approximate.",
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
// ICE PROTECT positions and the wider slot before the dimmers: blank on a non-FIKI airplane (POH Fig. 7-12 greys them)
const fiki = () => SR().equip.fiki;
(
  [
    [495, 0.0095],
    [512, 0.0095],
    [537, 0.02],
  ] as [number, number][]
).forEach(([px, w]) =>
  part(() => box(0.004, 0.02, w), ["cabin"], {
    pos: onStrip(slot(px), 0.004),
    rot: BOLSTER_TOP.rot,
    color: "#3A4148",
    name: "Blank switch position",
    note: "Blank ICE PROTECT position on an airplane without FIKI (POH Fig. 7-12).",
    fitted: () => !fiki(),
  }),
);
// With FIKI: the ICE PROTECT rockers ON/OFF and HIGH/NORM (POH Fig. 7-12, 7-56); MAX, WINDSHLD and PUMP BKUP are bolster
// switches too (AMM 30-00, PDF 1166), but Fig. 7-12 shows only the greyed wide slot, so they sit there as push buttons,
// position approximate. Hidden with the rest of the TKS hardware without FIKI.
const ICE_NOTE = "ICE PROTECT controls on the bolster switch panel (POH Fig. 7-12; AMM 30-00, PDF 1166–1167).";
(
  [
    [495, "ICE PROTECT switch", "ON / OFF: powers the TKS system, up = ON.", () => SR().ice.on],
    [
      512,
      "ICE PROTECT mode switch",
      "HIGH / NORM: up = HIGH, pump 1 continuous (200 %); NORM cycles both pumps 30 s on, 90 s off (100 %).",
      () => SR().ice.mode === "HIGH",
    ],
  ] as [number, string, string, () => boolean][]
).forEach(([px, name, note, up]) =>
  part(() => box(0.01, 0.02, 0.0095), ["ice"], {
    pos: onStrip(slot(px), 0.007),
    rot: BOLSTER_TOP.rot,
    color: "#D8DDE0",
    anim: (m) => {
      m.visible = fiki();
      m.rotation.z = BOLSTER_TOP.tilt + (up() ? -0.3 : 0.3);
    },
    name,
    note: `${note} ${ICE_NOTE}`,
    fitted: fiki,
  }),
);
(
  [
    [
      -0.0068,
      "MAX switch",
      "Both pumps continuous for 2 minutes (400 %), then the selected mode; lit while running with IPS power.",
      () => SR().ice.maxT > 0,
    ],
    [
      0,
      "WINDSHLD switch",
      "Windshield pump for about 3 seconds; lit while running with IPS power.",
      () => SR().ice.ws > 0,
    ],
    [
      0.0068,
      "PUMP BKUP switch",
      "Bypasses the Timer Box to run pump 2 continuously (200 %); shown pressed in while selected, lit while selected with IPS power.",
      () => SR().ice.bkup,
    ],
  ] as [number, string, string, () => boolean][]
).forEach(([dz, name, note, cmd]) => {
  // the lamp needs both ICE PROTECT feeds, as the ice panel's pump readouts do (E.ipsPwr); the latch is mechanical
  const glow = glowAnim("#D8DDE0", () => useSR22T.getState().E.ipsPwr && cmd(), ["ice"]),
    latch = name === "PUMP BKUP switch";
  part(() => box(0.006, 0.014, 0.006), ["ice"], {
    pos: onStrip(slot(537) + dz, 0.005),
    rot: BOLSTER_TOP.rot,
    color: "#D8DDE0",
    anim: (m) => {
      m.visible = fiki();
      glow(m, 0);
      if (latch) m.position.set(...onStrip(slot(537) + dz, cmd() ? 0.0035 : 0.005));
    },
    name,
    note: `${note} Position in the slot approximate. ${ICE_NOTE}`,
    fitted: fiki,
  });
});
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
part(() => cyl(0.016, 0.01, "x"), ["engine", "electrical"], {
  pos: [2.276, 0.03, -0.47],
  color: "#3E4A52",
  groups: [],
});
part(() => box(0.012, 0.03, 0.008), ["engine", "electrical"], {
  pos: IGNITION_SWITCH,
  color: "#C9D0D5",
  anim: (m) => {
    m.rotation.x = ({ OFF: -1, R: -0.5, L: 0, BOTH: 0.5, START: 1 } as const)[SR().eng.key];
  },
  name: "Ignition key switch",
  pin: true,
  pinIn: ["engine"],
  note: "Keyed rotary switch on the left side of the instrument panel, outboard of the PFD: OFF – R – L – BOTH – START, spring-loaded from START to BOTH (POH 7-14, Fig. 7-4 item 19; POH 7-37). POH 7-37 places it 'on the instrument panel', AMM 74-00 PDF p. 2604 'on the left side of the instrument panel'.",
  groups: ["ignition"],
});
// Local rear-connector opening per AMM Fig 25-60-1 sheet 2 (PDF 913).
// Footprint/top retained; approximate underside raised to clear the level floor cable (figure undimensioned).
part(
  () => {
    const a = ELT_RCPI[0] - 1.63 - ELT_RCPI_SIZE[0] / 2,
      b = ELT_RCPI[0] - 1.63 + ELT_RCPI_SIZE[0] / 2;
    const top = ELT_RCPI[1] + ELT_RCPI_SIZE[1] / 2 + 0.4;
    const bottom = ELT_RCPI[1] - ELT_RCPI_SIZE[1] / 2 + 0.4;
    const inner = ELT_RCPI[2] + ELT_RCPI_SIZE[2] / 2 + 0.03;
    const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
      box(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return mergeGeos([
      slab(-0.45, a, -0.105, 0.13, -0.13, 0.13),
      slab(b, 0.45, -0.105, 0.13, -0.13, 0.13),
      slab(a, b, top, 0.13, -0.13, 0.13),
      slab(a, b, -0.105, bottom, -0.13, ELT_RCPI_JACK[2] + 0.015),
      slab(a, b, -0.105, top, inner, 0.13),
    ]);
  },
  ["cabin"],
  {
    pos: [1.63, -0.4, 0],
    color: "#39424A",
    name: "Center console",
    note: "Horizontal section between the seats: power and mixture levers, fuel selector, armrest; breakers, ELT switch and alternate static on its left side (POH 7-14, Fig. 7-4 item 14). The avionics stack and flap switch are on its sloping front section. Local opening for the RCPI rear connector per AMM 13773-002 Rev 7 Fig 25-60-1 sheet 2 (PDF 913); side cutout matches the approximate 0.05 × 0.04 m RCPI footprint; a 0.015 m inner wall offset leaves a rear cable passage open at the bottom only. Underside y −0.505 m leaves the level y −0.51 m cable run beneath the console. Dimensions approximate because the figure is undimensioned.",
  },
);
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
    fairing: true,
    note: "Sloping front section of the centre console, rising between the bolster halves to meet the displays: FMS keyboard, autopilot mode controller and audio panel, with the flap control at its foot (POH 7-13, Fig. 7-4 items 10 and 15).",
  },
);
/** Anchor for flows.ts. */
export const CB_PANEL: Vec3 = [1.78, -0.4, -0.14];
part(() => box(0.4, 0.18, 0.02), ["electrical"], {
  pos: CB_PANEL,
  color: "#5A4A1C",
  name: "Circuit breaker panel",
  note: "Left side of the center console. Holds ESS 1/2, MAIN 1/2/3, NON ESS, A/C 1/2 and AVIONICS bus breakers.",
  pin: true,
});
/**
 * Aft passenger loading reference: POH 13772-007 Fig 6-3, 6-6 (PDF p. 222), FS 180.
 * This is the occupant arm, not the cushion centre. Cushion extends forward from the occupant;
 * offsets and dimensions are approximate. The reclined back stays ahead of the FS 186 bulkhead
 * (AMM 13773-002 Rev 7 Fig 27-20-5, PDF p. 1005).
 */
export const REAR_SEAT = { referenceX: fsX(180), cushionOffset: 0.18, cushionLength: 0.4, backOffset: -0.04 };
export const REAR_CUSHION_X = REAR_SEAT.referenceX + REAR_SEAT.cushionOffset;
(
  [
    [1.25, -0.33, "Pilot seat", 0.4],
    [1.25, 0.33, "Front passenger seat", 0.4],
    [REAR_CUSHION_X, -0.24, "Rear seat (2+1 bench)", 0.46],
    [REAR_CUSHION_X, 0.28, "Rear seat", 0.4],
  ] as [number, number, string, number][]
).forEach(([x, z, name, w], i) => {
  part(() => box(i < 2 ? 0.48 : REAR_SEAT.cushionLength, 0.1, w), ["cabin"], {
    pos: [x, -0.4, z],
    color: "#6B5A48",
    name,
    note:
      i < 2
        ? "Adjusts fore/aft on an upward-angled track. Honeycomb core crushes to absorb vertical impact — never stand on it."
        : "Seat backs split 60/40 and fold forward for long cargo (POH 7-28). Aft passenger reference FS 180 (POH Fig 6-3, 6-6); cushion dimensions and offset from that occupant arm approximate.",
    pin: true,
  });
  part(() => box(0.09, 0.58, w * 0.92), ["cabin"], {
    pos: [i < 2 ? x - 0.27 : REAR_SEAT.referenceX + REAR_SEAT.backOffset, -0.08, z],
    rot: [0, 0, 0.2],
    color: "#6B5A48",
    name,
    note:
      i < 2
        ? "4-point harness with inflatable shoulder belt (airbag)."
        : "3-point harness on inertia reels at the baggage compartment rear bulkhead (POH 7-28). Reclined back ahead of FS 186 (AMM Fig 27-20-5, PDF p. 1005); shape and offset from the FS 180 occupant reference approximate.",
  });
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
export const FT = { x: 0.73, y: -0.54 };
part(() => cyl(0.02, 1.9, "z"), ["flaps"], {
  pos: [FT.x, FT.y, 0],
  color: "#9F85E6",
  name: "Flap torque tube",
  note: "Mechanically ties both flaps to one actuator.",
});
part(() => box(0.24, 0.07, 0.09), ["flaps"], {
  pos: [FT.x + 0.02, FT.y + 0.02, 0],
  color: "#7C57CF",
  name: "Flap actuator",
  note: "Motorized linear actuator; proximity switches stop travel and drive the position lights. 10 A FLAPS, NON ESS BUS.",
  pin: true,
});
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
/** Anchor for flows.ts. */
export const FUEL_SELECTOR: Vec3 = [1.24, -0.25, 0];
part(() => cyl(0.045, 0.03, "y"), ["fuel"], {
  pos: FUEL_SELECTOR,
  name: "Fuel selector valve",
  note: "LEFT / RIGHT / OFF at the rear of the console. Positive detent at each position; handle points to the selected tank (AMM 13773-002 Rev 7 28-20, PDF p. 1113). Lift the release to select OFF; placarded 46 U.S. gallons usable each side (POH 13772-007 2-27, 7-41).",
  pin: true,
});
part(() => box(0.09, 0.02, 0.02), ["fuel"], { pos: [1.24, -0.23, 0], color: "#F2F5F7", anim: selPtrAnim });
part(() => box(0.04, 0.03, 0.04), ["fuel"], {
  pos: [1.34, -0.26, 0.08],
  name: "Fuel Pump switch",
  note: "Rocker next to the selector: BOOST – OFF – HIGH BOOST/PRIME; both on positions are non-momentary (AMM 13773-002 Rev 7 73-20, PDF p. 2586). Placard: TURN BOOST PUMP ON DURING TAKE OFF, CLIMB, LANDING AND SWITCHING FUEL TANKS. (POH 13772-007 2-27, 7-41).",
});
/**
 * Horizontal overhead stowage (operator correction); POH 13772-007 7-96 describes the receptacle,
 * removable cover/black forward tab and extraction before the downward pull. AMM Rev 7 Fig 95-00-1
 * (PDF p. 2853) supplies the aft cable route. Dimensions, recess profile and extraction timing are schematic.
 */
// POH 13772-007 7-96: above the pilot's right shoulder; Fig 7-4 (7-14) item 1 shows the overhead cover.
// x=1.0 is an illustrative station over the front seat backs, aft of their forward shoulder face, not a measured POH value.
export const CAPS_HANDLE_POS: Vec3 = [1.0, 0.63, 0];
export const CAPS_HANDLE_HEIGHT = 0.1; // Retained stem length; now horizontal along x.
export const CAPS_HANDLE_ATTACH: Vec3 = [
  CAPS_HANDLE_POS[0] - CAPS_HANDLE_HEIGHT / 2 + 0.005,
  CAPS_HANDLE_POS[1] + 0.012,
  CAPS_HANDLE_POS[2],
];
/** POH 7-96: approximately two inches (5 cm) exposed before the forceful downward pull. Timing illustrative. */
export const capsHandleDrop = (t: number) => 0.05 * ease(clamp(t / 0.15, 0, 1));
const handleAnim = (m: THREE.Mesh) => {
  m.position.y = CAPS_HANDLE_POS[1] - capsHandleDrop(live.capsT);
};
part(
  () => mergeGeos([cyl(0.012, CAPS_HANDLE_HEIGHT, "x"), box(0.03, 0.02, 0.15).translate(CAPS_HANDLE_HEIGHT / 2, 0, 0)]),
  ["caps", "cabin"],
  {
    pos: CAPS_HANDLE_POS,
    anim: handleAnim,
    color: "#D32640",
    name: "CAPS activation T-handle",
    note: "Stowed horizontally in its overhead receptacle on the centerline above the pilot's right shoulder. Remove the cover, extract the handle (~2 in./5 cm of cable), then pull straight down (up to 45.0 lb or more). POH 13772-007 7-96, Fig 7-4 (7-14) item 1; AMM Fig 95-00-1. Shape and station schematic, placed over the seat-back shoulder line.",
    pin: true,
  },
);
// Open-bottom rim, not a solid box filling the handle's recess (POH 7-96 receptacle; undimensioned).
part(
  () =>
    mergeGeos([
      box(0.18, 0.03, 0.008).translate(0, 0, -0.1),
      box(0.18, 0.03, 0.008).translate(0, 0, 0.1),
      box(0.008, 0.03, 0.2).translate(-0.09, 0, 0),
      box(0.008, 0.03, 0.2).translate(0.09, 0, 0),
    ]),
  ["caps", "cabin"],
  {
    pos: CAPS_HANDLE_POS,
    color: "#4A535B",
    name: "CAPS handle receptacle",
    note: "Overhead recess retaining the horizontal handle; the handle comes out before the straight-down pull (POH 13772-007 7-96). Rim dimensions schematic.",
  },
);
const coverAnim = (m: THREE.Mesh) => {
  m.visible = live.capsT < 0;
};
// POH Fig 7-4 (7-14): close the cover against the rim bottom; the 0.018 m offset is schematic.
part(() => box(0.18, 0.006, 0.21), ["caps", "cabin"], {
  pos: [CAPS_HANDLE_POS[0], CAPS_HANDLE_POS[1] - 0.018, 0],
  color: "#D32640",
  fairing: true,
  anim: coverAnim,
  name: "CAPS activation handle cover",
  note: "Placarded cover held by hook-and-loop fasteners; remove by pulling the black tab at its forward edge (POH 13772-007 7-96; Fig 7-4, 7-14/7-15). Cover dimensions schematic. Removed before handle extraction.",
});
part(() => box(0.03, 0.004, 0.025), ["caps", "cabin"], {
  pos: [CAPS_HANDLE_POS[0] + 0.1, CAPS_HANDLE_POS[1] - 0.023, 0],
  color: "#151515",
  anim: coverAnim,
  name: "CAPS cover black forward tab",
  note: "Pull this black tab at the forward edge to remove the cover (POH 13772-007 7-96). Size schematic.",
});
part(() => cyl(0.04, 0.24), ["cabin"], {
  // Forward outboard side of the pilot-side footwell (POH 13772-007 7-93; Fig 7-20 item 32, p. 7-88). The POH gives no
  // dimensions: position approximate, set 30 mm higher and 20 mm inboard so the bottle clears the curved belly.
  pos: [2.18, -0.42, -0.48],
  color: "#D32640",
  name: "Fire extinguisher",
  note: "Halon 1211, class B & C. Mounted on the forward outboard side of the pilot-side footwell (POH 13772-007 7-93). About 2.5 lb; check gauge/pin preflight. Position approximate.",
  pin: true,
});
// POH 7-94: the egress hammer lies in the centre armrest (aft end here; size and position approximate). Registered
// first, it carries the armrest's label, which keeps it clear of the fire extinguisher's in the default cabin view.
part(() => box(0.06, 0.02, 0.03), ["cabin"], {
  pos: [1.37, -0.26, 0.04],
  color: "#4A535B",
  name: "Armrest: egress hammer & hour meters",
  note: "8 oz ball-peen hammer for breaking the acrylic windows. HOBBS runs with BAT 1 + either ALT on; FLIGHT starts ~35 KIAS.",
  pin: true,
});
part(() => box(0.22, 0.05, 0.12), ["cabin"], {
  pos: [1.45, -0.24, 0],
  color: "#8A6A3A",
  name: "Armrest: egress hammer & hour meters",
  note: "8 oz ball-peen hammer for breaking the acrylic windows. HOBBS runs with BAT 1 + either ALT on; FLIGHT starts ~35 KIAS.",
});
/** ELT installation, POH 13772-007 7-91, Fig 7-21 (7-92); AMM 13773-002 Rev 7
 * Fig 25-60-1 sheets 1–2 (PDF 912–913). Figures do not dimension hardware: all metres below are illustrative.
 * Keep the existing Fig 7-20 item 22 (7-88) transmitter position, immediately aft of the bulkhead, right of centre.
 */
export const ELT_POS: Vec3 = [-0.98, -0.28, 0.13];
export const ELT_SIZE: Vec3 = [0.16, 0.09, 0.11];
const eltOff = (d: Vec3): Vec3 => ELT_POS.map((v, i) => v + d[i]) as Vec3;
export const ELT_SHELF: Vec3 = eltOff([0, -0.049, 0.025]);
/** Shelf plate thickness and tapered planform (x, z) about `ELT_SHELF`, illustrative; the top face is the ELT bottom. */
export const ELT_SHELF_THICKNESS = 0.008;
export const ELT_SHELF_OUTLINE: [number, number][] = [
  [-0.1, -0.08],
  // Grommet-lined edge notch: AMM Fig 25-60-1 sheet 1 item 12 (PDF 912).
  // Width/depth and coordinates illustrative; cable clears the plate and rubber lining.
  [0.1, -0.08],
  [0.1, -0.055],
  [0.12, -0.055],
  [0.12, -0.08],
  [0.14, -0.08],
  [0.14, 0.08],
  [-0.1, 0.035],
];
// AMM Fig 25-60-1 item 4 (PDF 912): base inside shelf; offsets and edge margins illustrative.
export const ELT_GROMMET: Vec3 = [ELT_SHELF[0] + 0.11, ELT_SHELF[1], ELT_SHELF[2] - 0.065];
export const ELT_ANTENNA_BASE: Vec3 = eltOff([0.11, -0.045, 0.06]);
export const ELT_ANTENNA_FEED: Vec3 = [ELT_ANTENNA_BASE[0], ELT_ANTENNA_BASE[1] - 0.022, ELT_ANTENNA_BASE[2]];
export const ELT_ANTENNA_JACK: Vec3 = eltOff([ELT_SIZE[0] / 2, -0.012, 0.025]);
export const ELT_REMOTE_JACK: Vec3 = eltOff([ELT_SIZE[0] / 2, -0.012, -0.025]);
export const ELT_BUZZER: Vec3 = eltOff([0.095, -0.03, -0.025]);
export const ELT_RCPI_SIZE: Vec3 = [0.05, 0.04, 0.02];
export const ELT_RCPI: Vec3 = [2.02, -0.44, -0.14];
// Rear face is toward the console interior (+z), per AMM Fig 25-60-1 sheet 2, PDF 913.
export const ELT_RCPI_JACK: Vec3 = [ELT_RCPI[0], ELT_RCPI[1], ELT_RCPI[2] + ELT_RCPI_SIZE[2] / 2];
part(() => box(...ELT_SIZE), ["cabin", "caps"], {
  pos: ELT_POS,
  color: "#EB7A12",
  name: "ELT — Artex ELT 1000",
  note: "406 MHz + 121.5 MHz. Triggers at 4–5 ft/s longitudinal Δv or on CAPS deployment (POH 13772-007 7-91). Removable for use as a portable locator (POH 13772-007 7-93, To Use ELT portably). Position and 0.16 × 0.09 × 0.11 m size illustrative (Fig 7-20 item 22, 7-88; Fig 7-21, 7-92).",
  pin: true,
});
// POH 7-91: on the left side of the console (face z −0.13), just forward of the circuit breaker panel (x 1.58 … 1.98)
part(() => box(...ELT_RCPI_SIZE), ["cabin"], {
  pos: ELT_RCPI,
  color: "#EB7A12",
  name: "ELT remote switch (RCPI)",
  note: "ON – ARM/OFF – TEST, red LED flashes when transmitting. Immediately forward of the circuit breaker panel near the pilot's right knee (POH 7-91, ELT Remote Switch and Indicator Panel); position in the model is approximate.",
  pin: true,
});

// Shelf supports transmitter, antenna and buzzer; no dimensions or installation stations are printed in these figures.
part(
  () => {
    const shape = new THREE.Shape(ELT_SHELF_OUTLINE.map(([x, z]) => new THREE.Vector2(x, z)));
    const hole = new THREE.Path();
    hole.absarc(ELT_ANTENNA_BASE[0] - ELT_SHELF[0], ELT_ANTENNA_BASE[2] - ELT_SHELF[2], 0.006, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: ELT_SHELF_THICKNESS, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.translate(0, ELT_SHELF_THICKNESS / 2, 0);
    return g;
  },
  ["cabin", "caps"],
  {
    pos: ELT_SHELF,
    color: "#717A82",
    name: "ELT shelf",
    note: "Supports the transmitter, antenna and buzzer aft of the cabin bulkhead (POH 13772-007 Fig 7-21, 7-92; AMM 13773-002 Rev 7 Fig 25-60-1 sheet 1 item 9, PDF 912). Flat tapered plate depiction, 0.24 × 0.008 m with width 0.115–0.16 m and position illustrative; mounting details omitted.",
    pin: true,
  },
);
part(
  () =>
    mergeGeos([
      new THREE.CylinderGeometry(0.004, 0.004, 0.022, 12).translate(0, -0.011, 0),
      new THREE.CylinderGeometry(0.003, 0.018, 0.09, 12).translate(0, 0.045, 0),
      new THREE.CylinderGeometry(0.0015, 0.003, 0.26, 8).translate(0, 0.22, 0),
    ]),
  ["cabin", "caps"],
  {
    pos: ELT_ANTENNA_BASE,
    color: "#B6BDC3",
    name: "ELT antenna",
    note: "Internal whip mounted on the ELT shelf, accessible through the avionics bay access panel (POH 13772-007 7-91, Fig 7-21 item 3, 7-92; AMM 13773-002 Rev 7 Fig 25-60-1 sheet 1 item 4, PDF 912). Tapered base and whip shape from the figures; 0.35 m height, 0.018 m base radius, 0.022 m underside connector and position illustrative.",
    pin: true,
  },
);
part(() => cyl(0.012, 0.03), ["cabin", "caps"], {
  pos: ELT_BUZZER,
  color: "#313940",
  name: "ELT buzzer",
  note: "Shelf-mounted warning buzzer beeps periodically when the ELT activates, in tandem with the panel indicator. Powered by the ELT batteries (POH 13772-007 7-91; AMM 13773-002 Rev 7 Fig 25-60-1 sheet 1 item 11, PDF 912). Cylindrical shape from the figure; radius 0.012 m, height 0.03 m and position illustrative; no activation simulation.",
  pin: true,
});
part(
  () =>
    tubeGeo(
      [
        [ELT_GROMMET[0] - 0.008, ELT_GROMMET[1], ELT_SHELF[2] - 0.08],
        [ELT_GROMMET[0] - 0.008, ELT_GROMMET[1], ELT_SHELF[2] - 0.057],
        [ELT_GROMMET[0] + 0.008, ELT_GROMMET[1], ELT_SHELF[2] - 0.057],
        [ELT_GROMMET[0] + 0.008, ELT_GROMMET[1], ELT_SHELF[2] - 0.08],
      ],
      0.002,
      0,
    ),
  ["cabin", "caps"],
  {
    color: "#272F36",
    name: "ELT shelf cable grommet",
    note: "Rubber lining of the shelf-edge cable pass, per AMM Fig 25-60-1 sheet 1 item 12 (13773-002 Rev 7, PDF 912). Notch width/depth and lining radius 0.002 m approximate: figure undimensioned. Centres at ±0.008 m from the notch centre and z −0.057 m from the shelf centre seat the outside of the lining against the ±0.010 m side walls and −0.055 m back wall.",
  },
);
export const ELT_ANTENNA_CABLE: Vec3[] = [
  ELT_ANTENNA_JACK,
  eltOff([0.13, 0.01, 0.025]),
  [ELT_POS[0] + 0.13, ELT_POS[1] + 0.01, ELT_GROMMET[2]],
  [ELT_GROMMET[0], ELT_POS[1] + 0.01, ELT_GROMMET[2]],
  [ELT_GROMMET[0], ELT_POS[1] - 0.07, ELT_GROMMET[2]],
  [ELT_ANTENNA_BASE[0], ELT_POS[1] - 0.07, ELT_ANTENNA_BASE[2]],
  ELT_ANTENNA_FEED,
];
// AMM 13773-002 Rev 7 Fig 25-60-1 sheet 1 item 5 (PDF 912): approximate clamp by grommet 12.
// Undimensioned figure: ring inner radius matches the 2 mm cable; foot reaches the shelf outside the notch.
export const ELT_CLAMP: Vec3 = [ELT_GROMMET[0], ELT_SHELF[1] + 0.012, ELT_GROMMET[2]];
part(
  () =>
    mergeGeos([
      new THREE.TorusGeometry(0.0035, 0.0015, 8, 24).rotateX(Math.PI / 2),
      box(0.012, 0.003, 0.006).translate(0.0095, 0, 0),
      box(0.003, 0.0065, 0.006).translate(0.014, -0.00475, 0),
    ]),
  ["cabin", "caps"],
  {
    pos: ELT_CLAMP,
    color: "#717A82",
    name: "ELT antenna cable clamp",
    note: "Clamp 5 secures the antenna cable beside shelf-edge grommet 12 (AMM 13773-002 Rev 7 Fig 25-60-1 sheet 1, PDF 912). Shape and position approximate because the figure is undimensioned: ring radius 0.0035 m, section radius 0.0015 m, 0.012 × 0.003 × 0.006 m tongue, 0.003 × 0.0065 × 0.006 m foot; offsets 0.0095/0.014 m outboard and 0.00475 m down reach the shelf top from a centre 0.012 m above it. The 0.002 m bore contacts the cable; foot rests on the shelf.",
  },
);
part(() => tubeGeo(ELT_ANTENNA_CABLE, 0.002, 0), ["cabin", "caps"], {
  color: "#272F36",
  name: "ELT antenna cable",
  note: "Antenna jack to shelf-mounted whip, passing through grommet 12 at the shelf edge and below the shelf, per AMM Fig 25-60-1 (POH 13772-007 Fig 7-21 items 3/6, 7-92; AMM 13773-002 Rev 7 Fig 25-60-1 sheet 1 item 1, PDF 912). Radius 0.002 m and bends illustrative; endpoints derived from installation anchors.",
});
// AMM 13773-002 Rev 7 Fig 25-60-1 sheet 2 (PDF 913), undimensioned: approximate bottom exit.
// Level existing floor run; the approximate console underside sits 5 mm above its centreline.
export const ELT_REMOTE_FLOOR_Y = -0.51;
export function eltRemoteCable(rcpi: Vec3): Vec3[] {
  const jack: Vec3 = [rcpi[0], rcpi[1], rcpi[2] + ELT_RCPI_SIZE[2] / 2];
  return [
    jack,
    [jack[0], jack[1], jack[2] + 0.025],
    [rcpi[0], ELT_REMOTE_FLOOR_Y, jack[2] + 0.025],
    [rcpi[0] - 0.22, ELT_REMOTE_FLOOR_Y, jack[2] + 0.025],
    [1.8, ELT_REMOTE_FLOOR_Y, rcpi[2] - 0.03],
    [1.8, ELT_REMOTE_FLOOR_Y, -0.24],
    [1.4, ELT_REMOTE_FLOOR_Y, -0.24],
    [1.4, ELT_REMOTE_FLOOR_Y, -0.14],
    [1.05, ELT_REMOTE_FLOOR_Y, -0.14],
    [1.05, ELT_REMOTE_FLOOR_Y, 0.05],
    [0, ELT_BULKHEAD_PASS[1], ELT_BULKHEAD_PASS[2]],
    ELT_BULKHEAD_PASS,
    [-0.76, -0.45, 0.05],
    [-0.76, -0.28, 0.05],
    [ELT_REMOTE_JACK[0] + 0.07, ELT_REMOTE_JACK[1], ELT_REMOTE_JACK[2]],
    ELT_REMOTE_JACK,
  ];
}
export const ELT_REMOTE_CABLE = eltRemoteCable(ELT_RCPI);
// Keep the named jack identical to the cable terminal for catalogue consumers.
ELT_REMOTE_CABLE[0] = ELT_RCPI_JACK;
part(() => tubeGeo(ELT_REMOTE_CABLE, 0.002, 0), ["cabin", "caps"], {
  color: "#EB7A12",
  name: "ELT remote cable",
  note: "Connects the rear of the console RCPI to the ELT transmitter, per AMM Fig 25-60-1 (POH 13772-007 Fig 7-21 item 4, 7-92; AMM 13773-002 Rev 7 Fig 25-60-1 sheets 1–2 item 2, PDF 912–913). Radius 0.002 m and cabin-floor routing illustrative; level floor centreline y −0.51 m is approximate (undimensioned figure), 5 mm below the console bottom; the 0.22 m aft bend and 0.025 m rear-jack clearance are approximate to avoid adjacent harnesses so the cable exits only underneath; connector endpoints derive from their hardware anchors. Optional Garmin GPS data line omitted (avionics scope).",
  pin: true,
});
