/**
 * Source-backed SR20 connectivity. POH 11934-005 7-50/7-74 schematics and 7-49–7-91;
 * AMM 12137-002 ATA24/31/34; Garmin 190-02183-01 Rev A pp. 1–2 identifies data protocols.
 * Power: gold. Digital avionics data: cyan. RF/audio: purple. Cooling: blue.
 * Every route is schematic: these lines teach connectivity, not maintenance wire routing.
 */
import type { FlowSpec } from "@/lib/catalogue";
import type { Vec3 } from "@/lib/math";
import type { Elec, Sim } from "./model";
import { MCU, BAT_1, BAT2_BOX, BAT2_RELAY, GROUND_POWER } from "./parts/electrical";
import {
  ADAHRS_1,
  ADAHRS_2,
  GIA_1,
  GIA_2,
  GEA_71,
  PFD_CONN,
  MFD_CONN,
  MD302_POS,
  GMA_350,
  GCU_479,
  GMC_707,
  XPDR,
  MAG_WIRES,
  PFD_FAN,
  MFD_FAN,
  IAU_FAN,
  SPEAKER,
  MICROPHONE,
  MARKER_ANTENNA,
  GDL_69A,
  GSR_56,
  GATEWAY,
  WX_500,
  GTS_800,
  KN_63,
} from "./parts/avionics";
import { HH, botY, fLE, fus, hingeX, topY } from "./geometry";

const CB: Vec3 = [1.8, -0.42, -0.115];
const F: FlowSpec[] = [];
const add = (
  key: string,
  pts: FlowSpec["pts"],
  name: string,
  note: string,
  sys: FlowSpec["sys"] = ["avionics"],
  extra: Partial<FlowSpec> = {},
) => {
  F.push({
    key,
    pts,
    name,
    note: note + " Routing schematic.",
    sys,
    color: "#2B6F86",
    pcolor: "#5CDBE8",
    r: 0.004,
    size: 0.023,
    count: 8,
    tension: 0.1,
    ...extra,
  });
};
const power = (key: string, pts: FlowSpec["pts"], name: string, note: string) =>
  add(key, pts, name, note, ["electrical", "avionics"], { color: "#B78E37", pcolor: "#FFD34D", r: 0.005 });
const panelData = (key: string, a: Vec3, b: Vec3, name: string, note: string, dy = 0.15) => {
  // The upper firewall narrows toward the windshield; cap schematic crossover lanes below that shoulder.
  const laneY = Math.min(dy, 0.15);
  add(key, [a, [2.5, laneY, a[2]], [2.49, laneY, b[2]], b], name, note);
};

/* Source output, field control, batteries and MCU distribution. */
power(
  "alt1",
  [[3.5, -0.3, 0.22], [3.3, -0.47, 0.28], [2.9, -0.43, -0.1], MCU],
  "ALT 1 output",
  "100  A alternator output through 100  A MCU fuse to MDB1 (POH 7-49/7-51)",
);
power(
  "alt2",
  [[3.5, -0.3, -0.22], [3.3, -0.47, -0.28], [2.9, -0.3, -0.34], MCU],
  "ALT 2 output",
  "70  A alternator to MDB2. POH 7-51 text: 80  A fuse; Fig 7-10 and AMM 24-30 p. 1: 60  A. Study follows POH text and records conflict",
);
power(
  "bat1",
  [BAT_1, [2.7, 0.11, 0.02], [2.69, 0.08, -0.25], MCU],
  "BAT 1 feed",
  "BAT 1 contactor to MCU main/essential distribution and starter contactor (POH 7-50/7-55)",
);
power(
  "cb",
  [MCU, [2.45, -0.48, -0.32], [2.1, -0.55, -0.2], CB],
  "MCU → breaker panel",
  "Eight separately fused 30  A feeders, represented as a schematic bundle (POH 7-51)",
);
power(
  "bat2",
  [BAT2_RELAY, [-0.45, -0.52, -0.08], [0.6, -0.62, -0.12], [1.55, -0.55, -0.1], CB],
  "BAT 2 feed",
  "BAT 2 relay through 20  A BAT 2 breaker to ESS BUS 1; ESS BUS 2 backfeed through 20  A ESSENTIAL POWER (POH 7-52/7-55)",
);
power(
  "bat2Series",
  [
    [BAT2_BOX[0] - 0.07, BAT2_BOX[1] + 0.04, BAT2_BOX[2]],
    [BAT2_BOX[0], BAT2_BOX[1] + 0.043, BAT2_BOX[2]],
    [BAT2_BOX[0] + 0.07, BAT2_BOX[1] + 0.04, BAT2_BOX[2]],
  ],
  "BAT 2 series jumper",
  "Two12 V 7  Ah units in series give24 V 7  Ah (POH 7-49)",
);
power(
  "bat2Contactor",
  [BAT2_BOX, [BAT2_BOX[0] + 0.16, BAT2_BOX[1] + 0.02, BAT2_BOX[2]], BAT2_RELAY],
  "BAT 2 → local relay",
  "BAT 2 master commands the relay beside the container (AMM 24-30 p. 5)",
);
power(
  "groundPower",
  [GROUND_POWER, [2.48, -0.29, -0.46], [2.58, -0.22, -0.39], MCU],
  "Ground power → MCU",
  "Two power pins and short relay control contact; regulated28 V, BAT 1 ON and correct polarity required (POH 7-56; AMM 24-40 p. 1). External power not simulated",
);
for (const [n, z] of [
  [1, 0.22],
  [2, -0.22],
] as const)
  power(
    `altField${n}`,
    [MCU, [2.85, -0.18, n === 1 ? 0.1 : -0.36], [3.2, -0.22, z], [3.5, -0.3, z]],
    `ALT ${n} field wiring`,
    `5 A ALT${n} breaker on ${n === 1 ? "A/C BUS 1" : "ESS BUS 2"} through switch/field relay/regulator; independent of output cable (POH 7-55)`,
  );
