/** SR20 G6 air/refrigerant/low-energy signal routes.
 * POH11934-005 7-62–68, 7-92–99; AMM12137-002 21-00/20/40/50/60, 25-10/60.
 * All routed stations, radii and particle magnitudes are illustrative. */
import type { FlowSpec } from "@/lib/catalogue";
import type { Vec3 } from "@/lib/math";
import type { Elec, Sim } from "./model";
import { cabinOperation } from "./environment";
import { MUFFLER } from "./engine-anchors";
import { AC } from "./parts/aircon";
import { ELT_POS, ELT_REMOTE, RESTRAINT_EMA, RESTRAINT_INFLATOR } from "./parts/cabin";
import {
  FRESH_INLET,
  HEAT_INLET,
  MIX,
  HOT_VALVE,
  FRESH_VALVE,
  AIRFLOW_VALVE,
  CABIN_AIR_COUPLER,
  MANIFOLD,
  BLOWER,
  ECS_PANEL,
  ECS_CONTROLLER,
  FLOOR_BUTTERFLY,
  DEFROST_BUTTERFLY,
  CREW_DISPLAY_VENT,
  CREW_PANEL_VENT,
  CREW_FLOOR_VENT,
  PAX_PANEL_VENT,
  PAX_FLOOR_VENT,
  DEFROST_VENT,
} from "./parts/environment";

const AIR = "#E0B040",
  COLD = "#66BAD7",
  HOT = "#E0522B";
const F: FlowSpec[] = [];
const air = (key: string, pts: FlowSpec["pts"], name: string, note: string, color = AIR, r = 0.015, tube = true) =>
  F.push({ key, pts, sys: ["environment"], name, note, color, r, tube });
