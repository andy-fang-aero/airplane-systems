/**
 * Avionics data, power and cooling paths: SR22T POH 13772-007 Fig 7-17 (7-73), 7-74 – 7-90;
 * AMM 13773-002 Rev 7 31-40 (PDF pp. 1326–1327), 34-10 (PDF p. 1630), 34-20 (PDF p. 1675), 21-20 (PDF p. 454).
 */
import { flowRates, FLOWS } from "@/aircraft/sr22t/flows";
import { doorHinge, doorRotation, wingSec } from "@/aircraft/sr22t/geometry";
import { FLAP_DEG, initialSim, solve, type Sim } from "@/aircraft/sr22t/model";
import {
  ADAHRS_2,
  CAT,
  cylOrigin,
  CYLS,
  GIA_1,
  GIA_2,
  MAG_2,
  MAG_WIRES,
  MFD_CONN,
  NOSE_CASTER,
  NOSE_GEAR,
  PROP,
  TANK_CHORD,
  TANK_SPAN,
  YOKE_X,
  YOKE_Y,
  YOKES,
} from "@/aircraft/sr22t/parts";
import {
  AIL_SECTOR,
  CARR,
  ETT,
  linkPoints,
  PULLEYS,
  rigPose,
  RUD_HORN,
  SURF_TRAVEL,
  surfDeflection,
} from "@/aircraft/sr22t/rig";
import type { FlowSpec } from "@/lib/catalogue";
import { curveOf, loft } from "@/lib/geometry";
import { toV, type Vec3 } from "@/lib/math";
import * as THREE from "three";
import { expect, it } from "vitest";
import { patched } from "./helpers";

const DATA_KEYS = [
  "magData",
  "magData2",
  "adahrs2Mfd",
  "adahrs2Gia1",
  "adahrs2Gia2",
  "adahrsPfd",
  "adahrsGia1",
  "adahrsGia2",
  "gia1Pfd",
  "gia2Mfd",
  "pfdMfd",
  "geaData",
  "geaData2",
  "xpdrData",
  "audioGia1",
  "audioGia2",
  "trafficData",
  "wxData",
  "dmeData",
];
const FEED_KEYS = ["pfdFeedA", "pfdFeedB", "mfdFeedA", "mfdFeedB"];
const COOL_KEYS = ["iauCool", "iauCool2"];
const NEW_KEYS = [...DATA_KEYS, ...FEED_KEYS, ...COOL_KEYS];
/** OAT 1 → ADAHRS 1 is `oatData1` (name, rate, pitot styling); this file supplies its route. */
const ROUTED_KEYS = [...NEW_KEYS, "oatData1", "oatData2"];

const flow = (key: string): FlowSpec => {
  const f = FLOWS.find((x) => x.key === key);
  expect(f, key).toBeDefined();
  return f!;
};
const same = (p: Vec3 | THREE.Vector3, q: Vec3 | THREE.Vector3) => toV(p).distanceTo(toV(q)) < 1e-9;
const first = (key: string) => flow(key).pts[0];
const last = (key: string) => flow(key).pts.at(-1)!;
const rates = (patch: Parameters<typeof patched<Sim>>[1] = {}) => {
  const s = patched(initialSim, patch);
  return flowRates(s, solve(s));
};
const SECOND_LINKS = [
  ["magData2", MAG_2, ADAHRS_2],
  ["adahrs2Mfd", ADAHRS_2, MFD_CONN],
  ["adahrs2Gia1", GIA_1, ADAHRS_2],
  ["adahrs2Gia2", ADAHRS_2, GIA_2],
] as const;
/** Solid angle (steradians) a triangle subtends at the origin (Van Oosterom & Strackee). */
const solidAngle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, w: THREE.Vector3) => {
  const ax = a.x - w.x,
    ay = a.y - w.y,
    az = a.z - w.z,
    bx = b.x - w.x,
    by = b.y - w.y,
    bz = b.z - w.z,
    cx = c.x - w.x,
    cy = c.y - w.y,
    cz = c.z - w.z;
  const la = Math.hypot(ax, ay, az),
    lb = Math.hypot(bx, by, bz),
    lc = Math.hypot(cx, cy, cz);
  const num = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  const den =
    la * lb * lc +
    (ax * bx + ay * by + az * bz) * lc +
    (bx * cx + by * cy + bz * cz) * la +
    (cx * ax + cy * ay + cz * az) * lb;
  return 2 * Math.atan2(num, den);
};
/**
 * Signed distance from a world point to a part's rendered mesh at rest: the distance to its nearest triangle, negative when
 * the point is inside (generalised winding number above ¾, which overlapping merged pieces and either winding order keep;
 * an open plate never reaches it, so only its surface distance counts).
 */
