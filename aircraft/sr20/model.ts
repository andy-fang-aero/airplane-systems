/**
 * Simulation model: discrete state, the electrical solver and derived logic.
 * Everything here is pure so it can run in the store, in useFrame, or in tests.
 */
import type { CasLevel } from "../types";

export type Key = "OFF" | "R" | "L" | "BOTH" | "START";
export type FuelSel = "L" | "R" | "OFF";
export type Vent = "P" | "PF" | "PFW" | "W";
export type CabinSwitch = "OFF" | "ON" | "AUTO";

export interface Sim {
  eng: { running: boolean; key: Key; lever: number; mix: number; altAir: boolean; filterBlocked: boolean };
  elec: {
    bat1: boolean;
    bat2: boolean;
    alt1: boolean;
    alt2: boolean;
    avionics: boolean;
    fail: { alt1: boolean; alt2: boolean; bat1: boolean };
    tBat: number;
  };
  /** Pulled circuit breakers keyed by breaker label. */
  cb: Record<string, boolean>;
  fuel: { sel: FuelSel; boost: boolean; qL: number; qR: number };
  flaps: { cmd: 0 | 50 | 100 };
  ctrl: { pitch: number; roll: number; yaw: number };
  gear: { diff: number; park: boolean };
  /** fan: -1 OFF, 0 ram air, 1–3 blower */
  env: { fan: number; temp: number; vent: Vent; ac: boolean; recirc: boolean };
  pitot: { heat: boolean; oat: number; heaterFail: boolean; alt: boolean };
  stall: { aoa: number; fault: boolean };
  /** Cabin switch + door state, and the bolster exterior light switches. */
  lights: {
    cabin: CabinSwitch;
    door: boolean;
    unlocked: boolean;
    bag: boolean;
    nav: boolean;
    strobe: boolean;
    land: boolean;
    ice: boolean;
  };
  avx: { backup: boolean; pfdFail: boolean; dualAdahrs: boolean; ahrs1Fail: boolean; ahrs2Fail: boolean };
  /** CAPS deployment active (time itself lives in `live`). */
  capsOn: boolean;
}

export const initialSim: Sim = {
  eng: { running: true, key: "BOTH", lever: 0.72, mix: 0.85, altAir: false, filterBlocked: false },
  elec: {
    bat1: true,
    bat2: true,
    alt1: true,
    alt2: true,
    avionics: true,
    fail: { alt1: false, alt2: false, bat1: false },
    tBat: 0,
  },
  cb: {},
  fuel: { sel: "L", boost: false, qL: 24, qR: 22 },
  flaps: { cmd: 0 },
  ctrl: { pitch: 0, roll: 0, yaw: 0 },
  gear: { diff: 0, park: false },
  env: { fan: 1, temp: 0.35, vent: "PF", ac: false, recirc: false },
  pitot: { heat: true, oat: 8, heaterFail: false, alt: false },
  stall: { aoa: 6, fault: false },
  lights: { cabin: "AUTO", door: false, unlocked: false, bag: false, nav: true, strobe: true, land: false, ice: false },
  avx: { backup: false, pfdFail: false, dualAdahrs: true, ahrs1Fail: false, ahrs2Fail: false },
  capsOn: false,
};

/** Fast-changing values advanced every frame; kept out of React state on purpose. */
export const live = {
  rpm: 2500,
  flapAng: 0,
  capsT: -1,
  capsPlaying: false,
  startTimer: 0,
  crankT: 0,
  starve: 0,
};

export type BusId =
  "mdb1" | "mdb2" | "edb" | "ess1" | "ess2" | "main1" | "main2" | "main3" | "nonEss" | "ac1" | "ac2" | "avx" | "conv";

export interface Elec extends Record<BusId, number> {
  alt1: boolean;
  alt2: boolean;
  bat1ok: boolean;
  bat2ok: boolean;
  bat1Dead: boolean;
  bat2Dead: boolean;
  bat1Charging: boolean;
  bat2Charging: boolean;
  bat2Supplying: boolean;
  a1: number;
  a2: number;
  b1: number;
  pfd: boolean;
  mfd: boolean;
  stby: boolean;
  /** Optional second GSU 75 has a separate supply; neither unit powers the independent MD302 (POH 7-72, 7-76). */
  ahrs1: boolean;
  ahrs2: boolean;
  flapsPwr: boolean;
  pitotPwr: boolean;
  stallPwr: boolean;
  boostPwr: boolean;
  starterPwr: boolean;
  pitchTrim: boolean;
  rollTrim: boolean;
  navPwr: boolean;
  strobePwr: boolean;
  landPwr: boolean;
  icePwr: boolean;
  eisPwr: boolean;
  convPwr: boolean;
  /** Display cooling fans: AVIONICS FAN 1 cools the MFD, AVIONICS FAN 2 the PFD (POH 3A-15). */
  fan1: boolean;
  fan2: boolean;
}

