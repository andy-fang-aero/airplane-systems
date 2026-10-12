/**
 * Every SR22T flow starts and ends at what it connects: a part, a junction on another flow, a wing tank, the
 * belly skin, or a control-rig sheave. The FIRST point is checked against the source and the LAST against the destination.
 * Flow ends derive from part anchors exported by the part files, so a part that moves keeps its pipes and wires attached.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "@/lib/math";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { FUSE, wingSec } from "@/aircraft/sr22t/geometry";
import { AC, CAT, TANK_CHORD, TANK_SPAN } from "@/aircraft/sr22t/parts";
import { CYLS, cylOrigin } from "@/aircraft/sr22t/parts/engine";
import { CREW_DISPLAY_VENT } from "@/aircraft/sr22t/parts/environment";
import { AIL_SECTOR, ETT, PULLEYS, RUD_HORN } from "@/aircraft/sr22t/rig";

/** How close (m) a flow end must come to what it connects. */
const TOL = 0.02;
/** Belly skin height at (x, z): the POH 13772-007 Fig 1-1 loft's lower superellipse, not the keel line botY. */
const bellyY = (x: number, z: number) => {
  const { hw, hh, cy, nBot } = FUSE.section(x);
  return cy - hh * Math.pow(1 - Math.pow(Math.abs(z) / hw, nBot), 1 / nBot);
};

type Side = 1 | -1;
/** The rim of a cable sheave or sector at rest: centre, radius, axle axis, and the half-gap between twin sheaves. */
type Rim = { rim: string; c: Vec3; r: number; axis: "x" | "y" | "z"; halfGap?: number };
/**
 * A part by name (with `side` when the name is used on both sides); a junction on another flow (one of its points); the
 * wing tank on side `tank`; the belly skin; a control-rig sheave rim; or a fixed rig attachment point.
 */
type End =
  | string
  | { part: string; side: Side }
  | { flow: string }
  | { tank: Side }
  | { belly: true }
  | Rim
  | { at: string; p: Vec3 };
const both = <T>(f: (s: Side, side: "L" | "R", hand: "LH" | "RH") => [string, T][]) => [
  ...f(-1, "L", "LH"),
  ...f(1, "R", "RH"),
];
const sided = (part: string, side: Side): End => ({ part, side });
const cyl = <T>(f: (n: number) => [string, T][]) => CYLS.flatMap((c) => f(c.n));
const pulley = (k: keyof typeof PULLEYS): Rim => {
  const d = PULLEYS[k];
  return { rim: d.name, c: d.c, r: d.r, axis: d.axis, halfGap: d.double ? (d.gap ?? 0) / 2 : 0 };
};
// the rig sheaves and sectors (parts/controls.ts) at rest
const ELEV_SECTOR: Rim = {
  rim: "Forward elevator sector",
  c: [ETT.c[0], ETT.c[1], ETT.sectorZ],
  r: ETT.sectorR,
  axis: "z",
};
const AIL_CENTRAL: Rim = { rim: "Central aileron pulley sector", c: AIL_SECTOR.c, r: AIL_SECTOR.r, axis: "x" };
const hornTip = (s: Side): End => ({
  at: `rudder cable horn ${s > 0 ? "RH" : "LH"} tip`,
  p: [RUD_HORN.c[0], RUD_HORN.c[1], RUD_HORN.c[2] + s * RUD_HORN.half],
});
const MCU = "Master Control Unit",
  CB = "Circuit breaker panel",
  SELECTOR = "Fuel selector valve",
  SPIDER = "Fuel manifold valve (“spider”)",
  EDP = "Engine-driven fuel pump",
  DRAIN = "Drain manifold",
  THROTTLE = "Throttle body / fuel-metering valve",
  MIX = "Mixing chamber",
  E0 = "Distribution manifold",
  ENGINE = "Continental TSIO-550-K",
  ADAHRS = "GSU 75 ADAHRS 1",
  ADAHRS2 = "GSU 75 ADAHRS 2",
  // the MD302 standby is a screen, on the aft face of the bolster switch panel
  MD302 = "Bolster switch panel",
  LOUVERS_R = sided("Cowl exit louvers", 1);

