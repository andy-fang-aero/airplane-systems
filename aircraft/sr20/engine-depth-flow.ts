/** Detailed SR20 G6 engine routes. Topology follows the SR20 POH/AMM, geometry is schematic.
 * Each independent physical circuit has an independent key so shutdown, alternate air and ignition selection
 * cannot animate unrelated lines. Oil galleries are conceptual internal paths (particles only).
 */
import type { FlowSpec } from "@/lib/catalogue";
import type { Vec3 } from "@/lib/math";
import type { Elec, Sim } from "./model";
import { fuelAvail, inductionAvailable } from "./model";
import { engineOperation } from "./operation";
import { GEA_71 } from "./parts/avionics";
import {
  AIR_FILTER,
  ALT_AIR,
  CYLS,
  ENGINE_FUEL_PUMP,
  ENGINE_HARNESS,
  EXHAUST_COLLECTOR,
  FUEL_DIVIDER,
  FUEL_FLOW_SENSOR,
  GOVERNOR,
  INDUCTION_PLENUM,
  INDUCTION_ENTRY,
  MAGNETO,
  MAP_SENSOR,
  MAT_SENSOR,
  MUFFLER,
  OIL_CONTROL,
  OIL_COOLER,
  OIL_FILTER,
  OIL_GALLERY,
  OIL_PRESSURE,
  OIL_PUMP,
  OIL_RELIEF,
  OIL_SCREEN,
  OIL_SEPARATOR,
  OIL_SUMP,
  OIL_TEMP,
  PROP_OIL,
  SLICKSTART,
  STARTER,
  THROTTLE,
  TAILPIPE,
  cylPoint,
  egtPoint,
  exhaustPort,
  injectorPoint,
  intakePort,
  plugMag,
  plugPoint,
} from "./engine-anchors";

const F: FlowSpec[] = [];
const flow = (key: string, pts: Vec3[], options: Omit<FlowSpec, "key" | "pts">) => F.push({ key, pts, ...options });
const induction = {
  sys: ["engine"] as FlowSpec["sys"],
  groups: ["induction"] as FlowSpec["groups"],
  color: "#7B969F",
  pcolor: "#8FD3E8",
  r: 0.019,
  count: 5,
};
const fuel = {
  sys: ["fuel", "engine"] as FlowSpec["sys"],
  groups: ["fuel"] as FlowSpec["groups"],
  color: "#5382A0",
  pcolor: "#63BAF2",
  r: 0.007,
  count: 5,
};
const oil = {
  sys: ["engine"] as FlowSpec["sys"],
  groups: ["oil"] as FlowSpec["groups"],
  color: "#B85A2A",
  pcolor: "#F4B55A",
  r: 0.008,
  count: 5,
};
const ignition = {
  sys: ["engine"] as FlowSpec["sys"],
  groups: ["ignition"] as FlowSpec["groups"],
  color: "#A6ABA5",
  pcolor: "#FFDD83",
  r: 0.004,
  size: 0.017,
  count: 7,
};
const sensors = {
  sys: ["engine", "avionics"] as FlowSpec["sys"],
  groups: ["sensors"] as FlowSpec["groups"],
  color: "#52768A",
  pcolor: "#A9D9EA",
  r: 0.0025,
  size: 0.014,
  count: 4,
};

