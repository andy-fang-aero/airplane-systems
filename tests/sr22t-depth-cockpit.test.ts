/**
 * Centre panel and console control units: the POH 13772-007 Figure 7-4 (2 of 2) audit (7-15) and the
 * Section 7 text for the units no other system file owns — magnetic compass, ADF, flap position lights, power and mixture
 * levers, friction wheel, outlets and jacks, cabin light switch and reading lights. The CAPS handle cover lives in cabin.ts.
 */
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inFus, topY } from "@/aircraft/sr22t/geometry";
import { FLAP_DEG, initialSim, live, solve, type Sim } from "@/aircraft/sr22t/model";
import { CAT, CONSOLE_QUADRANT, LIGHTS, MD302_POS } from "@/aircraft/sr22t/parts";
import { useSR22T } from "@/aircraft/sr22t/store";
import type { PartSpec } from "@/lib/catalogue";
import { mats } from "@/lib/materials";
import { patched, type Patch } from "./helpers";

const named = (name: string) => CAT.parts.filter((p) => p.name === name);
const one = (name: string) => {
  const found = named(name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
const first = (name: string) => {
  const [p] = named(name);
  expect(p, name).toBeDefined();
  return p;
};

/** Oriented bounding box of a part in the airplane frame: centre, unit axes and half extents. */
interface Obb {
  c: THREE.Vector3;
  u: THREE.Vector3[];
  e: number[];
}
function obb(p: PartSpec, rot: readonly number[] = p.rot ?? [0, 0, 0]): Obb {
  expect(p.parent, `${p.name} is on a moving group`).toBeUndefined();
  const g = p.geo();
  g.computeBoundingBox();
  const b = g.boundingBox!;
  g.dispose();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
  const size = b.getSize(new THREE.Vector3());
  return {
    c: b
      .getCenter(new THREE.Vector3())
      .applyQuaternion(q)
      .add(new THREE.Vector3(...(p.pos ?? [0, 0, 0]))),
    u: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((v) =>
      v.applyQuaternion(q),
    ),
    e: [size.x / 2, size.y / 2, size.z / 2],
  };
}
const obbCorners = (o: Obb) =>
  [-1, 1].flatMap((i) =>
    [-1, 1].flatMap((j) =>
      [-1, 1].map((k) =>
        o.c
          .clone()
          .addScaledVector(o.u[0], i * o.e[0])
          .addScaledVector(o.u[1], j * o.e[1])
          .addScaledVector(o.u[2], k * o.e[2]),
      ),
    ),
  );
/** Separating-axis test on two oriented boxes, each shrunk by 1 mm so boxes that only touch do not count. */
function obbOverlap(a: Obb, b: Obb) {
  const d = b.c.clone().sub(a.c);
  const axes = [...a.u, ...b.u, ...a.u.flatMap((ua) => b.u.map((ub) => ua.clone().cross(ub)))];
  for (const L of axes) {
    if (L.lengthSq() < 1e-10) continue;
    L.normalize();
    const r = (o: Obb) => o.e.reduce((sum, e, i) => sum + Math.max(e - 0.001, 0) * Math.abs(o.u[i].dot(L)), 0);
    if (Math.abs(d.dot(L)) >= r(a) + r(b)) return false;
  }
  return true;
}
/** Solid neighbours whose oriented bounding box is their shape: boxes, cylinders and spheres (not tubes, lofts or slabs). */
const PRIMITIVE = new Set(["BoxGeometry", "CylinderGeometry", "SphereGeometry"]);
const isPrimitive = (p: PartSpec) => {
  const g = p.geo(),
    t = g.type;
  g.dispose();
  return PRIMITIVE.has(t);
};

let saved: ReturnType<typeof useSR22T.getState>;
let savedFlapAng: number;
beforeEach(() => {
  saved = useSR22T.getState();
  savedFlapAng = live.flapAng;
});
afterEach(() => {
  useSR22T.setState({ s: saved.s, E: saved.E });
  live.flapAng = savedFlapAng;
});
const setSim = (patch: Patch<Sim>) => {
  const s = patched(initialSim, patch);
  useSR22T.setState({ s, E: solve(s) });
  return s;
};
const animated = (p: PartSpec) => {
  const mesh = new THREE.Mesh();
  p.anim!(mesh, 0);
  return mesh;
};

/** Every unit added by this section, by part name. */
const NEW_PARTS = [
  "Magnetic compass",
  "ADF (optional)",
  "Flap panel",
  "Flap position light",
  "Power lever",
  "Mixture lever",
  "Friction control wheel",
  "12 V convenience outlet",
  "USB charging port (front)",
  "AUDIO INPUT jack",
  "USB charging port (rear)",
  "Passenger audio jacks (if equipped)",
  "Cabin light switch",
  "Reading light",
  "Reading light push button",
];

describe("POH Fig 7-4 audit", () => {
  /**
   * Fig 7-4 (2 of 2), 7-15, item → the part(s) that model it, whichever file owns them (items 4, 5 and 8: environment.ts).
   */
  const ITEMS: Record<number, string[] | { screen: "MD302" }> = {
    1: ["CAPS activation handle cover", "CAPS cover black forward tab", "CAPS activation T-handle"],
    2: ["Magnetic compass"],
    3: ["MFD bezel"],
    4: ["Bolster eyeball outlet", "Panel eyeball outlet"],
    5: ["Environmental control panel"],
    6: ["Side yoke"],
    7: ["ADF (optional)"],
    8: ["Kick-plate floor outlet"],
    9: ["Rudder pedal / toe brake"],
    10: ["FLAPS switch", "Flap panel", "Flap position light"],
    11: ["Armrest: egress hammer & hour meters"],
    12: ["USB charging port (rear)", "Passenger audio jacks (if equipped)"],
    13: ["Power lever", "Mixture lever", "Friction control wheel", "Fuel selector valve", "Fuel Pump switch"],
    14: ["Circuit breaker panel", "ELT remote switch (RCPI)", "Alternate static valve"],
    15: ["GCU 479 FMS keyboard", "GMC 707 autopilot mode controller", "GMA 350 audio panel"],
    16: ["PARK BRAKE handle"],
    17: { screen: "MD302" },
    18: ["Bolster switch panel"],
    19: ["Ignition key switch"],
    20: ["PFD bezel"],
    21: ["Dome light", "Cabin light switch"],
  };

  it("every POH Fig 7-4 item has a part (POH 7-15)", () => {
    expect(Object.keys(ITEMS).map(Number)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    for (const [item, spec] of Object.entries(ITEMS)) {
      if (Array.isArray(spec))
        for (const name of spec) expect(named(name).length, `item ${item}: ${name}`).toBeGreaterThan(0);
      else if ("screen" in spec) {
        // Airplane.tsx SCREENS "Standby — MD302" is centred at MD302_POS: on the LH bolster's aft face, below the switch strip
        const bolster = obb(one("Bolster switch panel"));
        expect(MD302_POS[2]).toBeLessThan(0);
        expect(Math.abs(MD302_POS[0] - (bolster.c.x - bolster.e[0]))).toBeLessThan(0.01);
        expect(MD302_POS[1]).toBeLessThan(bolster.c.y + bolster.e[1]);
      }
    }
  });

  it("each new unit cites its POH page (POH 7-15 Fig 7-4 audit)", () => {
    for (const name of NEW_PARTS) {
      const p = first(name);
      expect(p.note, name).toMatch(/POH 13772-007 (Fig 7-\d+|[37]-\d+)|AMM 13773-002/);
    }
  });
});

describe("engine controls", () => {
  it("power and mixture levers follow the controls (POH 7-32)", () => {
    const power = one("Power lever"),
      mixture = one("Mixture lever");
    const steps = [0, 0.25, 0.5, 0.75, 1];
    const tilt = (p: PartSpec, patch: (v: number) => Patch<Sim>) =>
      steps.map((v) => {
        setSim(patch(v));
        return animated(p).rotation.z;
      });
    const powerTilt = tilt(power, (lever) => ({ eng: { lever } }));
    const mixTilt = tilt(mixture, (mix) => ({ eng: { mix } }));
    // forward toward MAX / RICH: negative z rotation leans the grip toward +x
    for (const t of [powerTilt, mixTilt]) for (let i = 1; i < t.length; i++) expect(t[i]).toBeLessThan(t[i - 1]);
    // each lever reads only its own control
    expect(new Set(tilt(power, (mix) => ({ eng: { mix } }))).size).toBe(1);
    expect(new Set(tilt(mixture, (lever) => ({ eng: { lever } }))).size).toBe(1);
    // they pivot at the shared quadrant where the throttle and mixture cables start (engine-air.ts)
    for (const p of [power, mixture]) {
      expect(p.pos![0]).toBe(CONSOLE_QUADRANT[0]);
      expect(p.pos![1]).toBe(CONSOLE_QUADRANT[1]);
    }
    expect(power.pos![2]).toBeLessThan(mixture.pos![2]); // Fig 7-7 (7-34): power lever left of the mixture
  });

  it("the friction wheel is on the right side of the console (POH 7-32)", () => {
    const wheel = obb(one("Friction control wheel")),
      console = obb(one("Center console"));
    expect(wheel.c.z).toBeGreaterThan(0);
    expect(wheel.c.z - wheel.e[2]).toBeCloseTo(console.c.z + console.e[2], 6); // on its right side face
  });

  it("the levers stay above the console top through their whole travel (POH 7-32)", () => {
    const top = obb(one("Center console"));
    const consoleTop = top.c.y + top.e[1];
    for (const name of ["Power lever", "Mixture lever"])
      for (const v of [0, 0.5, 1]) {
        setSim({ eng: { lever: v, mix: v } });
        const p = one(name);
        const lowest = Math.min(
          ...obbCorners(obb(p, animated(p).rotation.toArray().slice(0, 3) as number[])).map((c) => c.y),
        );
        expect(lowest, `${name} at ${v}`).toBeGreaterThan(consoleTop);
      }
  });
});

describe("flap position lights", () => {
  const lamps = () => named("Flap position light");
  it("flap position lights: UP green, 50 % and 100 % yellow (POH 7-23)", () => {
    const ls = lamps();
    expect(ls.map((l) => l.color)).toEqual(["#3FBF5F", "#F2C230", "#F2C230"]);
    expect(ls[0].note).toMatch(/^UP \(0%\) light \(green\)/);
    expect(ls[1].note).toMatch(/^50% light \(yellow\)/);
    expect(ls[2].note).toMatch(/^100% light \(yellow\)/);
    const detents = [0, 50, 100] as const;
    for (const cmd of detents) {
      // reached: only that position's lamp is lit
      setSim({ flaps: { cmd } });
      live.flapAng = FLAP_DEG[cmd];
      expect(useSR22T.getState().E.flapsPwr).toBe(true);
      expect(ls.map((l, i) => animated(l).material === mats(l.color!).hi && detents[i] === cmd)).toEqual(
        detents.map((d) => d === cmd),
      );
      expect(ls.filter((l) => animated(l).material === mats(l.color!).hi)).toHaveLength(1);
      // still travelling: none lit
      live.flapAng = FLAP_DEG[cmd] === 0 ? 4 : FLAP_DEG[cmd] - 4;
      expect(ls.some((l) => animated(l).material === mats(l.color!).hi)).toBe(false);
    }
    // no FLAPS power (10 A FLAPS, NON ESS BUS): dark even at the detent
    setSim({
      flaps: { cmd: 50 },
      eng: { running: false },
      elec: { bat1: false, bat2: false, alt1: false, alt2: false },
    });
    live.flapAng = FLAP_DEG[50];
    expect(useSR22T.getState().E.flapsPwr).toBe(false);
    expect(ls.some((l) => animated(l).material === mats(l.color!).hi)).toBe(false);
  });

  it("the lights stand in a column right of the FLAPS knob, UP at the top (AMM Fig 27-50-3 PDF p. 1065; POH 7-23)", () => {
    const ys = lamps().map((l) => obb(l).c.y);
    expect(ys[0]).toBeGreaterThan(ys[1]);
    expect(ys[1]).toBeGreaterThan(ys[2]);
    const knob = obb(one("FLAPS switch"));
    // along the slope: 50% level with the knob's centre, UP above and 100% below, all within the knob's height
    const up = new THREE.Vector3(0.22, 0.265, 0).normalize(),
      along = lamps().map((l) => obb(l).c.clone().sub(knob.c).dot(up));
    expect(Math.abs(along[1])).toBeLessThan(1e-9);
    expect(along[0]).toBeGreaterThan(0);
    expect(along[2]).toBeLessThan(0);
    for (const t of along) expect(Math.abs(t)).toBeLessThanOrEqual(knob.e[1] + 1e-6);
    for (const l of lamps()) {
      const o = obb(l);
      expect(o.c.z - o.e[2], `${l.note}`).toBeGreaterThan(knob.c.z + knob.e[2]); // right of the knob
      expect(o.c.z - o.e[2] - (knob.c.z + knob.e[2])).toBeLessThan(0.01); // and beside it
      expect(Math.abs(o.c.z - obb(lamps()[0]).c.z)).toBeLessThan(1e-9); // one column
    }
  });

  it("one flap panel face carries the knob and the lights (AMM Fig 27-50-3 PDF p. 1065)", () => {
    const face = one("Flap panel");
    const mesh = new THREE.Mesh(face.geo());
    mesh.position.set(...face.pos!);
    mesh.rotation.set(...face.rot!);
    mesh.updateMatrixWorld(true);
    // the slope's outward normal (cabin.ts STACK from [2.0, −0.27] up to [2.22, −0.005]) and its up-slope direction
    const out = new THREE.Vector3(-0.265, 0.22, 0).normalize(),
      up = new THREE.Vector3(0.22, 0.265, 0).normalize();
    const hits = (p: THREE.Vector3) =>
      new THREE.Raycaster(p.clone().addScaledVector(out, 0.05), out.clone().negate(), 0, 0.1).intersectObject(mesh)
        .length > 0;
    // the lights sit on the face
    for (const l of lamps()) expect(hits(obb(l).c), l.note).toBe(true);
    // the knob passes through an opening in it: no face under the knob's footprint
    const knob = obb(one("FLAPS switch")),
      dt = knob.e[1] - 0.0005,
      dz = knob.e[2] - 0.0005;
    for (const [a, b] of [
      [0, 0],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ])
      expect(
        hits(
          knob.c
            .clone()
            .addScaledVector(up, a * dt)
            .add(new THREE.Vector3(0, 0, b * dz)),
        ),
        `${a},${b}`,
      ).toBe(false);
    // and the face surrounds the knob on every side
    for (const [a, b] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      expect(
        hits(
          knob.c
            .clone()
            .addScaledVector(up, a * (knob.e[1] + 0.004))
            .add(new THREE.Vector3(0, 0, b * (knob.e[2] + 0.003))),
        ),
        `${a},${b}`,
      ).toBe(true);
  });
});

describe("ceiling units", () => {
  it("the compass is on the headliner above the windshield (POH 7-22)", () => {
    const c = obb(one("Magnetic compass"));
    expect(Math.abs(c.c.z)).toBeLessThan(1e-9);
    const top = Math.max(...obbCorners(c).map((p) => p.y));
    // within 8 cm of the outer skin, i.e. on the headliner
    expect(top).toBeGreaterThan(topY(c.c.x) - 0.08);
    for (const p of obbCorners(c)) expect(inFus(p)).toBe(true);
    // just aft of the windshield's top edge, which meets the roof at x 1.73 (geometry.ts WIN.windLower)
    const fwd = Math.max(...obbCorners(c).map((p) => p.x));
    expect(fwd).toBeLessThanOrEqual(1.73);
    expect(fwd).toBeGreaterThan(1.73 - 0.05);
  });

  it("Fig 7-4 item 1 is the one CAPS handle cover and black tab; no second cover (POH 7-96)", () => {
    expect(named("CAPS activation handle cover")).toHaveLength(1);
    expect(named("CAPS cover black forward tab")).toHaveLength(1);
    expect(named("CAPS handle cover")).toHaveLength(0);
    expect(CAT.parts.filter((p) => /^CAPS.*cover$/i.test(p.name ?? ""))).toHaveLength(1);
  });
});

describe("outlets and jacks", () => {
  it("two USB ports near the convenience outlet and two on the aft console (POH 7-94)", () => {
    const outlet = obb(one("12 V convenience outlet")).c;
    const front = named("USB charging port (front)").map((p) => obb(p).c),
      rear = named("USB charging port (rear)").map((p) => obb(p).c);
    expect(front).toHaveLength(2);
    expect(rear).toHaveLength(2);
    for (const u of front) expect(u.distanceTo(outlet)).toBeLessThan(0.05);
    const console = obb(one("Center console"));
    const aftFace = console.c.x - console.e[0];
    for (const u of rear) {
      expect(Math.abs(u.x - aftFace)).toBeLessThan(0.01);
      expect(Math.abs(u.z)).toBeLessThan(console.e[2]);
    }
    for (const p of [...named("USB charging port (front)"), ...named("USB charging port (rear)")])
      expect(p.note).toContain("12V & USB POWER, 5 A on MAIN BUS 3");
    // AUDIO INPUT near the outlet (POH 7-90)
    expect(obb(one("AUDIO INPUT jack")).c.distanceTo(outlet)).toBeLessThan(0.06);
  });
});

describe("cabin lighting", () => {
  it("one dome light on the convenience circuit (POH 7-59)", () => {
    const dome = one("Dome light");
    expect(dome.pos).toEqual(LIGHTS.dome);
    expect(dome.note).toContain("5 A CONV LIGHTS breaker on the CONV bus");

    const sw = one("Cabin light switch"),
      s = obb(sw);
    expect(s.c.y).toBeGreaterThan(topY(s.c.x) - 0.08); // on the ceiling
    expect(s.c.distanceTo(new THREE.Vector3(...LIGHTS.dome))).toBeLessThan(0.1);
    const tilt = (["ON", "OFF", "AUTO"] as const).map((cabin) => {
      setSim({ lights: { cabin } });
      return animated(sw).rotation.z;
    });
    expect(new Set(tilt).size).toBe(3);
    expect(tilt[1]).toBe(0); // OFF in the middle
    expect(Math.sign(tilt[0])).toBe(-Math.sign(tilt[2]));

    const reading = named("Reading light");
    const seats = ["Pilot seat", "Front passenger seat", "Rear seat (2+1 bench)", "Rear seat"].map(first);
    expect(reading).toHaveLength(seats.length);
    for (const r of reading) {
      expect(r.note).toContain("5 A CABIN LIGHTS breaker on MAIN BUS 1");
      for (const c of obbCorners(obb(r))) expect(inFus(c)).toBe(true);
    }
    // one above each seat position, each with its push button beside it
    const buttons = named("Reading light push button").map((p) => obb(p).c);
    expect(buttons).toHaveLength(seats.length);
    seats.forEach((seat, i) => {
      const r = obb(reading[i]).c,
        cushion = obb(seat);
      expect(Math.abs(r.z - cushion.c.z), seat.name).toBeLessThan(cushion.e[2]);
      expect(Math.abs(r.x - cushion.c.x), seat.name).toBeLessThan(0.3);
      expect(Math.min(...buttons.map((b) => b.distanceTo(r))), seat.name).toBeLessThan(0.05);
    });
  });
});

describe("placement", () => {
  it("no new unit sits inside another solid", () => {
    // the T-handle grip this section named in cabin.ts stays a neighbour: it is joined to the handle shaft by design
    const mine = NEW_PARTS.flatMap(named);
    const others = CAT.parts.filter((p) => !p.parent && !mine.includes(p) && isPrimitive(p));
    for (const [i, a] of mine.entries()) {
      const oa = obb(a);
      for (const b of [...mine.slice(i + 1), ...others])
        // the knob passes through the flap panel's opening: checked by ray in "one flap panel face carries the knob…"
        if (!(a.name === "Flap panel" && b.name === "FLAPS switch"))
          expect(obbOverlap(oa, obb(b)), `${a.name} / ${b.name} ${b.id}`).toBe(false);
    }
    // the flap panel units sit on the face of the sloping avionics panel (an extruded prism), not inside it: every corner
    // is on the cabin side of its slope (cabin.ts STACK from [2.0, −0.27] up to [2.22, −0.005])
    const n = new THREE.Vector2(-0.265, 0.22).normalize(),
      a0 = new THREE.Vector2(2.0, -0.27);
    for (const p of ["Flap panel", "Flap position light"].flatMap(named))
      for (const c of obbCorners(obb(p)))
        expect(new THREE.Vector2(c.x, c.y).sub(a0).dot(n), p.name).toBeGreaterThan(-1e-6);
    // the ADF is aft of the instrument panel, on the bolster's aft face
    const adf = obb(one("ADF (optional)")),
      bolster = obb(one("Bolster switch panel"));
    expect(adf.c.x + adf.e[0]).toBeCloseTo(bolster.c.x - bolster.e[0], 3);
    expect(Math.abs(adf.c.z) + adf.e[2]).toBeLessThan(bolster.e[2]);
  });
});

it("the reading lights and their push buttons are drawn static and say so (POH 13772-007 7-59)", () => {
  for (const name of ["Reading light", "Reading light push button"]) {
    const parts = named(name);
    expect(parts.length, name).toBeGreaterThan(0);
    for (const p of parts) {
      // no switch state is modelled, so nothing animates or lights them
      expect(p.anim, name).toBeUndefined();
      expect(p.note, name).toMatch(/Drawn static: the model keeps no reading-light switch state/);
    }
  }
});
