/** SR22T air conditioning hardware: POH 13772-007 7-61 – 7-66, Fig 7-14; AMM 13773-002 Rev 7 21-50. */
import * as THREE from "three";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cabinAirColor, FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { AB, botY, FUSE, FW, inFus } from "@/aircraft/sr22t/geometry";
import { acCompressorOn, initialSim, solve, type Sim } from "@/aircraft/sr22t/model";
import { CAT, CYLS, cabinAirControlPowered, hotValveOpen, type PartSpec, valveEnv } from "@/aircraft/sr22t/parts";
import { AC_COMPRESSOR_LEN, AC_COMPRESSOR_R, AC_FITTING } from "@/aircraft/sr22t/parts/aircon";
import { cylOrigin } from "@/aircraft/sr22t/parts/engine";
import type { Vec3 } from "@/lib/math";
import { Environment } from "@/aircraft/sr22t/panels/air";
import { useSR22T } from "@/aircraft/sr22t/store";
import * as sr22tStore from "@/aircraft/sr22t/store";
import { animatePart } from "@/lib/anims";
import { mats } from "@/lib/materials";
import { useView } from "@/lib/view";

const only = (name: string) => {
  const found = CAT.parts.filter((p) => p.name === name);
  expect(found, name).toHaveLength(1);
  return found[0];
};
/** World-space box of a part (pos and rot; none of these parts has a parent). */
const bounds = (p: PartSpec) => {
  const m = new THREE.Mesh(p.geo());
  if (p.pos) m.position.set(...p.pos);
  if (p.rot) m.rotation.set(...p.rot);
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m);
  m.geometry.dispose();
  return b;
};
const flow = (key: string) => FLOWS.find((f) => f.key === key)!;
const pt = (v: THREE.Vector3 | [number, number, number]) => (v instanceof THREE.Vector3 ? v : new THREE.Vector3(...v));
const ends = (key: string) => {
  const pts = flow(key).pts;
  return [pt(pts[0]), pt(pts[pts.length - 1])];
};
const at = (name: string) => new THREE.Vector3(...only(name).pos!);

it("A/C refrigerant runs compressor → condenser → receiver-drier → expansion valve → evaporator (POH 7-65)", () => {
  const order: [string, string, string][] = [
    ["acDischarge", "A/C compressor", "A/C condenser"],
    ["acLiquid", "A/C condenser", "Receiver-drier"],
    ["acLiquid2", "Receiver-drier", "Expansion valve"],
    ["acSuction", "A/C evaporator", "A/C compressor"],
  ];
  // the compressor hoses start and end on its head fittings (AMM Fig 21-50-1 sheet 2 PDF p. 520), on the part itself
  const head = { acDischarge: AC_FITTING.discharge, acSuction: AC_FITTING.suction } as Record<string, Vec3>;
  const anchor = (key: string, name: string) => (name === "A/C compressor" ? pt(head[key]) : at(name));
  for (const [key, from, to] of order) {
    const [a, b] = ends(key);
    expect(a.distanceTo(anchor(key, from)), `${key} starts at the ${from}`).toBeLessThan(1e-9);
    expect(b.distanceTo(anchor(key, to)), `${key} ends at the ${to}`).toBeLessThan(1e-9);
  }
  for (const fitting of Object.values(head))
    expect(bounds(only("A/C compressor")).containsPoint(pt(fitting))).toBe(true);
  // the expansion valve is integral to the evaporator assembly (AMM 21-50 PDF p. 496), so no line joins them
  expect(bounds(only("Expansion valve")).intersectsBox(bounds(only("A/C evaporator")).expandByScalar(0.005))).toBe(
    true,
  );
  // the receiver-drier is clamped to the condenser (AMM 21-50 PDF p. 508)
  expect(bounds(only("Receiver-drier")).intersectsBox(bounds(only("A/C condenser")).expandByScalar(0.005))).toBe(true);
});