flow("intakeEntrance", [[3.76, -0.13, 0.22], INDUCTION_ENTRY], {
  ...induction,
  tube: false,
  ext: true,
  name: "Air entering right cowl inlet",
  note: "Outside air enters at the cowling opening before the internal filtered duct. Particles only; no exterior induction hose (POH7-39). Position approximate.",
});
flow("intake", [INDUCTION_ENTRY, AIR_FILTER, [3.515, -0.16, 0.2], [3.49, -0.32, 0.16], THROTTLE], {
  ...induction,
  name: "Filtered induction duct",
  note: "Right-forward filter → induction duct → throttle butterfly (POH7-39; AMM71-60p1). Routing approximate.",
});
flow("alternateIntake", [[3.1, 0.045, 0.22], [3.4, -0.025, 0.25], ALT_AIR, [3.49, -0.32, 0.16], THROTTLE], {
  ...induction,
  name: "Warm alternate-air duct",
  note: "Sheltered side of baffling → manually opened alternate-air valve → servo. Bypasses the filter (POH7-35; AMM71-60p1). Flexible duct shape and routing approximate.",
});
flow("servoAir", [THROTTLE, [3.32, -0.42, 0], INDUCTION_PLENUM], {
  ...induction,
  name: "Throttle → induction plenum",
  note: "Air leaving the throttle feeds the four-tube manifold (POH7-39). Routing schematic.",
});
for (const c of CYLS) {
  flow("man" + c.n, [INDUCTION_PLENUM, [c.x + 0.03, -0.345, c.s * 0.18], intakePort(c)], {
    ...induction,
    name: "Intake tube — cyl " + c.n,
    note: "Individual manifold tube supplies the cylinder intake port (POH7-39; AMM71-60p1). Shape approximate.",
  });
  flow("inj" + c.n, [FUEL_DIVIDER, [c.x + 0.045, 0.075, c.s * 0.2], injectorPoint(c)], {
    ...fuel,
    name: "Injector line — cyl " + c.n,
    note: "Flow divider outlet → individual continuous-flow nozzle (POH7-40; AMM73-00p1). Steel-line routing approximate.",
  });
  for (const level of ["U", "L"] as const) {
    const mag = plugMag(c, level);
    flow(
      `ign${c.n}${level}`,
      [
        [MAGNETO(mag)[0] - 0.075, MAGNETO(mag)[1], MAGNETO(mag)[2]],
        [2.77, level === "U" ? 0.025 : -0.31, c.s * 0.24],
        [c.x - 0.12, level === "U" ? 0.025 : -0.31, c.s * 0.39],
        plugPoint(c, level),
      ],
      {
        ...ignition,
        name: `Ignition lead — cyl ${c.n} ${level === "U" ? "upper" : "lower"}`,
        note: `${mag} magneto → shielded lead → spark plug (POH7-39; AMM74-00p1,74-20pp1–2). Routing approximate.`,
      },
    );
  }
  const port = exhaustPort(c);
  flow(
    "exh" + c.n,
    [
      port,
      [port[0], -0.29, port[2]],
      [port[0], -0.43, c.s * 0.32],
      ...(c.s < 0
        ? ([
            [3.25, -0.51, -0.28],
            [3.25, -0.51, 0.14],
          ] as Vec3[])
        : []),
      EXHAUST_COLLECTOR,
    ],
    {
      sys: ["engine"],
      groups: ["exhaust"],
      r: 0.018,
      color: "#8A5A3C",
      pcolor: "#FF8A4A",
      count: 5,
      name: "Exhaust header — cyl " + c.n,
      note: "Individual cylinder header to right collector. Left bank crosses below the sump; thermal-expansion joints accommodate motion (AMM78-00/10p1). Routing approximate.",
    },
  );
  for (const [sensor, point] of [
    ["CHT", cylPoint(c, [0.035, -0.108, c.s * 0.13])],
    ["EGT", egtPoint(c)],
  ] as const)
    flow(
      `${sensor.toLowerCase()}Wire${c.n}`,
      [point, [c.x, -0.055, c.s * 0.385], [2.78, 0.015, c.s * 0.35], ENGINE_HARNESS],
      {
        ...sensors,
        name: `${sensor} signal — cyl ${c.n}`,
        note: "Independent temperature probe → firewall-forward harness → GEA71 (POH7-37; AMM77-20). Routing approximate.",
      },
    );
}
flow("engineFuel", [ENGINE_FUEL_PUMP, [2.9, -0.31, 0.18], [3.29, -0.34, 0.16], [3.43, -0.39, 0.08], THROTTLE], {
  ...fuel,
  name: "Engine pump → fuel servo",
  note: "Engine-driven pump pressure-feeds the servo (POH7-40; AMM73-00p1). Routing approximate.",
});
flow("meteredFuel", [THROTTLE, [3.42, -0.32, 0.24], [3.36, -0.08, 0.24], FUEL_FLOW_SENSOR], {
  ...fuel,
  name: "Metered fuel → flow transducer",
  note: "Servo-metered fuel passes through the separate flow transducer (AMM73-30p1). Routing approximate.",
});
flow("dividerFeed", [FUEL_FLOW_SENSOR, [3.2, 0.085, 0.08], FUEL_DIVIDER], {
  ...fuel,
  name: "Transducer → flow divider",
  note: "Fuel flow sensor is upstream of the four-outlet divider (AMM73-30p1). Routing approximate.",
});
flow("collectorMuffler", [EXHAUST_COLLECTOR, [3.15, -0.44, 0.245], [MUFFLER[0], MUFFLER[1], MUFFLER[2] - 0.12]], {
  sys: ["engine"],
  groups: ["exhaust"],
  r: 0.025,
  color: "#8A5A3C",
  pcolor: "#FF8A4A",
  name: "Collector → muffler",
  note: "Collected exhaust flows aft into the heat exchanger/muffler (AMM78-10p1). Routing approximate.",
});
flow("tailpipe", TAILPIPE, {
  sys: ["engine"],
  groups: ["exhaust"],
  r: 0.024,
  tube: false,
  color: "#8A5A3C",
  pcolor: "#FF8A4A",
  name: "Exhaust tailpipe",
  note: "Muffler → lower-cowl exhaust outlet (POH7-39; AMM78-00p1). Position approximate.",
  ext: true,
});
flow("oilPickup", [OIL_SUMP, OIL_SCREEN, OIL_PUMP], {
  ...oil,
  tube: false,
  name: "Oil pickup / pump",
  note: "Wet sump → suction screen → engine oil pumping circuit (POH7-38). Internal route schematic, particles only.",
});
flow("oilToControl", [OIL_PUMP, [2.93, -0.28, -0.18], [3.2, -0.28, -0.28], OIL_CONTROL], {
  ...oil,
  name: "Oil supply → cooler control",
  note: "Pumped oil reaches the remote cooler or its bypass (POH7-38). Routing schematic.",
});
flow("oilCoolerFeed", [OIL_CONTROL, [3.37, -0.19, -0.36], OIL_COOLER], {
  ...oil,
  name: "Oil cooler feed",
  note: "Remote cooler feed hose (AMM79-20p2). Routing approximate.",
});
flow("oilCoolerReturn", [OIL_COOLER, [3.28, -0.08, -0.29], [3.05, 0.04, -0.24], [2.86, 0.065, 0.14], OIL_FILTER], {
  ...oil,
  name: "Cooled oil → full-flow filter",
  note: "POH7-38 places the remote cooler before the full-flow filter; AMM79-20p2 identifies separate feed and return hoses. Routing approximate.",
});
flow("oilBypass", [OIL_CONTROL, OIL_FILTER], {
  ...oil,
  tube: false,
  name: "Oil cooler bypass",
  note: "Bypasses the cooler below 170°F or above 18psi cooler pressure drop (POH7-38). Both paths animate to explain topology; temperature and differential pressure are not simulated.",
});
flow("oilRelief", [OIL_FILTER, OIL_RELIEF, OIL_GALLERY], {
  ...oil,
  tube: false,
  name: "Filter → relief → galleries",
  note: "POH7-38 oil distribution sequence. Representative internal passages, particles only.",
});
for (const c of CYLS)
  flow("oilCyl" + c.n, [OIL_GALLERY, [c.x, -0.17, c.s * 0.11], [c.x, -0.15, c.s * 0.18], OIL_SUMP], {
    ...oil,
    tube: false,
    name: "Internal lubrication — cyl " + c.n,
    note: "Oil galleries lubricate rotating parts and cool piston inner domes before returning to the wet sump (POH7-38). Conceptual circuit, not an external oil hose.",
  });
