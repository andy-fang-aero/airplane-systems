/**
 * SR22T G6 electrical system and its CAS / lighting logic (`aircraft/sr22t/model.ts`), sourced from
 * SR22T POH 13772-007 7-47 – 7-54, Figure 7-10 on 7-48 and Figure 7-11 on 7-52, plus SR22T flap detents and powered
 * motor travel (SR22T POH 7-22 – 7-23).
 * Two alternators and two batteries feed diode-ORed distribution buses in the MCU; the CB-panel buses hang off those.
 * Engine and fuel tests follow SR22T POH 13772-007 Sections 3, 3A and 7 and cite each tested value.
 * The airframe tests check the SR22T POH values that differ from the SR20 (SR22T POH 13772-007 7-5, 7-40).
 * The CAPS tests at the end check the SR22T deployment timeline (POH 13772-007 7-97) and the harness against POH 7-96 and
 * AMM 13773-002 Rev 7 95-00 / Fig 95-00-1 (PDF p. 2853).
 * Flight-control tests follow SR22T POH 13772-007 Sections 2, 3, 4 and 7 (and AMM 13773-002 Rev 7 where the POH gives
 * no value) and cite each tested value.
 */
import { Box3, Vector3, type BufferAttribute } from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SR22T } from "@/aircraft/sr22t";
import { eisGauges, pctPower, pfdData, pfdSpeeds, SPEEDS, standbyBands } from "@/aircraft/sr22t/displays";
import { inFus, topY } from "@/aircraft/sr22t/geometry";
import { AIR_BOX, COMPRESSOR_INLET, COMPRESSOR_OUTLET } from "@/aircraft/sr22t/turbo-layout";
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import {
  above12k5,
  bladeAngle,
  FLAP_DEG,
  busTable,
  cabinLit,
  casMessages,
  extLit,
  flapPositionLit,
  iceLightBreaker,
  initialSim,
  initialSimFor,
  live,
  manPressureCas,
  mapInHg,
  overboostMayLift,
  oxyDisplay,
  oxygenCas,
  pumpSpeed,
  rpmTarget,
  rpmWarning,
  RPM_WARNING_STEPS,
  solve,
  titState,
  wastegateOpen,
  wastegateReading,
  type BusId,
  type Equip,
  type Sim,
} from "@/aircraft/sr22t/model";
import { CAT } from "@/aircraft/sr22t/parts/catalogue";
import { HEAT_X, INTERCOOLER_AFT } from "@/aircraft/sr22t/parts";
import { OXY_SCENARIOS, useSR22T } from "@/aircraft/sr22t/store";
import { simTick } from "@/aircraft/sr22t/tick";
import { capsPhase } from "@/aircraft/sr22t/Parachute";
import { AB, DOOR_SEAM, FW, WIN, onSkin } from "@/aircraft/sr22t/geometry";
import { HARNESS, STRAP_R, fwdStrap } from "@/aircraft/sr22t/parts/caps";
import { SYS } from "@/aircraft/sr22t/systems";
import { rigPose, SURF_TRAVEL } from "@/aircraft/sr22t/rig";
import { patched, type Patch } from "./helpers";

const sim = (p: Patch<Sim> = {}) => patched(initialSim, p);
const E = (p: Patch<Sim> = {}) => solve(sim(p));
const cas = (p: Patch<Sim> = {}) => casMessages(sim(p), E(p));
const texts = (p: Patch<Sim> = {}) => cas(p).map(([, t]) => t);
const lights = (p: Patch<Sim>) => ({ ext: extLit(sim(p), E(p)), cabin: cabinLit(sim(p), E(p)) });

const ALT1_FAIL: Patch<Sim> = { elec: { fail: { alt1: true } } };
const DUAL_ALT_FAIL = (tBat: number): Patch<Sim> => ({ elec: { fail: { alt1: true, alt2: true }, tBat } });

describe("SR22T electrical solve", () => {
  it("normal: both alternators on line, every bus powered, both batteries charging, no CAS", () => {
    const e = E();
    expect(e.alt1 && e.alt2).toBe(true);
    const buses = [
      "mdb1",
      "mdb2",
      "edb",
      "ess1",
      "ess2",
      "main1",
      "main2",
      "main3",
      "nonEss",
      "ac1",
      "ac2",
      "avx",
    ] as const;
    for (const bus of buses) expect(e[bus], bus).toBeGreaterThan(24.5);
    expect(e.conv).toBeGreaterThan(0);
    expect(e.bat1Charging && e.bat2Charging).toBe(true);
    expect(e.pfd && e.mfd && e.stby).toBe(true);
    expect(cas()).toEqual([]);
  });

  it("ALT 1's field needs BAT 1 on; ALT 2 keeps MDB 2 and the essential buses up", () => {
    const p: Patch<Sim> = { elec: { bat1: false } },
      e = E(p);
    expect(e.alt1).toBe(false);
    expect(e.alt2).toBe(true);
    expect(e.mdb1).toBe(0);
    expect(e.ess1).toBeGreaterThan(24.5);
    // the MFD is dual-fed: MFD A on MAIN BUS 3 (MDB 1) is dead, MFD B on MAIN BUS 1 (MDB 2) keeps it lit
    expect(e.main3).toBe(0);
    expect(e.mfd).toBe(true);
    expect(cas(p)).toEqual(
      expect.arrayContaining([
        ["c", "M BUS 1"],
        ["c", "ALT 1"],
      ]),
    );
  });

  it("diodes pass MDB 1 → MDB 2 only: ALT 2 never back-feeds MDB 1", () => {
    const e = E(ALT1_FAIL);
    expect(e.mdb1).toBeGreaterThan(0); // BAT 1 alone
    expect(e.mdb2).toBeGreaterThan(e.mdb1); // ALT 2, not pulled down to battery voltage
    expect(e.b1).toBeLessThan(0); // BAT 1 discharging
    for (const bus of ["main3", "ac1", "ac2"] as const) expect(e[bus]).toBe(24.3);
    expect(texts(ALT1_FAIL)).toEqual(expect.arrayContaining(["ALT 1", "M BUS 1"]));
    // ALT 2 failed instead: MDB 2 is fed from MDB 1 through the diode (one diode drop lower)
    const e2 = E({ elec: { fail: { alt2: true } } });
    expect(e2.mdb2).toBeGreaterThan(0);
    expect(e2.mdb2).toBeLessThan(e2.mdb1);
  });

  it("ALT 1 regulates to 28 V and ALT 2 to 28.75 V, separating the buses (POH 7-47, 7-49)", () => {
    expect(E().mdb1).toBe(28);
    expect(E().mdb2).toBe(28.75);
    expect(E().mdb2).toBeGreaterThan(E().mdb1);
  });

  it("BAT 1 has no published timer: it feeds the Ess Dist Bus after both alternators fail (POH 7-50)", () => {
    const e = E(DUAL_ALT_FAIL(75));
    expect(e.bat1Dead).toBe(false);
    expect(e.mdb1).toBe(24.3);
    expect(e.edb).toBeGreaterThan(0);
    expect(e.bat2Dead).toBe(false);
    expect(E({ eng: { running: false }, elec: { tBat: 75 } }).bat1Dead).toBe(false);
  });

  it("BAT 2 alone powers only ESS BUS 1 / 2 for approximately 30 minutes (POH 7-53, 3-17)", () => {
    const at = (tBat: number) => E({ elec: { bat1: false, alt1: false, alt2: false, tBat } });
    const e = at(29);
    expect(e.ess1).toBeGreaterThan(0);
    expect(e.ess2).toBeGreaterThan(0);
    expect(e.pfd).toBe(true);
    for (const bus of ["mdb1", "mdb2", "main1", "main2", "main3", "nonEss", "ac1", "ac2", "avx"] as const)
      expect(e[bus], bus).toBe(0);
    expect(at(31).ess1 + at(31).ess2).toBe(0);
    expect(at(31).pfd).toBe(false);
    const failed = E({ elec: { fail: { alt1: true, alt2: true, bat1: true }, tBat: 29 } });
    expect(failed.bat2Supplying).toBe(true);
    expect(failed.ess1).toBeGreaterThan(0);
  });

  it("ALT 2 starts from either battery; neither battery prevents excitation (POH 7-53)", () => {
    expect(E({ elec: { bat1: true, bat2: false } }).alt2).toBe(true);
    expect(E({ elec: { bat1: false, bat2: true } }).alt2).toBe(true);
    expect(E({ elec: { bat1: false, bat2: false } }).alt2).toBe(false);
  });

  it("with ESSENTIAL POWER pulled, BAT 2 still feeds ESS BUS 1 but no longer ESS BUS 2", () => {
    const e = E({ elec: { fail: { alt1: true, alt2: true, bat1: true }, tBat: 20 }, cb: { "ESSENTIAL POWER": true } });
    expect(e.ess1).toBeGreaterThan(0);
    expect(e.ess2).toBe(0);
    expect(e.stallPwr).toBe(false);
  });

  it("pulled breakers remove individual loads; dual-fed units need both breakers out", () => {
    expect(E({ cb: { "PFD A": true } }).pfd).toBe(true);
    expect(E({ cb: { "PFD A": true, "PFD B": true } }).pfd).toBe(false);
    expect(E({ cb: { FLAPS: true } }).flapsPwr).toBe(false);
    expect(E({ cb: { AVIONICS: true } }).avx).toBe(0);
    expect(E({ cb: { "ALT 1": true } }).alt1).toBe(false);
  });
});

