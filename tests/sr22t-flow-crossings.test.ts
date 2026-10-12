// The planted-block case is the ratchet's negative control and checks the oracle, not aircraft geometry; the FIXED and ledger cases fail on base.
/**
 * Schematic flow tubes no longer run through the cabin, wing, tail, avionics, fuel-tank, gear,
 * CAPS and ice-protection hardware they were re-routed around, and no flow gains a new non-engine crossing (ledger in
 * sr22t-flow-crossings-ledger.ts). The engine-side ledger also covers the cylinders at rest (phase 2).
 */
import { expect, it } from "vitest";
import { Box3, BoxGeometry, Euler, Matrix4, Quaternion, Triangle, Vector3 } from "three";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { FW } from "@/aircraft/sr22t/geometry";
import { CAT, CYLS } from "@/aircraft/sr22t/parts";
import { tris, type Tri } from "./mesh-clearance";
import { insideSolid } from "./winding-number";
import { faceCandidates } from "./helpers/faceCandidates";
import { CROSSINGS, ENGINE_CROSSINGS } from "./sr22t-flow-crossings-ledger";
import { cylOrigin } from "@/aircraft/sr22t/parts/engine";

/** Flow → solids it crossed on main before the re-routes; each must stay clear. */
const FIXED: Record<string, string[]> = {
  armL: ["Brake bulkhead fitting", "Brake line (L)", "Brake valve line (L)", "Composite roll cage", "Filter assembly"],
  armR: ["Brake bulkhead fitting", "Brake line (R)", "Brake valve line (R)", "Composite roll cage"],
  bat2: ["A/C condenser", "Condenser blower"],
  defrost: ["GSU 75 ADAHRS 2"],
  floorF: ["Avionics (IAU) cooling fan"],
  fuelL: ["GTS 800 traffic processor (optional)", "Pilot seat"],
  fuelMain: ["Brake tee fitting"],
  fuelR: ["A/C evaporator", "Blower fan assembly", "Front passenger seat"],
  fuelRetL: ["Front passenger seat", "In-line strainer", "Passenger audio jacks (if equipped)", "Pilot seat"],
  fuelRetR: ["Front passenger seat", "Passenger audio jacks (if equipped)"],
  fuelVentR: ["MAG 1 wiring", "Magnetometer (GMU 44, MAG 1)", "Magnetometer (GMU 44, MAG 2)"],
  pitot: [
    "Forward proportioning unit",
    "Left collector tank / sump",
    "Main gear upper attach fitting",
    "Rudder-aileron interconnect",
  ],
  stall: ["A/C evaporator", "Blower fan assembly", "Right collector tank / sump"],
  stallWire: ["Gear lateral rib", "Right collector tank / sump"],
  static: ["CAPS canister"],
  static2: ["A/C condenser", "Condenser blower", "Rudder/elevator pulley gang bracket"],
};

type Solid = { name: string; mesh: Tri[]; faces: Triangle[]; box: Box3 };
// The non-engine audit retains its fixed-airframe scope; the engine complement additionally places the cylinder
// groups at their rest origins. Other moving groups (doors, propeller, controls and gear) stay outside this audit.
const placedSolid = (p: (typeof CAT.parts)[number]): Solid => {
  const g = p.geo();
  const m = new Matrix4().compose(
    toV(p.pos ?? [0, 0, 0]),
    new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
    toV(p.scale ?? [1, 1, 1]),
  );
  if (p.parent) {
    const c = CYLS.find((c) => p.parent === `cyl:${c.n}`);
    if (!c) throw new Error(`Unknown cylinder group ${p.parent}`);
    m.premultiply(new Matrix4().makeTranslation(...cylOrigin(c)));
  }
  const mesh = tris(g, m);
  g.dispose();
  return {
    name: p.name ?? p.id,
    mesh,
    faces: mesh.map(([a, b, c]) => new Triangle(a, b, c)),
    box: new Box3().setFromPoints(mesh.flat()),
  };
};
const SOLIDS = CAT.parts.filter((p) => !p.parent).map(placedSolid);
const ENGINE_SOLIDS = [...SOLIDS, ...CAT.parts.filter((p) => p.parent?.startsWith("cyl:")).map(placedSolid)];