add(
  "mcuShuntData",
  [MCU, [2.53, 0.12, -0.2], [2.52, 0.12, 0.32], GEA_71],
  "MCU → GEA electrical measurements",
  "Three MCU current shunts; electrical data acquired by GEA for engine indicating (AMM 24-30 p. 5; POH 7-56)",
  ["electrical", "avionics"],
);

/* Separate redundant supply circuits, rather than one common avionics-master feed. */
for (const [key, end, label, bus] of [
  ["pfdFeedA", PFD_CONN, "PFD A", "ESS BUS 1"],
  ["pfdFeedB", PFD_CONN, "PFD B", "MAIN BUS 2"],
  ["mfdFeedA", MFD_CONN, "MFD A", "MAIN BUS 3"],
  ["mfdFeedB", MFD_CONN, "MFD B", "MAIN BUS 1"],
  ["standbyFeedA", MD302_POS, "STDBY ATTD A", "ESS BUS 1"],
  ["standbyFeedB", MD302_POS, "STDBY ATTD B", "MAIN BUS 1"],
] as const)
  power(
    key,
    [CB, [2.13, -0.5, key.endsWith("A") ? -0.18 : -0.15], [2.37, -0.34, end[2]], [2.37, end[1], end[2]], end],
    `${label} display feed`,
    `Independent 5 A ${label} supply on ${bus}; either display feed powers unit (POH 7-15–7-16/7-75)`,
  );

