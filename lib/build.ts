/**
 * Progress of building the shown airplane's 3D scene, for the loading overlay (components/Loader.tsx): which stage the
 * build is in and, while systems are added part by part, how many of them are in. Airplanes built in one go
 * (components/scene/Scene.tsx) go from "code" straight to "ready" with their first frame; a progressive airplane's model
 * moves the stages itself (aircraft/sr22t/Airplane.tsx).
 */
import { create } from "zustand";
import type { Catalogue, PartSpec } from "./catalogue";

/**
 * - code: the 3D code is still loading
 * - airframe: the skin shells and control surfaces are being built
 * - shaders: waiting for the GPU to finish the shader programs
 * - systems: parts are being added, `done` of `total`
 * - ready: the scene is complete
 */
export type BuildStage = "code" | "airframe" | "shaders" | "systems" | "ready";

export interface Build {
  stage: BuildStage;
  done: number;
  total: number;
  /** The user skipped the build-in: add the rest at once. */
  skip: boolean;
}

export const useBuild = create<Build>(() => ({ stage: "code", done: 0, total: 0, skip: false }));

/** Move the build to `stage` (counts reset unless given). */
export const setBuild = (stage: BuildStage, done = 0, total = 0) => useBuild.setState({ stage, done, total });

/* ---------- progressive builds (an airplane that opts in with `progressive`, e.g. the SR22T) ---------- */

/** While a catalogue builds progressively: its parts whose geometry is built, the only ones Parts mounts. */
const building = new WeakMap<Catalogue, Set<PartSpec>>();

/** Start mounting `cat`'s parts as they are added to the returned set (and the build's count moves). */
export function beginParts(cat: Catalogue) {
  const built = new Set<PartSpec>();
  building.set(cat, built);
  buildIn = true;
  useBuild.setState({ skip: false });
  return built;
}

/** Mount all of `cat`'s parts again (call before the stage moves on, so Parts re-renders). */
export const endParts = (cat: Catalogue) => building.delete(cat);

/** The parts of `cat` that may mount: null (all) unless a progressive build is running; re-renders as parts are added. */
export function useBuiltParts(cat: Catalogue) {
  useBuild((b) => (building.has(cat) ? b.done : -1));
  return building.get(cat) ?? null;
}

/** How long a part a progressive build adds glows (its highlight material), ms. */
export const BUILD_IN_MS = 300; // approximate: a display choice
const addedAt = new WeakMap<PartSpec, number>();
let buildIn = true,
  lastAdded = -Infinity;

/** A part was added now: it glows for BUILD_IN_MS, unless the user prefers reduced motion or skipped the build-in. */
export function markAdded(spec: PartSpec) {
  if (!buildIn || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  lastAdded = performance.now();
  addedAt.set(spec, lastAdded);
}

/** Is `spec` still in its build-in glow? (Called for every part every frame: no glow anywhere is one comparison.) */
export function buildingIn(spec: PartSpec) {
  if (!buildIn || lastAdded === -Infinity) return false;
  const now = performance.now();
  if (now - lastAdded >= BUILD_IN_MS) return false;
  const t = addedAt.get(spec);
  return t !== undefined && now - t < BUILD_IN_MS;
}

/** The loader's Add all: no more build-in, and the rest of the build is added at once. */
export function skipBuild() {
  buildIn = false;
  useBuild.setState({ skip: true });
}

/** Resolves after the next frame has rendered (in the task after it), so a slice of work never delays a frame. */
export const nextFrame = () => new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0)));
