/**
 * Intercoolers: long, flat fore-and-aft cores on top of the side baffles over each bank's rocker covers.
 * Continental M-18 drawing 657645 Fig 5-33 / 5-34 / 5-35 (PDF pp. 148–150); AMM 13773-002 Rev 7 Fig 71-60-2 sheet 2
 * (PDF p. 2558) items 14/16/18/19/21, 71-60 PDF p. 2555, Fig 71-00-2 sheets 1–2 (PDF pp. 2487–2488).
 */
import { describe, expect, it } from "vitest";
import {
  Box3,
  TubeGeometry,
  DoubleSide,
  Euler,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
import type { PartSpec } from "@/lib/catalogue";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { inFus } from "@/aircraft/sr22t/geometry";
import { IGNITION_LEADS, LOWER_DROP, LOWER_RUN_Y } from "@/aircraft/sr22t/parts/engine-ignition";
import { CAT, CYLS } from "@/aircraft/sr22t/parts";
import {
  CYL_BARREL_END,
  CYL_HEAD_BOTTOM,
  CYL_HEAD_TOP,
  cylExhaust,
  cylOrigin,
  injectorAnchor,
} from "@/aircraft/sr22t/parts/engine";
import { ACCESSORY_FACE_X, CRANK_Y, IN } from "@/aircraft/sr22t/engine-datum";
import { COMPRESSOR_OUTLET } from "@/aircraft/sr22t/turbo-layout";
import {
  COMPRESSOR_DUCT,
  INTERCOOLER,
  INTERCOOLER_AFT,
  INTERCOOLER_AFT_FACE_X,
  INTERCOOLER_BASE_Y,
  INTERCOOLER_FRONT_X,
  INTERCOOLER_IN,
  INTERCOOLER_NECK,
  INTERCOOLER_NECK_R,
  INTERCOOLER_OUT,
  INTERCOOLER_OUTER_Z,
  INTERCOOLER_SEAT,
  INTERCOOLER_SIZE,
  INTERCOOLER_WIDTH,
} from "@/aircraft/sr22t/intercooler-layout";

const material = new MeshBasicMaterial({ side: DoubleSide });
const solid = (p: PartSpec) => {
  const g = p.geo();
  g.applyMatrix4(
    new Matrix4().compose(
      new Vector3(...(p.pos ?? [0, 0, 0])),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      new Vector3(...(p.scale ?? [1, 1, 1])),
    ),
  );
  const c = CYLS.find((c) => p.parent === `cyl:${c.n}`);
  if (c) g.translate(...cylOrigin(c));
  g.computeBoundingBox();
  return { p, g, box: g.boundingBox!.clone(), mesh: new Mesh(g, material) };
};
type Solid = ReturnType<typeof solid>;
// Triangle edges against the other mesh in both directions, plus containment, as in the turbo clearance audit.
const edgeCrosses = (a: Solid, b: Solid) => {
  const position = a.g.getAttribute("position"),
    index = a.g.index;
  const count = index?.count ?? position.count;
  const ray = new Raycaster(),
    start = new Vector3(),
    end = new Vector3();
  for (let i = 0; i < count; i += 3)
    for (let j = 0; j < 3; j++) {
      start.fromBufferAttribute(position, index ? index.getX(i + j) : i + j);
      end.fromBufferAttribute(position, index ? index.getX(i + ((j + 1) % 3)) : i + ((j + 1) % 3));
      const direction = end.clone().sub(start),
        length = direction.length();
      if (length < 0.00001) continue;
      ray.set(start, direction.normalize());
      ray.near = 0.00001;
      ray.far = length - 0.00001;
      if (ray.intersectObject(b.mesh).length) return true;
    }
  return false;
};
const inside = (point: Vector3, s: Solid) => {
  if (!s.box.containsPoint(point)) return false;
  const hits = new Raycaster(point, new Vector3(0.137, 0.419, 1).normalize(), 0).intersectObject(s.mesh);
  if (hits.some((h) => h.distance < 0.00001)) return false;
  const exits = hits.filter((h, i) => i === 0 || Math.abs(h.distance - hits[i - 1].distance) > 0.00001);
  return exits.length % 2 === 1;
};
const intersects = (a: Solid, b: Solid) => {
  if (!a.box.clone().expandByScalar(-0.00001).intersectsBox(b.box.clone().expandByScalar(-0.00001))) return false;
  return (
    edgeCrosses(a, b) ||
    edgeCrosses(b, a) ||
    inside(new Vector3().fromBufferAttribute(a.g.getAttribute("position"), 0), b) ||
    inside(new Vector3().fromBufferAttribute(b.g.getAttribute("position"), 0), a)
  );
};
const intercooler = (s: number) => CAT.parts.find((p) => p.name === `${s < 0 ? "LH" : "RH"} intercooler`)!;

describe("SR22T intercoolers (Continental M-18 Figs 5-33/5-34/5-35; AMM Fig 71-60-2 sheet 2)", () => {
  it("each core is a long, flat fore-and-aft box: 12.28 in. (RH) / 11.54 in. (LH) long, outer edge 21.15 in. (RH) / 21.23 in. (LH) from the CL", () => {
    for (const s of [-1, 1]) {
      const c = INTERCOOLER(s),
        [lx, ly, lz] = INTERCOOLER_SIZE(s);
      // the seat footprint is the core's: outer edge on the dimensioned line, 0.16 m inboard of it
      expect(Math.max(...INTERCOOLER_SEAT(s).z.map(Math.abs))).toBeCloseTo((s < 0 ? 21.23 : 21.15) * IN, 8);
      expect(lx).toBeCloseTo((s < 0 ? 11.54 : 12.28) * IN, 8); // dimensioned per core, Fig 5-34 plan
      expect(Math.abs(c[2]) + lz / 2).toBeCloseTo((s < 0 ? 21.23 : 21.15) * IN, 8); // dimensioned per side, Fig 5-34 plan
      expect(Math.sign(c[2])).toBe(s);
      // scaled: bottom ≈1.9 in., top ≈5.0 in. above the crank; inner edge ≈14.8 in. from the CL (±0.5 in.)
      expect(c[1] - ly / 2).toBeCloseTo(CRANK_Y + 1.9 * IN, 8);
      expect(c[1] + ly / 2).toBeCloseTo(CRANK_Y + 5.0 * IN, 8);
      expect(Math.abs(Math.abs(c[2]) - lz / 2 - 14.8 * IN)).toBeLessThan(0.5 * IN);
      // aft face between the accessory face and 1.6 in. forward of it (scaled, Fig 5-35)
      expect(INTERCOOLER_AFT_FACE_X).toBeGreaterThanOrEqual(ACCESSORY_FACE_X);
      expect(INTERCOOLER_AFT_FACE_X).toBeLessThanOrEqual(ACCESSORY_FACE_X + 1.6 * IN);
      expect(c[0] - lx / 2).toBe(INTERCOOLER_AFT_FACE_X); // both aft ends share one station
      expect(Math.abs(c[0] - 2.92)).toBeLessThan(0.01);
      expect(lx).toBeGreaterThan(3 * ly);
      expect(lx).toBeGreaterThan(lz);
    }
  });

  it("a pyramid transition leads forward to a round Ø≈2.5-in. neck ≈17.5 in. forward of the accessory face (Fig 5-34 plan, scaled)", () => {
    for (const s of [-1, 1]) {
      const neck = INTERCOOLER_NECK(s);
      // scaled ≈17–18.7 in. forward of the accessory face
      expect(neck[0]).toBeGreaterThanOrEqual(ACCESSORY_FACE_X + 17 * IN);
      expect(neck[0]).toBeLessThanOrEqual(ACCESSORY_FACE_X + 18.7 * IN);
      expect(INTERCOOLER_NECK_R * 2).toBeCloseTo(2.5 * IN, 8);
      expect(neck[0]).toBeGreaterThan(INTERCOOLER_FRONT_X(s));
      const box = solid(intercooler(s)).box;
      // the drawn part spans the aft nozzle to the neck spigot, no wider or taller than the core
      expect(box.max.x).toBeCloseTo(INTERCOOLER_OUT(s)[0], 6);
      expect(box.min.x).toBeCloseTo(INTERCOOLER_AFT(s)[0], 6);
      expect(box.max.y).toBeCloseTo(INTERCOOLER(s)[1] + INTERCOOLER_SIZE(s)[1] / 2, 6);
      expect(box.max.z - box.min.z).toBeCloseTo(INTERCOOLER_SIZE(s)[2], 6);
    }
  });

  it("the aft port (cabin-heat nozzle 19) sits 18.13 in. outboard and 3.75 in. above the crank; the heat ducts start there", () => {
    for (const s of [-1, 1]) {
      const aft = INTERCOOLER_AFT(s);
      expect(aft[2]).toBeCloseTo(s * 18.13 * IN, 8); // dimensioned, Fig 5-33 rear view
      expect(aft[1]).toBeCloseTo(CRANK_Y + 3.75 * IN, 8); // dimensioned, Fig 5-33 rear view
      expect(aft[0]).toBeLessThan(INTERCOOLER_AFT_FACE_X);
      // inside the core's aft face outline
      expect(Math.abs(aft[1] - INTERCOOLER(s)[1])).toBeLessThan(INTERCOOLER_SIZE(s)[1] / 2);
      expect(Math.abs(aft[2] - INTERCOOLER(s)[2])).toBeLessThan(INTERCOOLER_SIZE(s)[2] / 2);
    }
    expect(FLOWS.find((f) => f.key === "hotIn")!.pts[0]).toEqual(INTERCOOLER_AFT(1));
    expect(FLOWS.find((f) => f.key === "hotL")!.pts[0]).toEqual(INTERCOOLER_AFT(-1));
  });

  it("the base is the exported seat plane and sits above the trimmed cylinder heads (AMM 71-60 PDF p. 2555)", () => {
    for (const s of [-1, 1]) {
      const seat = INTERCOOLER_SEAT(s),
        box = solid(intercooler(s)).box;
      expect(box.min.y).toBeCloseTo(seat.y, 6);
      expect(seat.y).toBe(INTERCOOLER_BASE_Y);
      expect(seat.x).toEqual([INTERCOOLER_AFT_FACE_X, INTERCOOLER_FRONT_X(s)]);
      expect(seat.z[1] - seat.z[0]).toBeCloseTo(INTERCOOLER_SIZE(s)[2], 8);
      expect(Math.sign(seat.z[0] + seat.z[1])).toBe(s);
      // every head vertex under the core footprint stays below the seat plane
      let under = 0;
      for (const p of CAT.parts.filter((p) => /^Cylinder head /.test(p.name ?? ""))) {
        const head = solid(p),
          v = new Vector3(),
          pos = head.g.getAttribute("position");
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          if (v.x < seat.x[0] || v.x > seat.x[1] || v.z < seat.z[0] - 0.0001 || v.z > seat.z[1]) continue;
          under++;
          expect(v.y).toBeLessThan(seat.y);
          expect(v.y).toBeLessThanOrEqual(CYL_HEAD_TOP + 1e-6);
        }
        head.g.dispose();
      }
      expect(under).toBeGreaterThan(0);
    }
    expect(CYL_HEAD_TOP).toBeLessThan(INTERCOOLER_BASE_Y);
  });

  it("the whole head is trimmed to the rocker covers, 1.76 in. above to 4.26 in. below the crank (Fig 5-35), and its plugs, nozzle and exhaust port follow", () => {
    expect(CYL_HEAD_TOP).toBeCloseTo(CRANK_Y + 1.76 * IN, 8);
    expect(CYL_HEAD_BOTTOM).toBeCloseTo(CRANK_Y - 4.26 * IN, 8);
    for (const c of CYLS) {
      const head = solid(CAT.parts.find((p) => p.name === `Cylinder head ${c.n}`)!);
      // centre ≈ −0.172, height ≈ 0.153 (audit §4)
      expect(head.box.max.y).toBeCloseTo(CYL_HEAD_TOP, 6);
      expect(head.box.min.y).toBeCloseTo(CYL_HEAD_BOTTOM, 6);
      expect((head.box.max.y + head.box.min.y) / 2).toBeCloseTo(-0.172, 3);
      expect(head.box.max.y - head.box.min.y).toBeCloseTo(0.153, 3);
      // the barrel ends at the head's inboard face
      const barrel = solid(CAT.parts.find((p) => p.name === `Cylinder ${c.n}`)!);
      expect(c.s > 0 ? barrel.box.max.z : -barrel.box.min.z).toBeCloseTo(CYL_BARREL_END, 6);
      expect(c.s > 0 ? head.box.min.z : -head.box.max.z).toBeCloseTo(CYL_BARREL_END, 6);
      // attachments follow the trimmed head: upper plug seated 10 mm into the top, lower 10 mm into the bottom,
      // nozzle base 5 mm into the top, exhaust port on the bottom face
      const plug = (pos: "upper" | "lower") =>
        solid(CAT.parts.find((p) => p.name === `Spark plug — cyl ${c.n} ${pos}` && p.parent === `cyl:${c.n}`)!);
      expect(plug("upper").box.min.y).toBeCloseTo(CYL_HEAD_TOP - 0.01, 6);
      expect(plug("lower").box.max.y).toBeCloseTo(CYL_HEAD_BOTTOM + 0.01, 6);
      expect(injectorAnchor(c)[1]).toBeCloseTo(CYL_HEAD_TOP + 0.01, 8);
      expect(cylExhaust(c)[1]).toBeCloseTo(CYL_HEAD_BOTTOM, 8);
      // the upright upper plug and nozzle stand between the barrel end and the intercooler's inner edge
      const inner = INTERCOOLER_OUTER_Z(c.s) - INTERCOOLER_WIDTH;
      for (const b of [
        plug("upper").box,
        solid(CAT.parts.find((p) => p.name === `Fuel injector nozzle, cyl ${c.n}`)!).box,
      ]) {
        expect(Math.min(Math.abs(b.min.z), Math.abs(b.max.z))).toBeGreaterThan(CYL_BARREL_END);
        expect(Math.max(Math.abs(b.min.z), Math.abs(b.max.z))).toBeLessThan(inner);
      }
    }
  });

  // The cut-out window replaced the earlier riser-corridor assertions (monotonic rise, riser x/z limits) with checks on
  // the fitted routes; their clearance is audited in tests/sr22t-depth-induction-ducts.test.ts.
  it("the compressor duct runs from the scroll outlet into the aft hood from below; the charge air follows it and leaves the neck", () => {
    for (const s of [-1, 1]) {
      const duct = COMPRESSOR_DUCT(s);
      expect(toV(duct[0]).distanceTo(toV(COMPRESSOR_OUTLET(s)))).toBeLessThan(0.001);
      expect(toV(duct.at(-1)!).distanceTo(toV(INTERCOOLER_IN(s)))).toBeLessThan(0.001);
      expect(INTERCOOLER_IN(s)[1]).toBe(INTERCOOLER_BASE_Y);
      expect(INTERCOOLER_IN(s)[0]).toBeGreaterThan(INTERCOOLER_AFT_FACE_X);
      expect(INTERCOOLER_IN(s)[0]).toBeLessThan(INTERCOOLER_AFT_FACE_X + INTERCOOLER_SIZE(s)[0] / 4);
      // it enters the base from below: the last leg rises straight up
      const last = toV(duct.at(-1)!).sub(toV(duct.at(-2)!));
      expect(last.y).toBeGreaterThan(0);
      expect(Math.hypot(last.x, last.z)).toBeLessThan(1e-9);
      const pts = FLOWS.find((f) => f.key === (s < 0 ? "compressorL" : "compressorR"))!.pts;
      expect(pts[0]).toEqual(COMPRESSOR_OUTLET(s));
      expect(pts).toContainEqual(INTERCOOLER_OUT(s));
    }
  });

  it("the intercoolers cross no catalogue solid or rendered flow except the heat duct at their nozzles", () => {
    const all = CAT.parts.map(solid);
    const flows = FLOWS.filter((f) => f.tube !== false).map((f) => {
      const curve = curveOf(f.pts, f.tension ?? 0.3);
      return solid({
        id: f.key,
        sys: f.sys,
        name: `flow ${f.key}`,
        geo: () => new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
      });
    });
    try {
      const owned = all.filter((s) => /^(LH|RH) intercooler$/.test(s.p.name ?? ""));
      expect(owned).toHaveLength(2);
      const others = [...all.filter((s) => !owned.includes(s)), ...flows];
      // the neighbours this PR moved or rerouted stay in the audit
      for (const name of [
        "Cylinder head 1",
        "Cylinder head 2",
        "RH turbocharger",
        "Air box / induction filter",
        "BAT 1 — 24 V, 10 Ah",
        "flow inj1",
      ])
        expect(others.some((s) => s.p.name === name)).toBe(true);
      expect(others.filter((s) => /^Spark plug .* upper$/.test(s.p.name ?? ""))).toHaveLength(6);
      expect(others.filter((s) => /^Ignition lead/.test(s.p.name ?? "")).length).toBeGreaterThan(0);
      const hits: string[] = [];
      for (const a of owned) {
        const nozzle = a.p.name === "RH intercooler" ? "flow hotIn" : "flow hotL";
        // duct 7 clamps onto the core's own forward neck spigot (AMM Fig 71-60-2 sheet 2 items 7/10)
        const out = new Vector3(...INTERCOOLER_OUT(a.p.name === "RH intercooler" ? 1 : -1));
        // with its hose connector and clamps over the spigot
        const neckDuct = (b: Solid) =>
          ["Intercooler outlet duct", "Hose connector", "Hose clamp"].includes(b.p.name ?? "") &&
          b.box.distanceToPoint(out) < 0.025;
        for (const b of others)
          if (b.p.name !== nozzle && !neckDuct(b) && intersects(a, b))
            hits.push(`${a.p.name} vs ${b.p.name ?? b.p.id}`);
      }
      expect(hits).toEqual([]);
    } finally {
      for (const s of [...all, ...flows]) s.g.dispose();
    }
  }, 120000);

  it("clears ALT 1's transverse position (PR-C, AMF + 27.3 in., crank height, pad 6.7 → end 9.45 in. right, Ø5.75 in.)", () => {
    // Read-only envelope from fix/iss-206-alt1 @ 275dc74; terminal cover allowance 0.006 m outboard.
    const r = (5.75 / 2) * IN,
      x = ACCESSORY_FACE_X + 27.3 * IN;
    const alt1 = new Box3(new Vector3(x - r, CRANK_Y - r, 0.12), new Vector3(x + r, CRANK_Y + r, 9.45 * IN + 0.012));
    for (const s of [-1, 1]) {
      const ic = solid(intercooler(s));
      expect(ic.box.intersectsBox(alt1)).toBe(false);
      ic.g.dispose();
    }
  });
});

