// Skin containment: every SR22T part and rendered flow tube stays inside the airframe skin, i.e. the POH 13772-007
// Fig 1-1 fuselage/cowl loft, wings, trailing-edge shells, stabilizers, fin, spinner and the control surfaces at rest.
// Parent groups are full rest matrices (position and rotation) mirroring Airplane.tsx / ControlRig.tsx from the
// initial state: doors closed, controls neutral, propeller phase 0°, blades at their fixed 120° spacing and rest pitch.
//
// Two data tables decide what may be outside:
// - EXTERNAL: outside by design, each with a reason and a protrusion budget. Every `ext: true` part needs an entry.
// - DEBT: known offenders, keyed by part/flow name, with the tracking issue and the largest depth allowed.
//   An entry may carry a `reason` when it is not obvious from the issue.
//   The test fails on a new offender, on a DEBT entry that grows past its max, and on a DEBT entry that is clean.
//   The ledger can only shrink.
//
// Removing a DEBT entry when its issue is fixed: in the fix PR, delete the issue's lines from DEBT and run this
// file. A part that is now inside the skin (or within its EXTERNAL budget) passes. A part that is still outside fails
// with its depth, so either finish the fix or, if it really is outside by design, add an EXTERNAL entry with a
// reason. A partial fix may lower an entry's `max` to the new depth, rounded up to the mm; never raise one.
// If a fix renames a part, the old DEBT key fails as "matches no part or flow"; delete it.
import * as THREE from "three";
import { expect, it } from "vitest";
import { D2R, toV } from "@/lib/math";
import { CAT, CYLS, cylOrigin, NOSE_CASTER, NOSE_GEAR, PROP, YOKES, YOKE_X, YOKE_Y } from "@/aircraft/sr22t/parts";
import { FUSE, doorHinge, doorRotation, inFus, wingP } from "@/aircraft/sr22t/geometry";
import { bladeDisplayPitch, initialSim, live } from "@/aircraft/sr22t/model";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { AIL_SECTOR, CARR, ETT, PULLEYS, RUD_HORN, rigPose } from "@/aircraft/sr22t/rig";
import { curveOf } from "@/lib/geometry";
import { inside, tris, type Tri } from "./mesh-clearance";

/** A vertex within 1 mm of the skin counts as flush: the skin-QA method of record (skin-qa report §3, lead ruling). */
const FLUSH = 0.001;

/**
 * Outside by design. `name` matches the part/flow name exactly unless it is a RegExp. `max` is the largest allowed
 * protrusion in metres: an external part may stick out, but not float away from where it mounts.
 * Every part flagged `ext: true` must match an entry here; `ext` alone is not a pass.
 */
