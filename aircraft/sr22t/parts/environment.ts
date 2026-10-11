/**
 * Environmental system (all but the A/C parts): fresh-air inlet, hot-air and fresh-air valves,
 * mixing chamber and its airflow valve servo, duct temperature sensor and ECS controller, distribution manifold and its
 * butterfly valves, blower fan, cabin outlets and the control panel.
 * The A/C evaporator and condenser are in aircon.ts.
 * Sources: POH 13772-007 7-13, Fig 7-4 (7-15), 7-61 … 7-66, Fig 7-13 (7-62); AMM 13773-002 Rev 7 21-20 (Fig 21-20-1), 21-40,
 * 21-60.
 */
import type { PartAnim } from "@/lib/catalogue";
import { mergeGeos } from "@/lib/geometry";
import type { Vec3 } from "@/lib/math";
import { FW, box, cyl, sph } from "../geometry";
import type { Elec, Sim, Vent } from "../model";
import { useSR22T } from "../store";
import { part } from "./catalogue";
import { REAR_SEAT } from "./cabin";

/* ---------- valve state (flows.ts and the part animations read these) ---------- */
type Env = Sim["env"];
/** Airflow (flapper) valve in the mixing chamber: closed only at airflow OFF (POH 7-65; AMM 21-20 PDF p. 454). */
export const airflowValveOpen = (e: Env) => e.fan >= 0;
/**
 * Hot-air valve opening 0–1: the temperature selector sets it; the A/C snowflake closes it (POH 7-66). Airflow OFF
 * closes only the chamber's flapper, not the inlet valves (POH 7-65, 7-66).
 */
export const hotValveOpen = (e: Env) => (e.ac ? 0 : e.temp);
/** Fresh-air valve opening 0–1: the temperature selector sets it; recirculation closes it (POH 7-66). */
export const freshValveOpen = (e: Env) => (e.recirc ? 0 : 1 - e.temp);
/** Control panel power: 2 A CABIN AIR CONTROL breaker on MAIN BUS 1 (POH 7-61). */
export const cabinAirControlPowered = (s: Sim, E: Elec) => E.main1 > 0 && !s.cb["CABIN AIR CONTROL"];
/** Pure selector: the store's solver owns the last-powered latch (7waz N2, POH silent). */
export function valveEnv(s: Sim, E: Elec): Env {
  return cabinAirControlPowered(s, E) ? s.env : E.envHeld;
}
/** Distribution-manifold butterfly valves by vent selection (POH 7-66; AMM 21-60 PDF p. 524). */
export const butterflies = (vent: Vent) => ({
  floor: vent === "PF" || vent === "PFW",
  defrost: vent === "PFW" || vent === "W",
});

const V = () => {
  const st = useSR22T.getState();
  return valveEnv(st.s, st.E);
};
/** Valve plate turning about `axis`: across the duct (closed) at 0, edge-on (open) at 1. */
const plateAnim =
  (open: () => number, axis: "x" | "y" | "z"): PartAnim =>
  (m) => {
    m.rotation[axis] = (open() * Math.PI) / 2;
  };

/* ---------- environmental ---------- */
/** Anchor for flows.ts. */
export const FRESH_INLET: Vec3 = [3.42, -0.38, 0.49];
part(() => box(0.1, 0.03, 0.02), ["environment"], {
  pos: FRESH_INLET,
  name: "NACA fresh-air inlet",
  note: "RH cowl. Fresh (ventilation) air to the fresh-air valve on the firewall (POH 7-64). The AMM places it on the RH lower cowl (AMM 21-00).",
  pin: true,
  ext: true,
});
/** Mixing chamber on the forward side of the firewall (FS 100, x 2.61), lower right, outboard of the electric fuel pump.
 * Its 0.08-m depth keeps the valves on its forward face clear of the RH turbine housing. */
