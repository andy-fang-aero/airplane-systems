/** Walk entry and review regressions; no new aircraft procedure or geometry assumptions. */
import { BoxGeometry, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/aircraft";
import { fuselageGeo } from "@/aircraft/sr22t/geometry";
import { initialSim, live } from "@/aircraft/sr22t/model";
import { CAT } from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import { simTick } from "@/aircraft/sr22t/tick";
import { loadProgress, nameCentres, underAirplane } from "@/aircraft/sr22t/walk";
import {
  beginWalk,
  bootWalk,
  closeWalk,
  goStep,
  markStep,
  openWalk,
  resetWalk,
  useWalk,
  walkNow,
} from "@/aircraft/sr22t/walk-store";
import { primeGeo } from "@/lib/catalogue";
import { useView } from "@/lib/view";

afterEach(() => vi.restoreAllMocks());

it("frames the walk with the hull already supplied by the worker, without rebuilding it", () => {
  const hull = CAT.shells.find((s) => s.geo === fuselageGeo)!;
  // A worker's transferred geometry is placed in the same shared cache before the walk opens.
  primeGeo(hull, new BoxGeometry(2, 2, 2));
  const build = vi.spyOn(hull, "geo").mockImplementation(() => {
    throw new Error("The worker already built the hull");
  });
  expect(underAirplane(new Vector3())).toBe(true);
  expect(nameCentres(hull.name)).toEqual([new Vector3()]);
  expect(build).not.toHaveBeenCalled();
});

describe("walk entry and completed review", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    });
    useSR22T.setState({ s: initialSim });
    useSR22T.getState().update(() => {});
    useView.setState({ ac: "sr22t", walking: false });
  });
  afterEach(() => {
    closeWalk();
    vi.unstubAllGlobals();
  });

  it("stops the animated propeller immediately on entry and restores its prior RPM on exit", () => {
    const rpm = live.rpm;
    try {
      live.rpm = 2500;
      openWalk();
      expect(useSR22T.getState().s.eng.running).toBe(false);
      expect(live.rpm).toBe(0);
      simTick(1 / 60);
      expect(live.rpm).toBe(0);
      beginWalk();
      closeWalk();
      expect(live.rpm).toBe(2500);
    } finally {
      closeWalk();
      live.rpm = rpm;
    }
  });

  it("keeps completed progress when reviewing, exiting or reloading, until a new walk begins", () => {
    openWalk();
    beginWalk();
    const last = walkNow().steps.length - 1;
    goStep(last);
    markStep("ok");
    expect(loadProgress()?.done).toBe(true);
    // The completion panel's Review items button returns to the last item.
    goStep(last);
    goStep(0);
    markStep("skip");
    expect(useWalk.getState().phase).toBe("walk");
    expect(loadProgress()?.done).toBe(true);
    closeWalk();
    expect(loadProgress()?.done).toBe(true);
    bootWalk("");
    expect(useView.getState().walking).toBe(false);
    openWalk();
    expect(useWalk.getState().phase).toBe("intro");
    beginWalk();
    expect(loadProgress()?.done).toBe(false);
    goStep(last);
    markStep("ok");
    goStep(0);
    resetWalk();
    expect(loadProgress()).toBeNull();
    beginWalk();
    expect(loadProgress()?.done).toBe(false);
  });
});
