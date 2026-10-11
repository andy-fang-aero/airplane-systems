/** CAPS rendering lifecycle: no aviation value changes. */
import * as THREE from "three";
import { afterEach, expect, it, vi } from "vitest";
import { CAT } from "@/aircraft/sr22t/parts";
import { live } from "@/aircraft/sr22t/model";
import { useSR22T } from "@/aircraft/sr22t/store";
import { Part, specGeo } from "@/components/scene/Part";

const lifecycle = vi.hoisted(() => ({
  mesh: undefined as THREE.Mesh | undefined,
  cleanups: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => ({ current: lifecycle.mesh }),
  useEffect: (setup: () => void | (() => void)) => {
    const cleanup = setup();
    if (cleanup) lifecycle.cleanups.push(cleanup);
  },
}));
vi.mock("@react-three/fiber", () => ({ useFrame: () => {} }));
vi.mock("@/lib/view", async (original) => {
  const actual = await original<typeof import("@/lib/view")>();
  return {
    ...actual,
    useView: Object.assign(
      (select: (s: ReturnType<typeof actual.useView.getState>) => unknown) => select(actual.useView.getState()),
      actual.useView,
    ),
    useNarrowLayout: () => false,
  };
});

const saved = useSR22T.getState();
const savedCapsT = live.capsT;
afterEach(() => {
  useSR22T.setState(saved);
  live.capsT = savedCapsT;
});
const names = ["CAPS activation cable", "Parking brake cable core", "Parking brake clevis cable wrap"];
const tubes = () => names.map((name) => CAT.parts.find((p) => p.name === name)!);
const pose = (pulled: boolean) => {
  live.capsT = pulled ? 0.15 : 0;
  useSR22T.getState().update((s) => {
    s.gear.park = pulled;
  });
};

it("CAPS and parking tubes retain reusable shapes and release replacements on rerender and remount", () => {
  for (const part of tubes()) {
    pose(false);
    const cached = specGeo(part);
    const positions = Array.from(cached.getAttribute("position").array);
    const cachedDispose = vi.spyOn(cached, "dispose");
    const mesh = new THREE.Mesh(cached);
    lifecycle.mesh = mesh;
    lifecycle.cleanups = [];
    Part({ spec: part, cat: CAT });
    part.anim!(mesh, 0);
    const first = mesh.geometry;
    const firstDispose = vi.spyOn(first, "dispose");
    mesh.userData = { pick: { name: part.name }, cameraBounds: true };
    part.anim!(mesh, 0);
    expect(mesh.geometry, part.name).toBe(first);
    expect(firstDispose).not.toHaveBeenCalled();
    pose(true);
    part.anim!(mesh, 1);
    expect(mesh.geometry, part.name).not.toBe(first);
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(Array.from(cached.getAttribute("position").array), part.name).toEqual(positions);
    const lastDispose = vi.spyOn(mesh.geometry, "dispose");
    lifecycle.cleanups.forEach((cleanup) => cleanup());
    expect(lastDispose).toHaveBeenCalledOnce();
    expect(mesh.geometry).toBe(cached);
    expect(cachedDispose).not.toHaveBeenCalled();
    // Strict Mode reuses the mesh with unchanged inputs after cleanup.
    part.anim!(mesh, 2);
    expect(mesh.geometry).not.toBe(cached);
    lifecycle.cleanups.forEach((cleanup) => cleanup());
    expect(cachedDispose).not.toHaveBeenCalled();
    cachedDispose.mockRestore();
    firstDispose.mockRestore();
    lastDispose.mockRestore();
    (mesh.material as THREE.Material).dispose();
  }
});

// The test runtime dependency changed, not the lifecycle.
it("live geometry count stays stable across 12 CAPS/parking animation and remount cycles", () => {
  // Track the real geometries used by the meshes and their actual dispose events, like a renderer's geometry
  // registry, without WebGL or Chromium. Retain replaced geometries until disposal so leaks grow this count.
  const material = new THREE.MeshBasicMaterial();
  const meshes = tubes().map((part) => ({ part, mesh: new THREE.Mesh(specGeo(part), material) }));
  const retained = new Set<THREE.BufferGeometry>();
  const listeners = new Map<THREE.BufferGeometry, () => void>();
  const render = () => {
    for (const { mesh } of meshes) {
      const geometry = mesh.geometry;
      if (!listeners.has(geometry)) {
        const release = () => retained.delete(geometry);
        geometry.addEventListener("dispose", release);
        listeners.set(geometry, release);
      }
      retained.add(geometry);
    }
    return retained.size;
  };
  const cleanups: (() => void)[] = [];
  try {
    const baseline = render();
    expect(baseline).toBe(names.length);
    for (let cycle = 0; cycle < 12; cycle++) {
      for (const { part, mesh } of meshes) {
        lifecycle.mesh = mesh;
        lifecycle.cleanups = [];
        Part({ spec: part, cat: CAT });
        cleanups.push(...lifecycle.cleanups);
      }
      for (const pulled of [false, true, false]) {
        pose(pulled);
        meshes.forEach(({ part, mesh }) => part.anim!(mesh, cycle));
        expect(render(), `cycle ${cycle}, pulled ${pulled}`).toBe(baseline + names.length);
        meshes.forEach(({ part, mesh }) => {
          mesh.userData = { pick: { name: part.name } };
          part.anim!(mesh, cycle);
        });
        expect(render(), `cycle ${cycle}, rerender`).toBe(baseline + names.length);
      }
      cleanups.splice(0).forEach((cleanup) => cleanup());
      expect(render(), `cycle ${cycle}, unmount`).toBe(baseline);
    }
  } finally {
    cleanups.forEach((cleanup) => cleanup());
    for (const [geometry, release] of listeners) geometry.removeEventListener("dispose", release);
    material.dispose();
  }
});