// Neutral parent transforms match Airplane.tsx/ControlRig.tsx; include every part and control surface.
const parents: Record<string, THREE.Matrix4> = {};
const translate = (v: Vec3 | THREE.Vector3) => new THREE.Matrix4().makeTranslation(...toV(v).toArray());
for (const [name, v] of Object.entries({
  "rig:ett": ETT.c,
  "rig:ailSector": AIL_SECTOR.c,
  "rig:rudHorn": RUD_HORN.c,
  noseGear: NOSE_GEAR,
  caster: toV(NOSE_GEAR).add(toV(NOSE_CASTER)).toArray() as Vec3,
}))
  parents[name] = translate(v);
for (const k of ["L", "R", "bag"] as const) parents[`door:${k}`] = translate(doorHinge(k).pivot);
for (const s of CAT.surfaces) parents[`surf:${s.key}`] = translate(s.pivot);
for (const [k, p] of Object.entries(PULLEYS)) parents[`rig:pul:${k}`] = translate(p.c);
parents["rig:pedL"] = parents["rig:pedR"] = new THREE.Matrix4();
for (const y of YOKES) parents[`yoke:${y.side}`] = parents[`grip:${y.side}`] = translate([YOKE_X, YOKE_Y, y.z]);
for (const sd of [-1, 1]) parents[`rig:carr:${sd < 0 ? "L" : "R"}`] = translate([CARR.x, CARR.y, sd * CARR.z]);
for (const c of CYLS) parents[`cyl:${c.n}`] = translate(cylOrigin(c));
for (let i = 0; i < 3; i++)
  parents[`blade:${i}`] = translate(PROP).multiply(new THREE.Matrix4().makeRotationX((i * Math.PI * 2) / 3));
