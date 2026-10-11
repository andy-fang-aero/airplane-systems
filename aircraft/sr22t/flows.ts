/** Pipes, wires, ducts and cables with moving particles, plus the rules that drive them. */
import * as THREE from "three";
import { chanOfKey, type FlowSpec } from "@/lib/catalogue";
import { V, type Vec3 } from "@/lib/math";
import type { SysId } from "@/lib/systems";
import { AB, FW, botY, wingP } from "./geometry";
import { COMPRESSOR_INLET, COMPRESSOR_OUTLET } from "./turbo-layout";
import { DUCT7, INTERCOOLER_IN } from "./intercooler-layout";
import { CROSSOVER, TAILPIPE, WASTEGATE_BYPASS, bentRun } from "./exhaust-layout";
import { checkEngineGroups } from "./engine-groups";
import {
  FLAP_DEG,
  acCompressorOn,
  altAirOpen,
  breakerBus,
  extLit,
  fuelAvail,
  live,
  mapInHg,
  pumpSpeed,
  wastegateOpen,
  type Elec,
  type Sim,
} from "./model";
import {
  AC,
  ALT1_TERM,
  ALT2_TERM,
  CYLS,
  injectorAnchor,
  FT,
  GOV,
  EXHAUST_RUN,
  OIL_SCREEN,
  OIL_PUMP,
  OIL_CONTROL,
  OIL_COOLER,
  OIL_SOURCE,
  OIL_CHECK,
  OIL_TEE,
  HEAT_X,
  INDUCTION_Y,
  INTAKE_MANIFOLD,
  AIR_BOX,
  INLET_RUN,
  INTAKE_RUN,
  cylIntake,
  UPPER_DECK_LINE,
  GATE_OIL_RUN,
  COMPRESSOR_RUN,
  ALTERNATE_DUCT,
  INTERCOOLER_AFT,
  PITOT_Z,
  SPX,
  STALL_Z,
  THROTTLE,
  airflowValveOpen,
  butterflies,
  freshValveOpen,
  hotValveOpen,
  valveEnv,
  TURBO,
  TURBO_SCAVENGE,
  pitotBase,
  statR,
  TANK_SPAN,
  tankTop,
  ALT_STATIC,
  OAT_1,
  OAT_2,
  ADAHRS_1,
  ADAHRS_2,
  MD302_POS,
  STATIC_TEE,
  TRAPS,
  SUMPS,
  BAT2_BOX,
  BAT2_SIZE,
  MCU,
  GIA_1,
  GIA_2,
  GEA_71,
  GMA_350,
  PFD_CONN,
  MFD_CONN,
  IAU_FAN,
  XPDR,
  WX_500,
  GTS_800,
  KN_63,
  MAG_WIRES,
} from "./parts";
import { CB_PANEL, FUEL_SELECTOR } from "./parts/cabin";
import { COWL_LOUVERS } from "./parts/cowl";
import { BAT_1, LAND_BALLAST, mcuRelayPos } from "./parts/electrical";
import { cowlLampAxis } from "./parts/lights";
import { OIL_FILTER, OIL_FILTER_ADAPTER, OIL_SUMP, STARTER, TURBO_OIL_RES, cylOrigin } from "./parts/engine";
import { AC_FITTING } from "./parts/aircon";
import {
  BLOWER,
  CABIN_AIR_COUPLER,
  CREW_DISPLAY_VENT,
  CREW_FLOOR_VENT,
  CREW_PANEL_VENT,
  DEFROST_VENT,
  DIST_MANIFOLD,
  FRESH_INLET,
  FRESH_VALVE,
  HOT_VALVE,
  MIX,
  PAX_FLOOR_VENT,
  PAX_PANEL_VENT,
} from "./parts/environment";
import {
  COLLECTOR,
  CYL_DRAIN_CHECK,
  DRAIN_MANIFOLD,
  ENGINE_PUMP,
  FUEL_FLOW,
  FUEL_PUMP,
  GASCOLATOR,
  GASCOLATOR_DRAIN,
  NACA_FUEL_VENT,
  SPIDER,
  SPIDER_DRAIN_PORT,
  SPIDER_INLET,
  spiderOutlet,
} from "./parts/fuel";
import { STALL_COMPUTER, STALL_COMPUTER_PORT, STALL_TRANSDUCER } from "./parts/ice";
import { STALL_SWITCH } from "./parts/pitot";
import { CABLES } from "./rig";

const F: FlowSpec[] = [];
const flow = (key: string, pts: FlowSpec["pts"], sys: SysId[], o: Partial<FlowSpec> = {}) => {
  checkEngineGroups("flow " + key, o.groups);
  return F.push({ key, pts, sys, ...o });
};
/** `p` moved by `d`. */
const off = (p: Vec3, d: Vec3): Vec3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];

// electrical wiring
flow(
  "alt1",
  // Approximate bends: forward of the sump, then aft in the LH lane below the cylinders and above the mount.
  // AMM 13773-002 Rev 7 Fig 24-30-3 item 6, PDF p. 714 gives connectivity, not bend dimensions.
  bentRun(
    [
      ALT1_TERM,
      off(ALT1_TERM, [0, -0.03, 0.03]),
      [3.55, -0.33, 0.25],
      [3.54, -0.34, 0.24],
      [3.46, -0.32, 0.14],
      [3.46, -0.32, -0.26],
      [3.32, -0.3, -0.26],
      [2.68, -0.24, -0.26],
      [2.66, -0.18, -0.24],
      [2.64, -0.12, -0.24],
      off(MCU, [0.02, -0.04, 0.04]),
    ],
    0.008,
  ),
  ["electrical"],
  {
    name: "ALT 1 output",
    note: "6 AWG cable from the ALT 1 power terminal to the MCU; 100 A fuse into Main Distribution Bus 1 (AMM 13773-002 24-30 PDF p. 704; Fig 24-30-3 item 6). Route approximate.",
  },
);
flow("alt2", [ALT2_TERM, [3.3, -0.24, -0.3], [2.9, -0.3, -0.34], off(MCU, [0.02, 0.02, 0])], ["electrical"], {
  name: "ALT 2 output",
  note: "6 AWG cable from the ALT 2 terminals to the MCU; 80 A fuse into Main Distribution Bus 2 (POH 7-49; AMM 13773-002 24-30 PDF p. 704); POH Fig 7-10 (7-48) prints 60 A, the 7-49 text governs. Route approximate.",
});
// along the firewall above the starter and the oil filter, below the wastegate controller's oil return
// and the A/C hoses; route approximate
flow(
  "bat1",
  [off(BAT_1, [0, 0, -0.1]), [2.68, -0.05, 0.12], [2.63, -0.05, 0], [2.63, -0.05, -0.12], off(MCU, [0.01, 0.04, 0.07])],
  ["electrical"],
  {
    name: "BAT 1 feed",
    note: "BAT 1 relay connects the battery to the MCU distribution buses and starter relay.",
  },
);
// electrical distribution: the MCU distribution buses feed the circuit breaker panel buses through 30 A
// fuses, one bundle per distribution bus (POH 7-49). Side by side, they leave the MCU outboard of the DME data path's
// riser, pass between the MAG 2 wiring (magData2) and the traffic data path (trafficData), cross under the throttle
// cable inside the console and reach the back of the panel between the ELT remote switch and the ELT remote cable on the
// floor (parts/cabin.ts). Routes approximate.
(
  [
    ["cbMdb1", "Main Distribution Bus 1", "A/C BUS 1, A/C BUS 2 and MAIN BUS 3"],
    ["cbMdb2", "Main Distribution Bus 2", "NON ESS BUS, MAIN BUS 1 and MAIN BUS 2"],
    ["cbEss", "Essential Distribution Bus", "ESS BUS 1 and ESS BUS 2"],
  ] as const
).forEach(([key, bus, feeds], i) => {
  const z = -0.33 + i * 0.017,
    y = -0.468 - i * 0.017;
  flow(
    key,
    [
      [MCU[0] - 0.04, MCU[1] - 0.06, z],
      [2.58, -0.33, z],
      [2.5, -0.36, z],
      [2.4, -0.4, z],
      // under the throttle cable's bend (parts/engine-air.ts THROTTLE_CABLE)
      [2.2, y - 0.03, -0.1],
      [2.1, y - 0.035, -0.1],
      [2.03, y, -0.088],
      [CB_PANEL[0] + 0.15, y, CB_PANEL[2] + 0.025],
    ],
    ["electrical"],
    {
      name: bus + " → breaker panel",
      note: `The ${bus} in the MCU feeds ${feeds} on the circuit breaker panel through 30 A fuses (SR22T POH 13772-007 7-49). The panel is on the left side of the center console (POH 7-50; AMM 13773-002 24-50 PDF p. 750). Route approximate.`,
      r: 0.005,
    },
  );
});
flow(
  "bat2",
  [
    // terminal on the forward face of the BAT 2 container (parts/electrical.ts)
    [BAT2_BOX[0] + BAT2_SIZE[0] / 2, BAT2_BOX[1], BAT2_BOX[2]],
    // Over the A/C condenser and condenser blower under the baggage floor (parts/aircon.ts). Illustrative.
    [-0.45, -0.46, -0.08],
    [-0.1, -0.455, -0.085],
    [0.3, -0.48, -0.1],
    [0.6, -0.62, -0.12],
    [1.55, -0.55, -0.15],
    // the circuit breaker panel holds the BAT 2 breaker's ESS BUS 1 (parts/cabin.ts); neither is modelled on its own
    off(CB_PANEL, [0, -0.02, -0.01]),
  ],
  ["electrical"],
  {
    name: "BAT 2 feed",
    note: "Through the 20 A BAT 2 circuit breaker to ESS BUS 1 (SR22T POH 13772-007 7-50; AMM 13773-002 24-50 PDF p. 750). Charged from ESS BUS 1 (POH 7-47). Route approximate.",
  },
);
// Starter cable: the starter relay in the MCU switches BAT 1 to the starter (POH Fig 7-10, 7-48; 7-37). The MCU and the
// starter are both on the engine side of the firewall (POH 7-47), so the run stays on the firewall face. Route approximate.
flow(
  "starterCable",
  [
    mcuRelayPos(2),
    // Approximate inboard departure above the buses, down beside them, below the filter adapter to the starter.
    // SR22T POH 13772-007 Fig 7-10, 7-48; neither source dimensions these schematic bends.
    [2.63, -0.01, -0.33],
    [2.63, -0.01, -0.235],
    [2.635, -0.12, -0.22],
    [2.635, -0.25, -0.2],
    [2.635, -0.25, -0.12],
    off(STARTER, [0, 0, -0.065]),
  ],
  ["electrical"],
  {
    name: "Starter cable",
    note: "Starter relay in the MCU → starter (SR22T POH 13772-007 Fig 7-10, 7-48). Carries current only while the key is held at START with STARTER power available: 2 A STARTER circuit breaker on the NON-ESSENTIAL BUS (POH 7-37). Route approximate.",
    r: 0.008,
  },
);
// Landing light feed: LAND energizes the MCU relay, which completes the 28 VDC circuit from Main Distribution Bus 1 to the
// ballast on the firewall (POH 7-57); the lamp lead (landLamp, below) carries it on to the HID lamp in the lower cowl.
flow(
  "landFeed",
  [
    mcuRelayPos(4),
    // Approximate inboard lane beside the MCU buses and ALT 2 regulator; POH 13772-007 7-57, Fig 7-10.
    [2.64, -0.01, -0.24],
    [2.64, -0.2, -0.24],
    off(LAND_BALLAST, [0, 0.045, -0.04]),
  ],
  ["electrical", "lighting"],
  {
    name: "Landing light feed",
    note: "Landing light relay in the MCU → ballast on the firewall: LAND energizes the relay, completing a 28 VDC circuit from Main Distribution Bus 1 through a 7.5 A fuse (SR22T POH 13772-007 7-57, 7-49). The ballast then powers the HID lamp in the lower cowl (POH 7-57) through the lamp lead. Route approximate.",
    r: 0.006,
  },
);
// Landing light lamp lead: ballast → HID lamp. POH 13772-007 7-57 puts the ballast on the firewall and the
// lamp in the lower engine cowl; AMM 13773-002 Rev 7 Fig 33-40-1 (PDF p. 1588; 33-40 p. 7) shows the lamp harness
// running inside the lower cowl to the lamp seated behind its lens in the cowl skin. Neither document dimensions the
// route (and the AMM figure shows the later LED lamp), so the waypoints are approximate: inboard from the ballast's
// inboard face, forward under the oil sump and the alternate air ducts to the lamp's top face, kept 5 mm clear of every
// engine-bay part and tube and of the cowl skin.
flow(
  "landLamp",
  [
    off(LAND_BALLAST, [0, 0, 0.06]),
    [2.64, -0.4, -0.095],
    [2.69, -0.45, -0.04],
    [2.86, -0.47, -0.09],
    [3.49, -0.48, -0.09],
    [3.515, -0.455, -0.07],
    cowlLampAxis(0.045),
    cowlLampAxis(0.015),
  ],
  ["electrical", "lighting"],
  {
    name: "Landing light lamp lead",
    note: "Landing light ballast on the firewall → HID landing light in the lower cowl: the ballast provides the boosted voltage that lights the lamp, live whenever the landing light feed is (SR22T POH 13772-007 7-57). The harness runs inside the lower cowl to the lamp (AMM 13773-002 Fig 33-40-1, PDF p. 1588). Route approximate: neither document dimensions it.",
    r: 0.006,
  },
);