flow("governorSupply", [OIL_GALLERY, [3.37, -0.12, -0.11], GOVERNOR], {
  ...oil,
  sys: ["engine", "propeller"],
  tube: false,
  name: "Engine oil → propeller governor",
  note: "Engine oil feeds the governor's pressure-boosting pump (POH7-38,7-40). Internal oil passage schematic.",
});
flow("propOil", [GOVERNOR, [3.56, -0.08, -0.1], [3.62, -0.14, 0], PROP_OIL], {
  ...oil,
  sys: ["engine", "propeller"],
  tube: false,
  ext: true,
  name: "Governor → hub pitch piston",
  note: "Boosted governor oil drives the hub piston toward high pitch; oil release permits low pitch (POH7-40; AMM61-10p1). Internal oil path schematic; particles indicate the circuit, not measured valve flow.",
});
flow("breatherSupply", [[2.79, 0.02, 0.18], [2.73, 0.055, 0.25], OIL_SEPARATOR], {
  ...oil,
  r: 0.01,
  name: "Crankcase → air/oil separator",
  note: "Separator supply hose (AMM79-20pp8–10). Routing approximate.",
});
flow("separatorReturn", [OIL_SEPARATOR, [2.73, -0.14, 0.23], [2.9, -0.36, 0.12], OIL_SUMP], {
  ...oil,
  r: 0.005,
  name: "Separator oil return",
  note: "Separate oil return line (AMM79-20pp8–10,Fig79-20-2). Routing approximate.",
});
flow("separatorVent", [OIL_SEPARATOR, [2.67, -0.2, 0.34], [2.69, -0.51, 0.33], [2.74, -0.64, 0.3]], {
  ...oil,
  r: 0.01,
  name: "Separator overboard breather",
  note: "Separate breather hose leaving the separator (AMM79-20pp8–10,Fig79-20-2). Routing approximate.",
  ext: true,
});
for (const mag of ["L", "R"] as const)
  flow("pLead" + mag, [[2.54, 0.015, -0.18], [2.64, 0.02, -0.2], [2.68, 0.015, MAGNETO(mag)[2]], MAGNETO(mag)], {
    ...ignition,
    name: mag + " magneto P-lead",
    note: "Ignition switch grounds the magneto primary to inhibit spark. This is a grounding/control wire, not battery ignition power (POH7-39; AMM74-00p1). Routing approximate.",
  });
