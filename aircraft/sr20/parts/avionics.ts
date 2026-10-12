/** Avionics: display bezels, ADAHRS, GIAs, GEA, the centre console stack, transponder, antennas and magnetometer. */
import { glowAnim } from "@/lib/anims";
import { type PartAnim } from "@/lib/catalogue";
import { toVec3, type Vec3 } from "@/lib/math";
import { HH, box, botY, cyl, fLE, hingeX, topY, tubeGeo, wingP } from "../geometry";
import { part } from "./catalogue";
import { STACK } from "./cabin";
import { useSR20 } from "../store";

const S = () => useSR20.getState();
export const dualAdahrsFitted = () => S().s.avx.dualAdahrs;
/** POH Fig 7-20, 7-89. Positions and dimensions approximate; primary ADAHRS anchor retained. */
export const ADAHRS_1: Vec3 = [2.43, 0.1, -0.24];
export const ADAHRS_2: Vec3 = [2.43, 0.105, -0.03];
export const GIA_1: Vec3 = [2.46, 0.11, -0.13];
export const GIA_2: Vec3 = [2.46, 0.12, 0.2];
export const GEA_71: Vec3 = [2.44, -0.04, 0.3];
export const PFD_CONN: Vec3 = [2.32, 0.092, -0.241];
export const MFD_CONN: Vec3 = [2.32, 0.092, 0.054];
export const MD302_POS: Vec3 = [2.23, -0.07, -0.245];
export const GMA_350: Vec3 = STACK.at(0.16, 0.006, 0.005);
export const GCU_479: Vec3 = STACK.at(0.29, 0.006, 0.005);
export const GMC_707: Vec3 = STACK.at(0.215, 0.006, 0.005);
export const XPDR: Vec3 = [-0.91, -0.08, 0.28];
export const GDL_69A: Vec3 = [-1.15, -0.12, 0.2];
export const GSR_56: Vec3 = [-0.73, -0.15, -0.23];
export const GATEWAY: Vec3 = [-0.57, 0.02, 0.34];
export const WX_500: Vec3 = [-0.08, botY(-0.08) + 0.1, -0.25];
export const GTS_800: Vec3 = [1.57, -0.49, -0.33];
export const KN_63: Vec3 = [2.05, -0.49, -0.39];
export const MAG_1: Vec3 = toVec3(wingP(4.8, 0.45, 0));
export const MAG_2: Vec3 = toVec3(wingP(4.9, 0.45, 0));
export const PFD_FAN: Vec3 = [2.385, 0.215, -0.115];
export const MFD_FAN: Vec3 = [2.385, 0.215, 0.175];
export const IAU_FAN: Vec3 = [2.455, -0.12, -0.3];
export const SPEAKER: Vec3 = [1.03, topY(1.03) - 0.03, 0];
export const MICROPHONE: Vec3 = [1.39, -0.3, -0.14];

/* ---------- avionics ---------- */
// GDU 1050A bezels around the 0.211 × 0.158 m screens (Airplane.tsx SCREENS), sized from the Pilot's Guide drawing (approximate):
// ≈1.31 × 1.25 of the screen, knobs on the inboard edges, softkeys below. The inboard control strips nearly meet, with a narrow
// strip between them carrying the red DISPLAY BACKUP button at the top (PG Fig 1-2, 1-6; Perspective+ brochure).
const BEZEL_Z = { pfd: -0.241, mfd: 0.054 } as const;
part(() => box(0.014, 0.198, 0.276), ["avionics"], {
  pos: [2.285, 0.092, BEZEL_Z.pfd],
  color: "#15181B",
  name: "PFD bezel",
  pin: true,
  note: "COM volume and frequency knobs, BARO, RANGE joystick, menu keys and the FMS knob on its right (inboard) edge; 12 softkeys under the screen.",
});
part(() => box(0.014, 0.198, 0.276), ["avionics"], {
  pos: [2.285, 0.092, BEZEL_Z.mfd],
  color: "#15181B",
  name: "MFD bezel",
  pin: true,
  note: "NAV volume and frequency knobs at the top of its left (inboard) edge; 12 softkeys under the screen.",
});
part(() => cyl(0.008, 0.012, "x"), ["avionics"], {
  pos: [2.274, 0.165, -0.0935],
  color: "#D32640",
  name: "DISPLAY BACKUP button",
  note: "Puts both displays in reversionary mode: PFD instruments plus the Engine Strip. Press again to exit. The other display reverts on its own if one fails (POH 7-72).",
});
// bezel controls (decorative): knobs on each inboard strip (PFD: COM volume, COM, BARO, RANGE, FMS; MFD: NAV volume, NAV), 12 softkeys under each screen
const KNOB = "#2C3136";
for (const [y, r] of [
  [0.165, 0.008],
  [0.127, 0.011],
  [0.089, 0.009],
  [0.055, 0.007],
  [0.008, 0.011],
] as const)
  part(() => cyl(r, 0.014, "x"), ["avionics"], { pos: [2.272, y, BEZEL_Z.pfd + 0.121], color: KNOB });
