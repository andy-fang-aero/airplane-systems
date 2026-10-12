/** TKS distribution: AMM 13773-002 Rev 7 30-00 (PDF 1167–1168), 30-60 (PDF 1258), 27-31 (PDF 1032). Metres are schematic. */
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { CAT, surfacePivot, type PartSpec } from "@/aircraft/sr22t/parts";
import { inFus } from "@/aircraft/sr22t/geometry";
import { useSR22T } from "@/aircraft/sr22t/store";
import { flowRates, flowsFor } from "@/aircraft/sr22t/flows";
import { initialSim, solve } from "@/aircraft/sr22t/model";
import { toV } from "@/lib/math";

const SIDES = ["Left", "Right"] as const;
const saved = useSR22T.getState().s;
afterEach(() => useSR22T.setState({ s: saved }));

const parts = (name: string) => CAT.parts.filter((p) => p.name === name);
const part = (name: string) => {
  const found = parts(name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
/** Airplane-frame offset of a part's moving group at rest (elevator tips ride the elevator). */
const origin = (p: PartSpec) =>
  p.parent?.startsWith("surf:") ? new THREE.Vector3(...surfacePivot(p.parent.slice(5))) : new THREE.Vector3();
const position = (p: PartSpec) => new THREE.Vector3(...p.pos!).add(origin(p));
/** Both ends of a tube part, in airplane coordinates. */
const ends = (p: PartSpec): [THREE.Vector3, THREE.Vector3] => {
  const g = p.geo() as THREE.TubeGeometry;
  const path = g.parameters.path;
  const result: [THREE.Vector3, THREE.Vector3] = [path.getPoint(0).add(origin(p)), path.getPoint(1).add(origin(p))];
  g.dispose();
  return result;
};

/** Each panel with its documented inlet end and the opposite (vent) end (AMM 30-00 PDF 1167–1168). */
const panels = () => {
  const list: { name: string; feed: string; unit: string; inlet: THREE.Vector3; vent: THREE.Vector3 }[] = [];
  const byAbsZ = (pts: THREE.Vector3[], inboard: boolean) =>
    [...pts].sort((a, b) => (inboard ? Math.abs(a.z) - Math.abs(b.z) : Math.abs(b.z) - Math.abs(a.z)));
  for (const side of SIDES) {
    for (const section of ["inboard", "outboard"]) {
      const [inlet, vent] = byAbsZ(ends(part(`${side} ${section} porous panel`)), true);
      list.push({
        name: `${side} ${section} porous panel`,
        feed: `${side} ${section} panel feed line`,
        unit: "Forward proportioning unit",
        inlet,
        vent,
      });
    }
    const [hInlet, hVent] = byAbsZ(ends(part(`${side} stabilizer porous panel`)), false);
    list.push({
      name: `${side} stabilizer porous panel`,
      feed: `${side} horizontal panel feed line`,
      unit: "Empennage proportioning unit",
      inlet: hInlet,
      vent: hVent,
    });
    const [tInlet, tVent] = byAbsZ(ends(part(`${side} elevator tip porous panel`)), true);
    list.push({
      name: `${side} elevator tip porous panel`,
      feed: `${side} elevator tip feed line`,
      unit: "Empennage proportioning unit",
      inlet: tInlet,
      vent: tVent,
    });
  }
  const [vInlet, vVent] = [...ends(part("Vertical stabilizer porous panel"))].sort((a, b) => b.y - a.y);
  list.push({
    name: "Vertical stabilizer porous panel",
    feed: "Vertical panel feed line",
    unit: "Empennage proportioning unit",
    inlet: vInlet,
    vent: vVent,
  });
  return list;
};

describe("SR22T TKS distribution", () => {
  it("the forward proportioning unit feeds the four wing panels and the slinger; the empennage unit the five tail panels (AMM 30-00 PDF 1167)", () => {
    const list = panels();
    expect(list.filter((p) => p.unit === "Forward proportioning unit")).toHaveLength(4);
    expect(list.filter((p) => p.unit === "Empennage proportioning unit")).toHaveLength(5);
    for (const p of list) {
      const [start, fixedEnd] = ends(part(p.feed));
      let end = fixedEnd;
      // AMM 55-20 PDF 2242–2243: the tail-tip feed crosses into the moving elevator through its holes.
      if (p.name.includes("elevator tip")) {
        const [movingStart, movingEnd] = ends(part(`${p.feed} (elevator)`));
        expect(fixedEnd.distanceTo(movingStart), `${p.feed} hinge connection`).toBeLessThanOrEqual(0.0005);
        end = movingEnd;
      }
      expect(start.distanceTo(position(part(p.unit))), p.feed).toBeLessThanOrEqual(0.1);
      expect(end.distanceTo(p.inlet), p.feed).toBeLessThanOrEqual(0.1);
    }
    const [start, end] = ends(part("Slinger supply line"));
    expect(start.distanceTo(position(part("Forward proportioning unit")))).toBeLessThanOrEqual(0.1);
    expect(end.distanceTo(ends(part("Slinger feed tube"))[0])).toBeLessThanOrEqual(0.1);
    // The fixed feed tube discharges inside the slinger ring (Fig. 30-07-2 sheet 7, PDF 1223).
    const ring = position(part("Propeller slinger ring")),
      tip = ends(part("Slinger feed tube"))[1];
    expect(Math.abs(tip.x - ring.x)).toBeLessThanOrEqual(0.05);
    expect(Math.hypot(tip.y - ring.y, tip.z - ring.z)).toBeLessThan(0.18);
    // Both units are supplied from the filter assembly through nylon tubing (AMM 30-00 PDF 1167).
    const filter = position(CAT.parts.find((p) => p.name === "Filter assembly" && p.sys.includes("ice"))!);
    for (const [line, unit] of [
      ["Forward unit supply line", "Forward proportioning unit"],
      ["Empennage unit supply line", "Empennage proportioning unit"],
    ]) {
      const [s, e] = ends(part(line));
      expect(s.distanceTo(filter), line).toBeLessThanOrEqual(0.1);
      expect(e.distanceTo(position(part(unit))), line).toBeLessThanOrEqual(0.1);
    }
  });

  it("inlets on the inboard end of the wing and elevator-tip panels, upper end of the vertical, outboard end of the horizontal panels (AMM 30-00 PDF 1167)", () => {
    const list = panels();
    const inlets = parts("Panel inlet fitting").map(position),
      vents = parts("Panel vent and check valve").map(position);
    expect(inlets).toHaveLength(9);
    expect(vents).toHaveLength(9);
    for (const p of list) {
      expect(
        inlets.some((f) => f.distanceTo(p.inlet) <= 0.03),
        `${p.name} inlet`,
      ).toBe(true);
      // Each panel has a vent with a check valve opposite the inlet (AMM 30-00 PDF 1168).
      expect(
        vents.some((f) => f.distanceTo(p.vent) <= 0.03),
        `${p.name} vent`,
      ).toBe(true);
    }
  });

  it("each inboard wing panel also feeds a porous stall strip through a capillary tube (AMM 30-00 PDF 1168)", () => {
    expect(CAT.parts.filter((p) => /porous stall strip$/.test(p.name ?? ""))).toHaveLength(2);
    expect(CAT.parts.filter((p) => /stall strip capillary tube$/.test(p.name ?? ""))).toHaveLength(2);
    for (const side of SIDES) {
      const [panelIn, panelOut] = ends(part(`${side} inboard porous panel`));
      const [stripIn, stripOut] = ends(part(`${side} porous stall strip`));
      const [capStart, capEnd] = ends(part(`${side} stall strip capillary tube`));
      expect(capStart.distanceTo(panelIn)).toBeLessThanOrEqual(0.1);
      expect(capEnd.distanceTo(stripIn)).toBeLessThanOrEqual(0.1);
      for (const z of [stripIn.z, stripOut.z]) {
        expect(Math.abs(z)).toBeGreaterThan(Math.abs(panelIn.z));
        expect(Math.abs(z)).toBeLessThan(Math.abs(panelOut.z));
        expect(Math.sign(z)).toBe(side === "Left" ? -1 : 1);
      }
    }
  });

  it("three grooved boots turn with the propeller blades (AMM 30-00 PDF 1168)", () => {
    const boots = parts("Grooved blade boot");
    expect(boots.map((p) => p.parent).sort()).toEqual(["blade:0", "blade:1", "blade:2"]);
    for (const boot of boots) expect(boot.sys).toEqual(expect.arrayContaining(["ice", "propeller"]));
    // Three feed tubes carry the slinger fluid to the boots (AMM 30-60 PDF 1258).
    expect(
      parts("Boot feed tube")
        .map((p) => p.parent)
        .sort(),
    ).toEqual(["blade:0", "blade:1", "blade:2"]);
  });

  it("FIKI airplanes warn of the stall with a lift transducer on the RH outboard porous panel and a computer under CF3R (AMM 27-31 PDF 1032; Fig. 27-31-2 PDF 1044)", () => {
    const transducer = position(part("Stall warning lift transducer"));
    const [panelIn, panelOut] = ends(part("Right outboard porous panel"));
    expect(transducer.z).toBeGreaterThan(panelIn.z);
    expect(transducer.z).toBeLessThan(panelOut.z);
    // CF3R: the aft-floor access panel (Fig. 27-31-2 Detail A, PDF 1044); Fig. 6-00-6 (PDF 123) labels it "Pitot-Static Water Trap".
    const computer = position(part("Stall warning computer")),
      rearSeat = position(parts("Rear seat").find((p) => p.pos![2] > 0)!);
    expect(computer.z).toBeGreaterThan(0);
    expect(Math.abs(computer.x - rearSeat.x)).toBeLessThanOrEqual(0.3);
    expect(inFus(computer)).toBe(true);
    expect(part("Stall warning computer").note).toMatch(/CF3R, the aft-floor access panel/);
    expect(part("Stall warning computer").note).toMatch(/labels CF3R 'Pitot-Static Water Trap'/);
    expect(part("Stall warning computer").note).not.toMatch(/passenger/i);
  });

  it("stall warning per configuration: FIKI draws transducer wiring instead of the pneumatic line; without FIKI, the line ends at the mid-console pressure switch (AMM 27-31 ¶A / ¶B PDF 1032)", () => {
    const keys = (fiki: boolean) => flowsFor(fiki).map((f) => f.key);
    expect(keys(true)).toContain("stallWire");
    expect(keys(true)).not.toContain("stall");
    expect(keys(false)).toContain("stall");
    expect(keys(false)).not.toContain("stallWire");
    // every other flow is drawn in both configurations
    expect(keys(true).filter((k) => k !== "stallWire")).toEqual(keys(false).filter((k) => k !== "stall"));
    const path = (fiki: boolean, key: string) =>
      flowsFor(fiki)
        .find((f) => f.key === key)!
        .pts.map(toV);
    const wire = path(true, "stallWire");
    expect(wire[0].distanceTo(position(part("Stall warning lift transducer")))).toBeLessThanOrEqual(0.1);
    expect(wire.at(-1)!.distanceTo(position(part("Stall warning computer")))).toBeLessThanOrEqual(0.1);
    const line = path(false, "stall"),
      pressureSwitch = position(part("Stall warning pressure switch")),
      inlet = position(part("Stall warning inlet"));
    expect(line[0].distanceTo(inlet)).toBeLessThanOrEqual(0.1);
    expect(line.at(-1)!.distanceTo(pressureSwitch)).toBeLessThanOrEqual(0.05);
    // mid-console, LH side panel (AMM 27-31 ¶A)
    const consolePart = part("Center console"),
      consoleAt = position(consolePart),
      g = consolePart.geo();
    g.computeBoundingBox();
    const { min, max } = g.boundingBox!;
    g.dispose();
    expect(pressureSwitch.z).toBeLessThan(consoleAt.z);
    expect(pressureSwitch.x).toBeGreaterThan(consoleAt.x + min.x);
    expect(pressureSwitch.x).toBeLessThan(consoleAt.x + max.x);
    for (const fiki of [true, false]) {
      useSR22T.setState({ s: { ...saved, equip: { ...saved.equip, fiki } } });
      const shown = new Set(CAT.partsFor());
      for (const name of ["Stall warning inlet", "Stall warning pressure switch"])
        expect(shown.has(part(name)), `${name} with fiki=${fiki}`).toBe(!fiki);
      for (const name of ["Stall warning lift transducer", "Stall warning computer"])
        expect(shown.has(part(name)), `${name} with fiki=${fiki}`).toBe(fiki);
    }
  });

  it("the transducer wiring carries the warning only while stalled, powered and fault-free (AMM 27-31 ¶B PDF 1032; POH 7-68)", () => {
    const rate = (patch: { aoa: number; fault: boolean }, cb: Record<string, boolean> = {}) => {
      const s = { ...structuredClone(initialSim), stall: { ...initialSim.stall, ...patch }, cb };
      return flowRates(s, solve(s)).stallWire;
    };
    expect(rate({ aoa: 15, fault: false })).toBe(1);
    expect(rate({ aoa: 6, fault: false })).toBe(0);
    expect(rate({ aoa: 15, fault: true })).toBe(0);
    expect(rate({ aoa: 15, fault: false }, { "STALL WARNING": true })).toBe(0);
  });

  it("FIKI-off airplanes render no TKS distribution or FIKI stall-warning hardware", () => {
    const names = [
      "Forward unit supply line",
      "Empennage unit supply line",
      "Panel inlet fitting",
      "Panel vent and check valve",
      "Left elevator tip porous panel",
      "Vertical stabilizer porous panel",
      "Left porous stall strip",
      "Right stall strip capillary tube",
      "Slinger supply line",
      "Slinger feed tube",
      "Boot feed tube",
      "Grooved blade boot",
      "Stall warning lift transducer",
      "Stall warning computer",
    ];
    for (const fiki of [true, false]) {
      useSR22T.setState({ s: { ...saved, equip: { ...saved.equip, fiki } } });
      const shown = new Set([
        ...CAT.partsFor(),
        ...["blade:0", "blade:1", "blade:2", "surf:elevL", "surf:elevR"].flatMap((g) => CAT.partsFor(g)),
      ]);
      for (const name of names) {
        const all = parts(name);
        expect(all.length, name).toBeGreaterThan(0);
        for (const p of all) expect(shown.has(p), `${name} with fiki=${fiki}`).toBe(fiki);
      }
      expect(CAT.pinned("pitot").some((p) => p.name === "Stall warning lift transducer")).toBe(fiki);
    }
  });
});