const solids = [
  ...CAT.parts,
  // Same full wet-wing volumes as Airplane.tsx (POH 7-40; AMM Fig 28-10-3 PDF 1105).
  ...[-1, 1].map((side) => ({
    name: `${side > 0 ? "Right" : "Left"} wing tank`,
    geo: () => {
      const sections = [TANK_SPAN[0], 1.6, 2.4, 3.2, 4.0, TANK_SPAN[1]].map((z) =>
        wingSec(side * z, ...TANK_CHORD, 0.85),
      );
      return loft(side < 0 ? sections.map((r) => r.reverse()) : sections);
    },
    pos: undefined,
    rot: undefined,
    scale: undefined,
    parent: undefined,
  })),
  ...CAT.surfaces.map((s) => ({
    name: s.name,
    geo: s.geo,
    pos: s.pivot,
    rot: undefined,
    scale: undefined,
    parent: undefined,
  })),
  ...FLOWS.filter((f) => f.tube !== false).map((f) => ({
    name: `flow:${f.key}`,
    geo: () => {
      const c = curveOf(f.pts, f.tension ?? 0.3);
      return new THREE.TubeGeometry(c, Math.max(24, Math.round(c.getLength() * 28)), f.r ?? 0.012, 6, false);
    },
    pos: undefined,
    rot: undefined,
    scale: undefined,
    parent: undefined,
  })),
].map((p) => {
  const raw = p.geo();
  const g = raw.index ? raw.toNonIndexed() : raw;
  const toWorld = new THREE.Matrix4().compose(
    toV(p.pos ?? [0, 0, 0]),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
    toV(p.scale ?? [1, 1, 1]),
  );
  if (p.parent) {
    expect(parents[p.parent], `missing neutral transform: ${p.parent}`).toBeDefined();
    toWorld.premultiply(parents[p.parent]);
  }
  const pos = g.getAttribute("position"),
    tris: THREE.Triangle[] = [];
  for (let i = 0; i < pos.count; i += 3)
    tris.push(
      new THREE.Triangle(
        ...([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, i + k).applyMatrix4(toWorld)) as [
          THREE.Vector3,
          THREE.Vector3,
          THREE.Vector3,
        ]),
      ),
    );
  g.dispose();
  const world = new THREE.Box3();
  for (const t of tris) world.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c);
  const q = new THREE.Vector3();
  const dist = (w: THREE.Vector3) => {
    let d = Infinity,
      wind = 0;
    for (const t of tris) {
      d = Math.min(d, t.closestPointToPoint(w, q).distanceTo(w));
      wind += solidAngle(t.a, t.b, t.c, w);
    }
    return Math.abs(wind) / (4 * Math.PI) > 0.75 ? -d : d;
  };
  return { name: p.name ?? ("id" in p ? p.id : "unnamed surface"), world, dist, moving: !!p.parent };
});
// Conservative envelopes over full control travel, using the same poses as
// ControlRig.tsx/Airplane.tsx. AMM 6-00 PDF 117 gives the surface stops;
// POH Figs 7-1/7-2/7-3 (7-7/7-10/7-12) show the moving rods.
const swept: { name: string; world: THREE.Box3; faces?: THREE.Box3[] }[] = [];
const frames = Array.from({ length: 201 }, (_, i) => {
  const u = -1 + i / 100;
  const s = patched(initialSim, { ctrl: { pitch: u, roll: u, yaw: u } });
  const pose = rigPose(s),
    defl = surfDeflection(s.ctrl);
  const matrices: Record<string, THREE.Matrix4> = {};
  const place = (key: string, at: Vec3, axis: "x" | "y" | "z", angle: number) => {
    const e = new THREE.Euler();
    e[axis] = angle;
    matrices[key] = new THREE.Matrix4().compose(toV(at), new THREE.Quaternion().setFromEuler(e), toV([1, 1, 1]));
  };
  matrices.caster = parents.caster.clone().multiply(new THREE.Matrix4().makeRotationY((u * 85 * Math.PI) / 180));
  place("rig:ett", ETT.c, "z", pose.ett);
  place("rig:ailSector", AIL_SECTOR.c, "x", pose.ailSector);
  place("rig:rudHorn", RUD_HORN.c, "y", pose.rudHorn);
  for (const side of [-1, 1]) {
    place(`rig:carr:${side < 0 ? "L" : "R"}`, [CARR.x, CARR.y, side * CARR.z], "x", pose.carr);
    matrices[`rig:ped${side < 0 ? "L" : "R"}`] = translate([side * pose.pedal, 0, 0]);
  }
  for (const [key, pulley] of Object.entries(PULLEYS)) place(`rig:pul:${key}`, pulley.c, pulley.axis, pose.pulley[key]);
  for (const surface of CAT.surfaces) {
    const fl = (((u + 1) / 2) * FLAP_DEG[100] * Math.PI) / 180;
    const angle =
      (
        {
          flapR: fl,
          flapL: -fl,
          ailR: -defl.ail,
          ailL: -defl.ail,
          elevR: -defl.elev,
          elevL: defl.elev,
          rudder: defl.rud,
        } as Record<string, number>
      )[surface.key] ?? 0;
    matrices[`surf:${surface.key}`] = translate(surface.pivot).multiply(
      new THREE.Matrix4().makeRotationAxis(toV(surface.axis), angle),
    );
  }
  for (const key of ["L", "R", "bag"] as const)
    matrices[`door:${key}`] = translate(doorHinge(key).pivot).multiply(
      new THREE.Matrix4().makeRotationFromQuaternion(doorRotation(key, (u + 1) / 2)),
    );
  for (const yoke of YOKES) {
    matrices[`yoke:${yoke.side}`] = translate([YOKE_X - u * 0.07, YOKE_Y, yoke.z]);
    matrices[`grip:${yoke.side}`] = matrices[`yoke:${yoke.side}`]
      .clone()
      .multiply(new THREE.Matrix4().makeRotationX(u * 0.6));
  }
  return { matrices, links: linkPoints(s, pose) };
});
const moving = [
  ...CAT.parts.filter((p) => p.parent && frames[0].matrices[p.parent]),
  ...CAT.surfaces.map((s) => ({
    name: s.name,
    geo: s.geo,
    parent: `surf:${s.key}`,
    pos: undefined,
    rot: undefined,
    scale: undefined,
  })),
];
for (const part of moving) {
  const g = part.geo();
  g.computeBoundingBox();
  const local = g
    .boundingBox!.clone()
    .applyMatrix4(
      new THREE.Matrix4().compose(
        toV(part.pos ?? [0, 0, 0]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rot ?? [0, 0, 0]))),
        toV(part.scale ?? [1, 1, 1]),
      ),
    );
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
    (i) =>
      new THREE.Vector3(
        i & 1 ? local.max.x : local.min.x,
        i & 2 ? local.max.y : local.min.y,
        i & 4 ? local.max.z : local.min.z,
      ),
  );
  const world = new THREE.Box3();
  let step = 0,
    previous: THREE.Vector3[] | undefined;
  for (const frame of frames) {
    const points = corners.map((p) => p.clone().applyMatrix4(frame.matrices[part.parent!]));
    for (let i = 0; i < points.length; i++) {
      world.expandByPoint(points[i]);
      if (previous) step = Math.max(step, points[i].distanceTo(previous[i]));
    }
    previous = points;
  }
  // A whole inter-frame displacement guards unsampled angles. Grip pitch and
  // roll are independent, so include both ends of the full 140 mm translation.
  if (part.parent!.startsWith("grip:")) {
    world.min.x -= 0.14;
    world.max.x += 0.14;
  }
  let faces: THREE.Box3[] | undefined;
  if (part.parent!.startsWith("surf:")) {
    const mesh = g.index ? g.toNonIndexed() : g;
    const vertices = mesh.getAttribute("position");
    faces = [];
    const base = new THREE.Matrix4().compose(
      toV(part.pos ?? [0, 0, 0]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rot ?? [0, 0, 0]))),
      toV(part.scale ?? [1, 1, 1]),
    );
    for (let i = 0; i < vertices.count; i += 3) {
      const triangle = [0, 1, 2].map((j) =>
        new THREE.Vector3().fromBufferAttribute(vertices, i + j).applyMatrix4(base),
      );
      const face = new THREE.Box3();
      const surface = CAT.surfaces.find((s) => `surf:${s.key}` === part.parent)!;
      const T = SURF_TRAVEL;
      const degrees = (
        {
          flapR: [0, FLAP_DEG[100]],
          flapL: [-FLAP_DEG[100], 0],
          ailR: [-T.ail, T.ail],
          ailL: [-T.ail, T.ail],
          elevR: [-T.elevUp, T.elevDown],
          elevL: [-T.elevDown, T.elevUp],
          rudder: [-T.rud, T.rud],
        } as Record<string, number[]>
      )[surface.key];
      const [lo, hi] = degrees.map((d) => (d * Math.PI) / 180),
        axis = toV(surface.axis).normalize(),
        pivot = toV(surface.pivot);
      // Each rotated coordinate is A cos(angle) + B sin(angle) + C.
      // Its endpoints and derivative-zero angles bound the entire continuous sweep.
      for (const v of triangle) {
        const parallel = axis.clone().multiplyScalar(axis.dot(v));
        const A = v.clone().sub(parallel),
          B = axis.clone().cross(v),
          C = parallel.add(pivot);
        for (const coordinate of ["x", "y", "z"] as const) {
          const angles = [lo, hi],
            extreme = Math.atan2(B[coordinate], A[coordinate]);
          for (let turn = -2; turn <= 2; turn++) {
            const angle = extreme + turn * Math.PI;
            if (angle >= lo && angle <= hi) angles.push(angle);
          }
          for (const angle of angles) {
            const value = A[coordinate] * Math.cos(angle) + B[coordinate] * Math.sin(angle) + C[coordinate];
            face.min[coordinate] = Math.min(face.min[coordinate], value);
            face.max[coordinate] = Math.max(face.max[coordinate], value);
          }
        }
      }
      faces.push(face);
    }
    if (mesh !== g) mesh.dispose();
  }
  swept.push({ name: part.name ?? part.parent!, world: world.expandByScalar(step), faces });
  g.dispose();
}
const rodRadii: Record<string, number> = {
  "drop-1": 0.007,
  drop1: 0.007,
  ailRod: 0.006,
  elevPush: 0.01,
  rudPush: 0.009,
  "ped-1": 0.006,
  ped1: 0.006,
  "cone-1": 0.006,
  cone1: 0.006,
};
for (const [key, radius] of Object.entries(rodRadii)) {
  const world = new THREE.Box3();
  let step = 0;
  for (let i = 0; i < frames.length; i++) {
    const ends = frames[i].links[key];
    for (let j = 0; j < 2; j++) {
      world.expandByPoint(ends[j]);
      if (i) step = Math.max(step, ends[j].distanceTo(frames[i - 1].links[key][j]));
    }
  }
  // The union bounds include every straight rendered rod between its endpoints.
  swept.push({ name: `moving rod:${key}`, world: world.expandByScalar(radius + step) });
}
// Preserve the original audit resolution and OAT guard.
// These are test sample counts, not aircraft dimensions or installation tolerances.
/** OAT data paths audited strictly: 5 mm surface margin plus one arc-length sample interval. */
const OAT_KEYS = ["oatData1", "oatData2"];
const samples = (f: FlowSpec) =>
  curveOf(f.pts, f.tension ?? 0.3).getSpacedPoints(OAT_KEYS.includes(f.key) ? 6000 : 1500);
