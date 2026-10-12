/** Pure SR20 walk logic: model state, sided part locations, camera framing and validated saved study progress. */
import * as THREE from "three";
import { specGeo } from "@/lib/catalogue";
import { toVec3, V } from "@/lib/math";
import { partCentre, partSide, type Side } from "@/lib/spot";
import { initialSim, type Sim } from "./model";
import { CAT, NOSE_CASTER, NOSE_GEAR, PROP } from "./parts";
import { CROUCH_Y, NOT_MODELLED, WALK, type CameraPose, type WalkItem, type WalkStation } from "./walkaround";

export interface Step {
  station: WalkStation;
  item: WalkItem;
}
export const walkSteps = (): Step[] => WALK.flatMap((station) => station.items.map((item) => ({ station, item })));
export const stationStart = (steps: Step[], n: number) => steps.findIndex((s) => s.station.n === n);

/** Healthy study ramp state, retaining actual model fuel quantities and optional second ADAHRS configuration. */
export function rampState(prior: Sim): Sim {
  const s = structuredClone(initialSim);
  s.avx.dualAdahrs = prior.avx.dualAdahrs;
  s.fuel.qL = prior.fuel.qL;
  s.fuel.qR = prior.fuel.qR;
  s.pitot.oat = prior.pitot.oat;
  s.eng = { ...s.eng, running: false, key: "OFF", lever: 0, mix: 0 };
  s.elec = { ...s.elec, bat1: false, bat2: false, avionics: false, tBat: 0 };
  s.fuel.boost = false;
  s.flaps.cmd = 0;
  s.pitot.heat = false;
  s.lights = { ...s.lights, nav: false, strobe: false, land: false, ice: false };
  s.capsOn = false;
  return s;
}
export function simAt(prior: Sim, steps: Step[], at: number): Sim {
  const s = rampState(prior);
  for (let i = 0; i <= at && i < steps.length; i++) steps[i].item.sim?.(s);
  return s;
}
/** Flaps remain physically extended after BAT 1/2 OFF, since the unpowered motor cannot retract them. */
export const flapsAt = (prior: Sim, steps: Step[], at: number, animate = false) =>
  simAt(prior, steps, animate ? at - 1 : at).flaps.cmd * 0.32;
export const stepSide = ({ station, item }: Step): Side => {
  const side = item.side ?? station.side;
  return side === "L" ? -1 : side === "R" ? 1 : 0;
};
export const inCatalogue = (name: string) =>
  CAT.parts.some((p) => p.name === name) ||
  CAT.surfaces.some((p) => p.name === name) ||
  CAT.shells.some((p) => p.name === name);
export const stepParts = (step: Step) => ({
  shown: step.item.parts.filter((p) => !(p in NOT_MODELLED)),
  missing: step.item.parts.filter((p) => p in NOT_MODELLED),
});

function groupOrigin(parent: string) {
  if (parent.startsWith("surf:")) return V(...CAT.surfacePivot(parent.slice(5)));
  if (parent === "noseGear") return V(...NOSE_GEAR);
  if (parent === "caster") return V(...NOSE_GEAR).add(V(...NOSE_CASTER));
  if (parent.startsWith("blade:")) return V(...PROP);
  return null;
}
export function nameCentres(name: string, side: Side = 0): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const keep = (z: number) => !side || Math.abs(z) < 0.05 || Math.sign(z) === side;
  for (const p of CAT.parts) {
    if (p.name !== name) continue;
    const g = specGeo(p),
      part = partSide(p, g, CAT);
    if (side && part && part !== side) continue;
    const origin = p.parent ? groupOrigin(p.parent) : V(0, 0, 0);
    if (origin) out.push(partCentre(p, g).add(origin));
  }
  for (const p of [...CAT.shells, ...CAT.surfaces]) {
    if (p.name !== name) continue;
    const g = specGeo(p);
    if (!g.boundingBox) g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    if ("pivot" in p) c.add(V(...p.pivot));
    if (keep(c.z)) out.push(c);
  }
  return out;
}
export function stepCentroid(step: Step): THREE.Vector3 | null {
  if (Array.isArray(step.item.target)) return V(...step.item.target);
  const names = step.item.target ? [step.item.target] : stepParts(step).shown;
  const points = names.flatMap((p) => nameCentres(p, stepSide(step)));
  return points.length ? points.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / points.length) : null;
}
let outline: THREE.Box3[] | null = null;
/** Approximate personal clearance from the outline; uses the geometry cache shared with the scene/worker. */
export function underAirplane(p: THREE.Vector3) {
  outline ??= [...CAT.shells, ...CAT.surfaces].map((part) => {
    const g = specGeo(part);
    if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox!.clone();
    if ("pivot" in part) box.translate(V(...part.pivot));
    return box.expandByScalar(0.3);
  });
  return outline.some((box) => p.x >= box.min.x && p.x <= box.max.x && p.z >= box.min.z && p.z <= box.max.z);
}
export function stepPose(step: Step): CameraPose {
  const c = stepCentroid(step),
    { p } = step.station.cam;
  if (!c) return step.station.cam;
  const y = step.item.crouch ? CROUCH_Y : p[1];
  const away = V(p[0] - c.x, 0, p[2] - c.z),
    distance = away.length();
  away.normalize();
  // approximate display framing: 1.2–2.4 m from the highlighted component, remaining clear of the airframe
  for (let r = Math.min(Math.max(distance, 1.2), 2.4); r < distance; r += 0.05) {
    const eye = V(c.x + away.x * r, y, c.z + away.z * r);
    if (!underAirplane(eye)) return { p: toVec3(eye), t: toVec3(c) };
  }
  return { p: [p[0], y, p[2]], t: toVec3(c) };
}

export const PROGRESS_KEY = "sr20-walkaround";
export interface Progress {
  v: 1;
  at: string;
  marks: Record<string, "ok" | "skip">;
  ms: number;
  done: boolean;
}
export function parseProgress(raw: string | null): Progress | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Progress>;
    if (
      p?.v !== 1 ||
      typeof p.at !== "string" ||
      !WALK.some((s) => s.items.some((i) => i.id === p.at)) ||
      typeof p.ms !== "number" ||
      !Number.isFinite(p.ms) ||
      p.ms < 0 ||
      !p.marks ||
      typeof p.marks !== "object" ||
      Array.isArray(p.marks)
    )
      return null;
    const marks: Progress["marks"] = {};
    const ids = new Set(walkSteps().map((step) => step.item.id));
    for (const [id, mark] of Object.entries(p.marks))
      if (ids.has(id) && (mark === "ok" || mark === "skip")) marks[id] = mark;
    return { v: 1, at: p.at, marks, ms: p.ms, done: p.done === true };
  } catch {
    return null;
  }
}
export function loadProgress() {
  try {
    return parseProgress(localStorage.getItem(PROGRESS_KEY));
  } catch {
    return null;
  }
}
export function saveProgress(progress: Progress | null) {
  try {
    if (progress) localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    else localStorage.removeItem(PROGRESS_KEY);
  } catch {
    /* The study walk remains usable when storage is blocked. */
  }
}
export function walkParam(search: string): number | null {
  const v = new URLSearchParams(search).get("walk");
  if (v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= WALK.length ? n : v === "" ? 1 : null;
}
export const tally = (steps: Step[], marks: Progress["marks"]) => ({
  ok: steps.filter((s) => marks[s.item.id] === "ok").length,
  skip: steps.filter((s) => marks[s.item.id] === "skip").length,
  open: steps.filter((s) => !marks[s.item.id]).length,
});
export const clock = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};