// fuel
const collector = COLLECTOR;
const tankOut = (s: number) => wingP(s * 1.15, 0.35, -1).add(V(0, 0.03, 0));
/** Selector valve port, below the handle (parts/cabin.ts). */
const SELECTOR = off(FUEL_SELECTOR, [0, -0.03, 0]);
// Each feed stays low until it is inside the console, so it rises clear of the seat pans, the GTS 800 and the A/C
// evaporator and blower (parts/cabin.ts, parts/avionics.ts, parts/aircon.ts). Illustrative waypoints.
flow(
  "fuelL",
  [
    tankOut(-1),
    collector(-1),
    [1.165, -0.555, -0.6],
    [1.19, -0.625, -0.5],
    [1.2, -0.625, -0.3],
    [1.22, -0.62, -0.08],
    SELECTOR,
  ],
  ["fuel"],
  {
    name: "Left feed line",
    note: "Collector → selector valve.",
  },
);
flow(
  "fuelR",
  [
    tankOut(1),
    collector(1),
    [1.165, -0.555, 0.6],
    [1.19, -0.625, 0.5],
    [1.2, -0.625, 0.3],
    [1.22, -0.62, 0.08],
    SELECTOR,
  ],
  ["fuel"],
  {
    name: "Right feed line",
    note: "Collector → selector valve.",
  },
);
/** Approximate outboard throttle-metering detour; POH 13772-007 7-43; AMM 13773-002 Rev 7
 * 73-30 PDF p. 2594; Continental M-18 Fig 12-10, p. 12-15. The sources give connectivity, not bend dimensions.
 * Approach the fixed metering-valve anchor from aft/outboard to clear the Y sleeve.
 * The throttle cable ends beside that anchor, so its fitting contact remains unavoidable. */
const FUEL_UPPER_RUN: Vec3[] = [
  ...bentRun(
    [
      [2.99, 0.15, 0.1],
      [3.2, 0.12, 0.1],
      [3.24, 0.12, 0.1],
      [3.27, 0.12, 0.045],
      THROTTLE,
      [3.27, 0.12, 0.045],
      [3.26, 0.11, 0.09],
      [3.25, SPIDER_INLET[1], SPIDER_INLET[2]],
    ],
    0.008,
    [THROTTLE],
  ),
  SPIDER_INLET,
  SPIDER,
]; // approximate, undimensioned routing (AMM 73-30 PDF p. 2594)
/** Approximate detour below the case and aft of the sump/RH cylinders; the source drawings give connectivity,
 * not waypoint dimensions (AMM Fig 28-20-4 PDF p. 1136; 73-30 PDF p. 2594; POH 7-43). */
const FUEL_ENGINE_RUN = bentRun(
  [
    ENGINE_PUMP,
    [2.79, -0.34, -0.07],
    [2.73, -0.34, 0.19],
    [2.73, -0.34, 0.26],
    [2.78, -0.34, 0.29],
    [2.86, -0.32, 0.29],
    FUEL_FLOW,
    [2.77, -0.19, 0.19],
    [2.77, -0.02, 0.19],
    [2.77, -0.01, 0.22],
    [2.8, 0.1, 0.22],
    [2.81, 0.1, 0.262],
    [2.88, 0.11, 0.262],
    [2.93, 0.11, 0.21],
    [2.95, 0.1, 0.15],
    [2.97, 0.13, 0.1],
    [2.99, 0.15, 0.1],
  ],
  0.008,
  [FUEL_FLOW],
); // approximate bend, AMM Fig 28-20-4 (undimensioned)
// Routing is schematic: selector through firewall to electric pump, gascolator and engine (AMM 28-20, PDF p. 1112).
flow(
  "fuelMain",
  [
    SELECTOR,
    [1.4, -0.62, 0.08],
    [1.95, -0.62, 0.24],
    [2.3, -0.645, 0.25],
    [2.5, -0.655, 0.25],
    // Approximate outboard bend clears the brake tee beside the firewall approach.
    // AMM 13773-002 Rev 7 Fig 28-20-4 PDF p. 1136 is undimensioned.
    [2.54, -0.64, 0.27],
    [2.63, -0.6, 0.15],
    FUEL_PUMP,
    GASCOLATOR,
    ...FUEL_ENGINE_RUN.slice(0, -1),
    ...FUEL_UPPER_RUN,
  ],
  ["fuel", "engine"],
  {
    name: "Fuel supply",
    note: "Selector → firewall → electric fuel pump → gascolator → engine-driven pump / mixture control → transducer → throttle metering valve → fuel manifold valve → nozzles (POH 13772-007 7-38, 7-43; AMM 13773-002 Rev 7 28-00, PDF p. 1078; 28-20, PDF p. 1112). Under-floor fuselage supply tube (AMM 28-10, PDF p. 1088; Fig 28-20-4, PDF p. 1136). Geometry approximate.",
    r: 0.014,
    groups: ["fuel"],
  },
);
// Two drawn branches show the selector routing return fuel to the selected tank (POH 7-40, Fig 7-8).
[-1, 1].forEach((side) =>
  flow(
    side < 0 ? "fuelRetL" : "fuelRetR",
    [
      ENGINE_PUMP,
      [2.792, -0.315, -0.1065], // approximate: retain the pump departure tangent, AMM Fig 28-20-3 PDF p. 1131
      // Approximate aft/inboard pass beside the gascolator; POH Fig 7-8; AMM Fig 28-20-3 PDF p. 1131.
      [2.68, -0.46, 0.145],
      [2.68, -0.57, 0.15],
      [FW + 0.03, -0.6, 0.15],
      [FW - 0.035, -0.6, 0.15],
      // Into the console from below; out under it and the tail harness (parts/electrical-harness.ts), up aft of
      // the GTS 800, then under the seat pans (parts/cabin.ts) and over the collector tank, under the OAT 2 wiring.
      // Illustrative waypoints.
      [1.6, -0.524, 0.17],
      [1.3, -0.5, 0.09],
      SELECTOR,
      [1.2, -0.53, 0],
      [1.1, -0.53, side * 0.16],
      [1.1, -0.465, side * 0.25],
      [1.1, -0.461, side * 0.36],
      [1.1, -0.485, side * 0.6],
      [1.11, -0.48, side * 0.72],
      tankTop(side),
    ],
    ["fuel"],
    {
      name: side < 0 ? "Left fuel return" : "Right fuel return",
      note: "Excess fuel → selector → selected tank (POH 13772-007 7-40, Fig 7-8). Return enters the tank top (AMM 13773-002 Rev 7 28-10, PDF p. 1088); supply and return fittings pass through the firewall enclosure (Fig 28-20-3 items 10, 15–16, PDF p. 1131). Routing and particle speed illustrative.",
      r: 0.009,
    },
  ),
);
/** Injector tubes leave the manifold valve on top of the induction manifold, run out over the manifold to each bank and
 * drop onto each nozzle (AMM Fig 71-00-2 sheet 1 item 4, PDF p. 2487; Continental M-18 Fig 12-10, p. 12-15;
 * Fig 17-39, p. 17-71). The run height clears the crankcase top and the cylinder fins. Each line stays on the manifold
 * valve's side of its own intake pipe, so it never crosses that pipe. Height and offsets are illustrative. */
const INJ_LINE_Y = -0.005;
const INJ_LINE_OFFSET = 0.045;
/** Lines drop from the valve to a fan just outboard of the manifold tube, under the throttle cable and the deck-pressure
 * line, then run out to each bank. */
const INJ_FAN_Y = 0.055;
const INJ_FAN_Z = 0.085;
const INJ_FAN_SPREAD = 1;
const injectorLine = (c: { x: number; s: number }): Vec3[] => {
  const nozzle = injectorAnchor(c);
  const x = c.x + Math.sign(SPIDER[0] - c.x) * INJ_LINE_OFFSET;
  return [
    SPIDER,
    spiderOutlet(x, c.s),
    [SPIDER[0] + INJ_FAN_SPREAD * (x - SPIDER[0]), INJ_FAN_Y, c.s * INJ_FAN_Z],
    [x, INJ_LINE_Y, c.s * 0.18],
    [nozzle[0], INJ_LINE_Y, nozzle[2]],
    nozzle,
  ];
};
CYLS.forEach((c) =>
  flow("inj" + c.n, injectorLine(c), ["fuel", "engine"], {
    name: "Injector line, cyl " + c.n,
    note: "Fuel manifold valve to cylinder-head nozzle (POH 7-38; AMM 73-00 PDF p. 2582; Fig 71-00-2 sheet 1 PDF p. 2487). Out of the valve on top of the intake manifold (Continental M-18 Fig 12-10, p. 12-15), over the engine and down onto the nozzle (M-18 Fig 17-39, p. 17-71). Routing and bore approximate.",
    r: 0.007,
    count: 5,
    tension: 0,
    groups: ["fuel"],
  }),
);

// fuel distribution drains: dry static plumbing, not supply lines.
const DRAIN = DRAIN_MANIFOLD; // AMM 28-20 PDF 1113; approximate.
const CYL_COLLECTOR: Vec3 = [3.05, -0.42, 0]; // Schematic hose junction, not the check-valve mounting position.
const CYL_CHECK = CYL_DRAIN_CHECK; // AMM Fig 71-70-2 detail A item 12, PDF p. 2565.
/** The manifold valve drain leaves its aft side, runs downhill aft over the induction manifold, under the A/C suction line and out over the right
 * magneto, then drops between the crankcase and cylinder 1, outboard of the slinger supply line and inboard of the mount isolator. Above the
 * heat duct it moves inboard of it and of the turbo scavenge lines, drops forward of the mount's lower cross tube, then runs aft
 * inside the lower cowl into the firewall drain manifold
 * (AMM 28-20, PDF p. 1113; Fig 71-70-2, PDF p. 2565). Waypoints approximate because the figure is undimensioned; the final bend stays inside the POH 13772-007 Fig 1-1 (p. 1-4) lower cowl. They keep the whole drain 5 mm off every part and rendered tube. */
const SPIDER_DRAIN_RUN: Vec3[] = [
  [2.8, SPIDER_DRAIN_PORT[1] - 0.009, SPIDER_DRAIN_PORT[2]],
  [2.79, SPIDER_DRAIN_PORT[1] - 0.009, 0.17],
  [2.79, -0.45, 0.17],
  [2.795, -0.465, 0.11],
  [2.797, -0.475, 0.05],
  [2.797, -0.635, 0.05],
  [2.705, -0.635, 0.02],
];
const drain = (key: string, pts: FlowSpec["pts"], name: string, ref = "Fig 71-70-2, PDF p. 2565") =>
  flow(key, pts, ["fuel", "engine"], {
    name,
    note:
      "Drain to bottom-centre firewall manifold, not a fuel feed (AMM 13773-002 Rev 7 28-20, PDF p. 1113; " +
      ref +
      "). Routing and bore approximate. Static dry hose; no particles.",
    r: 0.004,
    color: "#806B53",
    count: 0,
    tension: 0,
    groups: ["fuel"],
  });
drain("fuelDrainAux", [off(FUEL_PUMP, [0, -0.04, 0]), [2.72, -0.63, 0.22], DRAIN], "Auxiliary pump drain");
drain(
  "fuelDrainGas",
  [off(GASCOLATOR, [0, -0.05, 0]), [2.73, -0.63, 0.08], DRAIN],
  "Gascolator bowl drain tube",
  "Fig 28-20-1 items 7–11, PDF p. 1116",
);
// Approximate departure aft of the mixture-cable end, AMM Fig 71-70-2 PDF p. 2565.
drain(
  "fuelDrainEngine",
  [ENGINE_PUMP, [2.815, -0.293, -0.145], [2.81, -0.34, -0.16], [2.76, -0.56, -0.12], DRAIN],
  "Engine-driven pump drain",
);
drain("fuelDrainSpider", [SPIDER_DRAIN_PORT, ...SPIDER_DRAIN_RUN, DRAIN], "Injection manifold drain");
/** The rear cylinders (1, 2) sit over their bank's turbocharger transition and the crossover legs: their drains run
 * inboard above the transition first, then down inboard of the crossover. Approximate. */
const REAR_DRAIN_Z = 0.18; // approximate: outside the case, AMM Fig 71-70-2 PDF p. 2565
CYLS.forEach((c) =>
  drain(
    "fuelDrainCyl" + c.n,
    [
      off(cylOrigin(c), [0, -0.1, c.s * 0.08]),
      ...(c.n <= 2
        ? ([
            [c.x, -0.29, c.s * REAR_DRAIN_Z], // approximate, above the transition
            [c.x, -0.44, c.s * REAR_DRAIN_Z], // approximate, below the slinger hose
          ] as Vec3[])
        : ([[c.x, c.s > 0 ? -0.44 : -0.42, c.s * 0.26]] as Vec3[])),
      // Approximate RH drain under the slinger line, AMM Fig 71-70-2 PDF p. 2565.
      ...(c.s > 0 ? ([[CYL_COLLECTOR[0], -0.44, 0.07]] as Vec3[]) : []),
      CYL_COLLECTOR,
    ],
    "Cylinder " + c.n + " drain → collector",
  ),
);
// Approximate lower-cross-member bypass inside the cowl; undimensioned AMM
// Fig 71-70-2 (PDF p. 2565), POH Fig 1-1 (p. 1-4) loft; retain 5 mm mount clearance.
drain(
  "fuelDrainHeads",
  [CYL_COLLECTOR, [2.87, -0.59, 0], [2.82, -0.635, 0], [2.705, -0.635, -0.05], CYL_CHECK, DRAIN],
  "Cylinder drain collector → check valve → firewall",
  "Fig 71-70-2 detail A item 12, PDF p. 2565",
);
drain(
  "fuelDrainOutlet",
  [DRAIN, GASCOLATOR_DRAIN],
  "Gascolator preflight drain valve",
  "Fig 28-20-1 items 7–11, PDF p. 1116",
);