/**
 * Solids a path may run through by design: the console housing the display feeds run inside from the breaker panel on its
 * side, the aft bulkhead (FS 222) the transponder link passes to reach the transponder aft of it, and ADAHRS 1, which the
 * traffic path passes through (POH 7-84), and the console housing the audio panel, whose links leave it inside.
 */
const THROUGH: Record<string, string[]> = {
  ...Object.fromEntries(FEED_KEYS.map((k) => [k, ["Avionics panel (centre console)", "Center console"]])),
  xpdrData: ["Aft bulkhead — FS 222"],
  trafficData: ["GSU 75 ADAHRS 1"],
  audioGia1: ["Avionics panel (centre console)"],
  audioGia2: ["Avionics panel (centre console)"],
};
/** Harnesses that end on the same units as these paths (the MAG wiring at MAG 1 and ADAHRS 1): exempt only near a path end. */
const SHARED_TERMINAL = ["MAG 1 wiring", "MAG 2 wiring"],
  TERMINAL = 0.03;
/**
 * The instrument panel slab is modelled without its display cut-outs: a point inside a bezel's outline, inset by the tube
 * radius, is in the cut-out the display chassis passes through, not in the panel.
 */
const bezels = ["PFD bezel", "MFD bezel"].map((n) => solids.find((s) => s.name === n)!.world);
const inCutout = (p: THREE.Vector3, r: number) =>
  bezels.some((b) => p.y >= b.min.y + r && p.y <= b.max.y - r && p.z >= b.min.z + r && p.z <= b.max.z - r);

