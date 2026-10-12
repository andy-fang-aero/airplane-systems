/** View changes retain rendering resources; Engine group visibility remains scoped to Engine. */
import type { ReactElement } from "react";
import * as THREE from "three";
import { afterEach, expect, it, vi } from "vitest";
import { Model } from "@/aircraft/sr22t/Airplane";
import { useEngineGroups } from "@/aircraft/sr22t/engine-group-store";
import { allGroups } from "@/aircraft/sr22t/engine-groups";
import { Flows } from "@/components/scene/Flows";
import { useView } from "@/lib/view";

// Exercise the actual Model -> Flows render path with persistent memo slots, without a WebGL context.
const hooks = vi.hoisted(() => ({
  scope: "model",
  index: 0,
  slots: new Map<string, { deps: unknown[]; value: unknown }>(),
  cleanups: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useMemo: (create: () => unknown, deps: unknown[]) => {
    const key = hooks.scope + hooks.index++;
    const previous = hooks.slots.get(key);
    if (previous && deps.length === previous.deps.length && deps.every((d, i) => Object.is(d, previous.deps[i])))
      return previous.value;
    const value = create();
    hooks.slots.set(key, { deps, value });
    return value;
  },
  useRef: (current: unknown) => ({ current }),
  useEffect: (setup: () => void | (() => void)) => {
    const cleanup = setup();
    if (cleanup) hooks.cleanups.push(cleanup);
  },
}));
vi.mock("@react-three/fiber", () => ({ useFrame: () => {} }));
vi.mock("@/lib/materials", async (original) => ({
  ...(await original<typeof import("@/lib/materials")>()),
  dotTex: () => null,
}));
vi.mock("@/lib/view", async (original) => {
  const actual = await original<typeof import("@/lib/view")>();
  return {
    ...actual,
    useView: Object.assign(
      (select: (s: ReturnType<typeof actual.useView.getState>) => unknown) => select(actual.useView.getState()),
      actual.useView,
    ),
  };
});
vi.mock("@/aircraft/sr22t/store", async (original) => {
  const actual = await original<typeof import("@/aircraft/sr22t/store")>();
  return {
    ...actual,
    useSR22T: Object.assign(
      (select: (s: ReturnType<typeof actual.useSR22T.getState>) => unknown) => select(actual.useSR22T.getState()),
      actual.useSR22T,
    ),
  };
});
vi.mock("@/aircraft/sr22t/engine-group-store", async (original) => {
  const actual = await original<typeof import("@/aircraft/sr22t/engine-group-store")>();
  return {
    ...actual,
    useEngineGroups: Object.assign(
      (select: (s: ReturnType<typeof actual.useEngineGroups.getState>) => unknown) =>
        select(actual.useEngineGroups.getState()),
      actual.useEngineGroups,
    ),
  };
});

const savedView = useView.getState();
const savedGroups = useEngineGroups.getState();
afterEach(() => {
  useView.setState(savedView);
  useEngineGroups.setState(savedGroups);
  for (const cleanup of hooks.cleanups) cleanup();
  hooks.cleanups = [];
  hooks.slots.clear();
});

function renderFlows() {
  hooks.scope = "model";
  hooks.index = 0;
  const model = Model() as ReactElement<{ children: ReactElement[] }>;
  const flowElement = model.props.children.find((child) => child.type === Flows)!;
  hooks.scope = "flows";
  hooks.index = 0;
  const rendered = Flows(flowElement.props as Parameters<typeof Flows>[0]);
  const groups = rendered.props.children as ReactElement<{ children: ReactElement[] }>[];
  return groups.map((group) => {
    const [mesh, particle] = group.props.children;
    return {
      key: group.key,
      tube: mesh && (mesh.props as { geometry: THREE.BufferGeometry }).geometry,
      points: (particle.props as { object: THREE.Points }).object,
    };
  });
}

it("view switches preserve flow tubes and particle geometry when group visibility is unchanged", () => {
  useEngineGroups.setState({ shown: allGroups() });
  useView.setState({ sys: "engine" });
  const before = renderFlows();
  expect(before.length).toBeGreaterThan(100);
  for (const sys of ["fuel", "overview", "propeller", "engine"] as const) {
    useView.setState({ sys });
    const after = renderFlows();
    expect(after.map((item) => item.key)).toEqual(before.map((item) => item.key));
    after.forEach((item, i) => {
      expect(item.tube).toBe(before[i].tube);
      expect(item.points).toBe(before[i].points);
      expect(item.points.geometry).toBe(before[i].points.geometry);
    });
  }
  // A hidden group must still remove its flows in Engine and restore them elsewhere.
  useEngineGroups.getState().set("oil", false);
  const filtered = renderFlows();
  expect(filtered.length).toBeLessThan(before.length);
  useView.setState({ sys: "fuel" });
  const restored = renderFlows();
  expect(restored.map((item) => item.key)).toEqual(before.map((item) => item.key));
  useView.setState({ sys: "overview" });
  const overview = renderFlows();
  overview.forEach((item, i) => {
    expect(item.tube).toBe(restored[i].tube);
    expect(item.points).toBe(restored[i].points);
  });
});
