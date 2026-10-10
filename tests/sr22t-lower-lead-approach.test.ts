/** AMM 13773-002 Rev 7 74-20 PDF p. 2622, Fig 74-20-1 PDF p. 2624: routing approximate. */
import { expect, it } from "vitest";
import { TubeGeometry } from "three";
import { CAT, CYLS } from "@/aircraft/sr22t/parts";
import { IGNITION_LEADS, lowerLane } from "@/aircraft/sr22t/parts/engine-ignition";
import { FLOWS } from "@/aircraft/sr22t/flows";
import { curveOf } from "@/lib/geometry";
import { ignitionIntersects, ignitionSolid, sampledGap } from "./sr22t-ignition-clearance";

it("lower approaches descend to their bank lanes without a dip and make at most one fore-aft turn", () => {
  for (const lead of IGNITION_LEADS.filter((l) => l.pos === "L")) {
    const c = CYLS.find((c) => c.n === lead.cyl)!;
    const k = CYLS.filter((b) => b.s === c.s && b.x < c.x).length;
    const lane = lowerLane(c.s, k);
    const start = lead.pts.findIndex((p) => p[1] < -0.19);
    const laneEntry = lead.pts.findIndex((p, i) => i > start && p[2] === lane);
    expect(start).toBeGreaterThan(0);
    expect(laneEntry).toBeGreaterThan(start);
    const approach = lead.pts.slice(start, laneEntry + 1);
    for (let i = 1; i < approach.length; i++)
      expect(approach[i][1], `cylinder ${lead.cyl} lower approach`).toBeLessThanOrEqual(approach[i - 1][1]);
    const directions = lead.pts
      .slice(start)
      .slice(1)
      .map((p, i) => Math.sign(p[0] - lead.pts[start + i][0]))
      .filter(Boolean);
    const reversals = directions.filter((d, i) => i > 0 && d !== directions[i - 1]).length;
    expect(reversals, `cylinder ${lead.cyl} lower approach`).toBeLessThanOrEqual(1);
  }
});

it("the rendered cylinder 2 lower lead keeps 5 mm surface clearance from the hotL cabin-heat line", () => {
  const part = CAT.parts.find(
    (p) => p.name?.startsWith("Ignition lead —") && p.note?.includes("cylinder 2 lower plug"),
  )!;
  const lead = ignitionSolid(part);
  const f = FLOWS.find((f) => f.key === "hotL")!;
  const curve = curveOf(f.pts, f.tension ?? 0.3);
  const heat = ignitionSolid({
    id: f.key,
    sys: f.sys,
    name: f.key,
    geo: () => new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 6, false),
  });
  try {
    expect(ignitionIntersects(lead, heat)).toBe(false);
    expect(Math.min(sampledGap(lead, heat), sampledGap(heat, lead))).toBeGreaterThanOrEqual(0.005);
  } finally {
    lead.g.dispose();
    heat.g.dispose();
  }
});
