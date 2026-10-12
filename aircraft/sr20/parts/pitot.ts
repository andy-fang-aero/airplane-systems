/** SR20 G6 pitot/static, OAT and electro-pneumatic stall hardware. */
import { mergeGeos } from "@/lib/geometry";
import { V, toVec3, type Vec3 } from "@/lib/math";
import { AB, box, cyl, fus, sph, tubeGeo, wingP } from "../geometry";
import { useSR20 } from "../store";
import { part, suctionAnim, STALL_Z } from "./catalogue";

/** LH wing near tip (AMM 12137-002 Rev A1 34-10 p. 1); span and mast height approximate. */
export const PITOT_Z = -5.1;
export const pitotBase = wingP(PITOT_Z, 0.3, -1);
const PITOT_TIP_LEN = 3.6 * 0.0254;
export const PITOT_TIP: { bend: Vec3; entry: Vec3 } = {
  bend: [pitotBase.x + 0.026, pitotBase.y - 0.16, PITOT_Z],
  entry: [pitotBase.x + 0.026 + PITOT_TIP_LEN, pitotBase.y - 0.16, PITOT_Z],
};
part(
  () =>
    mergeGeos([
      box(0.07, 0.025, 0.014).translate(pitotBase.x + 0.01, pitotBase.y - 0.012, PITOT_Z),
      tubeGeo([pitotBase, [pitotBase.x, pitotBase.y - 0.13, PITOT_Z], PITOT_TIP.bend], 0.011, 0.05),
    ]),
  ["pitot"],
  {
    name: "Pitot mast",
    note: "L-shaped mast with integral heated pitot on LH wing just inboard of wingtip. Bracket, electrical connector and pitot line are accessible with the left wingtip removed (POH 11934-005 7-69; AMM 12137-002 Rev A1 34-10 pp. 1, 8, Fig 34-10-1 p. 20). Span, bracket shape and mast height approximate.",
    ext: true,
  },
);
part(() => cyl(0.011, PITOT_TIP_LEN, "x"), ["pitot"], {
  pos: [PITOT_TIP.bend[0] + PITOT_TIP_LEN / 2, PITOT_TIP.bend[1], PITOT_Z],
  name: "Heated pitot tube",
  note: "3.6 in (91.4 mm) entry-tip length to bend, lower-forward drain hole 1.1 in (27.9 mm) aft of tip and upper-aft drain hole (AMM 12137-002 Rev A1 Fig 34-10-2 p. 21). 7.5 A PITOT HEAT breaker, NON-ESSENTIAL BUS; current sensor drives PITOT HEAT FAIL. PITOT HEAT REQD appears when heat is OFF below 5 °C (POH 11934-005 7-69–7-70).",
  pin: true,
  ext: true,
});
/** Two ports behind aft cabin bulkhead (AMM 34-10 p. 1); longitudinal station approximate. */
export const SPX = -1.6;
export const statR = fus(SPX);
export const STATIC_PORT = (s: number): Vec3 => [SPX, statR.cy, s * statR.hw];
[1, -1].forEach((s) =>
  part(() => cyl(0.025, 0.006, "z"), ["pitot"], {
    pos: STATIC_PORT(s),
    color: "#3A9448",
    name: "Static port (" + (s > 0 ? "R" : "L") + ")",
    note: "Dual external static ports on LH and RH fuselage behind the aft cabin bulkhead; each has a directly mounted sump before its line joins the bulkhead tee (POH 11934-005 7-69; AMM 12137-002 Rev A1 34-10 p. 1, Fig 34-10-1 p. 19). Position approximate.",
    pin: s > 0,
    ext: true,
  }),
);
export const ALT_STATIC: Vec3 = [1.84, -0.3, -0.14];
part(() => box(0.05, 0.05, 0.03), ["pitot"], {
  pos: ALT_STATIC,
  color: "#3A9448",
  name: "Alternate static valve",
  note: "Console, right of pilot's leg (lower LH side of console): admits cabin pressure when normal static is blocked. Cabin heater/vent settings affect pressure; apply Section 5 airspeed and altitude corrections (POH 11934-005 7-70; AMM 12137-002 Rev A1 34-10 pp. 1–2, 12). Position approximate.",
  pin: true,
});
/** AMM trap access locations conflict: general/plumbing CF2L, static plumbing CF3L,
 * while Fig 6-00-6 labels CF3R. Under-floor positions are schematic until confirmed on the airplane. */
export const TRAPS: Record<"pitot" | "static" | "staticConsole", Vec3> = {
  pitot: [1.57, -0.625, -0.24],
  static: [1.08, -0.625, -0.26],
  staticConsole: [2.02, -0.5, -0.16],
};
const TRAP_SIZE = 0.05;
const trapNote = (line: "pitot" | "static") =>
  `Low-point ${line} water trap with drain tube and plug, under cabin floor. Drain at annual inspection and when water is known or suspected (POH 11934-005 7-69). AMM 12137-002 Rev A1 34-10 ${line === "pitot" ? "p. 9 specifies CF2L" : "p. 1 specifies CF2L but p. 12 specifies CF3L"}; Fig 6-00-6 labels CF3R. Position and size schematic pending airframe confirmation.`;