describe("the A/C compressor and refrigerant loop need the engine and the A/C COMPR feed (POH 7-61)", () => {
  const LOOP = ["acDischarge", "acLiquid", "acLiquid2", "acSuction", "acDrain"];
  const saved = useSR22T.getState();
  const savedSys = useView.getState().sys;
  afterEach(() => {
    useSR22T.setState({ s: saved.s, E: saved.E });
    useView.setState({ sys: savedSys });
  });
  const acOn = (patch: (s: Sim) => void) => {
    const s = structuredClone(initialSim);
    s.env.fan = 1;
    s.env.ac = true;
    patch(s);
    return s;
  };
  /** The compressor's material in the Environmental view: lit (`hi`) only while it runs. */
  const glowing = (s: Sim) => {
    useSR22T.setState({ s, E: solve(s) });
    useView.setState({ sys: "environment" });
    const comp = only("A/C compressor"),
      m = new THREE.Mesh();
    comp.anim!(m, 0);
    return m.material === mats("#6EC9E6").hi;
  };
  const rates = (s: Sim) => {
    const R = flowRates(s, solve(s));
    return LOOP.map((k) => R[k]);
  };

  it("engine stopped: refrigerant rates 0 and the compressor still", () => {
    const s = acOn((d) => (d.eng.running = false));
    expect(acCompressorOn(s, solve(s))).toBe(false);
    expect(rates(s)).toEqual([0, 0, 0, 0, 0]);
    expect(glowing(s)).toBe(false);
  });
  it("engine running, A/C BUS 2 up and A/C COMPR in: refrigerant moving and the compressor running", () => {
    const s = acOn((d) => (d.eng.running = true));
    const E = solve(s);
    expect(E.ac2).toBeGreaterThan(0);
    expect(E.acComprPwr).toBe(true);
    expect(acCompressorOn(s, E)).toBe(true);
    for (const r of rates(s)) expect(r).toBeGreaterThan(0);
    expect(glowing(s)).toBe(true);
  });
  it("A/C COMPR breaker pulled: rates 0", () => {
    const s = acOn((d) => {
      d.eng.running = true;
      d.cb["A/C COMPR"] = true;
    });
    expect(solve(s).acComprPwr).toBe(false);
    expect(rates(s)).toEqual([0, 0, 0, 0, 0]);
    expect(glowing(s)).toBe(false);
  });
  it("A/C BUS 2 unpowered (Main Dist Bus 1 dead): rates 0", () => {
    // BAT 1 off takes ALT 1's field with it, so only ALT 2 is left and it cannot feed MDB 1 (POH 7-47 – 7-50)
    const s = acOn((d) => {
      d.eng.running = true;
      d.elec.bat1 = false;
    });
    const E = solve(s);
    expect(E.mdb1).toBe(0);
    expect(E.ac2).toBe(0);
    expect(E.acComprPwr).toBe(false);
    expect(rates(s)).toEqual([0, 0, 0, 0, 0]);
    expect(glowing(s)).toBe(false);
  });
  it("A/C off: no refrigerant flow even with the engine running", () => {
    const s = acOn((d) => {
      d.eng.running = true;
      d.env.ac = false;
    });
    expect(rates(s)).toEqual([0, 0, 0, 0, 0]);
    expect(glowing(s)).toBe(false);
  });
});