// fuel storage: vents
[1, -1].forEach((s) => {
  const side = s > 0 ? "R" : "L";
  // Approximate outboard top fitting: POH 13772-007 Fig 7-8 (p. 7-42); AMM 13773-002 Rev 7
  // 28-10 pp. 1–2 (PDF 1088–1089), Fig 28-10-3 items 6–7 (PDF 1105), Fig 6-00-7 (PDF 124).
  // Undimensioned station; 0.85 matches the illustrative tank loft in Airplane.tsx, not a manual dimension.
  const mean = wingP(s * TANK_SPAN[1], 0.45, 0);
  const top = mean.lerp(wingP(s * TANK_SPAN[1], 0.45, 1), 0.85);
  // The right vent bends aft of the RH-wing GMU 44 magnetometers (parts/avionics.ts) instead of through them.
  const bend = s > 0 ? wingP(4.8, 0.55, 0).lerp(wingP(4.8, 0.55, 1), 0.4) : wingP(-4.8, 0.45, 0);
  flow("fuelVent" + side, [top, bend, NACA_FUEL_VENT(s)], ["fuel"], {
    name: (s > 0 ? "Right" : "Left") + " tank vent line",
    note: "Connects the tank top and the outboard lower-skin NACA scoop (POH 13772-007 7-40; AMM 13773-002 Rev 7 28-10, PDF pp. 1088–1089, Fig 28-10-3 items 6–7, PDF p. 1105; Fig 6-00-7 LW10/RW10, PDF p. 124). Fuel-resistant plastic; no moisture-trapping low points. The vent line maintains positive tank pressure (POH 7-40); no source gives a vent flow rate, so the line is drawn static. Top fitting station and 0.85 thickness fraction approximate: the figures are undimensioned; fraction matches the rendered tank bay. Routing and bore illustrative.",
    r: 0.006,
    tension: 0,
  });
  flow("collectorVent" + side, [off(collector(s), [0, 0.035, 0]), tankTop(s)], ["fuel"], {
    name: (s > 0 ? "Right" : "Left") + " collector vent",
    note: "Connects the collector top and the associated tank inboard rib (POH 13772-007 7-40, Fig 7-8, 7-42; AMM 13773-002 Rev 7 28-10, PDF p. 1089, Fig 28-10-3 item 3, PDF p. 1105). Neither source gives a flow direction, so the line is drawn static. Routing and bore illustrative.",
    r: 0.006,
    tension: 0,
  });
});

// induction & exhaust: NACA duct → air box → turbocharger compressor → intercooler → "Y" junction → throttle body → intake
// manifold → intake pipes (top induction); cylinders → header → turbocharger turbine → tailpipe (bottom exhaust) (POH 7-37, 7-38)
const AIR_IN: Partial<FlowSpec> = { tube: false, pcolor: "#8FD3E8", size: 0.07, groups: ["induction"] };
const EXH = { r: 0.016, color: "#8A5A3C", pcolor: "#FF8A4A" } as const;
const PLENUM = INTAKE_MANIFOLD;
// three segments per side: the NACA inlet stops when the filter is blocked, while the air box onward keeps flowing
// on alternate air (POH 7-37); the inlet runs along the drawn inlet duct, through the air box's forward face into the
// filter housing
[1, -1].forEach((s) =>
  flow(s > 0 ? "inletR" : "inletL", [...INLET_RUN(s), AIR_BOX(s)], ["engine"], { ...AIR_IN, tension: 0 }),
);
[1, -1].forEach((s) => {
  const side = s > 0 ? "R" : "L";
  flow(
    "intake" + side,
    [off(COMPRESSOR_INLET(s), [0.003, 0, 0]), off(COMPRESSOR_INLET(s), [-0.003, 0, 0])],
    ["engine"],
    {
      ...AIR_IN,
      name: "Air box → compressor",
      note: "POH 7-37; AMM Fig 81-00-1 PDF p. 2810. Routing approximate.",
    },
  );
  flow(
    "compressor" + side,
    [
      // along the drawn intercooler inlet duct, up into the aft hood from below
      COMPRESSOR_OUTLET(s),
      ...COMPRESSOR_RUN(s),
      // forward through the core, out of the forward neck
      [INTERCOOLER_IN(s)[0] + 0.02, INTERCOOLER_IN(s)[1] + 0.035, INTERCOOLER_IN(s)[2]],
      // duct 7 forward, inboard and up across the front of the cylinders to the "Y" junction (AMM Fig 71-60-2 sheet 2):
      // the drawn duct's own centreline, from the neck spigot (INTERCOOLER_OUT)
      ...DUCT7(s),
      INDUCTION_Y,
      THROTTLE,
    ],
    ["engine"],
    {
      ...AIR_IN,
      name: "Compressor → intercooler → Y junction",
      note: "POH 7-37; AMM Fig 81-20-1 PDF p. 2815 (coupler 9 to the induction tube); Fig 71-60-2 PDF pp. 2557–2558 (duct into the intercooler's aft end from below, forward neck to duct 7). Along the drawn ducts; routing approximate.",
    },
  );
});
// the alternate air assembly feeds both air boxes when its door is open (POH 7-37)
[1, -1].forEach((s) =>
  flow(s > 0 ? "altAirR" : "altAirL", ALTERNATE_DUCT(s), ["engine"], {
    r: 0.02,
    tension: 0,
    color: "#8A969E",
    pcolor: "#D9C27A",
    count: 4,
    name: "Alternate air tube",
    note: "Alternate air assembly → air box; unfiltered cowl air when the door is open (POH 7-37).",
    groups: ["induction"],
  }),
);
// ends at the manifold's aft end (parts/engine-air.ts)
flow("manifold", [THROTTLE, PLENUM, off(PLENUM, [-0.34, -0.01, 0])], ["engine"], {
  r: 0.022,
  color: "#8A969E",
  pcolor: "#8FD3E8",
  count: 5,
  name: "Intake manifold",
  note: "From the throttle body, divided by the intake pipes to each cylinder (POH 7-37).",
  groups: ["induction"],
});
CYLS.forEach((c) =>
  flow("man" + c.n, [...INTAKE_RUN(c).slice(0, -1), cylIntake(c)], ["engine"], {
    r: 0.01,
    tension: 0,
    color: "#8A969E",
    pcolor: "#8FD3E8",
    count: 4,
    name: "Intake pipe",
    note: "Intake manifold → cylinder (POH 7-37).",
    groups: ["induction"],
  }),
);
CYLS.forEach((c) =>
  flow("exh" + c.n, EXHAUST_RUN(c), ["engine"], {
    ...EXH,
    count: 4,
    tension: 0,
    name: "Header → turbine inlet",
    note: "Slip-jointed elbow riser / tee / turbocharger transition → turbine inlet (POH 13772-007 7-38; AMM 13773-002 Rev 7 Fig 78-10-2 PDF p. 2740). Routing approximate.",
    groups: ["exhaust"],
  }),
);
[1, -1].forEach((s) =>
  flow(s > 0 ? "tailpipeR" : "tailpipeL", TAILPIPE(s), ["engine"], {
    ...EXH,
    r: 0.024,
    name: "Exhaust tailpipe",
    note: "Turbine discharge → overboard through the lower cowling; no muffler (POH 7-38).",
    ext: true,
    groups: ["exhaust"],
  }),
);
flow("crossover", CROSSOVER, ["engine", "environment"], {
  ...EXH,
  r: 0.02,
  tension: 0,
  name: "Exhaust crossover",
  note: "Crossover pipe joining the LH and RH header assemblies, through the cabin heat exchanger (AMM 78-00).",
  groups: ["exhaust"],
});
flow(
  "oil",
  [
    OIL_SUMP,
    OIL_SCREEN,
    OIL_PUMP,
    // up through the adapter on the pump housing into the vertical spin-on filter, then out to the cooler's control
    // valve below the cooler (Continental M-18 Fig 13-10 PDF p. 374)
    OIL_FILTER_ADAPTER,
    OIL_FILTER,
    [2.712, -0.12, -0.19],
    OIL_CONTROL,
    OIL_COOLER,
    // into the case outboard of and below the left magneto, which sits forward of the accessory face
    // Approximate gallery approach below the magneto before rising inside the case; POH 7-36;
    // AMM 13773-002 Rev 7 79-00 PDF p. 2764 gives the circuit, not waypoint dimensions.
    [2.75, -0.08, -0.13],
    [2.89, -0.08, 0],
    [2.95, -0.02, 0],
    [3.35, -0.02, 0],
    GOV,
  ],
  ["engine", "propeller"],
  {
    r: 0.01,
    color: "#B85A2A",
    name: "Oil circuit",
    note: "Sump → suction strainer → pump (relief valve at its outlet) → full-flow filter → engine-mounted oil cooler (bypassed below about 180 °F) → galleries, and to the propeller governor (SR22T POH 13772-007 7-36; AMM 13773-002 Rev 7 79-00 PDF p. 2764). Routing schematic and particle rates illustrative.",
    groups: ["oil"],
  },
);

// environmental: POH 7-64 … 7-66, Fig 7-13; AMM 21-20, 21-40 (Fig 21-40-2), 21-60
const AIR = "#149C94";
/** Heated air dumped into the engine compartment leaves through the RH cowl exit louvers (parts/cowl.ts; POH 7-38). */
const LOUVERS_R = COWL_LOUVERS(1);
/** Intercooler-port heat ducts: 20 mm radius (illustrative) so each leaves its rear-port nozzle between BAT 1 and the
 * cowl skin. */
const HEAT_DUCT_R = 0.02;
/** Heat-duct pass through the shroud: on the aft side of the crossover, 0.05 m off its axis (approximate), so the
 * Ø0.04-m duct clears the Ø0.04-m crossover pipe (7 mm on the drawn curve). It reads as the annular
 * pass, its aft edge 10 mm outside the Ø0.12-m shroud. AMM Fig 21-40-2 PDF p. 495 shows the shroud ducts clamped to the
 * heat exchanger, undimensioned. */
const SHROUD_PASS = 0.05;
/** The heat-exchanger shroud's inboard end, where the ducts enter it, reached from aft of the engine (Both
 * rear ports sit at the accessory face). */
const SHROUD_IN: Vec3 = [HEAT_X[0] - SHROUD_PASS, HEAT_X[1], HEAT_X[2] - 0.1];
/** The heated air leaves the shroud aft at the heat exchanger's station. */
const SHROUD_OUT: Vec3 = [HEAT_X[0] - SHROUD_PASS, HEAT_X[1], HEAT_X[2]];
/** Where the LH duct meets the RH one: aft of the nose-gear support's rise and below its fore-aft run, clear of
 * the turbo scavenge lines and the fuel drains. Illustrative. */
