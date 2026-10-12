/** Normal and alternate induction, metered fuel hardware, four exhaust ports and cabin heat shroud.
 * POH 11934-005 7-34–7-40; AMM 12137-002 71-60, 73-00, 73-30, 78-00/10/20. Geometry approximate.
 */
import { box, cyl, mergeGeos, tubeGeo } from "@/lib/geometry";
import {
  AIR_FILTER,
  ALT_AIR,
  CYLS,
  ENGINE_FUEL_PUMP,
  EXHAUST_COLLECTOR,
  FUEL_DIVIDER,
  FUEL_FLOW_SENSOR,
  INDUCTION_PLENUM,
  MUFFLER,
  THROTTLE,
  TAILPIPE,
  injectorPoint,
} from "../engine-anchors";
import { altDoorAnim, part } from "./catalogue";

part(() => box(0.1, 0.12, 0.14), ["engine"], {
  pos: AIR_FILTER,
  color: "#C9B98F",
  name: "Induction air filter",
  note: "Paper filter mounted on the right forward engine baffling; air then enters the induction duct and fuel servo (POH 7-39; AMM 71-60 p. 1). Filter, housing and coordinates approximate.",
  pin: true,
  groups: ["induction"],
});
part(() => box(0.06, 0.115, 0.13), ["engine"], {
  pos: [3.515, -0.16, 0.2],
  color: "#7D929C",
  name: "Induction duct / alternate-air junction",
  note: "Right forward induction duct accepts filtered air or air from a flexible duct on the sheltered warm side of the baffling (AMM 71-60 p. 1). Envelope and routing approximate.",
  groups: ["induction"],
});
part(() => box(0.022, 0.075, 0.085), ["engine"], {
  pos: ALT_AIR,
  color: "#E0B040",
  anim: altDoorAnim(ALT_AIR[0]),
  name: "Alternate air door",
  note: "Manually opened by ALT AIR – PULL; bypasses the filter and admits warm unfiltered air. A blocked normal inlet does not automatically open it (POH 7-35, 7-39; AMM 71-60 p. 1). Door movement and placement approximate.",
  pin: true,
  groups: ["induction"],
});
part(() => cyl(0.055, 0.14, "x"), ["engine", "fuel"], {
  pos: THROTTLE,
  color: "#7E8A93",
  name: "Throttle body / fuel servo",
  note: "The power-lever cable opens the air butterfly. Air pressure differential moves the servo diaphragm and fuel valve; the mixture cable varies the metering opening. CUTOFF closes the valve, removes fuel pressure from the divider and stops the engine (POH 7-34; AMM 73-00 p. 1). Dimensions and mounting coordinates approximate.",
  pin: true,
  groups: ["induction", "fuel"],
});
part(() => box(0.085, 0.065, 0.06), ["engine", "fuel"], {
  pos: [THROTTLE[0], THROTTLE[1] + 0.012, THROTTLE[2] + 0.07],
  color: "#9D8A74",
  name: "Fuel servo regulator / mixture valve",
  note: "Separate schematic regulator envelope beside the throttle bore: balances air and fuel pressures so the fuel metering rate follows airflow; manual mixture and idle cutoff (POH 7-34). This does not show measured internal servo geometry.",
  groups: ["fuel"],
});
part(() => box(0.38, 0.065, 0.26), ["engine"], {
  pos: INDUCTION_PLENUM,
  color: "#708993",
  name: "Induction plenum",
  note: "Air downstream of the throttle distributes through the four intake manifold tubes, one to each cylinder. MAP and MAT are sensed in this induction manifold (POH 7-38–7-39; AMM 71-60 p. 1, 77-10/77-20 p. 1). Envelope and tube routing schematic.",
  pin: true,
  groups: ["induction"],
});
part(() => cyl(0.044, 0.075, "x"), ["fuel", "engine"], {
  pos: ENGINE_FUEL_PUMP,
  color: "#5C8AA5",
  name: "Engine-driven fuel pump",
  note: "Diaphragm-type engine-driven pump (Lycoming IOM-IO-390-C Jan2017 System Description p. 4). Draws from the selected collector through the airframe filter and selector, then pressure-feeds the fuel servo. Electric boost supplements fuel pressure for starting and vapor suppression (POH 7-40–7-41; AMM 73-00 p. 1). Body and ports approximate.",
  pin: true,
  groups: ["fuel"],
});
part(() => box(0.055, 0.04, 0.055), ["fuel", "engine", "avionics"], {
  pos: FUEL_FLOW_SENSOR,
  color: "#79A5BD",
  name: "Fuel flow transducer",
  note: "In the metered line between the servo and distribution manifold; mounted to the engine and baffling. Sends flow data to the GEA 71; ENGINE INSTR, ESS BUS 2 (AMM 73-30 pp. 1–4, Fig 73-30-1). Separate from the flow divider. Shape and coordinates approximate.",
  pin: true,
  groups: ["sensors"],
});
part(() => cyl(0.042, 0.048), ["fuel", "engine"], {
  pos: FUEL_DIVIDER,
  color: "#6C8799",
  name: "Fuel flow divider (spider)",
  note: "Diaphragm and spring-loaded plunger distribute metered fuel through four outlets. The AMM describes opening at approximately 0.5 psi. Mixture cutoff removes pressure so the divider closes (POH 7-34, 7-40; AMM 73-00 p. 1). Geometry approximate.",
  pin: true,
  groups: ["fuel"],
});
for (const c of CYLS) {
  part(() => mergeGeos([cyl(0.012, 0.035), cyl(0.009, 0.017, "z").translate(0, 0.013, 0)]), ["fuel", "engine"], {
    pos: injectorPoint(c),
    color: "#BE9A56",
    name: "Fuel injector nozzle — cyl " + c.n,
    note: "One nozzle per cylinder intake port; continuous-flow injection, rather than a timed electronic pulse (POH 7-40; AMM 73-00 p. 1). Shape and placement approximate.",
    groups: ["fuel"],
  });
}
part(() => cyl(0.027, 0.12, "x"), ["engine"], {
  pos: EXHAUST_COLLECTOR,
  color: "#8A5A3C",
  name: "Exhaust collector weldment",
  pin: true,
  note: "Four headers collect on the right: right-bank pipes run down alongside the engine, left-bank pipes pass below it. Ball and slip joints accommodate expansion and engine movement (AMM 78-00/78-10 p. 1). The POH 7-39 instead calls the muffler left-side; this geometry follows the installation-specific AMM right-side route. Coordinates approximate.",
  groups: ["exhaust"],
});
part(() => cyl(0.06, 0.28, "z"), ["engine", "environment"], {
  pos: MUFFLER,
  color: "#8A5A3C",
  name: "Muffler",
  note: "Single muffler / heat exchanger aft of the right collector in the AMM installation (78-00/78-10 p. 1). POH 7-39 says left, while its environmental description and AMM show the right-side heat circuit. Size and coordinates approximate.",
  pin: true,
  groups: ["exhaust"],
});
part(() => cyl(0.08, 0.2, "z"), ["environment", "engine"], {
  pos: MUFFLER,
  color: "#E0522B",
  fairing: true,
  name: "Heat exchanger (muff)",
  note: "A separate air shroud around the exhaust muffler heats cabin ram air. Cabin air stays outside the exhaust-gas passages; damage can allow exhaust contamination (POH 7-39; AMM 78-00 p. 2, 78-20 pp. 2–3). Envelope approximate.",
  groups: ["exhaust"],
});

part(() => tubeGeo(TAILPIPE, 0.024), ["engine"], {
  color: "#8A5A3C",
  name: "Exhaust tailpipe",
  pin: true,
  ext: true,
  groups: ["exhaust"],
  note: "From the muffler through the lower cowling; check condition, security and clearance on preflight (POH4-7,7-39; AMM78-00p1). Position and diameter approximate.",
});
