/**
 * Avionics: display bezels, ADAHRS, GIAs, GEA, the centre console stack, transponder, cooling fans, the optional LRUs,
 * antennas and magnetometer. Positions follow POH 13772-007 Figure 7-20 Equipment Locations (7-88), which governs the
 * AMM text; the figure is a plan view without dimensions, so every LRU position is approximate.
 */
import type { PartAnim } from "@/lib/catalogue";
import { toVec3, type Vec3 } from "@/lib/math";
import { HH, box, botY, cyl, fLE, hingeX, topY, tubeGeo, wingP } from "../geometry";
import { useSR22T } from "../store";
import { part } from "./catalogue";
import { REAR_SEAT, STACK } from "./cabin";

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
  note: "Puts both displays in reversionary mode: PFD instruments plus the Engine Strip. Press again to exit. The other display reverts on its own if one fails (POH 7-74).",
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
/* LRU anchors (centres) other sections and the avionics paths use. Behind-panel x lies between the bezel
 * plane (2.285) and the firewall (FW 2.61). */
export const ADAHRS_1: Vec3 = [2.43, 0.1, -0.24];
/** ADAHRS 2 beside IAU 1, inboard, between the two IAUs (POH Fig 7-20 item 3); it lies fore-and-aft as the figure draws it. */
export const ADAHRS_2: Vec3 = [2.43, 0.1, -0.024];
export const GIA_1: Vec3 = [2.45, 0.1, -0.115];
export const GIA_2: Vec3 = [2.45, 0.1, 0.07];
export const GEA_71: Vec3 = [2.44, -0.04, 0.3];
/** Connector points on the back of the PFD and MFD bezels. */
export const PFD_CONN: Vec3 = [2.3, 0.092, BEZEL_Z.pfd];
export const MFD_CONN: Vec3 = [2.3, 0.092, BEZEL_Z.mfd];
export const PFD_FAN: Vec3 = [2.345, 0.19, -0.125];
export const MFD_FAN: Vec3 = [2.345, 0.19, 0.23];
export const IAU_FAN: Vec3 = [2.37, -0.12, -0.25];
export const XPDR: Vec3 = [-0.76, -0.08, 0.27];
export const XM_RADIO: Vec3 = [-0.64, -0.08, 0.15];
export const GDL_69A: Vec3 = [-0.78, -0.08, 0.19];
export const GATEWAY: Vec3 = [-0.59, -0.03, 0.33];
export const GSR_56: Vec3 = [-0.7, -0.16, -0.205];
export const WX_500: Vec3 = [0, botY(0) + 0.09, -0.25];
export const GTS_800: Vec3 = [1.2, -0.5, -0.33];
export const KN_63: Vec3 = [2.1, -0.53, -0.38];
export const MAG_1: Vec3 = toVec3(wingP(4.8, 0.45, 0));
/** MAG 2 "adjacent to the first" (AMM 34-20 PDF p. 1675), on the same mounting plate (AMM Fig 34-20-3 sheet 1, PDF p. 1689);
 * spacing approximate. */
export const MAG_2: Vec3 = toVec3(wingP(4.9, 0.45, 0));
/** GMA 350 audio panel centre on the console slope (the avionics paths). */
export const GMA_350: Vec3 = STACK.at(0.16, 0.006, 0.005);