const EXTERNAL: { name: string | RegExp; max: number; reason: string; terminalOnly?: boolean }[] = [
  { name: "(unnamed)", max: 0.01, reason: "unnamed cosmetic skin details (cowl cooling-inlet backing discs, cowl.ts)" },
  // landing gear and brakes: below the airframe by definition (POH 7-25)
  {
    name: /^(Main|Nose) (gear strut|wheel|wheel pant|strut fairing|wheel hub|wheel axle|wheel sealed bearing|wheel bearing seal|axle nut|axle cotter pin|tire valve stem|pant access door|wheel fork|oleo cylinder|oleo piston rod)$/,
    max: 0.9,
    reason: "landing gear, wheels and fairings hang below the airframe",
  },
  {
    name: /^(Wheel pant|Wheel pant access door|Nose strut fairing|Main strut fairing|Nose oleo .*|Nose wheel .*)$/,
    max: 0.9,
    reason: "gear fairings and nose-gear leg below the cowl",
  },
  {
    name: /^Brake (disc|caliper|torque plate|pad|caliper piston|temperature sensor|temperature indicator|union fitting|caliper fitting|hose|line \([LR]\))$/,
    max: 0.8,
    reason: "wheel brakes and their lines on the main gear legs",
  },
  // propeller
  { name: "Propeller blade", max: 1.0, reason: "propeller" },
  { name: "Grooved blade boot", max: 0.25, reason: "TKS boot bonded to the blade root" },
  { name: "Boot feed tube", max: 0.02, reason: "TKS slinger-to-boot feed on the prop hub" },
  { name: "Propeller slinger ring", max: 0.05, reason: "TKS slinger on the prop hub behind the spinner" },
  // exhaust
  {
    name: /^(Exhaust tailpipe|Tailpipe)$/,
    max: 0.13,
    reason: "tailpipes exit through the lower cowl (AMM Fig 78-20-4)",
  },
  // antennas, probes, static, OAT
  { name: /antenna/, max: 0.31, reason: "antennas stand off the skin" },
  { name: /^(Pitot mast|Heated pitot tube)$/, max: 0.12, reason: "pitot mast under the left wing" },
  { name: /^Static port \([LR]\)$/, max: 0.01, reason: "flush static ports" },
  {
    name: /^(Stall warning inlet|Low-pressure peak|Stall warning lift transducer)$/,
    max: 0.045,
    reason: "stall-warning inlet on the wing leading edge; the peak marker rides the LE",
  },
  { name: /^OAT sensor [12]$/, max: 0.075, reason: "OAT probes project into the airstream under the wing" },
  // lights
  {
    name: /(nav|strobe|position light|recognition light|Landing light|Ice inspection light|Entry step light)/,
    max: 0.1,
    reason: "exterior lights",
  },
  // cowl and airframe openings, doors, handles
  {
    name: /^(Cowl inlet — cooling|NACA induction duct|Cowl exit louvers|NACA fresh-air inlet|NACA fuel vent)$/,
    max: 0.03,
    reason: "inlets and louvers on the skin",
  },
  { name: "Oil filler access door", max: 0.015, reason: "flush cowl door" },
  {
    name: /^(Exterior door handle|Exterior handle housing|Door lock cylinder|Baggage door lock)$/,
    max: 0.03,
    reason: "exterior door hardware",
  },
  {
    name: /^(Upper|Lower) door hinge$|^Door hinge plate$|^Baggage door hinge$/,
    max: 0.03,
    reason: "exterior door hinges and plates (AMM Fig 52-10-1 sh 3)",
  },
  { name: "Ground service receptacle", max: 0.01, reason: "external power socket on the cowl" },
  // fuel and drains
  {
    name: /^(Filler cap|Tank drain|Collector drain|Gascolator drain)$/,
    max: 0.03,
    reason: "fuel fillers and preflight drains",
  },
  {
    name: /^(Auxiliary pump drain|Injection manifold drain|Gascolator bowl drain tube|Engine-driven pump drain)$/,
    max: 0.03,
    reason: "overboard drain tube exits below the cowl",
  },
  // flows whose only outside vertices are the end at an external part
  {
    name: /^(Left|Right) tank vent line$/,
    max: 0.012,
    terminalOnly: true,
    reason:
      "only the NACA terminal under the wing (POH 13772-007 7-40, Fig 7-8 p. 7-42; AMM Fig 28-10-3 items 6–7, PDF 1105)",
  },
  { name: /^OAT [12] to ADAHRS [12]$/, max: 0.004, reason: "ends at the OAT probe" },
  { name: "Stall transducer wiring", max: 0.004, reason: "ends at the stall-warning lift transducer on the LE" },
  // stall strips, wicks, hinges, tabs
  { name: /stall strip$/, max: 0.02, reason: "stall strips on the LE" },
  { name: /^Static wick/, max: 0.14, reason: "static wicks on the trailing edges" },
  {
    name: /^(Flap hinge (bracket|fairing|arm)|Aileron hinge fairing)$/,
    max: 0.065,
    reason: "external hinge brackets and fairings",
  },
  { name: /trim tab \(ground-adjustable\)$/, max: 0.075, reason: "ground-adjustable tabs on the trailing edges" },
  // TKS (FIKI)
  { name: /porous panel$/, max: 0.03, reason: "TKS porous panels on the leading edges" },
  { name: /^(Left|Right) TKS (filler|tank vent)$/, max: 0.02, reason: "TKS filler and tank vent on the wing skin" },
  { name: /windshield nozzle$/, max: 0.02, reason: "TKS spray bar at the windshield base" },
  { name: /^Panel (inlet fitting|vent and check valve)$/, max: 0.02, reason: "TKS panel fittings at the panel edge" },
];

/**
 * Issue-tracked debt: name → largest allowed depth (m), measured when filed (main 912db0b, rounded up to the mm) and
 * re-checked on 1a77f16. Shrink only; delete an issue's lines in the PR that fixes it (see the header).
 */
