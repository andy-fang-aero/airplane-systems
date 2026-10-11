/**
 * SR22T runtime behaviour (still the SR20's, copied by the scaffold): the per-frame tick, the flow rules, the control
 * linkage, the display reversion and engine-strip power, the CAPS clock, and that none of it leaks into the SR20.
 * Every test starts from `initialSim` with fresh `live` values and advances time with a fixed step.
 */
import type { Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flowRates } from "@/aircraft/sr22t/flows";
import { eisGauges, mfdReversion, pfdReversion } from "@/aircraft/sr22t/displays";
import { FLAP_DEG, initialSim, live, solve, type Sim } from "@/aircraft/sr22t/model";
import { capsPhase } from "@/aircraft/sr22t/Parachute";
import { linkPoints, rigPose, SURF_TRAVEL } from "@/aircraft/sr22t/rig";
import { resetCaps, startCaps, useSR22T } from "@/aircraft/sr22t/store";
import { simTick } from "@/aircraft/sr22t/tick";
import { initialSim as sr20Initial, live as sr20Live, solve as sr20Solve } from "@/aircraft/sr20/model";
import { resetCaps as sr20ResetCaps, startCaps as sr20StartCaps, useSR20 } from "@/aircraft/sr20/store";
import { patched, type Patch } from "./helpers";

/** A step that is exact in binary, so accumulated times hit their thresholds on a known tick. */
const DT = 0.25;
const LIVE0 = { ...live };
const SR20_LIVE0 = { ...sr20Live };

const st = () => useSR22T.getState().s;
const up = (fn: (d: Sim) => void) => useSR22T.getState().update(fn);
const set = (patch: Patch<Sim>) => {
  const s = patched(initialSim, patch);
  useSR22T.setState({ s, E: solve(s) });
};
const run = (seconds: number) => {
  for (let i = 0; i < seconds / DT; i++) simTick(DT);
};
/** What the ignition key's START position does in the powerplant panel. */
const turnKeyToStart = () => {
  live.startTimer = 1.8;
  live.crankT = 0;
  up((d) => {
    d.eng.key = "START";
  });
};

beforeEach(() => {
  Object.assign(live, LIVE0);
  Object.assign(sr20Live, SR20_LIVE0);
  useSR22T.setState({ s: structuredClone(initialSim), E: solve(initialSim) });
  useSR20.setState({ s: structuredClone(sr20Initial), E: sr20Solve(sr20Initial) });
  // startCaps scrolls the 3D view into sight on phones; the test runs without a page
  vi.stubGlobal("document", { querySelector: () => null });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SR22T engine start, cutoff and starvation (simTick)", () => {
  const stopped: Patch<Sim> = { eng: { running: false, key: "BOTH" } };

  it("cranks with the key at START and starts after 1.3 s with fuel and mixture, then the key springs back to BOTH", () => {
    set(stopped);
    live.rpm = 0;
    turnKeyToStart();
    run(5 * DT);
    expect(st().eng.running).toBe(false);
    expect(live.rpm).toBeGreaterThan(0); // starter turning the engine
    simTick(DT); // crank time 1.5 s
    expect(st().eng.running).toBe(true);
    expect(st().eng.key).toBe("START");
    run(2 * DT); // start timer 1.8 s runs out
    expect(st().eng.key).toBe("BOTH");
    expect(st().eng.running).toBe(true);
  });

  it("does not start with the fuel selector OFF, and the key still returns to BOTH", () => {
    set({ ...stopped, fuel: { sel: "OFF" } });
    turnKeyToStart();
    run(3);
    expect(st().eng.running).toBe(false);
    expect(st().eng.key).toBe("BOTH");
  });

  it("does not crank without starter power (BAT 1 off)", () => {
    set({ ...stopped, elec: { bat1: false } });
    live.rpm = 0;
    turnKeyToStart();
    run(1);
    expect(live.rpm).toBe(0);
    expect(st().eng.running).toBe(false);
  });

  it("stops at once with the mixture at cutoff", () => {
    up((d) => {
      d.eng.mix = 0;
    });
    simTick(DT);
    expect(st().eng.running).toBe(false);
  });

  it("stops at once with the key OFF, and RPM winds down to zero", () => {
    up((d) => {
      d.eng.key = "OFF";
    });
    simTick(DT);
    expect(st().eng.running).toBe(false);
    run(30);
    expect(live.rpm).toBe(0);
  });

  it("keeps running for 3 s on an empty selected tank, then starves", () => {
    up((d) => {
      d.fuel.qL = 0;
    });
    run(3);
    expect(st().eng.running).toBe(true);
    simTick(DT);
    expect(st().eng.running).toBe(false);
  });

  it("settles at the governed 2,500 RPM in cruise and at full power (POH 7-32)", () => {
    run(30);
    expect(live.rpm).toBeCloseTo(2500, 0);
    up((d) => {
      d.eng.lever = 1;
    });
    run(30);
    expect(live.rpm).toBeCloseTo(2500, 0);
  });
});