for (const [y, r] of [
  [0.165, 0.008],
  [0.127, 0.011],
] as const)
  part(() => cyl(r, 0.014, "x"), ["avionics"], { pos: [2.272, y, BEZEL_Z.mfd - 0.121], color: KNOB });
for (const z0 of [BEZEL_Z.pfd, BEZEL_Z.mfd])
  for (let i = 0; i < 12; i++)
    part(() => box(0.004, 0.006, 0.012), ["avionics"], { pos: [2.277, 0.008, z0 + (i - 5.5) * 0.0176], color: KNOB });
part(() => box(0.1, 0.09, 0.075), ["avionics", "pitot"], {
  pos: ADAHRS_1,
  name: "GSU 75 ADAHRS 1",
  note: "Behind the PFD: combined AHRS and air data computer (POH 7-76; Fig 7-20 item 1, 7-89). Accelerometers/rate sensors, MAG 1 magnetic field, pitot/static/OAT air data and GPS from both GIAs support attitude/heading. ARINC 429 data interface (Garmin 190-02183-01 Rev A p. 1). Powered by 5 A ADAHRS 1 on ESS BUS 1. Individual position and rack dimensions approximate.",
  pin: true,
  anim: glowAnim("#4B5860", () => S().E.ahrs1, ["avionics", "pitot"]),
});
part(() => box(0.1, 0.09, 0.075), ["avionics", "pitot"], {
  pos: ADAHRS_2,
  name: "GSU 75 ADAHRS 2 (optional)",
  note: "Optional second GSU 75 with its own MAG 2 and OAT channel, behind the panel beside GIA 1 (POH Fig 7-20 item 3, 7-89). Powered by 5 A ADAHRS 2 on MAIN BUS 2 (POH 7-76). Fig 7-17 (7-74) connects it to the MFD and both GIAs. This study's dual-ADAHRS equipment option controls its presence; it is not asserted installed on every SR20. Position approximate.",
  pin: true,
  fitted: dualAdahrsFitted,
  anim: glowAnim("#4B5860", () => S().E.ahrs2, ["avionics", "pitot"]),
});
for (const [n, pos] of [
  [1, ADAHRS_1],
  [2, ADAHRS_2],
] as const)
  part(() => box(0.115, 0.004, 0.09), ["avionics"], {
    pos: [pos[0], pos[1] - 0.047, pos[2]],
    color: "#8C949A",
    name: `ADAHRS ${n} mounting rack`,
    note: "Dedicated ADAHRS rack behind the instrument panel (SR20 AMM Fig 34-10-7). Position and size approximate.",
    fitted: n === 2 ? dualAdahrsFitted : undefined,
  });