it("evaporator under the front passenger seat, condenser under the baggage floor (POH 7-64; AMM 21-50 PDF 496)", () => {
  const seat = bounds(CAT.parts.find((p) => p.name === "Front passenger seat")!);
  const evap = bounds(only("A/C evaporator"));
  expect(only("A/C evaporator").pos![2]).toBeGreaterThan(0);
  expect(evap.max.y).toBeLessThan(seat.min.y);
  const c = evap.getCenter(new THREE.Vector3());
  expect(c.x).toBeGreaterThan(seat.min.x);
  expect(c.x).toBeLessThan(seat.max.x);
  expect(c.z).toBeGreaterThan(seat.min.z);
  expect(c.z).toBeLessThan(seat.max.z);

  // rear seats: cushion (first part of each name) and back; the condenser is aft of both and forward of AB (FS 222)
  const rear = CAT.parts.filter((p) => p.name === "Rear seat" || p.name === "Rear seat (2+1 bench)").map(bounds);
  const cond = bounds(only("A/C condenser"));
  expect(cond.max.x).toBeLessThan(Math.min(...rear.map((b) => b.min.x)));
  expect(cond.min.x).toBeGreaterThan(AB);
  // below the floor the seat cushions sit on, and inside the skin
  expect(cond.max.y).toBeLessThan(Math.min(...rear.map((b) => b.min.y)));
  expect(cond.min.y).toBeGreaterThan(botY(-0.25));
  for (const name of ["A/C condenser", "Receiver-drier", "Condenser blower", "A/C evaporator", "Expansion valve"])
    expect(inFus(at(name)), name).toBe(true);
});

it("the condenser does not intersect the marker beacon antenna (POH 7-89)", () => {
  const marker = bounds(only("Marker beacon antenna"));
  for (const name of ["A/C condenser", "Receiver-drier", "Condenser blower"])
    expect(bounds(only(name)).intersectsBox(marker), name).toBe(false);
});

it("no A/C part sits inside the spar, wing attach fittings, pitch servo, static water trap or marker antenna", () => {
  const ac = [
    "A/C compressor",
    "A/C evaporator",
    "Expansion valve",
    "Recirculation check valve",
    "A/C condenser",
    "Receiver-drier",
    "Condenser blower",
  ];
  const near = [
    "Main spar",
    "Wing attach point",
    "Pitch servo actuator (GSA 81)",
    "Static water trap",
    "Marker beacon antenna",
  ];
  for (const n of near) {
    const solids = CAT.parts.filter((p) => p.name === n);
    expect(solids.length, n).toBeGreaterThan(0);
    for (const s of solids)
      for (const name of ac) expect(bounds(only(name)).intersectsBox(bounds(s)), `${name} × ${n}`).toBe(false);
  }
});

it("the compressor sits at the aft (accessory) end, upper left, outboard of the left magneto and over the oil cooler (AMM Fig 71-00-2 sheets 1–2 PDF pp. 2487–2488 item 2; Fig 71-00-1 sheet 2 PDF p. 2484)", () => {
  const comp = only("A/C compressor");
  expect(comp.sys).toEqual(["environment", "engine"]);
  const c = bounds(comp);
  // aft: forward of the firewall, aft of every cylinder; position detail in sr22t-accessory-case.test.ts
  expect(c.min.x).toBeGreaterThan(FW);
  const cylinders = CYLS.map((cy) => {
    const p = CAT.parts.find((q) => q.name === `Cylinder ${cy.n}` && q.parent === `cyl:${cy.n}`)!;
    return bounds(p).translate(new THREE.Vector3(...cylOrigin(cy)));
  });
  expect(cylinders).toHaveLength(6);
  for (const b of cylinders) expect(Math.max(c.min.x, comp.pos![0])).toBeLessThan(b.min.x);
  // upper left: the compressor body is outboard of the left magneto and above the oil cooler
  expect(c.max.z).toBeLessThan(0);
  const body = new THREE.Vector3(...comp.pos!);
  expect(body.z).toBeLessThan(bounds(only("Left magneto")).min.z);
  expect(body.y).toBeGreaterThan(bounds(only("Oil cooler")).max.y);
  // the compressor body's own box (the assembly's box also spans the drive unit); exact 5 mm clearances of the whole
  // assembly, the left magneto beside it and the oil filler access door above included, are in
  // sr22t-flow-clearance.test.ts
  const half = new THREE.Vector3(AC_COMPRESSOR_LEN / 2, AC_COMPRESSOR_R, AC_COMPRESSOR_R);
  const bodyBox = new THREE.Box3(body.clone().sub(half), body.clone().add(half));
  for (const name of ["Oil cooler", "Oil filler cap / dipstick"])
    expect(bodyBox.intersectsBox(bounds(only(name))), name).toBe(false);
});

