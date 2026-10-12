/**
 * Fuel and pressure-system replacements for flows.ts.
 * POH 11934-005 Reissue A/Revision A1 7-41–7-45, 7-69–7-72;
 * AMM 12137-002 Reissue A/Revision A1 28-10/20/40, 34-10, 27-31.
 * Connectivity is sourced; bends, bores and particle speeds are explanatory.
 */
import type { FlowSpec } from "@/lib/catalogue";
import { V, toV, toVec3, type Vec3 } from "@/lib/math";
import { FW, wingP } from "./geometry";
import { ENGINE_FUEL_PUMP, INDUCTION_PLENUM } from "./engine-anchors";
import { fuelAvail, type Elec, type Sim } from "./model";
import { ADAHRS_1, ADAHRS_2, MD302_POS, GEA_71 } from "./parts/avionics";
import {
  COLLECTOR,
  DRAIN_MANIFOLD,
  FIREWALL_FUEL,
  FLAPPER,
  FUEL_PUMP,
  FUEL_SELECTOR,
  GASCOLATOR,
  GASCOLATOR_DRAIN,
  INDUCTION_DRAIN_CHECK,
  NACA_FUEL_VENT,
  TANK_SPAN,
  TANK_STRAINERS,
  collectorTop,
  tankTop,
} from "./parts/fuel";
import {
  ALT_STATIC,
  OAT_1,
  OAT_2,
  PITOT_Z,
  STALL_CONNECTOR,
  STALL_INLET,
  STALL_SWITCH,
  STALL_TRAP,
  STATIC_PORT,
  STATIC_TEE,
  SUMPS,
  TRAPS,
  pitotBase,
} from "./parts/pitot";

const F: FlowSpec[] = [];
const add = (key: string, pts: FlowSpec["pts"], options: Partial<FlowSpec> = {}) =>
  F.push({ key, pts, sys: ["fuel"], r: 0.009, ...options });
const quiet = { count: 0, color: "#738797" };

