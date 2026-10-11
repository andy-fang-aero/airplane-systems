import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { Slider } from "@/components/ui/controls";
import { Oxygen } from "@/aircraft/sr22t/panels/oxygen";
import { useSR22T } from "@/aircraft/sr22t/store";
import { initialSim, solve } from "@/aircraft/sr22t/model";
import { patched } from "./helpers";

const sliders = vi.hoisted(() => new Map<string, ComponentProps<typeof Slider>>());
vi.mock("@/components/ui/controls", async (original) => {
  const controls = await original<typeof import("@/components/ui/controls")>();
  return {
    ...controls,
    Slider: (props: ComponentProps<typeof Slider>) => {
      sliders.set(props.id, props);
      return createElement(controls.Slider, props);
    },
  };
});
// Server rendering normally reads Zustand's initial snapshot; use the current store
// snapshot so each render observes the state changed by the real slider handlers.
vi.mock("@/aircraft/sr22t/store", async (original) => {
  const store = await original<typeof import("@/aircraft/sr22t/store")>();
  return {
    ...store,
    useSR22T: Object.assign(
      (selector: (s: ReturnType<typeof store.useSR22T.getState>) => unknown) => selector(store.useSR22T.getState()),
      store.useSR22T,
    ),
  };
});
const saved = useSR22T.getState();
afterEach(() => {
  useSR22T.setState(saved);
  sliders.clear();
});
const render = () => renderToStaticMarkup(createElement(Oxygen));

it("elapsed-time slider rejects input below the climb threshold, accepts it above, and follows exposure beyond 60 min (POH 3A-24)", () => {
  const s = patched(initialSim, { paFt: 12500, oxy: { above12k5Min: 0 } });
  useSR22T.setState({ s, E: solve(s) });
  expect(render()).toContain("Climb above 12,500 ft first");
  sliders.get("oxyAbove")!.onChange(35);
  expect(useSR22T.getState().s.oxy.above12k5Min).toBe(0);
  sliders.get("oxyPaFt")!.onChange(13000);
  render();
  sliders.get("oxyAbove")!.onChange(35);
  expect(useSR22T.getState().s.oxy.above12k5Min).toBe(35);
  useSR22T.getState().update((d) => {
    d.oxy.above12k5Min = 75.2;
  });
  render();
  expect(sliders.get("oxyAbove")!.max).toBe(76);
  expect(sliders.get("oxyAbove")!.value).toBe(75.2);
  sliders.get("oxyAbove")!.onChange(70);
  expect(useSR22T.getState().s.oxy.above12k5Min).toBe(70);
});

it("quantity dial follows the pressure slider and loses indication with OFF or controller power loss (POH Fig 7-7, 7-34; AMM 35-00)", () => {
  const s = patched(initialSim, { oxy: { on: true, psi: 1800 } });
  useSR22T.setState({ s, E: solve(s) });
  expect(render()).toContain('aria-label="Oxygen quantity gauge: 1800 psi"');
  sliders.get("oxyPsi")!.onChange(800);
  expect(render()).toContain('aria-label="Oxygen quantity gauge: 800 psi"');
  expect(render()).toContain('data-oxygen-needle="true"');
  for (const psi of [0, 2000]) {
    sliders.get("oxyPsi")!.onChange(psi);
    expect(render()).toContain(`aria-label="Oxygen quantity gauge: ${psi} psi"`);
  }
  useSR22T.getState().update((d) => {
    d.oxy.on = false;
  });
  expect(render()).not.toContain("data-oxygen-needle");
  useSR22T.getState().update((d) => {
    d.oxy.on = true;
    d.cb["CABIN LIGHTS / OXYGEN"] = true;
  });
  expect(render()).toContain('aria-label="Oxygen quantity gauge: no indication"');
  expect(render()).not.toContain("data-oxygen-needle");
});