it("each compressor hose leaves the compressor forward of the firewall and crosses it once (AMM 21-50 PDF pp. 499, 501)", () => {
  for (const key of ["acDischarge", "acSuction"]) {
    const xs = flow(key).pts.map((p) => pt(p).x);
    const crossings = xs.slice(1).filter((x, i) => x - FW < 0 !== xs[i] - FW < 0).length;
    expect(crossings, key).toBe(1);
  }
  // the compressor end is forward of the firewall, the cabin end aft of it
  expect(ends("acDischarge")[0].x).toBeGreaterThan(FW);
  expect(ends("acSuction")[1].x).toBeGreaterThan(FW);
});

/** Belly skin height at (x, z): the POH 13772-007 Fig 1-1 loft's lower superellipse, not the keel line botY. */
const bellyY = (x: number, z: number) => {
  const { hw, hh, cy, nBot } = FUSE.section(x);
  return cy - hh * Math.pow(1 - Math.pow(Math.abs(z) / hw, nBot), 1 / nBot);
};

it("condensate drains overboard through the belly (POH 7-65)", () => {
  const [a, b] = ends("acDrain");
  expect(a.distanceTo(at("A/C evaporator"))).toBeLessThan(1e-9);
  // It ends on the inner face of the curved belly at its own z: inside the skin, within 10 mm of it.
  expect(inFus(b)).toBe(true);
  expect(b.y - bellyY(b.x, b.z)).toBeLessThan(0.01);
  expect(b.y).toBeLessThan(bounds(only("A/C evaporator")).min.y);
});

it("the recirculation check valve opens only in recirculation (POH 7-65, 7-66)", () => {
  const saved = useSR22T.getState().s;
  const valve = only("Recirculation check valve"),
    m = new THREE.Mesh();
  try {
    useSR22T.setState({ s: { ...saved, env: { ...saved.env, ac: true, recirc: false } } });
    valve.anim!(m, 0);
    expect(m.rotation.z).toBe(0);
    useSR22T.setState({ s: { ...saved, env: { ...saved.env, ac: true, recirc: true } } });
    valve.anim!(m, 0);
    expect(m.rotation.z).not.toBe(0);
  } finally {
    useSR22T.setState({ s: saved });
  }
});