flow("boosterLead", [SLICKSTART, [2.69, 0.07, 0], MAGNETO("L")], {
  ...ignition,
  name: "SlickSTART → left magneto",
  note: "Maintenance manual's separate retard-contact starting circuit to the left magneto (AMM74-00p1,74-10p2). The POH's both-magnetos START description governs this study animation. Routing approximate.",
});
flow("starterCable", [[2.67, -0.04, -0.26], [2.85, -0.3, -0.24], [3.26, -0.35, -0.2], STARTER], {
  ...ignition,
  sys: ["engine", "electrical"],
  r: 0.006,
  name: "Starter power cable",
  note: "Representative high-current motor feed separate from the 2A STARTER control breaker (POHFig7-10; AMM80-00p1). Routing approximate.",
});
for (const [key, point] of [
  ["map", MAP_SENSOR],
  ["mat", MAT_SENSOR],
  ["oilPressure", OIL_PRESSURE],
  ["oilTemperature", OIL_TEMP],
  ["fuelFlow", FUEL_FLOW_SENSOR],
  ["rpm", [MAGNETO("R")[0], MAGNETO("R")[1] + 0.06, MAGNETO("R")[2]] as Vec3],
] as const)
  flow(key + "Signal", [point, [2.88, 0.045, -0.18], ENGINE_HARNESS], {
    ...sensors,
    name: key + " sensor signal",
    note: "Sensor → firewall harness → GEA71 (POH7-35,7-37–38; AMM73-30,77-10/20,79-30). Routing approximate.",
  });