describe("SR22T CAS messages", () => {
  it("low-bus warnings / cautions and alternator-loss cautions (POH 2-11, 3-39, 3A-13 to 3A-16)", () => {
    expect(cas(DUAL_ALT_FAIL(0))).toEqual(
      expect.arrayContaining([
        ["w", "ESS BUS"],
        ["c", "M BUS 1"],
        ["c", "M BUS 2"],
        ["c", "ALT 1"],
        ["c", "ALT 2"],
      ]),
    );
    const s = sim();
    const e = solve(s);
    for (const [volts, alert] of [
      ["ess1", "ESS BUS"],
      ["mdb1", "M BUS 1"],
      ["mdb2", "M BUS 2"],
    ] as const) {
      expect(casMessages(s, { ...e, [volts]: 24.5 }).map(([, t]) => t)).not.toContain(alert);
      expect(casMessages(s, { ...e, [volts]: 24.4 }).map(([, t]) => t)).toContain(alert);
    }
  });

  it("PARK BRAKE caution follows the PARK BRAKE handle (POH 3A-27)", () => {
    expect(cas({ gear: { park: true } })).toContainEqual(["c", "PARK BRAKE"]);
    expect(cas({ gear: { park: false } })).not.toContainEqual(["c", "PARK BRAKE"]);
  });

  it("AVIONICS OFF when the AVIONICS switch is off (POH 3A-16), and the avionics bus drops", () => {
    expect(E({ elec: { avionics: false } }).avx).toBe(0);
    expect(cas({ elec: { avionics: false } })).toContainEqual(["c", "AVIONICS OFF"]);
  });

  it("PFD FAN FAIL / MFD FAN FAIL advisories when a lit display's cooling fan loses power (POH 3A-17, 7-90)", () => {
    expect(cas({ cb: { "AVIONICS FAN 2": true } })).toContainEqual(["a", "PFD FAN FAIL"]);
    expect(cas({ cb: { "AVIONICS FAN 1": true } })).toContainEqual(["a", "MFD FAN FAIL"]);
  });

  it("FUEL LOW LEFT / FUEL LOW RIGHT below 1 gal in that tank (POH 3-34)", () => {
    expect(cas({ fuel: { qL: 0.9 } })).toContainEqual(["w", "FUEL LOW LEFT"]);
    expect(cas({ fuel: { qR: 0.9 } })).toContainEqual(["w", "FUEL LOW RIGHT"]);
    expect(texts({ fuel: { qL: 1, qR: 1 } })).not.toContain("FUEL LOW LEFT");
    expect(texts({ fuel: { qL: 1, qR: 1 } })).not.toContain("FUEL LOW RIGHT");
  });

  it("FUEL LOW TOTAL caution at 14 gal or less, warning below 9 (POH 3-35, 3A-12)", () => {
    expect(cas({ fuel: { qL: 7, qR: 7 } })).toContainEqual(["c", "FUEL LOW TOTAL"]);
    expect(cas({ fuel: { qL: 4.5, qR: 4.5 } })).toContainEqual(["c", "FUEL LOW TOTAL"]);
    expect(cas({ fuel: { qL: 4.5, qR: 4.4 } })).toContainEqual(["w", "FUEL LOW TOTAL"]);
    expect(texts({ fuel: { qL: 8, qR: 7 } })).not.toContain("FUEL LOW TOTAL");
  });

  it("FUEL IMBALANCE advisory above 8, caution above 10, warning above 12 gal (POH 3-35, 3A-12, 3A-13)", () => {
    const level = (diff: number) =>
      cas({ fuel: { qL: 20 + diff, qR: 20 } }).find(([, t]) => t === "FUEL IMBALANCE")?.[0];
    expect(level(8)).toBeUndefined();
    expect(level(9)).toBe("a");
    expect(level(10)).toBe("a");
    expect(level(11)).toBe("c");
    expect(level(12)).toBe("c");
    expect(level(13)).toBe("w");
  });

  it.each([true, false])(
    "STALL warning needs the 2-amp STALL WARNING breaker on ESS BUS 2 (POH 7-68), FIKI=%s",
    (fiki) => {
      expect(breakers({ fiki }).get("ess2: STALL WARNING")).toBe(2);
      expect(cas({ equip: { fiki }, stall: { aoa: 15 } })).toContainEqual(["w", "STALL"]);
      expect(cas({ equip: { fiki }, stall: { aoa: 15 }, cb: { "STALL WARNING": true } })).not.toContainEqual([
        "w",
        "STALL",
      ]);
    },
  );

  it("STALL WARN FAIL mutes the stall warning until the fault clears (POH 7-68)", () => {
    for (const fiki of [true, false]) {
      const p = { equip: { fiki }, stall: { fault: true, aoa: 15 } };
      expect(cas(p)).toContainEqual(["c", "STALL WARN FAIL"]);
      expect(cas(p)).not.toContainEqual(["w", "STALL"]);
      expect(cas({ ...p, stall: { fault: false, aoa: 15 } })).toContainEqual(["w", "STALL"]);
      expect(cas({ ...p, stall: { fault: false, aoa: 15 } })).not.toContainEqual(["c", "STALL WARN FAIL"]);
    }
  });

  it("PITOT HEAT FAIL when the switch is ON and the heater draws no current (POH 7-69, 3A-20)", () => {
    expect(cas({ pitot: { heaterFail: true } })).toContainEqual(["c", "PITOT HEAT FAIL"]);
    expect(cas({ cb: { "PITOT HEAT": true } })).toContainEqual(["c", "PITOT HEAT FAIL"]);
    expect(cas({ pitot: { heat: false, heaterFail: true } })).not.toContainEqual(["c", "PITOT HEAT FAIL"]);
    expect(cas({ pitot: { heat: false }, cb: { "PITOT HEAT": true } })).not.toContainEqual(["c", "PITOT HEAT FAIL"]);
  });

  it("PITOT HEAT REQD below 41 °F (5 °C) with the switch OFF (POH 7-69)", () => {
    expect(cas({ pitot: { heat: false, oat: 4 } })).toContainEqual(["c", "PITOT HEAT REQD"]);
    expect(cas({ pitot: { heat: false, oat: 5 } })).not.toContainEqual(["c", "PITOT HEAT REQD"]);
    expect(cas({ pitot: { heat: true, oat: 4 } })).not.toContainEqual(["c", "PITOT HEAT REQD"]);
  });
});

describe("SR22T lights", () => {
  it("LAND lights the cowl HID landing light from Main Dist Bus 1 and the wingtip recognition lights through LANDING LIGHTS (POH 7-57)", () => {
    expect(lights({}).ext).toMatchObject({ land: false, recog: false });
    expect(lights({ lights: { land: true } }).ext).toMatchObject({ land: true, recog: true });
    // the cowl light has no CB-panel breaker (7.5 A fuse on Main Dist Bus 1 in the MCU); LANDING LIGHTS feeds the recognition lights
    expect(lights({ lights: { land: true }, cb: { "LANDING LIGHTS": true } }).ext).toMatchObject({
      land: true,
      recog: false,
    });
    // BAT 1 off takes ALT 1 with it: Main Dist Bus 1 and MAIN BUS 3 are dead
    expect(lights({ lights: { land: true }, elec: { bat1: false } }).ext).toMatchObject({ land: false, recog: false });
    // after an ALT 1 failure BAT 1 still holds Main Dist Bus 1
    expect(lights({ lights: { land: true }, ...ALT1_FAIL }).ext).toMatchObject({ land: true, recog: true });
  });

  it("nav and strobe lights need their switch and their 5 A NON ESS BUS breaker (POH 7-57)", () => {
    expect(lights({}).ext).toMatchObject({ nav: true, strobe: true });
    expect(lights({ lights: { nav: false, strobe: false } }).ext).toMatchObject({ nav: false, strobe: false });
    expect(lights({ cb: { "NAV LIGHTS": true } }).ext).toMatchObject({ nav: false, strobe: true });
    expect(lights({ cb: { "STROBE LIGHTS": true } }).ext).toMatchObject({ nav: true, strobe: false });
    const nonEss = Object.fromEntries(busOf({ fiki: true }, "nonEss"));
    expect([nonEss["NAV LIGHTS"], nonEss["STROBE LIGHTS"]]).toEqual([5, 5]);
  });

  it("LANDING LIGHTS is a 15 A breaker on MAIN BUS 3 (POH 7-57)", () => {
    expect(Object.fromEntries(busOf({ fiki: true }, "main3"))["LANDING LIGHTS"]).toBe(15);
  });

  it("convenience lighting follows the cabin light switch, doors and key fob (POH 7-60)", () => {
    expect(lights({}).cabin).toEqual({ dome: false, foot: false, step: false, bag: false });
    expect(lights({ lights: { door: true } }).cabin).toMatchObject({ dome: true, foot: true, step: true });
    expect(lights({ lights: { cabin: "ON" } }).cabin).toMatchObject({ dome: true, foot: true, step: false });
    expect(lights({ lights: { cabin: "OFF", door: true } }).cabin.dome).toBe(false);
    expect(lights({ lights: { cabin: "ON" }, cb: { "CONV LIGHTS": true } }).cabin.dome).toBe(false);
  });

  it("ice inspection lights need the ICE switch and their MAIN BUS 1 breaker — ICE PROTECT 1 with FIKI, ICE LIGHTS without (AMM 30-80, 33-40)", () => {
    for (const fiki of [true, false]) {
      const own = fiki ? "ICE PROTECT 1" : "ICE LIGHTS",
        other = fiki ? "ICE LIGHTS" : "ICE PROTECT 1";
      const ice = (p: Patch<Sim>) => lights({ equip: { fiki }, ...p }).ext.ice;
      expect(ice({ lights: { ice: false } }), `fiki ${fiki}, switch off`).toBe(false);
      expect(ice({ lights: { ice: true } }), `fiki ${fiki}, switch on`).toBe(true);
      expect(ice({ lights: { ice: true }, cb: { [own]: true } }), `fiki ${fiki}, ${own} pulled`).toBe(false);
      expect(ice({ lights: { ice: true }, cb: { [other]: true } }), `fiki ${fiki}, ${other} pulled`).toBe(true);
    }
  });
});

describe("SR22T airframe", () => {
  it("each SR22T wing tank holds 47.25 gal, 46 usable (POH 7-5, 7-40)", () => {
    for (const name of ["Right wing", "Left wing"]) {
      const note = CAT.shells.find((s) => s.name === name)!.note;
      expect(note, name).toContain("47.25 gal");
      expect(note, name).toContain("46 gal usable");
      expect(note, name).not.toContain("29.3");
    }
  });

  it("the Airframe panel's Each wing fact is the 47.25 gal tank (POH 7-5)", () => {
    const eachWing = fact(renderToStaticMarkup(createElement(SR22T.panels.airframe!)), "Each wing");
    expect(eachWing).toContain("47.25 gal");
    expect(eachWing).not.toContain("29.3");
  });
});

describe("SR22T wing flap strings", () => {
  // the SR22T detents (POH 7-22), not the SR20's 32° full flap
  const DETENTS = ["50% (16°)", "100% (35.5°)"];

  it("the Wing flaps Positions fact and the Overview Flaps row give the POH 7-22 detents", () => {
    const positions = fact(renderToStaticMarkup(createElement(SR22T.panels.flaps!)), "Positions");
    const overview = fact(renderToStaticMarkup(createElement(SR22T.panels.overview!)), "Flaps");
    for (const [row, text] of [
      ["Positions", positions],
      ["Overview Flaps", overview],
    ]) {
      for (const detent of DETENTS) expect(text, row).toContain(detent);
      expect(text, row).toContain("(POH 7-22)");
      expect(text, row).not.toContain("32°");
    }
  });

  it("the flap, hinge and rub-strip notes give the POH 7-22 detents and hardware", () => {
    for (const name of ["Right flap", "Left flap"]) {
      const note = CAT.surfaces.find((s) => s.name === name)!.note;
      for (const detent of DETENTS) expect(note, name).toContain(detent);
      expect(note, name).toContain("three hinges");
      expect(note, name).not.toContain("32°");
    }
    const brackets = CAT.parts.filter((p) => p.name === "Flap hinge bracket").map((p) => p.note!);
    expect(brackets.length).toBeGreaterThan(0);
    for (const note of brackets) expect(note).toContain("the line through the three bolts (POH 7-22)");
    expect(
      brackets.filter((note) =>
        note.includes("Rub strips on the flap's top leading edge keep it off the flap cove (POH 7-22)"),
      ).length,
    ).toBeGreaterThan(0);
  });
});

/** The text of a panel Facts row (`<dt>key</dt><dd>value</dd>`), or undefined when the panel has no such row. */
const fact = (html: string, key: string) => html.match(new RegExp(`<dt>${key}</dt><dd>(.*?)</dd>`))?.[1];

it("the Engine panel displays both yellow oil-pressure bands and green/red limits (POH 13772-007 2-9)", () => {
  const oilPressure = fact(renderToStaticMarkup(createElement(SR22T.panels.engine!)), "Oil pressure");
  expect(oilPressure).toBe("30–60 psi green · 10–30 / 60–100 yellow · &lt; 10 / &gt; 100 red");
});

/** Every breaker on the panel for `equip`, as "BUS: LABEL" → amps (undefined where unrated). */
const breakers = (equip: Equip) =>
  new Map(busTable(equip).flatMap(([bus, , , loads]) => loads.map(([n, a]) => [`${bus}: ${n}`, a] as const)));
const busOf = (equip: Equip, id: BusId) => busTable(equip).find(([b]) => b === id)![3];
const ICE_BREAKERS = ["ICE PROTECT 1", "ICE PROTECT 2", "STALL VANE HEAT", "ICE LIGHTS"];
const iceRows = (equip: Equip) => [...breakers(equip)].filter(([k]) => ICE_BREAKERS.some((n) => k.endsWith(": " + n)));