describe("with CABIN AIR CONTROL unpowered the A/C holds its last powered selections", () => {
  const saved = useSR22T.getState();
  const savedSys = useView.getState().sys;
  afterEach(() => {
    useSR22T.setState({ s: saved.s, E: saved.E });
    useView.setState({ sys: savedSys });
  });
  const sim = (patch: (s: Sim) => void) => {
    const s = structuredClone(initialSim);
    s.eng.running = true;
    s.env.fan = 1;
    s.env.ac = true;
    s.env.recirc = false;
    patch(s);
    return s;
  };
  const pull = (s: Sim, env: Partial<Sim["env"]>) => {
    const p = structuredClone(s);
    p.cb["CABIN AIR CONTROL"] = true;
    Object.assign(p.env, env);
    return p;
  };
  /** Shows `s` in the store (which also updates the panel's held selections) and returns the part's animated mesh. */
  const show = (name: string, s: Sim) => {
    const E = solve(s, useSR22T.getState().E);
    useSR22T.setState({ s, E });
    useView.setState({ sys: "environment" });
    const m = new THREE.Mesh();
    only(name).anim!(m, 0);
    return m;
  };
  const valveAngle = (s: Sim) => show("Recirculation check valve", s).rotation.z;
  const compressorLit = (s: Sim) => show("A/C compressor", s).material === mats("#6EC9E6").hi;

  it("the recirculation check valve holds when RECIRC changes with the breaker pulled (POH 7-61, 7-65)", () => {
    const shut = sim(() => {});
    expect(cabinAirControlPowered(shut, solve(shut))).toBe(true);
    expect(valveAngle(shut)).toBe(0);
    const pulled = pull(shut, { recirc: true });
    expect(cabinAirControlPowered(pulled, solve(pulled))).toBe(false);
    expect(valveAngle(pulled)).toBe(0);
    // and the other way round: open in recirculation, still open after RECIRC is deselected unpowered
    const open = sim((d) => (d.env.recirc = true));
    expect(valveAngle(open)).not.toBe(0);
    expect(valveAngle(pull(open, { recirc: false }))).not.toBe(0);
    // breaker back in: the valve follows the selector again
    const restored = pull(open, { recirc: false });
    restored.cb["CABIN AIR CONTROL"] = false;
    expect(valveAngle(restored)).toBe(0);
  });

  it("the A/C command latches with the panel, so the compressor and the hot-air valve agree (A/C latch lead ruling, POH silent)", () => {
    const on = sim(() => {});
    const R0 = flowRates(on, solve(on));
    expect(R0.acDischarge).toBeGreaterThan(0);
    expect(compressorLit(on)).toBe(true);
    // breaker pulled, then A/C deselected: the held command keeps the compressor running and the hot-air valve shut
    const pulled = pull(on, { ac: false });
    const E = solve(pulled, solve(on));
    expect(valveEnv(pulled, E).ac).toBe(true);
    expect(acCompressorOn(pulled, E, valveEnv(pulled, E))).toBe(true);
    expect(hotValveOpen(valveEnv(pulled, E))).toBe(0);
    expect(flowRates(pulled, E).acDischarge).toBe(R0.acDischarge);
    expect(compressorLit(pulled)).toBe(true);
    // A/C off when the breaker was pulled: selecting it unpowered does not start the compressor
    const off = sim((d) => (d.env.ac = false));
    expect(flowRates(off, solve(off)).acDischarge).toBe(0);
    expect(compressorLit(off)).toBe(false);
    const late = pull(off, { ac: true });
    expect(flowRates(late, solve(late, solve(off))).acDischarge).toBe(0);
    expect(compressorLit(late)).toBe(false);
    // breaker back in: the live selection governs again
    const restored = structuredClone(late);
    restored.cb["CABIN AIR CONTROL"] = false;
    expect(flowRates(restored, solve(restored)).acDischarge).toBeGreaterThan(0);
  });
});

