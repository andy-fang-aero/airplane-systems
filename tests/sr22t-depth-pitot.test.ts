/**
 * SR22T pitot-static locations: SR22T POH 13772-007 7-68 – 7-71 (Fig 7-16) and AMM 13773-002 Rev 7
 * 34-10 (PDF pp. 1628 – 1636), Fig 34-10-1 sheets 2 and 4 (PDF pp. 1646, 1648), Fig 34-10-2 (PDF p. 1649) and Fig 6-00-6
 * (PDF p. 123).
 */
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { AB, inFus, wC, wLE, WR } from "@/aircraft/sr22t/geometry";
import { FLOWS, flowRates } from "@/aircraft/sr22t/flows";
import { initialSim, solve, type Sim } from "@/aircraft/sr22t/model";
import {
  ALT_STATIC,
  CAT,
  DRAINS,
  MD302_POS,
  PITOT_TIP,
  PITOT_Z,
  SPX,
  STATIC_TEE,
  SUMPS,
  TRAPS,
} from "@/aircraft/sr22t/parts";
import type { Vec3 } from "@/lib/math";
import { patched, type Patch } from "./helpers";

const at = (name: string) => CAT.parts.find((p) => p.name === name)!;
const pts = (key: string): Vec3[] =>
  FLOWS.find((f) => f.key === key)!.pts.map((p) => (Array.isArray(p) ? (p as Vec3) : [p.x, p.y, p.z]));
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rates = (p: Patch<Sim>) => {
  const s = patched(initialSim, p);
  return flowRates(s, solve(s));
};
/** Underside of the front seat cushions: the cabin floor is below them. */
const seatFloor = () => at("Pilot seat").pos![1] - 0.05;
/** Main spar station at the wing root (structure.ts): CF2L is forward of the spar tunnel, CF3R aft of it (Fig 6-00-6). */
const SPAR_X = wLE(WR) - 0.3 * wC(WR);

describe("SR22T pitot mast (AMM 34-10)", () => {
  it("the pitot mast is on the LH wing just inboard of the tip (AMM 34-10 PDF 1628)", () => {
    expect(PITOT_Z).toBeGreaterThan(-5.55);
    expect(PITOT_Z).toBeLessThanOrEqual(-4.8);
    for (const name of ["Pitot mast", "Heated pitot tube"]) {
      const geo = at(name).geo();
      try {
        geo.computeBoundingBox();
        const off = at(name).pos ?? [0, 0, 0];
        expect(geo.boundingBox!.max.z + off[2], name).toBeLessThan(-4.7);
      } finally {
        geo.dispose();
      }
    }
  });

  it("the pitot tip is 3.6 in from the entry to the bend (AMM Fig 34-10-2 PDF 1649)", () => {
    const { bend, entry } = PITOT_TIP;
    expect(dist(bend, entry)).toBeGreaterThan(0.091 - 0.005);
    expect(dist(bend, entry)).toBeLessThan(0.091 + 0.005);
    expect(entry[0] - bend[0]).toBeCloseTo(dist(bend, entry), 6);
    const geo = at("Heated pitot tube").geo();
    try {
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      expect(b.max.x - b.min.x).toBeCloseTo(3.6 * 0.0254, 4);
    } finally {
      geo.dispose();
    }
  });
});

describe("SR22T static system (AMM 34-10 PDF 1629)", () => {
  it("static line sumps sit at both static ports behind the aft cabin bulkhead (AMM 34-10 PDF 1629)", () => {
    const sumps = CAT.parts.filter((p) => p.name?.startsWith("Static line sump"));
    expect(sumps).toHaveLength(2);
    expect(SUMPS).toHaveLength(2);
    const ports = CAT.parts.filter((p) => p.name?.startsWith("Static port"));
    expect(ports).toHaveLength(2);
    for (const p of [...sumps, ...ports]) expect(p.pos![0], p.name).toBeLessThan(AB);
    for (const s of sumps) expect(Math.min(...ports.map((p) => dist(p.pos!, s.pos!))), s.name).toBeLessThan(0.08);
    expect(SPX).toBeLessThan(AB);
  });

  it("each static port line runs through its sump (AMM Fig 34-10-1 sheet 2 items 13, 16, 2, PDF 1646)", () => {
    for (const [key, side, sump] of [
      ["static", "R", SUMPS[0]],
      ["staticL", "L", SUMPS[1]],
    ] as const) {
      const line = pts(key),
        port = at(`Static port (${side})`).pos!,
        sumpPart = at(`Static line sump (${side})`).pos!;
      expect(sumpPart, key).toEqual(sump);
      // port first, then its own sump, then on toward the tee
      expect(dist(line[0], port), key).toBeLessThan(0.02);
      expect(dist(line[1], sump), key).toBeLessThan(1e-9);
      expect(Math.sign(sump[2]), key).toBe(Math.sign(port[2]));
      expect(dist(line.at(-1)!, STATIC_TEE), key).toBeLessThan(1e-9);
    }
  });

  it("the static tee is on the aft cabin bulkhead at the LH CAPS enclosure (AMM 34-10; Fig 34-10-1 note 2)", () => {
    expect(Math.abs(STATIC_TEE[0] - AB)).toBeLessThan(0.1);
    expect(STATIC_TEE[2]).toBeLessThan(0);
    for (const key of ["static", "staticL"]) expect(dist(pts(key).at(-1)!, STATIC_TEE), key).toBeLessThan(1e-9);
    expect(dist(pts("static2")[0], STATIC_TEE)).toBeLessThan(1e-9);
  });

  it("selecting alternate static feeds the static line from the cabin (POH 7-69)", () => {
    const alt = rates({ pitot: { alt: true } }),
      ports = rates({ pitot: { alt: false } });
    expect(alt.staticAlt).toBeGreaterThan(0);
    expect(alt.static).toBe(0);
    expect(alt.staticL).toBe(0);
    expect(ports.staticAlt).toBe(0);
    expect(ports.static).toBeGreaterThan(0);
    expect(ports.staticL).toBeGreaterThan(0);
    // the instruments stay fed either way
    for (const r of [alt, ports])
      for (const k of ["staticAdahrs", "staticStby", "pitot", "pitotStby"]) expect(r[k], k).toBeGreaterThan(0);
  });
});

