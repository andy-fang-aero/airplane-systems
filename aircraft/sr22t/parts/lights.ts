/** Lights: convenience lights, cabin light switch and reading lights inside; wingtip nav/strobe, aft position and recognition lights, cowl landing and ice lights. */
import { V, toVec3, type Vec3 } from "@/lib/math";
import { botY, box, cyl, onSkin, sph, topY, wC, wLE, wY, wingP } from "../geometry";
import { useSR22T } from "../store";
import { part } from "./catalogue";
import { REAR_CUSHION_X } from "./cabin";

/* ---------- lights ---------- */
const tipAt = (s: number): Vec3 => [wLE(5.84) - 0.5 * wC(5.84), wY(5.84), s * 5.85];
const iceAt = (s: number) => onSkin(2.02, -0.34, s);
export const LIGHTS = {
  // wingtip assemblies: forward nav + strobe, aft-facing white position light, leading-edge recognition light
  tipL: tipAt(-1),
  tipR: tipAt(1),
  aftL: toVec3(wingP(-5.8, 0.93, 0).add(V(-0.02, 0, -0.01))),
  aftR: toVec3(wingP(5.8, 0.93, 0).add(V(-0.02, 0, 0.01))),
  recogL: toVec3(wingP(-5.5, 0, 0).add(V(0.01, 0, 0))),
  recogR: toVec3(wingP(5.5, 0, 0).add(V(0.01, 0, 0))),
  /**
   * HID landing light in the lower engine cowl (POH 7-57), on the centreline below the spinner; position approximate.
   * Tilted to the skin's slope, its lens hangs below the lower skin (`botY`), so solid mode shows it, and its top face
   * is seated just inside the skin, where the ballast lead enters it.
   */
  cowl: [3.6, botY(3.6) - 0.016, 0] as Vec3,
  cowlTilt: Math.atan((botY(3.63) - botY(3.57)) / 0.06),
  /** Ice inspection lights on the fuselage sides, aimed at each wing leading edge. */
  iceL: toVec3(iceAt(-1)),
  iceR: toVec3(iceAt(1)),
  iceAimL: toVec3(wingP(-2.4, 0.02, 1)),
  iceAimR: toVec3(wingP(2.4, 0.02, 1)),
  dome: [1.2, 0.64, 0] as Vec3,
  foot: [
    [2.2, -0.55, -0.35],
    [2.2, -0.55, 0.35],
    [0.8, -0.56, -0.35],
    [0.8, -0.56, 0.35],
  ] as Vec3[],
  step: [
    [1.55, -0.74, -0.52],
    [1.55, -0.74, 0.52],
  ] as Vec3[],
  bag: [-0.3, 0.48, 0] as Vec3,
};
/** Convenience-light lens radius; the dome lens sits on the oxygen head unit's lower face (oxygen.ts). */
export const DOME_LIGHT_RADIUS = 0.022;
(
  [
    ["Dome light", LIGHTS.dome, false],
    ["Footwell light", LIGHTS.foot[0], false],
    ["Entry step light", LIGHTS.step[0], true],
    ["Baggage light", LIGHTS.bag, false],
  ] as [string, Vec3, boolean][]
).forEach(([name, pos, ext]) =>
  part(() => sph(DOME_LIGHT_RADIUS), ["lighting"], {
    pos,
    color: "#E8C46A",
    name,
    note: "Convenience lighting, 5 A CONV LIGHTS breaker on the CONV bus (BAT 1 direct).",
    pin: true,
    ext,
  }),
);
// Convenience lighting is "controlled by the cabin light switch located on the ceiling" (POH 7-59): beside the
// dome light here, position approximate. Rocker order ON / OFF / AUTO as the POH lists them (7-60), forward = ON.
const CABIN_SWITCH_TILT = { ON: -0.3, OFF: 0, AUTO: 0.3 } as const;
part(() => box(0.03, 0.008, 0.016), ["lighting", "cabin"], {
  pos: [LIGHTS.dome[0], LIGHTS.dome[1] + 0.014, LIGHTS.dome[2] + 0.045],
  color: "#20262B",
  anim: (m) => {
    m.rotation.z = CABIN_SWITCH_TILT[useSR22T.getState().s.lights.cabin];
  },
  name: "Cabin light switch",
  pin: true,
  pinIn: ["lighting"],
  note: "Three-position cabin light switch on the ceiling, controlling the convenience lighting: ON lights the dome and footwell lights (entry step lights with a door open or unlocked); AUTO lights them only with a door open or unlocked; OFF turns all convenience lighting off; the baggage lights follow the baggage door in ON and AUTO. 5 A CONV LIGHTS breaker on CONV (POH 13772-007 7-59, 7-60; Fig 7-4 (2 of 2) item 21, 7-15).",
});
/**
 * Reading lights: eyeball lights in the headliner above each passenger position, each with a push-button switch next to it
 * (POH 7-59). One per modelled seat (cabin.ts), the rear bench centre position open; positions approximate.
 */
