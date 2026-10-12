/** SR20 G6 ECS: POH 11934-005 §7-62–68 (Revision A1); AMM 12137-002 RA/A1 ch. 21.
 * Topology is source-backed; all component dimensions and duct stations are illustrative. */
import type { PartAnim } from "@/lib/catalogue";
import { mergeGeos } from "@/lib/geometry";
import type { Vec3 } from "@/lib/math";
import { FW, box, cyl, sph } from "../geometry";
import { cabinOperation } from "../environment";
import { useSR20 } from "../store";
import { part } from "./catalogue";

const state = () => useSR20.getState();
const operation = () => {
  const { s, E } = state();
  return cabinOperation(s, E);
};
const plate =
  (opening: () => number, axis: "x" | "y" | "z" = "z"): PartAnim =>
  (m) => {
    m.rotation[axis] = (opening() * Math.PI) / 2;
  };

export const FRESH_INLET: Vec3 = [3.42, -0.38, 0.49];
/** The SR20 AMM distinguishes the upper-cowl heater supply from the lower-cowl NACA ventilation inlet. */
export const HEAT_INLET: Vec3 = [3.62, -0.06, 0.28];
export const MIX: Vec3 = [FW + 0.05, -0.46, 0.36];
export const HOT_VALVE: Vec3 = [MIX[0] + 0.045, MIX[1] + 0.034, MIX[2]];
export const FRESH_VALVE: Vec3 = [MIX[0] + 0.045, MIX[1] - 0.034, MIX[2]];
export const CABIN_AIR_COUPLER: Vec3 = [FW - 0.065, -0.46, 0.36];
export const AIRFLOW_VALVE: Vec3 = [FW - 0.005, -0.46, 0.36];
export const MANIFOLD: Vec3 = [2.52, -0.1, 0];
export const FLOOR_BUTTERFLY: Vec3 = [MANIFOLD[0], -0.168, 0];
export const DEFROST_BUTTERFLY: Vec3 = [MANIFOLD[0], -0.032, 0];
/** Optional blower mounted beside the evaporator under the RH crew seat (AMM 21-50 p. 9). */
export const BLOWER: Vec3 = [1.29, -0.565, 0.215];
export const ECS_PANEL: Vec3 = [2.27, 0.052, 0.228];
export const ECS_CONTROLLER: Vec3 = [2.42, 0.24, 0.228];