part(() => box(0.1, 0.09, 0.15), ["avionics", "pitot"], {
  pos: ADAHRS_1,
  name: "GSU 75 ADAHRS 1",
  note: "ADAHRS 1, behind the PFD (POH 7-75; Fig 7-20 item 1; AMM 34-10 PDF p. 1630: behind the LH instrument panel), on its rack on the console (AMM Fig 34-10-7 sheet 1, PDF p. 1670): attitude/heading reference plus air data computer, with MAG 1 (POH Fig 7-17). The pitot and static lines tee to it, ADAHRS 2 and the MD302 (POH Fig 7-16 (2 of 2)). Supply: 28 VDC through the 5 A ADAHRS 1 circuit breaker on ESS BUS 1 (POH 7-75; Fig 7-11, 7-52).",
  pin: true,
});
// Same unit as ADAHRS 1, turned to lie fore-and-aft (POH Fig 7-20 draws both long fore-and-aft); position approximate.
part(() => box(0.1, 0.09, 0.15), ["avionics", "pitot"], {
  pos: ADAHRS_2,
  rot: [0, Math.PI / 2, 0],
  name: "GSU 75 ADAHRS 2",
  note: "ADAHRS 2, installed on this airplane (per operator, 2026-10-08; optional in POH Fig 7-17). Behind the panel beside Integrated Avionics Unit 1, between the two IAUs (POH Fig 7-20 item 3), on its own rack. Sources differ: AMM Fig 34-10-7 sheet 1 (PDF p. 1670) draws the two ADAHRS racks adjacent on one console plate with no IAU between them; the model follows the POH. Position approximate. Second AHRS and air data computer, with MAG 2 (POH Fig 7-17); pitot and static teed to it (POH Fig 7-16 (2 of 2); AMM Fig 34-10-1 sheet 2 item 12, PDF p. 1646). If one ADAHRS fails the system switches to the other (POH 3-43). Supply: 28 VDC through the 5 A ADAHRS 2 circuit breaker on MAIN BUS 2 (POH 7-75; AMM 34-10 PDF p. 1630; Fig 7-11, 7-52).",
  pin: true,
});
// Fig 7-20 draws each Integrated Avionics Unit long fore-and-aft; the box follows the figure's proportions (approximate).
part(() => box(0.25, 0.11, 0.08), ["avionics"], {
  pos: GIA_1,
  name: "GIA 1 (GIA 63W)",
  note: "Integrated Avionics Unit 1, behind the PFD, inboard of ADAHRS 1 (AMM 31-40 PDF p. 1326; POH 7-78, Fig 7-20 item 2; position approximate): WAAS GPS, VHF COM/NAV/GS, integration, flight director. Supply: 28 VDC through the 7.5 A COM 1 and 5 A GPS NAV GIA 1 circuit breakers on ESS BUS 1 (POH 7-78; Fig 7-11, 7-52).",
  pin: true,
});
part(() => box(0.25, 0.11, 0.08), ["avionics"], {
  pos: GIA_2,
  name: "GIA 2 (GIA 63W)",
  note: "Integrated Avionics Unit 2, behind the MFD (AMM 31-40 PDF p. 1326; POH 7-78, Fig 7-20 item 5; position approximate). Supply: 28 VDC through the 7.5 A COM 2 and 5 A GPS NAV GIA 2 circuit breakers on MAIN BUS 2 (POH 7-78; Fig 7-11, 7-52).",
  pin: true,
});
part(() => box(0.1, 0.07, 0.1), ["avionics", "engine"], {
  pos: GEA_71,
  name: "GEA 71 Engine Airframe Unit",
  note: "Behind the MFD (POH 7-78, Fig 7-20 item 6; AMM 77-40 PDF p. 2722). Digitizes fuel, CHT, EGT, MAP, RPM and other sensors. Supply: 28 VDC through the 3 A ENGINE INSTR circuit breaker on ESS BUS 2 (POH 7-78; Fig 7-11, 7-52).",
});
part(() => box(0.012, 0.085, 0.15), ["avionics"], {
  pos: STACK.at(0.29, 0.006, 0.005),
  rot: STACK.rot,
  color: "#15181B",
  name: "GCU 479 FMS keyboard",
  note: "Upper section of the centre console, just below the displays (POH 7-75). Data entry, tuning, course. KEYPADS / AP CTRL on MAIN BUS 1.",
});
part(() => box(0.012, 0.04, 0.15), ["avionics", "controls"], {
  pos: STACK.at(0.215, 0.006, 0.005),
  rot: STACK.rot,
  color: "#15181B",
  name: "GMC 707 autopilot mode controller",
  note: "GFC 700 mode controller, below the FMS keyboard in the centre console (POH 7-72, 7-79; position from Fig. 7-4, approximate).",
});
part(() => box(0.012, 0.045, 0.15), ["avionics"], {
  pos: GMA_350,
  rot: STACK.rot,
  color: "#15181B",
  name: "GMA 350 audio panel",
  note: "Audio panel with marker beacon receiver, below the Flight Management System Keyboard in the centre console (POH 7-72, 7-78; position from Fig. 7-4, approximate).",
});
// Aft of FS 222 on the right (Fig 7-20 item 20); box proportions from the figure (approximate).
part(() => box(0.16, 0.09, 0.06), ["avionics"], {
  pos: XPDR,
  name: "GTX 335/345 transponder",
  note: "In the empennage avionics compartment, aft of FS 222 on the right side (POH 7-78, 7-83, Fig 7-20 item 20; AMM 34-50 PDF p. 1720: behind the aft cabin bulkhead; access panel RE3 on the RH side, POH 7-5, AMM Fig 6-00-8 PDF p. 125; position approximate). Supply: 28 VDC through the 2 A XPONDER circuit breaker on AVIONICS (POH 7-78, 7-83; Fig 7-11, 7-52). Mode S with Extended Squitter (POH 7-78).",
});
/* ---------- avionics cooling fans (POH 7-90; AMM 21-20 PDF p. 454) ---------- */
// Display and IAU fans sit forward of the panel slab with the rotor on the forward (+x) face, blowing onto the heat
// sinks on the forward side of the displays (POH 7-90). Each rotor spins while its breaker feeds it: AVIONICS FAN 1 (MFD fan), AVIONICS FAN 2 (PFD and IAU fans), Elec.fan1 / fan2.
const fanSpin =
  (which: "fan1" | "fan2", phase: number): PartAnim =>
  (m, t) => {
    if (useSR22T.getState().E[which]) m.rotation.x = phase + t * 30;
  };
