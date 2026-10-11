/** Engine study groups: operator request, addenda and 16:37 rulings, 2026-10-09; POH 13772-007 §7-31–39.
 * Memberships are `groups` tags on each part() / flow() (turbo oil Oil only, EGT and TIT probes Sensors only;
 * the turbos Induction + Exhaust). Empty membership means core. Geometry and simulation are unchanged. */
import { checkGroups, type FlowSpec, type PartSpec } from "@/lib/catalogue";
import type { SysId } from "@/lib/systems";

export const ENGINE_GROUPS = ["ignition", "induction", "exhaust", "fuel", "oil", "sensors"] as const;
export type EngineGroup = (typeof ENGINE_GROUPS)[number];
export type ShownGroups = Record<EngineGroup, boolean>;
declare module "@/lib/catalogue" {
  // Each engine group id is a valid `groups` tag on part() / flow(); nothing else type-checks.
  interface StudyGroups extends Record<EngineGroup, true> {}
}
/** Registration guard for a flow's `groups` tag (parts are checked by the catalogue). */
export const checkEngineGroups = (id: string, groups: readonly string[] | undefined) =>
  checkGroups(id, groups, ENGINE_GROUPS);
/** Engine items without their own `groups` tag inherit from their single non-engine system where every such item
 * shares one group: avionics = engine indication sensors (POH 7-35), gear = the engine mount, cabin = the cockpit levers. */
const SYS_DEFAULT: Partial<Record<SysId, EngineGroup[]>> = { avionics: ["sensors"], gear: [], cabin: [] };

/** An item's tags; else its single non-engine system's default; else core for a cylinder-mounted part; else unmapped. */
export function engineGroupsOf(spec: PartSpec | FlowSpec): EngineGroup[] | undefined {
  if (spec.groups) return spec.groups;
  const other = spec.sys.filter((sys) => sys !== "engine");
  if (spec.sys.includes("engine") && other.length === 1 && Object.hasOwn(SYS_DEFAULT, other[0]))
    return SYS_DEFAULT[other[0]];
  if ("parent" in spec && spec.parent?.startsWith("cyl:")) return [];
  return undefined;
}

export const isShown = (groups: EngineGroup[], shown: ShownGroups) =>
  groups.length === 0 || groups.some((group) => shown[group]);

// One-line scope decision: only the Engine view uses these viewing aids.
const GROUP_VIEW: SysId = "engine";
export function engineHidden(spec: PartSpec | FlowSpec, sys: SysId, shown: ShownGroups): boolean {
  if (sys !== GROUP_VIEW || !spec.sys.includes("engine")) return false;
  const groups = engineGroupsOf(spec);
  // New unmapped items remain visible; the coverage test requires an explicit mapping.
  return groups !== undefined && !isShown(groups, shown);
}

export const allGroups = (on = true): ShownGroups =>
  Object.fromEntries(ENGINE_GROUPS.map((group) => [group, on])) as ShownGroups;

/** URL lists the enabled groups. Invalid lists fall back as a whole, with one diagnostic. */
export function parseGroups(search: string): ShownGroups {
  const value = new URLSearchParams(search).get("groups");
  if (value === null) return allGroups();
  if (value === "none") return allGroups(false);
  const tokens = value.split(",");
  const bad = tokens.find((token) => !ENGINE_GROUPS.includes(token as EngineGroup));
  if (bad !== undefined) {
    console.warn(`Invalid engine group "${bad}"; showing all groups`);
    return allGroups();
  }
  const shown = allGroups(false);
  for (const token of tokens) shown[token as EngineGroup] = true;
  return shown;
}
