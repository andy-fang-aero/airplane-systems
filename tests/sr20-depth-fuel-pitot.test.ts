/**
 * SR20 G6 topology: POH 11934-005 Reissue A/Revision A1 7-41–7-45, 7-69–7-72;
 * SR20 AMM 12137-002 Rev A1 28-10 pp. 1–2, 28-20 pp. 1–2, 28-40 pp. 1–2,
 * 34-10 pp. 1–2, 9, 12, Figs 34-10-1/2, and 27-31 p. 1/Fig 27-31-1.
 */
import { describe, expect, it } from "vitest";
import { CAT } from "@/aircraft/sr20/parts";
import { FW } from "@/aircraft/sr20/geometry";
import { ENGINE_FUEL_PUMP } from "@/aircraft/sr20/engine-anchors";
import { ADAHRS_1, ADAHRS_2, GEA_71, MD302_POS } from "@/aircraft/sr20/parts/avionics";
import {
  COLLECTOR,
  DRAIN_MANIFOLD,
  FLAPPER,
  FUEL_PUMP,
  FUEL_SELECTOR,
  GASCOLATOR,
  GASCOLATOR_DRAIN,
  TANK_STRAINERS,
} from "@/aircraft/sr20/parts/fuel";
import {
  ALT_STATIC,
  DRAINS,
  OAT_1,
  OAT_2,
  PITOT_TIP,
  PITOT_Z,
  STALL_INLET,
  STALL_SWITCH,
  STALL_TRAP,
  STATIC_PORT,
  STATIC_TEE,
  SUMPS,
  TRAPS,
} from "@/aircraft/sr20/parts/pitot";
import {
  FUEL_PITOT_DEPTH_FLOWS as FLOWS,
  STATIC_BRANCH,
  STATIC_INSTRUMENT_TEE,
  fuelPitotDepthRates,
} from "@/aircraft/sr20/fuel-pitot-depth-flow";
import { BUSES, initialSim, solve } from "@/aircraft/sr20/model";
import { toV } from "@/lib/math";
import { patched } from "./helpers";
import { useSR20 } from "@/aircraft/sr20/store";
import { FLOWS as INTEGRATED_FLOWS, flowRates } from "@/aircraft/sr20/flows";

const named = (name: string) => CAT.parts.filter((p) => p.name === name);
const pts = (key: string) => {
  const f = FLOWS.find((flow) => flow.key === key);
  expect(f, key).toBeDefined();
  return f!.pts.map((p) => toV(p).toArray());
};
const end = (key: string) => pts(key).at(-1)!;
const rates = (s = initialSim) => fuelPitotDepthRates(s, solve(s));

describe("SR20 G6 storage and selector (AMM 28-10 pp. 1–2)", () => {
  it("retains the G6 quantities and five independent sampling drains", () => {
    expect(named("Tank outlet strainer")).toHaveLength(4);
    expect(named("Flapper valve")).toHaveLength(2);
    expect(named("Fuel baffle rib")).toHaveLength(4);
    for (const n of ["Fuel quantity sensor (inboard)", "Fuel quantity sensor (outboard)"])
      expect(named(n)).toHaveLength(2);
    expect(
      CAT.parts.filter((p) => ["Tank drain", "Collector drain", "Gascolator drain"].includes(p.name ?? "")),
    ).toHaveLength(5);
    for (const cap of named("Filler cap")) {
      expect(cap.note).toContain("28 gal usable");
      expect(cap.note).toContain("13 gal usable");
      expect(cap.note).toContain("100 ohm");
      expect(cap.note).not.toContain("30 gal");
    }
    expect(named("Gascolator drain")[0].pos).toEqual(GASCOLATOR_DRAIN);
    expect(GASCOLATOR_DRAIN[0]).toBeGreaterThan(FW);
    expect(Math.abs(GASCOLATOR_DRAIN[2])).toBeLessThan(0.1);
  });

  it("uses the modelled SR20 POH's 5 A FUEL QTY circuit with the AMM disagreement documented", () => {
    // POH 7-95 Hour Meters expressly gives 5 A FUEL QTY; AMM 28-40 p. 1 instead says 3 A.
    expect(BUSES.find(([bus]) => bus === "main1")![3].find(([name]) => name === "FUEL QTY")![1]).toBe(5);
    for (const name of ["Fuel quantity sensor (inboard)", "Fuel quantity sensor (outboard)"])
      for (const sender of named(name)) {
        expect(sender.note).toContain("5 A FUEL QTY");
        expect(sender.note).toContain("AMM says 3 A");
        expect(sender.note).toContain("7-95");
        expect(sender.note).toContain("12137-002");
        expect(sender.note).not.toContain("13773-002");
      }
  });

  it("both strainer ports feed their own flapper and collector, then only the selected tank feeds", () => {
    for (const s of [-1, 1]) {
      const side = s < 0 ? "L" : "R";
      for (const i of [0, 1]) {
        const p = pts(`fuelTank${side}${i === 0 ? "" : "2"}`);
        expect(p).toEqual([TANK_STRAINERS(s)[i], FLAPPER(s), COLLECTOR(s)]);
      }
      expect(pts(`fuel${side}`)[0]).toEqual(COLLECTOR(s));
      expect(end(`fuel${side}`)).toEqual(FUEL_SELECTOR);
      for (const sel of ["L", "R", "OFF"] as const) {
        const r = rates(patched(initialSim, { eng: { running: true }, fuel: { sel } }));
        for (const key of [`fuel${side}`, `fuelTank${side}`, `fuelTank${side}2`])
          expect(r[key] > 0, key).toBe(sel === side);
      }
    }
  });

  it("each tank and collector has independent static vent plumbing", () => {
    for (const side of ["L", "R"]) {
      expect(FLOWS.find((f) => f.key === `fuelVent${side}`)!.count).toBe(0);
      expect(FLOWS.find((f) => f.key === `collectorVent${side}`)!.count).toBe(0);
      for (const run of [false, true]) {
        const r = rates(patched(initialSim, { eng: { running: run } }));
        expect(r[`fuelVent${side}`]).toBe(0);
        expect(r[`collectorVent${side}`]).toBe(0);
      }
    }
  });
});