describe("SR22T FIKI option", () => {
  it("The modelled airplane has FIKI: the model starts with ice protection installed (operator decision)", () => {
    expect(initialSim.equip.fiki).toBe(true);
  });

  it("FIKI panel: ICE PROTECT 1 7.5 A on MAIN BUS 1, ICE PROTECT 2 5 A on ESS BUS 2, STALL VANE HEAT on NON ESS BUS, no ICE LIGHTS (POH 7-48, 7-52; AMM 30-00)", () => {
    const fiki = { fiki: true };
    expect(iceRows(fiki)).toEqual([
      ["ess2: ICE PROTECT 2", 5],
      ["main1: ICE PROTECT 1", 7.5],
      ["nonEss: STALL VANE HEAT", undefined],
    ]);
    // ICE PROTECT 2 heads its column
    expect(busOf(fiki, "ess2")[0]).toEqual(["ICE PROTECT 2", 5]);
  });

  it("non-FIKI panel: ICE LIGHTS 5 A on MAIN BUS 1, no ICE PROTECT 1/2 or STALL VANE HEAT (AMM 30-80; the SR22T POH has no ice-light rating, so the AMM is the only source)", () => {
    expect(iceRows({ fiki: false })).toEqual([["main1: ICE LIGHTS", 5]]);
  });

  it("the two panels differ only in the ice-protection breakers", () => {
    const strip = (equip: Equip) =>
      [...breakers(equip)].filter(([k]) => !ICE_BREAKERS.some((n) => k.endsWith(": " + n)));
    expect(strip({ fiki: true })).toEqual(strip({ fiki: false }));
  });

  it("the ice inspection lights follow ICE PROTECT 1 with FIKI and ICE LIGHTS without (AMM 30-80)", () => {
    for (const fiki of [true, false]) {
      const own = fiki ? "ICE PROTECT 1" : "ICE LIGHTS";
      expect(iceLightBreaker({ fiki })).toBe(own);
      expect(E({ equip: { fiki } }).icePwr).toBe(true);
      for (const pulled of ICE_BREAKERS)
        expect(E({ equip: { fiki }, cb: { [pulled]: true } }).icePwr, `fiki ${fiki}, ${pulled} pulled`).toBe(
          pulled !== own,
        );
      expect(lights({ equip: { fiki }, lights: { ice: true }, cb: { [own]: true } }).ext.ice).toBe(false);
    }
  });

  it("STALL WARNING stays 2 A on ESS BUS 2 in both configurations (POH 7-68)", () => {
    for (const fiki of [true, false]) expect(breakers({ fiki }).get("ess2: STALL WARNING")).toBe(2);
  });

  it("?fiki=0 starts the SR22T store with equip.fiki === false; no query keeps true", () => {
    expect(initialSimFor("?fiki=0").equip.fiki).toBe(false);
    expect(initialSimFor("").equip.fiki).toBe(true);
    expect(initialSimFor("?fiki=1").equip.fiki).toBe(true);
    expect(initialSimFor("?theme=dark&fiki=0").equip.fiki).toBe(false);
    // the rest of the starting state is the normal one
    expect({ ...initialSimFor("?fiki=0"), equip: initialSim.equip }).toEqual(initialSim);
  });

  it("?lights= and ?iceprotect=on set the starting exterior light and ICE PROTECT switches", () => {
    const L = initialSim.lights;
    expect(initialSimFor("?lights=land,ice").lights).toEqual({ ...L, land: true, ice: true });
    expect(initialSimFor("?theme=dark&lights=land").lights).toEqual({ ...L, land: true });
    // only the bolster exterior lights; other names and an empty list change nothing
    expect(initialSimFor("?lights=door,bag,bogus").lights).toEqual(L);
    expect(initialSimFor("?lights=").lights).toEqual(L);
    expect(initialSimFor("?iceprotect=on").ice).toEqual({ ...initialSim.ice, on: true });
    expect(initialSimFor("?iceprotect=1").ice.on).toBe(false);
    // no ICE PROTECT switch to turn on without FIKI
    expect(initialSimFor("?fiki=0&iceprotect=on").ice.on).toBe(false);
    // without these parameters the starting state is the normal one
    expect(initialSimFor("?fiki=1")).toEqual(initialSim);
    // the reader copies, so a started store can't change initialSim
    expect(initialSimFor("?lights=land").lights).not.toBe(L);
    expect(initialSim.lights.land).toBe(false);
  });
});

describe("SR22T engine", () => {
  it("ALT AIR OPEN caution when the alternate air door opens with the engine running (POH 3A-11, 7-37)", () => {
    expect(cas({ eng: { filterBlocked: true } })).toContainEqual(["c", "ALT AIR OPEN"]);
    expect(texts({ eng: { filterBlocked: true, running: false } })).not.toContain("ALT AIR OPEN");
    expect(texts({ eng: { filterBlocked: false } })).not.toContain("ALT AIR OPEN");
  });

  it("full-power manifold pressure is 36.0 in.Hg (POH 4-17)", () => {
    expect(mapInHg(sim({ eng: { lever: 1 } }), 2500)).toBe(36.0);
  });

  it("manifold pressure markings follow POH 2-9: green 15.0–36.5, yellow 36.5–37.5, red 37.5–40.0", () => {
    const map = eisGauges(sim(), E()).find((g) => g.label === 'Man "Hg')!;
    expect([map.min, map.max]).toEqual([10, 40]);
    expect(map.bands).toEqual([
      [15, 36.5, "green"],
      [36.5, 37.5, "yellow"],
      [37.5, 40, "red"],
    ]);
  });

  it("alternate air costs 3–5% power (POH 3A-11)", () => {
    const pwr = (p: Patch<Sim>) => pctPower(sim(p), E(p), 2500);
    for (const lever of [0.4, 0.72, 1]) {
      const closed = pwr({ eng: { lever } }),
        open = pwr({ eng: { lever, filterBlocked: true } });
      expect(closed).toBeGreaterThan(0);
      const ratio = open! / closed!;
      expect(ratio).toBeGreaterThanOrEqual(0.95);
      expect(ratio).toBeLessThanOrEqual(0.97);
    }
  });

  it("no ALT AIR knob: the alternate air door opens on its own (POH 7-14 Fig 7-4, 7-37)", () => {
    const names = CAT.parts.map((p) => p.name);
    expect(names).not.toContain("ALT AIR – PULL knob");
    expect(names).toContain("Alternate air assembly");
  });

  it("starter needs the STARTER breaker on the NON ESS BUS and BAT 1 (POH 7-37)", () => {
    expect(E().starterPwr).toBe(true);
    expect(E({ cb: { STARTER: true } }).starterPwr).toBe(false);
    expect(E({ elec: { bat1: false } }).starterPwr).toBe(false);
  });
});

describe("SR22T engine flows", () => {
  const rates = (p: Patch<Sim>) => flowRates(sim(p), E(p));
  const RUN_CLEAR: Patch<Sim> = { eng: { running: true, filterBlocked: false } },
    RUN_BLOCKED: Patch<Sim> = { eng: { running: true, filterBlocked: true } },
    STOP_BLOCKED: Patch<Sim> = { eng: { running: false, filterBlocked: true } };
  // spelled out rather than read from CYLS, so dropping a cylinder from the model fails here
  const CYL = [1, 2, 3, 4, 5, 6];
  const pick = (r: Record<string, number>, keys: string[]) => Object.fromEntries(keys.map((k) => [k, r[k]]));
  const each = (keys: string[], v: number) => Object.fromEntries(keys.map((k) => [k, v]));

  it("both alternate air paths flow only with the engine running and the filter blocked (POH 7-37)", () => {
    const alt = ["altAirL", "altAirR"];
    expect(pick(rates(RUN_BLOCKED), alt)).toEqual(each(alt, 1));
    expect(pick(rates(RUN_CLEAR), alt)).toEqual(each(alt, 0));
    expect(pick(rates(STOP_BLOCKED), alt)).toEqual(each(alt, 0));
  });

  it("both normal intakes and the manifold flow while running and stop with the engine (POH 7-37)", () => {
    const air = ["intakeL", "intakeR", "manifold"];
    expect(pick(rates(RUN_CLEAR), air)).toEqual(each(air, 1));
    expect(pick(rates(RUN_BLOCKED), air)).toEqual(each(air, 1));
    expect(pick(rates(STOP_BLOCKED), air)).toEqual(each(air, 0));
  });

  it("a blocked filter stops both NACA inlet segments; the engine runs on alternate air (POH 7-37)", () => {
    const inlet = ["inletL", "inletR"];
    expect(pick(rates(RUN_CLEAR), inlet)).toEqual(each(inlet, 1));
    expect(pick(rates(RUN_BLOCKED), inlet)).toEqual(each(inlet, 0));
    expect(pick(rates(STOP_BLOCKED), inlet)).toEqual(each(inlet, 0));
    expect(pick(rates({ eng: { running: false, filterBlocked: false } }), inlet)).toEqual(each(inlet, 0));
  });

  it("with the filter blocked the NACA inlets stop while the alternate-air-fed segments keep flowing (POH 7-37)", () => {
    const inlet = ["inletL", "inletR"],
      fed = ["intakeL", "intakeR", "compressorL", "compressorR"];
    expect(pick(rates(RUN_BLOCKED), [...inlet, ...fed])).toEqual({ ...each(inlet, 0), ...each(fed, 1) });
    expect(pick(rates(STOP_BLOCKED), fed)).toEqual(each(fed, 0));
  });

  it("each side's induction is three chained segments: NACA → air box → compressor → throttle (POH 7-37)", () => {
    const seg = (key: string) => FLOWS.find((f) => f.key === key)!.pts as number[][];
    const manifold = seg("manifold");
    for (const side of ["L", "R"]) {
      const [inlet, intake, compressor] = ["inlet", "intake", "compressor"].map((k) => seg(k + side));
      const s = side === "L" ? -1 : 1;
      // Filter housing and separate compressor inlet/outlet ports (AMM Fig 81-20-1 PDF 2815).
      expect(inlet.at(-1)).toEqual(AIR_BOX(s));
      for (const point of intake)
        expect(new Vector3(...point).distanceTo(new Vector3(...COMPRESSOR_INLET(s)))).toBeLessThan(0.01);
      expect(compressor[0]).toEqual(COMPRESSOR_OUTLET(s));
      expect(compressor.at(-1)).toEqual(manifold[0]);
      // the NACA → air box leg is drawn once, by the inlet segment only
      expect(intake).not.toContainEqual(inlet[0]);
      expect(compressor).not.toContainEqual(inlet[0]);
    }
  });

  it("both tailpipes, the crossover and the oil run with the engine and stop with it (POH 7-36, 7-38)", () => {
    const exhaust = ["tailpipeL", "tailpipeR", "crossover"];
    expect(pick(rates(RUN_CLEAR), [...exhaust, "oil"])).toEqual({ ...each(exhaust, 1.2), oil: 0.7 });
    expect(pick(rates(STOP_BLOCKED), [...exhaust, "oil"])).toEqual({ ...each(exhaust, 0), oil: 0 });
  });

  it("all six cylinders: intake and exhaust follow the engine, injection also needs fuel (POH 7-38)", () => {
    const inj = CYL.map((n) => "inj" + n),
      man = CYL.map((n) => "man" + n),
      exh = CYL.map((n) => "exh" + n),
      all = [...inj, ...man, ...exh];
    expect(pick(rates(RUN_CLEAR), all)).toEqual({ ...each(inj, 1), ...each(man, 1), ...each(exh, 1.2) });
    const noFuel: Patch<Sim> = { ...RUN_CLEAR, fuel: { sel: "OFF" } };
    expect(pick(rates(noFuel), all)).toEqual({ ...each(inj, 0), ...each(man, 1), ...each(exh, 1.2) });
    expect(pick(rates(STOP_BLOCKED), all)).toEqual(each(all, 0));
  });
});