/* POH Fig 7-17: no direct GIA 1↔GIA 2 link. Displays bridge their independent HSDB channels. */
panelData(
  "gia1Pfd",
  GIA_1,
  PFD_CONN,
  "GIA 1 ↔ PFD",
  "Paired HSDB Ethernet link (Garmin 190-02183-01 p. 1; AMM 31-40 p. 1)",
  0.18,
);
panelData(
  "gia2Mfd",
  GIA_2,
  MFD_CONN,
  "GIA 2 ↔ MFD",
  "Paired HSDB Ethernet link (Garmin 190-02183-01 p. 1; AMM 31-40 p. 1)",
  0.185,
);
panelData(
  "pfdMfd",
  PFD_CONN,
  MFD_CONN,
  "PFD ↔ MFD data bus",
  "Display-to-display HSDB Ethernet (POH 7-75; Garmin 190-02183-01 p. 1)",
  0.24,
);
panelData(
  "adahrsPfd",
  ADAHRS_1,
  PFD_CONN,
  "ADAHRS 1 → PFD",
  "ARINC429 attitude/air data; primary direct display link in POH Fig 7-17,7-74",
  0.23,
);
panelData(
  "adahrs2Mfd",
  ADAHRS_2,
  MFD_CONN,
  "ADAHRS 2 → MFD (optional)",
  "Optional ARINC429 attitude/air data; second direct display link in POH Fig 7-17,7-74",
  0.235,
);
for (const [n, ad] of [
  [1, ADAHRS_1],
  [2, ADAHRS_2],
] as const) {
  add(
    n === 1 ? "magData" : "magData2",
    MAG_WIRES[n],
    `MAG ${n} → ADAHRS ${n}`,
    "RS-485 magnetic field data on its physical harness (Garmin 190-02183-01 p. 1; SR20  AMM 34-20 p. 2)",
    ["avionics"],
    { tube: false, tension: 0.1 },
  );
  for (const [g, gia] of [
    [1, GIA_1],
    [2, GIA_2],
  ] as const)
    panelData(
      `adahrs${n}Gia${g}`,
      ad,
      gia,
      `ADAHRS ${n} ↔ GIA ${g}`,
      "Air/attitude data and GIA GPS aiding per POH 7-76 and Fig 7-17,7-74; GSU ARINC429 interface (Garminp. 1)",
      0.245 + n * 0.003 + g * 0.003,
    );
}
for (const [n, gia] of [
  [1, GIA_1],
  [2, GIA_2],
] as const) {
  panelData(
    `geaData${n}`,
    GEA_71,
    gia,
    `GEA → GIA ${n}`,
    "RS-485 engine/airframe measurements to both GIAs (Garmin 190-02183-01 p. 1; POH Fig 7-17,7-74)",
    0.255 + n * 0.003,
  );
  panelData(
    `audioGia${n}`,
    GMA_350,
    gia,
    `GMA ↔ GIA ${n}`,
    "RS-232 audio-panel control plus radio audio interfaces (Garmin 190-02183-01 p. 1; POH 7-80)",
    -0.01 + n * 0.012,
  );
}
for (const [name, unit, base] of [
  ["FMS keyboard", GCU_479, "gcu"],
  ["autopilot controller", GMC_707, "gmc"],
] as const)
  for (const [tag, display] of [
    ["Pfd", PFD_CONN],
    ["Mfd", MFD_CONN],
  ] as const)
    panelData(
      base + tag,
      unit,
      display,
      `${name} ↔ ${tag === "Pfd" ? "PFD" : "MFD"}`,
      "RS-232 control interface to displays (Garmin 190-02183-01 p. 1; POH Fig 7-17,7-74)",
      0.07 + (tag === "Pfd" ? 0 : 0.012),
    );
add(
  "xpdrData",
  [XPDR, [-0.5, -0.35, 0.31], [0.8, -0.52, 0.25], [1.9, -0.5, 0.22], [2.52, -0.25, -0.1], GIA_1],
  "Transponder ↔ GIA 1",
  "RS-232 transponder control/data to primary GIA (POH 7-79; AMM 34-50 troubleshooting)",
);

/* Optional systems keep their model identity and documented integration paths. */
add(
  "xmData",
  [GDL_69A, [-0.5, -0.38, 0.3], [1.1, -0.54, 0.28], [2.51, -0.2, 0.15], MFD_CONN],
  "XM receiver ↔ MFD (optional)",
  "Satellite weather and control to MFD; display bus carries it to PFD (POH 7-84–7-85; Garminp. 2)",
);
add(
  "iridiumData",
  [GSR_56, [-0.48, -0.37, -0.22], [1.1, -0.55, -0.23], [2.5, -0.23, -0.13], GIA_1],
  "Iridium ↔ primary GIA (optional)",
  "RS-232 satellite voice/data transceiver integration (POH 7-84; Garminp. 2)",
);
add(
  "gatewayData",
  [GIA_1, [2.52, 0.18, -0.08], [2.5, -0.23, 0.32], [1, -0.53, 0.3], [-0.45, -0.35, 0.32], GATEWAY],
  "Avionics → gateway (optional)",
  "Read-only ARINC429 on same line feeding RDM300; gateway cellular upload on ground (AMM 31-70 p. 1)",
);
add(
  "wxData",
  [WX_500, [-0.1, -0.5, -0.22], [1.6, -0.55, -0.21], [2.53, -0.18, 0.2], GIA_2],
  "WX-500 → GIA 2 (optional)",
  "Lightning discharge range/bearing data every2 seconds via secondary GIA (POH 7-85)",
);
add(
  "trafficData",
  [GTS_800, [1.7, -0.52, -0.32], [2.55, -0.24, -0.29], ADAHRS_1, [2.56, 0.17, -0.2], GIA_2],
  "Traffic ↔ secondary GIA / ADC (optional)",
  "GTS800 uses secondary GIA inputs via primary ADC, as POH 7-85 describes; schematic path includes primary ADAHRS",
);
add(
  "dmeData",
  [KN_63, [2.34, -0.5, -0.38], [2.55, -0.22, 0.28], GIA_2],
  "KN63 DME ↔ GIA 2 (optional)",
  "Pulse-pair distance data through secondary GIA (POH 7-86)",
);

