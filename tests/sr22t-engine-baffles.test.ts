/**
 * SR22T engine cooling baffles (rebuilt around the intercoolers): POH 13772-007 7-38;
 * AMM 13773-002 Rev 7 71-00 §1.B (PDF p. 2470), Fig 71-00-2 sheets 1–2 (PDF pp. 2487–2488), Fig 71-00-4 (PDF p. 2498),
 * 71-60 (PDF p. 2555), Fig 71-60-2 sheet 2 (PDF p. 2558); Continental M-18 2-2.9 / Fig 2-21 (p. 2-21), 16-7 /
 * Fig 16-29 (p. 16-33), 17-3.2 / Fig 17-11 (p. 17-16). Geometry approximate.
 */
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CAT, CYLS } from "@/aircraft/sr22t/parts";
import { CYL_BARREL_END, CYL_ENVELOPE, CYL_HEAD_SIZE, cylPoint, plugOffset } from "@/aircraft/sr22t/parts/engine";
import {
  AFT_X,
  BAFFLE_SHEET,
  FRONT_X,
  GASKET_T,
  SEAL_R,
  SIDE_WALL_Z,
  baffleLayout,
} from "@/aircraft/sr22t/parts/engine-baffles";
import { CRANK_Y, REAR_CYL_X, CYL_PITCH } from "@/aircraft/sr22t/engine-datum";
import {
  INTERCOOLER_AFT_FACE_X,
  INTERCOOLER_FRONT_X,
  INTERCOOLER_NECK_X,
  INTERCOOLER_OUTER_Z,
  INTERCOOLER_SEAT,
  INTERCOOLER_WIDTH,
} from "@/aircraft/sr22t/intercooler-layout";
import { inFus } from "@/aircraft/sr22t/geometry";
import { allSolids, allTubes, gap, solid, type Shape } from "./sr22t-engine-gap";

const NEW =
  /^(Side baffle|Aft baffle|Front baffle|Intercooler seal|Baffle seal|Inter-cylinder baffle|Cylinder baffle)$/;
const bankOf = (s: Shape) => Math.sign(s.box.min.z + s.box.max.z);
/** Smallest distance from p to the cowl skin, over 72 directions in its station plane (POH 13772-007 Fig 1-1 loft). */
const skinDistance = (p: Vector3) => {
  let best = Infinity;
  for (let k = 0; k < 72; k++) {
    const a = (k * Math.PI) / 36,
      d = new Vector3(0, Math.sin(a), Math.cos(a));
    let lo = 0,
      hi = 0.2;
    if (inFus(p.clone().addScaledVector(d, hi))) continue;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inFus(p.clone().addScaledVector(d, mid))) lo = mid;
      else hi = mid;
    }
    best = Math.min(best, lo);
  }
  return best;
};