export const MIX: Vec3 = [2.66, -0.46, 0.36];
const MIX_DEPTH = 0.08;
part(() => box(MIX_DEPTH, 0.12, 0.14), ["environment"], {
  pos: MIX,
  name: "Mixing chamber",
  note: "Mounted to the forward side of the firewall (AMM 21-40 PDF p. 486; Fig 21-40-2 PDF p. 495), on its lower RH portion (POH 7-64). The hot-air and fresh-air valves on its forward side set the blend; a flapper valve driven by the airflow valve servo lets the air through the firewall into the cabin air coupler (AMM 21-20 PDF p. 454). Position approximate: the figure gives no dimensions.",
  pin: true,
});
/**
 * Cabin air coupler just aft of the firewall, where the mixing chamber's air comes through (AMM 21-20 PDF p. 454; Fig 21-60-1
 * sheet 2, PDF p. 536). The A/C coupler duct to the evaporator branches here (flows.ts). Position approximate.
 */
export const CABIN_AIR_COUPLER: Vec3 = [2.54, -0.46, 0.34];
// on the aft side of the firewall, in the cabin air coupler duct (toMan in flows.ts)
part(() => box(0.04, 0.04, 0.04), ["environment"], {
  pos: [2.47, -0.33, 0.25],
  color: "#E0B040",
  name: "Duct temperature sensor",
  note: "Reads mixed-air temperature downstream of the mixing chamber for the ECS controller, which above the duct temperature limit reduces hot air and increases fresh air, cycling the valves automatically. The hot-air source may exceed 300 °F (POH 7-64). Located in the cabin air coupler duct on the aft side of the firewall (AMM 21-60 PDF p. 525; Fig 21-60-2 PDF p. 539); position approximate. No limit value is published.",
  pin: true,
});
/** Distribution manifold, above the aileron push rod (y −0.2) and the central pulley sector below it; the ducts start here. */
export const DIST_MANIFOLD: Vec3 = [2.52, -0.1, 0];
part(() => box(0.08, 0.12, 0.28), ["environment"], {
  pos: DIST_MANIFOLD,
  name: "Distribution manifold",
  note: 'Mounted to the center, aft side of the firewall (POH 7-64, 7-65); its height on the firewall is approximate. Butterfly valves feed floor and defrost; the panel vents are always fed. Airflow selector: OFF closes cabin airflow; 0 is ram air; 1–3 are blower speeds (POH 7-62 Fig 7-13, 7-66; AMM 21-60). POH 7-65\'s mode list reads "OFF (ram air), 1, 2, 3", which contradicts its own "past the OFF position" sentence; the model follows Fig 7-13, 7-66 and the AMM. The blower on the evaporator assembly under the RH crew seat feeds it (Fig 7-13; AMM 21-20; AMM Fig 21-50-1 sheet 3, PDF p. 521).',
  pin: true,
});
// hot-air and fresh-air valves on the chamber's forward side (POH 7-64, 7-65; Fig 7-13); each plate turns with its opening
const VALVE_X = MIX[0] + MIX_DEPTH / 2 + 0.0175;
export const HOT_VALVE: Vec3 = [VALVE_X, -0.49, 0.32];
export const FRESH_VALVE: Vec3 = [VALVE_X, -0.42, 0.41];
part(() => cyl(0.035, 0.035, "x"), ["environment"], {
  pos: HOT_VALVE,
  color: "#E0522B",
  name: "Hot-air valve",
  note: "Mounted to the forward side of the firewall; admits heated air from the crossover-tube heat exchanger into the mixing chamber. When it is closed the heated air exits into the engine compartment and is exhausted overboard with the engine cooling airflow (POH 7-64). The temperature selector opens it as it closes the fresh-air valve; the A/C snowflake closes it (POH 7-66). Position approximate.",
  pin: true,
});
part(() => box(0.006, 0.066, 0.066), ["environment"], {
  pos: HOT_VALVE,
  color: "#8A3A22",
  anim: plateAnim(() => hotValveOpen(V()), "y"),
});
part(() => cyl(0.035, 0.035, "x"), ["environment"], {
  pos: FRESH_VALVE,
  color: "#5FC8F0",
  name: "Fresh-air valve",
  note: "Mounted to the forward side of the firewall; admits NACA-inlet ram air into the mixing chamber. When it is closed the air exits into the engine compartment and is exhausted overboard with the engine cooling airflow (POH 7-65). Recirculation closes it (POH 7-66). Position approximate.",
  pin: true,
});
part(() => box(0.006, 0.066, 0.066), ["environment"], {
  pos: FRESH_VALVE,
  color: "#2E6E86",
  anim: plateAnim(() => freshValveOpen(V()), "y"),
});
// the servo sits on top of the chamber; its arm swings with the flapper valve
part(() => box(0.05, 0.04, 0.05), ["environment"], {
  pos: [MIX[0], MIX[1] + 0.08, MIX[2] - 0.03],
  color: "#4A535B",
  name: "Airflow valve servo",
  note: 'AIR FLOW VALVE SERVO MOTOR (POH Fig 7-13): "An electrical servo actuates a flapper valve in the air mixing chamber, allowing air to pass through the firewall"; the selector at 1 opens it fully and starts the blower (AMM 21-20 PDF p. 454). Moving the airflow selector past OFF opens the valve fully (POH 7-65). Position approximate.',
  pin: true,
});
part(() => box(0.008, 0.008, 0.05), ["environment"], {
  pos: [MIX[0], MIX[1] + 0.105, MIX[2] - 0.03],
  color: "#C8CDD2",
  anim: plateAnim(() => (airflowValveOpen(V()) ? 1 : 0), "y"),
});
// the flapper sits in the chamber's aft outlet, between the chamber and the firewall (x 2.61 … 2.63)
part(() => box(0.006, 0.05, 0.05), ["environment"], {
  pos: [FW + 0.01, MIX[1], MIX[2]],
  color: "#8C969E",
  name: "Airflow flapper valve",
  note: 'In the air mixing chamber: "An electrical servo actuates a flapper valve in the air mixing chamber, allowing air to pass through the firewall"; the selector at 1 opens it fully (AMM 21-20 PDF p. 454). Moving the airflow selector past OFF opens it fully; at OFF it is closed (POH 7-65). Position and size approximate: no dimensioned drawing.',
  anim: plateAnim(() => (airflowValveOpen(V()) ? 1 : 0), "y"),
});
// butterfly valves at the entrances to the cabin floor ducting (manifold aft face) and the windshield diffuser (top)
part(() => cyl(0.028, 0.006, "x"), ["environment"], {
  pos: [2.475, -0.13, 0],
  color: "#0E6E68",
  name: "Floor butterfly valve",
  note: "At the entrance to the cabin floor ducting; Panel-Foot and Panel-Foot-Windshield open it, Panel and Windshield close it (POH 7-66; AMM 21-60 PDF p. 524). The vent selector buttons actuate it electrically.",
  pin: true,
  anim: plateAnim(() => (butterflies(V().vent).floor ? 1 : 0), "y"),
});
part(() => cyl(0.028, 0.006, "y"), ["environment"], {
  pos: [2.5, -0.035, 0],
  color: "#0E6E68",
  name: "Defrost butterfly valve",
  note: "At the entrance to the windshield diffuser; Panel-Foot-Windshield and Windshield open it, Panel and Panel-Foot close it (POH 7-66; AMM 21-60 PDF p. 524). The vent selector buttons actuate it electrically.",
  pin: true,
  anim: plateAnim(() => (butterflies(V().vent).defrost ? 1 : 0), "x"),
});
// bolted to the inboard end of the A/C evaporator housing (AC.evaporator [1.225, −0.562, 0.33], 0.2 × 0.07 × 0.2 in
// parts/aircon.ts): same x, bottoms level, flush against its inboard face (z 0.23); below the RH crew seat cushion, aft
// of the main spar (x ≈ 1.38 at the root, x increases forward). AMM Fig 21-50-1 sheet 3 (PDF p. 521) shows the blower
// wheel and motor (items 30, 31) on one end of the evaporator (item 22) beside the evaporator duct (item 24) but gives no
// dimensions, so the end, size and position are approximate.
export const BLOWER: Vec3 = [1.225, -0.557, 0.18];
part(() => box(0.12, 0.08, 0.1), ["environment"], {
  pos: BLOWER,
  color: "#3E7FA8",
  name: "Blower fan assembly",
  note: 'Optional 3-speed blower (POH 7-61), installed with the A/C on this airplane: a blower wheel and motor bolted to the evaporator assembly under the RH crew seat (AMM 21-50 PDF pp. 496, 504: "blower motor assembly to evaporator"; Fig 21-50-1 sheet 3 items 30, 31, PDF p. 521). With the A/C selected all its air passes through the evaporator and the evaporator duct; with the A/C off it feeds the distribution manifold through its fan duct (POH Fig 7-13; AMM 21-20 PDF p. 454). Airflow selector 1, 2, 3: low, medium, high fan. 15 A CABIN FAN breaker, A/C BUS 2 (POH 7-61). Size and position approximate: the figure is undimensioned.',
  pin: true,
});
/** Environmental control panel: POH Fig 7-4 (2 of 2) item 5, right of the MFD bezel, under the RH crew display vent. */
export const ECS_PANEL: Vec3 = [2.27, 0.052, 0.228];
// scaled like the outlets below
part(() => box(0.02, 0.075, 0.052), ["environment"], {
  pos: ECS_PANEL,
  color: "#20262B",
  name: "Environmental control panel",
  note: "Lower RH side of the instrument panel (AMM 21-40 PDF p. 486, 21-60 PDF p. 524, serials 22T-1460, 1471, 1473 thru 22T-9749 (AMM 21-00 PDF p. 448); POH 7-64: RH instrument panel; POH Fig 7-4 item 5, right of the MFD): airflow selector OFF – 0 – 1 – 2 – 3, the Panel, Panel-Foot, Panel-Foot-Windshield and Windshield vent buttons, the temperature selector, and with A/C the snowflake (AC) and recirculation buttons (POH 7-65, 7-66, Fig 7-15). 2 A CABIN AIR CONTROL breaker, MAIN BUS 1 (POH 7-61). Without that power the electrically driven valves and the blower speed stay at their last selections (model assumption; the POH does not say).",
  pin: true,
});
/**
 * ECS controller: AMM Fig 21-60-1 sheet 1 Detail A (PDF p. 535) draws it on a bracket straight forward of the
 * ECS display panel, and its locator puts both just forward of the windshield; it comes out with the glareshield removed
 * (AMM 21-60 PDF p. 529). Placed forward of the control panel under the glareshield, above GIA 2 and the MFD cooling fan.
 * The figure gives no dimensions: offset and size approximate; bracket offset fitted aft under the skin, retaining clearance above the MFD fan.
 */