const DEBT: Record<string, { max: number; issue: string; reason?: string }> = {
  "Gascolator preflight drain valve": { max: 0.092, issue: "#215" },
};

const matches = (name: string) =>
  EXTERNAL.find((e) => (typeof e.name === "string" ? e.name === name : e.name.test(name)));

type Node = { box: THREE.Box3; tris?: number[]; children?: [Node, Node] };
/** AABB tree over triangles, split at the median of the longest axis. */
const treeOf = (skin: Tri[], ids: number[]): Node => {
  const box = new THREE.Box3();
  for (const n of ids) for (const v of skin[n]) box.expandByPoint(v);
  if (ids.length <= 8) return { box, tris: ids };
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
  const mid = (n: number) => skin[n][0][axis] + skin[n][1][axis] + skin[n][2][axis];
  const sorted = [...ids].sort((a, b) => mid(a) - mid(b)),
    half = sorted.length >> 1;
  return { box, children: [treeOf(skin, sorted.slice(0, half)), treeOf(skin, sorted.slice(half))] };
};

const hull = () => {
  const meshes: { mesh: Tri[]; box: THREE.Box3 }[] = [];
  const I = new THREE.Matrix4();
  for (const s of CAT.shells)
    if (s.name !== "Fuselage") {
      const mesh = tris(s.geo(), I);
      meshes.push({ mesh, box: new THREE.Box3().setFromPoints(mesh.flat()) });
    }
  for (const s of CAT.surfaces) {
    const mesh = tris(s.geo(), new THREE.Matrix4().makeTranslation(...s.pivot));
    meshes.push({ mesh, box: new THREE.Box3().setFromPoints(mesh.flat()) });
  }
  // The painted fuselage has door apertures; the closed analytic loft (inFus) stands in for it.
  const skin = [...tris(FUSE.geo({ step: 0.01, N: 160 }), I), ...meshes.flatMap((m) => m.mesh)];
  // AABB prefilter: a point outside every hull box skips the ray tests (inside() also rejects on its mesh box).
  const all = meshes.reduce((b, m) => b.union(m.box), new THREE.Box3().setFromPoints(skin.flat()));
  const contains = (p: THREE.Vector3) =>
    all.containsPoint(p) && (inFus(p) || meshes.some((m) => inside(p, m.mesh, m.box)));
  // Closest skin distance, pruning every tree node whose box is already farther than the best hit.
  const root = treeOf(
      skin,
      skin.map((_, n) => n),
    ),
    t = new THREE.Triangle(),
    q = new THREE.Vector3();
  const depth = (p: THREE.Vector3) => {
    let d = Infinity;
    const stack = [root];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.box.distanceToPoint(p) >= d) continue;
      if (node.tris)
        for (const n of node.tris)
          d = Math.min(
            d,
            t
              .set(...skin[n])
              .closestPointToPoint(p, q)
              .distanceTo(p),
          );
      else {
        // Visit the nearer child last so it pops first and tightens d sooner.
        const [a, b] = node.children!;
        if (a.box.distanceToPoint(p) < b.box.distanceToPoint(p)) stack.push(b, a);
        else stack.push(a, b);
      }
    }
    return d;
  };
  return { contains, depth };
};

/**
 * Rest transform of a renderer parent group, built the way Airplane.tsx / ControlRig.tsx build it from the initial
 * state: group position, then the group's rotation (doors closed, controls neutral, propeller phase 0°).
 */
