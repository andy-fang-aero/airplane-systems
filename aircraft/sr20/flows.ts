/** Pipes, wires, ducts and cables with moving particles, plus the rules that drive them. */
import * as THREE from "three";
import { chanOfKey, type FlowSpec } from "@/lib/catalogue";
import type { SysId } from "@/lib/systems";
import { wingP } from "./geometry";
import { cabinOperation } from "./environment";
import { live, type Elec, type Sim } from "./model";
import { FT } from "./parts";
import { CABLES } from "./rig";
import { ENGINE_DEPTH_FLOWS, engineDepthFlowRates } from "./engine-depth-flow";
import { FUEL_PITOT_DEPTH_FLOWS, fuelPitotDepthRates } from "./fuel-pitot-depth-flow";
import { GEAR_CONTROLS_DEPTH_FLOWS, gearControlsDepthRates } from "./gear-controls-depth-flow";
import { ELECTRICAL_AVIONICS_DEPTH_FLOWS, electricalAvionicsDepthRates } from "./electrical-avionics-depth-flow";
import {
  CABIN_ENVIRONMENT_CAPS_DEPTH_FLOWS,
  cabinEnvironmentCapsDepthRates,
} from "./cabin-environment-caps-depth-flow";

const F: FlowSpec[] = [];
const flow = (key: string, pts: FlowSpec["pts"], sys: SysId[], o: Partial<FlowSpec> = {}) =>
  F.push({ key, pts, sys, ...o });

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

export const FLOWS: FlowSpec[] = [
  ...F,
  ...ENGINE_DEPTH_FLOWS,
  ...FUEL_PITOT_DEPTH_FLOWS,
  ...GEAR_CONTROLS_DEPTH_FLOWS,
  ...ELECTRICAL_AVIONICS_DEPTH_FLOWS,
  ...CABIN_ENVIRONMENT_CAPS_DEPTH_FLOWS,
];

const CABIN_AIR = [
  "toMan",
  "panelL",
  "panelR",
  "panelL2",
  "panelR2",
  "mixFirewall",
  "fanDuct",
  "toEvap",
  "evapOut",
  "recirc",
  "armL",
  "armR",
  "floorF",
  "floorF2",
  "floorR",
  "floorR2",
  "defrost",
  "defrost2",
];
export const isCabinAir = (k: string) => CABIN_AIR.includes(k);

/** Particle speed multiplier per flow (0 = stopped; negative = reversed). */
export function flowRates(s: Sim, E: Elec): Record<string, number> {
  const R: Record<string, number> = {};
  // each cable loop: one strand pays out while the other takes up
  R.elA = s.ctrl.pitch * 2;
  R.elB = -s.ctrl.pitch * 2;
  R.ailR = s.ctrl.roll * 2;
  R.ailL = -s.ctrl.roll * 2;
  R.ailBal = -s.ctrl.roll * 2;
  R.rudR = -s.ctrl.yaw * 2;
  R.rudL = s.ctrl.yaw * 2;
  const flapMoving = Math.abs(live.flapAng - s.flaps.cmd * 0.32) > 0.2 && E.flapsPwr;
  R.flapPush = R.flapPush2 = flapMoving ? 1 : 0;
  Object.assign(
    R,
    engineDepthFlowRates(s, E, live.rpm),
    fuelPitotDepthRates(s, E),
    gearControlsDepthRates(s, E),
    electricalAvionicsDepthRates(s, E),
    cabinEnvironmentCapsDepthRates(s, E),
  );
  return R;
}

/** Cabin-air particle colour follows the temperature knob (or A/C). */
export function cabinAirColor(s: Sim, E: Elec, out: THREE.Color) {
  const cabin = cabinOperation(s, E);
  if (cabin.ac) return out.set("#6EC9E6");
  return out.set("#5FC8F0").lerp(new THREE.Color("#FF7A3D"), s.eng.running ? cabin.hotValve : 0);
}