/**
 * Electrical solver (POH 7-49 – 7-53, Figure 7-10 Electrical System Schematic).
 * Diode-ORed distribution buses in the MCU; CB-panel buses hang off them. Pulled breakers
 * remove individual loads. Battery endurance uses the Costanzo training deck's rule of thumb:
 * ALT 1 fail → BAT 1 carries MDB 1 ~30 min; dual ALT fail → BAT 1 ~15 min, then BAT 2 ~45 min.
 */
export function solve(s: Sim): Elec {
  const e = s.elec,
    run = s.eng.running,
    t = e.tBat;
  const cb = (name: string) => !s.cb[name];
  const alt1 = run && e.alt1 && !e.fail.alt1 && e.bat1 && cb("ALT 1"); // ALT 1 field needs BAT 1 on
  const alt2 = run && e.alt2 && !e.fail.alt2 && (e.bat1 || e.bat2) && cb("ALT 2"); // ALT 2 field from ESS BUS 2
  const bat1Life = alt2 ? 30 : 15;
  // time on batteries counts whether or not the engine turns (stopping it must not bring a flat battery back)
  const bat1Dead = e.fail.bat1 || (!alt1 && t >= bat1Life);
  const bat2Dead = !alt1 && !alt2 && t >= 60;
  const bat1ok = e.bat1 && !bat1Dead;
  const bat2ok = e.bat2 && !bat2Dead && cb("BAT 2");
  const D = 0.7; // diode drop
  const mdb1 = Math.max(alt1 ? 27.7 : 0, bat1ok ? 24.3 : 0);
  const mdb2 = Math.max(alt2 ? 28.7 : 0, mdb1 ? mdb1 - D : 0); // MDB1 → MDB2 only
  // Ess Dist Bus: diode-fed from MDB 1, from BAT 1 ahead of its 125 A fuse (the same voltage as MDB 1 here) and from MDB 2.
  // ESS BUS 2 hangs straight off it; ESS BUS 1 through the ESSENTIAL POWER breaker, and BAT 2 joins ESS BUS 1 through the
  // BAT 2 breaker, so with the alternators and BAT 1 gone BAT 2 feeds the Ess Dist Bus and ESS BUS 2 back through
  // ESSENTIAL POWER (POH 7-52, Fig 7-10)
  const bat2v = bat2ok ? 24.2 : 0,
    essPwr = cb("ESSENTIAL POWER");
  const edbIn = Math.max(mdb1, mdb2) ? Math.max(mdb1, mdb2) - D : 0;
  const edb = Math.max(edbIn, essPwr ? bat2v : 0);
  const ess1 = Math.max(essPwr ? edb : 0, bat2v),
    ess2 = edb;
  const r = (v: number) => Math.round(v * 10) / 10;
  const buses: Record<BusId, number> = {
    mdb1: r(mdb1),
    mdb2: r(mdb2),
    edb: r(edb),
    ess1: r(ess1),
    ess2: r(ess2),
    main1: r(mdb2),
    main2: r(mdb2),
    nonEss: r(mdb2),
    main3: r(mdb1),
    ac1: r(mdb1),
    ac2: r(mdb1),
    avx: e.avionics && mdb2 && cb("AVIONICS") ? r(mdb2) : 0,
    conv: bat1Dead ? 0 : 24.4,
  };
  const pw = (bus: BusId, name: string) => buses[bus] > 0 && cb(name);
  return {
    ...buses,
    alt1,
    alt2,
    bat1ok,
    bat2ok,
    bat1Dead,
    bat2Dead,
    bat1Charging: bat1ok && mdb1 > 26,
    // BAT 2 is charged from ESS BUS 1 (POH 7-49)
    bat2Charging: bat2ok && ess1 > 26,
    bat2Supplying: bat2ok && ess1 < 26,
    // illustrative currents (normal readout from the training deck: ALT1 +23, ALT2 +13, BAT1 +1)
    a1: alt1 ? (alt2 ? 23 : 36) : 0,
    a2: alt2 ? (alt1 ? 13 : 22) : 0,
    b1: !bat1ok ? 0 : alt1 ? 1 : alt2 ? -14 : -36,
    pfd: !s.avx.pfdFail && (pw("ess1", "PFD A") || pw("main2", "PFD B")),
    mfd: pw("main3", "MFD A") || pw("main1", "MFD B"),
    stby: pw("ess1", "STDBY ATTD A") || pw("main1", "STDBY ATTD B"),
    ahrs1: pw("ess1", "ADAHRS 1") && !s.avx.ahrs1Fail,
    ahrs2: s.avx.dualAdahrs && pw("main2", "ADAHRS 2") && !s.avx.ahrs2Fail,
    flapsPwr: pw("nonEss", "FLAPS"),
    pitotPwr: pw("nonEss", "PITOT HEAT"),
    stallPwr: pw("ess2", "STALL WARNING"),
    boostPwr: pw("main2", "FUEL PUMP"),
    starterPwr: pw("nonEss", "STARTER") && bat1ok,
    pitchTrim: pw("ess2", "PITCH TRIM"),
    rollTrim: pw("ess2", "ROLL TRIM"),
    navPwr: pw("nonEss", "NAV LIGHTS"),
    strobePwr: pw("nonEss", "STROBE LIGHTS"),
    // landing light: Main Dist Bus 1 (POH 7-48), breaker on MAIN BUS 3; ice lights on MAIN BUS 1 (Figs 7-10, 7-11)
    landPwr: pw("main3", "LANDING LIGHTS"),
    icePwr: pw("main1", "ICE LIGHTS"),
    eisPwr: pw("ess2", "ENGINE INSTR"),
    convPwr: buses.conv > 0 && cb("CONV LIGHTS"),
    fan1: pw("nonEss", "AVIONICS FAN 1"),
    fan2: pw("main2", "AVIONICS FAN 2"),
  };
}

