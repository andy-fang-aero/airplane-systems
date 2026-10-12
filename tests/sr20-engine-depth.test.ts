/** SR20 G6 IO-390 topology, not the SR22T's six-cylinder turbo installation.
 * POH11934-005 7-34–7-40; AMM12137-002 ATA61/71/73/74/77/78/79.
 */
import { describe, expect, it } from "vitest";
import { CAT } from "@/aircraft/sr20/parts";
import { ENGINE_DEPTH_FLOWS, engineDepthFlowRates } from "@/aircraft/sr20/engine-depth-flow";
import {
  CYLS,
  ENGINE_FUEL_PUMP,
  FUEL_DIVIDER,
  FUEL_FLOW_SENSOR,
  GOVERNOR,
  INDUCTION_PLENUM,
  OIL_CONTROL,
  OIL_COOLER,
  OIL_FILTER,
  OIL_PUMP,
  OIL_SCREEN,
  OIL_SUMP,
  PROP_OIL,
  THROTTLE,
  injectorPoint,
  intakePort,
  plugPoint,
} from "@/aircraft/sr20/engine-anchors";
import { MOUNT_ATTACH, MOUNT_FEET, MOUNT_RUNS } from "@/aircraft/sr20/parts/engine-installation";
import { initialSim, solve } from "@/aircraft/sr20/model";
import { patched } from "./helpers";

const flow = (key: string) => {
  const found = ENGINE_DEPTH_FLOWS.find((f) => f.key === key);
  expect(found, key).toBeDefined();
  return found!;
};
const endpoints = (key: string) => [flow(key).pts[0], flow(key).pts.at(-1)];
const parts = (prefix: string) => CAT.parts.filter((p) => p.name?.startsWith(prefix));
const rates = (patch: Parameters<typeof patched<typeof initialSim>>[1] = {}, rpm = 2500) => {
  const s = patched(initialSim, patch);
  return engineDepthFlowRates(s, solve(s), rpm);
};