for (const [n, pos, bus] of [
  [1, GIA_1, "ESS BUS 1"],
  [2, GIA_2, "MAIN BUS 2"],
] as const)
  part(() => box(0.25, 0.11, 0.07), ["avionics"], {
    pos,
    name: `GIA ${n} (GIA 63W/64W)`,
    note: `Integrated avionics unit ${n}, behind the ${n === 1 ? "PFD" : "MFD"}: WAAS GPS, VHF COM, NAV/localizer/glideslope, integration processors and flight director (POH 7-79; AMM 31-40 p. 1). Its own display has an Ethernet HSDB link; the two GIAs do not communicate directly. Powered by 7.5 A COM ${n} and 5 A GPS NAV GIA ${n} on ${bus}. GIA63W/64W is an equipment variant named by the POH. Geometry approximate.`,
    pin: true,
  });
part(() => box(0.1, 0.07, 0.1), ["avionics", "engine"], {
  pos: GEA_71,
  name: "GEA 71/71B Engine Airframe Unit",
  note: "Behind the MFD. Processes analog CHT, EGT, MAP, RPM, fuel quantity and other sensors (POH 7-79, Fig 7-20 item 6). Electrical current/voltage also reach the engine indicating system through this unit (POH 7-56). RS-485 to both GIAs (Garmin 190-02183-01 p. 1; POH Fig 7-17). Powered by 3 A ENGINE INSTR on ESS BUS 2. Size and position approximate.",
  pin: true,
});
part(() => box(0.09, 0.06, 0.14), ["avionics", "pitot"], {
  pos: MD302_POS,
  name: "MD302 standby instrument body",
  note: "Combined airspeed, altitude and attitude standby in the LH bolster (POH 7-13–7-16; AMM 34-20 p. 1). Its electronic attitude sensors and pneumatic pitot/static inputs are independent of Perspective+ ADAHRS. Dual diode-isolated 5 A STDBY ATTD A (ESS BUS 1) and B (MAIN BUS 1) supplies. Manual or automatically synchronized barometric setting (POH 7-16). Body dimensions approximate; live display remains on the bolster face.",
});
part(() => box(0.012, 0.085, 0.15), ["avionics"], {
  pos: GCU_479,
  rot: STACK.rot,
  color: "#15181B",
  name: "GCU 479 FMS keyboard",
  note: "Upper section of the centre console, just below the displays (POH 7-76). Data entry, tuning, course. KEYPADS / AP CTRL on MAIN BUS 1.",
});
part(() => box(0.012, 0.04, 0.15), ["avionics", "controls"], {
  pos: GMC_707,
  rot: STACK.rot,
  color: "#15181B",
  name: "GMC 707 autopilot mode controller",
  note: "GFC 700 mode controller, below the FMS keyboard in the centre console (POH 7-73; position from Fig. 7-4, approximate).",
});
part(() => box(0.012, 0.045, 0.15), ["avionics"], {
  pos: GMA_350,
  rot: STACK.rot,
  color: "#15181B",
  name: "GMA 350 audio panel",
  note: "GMA 350 (350c Bluetooth option), intercom, NAV/COM audio, telephone and marker-beacon receiver in the center-console stack (POH 7-80; Fig 7-18). RS-232 to both GIAs (Garmin 190-02183-01 p. 1). Powered by 5 A AUDIO PANEL on AVIONICS. With power lost, its fail-safe audio connects the pilot headset to COM 1 (POH 7-80). Position approximate.",
});
part(() => box(0.16, 0.09, 0.12), ["avionics"], {
  pos: XPDR,
  name: "GTX 335/345 transponder",
  note: "Empennage avionics bay aft of FS 222, RH side (POH 7-79, 7-84; Fig 7-20 item 19). GTX335 Mode S or optional GTX345 with ADS-B In. RS-232 connections to the GIAs (AMM 34-50 troubleshooting; Garmin 190-02183-01 p. 2). Powered by 2 A XPONDER on AVIONICS. Position approximate.",
  pin: true,
});
const ANT = "#C8399F";
part(() => cyl(0.007, 0.3), ["avionics"], {
  pos: [0.45, 0.82, 0],
  rot: [0, 0, 0.45],
  color: ANT,
  solidColor: "#E3E6E8",
  name: "COM 1 antenna",
  note: "Rod on top above the passenger compartment.",
  ext: true,
});
part(() => cyl(0.007, 0.26), ["avionics"], {
  pos: [-0.35, -0.7, 0],
  rot: [0, 0, -0.45],
  color: ANT,
  solidColor: "#E3E6E8",
  name: "COM 2 antenna",
  note: "Rod below the baggage compartment.",
  ext: true,
});
part(() => cyl(0.05, 0.015), ["avionics"], {
  pos: [1.0, 0.72, 0],
  color: ANT,
  solidColor: "#E3E6E8",
  name: "GPS 1 antenna",
  note: "Above the passenger compartment (GPS/XM combo if XM installed).",
  ext: true,
});
part(() => cyl(0.05, 0.015), ["avionics"], {
  pos: [-0.28, 0.54, 0],
  color: ANT,
  solidColor: "#E3E6E8",
  name: "GPS 2 / Iridium antenna",
  note: "Just forward of the baggage-compartment window.",
  ext: true,
});
// SR20 POH 7-90: top of vertical fin. Fixed-fin placement below the rudder horn is approximate.
const NAV_H = HH - 0.01;
part(() => box(0.16, 0.015, 0.015), ["avionics"], {
  pos: [(fLE(NAV_H) + hingeX(NAV_H)) / 2, NAV_H, 0],
  color: ANT,
  solidColor: "#E3E6E8",
  name: "NAV antenna",
  note: "Top of the vertical fin; feeds VOR/localizer and glideslope receivers in both GIAs (SR20 POH 7-90). Fixed-fin position below the rudder horn, size and passive signal split are schematic.",
  ext: true,
});
part(() => box(0.08, 0.08, 0.01), ["avionics"], {
  pos: [-0.72, -0.57, 0.12],
  color: ANT,
  solidColor: "#E3E6E8",
  name: "Transponder antenna",
  note: "Belly, just aft of the baggage bulkhead, right side.",
  ext: true,
});
part(() => box(0.2, 0.012, 0.08), ["avionics"], {
  pos: [0.25, topY(0.25) + 0.004, 0],
  color: ANT,
  solidColor: "#E3E6E8",
  name: "Stormscope antenna (optional)",
  note: "Lightning-detection antenna directly above the passenger compartment.",
  ext: true,
});
part(() => box(0.14, 0.06, 0.012), ["avionics"], {
  pos: [1.45, topY(1.45) + 0.03, 0],
  color: ANT,
  solidColor: "#E3E6E8",
  name: "Traffic antenna, top (optional)",
  note: "Just above the pilot/copilot compartment; a second traffic antenna sits under the belly.",
  ext: true,
});
export const MARKER_ANTENNA: Vec3 = [-0.05, botY(-0.05) + 0.055, 0];
part(() => box(0.3, 0.012, 0.1), ["avionics"], {
  pos: MARKER_ANTENNA,
  color: ANT,
  name: "Marker beacon antenna",
  note: "Sled type below the baggage floor. With the optional air-conditioning installation represented here, it is inside the airplane (POH 7-90). Passive connection to marker receiver in GMA350. Position and dimensions approximate.",
});
part(() => box(0.1, 0.06, 0.012), ["avionics"], {
  pos: [2.3, botY(2.3) - 0.03, 0.1],
  color: ANT,
  solidColor: "#E3E6E8",
  name: "DME antenna (optional)",
  note: "Blade on the belly just aft and right of the firewall.",
  ext: true,
});
/* Magnetic sensors belong in the RH outboard wing: access RW12, AMM 34-20 p. 11. */
for (const [n, pos] of [
  [1, MAG_1],
  [2, MAG_2],
] as const)
  part(() => box(0.07, 0.04, 0.07), ["avionics"], {
    pos,
    color: ANT,
    name: `Magnetometer (GMU 44, MAG ${n})${n === 2 ? " (optional)" : ""}`,
    note: `Three-axis local magnetic-field sensor in the RH outboard wing behind RW12, ${n === 2 ? "adjacent to MAG 1 on the shared mounting plate" : "away from magnetic interference"} (SR20 AMM 34-20 pp. 2, 11, Fig 34-20-3). RS-485 to ADAHRS ${n} (Garmin 190-02183-01 p. 1). Aircraft AMM assigns ${n === 1 ? "PFD A on ESS BUS 1" : "PFD B on MAIN BUS 2"}, 5 A; generic Garmin guide instead describes power from the GSU. This model uses the aircraft AMM breaker assignment. Placement approximate.`,
    pin: true,
    fitted: n === 2 ? dualAdahrsFitted : undefined,
  });
