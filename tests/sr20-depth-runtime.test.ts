/** G6 optional GSU 75 redundancy (POH 7-72/7-76) and manual alternate air (7-34/7-39). */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inductionAvailable, initialSim, live, solve, type Sim } from "@/aircraft/sr20/model";
import { useSR20 } from "@/aircraft/sr20/store";
import { simTick } from "@/aircraft/sr20/tick";
import { flowRates } from "@/aircraft/sr20/flows";
import { patched, type Patch } from "./helpers";

const set = (p: Patch<Sim> = {}) => {
  const s = patched(initialSim, p);
  useSR20.setState({ s, E: solve(s) });
};
const state = () => useSR20.getState();
const advance = (seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) simTick(0.25);
};
let kept: ReturnType<typeof useSR20.getState>;
let keptLive: typeof live;
beforeEach(() => {
  kept = state();
  keptLive = { ...live };
  Object.assign(live, { rpm: 2500, starve: 0, startTimer: 0, crankT: 0 });
  set();
});
afterEach(() => {
  useSR20.setState({ s: kept.s, E: kept.E });
  Object.assign(live, keptLive);
});

describe("IO-390 engine-driven fuel during cranking (POH 7-42–7-43; AMM 28-20)", () => {
  const enginePath = ["fuelMain", "engineFuel", "meteredFuel", "dividerFeed", "inj1", "inj2", "inj3", "inj4"];
  it.each(["L", "R"] as const)("connects the selected %s tank to every injector during START without boost", (sel) => {
    set({ eng: { running: false, key: "START" }, fuel: { sel, boost: false } });
    live.rpm = 0;
    const { s, E } = state();
    expect(E.starterPwr).toBe(true);
    expect(E.boostPwr && s.fuel.boost).toBe(false);
    const rates = flowRates(s, E);
    for (const key of [`fuelTank${sel}`, `fuelTank${sel}2`, `fuel${sel}`, ...enginePath])
      expect(rates[key], key).toBeGreaterThan(0);
    const other = sel === "L" ? "R" : "L";
    for (const key of [`fuelTank${other}`, `fuelTank${other}2`, `fuel${other}`]) expect(rates[key], key).toBe(0);
  });

  const unavailable: [string, Patch<Sim>][] = [
    ["unpowered starter", { elec: { bat1: false } }],
    ["closed selector", { fuel: { sel: "OFF" } }],
    ["empty selected tank", { fuel: { qL: 0 } }],
  ];
  it.each(unavailable)("keeps both halves stopped with an %s", (_, patch) => {
    const starting = patched(initialSim, { eng: { running: false, key: "START" }, fuel: { sel: "L", boost: false } });
    const s = patched(starting, patch);
    live.rpm = 0;
    const rates = flowRates(s, solve(s));
    for (const key of ["fuelTankL", "fuelTankL2", "fuelL", "fuelR", ...enginePath]) expect(rates[key], key).toBe(0);
  });
});

describe("SR20 optional ADAHRS is separate from standby and display power", () => {
  it("does not invent a second air-data source when the option is absent", () => {
    set({ avx: { dualAdahrs: false }, cb: { "ADAHRS 1": true } });
    expect(state().E).toMatchObject({ ahrs1: false, ahrs2: false, pfd: true, mfd: true, stby: true });
  });

  it("the optional unit survives a primary failure but needs its own breaker and MAIN BUS 2", () => {
    set({ avx: { ahrs1Fail: true } });
    expect(state().E).toMatchObject({ ahrs1: false, ahrs2: true, stby: true });
    state().update((d) => {
      d.cb["ADAHRS 2"] = true;
    });
    expect(state().E).toMatchObject({ ahrs1: false, ahrs2: false, stby: true });
    set({ elec: { fail: { alt1: true, alt2: true }, tBat: 20 } });
    expect(state().E).toMatchObject({ ahrs1: true, ahrs2: false, stby: true });
  });
});

describe("SR20 blocked induction and pilot-controlled alternate air", () => {
  it("a blocked filter does not open the alternate-air door automatically", () => {
    set({ eng: { filterBlocked: true } });
    expect(inductionAvailable(state().s)).toBe(false);
    advance(4);
    expect(state().s.eng).toMatchObject({ running: false, altAir: false });
  });

  it("opening alternate air before supply is lost keeps the engine running", () => {
    set({ eng: { filterBlocked: true } });
    advance(1);
    state().update((d) => {
      d.eng.altAir = true;
    });
    advance(4);
    expect(inductionAvailable(state().s)).toBe(true);
    expect(state().s.eng.running).toBe(true);
    expect(live.starve).toBe(0);
  });

  it("cranking cannot start a blocked engine until alternate air is opened", () => {
    const start = (altAir: boolean) => {
      set({ eng: { running: false, key: "START", filterBlocked: true, altAir } });
      Object.assign(live, { rpm: 0, crankT: 0, startTimer: 1.8 });
      advance(2);
    };
    start(false);
    expect(state().s.eng.running).toBe(false);
    start(true);
    expect(state().s.eng.running).toBe(true);
  });

  it("magnetos and engine-driven fuel supply keep working with electrical masters off", () => {
    set({ elec: { bat1: false, bat2: false, alt1: false, alt2: false } });
    advance(4);
    expect(state().s.eng.running).toBe(true);
    expect(state().E).toMatchObject({ eisPwr: false, boostPwr: false, starterPwr: false });
  });
});
