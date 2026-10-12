/**
 * Cabin air outlets for serials 22T-1460, 22T-1471, 22T-1473 thru 22T-9749 (the modelled airplane is one), AMM 13773-002
 * Rev 7 21-20 PDF p. 454 and Fig 21-20-1 (PDF pp. 474–480); POH 13772-007 7-13, 7-64 … 7-66 and Fig 7-4 (2 of 2, 7-15).
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "@/lib/math";
import { FLOWS, flowRates, isCabinAir } from "@/aircraft/sr22t/flows";
import { inFus, DOOR_SEAM } from "@/aircraft/sr22t/geometry";
import { initialSim, solve, type Sim } from "@/aircraft/sr22t/model";
import { CAT } from "@/aircraft/sr22t/parts";
import { DIST_MANIFOLD } from "@/aircraft/sr22t/parts/environment";
import { patched, type Patch } from "./helpers";

const named = (name: string) => CAT.parts.filter((p) => p.name === name);
const v = (p: Vec3) => new THREE.Vector3(...p);
const world = (p: (typeof CAT.parts)[number]) => {
  const m = new THREE.Mesh(p.geo());
  if (p.pos) m.position.set(...p.pos);
  if (p.rot) m.rotation.set(...p.rot);
  if (p.scale) m.scale.set(...p.scale);
  m.updateMatrixWorld();
  return new THREE.Box3().setFromObject(m, true);
};
const meshOf = (p: (typeof CAT.parts)[number]) => {
  const m = new THREE.Mesh(p.geo(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  if (p.pos) m.position.set(...p.pos);
  if (p.rot) m.rotation.set(...p.rot);
  if (p.scale) m.scale.set(...p.scale);
  m.updateMatrixWorld();
  return m;
};
const vertices = (p: (typeof CAT.parts)[number]) => {
  const m = meshOf(p),
    a = m.geometry.getAttribute("position");
  return Array.from({ length: a.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld),
  );
};
/** World box of the first part with this name (the labelled one). */
const boxOf = (name: string) => world(named(name)[0]);
const rates = (p: Patch<Sim> = {}) => {
  const s = patched(initialSim, p);
  return flowRates(s, solve(s));
};

/** Outlet part name → [AMM 21-20 name, count on 22T-1460 … 22T-9749]. */
const OUTLETS: [string, string, number][] = [
  ["Panel eyeball outlet", "Crew display air vent", 2],
  ["Bolster eyeball outlet", "Crew panel air vent", 2],
  ["Kick-plate floor outlet", "Crew floor air vent", 2],
  ["Armrest eyeball outlet", "Passenger panel air vent", 2],
  ["Foot-warmer diffuser", "Passenger floor air vent", 2],
  ["Windshield diffuser", "Defrost vent", 1],
];
const outletParts = () => OUTLETS.flatMap(([name]) => named(name));