flow("engineData", [ENGINE_HARNESS, [2.6, 0.045, -0.23], [2.47, 0.02, -0.2], GEA_71], {
  ...sensors,
  name: "Engine harness → GEA 71",
  note: "Sensor data reaches the Engine Airframe Unit behind the instrument panel (POH7-35; AMM77-40p1). ENGINE INSTR powers the indicating system; magnetos generate ignition independently. Harness routing schematic.",
});
for (const side of [-1, 1])
  flow(
    "engineCooling" + (side > 0 ? "R" : "L"),
    [
      [3.72, -0.02, side * 0.22],
      [3.4, 0.025, side * 0.3],
      [3.13, -0.15, side * 0.28],
      [2.9, -0.3, side * 0.31],
      [2.75, -0.48, side * 0.28],
    ],
    {
      sys: ["engine"],
      groups: [],
      tube: false,
      pcolor: "#A4D6E1",
      size: 0.027,
      count: 12,
      name: "Baffled cooling air — " + (side > 0 ? "right" : "left"),
      note: "Cowling inlet → cylinder fins → aft cowling outlet; no movable cowl flaps (POH7-40). Air path schematic; this model does not calculate temperature or pressure distribution.",
    },
  );

for (const [key, source, destination, name] of [
  ["throttleCable", [1.68, -0.32, -0.035], THROTTLE, "Power lever → throttle cable"],
  ["governorCable", [1.68, -0.32, -0.035], GOVERNOR, "Power lever → governor cable"],
  ["mixtureCable", [1.68, -0.32, 0.04], THROTTLE, "Mixture lever → servo cable"],
] as const) {
  flow(
    key,
    [
      source as Vec3,
      [2.12, -0.43, -0.08],
      [2.58, -0.34, -0.12],
      [2.8, -0.32, key === "governorCable" ? -0.24 : -0.09],
      destination,
    ],
    {
      sys: ["engine", ...(key === "governorCable" ? ["propeller" as const] : [])],
      groups: key === "governorCable" ? ["oil"] : key === "mixtureCable" ? ["fuel"] : ["induction", "fuel"],
      color: "#A0A79E",
      r: 0.003,
      count: 0,
      name,
      note: "Mechanical control cable from the center console; the power lever has separate throttle and governor cables, while mixture separately sets the servo valve (POH7-34; AMM76-10). Routing approximate.",
    },
  );
}

export const ENGINE_DEPTH_FLOWS = F;
/** Rates show operating circuits, not oil-pressure, temperature, combustion or mixture calculations. */
export function engineDepthFlowRates(s: Sim, E: Elec, rpm: number): Record<string, number> {
  const R: Record<string, number> = Object.fromEntries(F.map((f) => [f.key, 0]));
  const op = engineOperation(s, E, rpm);
  const turning = s.eng.running || op.cranking;
  const breathing = turning && inductionAvailable(s);
  const metered = (turning || (s.fuel.boost && E.boostPwr)) && fuelAvail(s) && s.eng.mix > 0.05;
  const combustion = s.eng.running && breathing && fuelAvail(s) && s.eng.mix > 0.05 && (op.leftMag || op.rightMag);
  R.intake = R.intakeEntrance = breathing && !s.eng.altAir ? 1 : 0;
  R.alternateIntake = breathing && s.eng.altAir ? 1 : 0;
  R.servoAir = breathing ? 1 : 0;
  R.engineFuel = (turning && fuelAvail(s)) || (s.fuel.boost && E.boostPwr && fuelAvail(s)) ? 1 : 0;
  R.meteredFuel = R.dividerFeed = metered ? 1 : 0;
  R.collectorMuffler = R.tailpipe = combustion ? 1.2 : 0;
  for (const c of CYLS) {
    R["man" + c.n] = breathing ? 1 : 0;
    R["inj" + c.n] = metered ? 1 : 0;
    R["exh" + c.n] = combustion ? 1.2 : 0;
    for (const level of ["U", "L"] as const)
      R[`ign${c.n}${level}`] = (plugMag(c, level) === "L" ? op.leftMag : op.rightMag) ? 1 : 0;
  }
  for (const flow of F) {
    if (flow.groups?.includes("oil")) R[flow.key] = turning ? 0.7 : 0;
    if (flow.groups?.includes("sensors")) R[flow.key] = E.eisPwr ? 0.35 : 0;
  }
  R.pLeadL = R.pLeadR = 0; // Primary grounding is not a continuous battery power flow.
  R.boosterLead = R.starterCable = op.cranking ? 1 : 0;
  R.engineCoolingL = R.engineCoolingR = turning ? 0.65 : 0;
  return R;
}
