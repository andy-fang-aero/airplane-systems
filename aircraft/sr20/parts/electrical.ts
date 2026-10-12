/**
 * SR20 G6 power generation and protection. POH 11934-005 Reissue A, amended Section 7 Revision A1,
 * 7-49–7-56; SR20 AMM 12137-002 Reissue A / Revision A1, ATA 24.
 * MCU internals are schematic: the manuals define connectivity, not installation coordinates.
 * G6 Spectra wingtip LED lighting has no legacy HID landing-light ballast represented here.
 */
import { glowAnim } from "@/lib/anims";
import type { Vec3 } from "@/lib/math";
import { box, cyl, tubeGeo } from "../geometry";
import { type Elec, type Sim } from "../model";
import { useSR20 } from "../store";
import { part } from "./catalogue";

const S = () => useSR20.getState();
export const MCU: Vec3 = [2.66, -0.08, -0.33];
export const MCU_SIZE: Vec3 = [0.07, 0.18, 0.14];
export const BAT_1: Vec3 = [2.7, -0.04, 0.34];
export const BAT2_BOX: Vec3 = [-0.74, -0.06, -0.24];
export const BAT2_SIZE: Vec3 = [0.3, 0.12, 0.13];
export const GROUND_POWER: Vec3 = [2.45, -0.3, -0.6];
export const BAT2_RELAY: Vec3 = [-0.54, -0.055, -0.24];

part(() => box(...MCU_SIZE), ["electrical"], {
  pos: MCU,
  name: "Master Control Unit",
  note: "Forward LH firewall. Houses BAT 1, starter and external-power relays, two alternator field-control modules, three current shunts and eight 30 A feeder fuses (SR20 AMM 12137-002 24-30 pp. 4–5). Regulates both alternators, protects against overvoltage and reverse-polarity external power, and reports electrical health to Perspective+ (POH 11934-005 7-51). Internal component placement is schematic, approximate.",
  pin: true,
  fairing: true,
});
part(() => box(0.13, 0.17, 0.2), ["electrical"], {
  pos: BAT_1,
  name: "BAT 1 — 24 V, 11 Ah",
  note: "Aviation-grade 12-cell lead-acid battery on the right firewall, charged from Main Distribution Bus 1; supplies starting power (POH 7-49, 7-55). This SR20 rating is 11 Ah; the SR22T POH's 10 Ah rating does not apply.",
  pin: true,
});
part(() => box(...BAT2_SIZE), ["electrical"], {
  pos: BAT2_BOX,
  name: "BAT 2 — 2 × 12 V, 7 Ah",
  note: "Two sealed 12 V, 7 Ah lead-acid batteries in series, giving 24 V and 7 Ah, in a vented acid-resistant container behind FS 222 below the CAPS canister (POH 7-49). Left of the parachute in Fig 7-20 item 22 (7-89). Charged from ESS BUS 1. Container dimensions and position are approximate.",
  pin: true,
  fairing: true,
});
for (const dx of [-0.07, 0.07])
  part(() => box(0.12, 0.09, 0.1), ["electrical"], {
    pos: [BAT2_BOX[0] + dx, BAT2_BOX[1] - 0.01, BAT2_BOX[2]],
    name: "BAT 2 battery — 12 V, 7 Ah",
    color: "#3C4650",
    note: "One of BAT 2's two sealed lead-acid units. Series connection adds voltage; capacity remains 7 Ah (POH 7-49). Size approximate.",
  });
part(() => box(0.3, 0.004, 0.13), ["electrical"], {
  pos: [BAT2_BOX[0], BAT2_BOX[1] - BAT2_SIZE[1] / 2 - 0.002, BAT2_BOX[2]],
  name: "BAT 2 mounting shelf",
  color: "#929BA1",
  note: "Supports the empennage BAT 2 container (AMM 24-30, Battery 2 installation). Shelf dimensions and position are approximate.",
});
part(() => box(0.038, 0.03, 0.035), ["electrical"], {
  pos: BAT2_RELAY,
  name: "BAT 2 relay",
  note: "Next to BAT 2. BAT 2 master energizes this relay to connect the battery through its 20 A breaker to ESS BUS 1 (AMM 24-30 p. 5; POH 7-52, 7-55). Position approximate.",
  anim: glowAnim("#7A8288", () => S().E.bat2ok, ["electrical"]),
});
part(() => box(0.08, 0.07, 0.02), ["electrical"], {
  pos: GROUND_POWER,
  name: "Ground service receptacle",
  note: "Left side just aft of the cowl; regulated 28 VDC and BAT 1 ON required (POH 7-56). Three contacts: two longer power contacts and a short relay-control contact, so the relay closes only after reliable connection. An isolation diode prevents reversed polarity from engaging it (AMM 24-40 p. 1). The AMM calls it integral to the MCU; this external position follows the POH. External power is explanatory hardware, not an interactive source.",
  ext: true,
  pin: true,
});
for (const dz of [-0.018, 0.018, 0])
  part(() => cyl(0.005, dz === 0 ? 0.012 : 0.021, "z"), ["electrical"], {
    pos: [GROUND_POWER[0] + dz, GROUND_POWER[1], GROUND_POWER[2] - 0.014],
    name: dz === 0 ? "Ground power relay-control contact" : "Ground power power contact",
    color: "#BDAD73",
    note: "Three-contact receptacle; the shorter contact controls the external-power relay and the two longer contacts carry power (AMM 24-40 p. 1). Shape approximate.",
    ext: true,
  });

