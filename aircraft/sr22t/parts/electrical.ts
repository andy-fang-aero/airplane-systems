/**
 * Electrical power hardware: Master Control Unit and what it holds, BAT 1, BAT 2 and its container,
 * the ground service receptacle, the landing light ballast, the ALT 2 drive belt, the console transient voltage
 * suppressors and the convenience system controller.
 */
import type { Vec3 } from "@/lib/math";
import { glowAnim } from "@/lib/anims";
import { box, cyl, tubeGeo } from "../geometry";
import { extLit, type Elec, type Sim } from "../model";
import { useSR22T } from "../store";
import { part } from "./catalogue";
import { REAR_CUSHION_X } from "./cabin";
import { ALT2_PULLEY, PROP } from "./engine";

/* ---------- electrical ---------- */
/** Master Control Unit centre and size: left firewall, engine side (POH 7-47, 7-49; AMM Fig 71-00-2 item 9). Size approximate. */
export const MCU: Vec3 = [2.66, -0.08, -0.33];
export const MCU_SIZE: Vec3 = [0.07, 0.18, 0.14];
part(() => box(...MCU_SIZE), ["electrical"], {
  pos: MCU,
  name: "Master Control Unit",
  note: "Left firewall (SR22T POH 13772-007 7-47, 7-49; AMM 13773-002 Fig 71-00-2 item 9). Controls ALT 1, ALT 2, starter, landing light and external power; regulates both alternators and gives external-power reverse-polarity and alternator overvoltage protection. Holds the three distribution buses, their fuses, the MDB 1 → MDB 2 fuse and diode and the relays (POH 7-49). Neither the POH nor the AMM draws its inside: the parts in it are schematic, placed for legibility.",
  pin: true,
  fairing: true,
});
/** Anchor for flows.ts. */
export const BAT_1: Vec3 = [2.7, -0.04, 0.34];
part(() => box(0.13, 0.17, 0.2), ["electrical"], {
  pos: BAT_1,
  name: "BAT 1 — 24 V, 10 Ah",
  note: "Lead-acid, right firewall. Charged from Main Dist Bus 1; used for starting (SR22T POH 13772-007 7-47). AMM 24-00 PDF p. 694 says 11 Ah; POH governs.",
  pin: true,
});
/**
 * BAT 2 container: behind the aft cabin bulkhead (FS 222) below the parachute canister (POH 7-47), left of the CAPS
 * parachute in the plan view (POH Fig 7-20 item 24, 7-88). Position and size approximate (no dimensioned drawing).
 */
export const BAT2_BOX: Vec3 = [-0.74, -0.06, -0.24];
export const BAT2_SIZE: Vec3 = [0.3, 0.12, 0.13];
/** Shelf top is the container bottom; AMM Fig 22-10-6 sheet 3, PDF p. 606. Dimensions approximate. */
export const BAT2_SHELF = {
  c: [BAT2_BOX[0], BAT2_BOX[1] - BAT2_SIZE[1] / 2, BAT2_BOX[2]] as Vec3,
  size: [BAT2_SIZE[0], 0.004, BAT2_SIZE[2]] as Vec3,
};

part(() => box(...BAT2_SIZE), ["electrical"], {
  pos: BAT2_BOX,
  name: "BAT 2 — 2 × 12 V, 7 Ah",
  note: 'Vented, acid-resistant container behind the aft cabin bulkhead (FS 222) below the parachute canister, holding two 12 V, 7 Ah sealed lead-acid batteries in series for 24 V; charged from ESS BUS 1 (SR22T POH 13772-007 7-47). Left of the parachute in POH Fig 7-20 item 24 (7-88); AMM 24-00 PDF p. 694 says only "in the empennage". Position and size approximate.',
  pin: true,
  fairing: true,
});
part(() => box(0.08, 0.07, 0.02), ["electrical"], {
  pos: [2.45, -0.3, -0.6],
  name: "Ground service receptacle",
  note: "Left side just aft of the cowl. Regulated 28 V; works only with BAT 1 on: the external power contactor is wired through the BAT 1 switch (SR22T POH 13772-007 7-54). Three contacts: the two longer ones carry power, the shorter one engages the external power relay in the MCU, and an isolation diode keeps reverse polarity from engaging it (AMM 13773-002 24-40 PDF p. 748). AMM 24-40 places it on the MCU at the forward LH firewall; POH governs.",
  ext: true,
});