describe("SR22T flap motor (simTick)", () => {
  it("drives at the illustrative ~4°/s rate (unsourced) toward the selected position with FLAPS power and stops there", () => {
    up((d) => {
      d.flaps.cmd = 100;
    });
    run(1);
    expect(live.flapAng).toBeCloseTo(4, 6);
    run(10);
    expect(live.flapAng).toBeCloseTo(FLAP_DEG[100], 6);
  });

  it("does not move with the FLAPS breaker pulled", () => {
    up((d) => {
      d.flaps.cmd = 100;
      d.cb = { FLAPS: true };
    });
    run(5);
    expect(live.flapAng).toBe(0);
  });

  it("does not move with every bus dead", () => {
    up((d) => {
      d.eng.running = false;
      d.elec.bat1 = false;
      d.elec.bat2 = false;
      d.flaps.cmd = 50;
    });
    run(5);
    expect(live.flapAng).toBe(0);
  });
});

describe("SR22T CAPS clock", () => {
  it("stays at rest (Ready) until the handle is pulled", () => {
    run(5);
    expect(live.capsT).toBe(-1);
    expect(st().capsOn).toBe(false);
  });

  it("runs from 0 when pulled, steps through the phases, and stops at 16 s", () => {
    startCaps();
    expect(st().capsOn).toBe(true);
    expect(live.capsT).toBe(0);
    expect(capsPhase(live.capsT)[1]).toBe("Handle pulled");
    run(1);
    expect(live.capsT).toBe(1);
    expect(capsPhase(live.capsT)[1]).toBe("Rocket extraction");
    run(9);
    expect(capsPhase(live.capsT)[1]).toBe("Descent");
    run(10);
    expect(live.capsT).toBe(16);
    expect(live.capsPlaying).toBe(false);
  });

  it("holds its time while paused", () => {
    startCaps();
    run(2);
    live.capsPlaying = false;
    run(3);
    expect(live.capsT).toBe(2);
  });

  it("returns to rest on reset", () => {
    startCaps();
    run(4);
    resetCaps();
    expect(live.capsT).toBe(-1);
    expect(live.capsPlaying).toBe(false);
    expect(st().capsOn).toBe(false);
    run(2);
    expect(live.capsT).toBe(-1);
  });
});