describe("SR22T pitot and static plumbing (POH 7-68, Fig 7-16)", () => {
  it("a water trap at each pitot and static low point (POH 7-68)", () => {
    const traps = CAT.parts.filter((p) => /water trap/.test(p.name ?? ""));
    expect(traps.map((p) => p.name).sort()).toEqual(["Pitot water trap", "Static water trap"]);
    for (const [key, trap] of [
      ["pitot", TRAPS.pitot],
      ["static2", TRAPS.static],
    ] as const) {
      const line = pts(key);
      expect(Math.min(...line.map((p) => dist(p, trap))), key).toBeLessThan(1e-9);
      // the trap is the line's low point
      expect(Math.min(...line.map((p) => p[1])), key).toBe(trap[1]);
    }
    expect(at("Pitot water trap").pos).toEqual(TRAPS.pitot);
    expect(at("Static water trap").pos).toEqual(TRAPS.static);
  });

  it("pitot and static reach the MD302 and the alternate static valve (POH Fig 7-16)", () => {
    for (const key of ["pitotStby", "staticStby"]) expect(dist(pts(key).at(-1)!, MD302_POS), key).toBeLessThan(1e-9);
    const alt = pts("staticAlt");
    expect(dist(alt[0], ALT_STATIC)).toBeLessThan(1e-9);
    expect(at("Alternate static valve").pos).toEqual(ALT_STATIC);
    // the alternate source and the MD302 branch tee into the static line downstream of the trap
    expect(dist(alt.at(-1)!, pts("static2").at(-1)!)).toBeLessThan(1e-9);
    expect(dist(pts("staticStby")[0], pts("static2").at(-1)!)).toBeLessThan(1e-9);
  });

  it("each water trap drains through a drain tube to a plug (POH 7-68; AMM 34-10 PDF 1636; Fig 34-10-1 items 4, 8)", () => {
    for (const line of ["pitot", "static"] as const) {
      const Line = line === "pitot" ? "Pitot" : "Static",
        trap = TRAPS[line],
        { tube, plug } = DRAINS[line];
      // the tube starts on the bottom face of its trap (the line's low point) and ends at its plug
      expect(Math.abs(tube[0][0] - trap[0]), line).toBeLessThan(1e-9);
      expect(Math.abs(tube[0][2] - trap[2]), line).toBeLessThan(1e-9);
      expect(tube[0][1], line).toBeLessThan(trap[1]);
      expect(trap[1] - tube[0][1], line).toBeLessThanOrEqual(0.03);
      expect(dist(tube.at(-1)!, plug), line).toBeLessThan(1e-9);
      // water runs down to the plug: no point of the drain is above the trap's bottom face, and the plug is lowest
      for (const p of tube) expect(p[1], line).toBeLessThanOrEqual(tube[0][1]);
      expect(plug[1], line).toBe(Math.min(...tube.map((p) => p[1])));
      expect(at(`${Line} drain plug`).pos, line).toEqual(plug);
      expect(inFus(new Vector3(...plug)), line).toBe(true);
      expect(plug[1], line).toBeLessThan(seatFloor());
      // the drawn tube spans from its trap to its plug
      const geo = at(`${Line} drain tube`).geo();
      try {
        geo.computeBoundingBox();
        const b = geo.boundingBox!.expandByScalar(0.006);
        for (const p of [tube[0], plug]) expect(b.containsPoint(new Vector3(...p)), line).toBe(true);
      } finally {
        geo.dispose();
      }
    }
    expect(CAT.parts.filter((p) => / drain (tube|plug)$/.test(p.name ?? ""))).toHaveLength(4);
  });

  it("a water trap at each line's low point (POH 7-68; AMM 34-10 PDF 1629, 1636; AMM Fig 6-00-6)", () => {
    // Q7 open: CF3R (right of centre, aft of the spar tunnel) or CF2L (pilot seat, left of centre, forward of it).
    const cf3r = ([x, , z]: Vec3) => x < SPAR_X && x > SPAR_X - 0.6 && z > 0;
    const cf2l = ([x, , z]: Vec3) => x > SPAR_X && x < SPAR_X + 0.6 && z < 0;
    for (const name of ["Pitot water trap", "Static water trap"]) {
      const p = at(name).pos!;
      expect(p[1], name).toBeLessThan(seatFloor());
      expect(p[0], name).toBeGreaterThan(AB);
      expect(inFus(new Vector3(...p)), name).toBe(true);
      expect(cf3r(p) || cf2l(p), name).toBe(true);
    }
  });
});