export const ECS_CONTROLLER: Vec3 = [ECS_PANEL[0] + 0.15, 0.24, ECS_PANEL[2]];
part(() => box(0.08, 0.04, 0.12), ["environment"], {
  pos: ECS_CONTROLLER,
  color: "#E0B040",
  name: "ECS controller",
  note: "Monitors mixed-air temperature through the duct temperature sensor and, above the duct temperature limit, cycles the hot-air and fresh-air valves (POH 7-64). On a bracket forward of the ECS display panel, under the glareshield: AMM Fig 21-60-1 sheet 1 Detail A (PDF p. 535); removed with the glareshield off (AMM 21-60 PDF p. 529). Its long side runs across the airplane as in Detail A. Size and position approximate.",
  pin: true,
});
/* ---------- outlets, at the ends of the outlet ducts in flows.ts ---------- */
// Serials 22T-1460, 1471, 1473 thru 22T-9749 (the modelled airplane is one): per side a crew display vent (outboard instrument panel), a
// crew panel vent (bolster) and a crew floor vent (kick plate), a passenger panel vent (armrest) and a passenger floor vent
// (rear cabin side trim), plus the windshield (defrost) vent: 11 outlets (AMM 21-20 PDF p. 454; Fig 21-20-1 sheets 1, 2 and
// 6, PDF pp. 474, 475, 479). Serials 22T-9750 and on have no crew panel vents (Fig 21-20-1 sheet 7, PDF p. 480).
//
// Crew positions are scaled from POH Fig 7-4 (2 of 2, 7-15), whose display bezels are 0.001 m per pixel at 300 dpi: the
// figure's PFD and MFD bezel centres (pixels 327 and 620) land on the model's bezel centres (z −0.241 and 0.054).
/** Crew display air vent (POH Fig 7-4 item 4, upper pair): outboard of each display bezel near its top, on the panel face. */
export const CREW_DISPLAY_VENT = (s: number): Vec3 => [2.272, 0.133, s < 0 ? -0.413 : 0.222];
/** Crew panel air vent (POH Fig 7-4 item 4, lower pair): on the bolster's aft face, either side of the avionics stack. */
export const CREW_PANEL_VENT = (s: number): Vec3 => [2.172, -0.065, s < 0 ? -0.118 : 0.123];
/** Crew floor air vent (POH Fig 7-4 item 8): on the underside of the kick plate, at the instrument panel's lower edge. */
export const CREW_FLOOR_VENT = (s: number): Vec3 => [2.3, -0.186, s * 0.32];
/**
 * Rear cabin side trim at its forward end, aft of the door, that both passenger vents mount in (AMM Fig 21-20-1 sheet 6
 * Detail I, PDF p. 479): an upper wall panel carrying the air vent and, below it, the armrest bulge whose underside carries
 * the vent outlet sleeve, with the passenger floor duct inside it. Detail I is not dimensioned, so every limit is
 * approximate: x alongside the rear seat cushion, aft of the door seam (DOOR_SEAM), the bulge underside above the TKS
 * empennage supply line, the wall inboard of the CAPS forward harness strap.
 */