describe("SR22T flow rates", () => {
  const rates = (patch: Patch<Sim>) => {
    const s = patched(initialSim, patch);
    return flowRates(s, solve(s));
  };

  it("engine stopped: no fuel, induction, exhaust or oil flow; alternators idle; BAT 1 discharging", () => {
    const R = rates({ eng: { running: false } });
    for (const k of [
      "fuelL",
      "fuelR",
      "fuelMain",
      "inj1",
      "man1",
      "exh1",
      "intakeL",
      "intakeR",
      "tailpipeL",
      "tailpipeR",
      "oil",
    ])
      expect(R[k], k).toBe(0);
    expect(R.alt1).toBe(0);
    expect(R.alt2).toBe(0);
    expect(R.bat1).toBe(1);
  });

  it("engine running: feed from the selected tank only, alternators on line, BAT 1 charging", () => {
    const R = rates({});
    expect(R.fuelL).toBe(1);
    expect(R.fuelR).toBe(0);
    expect(R.fuelMain).toBe(1);
    expect(R.inj1).toBe(1);
    expect(R.oil).toBe(0.7);
    expect(R.tailpipeL).toBe(1.2);
    expect(R.tailpipeR).toBe(1.2);
    expect(R.alt1).toBe(1);
    expect(R.alt2).toBe(1);
    expect(R.bat1).toBe(-0.6);
    expect(R.cbMdb1).toBe(1);
  });

  it("boost pump moves fuel with the engine stopped, faster than the engine-driven pump", () => {
    expect(rates({ eng: { running: false }, fuel: { pump: "BOOST" } }).fuelMain).toBe(1.4);
  });

  it("no feed from an empty selected tank, and no injector flow", () => {
    const R = rates({ fuel: { sel: "R", qR: 0 } });
    expect(R.fuelR).toBe(0);
    expect(R.fuelMain).toBe(0);
    expect(R.inj1).toBe(0);
  });

  it("everything off: no electrical flow at all", () => {
    const R = rates({ eng: { running: false }, elec: { bat1: false, bat2: false } });
    for (const k of [
      "alt1",
      "alt2",
      "bat1",
      "bat2",
      "cbMdb1",
      "cbMdb2",
      "cbEss",
      "starterCable",
      "landFeed",
      "landLamp",
    ])
      expect(R[k], k).toBe(0);
  });
});

describe("SR22T control linkage (rigPose)", () => {
  const pose = (ctrl: Partial<Sim["ctrl"]>) => {
    const s = patched(initialSim, { ctrl });
    return { s, p: rigPose(s) };
  };
  const len = ([a, b]: [Vector3, Vector3]) => a.distanceTo(b);

  it("neutral controls leave every surface, sector and pulley at rest", () => {
    const { p } = pose({});
    expect(p.elevAng).toBe(0);
    expect(p.ailAng).toBe(0);
    expect(p.rudAng).toBe(0);
    expect(p.pedal).toBe(0);
    expect(p.ett).toBeCloseTo(0, 6);
    for (const [k, v] of Object.entries(p.pulley)) expect(v, k).toBeCloseTo(0, 3);
  });

  it("full aft yoke raises the elevator 25° (full push lowers it 15°) and turns the forward and aft pulleys in opposite senses (AMM 6-00)", () => {
    const { p } = pose({ pitch: 1 });
    expect(SURF_TRAVEL.elevUp).toBe(25);
    expect(SURF_TRAVEL.elevDown).toBe(15);
    expect(p.elevAng).toBeCloseTo((SURF_TRAVEL.elevUp * Math.PI) / 180, 9);
    expect(pose({ pitch: -1 }).p.elevAng).toBeCloseTo((-SURF_TRAVEL.elevDown * Math.PI) / 180, 9);
    expect(p.ett).not.toBeCloseTo(0, 2);
    expect(Math.sign(p.pulley.ef)).toBe(-Math.sign(p.pulley.ea));
    expect(Math.sign(pose({ pitch: -1 }).p.ett)).toBe(-Math.sign(p.ett));
  });

  it("full roll deflects the ailerons 12.5° and turns the two wing sectors (AMM 6-00)", () => {
    const { p } = pose({ roll: 1 });
    expect(SURF_TRAVEL.ail).toBe(12.5);
    expect(p.ailAng).toBeCloseTo((SURF_TRAVEL.ail * Math.PI) / 180, 9);
    expect(p.pulley.awR).not.toBeCloseTo(0, 2);
    expect(p.pulley.awL).not.toBeCloseTo(0, 2);
    expect(p.pulley.atR).toBeCloseTo(-p.pulley.atL, 9);
  });

  it("full rudder deflects the rudder 20° and moves the pedals (AMM 6-00)", () => {
    const { p } = pose({ yaw: 1 });
    expect(SURF_TRAVEL.rud).toBe(20);
    expect(p.rudAng).toBeCloseTo((SURF_TRAVEL.rud * Math.PI) / 180, 9);
    expect(p.pedal).toBeGreaterThan(0);
    expect(pose({ yaw: -1 }).p.pedal).toBeLessThan(0);
  });

  it("rigid links keep their length through full travel", () => {
    const n = pose({}),
      L0 = linkPoints(n.s, n.p);
    for (const ctrl of [{ pitch: 1 }, { pitch: -1 }, { roll: 1 }, { roll: -1 }]) {
      const d = pose(ctrl),
        L = linkPoints(d.s, d.p);
      for (const k of ["drop1", "drop-1", "cone1", "cone-1"])
        expect(len(L[k]), `${k} ${JSON.stringify(ctrl)}`).toBeCloseTo(len(L0[k]), 3);
    }
  });
});