describe("Lower-plug leads around the intercoolers (AMM Fig 74-20-1 PDF p. 2624; POH 13772-007 Fig 1-1)", () => {
  it("drop clear of the cores and run below the heads, every span from the drop ≥ 5 mm inside the cowl loft", () => {
    const lower = IGNITION_LEADS.filter((l) => l.pos === "L");
    expect(lower).toHaveLength(6);
    for (const l of lower) {
      const c = CYLS.find((c) => c.n === l.cyl)!;
      const k = CYLS.filter((b) => b.s === c.s && b.x < c.x).length;
      const i = l.pts.findIndex((p) => p[0] === LOWER_DROP(c.s)[0] - c.s * k * 0.012);
      expect(i).toBeGreaterThan(0);
      const branch = l.pts.slice(i);
      // The drop clears the core: aft of its aft face, inboard of its inner edge, or below its bottom.
      const [x, z] = [branch[0][0], Math.abs(branch[0][2])];
      expect(
        x < INTERCOOLER_AFT_FACE_X - 0.01 ||
          z < INTERCOOLER_OUTER_Z(c.s) - INTERCOOLER_WIDTH - 0.005 ||
          branch[0][1] + 0.005 < INTERCOOLER_BASE_Y,
      ).toBe(true);
      // Approximate first-span endpoints, within 1 mm, assert the approach direction and
      // the turbo oil integration route, rather than accepting any non-rising segment (AMM Fig 74-20-1 PDF p. 2624).
      const firstSpans: Record<number, [number[], number[]]> = {
        1: [
          [2.785, -0.289, 0.34],
          [2.785, -0.289, 0.428],
        ],
        2: [
          [2.765, -0.227, -0.383],
          [2.765, -0.289, -0.405],
        ],
        3: [
          [2.773, -0.277, 0.352],
          [2.773, -0.277, 0.44],
        ],
        4: [
          [2.777, -0.215, -0.395],
          [2.777, -0.277, -0.417],
        ],
        5: [
          [2.761, -0.265, 0.364],
          [2.761, -0.265, 0.452],
        ],
        6: [
          [2.789, -0.203, -0.407],
          [2.789, -0.255, -0.407],
        ],
      };
      for (let n = 0; n < 2; n++)
        expect(new Vector3(...branch[n]).distanceTo(new Vector3(...firstSpans[c.n][n]))).toBeLessThanOrEqual(0.001);
      // Include the descent from the last bundle via, previously outside this block.
      // The whole approach must pass aft/inboard of the core, or at least 5 mm below it.
      const approach = l.pts.slice(l.pts.findIndex((p) => p[1] < -0.19));
      for (let n = 0; n < approach.length - 1; n++) {
        const a = new Vector3(...approach[n]),
          b = new Vector3(...approach[n + 1]);
        const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.001));
        for (let step = 0; step <= steps; step++) {
          const p = a.clone().lerp(b, step / steps);
          expect(
            p.x < INTERCOOLER_AFT_FACE_X - 0.01 ||
              Math.abs(p.z) < INTERCOOLER_OUTER_Z(c.s) - INTERCOOLER_WIDTH - 0.005 ||
              p.y + 0.005 < INTERCOOLER_BASE_Y,
            `cyl ${c.n} lower approach at ${p.toArray()}`,
          ).toBe(true);
        }
      }
      expect(branch[1][1] + 0.005).toBeLessThan(CYL_HEAD_BOTTOM);
      // the forward run passes below the heads
      expect(LOWER_RUN_Y + 0.005).toBeLessThan(CYL_HEAD_BOTTOM);
      for (let k = 0; k < branch.length - 1; k++)
        for (let t = 0; t <= 1; t += 0.05) {
          const p = new Vector3(...branch[k]).lerp(new Vector3(...branch[k + 1]), t);
          expect(inFus(p, 0.005), `cyl ${c.n} lower lead at ${p.toArray()}`).toBe(true);
        }
    }
  });
});
