/** SR20 G6 hydraulic and trim/flap wiring topology; routes are illustrative, not maintenance routing diagrams. */
import type { FlowSpec } from "@/lib/catalogue";
import { brakeAmount } from "@/lib/anims";
import type { Vec3 } from "@/lib/math";
import type { Elec, Sim } from "./model";
import {
  BRAKE_RESERVOIR,
  PEDALS,
  PARK_VALVE,
  brakePressurePath,
  brakeTee,
  masterCylinder,
  toeSide,
  valvePort,
} from "./parts/gear";
import { wingP } from "./geometry";
import { GEA_71 } from "./parts/avionics";
import { PITCH_TRIM_MOTOR, ROLL_TRIM_MOTOR } from "./parts/controls-trim";

const hydraulic = (key: string, pts: Vec3[], name: string, note: string): FlowSpec => ({
  key,
  pts,
  sys: ["gear"],
  r: 0.0035,
  color: "#B85258",
  pcolor: "#F3B56C",
  size: 0.035,
  count: 8,
  tension: 0,
  name,
  note,
});
const SUPPLY_SPLIT: Vec3 = [2.55, -0.4, 0.38];
export const GEAR_CONTROLS_DEPTH_FLOWS: FlowSpec[] = [
  hydraulic(
    "brakeReservoir",
    [BRAKE_RESERVOIR, [2.7, -0.18, 0.36], SUPPLY_SPLIT],
    "Brake reservoir supply",
    "Common low-pressure fluid supply crosses the firewall to the four master-cylinder inlet ports (AMM 12137-002 32-42 Fig 32-42-4). Routing approximate; flow particles indicate availability, not measured flow.",
  ),
  ...PEDALS.flatMap((z, i) => {
    const master = masterCylinder(z),
      side = toeSide(z),
      upper: Vec3 = [master[0], master[1] + 0.025, z],
      lower: Vec3 = [master[0], master[1] - 0.04, z];
    return [
      hydraulic(
        "brakeSupply" + i,
        [SUPPLY_SPLIT, [2.48, -0.4, z], upper],
        "Master-cylinder supply",
        `Reservoir → upper inlet of ${i < 2 ? "pilot" : "copilot"} ${side < 0 ? "left" : "right"} master cylinder. Upper inlet / lower outlet identified in AMM 32-42 p. 23. Geometry schematic.`,
      ),
      hydraulic(
        "brakeMaster" + i,
        [lower, [2.5, -0.63, z], brakeTee(side)],
        "Master-cylinder pressure line",
        `Corresponding ${side < 0 ? "left" : "right"} toe brakes at both stations join this side’s independent circuit (POH 11934-005 7-25; AMM Fig 32-42-4).`,
      ),
    ];
  }),
  ...[-1, 1].flatMap((side) => [
    hydraulic(
      "brakeValve" + (side < 0 ? "L" : "R"),
      [brakeTee(side), [2.56, -0.61, side * 0.19], valvePort(side, true)],
      "Toe brakes → parking valve",
      `${side < 0 ? "LH forward" : "RH aft"} master-side parking-valve port. Circuits remain separate; handle controls both poppets (AMM 32-42 p. 24).`,
    ),
    {
      ...hydraulic(
        "brakeWheel" + (side < 0 ? "L" : "R"),
        brakePressurePath(side),
        "Parking valve → wheel brake",
        `Separate ${side < 0 ? "left" : "right"} line runs through wing bulkhead fitting and gear-strut channel, with flexible hose to caliper (AMM 32-42 pp. 18–22, Figs 32-42-3/5). Channel route and clearances approximate.`,
      ),
      ext: true,
    },
    {
      key: "brakeTemp" + (side < 0 ? "L" : "R"),
      // The external section follows the strut and enters the wing at the same bulkhead as the brake hose.
      pts: [...brakePressurePath(side).reverse(), [2.45, -0.36, 0.1], GEA_71],
      sys: ["gear", "electrical"],
      r: 0.002,
      color: "#D6A04A",
      tube: true,
      count: 4,
      name: "Brake temperature sensor wiring",
      tension: 0,
      ext: true,
      note: "Each wheel sensor → engine/airframe avionics. 3 A ENGINE INSTR on Main Bus 2 (AMM 32-42 p. 1). Wiring route approximate.",
    } satisfies FlowSpec,
  ]),
  {
    key: "parkPosition",
    pts: [[PARK_VALVE[0] + 0.04, PARK_VALVE[1] + 0.02, PARK_VALVE[2]], [2.5, -0.31, -0.08], GEA_71],
    sys: ["gear", "electrical"],
    r: 0.002,
    color: "#D6A04A",
    name: "Parking valve → GEA 71",
    tension: 0,
    note: "Position sensor at valve arm supplies PARK BRAKE caution data through GEA 71 (AMM 32-42 p. 1). Route approximate.",
  },
  {
    key: "pitchTrimHarness",
    pts: [[1.8, -0.42, -0.15], [0.65, -0.585, 0.33], [0.2, -0.63, 0.18], [-1.8, -0.25, 0.06], PITCH_TRIM_MOTOR],
    tension: 0,
    sys: ["controls", "electrical"],
    chan: ["elevator"],
    r: 0.0025,
    color: "#D6A04A",
    name: "Pitch trim circuit",
    note: "ESS BUS 2 → 2 A PITCH TRIM → GTA 82 / pitch trim motor (POH 7-7; AMM 22-10 p. 3, 27-30 Fig 27-30-6). Wire routing schematic.",
  },
  {
    key: "rollTrimHarness",
    pts: [
      [1.8, -0.42, -0.15],
      [0.6, -0.56, 0.05],
      [0.62, -0.56, -0.25],
      ...[-0.55, -0.9, -1.5, -2.4, ROLL_TRIM_MOTOR[2]].map((z) => wingP(z, 0.66, 0)),
      ROLL_TRIM_MOTOR,
    ],
    tension: 0,
    sys: ["controls", "electrical"],
    chan: ["aileron"],
    r: 0.0025,
    color: "#D6A04A",
    name: "Roll trim circuit",
    note: "ESS BUS 2 → 2 A ROLL TRIM → roll relays / LH wing motor (POH 7-9; AMM 27-10 Fig 27-10-7/8). Routing schematic.",
  },
  {
    key: "flapHarness",
    pts: [
      [1.8, -0.42, -0.15],
      [1.0, -0.62, 0],
      [0.86, -0.61, 0],
      [1.04, -0.44, 0],
    ],
    sys: ["flaps", "electrical"],
    r: 0.0025,
    color: "#D6A04A",
    name: "Flap actuator harness",
    tension: 0,
    note: "NON ESS BUS → 10 A FLAPS → switch, relays, actuator and proximity-sensor indication (POH 7-22–23; AMM 27-50 p. 1). EMI suppression cores are integral to harness; routing approximate.",
  },
];
export function gearControlsDepthRates(s: Sim, E: Elec): Record<string, number> {
  // AMM 32-42 puts brake sensors on Main Bus 2; the POH engine-instrument supply is ESS 2.
  // Gate the explicit brake branch by its stated bus and the shared breaker rather than copying E.eisPwr.
  const brakeSensorPower = E.main2 > 0 && !s.cb["ENGINE INSTR"];
  const R: Record<string, number> = {
    brakeReservoir: 0.12,
    pitchTrimHarness: E.pitchTrim ? 0.25 : 0,
    rollTrimHarness: E.rollTrim ? 0.25 : 0,
    flapHarness: E.flapsPwr ? 0.25 : 0,
    parkPosition: E.eisPwr ? 0.2 : 0,
  };
  PEDALS.forEach((z, i) => {
    R["brakeSupply" + i] = 0.12;
    R["brakeMaster" + i] = brakeAmount(s.gear, toeSide(z) < 0 ? "L" : "R");
  });
  for (const side of ["L", "R"] as const) {
    R["brakeValve" + side] = R["brakeWheel" + side] = brakeAmount(s.gear, side);
    R["brakeTemp" + side] = brakeSensorPower ? 0.2 : 0;
  }
  return R;
}