describe("SR22T cabin & safety", () => {
  it("the RCPI note places the ELT remote switch forward of the circuit breaker panel (POH 7-91)", () => {
    const rcpi = CAT.parts.find((p) => p.name === "ELT remote switch (RCPI)");
    expect(rcpi?.note).toContain("forward of the circuit breaker panel");
    expect(rcpi?.note).not.toContain("ALT AIR");
  });

  it("cabin catalogue pins the extinguisher, egress hammer, ELT and CAPS handle (POH 7-91 to 7-96)", () => {
    const names = CAT.pinned("cabin").map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Fire extinguisher",
        "Armrest: egress hammer & hour meters",
        "ELT — Artex ELT 1000",
        "CAPS activation T-handle",
      ]),
    );
  });

  it("cabin view labels the seats and the ELT remote switch (POH 7-27, 7-28, 7-91)", () => {
    const names = CAT.pinned("cabin").map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Pilot seat",
        "Front passenger seat",
        "Rear seat (2+1 bench)",
        "Rear seat",
        "ELT remote switch (RCPI)",
      ]),
    );
  });
});

describe("SR22T electrical breaker panel (POH Figure 7-11, 7-52)", () => {
  it("sources electrical ratings and the trim / autopilot failure breakers (POH 3A-21; 7-7, 7-9, 7-50, 7-51, 7-53, 7-57, 7-61; AMM 22-10 PDF 555–556, 24-50 PDF 750)", () => {
    const expected = [
      ["ess1: ESSENTIAL POWER", 20],
      ["ess1: BAT 2", 20],
      ["ess2: ALT 2", 5],
      ["ess2: PITCH TRIM", 2],
      ["ess2: ROLL TRIM", 2],
      ["main1: AVIONICS", 10],
      ["main1: CABIN LIGHTS / OXYGEN", 5],
      ["main1: AP SERVOS", 5],
      ["main3: LANDING LIGHTS", 15],
      ["main3: YAW SERVO", 3],
      ["nonEss: NAV LIGHTS", 5],
      ["nonEss: STROBE LIGHTS", 5],
      ["ac1: ALT 1", 5],
      ["ac1: A/C COND", 15],
      ["ac2: CABIN FAN", 15],
      ["ac2: A/C COMPR", 5],
    ] as const;
    for (const fiki of [true, false]) {
      const panel = breakers({ fiki });
      for (const [label, amps] of expected) expect(panel.get(label), label).toBe(amps);
      expect(panel.has("main1: CABIN LIGHTS")).toBe(false);
    }
  });
});

describe("SR22T pitot-static hardware", () => {
  it("shows dual OAT probes, observed by the operator on the modelled airplane (POH 7-75, 7-80/7-81; AMM Fig 34-10-6)", () => {
    const sensors = CAT.parts.filter((p) => p.name?.startsWith("OAT"));
    expect(sensors).toHaveLength(2);
    expect(sensors.map((p) => p.name)).toEqual(["OAT sensor 1", "OAT sensor 2"]);
    for (const sys of ["pitot", "avionics"] as const)
      expect(CAT.pinned(sys).filter((p) => p.name?.startsWith("OAT sensor"))).toHaveLength(2);
    expect(sensors[0].pos![2]).toBeGreaterThan(0);
    expect(CAT.parts.filter((p) => p.sys.includes("pitot")).some((p) => p.note?.includes("Costanzo"))).toBe(false);
  });
});

describe("SR22T wing flaps", () => {
  const savedLive = { ...live };
  const savedState = useSR22T.getState();

  beforeEach(() => {
    Object.assign(live, savedLive, { flapAng: 0 });
    const s = structuredClone(initialSim);
    useSR22T.setState({ s, E: solve(s) });
  });
  afterEach(() => {
    Object.assign(live, savedLive);
    useSR22T.setState(savedState);
  });

  it("flaps set to 0%, 50% (16°) and 100% (35.5°) (POH 7-22)", () => {
    expect(FLAP_DEG).toEqual({ 0: 0, 50: 16, 100: 35.5 });
  });

  it("flaps move only with the 10-amp FLAPS breaker on the NON ESS BUS (POH 7-23)", () => {
    expect(E().flapsPwr).toBe(true);
    expect(E({ cb: { FLAPS: true } }).flapsPwr).toBe(false);
    const dead = E({ elec: { bat1: false, bat2: false, alt1: false, alt2: false } });
    expect(dead.nonEss).toBe(0);
    expect(dead.flapsPwr).toBe(false);
  });

  it("flap motor drives to 35.5° at 100% and stops there (POH 7-22)", () => {
    useSR22T.getState().update((s) => {
      s.flaps.cmd = 100;
    });
    for (let i = 0; i < 120; i++) {
      simTick(0.1);
      expect(live.flapAng).toBeLessThanOrEqual(35.5);
    }
    expect(live.flapAng).toBe(35.5);
    live.flapAng = 8;
    useSR22T.getState().update((s) => {
      s.cb.FLAPS = true;
    });
    for (let i = 0; i < 120; i++) simTick(0.1);
    expect(live.flapAng).toBe(8);
  });

  it("position lamps light only after powered arrival at the selected detent (POH 7-23)", () => {
    for (const [cmd, start] of [
      [50, 15.5],
      [100, 35],
    ] as const) {
      useSR22T.getState().update((s) => {
        s.flaps.cmd = cmd;
      });
      live.flapAng = start;
      simTick(0.1);
      expect(live.flapAng).toBeCloseTo(start + 0.4, 10);
      expect(flapPositionLit(cmd, live.flapAng, true)).toBe(false);
      simTick(0.1);
      expect(live.flapAng).toBe(FLAP_DEG[cmd]);
      expect(flapPositionLit(cmd, live.flapAng, true)).toBe(true);
      simTick(0.1);
      expect(live.flapAng).toBe(FLAP_DEG[cmd]);
      expect(flapPositionLit(cmd, live.flapAng, false)).toBe(false);
    }
    useSR22T.getState().update((s) => {
      s.flaps.cmd = 50;
    });
    live.flapAng = 15.995;
    expect(flapPositionLit(50, live.flapAng, true)).toBe(false);
    simTick(0.1);
    expect(live.flapAng).toBe(16);
    expect(flapPositionLit(50, live.flapAng, true)).toBe(true);
    expect(flapPositionLit(0, 0, true)).toBe(true);
    expect(flapPositionLit(0, 0.1, true)).toBe(false);
  });

  it("retracts to the 50% and UP detents without passing them (POH 7-22)", () => {
    live.flapAng = 35.5;
    for (const cmd of [50, 0] as const) {
      useSR22T.getState().update((s) => {
        s.flaps.cmd = cmd;
      });
      for (let i = 0; i < 100; i++) {
        simTick(0.1);
        expect(live.flapAng).toBeGreaterThanOrEqual(FLAP_DEG[cmd]);
      }
      expect(live.flapAng).toBe(FLAP_DEG[cmd]);
    }
  });

  it("both torque-tube flows stop at the selected detent or without power (POH 7-22 – 7-23)", () => {
    const s = patched(initialSim, { flaps: { cmd: 100 } });
    live.flapAng = 32;
    expect(flowRates(s, solve(s))).toMatchObject({ flapPush: 1, flapPush2: 1 });
    live.flapAng = 35.5;
    expect(flowRates(s, solve(s))).toMatchObject({ flapPush: 0, flapPush2: 0 });
    live.flapAng = 16;
    s.cb.FLAPS = true;
    expect(flowRates(s, solve(s))).toMatchObject({ flapPush: 0, flapPush2: 0 });
  });
});

describe("SR22T environmental", () => {
  const rates = (p: Patch<Sim> = {}) => flowRates(sim(p), E(p));

  it("hot air only flows with the engine running and A/C off (POH 7-64, 7-66)", () => {
    expect(rates().hot).toBeGreaterThan(0);
    expect(rates({ eng: { running: false } }).hot).toBe(0);
    expect(rates({ env: { ac: true } }).hot).toBe(0);
  });

  it("recirculation closes the fresh-air valve (POH 7-66)", () => {
    expect(rates().fresh).toBeGreaterThan(0);
    expect(rates({ env: { ac: true, recirc: true } }).fresh).toBe(0);
  });

  it("Panel selector closes floor and defrost, Windshield closes floor (POH 7-66)", () => {
    const floor = ["floorF", "floorF2", "floorR", "floorR2"],
      defrost = ["defrost", "defrost2"];
    const p = rates({ env: { vent: "P" } }),
      w = rates({ env: { vent: "W" } }),
      pfw = rates({ env: { vent: "PFW" } });
    for (const k of [...floor, ...defrost]) expect(p[k], k).toBe(0);
    for (const k of floor) expect(w[k], k).toBe(0);
    for (const k of defrost) expect(w[k], k).toBeGreaterThan(0);
    for (const k of [...floor, ...defrost]) expect(pfw[k], k).toBeGreaterThan(0);
  });

  it("airflow selector at OFF closes the mixing-chamber valve, so no cabin air flows (POH 7-65: moving the selector past the OFF position opens that valve fully)", () => {
    const r = rates({ env: { fan: -1, vent: "PFW" } });
    for (const k of ["toMan", "panelL", "panelR", "floorF", "floorF2", "floorR", "floorR2"]) expect(r[k], k).toBe(0);
    expect(rates({ env: { fan: 0 } }).toMan).toBeGreaterThan(0);
  });

  it("cabin heat is intercooler rear-port air heated around the exhaust crossover tube, not a muffler muff (POH 7-61, 7-64)", () => {
    const hot = FLOWS.find((f) => f.key === "hotIn")!;
    expect(hot.pts[0]).toEqual(INTERCOOLER_AFT(1));
    // the duct passes through the heat-exchanger shroud on the crossover, beside the pipe
    const shroud = CAT.parts.find((p) => p.name === "Exhaust crossover / heat exchanger")!;
    expect(shroud.pos).toEqual(HEAT_X);
    const box = new Box3().setFromBufferAttribute(shroud.geo().getAttribute("position") as BufferAttribute);
    box.translate(new Vector3(...HEAT_X));
    expect(hot.pts.filter((p) => box.containsPoint(new Vector3(...p))).length).toBeGreaterThanOrEqual(2);
    const names = CAT.parts.map((p) => p.name);
    expect(names).not.toContain("Heat exchanger (muff)");
    expect(names).not.toContain("Muffler");
    expect(names).toContain("Exhaust crossover / heat exchanger");
  });

  it("the manifold tooltip matches the selector model: OFF closes airflow, 0 is ram air (POH 7-62 Fig 7-13, 7-66; AMM 21-60)", () => {
    const note = CAT.parts.find((p) => p.name === "Distribution manifold")!.note;
    expect(note).toContain("OFF closes cabin airflow; 0 is ram air; 1–3 are blower speeds");
    expect(note).toContain("Fig 7-13");
    expect(note).toContain("AMM 21-60");
    expect(note).not.toMatch(/Blower: OFF \(ram air\)/);
  });

  it("the over-temperature sensor and the A/C condenser are modelled (POH 7-61, 7-64; AMM 21-50, 21-60)", () => {
    const names = CAT.parts.map((p) => p.name);
    expect(names).toContain("Duct temperature sensor");
    expect(names).toContain("A/C condenser");
    expect(names).toContain("A/C evaporator");
  });
});