/** Flow key → [source (first point), destination (last point)]. */
const ENDS: Record<string, [End, End]> = Object.fromEntries<[End, End]>([
  // electrical
  ["alt1", ["ALT 1 — 100 A", MCU]],
  ["alt2", ["ALT 2 — 70 A", MCU]],
  ["bat1", ["BAT 1 — 24 V, 10 Ah", MCU]],
  ["cbMdb1", [MCU, CB]],
  ["cbMdb2", [MCU, CB]],
  ["cbEss", [MCU, CB]],
  // the BAT 2 breaker and ESS BUS 1 are on the circuit breaker panel, not modelled on their own
  ["bat2", ["BAT 2 — 2 × 12 V, 7 Ah", CB]],
  ["starterCable", ["Starter relay", "Starter"]],
  ["landFeed", ["Landing light relay", "Landing light ballast"]],
  ["landLamp", ["Landing light ballast", "Landing light (HID, lower cowl)"]],
  // fuel
  ...both<[End, End]>((s, side) => [
    ["fuel" + side, [{ tank: s }, SELECTOR]],
    ["fuelRet" + side, [EDP, { tank: s }]],
    ["fuelVent" + side, [{ tank: s }, sided("NACA fuel vent", s)]],
    ["collectorVent" + side, [(s > 0 ? "Right" : "Left") + " collector tank / sump", { tank: s }]],
  ]),
  ["fuelMain", [SELECTOR, SPIDER]],
  ...cyl<[End, End]>((n) => [["inj" + n, [SPIDER, "Fuel injector nozzle, cyl " + n]]]),
  ["fuelDrainAux", ["Electric fuel pump", DRAIN]],
  ["fuelDrainGas", ["Gascolator", DRAIN]],
  ["fuelDrainEngine", [EDP, DRAIN]],
  ["fuelDrainSpider", [SPIDER, DRAIN]],
  // the cylinder drains meet at a schematic hose junction, the start of fuelDrainHeads
  ...cyl<[End, End]>((n) => [["fuelDrainCyl" + n, ["Cylinder head " + n, { flow: "fuelDrainHeads" }]]]),
  ["fuelDrainHeads", [{ flow: "fuelDrainCyl1" }, DRAIN]],
  ["fuelDrainOutlet", [DRAIN, "Gascolator drain"]],
  // induction and exhaust
  ...both<[End, End]>((s, side, hand) => [
    ["inlet" + side, [sided("NACA induction duct", s), sided("Air box / induction filter", s)]],
    // the air box clamps onto the turbo's own forward compressor inlet neck (AMM Fig 81-20-1 items 1/3)
    ["intake" + side, [sided("Air box / induction filter", s), sided("Compressor inlet neck", s)]],
    ["compressor" + side, [hand + " turbocharger", THROTTLE]],
    ["altAir" + side, ["Alternate air assembly", sided("Air box / induction filter", s)]],
    ["tailpipe" + side, [sided("Turbine discharge neck", s), sided("Tailpipe", s)]],
    ["turboOil" + side, ["Oil cooler", hand + " turbocharger"]],
    ["turboScav" + side, [hand + " turbo oil reservoir", ENGINE]],
  ]),
  ["manifold", [THROTTLE, "Intake manifold"]],
  // every intake pipe leaves the manifold, cylinder 6's from its forward-most outlet (it sits forward of
  // the manifold, Continental M-18 Fig 5-34)
  ...cyl<[End, End]>((n) => [["man" + n, ["Intake manifold", "Cylinder " + n]]]),
  ...cyl<[End, End]>((n) => [["exh" + n, ["Cylinder head " + n, sided("Turbine housing inlet neck", n % 2 ? 1 : -1)]]]),
  ["crossover", [sided("Turbocharger transition", -1), sided("Turbocharger transition", 1)]],
  ["oil", ["Oil sump", "Propeller governor"]],
  ["gateOil", ["Oil cooler", ENGINE]],
  ["deckRef", ["Upper-deck pressure fitting", "Wastegate controller"]],
  // the wastegate bypass joins the LH tailpipe (parts/engine.ts WASTEGATE, z < 0)
  ["gateBypass", ["Wastegate transition", sided("Tailpipe", -1)]],
  // cabin air
  ["freshIn", ["NACA fresh-air inlet", "Fresh-air valve"]],
  ["fresh", ["Fresh-air valve", MIX]],
  ["hotIn", ["RH intercooler", "Hot-air valve"]],
  ["hot", ["Hot-air valve", MIX]],
  ["hotL", ["LH intercooler", { flow: "hotIn" }]],
  ["hotDump", ["Hot-air valve", LOUVERS_R]],
  ["freshDump", ["Fresh-air valve", LOUVERS_R]],
  ["toMan", [MIX, E0]],
  ["fanDuct", ["Blower fan assembly", E0]],
  ...both<[End, End]>((s, side) => [
    ["panel" + side, [E0, sided("Panel eyeball outlet", s)]],
    ["panel" + side + "2", [E0, sided("Bolster eyeball outlet", s)]],
    ["arm" + side, [E0, sided("Armrest eyeball outlet", s)]],
  ]),
  ["floorF", [E0, sided("Kick-plate floor outlet", -1)]],
  ["floorF2", [E0, sided("Kick-plate floor outlet", 1)]],
  ["floorR", [E0, sided("Foot-warmer diffuser", -1)]],
  ["floorR2", [E0, sided("Foot-warmer diffuser", 1)]],
  ["defrost", [E0, "Windshield diffuser"]],
  // Particle-only air follows the slot; the physical supply terminates beneath its central housing.
  ["defrost2", ["Windshield diffuser", "Windshield diffuser"]],
  // air conditioning
  ["acDischarge", ["A/C compressor", "A/C condenser"]],
  ["acLiquid", ["A/C condenser", "Receiver-drier"]],
  ["acLiquid2", ["Receiver-drier", "Expansion valve"]],
  ["acSuction", ["A/C evaporator", "A/C compressor"]],
  ["acDrain", ["A/C evaporator", { belly: true }]],
  // A/C air path
  ["acCoupler", [{ flow: "toMan" }, "A/C evaporator"]],
  ["acEvapDuct", ["A/C evaporator", E0]],
  ["acRecirc", [{ at: "cabin air under the RH crew seat", p: AC.recircInlet }, "A/C evaporator"]],
  // pitot-static: the tees are junctions between lines
  ["pitot", ["Pitot mast", ADAHRS]],
  ["oatData1", ["OAT sensor 1", ADAHRS]],
  ["oatData2", ["OAT sensor 2", ADAHRS2]],
  ["pitotAdahrs2", [{ flow: "pitot" }, ADAHRS2]],
  ["pitotStby", [{ flow: "pitot" }, MD302]],
  ["static", ["Static port (R)", { flow: "static2" }]],
  ["staticL", ["Static port (L)", { flow: "static2" }]],
  ["static2", [{ flow: "static" }, { flow: "staticAdahrs" }]],
  ["staticAdahrs", [{ flow: "staticAlt" }, ADAHRS]],
  ["staticAdahrs2", [{ flow: "staticAdahrs" }, ADAHRS2]],
  ["staticStby", [{ flow: "staticAdahrs" }, MD302]],
  ["staticAlt", ["Alternate static valve", { flow: "staticAdahrs" }]],
  ["stall", ["Stall warning inlet", "Stall warning pressure switch"]],
  ["stallWire", ["Stall warning lift transducer", "Stall warning computer"]],
  // flaps
  ["flapPush", ["Flap actuator", "Right flap"]],
  ["flapPush2", ["Flap actuator", "Left flap"]],
  // control cables (rig.ts), at rest: each strand leaves a sector or horn and ends on a sheave rim
  ["elA", [ELEV_SECTOR, pulley("ea")]],
  ["elB", [ELEV_SECTOR, pulley("ea")]],
  ["ailR", [AIL_CENTRAL, pulley("awR")]],
  ["ailL", [AIL_CENTRAL, pulley("awL")]],
  // the cross-over cable closes the loop between the two wing actuation sectors
  ["ailBal", [pulley("awR"), pulley("awL")]],
  ["rudR", [hornTip(1), pulley("ra")]],
  ["rudL", [hornTip(-1), pulley("ra")]],
  // avionics data, power and cooling paths
  ["magData2", ["Magnetometer (GMU 44, MAG 2)", ADAHRS2]],
  ["adahrs2Mfd", [ADAHRS2, "MFD bezel"]],
  ["adahrs2Gia1", ["GIA 1 (GIA 63W)", ADAHRS2]],
  ["adahrs2Gia2", [ADAHRS2, "GIA 2 (GIA 63W)"]],
  ["magData", ["Magnetometer (GMU 44, MAG 1)", ADAHRS]],
  ["adahrsPfd", [ADAHRS, "PFD bezel"]],
  ["adahrsGia1", [ADAHRS, "GIA 1 (GIA 63W)"]],
  ["adahrsGia2", ["GIA 2 (GIA 63W)", ADAHRS]],
  ["gia1Pfd", ["GIA 1 (GIA 63W)", "PFD bezel"]],
  ["gia2Mfd", ["GIA 2 (GIA 63W)", "MFD bezel"]],
  ["pfdMfd", ["PFD bezel", "MFD bezel"]],
  ["geaData", ["GEA 71 Engine Airframe Unit", "GIA 1 (GIA 63W)"]],
  ["geaData2", ["GEA 71 Engine Airframe Unit", "GIA 2 (GIA 63W)"]],
  ["xpdrData", ["GTX 335/345 transponder", "GIA 1 (GIA 63W)"]],
  ["audioGia1", ["GMA 350 audio panel", "GIA 1 (GIA 63W)"]],
  ["audioGia2", ["GMA 350 audio panel", "GIA 2 (GIA 63W)"]],
  ["trafficData", ["GTS 800 traffic processor (optional)", "GIA 2 (GIA 63W)"]],
  ["wxData", ["WX-500 processor (optional)", "GIA 2 (GIA 63W)"]],
  ["dmeData", ["KN 63 DME receiver (optional)", "GIA 2 (GIA 63W)"]],
  ["pfdFeedA", [CB, "PFD bezel"]],
  ["pfdFeedB", [CB, "PFD bezel"]],
  ["mfdFeedA", [CB, "MFD bezel"]],
  ["mfdFeedB", [CB, "MFD bezel"]],
  ["iauCool", ["Avionics (IAU) cooling fan", "GIA 1 (GIA 63W)"]],
  // the GIA 2 branch tees off the GIA 1 duct
  ["iauCool2", [{ flow: "iauCool" }, "GIA 2 (GIA 63W)"]],
]);