/* RF/audio connectivity; sidewall and underfloor lanes preserve the instrument faces.
 * The POH defines antenna/LRU locations and links, not harness routing. These lanes are schematic.
 * Sharp polygonal turns use zero curve tension so interpolation cannot bow through the displays.
 */
export const RF_AUDIO_KEYS = [
  "com1Coax",
  "com2Coax",
  "gps1Coax",
  "gps2Coax",
  "navCoax1",
  "navCoax2",
  "xpdrCoax",
  "speakerAudio",
  "microphoneAudio",
  "iridiumAudio",
  "xmAudio",
  "markerCoax",
] as const;
const cabinLane = (x: number, side: number): Vec3 => [
  x,
  botY(x) + Math.max(0.045, fus(x).hh * 0.18),
  side * Math.min(0.42, fus(x).hw * 0.65),
];
/** From the source connector to a sidewall/floor lane. Audio exits into the console body (+x). */
const rfEnd = (p: Vec3, side: number): Vec3[] => {
  if (p === GMA_350) return [p, [p[0] + 0.07, p[1], p[2]], [2.39, p[1], p[2]], [2.39, -0.5, side * 0.4]];
  if (p[0] > 2.3) return [p, [2.59, p[1], p[2]], [2.59, -0.35, side * 0.4], [2.39, -0.5, side * 0.4]];
  const lane = cabinLane(p[0], side),
    middle = fus(p[0]).cy;
  if (p[1] > 0.3) return [p, [p[0], Math.min(p[1] - 0.045, topY(p[0]) - 0.03), p[2]], [p[0], middle, lane[2]], lane];
  // Move across the widest section before descending: a diagonal from a side LRU toward a belly port cuts the skin.
  return [p, [p[0], middle, p[2]], [p[0], middle, lane[2]], lane];
};
/** NAV coax descends inside the fixed fin, then enters the tailcone on its centerline. */
const navLead = (p: Vec3, side: number): Vec3[] => {
  const levels = [p[1] - 0.04, 0.9, 0.65, 0.4, 0.2, 0.1].filter((y) => y < p[1]);
  const finPoints = levels.map((y): Vec3 => [(fLE(y) + hingeX(y)) / 2, y, 0]);
  const root = finPoints.at(-1)!;
  return [p, ...finPoints, [root[0], fus(root[0]).cy, 0], cabinLane(root[0], side)];
};
const rf = (key: string, a: Vec3, b: Vec3, name: string, note: string) => {
  const side = /(?:com2|gps2|navCoax2|xpdr|xm)/.test(key) ? 1 : -1;
  const from = key.startsWith("navCoax") ? navLead(a, side) : rfEnd(a, side),
    to = rfEnd(b, side);
  const start = from.at(-1)![0],
    finish = to.at(-1)![0];
  const stations = [
    -3.1, -2.8, -2.4, -2.05, -1.6, -1.15, -0.85, -0.55, -0.25, 0.05, 0.65, 1.26, 1.71, 2.01, 2.31,
  ].filter((x) => x > Math.min(start, finish) && x < Math.max(start, finish));
  if (start > finish) stations.reverse();
  add(
    key,
    [...from, ...stations.map((x) => cabinLane(x, side)), ...to.reverse()],
    name,
    note + " Sidewall/underfloor lane and connector offsets approximate.",
    ["avionics"],
    {
      color: "#725581",
      pcolor: "#D69DDB",
      r: 0.004,
      count: 5,
      tension: 0,
    },
  );
};
rf(
  "com1Coax",
  GIA_1,
  [0.45, 0.72, 0],
  "COM1 antenna coax",
  "Top passenger-compartment rod to GIA 1 VHF transmitter/receiver (POH 7-90)",
);
rf(
  "com2Coax",
  GIA_2,
  [-0.35, -0.6, 0],
  "COM2 antenna coax",
  "Belly baggage-compartment rod to GIA 2 VHF transmitter/receiver (POH 7-90)",
);
rf(
  "gps1Coax",
  [1, 0.72, 0],
  GIA_1,
  "GPS1 antenna coax",
  "Top passenger-compartment GPS1/XM combination antenna to primary GPS receiver (POH 7-90)",
);
rf(
  "gps2Coax",
  [-0.28, 0.54, 0],
  GIA_2,
  "GPS2 antenna coax",
  "Combination GPS2/Iridium antenna forward of baggage window to secondary GPS receiver (POH 7-90)",
);
const navH = HH - 0.01;
const NAV: Vec3 = [(fLE(navH) + hingeX(navH)) / 2, navH, 0];
for (const [n, gia] of [
  [1, GIA_1],
  [2, GIA_2],
] as const)
  rf(
    `navCoax${n}`,
    NAV,
    gia,
    `NAV antenna → GIA ${n}`,
    "Fin-top antenna feeds both VOR/localizer and glideslope receivers; passive split depicted schematically (POH 7-90)",
  );