describe("SR22T displays", () => {
  const E = (patch: Patch<Sim>) => {
    const s = patched(initialSim, patch);
    return { s, E: solve(s) };
  };

  it("normal: PFD and MFD each show their own page", () => {
    const { s, E: e } = E({});
    expect(e.pfd && e.mfd).toBe(true);
    expect(pfdReversion(s, e)).toBe(false);
    expect(mfdReversion(s, e)).toBe(false);
  });

  it("MFD lost (both MFD breakers pulled): the PFD reverts", () => {
    const { s, E: e } = E({ cb: { "MFD A": true, "MFD B": true } });
    expect(e.mfd).toBe(false);
    expect(pfdReversion(s, e)).toBe(true);
  });

  it("PFD failed: the MFD reverts", () => {
    const { s, E: e } = E({ avx: { pfdFail: true } });
    expect(e.pfd).toBe(false);
    expect(mfdReversion(s, e)).toBe(true);
    expect(pfdReversion(s, e)).toBe(false);
  });

  it("DISPLAY BACKUP puts both displays in reversion", () => {
    const { s, E: e } = E({ avx: { backup: true } });
    expect(pfdReversion(s, e)).toBe(true);
    expect(mfdReversion(s, e)).toBe(true);
  });

  it("no power at all: neither display is on, so neither reverts", () => {
    const { s, E: e } = E({ eng: { running: false }, elec: { bat1: false, bat2: false } });
    expect(e.pfd || e.mfd).toBe(false);
    expect(pfdReversion(s, e) || mfdReversion(s, e)).toBe(false);
  });

  it("the engine strip reads the sim with ENGINE INSTR power", () => {
    live.rpm = 2504;
    const { s, E: e } = E({});
    const g = Object.fromEntries(eisGauges(s, e).map((x) => [x.key, x]));
    expect(g.rpm.value).toBe(2500);
    expect(g.fuel.value).toBe(24);
    expect(g.fuel.value2).toBe(22);
    expect(g.ess.value).toBe(e.ess1);
    for (const x of Object.values(g)) expect(x.value, x.key).not.toBeNull();
  });

  it("losing ENGINE INSTR power red-X's every engine strip item", () => {
    const { s, E: e } = E({ cb: { "ENGINE INSTR": true } });
    expect(e.eisPwr).toBe(false);
    for (const x of eisGauges(s, e)) {
      expect(x.value, x.key).toBeNull();
      expect(x.value2 ?? null, x.key).toBeNull();
    }
    expect(eisGauges(s, e).find((x) => x.key === "fuel")!.side!.value).toBeNull();
  });
});

describe("SR22T state is separate from the SR20", () => {
  it("SR22T switch changes leave the SR20 store alone", () => {
    up((d) => {
      d.elec.bat1 = false;
      d.eng.key = "OFF";
      d.cb = { FLAPS: true };
    });
    expect(st().elec.bat1).toBe(false);
    expect(useSR20.getState().s).toEqual(sr20Initial);
  });

  it("SR22T CAPS and engine ticks leave the SR20 clock and state alone", () => {
    startCaps();
    up((d) => {
      d.flaps.cmd = 100;
    });
    run(2);
    expect(live.capsT).toBe(2);
    expect(sr20Live).toEqual(SR20_LIVE0);
    expect(useSR20.getState().s.capsOn).toBe(false);
  });

  it("SR20 CAPS and switch changes leave the SR22T alone", () => {
    sr20StartCaps();
    useSR20.getState().update((d) => {
      d.elec.bat2 = false;
    });
    expect(useSR20.getState().s.capsOn).toBe(true);
    expect(st()).toEqual(initialSim);
    expect(live).toEqual(LIVE0);
    sr20ResetCaps();
  });
});
