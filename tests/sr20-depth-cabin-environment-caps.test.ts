/** Source-backed SR20 G6 depth, POH11934-005 7-29–33, 7-62–68, 7-92–99;
 * AMM12137-002 21-50/60, 25-10/60, 4-00. Coordinates/times marked illustrative in the model. */
import { Box3, Mesh, Vector3, type TubeGeometry } from "three";
import { describe, expect, it } from "vitest";
import { CAT } from "@/aircraft/sr20/parts";
import "@/aircraft/sr20/parts/cockpit";
import "@/aircraft/sr20/parts/doors";
import { CAPS_CABLE, ROCKET_IGNITER } from "@/aircraft/sr20/parts/caps";
import { CAPS_HANDLE_POS, capsHandleDrop } from "@/aircraft/sr20/parts/cabin";
import { AC } from "@/aircraft/sr20/parts/aircon";
import { MANIFOLD } from "@/aircraft/sr20/parts/environment";
import {
  CABIN_ENVIRONMENT_CAPS_DEPTH_FLOWS as F,
  cabinEnvironmentCapsDepthRates as rates,
} from "@/aircraft/sr20/cabin-environment-caps-depth-flow";
import { initialSim, live, solve } from "@/aircraft/sr20/model";
import { patched } from "./helpers";
import type { Sim } from "@/aircraft/sr20/model";

const named = (name: string) => CAT.parts.filter((p) => p.name === name);
const one = (name: string) => {
  expect(named(name), name).toHaveLength(1);
  return named(name)[0];
};
const v = (p: number[]) => new Vector3(...p);
const flow = (key: string) => {
  const f = F.find((f) => f.key === key);
  expect(f, key).toBeDefined();
  return f!;
};
const run = (patch: Parameters<typeof patched<Sim>>[1]) => {
  const s = patched(initialSim, patch);
  return rates(s, solve(s));
};

it("SR20 outlets are distinct components and each actual outlet duct reaches its mesh (POH7-65)", () => {
  for (const [key, name] of [
    ["panelL", "Panel eyeball outlet"],
    ["panelR", "Panel eyeball outlet"],
    ["panelL2", "Bolster eyeball outlet"],
    ["panelR2", "Bolster eyeball outlet"],
    ["armL", "Armrest eyeball outlet"],
    ["armR", "Armrest eyeball outlet"],
    ["floorF", "Kick-plate floor outlet"],
    ["floorF2", "Kick-plate floor outlet"],
    ["floorR", "Foot-warmer diffuser"],
    ["floorR2", "Foot-warmer diffuser"],
  ]) {
    expect(named(name), name).toHaveLength(2);
    const end = v(flow(key).pts.at(-1)! as number[]);
    expect(Math.min(...named(name).map((p) => end.distanceTo(v(p.pos!)))), key).toBeLessThan(1e-6);
  }
  expect(v(flow("defrost").pts.at(-1)! as number[]).distanceTo(v(one("Windshield diffuser").pos!))).toBeLessThan(1e-6);
  expect(named("Distribution manifold + fan")).toHaveLength(0);
  expect(one("Blower fan assembly").pos![0]).toBeLessThan(one("Distribution manifold").pos![0]);
});

describe("SR20 vapor-cycle and selected air routes", () => {
  it("routes floor/defrost independently while maintaining direct panel outlets (POH7-66–67)", () => {
    for (const [vent, floor, wind] of [
      ["P", false, false],
      ["PF", true, false],
      ["PFW", true, true],
      ["W", false, true],
    ] as const) {
      const r = run({ eng: { running: true }, env: { fan: 2, vent, ac: false } });
      expect(r.panelL).toBeGreaterThan(0);
      expect(r.panelL2).toBeGreaterThan(0);
      expect(r.armL).toBeGreaterThan(0);
      expect(r.floorF > 0).toBe(floor);
      expect(r.floorR > 0).toBe(floor);
      expect(r.defrost > 0).toBe(wind);
    }
    const r = run({ eng: { running: true }, env: { fan: -1 } });
    for (const key of ["toMan", "toEvap", "evapOut", "panelL", "floorF", "defrost"]) expect(r[key], key).toBe(0);
  });
  it("starts refrigeration only with running engine and all required supplies; fan airflow survives compressor failure (POH7-62)", () => {
    const patch = { eng: { running: true }, env: { fan: 2, ac: true, recirc: false } };
    const on = run(patch),
      failed = run({ ...patch, cb: { "A/C COMPR": true } }),
      stopped = run({ ...patch, eng: { running: false } });
    expect(on.acDischarge).toBeGreaterThan(0);
    expect(on.acLiquid).toBeGreaterThan(0);
    expect(on.acSuction).toBeGreaterThan(0);
    for (const key of ["acDischarge", "acToReceiver", "acLiquid", "acExpand", "acSuction", "condAirIn", "condAirOut"]) {
      expect(failed[key], key).toBe(0);
      expect(stopped[key], key).toBe(0);
    }
    expect(failed.panelL).toBeGreaterThan(0);
    expect(failed.evapOut).toBeGreaterThan(0);
  });
  it("recirculates through the evaporator and isolates the outside supply; condenser air is a different circuit", () => {
    const r = run({ eng: { running: true }, env: { fan: 3, ac: true, recirc: true, temp: 0 } });
    expect(r.recirc).toBeGreaterThan(0);
    expect(r.evapOut).toBeGreaterThan(0);
    expect(r.toEvap).toBe(0);
    expect(r.mixFirewall).toBe(0);
    for (const key of ["condAirIn", "condAirOut"]) {
      expect(flow(key).pts.every((p) => v(p as number[]).distanceTo(v(MANIFOLD)) > 0.1)).toBe(true);
    }
    expect(flow("acDischarge").pts[0]).toEqual(AC.compressor);
    expect(flow("acSuction").pts.at(-1)).toEqual(AC.compressor);
    expect(flow("acLiquid").pts.at(-1)).toEqual(one("Expansion valve").pos);
    expect(flow("condensate").pts.at(-1)).toEqual(one("Evaporator condensate drain").pos);
  });
});