rf(
  "xpdrCoax",
  XPDR,
  [-0.72, -0.57, 0.12],
  "Transponder antenna coax",
  "Transponder to belly antenna aft of baggage bulkhead, RH side (POH 7-90)",
);
rf(
  "speakerAudio",
  GMA_350,
  SPEAKER,
  "Audio panel → cabin speaker",
  "Cabin speaker overhead rear seats, POH Fig 7-20 item13,7-89; audio panel feed",
);
rf(
  "microphoneAudio",
  MICROPHONE,
  GMA_350,
  "Cabin microphone → audio panel (optional)",
  "Optional microphone beside console, POH Fig 7-20 item27,7-89",
);
rf(
  "iridiumAudio",
  GSR_56,
  GMA_350,
  "Iridium telephone audio (optional)",
  "Analog TEL audio input from GSR56 (POH 7-84; Garminp. 2)",
);
rf(
  "xmAudio",
  GDL_69A,
  GMA_350,
  "XM entertainment audio (optional)",
  "XM digital entertainment receiver to cabin audio panel (POH 7-84)",
);
rf(
  "markerCoax",
  MARKER_ANTENNA,
  GMA_350,
  "Marker beacon antenna coax",
  "Sled beneath baggage floor inside airplane with A/C installation, to GMA marker receiver (POH 7-90)",
);

/** Existing antenna attachment points may stand just outside the skin. These short terminal leads are intentional;
 * no interior LRU endpoint or whole flow receives an exterior exemption. NAV coax stays inside the fixed fin instead.
 */
export const EXTERIOR_RF_PORTS: Record<string, { end: "start" | "finish"; length: number }[]> = {
  com1Coax: [{ end: "finish", length: 0.1 }],
  com2Coax: [{ end: "finish", length: 0.1 }],
  gps1Coax: [{ end: "start", length: 0.1 }],
  gps2Coax: [{ end: "start", length: 0.1 }],
  xpdrCoax: [{ end: "finish", length: 0.1 }],
};

/* Ambient-air cooling ducts: actual powered fan branch determines particle movement. */
for (const [key, fan, dest, note] of [
  ["pfdCooling", PFD_FAN, PFD_CONN, "PFD heat-sink airflow;5  A AVIONICS FAN2 MAIN BUS 2"],
  ["mfdCooling", MFD_FAN, MFD_CONN, "MFD heat-sink airflow;5  A AVIONICS FAN1 NON ESS BUS"],
  ["iauCooling1", IAU_FAN, GIA_1, "IAU fan duct to primary GIA;5  A AVIONICS FAN2 MAIN BUS 2"],
  ["iauCooling2", IAU_FAN, GIA_2, "IAU fan duct to secondary GIA;5  A AVIONICS FAN2 MAIN BUS 2"],
] as const)
  add(
    key,
    [fan, [2.48, fan[1], fan[2]], [2.47, dest[1], dest[2]], dest],
    key.startsWith("iau") ? "Integrated-avionics cooling duct" : "Display heat-sink airflow",
    note + " (POH 7-91; AMM 21-20 p. 1)",
    ["avionics"],
    { color: "#536A74", pcolor: "#9BDDEB", r: 0.008, size: 0.027 },
  );

export const ELECTRICAL_AVIONICS_DEPTH_FLOWS = F;
export const OPTIONAL_ADAHRS2_FLOW_KEYS = new Set(["magData2", "adahrs2Mfd", "adahrs2Gia1", "adahrs2Gia2"]);
export const electricalAvionicsFlowFitted = (f: FlowSpec, s: Sim) =>
  s.avx.dualAdahrs || !OPTIONAL_ADAHRS2_FLOW_KEYS.has(f.key);