type Run = { depth: number; at: Vector3; terminal: boolean; solid: string };
type Flow = (typeof FLOWS)[number];
const samples = new WeakMap<Flow, Vector3[]>();
const candidateFaces = new WeakMap<Solid, { triangle: Triangle; box: Box3 }[]>();
// Host-free runs per flow and solid: the audits and pins share SOLIDS, so each pair is measured once per file.
const runCache = new WeakMap<Flow, WeakMap<Solid, Run[]>>();
/** Runs where the rendered tube surface enters a solid, with the deepest penetration in m, on the Flows.tsx curve and
 * radius. Inside/outside is the generalized winding number, sound for open tubes, merged components and shared faces. */
const crossings = (f: Flow, solids: Solid[], inlineHost?: Box3) => {
  const r = f.r ?? 0.012;
  let pts = samples.get(f);
  if (!pts) {
    const curve = curveOf(f.pts, f.tension ?? 0.3);
    samples.set(f, (pts = curve.getSpacedPoints(Math.max(200, Math.round(curve.getLength() * 400)))));
  }
  const n = pts.length - 1;
  const q = new Vector3();
  const reach = new Box3();
  let cached = runCache.get(f);
  if (!cached) runCache.set(f, (cached = new WeakMap()));
  return solids.flatMap((s) => {
    const hit = inlineHost ? undefined : cached.get(s);
    if (hit) return hit;
    const near = s.box.clone().expandByScalar(r);
    let faces = candidateFaces.get(s);
    if (!faces)
      candidateFaces.set(
        s,
        (faces = s.faces.map((triangle) => ({
          triangle,
          box: new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]),
        }))),
      );
    // contiguous runs of penetrating samples; a run touching either end is the flow's own terminal host
    const runs: { depth: number; at: Vector3; terminal: boolean }[] = [];
    let run: (typeof runs)[number] | undefined;
    pts.forEach((p, i) => {
      let depth = -Infinity;
      if (near.containsPoint(p) && !inlineHost?.containsPoint(p)) {
        let d = Infinity;
        if (insideSolid(p, s.mesh)) {
          for (const t of s.faces) d = Math.min(d, t.closestPointToPoint(p, q).distanceTo(p));
          depth = d + r;
        } else {
          // Outside, only a face nearer than r makes the depth positive, and that face's box meets the r-cube about p.
          reach.min.copy(p).subScalar(r);
          reach.max.copy(p).addScalar(r);
          for (const { triangle: t } of faceCandidates(faces, reach))
            d = Math.min(d, t.closestPointToPoint(p, q).distanceTo(p));
          depth = r - d;
        }
      }
      if (depth > 0) {
        if (!run) runs.push((run = { depth, at: p, terminal: i === 0 }));
        if (depth > run.depth) Object.assign(run, { depth, at: p });
        if (i === n) run.terminal = true;
      } else run = undefined;
    });
    const found = runs.map((x) => ({ ...x, solid: s.name }));
    if (!inlineHost) cached.set(s, found);
    return found;
  });
};

/** Ledger key → deepest penetration (mm) of every mid-route crossing deeper than 1 mm whose deepest point lies more than
 * 5 mm aft of the firewall, so firewall pass-throughs never flip at the boundary. Contacts at a flow's own end fittings
 * are hosts and are not counted. */