describe("SR20 G6 engine depth", () => {
  it("each of four intake ports has its own injector, CHT and exhaust EGT (POH7-37–7-40)", () => {
    expect(CYLS).toHaveLength(4);
    expect(parts("Fuel injector nozzle — cyl")).toHaveLength(4);
    expect(parts("CHT sensor — cyl")).toHaveLength(4);
    expect(parts("EGT probe — cyl")).toHaveLength(4);
    for (const c of CYLS) {
      expect(endpoints("man" + c.n)).toEqual([INDUCTION_PLENUM, intakePort(c)]);
      expect(endpoints("inj" + c.n)).toEqual([FUEL_DIVIDER, injectorPoint(c)]);
      expect(flow("exh" + c.n).pts[0]).toBeDefined();
      const probe = CAT.parts.find((p) => p.name === `EGT probe — cyl ${c.n}`)!;
      const pipe = flow("exh" + c.n);
      // Probe lies on the pipe's first vertical section and spans its wall, not on the merged collector.
      expect(probe.pos![0]).toBeCloseTo((pipe.pts[1] as number[])[0], 8);
      expect(probe.pos![1]).toBeCloseTo((pipe.pts[1] as number[])[1], 8);
      expect(Math.abs(probe.pos![2] - (pipe.pts[1] as number[])[2])).toBeLessThan(0.018);
    }
    expect(CAT.parts.some((p) => /turbo|wastegate|intercooler|TIT probe|pressurized magneto/i.test(p.name ?? ""))).toBe(
      false,
    );
  });

  it("all eight harness leads meet the correct plugs; selecting a magneto energizes exactly its four (POH7-39)", () => {
    expect(parts("Spark plug — cyl")).toHaveLength(8);
    const left = rates({ eng: { key: "L" } });
    const right = rates({ eng: { key: "R" } });
    let leftCount = 0;
    let rightCount = 0;
    for (const c of CYLS) {
      for (const level of ["U", "L"] as const) {
        const key = `ign${c.n}${level}`;
        expect(flow(key).pts.at(-1)).toEqual(plugPoint(c, level));
        // Documented right mag = lower right + upper left; left = opposite.
        const fromRight = c.s === 1 ? level === "L" : level === "U";
        expect(right[key]).toBe(fromRight ? 1 : 0);
        expect(left[key]).toBe(fromRight ? 0 : 1);
        rightCount += right[key];
        leftCount += left[key];
      }
    }
    expect(leftCount).toBe(4);
    expect(rightCount).toBe(4);
    const off = rates({ eng: { key: "OFF" } });
    expect(ENGINE_DEPTH_FLOWS.filter((f) => /^ign\d/.test(f.key)).every((f) => off[f.key] === 0)).toBe(true);
  });

  it("metered fuel sensor is between servo and divider, with cutoff stopping downstream flow (AMM73-30p1; POH7-34)", () => {
    expect(endpoints("engineFuel")).toEqual([ENGINE_FUEL_PUMP, THROTTLE]);
    expect(endpoints("meteredFuel")).toEqual([THROTTLE, FUEL_FLOW_SENSOR]);
    expect(endpoints("dividerFeed")).toEqual([FUEL_FLOW_SENSOR, FUEL_DIVIDER]);
    const cutoff = rates({ eng: { mix: 0 } });
    expect(cutoff.engineFuel).toBeGreaterThan(0); // pump still turns during the shutdown transition
    expect(cutoff.meteredFuel).toBe(0);
    expect(cutoff.dividerFeed).toBe(0);
    for (const c of CYLS) {
      expect(cutoff["inj" + c.n]).toBe(0);
      expect(cutoff["exh" + c.n]).toBe(0);
    }
  });

  it("alternate air bypasses a blocked normal filter only when manually opened (POH7-35; AMM71-60p1)", () => {
    const blocked = rates({ eng: { filterBlocked: true, altAir: false } });
    expect(blocked.intake).toBe(0);
    expect(blocked.alternateIntake).toBe(0);
    expect(blocked.servoAir).toBe(0);
    for (const c of CYLS) expect(blocked["exh" + c.n]).toBe(0);
    const alternate = rates({ eng: { filterBlocked: true, altAir: true } });
    expect(alternate.intake).toBe(0);
    expect(alternate.alternateIntake).toBe(1);
    expect(alternate.servoAir).toBe(1);
    for (const c of CYLS) expect(alternate["exh" + c.n]).toBeGreaterThan(0);
  });

  it("oil pickup, cooler and bypass meet the filter before the gallery and governor circuit (POH7-38,7-40)", () => {
    expect(flow("oilPickup").pts).toEqual([OIL_SUMP, OIL_SCREEN, OIL_PUMP]);
    expect(endpoints("oilToControl")).toEqual([OIL_PUMP, OIL_CONTROL]);
    expect(endpoints("oilCoolerFeed")).toEqual([OIL_CONTROL, OIL_COOLER]);
    expect(endpoints("oilCoolerReturn")).toEqual([OIL_COOLER, OIL_FILTER]);
    expect(endpoints("oilBypass")).toEqual([OIL_CONTROL, OIL_FILTER]);
    expect(flow("oilRelief").pts[0]).toEqual(OIL_FILTER);
    expect(endpoints("propOil")).toEqual([GOVERNOR, PROP_OIL]);
    for (const c of CYLS) expect(flow("oilCyl" + c.n).tube).toBe(false);
    const stopped = rates({ eng: { running: false, key: "OFF" } }, 0);
    expect(ENGINE_DEPTH_FLOWS.filter((f) => f.groups?.includes("oil")).every((f) => stopped[f.key] === 0)).toBe(true);
  });

  it("engine indication requires ENGINE INSTR power while magnetos keep firing independently (POH7-35,7-39)", () => {
    const cb = { ...initialSim.cb, "ENGINE INSTR": true };
    const s = patched(initialSim, { cb });
    const E = solve(s);
    expect(E.eisPwr).toBe(false);
    const R = engineDepthFlowRates(s, E, 2500);
    expect(R.engineData).toBe(0);
    expect(R.rpmSignal).toBe(0);
    expect(R.ign1U).toBe(1);
    expect(R.ign1L).toBe(1);
    expect(R.tailpipe).toBeGreaterThan(0);
  });

  it("four isolators and four firewall attachments form a connected steel mount (AMM71-20p1)", () => {
    expect(MOUNT_ATTACH).toHaveLength(4);
    expect(MOUNT_FEET).toHaveLength(4);
    expect(parts("Engine mount vibration isolator")).toHaveLength(4);
    for (const point of [...MOUNT_ATTACH, ...MOUNT_FEET])
      expect(MOUNT_RUNS.some((run) => run.some((p) => p === point))).toBe(true);
    expect(parts("Side cooling baffle")).toHaveLength(2);
    expect(parts("Inter-cylinder cooling baffle")).toHaveLength(2);
  });
});