export const fuelAvail = (s: Sim) => s.fuel.sel !== "OFF" && (s.fuel.sel === "L" ? s.fuel.qL : s.fuel.qR) > 0.05;
/** Pilot-operated alternate induction air bypasses a blocked paper filter (POH 7-34, 7-39). */
export const inductionAvailable = (s: Sim) => !s.eng.filterBlocked || s.eng.altAir;
export const mapInHg = (s: Sim, rpm: number) =>
  rpm < 200 ? 29.9 : +(11.5 + s.eng.lever * 17.8 - (s.eng.altAir ? 0.6 : 0)).toFixed(1);
export const bladeAngle = (s: Sim) => 14 + s.eng.lever * 20;

export function cabinLit(s: Sim, E: Elec) {
  const L = s.lights,
    off = { dome: false, foot: false, step: false, bag: false };
  if (!E.convPwr || L.cabin === "OFF") return off;
  const trig = L.door || L.unlocked;
  if (L.cabin === "ON") return { dome: true, foot: true, step: trig, bag: L.bag };
  return { dome: trig, foot: trig, step: trig, bag: L.bag };
}

/** Exterior lights actually lit: bolster switch AND breaker/bus power. */
export function extLit(s: Sim, E: Elec) {
  const L = s.lights;
  return { nav: L.nav && E.navPwr, strobe: L.strobe && E.strobePwr, land: L.land && E.landPwr, ice: L.ice && E.icePwr };
}

export type { CasLevel };
/**
 * Crew Alerting System messages, named as in POH Sections 3 and 3A (and the Pilot's Guide CAS lists), for the conditions the
 * model simulates. Fuel: FUEL LOW LEFT / RIGHT below 1 gal in that tank (3-24); FUEL LOW TOTAL warning below 7 gal (3-25),
 * caution at 10 gal or less (3A-10); FUEL IMBALANCE warning / caution / advisory above 9.5 / 7.5 / 5.5 gal (3-25, 3A-10, 3A-11).
 * An alternator failure gives ALT n plus the bus caution (3A-13); AVIONICS OFF when the AVIONICS switch is off (3A-14); PFD FAN
 * FAIL / MFD FAN FAIL when a displayed screen's cooling fan (AVIONICS FAN 2 / FAN 1) has no power (3A-15). BATT 1 (battery 1
 * discharging while ALT 1 works, an MCU fault, 3A-12) has no counterpart in the model, so it isn't raised.
 */