describe("SR20 Lycoming airframe fuel feed (POH 7-42; AMM 28-20 pp. 1–2)", () => {
  it("puts the electric pump and gascolator forward of firewall in supply order", () => {
    expect(FUEL_PUMP[0]).toBeGreaterThan(FW);
    expect(GASCOLATOR[0]).toBeGreaterThan(FW);
    const supply = pts("fuelMain");
    const visited = [FUEL_SELECTOR, FUEL_PUMP, GASCOLATOR, ENGINE_FUEL_PUMP].map((anchor) =>
      supply.findIndex((p) => p.every((v, i) => v === anchor[i])),
    );
    expect(visited.every((i) => i >= 0)).toBe(true);
    expect(visited).toEqual([...visited].sort((a, b) => a - b));
    expect(end("fuelMain")).toEqual(ENGINE_FUEL_PUMP);
    expect(named("Electric boost pump")[0].note).toContain("Single-speed");
    expect(named("Electric boost pump")[0].note).toContain("23 psi");
    expect(FLOWS.some((f) => /fuelRet/.test(f.key))).toBe(false);
  });

  it("keeps leakage drains static and joins them at the bottom-centre firewall manifold", () => {
    for (const key of ["fuelDrainAux", "fuelDrainGas", "fuelDrainEngine", "fuelDrainInduction"])
      expect(end(key), key).toEqual(DRAIN_MANIFOLD);
    expect(end("fuelDrainOutlet")).toEqual(GASCOLATOR_DRAIN);
    for (const run of [false, true])
      for (const boost of [false, true]) {
        const r = rates(patched(initialSim, { eng: { running: run }, fuel: { boost } }));
        for (const f of FLOWS.filter((flow) => flow.key.startsWith("fuelDrain"))) {
          expect(f.count).toBe(0);
          expect(r[f.key]).toBe(0);
        }
      }
  });

  it("quantity senders terminate at GEA and lose their data signal with FUEL QTY power", () => {
    for (const side of ["L", "R"])
      for (const i of [1, 2]) {
        const key = `fuelQty${side}${i}`;
        expect(end(key)).toEqual(GEA_71);
        expect(rates()[key]).toBeGreaterThan(0);
        expect(rates(patched(initialSim, { cb: { "FUEL QTY": true } }))[key]).toBe(0);
        expect(rates(patched(initialSim, { cb: { "ENGINE INSTR": true } }))[key]).toBe(0);
      }
  });
});