const PAX_VENT_X = REAR_SEAT.referenceX + 0.142; // illustrative armrest station (POH 7-64; AMM Detail I)
export const PAX_TRIM = {
  x0: PAX_VENT_X - 0.1,
  x1: PAX_VENT_X + 0.07,
  yBot: -0.43,
  yArm: -0.2,
  yTop: 0.08,
  zIn: 0.55,
  zArm: 0.51,
  t: 0.006,
};
/** Passenger panel air vent: in the trim's upper wall, chest high (AMM Fig 21-20-1 sheet 6 Detail I; POH 7-64). */
export const PAX_PANEL_VENT = (s: number): Vec3 => [PAX_VENT_X, 0, s * PAX_TRIM.zIn];
/** Passenger floor air vent: vent outlet sleeve through the underside of the trim's armrest bulge (Detail I). */
export const PAX_FLOOR_VENT = (s: number): Vec3 => [
  PAX_VENT_X,
  PAX_TRIM.yBot,
  (s * (PAX_TRIM.zArm + PAX_TRIM.zIn)) / 2,
];
/** Defrost vent on the glareshield C-channel, on the centreline (AMM Fig 21-20-1 sheets 1 and 2, Detail A). */
export const DEFROST_VENT: Vec3 = [2.32, 0.352, 0];
const EYE = "#9AA3AA";
/** Trim geometry for side s, relative to its part position: the upper wall slab and the armrest bulge below it. */
const paxTrimGeo = (s: number) => {
  const T = PAX_TRIM,
    len = T.x1 - T.x0,
    xc = (T.x0 + T.x1) / 2,
    wall = box(len, T.yTop - T.yArm, T.t).translate(xc, (T.yTop + T.yArm) / 2, s * (T.zIn + T.t / 2)),
    bulge = box(len, T.yArm - T.yBot, T.zIn + T.t - T.zArm).translate(
      xc,
      (T.yArm + T.yBot) / 2,
      (s * (T.zArm + T.zIn + T.t)) / 2,
    );
  return mergeGeos([wall, bulge]).translate(-xc, 0, -s * T.zIn);
};
for (const s of [-1, 1]) {
  part(() => paxTrimGeo(s), ["environment"], {
    pos: [(PAX_TRIM.x0 + PAX_TRIM.x1) / 2, 0, s * PAX_TRIM.zIn],
    color: "#C9C2B6",
    name: "Rear cabin side trim",
    note: "Forward end of the rear cabin side trim, aft of the door: the passenger panel air vent sits in its upper wall and the passenger floor vent outlet sleeve in the underside of its armrest bulge, with the passenger floor duct behind it (AMM 13773-002 Rev 7 Fig 21-20-1 sheet 6 Detail I, PDF p. 479; POH 13772-007 7-64). Modelled only where the vents mount; shape, size and position approximate.",
    pin: s < 0,
  });
  part(() => sph(0.018), ["environment"], {
    pos: CREW_PANEL_VENT(s),
    color: EYE,
    name: "Bolster eyeball outlet",
    note: 'Crew panel air vent (AMM 21-20 "Crew Panel Air Vent"): one of the "additional vents … at LH and RH crew panels" fitted on serials 22T-1460, 22T-1471, 22T-1473 thru 22T-9749 (AMM 21-20 PDF p. 454), in the bolster trim (Fig 21-20-1 sheet 6 Detail F, PDF p. 479), fed by its own crew panel duct from the distribution manifold (sheet 1 items 3 and 14, PDF p. 474). POH 7-64: "inboard on the RH and LH bolster panels". Placed from POH Fig 7-4 (2 of 2) item 4, lower pair, either side of the avionics stack. Always fed; the occupant rotates the nozzle from off to maximum (POH 7-66).',
    pin: s < 0,
  });
  part(() => sph(0.018), ["environment"], {
    pos: CREW_DISPLAY_VENT(s),
    color: EYE,
    name: "Panel eyeball outlet",
    note: 'Crew display air vent (AMM 21-20): in the instrument panel (Fig 21-20-1 sheet 6 Detail H, PDF p. 479), fed by the crew display duct from the distribution manifold (sheet 1 items 16 and 17, PDF p. 474). POH 7-13, 7-64: "on the outboard section of the instrument panel". Placed from POH Fig 7-4 (2 of 2) item 4, upper pair, just outboard of the display bezel near its top. Always fed; the occupant rotates the nozzle from off to maximum (POH 7-66).',
    pin: s < 0,
  });
  part(() => sph(0.016), ["environment"], {
    pos: PAX_PANEL_VENT(s),
    color: EYE,
    name: "Armrest eyeball outlet",
    note: 'Passenger panel air vent: "chest high outlets mounted in the armrests integral to the LH and RH cabin wall trim panels" (POH 7-64); in the forward upper end of the rear cabin side trim (AMM Fig 21-20-1 sheet 6 Detail I, PDF p. 479), fed by the passenger panel duct along the console and fuselage (AMM 21-20 PDF p. 462; sheet 1 items 6 and 9). Always fed (POH 7-66). The figure is not dimensioned: its height (chest high, below the rear window) and the inboard offset of the trim are approximate.',
    pin: s < 0,
  });
  part(() => cyl(0.025, 0.012, "y"), ["environment"], {
    pos: CREW_FLOOR_VENT(s),
    color: EYE,
    name: "Kick-plate floor outlet",
    note: "Crew floor air vent, mounted to the bottom of each kick plate and adjustable (POH 7-64, 7-65; AMM Fig 21-20-1 sheet 6 Detail G, PDF p. 479), fed by the crew floor duct (sheet 1 items 2 and 15). Placed from POH Fig 7-4 (2 of 2) item 8: under the instrument panel's lower edge, between each pilot's pedals near the outboard one; z set from the model's pedals, as the figure is in perspective, so z approximate. Fed when the floor butterfly is open (POH 7-66).",
    pin: s < 0,
  });
  part(() => cyl(0.02, 0.03, "y"), ["environment"], {
    pos: PAX_FLOOR_VENT(s),
    color: EYE,
    name: "Foot-warmer diffuser",
    note: "Passenger floor air vent: a vent outlet sleeve on the bottom portion of the LH and RH cabin wall trim panels, non-adjustable (POH 7-64, 7-65); at the forward bottom of the rear cabin side trim, below the passenger panel vent (AMM Fig 21-20-1 sheet 6 Detail I, PDF p. 479), fed by the passenger floor duct (sheet 1 items 7 and 8). Fed when the floor butterfly is open (POH 7-66). The figure is not dimensioned: the sleeve's height and inboard offset follow the approximate trim, position approximate.",
    pin: s < 0,
  });
}
// AMM 13773-002 Fig 21-20-1 sheet 2 Detail A (PDF p. 475): compact housing fed from below,
// bridging to the glareshield slot. All dimensions/offsets approximate: the figure is undimensioned.
part(() => mergeGeos([box(0.03, 0.008, 0.52), box(0.03, 0.03, 0.1).translate(0, -0.015, 0)]), ["environment"], {
  pos: DEFROST_VENT,
  color: EYE,
  name: "Windshield diffuser",
  note: "Defrost vent in the glareshield assembly, directing conditioned air to the base of the windshield (POH 7-64); bolted to the glareshield C-channel on the centreline and fed by the single defrost duct (AMM 21-20 PDF p. 470; Fig 21-20-1 sheets 1 and 2 Detail A, PDF pp. 474–475). Fed when the defrost butterfly is open (POH 7-66). The compact central housing bridges the supply to the slot from under the glareshield. Housing dimensions and offset, and slot length, are approximate: the figures are undimensioned.",
  pin: true,
});