export function casMessages(s: Sim, E: Elec): [CasLevel, string][] {
  const m: [CasLevel, string][] = [],
    f = s.fuel,
    tot = f.qL + f.qR,
    imb = Math.abs(f.qL - f.qR);
  const imbalance: CasLevel | null = imb > 9.5 ? "w" : imb > 7.5 ? "c" : imb > 5.5 ? "a" : null;
  if (s.stall.aoa >= 14 && !s.stall.fault && E.stallPwr) m.push(["w", "STALL"]);
  if (E.ess1 < 24.5) m.push(["w", "ESS BUS"]);
  if (f.qL < 1) m.push(["w", "FUEL LOW LEFT"]);
  if (f.qR < 1) m.push(["w", "FUEL LOW RIGHT"]);
  if (tot < 7) m.push(["w", "FUEL LOW TOTAL"]);
  if (E.mdb1 < 24.5) m.push(["c", "M BUS 1"]);
  if (E.mdb2 < 24.5) m.push(["c", "M BUS 2"]);
  if (s.eng.running && !E.alt1) m.push(["c", "ALT 1"]);
  if (s.eng.running && !E.alt2) m.push(["c", "ALT 2"]);
  if (tot >= 7 && tot <= 10) m.push(["c", "FUEL LOW TOTAL"]);
  if (imbalance) m.push([imbalance, "FUEL IMBALANCE"]);
  if (s.pitot.heat && (s.pitot.heaterFail || !E.pitotPwr)) m.push(["c", "PITOT HEAT FAIL"]);
  if (!s.pitot.heat && s.pitot.oat < 5) m.push(["c", "PITOT HEAT REQD"]);
  if (s.stall.fault) m.push(["c", "STALL WARN FAIL"]);
  if (s.gear.park) m.push(["c", "PARK BRAKE"]);
  if (!s.elec.avionics) m.push(["c", "AVIONICS OFF"]); // 3A-14
  if (E.pfd && !E.fan2) m.push(["a", "PFD FAN FAIL"]); // 3A-15
  if (E.mfd && !E.fan1) m.push(["a", "MFD FAN FAIL"]);
  return m;
}

/** Circuit-breaker buses as shown on the panel: [bus, label, source, loads]. */
export const BUSES: [BusId, string, string, [string, number?][]][] = [
  [
    "ess1",
    "ESS BUS 1",
    "Ess Dist Bus via ESSENTIAL POWER · BAT 2",
    [
      ["ESSENTIAL POWER"],
      ["PFD A", 5],
      ["ADAHRS 1", 5],
      ["COM 1", 7.5],
      ["GPS NAV GIA 1", 5],
      ["STDBY ATTD A", 5],
      ["BAT 2", 20],
    ],
  ],
  [
    "ess2",
    "ESS BUS 2",
    "Ess Dist Bus (BAT 2 through ESS BUS 1)",
    [
      ["PITCH TRIM", 2],
      ["ROLL TRIM", 2],
      ["STALL WARNING", 2],
      ["ENGINE INSTR", 3],
      ["ALT 2", 5],
    ],
  ],
  [
    "main1",
    "MAIN BUS 1",
    "Main Dist Bus 2",
    [
      ["ICE LIGHTS"],
      ["MFD B", 5],
      ["STDBY ATTD B", 5],
      ["KEYPADS / AP CTRL", 5],
      ["CABIN LIGHTS", 5],
      ["CABIN AIR CONTROL", 2],
      ["FUEL QTY", 5],
      ["AP SERVOS"],
      ["AVIONICS", 10],
    ],
  ],
  [
    "main2",
    "MAIN BUS 2",
    "Main Dist Bus 2",
    [
      ["PFD B", 5],
      ["FUEL PUMP", 5],
      ["COM 2", 7.5],
      ["GPS NAV GIA 2", 5],
      ["ADAHRS 2", 5],
      ["AVIONICS FAN 2", 5],
    ],
  ],
  [
    "nonEss",
    "NON ESS BUS",
    "Main Dist Bus 2",
    [["FLAPS", 10], ["PITOT HEAT", 7.5], ["STARTER", 2], ["AVIONICS FAN 1", 5], ["NAV LIGHTS"], ["STROBE LIGHTS"]],
  ],
  [
    "avx",
    "AVIONICS BUS",
    "MAIN BUS 1 via AVIONICS switch",
    [
      ["AUDIO PANEL", 5],
      ["XPONDER", 2],
      ["DATA LINK/WX", 5],
      ["TRAFFIC", 5],
      ["DME/ADF", 3],
    ],
  ],
  ["main3", "MAIN BUS 3", "Main Dist Bus 1", [["LANDING LIGHTS"], ["MFD A", 5], ["12V & USB", 5], ["EVS CAMERA", 5]]],
  [
    "ac1",
    "A/C BUS 1",
    "Main Dist Bus 1",
    [
      ["ALT 1", 5],
      ["A/C COND", 15],
    ],
  ],
  [
    "ac2",
    "A/C BUS 2",
    "Main Dist Bus 1",
    [
      ["CABIN FAN", 15],
      ["A/C COMPR", 5],
    ],
  ],
  ["conv", "CONV BUS", "BAT 1 direct, 5 A fuse", [["CONV LIGHTS", 5]]],
];
