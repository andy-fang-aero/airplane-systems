/**
 * Electrical harness and circuit protection.
 * May import anchors only from earlier sections:
 * catalogue.ts, airframe.ts, surfaces.ts, cowl.ts, gear.ts, engine.ts, engine-ignition.ts, engine-oil.ts, engine-air.ts, engine-sensors.ts, structure.ts, cabin.ts, cockpit.ts, electrical.ts, avionics.ts, pitot.ts, fuel.ts, environment.ts, aircon.ts, caps.ts, lights.ts, controls.ts, controls-trim.ts, ice.ts, oxygen.ts.
 * Side-effect-free helpers may come from ../geometry, ../model and ../rig.
 * Shared constants belong in catalogue.ts; later sections must never be imported here.
 *
 * Neither the POH nor the AMM draws the airframe harness paths (AMM 13773-002 71-50 PDF p. 2540 describes the harness;
 * Fig 71-00-2 sheet 4, PDF p. 2490, item 37 shows it only firewall-forward): every run here is schematic, a static tube
 * with no particles, and every position is approximate.
 */
import { glowAnim } from "@/lib/anims";
import { toVec3, type Vec3 } from "@/lib/math";
import { box, cyl, tubeGeo, wingP } from "../geometry";
import { useSR22T } from "../store";
import { MD302_POS, part } from "./catalogue";
import { CB_PANEL } from "./cabin";
import { MCU } from "./electrical";
import { ADAHRS_1, ADAHRS_2, GEA_71, GIA_1, PFD_CONN } from "./avionics";

const S = () => useSR22T.getState();
const [cx, cy] = CB_PANEL;
/** Inside the console just behind the circuit breaker panel (parts/cabin.ts, left side of the console); approximate. */
const behindPanel = (dx: number, dy: number): Vec3 => [cx + dx, cy + dy, -0.115];

/* ---------- AVIONICS master relays (AMM 13773-002 24-50 PDF p. 752; POH 13772-007 7-51) ---------- */
// location not given in either document: behind the breaker panel, position and size approximate
part(() => box(0.04, 0.03, 0.03), ["electrical"], {
  pos: behindPanel(-0.16, 0.05),
  color: "#7A8288",
  name: "Avionics master relays",
  note: "The 10 A AVIONICS circuit breaker on MAIN BUS 1 is connected to the Avionics Bus through relays energized by the AVIONICS master switch on the bolster switch panel; they power all loads on the AVIONICS bus (AMM 13773-002 24-50 PDF p. 752; SR22T POH 13772-007 7-51). Neither document gives their location: drawn behind the breaker panel, position approximate.",
  pin: true,
  anim: glowAnim("#7A8288", () => S().s.elec.avionics && S().E.main1 > 0, ["electrical"]),
});

/* ---------- harness transient voltage suppressors (AMM 13773-002 24-50 PDF p. 752) ---------- */
/**
 * The eight TVS integral to the wire harnesses, each beside the connector it protects. ADAHRS 2 is installed on this
 * airplane (per operator, 2026-10-08), so its TVS is drawn. Size and offsets from each unit approximate.
 */
export const HARNESS_TVS: [where: string, pos: Vec3, axis: "x" | "z"][] = [
  ["ADAHRS 1 connector", [ADAHRS_1[0] + 0.03, ADAHRS_1[1] - 0.03, ADAHRS_1[2] - 0.085], "x"],
  ["ADAHRS 2 connector", [ADAHRS_2[0] - 0.05, ADAHRS_2[1] + 0.053, ADAHRS_2[2] - 0.026], "x"],
  ["GIA 63W integrated avionics unit 1 connector", [GIA_1[0] + 0.1, GIA_1[1] - 0.064, GIA_1[2]], "z"],
  ["attitude indicator connector", [MD302_POS[0] + 0.15, MD302_POS[1] + 0.01, MD302_POS[2] - 0.06], "z"],
  ["PFD connector", [PFD_CONN[0] + 0.028, PFD_CONN[1] + 0.068, PFD_CONN[2] - 0.09], "z"],
  ["PFD connector", [PFD_CONN[0] + 0.028, PFD_CONN[1] + 0.068, PFD_CONN[2] - 0.05], "z"],
  ["circuit breaker panel", behindPanel(-0.08, 0.05), "z"],
  ["circuit breaker panel", behindPanel(-0.02, 0.05), "z"],
];
HARNESS_TVS.forEach(([where, pos, axis]) =>
  part(() => cyl(0.006, 0.02, axis), ["electrical"], {
    pos,
    color: "#2F3A44",
    name: "Harness TVS",
    note: `Transient voltage suppressor integral to the wire harness at the ${where}: one of eight (ADAHRS 1 and ADAHRS 2 connectors, GIA 63W integrated avionics unit 1 connector, attitude indicator connector, two on the PFD connector and two near the circuit breaker panel) that let lightning-induced transients dissipate to ground (AMM 13773-002 24-50 PDF p. 752; SR22T POH 13772-007 7-50). Size and position approximate.`,
  }),
);

/* ---------- static harness runs (schematic, approximate) ---------- */
const HARNESS = "#3E3A33";
const run = (name: string, pts: Vec3[], note: string) =>
  part(() => tubeGeo(pts, 0.008), ["electrical"], { color: HARNESS, name, note, pin: true });

