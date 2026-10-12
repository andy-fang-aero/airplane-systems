import { expect, it } from "vitest";
import { FLEET } from "@/aircraft";
import { AIRCRAFT_IDS } from "@/lib/systems";
import { VIEW_PATHS, VIEW_SYSTEMS } from "@/lib/viewPaths";

export { VIEW_PATHS } from "@/lib/viewPaths";

it("uses the system definitions registered by the application fleet", () => {
  for (const def of FLEET) expect(VIEW_SYSTEMS[def.id], def.id).toEqual(def.systems);
  expect(VIEW_PATHS).toEqual([
    "/",
    ...AIRCRAFT_IDS.flatMap((ac) => {
      const def = FLEET.find((def) => def.id === ac)!;
      return [`/${ac}`, ...def.systems.map((sys) => `/${ac}/${sys.id}`)];
    }),
  ]);
});

it("exports the root, each airplane and every source-defined system without duplicates", () => {
  expect(VIEW_PATHS[0]).toBe("/");
  expect(new Set(VIEW_PATHS).size).toBe(VIEW_PATHS.length);
  expect(VIEW_PATHS).toHaveLength(
    1 + AIRCRAFT_IDS.length + AIRCRAFT_IDS.reduce((count, ac) => count + VIEW_SYSTEMS[ac].length, 0),
  );
  for (const ac of AIRCRAFT_IDS) {
    expect(VIEW_PATHS).toContain(`/${ac}`);
    for (const sys of VIEW_SYSTEMS[ac]) expect(VIEW_PATHS).toContain(`/${ac}/${sys.id}`);
  }
  expect(VIEW_PATHS).toContain("/sr20/overview");
  expect(VIEW_PATHS).toContain("/sr22t/electrical");
  expect(VIEW_PATHS).not.toContain("/sr22t/bogus");
});
