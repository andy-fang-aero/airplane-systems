/** SR20 G6 POH 11934-005 7-6–11, 7-22–26; AMM 12137-002 Reissue A/A1 ATA 22/27/32. */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { CAT } from "@/aircraft/sr20/parts";
import "@/aircraft/sr20/parts/controls-trim";
import {
  PEDALS,
  NOSE_CASTER,
  NOSE_GEAR,
  toeSide,
  brakePressurePath,
  brakeInlet,
  valvePort,
  mainStrutPath,
} from "@/aircraft/sr20/parts/gear";
import {
  bridleClamp,
  bridleRun,
  servoTravel,
  grooveTransition,
  servoWrap,
  SERVO,
  CAPSTAN_RADIUS,
  pitchTrimEnd,
  rollTrimEnd,
  flapMechanism,
  FLAP_ACTUATOR_BASE,
} from "@/aircraft/sr20/parts/controls-trim";
import { ELEV_HORN, PULLEYS, rigPose } from "@/aircraft/sr20/rig";
import { GEAR_CONTROLS_DEPTH_FLOWS, gearControlsDepthRates } from "@/aircraft/sr20/gear-controls-depth-flow";
import { initialSim, solve } from "@/aircraft/sr20/model";
import { D2R } from "@/lib/math";
const parts = (name: string) => CAT.parts.filter((p) => p.name === name);
const pose = (pitch = 0, roll = 0, yaw = 0) => rigPose({ ...initialSim, ctrl: { pitch, roll, yaw } });
const vector = (p: number[]) => new THREE.Vector3(...p);