const parentMatrix = (parent?: string): THREE.Matrix4 => {
  const T = (v: ArrayLike<number> | THREE.Vector3) =>
      v instanceof THREE.Vector3
        ? new THREE.Matrix4().makeTranslation(v)
        : new THREE.Matrix4().makeTranslation(v[0], v[1], v[2]),
    R = (axis: "x" | "y" | "z", a: number) =>
      new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(axis === "x" ? a : 0, axis === "y" ? a : 0, axis === "z" ? a : 0),
      );
  if (!parent) return new THREE.Matrix4();
  const [kind, a, b] = parent.split(":"),
    s = initialSim,
    pose = rigPose(s);
  if (kind === "surf") return T(CAT.surfacePivot(a));
  if (kind === "cyl") return T(cylOrigin(CYLS.find((c) => String(c.n) === a)!));
  // Airplane.tsx Propeller: PROP group, then a fixed 120° x-rotation per blade, then the blade-pitch y-rotation that
  // useFrame sets every frame from bladeDisplayPitch (the spinning prop group itself rests at 0°).
  if (kind === "blade")
    return T(PROP)
      .multiply(R("x", (Number(a) * Math.PI * 2) / 3))
      .multiply(R("y", bladeDisplayPitch(s)));
  if (kind === "door") {
    const key = a as "L" | "R" | "bag";
    return T(doorHinge(key).pivot).multiply(
      new THREE.Matrix4().makeRotationFromQuaternion(doorRotation(key, live.doors[key])),
    );
  }
  if (kind === "noseGear") return T(NOSE_GEAR);
  if (kind === "caster")
    return T(NOSE_GEAR)
      .multiply(T(NOSE_CASTER))
      .multiply(R("y", -s.gear.diff * 85 * D2R));
  if (kind === "yoke" || kind === "grip") {
    const yoke = T([YOKE_X - s.ctrl.pitch * 0.07, YOKE_Y, YOKES.find((y) => y.side === a)!.z]);
    return kind === "grip" ? yoke.multiply(R("x", s.ctrl.roll * 0.6)) : yoke;
  }
  if (kind === "rig") {
    if (a === "ett") return T(ETT.c).multiply(R("z", pose.ett));
    if (a === "carr") return T([CARR.x, CARR.y, (b === "L" ? -1 : 1) * CARR.z]).multiply(R("x", pose.carr));
    if (a === "ailSector") return T(AIL_SECTOR.c).multiply(R("x", pose.ailSector));
    if (a === "rudHorn") return T(RUD_HORN.c).multiply(R("y", pose.rudHorn));
    if (a === "pedL" || a === "pedR") return T([(a === "pedL" ? -1 : 1) * pose.pedal, 0, 0]);
    if (a === "pul") return T(PULLEYS[b].c).multiply(R(PULLEYS[b].axis, pose.pulley[b]));
  }
  throw new Error(`Unknown parent group "${parent}": add its rest transform from Airplane.tsx / ControlRig.tsx`);
};

/** Largest protrusion of a vertex set, ignoring flush vertices. */
const protrusion = (pts: THREE.Vector3[], h: ReturnType<typeof hull>) => {
  let worst = 0;
  const seen = new Set<string>();
  for (const p of pts) {
    // Indexed and non-indexed geometries repeat seam vertices; test each position once.
    const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!h.contains(p)) worst = Math.max(worst, h.depth(p));
  }
  return worst > FLUSH ? worst : 0;
};

type SweptPart = Pick<(typeof CAT.parts)[number], "geo" | "name" | "pos" | "rot" | "scale" | "parent" | "ext" | "id">;
let cachedHull: ReturnType<typeof hull> | undefined;