// First shared waypoint: render the downstream trunk once. POH 7-64; AMM 21-40 PDF p. 486,
// Fig 21-40-2. Coordinates approximate: neither source dimensions this junction.
const HEAT_DUCT_JOIN: Vec3 = [2.73, -0.525, -0.04];
// each inlet duct is split at its valve: the inlet side runs up to the valve, the chamber side only flows when the valve
// admits air (flowRates)
flow(
  "freshIn",
  // outboard of the RH air box and turbo, inboard of the engine mount's side frame. The duct starts on the
  // inlet's inner face, 29 mm inboard (its 25 mm radius plus clearance), so it stays inside the POH 13772-007 Fig 1-1
  // (p. 1-4) cowl loft behind the NACA inlet; approximate, the AMM 21-00 gives no duct dimensions.
  [off(FRESH_INLET, [-0.01, 0, -0.029]), [3.1, -0.46, 0.44], [2.9, -0.46, 0.44], [2.79, -0.45, 0.43], FRESH_VALVE],
  ["environment"],
  {
    r: 0.025,
    color: AIR,
    pcolor: "#5FC8F0",
    name: "Fresh-air duct",
    note: "NACA inlet → fresh-air valve on the forward firewall → mixing chamber (POH 7-64, 7-65).",
  },
);
// both valves open into the mixing chamber (parts/environment.ts)
flow("fresh", [FRESH_VALVE, off(MIX, [0.02, 0.03, 0.03])], ["environment"], {
  r: 0.025,
  color: AIR,
  pcolor: "#5FC8F0",
});
// RH intercooler rear port → down between BAT 1 and the cowl, under the A/C hoses and the starter, between the starter
// and the throttle cable → under the engine to the crossover-tube heat exchanger → hot-air valve → mixing
// chamber (POH 7-64; AMM Fig 21-40-2 PDF p. 486). The rear port sits at the accessory face (Continental
// M-18 Fig 5-33), so the duct stays aft of the turbos and the mount's aft feet. Waypoints illustrative.
flow(
  "hotIn",
  [
    INTERCOOLER_AFT(1),
    [2.725, -0.09, 0.462],
    [2.72, -0.2, 0.46],
    [2.715, -0.25, 0.42],
    [2.7, -0.25, 0.35],
    [2.68, -0.25, 0.2],
    // under the starter along the firewall, aft of the mixture cable: the vertical oil filter now stands where the duct
    // crossed over the starter
    [2.645, -0.33, 0.15],
    [2.64, -0.335, 0.02],
    [2.66, -0.345, -0.055],
    [2.695, -0.35, -0.075],
    [2.7, -0.45, -0.085],
    [2.725, -0.52, -0.075],
    HEAT_DUCT_JOIN,
    [2.76, -0.525, 0],
    [SHROUD_IN[0], -0.52, 0],
    SHROUD_IN,
    SHROUD_OUT,
    [2.8, -0.52, 0.14],
    [2.73, -0.525, 0.17],
    HOT_VALVE,
  ],
  ["environment"],
  {
    r: HEAT_DUCT_R,
    color: "#E0522B",
    pcolor: "#FF7A3D",
    name: "Heat duct",
    note: "Ram air from the rear ports of both intercoolers (the nozzle on each intercooler's aft hood, AMM Fig 71-60-2 sheet 2 item 19) → crossover-tube heat exchanger → hot-air valve → mixing chamber (POH 7-64; AMM 21-40 PDF p. 486, Fig 21-40-2). Routing illustrative.",
  },
);
flow("hot", [HOT_VALVE, off(MIX, [0.02, -0.02, -0.02])], ["environment"], {
  r: 0.025,
  color: "#E0522B",
  pcolor: "#FF7A3D",
});
// LH intercooler rear port → down the aft left of the engine, outboard of the MCU and above the wastegate actuator,
// under the engine → joins the RH duct, which alone continues into the shroud (POH 7-64: "the rear ports of the intercoolers"; AMM 21-40 PDF 486,
// Fig 21-40-2). Waypoints illustrative.
flow(
  "hotL",
  [
    INTERCOOLER_AFT(-1),
    [2.725, -0.09, -0.463],
    [2.71, -0.2, -0.46],
    [2.7, -0.33, -0.4],
    [2.7, -0.36, -0.2],
    [2.698, -0.4, -0.1],
    [2.71, -0.48, -0.08],
    HEAT_DUCT_JOIN,
  ],
  ["environment"],
  {
    r: HEAT_DUCT_R,
    color: "#E0522B",
    pcolor: "#FF7A3D",
    name: "Heat duct",
  },
);
// valves closed: the air exits into the engine compartment and leaves with the engine cooling airflow (POH 7-64, 7-65)
flow("hotDump", [HOT_VALVE, [2.84, -0.57, 0.3], off(LOUVERS_R, [0.03, 0, 0.06])], ["environment"], {
  tube: false,
  pcolor: "#FF7A3D",
  size: 0.05,
  name: "Hot air dumped overboard",
  note: "With the hot-air valve closed the heated air exits into the engine compartment and is exhausted overboard with the engine cooling airflow (POH 7-64).",
});
flow("freshDump", [FRESH_VALVE, [2.84, -0.5, 0.46], off(LOUVERS_R, [0.03, 0.02, 0.05])], ["environment"], {
  tube: false,
  pcolor: "#5FC8F0",
  size: 0.05,
  name: "Fresh air dumped overboard",
  note: "With the fresh-air valve closed the air exits into the engine compartment and is exhausted overboard with the engine cooling airflow (POH 7-65).",
});
/** Distribution manifold (parts/environment.ts), above the aileron push rod and sector. */
const E0 = DIST_MANIFOLD;
// through the firewall into the cabin air coupler (duct temperature sensor), up the right side aft of the aileron push rod
// (x 2.54, y −0.2), into the manifold's right end
flow("toMan", [MIX, CABIN_AIR_COUPLER, [2.46, -0.3, 0.24], [2.5, -0.12, 0.2], E0], ["environment"], {
  r: 0.03,
  color: AIR,
  name: "Mixing chamber → manifold",
  note: "Mixing chamber air ducted directly into the distribution system; with the A/C selected it goes through the evaporator assembly instead and this duct carries nothing (POH 7-64; AMM 21-50 PDF p. 496).",
});
// blower on the evaporator assembly under the RH crew seat → forward along the floor between the RH pedals → manifold
// bottom (POH Fig 7-13; AMM 21-20; AMM Fig 21-50-1 sheet 3, PDF p. 521)
flow(
  "fanDuct",
  [
    off(BLOWER, [0.06, 0, 0]),
    [1.7, -0.63, 0.2],
    [2.3, -0.56, 0.25],
    [2.47, -0.35, 0.12],
    off(E0, [-0.02, -0.06, 0.05]),
  ],
  ["environment"],
  {
    r: 0.022,
    color: AIR,
    name: "Fan duct",
    note: "Blower → distribution manifold with the A/C off; the blower runs at airflow 1, 2 and 3 (POH 7-65, Fig 7-13; AMM 21-20 PDF p. 454). With the A/C selected the blower, mounted on the evaporator assembly, pushes all its air through the evaporator duct instead (AMM 21-50 PDF pp. 496, 504; Fig 21-50-1 sheet 3 items 24, 30, 31, PDF p. 521).",
  },
);
// Outlet ducts, all from the distribution manifold, each ending at its outlet's anchor in parts/environment.ts (AMM 21-20
// PDF pp. 460–463; Fig 21-20-1 sheet 1, PDF p. 474). Routings between the ends are illustrative.
// crew display ducts (items 16, 17) to the outboard instrument-panel vents: the LH one below and outboard of ADAHRS 1, the RH
// one between the GEA 71 (below, outboard) and GIA 2 (above, inboard); clearance tested
flow(
  "panelL",
  [E0, [2.45, -0.06, -0.2], [2.36, 0, -0.4], [2.31, 0.133, -0.413], CREW_DISPLAY_VENT(-1)],
  ["environment"],
  {
    r: 0.018,
    color: AIR,
    name: "Crew display duct",
    note: "Distribution manifold → crew display air vent on the outboard instrument panel; always fed (AMM 21-20 PDF p. 461; POH 7-66).",
  },
);
flow(
  "panelR",
  [E0, [2.47, -0.04, 0.15], [2.36, 0.06, 0.2], [2.31, 0.133, 0.222], CREW_DISPLAY_VENT(1)],
  ["environment"],
  {
    r: 0.018,
    color: AIR,
    name: "Crew display duct",
  },
);
// crew panel ducts (items 3, 14; 22T-1460, 1471, 1473 thru 22T-9749 only) to the bolster vents, beside the avionics stack
for (const s of [-1, 1]) {
  const [x, y, z] = CREW_PANEL_VENT(s);
  flow(s < 0 ? "panelL2" : "panelR2", [E0, [2.4, -0.09, z], [x + 0.03, y, z], [x, y, z]], ["environment"], {
    r: 0.016,
    color: AIR,
    name: "Crew panel duct",
    note: "Distribution manifold → crew panel air vent in the bolster trim, serials 22T-1460, 22T-1471, 22T-1473 thru 22T-9749; always fed (AMM 21-20 PDF pp. 454, 460; POH 7-66).",
  });
}
// passenger panel ducts (items 6, 9), secured to the console and fuselage, aft along the floor and up the side trim
for (const s of [-1, 1]) {
  const [x, y, z] = PAX_PANEL_VENT(s);
  flow(
    s < 0 ? "armL" : "armR",
    // Over the brake bulkhead fitting and the TKS filter assembly, and up aft of the roll cage hoop
    // (parts/gear.ts, parts/ice.ts, parts/structure.ts). Illustrative waypoints.
    [
      E0,
      [1.8, -0.62, s * 0.45],
      [1.3, -0.62, s * 0.5],
      [1.02, -0.52, s * 0.555],
      [0.85, -0.42, s * 0.57],
      [0.68, -0.33, s * 0.6],
      [0.68, -0.1, s * 0.6],
      [x, y, z],
    ],
    ["environment"],
    {
      r: 0.014,
      color: AIR,
      name: "Passenger panel duct",
      note: "Distribution manifold → passenger panel (armrest) air vent; always fed (AMM 21-20 PDF p. 462; POH 7-66).",
    },
  );
}
// crew floor ducts (items 2, 15) down to the vent under each kick plate
for (const s of [-1, 1]) {
  const [x, y, z] = CREW_FLOOR_VENT(s);
  // Turns outboard forward of the LH avionics (IAU) cooling fan (parts/avionics.ts). Illustrative waypoint.
  flow(
    s < 0 ? "floorF" : "floorF2",
    [E0, [2.42, -0.15, s * 0.2], [2.4, -0.15, z], [x + 0.02, -0.15, z], [x, y, z]],
    ["environment"],
    {
      r: 0.014,
      color: AIR,
      name: "Crew floor duct",
      note: "Distribution manifold → crew floor air vent under the kick plate; fed when the floor butterfly is open (AMM 21-20 PDF p. 462; POH 7-66).",
    },
  );
}
// passenger floor ducts (items 7, 8) aft along the floor, outboard of the evaporator, then up into the trim's armrest bulge and
// down to its sleeve from above (Fig 21-20-1 sheet 6 Detail I); routing illustrative
for (const s of [-1, 1]) {
  const [x, y, z] = PAX_FLOOR_VENT(s);
  flow(
    s < 0 ? "floorR" : "floorR2",
    // the under-floor waypoint sits 40 mm inboard of the curved belly (POH 13772-007 Fig 1-1 loft, p. 1-4);
    // approximate
    [E0, [1.8, -0.62, s * 0.43], [1.0, -0.62, s * 0.52], [0.86, -0.4, z], [x + 0.03, -0.4, z], [x, y, z]],
    ["environment"],
    {
      r: 0.014,
      color: AIR,
      name: "Passenger floor duct",
      note: "Distribution manifold → passenger floor air vent (foot-warmer diffuser) in the rear cabin side trim; fed when the floor butterfly is open (AMM 21-20 PDF p. 463; POH 7-66).",
    },
  );
}
// defrost duct (item 1) up to the defrost vent on the glareshield C-channel; defrost2 spreads along the slot
flow(
  "defrost",
  // Rises outboard of GIA 2 instead of through the GSU 75 ADAHRS 2 between the GIAs (parts/avionics.ts).
  // Final approach into the underside of the compact diffuser: AMM 13773-002 Fig 21-20-1
  // sheet 2 Detail A (PDF p. 475). Undimensioned figure; coordinates approximate.
  [E0, [2.5, 0, 0.02], [2.49, 0.01, 0.145], [2.46, 0.14, 0.15], [2.42, 0.27, 0.08], [2.36, 0.3, 0], [2.32, 0.322, 0]],
  ["environment"],
  {
    r: 0.018,
    color: AIR,
    name: "Windshield diffuser duct",
    note: "Distribution manifold → underside of the compact windshield diffuser under the glareshield (POH 13772-007 7-64; AMM 13773-002 21-20 p. 17, PDF p. 470; Fig 21-20-1 sheet 2 Detail A, PDF p. 475). Final approach coordinates approximate: the figure is undimensioned. Fed when the defrost butterfly is open (POH 7-66).",
  },
);
// Particle-only air along the glareshield slot (POH 13772-007 7-64, 7-66; AMM Fig 21-20-1
// sheet 2 Detail A, PDF p. 475). Slot extent approximate: the figure gives no dimensions.
flow(
  "defrost2",
  [[DEFROST_VENT[0], DEFROST_VENT[1], -0.25], DEFROST_VENT, [DEFROST_VENT[0], DEFROST_VENT[1], 0.25]],
  ["environment"],
  { tube: false, r: 0.018, color: AIR },
);