describe("SR22T cabin air outlets, 22T-1460 thru 22T-9749", () => {
  it("has 11 outlets on this serial range, the crew panel vents included (AMM 21-20 PDF p. 454; Fig 21-20-1)", () => {
    for (const [name, , n] of OUTLETS) {
      const parts = named(name);
      expect(parts, name).toHaveLength(n);
      if (n === 2) expect(parts.map((p) => Math.sign(p.pos![2])).sort(), name).toEqual([-1, 1]);
    }
    expect(outletParts()).toHaveLength(11);
    // the crew panel vents are the serial-range "additional vents … at LH and RH crew panels"
    for (const p of named("Bolster eyeball outlet")) {
      expect(p.note).toContain("22T-1460, 22T-1471, 22T-1473 thru 22T-9749");
      expect(p.note).toContain("AMM 21-20 PDF p. 454");
    }
  });

  it("the crew display vents sit on the instrument panel face, outboard of the display bezels near their tops (POH 7-13; Fig 7-4 item 4)", () => {
    const panel = boxOf("Instrument panel"),
      pfd = boxOf("PFD bezel"),
      mfd = boxOf("MFD bezel");
    for (const p of named("Panel eyeball outlet")) {
      const [x, y, z] = p.pos!;
      expect(Math.abs(x - panel.min.x), "on the aft face").toBeLessThan(0.02);
      expect(y).toBeGreaterThan((pfd.min.y + pfd.max.y) / 2);
      expect(y).toBeLessThan(pfd.max.y);
      if (z < 0) expect(z).toBeLessThan(pfd.min.z);
      else expect(z).toBeGreaterThan(mfd.max.z);
      // just outboard: within 0.05 m of the bezel edge
      expect(z < 0 ? pfd.min.z - z : z - mfd.max.z).toBeLessThan(0.05);
    }
  });

  it("the crew panel vents sit on the bolster's aft face, either side of the avionics stack (POH 7-64; Fig 7-4 item 4)", () => {
    const bolster = boxOf("Bolster switch panel"),
      stack = boxOf("Avionics panel (centre console)"),
      md302 = { z0: -0.315, z1: -0.175 }; // MD302 face, MD302_POS ± half its 0.14 m width (Airplane.tsx)
    for (const p of named("Bolster eyeball outlet")) {
      const [x, y, z] = p.pos!;
      expect(Math.abs(x - bolster.min.x), "on the aft face").toBeLessThan(0.02);
      expect(y).toBeGreaterThan(bolster.min.y);
      expect(y).toBeLessThan(bolster.max.y);
      if (z < 0) {
        expect(z).toBeLessThan(stack.min.z);
        expect(z).toBeGreaterThan(md302.z1);
      } else expect(z).toBeGreaterThan(stack.max.z);
      expect(z < 0 ? stack.min.z - z : z - stack.max.z).toBeLessThan(0.06);
    }
  });

  it("the crew floor vents sit under the kick plate at the panel's lower edge, between each pilot's pedals (POH 7-64; Fig 7-4 item 8)", () => {
    const panel = boxOf("Instrument panel"),
      pedals = named("Rudder pedal / toe brake").map((p) => Math.abs(p.pos![2]));
    for (const p of named("Kick-plate floor outlet")) {
      const b = world(p),
        [x, , z] = p.pos!;
      expect(Math.abs(b.max.y - panel.min.y), "under the lower edge").toBeLessThan(0.01);
      expect(x).toBeGreaterThanOrEqual(panel.min.x);
      expect(x).toBeLessThanOrEqual(panel.max.x);
      expect(Math.abs(z)).toBeGreaterThan(Math.min(...pedals));
      expect(Math.abs(z)).toBeLessThan(Math.max(...pedals));
    }
  });

  it("the passenger vents sit in the rear cabin side trim, alongside the rear seats and aft of the door (POH 7-64; Fig 21-20-1 sheet 6 Detail I)", () => {
    const rear = boxOf("Rear seat"),
      doorAft = Math.min(...DOOR_SEAM.map(([x]) => x));
    const trims = named("Rear cabin side trim");
    expect(trims).toHaveLength(2);
    for (const t of trims) {
      const b = world(t);
      expect(b.min.x, "trim aft end").toBeGreaterThan(rear.min.x);
      expect(b.max.x, "trim alongside cushion").toBeLessThan(rear.max.x);
      expect(b.max.x, "trim forward end").toBeLessThan(doorAft);
      for (const q of vertices(t)) expect(inFus(q), "trim inside the skin").toBe(true);
    }
    for (const name of ["Armrest eyeball outlet", "Foot-warmer diffuser"])
      for (const p of named(name)) {
        const [x, y] = p.pos!;
        expect(x, name).toBeGreaterThan(rear.min.x);
        expect(x, name).toBeLessThan(rear.max.x);
        expect(x, name).toBeLessThan(doorAft);
        if (name === "Armrest eyeball outlet") expect(y, name).toBeGreaterThan(rear.max.y);
        else expect(y, name).toBeLessThan(rear.max.y);
      }
  });

  it("each passenger vent's centre lies on its own side's trim surface, facing the cabin (Fig 21-20-1 sheet 6 Detail I)", () => {
    // look at the trim from 5 cm away along the vent's axis: the first trim face hit must be at the vent centre (± 3 mm)
    // and face the cabin: the air vent in the upper wall faces inboard, the outlet sleeve in the bulge underside faces down
    const cases: [string, (s: number) => THREE.Vector3][] = [
      ["Armrest eyeball outlet", (s) => new THREE.Vector3(0, 0, s)],
      ["Foot-warmer diffuser", () => new THREE.Vector3(0, -1, 0)],
    ];
    for (const [name, out] of cases)
      for (const p of named(name)) {
        const s = Math.sign(p.pos![2]),
          trim = named("Rear cabin side trim").find((t) => Math.sign(t.pos![2]) === s)!,
          centre = v(p.pos!),
          // `out` points from the trim surface into the cabin (outboard is +s z, so inboard is -s z)
          toCabin = name === "Armrest eyeball outlet" ? out(s).negate() : out(s);
        const ray = new THREE.Raycaster(
          centre.clone().addScaledVector(toCabin, 0.05),
          toCabin.clone().negate(),
          0,
          0.2,
        );
        const hit = ray.intersectObject(meshOf(trim))[0];
        expect(hit, `${name} ${s}`).toBeDefined();
        expect(Math.abs(hit.distance - 0.05), `${name} ${s} on the surface`).toBeLessThan(0.003);
        const normal = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld);
        expect(normal.dot(toCabin), `${name} ${s} faces the cabin`).toBeGreaterThan(0.99);
      }
  });

  it("unscaled outlet positions say so in their notes (Fig 21-20-1 sheet 6 is not dimensioned; Fig 7-4 is in perspective)", () => {
    for (const name of ["Armrest eyeball outlet", "Foot-warmer diffuser", "Rear cabin side trim"])
      for (const p of named(name)) expect(p.note, name).toMatch(/approximate/);
    for (const p of named("Foot-warmer diffuser")) expect(p.note).toMatch(/height/);
    for (const p of named("Kick-plate floor outlet")) expect(p.note).toMatch(/z approximate/);
  });

  it("the defrost vent sits on the glareshield, on the centreline (POH 7-64; Fig 21-20-1 Detail A)", () => {
    const glare = boxOf("Glareshield"),
      b = boxOf("Windshield diffuser");
    expect(Math.abs(b.max.y - glare.max.y)).toBeLessThan(0.01);
    expect(b.min.x).toBeGreaterThanOrEqual(glare.min.x);
    expect(b.max.x).toBeLessThanOrEqual(glare.max.x);
    expect(named("Windshield diffuser")[0].pos![2]).toBe(0);
  });

  it("every outlet is fed by its own duct from the distribution manifold (AMM 21-20 PDF pp. 460–463; Fig 21-20-1 sheet 1)", () => {
    const ducts = FLOWS.filter((f) => isCabinAir(f.key) && f.pts[0] === DIST_MANIFOLD);
    for (const p of outletParts()) {
      const b = world(p);
      const feeding = ducts.filter((f) => b.distanceToPoint(v(f.pts.at(-1) as Vec3)) < 0.02);
      expect(feeding.length, `${p.name} ${p.pos}`).toBeGreaterThanOrEqual(1);
    }
    // and no outlet duct ends away from an outlet
    for (const f of ducts.filter((f) => f.key !== "fanDuct")) {
      const end = v(f.pts.at(-1) as Vec3);
      expect(Math.min(...outletParts().map((p) => world(p).distanceToPoint(end))), f.key).toBeLessThan(0.02);
    }
  });

  it("the panel and armrest vents are always fed; the floor and defrost vents follow their butterflies (POH 7-66)", () => {
    const always = ["panelL", "panelR", "panelL2", "panelR2", "armL", "armR"],
      floor = ["floorF", "floorF2", "floorR", "floorR2"];
    const P = rates({ eng: { running: true }, env: { fan: 0, temp: 0.5, vent: "P" } });
    for (const k of always) expect(P[k], k).toBeGreaterThan(0);
    for (const k of [...floor, "defrost"]) expect(P[k], k).toBe(0);
    const PF = rates({ eng: { running: true }, env: { fan: 0, temp: 0.5, vent: "PF" } });
    for (const k of floor) expect(PF[k], k).toBeGreaterThan(0);
    expect(rates({ eng: { running: true }, env: { fan: 0, temp: 0.5, vent: "W" } }).defrost).toBeGreaterThan(0);
  });

  it("the outlets, the rear side trim and the control panel clear every other system's parts but the trim they are mounted in", () => {
    const hosts: Record<string, string[]> = {
      "Panel eyeball outlet": ["Instrument panel"],
      "Bolster eyeball outlet": ["Bolster switch panel"],
      "Kick-plate floor outlet": [],
      "Armrest eyeball outlet": [],
      "Foot-warmer diffuser": [],
      "Rear cabin side trim": [],
      "Windshield diffuser": ["Glareshield"],
      "Environmental control panel": ["Instrument panel"],
    };
    // a long tube or a skin panel has a bounding box far bigger than its shape: test its vertices instead of its box
    const BIG = 0.02;
    const others = CAT.parts
      .filter((p) => !p.sys.includes("environment"))
      .map((p) => {
        const o = world(p),
          size = o.getSize(new THREE.Vector3());
        return { name: p.name ?? "?", o, pts: size.x * size.y * size.z > BIG ? vertices(p) : null };
      });
    for (const [name, host] of Object.entries(hosts))
      for (const p of named(name)) {
        const b = world(p);
        for (const { name: other, o, pts } of others) {
          if (host.includes(other) || !b.intersectsBox(o)) continue;
          if (pts)
            expect(
              pts.filter((q) => b.containsPoint(q)),
              `${name} vs ${other}`,
            ).toHaveLength(0);
          else {
            const size = b.clone().intersect(o).getSize(new THREE.Vector3());
            expect(size.x * size.y * size.z, `${name} vs ${other}`).toBe(0);
          }
        }
      }
  }, 120000);

  it("the control panel sits right of the MFD, below the RH crew display vent (POH 7-13, 7-64; Fig 7-4 item 5)", () => {
    const panel = boxOf("Environmental control panel"),
      mfd = boxOf("MFD bezel"),
      vent = named("Panel eyeball outlet").find((p) => p.pos![2] > 0)!;
    expect(panel.min.z).toBeGreaterThan(mfd.max.z);
    expect(panel.max.y).toBeLessThan(world(vent).min.y);
    expect(Math.abs((panel.min.z + panel.max.z) / 2 - vent.pos![2])).toBeLessThan(0.02);
    expect(Math.abs(panel.min.x - boxOf("Instrument panel").min.x)).toBeLessThan(0.03);
  });
});
