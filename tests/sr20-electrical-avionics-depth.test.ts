/**
 * SR20 source topology and failure propagation: POH11934-005 Fig7-10 (7-50), Fig7-17 (7-74),
 * 7-75–7-79/7-91; AMM12137-002 24-30/24-50/31-40/34-20. Tests protect independent
 * source channels, optional equipment presence and the actual effects of pulling circuit breakers.
 */
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CAT } from "@/aircraft/sr20/parts";
import { MCU, MCU_SIZE, BAT2_BOX, BAT2_SIZE, alternatorBelt } from "@/aircraft/sr20/parts/electrical";
import {
  ADAHRS_1,
  ADAHRS_2,
  GEA_71,
  GIA_1,
  GIA_2,
  MAG_WIRES,
  MFD_CONN,
  GMA_350,
  PFD_CONN,
} from "@/aircraft/sr20/parts/avionics";
import { initialSim, solve, type Sim } from "@/aircraft/sr20/model";
import { useSR20 } from "@/aircraft/sr20/store";
import {
  ELECTRICAL_AVIONICS_DEPTH_FLOWS as F,
  electricalAvionicsDepthRates,
  electricalAvionicsFlowFitted,
  RF_AUDIO_KEYS,
} from "@/aircraft/sr20/electrical-avionics-depth-flow";
import { toV, type Vec3 } from "@/lib/math";
import { curveOf } from "@/lib/geometry";
import { patched, type Patch } from "./helpers";

const flow = (key: string) => {
  const f = F.find((f) => f.key === key);
  expect(f, key).toBeDefined();
  return f!;
};
const same = (a: unknown, b: Vec3) => toV(a as Vec3).distanceTo(new THREE.Vector3(...b)) < 1e-9;
const rates = (patch: Patch<Sim> = {}) => {
  const s = patched(initialSim, patch);
  return electricalAvionicsDepthRates(s, solve(s));
};
let saved: ReturnType<typeof useSR20.getState>;
beforeEach(() => {
  saved = useSR20.getState();
});
afterEach(() => {
  useSR20.setState({ s: saved.s, E: saved.E });
});

describe("SR20 G6 power hardware (POH7-49–7-56; AMM24-30)", () => {
  it("keeps internal source controls within the left-firewall MCU case", () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(...MCU).sub(new THREE.Vector3(...MCU_SIZE).multiplyScalar(0.5)),
      new THREE.Vector3(...MCU).add(new THREE.Vector3(...MCU_SIZE).multiplyScalar(0.5)),
    );
    for (const name of [
      "Main Distribution Bus 1",
      "Main Distribution Bus 2",
      "Essential Distribution Bus",
      "ALT 1 field-control module",
      "ALT 2 field-control module",
      "ALT 1 field relay",
      "ALT 2 field relay",
      "BAT 1 relay",
      "Starter relay",
      "External power relay",
      "MCU source and feeder fuses",
      "MDB interconnect fuse and diode",
    ]) {
      const p = CAT.parts.find((p) => p.name === name)!;
      expect(p, name).toBeDefined();
      const g = p.geo();
      g.computeBoundingBox();
      const b = g.boundingBox!.clone().translate(new THREE.Vector3(...p.pos!));
      expect(bounds.containsBox(b), name).toBe(true);
      g.dispose();
    }
    expect(CAT.parts.find((p) => p.name === "Master Control Unit")!.fairing).toBe(true);
  });
  it("holds two separate 12V batteries inside the vented BAT2 container (POH7-49)", () => {
    const units = CAT.parts.filter((p) => p.name === "BAT 2 battery — 12 V, 7 Ah");
    expect(units).toHaveLength(2);
    const enclosure = new THREE.Box3(
      new THREE.Vector3(...BAT2_BOX).sub(new THREE.Vector3(...BAT2_SIZE).multiplyScalar(0.5)),
      new THREE.Vector3(...BAT2_BOX).add(new THREE.Vector3(...BAT2_SIZE).multiplyScalar(0.5)),
    );
    for (const p of units) {
      const g = p.geo();
      g.computeBoundingBox();
      expect(enclosure.containsBox(g.boundingBox!.clone().translate(new THREE.Vector3(...p.pos!)))).toBe(true);
      g.dispose();
    }
    expect(BAT2_BOX[2]).toBeLessThan(0); // Fig7-20 item22 is left of parachute.
  });
  it("draws both IO390 alternator drives as distinct closed belts (POH7-49)", () => {
    const belt1 = alternatorBelt(1),
      belt2 = alternatorBelt(2);
    for (const belt of [belt1, belt2]) expect(belt.at(-1)).toEqual(belt[0]);
    expect(new Set(belt1.map((p) => p[0])).size).toBe(1);
    expect(new Set(belt2.map((p) => p[0])).size).toBe(1);
    expect(belt1[0][0]).not.toEqual(belt2[0][0]);
  });
});

