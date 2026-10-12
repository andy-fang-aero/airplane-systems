/**
 * SR22T trim systems, rudder-aileron interconnect and GFC 700 servo linkages against POH 13772-007 7-6 –
 * 7-11 and Figure 7-20 Equipment Locations (7-88), and AMM 13773-002 Rev 7 22-10, 27-10, 27-20, 27-30, Fig 6-00-6 and
 * Fig 6-00-8.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AB, FW, inFus } from "@/aircraft/sr22t/geometry";
import { CAT } from "@/aircraft/sr22t/parts";
import {
  AIL_SECTOR,
  CABLES,
  CARR,
  ELEV_HORN,
  ETT,
  FLOOR_HOLES,
  PULLEYS,
  RUD_HORN,
  type FloorHole,
} from "@/aircraft/sr22t/rig";
import { chanOfKey, type PartSpec } from "@/lib/catalogue";
import type { Vec3 } from "@/lib/math";

const named = (name: string): PartSpec[] => CAT.parts.filter((p) => p.name === name);
const one = (name: string): PartSpec => {
  const l = named(name);
  expect(l, name).toHaveLength(1);
  return l[0];
};
/** Fuselage station (inches) of a model x; FS 100 is the firewall (POH Fig. 1-1). */
const FS = (x: number) => 100 + (FW - x) / 0.0254;
const inHole = (p: Vec3 | THREE.Vector3, hole: FloorHole) => {
  const h = FLOOR_HOLES[hole],
    [x, , z] = Array.isArray(p) ? p : p.toArray();
  return Math.abs(x - h.x) <= h.hx && Math.abs(z - h.z) <= h.hz;
};

/** Origin of each moving group at neutral controls, so parented parts can be placed in the airplane frame. */
const YOKE = { x: 2.02, y: -0.06 };
function groupOrigin(parent: string | undefined): Vec3 | null {
  if (!parent) return [0, 0, 0];
  if (parent === "yoke:L" || parent === "grip:L") return [YOKE.x, YOKE.y, -0.46];
  if (parent === "yoke:R" || parent === "grip:R") return [YOKE.x, YOKE.y, 0.46];
  if (parent.startsWith("rig:pul:")) return PULLEYS[parent.slice(8)].c;
  if (parent === "rig:ett") return ETT.c;
  if (parent === "rig:carr:L") return [CARR.x, CARR.y, -CARR.z];
  if (parent === "rig:carr:R") return [CARR.x, CARR.y, CARR.z];
  if (parent === "rig:ailSector") return AIL_SECTOR.c;
  if (parent === "rig:rudHorn") return RUD_HORN.c;
  if (parent === "rig:pedL" || parent === "rig:pedR") return [0, 0, 0];
  if (parent.startsWith("surf:")) return CAT.surfacePivot(parent.slice(5));
  return null;
}
/** A part's vertices in the airplane frame (rot and pos applied, on its group at neutral), or null off a known group. */
function worldPoints(p: PartSpec): THREE.Vector3[] | null {
  const o = groupOrigin(p.parent);
  if (!o) return null;
  const g = p.geo(),
    a = g.getAttribute("position"),
    e = new THREE.Euler(...(p.rot ?? [0, 0, 0])),
    t = new THREE.Vector3(...(p.pos ?? [0, 0, 0])).add(new THREE.Vector3(...o)),
    out: THREE.Vector3[] = [];
  for (let i = 0; i < a.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(a, i).applyEuler(e).add(t));
  g.dispose();
  return out;
}
/** World box per part, cached: parts are static specs, and the pairwise checks below read each box many times. */
const boxes = new Map<PartSpec, THREE.Box3 | null>();
const worldBox = (p: PartSpec) => {
  if (!boxes.has(p)) {
    const pts = worldPoints(p);
    boxes.set(p, pts ? new THREE.Box3().setFromPoints(pts) : null);
  }
  const b = boxes.get(p);
  return b ? b.clone() : null;
};
const tubes = new Map<PartSpec, boolean>();
const tube = (p: PartSpec) => {
  if (!tubes.has(p)) tubes.set(p, p.geo().type === "TubeGeometry");
  return tubes.get(p)!;
};
/** Closest distance from point q to a part's surface vertices. */
const distTo = (q: Vec3, p: PartSpec) => Math.min(...worldPoints(p)!.map((v) => v.distanceTo(new THREE.Vector3(...q))));
/** Distance from q to the nearest segment of any control cable on channel `chan`. */
function distToCable(q: Vec3, chan: string) {
  const v = new THREE.Vector3(...q);
  let best = Infinity;
  for (const c of CABLES.filter((c) => chanOfKey(c.key)?.includes(chan as never)))
    for (let i = 0; i < c.pts.length - 1; i++) {
      const l = new THREE.Line3(new THREE.Vector3(...c.pts[i]), new THREE.Vector3(...c.pts[i + 1]));
      best = Math.min(best, l.closestPointToPoint(v, true, new THREE.Vector3()).distanceTo(v));
    }
  return best;
}