describe("SR20 G6 independent brakes and caster suspension", () => {
  it("corresponding toes at both stations drive the matching rudder group and hydraulic side (POH 7-25)", () => {
    const pedals = parts("Rudder pedal / toe brake");
    expect(pedals).toHaveLength(4);
    expect(PEDALS.map(toeSide)).toEqual([-1, 1, -1, 1]);
    for (const pedal of pedals) {
      const side = toeSide(pedal.pos![2]);
      expect(pedal.parent).toBe(side < 0 ? "rig:pedL" : "rig:pedR");
      const i = PEDALS.indexOf(pedal.pos![2] as (typeof PEDALS)[number]);
      const path = GEAR_CONTROLS_DEPTH_FLOWS.find((f) => f.key === "brakeMaster" + i)!;
      expect(Math.sign((path.pts.at(-1) as number[])[2])).toBe(side);
    }
    expect(parts("Brake master cylinder")).toHaveLength(4);
    expect(parts("Brake master cylinder").every((p) => p.parent === undefined)).toBe(true);
    expect(parts("Brake fluid reservoir")).toHaveLength(1);
    expect(parts("Parking brake valve")).toHaveLength(1);
    expect(parts("Brake caliper")).toHaveLength(2);
  });
  it("brake and parking sensor signals stop with ENGINE INSTR pulled while hydraulic circuits remain available (AMM 32-42 p. 1)", () => {
    const off = { ...initialSim, cb: { "ENGINE INSTR": true } },
      on = gearControlsDepthRates(initialSim, solve(initialSim)),
      r = gearControlsDepthRates(off, solve(off));
    for (const key of ["brakeTempL", "brakeTempR", "parkPosition"]) {
      expect(on[key]).toBeGreaterThan(0);
      expect(r[key]).toBe(0);
    }
    expect(r.brakeReservoir).toBeGreaterThan(0);
    expect(r.pitchTrimHarness).toBeGreaterThan(0);
    const bat2Only = {
      ...initialSim,
      eng: { ...initialSim.eng, running: false },
      elec: { ...initialSim.elec, bat1: false, alt1: false, alt2: false },
    };
    const b = gearControlsDepthRates(bat2Only, solve(bat2Only));
    expect(b.brakeTempL).toBe(0); // Main Bus 2 sensor supply is lost while Essential Bus 2 remains alive.
    expect(b.parkPosition).toBeGreaterThan(0);
  });
  it("parking valve outputs terminate at separate wheel inlets through each strut (AMM 32-42 Figs 32-42-3/4/5)", () => {
    for (const side of [-1, 1]) {
      const path = brakePressurePath(side);
      expect(path[0]).toEqual(valvePort(side));
      expect(path.at(-1)).toEqual(brakeInlet(side));
      const outer = path.filter((p) => Math.abs(p[2]) > 0.6);
      expect(outer.length).toBeGreaterThan(2);
      expect(outer.every((p) => Math.sign(p[2]) === side)).toBe(true);
    }
    expect(valvePort(-1)[0]).toBeGreaterThan(valvePort(1)[0]); // LH forward / RH aft ports.
  });
  it("main strut attachment spans documented WS 27–37 and terminates on its axle (AMM 32-10 p. 1)", () => {
    for (const side of [-1, 1]) {
      const path = mainStrutPath(side);
      expect(Math.abs(path[0][2]) / 0.0254).toBeGreaterThanOrEqual(27);
      expect(Math.abs(path[0][2]) / 0.0254).toBeLessThan(37);
      expect(Math.abs(path[1][2]) / 0.0254).toBeCloseTo(37, 8);
      const axle = parts("Main wheel axle").find((p) => Math.sign(p.pos![2]) === side)!;
      const geo = axle.geo();
      geo.computeBoundingBox();
      expect(
        geo
          .boundingBox!.clone()
          .translate(vector(axle.pos!))
          .containsPoint(vector(path.at(-1)!)),
      ).toBe(true);
      const nut = parts("Main axle nut").find((p) => Math.sign(p.pos![2]) === side)!;
      const pin = parts("Main axle cotter pin").find((p) => Math.sign(p.pos![2]) === side)!;
      const axleBounds = geo.boundingBox!.clone().translate(vector(axle.pos!));
      expect(axleBounds.containsPoint(vector(nut.pos!))).toBe(true);
      expect(axleBounds.containsPoint(vector(pin.pos!))).toBe(true);
      geo.dispose();
    }
    expect(parts("Gear lateral rib")).toHaveLength(4);
  });
  it("oleo stays with strut while fork, axle and wheel follow caster group (AMM 32-20 pp. 1, 19–22)", () => {
    expect(NOSE_GEAR).toEqual([3.06, -0.52, 0]);
    expect(NOSE_CASTER).toEqual([0.22, -0.68, 0]);
    for (const name of ["Nose gear strut", "Nose oleo cylinder", "Nose oleo piston rod", "Nose strut fairing"])
      expect(parts(name).every((p) => p.parent === "noseGear")).toBe(true);
    for (const name of [
      "Nose wheel fork",
      "Nose wheel axle",
      "Nose wheel",
      "Nose wheel pant",
      "Caster spindle",
      "Caster thrust washer",
      "Belleville washer stack",
    ])
      expect(parts(name).every((p) => p.parent === "caster")).toBe(true);
    const wheel = parts("Nose wheel")[0],
      axle = parts("Nose wheel axle")[0];
    for (const yaw of [-85, 0, 85]) {
      const transform = (p: number[]) => vector(p).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw * D2R);
      expect(transform(wheel.pos!).distanceTo(transform(axle.pos!))).toBeLessThan(1e-12);
    }
  });
});