const FAN_HOUSING = "#3A4148";
const fan = (at: Vec3, which: "fan1" | "fan2", name: string, note: string, pin: boolean) => {
  part(() => cyl(0.03, 0.025, "x"), ["avionics"], { pos: at, color: FAN_HOUSING, name, note, pin });
  for (const phase of [0, Math.PI / 2])
    part(() => box(0.006, 0.05, 0.01), ["avionics"], {
      pos: [at[0] + 0.016, at[1], at[2]],
      color: "#9AA3AA",
      name,
      note,
      anim: fanSpin(which, phase),
    });
};
fan(
  PFD_FAN,
  "fan2",
  "PFD cooling fan",
  "Blows onto the heat sink on the forward side of the PFD. Upper RH corner of the display support bracket (AMM 21-20 PDF p. 454), between the displays (POH Fig 7-20 item 4); position approximate. Supply: 28 VDC through the 5 A AVIONICS FAN 2 circuit breaker on MAIN BUS 2 (POH 7-90; Fig 7-11, 7-52). PFD FAN FAIL when it stops.",
  true,
);
fan(
  MFD_FAN,
  "fan1",
  "MFD cooling fan",
  "Blows onto the heat sink on the forward side of the MFD. Upper RH corner of the display support bracket (AMM 21-20 PDF p. 454), right of the MFD (POH Fig 7-20 item 4); position approximate. Supply: 28 VDC through the 5 A AVIONICS FAN 1 circuit breaker on NON-ESSENTIAL BUS (POH 7-90; Fig 7-11, 7-52; AMM 21-20 PDF p. 454 says 3 A, POH governs). MFD FAN FAIL when it stops.",
  true,
);
fan(
  IAU_FAN,
  "fan2",
  "Avionics (IAU) cooling fan",
  "Forward of the instrument panel, cooling the Integrated Avionics Units through a series of ducts (POH 7-90; AMM 21-20 PDF p. 454: under the LH console assembly, forward from the bolster panel); low on the left behind the panel (POH Fig 7-20 item 4); position approximate. Supply: 28 VDC through the 5 A AVIONICS FAN 2 circuit breaker on MAIN BUS 2 (POH 7-90; Fig 7-11, 7-52).",
  true,
);

