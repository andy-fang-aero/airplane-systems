/** Cabin heating and ventilation air path: POH 13772-007 7-61 … 7-66, Fig 7-13; AMM 13773-002 Rev 7 21-20, 21-40, 21-60. */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { curveOf } from "@/lib/geometry";
import { toV, type Vec3 } from "@/lib/math";
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { FW } from "@/aircraft/sr22t/geometry";
import { breakerBus, initialSim, solve, type Sim, type Vent } from "@/aircraft/sr22t/model";
import {
  CAT,
  INTERCOOLER_AFT,
  PROP,
  airflowValveOpen,
  butterflies,
  cabinAirControlPowered,
  freshValveOpen,
  hotValveOpen,
  valveEnv,
} from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import { patched, type Patch } from "./helpers";

const sim = (p: Patch<Sim> = {}) => patched(initialSim, p);
const rates = (p: Patch<Sim> = {}) => flowRates(sim(p), solve(sim(p)));
const named = (name: string) => CAT.parts.filter((p) => p.name === name);
const one = (name: string) => {
  const parts = named(name);
  expect(parts, name).toHaveLength(1);
  return parts[0];
};
const flow = (key: string) => FLOWS.find((f) => f.key === key)!;
const v = (p: Vec3) => new THREE.Vector3(...p);
/** World-space bounding box of a part, honouring its position, rotation and scale. */
const boxOf = (name: string) => {
  const p = CAT.parts.find((q) => q.name === name)!;
  const m = new THREE.Mesh(p.geo());
  if (p.pos) m.position.set(...p.pos);
  if (p.rot) m.rotation.set(...p.rot);
  if (p.scale) m.scale.set(...p.scale);
  m.updateMatrixWorld();
  return new THREE.Box3().setFromObject(m);
};

