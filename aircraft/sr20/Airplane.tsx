"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type * as THREE from "three";
import { ControlSurfaces } from "@/components/scene/ControlSurface";
import { Flows } from "@/components/scene/Flows";
import { LightFX, type BeamSpec, type GlowSpec } from "@/components/scene/LightFX";
import { Parts, Shells } from "@/components/scene/Part";
import { Screens, type ScreenSpec } from "@/components/scene/Screens";
import { Tanks, type TankSpec } from "@/components/scene/Tanks";
import { WindowOutlines } from "@/components/scene/WindowOutlines";
import { D2R, type Vec3 } from "@/lib/math";
import { useView } from "@/lib/view";
import { ControlRig } from "./ControlRig";
import { drawMfdScreen, drawOff, drawPfdScreen, drawStandby } from "./displays";
import { FLOWS, cabinAirColor, flowRates, isCabinAir } from "./flows";
import { loft, windowOutlines, wingSec } from "./geometry";
import { bladeAngle, cabinLit, extLit, live } from "./model";
import { CAT, CYLS, LIGHTS, NOSE_CASTER, NOSE_GEAR, PROP, TANK_CHORD, TANK_SPAN, YOKES, YOKE_X, YOKE_Y } from "./parts";
import { useSR20 } from "./store";
import { engineHidden } from "./engine-groups";
import { useEngineGroups } from "./engine-group-store";
import { isOptionalPitotFlow } from "./fuel-pitot-depth-flow";
import { electricalAvionicsFlowFitted } from "./electrical-avionics-depth-flow";

const P = ({ parent }: { parent?: string }) => <Parts cat={CAT} parent={parent} />;

/** Control-surface deflections (radians) from the yokes, pedals and flap motor. */
function surfaceAngle(key: string) {
  const c = useSR20.getState().s.ctrl,
    fl = live.flapAng * D2R;
  const ail = c.roll * 18 * D2R,
    el = c.pitch * 22 * D2R,
    rud = c.yaw * 22 * D2R;
  return (
    ({ flapR: fl, flapL: -fl, ailR: -ail, ailL: -ail, elevR: -el, elevL: el, rudder: rud } as Record<string, number>)[
      key
    ] ?? 0
  );
}

function NoseGear() {
  const caster = useRef<THREE.Group>(null!);
  useFrame(() => {
    caster.current.rotation.y = -useSR20.getState().s.gear.diff * 85 * D2R;
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
    const ba = bladeAngle(useSR20.getState().s) * D2R * 0.6;
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
      <group key={c.n} position={[c.x, -0.14, c.s * 0.25]}>
        <P parent={"cyl:" + c.n} />
      </group>
    ))}
  </>
);

function Yokes() {
  const g = useRef<THREE.Group[]>([]),
    grip = useRef<THREE.Group[]>([]);
  useFrame(() => {
    const c = useSR20.getState().s.ctrl;
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
    const f = useSR20.getState().s.fuel;
    return (k === "L" ? f.qL : f.qR) / 28;
  },
  name: (s > 0 ? "Right" : "Left") + " wing tank",
  note: "Integral wet-wing tank: 29.3 gal capacity, 28 gal usable. Inboard and outboard float-type quantity sensors (POH 7-41, AMM 28-40). Tank outline and level are schematic.",
}));

/* ---------- live cockpit displays ---------- */
// GDU 1050A: 10.4 in., 1024 × 768 (4:3) — the SR20's standard screens (12 in. optional). Centres ≈1.39 screen widths apart
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
      const { s, E } = useSR20.getState();
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
    note: "Engine Strip on the left, map on the right. MFD A (MAIN BUS 3) or MFD B (MAIN BUS 1). % power is estimated from RPM and manifold pressure and fuel flow is illustrative; GAL Used, oil, CHT and EGT aren't simulated.",
    draw: (ctx, W, H) => {
      const { s, E } = useSR20.getState();
      if (E.mfd) drawMfdScreen(ctx, W, H, s, E);
      else drawOff(ctx, W, H);
    },
  },
  {
    key: "sby",
    px: [420, 180],
    size: [0.14, 0.06],
    pos: [2.175, -0.07, -0.245],
    pinAt: [0, 0.033, 0],
    sys: ["avionics", "pitot"],
    name: "Standby — MD302",
    note: "Attitude on the left screen, airspeed and altitude on the right. STDBY ATTD A (ESS BUS 1) + STDBY ATTD B (MAIN BUS 1) through diodes.",
    draw: (ctx, W, H) => {
      const { s, E } = useSR20.getState();
      if (E.stby) drawStandby(ctx, W, H, s);
      else drawOff(ctx, W, H);
    },
  },
];

