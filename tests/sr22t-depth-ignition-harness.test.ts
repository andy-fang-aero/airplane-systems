/** POH 13772-007 7-37 governs assignments; AMM 13773-002 Rev 7 ch. 74 governs hardware. */
import { afterEach, describe, expect, it } from "vitest";
import { CylinderGeometry, Line3, Mesh, TubeGeometry, Vector3 } from "three";
import { CAT } from "@/aircraft/sr22t/parts";
import {
  CYLS,
  FIRING_ORDER,
  CYL_HEAD_SIZE,
  cylHeadOffset,
  cylOrigin,
  plugOffset,
  plugMagneto,
  MAGNETO,
  MAGNETO_CAP_END,
  MAGNETO_DRIVE_END,
  MAGNETO_LEN,
  MAGNETO_R,
  TURBO,
} from "@/aircraft/sr22t/parts/engine";
import { ACCESSORY_FACE_X } from "@/aircraft/sr22t/engine-datum";
import {
  CONDENSER_STUD,
  MAGNETO_GROUND,
  HARNESS_CAP,
  IGNITION_LEADS,
  lowerLane,
  P_LEADS,
  capTerminal,
  plugTerminal,
  terminalLength,
} from "@/aircraft/sr22t/parts/engine-ignition";
import { IGNITION_SWITCH } from "@/aircraft/sr22t/parts/catalogue";
import { SPARK_RATE } from "@/lib/anims";
import { mats } from "@/lib/materials";
import { useView } from "@/lib/view";
import { live } from "@/aircraft/sr22t/model";
import { useSR22T } from "@/aircraft/sr22t/store";

const distance = (a: readonly number[], b: readonly number[]) => new Vector3(...a).distanceTo(new Vector3(...b));
const savedView = useView.getState();
const savedSim = useSR22T.getState();
const savedRPM = live.rpm;
afterEach(() => {
  useView.setState(savedView);
  useSR22T.setState(savedSim);
  live.rpm = savedRPM;
});
const period = (2 * Math.PI) / SPARK_RATE;
const leadParts = CAT.parts.filter((p) => p.name?.startsWith("Ignition lead — "));
const sample = (p: (typeof CAT.parts)[number], t: number) => {
  const m = new Mesh();
  p.anim!(m, t);
  return m.material;
};