describe("A/C colour and condenser blower follow their powered running states (POH 13772-007 7-61)", () => {
  const saved = useSR22T.getState();
  const savedSys = useView.getState().sys;
  afterEach(() => {
    vi.restoreAllMocks();
    useSR22T.setState({ s: saved.s, E: saved.E });
    useView.setState({ sys: savedSys });
  });
  const running = () => {
    const s = structuredClone(initialSim);
    s.eng.running = true;
    s.env = { fan: 2, ac: true, recirc: false, temp: 0.8, vent: "PF" };
    return s;
  };
  const show = (s: Sim) => {
    const E = solve(s, useSR22T.getState().E);
    useSR22T.setState({ s, E });
    useView.setState({ sys: "environment" });
    const colour = cabinAirColor(s, E, new THREE.Color());
    const mesh = new THREE.Mesh();
    only("Condenser blower").anim!(mesh, 0);
    return { E, colour, lit: mesh.material === mats("#6EC9E6").hi };
  };
  const blend = (temp: number) => new THREE.Color("#5FC8F0").lerp(new THREE.Color("#FF7A3D"), temp);

  it.each([
    [
      "engine stopped",
      (s: Sim) => {
        s.eng.running = false;
      },
      0,
    ],
    [
      "A/C COMPR pulled",
      (s: Sim) => {
        s.cb["A/C COMPR"] = true;
      },
      0,
    ],
    [
      "both A/C buses dead",
      (s: Sim) => {
        // BAT 1 and ALT 1 off: no MDB 1 source (an online alternator stays self-excited, POH 7-47)
        s.elec.bat1 = false;
        s.elec.alt1 = false;
      },
      0,
    ],
    [
      "A/C deselected",
      (s: Sim) => {
        s.env.ac = false;
      },
      0.9,
    ],
  ])("%s: no compressor cooling; heating follows the hot-air valve (POH 7-66)", (_name, patch, heat) => {
    const s = running();
    s.env.temp = 0.9; // high heat demand must not paint air heated while the snowflake closes the hot-air valve
    patch(s);
    const result = show(s);
    expect(result.colour.equals(blend(heat))).toBe(true);
    expect(result.lit).toBe(false);
  });

  it.each([false, true])("held A/C suppresses heating after compressor power loss, RECIRC=%s (POH 7-66)", (recirc) => {
    const powered = running();
    powered.env.temp = 0.9;
    powered.env.recirc = recirc;
    expect(show(powered).colour.equals(new THREE.Color("#6EC9E6"))).toBe(true);
    const failed = structuredClone(powered);
    failed.cb["CABIN AIR CONTROL"] = true;
    failed.cb["A/C COMPR"] = true;
    failed.env.ac = false;
    failed.env.temp = 1;
    const result = show(failed);
    expect(valveEnv(failed, result.E).ac).toBe(true);
    expect(hotValveOpen(valveEnv(failed, result.E))).toBe(0);
    expect(result.colour.equals(new THREE.Color("#5FC8F0"))).toBe(true);
    expect(result.lit).toBe(false);
  });

  it("A/C COND is on A/C BUS 1; pulling it stops the blower cue independently of the compressor", () => {
    const s = running();
    const on = show(s);
    expect(on.E.ac1).toBeGreaterThan(0);
    expect(on.E.acCondPwr).toBe(true);
    expect(on.lit).toBe(true);
    expect(on.colour.equals(new THREE.Color("#6EC9E6"))).toBe(true);
    s.cb["A/C COND"] = true;
    const pulled = show(s);
    expect(pulled.E.acCondPwr).toBe(false);
    expect(pulled.E.acComprPwr).toBe(true);
    expect(pulled.lit).toBe(false);
    expect(pulled.colour.equals(on.colour)).toBe(true);
    s.cb["A/C COND"] = false;
    expect(show(s).lit).toBe(true);
  });

  it("dead A/C BUS 1 removes condenser power (POH 7-61)", () => {
    const s = running();
    // BAT 1 and ALT 1 off: no MDB 1 source (an online alternator stays self-excited, POH 7-47)
    s.elec.bat1 = false;
    s.elec.alt1 = false;
    const result = show(s);
    expect(result.E.ac1).toBe(0);
    expect(result.E.acCondPwr).toBe(false);
    expect(result.lit).toBe(false);
  });

  it("the blower dims outside Environmental and Overview", () => {
    show(running());
    const blower = only("Condenser blower"),
      mesh = new THREE.Mesh();
    // Part owns dimming (lib/anims.ts animatePart): outside its systems the X-ray material is the dimmed colour.
    useView.setState({ sys: "fuel", xray: true });
    const dim = { material: mats("#5A6A74").dim, active: false, focused: false, ghost: false };
    animatePart(mesh, 0, blower, dim);
    expect(mesh.material).toBe(mats("#5A6A74").dim);
    useView.setState({ sys: "environment" });
    animatePart(mesh, 0, blower, { ...dim, material: mats("#5A6A74").on, active: true });
    expect(mesh.material).toBe(mats("#6EC9E6").hi);
  });

  it.each([true, false])(
    "held A/C=%s keeps colour, blower and valve readout consistent (A/C latch lead ruling, POH silent)",
    (ac) => {
      // Server rendering must read the same current store snapshot as the live client panel.
      const actual = useSR22T;
      vi.spyOn(sr22tStore, "useSR22T").mockImplementation(
        Object.assign(
          ((selector: (state: ReturnType<typeof actual.getState>) => unknown) =>
            selector(actual.getState())) as typeof useSR22T,
          actual,
        ),
      );
      const powered = running();
      powered.env.ac = ac;
      const before = show(powered);
      const beforeHtml = renderToStaticMarkup(createElement(Environment));
      const pulled = structuredClone(powered);
      pulled.cb["CABIN AIR CONTROL"] = true;
      pulled.env.ac = !ac;
      pulled.env.temp = 0.1;
      const after = show(pulled);
      expect(after.colour.equals(before.colour)).toBe(true);
      expect(after.lit).toBe(before.lit);
      const readout = (html: string) => html.match(/Hot-air valve<\/span><b[^>]*>([^<]+)<\/b>/)?.[1];
      expect(readout(beforeHtml)).toBe(ac ? "Closed" : "80%");
      expect(readout(renderToStaticMarkup(createElement(Environment)))).toBe(readout(beforeHtml));
      pulled.cb["CABIN AIR CONTROL"] = false;
      const restored = show(pulled);
      expect(restored.lit).toBe(!ac);
      expect(restored.colour.equals(ac ? blend(0.1) : new THREE.Color("#6EC9E6"))).toBe(true);
      expect(readout(renderToStaticMarkup(createElement(Environment)))).toBe(ac ? "10%" : "Closed");
    },
  );
});