describe("SR22T propeller", () => {
  const target = (p: Patch<Sim>) => rpmTarget(sim(p), true);
  const rpmGauge = () => eisGauges(sim(), E()).find((g) => g.key === "rpm")!;
  const bandAt = (rpm: number) => (rpmGauge().bands ?? []).find(([a, b]) => rpm >= a && rpm <= b)?.[2];

  it("governor holds 2500 RPM from the governing range to full power — no prop control (POH 7-32, AMM 61-00)", () => {
    for (const lever of [0.5, 0.93, 1]) expect(target({ eng: { lever } }), `lever ${lever}`).toBe(2500);
    for (let lever = 0; lever <= 1; lever += 0.01) expect(target({ eng: { lever } })).not.toBe(2700);
  });

  it("RPM warning after > 2560 RPM for ten seconds or > 2580 RPM for five seconds (AMM 77-10)", () => {
    expect(rpmWarning(10.1, 0)).toBe(true);
    expect(rpmWarning(9.9, 0)).toBe(false);
    expect(rpmWarning(0, 5.1)).toBe(true);
    expect(rpmWarning(0, 4.9)).toBe(false);
    expect(cas({ eng: { rpmWarn: true } })).toContainEqual(["w", "RPM"]);
    expect(texts()).not.toContain("RPM");
    // the Engine Strip RPM readout turns red with the CAS, not before it
    const alert = (p: Patch<Sim>) => eisGauges(sim(p), E(p)).find((g) => g.key === "rpm")!.alert;
    expect(alert({ eng: { rpmWarn: true } })).toBe("warning");
    expect(alert({})).toBeNull();
  });

  it("RPM warning procedure keeps both branches after the 2 in.Hg reduction (POH 3-32)", () => {
    const [reduce, notGoverning, governing, governed] = RPM_WARNING_STEPS;
    expect(reduce).toMatch(/2 in\.Hg/);
    // RPM reduces and stays lower → the governor is not in control → governor failure checklist
    expect(notGoverning).toMatch(/reduces and stays lower/);
    expect(notGoverning).toMatch(/Propeller Governor Failure checklist/);
    // RPM high but stable → governing → reduce below 34 / 30.5 in.Hg
    expect(governing).toMatch(/high but stable/);
    expect(governing).toMatch(/34 in\.Hg for climb.*30\.5 in\.Hg for cruise/);
    // the 2,600 RPM decision applies to governed speed only
    expect(governed).toMatch(/governed speed above 2,600 RPM: perform the Propeller Governor Failure checklist/);
    expect(governed).toMatch(/governed 2,600 RPM or less: continue/);
  });

  it("governor failure lets the propeller overspeed toward 3000 RPM (POH 3-33)", () => {
    const rpm = target({ eng: { govFail: true, lever: 1 } });
    expect(rpm).toBeGreaterThanOrEqual(3000);
    expect(bandAt(rpm)).toBe("red");
    // the blades go to fine pitch (POH 3-33)
    expect(bladeAngle(sim({ eng: { govFail: true, lever: 1 } }))).toBeLessThan(bladeAngle(sim({ eng: { lever: 1 } })));
  });

  it("engine speed marking green 500–2550, red above 2550 (POH 2-9)", () => {
    const g = rpmGauge();
    expect([g.min, g.max]).toEqual([0, 3000]);
    expect(g.bands).toEqual([
      [500, 2550, "green"],
      [2550, 3000, "red"],
    ]);
  });
});

describe("SR22T RPM warning timing through simTick (AMM 77-10, POH 3-32)", () => {
  const DT = 0.5;
  const LIVE0 = structuredClone(live);
  /** Fresh store and live values, the engine already turning at `rpm` with its target there too (no lerp drift). */
  const start = (p: Patch<Sim>, rpm: number) => {
    Object.assign(live, structuredClone(LIVE0), { rpm });
    const s = sim(p);
    useSR22T.setState({ s, E: solve(s) });
  };
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) simTick(DT);
  };
  const shown = () => {
    const { s, E } = useSR22T.getState();
    return {
      cas: casMessages(s, E).some(([lvl, t]) => lvl === "w" && t === "RPM"),
      gauge: eisGauges(s, E).find((g) => g.key === "rpm")!.alert,
    };
  };
  const set = (fn: (d: Sim) => void) => useSR22T.getState().update(fn);
  // failed governor: RPM follows the lever; 0.33 settles at 2571.5 (between 2560 and 2580), 1.0 at 3000
  const BETWEEN: Patch<Sim> = { eng: { govFail: true, lever: 0.33 } };
  const ABOVE: Patch<Sim> = { eng: { govFail: true, lever: 1 } };
  const target = (p: Patch<Sim>) => rpmTarget(sim(p), true);

  afterEach(() => start({}, 2500));

  it("between 2560 and 2580 RPM: no warning at ten seconds, warning just after", () => {
    start(BETWEEN, target(BETWEEN));
    expect(live.rpm).toBeGreaterThan(2560);
    expect(live.rpm).toBeLessThan(2580);
    run(10);
    expect(live.rpmHi.t2580).toBe(0);
    expect(shown()).toEqual({ cas: false, gauge: null });
    run(DT);
    expect(shown()).toEqual({ cas: true, gauge: "warning" });
  });

  it("above 2580 RPM: no warning at five seconds, warning just after", () => {
    start(ABOVE, target(ABOVE));
    run(5);
    expect(shown()).toEqual({ cas: false, gauge: null });
    run(DT);
    expect(shown()).toEqual({ cas: true, gauge: "warning" });
  });

  it("dropping to the governed 2500 RPM resets the timers: an interrupted exceedance does not add up", () => {
    start(BETWEEN, target(BETWEEN));
    run(9);
    live.rpm = 2500;
    set((d) => {
      d.eng.govFail = false;
    });
    run(DT);
    expect(live.rpmHi).toEqual({ t2560: 0, t2580: 0 });
    live.rpm = target(BETWEEN);
    set((d) => {
      d.eng.govFail = true;
    });
    run(9);
    expect(shown().cas).toBe(false);
  });

  it("the warning clears from the CAS and the readout once RPM is back at 2500", () => {
    start(ABOVE, target(ABOVE));
    run(6);
    expect(shown().cas).toBe(true);
    live.rpm = 2500;
    set((d) => {
      d.eng.govFail = false;
    });
    run(DT);
    expect(useSR22T.getState().s.eng.rpmWarn).toBe(false);
    expect(shown()).toEqual({ cas: false, gauge: null });
  });

  it("without ENGINE INSTR power neither the CAS nor the readout shows the warning (AMM 77-10)", () => {
    start({ ...ABOVE, cb: { "ENGINE INSTR": true } }, target(ABOVE));
    run(6);
    expect(shown()).toEqual({ cas: false, gauge: null });
  });

  it("the timers start when ENGINE INSTR power returns, not before (AMM 77-10)", () => {
    start({ ...ABOVE, cb: { "ENGINE INSTR": true } }, target(ABOVE));
    run(6);
    expect(live.rpmHi).toEqual({ t2560: 0, t2580: 0 });
    set((d) => {
      d.cb["ENGINE INSTR"] = false;
    });
    run(5);
    expect(shown()).toEqual({ cas: false, gauge: null });
    run(DT);
    expect(shown()).toEqual({ cas: true, gauge: "warning" });
  });
});

describe("SR22T fuel", () => {
  it("HIGH BOOST/PRIME runs high below 500 RPM, or at 24 inHg and 10,000 ft; otherwise holds BOOST (POH 7-41)", () => {
    const s = sim({ fuel: { pump: "HIGH" } });
    const e = solve(s);
    expect(pumpSpeed(s, e, 0, 11.5, 0)).toBe("high");
    expect(pumpSpeed(s, e, 499, 11.5, 0)).toBe("high");
    expect(pumpSpeed(s, e, 500, 11.5, 0)).toBe("low");
    expect(pumpSpeed(s, e, 2500, 24, 10000)).toBe("high");
    expect(pumpSpeed(s, e, 2500, 24, 9000)).toBe("low");
    expect(pumpSpeed(s, e, 2500, 23.9, 15000)).toBe("low");
  });

  it("BOOST runs low whatever MAP or RPM; the pump needs MAIN BUS 2 and the FUEL PUMP breaker (POH 7-41)", () => {
    for (const pump of ["OFF", "BOOST", "HIGH"] as const) {
      const s = sim({ fuel: { pump } });
      for (const [rpm, map, pa] of [
        [0, 11.5, 0],
        [2500, 36, 25000],
      ]) {
        expect(pumpSpeed(s, solve(s), rpm, map, pa)).toBe(pump === "OFF" ? "off" : pump === "BOOST" ? "low" : "high");
        const pulled = sim({ fuel: { pump }, cb: { "FUEL PUMP": true } });
        expect(pumpSpeed(pulled, solve(pulled), rpm, map, pa)).toBe("off");
        const dead = sim({ fuel: { pump }, eng: { running: false }, elec: { bat1: false, bat2: false } });
        expect(solve(dead).main2).toBe(0);
        expect(pumpSpeed(dead, solve(dead), rpm, map, pa)).toBe("off");
      }
    }
  });

  it("fuel gauge is 0–46 gal, yellow to 14 and green to 46; fuel flow is 0–45 GPH (POH 2-10, 7-43)", () => {
    const fuel = eisGauges(sim(), E()).find((g) => g.key === "fuel")!;
    expect([fuel.min, fuel.max]).toEqual([0, 46]);
    expect(fuel.bands).toEqual([
      [0, 0.5, "red"],
      [0.5, 14, "yellow"],
      [14, 46, "green"],
    ]);
    expect([fuel.side!.min, fuel.side!.max]).toEqual([0, 45]);
    const off = sim({ cb: { "FUEL QTY": true } });
    const lost = eisGauges(off, solve(off)).find((g) => g.key === "fuel")!;
    expect([lost.value, lost.value2]).toEqual([null, null]);
    expect(lost.side!.value).not.toBeNull();
    const noEau = sim({ cb: { "ENGINE INSTR": true } });
    const unavailable = eisGauges(noEau, solve(noEau)).find((g) => g.key === "fuel")!;
    expect([unavailable.value, unavailable.value2, unavailable.side!.value]).toEqual([null, null, null]);
  });

  it("fuel flow green arc is narrow above 30.5 inHg and expands down to 10 GPH at or below it (POH 7-44)", () => {
    const oldRpm = live.rpm;
    live.rpm = 2500;
    try {
      const gauge = (lever: number) => {
        const s = sim({ eng: { lever, mix: 1 } });
        return eisGauges(s, solve(s)).find((g) => g.key === "fuel")!.side!;
      };
      // These fixed lever settings produce 30.5 and 30.6 inHg with the engine model's mapInHg.
      const expanded = gauge(0.775),
        narrow = gauge(0.78),
        full = gauge(1);
      expect(mapInHg(sim({ eng: { lever: 0.775 } }), 2500)).toBe(30.5);
      expect(mapInHg(sim({ eng: { lever: 0.78 } }), 2500)).toBe(30.6);
      expect(expanded.bands![0][0]).toBe(10);
      expect(narrow.bands![0][1] - narrow.bands![0][0]).toBeLessThan(3);
      expect(full.value).toBeGreaterThanOrEqual(35);
      expect(full.value).toBeLessThanOrEqual(42); // AMM Fig 73-20-2, PDF p. 2592, illustrative anchor
      expect(full.value).toBeGreaterThanOrEqual(full.bands![0][0]);
      expect(full.value).toBeLessThanOrEqual(full.bands![0][1]);
    } finally {
      live.rpm = oldRpm;
    }
  });

  it("pressure altitude starts at the 4,000-ft cruise point (POH 5-32) and feeds PFD altitude and selected altitude", () => {
    expect(initialSim.paFt).toBe(4000);
    const s = sim({ paFt: 12000 });
    const f = pfdData(s, solve(s)).f;
    expect([f.alt, f.selAlt]).toEqual([12000, 12000]);
  });

  it("initial and full tanks raise no fuel CAS; illustrative fuel flow never raises FUEL FLOW", () => {
    for (const p of [{}, { fuel: { qL: 46, qR: 46 } }, { eng: { lever: 1, mix: 1 } }] as Patch<Sim>[]) {
      expect(texts(p).filter((t) => t.startsWith("FUEL"))).toEqual([]);
    }
  });

  it("return fuel goes only to the selected tank; OFF and a dry selected tank stop all fuel flows (POH 7-40, Fig 7-8)", () => {
    for (const sel of ["L", "R"] as const) {
      const s = sim({ fuel: { sel } });
      const rates = flowRates(s, solve(s));
      expect(rates["fuelRet" + sel]).toBeGreaterThan(0);
      expect(rates["fuelRet" + (sel === "L" ? "R" : "L")]).toBe(0);
      expect(rates["fuel" + sel]).toBeGreaterThan(0);
      for (const patch of [{ sel: "OFF" as const }, { sel, qL: 0, qR: 0 }]) {
        const empty = sim({ fuel: patch });
        const stopped = flowRates(empty, solve(empty));
        for (const key of [
          "fuelL",
          "fuelR",
          "fuelMain",
          "fuelRetL",
          "fuelRetR",
          ...Array.from({ length: 6 }, (_, i) => "inj" + (i + 1)),
        ])
          expect(stopped[key]).toBe(0);
      }
    }
  });

  it("electric pump primes without engine rotation, but engine-driven return and injector flows stay stopped", () => {
    const oldRpm = live.rpm;
    live.rpm = 0;
    try {
      const s = sim({ eng: { running: false }, fuel: { pump: "HIGH" } });
      const rates = flowRates(s, solve(s));
      expect(rates.fuelMain).toBe(1.8);
      expect(rates.fuelRetL + rates.fuelRetR).toBe(0);
      for (let n = 1; n <= 6; n++) expect(rates["inj" + n]).toBe(0);
      const noPower = sim({ eng: { running: false }, fuel: { pump: "HIGH" }, cb: { "FUEL PUMP": true } });
      expect(flowRates(noPower, solve(noPower)).fuelMain).toBe(0);
    } finally {
      live.rpm = oldRpm;
    }
  });

  it("pump is forward of firewall and separate transducer is on the engine's right side (AMM 28-20; POH 7-43)", () => {
    const pump = CAT.parts.find((p) => p.name === "Electric fuel pump")!;
    const gascolator = CAT.parts.find((p) => p.name === "Gascolator")!;
    const transducer = CAT.parts.find((p) => p.name === "Fuel flow transducer")!;
    expect(pump.pos![0]).toBeGreaterThan(2.61); // firewall in geometry.ts; placement approximate
    expect(transducer.pos![2]).toBeGreaterThan(0);
    const supply = FLOWS.find((f) => f.key === "fuelMain")!;
    expect(supply.pts).toContainEqual(pump.pos);
    expect(supply.pts).toContainEqual(gascolator.pos);
    expect(supply.pts).toContainEqual(transducer.pos);
    const index = (pos: number[]) =>
      supply.pts.findIndex((point) => Array.isArray(point) && point.every((v, i) => v === pos[i]));
    expect(index(pump.pos!)).toBeLessThan(index(gascolator.pos!));
    expect(FLOWS.filter((f) => /^inj/.test(f.key))).toHaveLength(6);
  });
});

