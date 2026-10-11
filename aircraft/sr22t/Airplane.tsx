"use client";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ControlSurfaces } from "@/components/scene/ControlSurface";
import { Flows } from "@/components/scene/Flows";
import { LightFX, type BeamSpec, type GlowSpec } from "@/components/scene/LightFX";
import { Parts, Shells } from "@/components/scene/Part";
import { Precompile } from "@/components/scene/Precompile";
import { Screens, type ScreenSpec } from "@/components/scene/Screens";
import { Tanks, type TankSpec } from "@/components/scene/Tanks";
import { WindowOutlines } from "@/components/scene/WindowOutlines";
import { skinMat } from "@/lib/materials";
import { D2R, type Vec3 } from "@/lib/math";
import { beginParts, endParts, markAdded, nextFrame, setBuild, useBuild } from "@/lib/build";
import { specGeo, type PartSpec } from "@/lib/catalogue";
import { narrowLayout, useView } from "@/lib/view";
import { ControlRig } from "./ControlRig";
import { drawMfdScreen, drawOff, drawPfdScreen, drawStandby } from "./displays";
import { cabinAirColor, flowRates, flowsFor, isCabinAir } from "./flows";
import {
  doorHinge,
  doorRotation,
  doorWindowOutline,
  loft,
  paintSkin,
  windowOutlines,
  wingSec,
  type DoorKey,
} from "./geometry";
import { bladeDisplayPitch, cabinLit, extLit, live } from "./model";
import {
  CAT,
  CYLS,
  cylOrigin,
  TANK_SPAN,
  TANK_CHORD,
  LIGHTS,
  MD302_POS,
  NOSE_CASTER,
  NOSE_GEAR,
  PROP,
  YOKES,
  YOKE_X,
  YOKE_Y,
} from "./parts";
import { surfDeflection } from "./rig";
import { useSR22T } from "./store";
import { useEngineGroups } from "./engine-group-store";
import { fuselageInWorker, isFuselage } from "./fuselage-geo";
import { engineHidden } from "./engine-groups";

const P = ({ parent }: { parent?: string }) => <Parts cat={CAT} parent={parent} />;

/** Control-surface deflections (radians) from the yokes, pedals and flap motor. */
function surfaceAngle(key: string) {
  const c = useSR22T.getState().s.ctrl,
    fl = live.flapAng * D2R;
  const { ail, elev: el, rud } = surfDeflection(c);
  return (
    ({ flapR: fl, flapL: -fl, ailR: -ail, ailL: -ail, elevR: -el, elevL: el, rudder: rud } as Record<string, number>)[
      key
    ] ?? 0
  );
}

const DOOR_WINDOWS = {
  L: () => [doorWindowOutline(-1).map((p) => p.sub(doorHinge("L").pivot))],
  R: () => [doorWindowOutline(1).map((p) => p.sub(doorHinge("R").pivot))],
};
function DoorGroups() {
  const groups = useRef<Partial<Record<DoorKey, THREE.Group>>>({});
  useFrame((_, dt) => {
    const state = useSR22T.getState().s.doors;
    for (const key of ["L", "R", "bag"] as const) {
      const target = state[key] === "open" ? 1 : 0;
      live.doors[key] += Math.sign(target - live.doors[key]) * Math.min(Math.abs(target - live.doors[key]), dt * 1.8);
      groups.current[key]?.quaternion.copy(doorRotation(key, live.doors[key]));
    }
  });
  return (
    <>
      {(["L", "R", "bag"] as const).map((key) => (
        <group
          key={key}
          position={doorHinge(key).pivot}
          ref={(g) => {
            if (g) groups.current[key] = g;
          }}
        >
          <P parent={"door:" + key} />
          {key !== "bag" && <WindowOutlines loops={DOOR_WINDOWS[key]} />}
        </group>
      ))}
    </>
  );
}

function NoseGear() {
  const caster = useRef<THREE.Group>(null!);
  useFrame(() => {
    caster.current.rotation.y = -useSR22T.getState().s.gear.diff * 85 * D2R;
  });
  return (
    <group position={NOSE_GEAR}>
      <P parent="noseGear" />
      <group ref={caster} position={NOSE_CASTER}>
        <P parent="caster" />
      </group>
    </group>
  );
}

