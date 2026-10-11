import { afterEach, describe, expect, it } from "vitest";
import {
  breakerBus,
  busTable,
  casMessages,
  initialSim,
  liftHeatDuty,
  liftHeatGroundTime,
  live,
  solve,
} from "@/aircraft/sr22t/model";
import { useSR22T } from "@/aircraft/sr22t/store";
import { simTick } from "@/aircraft/sr22t/tick";
import { CAT } from "@/aircraft/sr22t/parts";
import { pinPolicy } from "@/components/scene/PinDeclutter";
import { patched } from "./helpers";

const caution = (s = initialSim) => casMessages(s, solve(s)).some(([, name]) => name === "ANTI ICE HTR");

afterEach(() => {
  useSR22T.setState({ s: structuredClone(initialSim), E: solve(initialSim) });
  live.liftHeatGroundSec = 0;
});

describe("FIKI lift-transducer heat (ref. 13772-134 Rev 05, applicability to the modelled airplane unconfirmed)", () => {
  it("uses PITOT HEAT switching (AMM 27-31 ¶B(2)(f), PDF p. 1038) and 25% ground / 100% airborne power (ref. p. 45)", () => {
    expect(liftHeatDuty(initialSim, solve(initialSim))).toBe(1);
    const ground = patched(initialSim, { stall: { onGround: true } });
    expect(liftHeatDuty(ground, solve(ground))).toBe(0.25);
    for (const s of [patched(ground, { pitot: { heat: false } }), patched(ground, { equip: { fiki: false } })]) {
      expect(liftHeatDuty(s, solve(s))).toBe(0);
      expect(caution(s)).toBe(false);
    }
  });

  it("feeds lift heat through STALL VANE HEAT (POH Fig 7-11, 7-52; AMM 27-31 ¶B(2)(e), PDF p. 1038) and requires inferred PITOT HEAT control power (ref. p. 15)", () => {
    for (const s of [
      patched(initialSim, { cb: { "STALL VANE HEAT": true } }),
      patched(initialSim, { elec: { bat1: false }, eng: { running: false } }),
    ]) {
      expect(liftHeatDuty(s, solve(s))).toBe(0);
      expect(caution(s)).toBe(true);
    }
    const pitotBreaker = patched(initialSim, { cb: { "PITOT HEAT": true } });
    expect(solve(pitotBreaker).pitotPwr).toBe(false);
    expect(liftHeatDuty(pitotBreaker, solve(pitotBreaker))).toBe(0);
    expect(caution(pitotBreaker)).toBe(true);
    const stallBreaker = patched(initialSim, { cb: { "STALL WARNING": true } });
    expect(liftHeatDuty(stallBreaker, solve(stallBreaker))).toBe(1);
    const rows = busTable(initialSim.equip).flatMap(([, , , loads]) => loads);
    expect(rows.find(([name]) => name === "STALL WARNING")).toEqual(["STALL WARNING", 2]);
    expect(rows.find(([name]) => name === "STALL VANE HEAT")).toEqual(["STALL VANE HEAT"]);
  });

  it("keeps PITOT HEAT and STALL VANE HEAT as separate NON-ESSENTIAL BUS breakers (AMM Fig 24-30-1, PDF p. 706)", () => {
    expect(breakerBus(initialSim.equip, "PITOT HEAT")).toBe("nonEss");
    expect(breakerBus(initialSim.equip, "STALL VANE HEAT")).toBe("nonEss");
    const pitotOnly = patched(initialSim, { cb: { "PITOT HEAT": true } });
    expect(solve(pitotOnly).liftHeatPwr).toBe(true);
    const vaneOnly = patched(initialSim, { cb: { "STALL VANE HEAT": true } });
    expect(solve(vaneOnly).pitotPwr).toBe(true);
  });

  it("tracks the 45-second pilot limit without inventing a cutoff or overheat CAS (p. 6)", () => {
    const s = patched(initialSim, { stall: { onGround: true } });
    useSR22T.setState({ s, E: solve(s) });
    live.liftHeatGroundSec = 44;
    simTick(1);
    expect(live.liftHeatGroundSec).toBe(45);
    simTick(0.1);
    expect(live.liftHeatGroundSec).toBeCloseTo(45.1);
    expect(liftHeatDuty(s, solve(s))).toBe(0.25);
    expect(casMessages(s, solve(s)).some(([, name]) => name === "AOA OVERHEAT")).toBe(false);
    for (const off of [
      patched(s, { pitot: { heat: false } }),
      patched(s, { stall: { onGround: false } }),
      patched(s, { cb: { "STALL VANE HEAT": true } }),
      patched(s, { cb: { "PITOT HEAT": true } }),
      patched(s, { equip: { fiki: false } }),
    ]) {
      expect(liftHeatGroundTime(45, off, solve(off), 1)).toBe(0);
    }
  });

  it("annunciates ANTI ICE HTR for heater failure without muting the functioning stall warning (pp. 11, 15)", () => {
    const s = patched(initialSim, { stall: { heaterFail: true, aoa: 15 } });
    expect(liftHeatDuty(s, solve(s))).toBe(0);
    expect(casMessages(s, solve(s))).toContainEqual(["c", "ANTI ICE HTR"]);
    expect(casMessages(s, solve(s))).toContainEqual(["w", "STALL"]);
    expect(caution(patched(s, { pitot: { heat: false } }))).toBe(false);
    expect(caution(patched(s, { equip: { fiki: false } }))).toBe(false);
    expect(caution(patched(initialSim, { stall: { fault: true } }))).toBe(false);
  });
});

it("prioritizes the fitted stall warning label in the pitot view without changing other views", () => {
  const policy = pinPolicy(CAT);
  for (const fiki of [true, false]) {
    const s = patched(initialSim, { equip: { fiki } });
    useSR22T.setState({ s, E: solve(s) });
    const name = fiki ? "Stall warning computer" : "Stall warning pressure switch";
    expect(CAT.pinned("pitot").some((p) => p.name === name)).toBe(true);
    expect(policy.rank(name, "pitot")).toBeLessThan(policy.rank("Alternate static valve", "pitot"));
    expect(policy.rank(name, "overview")).toBeGreaterThanOrEqual(0);
  }
});