describe("SR22T overview", () => {
  it("SR22T definition names the TSIO-550-K in its sub-heading (POH 1-7)", () => {
    expect(SR22T.sub).toContain("TSIO-550-K");
    expect(SR22T.systems[0].id).toBe("overview");
    expect(SR22T.systems[0].pg).toBe("7-5");
  });

  it("shows SR22T key figures and its source rather than the SR20 deck (POH 1-7, 1-8, 2-19, 7-22, 7-40)", () => {
    const html = renderToStaticMarkup(createElement(SR22T.panels.overview!));
    for (const text of [
      "for the SR22T with Perspective+",
      "TSIO-550-K · 315 bhp @ 2,500 RPM",
      "3-blade composite, 78 in., constant speed",
      "92 gal usable · 46 per wing",
      "100% (35.5°)",
      "3,600 lb",
      "25,000 ft MSL",
      "SR22T POH/AFM P/N 13772-007 (Reissue A)",
      "13773-002 (Rev 7)",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("Sections 1, 2 and 7");
    expect(html).not.toContain("Costanzo");
    expect(html).not.toContain("11934-005");
    for (const system of SR22T.systems.slice(1))
      expect(html).toContain(renderToStaticMarkup(createElement("b", null, system.name)));
  });
});

/** Model x (m) to fuselage station (in): the firewall FW is FS 100 (AMM 8-20). */
const FS = (x: number) => 100 + (FW - x) / 0.0254;

/** Whether (x, y) lies inside the closed polygon. */
const inside = (poly: number[][], [x, y]: number[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** Shortest distance from (x, y) to the closed polygon's outline. */
const edgeDist = (poly: number[][], [px, py]: number[]) => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i],
      [bx, by] = poly[(i + 1) % poly.length],
      l2 = (bx - ax) ** 2 + (by - ay) ** 2,
      t = l2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2)) : 0;
    d = Math.min(d, Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay)));
  }
  return d;
};
/** A side-view point clears the outline when it is outside it by more than the strap radius. */
const clears = (poly: number[][], p: number[]) => !inside(poly, p) && edgeDist(poly, p) > STRAP_R;

const SIDES = [-1, 1];
const strap = (s: number) => {
  const { lead, run, fitting } = fwdStrap(s);
  return [...lead, ...run, fitting];
};
const doorX = [Math.min(...DOOR_SEAM.map((p) => p[0])), Math.max(...DOOR_SEAM.map((p) => p[0]))];
const sill = Math.min(...DOOR_SEAM.map((p) => p[1]));

describe("SR22T CAPS", () => {
  it("CAPS snub line is cut 8 s after deployment and the canopy starts to inflate at about 2 s (POH 7-97)", () => {
    expect(capsPhase(7.9)[1]).toBe("Nose-low hang");
    expect(capsPhase(8)[1]).toBe("Snub line cut");
    expect(capsPhase(2)[1]).toBe("Inflation");
  });

  it("the CAPS rail entry points at POH 7-95", () => {
    expect(SYS.find((s) => s.id === "caps")!.pg).toBe("7-95");
  });

  it("the forward harness straps attach at the firewall and the aft strap at the aft baggage bulkhead (POH 7-96; AMM 95-00, 8-20)", () => {
    expect(HARNESS.fwdL[0]).toBe(FW);
    expect(HARNESS.fwdR[0]).toBe(FW);
    expect(HARNESS.aft[0]).toBe(AB);
    expect(FS(HARNESS.fwdL[0])).toBe(100);
    expect(Math.abs(FS(HARNESS.aft[0]) - 222)).toBeLessThan(0.1);
    // the two forward straps end on opposite sides, each at its own fitting
    expect(HARNESS.fwdL[2]).toBeLessThan(0);
    expect(HARNESS.fwdR[2]).toBeGreaterThan(0);
    SIDES.forEach((s) => expect(strap(s).at(-1)).toEqual(s < 0 ? HARNESS.fwdL : HARNESS.fwdR));
  });

  it("the forward straps run immediately under the side skin (POH 7-96)", () => {
    SIDES.forEach((s) => {
      const { run } = fwdStrap(s);
      // the side run spans from the canister exit, aft of the bulkhead, to the firewall
      expect(run[0][0]).toBeLessThan(AB);
      expect(run.at(-1)![0]).toBeGreaterThan(FW - 0.03);
      run.forEach(([x, y, z], i) => {
        expect(Math.sign(z)).toBe(s);
        // the tube stays inside the skin, its outer surface within 0.03 m of it
        const gap = Math.abs(onSkin(x, y, s, 1).z) - Math.abs(z);
        expect(gap, `x ${x.toFixed(3)}`).toBeGreaterThanOrEqual(STRAP_R);
        expect(gap - STRAP_R, `x ${x.toFixed(3)}`).toBeLessThanOrEqual(0.03);
        // sampled densely enough that the tube follows the skin
        if (i) expect(Math.hypot(x - run[i - 1][0], y - run[i - 1][1], z - run[i - 1][2])).toBeLessThanOrEqual(0.03);
        // and never across glazing: the door and rear windows, or below the windshield's lower edge
        expect(clears(WIN.front, [x, y]) && clears(WIN.rear, [x, y]), `x ${x.toFixed(3)} y ${y.toFixed(3)}`).toBe(true);
        const [[wx1, wy1], [wx0, wy0]] = WIN.windLower;
        if (x >= wx0 && x <= wx1) expect(y + STRAP_R).toBeLessThan(wy0 + ((x - wx0) / (wx1 - wx0)) * (wy1 - wy0));
      });
    });
  });

  it("no forward-strap point lies inside the door outline (AMM Fig 95-00-1)", () => {
    SIDES.forEach((s) =>
      strap(s).forEach(([x, y]) => {
        expect(clears(DOOR_SEAM, [x, y]), `x ${x.toFixed(3)} y ${y.toFixed(3)}`).toBe(true);
        if (x >= doorX[0] && x <= doorX[1]) expect(y + STRAP_R).toBeLessThan(sill);
      }),
    );
    // the run passes under the whole door
    const xs = fwdStrap(-1).run.map((p) => p[0]);
    expect(Math.min(...xs)).toBeLessThan(doorX[0]);
    expect(Math.max(...xs)).toBeGreaterThan(doorX[1]);
  });
});

