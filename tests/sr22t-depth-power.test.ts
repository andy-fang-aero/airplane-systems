/**
 * SR22T electrical power hardware: the Master Control Unit and what it holds, BAT 2 and its container,
 * the landing light relay and ballast, the MCU heat shield and the console TVS, against SR22T POH 13772-007 7-47 – 7-57
 * (Figure 7-10 on 7-48, Figure 7-20 on 7-88) and AMM 13773-002 Rev 7 24-30, 24-50 and 71-30.
 */
import * as THREE from "three";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AB, FW, inFus } from "@/aircraft/sr22t/geometry";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { initialSim, solve, type Elec, type Sim } from "@/aircraft/sr22t/model";
import { BAT2_BOX, BAT2_SIZE, CAPS_BOX, CAT, MCU, MCU_SIZE } from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import type { PartSpec } from "@/lib/catalogue";
import { mats } from "@/lib/materials";
import { useView } from "@/lib/view";
import { patched, type Patch } from "./helpers";

/** World-space bounds of an unparented, unrotated part. */
function bounds(p: PartSpec) {
  const g = p.geo();
  g.computeBoundingBox();
  const b = g.boundingBox!.clone().translate(new THREE.Vector3(...(p.pos ?? [0, 0, 0])));
  g.dispose();
  return b;
}
const named = (name: string) => CAT.parts.filter((p) => p.name === name);
const one = (name: string) => {
  const found = named(name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
const boxAt = (c: readonly number[], size: readonly number[]) =>
  new THREE.Box3(
    new THREE.Vector3(c[0] - size[0] / 2, c[1] - size[1] / 2, c[2] - size[2] / 2),
    new THREE.Vector3(c[0] + size[0] / 2, c[1] + size[1] / 2, c[2] + size[2] / 2),
  );
const MCU_BOUNDS = boxAt(MCU, MCU_SIZE);

let saved: ReturnType<typeof useSR22T.getState>;
let savedSys: ReturnType<typeof useView.getState>["sys"];
beforeEach(() => {
  saved = useSR22T.getState();
  savedSys = useView.getState().sys;
  useView.setState({ sys: "electrical" });
});
afterEach(() => {
  useSR22T.setState({ s: saved.s, E: saved.E });
  useView.setState({ sys: savedSys });
});
/** Run a part's animation with the sim patched; true when it shows its energized (`hi`) material. */
function lit(p: PartSpec, patch: Patch<Sim>) {
  const s = patched(initialSim, patch);
  useSR22T.setState({ s, E: solve(s) });
  const mesh = new THREE.Mesh();
  p.anim!(mesh, 0);
  return mesh.material === mats("#FFD34D").hi;
}

it("the MCU holds three distribution buses, two regulators and five relays (POH 7-49, 7-57; Fig 7-10)", () => {
  expect(one("Master Control Unit").pos).toEqual(MCU);
  expect(MCU[0]).toBeGreaterThan(FW); // left firewall, engine side (POH 7-47, 7-49)
  expect(MCU[2]).toBeLessThan(0);
  const inside = [
    "Main Distribution Bus 1",
    "Main Distribution Bus 2",
    "Essential Distribution Bus",
    "ALT 1 voltage regulator",
    "ALT 2 voltage regulator",
    "ALT 1 relay",
    "BAT 1 relay",
    "Starter relay",
    "External power relay",
    "Landing light relay",
    "MCU bus fuses",
    "MDB interconnect fuse and diode",
  ];
  for (const name of inside) expect(MCU_BOUNDS.containsBox(bounds(one(name))), name).toBe(true);
  // The CONV fuse sits on top of the MCU (POH 7-50).
  const conv = bounds(one("CONV bus fuse (5 A)"));
  expect(conv.min.y).toBeCloseTo(MCU_BOUNDS.max.y, 6);
  expect(conv.min.z).toBeGreaterThan(MCU_BOUNDS.min.z);
  expect(conv.max.z).toBeLessThan(MCU_BOUNDS.max.z);
  // The MCU ghosts in X-ray so its schematic insides show.
  expect(one("Master Control Unit").fairing).toBe(true);
});

it("the main distribution buses are tied by an 80-amp fuse and a diode (POH 7-49)", () => {
  const note = one("MDB interconnect fuse and diode").note!;
  expect(note).toContain("80 A fuse and a diode");
  expect(note).toContain("AMM 13773-002 24-30 PDF p. 704 says a 60 A fuse; POH governs");
});

it("BAT 2 is two 12 V, 7 Ah batteries in a vented container aft of FS 222, below the CAPS canister (POH 7-47)", () => {
  const container = one("BAT 2 — 2 × 12 V, 7 Ah");
  expect(container.pin).toBe(true);
  expect(container.note).toContain("Vented, acid-resistant container");
  const c = bounds(container);
  const placed = boxAt(BAT2_BOX, BAT2_SIZE);
  expect(c.min.distanceTo(placed.min) + c.max.distanceTo(placed.max)).toBeLessThan(1e-6);
  expect(c.max.x).toBeLessThan(AB); // behind the aft cabin bulkhead, FS 222
  expect(c.max.z).toBeLessThan(0); // left of the parachute (POH Fig 7-20 item 24)
  const caps = one("CAPS canister");
  expect(caps.pos).toEqual(CAPS_BOX);
  expect(c.max.y).toBeLessThan(bounds(caps).min.y); // below the canister
  for (const corner of [
    c.min,
    c.max,
    new THREE.Vector3(c.min.x, c.max.y, c.max.z),
    new THREE.Vector3(c.max.x, c.min.y, c.min.z),
  ])
    expect(inFus(corner), `${corner.toArray()}`).toBe(true);
  const cells = named("BAT 2 battery — 12 V, 7 Ah");
  expect(cells).toHaveLength(2);
  for (const cell of cells) expect(c.containsBox(bounds(cell))).toBe(true);
  expect(bounds(cells[0]).intersectsBox(bounds(cells[1]))).toBe(false);
});

it("the landing light relay is energized only by LAND with Main Dist Bus 1 up (POH 7-57)", () => {
  const relay = one("Landing light relay");
  const mdb1Dead = { elec: { bat1: false, alt1: false } } as const;
  expect(solve(patched(initialSim, mdb1Dead)).mdb1).toBe(0);
  expect(solve(patched(initialSim, { lights: { land: true } })).mdb1).toBeGreaterThan(0);
  expect(lit(relay, { lights: { land: false } })).toBe(false);
  expect(lit(relay, { lights: { land: true } })).toBe(true);
  expect(lit(relay, { lights: { land: true }, ...mdb1Dead })).toBe(false);
  // The ballast it feeds glows with it.
  const ballast = one("Landing light ballast");
  expect(lit(ballast, { lights: { land: true } })).toBe(true);
  expect(lit(ballast, { lights: { land: true }, ...mdb1Dead })).toBe(false);
});

it("a heat shield sits on the MCU (AMM 71-30 PDF 2528)", () => {
  const shield = one("MCU heat shield");
  expect(new THREE.Vector3(...shield.pos!).distanceTo(new THREE.Vector3(...MCU))).toBeLessThan(0.1);
  expect(bounds(shield).min.x).toBeGreaterThanOrEqual(MCU_BOUNDS.max.x); // on its engine side
  expect(one("Landing light ballast").pos![0]).toBeGreaterThan(FW); // ballast on the firewall (POH 7-57)
});

it("the BAT 1 relay lights only with BAT 1 on", () => {
  const relay = one("BAT 1 relay");
  for (const patch of [{}, { elec: { bat1: false } }, { elec: { fail: { bat1: true } } }] as Patch<Sim>[]) {
    const E = solve(patched(initialSim, patch));
    expect(lit(relay, patch), JSON.stringify(patch)).toBe(E.bat1ok);
  }
  expect(lit(relay, {})).toBe(true);
  expect(lit(relay, { elec: { bat1: false } })).toBe(false);
});

it("two TVS on the RH side of the center console (AMM 24-50 PDF 752)", () => {
  const tvs = named("Transient voltage suppressor");
  expect(tvs).toHaveLength(2);
  const centre = bounds(one("Center console"));
  for (const p of tvs) {
    // The eight harness TVS (AMM 24-50 PDF p. 752) are separate parts; the note points at them.
    expect(p.note).toContain("Harness TVS");
    const b = bounds(p);
    expect(b.min.z).toBeGreaterThan(0);
    expect(centre.containsBox(b)).toBe(true);
  }
});

it("the convenience system controller is under the RH rear seat (POH Fig 7-20 item 15; AMM 24-50 PDF 755)", () => {
  const ctrl = bounds(one("Convenience system controller"));
  // The RH rear seat cushion (the other "Rear seat" part is its back).
  const seats = named("Rear seat").map(bounds);
  const seat = seats.reduce((a, b) => (b.min.y < a.min.y ? b : a));
  expect(seat.min.z).toBeGreaterThan(0);
  expect(ctrl.min.z).toBeGreaterThan(0);
  expect(ctrl.max.y).toBeLessThan(seat.min.y);
  expect(ctrl.min.x).toBeGreaterThanOrEqual(seat.min.x);
  expect(ctrl.max.x).toBeLessThanOrEqual(seat.max.x);
  expect(inFus(ctrl.min) && inFus(ctrl.max)).toBe(true);
});

it("the ALT 2 belt runs from the crankshaft pulley to ALT 2 (POH 7-47)", () => {
  const alt2 = bounds(one("ALT 2 — 70 A"));
  const belt = bounds(one("ALT 2 drive belt"));
  expect(belt.intersectsBox(alt2.clone().expandByScalar(0.02))).toBe(true);
  expect(belt.max.y).toBeGreaterThan(-0.14); // wraps the crankshaft pulley at the propeller axis
  expect(belt.max.x).toBeLessThan(3.8); // behind the propeller
});

it("the ALT 1 and starter relays follow ALT 1 and the key at START (POH 7-37; Fig 7-10)", () => {
  const alt1 = one("ALT 1 relay");
  expect(lit(alt1, {})).toBe(true);
  expect(lit(alt1, { elec: { alt1: false } })).toBe(false);
  expect(lit(alt1, { elec: { fail: { alt1: true } } })).toBe(false);
  const starter = one("Starter relay");
  expect(lit(starter, {})).toBe(false); // key at BOTH
  expect(lit(starter, { eng: { key: "START" } })).toBe(true);
  expect(lit(starter, { eng: { key: "START" }, elec: { bat1: false } })).toBe(false); // no STARTER power
  expect(lit(one("External power relay"), {})).toBe(false); // external power not modelled
});

it("the MCU buses and regulators glow with the solver's bus and alternator states (POH 7-49)", () => {
  const cases: Patch<Sim>[] = [
    {},
    { elec: { alt1: false } },
    { elec: { alt2: false } },
    { elec: { bat1: false, bat2: false, alt1: false, alt2: false } },
  ];
  const parts = [
    ["Main Distribution Bus 1", (E: Elec) => E.mdb1 > 0],
    ["Main Distribution Bus 2", (E: Elec) => E.mdb2 > 0],
    ["Essential Distribution Bus", (E: Elec) => E.edb > 0],
    ["ALT 1 voltage regulator", (E: Elec) => E.alt1],
    ["ALT 2 voltage regulator", (E: Elec) => E.alt2],
  ] as const;
  for (const [name, on] of parts) {
    const seen = cases.map((patch) => {
      const want = on(solve(patched(initialSim, patch)));
      expect(lit(one(name), patch), `${name} ${JSON.stringify(patch)}`).toBe(want);
      return want;
    });
    expect(seen, name).toContain(true);
    expect(seen, name).toContain(false);
  }
});

it("the 80 A ALT 2 and interconnect fuses note the 60 A that POH Fig 7-10 prints (POH 13772-007 7-48, 7-49)", () => {
  for (const name of ["MCU bus fuses", "MDB interconnect fuse and diode", "Main Distribution Bus 2"]) {
    const note = one(name).note ?? "";
    expect(note, name).toContain("80 A");
    expect(note, name).toMatch(/Fig 7-10 \(7-48\).*60 A/);
    expect(note, name).toMatch(/7-49 text governs/);
  }
  const alt2 = FLOWS.find((f) => f.key === "alt2")!.note ?? "";
  expect(alt2).toMatch(/Fig 7-10 \(7-48\) prints 60 A/);
});