it("condenser blower note cites the confirmed operator fallback when AMM 21-50 is silent", () => {
  const note = only("Condenser blower").note;
  expect(note).toContain("modelling assumption, 2026-10-08");
  expect(note).toContain("AMM 21-50 General p. 1, PDF p. 496");
  expect(note).toContain("does not specify blower run logic");
  expect(note).not.toContain("lead ruling");
  expect(note).not.toContain("pending operator review");
});

it("OFF readouts follow inlet valves and close only airflow (POH 7-62–7-66; AMM 21-60; 7waz N1)", () => {
  const saved = useSR22T.getState();
  const actual = useSR22T;
  vi.spyOn(sr22tStore, "useSR22T").mockImplementation(
    Object.assign(
      ((selector: (state: typeof saved) => unknown) => selector(actual.getState())) as typeof useSR22T,
      actual,
    ),
  );
  try {
    for (const temp of [0, 0.35, 1]) {
      const s = structuredClone(initialSim);
      s.env = { ...s.env, fan: -1, ac: false, recirc: false, temp };
      useSR22T.setState({ s, E: solve(s) });
      const html = renderToStaticMarkup(createElement(Environment));
      const row = (name: string) => html.match(new RegExp(name + "</span><b[^>]*>([^<]+)</b>"))?.[1];
      expect(row("Airflow valve")).toBe("Closed");
      expect(row("Hot-air valve")).toBe(temp === 0 ? "Closed" : Math.round(temp * 100) + "%");
      expect(row("Fresh-air valve")).toBe(temp === 1 ? "Closed" : Math.round((1 - temp) * 100) + "%");
    }
  } finally {
    vi.restoreAllMocks();
    useSR22T.setState(saved);
  }
});

it("store updates latch ECS without rendering; readers cannot change another solution (7waz N2, POH silent)", () => {
  const saved = useSR22T.getState();
  try {
    const s = structuredClone(initialSim);
    s.env = { fan: 2, temp: 0.8, vent: "PF", ac: true, recirc: true };
    useSR22T.setState({ s, E: solve(s) });
    useSR22T.getState().update((d) => {
      d.cb["CABIN AIR CONTROL"] = true;
    });
    useSR22T.getState().update((d) => {
      d.env = { fan: -1, temp: 0, vent: "W", ac: false, recirc: false };
    });
    const held = useSR22T.getState();
    expect(valveEnv(held.s, held.E)).toEqual(s.env);
    const other = structuredClone(initialSim);
    other.env.temp = 0.2;
    valveEnv(other, solve(other));
    expect(valveEnv(held.s, held.E)).toEqual(s.env);
    expect(solve(held.s, held.E).envHeld).toEqual(s.env);
    useSR22T.getState().update((d) => {
      d.cb["CABIN AIR CONTROL"] = false;
    });
    expect(useSR22T.getState().E.envHeld).toEqual(held.s.env);
  } finally {
    useSR22T.setState(saved);
  }
});
