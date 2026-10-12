"use client";
/** SR20-only study progress and reversible scene state. No progress or model state is shared with the SR22T walk. */
import { create } from "zustand";
import { selectAircraft } from "@/lib/fleet";
import { toVec3 } from "@/lib/math";
import { view as scene } from "@/lib/registry";
import { useView, type CamRequest, type View } from "@/lib/view";
import { live, type Elec, type Sim } from "./model";
import { useSR20 } from "./store";
import { SYS } from "./systems";
import {
  flapsAt,
  loadProgress,
  rampState,
  saveProgress,
  simAt,
  stationStart,
  walkParam,
  walkSteps,
  type Progress,
  type Step,
} from "./walk";

export type WalkPhase = "intro" | "resume" | "walk" | "done";
export interface WalkState {
  phase: WalkPhase;
  done: boolean;
  at: number;
  from: number;
  marks: Progress["marks"];
  ms: number;
  since: number | null;
  big: boolean;
}
export const useWalk = create<WalkState>(() => ({
  phase: "intro",
  done: false,
  at: 0,
  from: 1,
  marks: {},
  ms: 0,
  since: null,
  big: false,
}));
const BIG_KEY = "sr20-walkaround-big";
type ViewKeep = Pick<View, "sys" | "xray" | "labels" | "spin" | "ctrlFocus" | "focus" | "hover" | "spot" | "cam">;
let prior: { s: Sim; E: Elec; live: typeof live; view: ViewKeep } | null = null;
let steps: Step[] = [];
export const walkNow = () => ({ steps, prior: prior?.s ?? null });
const now = () => performance.now();
export const elapsed = (w: WalkState) => w.ms + (w.since === null ? 0 : now() - w.since);
export function checkpointWalk() {
  const w = useWalk.getState(),
    step = steps[w.at];
  if (prior && step && (w.phase === "walk" || w.phase === "done"))
    saveProgress({ v: 1, at: step.item.id, marks: w.marks, ms: Math.round(elapsed(w)), done: w.done });
}
function framing(cam: CamRequest | null): CamRequest | null {
  return scene.camera && scene.target
    ? { p: toVec3(scene.camera.position), t: toVec3(scene.target), id: cam?.id ?? 0, exact: true }
    : cam;
}
/** Preserve nested live-object identities, because animation code may retain references. */
function restoreLive(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (value && typeof value === "object" && current && typeof current === "object")
      restoreLive(current as Record<string, unknown>, value as Record<string, unknown>);
    else target[key] = value;
  }
}
const setSim = (s: Sim) =>
  useSR20.getState().update((d) => {
    Object.assign(d, s);
  });

export function openWalk(n?: number) {
  if (prior && useView.getState().walking) {
    if (n) {
      checkpointWalk();
      useWalk.setState({ phase: "intro", from: n, since: null });
    }
    return;
  }
  if (useView.getState().ac !== "sr20") selectAircraft("sr20");
  const v = useView.getState(),
    { s, E } = useSR20.getState();
  prior = {
    s,
    E,
    live: structuredClone(live),
    view: {
      sys: v.sys,
      xray: v.xray,
      labels: v.labels,
      spin: v.spin,
      ctrlFocus: v.ctrlFocus,
      focus: v.focus,
      hover: v.hover,
      spot: v.spot,
      cam: framing(v.cam),
    },
  };
  steps = walkSteps();
  const saved = n ? null : loadProgress();
  let big = false;
  try {
    big = localStorage.getItem(BIG_KEY) === "1";
  } catch {}
  useWalk.setState({
    phase: saved && !saved.done ? "resume" : "intro",
    done: false,
    at: 0,
    from: n ?? 1,
    marks: {},
    ms: 0,
    since: null,
    big,
  });
  useView.setState({
    walking: true,
    xray: true,
    labels: false,
    spin: false,
    ctrlFocus: "all",
    focus: null,
    hover: null,
    spot: null,
  });
  setSim(rampState(s));
  live.rpm = 0;
  live.flapAng = 0;
  live.capsT = -1;
  live.capsPlaying = false;
}
export function closeWalk() {
  if (!prior) return;
  checkpointWalk();
  useWalk.setState({ since: null });
  const saved = prior;
  prior = null;
  const here = useView.getState().ac === "sr20";
  useSR20.setState({ s: saved.s, E: saved.E });
  restoreLive(live, saved.live);
  const { sys, focus, hover, spot, cam, ...toggles } = saved.view;
  useView.setState({
    walking: false,
    spot: null,
    focus: null,
    hover: null,
    ...toggles,
    ...(here ? { sys, focus, hover, spot, cam } : {}),
  });
  if (here && !cam) useView.getState().flyTo(...(SYS.find((s) => s.id === sys) ?? SYS[0]).cam);
}
// Only this module's active walk can close it; importing it must not interfere with another aircraft's walk.
useView.subscribe((v) => {
  if (prior && v.walking && v.ac !== "sr20") closeWalk();
});

export function bootWalk(search: string) {
  const n = walkParam(search);
  if (n) {
    const query = new URLSearchParams(search);
    query.delete("walk");
    const rest = query.toString();
    try {
      history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : ""));
    } catch {}
    openWalk(n);
  } else {
    const saved = loadProgress();
    if (saved && !saved.done) openWalk();
  }
}
export function beginWalk() {
  if (!prior) return;
  useWalk.setState({
    phase: "walk",
    done: false,
    at: Math.max(0, stationStart(steps, useWalk.getState().from)),
    marks: {},
    ms: 0,
    since: now(),
  });
  checkpointWalk();
}
export function resumeWalk() {
  if (!prior) return;
  const saved = loadProgress(),
    at = saved ? steps.findIndex((s) => s.item.id === saved.at) : -1;
  if (!saved || at < 0) return beginWalk();
  useWalk.setState({ phase: "walk", done: saved.done, at, marks: saved.marks, ms: saved.ms, since: now() });
  checkpointWalk();
}
export function resetWalk() {
  saveProgress(null);
  useWalk.setState({ phase: "intro", done: false, at: 0, from: 1, marks: {}, ms: 0, since: null });
}
export function goStep(i: number) {
  const w = useWalk.getState();
  if (!prior || (w.phase !== "walk" && w.phase !== "done")) return;
  useWalk.setState({ phase: "walk", at: Math.max(0, Math.min(i, steps.length - 1)), since: w.since ?? now() });
  checkpointWalk();
}
export function markStep(kind: "ok" | "skip") {
  const w = useWalk.getState();
  if (!prior || w.phase !== "walk") return;
  const marks = { ...w.marks, [steps[w.at].item.id]: kind };
  if (w.at === steps.length - 1) {
    useWalk.setState({ marks, phase: "done", done: true, ms: elapsed(w), since: null });
    checkpointWalk();
  } else {
    useWalk.setState({ marks });
    goStep(w.at + 1);
  }
}
export function setBig(big: boolean) {
  useWalk.setState({ big });
  try {
    localStorage.setItem(BIG_KEY, big ? "1" : "0");
  } catch {}
}
useWalk.subscribe((w, was) => {
  if (!prior || !useView.getState().walking || (w.at === was.at && w.phase === was.phase)) return;
  const on = w.phase === "walk" || w.phase === "done";
  setSim(on ? simAt(prior.s, steps, w.at) : rampState(prior.s));
  const forward = on && was.phase === "walk" && w.at === was.at + 1 && useSR20.getState().E.flapsPwr;
  live.flapAng = flapsAt(prior.s, steps, on ? w.at : -1, forward);
});
