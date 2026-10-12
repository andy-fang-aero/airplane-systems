/** Study filters for the IO-390. These affect presentation, never system operation. */
import type { FlowSpec, PartSpec } from "@/lib/catalogue";

export const ENGINE_GROUPS = ["ignition", "induction", "exhaust", "fuel", "oil", "sensors"] as const;
export type EngineGroup = (typeof ENGINE_GROUPS)[number];
export type ShownGroups = Record<EngineGroup, boolean>;
declare module "@/lib/catalogue" {
  interface StudyGroups extends Record<EngineGroup, true> {}
}

export const allGroups = (): ShownGroups =>
  Object.fromEntries(ENGINE_GROUPS.map((group) => [group, true])) as ShownGroups;

/** Shared-system parts inherit a group only when their role is unambiguous. */
export function engineGroupsOf(spec: PartSpec | FlowSpec): readonly EngineGroup[] {
  if (spec.groups) return spec.groups as readonly EngineGroup[];
  if (spec.sys.includes("fuel")) return ["fuel"];
  if (spec.sys.includes("avionics")) return ["sensors"];
  if (spec.sys.includes("environment")) return ["exhaust"];
  return [];
}

export function engineHidden(spec: PartSpec | FlowSpec, sys: string, shown: ShownGroups) {
  if (sys !== "engine" || !spec.sys.includes("engine")) return false;
  const groups = engineGroupsOf(spec);
  return groups.length > 0 && !groups.some((group) => shown[group]);
}