/* ---------- cabin audio (POH Fig 7-20 items 13, 29) ---------- */
part(() => cyl(0.06, 0.02), ["avionics"], {
  pos: [1.03, topY(1.03) - 0.03, 0],
  color: FAN_HOUSING,
  name: "Cabin speaker",
  note: "In the cabin ceiling on the centreline, over the rear seats (POH Fig 7-20 item 13), behind a grill (AMM 23-50 PDF pp. 667–668); position approximate. Supply: no breaker of its own; the GMA 350 intercom drives it, and the audio panel takes 28 VDC through the 5 A AUDIO PANEL circuit breaker on AVIONICS (POH 7-78; AMM 23-50 PDF p. 650).",
  pin: true,
});
part(() => box(0.03, 0.06, 0.02), ["avionics"], {
  pos: [1.3, -0.3, -0.14],
  color: FAN_HOUSING,
  name: "Cabin microphone",
  note: 'Fig 7-20 item 29, "Microphone": beside the centre console between the front seats, about mid-cushion (POH 7-88; the plan view does not show its height); position approximate. Supply: no breaker of its own; it feeds the GMA 350 intercom, and the audio panel takes 28 VDC through the 5 A AUDIO PANEL circuit breaker on AVIONICS (POH 7-78; AMM 23-50 PDF p. 650).',
  pin: true,
});