/* MCU field relays and contactors: explanatory locations inside the case. */
export const MCU_RELAYS: [string, (s: Sim, E: Elec) => boolean, string][] = [
  [
    "ALT 1 field relay",
    (s, E) => s.elec.alt1 && E.ac1 > 0 && !s.cb["ALT 1"],
    "ALT 1 switch applies field power from the 5 A ALT 1 breaker on A/C BUS 1 to its regulator; initial excitation requires BAT 1 (POH 7-55). This is a field-control relay, not a switch in the alternator output cable.",
  ],
  [
    "ALT 2 field relay",
    (s, E) => s.elec.alt2 && E.ess2 > 0 && !s.cb["ALT 2"],
    "ALT 2 switch applies field power from the 5 A ALT 2 breaker on ESS BUS 2 to its regulator; initial excitation requires BAT 1 or BAT 2 (POH 7-55).",
  ],
  [
    "BAT 1 relay",
    (_, E) => E.bat1ok,
    "BAT 1 master connects BAT 1 to the MCU distribution buses and the open starter-relay contacts (POH 7-55).",
  ],
  [
    "Starter relay",
    (s, E) => s.eng.key === "START" && E.starterPwr,
    "START closes the high-current starter relay when starter control power and BAT 1 are available (POH Fig 7-10, 7-50; 7-38). The STARTER breaker protects the control circuit, not the starter motor cable.",
  ],
  [
    "External power relay",
    () => false,
    "Short ground-power contact commands this relay only with BAT 1 ON and correct polarity; supplies Main Distribution Bus 1 (AMM 24-40 p. 1; POH 7-56). External power is not simulated; contactor remains open.",
  ],
];
export const mcuRelayPos = (i: number): Vec3 => [MCU[0], MCU[1] + 0.068, MCU[2] - 0.048 + i * 0.024];
MCU_RELAYS.forEach(([name, on, note], i) =>
  part(() => box(0.03, 0.018, 0.018), ["electrical"], {
    pos: mcuRelayPos(i),
    name,
    note,
    color: "#7A8288",
    anim: glowAnim("#7A8288", () => on(S().s, S().E), ["electrical"]),
  }),
);
for (const [name, key, dy, note] of [
  [
    "Main Distribution Bus 1",
    "mdb1",
    0.038,
    "ALT 1 through 100 A fuse and BAT 1. Feeds MAIN BUS 3, A/C BUS 1 and A/C BUS 2 through separate 30 A fuses (POH 7-51).",
  ],
  [
    "Main Distribution Bus 2",
    "mdb2",
    0.012,
    "ALT 2 and the one-way MDB 1 interconnect. Feeds MAIN BUS 1, MAIN BUS 2 and NON ESS BUS through separate 30 A fuses (POH 7-51).",
  ],
  [
    "Essential Distribution Bus",
    "edb",
    -0.014,
    "Diode-isolated feeds from both main distribution buses through two 50 A fuses and a direct BAT 1 feed (POH Fig 7-10, 7-50; 7-51–7-52). Feeds ESS BUS 1 and 2 through separate 30 A fuses; BAT 2 can backfeed ESS BUS 2 through ESSENTIAL POWER.",
  ],
] as const)
  part(() => box(0.03, 0.008, 0.11), ["electrical"], {
    pos: [MCU[0], MCU[1] + dy, MCU[2]],
    name,
    note,
    color: "#B87333",
    anim: glowAnim("#B87333", () => S().E[key] > 0, ["electrical"]),
  });
for (const [n, volts, dz] of [
  [1, 27.7, -0.035],
  [2, 28.7, 0.035],
] as const)
  part(() => box(0.028, 0.022, 0.032), ["electrical"], {
    pos: [MCU[0], MCU[1] - 0.063, MCU[2] + dz],
    name: `ALT ${n} field-control module`,
    note: `Separate voltage regulator sets ALT ${n} to ${volts} V nominal and protects against overvoltage (POH 7-49, 7-51; AMM 24-30 pp. 1, 5). AMM describes corresponding alternator breaker opening above 32 V; overvoltage faults are not separately simulated. Placement schematic.`,
    color: "#4B5860",
  });