describe("SR22T cabin air path", () => {
  it("intercooler heat branches merge into one rendered trunk (POH 7-64; AMM 21-40 PDF 486, Fig 21-40-2)", () => {
    const left = flow("hotL"),
      right = flow("hotIn");
    const shared = left.pts.filter((p) => right.pts.some((q) => toV(p).distanceTo(toV(q)) < 1e-8));
    expect(shared).toHaveLength(1);
    expect(shared[0]).toEqual(left.pts.at(-1));
    const join = right.pts.findIndex((p) => toV(p).distanceTo(toV(shared[0])) < 1e-8);
    expect(join).toBeGreaterThan(0);
    expect(join).toBeLessThan(right.pts.length - 1);
    // Both live branches reach that junction, while only the RH flow continues through the exchanger to the valve.
    expect(rates().hotL).toBeGreaterThan(0);
    expect(rates().hotIn).toBeGreaterThan(0);
    expect(right.pts.at(-1)).toEqual(one("Hot-air valve").pos);
  });
  it("the mixing chamber and its hot-air and fresh-air valves sit on the forward firewall, lower right (POH 7-64; AMM 21-40 PDF 486)", () => {
    for (const name of ["Mixing chamber", "Hot-air valve", "Fresh-air valve"]) {
      const [x, y, z] = one(name).pos!;
      expect(x, name).toBeGreaterThan(FW);
      expect(z, name).toBeGreaterThan(0);
      expect(y, name).toBeLessThan(PROP[1]);
    }
    // the cabin side starts at the chamber: the coupler duct runs from it aft through the firewall to the manifold
    expect(flow("toMan").pts[0]).toEqual(one("Mixing chamber").pos);
    expect(flow("hot").pts).toContainEqual(one("Hot-air valve").pos);
    expect(flow("fresh").pts).toContainEqual(one("Fresh-air valve").pos);
  });

  it("the mixing chamber assembly and the foot-warmer diffusers clear every other system's parts", () => {
    // World-space broad phase, followed by mesh triangles. A curved pipe's full
    // bounding box can overlap the chamber while the tube bends around it.
    const world = (p: (typeof CAT.parts)[number]) => {
      const g = p.geo();
      const m = new THREE.Mesh(g);
      if (p.pos) m.position.set(...p.pos);
      if (p.rot) m.rotation.set(...p.rot);
      if (p.scale) m.scale.set(...p.scale);
      m.updateMatrixWorld();
      g.applyMatrix4(m.matrixWorld);
      g.computeBoundingBox();
      return g;
    };
    const others = CAT.parts
      .filter((p) => !p.sys.includes("environment"))
      .map((p) => ({ name: p.name ?? "?", geometry: world(p) }));
    const names = [
      "Mixing chamber",
      "Hot-air valve",
      "Fresh-air valve",
      "Airflow valve servo",
      "Airflow flapper valve",
      "Foot-warmer diffuser",
    ];
    try {
      for (const name of names)
        for (const p of named(name)) {
          const geometry = world(p);
          // Ignore mere boundary contact, matching the former positive-volume check.
          const box = geometry.boundingBox!.clone().expandByScalar(-0.000001);
          geometry.dispose();
          for (const other of others) {
            if (!box.intersectsBox(other.geometry.boundingBox!)) continue;
            const positions = other.geometry.getAttribute("position");
            const index = other.geometry.getIndex();
            const count = index?.count ?? positions.count;
            let intersects = false;
            for (let i = 0; i < count; i += 3) {
              const vertices = [0, 1, 2].map((j) =>
                new THREE.Vector3().fromBufferAttribute(positions, index ? index.getX(i + j) : i + j),
              );
              if (box.intersectsTriangle(new THREE.Triangle(vertices[0], vertices[1], vertices[2]))) {
                intersects = true;
                break;
              }
            }
            // A part wholly enclosing the chamber still counts as a collision.
            expect(intersects || other.geometry.boundingBox!.containsBox(box), `${name} vs ${other.name}`).toBe(false);
          }
        }
    } finally {
      others.forEach(({ geometry }) => geometry.dispose());
    }
  });

  it("ram air comes from both intercooler rear ports (POH 7-64)", () => {
    expect(flow("hotIn").pts[0]).toEqual(INTERCOOLER_AFT(1));
    expect(flow("hotL").pts[0]).toEqual(INTERCOOLER_AFT(-1));
    // both ducts meet the heat-exchanger shroud at the same point
    expect(flow("hotIn").pts).toContainEqual(flow("hotL").pts.at(-1));
    expect(rates().hotL).toBeGreaterThan(0);
    expect(rates({ eng: { running: false } }).hotL).toBe(0);
  });

  it("with the hot-air valve closed the heated air dumps into the engine compartment (POH 7-64)", () => {
    const closed = rates({ eng: { running: true }, env: { temp: 0 } });
    expect(closed.hotDump).toBeGreaterThan(0);
    expect(closed.hot).toBe(0);
    // the A/C snowflake closes it too (POH 7-66); fully open, nothing dumps
    expect(rates({ env: { ac: true } }).hotDump).toBeGreaterThan(0);
    expect(rates({ env: { temp: 1 } }).hotDump).toBe(0);
    expect(rates({ eng: { running: false }, env: { temp: 0 } }).hotDump).toBe(0);
  });

  it("with the fresh-air valve closed the fresh air dumps into the engine compartment (POH 7-65)", () => {
    expect(rates({ env: { ac: true, recirc: true } }).freshDump).toBeGreaterThan(0);
    expect(rates({ env: { temp: 0 } }).freshDump).toBe(0);
  });

  it("a closed fresh-air valve admits no fresh air to the mixing chamber (POH 7-65, 7-66)", () => {
    // full hot closes the fresh-air valve: nothing reaches the chamber, everything dumps
    const hot = rates({ eng: { running: true }, env: { fan: 1, temp: 1, ac: false, recirc: false } });
    expect(hot.fresh).toBe(0);
    expect(hot.freshDump).toBeGreaterThan(0);
    // recirculation closes it; airflow OFF closes the chamber flapper, so nothing is admitted either
    expect(rates({ env: { recirc: true } }).fresh).toBe(0);
    expect(rates({ env: { fan: -1 } }).fresh).toBe(0);
    // full cold: valve open, no dump
    const cold = rates({ eng: { running: true }, env: { fan: 1, temp: 0 } });
    expect(cold.fresh).toBeGreaterThan(0);
    expect(cold.freshDump).toBe(0);
  });

  it("each inlet duct splits at its valve: a closed valve shows no chamber-side flow, and dumps start where the inlet air reaches (POH 7-64, 7-65)", () => {
    // inlet side ends at the valve; chamber side starts there and ends at the chamber
    for (const [k, valve] of [
      ["hot", "Hot-air valve"],
      ["fresh", "Fresh-air valve"],
    ] as const) {
      const pos = one(valve).pos!;
      expect(flow(k + "In").pts.at(-1), k).toEqual(pos);
      expect(flow(k).pts[0], k).toEqual(pos);
      expect(flow(k + "Dump").pts[0], k).toEqual(pos);
      expect(boxOf("Mixing chamber").distanceToPoint(v(flow(k).pts.at(-1) as Vec3)), k).toBeLessThan(0.03);
    }
    // full cold, engine running: hot valve closed, the inlet side still carries the dumped air
    const cold = rates({ eng: { running: true }, env: { fan: 1, temp: 0, ac: false, recirc: false } });
    expect(cold.hot).toBe(0);
    expect(cold.hotIn).toBeGreaterThan(0);
    expect(cold.hotDump).toBeGreaterThan(0);
    expect(cold.fresh).toBeGreaterThan(0);
    // full hot: fresh valve closed, its inlet side feeds only the dump
    const hot = rates({ eng: { running: true }, env: { fan: 1, temp: 1, ac: false, recirc: false } });
    expect(hot.fresh).toBe(0);
    expect(hot.freshIn).toBeGreaterThan(0);
    expect(hot.freshDump).toBeGreaterThan(0);
    expect(hot.hot).toBeGreaterThan(0);
    // engine stopped at full hot: no ram air, nothing in either inlet, nothing dumped
    const off = rates({ eng: { running: false }, env: { fan: 0, temp: 1 } });
    for (const k of ["hotIn", "hot", "hotDump", "freshIn", "fresh", "freshDump"]) expect(off[k], k).toBe(0);
  });

  it("the blower runs only with its 15 A CABIN FAN breaker in and A/C BUS 2 powered (POH 7-61)", () => {
    expect(rates({ env: { fan: 2 } }).fanDuct).toBeGreaterThan(0);
    expect(rates({ env: { fan: 2 }, cb: { "CABIN FAN": true } }).fanDuct).toBe(0);
    // engine and BAT 1 off: Main Dist Bus 1, and with it A/C BUS 2, is dead
    const dead = sim({ eng: { running: false }, elec: { bat1: false }, env: { fan: 2 } });
    expect(solve(dead).ac2).toBe(0);
    expect(flowRates(dead, solve(dead)).fanDuct).toBe(0);
  });

  it("the coupler duct and the outlets carry air only when a source flows (POH 7-64 … 7-66)", () => {
    const outlets = ["panelL", "panelR", "panelL2", "panelR2", "armL", "armR", "floorF", "floorR", "defrost"];
    // engine stopped, no blower (airflow 0), full hot: both valves admit nothing and no fan runs
    const none = rates({ eng: { running: false }, env: { fan: 0, temp: 1, vent: "PFW" } });
    expect(none.hot + none.fresh + none.fanDuct).toBe(0);
    expect(none.toMan).toBe(0);
    for (const k of outlets) expect(none[k], k).toBe(0);
    // the same with the blower on but its breaker pulled
    const pulled = rates({ eng: { running: false }, env: { fan: 2, temp: 1, vent: "PFW" }, cb: { "CABIN FAN": true } });
    for (const k of ["toMan", ...outlets]) expect(pulled[k], k).toBe(0);
    // the blower alone feeds the outlets through the manifold; nothing leaves the chamber
    const fanOnly = rates({ eng: { running: false }, env: { fan: 2, temp: 1, vent: "PFW" } });
    expect(fanOnly.toMan).toBe(0);
    for (const k of outlets) expect(fanOnly[k], k).toBeGreaterThan(0);
    // engine running, full hot: hot air reaches the chamber and the outlets
    const run = rates({ eng: { running: true }, env: { fan: 0, temp: 1, vent: "PFW" } });
    expect(run.toMan).toBeGreaterThan(0);
    for (const k of outlets) expect(run[k], k).toBeGreaterThan(0);
  });

  it("airflow OFF closes only the chamber flapper; the inlet valves keep their temperature positions (POH 7-65, 7-66)", () => {
    const env = sim({ env: { fan: -1, temp: 0.35, ac: false, recirc: false } }).env;
    expect(airflowValveOpen(env)).toBe(false);
    expect(hotValveOpen(env)).toBeCloseTo(0.35);
    expect(freshValveOpen(env)).toBeCloseTo(0.65);
    // engine running: nothing enters the chamber; each inlet dumps only the share its own valve closes off
    const off = rates({ eng: { running: true }, env: { fan: -1, temp: 0.35, ac: false, recirc: false } });
    expect(off.hot).toBe(0);
    expect(off.fresh).toBe(0);
    expect(off.toMan).toBe(0);
    expect(off.hotDump).toBeCloseTo(0.65);
    expect(off.freshDump).toBeCloseTo(0.35);
    // full hot at OFF: the hot-air valve stays fully open, so no hot air dumps
    expect(rates({ eng: { running: true }, env: { fan: -1, temp: 1 } }).hotDump).toBe(0);
  });

  it("ram air through the inlet valves does not scale with blower speed; the blower adds only its own duct (POH 7-65, Fig 7-13)", () => {
    const [r0, r1, r2, r3] = [0, 1, 2, 3].map((fan) =>
      rates({ eng: { running: true }, env: { fan, temp: 0.5, ac: false, recirc: false } }),
    );
    for (const r of [r1, r2, r3]) {
      expect(r.hot).toBe(r0.hot);
      expect(r.fresh).toBe(r0.fresh);
      expect(r.toMan).toBe(r0.toMan);
    }
    expect(r0.hot).toBeGreaterThan(0);
    expect(r0.fresh).toBeGreaterThan(0);
    expect(r0.fanDuct).toBe(0);
    expect(r2.fanDuct).toBeGreaterThan(r1.fanDuct);
    expect(r3.fanDuct).toBeGreaterThan(r2.fanDuct);
  });

  it("with CABIN AIR CONTROL unpowered the valves hold their last powered positions (POH 7-61, 7-65, 7-66)", () => {
    expect(breakerBus(initialSim.equip, "CABIN AIR CONTROL")).toBe("main1");
    let previous: ReturnType<typeof solve> | undefined;
    const result = (s: Sim) => (previous = solve(s, previous));
    const rateOf = (s: Sim) => flowRates(s, result(s));
    // powered: full cold, airflow 1, Panel-Foot
    const before = sim({ eng: { running: true }, env: { fan: 1, temp: 0, vent: "PF", ac: false, recirc: false } });
    expect(cabinAirControlPowered(before, solve(before))).toBe(true);
    const r0 = rateOf(before);
    expect(r0.hotDump).toBe(1);
    expect(r0.floorF).toBeGreaterThan(0);
    // breaker pulled, then every selector moved: full hot, airflow OFF, Windshield
    const moved = { fan: -1, temp: 1, vent: "W" as Vent, ac: false, recirc: false };
    const pulled = patched(before, { cb: { "CABIN AIR CONTROL": true }, env: moved });
    expect(cabinAirControlPowered(pulled, solve(pulled))).toBe(false);
    expect(valveEnv(pulled, result(pulled))).toEqual(before.env);
    const r1 = rateOf(pulled);
    for (const k of ["hot", "fresh", "hotDump", "freshDump", "toMan", "floorF", "defrost"])
      expect(r1[k], k).toBe(r0[k]);
    // the hot-air valve plate does not move either
    const plate = CAT.parts.find((p) => p.color === "#8A3A22" && p.anim)!;
    const angle = (s: Sim) => {
      useSR22T.setState({ s, E: solve(s, useSR22T.getState().E) });
      const m = new THREE.Mesh();
      plate.anim!(m, 0);
      return m.rotation.y;
    };
    const saved = useSR22T.getState();
    try {
      expect(angle(before)).toBeCloseTo(0);
      expect(angle(pulled)).toBeCloseTo(0);
      // breaker back in: the valves follow the selectors again
      const restored = patched(pulled, { cb: { "CABIN AIR CONTROL": false } });
      expect(angle(restored)).toBeCloseTo(Math.PI / 2);
      const r2 = rateOf(restored);
      expect(r2.hotDump).toBe(0);
      expect(r2.toMan).toBe(0);
      expect(r2.floorF).toBe(0);
      // MAIN BUS 1 dead (engine and BAT 1 off) holds them the same way
      const dead = patched(restored, { eng: { running: false }, elec: { bat1: false }, env: { temp: 0, vent: "PF" } });
      expect(solve(dead).main1).toBe(0);
      expect(valveEnv(dead, result(dead))).toEqual(restored.env);
    } finally {
      useSR22T.setState({ s: saved.s, E: saved.E });
    }
  });

  it("the airflow flapper valve in the mixing chamber is closed at OFF and fully open at 0–3 (POH 7-65; AMM 21-20 PDF p. 454)", () => {
    const flapper = one("Airflow flapper valve"),
      chamber = boxOf("Mixing chamber");
    // in the chamber's aft outlet, between the chamber and the firewall
    const [x, y, z] = flapper.pos!;
    expect(x).toBeGreaterThan(FW);
    expect(x).toBeLessThanOrEqual(chamber.min.x);
    expect(y).toBeGreaterThan(chamber.min.y);
    expect(y).toBeLessThan(chamber.max.y);
    expect(z).toBeGreaterThan(chamber.min.z);
    expect(z).toBeLessThan(chamber.max.z);
    const saved = useSR22T.getState().s;
    try {
      for (const fan of [-1, 0, 1, 2, 3]) {
        useSR22T.setState({ s: sim({ env: { fan } }) });
        const m = new THREE.Mesh();
        flapper.anim!(m, 0);
        // closed: the plate lies across the aft-flowing air; open: edge-on
        expect(m.rotation.y, `fan ${fan}`).toBeCloseTo(fan < 0 ? 0 : Math.PI / 2);
      }
    } finally {
      useSR22T.setState({ s: saved });
    }
    expect(one("Airflow valve servo").note).toContain("AMM 21-20 PDF p. 454");
  });

  it("butterfly valves feed floor and windshield by vent selection (POH 7-66)", () => {
    const cases: [Vent, boolean, boolean][] = [
      ["P", false, false],
      ["PF", true, false],
      ["PFW", true, true],
      ["W", false, true],
    ];
    for (const [vent, floor, defrost] of cases) expect(butterflies(vent), vent).toEqual({ floor, defrost });
    expect(one("Floor butterfly valve").anim).toBeTypeOf("function");
    expect(one("Defrost butterfly valve").anim).toBeTypeOf("function");
  });

  it("the blower is bolted to the evaporator assembly under the RH crew seat, ducted to the manifold (POH Fig 7-13; AMM 21-20; AMM 21-50 PDF p. 504, Fig 21-50-1 sheet 3 items 30, 31, PDF p. 521)", () => {
    const fan = one("Blower fan assembly"),
      seat = boxOf("Front passenger seat"),
      blower = boxOf("Blower fan assembly"),
      evap = boxOf("A/C evaporator");
    const [x, , z] = fan.pos!;
    expect(z).toBeGreaterThan(0);
    expect(x).toBeGreaterThan(seat.min.x);
    expect(x).toBeLessThan(seat.max.x);
    expect(z).toBeGreaterThan(seat.min.z);
    expect(z).toBeLessThan(seat.max.z);
    expect(blower.max.y).toBeLessThan(seat.min.y);
    // mounted on the evaporator housing: the two boxes meet face to face (within 1 mm) without interpenetrating
    expect(blower.clone().expandByScalar(0.001).intersectsBox(evap)).toBe(true);
    expect(Math.min(...blower.clone().intersect(evap).getSize(new THREE.Vector3()).toArray())).toBeLessThan(0.001);
    expect(named("Distribution manifold + fan")).toHaveLength(0);
    one("Distribution manifold");
    const duct = rates({ env: { fan: 0 } }).fanDuct,
      speeds = [1, 2, 3].map((fan) => rates({ env: { fan } }).fanDuct);
    expect(duct).toBe(0);
    expect(rates({ env: { fan: -1 } }).fanDuct).toBe(0);
    expect(speeds[0]).toBeGreaterThan(0);
    expect(speeds[1]).toBeGreaterThan(speeds[0]);
    expect(speeds[2]).toBeGreaterThan(speeds[1]);
    expect(v(flow("fanDuct").pts[0] as Vec3).distanceTo(v(fan.pos!))).toBeLessThan(0.1);
    expect(boxOf("Distribution manifold").distanceToPoint(v(flow("fanDuct").pts.at(-1) as Vec3))).toBeLessThan(0.03);
  });

  it("outlets where POH 7-64 puts them", () => {
    const counts: [string, number][] = [
      ["Bolster eyeball outlet", 2],
      ["Panel eyeball outlet", 2],
      ["Armrest eyeball outlet", 2],
      ["Kick-plate floor outlet", 2],
      ["Foot-warmer diffuser", 2],
      ["Windshield diffuser", 1],
    ];
    for (const [name, n] of counts) {
      const parts = named(name);
      expect(parts, name).toHaveLength(n);
      if (n === 2) expect(parts.map((p) => Math.sign(p.pos![2])).sort(), name).toEqual([-1, 1]);
      expect(parts[0].pin, name).toBe(true);
    }
    // each outlet duct ends at its outlet
    const ends: [string, string][] = [
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
    ];
    for (const [key, name] of ends) {
      const end = v(flow(key).pts.at(-1) as Vec3);
      expect(Math.min(...named(name).map((p) => end.distanceTo(v(p.pos!)))), key).toBeLessThan(0.02);
    }
    const diffuser = boxOf("Windshield diffuser");
    for (const key of ["defrost", "defrost2"])
      expect(diffuser.distanceToPoint(v(flow(key).pts.at(-1) as Vec3)), key).toBeLessThan(0.02);
    // crew panel vents on the panel and bolster, passenger vents aft in the cabin
    expect(one("Environmental control panel").pos![2]).toBeGreaterThan(0);
    for (const p of named("Armrest eyeball outlet")) expect(p.pos![0]).toBeLessThan(boxOf("Pilot seat").min.x);
  });

  it("the panel vent ducts clear the behind-panel LRUs", () => {
    // GIA 1, GIA 2 and the GEA 71
    const lrus = CAT.parts.filter((p) => /^GIA\b/.test(p.name ?? "") || /^GEA 71\b/.test(p.name ?? ""));
    expect(lrus.length).toBeGreaterThanOrEqual(3);
    const boxes = [...new Set(lrus.map((p) => p.name!))].flatMap((name) =>
      lrus
        .filter((p) => p.name === name)
        .map((p) => {
          const m = new THREE.Mesh(p.geo());
          if (p.pos) m.position.set(...p.pos);
          if (p.rot) m.rotation.set(...p.rot);
          m.updateMatrixWorld();
          return [name, new THREE.Box3().setFromObject(m)] as const;
        }),
    );
    for (const key of ["panelL", "panelR", "panelL2", "panelR2"]) {
      const f = flow(key),
        curve = curveOf(f.pts, f.tension ?? 0.3);
      for (let i = 0; i <= 100; i++) {
        const p = curve.getPoint(i / 100);
        for (const [name, b] of boxes)
          expect(b.distanceToPoint(p), `${key} ${i} vs ${name}`).toBeGreaterThanOrEqual(0.03);
      }
    }
  });

  it("the control panel, controller and sensor are separate parts with their breakers (POH 7-61, 7-64; AMM 21-60)", () => {
    expect(one("Environmental control panel").note).toContain("2 A CABIN AIR CONTROL breaker, MAIN BUS 1");
    // AMM 21-00 PDF p. 448: lower RH instrument panel on these serials (the modelled airplane is one)
    expect(one("Environmental control panel").note).toContain("serials 22T-1460, 1471, 1473 thru 22T-9749");
    expect(one("Blower fan assembly").note).toContain("15 A CABIN FAN breaker, A/C BUS 2");
    one("ECS controller");
    one("Duct temperature sensor");
    one("Airflow valve servo");
    expect(named("Duct temperature sensor / controller")).toHaveLength(0);
  });

  it("the distribution manifold tooltip keeps the selector model after the fan split (POH 7-62 Fig 7-13, 7-66; AMM 21-60)", () => {
    const note = one("Distribution manifold").note;
    expect(note).toContain("OFF closes cabin airflow; 0 is ram air; 1–3 are blower speeds");
    expect(note).toContain("Fig 7-13");
    expect(note).toContain("AMM 21-60");
    expect(note).not.toMatch(/Blower: OFF \(ram air\)/);
  });
});