// air conditioning: R134A loop compressor → condenser → receiver-drier → expansion valve → evaporator →
// compressor (POH 7-65; AMM 21-50 PDF p. 496). The compressor hoses start on its head fittings (parts/aircon.ts), pass
// the firewall and run aft along the RH side (the RH cabin trim comes off to reach them, AMM 21-50 PDF pp. 503,
// 506–507); routing approximate. Hose sizes 1/2 in (discharge)
// and 5/8 in (suction) are matched by fitting torque (AMM 21-50 PDF pp. 501, 505, 509). The 3/8 in hose's 120–160 in-lb
// torque (PDF p. 514) matches the receiver-drier-to-condenser fitting (PDF p. 517), so the liquid lines are drawn ~3/8 in.
const REFRIG = { color: "#7E8A93", count: 10 };
flow(
  "acDischarge",
  [
    AC_FITTING.discharge,
    // forward off the head, down outboard of the left cap-departure leads and inboard of the oil filler, aft under the
    // compressor, inboard under the A/C drive unit forward of the belt plane, aft inboard of the belt to the firewall,
    // down the RH firewall inboard of BAT 1 and outboard under it (AMM 21-50 PDF pp. 499, 501; Fig
    // 21-50-1 sheet 2 PDF p. 520); approximate
    [2.827, 0.115, -0.215],
    [2.827, 0.04, -0.218],
    [2.81, -0.009, -0.218],
    [2.75, -0.009, -0.22],
    [2.695, -0.009, -0.215],
    [2.68, -0.057, -0.19],
    [2.68, -0.057, 0.05],
    [2.68, -0.009, 0.075],
    [2.636, -0.009, 0.11],
    [2.636, -0.009, 0.14],
    [2.645, -0.02, 0.19],
    [2.648, -0.2, 0.19],
    [2.66, -0.2, 0.3],
    [2.68, -0.19, 0.44],
    [2.61, -0.3, 0.48],
    [2.4, -0.45, 0.5],
    [1.5, -0.5, 0.54],
    [0.7, -0.5, 0.54],
    [0.15, -0.5, 0.42],
    [-0.05, -0.5, 0.2],
    AC.condenser,
  ],
  ["environment"],
  {
    ...REFRIG,
    r: 0.0064,
    pcolor: "#FF9A6A",
    name: "A/C discharge line",
    note: "Hot, high-pressure vapor from the compressor to the condenser under the baggage floor (POH 7-65; AMM 21-50 PDF p. 496); 1/2 in compressor hose: its 180–240 in-lb fitting torque matches the condenser-to-compressor joint at the plumbing bulkhead (AMM 21-50 PDF pp. 501, 509).",
  },
);
flow("acLiquid", [AC.condenser, [-0.18, AC.receiver[1] - 0.02, 0.08], AC.receiver], ["environment"], {
  ...REFRIG,
  r: 0.005,
  pcolor: "#5FA8F0",
  name: "A/C condenser → receiver-drier",
  note: "Liquid refrigerant from the condenser to the receiver-drier clamped to it (POH 7-65; AMM 21-50 PDF p. 508); 3/8 in: the receiver-drier-to-condenser fitting takes the 3/8 in hose's 120–160 in-lb torque (AMM 21-50 PDF pp. 514, 517).",
});
flow(
  "acLiquid2",
  [AC.receiver, [-0.05, -0.47, 0.25], [0.15, -0.47, 0.38], [0.7, -0.47, 0.5], [1.1, -0.5, 0.5], AC.expansion],
  ["environment"],
  {
    ...REFRIG,
    r: 0.005,
    pcolor: "#5FA8F0",
    name: "A/C liquid line",
    note: "Receiver-drier → expansion valve on the evaporator, joined at the plumbing bulkhead (POH 7-65; AMM 21-50 PDF pp. 504, 509).",
  },
);
flow(
  "acSuction",
  [
    AC.evaporator,
    [1.3, -0.53, 0.46],
    [1.5, -0.46, 0.5],
    [2.4, -0.41, 0.43],
    [2.61, -0.26, 0.455],
    // the discharge route in reverse, about 25 mm above it on the firewall, under the drive unit and on the LH run, inboard
    // of it down the RH firewall, inside it round the head loop (AMM 21-50 PDF pp. 499, 501; Fig
    // 21-50-1 sheet 2 PDF p. 520); approximate
    [2.665, -0.165, 0.43],
    [2.66, -0.165, 0.3],
    [2.652, -0.165, 0.215],
    [2.645, 0.004, 0.215],
    [2.636, 0.0155, 0.165],
    [2.636, 0.0155, 0.09],
    [2.68, 0.0155, 0.04],
    [2.68, -0.03, 0.02],
    [2.68, -0.03, -0.155],
    [2.695, 0.0155, -0.207],
    [2.75, 0.0155, -0.22],
    [2.79, 0.0155, -0.218],
    [2.802, 0.045, -0.215],
    [2.802, 0.085, -0.21],
    AC_FITTING.suction,
  ],
  ["environment"],
  {
    ...REFRIG,
    r: 0.008,
    pcolor: "#BDEBFF",
    name: "A/C suction line",
    note: "Low-pressure vapor from the evaporator back to the compressor (POH 7-65); 5/8 in compressor hose: its 250–350 in-lb fitting torque matches the evaporator hose at the firewall (AMM 21-50 PDF pp. 501, 505).",
  },
);
flow("acDrain", [AC.evaporator, [1.225, botY(1.225) + 0.051, 0.36]], ["environment"], {
  // The drain ends on the belly's inner face at z 0.36: botY is the keel (z 0), and the nBot-3 belly of the POH 13772-007
  // Fig 1-1 loft (p. 1-4) sits 43 mm higher at z 0.36; 8 mm more keeps the 6 mm hose inside the skin.
  r: 0.006,
  color: "#4E9DB5",
  pcolor: "#8FD3E8",
  count: 4,
  name: "A/C condensate drain",
  note: "Moisture condensed on the evaporator coils drains overboard through the belly (POH 7-65; AMM 21-50 PDF p. 496); drain hose clamped to a fuselage rivnut (AMM 21-50 PDF p. 504).",
});
// A/C air path. Normal A/C: ram air from the fresh-air intake flows into the evaporator assembly, is cooled
// through the coils and ducted forward to the distribution manifold. Maximum A/C (recirculation): the fresh-air valve
// closes and valves in the evaporator assembly open, so cabin air is recirculated through the coils and ducted forward to
// the manifold (AMM 21-50 PDF p. 496; POH 7-65). The coupler duct (item 29) and evaporator duct (item 24) clamp to the
// evaporator assembly (AMM Fig 21-50-1 sheet 3, PDF p. 521; 21-50 PDF p. 504). Routings between the ends are illustrative.
flow(
  "acCoupler",
  [
    CABIN_AIR_COUPLER,
    [2.53, -0.58, 0.46],
    // 50 mm inboard of the curved belly (POH 13772-007 Fig 1-1 loft, p. 1-4); approximate
    [2.2, -0.635, 0.37],
    [1.7, -0.63, 0.36],
    [1.5, -0.6, 0.33],
    [1.36, -0.57, 0.33],
    AC.evaporator,
  ],
  ["environment"],
  {
    r: 0.022,
    color: AIR,
    pcolor: "#5FC8F0",
    name: "A/C coupler duct",
    note: "Cabin air coupler aft of the firewall → evaporator assembly: in normal A/C operation ram air from the fresh-air intake flows into the evaporator (POH 7-65; AMM 21-50 PDF p. 496; coupler duct, Fig 21-50-1 sheet 3 item 29, PDF p. 521). Routing approximate.",
  },
);
flow(
  "acEvapDuct",
  [
    AC.evaporator,
    [1.36, -0.575, 0.27],
    [1.7, -0.6, 0.29],
    [2.2, -0.59, 0.33],
    [2.45, -0.5, 0.3],
    [2.56, -0.3, 0.14],
    off(E0, [0.02, -0.06, 0.1]),
  ],
  ["environment"],
  {
    r: 0.022,
    color: AIR,
    name: "A/C evaporator duct",
    note: "Evaporator assembly → distribution manifold: the air cooled through the evaporator coils is ducted forward to the manifold, moved by ram air or the blower bolted to the evaporator (POH 7-65; AMM 21-50 PDF pp. 496, 504; evaporator duct, Fig 21-50-1 sheet 3 items 24, 30, 31, PDF p. 521). With the A/C selected it is the only path to the manifold, in normal and in recirculation mode. Routing approximate.",
  },
);
// recirculation: cabin air under the seat → recirculation check valve on the evaporator cover → coils; no duct
flow("acRecirc", [AC.recircInlet, AC.recircValve, AC.evaporator], ["environment"], {
  tube: false,
  size: 0.04,
  name: "A/C recirculation air",
  note: "Maximum A/C: the fresh-air valve closes and valves in the evaporator assembly open, recirculating cabin air through the evaporator coils (AMM 21-50 PDF p. 496; POH 7-65; RECIRCULATION CHECK VALVE, POH Fig 7-14 on 7-63). Not available unless the A/C is operating, nor at airflow 0 (POH 7-66).",
});

// Turbo oil/deck/bypass circuits: schematic paths, AMM Fig 79-30-2 sheet 3
// (PDF p. 2787), 79-00 (PDF p. 2764), Fig 81-00-1 (PDF p. 2810). Waypoints thread the
// engine mount's aft cage to the turbos low in the aft engine.
const REAR_CASE: Vec3 = [2.77, -0.22, 0];
const OIL = { r: 0.008, color: "#B49246", pcolor: "#E6CA73", count: 8 };
for (const side of [-1, 1]) {
  // Crosses outboard forward of the exhaust crossover's drop, below the mount's aft side frame and inboard of the
  // compressor duct, then drops onto the centre housing where Fig 5-33 labels the turbo oil inlet.
  // Waypoints illustrative.
  const supply: Vec3[] = [
    [2.99, -0.4, side * 0.2],
    // 5 mm further inboard than the first layout, so the intercooler inlet duct's riser keeps 5 mm
    [2.985, -0.42, side * 0.28], // approximate
    [TURBO(side)[0] + 0.014, -0.47, side * 0.295], // approximate
  ];
  // Detail C branches directly at the tee's opposite outlets. Both routes are approximate: the AMM
  // Fig 79-30-2 sheet 3 (PDF p. 2787) dimensions neither the hose bends nor their clearance offsets.
  const branch: Vec3[] =
    side < 0
      ? [
          [OIL_TEE[0], OIL_TEE[1], OIL_TEE[2] - 0.04], // approximate (AMM Fig 79-30-2 sh 3, PDF p. 2787)
          [2.72, -0.28, -0.35], // approximate (AMM Fig 79-30-2 sh 3, PDF p. 2787)
          [2.695, -0.36, -0.18], // approximate (AMM Fig 79-30-2 sh 3, PDF p. 2787)
        ]
      : bentRun(
          [
            [OIL_TEE[0], OIL_TEE[1], OIL_TEE[2] + 0.04], // approximate (AMM Fig 79-30-2 sh 3, PDF p. 2787)
            [2.73, -0.285, -0.18], // approximate (AMM Fig 79-30-2 sh 3, PDF p. 2787)
            [2.705, -0.36, -0.17], // approximate (AMM Fig 79-30-2 sh 3, PDF p. 2787)
            // Cross aft of the sump, then forward on its RH side; approximate bends, same undimensioned figure.
            [2.755, -0.38, -0.17],
            [2.755, -0.38, 0.12],
            [2.811, -0.38, 0.12],
            [2.811, -0.38, 0.18],
            [2.9, -0.42, 0.18],
          ],
          0.004,
        ); // approximate bends, AMM Fig 79-30-2 sh 3, PDF p. 2787

  flow(
    side < 0 ? "turboOilL" : "turboOilR",
    [
      OIL_SOURCE,
      // Approximate forward/outboard departure separates the hoses at the shared cooler fitting (AMM Fig 79-30-2 sh 3, PDF 2787).
      [OIL_SOURCE[0] + 0.04, OIL_SOURCE[1] - 0.01, OIL_SOURCE[2]],
      [OIL_SOURCE[0] + 0.04, OIL_SOURCE[1] - 0.01, OIL_CHECK[2]],
      OIL_CHECK,
      OIL_TEE,
      ...branch,
      ...supply,
      TURBO(side),
    ],
    ["engine"],
    {
      ...OIL,
      name: "Turbo oil supply — check valve / tee",
      note: "Oil cooler bottom → cooler-base check valve → tee → center housing (SR22T POH 13772-007 7-38; AMM 13773-002 Rev 7 79-00 PDF p. 2764; Fig 79-30-2 sheet 3 PDF p. 2787). Routing and diameter approximate: the figure is undimensioned; the LH and RH hoses branch directly at the tee’s opposite outlets, then run independently to their centre housings.",
      groups: ["oil"],
    },
  );
  const reservoir = TURBO_OIL_RES(side);
  flow(
    side < 0 ? "turboScavL" : "turboScavR",
    [
      reservoir,
      [reservoir[0], -0.6, side * 0.2],
      [reservoir[0], -0.6, 0.08],
      [2.84, -0.6, 0.08], // under the exhaust crossover
      // Approximate rise between the gascolator and heat duct (AMM 79-00 PDF p. 2764).
      [2.79, -0.55, 0.08],
      [2.77, -0.49, 0.08],
      TURBO_SCAVENGE,
      [2.77, -0.25, 0.14], // approximate: beside the starter adapter, AMM 79-00 PDF p. 2764
      REAR_CASE,
    ],
    ["engine"],
    {
      ...OIL,
      name: "Turbo reservoir → scavenge pump → sump",
      note: "AMM 79-00 PDF p. 2764. Routing approximate.",
      groups: ["oil"],
    },
  );
}
// Supply to the wastegate actuator, actuator → controller, controller → crankcase: the connectivity of the three
// drawn oil lines (parts/engine-air.ts), with a schematic offset where they meet the MCU.
// Approximate lift of the flow's upper return waypoints over the MCU top. The physical hose stays fixed;
// AMM 13773-002 Rev 7 Fig 78-10-3 PDF p. 2742 gives connectivity, not the schematic bend clearance.
const gateOilRun = GATE_OIL_RUN().map(([x, y, z]): Vec3 => {
  const lift = Math.max(0, Math.min(1, (y + 0.03) / 0.04, (-z - 0.29) / 0.03)); // approximate
  return [x, y + (x < 2.686 && y < 0.035 ? 0.0098 * lift : 0), z]; // approximate
});
flow("gateOil", gateOilRun, ["engine"], {
  ...OIL,
  r: 0.0045, // inside the Ø12-mm hoses; approximate
  tension: 0,
  name: "Wastegate oil supply / return",
  note: "Oil pressure closes the wastegate; the controller meters the oil returning to the crankcase (POH 7-38–7-39; AMM 79-00 PDF p. 2764; AMM Fig 78-10-3 PDF p. 2742).",
  groups: ["oil"],
});
// AMM 13773-002 Rev 7 Fig 78-10-3 (PDF 2742), POH 13772-007 7-39:
// approximate pressure-line routing; retain the high run above ignition, then drop at the firewall controller.
// from the controller's own fitting on the throttle body's upstream half along the drawn hose (Fig 78-10-3); the magnetos
// have a separate fitting and hose (Continental M-18 Fig 5-35 View F-F PDF p. 150; parts/engine-ignition.ts)
flow("deckRef", UPPER_DECK_LINE, ["engine"], {
  tension: 0,
  r: 0.005,
  pcolor: "#8FD3E8",
  name: "Upper-deck pressure reference",
  note: "Controller senses throttle differential (POH 7-39; AMM Fig 78-10-3 PDF p. 2742).",
  groups: ["induction"],
});
flow("gateBypass", WASTEGATE_BYPASS, ["engine"], {
  ...EXH,
  name: "Wastegate → LH tailpipe bypass",
  note: "POH 7-38; AMM 81-20 PDF p. 2812. Routing approximate.",
  groups: ["exhaust"],
});