part(() => box(0.025, 0.01, 0.07), ["electrical"], {
  pos: [MCU[0], MCU[1] - 0.037, MCU[2] - 0.026],
  name: "MCU source and feeder fuses",
  note: "ALT 1 output: 100 A; ALT 2 output: POH 7-51 text 80 A, but Fig 7-10 (7-50) and AMM 24-30 p. 1 / 24-50 p. 1 show 60 A. This study follows the POH text and preserves the disagreement. Eight breaker-bus feeders: 30 A each; main-to-essential feeds: two 50 A (POH 7-51). Fuses are fixed protection, not cockpit-resettable breakers.",
  color: "#C9B458",
});
part(() => box(0.024, 0.012, 0.024), ["electrical"], {
  pos: [MCU[0], MCU[1] - 0.037, MCU[2] + 0.037],
  name: "MDB interconnect fuse and diode",
  note: "80 A fuse and one-way diode permit MDB 1 → MDB 2 while blocking ALT 2 → MDB 1 (POH 7-51; AMM 24-30 p. 1). ALT 2's higher regulated voltage keeps the buses separate in normal operation. Schematic placement.",
  color: "#C98A58",
});
part(() => box(0.022, 0.012, 0.02), ["electrical"], {
  pos: [MCU[0], MCU[1] + MCU_SIZE[1] / 2 + 0.006, MCU[2] + 0.025],
  name: "CONV bus fuse (5 A)",
  note: "On top of MCU; direct BAT 1 feed to constant-power CONV bus, before BAT 1 master isolation (POH 7-52; Fig 7-10, 7-50). Convenience loads can remain powered with master switches OFF.",
  color: "#C9B458",
});
for (const dz of [-0.033, 0, 0.033])
  part(() => box(0.025, 0.006, 0.012), ["electrical"], {
    pos: [MCU[0], MCU[1] - 0.08, MCU[2] + dz],
    name: "MCU current shunt",
    note: "One of three current shunts inside the MCU (AMM 24-30 p. 5). Electrical measurements are sent to the GEA engine airframe unit for MFD/PFD indication (POH 7-56). Placement schematic.",
    color: "#AB915F",
  });

/* Both IO-390 alternators are belt driven. Separate lanes preserve the SR20's two drives. */
export const ALT_PULLEYS: Record<1 | 2, Vec3> = { 1: [3.565, -0.3, 0.22], 2: [3.58, -0.3, -0.22] };
export const CRANK_PULLEYS: Record<1 | 2, Vec3> = { 1: [3.565, -0.14, 0], 2: [3.58, -0.14, 0] };
export function alternatorBelt(n: 1 | 2): Vec3[] {
  const [x, ya, za] = ALT_PULLEYS[n],
    [, yc, zc] = CRANK_PULLEYS[n];
  const angle = Math.atan2(ya - yc, za - zc),
    pts: Vec3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = angle + Math.PI / 2 + (i / 12) * Math.PI;
    pts.push([x, yc + 0.065 * Math.sin(a), zc + 0.065 * Math.cos(a)]);
  }
  for (let i = 0; i <= 12; i++) {
    const a = angle - Math.PI / 2 + (i / 12) * Math.PI;
    pts.push([x, ya + 0.038 * Math.sin(a), za + 0.038 * Math.cos(a)]);
  }
  return [...pts, pts[0]];
}
for (const n of [1, 2] as const) {
  for (const [pos, radius] of [
    [ALT_PULLEYS[n], 0.038],
    [CRANK_PULLEYS[n], 0.065],
  ] as const)
    part(() => cyl(radius, 0.012, "x"), ["electrical", "engine"], {
      pos,
      color: "#5B6268",
      name: `ALT ${n} drive pulley`,
      note: "Alternator and crankshaft drive sheaves for the belt-driven IO-390 alternator (POH 7-49; AMM Figs 24-30-2 and 24-30-3). Pulley sizes and coordinates approximate.",
    });
  part(() => tubeGeo(alternatorBelt(n), 0.005, 0), ["electrical", "engine"], {
    name: `ALT ${n} drive belt`,
    color: "#282B2E",
    note: `ALT ${n} is belt driven at the ${n === 1 ? "right" : "left"} front of the IO-390 (POH 7-49; AMM 24-30 pp. 4–5 and Figs 24-30-2/3). Route and sheave dimensions approximate. Both SR20 alternators are belt driven; the SR22T accessory drive does not apply.`,
  });
}
