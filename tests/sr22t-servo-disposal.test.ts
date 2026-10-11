/** Rendering resource ownership; no modelled values change. */
import * as THREE from "three";
import { afterEach, expect, it, vi } from "vitest";
import { CAT } from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import { Part, releasePartGeometry, specGeo } from "@/components/scene/Part";

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
    // Part also reads upstream's phone-layout hook (useSyncExternalStore), which needs a React renderer.
    useNarrowLayout: () => false,
  };
});

const saved = useSR22T.getState();
afterEach(() => useSR22T.setState(saved));

it("all twelve servo cables release their last dynamic geometry and retain reusable geometry", () => {
  const cables = CAT.parts.filter(
    (p) => p.name?.endsWith("servo bridle cable") || p.name === "Capstan groove exit transitions",
  );
  expect(cables).toHaveLength(12);
  for (const part of cables) {
    useSR22T.getState().update((s) => {
      s.ctrl = { pitch: 0, roll: 0, yaw: 0 };
    });
    const cached = specGeo(part);
    const cachedDispose = vi.spyOn(cached, "dispose");
    const mesh = new THREE.Mesh(cached);
    lifecycle.mesh = mesh;
    lifecycle.cleanups = [];
    Part({ spec: part, cat: CAT });
    part.anim!(mesh, 0);
    const first = mesh.geometry;
    const firstDispose = vi.spyOn(first, "dispose");
    // R3F replaces this object when Part rerenders (focus, labels, theme, etc.).
    mesh.userData = { pick: { name: part.name }, cameraBounds: true };
    part.anim!(mesh, 0);
    expect(mesh.geometry).toBe(first);
    expect(firstDispose).not.toHaveBeenCalled();
    useSR22T.getState().update((s) => {
      s.ctrl = { pitch: 0.6, roll: 0.6, yaw: 0.6 };
    });
    part.anim!(mesh, 1);
    expect(firstDispose).toHaveBeenCalledOnce();
    const last = mesh.geometry;
    const lastDispose = vi.spyOn(last, "dispose");
    for (const cleanup of lifecycle.cleanups) cleanup();
    expect(lastDispose).toHaveBeenCalledOnce();
    expect(cachedDispose).not.toHaveBeenCalled();
    expect(mesh.geometry).toBe(cached);
    // Strict Mode can clean up and set up on the same mesh with unchanged controls.
    part.anim!(mesh, 2);
    expect(mesh.geometry).not.toBe(cached);
    releasePartGeometry(mesh, cached);
    releasePartGeometry(mesh, cached);
    expect(cachedDispose).not.toHaveBeenCalled();
    firstDispose.mockRestore();
    lastDispose.mockRestore();
    cachedDispose.mockRestore();
    (mesh.material as THREE.Material).dispose();
  }
});

it("ordinary catalogue parts keep their shared geometry on unmount", () => {
  const geo = new THREE.BoxGeometry();
  const dispose = vi.spyOn(geo, "dispose");
  const mesh = new THREE.Mesh(geo);
  releasePartGeometry(mesh, geo);
  expect(dispose).not.toHaveBeenCalled();
  dispose.mockRestore();
  geo.dispose();
  (mesh.material as THREE.Material).dispose();
});