describe("SR20 G6 trim and coupled flaps", () => {
  it("spring endpoints follow the elevator horn and LH actuation pulley through independent control motion (POH 7-6/9)", () => {
    for (const input of [-1, -0.5, 0, 0.5, 1]) {
      const p = pose(input, input),
        pitch = pitchTrimEnd(p),
        roll = rollTrimEnd(p);
      expect(Math.hypot(pitch[0] - ELEV_HORN.c[0], pitch[1] - ELEV_HORN.c[1])).toBeCloseTo(0.075, 10);
      expect(Math.hypot(roll[0] - PULLEYS.awL.c[0], roll[2] - PULLEYS.awL.c[2])).toBeCloseTo(0.025, 10);
      expect(pitchTrimEnd(pose(input, 0, 1))).toEqual(pitch);
      expect(rollTrimEnd(pose(0, input, 1))).toEqual(roll);
    }
    expect(parts("Pitch trim cartridge")).toHaveLength(1);
    expect(parts("Roll trim cartridge")).toHaveLength(1);
    expect(parts("Yaw trim spring cartridge")).toHaveLength(1);
  });
  it("capstan bridle ends stay attached to clamps and primary strands move opposite ways (AMM 22-10 pp. 21, 26)", () => {
    for (const axis of ["pitch", "roll"] as const) {
      const zero = pose(),
        p = pose(0.7, -0.65);
      expect(servoTravel(axis, p, 0)).toBeCloseTo(-servoTravel(axis, p, 1), 10);
      for (const end of [0, 1]) {
        const clamp = bridleClamp(axis, end, p),
          route = bridleRun(axis, end, p);
        expect(route.at(-1)).toEqual(clamp);
        const transition = grooveTransition(axis, end, p);
        const groove = vector(servoWrap(axis)[end === 0 ? 180 : 0])
          .applyAxisAngle(new THREE.Vector3(0, 0, 1), servoTravel(axis, p) / CAPSTAN_RADIUS)
          .add(vector(SERVO[axis].c));
        expect(vector(transition[0]).distanceTo(groove)).toBeLessThan(1e-10);
        expect(vector(transition.at(-1)!).distanceTo(vector(route[0]))).toBeLessThan(1e-10);
        expect(vector(clamp).distanceTo(vector(bridleClamp(axis, end, zero)))).toBeCloseTo(
          Math.abs(servoTravel(axis, p, end)),
          10,
        );
      }
      // A different channel never moves the clamps.
      expect(bridleClamp(axis, 0, axis === "pitch" ? pose(0, 1, 1) : pose(1, 0, 1))).toEqual(
        bridleClamp(axis, 0, zero),
      );
    }
  });
  it("one actuator coupler drives two mirrored pushrods and their endpoints remain on the moving flap horns (AMM 27-50 Fig 27-50-2)", () => {
    for (const angle of [0, 8, 16, 24, 32]) {
      const m = flapMechanism(angle);
      expect(Math.hypot(m.coupler[0] - 0.66, m.coupler[1] + 0.54)).toBeCloseTo(Math.hypot(0.1, 0.06), 10);
      expect(vector(m.bodyEnd).distanceTo(vector(FLAP_ACTUATOR_BASE))).toBeCloseTo(0.13, 10);
      const left = m.pushrods[0],
        right = m.pushrods[1];
      expect(left[0][0]).toBeCloseTo(right[0][0], 10);
      expect(left[0][1]).toBeCloseTo(right[0][1], 10);
      expect(left[0][2]).toBeCloseTo(-right[0][2], 10);
      expect(left[1][0]).toBeCloseTo(right[1][0], 10);
      expect(left[1][1]).toBeCloseTo(right[1][1], 10);
      expect(left[1][2]).toBeCloseTo(-right[1][2], 10);
      for (const rod of m.pushrods) expect(rod.every((p) => p.every(Number.isFinite))).toBe(true);
    }
    const coupler = parts("Flap torque tube coupler")[0];
    const g = coupler.geo() as THREE.TubeGeometry;
    expect(g.parameters.path.getPoint(0).distanceTo(new THREE.Vector3(0.66, -0.54, 0))).toBeLessThan(1e-10);
    expect(g.parameters.path.getPoint(1).distanceTo(vector(flapMechanism(0).coupler))).toBeLessThan(1e-10);
    g.dispose();
    expect(parts("Flap actuator")).toHaveLength(1);
    expect(parts("Flap torque tube")).toHaveLength(1);
    expect(parts("Flap push-pull rod")).toHaveLength(2);
    expect(parts("Flap proximity sensor")).toHaveLength(3);
  });
});