const v = (p: Vec3 | THREE.Vector3) => (Array.isArray(p) ? new THREE.Vector3(...p) : p.clone());
/** Origin of a part's moving group, at rest. */
const groupOrigin = (parent?: string): Vec3 => {
  if (!parent) return [0, 0, 0];
  const [kind, key] = parent.split(":");
  if (kind === "surf") return CAT.surfacePivot(key);
  if (kind === "cyl") return cylOrigin(CYLS.find((c) => c.n === Number(key))!);
  throw new Error(`no rest origin for parent group "${parent}": add it to groupOrigin`);
};
const boxOf = (p: (typeof CAT.parts)[number]) => {
  const m = new THREE.Mesh(p.geo());
  m.position.set(...(p.pos ?? [0, 0, 0])).add(v(groupOrigin(p.parent)));
  if (p.rot) m.rotation.set(...p.rot);
  if (p.scale) m.scale.set(...p.scale);
  m.updateMatrixWorld();
  const b = new THREE.Box3().setFromObject(m, true);
  m.geometry.dispose();
  return b;
};
const flowOf = (key: string) => {
  const f = FLOWS.find((q) => q.key === key);
  expect(f, key).toBeDefined();
  return f!;
};
/** World boxes of the parts and control surfaces named `name`. */
const boxesNamed = (name: string) => {
  const parts = CAT.parts.filter((q) => q.name === name).map(boxOf);
  // control surfaces at rest: geometry is hinge-relative
  const surfaces = CAT.surfaces
    .filter((q) => q.name === name)
    .map((q) => {
      const g = q.geo();
      g.computeBoundingBox();
      const b = g.boundingBox!.clone().translate(v(q.pivot));
      g.dispose();
      return b;
    });
  return [...parts, ...surfaces];
};
const sideOf = (b: THREE.Box3) => Math.sign(b.getCenter(new THREE.Vector3()).z);
/** Distance in the (x, y) plane from (x, y) to polygon `ring`; 0 inside. */
const toRing = (x: number, y: number, ring: THREE.Vector3[]) => {
  let inside = false,
    d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    const ab = new THREE.Vector2(b.x - a.x, b.y - a.y),
      t = Math.max(0, Math.min(1, ((x - a.x) * ab.x + (y - a.y) * ab.y) / ab.lengthSq()));
    d = Math.min(d, Math.hypot(a.x + t * ab.x - x, a.y + t * ab.y - y));
  }
  return inside ? 0 : d;
};
/**
 * Distance to the wing tank volume on side `s`, as Airplane.tsx TANKS lofts it: the wing section between TANK_CHORD at
 * 0.85 thickness, between the TANK_SPAN fuel ribs. Spanwise excess and the in-section distance combine in 3D.
 */