part(() => box(TRAP_SIZE, TRAP_SIZE, TRAP_SIZE), ["pitot"], {
  pos: TRAPS.pitot,
  color: "#3A9448",
  name: "Pitot water trap",
  note: trapNote("pitot"),
  pin: true,
});
export const STALL_INLET = toVec3(wingP(STALL_Z, 0, 0));
part(() => sph(0.025), ["pitot"], {
  pos: STALL_INLET,
  color: "#3A9448",
  name: "Stall warning inlet",
  note: "RH leading-edge pneumatic port: increasing angle of attack brings upper-wing low pressure around the leading edge. Negative pressure operates the diaphragm switch, causing horn and red STALL. About 5 kt above stall, full flaps/power off/wings level; larger margin in turning or accelerated flight (POH 11934-005 7-69; AMM 12137-002 Rev A1 27-31 p. 1).",
  pin: true,
  ext: true,
});
part(() => sph(0.04), ["pitot"], {
  pos: toVec3(wingP(STALL_Z, 0.3, 1)),
  color: "#E0263B",
  anim: suctionAnim,
  name: "Low-pressure peak",
  note: "Illustrates the upper-surface low-pressure region moving forward around the leading edge with rising angle of attack (POH 11934-005 7-69). The animation's angle threshold is illustrative, not a documented sensor setting.",
  ext: true,
});
/** RH wing, source corrected from previous left-wing photo interpretation; station/spacing approximate. */
export const OAT_1 = toVec3(wingP(4.52, 0.45, -1));
export const OAT_2 = toVec3(wingP(4.62, 0.45, -1));
[OAT_1, OAT_2].forEach((pos, i) =>
  part(
    () =>
      tubeGeo(
        [
          [0, 0.01, 0],
          [0.01, -0.07, 0],
        ],
        0.006,
      ),
    ["pitot", "avionics"],
    {
      pos,
      color: "#8C959C",
      name: `OAT sensor ${i + 1}`,
      note: `Outside-air-temperature probe sends temperature directly to ADAHRS ${i + 1}'s air data computer. RH wing per AMM 12137-002 Rev A1 34-10 p. 2, Fig 34-10-6; dedicated sensor per ADC per POH 11934-005 7-76. Stations and spacing approximate.`,
      ext: true,
      pin: true,
      ...(i === 1 ? { fitted: () => useSR20.getState().s.avx.dualAdahrs } : {}),
    },
  ),
);
part(() => box(TRAP_SIZE, TRAP_SIZE, TRAP_SIZE), ["pitot"], {
  pos: TRAPS.static,
  color: "#3A9448",
  name: "Static water trap",
  note: trapNote("static"),
  pin: true,
});
part(() => box(TRAP_SIZE, TRAP_SIZE, TRAP_SIZE), ["pitot"], {
  pos: TRAPS.staticConsole,
  color: "#3A9448",
  name: "Console static water trap",
  note: "Second static water trap and plug, forward of alternate static source valve in LH centre console (AMM 12137-002 Rev A1 34-10 p. 12). Shown as a separate low point on the forward static line; routing, position and size schematic.",
  pin: true,
});
export const SUMPS: Vec3[] = [1, -1].map((s) => [SPX, statR.cy - 0.03, s * (statR.hw - 0.035)]);
SUMPS.forEach((pos, i) =>
  part(() => cyl(0.012, 0.05), ["pitot"], {
    pos,
    color: "#3A9448",
    name: `Static line sump (${i === 0 ? "R" : "L"})`,
    note: "Mounted directly to static port, resisting forced water intrusion before pressure enters its static tube (AMM 12137-002 Rev A1 34-10 p. 1, Fig 34-10-1 p. 19 item 16). Size approximate.",
    pin: i === 1,
  }),
);
export const STATIC_TEE: Vec3 = [AB - 0.03, 0.15, -0.17];
part(() => cyl(0.012, 0.04, "z"), ["pitot"], {
  pos: STATIC_TEE,
  color: "#3A9448",
  name: "Static bulkhead tee",
  note: "Tee on aft cabin bulkhead at LH CAPS enclosure, centred between rivet holes; joins two port lines to forward static plumbing (AMM 12137-002 Rev A1 Fig 34-10-1 p. 19). Position and size approximate.",
});
part(() => cyl(0.03, 0.006, "z"), ["pitot"], {
  pos: [ALT_STATIC[0], ALT_STATIC[1], ALT_STATIC[2] - 0.018],
  color: "#2B2B2B",
  name: "Alternate static knob",
  note: "Console-mounted valve knob; admits cabin static pressure (POH 11934-005 7-70; AMM 12137-002 Rev A1 Fig 34-10-1 p. 20). Shape approximate.",
});
export const PITOT_HEAT_SENSOR: Vec3 = [1.72, -0.5, -0.2];
part(() => box(0.03, 0.02, 0.02), ["pitot"], {
  pos: PITOT_HEAT_SENSOR,
  color: "#8C959C",
  name: "Pitot heat current sensor",
  note: "Current sensor on pitot heater supply wire. Heat ON without heater current gives PITOT HEAT FAIL; heat OFF below 5 °C gives PITOT HEAT REQD (POH 11934-005 7-70, Fig 7-16 p. 7-72). Physical position illustrative: diagram is schematic.",
  pin: true,
});
part(
  () =>
    tubeGeo(
      [
        [1.78, -0.42, -0.16],
        PITOT_HEAT_SENSOR,
        [1.6, -0.6, -0.26],
        wingP(-0.7, 0.22, 0),
        wingP(-1.8, 0.22, 0),
        wingP(PITOT_Z, 0.28, 0),
        pitotBase.clone().add(V(-0.02, 0.012, 0)),
      ],
      0.004,
    ),
  ["pitot"],
  {
    color: "#D9960F",
    name: "Pitot heater wiring",
    note: "7.5 A PITOT HEAT (NON-ESSENTIAL BUS) through current sensor to pitot mast heater; switch/current logic reports to Engine Airframe Unit (POH 11934-005 7-69–7-70, Fig 7-16 p. 7-72). Wire route and diameter schematic.",
  },
);
part(() => box(0.03, 0.004, 0.012), ["pitot"], {
  pos: [pitotBase.x + 0.03, pitotBase.y + 0.012, PITOT_Z],
  color: "#8C959C",
  name: "Pitot mast ground strap",
  note: "Ground strap bonds mast bracket to wing (AMM 12137-002 Rev A1 Fig 34-10-1 p. 20). Size and placement approximate.",
});
export const STALL_SWITCH: Vec3 = [1.4, -0.45, -0.11];
export const STALL_CONNECTOR: Vec3 = [1.4, -0.45, -0.077];
export const STALL_TRAP: Vec3 = [1.5, -0.625, 0.24];
part(() => box(0.04, 0.03, 0.025), ["pitot"], {
  pos: STALL_SWITCH,
  color: "#3A9448",
  name: "Stall warning pressure switch",
  note: "Normally open diaphragm switch on mid-console LH side panel. Negative pressure triggers avionics aural warning and red STALL; 2 A STALL WARNING on ESS BUS 2. Fault produces STALL WARN FAIL and mutes aural warning until cleared (POH 11934-005 7-69; AMM 12137-002 Rev A1 27-31 p. 1). Position/size approximate.",
  pin: true,
});
part(() => box(0.025, 0.018, 0.016), ["pitot"], {
  pos: STALL_CONNECTOR,
  color: "#C8399F",
  name: "Stall switch electrical connector",
  note: "Electrical connector on electro-pneumatic pressure switch; interface to avionics aural warning/CAS (AMM 12137-002 Rev A1 Fig 27-31-1 p. 5 item 5; POH 11934-005 7-69). Position and size approximate.",
});
part(() => cyl(0.012, 0.035), ["pitot"], {
  pos: STALL_TRAP,
  color: "#3A9448",
  name: "Stall warning water trap",
  note: "Stall line tee and drain plug collect moisture below the cabin floor (AMM 12137-002 Rev A1 Fig 27-31-1 p. 5 items 8, 9, 12; scheduled inspection 5-20 lists the stall-warning water trap). Position and size schematic.",
  pin: true,
});
const drain = (trap: Vec3, plug: Vec3) => ({
  tube: [[trap[0], trap[1] - TRAP_SIZE / 2, trap[2]], [trap[0], plug[1], trap[2]], plug] as Vec3[],
  plug,
});
export const DRAINS = {
  pitot: drain(TRAPS.pitot, [1.5, -0.662, -0.24]),
  static: drain(TRAPS.static, [1.02, -0.662, -0.26]),
  staticConsole: drain(TRAPS.staticConsole, [1.98, -0.545, -0.16]),
  stall: drain(STALL_TRAP, [1.45, -0.662, 0.24]),
};
(["pitot", "static", "staticConsole", "stall"] as const).forEach((line) => {
  const label = { pitot: "Pitot", static: "Static", staticConsole: "Console static", stall: "Stall warning" }[line];
  part(() => tubeGeo(DRAINS[line].tube, 0.005), ["pitot"], {
    color: "#8C959C",
    name: `${label} drain tube`,
    note: `${label} low-point drain tube, ends at a removable plug. Length and route schematic (AMM 12137-002 Rev A1 ${line === "stall" ? "Fig 27-31-1 p. 5" : "34-10 pp. 9, 12, Fig 34-10-1 p. 19"}).`,
  });
  part(() => cyl(0.011, 0.022, "x"), ["pitot"], {
    pos: DRAINS[line].plug,
    color: "#D9960F",
    name: `${label} drain plug`,
    note: `Removable ${label.toLowerCase()} low-point drain plug. Drain pitot/static traps at annual inspection and if moisture is known or suspected (POH 11934-005 7-69; AMM 12137-002 Rev A1 ${line === "stall" ? "Fig 27-31-1 p. 5" : "34-10 pp. 9, 12, Fig 34-10-1 p. 19"}). Size and position schematic.`,
    pin: line === "pitot" || line === "static",
  });
});