/** One physical MAG harness per sensor; particles in electrical-avionics-depth-flow follow these same paths. */
export const MAG_WIRES: Record<1 | 2, Vec3[]> = {
  1: [
    MAG_1,
    ...[4.5, 3.6, 2.4, 1.2, 0.7].map((z) => toVec3(wingP(z, 0.72, 0))),
    [0.85, -0.58, 0.43],
    [1.4, -0.6, 0.38],
    [2.2, -0.54, 0.32],
    [2.51, -0.32, -0.32],
    [2.5, 0.1, -0.3],
    ADAHRS_1,
  ],
  2: [
    MAG_2,
    ...[4.55, 3.65, 2.45, 1.25, 0.75].map((z) => toVec3(wingP(z, 0.74, 0))),
    [0.88, -0.595, 0.43],
    [1.4, -0.615, 0.35],
    [2.2, -0.55, 0.28],
    [2.5, -0.3, -0.06],
    [2.5, 0.105, -0.03],
    ADAHRS_2,
  ],
};
for (const n of [1, 2] as const)
  part(() => tubeGeo(MAG_WIRES[n], 0.004, 0.1), ["avionics"], {
    name: `MAG ${n} wiring`,
    color: "#B68C3E",
    note: `GMU44 MAG ${n} to its GSU75 via RS-485 (Garmin 190-02183-01 p. 1; POH Fig 7-17, 7-74). Routing schematic; no installation dimensions asserted.`,
    fitted: n === 2 ? dualAdahrsFitted : undefined,
  });

