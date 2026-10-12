/** Front occupants: POH 13772-007 Fig 6-3 Loading Data (PDF p. 222), FS 143.5; rear occupants FS 180. */
import { Box3, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { WR, doorHinge, doorRotation, inFus, wC, wLE, wY } from "@/aircraft/sr22t/geometry";
import { initialSim, live } from "@/aircraft/sr22t/model";
import { FLOWS } from "@/aircraft/sr22t/flows";
import {
  CAPS_CABLE,
  CAT,
  CYLS,
  NOSE_CASTER,
  NOSE_GEAR,
  OXY,
  PROP,
  YOKES,
  YOKE_X,
  YOKE_Y,
  cylOrigin,
} from "@/aircraft/sr22t/parts";
import { AC } from "@/aircraft/sr22t/parts/aircon";
import { CAPS_HANDLE_ATTACH, CAPS_HANDLE_POS, FRONT_SEAT, REAR_SEAT } from "@/aircraft/sr22t/parts/cabin";
import { BLOWER } from "@/aircraft/sr22t/parts/environment";
import { AIL_SECTOR, CARR, ETT, PULLEYS, RUD_HORN, rigPose } from "@/aircraft/sr22t/rig";
import type { PartSpec } from "@/lib/catalogue";

const named = (name: string) => CAT.parts.filter((p) => p.name === name);
/** Each seat name has two parts: the cushion first, then the reclined back (parts/cabin.ts). */
const front = [...named("Pilot seat"), ...named("Front passenger seat")];
const frontCushions = [named("Pilot seat")[0], named("Front passenger seat")[0]];
const frontBacks = [named("Pilot seat")[1], named("Front passenger seat")[1]];
const rearCushions = [named("Rear seat (2+1 bench)")[0], named("Rear seat")[0]];
// Every solid whose world placement follows the front seats: the seats and the parts placed from them.
const moved = [
  ...front,
  ...named("CAPS activation T-handle"),
  ...named("CAPS handle receptacle"),
  ...named("CAPS activation handle cover"),
  ...named("CAPS cover black forward tab"),
  ...named("GTS 800 traffic processor (optional)"),
  ...named("Cabin microphone"),
  ...named("A/C evaporator"),
  ...named("Expansion valve"),
  ...named("Recirculation check valve"),
  ...named("Blower fan assembly"),
];
/** Model x → fuselage station; 39.37 is rounded inches/metre, independent of the published fsX scale. */
const FS = (x: number) => 100 + (2.61 - x) * 39.37;

/** World-placed triangles of a part: moving groups at their neutral pose, doors closed, as Airplane/ControlRig mount them. */
interface Solid {
  tris: Vector3[][];
  box: Box3;
  closed: boolean;
}
const pose = rigPose(initialSim);
const parentMatrix = (parent: string) => {
  const m = new Matrix4();
  if (parent.startsWith("door:")) {
    const key = parent.slice(5) as "L" | "R" | "bag";
    return m.compose(doorHinge(key).pivot, doorRotation(key, live.doors[key]), new Vector3(1, 1, 1));
  }
  const at = (v: readonly number[]) => m.makeTranslation(v[0], v[1], v[2]);
  const pulley = parent.startsWith("rig:pul:") ? PULLEYS[parent.slice(8)] : undefined;
  const cylinder = CYLS.find((c) => parent === `cyl:${c.n}`);
  const surface = CAT.surfaces.find((sf) => parent === `surf:${sf.key}`);
  const yoke = YOKES.find((y) => parent === `yoke:${y.side}` || parent === `grip:${y.side}`);
  if (cylinder) return at(cylOrigin(cylinder));
  if (surface) return at(surface.pivot);
  if (yoke) return at([YOKE_X, YOKE_Y, yoke.z]);
  if (pulley) {
    const axis = new Vector3(pulley.axis === "x" ? 1 : 0, pulley.axis === "y" ? 1 : 0, pulley.axis === "z" ? 1 : 0);
    const turn = new Matrix4().makeRotationAxis(axis, pose.pulley[parent.slice(8)]);
    return at(pulley.c).multiply(turn);
  }
  if (parent === "rig:ett") return at(ETT.c).multiply(new Matrix4().makeRotationZ(pose.ett));
  if (parent === "rig:ailSector") return at(AIL_SECTOR.c).multiply(new Matrix4().makeRotationX(pose.ailSector));
  if (parent === "rig:rudHorn") return at(RUD_HORN.c).multiply(new Matrix4().makeRotationY(pose.rudHorn));
  if (parent.startsWith("rig:carr:"))
    return at([CARR.x, CARR.y, parent.endsWith("L") ? -CARR.z : CARR.z]).multiply(
      new Matrix4().makeRotationX(pose.carr),
    );
  if (parent === "rig:pedL") return at([-pose.pedal, 0, 0]);
  if (parent === "rig:pedR") return at([pose.pedal, 0, 0]);
  if (parent === "noseGear") return at(NOSE_GEAR);
  if (parent === "caster")
    return at([NOSE_CASTER[0] + NOSE_GEAR[0], NOSE_CASTER[1] + NOSE_GEAR[1], NOSE_CASTER[2] + NOSE_GEAR[2]]);
  if (parent.startsWith("blade:"))
    return at(PROP).multiply(new Matrix4().makeRotationX((Number(parent.slice(6)) * Math.PI * 2) / 3));
  throw new Error(`Unplaced catalogue parent ${parent}`);
};
const solids = new Map<PartSpec, Solid>();
const solidOf = (p: PartSpec): Solid => {
  const cached = solids.get(p);
  if (cached) return cached;
  const m = new Matrix4().compose(
    new Vector3(...(p.pos ?? [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
    new Vector3(...(p.scale ?? [1, 1, 1])),
  );
  if (p.parent) m.premultiply(parentMatrix(p.parent));
  const g: BufferGeometry = p.geo().applyMatrix4(m);
  const pos = g.getAttribute("position"),
    index = g.getIndex();
  const vertex = (i: number) => new Vector3().fromBufferAttribute(pos, index ? index.getX(i) : i);
  const n = index ? index.count : pos.count;
  const tris: Vector3[][] = [];
  for (let i = 0; i + 2 < n; i += 3) tris.push([vertex(i), vertex(i + 1), vertex(i + 2)]);
  g.computeBoundingBox();
  const s = { tris, box: g.boundingBox!.clone(), closed: !p.parent?.startsWith("door:") };
  g.dispose();
  solids.set(p, s);
  return s;
};
const box = (p: PartSpec) => solidOf(p).box;

const EPS = 1e-6;
const e1 = new Vector3(),
  e2 = new Vector3(),
  h = new Vector3(),
  sv = new Vector3(),
  q = new Vector3(),
  dir = new Vector3();
/** Möller–Trumbore: parameter t along origin + t·d where it crosses triangle (a, b, c), or null. Flush faces don't count. */
const cross = (origin: Vector3, d: Vector3, [a, b, c]: Vector3[]) => {
  e1.subVectors(b, a);
  e2.subVectors(c, a);
  h.crossVectors(d, e2);
  const det = e1.dot(h);
  if (Math.abs(det) < 1e-12) return null;
  sv.subVectors(origin, a);
  const u = sv.dot(h) / det;
  if (u < EPS || u > 1 - EPS) return null;
  q.crossVectors(sv, e1);
  const w = d.dot(q) / det;
  if (w < EPS || u + w > 1 - EPS) return null;
  return e2.dot(q) / det;
};
const triBox = (t: Vector3[]) => new Box3().setFromPoints(t);
/** Some edge of one triangle pierces the other's interior. */
const trisMeet = (a: Vector3[], b: Vector3[]) => {
  for (const [p, o] of [
    [a, b],
    [b, a],
  ])
    for (let i = 0; i < 3; i++) {
      const s = p[i],
        e = p[(i + 1) % 3];
      dir.subVectors(e, s);
      const t = cross(s, dir, o);
      if (t !== null && t > EPS && t < 1 - EPS) return true;
    }
  return false;
};
/** Ray parity: a point inside a closed solid crosses its surface an odd number of times. A point on the solid's bounding
 * box (a face flush against it) is not inside. */
const inside = (point: Vector3, s: Solid) => {
  if (!s.closed || !s.box.clone().expandByScalar(-EPS).containsPoint(point)) return false;
  const d = new Vector3(0.5773, 0.5774, 0.5775);
  let hits = 0;
  for (const t of s.tris) {
    const at = cross(point, d, t);
    if (at !== null && at > 0) hits++;
  }
  return hits % 2 === 1;
};
const hits = (pa: PartSpec, pb: PartSpec) => {
  const a = solidOf(pa),
    b = solidOf(pb);
  if (!a.box.intersectsBox(b.box)) return false;
  const near = b.tris.filter((t) => a.box.intersectsBox(triBox(t)));
  for (const ta of a.tris) {
    if (!b.box.intersectsBox(triBox(ta))) continue;
    for (const tb of near) if (trisMeet(ta, tb)) return true;
  }
  return inside(a.tris[0][0], b) || inside(b.tris[0][0], a);
};

describe("SR22T front occupant station", () => {
  it("ties each seat row to its POH occupant station: front FS 143.5, rear FS 180 (POH Fig 6-3, PDF p. 222)", () => {
    expect(front).toHaveLength(4);
    expect(FS(FRONT_SEAT.referenceX)).toBeCloseTo(143.5, 3);
    expect(FS(REAR_SEAT.referenceX)).toBeCloseTo(180, 3);
    for (const p of frontCushions) {
      const b = box(p);
      // The front occupant arm sits on the cushion, which mostly lies forward of it.
      expect(FRONT_SEAT.referenceX).toBeGreaterThan(b.min.x);
      expect(FRONT_SEAT.referenceX).toBeLessThan(b.max.x);
      expect(b.getCenter(new Vector3()).x).toBeGreaterThan(FRONT_SEAT.referenceX);
      expect(p.pos![0] - FRONT_SEAT.cushionOffset).toBeCloseTo(FRONT_SEAT.referenceX, 8);
      // Extent: FS ~131 to ~150.
      expect(FS(b.max.x)).toBeGreaterThan(130);
      expect(FS(b.min.x)).toBeLessThan(150.5);
    }
    // The reclined back rises from the cushion's aft edge, aft of the occupant arm (back centre FS ~150.3).
    for (const p of frontBacks) {
      expect(p.pos![0]).toBeLessThan(FRONT_SEAT.referenceX);
      expect(FS(p.pos![0])).toBeCloseTo(150.3, 0);
      expect(Math.abs(p.pos![0] - box(frontCushions[0]).min.x)).toBeLessThan(0.03);
    }
    for (const p of rearCushions) expect(p.pos![0] - REAR_SEAT.cushionOffset).toBeCloseTo(REAR_SEAT.referenceX, 8);
  });

  it("puts the main spar and the forward wing attach points under the front seats (POH 7-5, 7-6)", () => {
    const cushion = box(frontCushions[0]);
    // Spar centreline inside the fuselage (parts/structure.ts), radius 0.04.
    const sx = wLE(WR) - 0.3 * wC(WR),
      sy = wY(WR) + 0.02 * wC(WR);
    expect(sx).toBeGreaterThan(cushion.min.x);
    expect(sx).toBeLessThan(cushion.max.x);
    expect(sy + 0.04).toBeLessThan(cushion.min.y);
    // Four attach points: two under the front seats, two on the sidewall aft of the rear seats (POH 7-5).
    const all = named("Wing attach point");
    expect(all).toHaveLength(4);
    const attach = [...all].sort((a, b) => box(b).min.x - box(a).min.x).slice(0, 2);
    for (const p of attach) {
      const c = box(p).getCenter(new Vector3());
      expect(c.x).toBeGreaterThan(cushion.min.x);
      expect(c.x).toBeLessThan(cushion.max.x);
      expect(c.y).toBeLessThan(FRONT_SEAT.lift - 0.45);
    }
  });

  it("leaves a positive gap from the front seat back's aft face to the rear cushion's front edge", () => {
    expect(frontBacks.every((p) => p.pos![0] === FRONT_SEAT.referenceX + FRONT_SEAT.backOffset)).toBe(true);
    const backAft = Math.min(...frontBacks.map((p) => box(p).min.x)),
      rearFront = Math.max(...rearCushions.map((p) => box(p).max.x));
    expect(backAft - rearFront).toBeGreaterThan(0.25);
  });

  it("clears the yokes, console, rudder pedals, doors and rear cushions", () => {
    const groups: Record<string, PartSpec[]> = {
      yokes: CAT.parts.filter((p) => p.parent?.startsWith("yoke:") || p.parent?.startsWith("grip:")),
      console: [
        ...named("Center console"),
        ...named("Circuit breaker panel"),
        ...named("Armrest: egress hammer & hour meters"),
      ],
      pedals: CAT.parts.filter((p) => p.parent === "rig:pedL" || p.parent === "rig:pedR"),
      doors: CAT.parts.filter((p) => p.parent === "door:L" || p.parent === "door:R"),
      rear: rearCushions,
    };
    // The cushion's forward edge stays aft of the yoke station (FS ~123), and of every yoke and pedal part.
    const cushionFront = Math.max(...frontCushions.map((p) => box(p).max.x));
    expect(cushionFront).toBeCloseTo(
      FRONT_SEAT.referenceX + FRONT_SEAT.cushionOffset + FRONT_SEAT.cushionLength / 2,
      6,
    );
    expect(cushionFront).toBeLessThan(YOKE_X);
    for (const p of [...groups.yokes, ...groups.pedals]) expect(box(p).min.x, p.name).toBeGreaterThan(cushionFront);
    const offenders: string[] = [];
    for (const [group, parts] of Object.entries(groups)) {
      expect(parts.length, group).toBeGreaterThan(0);
      for (const seat of front)
        for (const other of parts) if (hits(seat, other)) offenders.push(`${seat.name} / ${other.name} (${group})`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the front seats and every part placed from them clear of all other catalogue solids", () => {
    // Over the seat-back shoulder line (POH 7-96: above the pilot's right shoulder).
    expect(CAPS_HANDLE_POS[0]).toBeCloseTo(FRONT_SEAT.referenceX + FRONT_SEAT.backOffset + 0.07, 8);
    expect(moved).toHaveLength(14);
    // The T-handle is stowed inside its receptacle, joined to its cable (POH 7-96).
    const caps = ["CAPS activation T-handle", "CAPS handle receptacle", "CAPS activation cable"];
    const offenders: string[] = [];
    for (const target of moved)
      for (const other of CAT.parts) {
        if (other === target) continue;
        // A seat's back is joined to its own cushion by design (POH 7-27).
        if (front.includes(target) && front.includes(other) && target.name === other.name) continue;
        if (caps.includes(target.name ?? "") && caps.includes(other.name ?? "")) continue;
        if (hits(target, other))
          offenders.push(`${target.name} / ${other.name ?? other.id} (${other.parent ?? "fixed"})`);
      }
    expect(offenders).toEqual([]);
  });

  it("keeps the front seats inside the cabin hull", () => {
    for (const p of frontCushions) expect(p.pos![0]).toBeCloseTo(FRONT_SEAT.referenceX + FRONT_SEAT.cushionOffset, 8);
    for (const seat of front)
      for (const t of solidOf(seat).tris) for (const v of t) expect(inFus(v), seat.name).toBe(true);
  });
  it("keeps each part placed from the front seats at its source placement", () => {
    const [lh, rh] = frontCushions.map(box);
    const over = (x: number, b: Box3) => x > b.min.x && x < b.max.x;
    // CAPS T-handle over the reclined back's top, above the pilot's right shoulder (POH 7-96; Fig 7-4 item 1).
    const back = box(frontBacks[0]);
    expect(over(CAPS_HANDLE_POS[0], back)).toBe(true);
    expect(CAPS_HANDLE_POS[1]).toBeGreaterThan(back.max.y);
    // Front reading lights above each front occupant (POH 7-59).
    const lights = named("Reading light").filter((p) => over(p.pos![0], lh));
    expect(lights.map((p) => Math.sign(p.pos![2])).sort()).toEqual([-1, 1]);
    for (const p of lights) expect(p.pos![1]).toBeGreaterThan(lh.max.y);
    // GTS 800 under the LH crew seat (POH 7-84, Fig 7-20 item 30).
    const gts = box(named("GTS 800 traffic processor (optional)")[0]).getCenter(new Vector3());
    expect(over(gts.x, lh) && gts.z > lh.min.z && gts.z < lh.max.z && gts.y < lh.min.y).toBe(true);
    // Microphone beside the centre console between the front seats, just aft of the circuit breaker panel (POH 7-88,
    // Fig 7-20 item 29).
    const mic = box(named("Cabin microphone")[0]);
    expect(over(mic.getCenter(new Vector3()).x, lh)).toBe(true);
    expect(mic.max.x).toBeLessThan(box(named("Circuit breaker panel")[0]).min.x);
    // A/C evaporator and its bolted blower under the RH crew seat (POH 7-64; AMM 21-50 PDF pp. 496, 504), forward of the
    // main spar.
    const spar = wLE(WR) - 0.3 * wC(WR);
    for (const name of ["A/C evaporator", "Blower fan assembly"]) {
      const c = box(named(name)[0]).getCenter(new Vector3());
      expect(over(c.x, rh) && c.z > 0 && c.y < rh.min.y, name).toBe(true);
      expect(c.x, name).toBeGreaterThan(spar);
    }
    expect(BLOWER[0]).toBe(AC.evaporator[0]);
    // The refrigerant, air and drain runs still start and end on the evaporator group (POH 7-65).
    const pts = (key: string) => FLOWS.find((f) => f.key === key)!.pts.map((p) => new Vector3(...(p as number[])));
    const at = (p: Vector3, q: readonly number[]) => p.distanceTo(new Vector3(...q));
    expect(at(pts("acLiquid2").at(-1)!, AC.expansion)).toBeLessThan(1e-9);
    for (const key of ["acSuction", "acEvapDuct", "acDrain"])
      expect(at(pts(key)[0], AC.evaporator), key).toBeLessThan(1e-9);
    for (const key of ["acCoupler", "acRecirc"]) expect(at(pts(key).at(-1)!, AC.evaporator), key).toBeLessThan(1e-9);
    expect(at(pts("fanDuct")[0], BLOWER)).toBeLessThan(0.1);
  });

  it("keeps the overhead oxygen console at the cabin centre, aft of the CAPS cover and forward of the speaker", () => {
    // The CAPS handle sits over the front occupants' shoulder line (POH 7-96); the console stays on the dome light at the
    // approximate centre of the cabin (POH 7-59; AFMS Fig 1), one grouped panel carrying all five outlets.
    const unit = box(named("Overhead distribution manifold")[0]);
    for (const name of ["CAPS activation handle cover", "CAPS handle receptacle", "CAPS cover black forward tab"])
      expect(unit.max.x, name).toBeLessThan(box(named(name)[0]).min.x);
    expect(unit.min.x).toBeGreaterThan(box(named("Cabin speaker")[0]).max.x);
    expect(OXY.outlets).toHaveLength(5);
    for (const p of OXY.outlets) expect(unit.distanceToPoint(new Vector3(...p))).toBeLessThan(0.03);
  });

  it("runs the CAPS activation cable from the moved handle, clear of the overhead console and speaker", () => {
    // Handle → roof → igniter (AMM Fig 95-00-1, PDF p. 2853); the run turns outboard over the shoulder-line handle.
    expect(CAPS_CABLE[0]).toEqual(CAPS_HANDLE_ATTACH);
    expect(CAPS_CABLE[2][2]).toBeCloseTo(-0.12, 9);
    const cable = named("CAPS activation cable")[0];
    for (const name of ["Overhead distribution manifold", "Dome light", "Cabin speaker"])
      expect(hits(cable, named(name)[0]), name).toBe(false);
  });
});
