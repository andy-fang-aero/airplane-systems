"use client";
import { createSimStore } from "@/lib/simStore";
import { revealStage, useView } from "@/lib/view";
import { CAPS_CAM } from "./systems";
import { initialSim, initialSimFor, live, solve, type Sim } from "./model";

/**
 * SR22T systems state (switches, failures, quantities) and its electrical solution. The page's query string is read once,
 * on load (see initialSimFor): `?fiki=0` starts the airplane without ice protection, `?lights=land,ice` with those
 * lights on, `?iceprotect=on` with ice protection on.
 */
export const useSR22T = createSimStore(
  typeof location === "undefined" ? initialSim : initialSimFor(location.search),
  solve,
);

export function startCaps() {
  live.capsT = 0;
  live.capsPlaying = true;
  useSR22T.getState().update((d) => {
    d.capsOn = true;
  });
  useView.getState().flyTo(...CAPS_CAM);
  // phones: the handle is in the panel below the 3D view, which is otherwise scrolled mostly out of sight
  revealStage();
}

export function resetCaps() {
  live.capsT = -1;
  live.capsPlaying = false;
  useSR22T.getState().update((d) => {
    d.capsOn = false;
  });
}

/* ---------- oxygen scenarios ---------- */
/** Each starts from the initial state, keeping only the equipment fitted, so earlier failures and pulled breakers don't carry over. */
function fresh(d: Sim) {
  Object.assign(d, { ...structuredClone(initialSim), equip: d.equip });
}
/** Oxygen panel "Start from" buttons: [label, draft change]. Altitudes and pressures are illustrative. */
export const OXY_SCENARIOS: [string, (d: Sim) => void][] = [
  [
    "Oxygen left on after shutdown",
    (d) => {
      fresh(d);
      d.eng.running = false;
      d.eng.key = "OFF";
      d.oxy.on = true;
    },
  ],
  [
    "Low oxygen at FL180",
    (d) => {
      fresh(d);
      d.paFt = 18000;
      d.oxy.on = true;
      d.oxy.psi = 600;
    },
  ],
  [
    "Climbing above 14,000 ft with oxygen off",
    (d) => {
      fresh(d);
      d.paFt = 14500;
    },
  ],
];

/* ---------- doors: one action writes physical state and convenience-light inputs ---------- */
export type DoorCommand =
  | { cabin: "L" | "R"; position: Sim["doors"]["L"] }
  | { cabinLights: boolean }
  | { baggage: Sim["doors"]["bag"] }
  | { bagLocked: boolean };

/** Pure transition; a locked baggage door cannot open, and an open door cannot be key-locked. */
export function applyDoorCommand(d: Sim, command: DoorCommand) {
  if ("cabin" in command) d.doors[command.cabin] = command.position;
  else if ("cabinLights" in command) {
    d.doors.L = command.cabinLights ? "open" : "latched";
    if (!command.cabinLights) d.doors.R = "latched";
  } else if ("baggage" in command) {
    if (command.baggage === "closed" || !d.doors.bagLocked) d.doors.bag = command.baggage;
  } else if (d.doors.bag === "closed") d.doors.bagLocked = command.bagLocked;
  d.lights.door = d.doors.L !== "latched" || d.doors.R !== "latched";
  d.lights.bag = d.doors.bag === "open";
}
export const setDoor = (command: DoorCommand) => useSR22T.getState().update((d) => applyDoorCommand(d, command));