/** A point on the wing at span z and chord fraction xc, `up` above the mean line. */
const wingAt = (z: number, xc: number, up: number): Vec3 => {
  const p = wingP(z, xc, 0);
  p.y += up;
  return toVec3(p);
};
/** Spanwise stations of the wing harness: [|z|, chord fraction, height above the mean line]. */
const WING_RUN: [number, number, number][] = [
  // inboard, in the leading-edge bay forward of the TKS tank (TKS_TANK.xc0 = 0.1 in parts/ice.ts), above the TKS feed
  // lines and pitot heater wiring there, which run on the mean line; stations approximate
  [0.62, 0.075, 0.03],
  [0.9, 0.075, 0.03],
  [1.15, 0.08, 0.03],
  // approximate: outboard of the tank, back to 20 % chord, forward of the main spar
  [1.5, 0.16, 0.03],
  [2.0, 0.2, 0.03],
  [2.6, 0.2, 0.03],
  // approximate: over the stall-warning wiring where it crosses the chord at z = 3 (flows.ts stallWire)
  [3.0, 0.2, 0.035],
  [3.4, 0.2, 0.03],
  // approximate: lowered toward the mean line as the wing thins to the tip
  [4.0, 0.2, 0.025],
  [4.5, 0.2, 0.02],
];
/**
 * Wing harness, side s: from behind the breaker panel to the wing root ahead of the spar, then out along the wing. The
 * LH run passes above the BAT 2 feed and the traffic data path; the RH run crosses inside the console, above the fuel
 * return lines (flows.ts fuelRet) and the TKS forward proportioning unit, then dips under the OAT 1 data path.
 */
const wingRun = (s: 1 | -1): Vec3[] => {
  // approximate: the LH and RH runs leave the panel side by side
  const start = behindPanel(s < 0 ? -0.16 : -0.12, -0.04);
  return [
    start,
    ...(s < 0
      ? ([
          // approximate
          [start[0] - 0.02, -0.44, -0.2],
          [1.56, -0.45, -0.4],
        ] as Vec3[])
      : ([
          // approximate
          [1.56, -0.45, 0],
          [1.56, -0.45, 0.25],
          // approximate: under the OAT 1 data path along the RH cabin side (flows.ts oatData1)
          [1.62, -0.53, 0.38],
        ] as Vec3[])),
    ...WING_RUN.map(([z, xc, up]) => wingAt(s * z, xc, up)),
  ];
};
for (const s of [-1, 1] as const)
  run(
    `Wing harness (${s < 0 ? "LH" : "RH"})`,
    wingRun(s),
    "Wiring from the circuit breaker panel to the wing loads: position, strobe and recognition lights, pitot heat, stall warning, magnetometer, OAT, fuel quantity sensors and the flap actuator (SR22T POH 13772-007 7-47 – 7-57, 7-68 – 7-75; AMM 13773-002 34-20 PDF p. 1675). Neither document draws the harness path: route schematic, approximate.",
  );
run(
  "Tail harness",
  [
    behindPanel(-0.08, -0.04),
    // aft inside the console and under the seats, between the seat pans and the main spar (parts/structure.ts), inboard
    // of the fuel feed and return lines at the selector (flows.ts fuelL, fuelRetL), then through the TKS pump bank under
    // the rear seat between metering pump 2 and the windshield pump (parts/ice.ts), above the roll servo bridle cables
    [1.55, -0.48, -0.08],
    [1.2, -0.485, -0.12],
    [0.95, -0.49, -0.155],
    [0.5, -0.49, -0.155],
    [0, -0.47, -0.2],
    [-0.3, -0.44, -0.24],
    // through the aft bulkhead (FS 222) into the avionics bay outboard of the static line, under BAT 2
    [-0.49, -0.38, -0.26],
    [-0.75, -0.25, -0.12],
    [-1.2, -0.2, -0.08],
  ],
  "Wiring from the circuit breaker panel aft under the seats, through the aft bulkhead to the avionics bay behind it (SR22T POH 13772-007 7-5) and BAT 2 in the empennage (AMM 13773-002 24-00 PDF p. 694). Neither document draws the harness path: route schematic, approximate.",
);
run(
  "Engine harness (firewall → GEA 71)",
  [
    [2.6, -0.12, 0.38],
    [2.53, -0.06, 0.38],
    [GEA_71[0] + 0.057, GEA_71[1], GEA_71[2]],
  ],
  "Engine sensor wiring from the firewall pass-through to the GEA 71 engine airframe unit behind the MFD (SR22T POH 13772-007 7-35, 7-78); firewall-forward it is the item 37 wiring harness (AMM 13773-002 Fig 71-00-2 sheet 4, PDF p. 2490). Route schematic, approximate.",
);
run(
  "Bolster switch wiring",
  [
    [2.23, -0.158, -0.36],
    [2.35, -0.24, -0.45],
    [2.55, -0.2, -0.45],
    [MCU[0] - 0.04, MCU[1] - 0.03, MCU[2] - 0.06],
  ],
  "From the BAT 1, BAT 2, ALT 1, ALT 2 and AVIONICS master switches on the bolster switch panel (SR22T POH 13772-007 7-51; AMM 13773-002 24-00; Fig 31-10-3, PDF p. 1306) to the MCU on the firewall. Route schematic, approximate.",
);