/* Forced cooling: separate MFD branch and PFD/IAU branch (POH 7-91). */
const fanSpin =
  (which: "fan1" | "fan2", phase: number): PartAnim =>
  (m, t) => {
    if (S().E[which]) m.rotation.x = phase + t * 30;
  };
for (const [pos, which, name, note] of [
  [PFD_FAN, "fan2", "PFD cooling fan", "5 A AVIONICS FAN 2 on MAIN BUS 2; blows on PFD heat sink."],
  [
    MFD_FAN,
    "fan1",
    "MFD cooling fan",
    "5 A AVIONICS FAN 1 on NON ESS BUS; blows on MFD heat sink. AMM 21-20 p. 1 says 3 A; POH 7-91 and breaker panel Fig 7-11 specify 5 A, which this model follows.",
  ],
  [
    IAU_FAN,
    "fan2",
    "Integrated avionics cooling fan",
    "5 A AVIONICS FAN 2 on MAIN BUS 2; under LH console forward of bolster, cooling GIAs through ducts.",
  ],
] as const) {
  part(() => cyl(0.027, 0.022, "x"), ["avionics"], {
    pos,
    name,
    color: "#3A4148",
    pin: true,
    note:
      note +
      " POH 7-91; AMM 21-20 p. 1. Display fans mount to upper RH corners of support brackets. Dimensions and positions approximate.",
  });
  for (const phase of [0, Math.PI / 2])
    part(() => box(0.004, 0.043, 0.008), ["avionics"], {
      pos: [pos[0] + 0.013, pos[1], pos[2]],
      color: "#9AA3AA",
      name,
      note: "Illustrative fan rotor, turns with its breaker-bus supply (POH 7-91).",
      anim: fanSpin(which, phase),
    });
}
part(() => cyl(0.06, 0.018), ["avionics"], {
  pos: SPEAKER,
  color: "#3A4148",
  name: "Cabin speaker",
  pin: true,
  note: "Ceiling centerline over rear seats (POH Fig 7-20 item 13, 7-89). GMA350 audio output; no separate breaker. Position approximate.",
});
part(() => box(0.025, 0.045, 0.022), ["avionics"], {
  pos: MICROPHONE,
  color: "#3A4148",
  name: "Cabin microphone (optional)",
  note: "Optional microphone beside the center console (POH Fig 7-20 item 27, 7-89), feeding the audio panel. Position and size approximate.",
});