// pitot-static: POH 7-68, 7-69, Fig 7-16 (2 of 2); AMM 34-10 (PDF p. 1629), Fig 34-10-1 sheets 2 and 4
// (PDF pp. 1646, 1648). Each line passes its water trap at its low point; tees and routing approximate. The pitot line and
// the static line each tee to ADAHRS 1, ADAHRS 2 and the MD302 (Fig 7-16 (2 of 2); AMM Fig 34-10-1 sheet 2 items 9, 11,
// 12, 17); ADAHRS 2 installed per operator, 2026-10-08. Endpoints are the parts' anchors.
const PITOT_JCT: Vec3 = [2.12, -0.32, -0.27],
  STATIC_JCT: Vec3 = [1.84, -0.44, -0.17];
flow(
  "pitot",
  [
    pitotBase.clone().add(V(0, 0.015, 0)),
    wingP(PITOT_Z, 0.35, 0),
    // High in the wing root, over the LH collector tank and gear fitting, then down inboard of them, aft of the
    // rudder-aileron interconnect and outboard of the TKS forward proportioning unit. Illustrative waypoints.
    wingP(-1.0, 0.4, 0).lerp(wingP(-1.0, 0.4, 1), 0.5),
    [1.18, -0.465, -0.78],
    [1.18, -0.47, -0.6],
    [1.17, -0.6, -0.53],
    [1.2, -0.6, -0.25],
    [1.05, -0.625, 0],
    TRAPS.pitot,
    [1.5, -0.6, -0.125],
    [2.0, -0.5, -0.2],
    PITOT_JCT,
    ADAHRS_1,
  ],
  ["pitot"],
  { r: 0.009, name: "Pitot line", note: "Pitot pressure through the pitot water trap to ADAHRS 1 (POH Fig 7-16)." },
);
// Each OAT probe connects directly to its ADC (POH 7-75); both probes on the RH wing per operator observation. Both
// routes (oatData1, oatData2) are drawn with the avionics data paths and audited strictly.
const oatData = (n: 1 | 2) => ({
  r: 0.004,
  name: `OAT ${n} to ADAHRS ${n}`,
  note: `Direct OAT ${n} probe connection to ADAHRS ${n}'s ADC (POH 7-75). Selected-side ADC OAT is used for Baro-VNAV (POH 7-80/7-81). Routing approximate; both probes on the RH wing per operator observation of the modelled airplane, plus AMM Fig 34-10-6.`,
});
flow("pitotAdahrs2", [PITOT_JCT, [2.3, -0.2, -0.12], ADAHRS_2], ["pitot"], {
  r: 0.007,
  name: "Pitot line to ADAHRS 2",
  note: "Tee to ADAHRS 2 (POH Fig 7-16 (2 of 2); AMM Fig 34-10-1 sheet 2 items 1, 9, 12, PDF p. 1646).",
});
flow("pitotStby", [PITOT_JCT, [2.1, -0.2, -0.25], MD302_POS], ["pitot"], {
  r: 0.007,
  name: "Pitot line to MD302",
  note: "Tee to the MD302 standby (POH Fig 7-16 (2 of 2); AMM Fig 34-10-1 sheet 2 item 17).",
});
// The RH line passes under the CAPS canister (parts/caps.ts) to the tee. Illustrative waypoint.
flow(
  "static",
  [[SPX, statR.cy, statR.hw - 0.01], SUMPS[0], [SPX + 0.5, 0.08, 0.08], [-0.6, 0.1, -0.12], STATIC_TEE],
  ["pitot"],
  {
    r: 0.009,
    name: "Static line (RH port)",
    note: "RH port through its static line sump to the tee on the aft cabin bulkhead (AMM 34-10, PDF p. 1629; Fig 34-10-1 sheet 2 items 13, 16, 2, PDF p. 1646). Stops while alternate static is selected.",
  },
);
flow("staticL", [[SPX, statR.cy, -statR.hw + 0.01], SUMPS[1], [SPX + 0.5, 0.06, -0.1], STATIC_TEE], ["pitot"], {
  r: 0.009,
  name: "Static line (LH port)",
  note: "LH port through its static line sump to the tee on the aft cabin bulkhead (AMM 34-10, PDF p. 1629; Fig 34-10-1 sheet 2 items 13, 16, 2, PDF p. 1646). Stops while alternate static is selected.",
});
flow(
  "static2",
  [
    STATIC_TEE,
    [AB + 0.02, -0.5, -0.17],
    // Outboard of the A/C condenser and its blower, inboard of the WX-500 (parts/aircon.ts, parts/avionics.ts),
    // then aft of the pitch servo and under the rudder/elevator pulley gang bracket. Illustrative.
    [0.05, -0.53, -0.155],
    [0.36, -0.61, -0.05],
    [0.4, -0.62, 0.15],
    [0.5, -0.6, 0.1],
    [0.65, -0.59, 0.44],
    [0.95, -0.59, 0.44],
    [1.05, -0.61, 0.4],
    TRAPS.static,
    [1.4, -0.6, 0],
    STATIC_JCT,
  ],
  ["pitot"],
  {
    r: 0.009,
    name: "Static line",
    note: "Tee on the aft cabin bulkhead → static water trap → console tee (AMM 34-10, PDF p. 1629; Fig 34-10-1 sheet 4 Detail D). Illustrative under-floor waypoints x 0.5/0.65/0.95/1.05 m, y −0.60/−0.59/−0.61 m and z 0.10/0.44/0.40 m keep the line outboard of the full roll-clamp sweep; fix3 lead §8 route ruling.",
  },
);
flow("staticAdahrs", [STATIC_JCT, [2.1, -0.35, -0.22], ADAHRS_1], ["pitot"], {
  r: 0.009,
  name: "Static line to ADAHRS 1",
  note: "Static pressure to ADAHRS 1 (POH Fig 7-16).",
});
flow("staticAdahrs2", [STATIC_JCT, [2.25, -0.3, -0.08], ADAHRS_2], ["pitot"], {
  r: 0.007,
  name: "Static line to ADAHRS 2",
  note: "Tee to ADAHRS 2 (POH Fig 7-16 (2 of 2); AMM Fig 34-10-1 sheet 2 items 2, 9, 12, PDF p. 1646).",
});
flow("staticStby", [STATIC_JCT, [2.05, -0.3, -0.24], MD302_POS], ["pitot"], {
  r: 0.007,
  name: "Static line to MD302",
  note: "Tee to the MD302 standby (POH Fig 7-16 (2 of 2); AMM Fig 34-10-1 sheet 2 item 17).",
});
flow("staticAlt", [ALT_STATIC, [1.84, -0.38, -0.16], STATIC_JCT], ["pitot"], {
  r: 0.007,
  name: "Alternate static",
  note: "Cabin air into the static line while the alternate static source is selected (POH 7-69; Fig 7-16).",
});
// stall warning: AMM 27-31 ¶A without ice protection, ¶B with it (PDF 1032); see flowsFor
flow(
  "stall",
  [
    wingP(STALL_Z, 0.02, 0),
    wingP(STALL_Z, 0.38, 0),
    // High in the wing root, over the RH collector tank, then between the seat pan and the A/C evaporator, blower
    // and recirculation valve into the console. Illustrative waypoints.
    wingP(0.9, 0.4, 0).lerp(wingP(0.9, 0.4, 1), 0.5),
    [1.18, -0.465, 0.6],
    [1.2, -0.485, 0.3],
    [1.3, -0.485, 0.05],
    [1.38, -0.5, -0.06],
    STALL_SWITCH,
  ],
  ["pitot"],
  {
    r: 0.009,
    name: "Stall warning line",
    note: "Inlet → pressure switch on the mid-console LH side panel (POH 7-68; AMM 27-31 ¶A, PDF 1032). Serials without ice protection only. Routing schematic.",
  },
);
flow(
  "stallWire",
  [
    STALL_TRANSDUCER,
    wingP(STALL_Z, 0.38, 0),
    // Aft of the spar web and high over the RH collector tank and gear rib, like the pneumatic line. Illustrative.
    wingP(0.9, 0.4, 0).lerp(wingP(0.9, 0.4, 1), 0.5),
    [1.17, -0.465, 0.6],
    [0.8, -0.52, 0.44],
    // Undimensioned under-floor approach: clear the controller and terminate at the upper case face
    // (AMM 13773-002 Rev 7 Fig 27-31-2 Detail A, PDF p. 1044).
    [STALL_COMPUTER[0] - 0.12, STALL_COMPUTER[1] + 0.09, STALL_COMPUTER[2]],
    [STALL_COMPUTER[0], STALL_COMPUTER[1] + 0.09, STALL_COMPUTER[2]],
    STALL_COMPUTER_PORT,
  ],
  ["pitot", "ice"],
  {
    r: 0.005,
    color: "#C8A23C",
    name: "Stall transducer wiring",
    tension: 0,
    note: "Wing harness from the lift transducer to the stall warning computer under CF3R; replaces the pneumatic line on serials with ice protection (AMM 27-31 ¶B, PDF 1032, 1038; Fig. 27-31-2, PDF 1044). Routing schematic; illustrative waypoint [0.8, −0.52, 0.44] m rises above the full roll-clamp sweep under the fix3 lead §8 ruling.",
  },
);

// avionics data, power and cooling: schematic paths between the LRUs (parts/avionics.ts),
// after POH 13772-007 Fig 7-17 (7-73) and 7-74 – 7-90; AMM 13773-002 Rev 7 31-40 (PDF pp. 1326–1327), Fig 31-60-1
// (PDF p. 1341), 21-20 (PDF p. 454). Routing schematic: no harness drawing gives the runs. Colours: data links are thin blue
// tubes with light-blue particles (DATA); the display power feeds are amber with yellow particles (FEED); the IAU cooling
// duct is grey with pale-blue air particles (COOL). The two GIAs are never joined: they do not talk to each other (AMM
// 31-40 PDF p. 1326).
const DATA = { r: 0.004, color: "#3A6FB8", pcolor: "#8CC8FF", size: 0.04, count: 6 } as const;
const FEED = { r: 0.005, color: "#B8862A", pcolor: "#FFD24A", size: 0.04, count: 6 } as const;
const COOL = { r: 0.014, color: "#8A969E", pcolor: "#CDEBF5", size: 0.05 } as const;
const data = (key: string, pts: FlowSpec["pts"], name: string, cite: string) =>
  flow(key, pts, ["avionics"], { ...DATA, name, note: cite + " Routing schematic." });
// Behind the panel the paths keep clear of the environmental distribution manifold (x 2.48–2.56, y −0.16 … −0.04), pass
// between the rudder pedal pairs (x 2.40–2.44) and cross under the instrument panel slab (y −0.18) from the console.
// Under-floor runs below the main spar carry-through sit at FLOOR_Y.
const FLOOR_Y = -0.655;
// A single physical tube per MAG harness; the matching particle path uses the same spline (tension 0.15).
for (const n of [1, 2] as const)
  flow(n === 1 ? "magData" : "magData2", MAG_WIRES[n], ["avionics"], {
    ...DATA,
    tube: false,
    tension: 0.15,
    name: `MAG ${n} → ADAHRS ${n}`,
    note: "Magnetometer interface (SR22T POH 13772-007 Fig 7-17, 7-73; 7-75; AMM 13773-002 Rev 7 34-20, PDF p. 1675). Routing schematic.",
  });