describe("SR22T built-in oxygen", () => {
  const oxy = (o: Patch<Sim["oxy"]>, p: Patch<Sim> = {}): Patch<Sim> => ({ ...p, oxy: o });
  const oxyCas = (p: Patch<Sim>) => cas(p).filter(([, t]) => /OXYGEN/.test(t));

  it("The modelled airplane has the oxygen system: off, bottle charged to 1800 psig, no oxygen CAS (operator decision; AMM 35-00)", () => {
    expect(initialSim.oxy).toEqual({ on: false, psi: 1800, above12k5Min: 0, flowFault: false });
    expect(oxyCas({})).toEqual([]);
  });

  it("MAIN BUS 1 breaker is CABIN LIGHTS / OXYGEN, 5 A (POH 7-52)", () => {
    for (const fiki of [true, false]) {
      expect(busOf({ fiki }, "main1")).toContainEqual(["CABIN LIGHTS / OXYGEN", 5]);
      expect(busOf({ fiki }, "main1").map(([n]) => n)).not.toContain("CABIN LIGHTS");
    }
  });

  it("OXYGEN QTY uses the inclusive 800 psi boundary (AFMS 102NMAN0001 Rev F Table 2 p. 16, PDF p. 18; modelling assumption), with POH 3-42 / 3A-24 / 3A-25 warning and altitude logic", () => {
    const qty = (psi: number, paFt: number) =>
      oxyCas(oxy({ on: true, psi }, { paFt })).filter(([, t]) => t === "OXYGEN QTY");
    for (const paFt of [4000, 12499, 12500, 18000]) {
      expect(qty(399, paFt), `399 psi at ${paFt}`).toEqual([["w", "OXYGEN QTY"]]);
      expect(qty(0, paFt)).toEqual([["w", "OXYGEN QTY"]]);
      expect(qty(801, paFt), `801 psi at ${paFt}`).toEqual([]);
      expect(qty(1800, paFt)).toEqual([]);
    }
    for (const psi of [400, 600, 799, 800]) {
      expect(qty(psi, 12500), `${psi} psi at 12,500 ft`).toEqual([["c", "OXYGEN QTY"]]);
      expect(qty(psi, 18000)).toEqual([["c", "OXYGEN QTY"]]);
      expect(qty(psi, 12499), `${psi} psi at 12,499 ft`).toEqual([["a", "OXYGEN QTY"]]);
      expect(qty(psi, 4000)).toEqual([["a", "OXYGEN QTY"]]);
    }
  });

  it("OXYGEN RQD warning above 14,000 ft with oxygen off; caution after 30 min above 12,500 ft (POH 3-42, 3A-24)", () => {
    const rqd = (paFt: number, above12k5Min: number, on = false) =>
      oxyCas(oxy({ on, above12k5Min }, { paFt })).filter(([, t]) => t === "OXYGEN RQD");
    expect(rqd(14001, 0)).toEqual([["w", "OXYGEN RQD"]]);
    expect(rqd(14001, 45)).toEqual([["w", "OXYGEN RQD"]]);
    expect(rqd(14000, 0)).toEqual([]);
    expect(rqd(14000, 31)).toEqual([["c", "OXYGEN RQD"]]);
    expect(rqd(13000, 30)).toEqual([]);
    expect(rqd(12501, 31)).toEqual([["c", "OXYGEN RQD"]]);
    expect(rqd(12500, 31)).toEqual([]);
    expect(rqd(18000, 60, true)).toEqual([]);
  });

  it("time above 12,500 ft counts while above it and restarts at or below it", () => {
    expect(above12k5(0, 12501, 60)).toBe(1);
    expect(above12k5(30, 14000, 90)).toBe(31.5);
    expect(above12k5(45, 12500, 1)).toBe(0);
    expect(above12k5(45, 4000, 1)).toBe(0);
  });

  it("OXYGEN LEFT ON advisory after on-ground engine shutdown with the system on (POH 3A-25)", () => {
    const stopped: Patch<Sim> = { eng: { running: false, key: "OFF" } };
    expect(oxyCas(oxy({ on: true }, stopped))).toEqual([["a", "OXYGEN LEFT ON"]]);
    expect(oxyCas(oxy({ on: false }, stopped))).toEqual([]);
    expect(oxyCas(oxy({ on: true }))).toEqual([]);
  });

  it("OXYGEN FAULT warning with the system on and the solenoid/flow failed (POH 3-41)", () => {
    expect(oxyCas(oxy({ on: true, flowFault: true }))).toEqual([["w", "OXYGEN FAULT"]]);
    expect(oxyCas(oxy({ on: false, flowFault: true }))).toEqual([]);
  });

  it("oxygen display loses power with CABIN LIGHTS / OXYGEN pulled (AMM 35-00)", () => {
    const on = sim(oxy({ on: true, psi: 1650 }));
    expect(solve(on).oxyPwr).toBe(true);
    expect(oxyDisplay(on, solve(on))).toBe(1650);
    const pulled = sim(oxy({ on: true, psi: 1650 }, { cb: { "CABIN LIGHTS / OXYGEN": true } }));
    expect(solve(pulled).oxyPwr).toBe(false);
    expect(oxyDisplay(pulled, solve(pulled))).toBeNull();
    const dead = sim(oxy({ on: true }, { eng: { running: false }, elec: { bat1: false, bat2: false } }));
    expect(solve(dead).oxyPwr).toBe(false);
    // the ON switch lights the display (AMM 35-00)
    const off = sim(oxy({ on: false }));
    expect(oxyDisplay(off, solve(off))).toBeNull();
  });

  it("oxygen messages join the end of their level's group; every other message keeps its order", () => {
    // FUEL IMBALANCE (here a warning) is raised among the cautions and must stay there
    const base: Patch<Sim> = { eng: { running: false }, fuel: { qL: 24, qR: 11 }, gear: { park: true } };
    const quiet = cas(base);
    const loud = cas(oxy({ on: true, psi: 600, flowFault: true }, base));
    expect(loud.filter(([, t]) => !/OXYGEN/.test(t))).toEqual(quiet);
    const at = (t: string) => loud.findIndex(([, x]) => x === t);
    expect(at("OXYGEN FAULT")).toBeLessThan(loud.findIndex(([l]) => l === "c"));
    expect(at("OXYGEN FAULT")).toBeGreaterThan(at("ESS BUS"));
    expect(loud.at(-1)).toEqual(["a", "OXYGEN LEFT ON"]);
    expect(at("OXYGEN QTY")).toBeGreaterThan(at("PARK BRAKE"));
  });

  it("scenarios raise their oxygen alert and keep the equipment fitted", () => {
    const run = (label: string, equip: Equip = { fiki: true }) => {
      const d = structuredClone({ ...initialSim, equip, cb: { "FUEL PUMP": true } as Record<string, boolean> });
      OXY_SCENARIOS.find(([l]) => l === label)![1](d);
      return d;
    };
    const left = run("Oxygen left on after shutdown");
    expect(oxygenCas(left)).toEqual([["a", "OXYGEN LEFT ON"]]);
    expect(left.cb).toEqual({});
    const low = run("Low oxygen at FL180", { fiki: false });
    expect(low.paFt).toBe(18000);
    expect(low.equip.fiki).toBe(false);
    expect(oxygenCas(low)).toEqual([["c", "OXYGEN QTY"]]);
    expect(oxygenCas(run("Climbing above 14,000 ft with oxygen off"))).toEqual([["w", "OXYGEN RQD"]]);
  });

  it("bottle and regulator in the tailcone bay, outlets overhead, filler on the baggage wall (AMM 35-00)", () => {
    const at = (name: string) => CAT.parts.find((p) => p.name === name)!;
    expect(at("Oxygen bottle — 77 cu ft").pos![0]).toBeLessThan(AB);
    expect(at("Regulator / latching solenoid").pos![0]).toBeLessThan(AB);
    expect(at("Remote filler station").pos![0]).toBeGreaterThan(AB);
    expect(at("Remote filler station").pos![0] - AB).toBeLessThan(0.05);
    const outlets = CAT.parts.filter((p) => p.name?.startsWith("Oxygen outlet "));
    // Operator-selected five-place A5 variant (AFMS §1 p. 8, §5.3 Fig 26 p. 42).
    expect(outlets).toHaveLength(5);
    for (const p of outlets) {
      expect(p.pos![0]).toBeGreaterThan(AB);
      expect(p.pos![0]).toBeLessThan(FW);
      expect(p.pos![1]).toBeGreaterThan(topY(p.pos![0]) - 0.15);
    }
    for (const name of ["Oxygen bottle — 77 cu ft", "Overhead distribution manifold", "Remote filler station"])
      expect(inFus(new Vector3(...at(name).pos!)), name).toBe(true);
    expect(CAT.pinned("oxygen").map((p) => p.name)).toEqual(
      expect.arrayContaining([
        "Oxygen bottle — 77 cu ft",
        "Overhead distribution manifold",
        ...[1, 2, 3, 4, 5].map((i) => `Oxygen outlet ${i}`),
        "Oxygen system control panel",
        "Remote filler station",
      ]),
    );
  });
});

describe("SR22T oxygen time above 12,500 ft through simTick (POH 3A-24)", () => {
  // 3.75 s is 1/16 min, exact in binary, so 480 ticks are exactly 30 min
  const DT = 3.75;
  const LIVE0 = structuredClone(live);
  const savedState = useSR22T.getState();
  const start = (p: Patch<Sim>) => {
    Object.assign(live, structuredClone(LIVE0));
    const s = sim(p);
    useSR22T.setState({ s, E: solve(s) });
  };
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) simTick(DT);
  };
  const rqd = () => {
    const { s, E } = useSR22T.getState();
    return casMessages(s, E).filter(([, t]) => t === "OXYGEN RQD");
  };
  const set = (fn: (d: Sim) => void) => useSR22T.getState().update(fn);

  beforeEach(() => start({ paFt: 13000 }));
  afterEach(() => {
    Object.assign(live, structuredClone(LIVE0));
    useSR22T.setState(savedState);
  });

  it("no OXYGEN RQD caution up to 30 min above 12,500 ft with oxygen off; the caution on the first tick past 30 min", () => {
    run(479);
    expect(rqd()).toEqual([]);
    run(1);
    expect(useSR22T.getState().s.oxy.above12k5Min).toBe(30);
    expect(rqd()).toEqual([]);
    run(1);
    expect(useSR22T.getState().s.oxy.above12k5Min).toBeGreaterThan(30);
    expect(rqd()).toEqual([["c", "OXYGEN RQD"]]);
  });

  it("dropping to 12,500 ft resets the count and clears the caution", () => {
    run(481);
    expect(rqd()).toEqual([["c", "OXYGEN RQD"]]);
    set((d) => {
      d.paFt = 12500;
    });
    run(1);
    expect(useSR22T.getState().s.oxy.above12k5Min).toBe(0);
    expect(rqd()).toEqual([]);
  });

  it("a value set from the panel is where the count continues", () => {
    set((d) => {
      d.oxy.above12k5Min = 40;
    });
    run(16);
    expect(useSR22T.getState().s.oxy.above12k5Min).toBe(41);
    expect(rqd()).toEqual([["c", "OXYGEN RQD"]]);
    set((d) => {
      d.oxy.on = true;
    });
    expect(rqd()).toEqual([]);
  });
});