/* Optional LRUs are source-labelled equipment, rather than assumed universal SR20 fittings. */
for (const [pos, size, name, note] of [
  [
    GDL_69A,
    [0.16, 0.08, 0.06],
    "GDL 69A XM receiver (optional)",
    "Empennage avionics compartment (POH 7-84–7-85, Fig 7-20 item 20). Satellite weather to displays and entertainment audio to GMA. 5 A DATA LINK/WEATHER on AVIONICS.",
  ],
  [
    GSR_56,
    [0.2, 0.05, 0.06],
    "GSR 56 Iridium transceiver (optional)",
    "Empennage avionics compartment beside BAT 2 (POH 7-84, Fig 7-20 item 23). Primary GIA RS-232 plus analog telephone audio to GMA. 5 A DATA LINK/WEATHER on AVIONICS.",
  ],
  [
    GATEWAY,
    [0.12, 0.05, 0.04],
    "Gateway module (optional)",
    "RH empennage avionics compartment with two internal LTE antennas. Read-only ARINC429 aircraft data, cellular upload on ground and remote wake; 5 A CONV LIGHTS on constant-power CONV bus (AMM 31-70 p. 1; POH 7-88–7-90).",
  ],
  [
    WX_500,
    [0.23, 0.06, 0.1],
    "WX-500 processor (optional)",
    "Under aft baggage floor, left side (POH 7-85, Fig 7-20 item 26). Digitizes lightning discharges and sends range/bearing to MFD through secondary GIA every two seconds. 5 A DATA LINK/WEATHER on AVIONICS.",
  ],
  [
    GTS_800,
    [0.1, 0.055, 0.24],
    "GTS 800 traffic processor (optional)",
    "Under LH cockpit seat (POH 7-85, Fig 7-20 item 28). Uses secondary GIA via primary ADC inputs and two exterior directional antennas. 5 A TRAFFIC on AVIONICS.",
  ],
  [
    KN_63,
    [0.15, 0.065, 0.085],
    "KN 63 DME receiver (optional)",
    "LH footwell ahead of pilot seat in POH Fig 7-20 item 29 (7-89). DME pulse-pair ranging; data through secondary GIA. 3 A DME/ADF on AVIONICS (POH 7-86).",
  ],
] as [Vec3, Vec3, string, string][])
  part(() => box(...size), ["avionics"], {
    pos,
    name,
    note: note + " Position and dimensions approximate.",
    pin: true,
  });
part(() => box(0.09, 0.03, 0.018), ["avionics"], {
  pos: [GATEWAY[0] - 0.08, GATEWAY[1] + 0.05, GATEWAY[2]],
  name: "Gateway internal LTE antennas (optional)",
  note: "Two internally mounted antennas on the RH side just aft of empennage access panel (POH 7-90; AMM 31-70 p. 1). Approximate paired assembly.",
});
const trafficX = 0.32;
part(() => box(0.1, 0.06, 0.012), ["avionics"], {
  pos: [trafficX, botY(trafficX) - 0.03, 0.15],
  color: ANT,
  solidColor: "#E3E6E8",
  name: "Traffic antenna, bottom (optional)",
  ext: true,
  note: "Second GTS800 directional blade on bottom RH side just forward of baggage compartment (POH 7-90). Position approximate.",
});