// OAT 1: direct ADC link (POH 7-75); RH probe location (AMM Fig 34-10-6 PDF 1666), audited like OAT 2.
// Lower RH wing lane aft of the fuel tank (chord 0.62) and of OAT 2's lane, rising over the aileron hinge fairing (span 3.94)
// and dropping under the wing sector crank arm and cable fairlead (span 3.6–3.7). In the cabin it runs under the front
// passenger seat, forward through the footwell outboard of the cabin-air ducts, up behind the rudder pedals and across
// aft of the elevator torque tube, then rises aft of the IAU cooling ducts into ADAHRS 1 from below.
// Waypoints and 5 mm surface margin are illustrative clearance choices, not installation dimensions.
const oatLane = (z: number, xc: number, f: number) => wingP(z, xc, 0).lerp(wingP(z, xc, -1), f);
flow(
  "oatData1",
  [
    OAT_1,
    oatLane(4.53, 0.45, 0.55),
    oatLane(4.53, 0.62, 0.6),
    oatLane(4.0, 0.63, 0.3),
    oatLane(3.88, 0.63, 0.3),
    ...[3.6, 3.3, 2.88, 2.2, 1.6, 1.0].map((z) => oatLane(z, 0.62, 0.7)),
    [0.95, -0.56, 0.7],
    [1.05, -0.55, 0.5],
    [1.19, -0.55, 0.5],
    [1.21, -0.48, 0.45],
    [2.1, -0.47, 0.42],
    [2.34, -0.42, 0.27],
    [2.38, -0.27, 0.27],
    [2.39, -0.27, -0.26],
    [2.46, -0.27, -0.26],
    [2.46, 0.03, -0.26],
    ADAHRS_1,
  ],
  ["pitot", "avionics"],
  {
    ...oatData(1),
    tension: 0,
    note:
      oatData(1).note +
      " Lower RH wing lane aft of the fuel tank, under the front passenger seat and behind the rudder pedals into ADAHRS 1 from below. Waypoints and 5 mm clearance are illustrative (POH 7-75; AMM Fig 34-10-6 PDF p. 1666); no installation drawing dimensions this route.",
  },
);
// OAT 2: direct ADC link (POH 7-75); RH probe location (AMM Fig 34-10-6 PDF 1666).
// Upper RH wing lane enters the cabin ahead of the control pulleys and passes beside the console.
// The two pre-ADC bends sit below the full-open door/seal sweep (AMM Fig 52-10-1 PDF 2011).
// Waypoints and 5 mm surface margin are illustrative clearance choices, not installation dimensions.
flow(
  "oatData2",
  [
    OAT_2,
    [1.275, -0.18, 4.635],
    [1.11, -0.18, 4.5],
    [1.035, -0.285, 2.88],
    [0.93, -0.45, 0.945],
    [1.035, -0.465, 0.675],
    [1.155, -0.45, 0.585],
    [1.26, -0.345, 0.54],
    [1.275, -0.33, 0.525],
    [2.31, -0.25, 0.09],
    [2.355, -0.25, 0.075],
    [2.37, -0.03, 0.06],
    [2.37, -0.015, 0.045],
    [2.415, 0.06, -0.0],
    [2.43, 0.09, -0.015],
    [2.43, 0.105, -0.03],
    ADAHRS_2,
  ],
  ["pitot", "avionics"],
  {
    ...oatData(2),
    tension: 0,
    note:
      oatData(2).note +
      " Upper RH wing lane enters ahead of the control pulleys and passes beside the console. Pre-ADC bends clear the full-open door/seal sweep (AMM Fig 52-10-1 PDF p. 2011). Waypoints and 5 mm clearance are illustrative (POH 7-75; AMM Fig 34-10-6 PDF p. 1666); no installation drawing dimensions this route.",
  },
);
data(
  "adahrsPfd",
  [ADAHRS_1, [2.36, 0.15, -0.25], PFD_CONN],
  "ADAHRS 1 → PFD",
  "The AHRS provides attitude and heading to the PFD; the ADC communicates with the PFD (POH 7-75).",
);
data(
  "adahrsGia1",
  [ADAHRS_1, [2.43, 0.18, -0.2], [2.45, 0.18, -0.13], GIA_1],
  "ADAHRS 1 → GIA 1",
  "The AHRS interfaces with both Integrated Avionics Units for GPS information (POH 7-75; AMM 34-10 PDF p. 1630).",
);
data(
  "adahrsGia2",
  [GIA_2, [2.42, 0.19, 0.03], [2.4, 0.19, -0.2], ADAHRS_1],
  "GIA 2 → ADAHRS 1",
  "SR22T POH 13772-007 Fig 7-17 (7-73): IAU 2 → ADAHRS 1; AMM 13773-002 Rev 7 34-10 §E, PDF p. 1630: ADAHRS obtains GPS information from the GIAs.",
);
// Dual ADAHRS installation per operator. POH 13772-007 Fig 7-17 (7-73) connects ADAHRS 2 to MFD, both IAUs and MAG 2.
// These coordinates and the DATA radius/rate are schematic illustration choices, not sourced installation dimensions.
data(
  "adahrs2Mfd",
  [ADAHRS_2, [2.31, 0.1, -0.024], [2.31, 0.1, 0.054], MFD_CONN],
  "ADAHRS 2 → MFD",
  "SR22T POH 13772-007 Fig 7-17 (7-73): dual ADAHRS display interface.",
);
data(
  "adahrs2Gia1",
  [GIA_1, [2.38, 0.18, -0.1], [2.46, 0.25, -0.13], [2.46, 0.24, -0.055], ADAHRS_2],
  "GIA 1 → ADAHRS 2",
  "SR22T POH 13772-007 Fig 7-17 (7-73): IAU 1 → ADAHRS 2; AMM 13773-002 Rev 7 34-10 §E, PDF p. 1630: ADAHRS obtains GPS information from the GIAs.",
);
data(
  "adahrs2Gia2",
  [ADAHRS_2, [2.4, 0.2, 0.005], [2.36, 0.21, 0.11], GIA_2],
  "ADAHRS 2 → GIA 2",
  "SR22T POH 13772-007 Fig 7-17 (7-73), 7-75; AMM 13773-002 Rev 7 34-10, PDF p. 1630: AHRS interfaces with both IAUs for GPS information.",
);
// GIA ↔ display Ethernet links and the PFD ↔ MFD bus, just behind the bezels (bezel plane x 2.285, GIAs from x 2.325); the
// PFD ↔ MFD bus leaves through the display cut-outs and crosses between them aft of the panel slab (x 2.28–2.32, cabin.ts)
data(
  "gia1Pfd",
  [GIA_1, [2.32, 0.07, -0.16], PFD_CONN],
  "GIA 1 → PFD",
  "Ethernet interconnect from GIA 1 to the PFD (AMM 31-40 PDF p. 1327); high-speed data bus (POH 7-74).",
);
data(
  "gia2Mfd",
  [GIA_2, [2.315, 0.07, 0.05], MFD_CONN],
  "GIA 2 → MFD",
  "Ethernet interconnect from GIA 2 to the MFD (AMM 31-40 PDF p. 1327); high-speed data bus (POH 7-74).",
);
data(
  "pfdMfd",
  [PFD_CONN, [2.3, 0.03, -0.16], [2.335, 0.025, -0.1], [2.335, 0.025, -0.075], [2.3, 0.03, -0.02], MFD_CONN],
  "PFD ↔ MFD",
  "The PFD accepts data from the MFD through a high-speed data bus connection (POH 7-74).",
);
// GEA 71: POH Fig 7-17 (7-73) links the Engine Airframe Unit to both Integrated Avionics Units
data(
  "geaData",
  [GEA_71, [2.4, -0.02, 0.2], [2.4, -0.02, -0.115], GIA_1],
  "GEA 71 → GIA 1",
  "The Engine Airframe Unit transmits its sensor data to the Integrated Avionics Unit (POH 7-78); the schematic links it to both Integrated Avionics Units (POH 13772-007 Fig 7-17, 7-73).",
);
data(
  "geaData2",
  [GEA_71, [2.41, -0.01, 0.18], [2.41, -0.01, 0.05], GIA_2],
  "GEA 71 → GIA 2",
  "The Engine Airframe Unit transmits its sensor data to the Integrated Avionics Unit (POH 7-78); the schematic links it to both Integrated Avionics Units (POH 13772-007 Fig 7-17, 7-73).",
);
// over the A/C condenser, the convenience system controller, the rudder/elevator pulley bracket and the flap torque
// tube, then under the floor inboard of the A/C evaporator (z 0.23 … 0.43 at x 1.15 … 1.35) and of the RH brake line
// (z 0.095, parts/gear.ts), stepping over that line ahead of the spar
data(
  "xpdrData",
  [
    XPDR,
    [-0.45, -0.45, 0.2],
    [-0.1, -0.45, 0.18],
    [0.55, -0.49, 0.2],
    [0.9, -0.49, 0.15],
    [1.06, -0.54, 0.085],
    [1.05, FLOOR_Y, 0.07],
    [1.45, FLOOR_Y, 0.07],
    [1.7, FLOOR_Y, 0.07],
    [1.82, -0.632, 0.095],
    [1.95, FLOOR_Y, 0.13],
    [2.25, FLOOR_Y, 0.225],
    [2.42, -0.5, 0.225],
    [2.465, -0.44, 0.225],
    [2.45, -0.25, 0.02],
    [2.34, -0.04, -0.115],
    GIA_1,
  ],
  "Transponder ↔ GIA 1",
  "The transponder communicates with the primary Integrated Avionics Unit (POH 7-78, 7-83).",
);
// the GIA 1 audio link passes under the panel slab inboard of the MAG 1 wiring (parts/avionics.ts MAG_WIRES)
data(
  "audioGia1",
  [GMA_350, [2.2, -0.215, -0.03], [2.3, -0.2, -0.035], [2.37, -0.19, -0.09], [2.38, -0.04, -0.115], GIA_1],
  "Audio panel ↔ GIA 1",
  "The GMA 350 interfaces with both Integrated Avionics Units (POH 7-78).",
);
data(
  "audioGia2",
  [GMA_350, [2.2, -0.25, 0.05], [2.36, -0.22, 0.05], [2.38, -0.04, 0.05], GIA_2],
  "Audio panel ↔ GIA 2",
  "The GMA 350 interfaces with both Integrated Avionics Units (POH 7-78).",
);
// optional sensors reach the panel through GIA 2 (POH 7-84 – 7-85); the WX-500 and DME links rise just aft of the
// firewall (x 2.59) and enter GIA 2 from its forward end; the DME link runs aft of the parking brake control cable (x ≤ 2.545,
// parts/gear.ts) low down, then rises outboard of the throttle cable (z −0.12 at the firewall, parts/engine-air.ts) before
// crossing to GIA 2
data(
  "trafficData",
  [
    GTS_800,
    [1.9, -0.5, -0.27],
    [2.47, -0.55, -0.25],
    [2.5, -0.05, -0.3],
    [2.52, 0.1, -0.26],
    ADAHRS_1,
    [2.5, 0.2, -0.2],
    [2.5, 0.2, 0.05],
    GIA_2,
  ],
  "GTS 800 ↔ ADAHRS 1 ↔ GIA 2 (optional)",
  "The GTS 800 uses inputs from the secondary Integrated Avionics Unit via the primary Air Data Computer (POH 7-84).",
);
data(
  "wxData",
  [
    WX_500,
    [0.6, -0.6, -0.22],
    [1.2, FLOOR_Y, -0.1],
    [1.6, FLOOR_Y, -0.07],
    [1.9, -0.62, -0.05],
    [2.47, -0.55, 0.0],
    [2.59, -0.3, 0.04],
    [2.59, 0.1, 0.04],
    GIA_2,
  ],
  "WX-500 → GIA 2 (optional)",
  "The WX-500 processor sends its data to the MFD via the secondary Integrated Avionics Unit (POH 7-84).",
);
data(
  "dmeData",
  [KN_63, [2.3, -0.47, -0.3], [2.58, -0.47, -0.3], [2.585, -0.3, -0.22], [2.59, -0.1, -0.08], [2.59, 0.1, 0.06], GIA_2],
  "KN 63 → GIA 2 (optional)",
  "The KN 63 communicates with the Integrated Avionics System via the secondary Integrated Avionics Unit (POH 7-84 – 7-85).",
);
// display power feeds from the circuit breaker panel (parts/cabin.ts, left side of the console) up inside the console,
// under the bolster and round the panel slab's lower aft edge (either side of the rear floor duct), then up below the GIAs (y < 0.045) and aft
// into the display cut-out behind the bezel (x < GIA front 2.325) to the connectors
const CB_BACK = off(CB_PANEL, [0.08, 0.02, 0.02]);
const FEEDS: [key: string, breaker: string, bus: string, to: Vec3, z: number][] = [
  ["pfdFeedA", "PFD A", "ESS BUS 1", PFD_CONN, -0.075],
  ["pfdFeedB", "PFD B", "MAIN BUS 2", PFD_CONN, -0.086],
  ["mfdFeedA", "MFD A", "MAIN BUS 3", MFD_CONN, 0.03],
  ["mfdFeedB", "MFD B", "MAIN BUS 1", MFD_CONN, 0.041],
];
FEEDS.forEach(([key, breaker, bus, to, z]) =>
  flow(
    key,
    [
      CB_BACK,
      [1.98, -0.35, z],
      [2.15, -0.22, z],
      [2.3, -0.195, z],
      [2.335, -0.19, z],
      [2.35, -0.16, z],
      [2.345, 0, to[2] + (z - to[2]) / 4],
      [2.31, 0.03, to[2] + (z - to[2]) / 8],
      to,
    ],
    ["avionics", "electrical"],
    {
      ...FEED,
      name: breaker + " feed",
      note:
        "5 A " +
        breaker +
        " circuit breaker on " +
        bus +
        " → " +
        (to === PFD_CONN ? "PFD" : "MFD") +
        "; either feed powers the display (POH 7-74; Fig 7-11, 7-52). Routing schematic.",
    },
  ),
);
// IAU cooling: the fan under the LH console blows through a series of ducts to the IAUs (POH 7-90; AMM 21-20 PDF p. 454);
// the duct runs low under the LH panel vent duct and below the MAG 1 wiring's turn up to ADAHRS 1 (parts/avionics.ts
// MAG_WIRES), then tees below the GIAs, aft of the windshield diffuser riser
const COOL_TEE: Vec3 = [2.455, 0, -0.12];
flow("iauCool", [IAU_FAN, [2.41, -0.2, -0.18], COOL_TEE, GIA_1], ["avionics"], {
  ...COOL,
  name: "IAU cooling duct (GIA 1)",
  note: "Avionics fan → GIA 1: forced ambient-air cooling directly to the Integrated Avionics Units (POH 7-90; AMM 21-20 PDF p. 454). Routing schematic.",
});
flow("iauCool2", [COOL_TEE, [2.46, 0, 0.05], GIA_2], ["avionics"], {
  ...COOL,
  name: "IAU cooling duct (GIA 2)",
  note: "Branch of the avionics fan duct to GIA 2 (POH 7-90; AMM 21-20 PDF p. 454). Routing schematic.",
});

