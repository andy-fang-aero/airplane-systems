import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { Check } from "@/components/ui/controls";
import { Ice } from "@/aircraft/sr22t/panels/ice";
import { useSR22T } from "@/aircraft/sr22t/store";
import { initialSim, solve } from "@/aircraft/sr22t/model";
import { patched } from "./helpers";

const checks = vi.hoisted(() => new Map<string, ComponentProps<typeof Check>>());
vi.mock("@/components/ui/controls", async (original) => {
  const controls = await original<typeof import("@/components/ui/controls")>();
  return {
    ...controls,
    Check: (props: ComponentProps<typeof Check>) => {
      checks.set(props.id, props);
      return createElement(controls.Check, props);
    },
  };
});
// Observe the current snapshot when server-rendering after real control handlers.
vi.mock("@/aircraft/sr22t/store", async (original) => {
  const store = await original<typeof import("@/aircraft/sr22t/store")>();
  return { ...store, useSR22T: Object.assign(() => store.useSR22T.getState(), store.useSR22T) };
});
const saved = useSR22T.getState();
afterEach(() => {
  useSR22T.setState(saved);
  checks.clear();
});
const render = () => renderToStaticMarkup(createElement(Ice));

it("MAX is unavailable with ICE PROTECT off and cancels on power-off (modelling assumption; AMM 30-00 PDF 1167 timing)", () => {
  const s = patched(initialSim, { ice: { on: false, maxT: 0 } });
  useSR22T.setState({ s, E: solve(s) });
  expect(render()).toMatch(/id="ips-max"[^>]*disabled=""/);
  expect(checks.get("ips-max")!.checked).toBe(false);
  checks.get("ips-max")!.onChange(true);
  expect(useSR22T.getState().s.ice.maxT).toBe(0);
  checks.get("ips-on")!.onChange(true);
  render();
  expect(checks.get("ips-max")!.disabled).toBe(false);
  checks.get("ips-max")!.onChange(true);
  expect(useSR22T.getState().s.ice.maxT).toBe(120);
  render();
  expect(checks.get("ips-max")!.checked).toBe(true);
  checks.get("ips-on")!.onChange(false);
  expect(useSR22T.getState().s.ice.maxT).toBe(0);
  render();
  expect(checks.get("ips-max")!.disabled).toBe(true);
  checks.get("ips-on")!.onChange(true);
  render();
  expect(checks.get("ips-max")!.checked).toBe(false);
});