for (const s of [-1, 1]) {
  const side = s < 0 ? "L" : "R",
    label = s < 0 ? "Left" : "Right";
  TANK_STRAINERS(s).forEach((strainer, i) =>
    add(`fuelTank${side}${i === 0 ? "" : "2"}`, [strainer, FLAPPER(s), COLLECTOR(s)], {
      name: `${label} tank gravity feed ${i + 1}`,
      note: "Each inboard-rib strainer feeds through the swing-check flapper to the collector; no tank-to-tank transfer. Gravity feed particles are schematic (POH 11934-005 7-41; AMM 12137-002 Rev A1 28-10 p. 1).",
    }),
  );
  add(`fuel${side}`, [COLLECTOR(s), [1.2, -0.62, s * 0.3], FUEL_SELECTOR], {
    name: `${label} feed line`,
    note: "Collector to three-position selector. LEFT or RIGHT feeds one tank; OFF isolates both (POH 11934-005 7-42; AMM 12137-002 Rev A1 28-20 p. 1). Routing approximate.",
  });
  add(
    `fuelVent${side}`,
    [
      tankTop(s, TANK_SPAN[1] - 0.06),
      toVec3(wingP(s * 4.85, 0.45, 0)),
      toVec3(toV(NACA_FUEL_VENT(s)).add(V(0, 0.026, 0))),
      NACA_FUEL_VENT(s),
    ],
    {
      name: `${label} tank vent line`,
      r: 0.005,
      tension: 0.1,
      note: "Fuel-resistant plastic connects tank top to lower-wing NACA vent. No moisture-trapping low points in normal ground or level flight. Independent vent for each tank; static drawing because the source gives no flow rate (AMM 12137-002 Rev A1 28-10 pp. 1–2; POH 11934-005 7-41).",
      ...quiet,
    },
  );
  add(`collectorVent${side}`, [collectorTop(s), tankTop(s)], {
    name: `${label} collector vent`,
    note: "Collector top vents to associated tank's inboard fuel rib. Source gives no vent flow direction or rate, so particles are omitted (AMM 12137-002 Rev A1 28-10 p. 2; POH 11934-005 7-41).",
    ...quiet,
  });
  TANK_SPAN.forEach((z, i) =>
    add(
      `fuelQty${side}${i + 1}`,
      [
        wingP(s * z, 0.48, 0),
        wingP(s * z, 0.54, 0),
        wingP(s * 0.62, 0.54, 0),
        [1.65, -0.56, s * 0.31],
        [2.42, -0.2, s * 0.31],
        GEA_71,
      ],
      {
        sys: ["fuel", "avionics"],
        r: 0.004,
        count: 4,
        color: "#C8399F",
        pcolor: "#EDAEED",
        name: `${label} ${i === 0 ? "inboard" : "outboard"} quantity signal`,
        note: "Float sender to GEA 71; this is measured level, separate from flow-integrating fuel totalizer. Electrical signal particles and harness route explanatory (POH 11934-005 7-44–7-45; AMM 12137-002 Rev A1 28-40 pp. 1–2).",
      },
    ),
  );
}
add(
  "fuelMain",
  [
    FUEL_SELECTOR,
    [1.4, -0.62, 0.08],
    [1.95, -0.62, 0.24],
    [2.3, -0.645, 0.25],
    [2.5, -0.655, 0.25],
    FIREWALL_FUEL,
    [FW + 0.035, FIREWALL_FUEL[1], FIREWALL_FUEL[2]],
    FUEL_PUMP,
    GASCOLATOR,
    ENGINE_FUEL_PUMP,
  ],
  {
    sys: ["fuel", "engine"],
    r: 0.014,
    name: "Fuel supply to engine pump",
    note: "Selected collector → selector → firewall enclosure → electric boost pump → gascolator → engine-driven pump. Electric pump and gascolator both forward of firewall. Engine metering continues separately through servo, flow transducer, divider and nozzles (AMM 12137-002 Rev A1 28-20 pp. 1–2; POH 11934-005 7-41–7-44). No Continental excess-fuel return circuit is assumed for the IO-390. Bends and particle speed schematic.",
  },
);
for (const [key, pts] of [
  ["fuelDrainAux", [FUEL_PUMP, [FUEL_PUMP[0], -0.57, FUEL_PUMP[2]], DRAIN_MANIFOLD]],
  ["fuelDrainGas", [GASCOLATOR, [GASCOLATOR[0], -0.59, GASCOLATOR[2]], DRAIN_MANIFOLD]],
  ["fuelDrainEngine", [ENGINE_FUEL_PUMP, [2.75, -0.55, 0.13], DRAIN_MANIFOLD]],
  ["fuelDrainInduction", [INDUCTION_PLENUM, INDUCTION_DRAIN_CHECK, [2.9, -0.59, 0], DRAIN_MANIFOLD]],
  ["fuelDrainOutlet", [DRAIN_MANIFOLD, GASCOLATOR_DRAIN]],
] as [string, Vec3[]][])
  add(key, pts, {
    ...quiet,
    sys: ["fuel", "engine"],
    r: 0.005,
    name: key === "fuelDrainOutlet" ? "Gascolator sampling drain outlet" : "Fuel / induction drain hose",
    note: "Drain hoses to bottom-centre firewall manifold; induction plenum has a check valve. Dry drain plumbing is static, separate from fuel supply (AMM 12137-002 Rev A1 28-20 p. 2, Fig 28-20-1 p. 5; POH 11934-005 8-17). Routing approximate.",
  });

export const PITOT_BRANCH: Vec3 = [2.15, -0.32, -0.22];
export const STATIC_BRANCH: Vec3 = [1.91, -0.4, -0.16];
export const STATIC_INSTRUMENT_TEE: Vec3 = [2.24, -0.23, -0.22];
const pressure = (key: string, pts: FlowSpec["pts"], name: string, note: string) =>
  add(key, pts, {
    sys: ["pitot"],
    r: 0.009,
    count: 5,
    color: "#3A9448",
    name,
    note:
      note + " Moving particles illustrate pressure transmission, not sustained airflow; bends and bores schematic.",
  });