// control cables — laid out after POH Figures 7-1 / 7-2 / 7-3 (see ./rig.ts)
CABLES.forEach((c) =>
  flow(c.key, c.pts, ["controls"], {
    r: 0.005,
    size: 0.045,
    tension: 0.05,
    name: c.name,
    note: c.note,
    count: 18,
    chan: chanOfKey(c.key),
  }),
);
flow("flapPush", [[FT.x, FT.y, 0], [FT.x, FT.y, 0.9], wingP(1.2, 0.74, 0)], ["flaps"], {
  tube: false,
  pcolor: "#B9A3F0",
});
flow("flapPush2", [[FT.x, FT.y, 0], [FT.x, FT.y, -0.9], wingP(-1.2, 0.74, 0)], ["flaps"], {
  tube: false,
  pcolor: "#B9A3F0",
});

export const FLOWS = F;
/** Stall warning by configuration (AMM 27-31 ¶A / ¶B, PDF 1032): pneumatic line without FIKI, transducer wiring with it. */
const PNEUMATIC_ONLY = new Set(["stall"]),
  FIKI_ONLY = new Set(["stallWire"]);
const FLOWS_STD = F.filter((f) => !FIKI_ONLY.has(f.key)),
  FLOWS_FIKI = F.filter((f) => !PNEUMATIC_ONLY.has(f.key));
/** The flows drawn for an airplane with (`fiki`) or without TKS ice protection; stable arrays, so the scene memo holds. */
export const flowsFor = (fiki: boolean) => (fiki ? FLOWS_FIKI : FLOWS_STD);

const CABIN_AIR = [
  "toMan",
  "fanDuct",
  "panelL",
  "panelR",
  "panelL2",
  "panelR2",
  "armL",
  "armR",
  "floorF",
  "floorF2",
  "floorR",
  "floorR2",
  "defrost",
  "defrost2",
  // the A/C evaporator's outlet and its recirculated inlet carry cabin air too
  "acEvapDuct",
  "acRecirc",
];
export const isCabinAir = (k: string) => CABIN_AIR.includes(k);

/** Particle speed multiplier per flow (0 = stopped; negative = reversed). */
export function flowRates(s: Sim, E: Elec): Record<string, number> {
  const R: Record<string, number> = {};
  const run = s.eng.running;
  R.alt1 = E.alt1 ? 1 : 0;
  R.alt2 = E.alt2 ? 1 : 0;
  R.bat1 = !E.bat1ok ? 0 : E.bat1Charging ? -0.6 : 1;
  // electrical distribution: each breaker-panel bundle runs on its own distribution bus (POH 7-49); BAT 2
  // through its breaker (POH 7-50), charging or supplying; the starter cable while cranking (POH 7-37; Fig 7-10, 7-48);
  // the landing-light feed and the ballast's lamp lead through the LAND-energized MCU relay (POH 7-57)
  R.cbMdb1 = E.mdb1 > 0 ? 1 : 0;
  R.cbMdb2 = E.mdb2 > 0 ? 1 : 0;
  R.cbEss = E.edb > 0 ? 1 : 0;
  R.bat2 = !E.bat2ok ? 0 : E.bat2Charging ? -0.6 : E.bat2Supplying ? 1 : 0;
  R.starterCable = E.starterPwr && s.eng.key === "START" ? 1 : 0;
  R.landFeed = R.landLamp = extLit(s, E).land ? 1 : 0;
  const speed = pumpSpeed(s, E, live.rpm, mapInHg(s, live.rpm), s.paFt);
  const feed = run || speed !== "off",
    ok = fuelAvail(s);
  R.fuelL = feed && ok && s.fuel.sel === "L" ? 1 : 0;
  R.fuelR = feed && ok && s.fuel.sel === "R" ? 1 : 0;
  // Particle rates are illustrative, not measured fuel flow.
  R.fuelMain = feed && ok ? (speed === "high" ? 1.8 : speed === "low" ? 1.4 : 1) : 0;
  R.fuelRetL = run && ok && s.fuel.sel === "L" ? 1 : 0;
  R.fuelRetR = run && ok && s.fuel.sel === "R" ? 1 : 0;
  // fuel storage: vents. Static: POH 7-40 and AMM 28-10 (PDF p. 1089) give no vent flow rate or direction.
  R.fuelVentL = R.collectorVentL = R.fuelVentR = R.collectorVentR = 0;
  // fuel distribution
  R.fuelDrainAux = R.fuelDrainGas = R.fuelDrainEngine = R.fuelDrainSpider = R.fuelDrainHeads = R.fuelDrainOutlet = 0;
  CYLS.forEach((c) => (R["fuelDrainCyl" + c.n] = 0));
  CYLS.forEach((c) => {
    R["inj" + c.n] = run && ok ? 1 : 0;
    R["man" + c.n] = run ? 1 : 0;
    R["exh" + c.n] = run ? 1.2 : 0;
  });
  R.inletL = R.inletR = run && !altAirOpen(s) ? 1 : 0;
  R.intakeL = R.intakeR = R.manifold = run ? 1 : 0;
  R.compressorL = R.compressorR = run ? (s.turbo.fail === "leak" ? 0.35 : 1) : 0;
  R.turboOilL = R.turboOilR = R.turboScavL = R.turboScavR = R.gateOil = run ? 0.7 : 0;
  R.deckRef = run ? 0.2 : 0;
  R.gateBypass = run ? 1.2 * wastegateOpen(s) : 0;
  R.altAirL = R.altAirR = altAirOpen(s) ? 1 : 0;
  R.tailpipeL = R.tailpipeR = R.crossover = run ? 1.2 : 0;
  R.oil = run ? 0.7 : 0;
  // cabin air. The valves follow the control panel only while it is powered (POH 7-61); ram air through the
  // inlet valves does not depend on the blower, which adds its own duct with the A/C off (POH 7-65, Fig 7-13). Rates are
  // illustrative.
  const v = valveEnv(s, E),
    flap = airflowValveOpen(v),
    RAM = 0.45;
  R.hotL = run ? 1 : 0;
  R.hot = run && flap ? RAM * hotValveOpen(v) : 0;
  R.fresh = run && flap ? RAM * freshValveOpen(v) : 0;
  // a closed inlet valve sends its air into the engine compartment (POH 7-64, 7-65)
  R.hotDump = run ? 1 - hotValveOpen(v) : 0;
  R.freshDump = run ? 1 - freshValveOpen(v) : 0;
  // inlet side of each valve: carries whatever the valve admits or dumps
  R.hotIn = Math.max(R.hot, R.hotDump);
  R.freshIn = Math.max(R.fresh, R.freshDump);
  // the blower needs its 15 A CABIN FAN breaker in and A/C BUS 2 powered (POH 7-61)
  const fanPwr = E.ac2 > 0 && !s.cb["CABIN FAN"];
  // its speed is a control-panel selection too, held with the valves while the panel is unpowered
  const blower = flap && v.fan >= 1 && fanPwr ? 0.6 + v.fan * 0.4 : 0;
  // With the A/C selected all cabin air passes through the evaporator, whose assembly carries the blower
  // (POH 7-64, 7-65; AMM 21-50 PDF pp. 496, 504; Fig 21-50-1 sheet 3 items 22, 24, 29–31, PDF p. 521): the direct
  // chamber → manifold duct and the blower's own duct carry nothing, and the evaporator duct below takes both.
  R.fanDuct = v.ac ? 0 : blower;
  // downstream ducts carry air only when a source flows: the chamber's hot or fresh air, or the blower
  R.toMan = !v.ac && (R.hot || R.fresh) ? RAM : 0;
  // air conditioning: the refrigerant moves only while the compressor runs (POH 7-61)
  const acOn = acCompressorOn(s, E, v); // the A/C command latches with the control panel, as v does
  R.acDischarge = R.acSuction = acOn ? 1 : 0;
  R.acLiquid = R.acLiquid2 = acOn ? 0.6 : 0;
  R.acDrain = acOn ? 0.3 : 0;
  // A/C air path: with the A/C selected, ram air the fresh-air valve admits flows into the evaporator; in
  // recirculation that valve is shut and the blower draws cabin air through the evaporator assembly's valves instead
  // (AMM 21-50 PDF p. 496; POH 7-65). Either way the evaporator duct carries it forward to the manifold. Recirculation is
  // not available unless the A/C is operating, nor at airflow 0 (POH 7-66), where the blower is off.
  R.acCoupler = v.ac ? R.fresh : 0;
  R.acRecirc = acOn && v.recirc ? blower : 0;
  // the blower on the evaporator pushes through the evaporator duct in normal A/C too; in recirculation only what
  // comes in through the recirculation valves leaves
  R.acEvapDuct = v.ac ? Math.max(R.acCoupler, R.acRecirc, v.recirc ? 0 : blower) : 0;
  const out = Math.max(R.toMan, R.fanDuct, R.acEvapDuct);
  ["panelL", "panelR", "panelL2", "panelR2", "armL", "armR"].forEach((k) => (R[k] = out));
  const floor = butterflies(v.vent).floor,
    wind = butterflies(v.vent).defrost;
  ["floorF", "floorF2", "floorR", "floorR2"].forEach((k) => (R[k] = floor ? out : 0));
  R.defrost = R.defrost2 = wind ? out : 0;
  // pitot-static: the alternate static source replaces the ports (POH 7-69)
  const altStatic = s.pitot.alt;
  R.oatData1 = E.adahrs1 ? 0.4 : 0;
  R.oatData2 = E.adahrs2 ? 0.4 : 0;
  R.pitot = R.pitotStby = R.pitotAdahrs2 = 0.4;
  R.static = R.staticL = R.static2 = altStatic ? 0 : 0.4;
  R.staticAlt = altStatic ? 0.4 : 0;
  R.staticAdahrs = R.staticAdahrs2 = R.staticStby = 0.4;
  R.stall = s.stall.aoa >= 14 && !s.stall.fault ? -1 : 0;
  R.stallWire = s.stall.aoa >= 14 && !s.stall.fault && E.stallPwr ? 1 : 0;
  // avionics: a data link runs while both end units are up (POH 7-74 – 7-85); a breaker feeds its unit
  // while its bus is up and it is in (bus from the breaker table). ADAHRS 1 and MAG 1 come from the solver, so their
  // simulated failures stop their links. Each GIA's data side takes its GPS NAV GIA breaker alone; COM n powers only
  // the COM radio, as on the displays (POH 7-78 silent; modelling choice, open question). Rates are illustrative.
  const fed = (breaker: string) => {
    const bus = breakerBus(s.equip, breaker);
    return !!bus && E[bus] > 0 && !s.cb[breaker];
  };
  const adahrs = E.adahrs1,
    gia1 = fed("GPS NAV GIA 1"),
    gia2 = fed("GPS NAV GIA 2"),
    link = (a: boolean, b: boolean) => (a && b ? 0.5 : 0);
  R.magData = link(E.mag1, adahrs); // MAG 1 supply: PFD A (AMM 34-20 PDF p. 1675), via the solver
  R.magData2 = link(E.mag2, E.adahrs2);
  R.adahrs2Mfd = link(E.adahrs2, E.mfd);
  R.adahrs2Gia1 = link(E.adahrs2, gia1);
  R.adahrs2Gia2 = link(E.adahrs2, gia2);
  R.adahrsPfd = link(adahrs, E.pfd);
  R.adahrsGia1 = link(adahrs, gia1);
  R.adahrsGia2 = link(adahrs, gia2);
  R.gia1Pfd = link(gia1, E.pfd);
  R.gia2Mfd = link(gia2, E.mfd);
  R.pfdMfd = link(E.pfd, E.mfd);
  R.geaData = link(E.eisPwr, gia1);
  R.geaData2 = link(E.eisPwr, gia2);
  R.xpdrData = link(fed("XPONDER"), gia1);
  R.audioGia1 = link(fed("AUDIO PANEL"), gia1);
  R.audioGia2 = link(fed("AUDIO PANEL"), gia2);
  R.trafficData = link(fed("TRAFFIC") && adahrs, gia2);
  R.wxData = link(fed("DATA LINK/WX"), gia2);
  R.dmeData = link(fed("DME/ADF"), gia2);
  for (const [key, breaker] of FEEDS) R[key] = fed(breaker) ? 1 : 0;
  R.iauCool = R.iauCool2 = E.fan2 ? 0.8 : 0;
  // each cable loop: one strand pays out while the other takes up
  R.elA = s.ctrl.pitch * 2;
  R.elB = -s.ctrl.pitch * 2;
  R.ailR = s.ctrl.roll * 2;
  R.ailL = -s.ctrl.roll * 2;
  R.ailBal = -s.ctrl.roll * 2;
  R.rudR = -s.ctrl.yaw * 2;
  R.rudL = s.ctrl.yaw * 2;
  const flapMoving = Math.abs(live.flapAng - FLAP_DEG[s.flaps.cmd]) > 0.2 && E.flapsPwr;
  R.flapPush = R.flapPush2 = flapMoving ? 1 : 0;
  return R;
}

/** Cabin-air colour follows the held hot-air valve (POH 13772-007 7-66); cooling needs the compressor (7-61). */
export function cabinAirColor(s: Sim, E: Elec, out: THREE.Color) {
  const env = valveEnv(s, E);
  if (acCompressorOn(s, E, env)) return out.set("#6EC9E6");
  return out.set("#5FC8F0").lerp(new THREE.Color("#FF7A3D"), hotValveOpen(env));
}