/** Explanatory motion is gated by the relevant breaker and by both powered endpoints. */
export function electricalAvionicsDepthRates(s: Sim, E: Elec): Record<string, number> {
  const pw = (bus: keyof Elec, cb: string) => Number(E[bus]) > 0 && !s.cb[cb];
  const gia1 = pw("ess1", "GPS NAV GIA 1"),
    gia2 = pw("main2", "GPS NAV GIA 2");
  const audio = pw("avx", "AUDIO PANEL"),
    xpdr = pw("avx", "XPONDER");
  const keypads = pw("main1", "KEYPADS / AP CTRL"),
    weather = pw("avx", "DATA LINK/WX");
  const R: Record<string, number> = {
    alt1: Number(E.alt1),
    alt2: Number(E.alt2),
    bat1: E.bat1ok ? (E.bat1Charging ? -0.6 : 1) : 0,
    cb: Number(E.mdb1 > 0 || E.mdb2 > 0),
    bat2: E.bat2ok ? (E.bat2Charging ? -0.6 : Number(E.bat2Supplying)) : 0,
    bat2Series: Number(!E.bat2Dead),
    bat2Contactor: E.bat2ok ? (E.bat2Charging ? -0.6 : 1) : 0,
    groundPower: 0,
    altField1: Number(s.elec.alt1 && pw("ac1", "ALT 1")),
    altField2: Number(s.elec.alt2 && pw("ess2", "ALT 2")),
    mcuShuntData: Number(E.eisPwr && (E.mdb1 > 0 || E.mdb2 > 0)),
    pfdFeedA: Number(pw("ess1", "PFD A")),
    pfdFeedB: Number(pw("main2", "PFD B")),
    mfdFeedA: Number(pw("main3", "MFD A")),
    mfdFeedB: Number(pw("main1", "MFD B")),
    standbyFeedA: Number(pw("ess1", "STDBY ATTD A")),
    standbyFeedB: Number(pw("main1", "STDBY ATTD B")),
    gia1Pfd: Number(gia1 && E.pfd),
    gia2Mfd: Number(gia2 && E.mfd),
    pfdMfd: Number(E.pfd && E.mfd),
    adahrsPfd: Number(E.ahrs1 && E.pfd),
    adahrs2Mfd: Number(E.ahrs2 && E.mfd),
    magData: Number(E.ahrs1 && pw("ess1", "PFD A")),
    magData2: Number(E.ahrs2 && pw("main2", "PFD B")),
    adahrs1Gia1: Number(E.ahrs1 && gia1),
    adahrs1Gia2: Number(E.ahrs1 && gia2),
    adahrs2Gia1: Number(E.ahrs2 && gia1),
    adahrs2Gia2: Number(E.ahrs2 && gia2),
    geaData1: Number(E.eisPwr && gia1),
    geaData2: Number(E.eisPwr && gia2),
    audioGia1: Number(audio && gia1),
    audioGia2: Number(audio && gia2),
    gcuPfd: Number(keypads && E.pfd),
    gcuMfd: Number(keypads && E.mfd),
    gmcPfd: Number(keypads && E.pfd),
    gmcMfd: Number(keypads && E.mfd),
    xpdrData: Number(xpdr && gia1),
    xmData: Number(weather && E.mfd),
    iridiumData: Number(weather && gia1),
    gatewayData: Number(E.convPwr && gia1),
    wxData: Number(weather && gia2),
    trafficData: Number(pw("avx", "TRAFFIC") && E.ahrs1 && gia2),
    dmeData: Number(pw("avx", "DME/ADF") && gia2),
    com1Coax: Number(pw("ess1", "COM 1")),
    com2Coax: Number(pw("main2", "COM 2")),
    gps1Coax: Number(gia1),
    gps2Coax: Number(gia2),
    navCoax1: Number(gia1),
    navCoax2: Number(gia2),
    xpdrCoax: Number(xpdr),
    speakerAudio: Number(audio),
    microphoneAudio: Number(audio),
    iridiumAudio: Number(weather && audio),
    xmAudio: Number(weather && audio),
    markerCoax: Number(audio),
    pfdCooling: Number(E.fan2),
    mfdCooling: Number(E.fan1),
    iauCooling1: Number(E.fan2),
    iauCooling2: Number(E.fan2),
  };
  return R;
}