/* ---------- BAT 2 batteries ---------- */
for (const dx of [-0.07, 0.07])
  part(() => box(0.12, 0.09, 0.1), ["electrical"], {
    pos: [BAT2_BOX[0] + dx, BAT2_BOX[1] - 0.01, BAT2_BOX[2]],
    color: "#3C4650",
    name: "BAT 2 battery — 12 V, 7 Ah",
    note: "One of the two sealed lead-acid batteries in series that make up BAT 2 (SR22T POH 13772-007 7-47). Size approximate.",
  });

/* ---------- inside the MCU: schematic layout (POH 7-49, 7-57; Fig 7-10 on 7-48) ---------- */
const S = () => useSR22T.getState();
const [mx, my, mz] = MCU;
/** The MCU relays and when each is energized. External power is not modelled, so its relay never is. */
export const MCU_RELAYS: [name: string, on: (s: Sim, E: Elec) => boolean, note: string][] = [
  [
    "ALT 1 relay",
    (_, E) => E.alt1,
    "Connects ALT 1 to Main Distribution Bus 1; energized while ALT 1 is on line (SR22T POH 13772-007 Fig 7-10, 7-48).",
  ],
  [
    "BAT 1 relay",
    (_, E) => E.bat1ok,
    "Connects BAT 1 to the MCU distribution buses and the starter relay; energized while the BAT 1 switch is on and the battery is serviceable (SR22T POH 13772-007 Fig 7-10, 7-48).",
  ],
  [
    "Starter relay",
    (s, E) => E.starterPwr && s.eng.key === "START",
    "Energized while the key is held at START with STARTER power available (SR22T POH 13772-007 7-37; Fig 7-10, 7-48).",
  ],
  [
    "External power relay",
    () => false,
    "Engaged by the short contact of the ground service receptacle, connecting external power to Main Distribution Bus 1 (AMM 13773-002 24-40 PDF p. 748; POH Fig 7-10). External power is not modelled here, so it stays open.",
  ],
  [
    "Landing light relay",
    (s, E) => extLit(s, E).land,
    "LAND energizes it, completing a 28 VDC circuit from Main Distribution Bus 1 through a 7.5 A fuse to the ballast on the firewall (SR22T POH 13772-007 7-57).",
  ],
];
/** Centre of MCU relay `i` (an index into MCU_RELAYS): one row along the top of the box, schematic. */
export const mcuRelayPos = (i: number): Vec3 => [mx, my + 0.07, mz - 0.048 + i * 0.024];
MCU_RELAYS.forEach(([name, on, note], i) =>
  part(() => box(0.03, 0.018, 0.018), ["electrical"], {
    pos: mcuRelayPos(i),
    color: "#7A8288",
    name,
    note,
    anim: glowAnim("#7A8288", () => on(S().s, S().E), ["electrical"]),
  }),
);
(
  [
    [
      "Main Distribution Bus 1",
      "mdb1",
      0.04,
      "Fed by ALT 1 through a 100 A fuse and by BAT 1; powers A/C BUS 1, A/C BUS 2 and MAIN BUS 3 through 30 A fuses and the landing light through a 7.5 A fuse (SR22T POH 13772-007 7-49).",
    ],
    [
      "Main Distribution Bus 2",
      "mdb2",
      0.015,
      "Fed by ALT 2 through an 80 A fuse, and from Main Distribution Bus 1 through the interconnect fuse and diode; powers NON ESS BUS, MAIN BUS 1 and MAIN BUS 2 through 30 A fuses (SR22T POH 13772-007 7-49). POH Fig 7-10 (7-48) prints 60 A for the ALT 2 and interconnect fuses; the 7-49 text governs.",
    ],
    [
      "Essential Distribution Bus",
      "edb",
      -0.01,
      "Fed by both main distribution buses through two 50 A fuses; powers ESS BUS 1 and ESS BUS 2 through 30 A fuses (SR22T POH 13772-007 7-49).",
    ],
  ] as const
).forEach(([name, bus, dy, note]) =>
  part(() => box(0.03, 0.008, 0.11), ["electrical"], {
    pos: [mx, my + dy, mz],
    color: "#B87333",
    name,
    note,
    anim: glowAnim("#B87333", () => S().E[bus] > 0, ["electrical"]),
  }),
);
(
  [
    [
      "ALT 1 voltage regulator",
      "alt1",
      -0.03,
      "Regulates ALT 1 to 28 V (SR22T POH 13772-007 7-47, 7-49; Fig 7-10 VOLT REG).",
    ],
    [
      "ALT 2 voltage regulator",
      "alt2",
      0.03,
      "Regulates ALT 2 to 28.75 V, slightly above ALT 1's 28 V, which further assures bus separation (SR22T POH 13772-007 7-47, 7-49; Fig 7-10 VOLT REG).",
    ],
  ] as const
).forEach(([name, alt, dz, note]) =>
  part(() => box(0.035, 0.025, 0.04), ["electrical"], {
    pos: [mx, my - 0.065, mz + dz],
    color: "#4B5860",
    name,
    note,
    anim: glowAnim("#4B5860", () => S().E[alt], ["electrical"]),
  }),
);
part(() => box(0.02, 0.012, 0.08), ["electrical"], {
  pos: [mx, my - 0.035, mz - 0.015],
  color: "#C9B458",
  name: "MCU bus fuses",
  note: "ALT 1 → Main Dist Bus 1: 100 A. ALT 2 → Main Dist Bus 2: 80 A. Main Dist Buses → Essential Dist Bus: two 50 A. Each circuit breaker panel bus (ESS BUS 1 and 2, A/C BUS 1 and 2, MAIN BUS 1, 2 and 3, NON ESS BUS): 30 A. Landing light: 7.5 A (SR22T POH 13772-007 7-49, 7-57). POH Fig 7-10 (7-48) prints 60 A for the ALT 2 fuse; the 7-49 text governs.",
});
part(() => box(0.02, 0.012, 0.025), ["electrical"], {
  pos: [mx, my - 0.035, mz + 0.045],
  color: "#C98A58",
  name: "MDB interconnect fuse and diode",
  note: "Main Distribution Bus 1 feeds Main Distribution Bus 2 through an 80 A fuse and a diode; the diode keeps ALT 2 from feeding Main Distribution Bus 1 (SR22T POH 13772-007 7-49). AMM 13773-002 24-30 PDF p. 704 says a 60 A fuse; POH governs. POH Fig 7-10 (7-48) also prints 60 A; the 7-49 text governs.",
});
part(() => box(0.02, 0.012, 0.02), ["electrical"], {
  pos: [mx, my + MCU_SIZE[1] / 2 + 0.006, mz + 0.03],
  color: "#C9B458",
  name: "CONV bus fuse (5 A)",
  note: "On top of the MCU: feeds the Constant Power Bus (CONV) from BAT 1 (SR22T POH 13772-007 7-50).",
});
part(() => box(0.003, MCU_SIZE[1] + 0.04, MCU_SIZE[2] + 0.04), ["electrical", "engine"], {
  pos: [mx + MCU_SIZE[0] / 2 + 0.01, my, mz],
  color: "#B9BEC2",
  name: "MCU heat shield",
  note: "Stainless steel heat shield on the engine side of the MCU, one of nine that protect firewall-forward parts from turbo exhaust heat (AMM 13773-002 71-30 PDF pp. 2528–2529, Fig 71-30-1). Shape approximate.",
  groups: [],
});