/** Every containment failure for these parts and flows, against EXTERNAL and DEBT. */
const sweep = (parts: readonly SweptPart[], flows: readonly (typeof FLOWS)[number][]) => {
  const h = (cachedHull ??= hull());
  const found = new Map<string, number>();
  const failures: string[] = [];
  const note = (name: string, d: number) => found.set(name, Math.max(found.get(name) ?? 0, d));
  for (const p of parts) {
    const g = p.geo(),
      pos = g.attributes.position;
    const m = new THREE.Matrix4()
      .compose(
        new THREE.Vector3(...(p.pos ?? [0, 0, 0])),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
        new THREE.Vector3(...(p.scale ?? [1, 1, 1])),
      )
      .premultiply(parentMatrix(p.parent));
    // Feed tubes cancel blade pitch: hub p-clips (AMM 61-10 p. 4 item (e), PDF 2441).
    if (p.name === "Boot feed tube") m.multiply(new THREE.Matrix4().makeRotationY(-bladeDisplayPitch(initialSim)));
    const pts = Array.from({ length: pos.count }, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m),
    );
    g.dispose();
    const name = p.name ?? "(unnamed)";
    if (p.ext && !matches(name)) failures.push(`ext part "${name}" (${p.id}) needs an EXTERNAL entry with a reason`);
    note(name, protrusion(pts, h));
  }
  for (const f of flows) {
    if (f.tube === false) continue;
    const curve = curveOf(f.pts, f.tension ?? 0.3);
    const g = new THREE.TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false);
    const pos = g.attributes.position;
    const pts = Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i));
    g.dispose();
    const name = f.name ?? f.key;
    const ext = matches(name);
    if (ext?.terminalOnly) {
      // Keep the existing 12 mm budget only at the rendered NACA access-panel footprint.
      // Its approximate size comes from AMM Fig 6-00-7 (PDF 124), Fig 28-10-3 (PDF 1105).
      const terminal = toV(f.pts[f.pts.length - 1]);
      const panel = CAT.parts.find((p) => p.name === "NACA fuel vent" && toV(p.pos!).distanceTo(terminal) < FLUSH)!;
      const panelGeo = panel.geo();
      const terminalBox = new THREE.Box3()
        .setFromBufferAttribute(panelGeo.attributes.position as THREE.BufferAttribute)
        .translate(toV(panel.pos!))
        .expandByScalar(f.r ?? 0.012);
      panelGeo.dispose();
      const internal = pts.filter((p) => !terminalBox.containsPoint(p));
      const d = protrusion(internal, h);
      if (d > 0) failures.push(`${name}: ${(d * 1000).toFixed(1)} mm outside away from its NACA terminal`);
    }
    note(name, protrusion(pts, h));
  }
  for (const [name, d] of found) {
    const ext = matches(name),
      debt = DEBT[name];
    if (debt) {
      if (d > debt.max + 1e-4)
        failures.push(`${name}: ${(d * 1000).toFixed(1)} mm, grew past ${debt.issue}'s ${debt.max * 1000} mm`);
      if (d <= (ext?.max ?? 0))
        failures.push(
          `${name}: back within ${ext ? "its external budget" : "the skin"}; delete its DEBT entry (${debt.issue})`,
        );
    } else if (ext) {
      if (d > ext.max + 1e-4)
        failures.push(`${name}: ${(d * 1000).toFixed(1)} mm outside, budget ${ext.max * 1000} mm (${ext.reason})`);
    } else if (d > 0) failures.push(`${name}: ${(d * 1000).toFixed(1)} mm outside the skin and not listed as external`);
  }
  return { failures, found };
};

it("every SR22T part and flow tube stays inside the skin unless listed as external (POH 13772-007 Fig 1-1 loft)", () => {
  const { failures, found } = sweep(CAT.parts, FLOWS);
  for (const name of Object.keys(DEBT))
    if (!found.has(name)) failures.push(`DEBT entry "${name}" matches no part or flow`);
  expect(failures).toEqual([]);
}, 120_000);

it("a part under a rotated blade parent is checked where the renderer draws it (Airplane.tsx Propeller)", () => {
  // Blade-local [-0.2, 0, 0.3] sits inside the cowl under blade 0's transform (with the rest pitch), but blade 1's
  // fixed 120° x-rotation carries it ~59 mm below and outboard of the cowl. Dropping that rotation would pass it.
  const planted: SweptPart = {
    id: "containment-probe",
    name: "Planted blade offender",
    parent: "blade:1",
    pos: [-0.2, 0, 0.3],
    geo: () => new THREE.BoxGeometry(0.002, 0.002, 0.002),
  };
  const asBlade0 = sweep([{ ...planted, parent: "blade:0" }], []).failures;
  const asBlade1 = sweep([planted], []).failures;
  expect(asBlade0).toEqual([]);
  expect(asBlade1).toEqual([
    expect.stringMatching(/^Planted blade offender: .* mm outside the skin and not listed as external$/),
  ]);
});

it("an unknown parent group is a hard error, not a silent identity transform", () => {
  expect(() => parentMatrix("tester:missing")).toThrow(/Unknown parent group "tester:missing"/);
});

it("tank vent external allowance covers only its NACA terminal (AMM Fig 28-10-3, PDF 1105)", () => {
  for (const key of ["fuelVentL", "fuelVentR"]) {
    const vent = FLOWS.find((f) => f.key === key)!;
    expect(sweep([], [vent]).failures).toEqual([]);
    const start = toV(vent.pts[0]);
    const planted = { ...vent, pts: [wingP(start.z, 0.45, 1), ...vent.pts.slice(1)] };
    expect(sweep([], [planted]).failures).toEqual([expect.stringMatching(/outside away from its NACA terminal$/)]);
  }
});
