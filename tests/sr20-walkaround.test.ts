/** SR20 POH 11934-005 Reissue A 4-4–4-9: configuration-specific inspection sequence and reversible study state. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/aircraft";
import { initialSim, live, solve } from "@/aircraft/sr20/model";
import { useSR20 } from "@/aircraft/sr20/store";
import { simTick } from "@/aircraft/sr20/tick";
import {
  inCatalogue,
  nameCentres,
  loadProgress,
  parseProgress,
  PROGRESS_KEY,
  saveProgress,
  simAt,
  stepParts,
  stepSide,
  walkParam,
  walkSteps,
} from "@/aircraft/sr20/walk";
import {
  beginWalk,
  bootWalk,
  closeWalk,
  goStep,
  markStep,
  openWalk,
  resumeWalk,
  useWalk,
  walkNow,
} from "@/aircraft/sr20/walk-store";
import { WALK } from "@/aircraft/sr20/walkaround";
import { openWalk as openSR22TWalk, closeWalk as closeSR22TWalk } from "@/aircraft/sr22t/walk-store";
import { useView } from "@/lib/view";

const steps = walkSteps();
const at = (id: string) => steps.findIndex((step) => step.item.id === id);
const liveInitial = structuredClone(live);

beforeEach(() => {
  closeWalk();
  closeSR22TWalk();
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
  const s = structuredClone(initialSim);
  useSR20.setState({ s, E: solve(s) });
  Object.assign(live, structuredClone(liveInitial));
  useView.setState({
    ac: "sr20",
    sys: "overview",
    walking: false,
    cam: null,
    focus: null,
    hover: null,
    spot: null,
    xray: true,
    labels: true,
    spin: false,
    ctrlFocus: "all",
  });
});
afterEach(() => {
  closeWalk();
  closeSR22TWalk();
  vi.unstubAllGlobals();
});

describe("G6 source and catalogue coverage", () => {
  it("follows Figure 4-1 and every lettered SR20 item, with no SR22T oxygen or vortex-generator substitutions", () => {
    expect(WALK.map((s) => s.n)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    // SR20 4-5 has 1a–x; right nose has 8a–e; left nose has 10a–d. These differ from SR22T.
    const counts = [24, 8, 6, 3, 4, 3, 7, 5, 7, 4, 7, 4, 4];
    expect(WALK.map((s) => s.items.length)).toEqual(counts);
    for (const station of WALK)
      expect(station.items.map((i) => i.id)).toEqual(
        Array.from({ length: counts[station.n - 1] }, (_, i) => `${station.n}${String.fromCharCode(97 + i)}`),
      );
    expect(steps.some((s) => /oxygen|vortex|TKS|FIKI/i.test(s.item.text))).toBe(false);
    expect(steps[at("8a")].item.standard).toBe("CHECK 6–7 QUARTS, LEAKS");
    expect(steps[at("10d")].item.standard).toBe("DRAIN FOR 3 SECONDS, SAMPLE");
    expect(steps[at("1x")].item.standard).toBe("PIN REMOVED");
  });
  it("resolves every highlighted component in the SR20 catalogue", () => {
    for (const step of steps)
      for (const name of stepParts(step).shown) expect(inCatalogue(name), `${step.item.id}: ${name}`).toBe(true);
  });
  it("locates both fuel drains on the inspection's wing and keeps the pitot probe on the left", () => {
    for (const id of ["7c", "11e"]) {
      const step = steps[at(id)],
        side = stepSide(step);
      const centres = stepParts(step).shown.flatMap((name) => nameCentres(name, side));
      expect(centres).toHaveLength(2);
      expect(centres.every((p) => Math.sign(p.z) === side)).toBe(true);
    }
    const pitot = nameCentres("Heated pitot tube", -1);
    expect(pitot).toHaveLength(1);
    expect(pitot[0].z).toBeLessThan(0);
    expect(nameCentres("Static port (L)", 1)).toEqual([]);
  });
  it("demonstrates BAT 2 alone before BAT 1, then leaves flaps extended with battery switches off", () => {
    const bat2 = simAt(initialSim, steps, at("1c")),
      e2 = solve(bat2);
    expect(e2.pfd).toBe(true);
    expect(e2.mfd).toBe(false);
    expect(e2.flapsPwr).toBe(false);
    expect(e2.ess1).toBeGreaterThanOrEqual(23);
    expect(e2.ess1).toBeLessThanOrEqual(25);
    expect(solve(simAt(initialSim, steps, at("1g"))).flapsPwr).toBe(true);
    const off = simAt(initialSim, steps, at("1s"));
    expect(off.flaps.cmd).toBe(100);
    expect(solve(off).flapsPwr).toBe(false);
    expect(off.pitot.heat).toBe(false);
    expect(off.elec.avionics).toBe(false);
  });
});

describe("reversible study session", () => {
  it("restores exact model/solution references, live values and view after opening from an active CAPS scene", () => {
    useSR20.getState().update((s) => {
      s.capsOn = true;
      s.cb["ADAHRS 1"] = true;
      s.fuel.qR = 17;
    });
    Object.assign(live, { rpm: 2432, flapAng: 11.7, capsT: 6.3, capsPlaying: true });
    useView.setState({
      sys: "caps",
      labels: true,
      xray: false,
      spin: true,
      focus: "CAPS canister",
      ctrlFocus: "rudder",
      spot: { names: ["CAPS canister"], side: 0 },
      cam: { p: [5, 2, 3], t: [0, 0, 0], id: 15 },
    });
    const { s, E } = useSR20.getState(),
      originalLive = structuredClone(live),
      v = useView.getState();
    const viewKeep = {
      sys: v.sys,
      labels: v.labels,
      xray: v.xray,
      spin: v.spin,
      focus: v.focus,
      ctrlFocus: v.ctrlFocus,
      spot: v.spot,
      cam: v.cam,
    };
    openWalk();
    expect(useView.getState().walking).toBe(true);
    expect(live.rpm).toBe(0);
    expect(live.capsPlaying).toBe(false);
    expect(useSR20.getState().s.capsOn).toBe(false);
    beginWalk();
    goStep(at("1s"));
    expect(live.flapAng).toBe(32);
    simTick(1);
    expect(live.rpm).toBe(0);
    closeWalk();
    expect(useSR20.getState().s).toBe(s);
    expect(useSR20.getState().E).toBe(E);
    expect(live).toEqual(originalLive);
    expect(useView.getState()).toMatchObject({ ...viewKeep, walking: false });
  });
  it("reconstructs cabin switch history on jump and resume, including unpowered extended flaps", () => {
    openWalk();
    beginWalk();
    goStep(at("12b"));
    markStep("skip");
    closeWalk();
    expect(loadProgress()?.at).toBe("12c");
    bootWalk("");
    expect(useWalk.getState().phase).toBe("resume");
    resumeWalk();
    expect(walkNow().steps[useWalk.getState().at].item.id).toBe("12c");
    expect(useWalk.getState().marks["12b"]).toBe("skip");
    expect(useSR20.getState().s.elec.bat1).toBe(false);
    expect(useSR20.getState().s.flaps.cmd).toBe(100);
    expect(live.flapAng).toBe(32);
    goStep(at("1c"));
    expect(useSR20.getState().s.elec.bat2).toBe(true);
    expect(useSR20.getState().s.elec.bat1).toBe(false);
    expect(live.flapAng).toBe(0);
  });
  it("retains completed progress during review and does not automatically reopen a finished walk", () => {
    openWalk();
    beginWalk();
    goStep(steps.length - 1);
    markStep("ok");
    expect(loadProgress()?.done).toBe(true);
    goStep(0);
    markStep("skip");
    closeWalk();
    bootWalk("");
    expect(loadProgress()?.done).toBe(true);
    expect(useView.getState().walking).toBe(false);
  });
  it("keeps SR20 progress independent and does not close an SR22T walk when its module is merely loaded", () => {
    saveProgress({ v: 1, at: "7c", marks: { "7c": "ok" }, ms: 4000, done: false });
    localStorage.setItem("sr22t-walkaround", JSON.stringify({ v: 1, at: "1a", marks: {}, ms: 1000, done: false }));
    useView.setState({ ac: "sr22t" });
    openSR22TWalk();
    expect(useView.getState().walking).toBe(true);
    closeSR22TWalk();
    useView.setState({ ac: "sr20" });
    openWalk();
    resumeWalk();
    expect(walkNow().steps[useWalk.getState().at].item.id).toBe("7c");
    useView.setState({ ac: "sr22t" });
    expect(useView.getState()).toMatchObject({ ac: "sr22t", walking: false });
    expect(useSR20.getState().s.eng.running).toBe(true);
    expect(localStorage.getItem("sr22t-walkaround")).toContain('"at":"1a"');
  });
  it("ignores corrupt/foreign progress and remains usable with blocked storage", () => {
    expect(parseProgress('{"v":1,"at":"1z","marks":{},"ms":0}')).toBeNull();
    expect(parseProgress('{"v":1,"at":"1a","marks":[],"ms":0}')).toBeNull();
    expect(parseProgress('{"v":1,"at":"1a","marks":{},"ms":-1}')).toBeNull();
    localStorage.setItem(PROGRESS_KEY, "broken");
    expect(loadProgress()).toBeNull();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    openWalk();
    beginWalk();
    markStep("ok");
    closeWalk();
    expect(useView.getState().walking).toBe(false);
    expect(walkParam("?walk")).toBe(1);
    expect(walkParam("?walk=13")).toBe(13);
    expect(walkParam("?walk=14")).toBeNull();
  });
});