const REAR_READING_X = REAR_CUSHION_X - 0.1; // POH 7-59: above each passenger, offsets approximate
const READING_LIGHTS: Vec3[] = [
  [1.08, 0.6, -0.3],
  [1.08, 0.6, 0.3],
  [REAR_READING_X, topY(REAR_READING_X) - 0.1, -0.24],
  [REAR_READING_X, topY(REAR_READING_X) - 0.1, 0.28],
];
const READING_STATIC =
  " Drawn static: the model keeps no reading-light switch state, so the lights stay unlit and the push buttons do not move.";
READING_LIGHTS.forEach((pos, i) => {
  part(() => sph(0.014), ["lighting", "cabin"], {
    pos,
    color: "#E8C46A",
    name: "Reading light",
    pin: i === 0,
    pinIn: ["lighting"],
    note:
      "Eyeball reading light in the headliner, aimed by turning the lens in its socket, switched by the push button next to it. 28 VDC through the 5 A CABIN LIGHTS breaker on MAIN BUS 1 (POH 13772-007 7-59)." +
      (i < 2 ? " The pilot and copilot lights also dim with the PANEL control on the bolster." : "") +
      READING_STATIC,
  });
  part(() => cyl(0.005, 0.006, "y", 12), ["lighting", "cabin"], {
    pos: [pos[0] + 0.03, pos[1] + 0.008, pos[2]],
    color: "#20262B",
    name: "Reading light push button",
    note: "Push-button switch next to the reading light (POH 13772-007 7-59)." + READING_STATIC,
  });
});
const EXT = "#D9D9D9";
(
  [
    [LIGHTS.tipL, "Left wingtip: nav (red) + strobe"],
    [LIGHTS.tipR, "Right wingtip: nav (green) + strobe"],
  ] as [Vec3, string][]
).forEach(([pos, name]) =>
  part(() => sph(0.035), ["lighting"], {
    pos,
    color: EXT,
    name,
    note: "Navigation light with an integral anti-collision strobe; each strobe is flashed by its own power supply. NAV and STROBE switches on the bolster; 5 A NAV LIGHTS and 5 A STROBE LIGHTS breakers on NON ESS BUS (POH 7-57).",
    pin: true,
    ext: true,
  }),
);
[LIGHTS.aftL, LIGHTS.aftR].forEach((pos, i) =>
  part(() => sph(0.025), ["lighting"], {
    pos,
    color: EXT,
    name: "Aft position light (white)",
    note: "White position light in the aft part of each wingtip assembly, on the NAV switch (AMM 33-40; POH 7-57 does not mention it). It does the tail light's job: there is no light on the rudder or tailcone.",
    pin: i === 0,
    ext: true,
  }),
);
[LIGHTS.recogL, LIGHTS.recogR].forEach((pos, i) =>
  part(() => box(0.03, 0.035, 0.14), ["lighting"], {
    pos,
    color: EXT,
    name: "Wingtip recognition light",
    note: "Recognition light in the wing tip leading edge, one per side, on the LAND switch with the cowl landing light. 15 A LANDING LIGHTS breaker on MAIN BUS 3 (POH 7-57).",
    pin: i === 1,
    ext: true,
  }),
);
/** Point on the cowl landing light's axis, `d` m above its centre; `d` = 0.015 is the centre of its top face. */
export const cowlLampAxis = (d: number): Vec3 => [
  LIGHTS.cowl[0] - d * Math.sin(LIGHTS.cowlTilt),
  LIGHTS.cowl[1] + d * Math.cos(LIGHTS.cowlTilt),
  LIGHTS.cowl[2],
];
part(() => box(0.06, 0.03, 0.09), ["lighting"], {
  pos: LIGHTS.cowl,
  rot: [0, 0, LIGHTS.cowlTilt],
  color: EXT,
  name: "Landing light (HID, lower cowl)",
  note: "High Intensity Discharge landing light in the lower engine cowl. LAND energizes the landing light relay in the MCU, which takes 28 VDC from Main Dist Bus 1, protected by a 7.5 A fuse in the MCU, to the ballast on the firewall; the ballast provides the boosted voltage that lights the lamp (POH 7-57). No CB-panel breaker, so after an ALT 1 failure it lasts as long as BAT 1. Position on the model is approximate.",
  pin: true,
  ext: true,
});
[LIGHTS.iceL, LIGHTS.iceR].forEach((pos, i) =>
  part(() => cyl(0.022, 0.02, "z"), ["lighting"], {
    pos,
    color: EXT,
    name: "Ice inspection light",
    note: "Ice Inspection Light on each side of the nose (POH 4-7, 4-8), aimed at the wing leading edge so you can check for ice at night. ICE switch on the bolster. Breaker on MAIN BUS 1: ICE PROTECT 1, 7.5 A with FIKI; ICE LIGHTS, 5 A without (AMM 30-80, 33-40). Position on the model is approximate.",
    pin: i === 1,
    ext: true,
  }),
);