/** Each path's end units, by name, as in the fleet-wide end table (tests/sr22t-flow-anchors.test.ts). */
const ADAHRS = "GSU 75 ADAHRS 1",
  GIA1 = "GIA 1 (GIA 63W)",
  GIA2 = "GIA 2 (GIA 63W)",
  CB = "Circuit breaker panel",
  GEA = "GEA 71 Engine Airframe Unit",
  GMA = "GMA 350 audio panel";
const ENDS: Record<string, string[]> = {
  magData: ["Magnetometer (GMU 44, MAG 1)", ADAHRS, "MAG 1 wiring"],
  magData2: ["Magnetometer (GMU 44, MAG 2)", "GSU 75 ADAHRS 2", "MAG 2 wiring"],
  adahrs2Mfd: ["GSU 75 ADAHRS 2", "MFD bezel"],
  adahrs2Gia1: [GIA1, "GSU 75 ADAHRS 2"],
  adahrs2Gia2: ["GSU 75 ADAHRS 2", GIA2],
  oatData1: ["OAT sensor 1", ADAHRS],
  oatData2: ["OAT sensor 2", "GSU 75 ADAHRS 2"],
  adahrsPfd: [ADAHRS, "PFD bezel"],
  adahrsGia1: [ADAHRS, GIA1],
  adahrsGia2: [GIA2, ADAHRS],
  gia1Pfd: [GIA1, "PFD bezel"],
  gia2Mfd: [GIA2, "MFD bezel"],
  pfdMfd: ["PFD bezel", "MFD bezel"],
  geaData: [GEA, GIA1],
  geaData2: [GEA, GIA2],
  xpdrData: ["GTX 335/345 transponder", GIA1],
  audioGia1: [GMA, GIA1],
  audioGia2: [GMA, GIA2],
  trafficData: ["GTS 800 traffic processor (optional)", GIA2],
  wxData: ["WX-500 processor (optional)", GIA2],
  dmeData: ["KN 63 DME receiver (optional)", GIA2],
  pfdFeedA: [CB, "PFD bezel"],
  pfdFeedB: [CB, "PFD bezel"],
  mfdFeedA: [CB, "MFD bezel"],
  mfdFeedB: [CB, "MFD bezel"],
  iauCool: ["Avionics (IAU) cooling fan", GIA1],
  iauCool2: [GIA2],
};

