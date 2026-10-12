"use client";
import { useTicker } from "@/components/ui/controls";
import type { AircraftDef, ModelRefs } from "../types";
import { GROUND_Y, inFus } from "./geometry";
import { casMessages, live } from "./model";
import { Model } from "./Airplane";
import { Parachute, capsPhase } from "./Parachute";
import { CAT } from "./parts";
import { Caps } from "./panels/caps";
import { Electrical } from "./panels/electrical";
import { Controls, Flaps, Gear } from "./panels/flight";
import { Airframe, Avionics, Cabin, Doors, Lighting, Overview } from "./panels/general";
import { Engine, Fuel, Propeller } from "./panels/powerplant";
import { Environment, Pitot } from "./panels/air";
import { resetCaps, useSR20 } from "./store";
import { CAPS_CAM, SYS } from "./systems";
import { simTick } from "./tick";
import { useView } from "@/lib/view";
import { WalkPanel } from "./panels/walkaround";
import { WalkMarker } from "./WalkMarker";
import { bootWalk, closeWalk, openWalk } from "./walk-store";

function Overlay(refs: ModelRefs) {
  return (
    <>
      <Parachute {...refs} />
      <WalkMarker />
    </>
  );
}

/** CAPS timeline readout in the viewport while the CAPS view is open. */
function CapsHud() {
  useTicker(100);
  const sys = useView((x) => x.sys);
  if (sys !== "caps") return null;
  const t = Math.max(0, live.capsT),
    [, title, sub] = live.capsT < 0 ? [0, "Ready", ""] : capsPhase(t);
  return (
    <div className="caps-hud">
      <span>T + {t.toFixed(1)} s</span>
      <b>{title}</b>
      <span className="sub">{sub}</span>
    </div>
  );
}

function useAlerts() {
  const s = useSR20((x) => x.s),
    E = useSR20((x) => x.E);
  const powered = E.pfd || E.mfd;
  return { powered, msgs: powered ? casMessages(s, E) : [] };
}

export const SR20: AircraftDef = {
  id: "sr20",
  short: "SR20",
  name: "SR20 G6",
  sub: "Perspective+ · GFC 700 · IO-390",
  doc: "POH §7",
  systems: SYS,
  groundY: GROUND_Y,
  pivotX: 1,
  Model,
  Overlay,
  panels: {
    overview: Overview,
    airframe: Airframe,
    controls: Controls,
    flaps: Flaps,
    gear: Gear,
    doors: Doors,
    engine: Engine,
    propeller: Propeller,
    fuel: Fuel,
    electrical: Electrical,
    lighting: Lighting,
    environment: Environment,
    pitot: Pitot,
    avionics: Avionics,
    cabin: Cabin,
    caps: Caps,
  },
  tick: simTick,
  useAlerts,
  alertTitle: "CAS",
  Hud: CapsHud,
  onSelect: (to) => {
    if (to !== "caps" && useSR20.getState().s.capsOn) resetCaps();
  },
  labels: { cat: CAT, inside: inFus },
  resetCam: () => (useSR20.getState().s.capsOn ? CAPS_CAM : null),
  walk: { Panel: WalkPanel, open: () => openWalk(), close: closeWalk, boot: bootWalk },
};