const audit = (solids: Solid[], engine = false) => {
  const found = new Map<string, number>();
  for (const f of FLOWS.filter((f) => f.tube !== false))
    for (const c of crossings(f, solids))
      if (!c.terminal && (engine ? c.at.x >= FW - 0.005 : c.at.x < FW - 0.005) && c.depth > 0.001) {
        const key = `${f.key} / ${c.solid}`;
        found.set(key, Math.max(found.get(key) ?? 0, c.depth * 1000));
      }
  return found;
};
/** Shrink-only comparison against the ledger: new crossings, deeper ones (0.5 mm tolerance) and cleared entries fail. */
const ratchet = (found: Map<string, number>, ledger: typeof CROSSINGS) => [
  ...[...found]
    .filter(([key]) => !ledger[key])
    .map(
      ([key, mm]) =>
        `new crossing ${key}: ${mm.toFixed(1)} mm; re-route the flow; only a reviewed pass-through or host gets a ledger entry`,
    ),
  ...[...found]
    .filter(([key, mm]) => ledger[key] && mm > ledger[key][0] + 0.5)
    .map(([key, mm]) => `${key}: ${mm.toFixed(1)} mm, deeper than its ${ledger[key][0]} mm entry`),
  ...Object.keys(ledger)
    .filter((key) => !found.has(key))
    .map((key) => `${key}: cleared; delete its ledger entry`),
];

it("re-routed flow tubes stay clear of the cabin, wing, tank, gear, avionics, CAPS and TKS hardware they crossed", () => {
  const hits: string[] = [];
  for (const [key, names] of Object.entries(FIXED)) {
    const f = FLOWS.find((f) => f.key === key);
    expect(f, key).toBeDefined();
    for (const name of names) {
      const solids = SOLIDS.filter((s) => s.name === name);
      expect(solids.length, `${key} / ${name}`).toBeGreaterThan(0);
      for (const c of crossings(f!, solids))
        hits.push(`${key} / ${name}: ${(c.depth * 1000).toFixed(1)} mm at ${c.at.toArray().map((x) => x.toFixed(3))}`);
    }
  }
  expect(hits).toEqual([]);
}, 60000);

it("no flow gains a new or deeper non-engine crossing, and the ledger only shrinks", () => {
  const found = audit(SOLIDS);
  console.info(`${found.size} non-engine flow-vs-solid crossings remain`);
  expect(ratchet(found, CROSSINGS)).toEqual([]);
}, 120000);

/** Cleared or guarded engine-side pairs, pinned independently of the shrink-only baseline. FuelMain's mixture-cable contact
 * at the unchanged engine-pump/mixture-arm anchor is an inline host, recorded separately in the ledger. */
const ENGINE_FIXED: Record<string, string[]> = {
  fuelMain: [
    "Continental TSIO-550-K",
    "Oil sump",
    "Oil suction screen",
    "Oil pump",
    "Slinger supply line",
    "Intake manifold",
    "Induction clamp",
    "Induction Y junction",
    "Throttle control cable",
  ],
  oil: ["Left magneto", "Throttle control cable"],
  turboOilR: ["Oil sump", "Oil filter (full-flow)"],
  gateOil: ["Master Control Unit"],
  alt1: [
    "Continental TSIO-550-K",
    "Oil sump",
    "Oil cooler",
    "Oil filter (full-flow)",
    "ALT 2 voltage regulator",
    "MCU heat shield",
    "Engine-driven fuel pump",
  ],
  landFeed: [
    "ALT 2 voltage regulator",
    "Main Distribution Bus 1",
    "Main Distribution Bus 2",
    "Essential Distribution Bus",
    "MDB interconnect fuse and diode",
  ],
  starterCable: ["Main Distribution Bus 1", "Main Distribution Bus 2", "Essential Distribution Bus"],
  fuelRetL: ["Gascolator"],
  fuelRetR: ["Gascolator"],
  fuelDrainCyl1: ["Continental TSIO-550-K", "Slinger supply line"],
  fuelDrainCyl2: ["Continental TSIO-550-K"],
  fuelDrainCyl3: ["Slinger supply line"],
  fuelDrainCyl5: ["Slinger supply line"],
  fuelDrainEngine: ["Mixture control cable"],
  turboScavL: ["Starter drive adapter", "Gascolator"],
  turboScavR: ["Starter drive adapter", "Gascolator"],
};