describe("SR20 pitot/static and independent standby branches (POH Fig 7-16 7-72)", () => {
  it("places one pitot near LH wingtip with the documented 3.6-inch forward tube", () => {
    expect(PITOT_Z).toBeLessThan(-4.8);
    expect(PITOT_Z).toBeGreaterThan(-5.55);
    expect(named("Heated pitot tube")).toHaveLength(1);
    expect(PITOT_TIP.entry[0] - PITOT_TIP.bend[0]).toBeCloseTo(3.6 * 0.0254);
    const g = named("Heated pitot tube")[0].geo();
    try {
      g.computeBoundingBox();
      expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeCloseTo(3.6 * 0.0254);
    } finally {
      g.dispose();
    }
    expect(OAT_1[2]).toBeGreaterThan(0);
    expect(OAT_2[2]).toBeGreaterThan(0);
    expect(end("oat1")).toEqual(ADAHRS_1);
    expect(end("oat2")).toEqual(ADAHRS_2);
  });

  it("each static port reaches its own sump and the common CAPS bulkhead tee", () => {
    for (const [key, s, sump] of [
      ["static", 1, SUMPS[0]],
      ["staticL", -1, SUMPS[1]],
    ] as const) {
      expect(pts(key)[0]).toEqual(STATIC_PORT(s));
      expect(pts(key)[1]).toEqual(sump);
      expect(end(key)).toEqual(STATIC_TEE);
    }
    expect(pts("static2")[0]).toEqual(STATIC_TEE);
    expect(pts("static2")).toContainEqual(TRAPS.static);
    expect(pts("pitot")).toContainEqual(TRAPS.pitot);
    expect(pts("staticConsole")).toContainEqual(TRAPS.staticConsole);
    expect(named("Console static water trap")).toHaveLength(1);
    for (const [key, trap] of [
      ["pitot", TRAPS.pitot],
      ["static2", TRAPS.static],
      ["staticConsole", TRAPS.staticConsole],
    ] as const)
      expect(Math.min(...pts(key).map((p) => p[1])), key).toBe(trap[1]);
  });

  it("ADAHRS 1, optional ADAHRS 2 and MD302 have separate branches from common sources", () => {
    for (const [suffix, target] of [
      ["Adahrs", ADAHRS_1],
      ["Adahrs2", ADAHRS_2],
      ["Stby", MD302_POS],
    ] as const) {
      expect(end(`pitot${suffix}`)).toEqual(target);
      expect(end(`static${suffix}`)).toEqual(target);
    }
    const powerless = patched(initialSim, { eng: { running: false }, elec: { bat1: false, bat2: false } });
    expect(solve(powerless).ahrs1).toBe(false);
    expect(solve(powerless).stby).toBe(false);
    for (const key of ["pitotAdahrs", "pitotAdahrs2", "pitotStby", "staticAdahrs", "staticAdahrs2", "staticStby"])
      expect(rates(powerless)[key]).toBeGreaterThan(0);
    const single = rates(patched(initialSim, { avx: { dualAdahrs: false } }));
    for (const key of ["pitotAdahrs2", "staticAdahrs2", "oat2"]) expect(single[key]).toBe(0);
    expect(single.pitotAdahrs).toBeGreaterThan(0);
    expect(single.pitotStby).toBeGreaterThan(0);
  });

  it("removes the optional second OAT sensor from the catalogue when the second ADC is absent", () => {
    const saved = useSR20.getState();
    try {
      const s = patched(initialSim, { avx: { dualAdahrs: false } });
      useSR20.setState({ s, E: solve(s) });
      expect(CAT.partsFor().some((p) => p.name === "OAT sensor 1")).toBe(true);
      expect(CAT.partsFor().some((p) => p.name === "OAT sensor 2")).toBe(false);
      expect(CAT.pinned("pitot").some((p) => p.name === "OAT sensor 2")).toBe(false);
    } finally {
      useSR20.setState(saved);
    }
  });

  it("alternate cabin source reaches all static instruments through the console trap", () => {
    expect(pts("staticAlt")[0]).toEqual(ALT_STATIC);
    expect(end("staticAlt")).toEqual(STATIC_BRANCH);
    expect(pts("staticConsole")[0]).toEqual(STATIC_BRANCH);
    expect(end("staticConsole")).toEqual(STATIC_INSTRUMENT_TEE);
    const r = rates(patched(initialSim, { pitot: { alt: true } }));
    for (const key of ["static", "staticL", "static2"]) expect(r[key]).toBe(0);
    for (const key of ["staticAlt", "staticConsole", "staticAdahrs", "staticAdahrs2", "staticStby"])
      expect(r[key]).toBeGreaterThan(0);
    expect(rates().staticAlt).toBe(0);
  });

  it("each low-point drain tube terminates below its trap at its own plug", () => {
    for (const line of ["pitot", "static", "staticConsole", "stall"] as const) {
      const { tube, plug } = DRAINS[line];
      expect(tube.at(-1)).toEqual(plug);
      expect(plug[1]).toBeLessThan(tube[0][1]);
      for (const p of tube) expect(p[1]).toBeLessThanOrEqual(tube[0][1]);
    }
  });

  it("stall suction travels through its water trap to the diaphragm switch, while powered electrical signal drives warning", () => {
    const p = pts("stall");
    expect(p[0]).toEqual(STALL_INLET);
    expect(p).toContainEqual(STALL_TRAP);
    expect(p.at(-1)).toEqual(STALL_SWITCH);
    expect(rates(patched(initialSim, { stall: { aoa: 14 } })).stall).toBe(-1);
    const unpowered = patched(initialSim, { stall: { aoa: 14 }, cb: { "STALL WARNING": true } });
    expect(rates(unpowered).stall).toBe(-1);
    expect(rates(unpowered).stallSignal).toBe(0);
    const failed = rates(patched(initialSim, { stall: { aoa: 14, fault: true } }));
    expect(failed.stall).toBe(0);
    expect(failed.stallSignal).toBe(0);
  });
});

it("integrates each sourced replacement once and preserves the normal/alternate source rates", () => {
  for (const replacement of FLOWS) {
    const matches = INTEGRATED_FLOWS.filter((f) => f.key === replacement.key);
    expect(matches, replacement.key).toHaveLength(1);
    expect(matches[0].pts, replacement.key).toEqual(replacement.pts);
  }
  for (const alt of [false, true]) {
    const s = patched(initialSim, { pitot: { alt } });
    const combined = flowRates(s, solve(s)),
      sourced = rates(s);
    for (const flow of FLOWS) expect(combined[flow.key], flow.key).toBe(sourced[flow.key]);
  }
});