/** Parts this section adds or moves, by name (each name's parts, plus the unnamed bolts and shafts registered between them). */
const TRIM_PARTS = [
  "Pitch trim motor",
  "Pitch trim actuation arm",
  "Pitch trim cartridge",
  "Roll trim cartridge",
  "Roll trim motor",
  "Roll trim motor offset arm",
  "Yaw trim spring cartridge",
  "Trim system relays",
  "Rudder-aileron interconnect",
  "Pitch trim reference mark",
  "Pitch trim reference tab",
  "Roll trim reference line",
  "Roll trim centering mark",
  "Pitch servo capstan",
  "Pitch servo bridle cable",
  "Roll servo capstan",
  "Roll servo bridle cable",
  "Yaw servo capstan",
  "Yaw servo bridle cable",
  "Bridle cable clamp",
];
const SERVOS = [
  "Pitch servo actuator (GSA 81)",
  "Roll servo actuator (GSA 81)",
  "Yaw servo actuator (GSA 80)",
  "Pitch trim adapter",
];
const BRIDLE = { pitch: "elevator", roll: "aileron", yaw: "rudder" } as const;
/** The section's parts: everything registered from the first trim part on (controls-trim.ts is its own section). */
const sectionParts = () => {
  const first = CAT.parts.findIndex((p) => p.name === "Pitch trim motor"),
    last = CAT.parts.findIndex((p) => p.name === "Battery 2 shelf") - 1;
  return CAT.parts.slice(first, last + 1);
};