part(() => box(0.1, 0.03, 0.02), ["environment"], {
  pos: FRESH_INLET,
  name: "NACA fresh-air inlet",
  ext: true,
  pin: true,
  note: "Lower RH cowl NACA inlet supplies unheated ventilation air to the fresh-air valve and mixing chamber (POH 11934-005 7-62, 7-65; AMM 12137-002 21-00 p. 1). The heater supply is shown separately from the upper RH cowl inlet, following the SR20 AMM. Geometry approximate.",
});
part(() => box(0.08, 0.12, 0.14), ["environment"], {
  pos: MIX,
  name: "Mixing chamber",
  fairing: true,
  pin: true,
  note: "Lower RH forward side of the firewall: hot-air and fresh-air inlet valves blend the two supplies; a separate firewall flapper controls admission into the cabin air coupler (POH 7-65–67; AMM 21-20 p. 1, 21-40 Fig 21-40-1, 21-60 Fig 21-60-1 sheet 2). Its translucent housing reveals the valves. Size and offsets approximate.",
});
part(() => cyl(0.019, 0.004, "x"), ["environment"], {
  pos: HOT_VALVE,
  color: "#C96B40",
  name: "Hot-air valve",
  pin: true,
  anim: plate(() => operation().hotValve),
  note: "Forward firewall inlet valve: admits exhaust-heat-exchanger air into the mixing chamber as temperature increases; A/C closes the hot-air supply. Rejected hot air discharges into the engine compartment and leaves with engine cooling airflow (POH 7-65, 7-67). Valve motion is schematic; opening is an illustrative blend fraction.",
});
part(() => cyl(0.019, 0.004, "x"), ["environment"], {
  pos: FRESH_VALVE,
  color: "#65AFCD",
  name: "Fresh-air valve",
  pin: true,
  anim: plate(() => operation().freshValve),
  note: "Forward firewall inlet valve: admits NACA ventilation air; temperature selection opens/closes the hot and cold valves together. POH 7-67 describes fresh-air closure in recirculation. AMM 21-60 p. 8 instead checks fresh inlet open with the firewall flapper closed during recirculation; this study animation follows the POH operational description, rather than that detailed rigging arrangement. Rejected air leaves in the engine cooling flow (POH 7-65).",
});
part(() => cyl(0.033, 0.004, "x"), ["environment"], {
  pos: AIRFLOW_VALVE,
  color: "#9CA9AF",
  name: "Firewall airflow flapper",
  pin: true,
  anim: plate(() => (state().s.env.fan >= 0 ? 1 : 0)),
  note: "Separate flapper in the mixing chamber admits air through the firewall. OFF closes it; the first detent past OFF opens it fully; selecting fan 1, 2 or 3 changes fan speed without appreciable further flapper motion (POH 7-66; AMM 21-60 p. 6). Recirculation routing is simplified to the POH description; AMM p. 8 describes a closed flapper in recirculation. Dimensions and travel approximate.",
});
part(() => cyl(0.035, 0.045, "x"), ["environment"], {
  pos: CABIN_AIR_COUPLER,
  name: "Cabin air coupler",
  fairing: true,
  pin: true,
  note: "Aft side of the firewall, receiving the mixing chamber supply; coupler duct leads to the vent assembly or optional evaporator (AMM 21-40 pp. 5–7, Fig 21-40-1; 21-60 Fig 21-60-1 sheet 2). Mounted opposite the mixing chamber. Size approximate.",
});
part(() => box(0.04, 0.035, 0.04), ["environment"], {
  pos: [CABIN_AIR_COUPLER[0], CABIN_AIR_COUPLER[1] + 0.05, CABIN_AIR_COUPLER[2]],
  color: "#E0B040",
  name: "Cabin air coupler actuator",
  pin: true,
  note: "Electrical actuator on the cabin air coupler, with its lever and linkage sleeve passing through the firewall to the mixing-chamber lever (AMM 21-60 pp. 5, 8–10 and Fig 21-60-1 sheet 2). Distinct from the dual actuator on the distribution manifold. Geometry and location approximate.",
});
part(() => box(0.08, 0.12, 0.28), ["environment"], {
  pos: MANIFOLD,
  name: "Distribution manifold",
  fairing: true,
  pin: true,
  note: "Center aft side of the firewall. Panel/display/armrest ducts are fed directly; floor and windshield outlets have butterfly valves actuated by the dual actuator (POH 7-65–67; AMM 21-20 p. 1, 21-60 Fig 21-60-1 sheet 2). OFF closes cabin airflow; 0 is ram air; 1–3 are blower speeds. The blower is a separate assembly under the RH seat. Size and manifold height approximate.",
});
part(() => cyl(0.024, 0.004, "y"), ["environment"], {
  pos: FLOOR_BUTTERFLY,
  color: "#C0A858",
  name: "Floor butterfly valve",
  pin: true,
  anim: plate(() => (["PF", "PFW"].includes(state().s.env.vent) ? 1 : 0), "x"),
  note: "Distribution-manifold floor branch opens for Panel-Foot and Panel-Foot-Windshield, closes for Panel and Windshield (POH 7-66–67; AMM 21-60 pp. 1–2). Plate travel and exact outlet position approximate.",
});
part(() => cyl(0.024, 0.004, "y"), ["environment"], {
  pos: DEFROST_BUTTERFLY,
  color: "#C0A858",
  name: "Defrost butterfly valve",
  pin: true,
  anim: plate(() => (["PFW", "W"].includes(state().s.env.vent) ? 1 : 0), "x"),
  note: "Distribution-manifold windshield branch opens for Panel-Foot-Windshield and Windshield; closes for Panel and Panel-Foot (POH 7-66–67). Geometry approximate.",
});
part(() => box(0.035, 0.04, 0.06), ["environment"], {
  pos: [2.46, -0.1, 0.1],
  color: "#E0B040",
  name: "Manifold dual actuator",
  pin: true,
  note: "Dual electrical actuator on standoffs at the distribution manifold, operating the floor and defrost butterflies (AMM 21-60 pp. 5–6 and Fig 21-60-1 sheet 2 item 7). Powered selections are represented directly; geometry approximate.",
});
part(() => mergeGeos([cyl(0.04, 0.05, "z"), box(0.085, 0.07, 0.065).translate(0, -0.03, 0)]), ["environment"], {
  pos: BLOWER,
  color: "#7B949D",
  name: "Blower fan assembly",
  pin: true,
  note: "Optional three-speed blower; with A/C the motor and wheel bolt to the evaporator under the RH crew seat (POH 7-62, 7-65; AMM 21-50 pp. 9–10 and Fig 21-50-1 sheet 6 items 28–29). 0 is ram air without fan; 1, 2, 3 select low, medium, high. 15 A CABIN FAN breaker on A/C BUS 2. Size approximate; represented together with optional A/C in this study configuration.",
});
part(() => box(0.02, 0.075, 0.052), ["environment"], {
  pos: ECS_PANEL,
  color: "#20262B",
  name: "Environmental control panel",
  pin: true,
  note: "Lower RH instrument panel: OFF–0–1–2–3 airflow selector, vent buttons, temperature selector and optional A/C/recirculation buttons (POH 7-66–68, Fig 7-15; AMM 21-60 pp. 1–2, Fig 21-60-1 sheet 1). 2 A CABIN AIR CONTROL breaker on MAIN BUS 1 (POH 7-62). Dimensions approximate.",
});
part(() => box(0.08, 0.04, 0.12), ["environment"], {
  pos: ECS_CONTROLLER,
  color: "#E0B040",
  name: "ECS controller",
  pin: true,
  note: "Bracket-mounted under the glareshield, connected to the ECS display panel and control actuators (AMM 21-60 pp. 4–5, Fig 21-60-1 sheet 1). The cited SR20 material does not document the SR22T duct-temperature limiting system; none is assumed here. Size and bracket offset approximate.",
});