air(
  "freshFeed",
  [[FRESH_INLET[0], FRESH_INLET[1], FRESH_INLET[2] - 0.025], [3.1, -0.45, 0.42], FRESH_VALVE],
  "NACA ventilation duct",
  "Lower RH cowl NACA inlet to the fresh-air inlet valve (POH7-65; AMM21-00p1). Routed station approximate.",
  COLD,
);
air(
  "heatIn",
  [HEAT_INLET, [3.4, 0.04, 0.29], MUFFLER],
  "Heat-exchanger ram-air supply",
  "SR20 AMM21-00p1 and21-40p1 source heater ram air from the upper RH cowl inlet. POH7-65 instead names the NACA inlet; the distinct upper-inlet routing follows the maintenance description. Geometry approximate.",
  COLD,
);
air(
  "heaterFeed",
  [MUFFLER, [2.84, -0.44, 0.42], HOT_VALVE],
  "Heat-exchanger outlet duct",
  "Air heated around the exhaust muffler to the hot-air inlet valve; kept distinct from the exhaust gas stream (POH7-65; AMM21-40p1). Routing approximate.",
  HOT,
);
air(
  "fresh",
  [FRESH_VALVE, MIX],
  "Fresh-air mixing branch",
  "Selected cold/ventilation inlet into the mixing chamber (POH7-65–67).",
  COLD,
  0.012,
);
air(
  "hot",
  [HOT_VALVE, MIX],
  "Hot-air mixing branch",
  "Selected heater inlet into the mixing chamber (POH7-65–67).",
  HOT,
  0.012,
);
air(
  "hotDump",
  [HOT_VALVE, [2.84, -0.5, 0.3], [2.98, -0.52, 0.28]],
  "Rejected hot-air outlet",
  "With the hot-air valve closed, heated air exits into the engine compartment and is exhausted with cooling airflow (POH7-65). Particle-only rejected-air cue; no physical discharge duct geometry is inferred.",
  HOT,
  0.012,
  false,
);
air(
  "freshDump",
  [FRESH_VALVE, [2.9, -0.5, 0.32], [3.08, -0.52, 0.28]],
  "Rejected ventilation-air outlet",
  "With the fresh-air valve closed, intake air is discharged into the engine compartment (POH7-65). Particle-only rejected-air cue; no physical discharge duct geometry is inferred.",
  COLD,
  0.012,
  false,
);
air(
  "mixFirewall",
  [MIX, AIRFLOW_VALVE, CABIN_AIR_COUPLER],
  "Mixing-chamber firewall passage",
  "Mixing chamber flapper and firewall passage into the cabin air coupler (AMM21-20p1;21-60Fig21-60-1sheet2).",
  AIR,
  0.022,
);
air(
  "toMan",
  [CABIN_AIR_COUPLER, [2.46, -0.3, 0.24], [2.47, -0.15, 0.19], MANIFOLD],
  "Direct ventilation duct",
  "Ventilation path from the firewall coupler to the manifold when refrigeration is not selected (POH7-65). The optional fan branch is shown separately; duct routing schematic.",
  AIR,
  0.025,
);
air(
  "toEvap",
  [CABIN_AIR_COUPLER, [2.3, -0.55, 0.4], [1.8, -0.58, 0.42], AC.evaporator],
  "Evaporator supply duct",
  "Cabin air coupler duct to optional under-RH-seat evaporator (POH7-65; AMM21-40p7;21-50Fig21-50-1sheet6).",
  AIR,
  0.025,
);
air(
  "fanDuct",
  [BLOWER, [1.6, -0.56, 0.22], [2.22, -0.39, 0.23], MANIFOLD],
  "Blower ventilation duct",
  "Optional blower air to manifold without active refrigeration; simplified parallel visualization of the Fig7-13 fan path. No exact bypass-valve geometry inferred.",
  AIR,
  0.022,
);
air(
  "evapOut",
  [AC.evaporator, [1.6, -0.52, 0.36], [2.18, -0.36, 0.26], MANIFOLD],
  "Evaporator outlet duct",
  "Cooled air ducted forward to the distribution manifold (POH7-66;AMM21-50p1). Routing approximate.",
  COLD,
  0.025,
);
air(
  "recirc",
  [AC.recircInlet, AC.recircValve, AC.evaporator],
  "Cabin-air return",
  "Evaporator check valves admit cabin air in maximum-cooling recirculation (AMM21-00Fig21-00-1sheet2;21-50p1). Schematic return inlet.",
  COLD,
  0.024,
);
for (const [side, suffix] of [
  [-1, "L"],
  [1, "R"],
] as const) {
  air(
    "panel" + suffix,
    [MANIFOLD, [2.44, 0.02, side * 0.32], CREW_DISPLAY_VENT(side)],
    "Crew display-vent duct",
    "Direct manifold branch to outboard instrument-panel eyeball outlet (POH7-65;AMM21-20p1).",
    AIR,
    0.012,
  );
  air(
    "panel" + suffix + "2",
    [MANIFOLD, [2.4, -0.065, side * 0.12], CREW_PANEL_VENT(side)],
    "Crew bolster-vent duct",
    "Direct manifold branch to inboard bolster eyeball outlet (POH7-65;AMM21-20p1).",
    AIR,
    0.012,
  );
  air(
    "arm" + suffix,
    [MANIFOLD, [2.0, -0.59, side * 0.26], [0.6, -0.5, side * 0.48], PAX_PANEL_VENT(side)],
    "Passenger panel-vent duct",
    "Direct branch along cabin side trim to chest-height passenger outlet (POH7-65;AMM21-20).",
    AIR,
    0.013,
  );
  air(
    side < 0 ? "floorF" : "floorF2",
    [FLOOR_BUTTERFLY, [2.4, -0.22, side * 0.2], CREW_FLOOR_VENT(side)],
    "Crew floor duct",
    "Floor butterfly branch to adjustable kick-plate outlet (POH7-65–66).",
    AIR,
    0.014,
  );
  air(
    side < 0 ? "floorR" : "floorR2",
    [FLOOR_BUTTERFLY, [1.8, -0.61, side * 0.18], [0.7, -0.55, side * 0.49], PAX_FLOOR_VENT(side)],
    "Passenger floor duct",
    "Floor butterfly branch to fixed foot-warmer diffuser in rear side trim (POH7-65–66).",
    AIR,
    0.014,
  );
}
air(
  "defrost",
  [DEFROST_BUTTERFLY, [2.45, 0.16, 0], DEFROST_VENT],
  "Windshield defrost duct",
  "Defrost butterfly to the glareshield/lower windshield diffuser (POH7-65–67;AMM21-40p7). One central supply shown.",
  AIR,
  0.018,
);
const refrigerant = (key: string, pts: FlowSpec["pts"], name: string, note: string, color: string) =>
  air(key, pts, name, note, color, 0.006);