/* ---------- exterior + cabin light glows (exterior in Overview/Lighting, cabin in Lighting) ---------- */
const extOn = (k: "nav" | "strobe" | "land" | "ice") => () => {
  const sys = useView.getState().sys,
    { s, E } = useSR20.getState();
  return (sys === "overview" || sys === "lighting") && extLit(s, E)[k];
};
const cabOn = (k: "dome" | "foot" | "step" | "bag") => () => {
  const { s, E } = useSR20.getState();
  return useView.getState().sys === "lighting" && cabinLit(s, E)[k];
};
const strobeOn = extOn("strobe");
/** Wingtip landing lights shine forward and a little down. */
const landAim = (p: Vec3): Vec3 => [p[0] + 2.8, p[1] - 0.45, p[2]];
const GLOWS: GlowSpec[] = [
  { key: "navL", pos: LIGHTS.tipL, color: "#FF2A2A", size: 0.3, on: extOn("nav") },
  { key: "navR", pos: LIGHTS.tipR, color: "#22FF66", size: 0.3, on: extOn("nav") },
  { key: "aftL", pos: LIGHTS.aftL, color: "#FFFFFF", size: 0.22, on: extOn("nav") },
  { key: "aftR", pos: LIGHTS.aftR, color: "#FFFFFF", size: 0.22, on: extOn("nav") },
  { key: "strL", pos: LIGHTS.tipL, color: "#FFFFFF", size: 0.8, on: (t) => strobeOn() && t % 1.2 < 0.06 },
  { key: "strR", pos: LIGHTS.tipR, color: "#FFFFFF", size: 0.8, on: (t) => strobeOn() && t % 1.2 < 0.06 },
  { key: "landL", pos: LIGHTS.landL, color: "#FFF6DD", size: 0.45, on: extOn("land") },
  { key: "landR", pos: LIGHTS.landR, color: "#FFF6DD", size: 0.45, on: extOn("land") },
  { key: "iceL", pos: LIGHTS.iceL, color: "#FFF6DD", size: 0.25, on: extOn("ice") },
  { key: "iceR", pos: LIGHTS.iceR, color: "#FFF6DD", size: 0.25, on: extOn("ice") },
  { key: "dome", pos: LIGHTS.dome, color: "#FFE7B0", size: 0.6, on: cabOn("dome") },
  { key: "bag", pos: LIGHTS.bag, color: "#FFE7B0", size: 0.5, on: cabOn("bag") },
  ...LIGHTS.foot.map((p, i) => ({ key: "foot" + i, pos: p, color: "#FFE7B0", size: 0.35, on: cabOn("foot") })),
  ...LIGHTS.step.map((p, i) => ({ key: "step" + i, pos: p, color: "#FFE7B0", size: 0.4, on: cabOn("step") })),
];
const BEAMS: BeamSpec[] = [
  { key: "landL", from: LIGHTS.landL, to: landAim(LIGHTS.landL), r: 0.45, opacity: 0.1, on: extOn("land") },
  { key: "landR", from: LIGHTS.landR, to: landAim(LIGHTS.landR), r: 0.45, opacity: 0.1, on: extOn("land") },
  { key: "iceL", from: LIGHTS.iceL, to: LIGHTS.iceAimL, r: 0.16, opacity: 0.12, on: extOn("ice") },
  { key: "iceR", from: LIGHTS.iceR, to: LIGHTS.iceAimR, r: 0.16, opacity: 0.12, on: extOn("ice") },
];

const rates = () => {
  const { s, E } = useSR20.getState();
  return flowRates(s, E);
};
const flowColor = (k: string, out: THREE.Color) => {
  if (!isCabinAir(k)) return false;
  const { s, E } = useSR20.getState();
  cabinAirColor(s, E, out);
  return true;
};

/** The SR20 G6 scene: airframe shells, control surfaces, moving assemblies, tanks, displays, lights. */
export function Model() {
  const shown = useEngineGroups((x) => x.shown);
  const engineView = useView((x) => x.sys === "engine" && !x.walking);
  // Reading the option rebuilds Parts' fitted lists when the second GSU is removed.
  const dualAdahrs = useSR20((x) => x.s.avx.dualAdahrs);
  const flows = useMemo(
    () =>
      FLOWS.filter(
        (flow) =>
          (!engineView || !engineHidden(flow, "engine", shown)) &&
          (dualAdahrs || !isOptionalPitotFlow(flow.key)) &&
          electricalAvionicsFlowFitted(flow, useSR20.getState().s),
      ),
    [shown, engineView, dualAdahrs],
  );
  return (
    <>
      <Shells cat={CAT} />
      <ControlSurfaces cat={CAT} angle={surfaceAngle} />
      <P />
      <NoseGear />
      <Propeller />
      <Cylinders />
      <Yokes />
      <ControlRig />
      <Tanks tanks={TANKS} />
      <Flows flows={flows} rates={rates} color={flowColor} />
      <Screens screens={SCREENS} />
      <LightFX glows={GLOWS} beams={BEAMS} />
      <WindowOutlines loops={windowOutlines} />
    </>
  );
}