export const CREW_DISPLAY_VENT = (s: number): Vec3 => [2.272, 0.133, s < 0 ? -0.413 : 0.222];
export const CREW_PANEL_VENT = (s: number): Vec3 => [2.172, -0.065, s < 0 ? -0.118 : 0.123];
export const CREW_FLOOR_VENT = (s: number): Vec3 => [2.3, -0.186, s * 0.32];
export const PAX_PANEL_VENT = (s: number): Vec3 => [0.48, 0, s * 0.517];
export const PAX_FLOOR_VENT = (s: number): Vec3 => [0.48, -0.43, s * 0.517];
export const DEFROST_VENT: Vec3 = [2.32, 0.352, 0];
for (const s of [-1, 1]) {
  part(() => box(0.2, 0.48, 0.015), ["environment", "cabin"], {
    pos: [0.48, -0.2, s * 0.535],
    color: "#C9C2B6",
    fairing: true,
    name: "Rear cabin vent trim",
    pin: s < 0,
    note: "Rear cabin sidewall trim supports the passenger chest-height air vent and low foot-warmer outlet, with their separate ducts behind it (POH 7-65; AMM 21-20 Fig 21-20-1). Partial trim section only; shape and vent station approximate.",
  });
  for (const [name, at, note] of [
    [
      "Panel eyeball outlet",
      CREW_DISPLAY_VENT(s),
      "Outboard instrument panel, near each display; direct crew-display duct from the manifold",
    ],
    [
      "Bolster eyeball outlet",
      CREW_PANEL_VENT(s),
      "Inboard LH/RH bolster panels; direct crew-panel duct from the manifold",
    ],
    [
      "Armrest eyeball outlet",
      PAX_PANEL_VENT(s),
      "Chest high in the LH/RH rear cabin wall trim; direct passenger-panel duct",
    ],
  ] as [string, Vec3, string][])
    part(() => sph(0.017), ["environment"], {
      pos: at,
      color: "#9AA3AA",
      name,
      pin: s < 0,
      note: `${note}. Occupant rotates the nozzle from off to maximum; these branches have no manifold butterfly (POH 7-65–66; AMM 21-20 p. 1). Eleven outlets total in this G6 arrangement. Dimensions approximate.`,
    });
  part(() => cyl(0.024, 0.012, "y"), ["environment"], {
    pos: CREW_FLOOR_VENT(s),
    color: "#9AA3AA",
    name: "Kick-plate floor outlet",
    pin: s < 0,
    note: "Adjustable crew floor air vent on the underside of each kick plate, fed through the floor butterfly and its crew-floor duct (POH 7-65–66; AMM 21-40 p. 1). Position and size approximate.",
  });
  part(() => cyl(0.02, 0.025, "y"), ["environment"], {
    pos: PAX_FLOOR_VENT(s),
    color: "#9AA3AA",
    name: "Foot-warmer diffuser",
    pin: s < 0,
    note: "Non-adjustable passenger floor vent in the lower LH/RH rear cabin side trim, fed through the floor butterfly and passenger-floor duct (POH 7-65–66; AMM 21-40 p. 1). Position and size approximate.",
  });
}
part(() => mergeGeos([box(0.03, 0.008, 0.52), box(0.03, 0.03, 0.1).translate(0, -0.015, 0)]), ["environment"], {
  pos: DEFROST_VENT,
  color: "#9AA3AA",
  name: "Windshield diffuser",
  pin: true,
  note: "In the glareshield/lower windshield trim, directing conditioned air to the base of the windshield through the defrost duct (POH 7-65; AMM 21-40 p. 7). Shown as a central supply housing and slot; dimensions approximate.",
});