refrigerant(
  "acDischarge",
  [AC.compressor, [3.1, -0.25, -0.26], [2.5, -0.56, 0.25], [0.7, -0.56, 0.25], AC.condenser],
  "A/C discharge hose",
  "High-pressure heat-laden vapor from engine-driven compressor to under-baggage-floor condenser (POH7-66;AMM21-50p1). Firewall and underfloor hose path schematic.",
  HOT,
);
refrigerant(
  "acToReceiver",
  [AC.condenser, AC.receiver],
  "Condenser liquid outlet",
  "Heat rejected to outside air condenses the refrigerant; liquid enters receiver-drier (POH7-66).",
  "#DFAE57",
);
refrigerant(
  "acLiquid",
  [AC.receiver, [0.5, -0.56, 0.3], AC.expansion],
  "A/C liquid line",
  "Filtered, dried liquid to the evaporator expansion valve (POH7-66;AMM21-50p1).",
  "#DFAE57",
);
refrigerant(
  "acExpand",
  [AC.expansion, AC.evaporator],
  "Metered refrigerant inlet",
  "Expansion valve meters liquid into the evaporator; phase change absorbs cabin heat (POH7-66).",
  COLD,
);
refrigerant(
  "acSuction",
  [AC.evaporator, [2.2, -0.57, 0.25], [2.6, -0.55, 0.25], [3.1, -0.2, -0.3], AC.compressor],
  "A/C suction hose",
  "Low-pressure vapor returns from evaporator to compressor (POH7-66;AMM21-50Fig21-50-1sheet5). Routing schematic.",
  COLD,
);
air(
  "condAirIn",
  [AC.intake, [AC.intake[0], AC.intake[1] + 0.04, AC.intake[2]], AC.condenser],
  "Condenser outside-air inlet",
  "Separate outside cooling-air circuit from belly intake screen to condenser; never feeds cabin outlets (AMM21-50Fig21-50-1sheet7).",
  COLD,
  0.018,
);
air(
  "condAirOut",
  [AC.condenser, AC.condenserFan, [AC.exhaust[0], AC.exhaust[1] + 0.04, AC.exhaust[2]], AC.exhaust],
  "Condenser heat exhaust",
  "Condenser blower and outlet duct discharge heat through belly exhaust screen/deflector (AMM21-50Fig21-50-1sheet7).",
  HOT,
  0.018,
);
air(
  "condensate",
  [AC.evaporator, AC.drain],
  "Evaporator condensate drain hose",
  "Condensed cabin moisture drains overboard through belly (POH7-66;AMM21-50Fig21-50-1sheet6). Moisture rate is an illustrative cue; humidity is not modeled.",
  COLD,
  0.003,
);
F.push({
  key: "ecsSignal",
  pts: [ECS_PANEL, ECS_CONTROLLER, [2.4, -0.1, 0.1], MANIFOLD],
  sys: ["environment"],
  name: "ECS control harness",
  note: "Control panel/controller to manifold actuator; separate from the air ducts (AMM21-60Fig21-60-1). Schematic wiring route.",
  r: 0.003,
  count: 0,
});
F.push({
  key: "eltRemote",
  pts: [ELT_REMOTE, [1.8, -0.57, -0.17], [0.5, -0.62, -0.17], [-0.5, -0.4, 0.13], ELT_POS],
  sys: ["cabin", "caps"],
  name: "ELT remote control cable",
  note: "Artex ELT1000 transmitter to ON–ARM/OFF–TEST panel/LED (POH7-92–94,Fig7-21;AMM25-60p1). Schematic signal route, not an aircraft-bus power feed.",
  r: 0.003,
  count: 0,
});
for (const side of [-1, 1])
  F.push({
    key: side < 0 ? "restraintL" : "restraintR",
    pts: [RESTRAINT_EMA, [0.8, -0.61, side * 0.28], RESTRAINT_INFLATOR(side)],
    sys: ["cabin"],
    name: "Inflatable restraint signal cable",
    note: "Self-powered crash module to front-seat inflator; interface cables run along the forward spar-tunnel surface and longerons (POH7-30;AMM25-10pp23–25). Route schematic.",
    r: 0.003,
    count: 0,
  });

export const CABIN_ENVIRONMENT_CAPS_DEPTH_FLOWS: FlowSpec[] = F;
/** Only the short aperture at each documented belly port may cross the skin.
 * Reach is a schematic mesh clearance envelope, not a source installation dimension or a whole-route exemption. */
export const CABIN_ENVIRONMENT_SKIN_PORTS: Readonly<Record<string, { point: Vec3; reach: number; part: string }>> = {
  condAirIn: { point: AC.intake, reach: 0.028, part: "Condenser intake screen" },
  condAirOut: { point: AC.exhaust, reach: 0.028, part: "Condenser exhaust screen" },
  condensate: { point: AC.drain, reach: 0.013, part: "Evaporator condensate drain" },
};

/** Replace the original environmental key block, then merge these rates into the main flow-rate result. */
export function cabinEnvironmentCapsDepthRates(s: Sim, E: Elec): Record<string, number> {
  const c = cabinOperation(s, E),
    r: Record<string, number> = {},
    selectedAc = s.env.ac && s.env.fan > 0;
  const ram = s.eng.running ? 0.45 : 0;
  r.freshFeed = r.heatIn = r.heaterFeed = ram;
  r.fresh = c.fresh;
  r.hot = c.hot;
  r.hotDump = ram * (1 - c.hotValve);
  r.freshDump = ram * (1 - c.freshValve);
  r.mixFirewall = c.recirc ? 0 : c.air;
  r.toMan = selectedAc ? 0 : c.air;
  r.toEvap = selectedAc && !c.recirc ? c.air : 0;
  r.fanDuct = !selectedAc && c.blower ? c.air : 0;
  r.evapOut = selectedAc ? c.air : 0;
  r.recirc = c.recirc ? c.air : 0;
  for (const k of ["panelL", "panelR", "panelL2", "panelR2", "armL", "armR"]) r[k] = c.air;
  for (const k of ["floorF", "floorF2", "floorR", "floorR2"]) r[k] = ["PF", "PFW"].includes(s.env.vent) ? c.air : 0;
  r.defrost = ["PFW", "W"].includes(s.env.vent) ? c.air : 0;
  for (const k of ["acDischarge", "acToReceiver", "acLiquid", "acExpand", "acSuction", "condAirIn", "condAirOut"])
    r[k] = c.ac ? 1 : 0;
  r.condensate = c.ac ? 0.1 : 0;
  return r;
}