export const auditPathClearance = (keys: string[]) => {
  // exact mesh distances over every part near 22 paths take seconds, not milliseconds: an explicit budget
  it.each(keys)(
    "%s clears unrelated solids by its full tube radius",
    (key) => {
      expect(solids.length).toBeGreaterThan(300);
      const names = new Set(solids.map((s) => s.name));
      const hits: string[] = [];
      const f = flow(key),
        curve = curveOf(f.pts, f.tension ?? 0.3),
        r = f.r! + (OAT_KEYS.includes(key) ? 0.005 + curve.getLength() / 6000 : 0),
        points = samples(f),
        bounds = new THREE.Box3().setFromPoints(points).expandByScalar(r);
      // only the named end units and the documented THROUGH solids are exempt, never a solid that merely sits near an end
      const own = new Set([...ENDS[key], ...(THROUGH[key] ?? [])]);
      for (const n of own) expect(names.has(n), `${key}: no solid named ${n}`).toBe(true);
      const strict = [...OAT_KEYS, "magData", ...SECOND_LINKS.map(([k]) => k)].includes(key);
      const near = solids.filter(
        (s) =>
          // Reject only solids outside the sampled path's clearance envelope.
          bounds.intersectsBox(s.world) &&
          !own.has(s.name) &&
          s.name !== `flow:${key}` &&
          (OAT_KEYS.includes(key) || !s.name.endsWith("wing tank")) &&
          (strict || (!s.name.startsWith("flow:") && !s.moving)),
      );
      for (const p of points)
        for (const s of near) {
          if (s.world.distanceToPoint(p) >= r) continue;
          const otherConnectionPoints = SHARED_TERMINAL.includes(s.name)
            ? [MAG_WIRES[s.name === "MAG 1 wiring" ? 1 : 2][0], MAG_WIRES[s.name === "MAG 1 wiring" ? 1 : 2].at(-1)!]
            : s.name.startsWith("flow:")
              ? flow(s.name.slice(5)).pts
              : [];
          if (f.pts.some((q) => toV(q).distanceTo(p) < TERMINAL && otherConnectionPoints.some((e) => same(q, e))))
            continue;
          if (s.name === "Instrument panel" && inCutout(p, r)) continue;
          if (s.dist(p) < r && !hits.some((h) => h.startsWith(`${key} in ${s.name}:`)))
            hits.push(
              `${key} in ${s.name}: ${p
                .toArray()
                .map((v) => v.toFixed(4))
                .join(",")}`,
            );
        }
      expect([...new Set(hits)]).toEqual([]);
    },
    120_000,
  );
};

export {
  COOL_KEYS,
  DATA_KEYS,
  FEED_KEYS,
  first,
  flow,
  frames,
  last,
  NEW_KEYS,
  OAT_KEYS,
  rates,
  rodRadii,
  ROUTED_KEYS,
  same,
  samples,
  SECOND_LINKS,
  solids,
  swept,
};