describe("SR20 avionics channels (POH Fig7-17/7-74; Garmin190-02183-01pp1–2)", () => {
  it("pairs each GIA with its own display and does not connect the GIAs directly (AMM31-40p1)", () => {
    for (const [key, a, b] of [
      ["gia1Pfd", GIA_1, PFD_CONN],
      ["gia2Mfd", GIA_2, MFD_CONN],
      ["pfdMfd", PFD_CONN, MFD_CONN],
    ] as const) {
      expect(same(flow(key).pts[0], a), key).toBe(true);
      expect(same(flow(key).pts.at(-1), b), key).toBe(true);
    }
    for (const f of F) {
      const a = f.pts[0],
        b = f.pts.at(-1);
      expect((same(a, GIA_1) && same(b, GIA_2)) || (same(a, GIA_2) && same(b, GIA_1)), f.key).toBe(false);
    }
  });
  it("GEA supplies both independent GIA channels and ENGINE INSTR stops both (POH7-79)", () => {
    for (const [n, gia] of [
      [1, GIA_1],
      [2, GIA_2],
    ] as const) {
      expect(same(flow(`geaData${n}`).pts[0], GEA_71)).toBe(true);
      expect(same(flow(`geaData${n}`).pts.at(-1), gia)).toBe(true);
      expect(rates()[`geaData${n}`]).toBeGreaterThan(0);
      expect(rates({ cb: { "ENGINE INSTR": true } })[`geaData${n}`]).toBe(0);
    }
    expect(rates({ cb: { "GPS NAV GIA 1": true } }).geaData1).toBe(0);
    expect(rates({ cb: { "GPS NAV GIA 1": true } }).geaData2).toBeGreaterThan(0);
  });
  it("PFD/MFD redundant feeds remain independent (POH7-75)", () => {
    for (const [prefix, a, b] of [
      ["pfd", "PFD A", "PFD B"],
      ["mfd", "MFD A", "MFD B"],
    ] as const) {
      expect(rates({ cb: { [a]: true } })[`${prefix}FeedA`]).toBe(0);
      expect(rates({ cb: { [a]: true } })[`${prefix}FeedB`]).toBeGreaterThan(0);
      expect(rates({ cb: { [b]: true } })[`${prefix}FeedA`]).toBeGreaterThan(0);
      expect(rates({ cb: { [b]: true } })[`${prefix}FeedB`]).toBe(0);
    }
  });
  it("ADAHRS1 breaker stops its data, while ADAHRS2 continues through its own bus (POH7-76)", () => {
    const off = rates({ cb: { "ADAHRS 1": true } });
    for (const key of ["magData", "adahrsPfd", "adahrs1Gia1", "adahrs1Gia2"]) expect(off[key], key).toBe(0);
    for (const key of ["magData2", "adahrs2Mfd", "adahrs2Gia1", "adahrs2Gia2"])
      expect(off[key], key).toBeGreaterThan(0);
    expect(rates({ avx: { ahrs2Fail: true } }).adahrs2Gia1).toBe(0);
    expect(rates({ avx: { ahrs2Fail: true } }).adahrs1Gia1).toBeGreaterThan(0);
  });
  it("MAG streams follow their one physical harness and their separate PFD breaker supplies (AMM34-20p2)", () => {
    expect(flow("magData").pts).toBe(MAG_WIRES[1]);
    expect(flow("magData2").pts).toBe(MAG_WIRES[2]);
    expect(flow("magData").tube).toBe(false);
    expect(flow("magData2").tube).toBe(false);
    expect(same(flow("magData").pts.at(-1), ADAHRS_1)).toBe(true);
    expect(same(flow("magData2").pts.at(-1), ADAHRS_2)).toBe(true);
    expect(rates({ cb: { "PFD A": true } }).magData).toBe(0);
    expect(rates({ cb: { "PFD A": true } }).magData2).toBeGreaterThan(0);
    expect(rates({ cb: { "PFD B": true } }).magData2).toBe(0);
  });
  it("removes optional second-ADAHRS hardware and paths together (POH Fig7-20 item3)", () => {
    const s = patched(initialSim, { avx: { dualAdahrs: false } });
    useSR20.setState({ s, E: solve(s) });
    const visible = CAT.partsFor();
    expect(visible.some((p) => p.name === "GSU 75 ADAHRS 2 (optional)")).toBe(false);
    expect(visible.some((p) => p.name === "MAG 2 wiring")).toBe(false);
    expect(visible.some((p) => p.name === "GSU 75 ADAHRS 1")).toBe(true);
    for (const key of ["magData2", "adahrs2Mfd", "adahrs2Gia1", "adahrs2Gia2"]) {
      expect(electricalAvionicsFlowFitted(flow(key), s)).toBe(false);
      expect(electricalAvionicsDepthRates(s, solve(s))[key]).toBe(0);
    }
    expect(electricalAvionicsFlowFitted(flow("adahrsPfd"), s)).toBe(true);
  });
  it("AVIONICS master sheds remote radios/audio without removing PFD/GEA/ADAHRS (POH7-53/7-56)", () => {
    const off = rates({ elec: { avionics: false } });
    for (const key of [
      "xpdrData",
      "xpdrCoax",
      "audioGia1",
      "audioGia2",
      "speakerAudio",
      "trafficData",
      "wxData",
      "dmeData",
    ])
      expect(off[key], key).toBe(0);
    for (const key of ["gia1Pfd", "gia2Mfd", "adahrsPfd", "geaData1", "geaData2", "gcuPfd"])
      expect(off[key], key).toBeGreaterThan(0);
  });
  it("FAN1 stops MFD airflow and FAN2 stops PFD plus both IAU branches (POH7-91)", () => {
    const one = rates({ cb: { "AVIONICS FAN 1": true } }),
      two = rates({ cb: { "AVIONICS FAN 2": true } });
    expect(one.mfdCooling).toBe(0);
    expect(one.pfdCooling).toBeGreaterThan(0);
    expect(one.iauCooling1).toBeGreaterThan(0);
    for (const key of ["pfdCooling", "iauCooling1", "iauCooling2"]) expect(two[key], key).toBe(0);
    expect(two.mfdCooling).toBeGreaterThan(0);
  });
  it("RF/audio routes clear the PFD, MFD and console control faces (schematic placement; POH Fig7-18/7-20)", () => {
    // The live display planes are x2.285, y0.092; reserve 3cm behind each face plus their full screen area.
    const faces = [PFD_CONN, MFD_CONN].map(
      (p) => new THREE.Box3(new THREE.Vector3(2.2, -0.005, p[2] - 0.138), new THREE.Vector3(2.35, 0.19, p[2] + 0.138)),
    );
    for (const key of RF_AUDIO_KEYS) {
      const f = flow(key);
      expect(f.tension, key).toBe(0);
      for (const p of curveOf(f.pts, f.tension).getSpacedPoints(500))
        for (const face of faces) expect(face.distanceToPoint(p), key).toBeGreaterThan(f.r! + 0.005);
      // Interior cabin portions below the panel use floor lanes, not diagonals across console controls.
      for (const p of curveOf(f.pts, f.tension).getSpacedPoints(500))
        if (
          p.x > 1.75 &&
          p.x < 2.39 &&
          Math.abs(p.z) < 0.16 &&
          p.y > -0.28 &&
          p.y < -0.005 &&
          p.distanceTo(new THREE.Vector3(...GMA_350)) > 0.08
        ) {
          const consoleFaceX = 2 + (p.y + 0.27) * (0.22 / 0.265);
          expect(p.x, key).toBeGreaterThan(consoleFaceX + f.r! + 0.005);
        }
    }
  });
  it("keeps the explanatory source/data/cooling keys unique with valid finite routes", () => {
    expect(new Set(F.map((f) => f.key)).size).toBe(F.length);
    for (const f of F) {
      expect(f.pts.length, f.key).toBeGreaterThan(1);
      for (const p of f.pts) expect(toV(p).toArray().every(Number.isFinite), f.key).toBe(true);
      expect(f.note, f.key).toContain("Routing schematic.");
    }
  });
});