function Propeller() {
  const prop = useRef<THREE.Group>(null!);
  const blades = useRef<THREE.Group[]>([]);
  const reduce = useMemo(
    () => typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useFrame((_, dt) => {
    prop.current.rotation.x -= (live.rpm / 60) * Math.PI * 2 * dt * (reduce ? 0.02 : 0.12);
    const ba = bladeDisplayPitch(useSR22T.getState().s);
    blades.current.forEach((b) => b && (b.rotation.y = ba));
  });
  return (
    <group ref={prop} position={PROP}>
      {[0, 1, 2].map((i) => (
        <group key={i} rotation-x={(i * Math.PI * 2) / 3}>
          <group
            ref={(g) => {
              if (g) blades.current[i] = g;
            }}
          >
            <P parent={"blade:" + i} />
          </group>
        </group>
      ))}
    </group>
  );
}

const Cylinders = () => (
  <>
    {CYLS.map((c) => (
      <group key={c.n} position={cylOrigin(c)}>
        <P parent={"cyl:" + c.n} />
      </group>
    ))}
  </>
);

function Yokes() {
  const g = useRef<THREE.Group[]>([]),
    grip = useRef<THREE.Group[]>([]);
  useFrame(() => {
    const c = useSR22T.getState().s.ctrl;
    g.current.forEach((y) => y && (y.position.x = YOKE_X - c.pitch * 0.07));
    grip.current.forEach((y) => y && (y.rotation.x = c.roll * 0.6));
  });
  return (
    <>
      {YOKES.map((y, i) => (
        <group
          key={y.side}
          ref={(o) => {
            if (o) g.current[i] = o;
          }}
          position={[YOKE_X, YOKE_Y, y.z]}
        >
          <P parent={"yoke:" + y.side} />
          <group
            ref={(o) => {
              if (o) grip.current[i] = o;
            }}
          >
            <P parent={"grip:" + y.side} />
          </group>
        </group>
      ))}
    </>
  );
}

/* ---------- wet-wing tanks: fuel level is a clipping plane ---------- */
const TANKS: TankSpec[] = (
  [
    ["L", -1],
    ["R", 1],
  ] as const
).map(([k, s]) => ({
  key: k,
  geo: () => {
    const secs = [TANK_SPAN[0], 1.6, 2.4, 3.2, 4.0, TANK_SPAN[1]].map((z) => wingSec(s * z, ...TANK_CHORD, 0.85));
    return loft(s < 0 ? secs.map((r) => r.reverse()) : secs);
  },
  level: () => {
    const f = useSR22T.getState().s.fuel;
    return (k === "L" ? f.qL : f.qR) / 46;
  },
  name: (s > 0 ? "Right" : "Left") + " wing tank",
  note: "Integral wet-wing tank: 47.25 gal capacity, 46 gal usable. Float-type quantity sensors (POH 13772-007 2-18, 7-40, 7-43). AMM 13773-002 Rev 7 28-10, PDF p. 1088 says 47.5 gal; POH governs. Bounded by skins, main spar, aft shear web and fuel ribs (AMM 28-10, PDF p. 1088; Fig 28-10-3, PDF p. 1105). Forward bound matches the model spar at 30% chord; 60% aft chord and span stations approximate.",
}));

/* ---------- live cockpit displays ---------- */
// GDU 1050A: 10 in. (POH 7-74), 1024 × 768 (4:3) — the SR22T's standard screens (12 in. optional).
// Centres ≈1.39 screen widths apart
// (0.293 m), the proportion of the Perspective+ panel render, so the two inboard control strips nearly meet around the
// DISPLAY BACKUP button (approximate: no panel drawing found). Labels sit on the top bezel edge, clear of the pictures.
const SCREENS: ScreenSpec[] = [
  {
    key: "pfd",
    px: [640, 480],
    size: [0.211, 0.158],
    pos: [2.275, 0.1, -0.24],
    pinAt: [0, 0.085, 0],
    sys: ["avionics"],
    name: "PFD — GDU 1050A",
    note: "Attitude, airspeed, altitude, HSI, CAS window. PFD A (ESS BUS 1) and PFD B (MAIN BUS 2) — either one powers it. Shows PFD + Engine Strip if the MFD fails or with DISPLAY BACKUP.",
    draw: (ctx, W, H) => {
      const { s, E } = useSR22T.getState();
      if (E.pfd) drawPfdScreen(ctx, W, H, s, E);
      else drawOff(ctx, W, H);
    },
  },
  {
    key: "mfd",
    px: [640, 480],
    size: [0.211, 0.158],
    pos: [2.275, 0.1, 0.053],
    pinAt: [0, 0.085, 0],
    sys: ["avionics"],
    name: "MFD — GDU 1050A",
    note: "Engine Strip on the left, map on the right. MFD A (MAIN BUS 3) or MFD B (MAIN BUS 1). % power is an illustrative estimate from RPM and manifold pressure, and fuel flow is illustrative; GAL Used, oil, CHT, EGT and TIT aren't simulated.",
    draw: (ctx, W, H) => {
      const { s, E } = useSR22T.getState();
      if (E.mfd) drawMfdScreen(ctx, W, H, s, E);
      else drawOff(ctx, W, H);
    },
  },
  {
    key: "sby",
    px: [420, 180],
    size: [0.14, 0.06],
    pos: MD302_POS,
    pinAt: [0, 0.033, 0],
    sys: ["avionics", "pitot"],
    name: "Standby — MD302",
    note: "Attitude on the left screen, airspeed and altitude on the right. STDBY ATTD A (ESS BUS 1) + STDBY ATTD B (MAIN BUS 1) through diodes.",
    draw: (ctx, W, H) => {
      const { s, E } = useSR22T.getState();
      if (E.stby) drawStandby(ctx, W, H, s);
      else drawOff(ctx, W, H);
    },
  },
];

/* ---------- exterior + cabin light glows (exterior in Overview/Lighting, cabin in Lighting) ---------- */
const extOn = (k: "nav" | "strobe" | "land" | "recog" | "ice") => () => {
  const sys = useView.getState().sys,
    { s, E } = useSR22T.getState();
  return (sys === "overview" || sys === "lighting") && extLit(s, E)[k];
};
const cabOn = (k: "dome" | "foot" | "step" | "bag") => () => {
  const { s, E } = useSR22T.getState();
  return useView.getState().sys === "lighting" && cabinLit(s, E)[k];
};
const strobeOn = extOn("strobe");
/** The lower-cowl landing light shines forward and down. */
const landAim = (p: Vec3): Vec3 => [p[0] + 2.8, p[1] - 0.6, p[2]];
const GLOWS: GlowSpec[] = [
  { key: "navL", pos: LIGHTS.tipL, color: "#FF2A2A", size: 0.3, on: extOn("nav") },
  { key: "navR", pos: LIGHTS.tipR, color: "#22FF66", size: 0.3, on: extOn("nav") },
  { key: "aftL", pos: LIGHTS.aftL, color: "#FFFFFF", size: 0.22, on: extOn("nav") },
  { key: "aftR", pos: LIGHTS.aftR, color: "#FFFFFF", size: 0.22, on: extOn("nav") },
  { key: "strL", pos: LIGHTS.tipL, color: "#FFFFFF", size: 0.8, on: (t) => strobeOn() && t % 1.2 < 0.06 },
  { key: "strR", pos: LIGHTS.tipR, color: "#FFFFFF", size: 0.8, on: (t) => strobeOn() && t % 1.2 < 0.06 },
  { key: "land", pos: LIGHTS.cowl, color: "#F4F8FF", size: 0.5, on: extOn("land") },
  { key: "recogL", pos: LIGHTS.recogL, color: "#FFF6DD", size: 0.3, on: extOn("recog") },
  { key: "recogR", pos: LIGHTS.recogR, color: "#FFF6DD", size: 0.3, on: extOn("recog") },
  { key: "iceL", pos: LIGHTS.iceL, color: "#FFF6DD", size: 0.25, on: extOn("ice") },
  { key: "iceR", pos: LIGHTS.iceR, color: "#FFF6DD", size: 0.25, on: extOn("ice") },
  { key: "dome", pos: LIGHTS.dome, color: "#FFE7B0", size: 0.6, on: cabOn("dome") },
  { key: "bag", pos: LIGHTS.bag, color: "#FFE7B0", size: 0.5, on: cabOn("bag") },
  ...LIGHTS.foot.map((p, i) => ({ key: "foot" + i, pos: p, color: "#FFE7B0", size: 0.35, on: cabOn("foot") })),
  ...LIGHTS.step.map((p, i) => ({ key: "step" + i, pos: p, color: "#FFE7B0", size: 0.4, on: cabOn("step") })),
];
const BEAMS: BeamSpec[] = [
  { key: "land", from: LIGHTS.cowl, to: landAim(LIGHTS.cowl), r: 0.5, opacity: 0.1, on: extOn("land") },
  { key: "iceL", from: LIGHTS.iceL, to: LIGHTS.iceAimL, r: 0.16, opacity: 0.12, on: extOn("ice") },
  { key: "iceR", from: LIGHTS.iceR, to: LIGHTS.iceAimR, r: 0.16, opacity: 0.12, on: extOn("ice") },
];

const rates = () => {
  const { s, E } = useSR22T.getState();
  return flowRates(s, E);
};
const flowColor = (k: string, out: THREE.Color) => {
  if (!isCabinAir(k)) return false;
  const { s, E } = useSR22T.getState();
  cabinAirColor(s, E, out);
  return true;
};

/**
 * The SR22T G6 scene: airframe shells, control surfaces, moving assemblies, tanks, displays, lights. `overlays` false leaves
 * out the tanks, flows, screens, light effects and window outlines (a progressive build adds them last).
 */
export function Model({ overlays = true }: { overlays?: boolean } = {}) {
  // Rebuild scene part lists and the stall warning flows when optional TKS equipment changes (including portal labels).
  const fiki = useSR22T((x) => x.s.equip.fiki);
  const shown = useEngineGroups((x) => x.shown);
  const engineView = useView((x) => x.sys === "engine");
  const flows = useMemo(() => {
    const all = flowsFor(fiki);
    if (!engineView) return all;
    const filtered = all.filter((flow) => !engineHidden(flow, "engine", shown));
    // Keep geometry and particle offsets when the effective flow list is unchanged.
    return filtered.length === all.length ? all : filtered;
  }, [fiki, engineView, shown]);
  return (
    <>
      <Shells cat={CAT} />
      <ControlSurfaces cat={CAT} angle={surfaceAngle} />
      <P />
      <DoorGroups />
      <NoseGear />
      <Propeller />
      <Cylinders />
      <Yokes />
      <ControlRig />
      {overlays && <Tanks tanks={TANKS} />}
      {overlays && <Flows flows={flows} rates={rates} color={flowColor} />}
      {overlays && <Screens screens={SCREENS} />}
      {overlays && <LightFX glows={GLOWS} beams={BEAMS} />}
      {overlays && <WindowOutlines loops={windowOutlines} />}
    </>
  );
}

/** Test hook (scripts/test-load-ui.mjs): parts named here are held back until the list is removed, forcing a late mount. */
const heldBack = (p: PartSpec) =>
  (globalThis as { __buildHold?: string[] }).__buildHold?.includes(p.name ?? "") ?? false;

/** The parts the view needs first: the shown system's (a deep link), then the labelled ones. */
function priority() {
  const { sys } = useView.getState();
  return (p: PartSpec) => (heldBack(p) ? 3 : sys !== "overview" && p.sys.includes(sys) ? 0 : p.pin ? 1 : 2);
}

/** Work per slice of the systems build (building parts and React mounting them), ms: one slice runs between two frames. */
const SLICE_MS = 8, // approximate: frame pacing, not a source value
  SLICE_MS_NARROW = 12; // approximate: phones get fewer, larger slices

/**
 * The SR22T scene as the airplane mounts it (`progressive`), stage by stage for the loader (lib/build.ts):
 * 1. its shader programs start compiling (components/scene/Precompile.tsx);
 * 2. the skin shells and control surfaces are built in slices between frames, the fuselage skin in a worker
 *    (fuselage-geo.ts, started at boot by the airplane's prepare); part geometry is built ahead until it is back;
 * 3. once the shaders are ready, the airframe mounts: the camera responds from here on;
 * 4. the parts are built and mount in slices of SLICE_MS between frames, those the view needs first (priority());
 * 5. the tanks, flows, screens and light effects mount, and the scene is complete.
 * The final scene is the one Model builds in one go (tests/scene-snapshot.test.ts, npm run test:ui:load).
 */
export function SceneModel() {
  const [stage, setStage] = useState<"start" | "parts" | "complete">("start");
  const skin = useMemo(() => [skinMat(paintSkin)], []);
  // each run (a remount, or React's dev double-mount, starts another) stops as soon as a newer one starts or the model unmounts
  const runs = useRef(0);
  const run = useCallback(async (compiled: Promise<unknown>) => {
    const me = ++runs.current,
      current = () => runs.current === me;
    let shadersReady = false;
    void compiled.then(() => (shadersReady = true));
    setBuild("airframe");
    // the fuselage skin is built in a worker meanwhile (on the main thread if the worker can't run)
    const hull = CAT.shells.find(isFuselage)!,
      fuselage = fuselageInWorker();
    let hullBuilt: THREE.BufferGeometry | null | undefined;
    void fuselage.then((g) => (hullBuilt = g));
    // the other shells and the surfaces, in slices between frames; then, until the fuselage is back, part geometry
    // (built, not mounted yet)
    const parts = CAT.parts.filter((p) => !p.fitted || p.fitted()),
      queue = [...CAT.shells.filter((s) => s !== hull), ...CAT.surfaces];
    let ahead = 0;
    while (queue.length || hullBuilt === undefined) {
      await nextFrame();
      if (!current()) return;
      const t0 = performance.now(),
        budget = narrowLayout() ? SLICE_MS_NARROW : SLICE_MS;
      while (performance.now() - t0 < budget && (queue.length || (hullBuilt === undefined && ahead < parts.length)))
        specGeo(queue.shift() ?? parts[ahead++]);
      if (!queue.length && ahead >= parts.length) await fuselage;
    }
    if (!current()) return; // the awaited worker may finish after this model has unmounted
    specGeo(hull); // the worker's geometry, primed when it arrived; built here if the worker could not run
    if (!shadersReady) {
      setBuild("shaders");
      await compiled;
      if (!current()) return;
    }
    const built = beginParts(CAT);
    setBuild("systems", 0, parts.length);
    setStage("parts");
    // React's commit of the parts a slice adds counts against the slice too: its cost per part, re-measured each slice
    let commitPerPart = 0.5; // approximate: a starting estimate, ms
    while (built.size < parts.length) {
      await nextFrame();
      if (!current()) return;
      const rank = priority(),
        next = parts.filter((p) => !built.has(p) && !heldBack(p)).sort((a, b) => rank(a) - rank(b)),
        budget = narrowLayout() ? SLICE_MS_NARROW : SLICE_MS,
        t0 = performance.now();
      let n = 0;
      for (const p of next) {
        specGeo(p);
        built.add(p);
        markAdded(p);
        n++;
        if (!useBuild.getState().skip && performance.now() - t0 + n * commitPerPart > budget) break;
      }
      if (!n) continue; // only held-back parts left
      const t1 = performance.now();
      useBuild.setState({ done: built.size });
      await Promise.resolve(); // the store update renders and commits in a microtask queued before this one
      commitPerPart = (commitPerPart + (performance.now() - t1) / n) / 2;
    }
    setStage("complete");
    await nextFrame();
    if (!current()) return;
    endParts(CAT);
    setBuild("ready");
  }, []);
  useEffect(
    () => () => {
      runs.current++;
      endParts(CAT);
    },
    [],
  );
  return (
    <>
      <Precompile extra={skin} onStarted={run} />
      {stage !== "start" && <Model overlays={stage === "complete"} />}
    </>
  );
}