it("re-routed engine flow tubes stay clear of the engine hardware they crossed", () => {
  const hits: string[] = [];
  for (const [key, names] of Object.entries(ENGINE_FIXED)) {
    const f = FLOWS.find((f) => f.key === key);
    expect(f, key).toBeDefined();
    for (const name of names) {
      const solids = ENGINE_SOLIDS.filter((s) => s.name === name);
      expect(solids.length, `${key} / ${name}`).toBeGreaterThan(0);
      // the immutable pump anchor is on the case face and coincides with MIXTURE_ARM.
      // Only the pump's unexpanded world bounds are an inline host; case contacts outside them still fail this pin.
      // The cable ends beside the fixed metering anchor, within the fuel tube radius. Only contacts
      // inside the metering body's unexpanded bounds are ruled baseline; its approach must clear.
      const hostName =
        key !== "fuelMain"
          ? undefined
          : name === "Continental TSIO-550-K"
            ? "Engine-driven fuel pump"
            : name === "Throttle control cable"
              ? "Throttle body / fuel-metering valve"
              : undefined;
      const host = hostName ? ENGINE_SOLIDS.find((s) => s.name === hostName)!.box : undefined;
      for (const c of crossings(f!, solids, host))
        // Terminal contacts are the unchanged flow fittings, matching the audit's host convention.
        if (!c.terminal) hits.push(`${key} / ${name}: ${(c.depth * 1000).toFixed(1)} mm`);
    }
  }
  // the Y sleeve is avoidable. Require the standard 5 mm surface gap for the 14 mm fuel tube.
  const fuel = FLOWS.find((f) => f.key === "fuelMain")!;
  const curve = curveOf(fuel.pts, fuel.tension ?? 0.3);
  const samples = curve.getSpacedPoints(Math.max(200, Math.ceil(curve.getLength() * 400)));
  const q = new Vector3();
  let gap = Infinity;
  for (const solid of ENGINE_SOLIDS.filter((s) => s.name === "Induction Y junction")) {
    for (const point of samples) {
      if (solid.box.distanceToPoint(point) > 0.05) continue;
      expect(insideSolid(point, solid.mesh)).toBe(false);
      for (const face of solid.faces) gap = Math.min(gap, face.closestPointToPoint(point, q).distanceTo(point));
    }
  }
  expect(gap).toBeGreaterThanOrEqual((fuel.r ?? 0.012) + 0.005);
  expect(hits).toEqual([]);
}, 60000);

it("no flow gains a new or deeper engine crossing, including cylinder hardware, and the engine ledger only shrinks", () => {
  const found = audit(ENGINE_SOLIDS, true);
  console.info(`${found.size} engine flow-vs-solid crossings remain`);
  expect(ratchet(found, ENGINE_CROSSINGS)).toEqual([]);
}, 120000);

it("the ratchet rejects a planted new crossing, a deepened one and a stale entry", () => {
  // a 60 mm box on the pitot line's under-floor run, aft of the firewall, where no catalogue part sits
  const f = FLOWS.find((f) => f.key === "pitot")!;
  const at = curveOf(f.pts, f.tension ?? 0.3).getPointAt(0.8);
  expect(at.x).toBeLessThan(FW);
  const mesh = tris(new BoxGeometry(0.06, 0.06, 0.06), new Matrix4().makeTranslation(at.x, at.y, at.z));
  const planted: Solid = {
    name: "Planted block",
    mesh,
    faces: mesh.map(([a, b, c]) => new Triangle(a, b, c)),
    box: new Box3().setFromPoints(mesh.flat()),
  };
  const run = crossings(f, [planted]);
  expect(run).toHaveLength(1);
  expect(run[0].terminal).toBe(false);
  const found = new Map([[`pitot / Planted block`, run[0].depth * 1000]]);
  expect(ratchet(found, {})).toEqual([expect.stringMatching(/^new crossing pitot \/ Planted block/)]);
  expect(ratchet(found, { "pitot / Planted block": [1, "overlap"] })).toEqual([
    expect.stringMatching(/deeper than its 1 mm entry$/),
  ]);
  expect(ratchet(new Map(), { "pitot / Planted block": [1, "overlap"] })).toEqual([
    "pitot / Planted block: cleared; delete its ledger entry",
  ]);
});