it("CAPS cable connects the real handle and igniter and follows handle take-up/reset (POH7-98)", () => {
  const handle = one("CAPS activation T-handle"),
    cable = one("CAPS activation cable"),
    cover = one("CAPS activation handle cover");
  const meshes = [handle, cable, cover].map((p) => {
    const m = new Mesh(p.geo());
    m.position.set(...(p.pos ?? [0, 0, 0]));
    return m;
  });
  const oldT = live.capsT;
  try {
    const igniter = one("Rocket igniter"),
      mesh = new Mesh(igniter.geo());
    mesh.position.set(...ROCKET_IGNITER);
    mesh.updateMatrixWorld();
    const b = new Box3().setFromObject(mesh);
    expect(b.distanceToPoint(v(CAPS_CABLE.at(-1)!))).toBeLessThan(1e-6);
    mesh.geometry.dispose();
    expect(v(CAPS_CABLE[0]).distanceTo(v(CAPS_HANDLE_POS))).toBeLessThan(0.05);
    // POH: overhead at the front-seat shoulder station; compare against the actual higher seat-back mesh.
    const back = named("Pilot seat").find((p) => p.pos && p.pos[1] > -0.2)!;
    const backMesh = new Mesh(back.geo());
    backMesh.position.set(...back.pos!);
    backMesh.rotation.set(...(back.rot ?? [0, 0, 0]));
    backMesh.updateMatrixWorld();
    const shoulderBounds = new Box3().setFromObject(backMesh);
    expect(CAPS_HANDLE_POS[0]).toBeGreaterThanOrEqual(shoulderBounds.min.x);
    expect(CAPS_HANDLE_POS[0]).toBeLessThanOrEqual(shoulderBounds.max.x);
    expect(CAPS_HANDLE_POS[1]).toBeGreaterThan(shoulderBounds.max.y);
    backMesh.geometry.dispose();

    for (const t of [-1, 0, 0.075, 0.15, 8, -1]) {
      live.capsT = t;
      [handle, cable, cover].forEach((p, i) => p.anim?.(meshes[i], 0));
      const start = (meshes[1].geometry as TubeGeometry).parameters.path.getPoint(0);
      expect(start.y).toBeCloseTo(CAPS_CABLE[0][1] - capsHandleDrop(t));
      expect(meshes[0].position.y).toBeCloseTo(CAPS_HANDLE_POS[1] - capsHandleDrop(t));
      expect(meshes[2].visible).toBe(t < 0);
    }
  } finally {
    live.capsT = oldT;
    meshes.forEach((m) => m.geometry.dispose());
  }
});

it("door cable/link branches reach upper/lower latches and aircraft power is not confused with the restraint/ELT batteries", () => {
  expect(named("Upper aft door latch")).toHaveLength(2);
  expect(named("Lower aft door latch")).toHaveLength(2);
  for (const [cableName, latchName] of [
    ["Cabin door latch pull cable", "Upper aft door latch"],
    ["Cabin door lower latch linkage", "Lower aft door latch"],
  ])
    for (const p of named(cableName)) {
      const geo = p.geo() as TubeGeometry;
      try {
        const end = geo.parameters.path.getPoint(1);
        expect(Math.min(...named(latchName).map((l) => end.distanceTo(v(l.pos!))))).toBeLessThan(1e-6);
      } finally {
        geo.dispose();
      }
    }
  expect(one("Inflatable restraint electronic module").note).toContain("own battery");
  expect(one("ELT warning buzzer").note).toContain("ELT's own batteries");
  expect(flow("eltRemote").count).toBe(0);
  expect(flow("restraintL").count).toBe(0);
});