describe("SR22T flight controls and airspeed markings", () => {
  it("airspeed markings up to 17,500 ft: white 64–110, green 74–176, yellow 176–205, red line 205 KIAS (POH 2-5)", () => {
    expect(SPEEDS.white).toEqual([64, 110]);
    expect(SPEEDS.green).toEqual([74, 176]);
    expect(SPEEDS.yellow).toEqual([176, 205]);
    expect(SPEEDS.red).toBe(205);
  });

  it("PFD green arc top and red line follow altitude (POH 2-4, 2-5)", () => {
    const cases: [number, number, [number, number], number][] = [
      [0, 176, [176, 205], 205],
      [17500, 176, [176, 205], 205],
      [21250, 163, [163, 190], 190],
      [25000, 150, [150, 175], 175],
    ];
    for (const [alt, greenTop, yellow, red] of cases) {
      const b = pfdSpeeds(alt);
      expect(b.green![1], `green top at ${alt} ft`).toBeCloseTo(greenTop, 9);
      expect(b.yellow![0], `yellow bottom at ${alt} ft`).toBeCloseTo(yellow[0], 9);
      expect(b.yellow![1], `yellow top at ${alt} ft`).toBeCloseTo(yellow[1], 9);
      expect(b.red, `red line at ${alt} ft`).toBeCloseTo(red, 9);
      expect(b.white, `white at ${alt} ft`).toEqual([64, 110]);
      expect(b.green![0], `green bottom at ${alt} ft`).toBe(74);
    }
  });

  it("the PFD tape reads the altitude-adjusted limits", () => {
    const high = sim({ paFt: 25000 });
    expect(pfdData(high, solve(high)).speeds.red).toBe(175);
    expect(initialSim.paFt).toBe(4000);
    expect(pfdData(initialSim, solve(initialSim)).speeds.red).toBe(205);
  });

  it("MD302 standby markings are not altitude-compensated (POH 7-20)", () => {
    expect(standbyBands()).toEqual({ white: [64, 110], green: [74, 176], yellow: [176, 205], red: 205 });
    expect(standbyBands.length).toBe(0); // no altitude input
  });

  it("changing a PFD or standby markings result leaves the POH 2-5 base markings unchanged (POH 7-20)", () => {
    for (const alt of [4000, 25000]) {
      const b = pfdSpeeds(alt);
      b.white![0] = 0;
      b.green![0] = 0;
      b.yellow![1] = 0;
      b.red = 0;
    }
    const standby = standbyBands();
    standby.green[1] = 0;
    standby.red = 0;
    const base = { white: [64, 110], green: [74, 176], yellow: [176, 205], red: 205 };
    expect(standbyBands()).toEqual(base);
    expect(pfdSpeeds(4000)).toMatchObject(base);
    expect(SPEEDS).toMatchObject(base);
  });

  it("reference speeds: Vr 77 (4-18), Vx 88 and Vy 103 (4-3), best glide 92 KIAS (3-10)", () => {
    expect([SPEEDS.vr, SPEEDS.vx, SPEEDS.vy, SPEEDS.vg]).toEqual([77, 88, 103, 92]);
    // the cyan references don't move with altitude
    const high = pfdSpeeds(25000);
    expect([high.vr, high.vx, high.vy, high.vg]).toEqual([77, 88, 103, 92]);
  });

  it("pitch and roll trim run on 2-amp breakers on ESS BUS 2 (POH 7-7, 7-9)", () => {
    const pitchOut = E({ cb: { "PITCH TRIM": true } });
    expect(pitchOut.pitchTrim).toBe(false);
    expect(pitchOut.rollTrim).toBe(true);
    const rollOut = E({ cb: { "ROLL TRIM": true } });
    expect(rollOut.pitchTrim).toBe(true);
    expect(rollOut.rollTrim).toBe(false);
    // ESS BUS 2 hangs straight off the Ess Dist Bus, which is diode-fed from MDB 1 / MDB 2 (both alternators and BAT 1)
    // and from BAT 2 only back through ESSENTIAL POWER (POH 7-50, Fig 7-10 on 7-48). A dual-alternator failure alone
    // leaves BAT 1 on the distribution buses, so BAT 1 must be dead too, and ESSENTIAL POWER pulled; BAT 2 still holds
    // ESS BUS 1 up, which shows the trims follow ESS BUS 2 rather than a total power loss.
    const essDead = E({
      elec: { fail: { alt1: true, alt2: true, bat1: true }, tBat: 20 },
      cb: { "ESSENTIAL POWER": true },
    });
    expect(essDead.ess2).toBe(0);
    expect(essDead.ess1).toBeGreaterThan(0);
    expect(essDead.pitchTrim).toBe(false);
    expect(essDead.rollTrim).toBe(false);
  });

  it("full control travel: aileron 12.5° up and down, elevator 25° up and 15° down, rudder 20° each way (AMM 6-00)", () => {
    const deg = (r: number) => (r * 180) / Math.PI;
    const pose = (ctrl: Sim["ctrl"]) => rigPose(sim({ ctrl }));
    expect(SURF_TRAVEL).toEqual({ ail: 12.5, elevUp: 25, elevDown: 15, rud: 20 });
    expect(deg(pose({ pitch: 1, roll: 0, yaw: 0 }).elevAng)).toBeCloseTo(25, 9);
    expect(deg(pose({ pitch: -1, roll: 0, yaw: 0 }).elevAng)).toBeCloseTo(-15, 9);
    expect(deg(pose({ pitch: 0, roll: 1, yaw: 0 }).ailAng)).toBeCloseTo(12.5, 9);
    expect(deg(pose({ pitch: 0, roll: -1, yaw: 0 }).ailAng)).toBeCloseTo(-12.5, 9);
    expect(deg(pose({ pitch: 0, roll: 0, yaw: 1 }).rudAng)).toBeCloseTo(20, 9);
    expect(deg(pose({ pitch: 0, roll: 0, yaw: -1 }).rudAng)).toBeCloseTo(-20, 9);
  });

  it("GFC 700 servos and trim adapter are drawn with their AMM 22-10 breakers", () => {
    const note = (name: string) => CAT.parts.find((p) => p.name === name)?.note ?? "";
    expect(note("Pitch servo actuator (GSA 81)")).toMatch(/5 A AP SERVOS breaker, MAIN BUS 1/);
    expect(note("Roll servo actuator (GSA 81)")).toMatch(/5 A AP SERVOS breaker, MAIN BUS 1/);
    expect(note("Yaw servo actuator (GSA 80)")).toMatch(/3 A YAW SERVO breaker, MAIN BUS 3/);
    expect(note("Pitch trim adapter")).toMatch(/2 A PITCH TRIM breaker, ESS BUS 2/);
    for (const n of ["Pitch servo actuator (GSA 81)", "Roll servo actuator (GSA 81)", "Yaw servo actuator (GSA 80)"])
      expect(note(n)).toMatch(/GSM 86/);
  });

  it("no Costanzo-deck claims on the control surfaces; trim tabs cite the POH (7-6, 7-9, 7-11), horn balances the AMM", () => {
    const surfaces = CAT.parts.filter((p) => /trim tab|horn balance|Static wick/.test(p.name ?? ""));
    for (const p of surfaces) expect(p.note ?? "", p.name).not.toMatch(/Costanzo/);
    const tab = (n: string) => CAT.parts.find((p) => p.name === n)!.note;
    expect(tab("Elevator horn balance + weight")).toMatch(/Fig 55-20-2 Detail A/);
    expect(tab("Rudder horn balance + weight")).toMatch(/Fig 55-40-1 Detail B/);
    expect(tab("Elevator trim tab (ground-adjustable)")).toMatch(/POH 7-6/);
    expect(tab("Aileron trim tab (ground-adjustable)")).toMatch(/POH 7-9/);
    expect(tab("Rudder trim tab (ground-adjustable)")).toMatch(/POH 7-11/);
  });
});

describe("SR22T turbochargers", () => {
  it("turbocharger maintains 36.0 in.Hg at full power (POH 4-14, 4-17)", () => {
    const p = { eng: { lever: 1, mix: 1 } };
    expect(mapInHg(sim(p), 2500)).toBe(36);
    expect(texts(p)).not.toContain("MAN PRESSURE");
  });
  it("MAN PRESSURE caution with cold oil on the first flight (POH 4-17, 3A-9)", () => {
    const p: Patch<Sim> = { eng: { lever: 1 }, turbo: { fail: "coldOil" } };
    expect(mapInHg(sim(p), 2500)).toBe(37);
    expect(cas(p)).toContainEqual(["c", "MAN PRESSURE"]);
    expect(cas(p)).not.toContainEqual(["w", "MAN PRESSURE"]);
  });
  it("wastegate stuck closed: MAP rises to the 37.5 in.Hg red line and the relief valve may lift (POH 2-9, 3-30)", () => {
    const p: Patch<Sim> = { eng: { lever: 1 }, turbo: { fail: "gateClosed" } };
    const s = sim(p);
    // The ceiling is an illustrative display limit, not a valve setting (AMM 81-20 35 vs POH 4-17 36.0).
    expect(mapInHg(s, 2500)).toBe(37.5);
    expect(cas(p)).toContainEqual(["c", "MAN PRESSURE"]);
    expect(cas(p)).not.toContainEqual(["w", "MAN PRESSURE"]);
    expect(overboostMayLift(s)).toBe(true);
    expect(wastegateOpen(s)).toBe(0);
    expect(flowRates(s, solve(s)).gateBypass).toBe(0);
    const reduced = sim({ ...p, eng: { lever: 0.6 } });
    expect(mapInHg(reduced, 2500)).toBeLessThan(30.5);
    expect(overboostMayLift(sim({ ...p, eng: { running: false } }))).toBe(false);
  });
  it("relief is qualitative: no MAP level makes the valve lift without a seized wastegate", () => {
    for (const fail of ["none", "coldOil", "leak", "highTit"] as const)
      for (const lever of [0, 0.25, 0.5, 0.75, 1])
        expect(overboostMayLift(sim({ eng: { lever }, turbo: { fail } })), `${fail} lever ${lever}`).toBe(false);
  });
  it("MAN PRESSURE caution above 36.5 and warning above 37.5 in.Hg (provisional POH 2-9 bands; 3A-9, 3-29)", () => {
    expect(manPressureCas(36.5)).toBeNull();
    expect(manPressureCas(36.6)).toBe("c");
    expect(manPressureCas(37.5)).toBe("c");
    expect(manPressureCas(37.6)).toBe("w");
  });
  it("unexpected loss of manifold pressure with an induction leak (POH 3-27)", () => {
    const p: Patch<Sim> = { eng: { lever: 1 }, turbo: { fail: "leak" } };
    const s = sim(p);
    expect(mapInHg(s, 2500)).toBeLessThan(36);
    expect(texts(p)).not.toContain("MAN PRESSURE");
    // A full-power leak calls for boost recovery, not exhaust bypass (POH 7-39; AMM 81-20).
    expect(wastegateOpen(s)).toBe(0);
    expect(flowRates(s, solve(s)).gateBypass).toBe(0);
    expect(flowRates(s, solve(s)).compressorL).toBeLessThan(flowRates(sim(), E()).compressorL);
  });
  it("High TIT puts the turbochargers past the 1750 °F limit and raises the TIT warning (POH 2-9, 3-30)", () => {
    const high: Patch<Sim> = { eng: { lever: 1 }, turbo: { fail: "highTit" } };
    expect(titState(sim(high))).toBe("high");
    expect(cas(high)).toContainEqual(["w", "TIT"]);
    expect(texts({ ...high, eng: { running: false } })).not.toContain("TIT");
    expect(titState(sim({ eng: { running: false } }))).toBe("off");
  });
  it("normal operation keeps TIT in the green band for any power or mixture: no knob-to-temperature mapping", () => {
    for (const fail of ["none", "coldOil", "leak", "gateClosed"] as const)
      for (const lever of [0, 0.5, 1])
        for (const mix of [0.3, 0.65, 1]) {
          const p: Patch<Sim> = { eng: { lever, mix }, turbo: { fail } };
          expect(titState(sim(p)), `${fail} ${lever} ${mix}`).toBe("normal");
          expect(texts(p)).not.toContain("TIT");
        }
  });
  it("turbo warnings list in the warning group, ahead of the cautions", () => {
    const t = texts({ eng: { lever: 1 }, turbo: { fail: "highTit" }, ...ALT1_FAIL });
    expect(t).toContain("ALT 1");
    expect(t.indexOf("TIT")).toBeGreaterThanOrEqual(0);
    expect(t.indexOf("TIT")).toBeLessThan(t.indexOf("ALT 1"));
  });
  it("without ENGINE INSTR power the turbo CAS stays silent (AMM 77-10)", () => {
    const off = { "ENGINE INSTR": true };
    expect(texts({ eng: { lever: 1 }, turbo: { fail: "gateClosed" }, cb: off })).not.toContain("MAN PRESSURE");
    expect(texts({ eng: { lever: 1 }, turbo: { fail: "coldOil" }, cb: off })).not.toContain("MAN PRESSURE");
    expect(texts({ eng: { lever: 1 }, turbo: { fail: "highTit" }, cb: off })).not.toContain("TIT");
  });
  it("engine stopped: no oil pressure, so the spring holds the wastegate 100 % open (TCM Overhaul Manual 81-20, p. 81-04)", () => {
    for (const fail of ["none", "coldOil", "leak", "highTit"] as const) {
      const stopped = sim({ eng: { running: false, lever: 1 }, turbo: { fail } });
      expect(wastegateOpen(stopped), fail).toBe(1);
      expect(wastegateReading(stopped), fail).toBe("100%");
    }
    // a seized gate cannot spring open (POH 3-30)
    expect(wastegateOpen(sim({ eng: { running: false }, turbo: { fail: "gateClosed" } }))).toBe(0);
    // no exhaust flows through the open gate with the engine stopped
    const s = sim({ eng: { running: false } });
    expect(flowRates(s, solve(s)).gateBypass).toBe(0);
    expect(wastegateReading(sim({ eng: { lever: 1 } }))).toBe("0%");
    expect(wastegateReading(sim({ eng: { lever: 0 } }))).toBe("100%");
  });
  it("controller opens the illustrative bypass at reduced power (POH 7-39); stopped oil flow ceases", () => {
    const full = sim({ eng: { lever: 1 } }),
      idle = sim({ eng: { lever: 0 } });
    expect(wastegateOpen(idle)).toBeGreaterThan(wastegateOpen(full));
    const s = sim({ eng: { running: false } }),
      rates = flowRates(s, solve(s));
    for (const key of [
      "turboOilL",
      "turboOilR",
      "turboScavL",
      "turboScavR",
      "gateOil",
      "deckRef",
      "gateBypass",
      "compressorL",
      "compressorR",
    ])
      expect(rates[key]).toBe(0);
  });
});