/* ---------- optional LRUs (POH 7-72 lists them as optional; shown labelled, like their antennas) ---------- */
part(() => box(0.09, 0.06, 0.03), ["avionics"], {
  pos: XM_RADIO,
  name: "XM radio transceiver (optional)",
  note: "Aft of FS 222, right of centre (POH Fig 7-20 item 18; the XM system is optional, POH 7-89); position and size approximate. XM Radio uses the same receiver as XM Weather (AMM 23-30 PDF p. 644). Supply: 28 VDC through the 5 A DATA LINK/WEATHER circuit breaker on AVIONICS (AMM 23-30 PDF p. 644 and 34-50 PDF p. 1721, 22T-1473 thru 22T-9749; panel label DATA LINK/WEATHER, POH Fig 7-11, 7-52; POH 7-84 calls it WEATHER/DATA LINK).",
  pin: true,
});
part(() => box(0.16, 0.09, 0.06), ["avionics"], {
  pos: GDL_69A,
  name: "GDL 69A XM receiver (optional)",
  note: "XM satellite weather and radio data link receiver, in the empennage avionics compartment beside the transponder (POH 7-83, Fig 7-20 item 21; AMM 34-50 PDF p. 1721); position approximate. Supply: 28 VDC through the 5 A WEATHER/DATA LINK circuit breaker on AVIONICS (POH 7-84; the panel and AMM 34-50 PDF p. 1721 label it DATA LINK/WEATHER, POH Fig 7-11, 7-52).",
  pin: true,
});
part(() => box(0.12, 0.05, 0.03), ["avionics"], {
  pos: GATEWAY,
  name: "Gateway Module (optional)",
  note: "Collects aircraft data and sends it over a cellular link on the ground (POH 7-87). RH empennage avionics compartment (AMM 31-70 PDF p. 1366; POH Fig 7-20 item 19), with two internal antennas on the RH side just aft of the empennage access panel (POH 7-89); position approximate. Supply: 28 VDC through the 5 A CONV LIGHTS circuit breaker on the Constant Power Bus (CONV), which BAT 1 feeds through a 5 A fuse on the MCU (POH 7-50, 7-59; Fig 7-10, 7-48; Fig 7-11, 7-52), so pulling CONV LIGHTS disables it (POH 8-11). AMM 31-70 PDF p. 1366 (22T-1473 thru 22T-10614) names the breaker CONV SYS 2 (or CONV LIGHTS) on Conv Bus; this airplane's panel labels it CONV LIGHTS (POH Fig 7-11).",
  pin: true,
});
part(() => box(0.2, 0.05, 0.06), ["avionics"], {
  pos: GSR_56,
  name: "GSR 56 Iridium transceiver (optional)",
  note: "Iridium weather, voice and SMS (POH 7-83). Empennage avionics compartment (POH 7-83), aft of FS 222 on the left with Battery 2 (Fig 7-20 item 25; AMM 34-50 PDF p. 1721: immediately behind the aft cabin bulkhead). The plan view draws it over the inboard forward part of item 24, so it sits under the BAT 2 container; height and position approximate. Supply: 28 VDC through the 5 A DATA LINK/WEATHER circuit breaker on AVIONICS (POH 7-83; Fig 7-11, 7-52).",
  pin: true,
});
part(() => box(0.25, 0.06, 0.12), ["avionics"], {
  pos: WX_500,
  name: "WX-500 processor (optional)",
  note: "Stormscope processor under the aft baggage floor (POH 7-84; AMM 34-40 PDF p. 1696), left of centre (POH Fig 7-20 item 28); position approximate. Supply: 28 VDC through the 5 A DATA LINK/WEATHER circuit breaker on AVIONICS (POH 7-84; Fig 7-11, 7-52).",
  pin: true,
});
part(() => box(0.1, 0.06, 0.25), ["avionics"], {
  pos: GTS_800,
  name: "GTS 800 traffic processor (optional)",
  note: "Transmitter Receiver Computer under the LH cockpit seat (POH 7-84, Fig 7-20 item 30; AMM 34-40 PDF p. 1697); position approximate. Supply: 28 VDC through the 5 A TRAFFIC circuit breaker on AVIONICS (POH 7-84; Fig 7-11, 7-52).",
  pin: true,
});
part(() => box(0.15, 0.08, 0.1), ["avionics"], {
  pos: KN_63,
  name: "KN 63 DME receiver (optional)",
  note: "In the LH footwell ahead of the pilot seat, beside the fire extinguisher (POH Fig 7-20 item 31; the AMM says under the pilot's seat, AMM 34-50 PDF p. 1722; POH governs); position approximate. Talks to the panel through GIA 2 (POH 7-84). Supply: 28 VDC through the 3 A DME/ADF circuit breaker on AVIONICS (POH 7-84 – 7-85; Fig 7-11, 7-52; AMM 34-50 PDF p. 1722 for 22T-1473 thru 22T-9749).",
  pin: true,
});
const ANT = "#C8399F";
part(() => cyl(0.007, 0.3), ["avionics"], {
  pos: [0.45, 0.82, 0],
  rot: [0, 0, 0.45],
  color: ANT,
  name: "COM 1 antenna",
  note: "Rod on top above the passenger compartment.",
  ext: true,
});
part(() => cyl(0.007, 0.26), ["avionics"], {
  pos: [-0.35, -0.7, 0],
  rot: [0, 0, -0.45],
  color: ANT,
  name: "COM 2 antenna",
  note: "Rod below the baggage compartment.",
  ext: true,
});
part(() => cyl(0.05, 0.015), ["avionics"], {
  pos: [1.0, 0.72, 0],
  color: ANT,
  name: "GPS 1 antenna",
  note: "Above the passenger compartment (GPS/XM combo if XM installed).",
  ext: true,
});
part(() => cyl(0.05, 0.015), ["avionics"], {
  pos: [-0.28, 0.54, 0],
  color: ANT,
  name: "GPS 2 / Iridium antenna",
  note: "Just forward of the baggage-compartment window.",
  ext: true,
});
// On a plate in a recess at the top of the fixed fin, ahead of the upper rudder hinge (AMM 13773-002 Fig 34-50-4, PDF p. 1739,
// SR22/SR22T; SR20 POH 11934-005 p. 7-87 says "top of the vertical fin"). Above HH the fin top is the moving rudder horn cap,
// so the antenna sits just below the joint, midway between the fin LE and the hinge; the station is approximate.
const NAV_H = HH - 0.01;
part(() => box(0.16, 0.015, 0.015), ["avionics"], {
  pos: [(fLE(NAV_H) + hingeX(NAV_H)) / 2, NAV_H, 0],
  color: ANT,
  name: "NAV antenna",
  note: "Top of the fixed fin, just below the rudder horn cap: VOR/LOC and glideslope for both GIAs. (AMM Fig 34-50-4; position approximate)",
  ext: true,
});
part(() => box(0.08, 0.08, 0.01), ["avionics"], {
  pos: [-0.72, -0.57, 0.12],
  color: ANT,
  name: "Transponder antenna",
  note: "Belly, just aft of the baggage bulkhead, right side.",
  ext: true,
});
part(() => box(0.2, 0.012, 0.08), ["avionics"], {
  pos: [0.25, topY(0.25) + 0.004, 0],
  color: ANT,
  name: "Stormscope antenna (optional)",
  note: "Lightning-detection antenna directly above the passenger compartment.",
  ext: true,
});
part(() => box(0.14, 0.06, 0.012), ["avionics"], {
  pos: [1.45, topY(1.45) + 0.03, 0],
  color: ANT,
  name: "Traffic antenna, top (optional)",
  note: "Just above the pilot/copilot compartment (POH 7-89); with the GTS 800 a second blade sits under the belly (below).",
  ext: true,
});
// With A/C installed (it is on the modelled airplane) the sled sits inside, just above the belly skin, tilted to follow the belly's
// slope so no corner pokes through, and forward of most of the A/C condenser, below it (station approximate).
const MARKER = { x: -0.05, len: 0.3 } as const;
const markerY = (dx: number) => botY(MARKER.x + dx);
part(() => box(MARKER.len, 0.012, 0.1), ["avionics"], {
  pos: [MARKER.x, (markerY(-MARKER.len / 2) + markerY(MARKER.len / 2)) / 2 + 0.012, 0],
  rot: [0, 0, Math.atan((markerY(MARKER.len / 2) - markerY(-MARKER.len / 2)) / MARKER.len)],
  color: ANT,
  name: "Marker beacon antenna",
  note: 'Sled type. "If the optional air conditioning system is installed, this antenna is located below the baggage floor inside of the airplane" (POH 7-89); A/C is fitted on this airplane. Position approximate. Supply: passive antenna, no breaker; it feeds the marker beacon receiver in the GMA 350 audio panel (POH 7-78).',
});
part(() => box(0.1, 0.06, 0.012), ["avionics"], {
  pos: [2.3, botY(2.3) - 0.03, 0.1],
  color: ANT,
  name: "DME antenna (optional)",
  note: "Blade on the belly just aft and right of the firewall.",
  ext: true,
});
part(() => box(0.07, 0.04, 0.07), ["avionics"], {
  pos: MAG_1,
  color: ANT,
  name: "Magnetometer (GMU 44, MAG 1)",
  note: "Senses the local magnetic field for AHRS heading. Mounted outboard in the wing (AMM 34-20 PDF p. 1675), removed through wing access panel RW12 (AMM 34-20 PDF p. 1687), the right-wing outboard panel (AMM Fig 6-00-7 PDF p. 124), beside the OAT sensor; position approximate. Feeds ADAHRS 1 (POH Fig 7-17). Supply: 28 VDC through the 5 A PFD A circuit breaker on ESS BUS 1 (AMM 34-20 PDF p. 1675; POH 7-74, Fig 7-11, 7-52).",
  pin: true,
});
part(() => box(0.07, 0.04, 0.07), ["avionics"], {
  pos: MAG_2,
  color: ANT,
  name: "Magnetometer (GMU 44, MAG 2)",
  note: "Second magnetometer, installed on this airplane (per operator, 2026-10-08); it “may be installed by option” (AMM 34-20 PDF p. 1675). Adjacent to MAG 1, outboard in the right wing behind RW12 (AMM 34-20 PDF pp. 1675, 1687), on the same mounting plate (AMM Fig 34-20-3 sheet 1, PDF p. 1689); spacing approximate. Feeds ADAHRS 2 (POH Fig 7-17). Supply: 28 VDC through the 5 A PFD B circuit breaker on MAIN BUS 2 (AMM 34-20 PDF p. 1675, serials 22T-1473 thru 22T-9749; POH Fig 7-11, 7-52).",
  pin: true,
});
/* POH 13772-007 Fig 7-17 (7-73), 7-75; AMM 13773-002 Rev 7 34-20 PDF p. 1675.
 * Schematic harnesses: below the wing fairleads, aft of the fuel tank, under the main spar and up behind the panel.
 * Coordinates, 4 mm radius and lane spacing are illustrative, not installation dimensions. Shared with data particles. */