pressure(
  "pitot",
  [
    pitotBase.clone().add(V(0, 0.015, 0)),
    wingP(PITOT_Z, 0.35, 0),
    wingP(-1, 0.4, 0),
    TRAPS.pitot,
    [1.9, -0.56, -0.24],
    PITOT_BRANCH,
  ],
  "Pitot pressure line",
  "Single pitot mast → floor water trap → instrument branch tee (POH 11934-005 7-69, Fig 7-16 p. 7-72; AMM 12137-002 Rev A1 34-10 p. 9, Fig 34-10-1 p. 19).",
);
pressure(
  "pitotAdahrs",
  [PITOT_BRANCH, ADAHRS_1],
  "ADAHRS 1 pitot branch",
  "Pitot pressure to primary air data computer (POH 11934-005 Fig 7-16 p. 7-72).",
);
pressure(
  "pitotAdahrs2",
  [PITOT_BRANCH, [2.29, -0.18, -0.03], ADAHRS_2],
  "ADAHRS 2 pitot branch",
  "Separate pressure branch to optional second air data computer; shared external source (POH 11934-005 Fig 7-16 p. 7-72).",
);
pressure(
  "pitotStby",
  [PITOT_BRANCH, MD302_POS],
  "MD302 pitot branch",
  "MD302 has its own pitot connection; shares external pitot source with ADAHRS (POH 11934-005 Fig 7-16 p. 7-72; AMM 12137-002 Rev A1 34-10 p. 9).",
);
for (const [key, s, sump] of [
  ["static", 1, SUMPS[0]],
  ["staticL", -1, SUMPS[1]],
] as const)
  pressure(
    key,
    [STATIC_PORT(s), sump, [sump[0] + 0.07, sump[1], sump[2]], [STATIC_TEE[0] - 0.04, 0.05, s * 0.18], STATIC_TEE],
    `${s > 0 ? "Right" : "Left"} static port line`,
    "Port → directly mounted static sump → LH CAPS bulkhead tee (AMM 12137-002 Rev A1 34-10 p. 1, Fig 34-10-1 p. 19).",
  );
pressure(
  "static2",
  [STATIC_TEE, [0.1, -0.32, -0.18], TRAPS.static, [1.5, -0.57, -0.26], STATIC_BRANCH],
  "Floor static pressure line",
  "Bulkhead tee → under-floor low-point water trap → forward static plumbing (AMM 12137-002 Rev A1 34-10 pp. 1, 12).",
);
pressure(
  "staticAlt",
  [ALT_STATIC, STATIC_BRANCH],
  "Alternate cabin static branch",
  "Cabin source admits static pressure downstream of normal-source floor trap; normal-source particles stop when alternate is selected. Selection display is illustrative (POH 11934-005 7-70, Fig 7-16 p. 7-72).",
);
pressure(
  "staticConsole",
  [STATIC_BRANCH, TRAPS.staticConsole, STATIC_INSTRUMENT_TEE],
  "Console static pressure line",
  "Forward static plumbing through second low-point trap to instrument tee (AMM 12137-002 Rev A1 34-10 p. 12).",
);
pressure(
  "staticAdahrs",
  [STATIC_INSTRUMENT_TEE, ADAHRS_1],
  "ADAHRS 1 static branch",
  "Static pressure to primary air data computer (POH 11934-005 Fig 7-16 p. 7-72).",
);
pressure(
  "staticAdahrs2",
  [STATIC_INSTRUMENT_TEE, [2.3, -0.15, -0.03], ADAHRS_2],
  "ADAHRS 2 static branch",
  "Optional second ADC uses a separate branch from the common static system (POH 11934-005 Fig 7-16 p. 7-72).",
);
pressure(
  "staticStby",
  [STATIC_INSTRUMENT_TEE, MD302_POS],
  "MD302 static branch",
  "MD302 has its own static connection; common static pressure source (POH 11934-005 Fig 7-16 p. 7-72).",
);
pressure(
  "stall",
  [STALL_INLET, wingP(3, 0.28, 0), wingP(0.7, 0.28, 0), STALL_TRAP, STALL_SWITCH],
  "Stall warning pneumatic line",
  "RH leading-edge inlet → floor tee/drain water trap → normally-open diaphragm pressure switch on LH mid-console. Negative-pressure particles move toward wing on warning (POH 11934-005 7-69; AMM 12137-002 Rev A1 27-31 p. 1, Fig 27-31-1 p. 5).",
);
for (const [i, probe, adc] of [
  [1, OAT_1, ADAHRS_1],
  [2, OAT_2, ADAHRS_2],
] as const)
  add(`oat${i}`, [probe, wingP(probe[2], 0.5, 0), wingP(0.7, 0.5, 0), [1.6, -0.56, 0.29], [2.35, -0.12, 0.19], adc], {
    sys: ["pitot", "avionics"],
    r: 0.004,
    count: 4,
    color: "#C8399F",
    pcolor: "#EDAEED",
    name: `OAT ${i} → ADAHRS ${i}`,
    note: "RH-wing temperature probe connects directly to its ADC; signal particles are explanatory, not pneumatic (POH 11934-005 7-76; AMM 12137-002 Rev A1 34-10 p. 2). Harness route approximate.",
  });