const toTank = (p: THREE.Vector3, s: Side) => {
  if (Math.sign(p.z) !== s) return Infinity;
  const z = Math.abs(p.z),
    zc = Math.min(Math.max(z, TANK_SPAN[0]), TANK_SPAN[1]);
  return Math.hypot(z - zc, toRing(p.x, p.y, wingSec(s * zc, ...TANK_CHORD, 0.85)));
};
/** Distance to a sheave rim: off the circle in its plane, and off the sheave (or twin-sheave gap) along the axle. */
const toRim = (p: THREE.Vector3, e: Rim) => {
  const d = p.clone().sub(v(e.c)),
    axial = Math.abs(d[e.axis]),
    radial = Math.hypot(...(["x", "y", "z"] as const).filter((a) => a !== e.axis).map((a) => d[a]));
  return Math.hypot(Math.max(0, axial - (e.halfGap ?? 0)), radial - e.r);
};
/** Distance from `p` to `end`; 0 inside a part's box or the tank. */
const distance = (p: THREE.Vector3, end: End): number => {
  if (typeof end === "string") {
    const boxes = boxesNamed(end);
    expect(boxes.length, `a part or surface named "${end}"`).toBeGreaterThan(0);
    // a name used on both sides must say which side, or a flow to the wrong twin would pass
    expect(
      new Set(boxes.map(sideOf).filter((s) => s !== 0)).size,
      `"${end}" is on both sides: give a side`,
    ).toBeLessThan(2);
    return Math.min(...boxes.map((b) => b.distanceToPoint(p)));
  }
  if ("part" in end) {
    const boxes = boxesNamed(end.part).filter((b) => sideOf(b) === end.side);
    expect(boxes.length, `a part named "${end.part}" on side ${end.side}`).toBeGreaterThan(0);
    return Math.min(...boxes.map((b) => b.distanceToPoint(p)));
  }
  if ("flow" in end) return Math.min(...flowOf(end.flow).pts.map((q) => v(q).distanceTo(p)));
  if ("tank" in end) return toTank(p, end.tank);
  if ("belly" in end) return Math.abs(p.y - bellyY(p.x, p.z));
  if ("rim" in end) return toRim(p, end);
  return p.distanceTo(v(end.p));
};
const label = (e: End) =>
  typeof e === "string"
    ? e
    : "part" in e
      ? `${e.part} (side ${e.side})`
      : "flow" in e
        ? `flow ${e.flow}`
        : "tank" in e
          ? `tank ${e.tank}`
          : "belly" in e
            ? "belly skin"
            : "rim" in e
              ? `${e.rim} rim`
              : e.at;