const magWingRun = (z0: number, xc: number, depth = 0.6) =>
  [z0, 3.6, 2.4, 1.2, 0.8, 0.45].map((z) => toVec3(wingP(z, xc, 0).lerp(wingP(z, xc, -1), z < 1 ? 0.9 : depth)));
export const MAG_WIRES: Record<1 | 2, Vec3[]> = {
  1: [
    MAG_1,
    ...magWingRun(4.8, 0.72),
    [0.83, -0.625, 0.44],
    [0.9, -0.675, 0.25],
    [1.1, -0.7, 0.1],
    [1.3, -0.69, 0.18],
    [1.45, -0.69, 0.14],
    [1.75, -0.69, -0.15],
    [2.25, -0.655, -0.3],
    [2.5, -0.65, -0.26],
    [2.54, -0.58, -0.26],
    [2.56, -0.5, -0.4],
    [2.56, -0.2, -0.37],
    [2.56, 0.05, -0.37],
    [2.5, 0.1, -0.3],
    ADAHRS_1,
  ],
  // MAG 2 leaves forward of MAG 1, then follows a separate wing and cabin lane.
  2: [
    MAG_2,
    toVec3(wingP(4.9, 0.38, 0).lerp(wingP(4.9, 0.38, -1), 0.5)),
    toVec3(wingP(4.7, 0.38, 0).lerp(wingP(4.7, 0.38, -1), 0.5)),
    ...[4.65, 4.45, 3.64, 2.44, 1.24, 0.84].map((z) =>
      toVec3(
        wingP(z, z > 4 ? 0.72 : 0.71, 0).lerp(wingP(z, z > 4 ? 0.72 : 0.71, -1), z < 1 ? 0.85 : z > 4 ? 0.3 : 0.5),
      ),
    ),
    [0.89, -0.615, 0.44],
    [0.96, -0.682, 0.25],
    [1.16, -0.69, 0.1],
    [1.45, -0.71, 0.17],
    [1.75, -0.7, -0.08],
    [2.1, -0.7, -0.17],
    [2.25, -0.645, -0.2],
    [2.5, -0.64, -0.32],
    [2.53, -0.58, -0.32],
    [2.53, -0.5, -0.35],
    [2.53, -0.2, -0.35],
    [2.53, 0.12, -0.35],
    [2.53, 0.22, -0.2],
    [2.53, 0.25, -0.024],
    [2.53, 0.1, -0.024],
    ADAHRS_2,
  ],
};
([1, 2] as const).forEach((n) =>
  part(() => tubeGeo(MAG_WIRES[n], 0.004), ["avionics"], {
    color: "#D9960F",
    name: `MAG ${n} wiring`,
    note: `GMU 44 MAG ${n} to ADAHRS ${n} (POH Fig 7-17; AMM 34-20 PDF p. 1675: the magnetometer "interfaces with the GSU 75 ADAHRS"). Routing approximate.`,
  }),
);
// POH 7-89: "on the bottom RH side of the airplane just forward of the baggage compartment"; station approximate.
const TRAFFIC_BOTTOM_X = REAR_SEAT.referenceX + 0.02;
part(() => box(0.1, 0.06, 0.012), ["avionics"], {
  pos: [TRAFFIC_BOTTOM_X, botY(TRAFFIC_BOTTOM_X) - 0.03, 0.15],
  color: ANT,
  name: "Traffic antenna, bottom (optional)",
  note: "Second GTS 800 blade antenna, on the bottom RH side just forward of the baggage compartment (POH 7-89; AMM 34-40 PDF p. 1697); position approximate. Supply: passive antenna, no breaker; it feeds the GTS 800 (POH 7-84, 7-89).",
  ext: true,
});