describe("SR22T trim systems and servo linkages (POH 7-6 – 7-11, Fig 7-20; AMM 22-10, 27-10, 27-20, 27-30)", () => {
  it("the roll trim cartridge is bolted to the LH aileron actuation pulley (AMM 27-10 PDF 946; POH 7-9)", () => {
    const cart = one("Roll trim cartridge"),
      aw = PULLEYS.awL.c;
    expect(distTo(aw, cart)).toBeLessThanOrEqual(0.1);
    const b = worldBox(cart)!;
    // on the left wing, spanwise along the spar, drawn at the AMM's initial length 9.4 in (24.1 cm); the final rigged length
    // is adjusted for 6 ± 1° of trim deflection (AMM 27-10 PDF p. 980 step (g))
    expect(b.max.z).toBeLessThan(0);
    const len = (cart.geo() as THREE.TubeGeometry).parameters.path.getLength();
    expect(len / 0.0254).toBeCloseTo(9.4, 1);
    expect(Math.abs(b.min.z - aw[2])).toBeLessThan(0.05);
    // the motor is at the cartridge's inboard end, on the same wing
    const motor = one("Roll trim motor").pos!;
    expect(motor[2]).toBeLessThan(0);
    expect(motor[2]).toBeGreaterThan(b.max.z - 0.012);
    expect(cart.note).toMatch(/LH aileron actuation pulley/);
    // the note tells the initial adjustment length from the final rigged length, as the AMM does
    expect(cart.note).toMatch(/initial length of trim cartridge to 9\.4 inches \(24\.1 cm\)/);
    expect(cart.note).toMatch(/final rigged length .*6 ± 1° of aileron trim deflection/);
    expect(cart.note).not.toMatch(/Rigged length 9\.4/);
    // not on the right wing's pulley
    expect(distTo(PULLEYS.awR.c, cart)).toBeGreaterThan(1);
  });

  it("pitch trim cartridge on the elevator bellcrank (LE2) and its motor at RE1 (AMM 27-30; Fig 6-00-8)", () => {
    const cart = one("Pitch trim cartridge"),
      motor = one("Pitch trim motor"),
      ea = PULLEYS.ea.c;
    expect(new THREE.Vector3(...cart.pos!).distanceTo(new THREE.Vector3(...ea))).toBeLessThan(0.15);
    expect(cart.pos![2]).toBeLessThan(0);
    expect(motor.pos![2]).toBeGreaterThan(0);
    // motor on the forward face of the FS 306 bulkhead (AMM 27-30 PDF pp. 1026–1027)
    expect(FS(motor.pos![0])).toBeLessThan(306);
    expect(FS(motor.pos![0])).toBeGreaterThan(300);
    // cartridge runs from forward of the bulkhead aft to the elevator bellcrank between the elevator halves
    const b = worldBox(cart)!;
    expect(FS(b.max.x)).toBeLessThan(306);
    expect(Math.abs(b.min.x - ELEV_HORN.c[0])).toBeLessThan(0.01);
    for (const p of [cart, motor]) for (const v of worldPoints(p)!) expect(inFus(v), p.name).toBe(true);
    expect(cart.note).toMatch(/LE2/);
    expect(motor.note).toMatch(/RE1/);
  });

  it("each servo drives its cable through a capstan and bridle (AMM 22-10 PDF 555)", () => {
    for (const [k, chan] of Object.entries(BRIDLE)) {
      const name = k[0].toUpperCase() + k.slice(1);
      // One tube per bridle run, capstan exit → clamp.
      const runs = named(name + " servo bridle cable"),
        cap = one(name + " servo capstan"),
        servo = one(name + " servo actuator (GSA " + (k === "yaw" ? "80" : "81") + ")");
      expect(runs, name).toHaveLength(2);
      const c = new THREE.Vector3(...cap.pos!);
      for (const br of runs) {
        expect(br.chan).toEqual([chan]);
        // each run ends clamped on its own axis's control cable
        const path = (br.geo() as THREE.TubeGeometry).parameters.path,
          e = path.getPointAt(1).toArray() as Vec3;
        expect(distToCable(e, chan), `${name} clamp end`).toBeLessThanOrEqual(0.05);
        expect(
          named("Bridle cable clamp").some(
            (c) => new THREE.Vector3(...c.pos!).distanceTo(new THREE.Vector3(...e)) < 1e-6,
          ),
        ).toBe(true);
        // and starts wrapped on the capstan, which sits on its servo
        expect(Math.min(...worldPoints(br)!.map((v) => v.distanceTo(c)))).toBeLessThan(0.04);
      }
      const sb = worldBox(servo)!;
      expect(sb.distanceToPoint(c)).toBeLessThan(0.03);
      expect(servo.note).toMatch(/GSM 86/);
    }
    expect(named("Bridle cable clamp")).toHaveLength(6);
  });

  it("the rudder-aileron interconnect is under CF3C (Fig 6-00-6)", () => {
    const p = one("Rudder-aileron interconnect");
    expect(p.sys).toContain("controls");
    expect(inHole(p.pos!, "CF3C")).toBe(true);
    expect(p.note).toMatch(/CF3C/);
    expect(p.note).toMatch(/open question/);
    // the trim system relays sit under CF4C, a left and a right relay
    const relays = named("Trim system relays");
    expect(relays).toHaveLength(2);
    for (const r of relays) expect(inHole(r.pos!, "CF4C")).toBe(true);
    expect(relays.map((r) => Math.sign(r.pos![2])).sort()).toEqual([-1, 1]);
  });

  it("servos sit where POH Fig 7-20 puts them (7-88)", () => {
    const at = (n: string) => one(n).pos!;
    const front = Math.min(...named("Front passenger seat").map((p) => p.pos![0]));
    const rear = Math.max(...named("Rear seat").map((p) => p.pos![0]));
    // item 14: on the centreline just aft of the front seats, at CF4C's edge
    const roll = at("Roll servo actuator (GSA 81)");
    expect(Math.abs(roll[2])).toBeLessThan(0.08);
    expect(roll[0]).toBeLessThan(front);
    expect(roll[0]).toBeGreaterThan(rear);
    expect(inHole(SERVO_CAPSTAN("roll"), "CF4C") || inHole(roll, "CF4C")).toBe(true);
    // item 17: on the centreline at the forward end of the baggage floor (FS 186 – 222), at CF5
    const pitch = at("Pitch servo actuator (GSA 81)");
    expect(Math.abs(pitch[2])).toBeLessThan(0.08);
    expect(FS(pitch[0])).toBeGreaterThan(186);
    expect(FS(pitch[0])).toBeLessThan(200);
    expect(inHole(pitch, "CF5")).toBe(true);
    // item 16: right of centre at the aft edge of the rear-seat bay
    const adapter = at("Pitch trim adapter");
    expect(adapter[2]).toBeGreaterThan(0);
    expect(FS(adapter[0])).toBeGreaterThan(175);
    expect(FS(adapter[0])).toBeLessThan(186);
    // item 23: aft of the FS 222 bulkhead, just left of centre
    const yaw = at("Yaw servo actuator (GSA 80)");
    expect(yaw[0]).toBeLessThan(AB);
    expect(yaw[2]).toBeLessThanOrEqual(0);
    expect(FS(yaw[0])).toBeLessThan(250);
    for (const n of SERVOS) expect(one(n).note, n).toMatch(/POH Fig 7-20 \(7-88\) item \d+/);
  });

  it("the neutral-trim marks line up at neutral trim (POH 7-7, 7-9)", () => {
    const mark = one("Pitch trim reference mark"),
      tab = one("Pitch trim reference tab"),
      line = one("Roll trim reference line"),
      ctr = one("Roll trim centering mark");
    expect(mark.parent).toBe("yoke:L");
    expect(line.parent).toBe("grip:L");
    const mx = worldBox(mark)!.getCenter(new THREE.Vector3()),
      tb = worldBox(tab)!;
    expect(mx.x).toBeGreaterThanOrEqual(tb.min.x);
    expect(mx.x).toBeLessThanOrEqual(tb.max.x);
    expect(mx.z).toBeGreaterThanOrEqual(tb.min.z);
    expect(mx.z).toBeLessThanOrEqual(tb.max.z);
    // the tab reaches from the bolster's end over the yoke tube
    expect(tb.max.z).toBeCloseTo(-0.4, 2);
    const lz = worldBox(line)!.getCenter(new THREE.Vector3()).z;
    expect(Math.abs(lz - ctr.pos![2])).toBeLessThan(0.002);
  });

  it("the cartridges moved out of the cabin section, keeping their names", () => {
    const idx = (n: string) => CAT.parts.findIndex((p) => p.name === n);
    for (const n of ["Pitch trim cartridge", "Roll trim cartridge", "Yaw trim spring cartridge"]) {
      expect(named(n), n).toHaveLength(1);
      // registered with this section, after the GFC 700 block of controls.ts
      expect(idx(n), n).toBeGreaterThan(idx("Pitch trim adapter"));
      expect(one(n).pin, n).toBe(true);
    }
    expect(idx("Pitch trim adapter")).toBeLessThan(idx("Pitch trim motor"));
  });

  it("every part this section adds or moves cites its source and sits inside the airframe", () => {
    for (const n of [...TRIM_PARTS, ...SERVOS])
      for (const p of named(n)) {
        expect(p.note, n).toMatch(/(POH|AMM) /);
        expect(p.sys, n).toEqual(["controls"]);
        expect(p.ext, n).toBeFalsy();
      }
    // under the skin: the fuselage parts, and the roll trim parts inside the wing section
    for (const p of sectionParts().filter((p) => !(p.name ?? "").startsWith("Roll trim ")))
      for (const v of worldPoints(p)!) expect(inFus(v), `${p.name} ${v.toArray().join()}`).toBe(true);
  });

  it("trim motors, servos and bridles clear the control cables (AMM 22-10, 27-10; rig.ts CABLES)", () => {
    /** Control cables are drawn as tubes of this radius (flows.ts). */
    const CABLE_R = 0.005;
    const segs = CABLES.flatMap((c) =>
      c.pts
        .slice(1)
        .map((b, i) => ({ key: c.key, l: new THREE.Line3(new THREE.Vector3(...c.pts[i]), new THREE.Vector3(...b)) })),
    );
    const byKey = new Map(CABLES.map((c) => [c.key, segs.filter((s) => s.key === c.key).map((s) => s.l)]));
    const tmp = new THREE.Vector3();
    const gap = (q: THREE.Vector3, key: string) =>
      Math.min(...byKey.get(key)!.map((l) => l.closestPointToPoint(q, true, tmp).distanceTo(q)));
    const mine = sectionParts().filter((p) => worldBox(p));
    const cablePts = segs.flatMap((s) =>
      Array.from({ length: 101 }, (_, i) => ({ key: s.key, q: s.l.at(i / 100, new THREE.Vector3()) })),
    );
    // solids: no cable passes through them; the bridle clamps sit on their cable by design
    for (const p of mine.filter((p) => !tube(p) && p.name !== "Bridle cable clamp")) {
      const box = worldBox(p)!.expandByScalar(CABLE_R);
      const hit = cablePts.find(({ q }) => box.containsPoint(q));
      expect(hit, `${hit?.key} runs through ${p.name ?? "(unnamed)"} at ${hit?.q.toArray().join()}`).toBeUndefined();
    }
    // tubes (bridles, roll trim cartridge): every cable stays at least the two radii away, except a bridle at its own clamps
    for (const p of mine.filter(tube)) {
      const g = p.geo() as THREE.TubeGeometry,
        path = g.parameters.path,
        r = g.parameters.radius,
        ends = [path.getPointAt(1)]; // a bridle run's clamp end
      const samples = Array.from({ length: 401 }, (_, i) => path.getPointAt(i / 400)).filter(
        (q) => !((p.name ?? "").endsWith("bridle cable") && ends.some((e) => e.distanceTo(q) < 0.03)),
      );
      for (const c of CABLES) {
        const close = samples.find((q) => gap(q, c.key) <= r + CABLE_R);
        expect(close, `${p.name} touches ${c.key} at ${close?.toArray().join()}`).toBeUndefined();
      }
    }
    // the roll bridle leaves the top of its capstan, the pitch and yaw bridles the bottom (AMM 22-10 PDF pp. 577, 587–589, 597)
    for (const [k, up] of [
      ["Pitch", false],
      ["Roll", true],
      ["Yaw", false],
    ] as const) {
      const c = one(k + " servo capstan").pos!;
      for (const run of named(k + " servo bridle cable"))
        expect((run.geo() as THREE.TubeGeometry).parameters.path.getPointAt(0).y > c[1], k).toBe(up);
    }
  }, 20_000);

  it("no new part sits inside another solid (world boxes; bridles sampled along their path)", () => {
    const mine = sectionParts();
    // surface marks and the bolts and arms that join an assembly touch their hosts by design
    const host: Record<string, string[]> = {
      "Pitch trim reference mark": ["Yoke tube"],
      "Roll trim reference line": ["Side yoke"],
      "Roll trim centering mark": ["Instrument panel"],
    };
    const others = CAT.parts.filter((p) => !mine.includes(p) && worldBox(p));
    const skipped = CAT.parts.filter((p) => !worldBox(p)).map((p) => p.parent);
    // only spinning propeller blades and similar non-rig groups are left out
    for (const s of skipped) expect(s, String(s)).not.toMatch(/^(rig:|surf:|yoke:|grip:)/);
    const solidBox = (p: PartSpec) => worldBox(p)!.expandByScalar(-0.001);
    for (const a of mine) {
      const okHosts = host[a.name ?? ""] ?? [];
      const against = [...others, ...mine.filter((b) => b !== a)].filter(
        (b) => !okHosts.includes(b.name ?? "") && !(b.plate || b.fairing),
      );
      if (tube(a)) {
        // a bridle or the roll trim cartridge: its centre line must stay out of every other solid except its own capstan,
        // clamps and the pulley it is bolted to
        const path = (a.geo() as THREE.TubeGeometry).parameters.path;
        const ends = [path.getPointAt(0), path.getPointAt(1)];
        const samples = Array.from({ length: 201 }, (_, i) => path.getPointAt(i / 200)).filter(
          (q) => !ends.some((e) => e.distanceTo(q) < 0.02),
        );
        for (const b of against) {
          if (tube(b)) continue;
          const own =
            (b.name ?? "").endsWith("servo capstan") ||
            b.name === "Bridle cable clamp" ||
            (b.name === "Aileron wing sector / crank arm" && a.name === "Roll trim cartridge") ||
            (b.name === "Roll trim motor offset arm" && a.name === "Roll trim cartridge");
          if (own) continue;
          const bb = solidBox(b);
          const hit = samples.find((q) => bb.containsPoint(q));
          expect(hit, `${a.name} passes through ${b.name} at ${hit?.toArray().join()}`).toBeUndefined();
        }
        continue;
      }
      const ab = solidBox(a);
      for (const b of against) {
        if (tube(b)) continue;
        expect(ab.intersectsBox(solidBox(b)), `${a.name ?? "(bolt)"} / ${b.name ?? "(unnamed)"}`).toBe(false);
      }
    }
  });
});

/** Capstan centre of a servo, read from its part. */
function SERVO_CAPSTAN(k: "pitch" | "roll" | "yaw"): Vec3 {
  return one(k[0].toUpperCase() + k.slice(1) + " servo capstan").pos!;
}