describe("SR22T ignition harness", () => {
  it("illustrative compact cylinder 2 lower ferrule is 6 mm long (AMM Fig 74-20-1 Detail B PDF 2624)", () => {
    for (const c of CYLS)
      for (const pos of ["U", "L"] as const) {
        expect(terminalLength(c, pos)).toBe(c.n === 2 && pos === "L" ? 0.006 : 0.024);
        const part = CAT.parts.find(
          (p) =>
            p.name === "Plug lead terminal" &&
            p.note?.startsWith(`Cylinder ${c.n} ${pos === "U" ? "upper" : "lower"} `),
        )!;
        const geometry = part.geo();
        expect((geometry as CylinderGeometry).parameters.radiusTop).toBe(c.n === 2 && pos === "L" ? 0.012 : 0.018);
        geometry.dispose();
      }
  });
  it("twelve leads, each from the correct magneto to the correct plug (POH 7-37; Fig 74-20-1 PDF 2624)", () => {
    expect(IGNITION_LEADS).toHaveLength(12);
    expect(leadParts).toHaveLength(12);
    const plugs = new Set<string>();
    for (const l of IGNITION_LEADS) {
      const c = CYLS.find((c) => c.n === l.cyl)!;
      const expectedMag = (c.s > 0 && l.pos === "L") || (c.s < 0 && l.pos === "U") ? "R" : "L";
      expect(l.mag).toBe(expectedMag);
      expect(l.mag).toBe(plugMagneto(c, l.pos));
      expect(distance(l.pts[0], capTerminal(expectedMag, l.terminal))).toBeLessThanOrEqual(0.01);
      expect(distance(l.pts[0], HARNESS_CAP(expectedMag))).toBeLessThan(0.05);
      expect(distance(l.pts.at(-1)!, plugTerminal(c, l.pos))).toBeLessThanOrEqual(0.01);
      // Validate actual registered tube endpoints too, so a table disconnected from rendering cannot pass.
      const p = leadParts.find((p) => p.note?.includes(`cylinder ${l.cyl} ${l.pos === "U" ? "upper" : "lower"} plug`))!;
      const g = p.geo() as TubeGeometry;
      expect(distance(g.parameters.path.getPoint(0).toArray(), l.pts[0])).toBeLessThanOrEqual(0.01);
      expect(distance(g.parameters.path.getPoint(1).toArray(), l.pts.at(-1)!)).toBeLessThanOrEqual(0.01);
      g.dispose();
      plugs.add(`${l.cyl}:${l.pos}`);
    }
    expect(plugs.size).toBe(12);
    for (const mag of ["R", "L"] as const) {
      const leads = IGNITION_LEADS.filter((l) => l.mag === mag);
      expect(leads).toHaveLength(6);
      expect(leads.map((l) => l.terminal).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });
  it("keeps six separately visible wires per bank: three uppers through the aft clamp, three lowers where they run below the heads (AMM Fig 74-20-1 PDF 2624; spacing illustrative)", () => {
    for (const side of [1, -1]) {
      const bank = CYLS.filter((c) => c.s === side).sort((a, b) => a.x - b.x);
      const leads = IGNITION_LEADS.filter((l) => bank.some((c) => c.n === l.cyl));
      expect(leads).toHaveLength(6);
      // Upper leads pass the aft clamp; lower leads run below the heads from their drop aft of the intercooler
      //, so each group is sectioned where it runs together.
      for (const pos of ["U", "L"] as const) {
        const section = leads
          .filter((l) => l.pos === pos)
          .map((l) =>
            l.pts.find((p) =>
              pos === "U"
                ? p[0] === bank[0].x
                : p[2] ===
                    lowerLane(
                      side,
                      bank.findIndex((c) => c.n === l.cyl),
                    ) && p[0] < bank[0].x,
            ),
          );
        expect(section).toHaveLength(3);
        for (let i = 0; i < section.length; i++) {
          expect(section[i]).toBeDefined();
          for (let j = i + 1; j < section.length; j++) expect(distance(section[i]!, section[j]!)).toBeGreaterThan(0.01);
        }
      }
    }
  });
  it("lower leads from bundle entry through each plug keep two wire radii apart on both banks (AMM Fig 74-20-1 PDF 2624; routing approximate)", () => {
    const gaps: string[] = [];
    for (const side of [-1, 1]) {
      const bank = IGNITION_LEADS.filter((l) => l.pos === "L" && CYLS.find((c) => c.n === l.cyl)!.s === side);
      const regions = bank.map((lead) => {
        const part = leadParts.find((p) => p.note?.includes(`cylinder ${lead.cyl} lower plug`))!;
        const geometry = part.geo() as TubeGeometry;
        const path = geometry.parameters.path;
        // Match the renderer's consecutive-point deduplication before locating the bundle entry.
        const rendered = lead.pts.filter((p, i, all) => i === 0 || distance(p, all[i - 1]) > 1e-9);
        const entry = rendered.findIndex((p) => p === lead.pts[2]);
        expect(entry).toBeGreaterThanOrEqual(0);
        const indices = Array.from({ length: rendered.length - entry }, (_, i) => entry + i);
        const corners = indices.map((i) => path.getPoint(i / (rendered.length - 1)));
        const segments = corners.slice(1).map((p, i) => new Line3(corners[i], p));
        const samples = segments.flatMap((segment, i) => {
          // At most 0.5 mm between samples; distance is measured to the other rendered straight span.
          const count = Math.max(1, Math.ceil(segment.distance() / 0.0005));
          return Array.from({ length: count + 1 }, (_, j) =>
            path.getPoint((indices[i] + j / count) / (rendered.length - 1)),
          );
        });
        const radius = geometry.parameters.radius;
        geometry.dispose();
        return { lead, samples, segments, radius };
      });
      for (let i = 0; i < regions.length; i++)
        for (let j = i + 1; j < regions.length; j++) {
          const a = regions[i],
            b = regions[j];
          let minimum = Infinity;
          const closest = new Vector3();
          for (const [from, to] of [
            [a, b],
            [b, a],
          ])
            for (const sample of from.samples)
              for (const segment of to.segments)
                minimum = Math.min(minimum, sample.distanceTo(segment.closestPointToPoint(sample, true, closest)));
          // Half the sample pitch bounds the unsampled distance decrease (distance is 1-Lipschitz).
          if (minimum < a.radius + b.radius + 0.00025 - 1e-8)
            gaps.push(
              `cyl ${a.lead.cyl}/${b.lead.cyl}: ${(minimum * 1000).toFixed(3)} mm < ${((a.radius + b.radius) * 1000).toFixed(1)} mm`,
            );
        }
    }
    expect(gaps).toEqual([]);
  });
  it("keeps the leads and lower ferrules clear of the illustrated turbos (POH 7-38; AMM Fig 81-00-1 PDF 2810; clearance approximate)", () => {
    for (const l of IGNITION_LEADS) {
      const p = leadParts.find((p) => p.note?.includes(`cylinder ${l.cyl} ${l.pos === "U" ? "upper" : "lower"} plug`))!;
      const g = p.geo() as TubeGeometry;
      try {
        for (const side of [1, -1]) {
          const turbo = TURBO(side);
          for (let i = 0; i <= 240; i++) {
            const at = g.parameters.path.getPoint(i / 240);
            // Actual turbo is a 0.09 m radius / 0.18 m z-axis cylinder, expanded by wire radius.
            if (Math.abs(at.z - turbo[2]) < 0.095)
              expect(Math.hypot(at.x - turbo[0], at.y - turbo[1])).toBeGreaterThan(0.095);
          }
          const c = CYLS.find((c) => c.n === l.cyl)!;
          const terminal = plugTerminal(c, l.pos);
          for (const dy of [-terminalLength(c, l.pos) / 2, terminalLength(c, l.pos) / 2]) {
            if (Math.abs(terminal[2] - turbo[2]) < 0.108) {
              expect(Math.hypot(terminal[0] - turbo[0], terminal[1] + dy - turbo[1])).toBeGreaterThan(0.108);
            }
          }
        }
      } finally {
        g.dispose();
      }
    }
  });
  it("numbers the forward cap outlets as drawn from the front, cluster outboard (AMM Fig 74-20-2 PDF 2625)", () => {
    // Sign pairs [up, toward the airplane's right] read from each cap face, drawn from the front (RIGHT MAG on the
    // viewer's left, so the viewer's left is the airplane's right).
    const expected = {
      R: [
        [-1, 1],
        [1, 1],
        [1, 0],
        [1, -1],
        [-1, -1],
        [-1, 0],
      ],
      L: [
        [1, -1],
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [1, 1],
        [1, 0],
      ],
    };
    for (const mag of ["R", "L"] as const) {
      const cap = HARNESS_CAP(mag);
      for (let terminal = 1; terminal <= 6; terminal++) {
        const at = capTerminal(mag, terminal);
        const sign = (v: number) => (Math.abs(v) < 1e-8 ? 0 : Math.sign(v));
        expect([sign(at[1] - cap[1]), sign(at[2] - cap[2])]).toEqual(expected[mag][terminal - 1]);
        // on the forward face, ahead of the body
        expect(at[0]).toBeGreaterThan(MAGNETO_CAP_END(mag)[0]);
      }
      // the terminal cluster sits on the outboard half of the cap face
      expect(Math.abs(cap[2])).toBeGreaterThan(Math.abs(MAGNETO(mag)[2]));
    }
  });
  it("each magneto drives aft into the accessory case with its cap forward (AMM Fig 74-20-1 Detail A PDF 2624; Fig 74-10-2 PDF 2618; M-18 Fig 10-8 item 9)", () => {
    const engine = CAT.parts.find((p) => p.name === "Continental TSIO-550-K")!;
    const g = engine.geo();
    g.computeBoundingBox();
    const caseAft = g.boundingBox!.min.x + engine.pos![0];
    g.dispose();
    for (const mag of ["R", "L"] as const) {
      const drive = MAGNETO_DRIVE_END(mag),
        cap = MAGNETO_CAP_END(mag);
      // cap end forward of the drive end, on a horizontal fore-aft axis
      expect(cap[0] - drive[0]).toBeCloseTo(MAGNETO_LEN, 9);
      expect(cap[1]).toBe(drive[1]);
      expect(cap[2]).toBe(drive[2]);
      // the drive end abuts the accessory case at the accessory mounting face
      expect(drive[0]).toBeCloseTo(ACCESSORY_FACE_X, 9);
      expect(Math.abs(drive[0] - caseAft)).toBeLessThan(0.01);
      // the rendered body spans drive end to cap end
      const body = CAT.parts.find((p) => p.name === (mag === "R" ? "Right magneto" : "Left magneto"))!;
      const bg = body.geo();
      bg.computeBoundingBox();
      expect(bg.boundingBox!.min.x + body.pos![0]).toBeCloseTo(drive[0], 6);
      expect(bg.boundingBox!.max.x + body.pos![0]).toBeCloseTo(cap[0], 6);
      bg.dispose();
      // every lead leaves its cap forward
      for (const l of IGNITION_LEADS.filter((l) => l.mag === mag)) expect(l.pts[1][0]).toBeGreaterThan(l.pts[0][0]);
      expect(HARNESS_CAP(mag)[0]).toBeGreaterThan(cap[0] - 0.01);
    }
  });
  it("upper plugs on top of the head, lower plugs on the bottom (Fig 71-00-2 items 23, 35)", () => {
    for (const c of CYLS) {
      const head = cylHeadOffset(c);
      expect(plugOffset(c, "U")[1]).toBeGreaterThan(head[1] + CYL_HEAD_SIZE[1] / 2);
      expect(plugOffset(c, "L")[1]).toBeLessThan(head[1] - CYL_HEAD_SIZE[1] / 2);
      for (const pos of ["U", "L"] as const) {
        const p = CAT.parts.find((p) => p.name === `Spark plug — cyl ${c.n} ${pos === "U" ? "upper" : "lower"}`)!;
        expect(p.pos).toEqual(plugOffset(c, pos));
        // Every lower boss is forward on its head; the turbines sit aft of all cylinders.
        if (pos === "L") expect(p.pos![0]).toBeCloseTo(CYL_HEAD_SIZE[0] / 2 - 0.02, 8);
        const g = p.geo();
        g.computeBoundingBox();
        // Uniform illustrative envelope (Fig 74-20-1 Detail B PDF 2624), keeping 10 mm own-head seating.
        expect(g.boundingBox!.max.y - g.boundingBox!.min.y).toBeCloseTo(0.05, 7);
        expect(g.boundingBox!.max.x - g.boundingBox!.min.x).toBeGreaterThanOrEqual(0.03);
        const terminal = plugTerminal(c, pos);
        expect(terminal[0]).toBeCloseTo(cylOrigin(c)[0] + p.pos![0]);
        expect(terminal[2]).toBeCloseTo(cylOrigin(c)[2] + p.pos![2]);
        g.dispose();
      }
    }
    expect(CAT.parts.filter((p) => p.name === "Plug lead terminal")).toHaveLength(12);
    expect(CAT.parts.filter((p) => p.name === "Harness clamp")).toHaveLength(6);
    expect(CAT.parts.filter((p) => p.name === "Harness cap")).toHaveLength(2);
  });
  it("plugs and leads fire in 1-6-3-2-5-4 order (AMM Fig 74-20-2 PDF 2625)", () => {
    expect([...FIRING_ORDER]).toEqual([1, 6, 3, 2, 5, 4]);
    useView.setState({ sys: "engine" });
    live.rpm = 1000;
    useSR22T.getState().update((s) => {
      s.eng.key = "BOTH";
    });
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t = (i * period) / 6;
      const lit = leadParts.filter((p) => sample(p, t) === mats("#6FD8FF").hi);
      expect(lit).toHaveLength(2);
      const cylinders = lit.map((p) => Number(/cylinder (\d)/.exec(p.note!)![1]));
      expect(cylinders).toEqual([FIRING_ORDER[i], FIRING_ORDER[i]]);
      seen.push(cylinders[0]);
      for (const p of lit) {
        const [, n, pos] = /cylinder (\d) (upper|lower)/.exec(p.note!)!;
        const plug = CAT.parts.find((p) => p.name === `Spark plug — cyl ${n} ${pos}`)!;
        expect(sample(plug, t)).toBe(sample(p, t));
      }
    }
    expect(seen).toEqual([1, 6, 3, 2, 5, 4]);
    for (const l of IGNITION_LEADS) expect(l.terminal).toBe([1, 6, 3, 2, 5, 4].indexOf(l.cyl) + 1);
  });
  it("a lead is dark when its magneto doesn't fire (POH 7-37; Fig 74-00-1)", () => {
    useView.setState({ sys: "engine" });
    live.rpm = 1000;
    for (const key of ["L", "R", "OFF"] as const) {
      useSR22T.getState().update((s) => {
        s.eng.key = key;
      });
      for (const p of leadParts) {
        const mag = p.name!.includes("right") ? "R" : "L";
        const states = Array.from({ length: 120 }, (_, i) => sample(p, (i * period) / 120));
        expect(states.includes(mats("#6FD8FF").hi)).toBe(key === mag);
        if (key !== mag) expect(states.every((m) => m === mats("#26333D").on)).toBe(true);
      }
    }
    live.rpm = 0;
    useSR22T.getState().update((s) => {
      s.eng.key = "BOTH";
    });
    expect(leadParts.every((p) => sample(p, 0) === mats("#26333D").on)).toBe(true);
  });
  it("each magneto has a P-lead to the ignition switch and a ground wire (AMM 74-10 PDF 2615)", () => {
    const wires = CAT.parts.filter((p) => p.name === "Magneto P-lead");
    expect(wires).toHaveLength(2);
    expect(CAT.parts.find((p) => p.name === "Ignition key switch")!.pos).toEqual(IGNITION_SWITCH);
    for (const l of P_LEADS) {
      // the condenser stud is low on the forward face (Fig 74-10-2 PDF 2618, inferred)
      const stud = CONDENSER_STUD(l.mag);
      expect(stud[0]).toBeCloseTo(MAGNETO_CAP_END(l.mag)[0], 9);
      expect(stud[1]).toBeLessThan(MAGNETO(l.mag)[1]);
      expect(distance(l.pts[0], stud)).toBeLessThanOrEqual(0.005);
      expect(distance(l.pts.at(-1)!, IGNITION_SWITCH)).toBeLessThanOrEqual(0.02);
      const p = wires.find((p) => p.note!.startsWith(l.mag === "R" ? "Right" : "Left"))!;
      const g = p.geo() as TubeGeometry;
      expect(distance(g.parameters.path.getPoint(1).toArray(), IGNITION_SWITCH)).toBeLessThanOrEqual(0.02);
      g.dispose();
      useView.setState({ sys: "engine" });
      for (const key of ["OFF", "L", "R", "BOTH", "START"] as const) {
        useSR22T.getState().update((s) => {
          s.eng.key = key;
        });
        expect(sample(p, 0) === mats("#FFD34D").hi).toBe(key === "OFF" || key === (l.mag === "R" ? "L" : "R"));
      }
      const ground = CAT.parts.find(
        (p) => p.name === "Magneto ground wire" && p.note!.startsWith(l.mag === "R" ? "Right" : "Left"),
      )!;
      const gg = ground.geo() as TubeGeometry;
      const groundStart = gg.parameters.path.getPoint(0).toArray(),
        groundEnd = gg.parameters.path.getPoint(1).toArray();
      gg.dispose();
      // The ground wire has its own housing attachment, never the P-lead's condenser terminal: AMM 74-10 PDF 2615
      // removes the P-leads from the condensers (c) and the ground wires from the magnetos (d) as separate items, and a
      // grounded P-lead would stop the magneto in BOTH (Fig 74-00-1 PDF 2612; POH 7-37).
      const housing = MAGNETO_GROUND(l.mag),
        axis = MAGNETO(l.mag);
      expect(distance(groundStart, housing)).toBeLessThanOrEqual(0.005);
      expect(Math.hypot(housing[1] - axis[1], housing[2] - axis[2])).toBeCloseTo(MAGNETO_R, 6);
      expect(Math.abs(housing[0] - axis[0])).toBeLessThan(MAGNETO_LEN / 2);
      for (const p of [groundStart, groundEnd]) {
        expect(distance(p, stud)).toBeGreaterThan(0.02);
        expect(distance(p, l.pts[0])).toBeGreaterThan(0.02);
      }
    }
  });
});