describe("SR22T engine cooling baffles", () => {
  it("the side baffles carry the intercoolers on seal 16 over the cooling-air window (AMM 71-60 PDF p. 2555; Fig 71-60-2 sheet 2)", () => {
    for (const s of [-1, 1]) {
      const L = baffleLayout(s),
        seat = INTERCOOLER_SEAT(s),
        footprint = { x: seat.x, z: seat.z.map(Math.abs).sort((a, b) => a - b) };
      // seal 16 sits on the deck and under the core base
      expect(L.gasket.top - GASKET_T).toBeCloseTo(L.deckTop, 9);
      expect(seat.y - L.gasket.top).toBeGreaterThan(0);
      expect(seat.y - L.gasket.top).toBeLessThanOrEqual(0.001);
      // the seal land and the window lie inside the core footprint; the window is open under the core
      for (const p of [...L.gasket.outer, ...L.window]) {
        expect(p.x).toBeGreaterThanOrEqual(footprint.x[0] - 1e-9);
        expect(p.x).toBeLessThanOrEqual(footprint.x[1] + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(footprint.z[0] - 1e-9);
        expect(p.y).toBeLessThanOrEqual(footprint.z[1] + 1e-9);
      }
      const [w0, , w2] = L.window;
      expect(w2.x - w0.x).toBeGreaterThan(0.2);
      expect(w2.y - w0.y).toBeGreaterThan(INTERCOOLER_WIDTH / 2);
      // the deck runs the length of the core and on to the front baffle
      const xs = L.deck.map((p) => p.x);
      expect(Math.min(...xs)).toBeLessThan(INTERCOOLER_AFT_FACE_X + 0.01);
      expect(Math.max(...xs)).toBeCloseTo(FRONT_X(s), 9);
    }
  });

  it("the side wall closes the outboard side of the heads, outboard of every head (M-18 Fig 2-21)", () => {
    const heads = CAT.parts.filter((p) => /^Cylinder head /.test(p.name ?? "")).map(solid);
    expect(heads).toHaveLength(6);
    for (const h of heads) {
      const s = bankOf(h);
      expect(SIDE_WALL_Z - BAFFLE_SHEET / 2 - Math.max(Math.abs(h.box.min.z), Math.abs(h.box.max.z))).toBeGreaterThan(
        0.005,
      );
      // the wall spans the head fore and aft
      const wall = baffleLayout(s).wall.map((p) => p.x);
      expect(Math.min(...wall)).toBeLessThan(h.box.min.x);
      expect(Math.max(...wall)).toBeGreaterThan(h.box.max.x);
    }
  });

  it("aft and front baffles close each bank behind its rear and ahead of its front cylinder (Fig 71-00-4; M-18 Fig 2-21)", () => {
    for (const s of [-1, 1]) {
      const rear = REAR_CYL_X(s),
        front = rear + 2 * CYL_PITCH;
      expect(AFT_X(s)).toBeLessThan(rear - CYL_HEAD_SIZE[0] / 2 - 0.005);
      expect(AFT_X(s)).toBeGreaterThan(rear - CYL_HEAD_SIZE[0] / 2 - 0.01);
      expect(FRONT_X(s)).toBeGreaterThan(front + CYL_HEAD_SIZE[0] / 2 + 0.005);
      expect(FRONT_X(s)).toBeLessThan(front + CYL_HEAD_SIZE[0] / 2 + 0.01);
      // both reach the side wall and rise above the heads
      const L = baffleLayout(s);
      for (const outline of [L.aft, L.front]) {
        expect(Math.max(...outline.map((p) => p.x))).toBeGreaterThanOrEqual(SIDE_WALL_Z);
        expect(Math.max(...outline.map((p) => p.y))).toBeGreaterThan(CRANK_Y + CYL_ENVELOPE / 2);
      }
    }
  });

  it("the seals meet the cowling around the circumference, leaving it only beside the intercoolers (AMM 71-00 §1.B PDF p. 2470)", () => {
    for (const s of [-1, 1]) {
      const L = baffleLayout(s);
      let touching = 0;
      const off: number[] = [];
      for (const run of L.seals)
        for (const c of run) {
          // touching: the seal surface within 1 mm of the skin and not through it
          if (inFus(c) && Math.abs(skinDistance(c) - SEAL_R) <= 0.001) touching++;
          else off.push(c.x);
        }
      expect(touching).toBeGreaterThan(100);
      // every seal point off the skin is beside the intercooler body, which the model cowl's narrow shoulder can't hold
      for (const x of off) {
        expect(x).toBeGreaterThanOrEqual(INTERCOOLER_AFT_FACE_X);
        expect(x).toBeLessThanOrEqual(INTERCOOLER_NECK_X);
      }
      // the deck-edge seal stays outboard of the intercooler, never bent inside it
      for (const c of L.sideSeal)
        if (c.x <= INTERCOOLER_FRONT_X(s))
          expect(Math.abs(c.z) - INTERCOOLER_OUTER_Z(s)).toBeGreaterThan(SEAL_R + 0.005);
    }
  });

  it("four inter-cylinder baffles between 1 & 3, 3 & 5, 2 & 4, 4 & 6 (M-18 Fig 17-11 p. 17-16)", () => {
    const inter = CAT.parts.filter((p) => p.name === "Inter-cylinder baffle").map(solid);
    expect(inter).toHaveLength(4);
    for (const [a, b] of [
      [1, 3],
      [3, 5],
      [2, 4],
      [4, 6],
    ]) {
      const ca = CYLS.find((c) => c.n === a)!,
        cb = CYLS.find((c) => c.n === b)!,
        mid = (ca.x + cb.x) / 2;
      const hit = inter.filter((p) => Math.abs((p.box.min.x + p.box.max.x) / 2 - mid) < 1e-6 && bankOf(p) === ca.s);
      expect(hit).toHaveLength(1);
      // the lower assembly is under the fins, the support above them, both on the barrels' span
      expect(hit[0].box.min.y).toBeLessThan(CRANK_Y - CYL_ENVELOPE / 2);
      expect(hit[0].box.max.y).toBeGreaterThan(CRANK_Y + CYL_ENVELOPE / 2);
      expect(Math.max(Math.abs(hit[0].box.min.z), Math.abs(hit[0].box.max.z))).toBeLessThan(CYL_BARREL_END);
    }
  });

  it("a cylinder baffle under each head closes the gap outboard of its lower spark plug hole, below the pushrod passages (M-18 16-7 step 1, Fig 16-29 p. 16-33)", () => {
    const cyl = CAT.parts.filter((p) => p.name === "Cylinder baffle").map(solid);
    expect(cyl).toHaveLength(6);
    for (const c of CYLS) {
      const head = solid(CAT.parts.find((p) => p.name === `Cylinder head ${c.n}`)!),
        hole = cylPoint(c, plugOffset(c, "L"));
      // one baffle per head: on its bank, within its fore-aft footprint
      const own = cyl.filter(
        (p) => bankOf(p) === c.s && p.box.min.x >= head.box.min.x && p.box.max.x <= head.box.max.x,
      );
      expect(own).toHaveLength(1);
      const b = own[0].box,
        zIn = Math.min(Math.abs(b.min.z), Math.abs(b.max.z)),
        zOut = Math.max(Math.abs(b.min.z), Math.abs(b.max.z));
      // its inboard edge is outboard of the lower plug hole and the plug's hex (0.036 m across, engine.ts)
      expect(zIn).toBeGreaterThan(Math.abs(hole[2]) + 0.018);
      // it stays under the head, outboard edge at most the head's outboard face
      expect(zOut).toBeLessThanOrEqual(Math.max(Math.abs(head.box.min.z), Math.abs(head.box.max.z)) + 1e-9);
      // below the head's lower face, where the pushrod tube passages are, and above the plug's lower end
      expect(b.max.y).toBeLessThan(head.box.min.y);
      expect(b.min.y).toBeGreaterThan(hole[1] - 0.025);
    }
  });

  it("every baffle and seal clears every other solid and rendered flow tube by 5 mm, except its named joints", () => {
    const solids = allSolids(),
      tubes = allTubes(),
      mine = solids.filter((p) => NEW.test(p.name));
    expect(mine).toHaveLength(20);
    const others = [...solids.filter((p) => !mine.includes(p)), ...tubes];
    // the crowded neighbours stay in the audit
    for (const name of [
      "RH intercooler",
      "LH intercooler",
      "Intercooler outlet duct",
      "BAT 1 — 24 V, 10 Ah",
      "Cylinder head 1",
      "Ignition lead — right magneto",
      "Ignition lead — left magneto",
      "Engine mount weldment",
      "flow alt2",
      "flow exh5",
    ])
      expect(
        others.some((p) => p.name === name),
        name,
      ).toBe(true);
    /** Fastened or seated joints within one bank (Fig 71-00-4 items 1, 3, 5; 71-00 §1.B; 71-60; Fig 71-60-2 item 16). */
    const JOINTS: Record<string, string[]> = {
      "Side baffle": ["Aft baffle", "Front baffle", "Baffle seal", "Intercooler seal", "intercooler"],
      "Intercooler seal": ["intercooler"],
      "Baffle seal": ["Aft baffle", "Front baffle"],
    };
    const joint = (a: Shape, b: Shape) =>
      bankOf(a) === bankOf(b) &&
      [
        [a, b],
        [b, a],
      ].some(([x, y]) =>
        JOINTS[x.name]?.some((n) => (n === "intercooler" ? / intercooler$/.test(y.name) : n === y.name)),
      );
    const hits: string[] = [];
    const seated: string[] = [];
    for (const [i, a] of mine.entries())
      for (const b of [...others, ...mine.slice(i + 1)]) {
        const g = gap(a, b, 0.005);
        if (g >= 0.005) continue;
        if (joint(a, b)) seated.push(`${a.name}/${b.name}`);
        else hits.push(`${a.name} vs ${b.name}: ${(g * 1000).toFixed(1)} mm`);
      }
    expect(hits).toEqual([]);
    // the joints are real: each bank's baffles meet, and both intercoolers sit on their seals
    for (const pair of [
      "Side baffle/Aft baffle",
      "Side baffle/Front baffle",
      "Side baffle/Baffle seal",
      "Side baffle/Intercooler seal",
    ])
      expect(seated.filter((p) => p === pair)).toHaveLength(2);
    expect(seated.filter((p) => /^Intercooler seal\/(LH|RH) intercooler$/.test(p))).toHaveLength(2);
  }, 300_000);

  it("the audit reports a baffle moved into a neighbour", () => {
    const wall = CAT.parts
        .filter((p) => p.name === "Side baffle")
        .map(solid)
        .find((p) => bankOf(p) > 0)!,
      head = solid(CAT.parts.find((p) => p.name === "Cylinder head 1")!);
    const shift = new Vector3(0, 0, -(SIDE_WALL_Z - BAFFLE_SHEET / 2 - Math.abs(head.box.max.z)) - 0.002);
    const moved: Shape = {
      ...wall,
      faces: wall.faces.map((f) => {
        const t = f.triangle
          .clone()
          .set(f.triangle.a.clone().add(shift), f.triangle.b.clone().add(shift), f.triangle.c.clone().add(shift));
        return { triangle: t, box: f.box.clone().translate(shift) };
      }),
      box: wall.box.clone().translate(shift),
    };
    expect(gap(moved, head, 0.005)).toBeLessThan(0.005);
    expect(gap(wall, head, 0.005)).toBeGreaterThanOrEqual(0.005);
  });
});