const ends = (key: string) => {
  const pts = flowOf(key).pts;
  return [v(pts[0]), v(pts[pts.length - 1])];
};

describe("SR22T flows connect what they join", () => {
  it("every flow is in the table, and every table entry is a flow", () => {
    const keys = FLOWS.map((f) => f.key);
    expect(
      keys.filter((k) => !(k in ENDS)),
      "flows missing from ENDS",
    ).toEqual([]);
    expect(
      Object.keys(ENDS).filter((k) => !keys.includes(k)),
      "ENDS entries with no flow",
    ).toEqual([]);
  });

  it.each(Object.entries(ENDS))("%s: first point at its source, last point at its destination", (key, [from, to]) => {
    const [first, last] = ends(key);
    expect(distance(first, from), `${key} first point → ${label(from)}`).toBeLessThanOrEqual(TOL);
    expect(distance(last, to), `${key} last point → ${label(to)}`).toBeLessThanOrEqual(TOL);
  });
});

// the oracle itself: each check must reject the disconnection it exists to catch
describe("the flow-end checks catch wrong ends", () => {
  it("a flow ending at the wrong-side twin of a part fails", () => {
    const rh = v(CREW_DISPLAY_VENT(1));
    expect(distance(rh, sided("Panel eyeball outlet", 1))).toBe(0);
    expect(distance(rh, sided("Panel eyeball outlet", -1))).toBeGreaterThan(TOL);
  });
  it("a two-sided part name without a side is rejected", () => {
    expect(() => distance(v(CREW_DISPLAY_VENT(1)), "Panel eyeball outlet")).toThrow(/on both sides/);
  });
  it("a reversed flow fails: the first point is checked against the source only", () => {
    const [first, last] = ends("bat2");
    const [from, to] = ENDS.bat2;
    expect(distance(last, from), "bat2 last point → source").toBeGreaterThan(TOL);
    expect(distance(first, to), "bat2 first point → destination").toBeGreaterThan(TOL);
  });
  // the tank is about 0.17 m deep at the root, so the step is well beyond it either way
  it("a tank end displaced vertically fails", () => {
    const [first] = ends("fuelR");
    expect(distance(first, { tank: 1 })).toBeLessThanOrEqual(TOL);
    expect(distance(first.clone().add(new THREE.Vector3(0, 0.2, 0)), { tank: 1 })).toBeGreaterThan(TOL);
    expect(distance(first.clone().add(new THREE.Vector3(0, -0.2, 0)), { tank: 1 })).toBeGreaterThan(TOL);
  });
  it("a cable end off its sheave fails", () => {
    const [, last] = ends("elA");
    expect(distance(last, pulley("ea"))).toBeLessThanOrEqual(TOL);
    // at the sheave's centre, and beside the sheave along its axle
    expect(distance(v(PULLEYS.ea.c), pulley("ea"))).toBeGreaterThan(TOL);
    expect(distance(last.clone().add(new THREE.Vector3(0, 0, 0.05)), pulley("ea"))).toBeGreaterThan(TOL);
  });
});