add("stallSignal", [STALL_SWITCH, STALL_CONNECTOR], {
  sys: ["pitot", "avionics"],
  r: 0.004,
  count: 4,
  color: "#C8399F",
  pcolor: "#EDAEED",
  name: "Stall switch electrical signal",
  note: "Pressure switch signals avionics to sound horn and display red STALL; 2 A STALL WARNING on ESS BUS 2. Electrical interface route schematic (POH 11934-005 7-69; AMM 12137-002 Rev A1 27-31 p. 1).",
});

/** Replace original fuelL/fuelR/fuelMain and pitot/static/static2/stall; leave engine injectors to engine-depth-flow.ts. */
export const FUEL_PITOT_DEPTH_FLOWS = F;
/** Short skin penetrations at documented external ports, not exemptions for entire routes.
 * Stub envelopes are approximate display dimensions; internal tube walls remain inside the skin. */
export const FUEL_PITOT_SKIN_PORTS: Readonly<Record<string, { point: Vec3; reach: number; part: string }>> = {
  fuelVentL: { point: NACA_FUEL_VENT(-1), reach: 0.025, part: "NACA fuel vent" },
  fuelVentR: { point: NACA_FUEL_VENT(1), reach: 0.025, part: "NACA fuel vent" },
  fuelDrainOutlet: { point: GASCOLATOR_DRAIN, reach: 0.025, part: "Gascolator drain" },
  static: { point: STATIC_PORT(1), reach: 0.025, part: "Static port (R)" },
  staticL: { point: STATIC_PORT(-1), reach: 0.025, part: "Static port (L)" },
  stall: { point: STALL_INLET, reach: 0.025, part: "Stall warning inlet" },
  oat1: { point: OAT_1, reach: 0.02, part: "OAT sensor 1" },
  oat2: { point: OAT_2, reach: 0.02, part: "OAT sensor 2" },
};

export const isOptionalPitotFlow = (key: string) => ["pitotAdahrs2", "staticAdahrs2", "oat2"].includes(key);
/** Pressure branches remain available with electronics off; only optional installation controls branch visibility. */
export function fuelPitotDepthRates(s: Sim, E: Elec): Record<string, number> {
  const R: Record<string, number> = {},
    feed = s.eng.running || (s.eng.key === "START" && E.starterPwr) || (s.fuel.boost && E.boostPwr),
    ok = fuelAvail(s);
  for (const side of ["L", "R"] as const) {
    const selected = feed && ok && s.fuel.sel === side;
    R[`fuel${side}`] = selected ? 1 : 0;
    R[`fuelTank${side}`] = R[`fuelTank${side}2`] = selected ? 0.65 : 0;
    R[`fuelVent${side}`] = R[`collectorVent${side}`] = 0;
    for (const i of [1, 2]) R[`fuelQty${side}${i}`] = E.eisPwr && E.main1 > 0 && !s.cb["FUEL QTY"] ? 0.4 : 0;
  }
  R.fuelMain = feed && ok ? (s.fuel.boost && E.boostPwr ? 1.4 : 1) : 0;
  for (const flow of F) if (flow.key.startsWith("fuelDrain")) R[flow.key] = 0;
  R.pitot = R.pitotAdahrs = R.pitotStby = 0.4;
  R.pitotAdahrs2 = s.avx.dualAdahrs ? 0.4 : 0;
  R.static = R.staticL = R.static2 = s.pitot.alt ? 0 : 0.4;
  R.staticAlt = s.pitot.alt ? 0.4 : 0;
  R.staticConsole = R.staticAdahrs = R.staticStby = 0.4;
  R.staticAdahrs2 = s.avx.dualAdahrs ? 0.4 : 0;
  R.oat1 = E.ahrs1 ? 0.4 : 0;
  R.oat2 = E.ahrs2 ? 0.4 : 0;
  R.stall = s.stall.aoa >= 14 && !s.stall.fault ? -1 : 0;
  R.stallSignal = E.stallPwr && s.stall.aoa >= 14 && !s.stall.fault ? 0.6 : 0;
  return R;
}