/* ---------- landing light ballast, ALT 2 drive belt, console TVS, convenience system controller ---------- */
/** Landing light ballast on the firewall (POH 7-57); position approximate. */
export const LAND_BALLAST: Vec3 = [2.64, -0.4, -0.18];
part(() => box(0.04, 0.08, 0.12), ["electrical", "lighting"], {
  pos: LAND_BALLAST,
  color: "#5A6168",
  name: "Landing light ballast",
  note: "On the firewall: provides boosted voltage to illuminate the HID landing light, fed from Main Distribution Bus 1 through the landing light relay in the MCU (SR22T POH 13772-007 7-57). Position approximate.",
  anim: glowAnim("#5A6168", () => extLit(S().s, S().E).land, ["electrical", "lighting"]),
});
/** Crankshaft drive sheave on the propeller flange, in the plane of the ALT 2 pulley (ALT2_PULLEY in parts/engine.ts).
 * ALT 2 is belt-driven (POH 7-47; AMM Fig 24-30-4 items 5, 7, 9); the belt path and pulley sizes are approximate. */
export const CRANK_PULLEY: Vec3 = [ALT2_PULLEY[0], PROP[1], PROP[2]];
const beltLoop = (): Vec3[] => {
  const [x, ya, za] = ALT2_PULLEY,
    [, yc, zc] = CRANK_PULLEY,
    ra = 0.045,
    rc = 0.09,
    ang = Math.atan2(ya - yc, za - zc),
    pts: Vec3[] = [];
  // Half a turn round each pulley, on the side facing away from the other one.
  for (let i = 0; i <= 12; i++) {
    const t = ang + Math.PI / 2 + (i / 12) * Math.PI;
    pts.push([x, yc + rc * Math.sin(t), zc + rc * Math.cos(t)]);
  }
  for (let i = 0; i <= 12; i++) {
    const t = ang - Math.PI / 2 + (i / 12) * Math.PI;
    pts.push([x, ya + ra * Math.sin(t), za + ra * Math.cos(t)]);
  }
  pts.push(pts[0]);
  return pts;
};
part(() => tubeGeo(beltLoop(), 0.006, 0), ["electrical", "engine"], {
  color: "#2A2D30",
  name: "ALT 2 drive belt",
  note: "ALT 2 is belt-driven (SR22T POH 13772-007 7-47), from a pulley on the crankshaft behind the propeller. Belt path and pulley sizes approximate.",
  groups: [],
});
for (const dx of [-0.05, 0.05])
  part(() => cyl(0.012, 0.03, "z"), ["electrical"], {
    pos: [1.65 + dx, -0.42, 0.1],
    color: "#2F3A44",
    name: "Transient voltage suppressor",
    note: "One of two TVS on the RH side of the center console (AMM 13773-002 24-50 PDF p. 752): a high-power suppressor at a power entry point that lets lightning-induced transients dissipate to ground (SR22T POH 13772-007 7-50). The AMM also lists eight TVS integral to the wiring harnesses: those are the Harness TVS parts (parts/electrical-harness.ts). Position approximate.",
  });
part(() => box(0.14, 0.04, 0.1), ["electrical"], {
  // POH 13772-007 Fig 7-20 item 15, 7-88; AMM 13773-002 Rev 7 24-50 PDF p. 755.
  // Illustrative inboard placement under the RH cushion, clear of the cross-over pulley and static2 line.
  pos: [REAR_CUSHION_X, -0.58, 0.17],
  color: "#4B5860",
  name: "Convenience system controller",
  note: "On the fuselage skin below the RH rear seat (POH Fig 7-20 item 15, 7-88; AMM 13773-002 24-50 PDF p. 755). Powers the dome, footwell, entry step and baggage lights for convenience illumination with aircraft power off, from the 5 A CONV LIGHTS breaker on the CONV bus (SR22T POH 13772-007 7-59). Position approximate.",
  pin: true,
});
