/** AMM 13773-002 Rev 7 Fig 74-20-1 PDF p. 2624; undimensioned, approximate routing. */
import { expect, it } from "vitest";
import { BufferAttribute, BufferGeometry, Line3, TubeGeometry, Vector3 } from "three";
import { CAT } from "@/aircraft/sr22t/parts";
import { IGNITION_LEADS } from "@/aircraft/sr22t/parts/engine-ignition";
import { ignitionIntersects, ignitionSolid } from "./sr22t-ignition-clearance";

it("all cap departures clear every other lead, including the opposite magneto's bundle, by two lead radii", () => {
  const hits: string[] = [];
  const leads = IGNITION_LEADS.map((lead) => {
    const part = CAT.parts.find(
      (p) =>
        p.name?.startsWith("Ignition lead —") &&
        p.note?.includes(`cylinder ${lead.cyl} ${lead.pos === "U" ? "upper" : "lower"} plug`),
    )!;
    const geometry = part.geo() as TubeGeometry;
    const end = lead.pts.findIndex(
      (p, i) => i > 1 && (lead.pos === "L" ? (lead.pts[i + 1]?.[1] ?? 0) < -0.19 : p[1] > 0.1),
    );
    expect(end).toBeGreaterThan(1);
    const path = geometry.parameters.path;
    const points = lead.pts.filter(
      (p, i, all) => i === 0 || new Vector3(...p).distanceTo(new Vector3(...all[i - 1])) > 1e-9,
    );
    const cornerEnd = points.indexOf(lead.pts[end]);
    expect(cornerEnd).toBeGreaterThan(1);
    const corners = points.map((_, i) => path.getPoint(i / (points.length - 1)));
    const spans = corners.slice(1).map((p, i) => new Line3(corners[i], p));
    // Keep the actual rendered rings and triangles, including the corner frames.
    // Rebuilding a shorter TubeGeometry would change those frames at the cut.
    const meshThrough = (count: number) =>
      ignitionSolid({
        ...part,
        geo: () => {
          const g = new BufferGeometry();
          const rings = (count * geometry.parameters.tubularSegments) / spans.length;
          const vertices = (rings + 1) * (geometry.parameters.radialSegments + 1);
          const position = geometry.getAttribute("position");
          g.setAttribute("position", new BufferAttribute(position.array.slice(0, vertices * 3), 3));
          g.setIndex(Array.from(geometry.index!.array.slice(0, rings * geometry.parameters.radialSegments * 6)));
          return g;
        },
      });
    return {
      lead,
      spans,
      end: cornerEnd,
      radius: geometry.parameters.radius,
      geometry,
      departure: meshThrough(cornerEnd),
      transition: meshThrough(cornerEnd + 1),
      full: ignitionSolid(part),
    };
  });
  expect(leads).toHaveLength(12);
  try {
    for (let i = 0; i < leads.length; i++)
      for (let j = i + 1; j < leads.length; j++) {
        const a = leads[i],
          b = leads[j];
        // Accept compact tied-bundle overlap, only among leads of the same
        // magneto AND plug bank. Their departures still get the full 2r check.
        const sameBundle = a.lead.mag === b.lead.mag && a.lead.pos === b.lead.pos;
        let gap = Infinity;
        for (const [from, to] of [
          [a, b],
          [b, a],
        ]) {
          const departing = from.spans.slice(0, from.end + (sameBundle ? 0 : 1));
          const others = sameBundle ? to.spans.slice(0, to.end) : to.spans;
          for (const span of departing) {
            const count = Math.max(1, Math.ceil(span.distance() / 0.00025));
            for (let n = 0; n <= count; n++) {
              const point = span.at(n / count, new Vector3());
              for (const other of others)
                gap = Math.min(gap, point.distanceTo(other.closestPointToPoint(point, true, new Vector3())));
            }
          }
        }
        const pair = `${a.lead.mag}${a.lead.cyl}${a.lead.pos}/${b.lead.mag}${b.lead.cyl}${b.lead.pos}`;
        // Half the sample pitch conservatively bounds the unsampled distance decrease.
        if (gap - 0.000125 < a.radius + b.radius) hits.push(`${pair}: ${(gap * 1000).toFixed(3)} mm centreline`);
        const intersects = sameBundle
          ? ignitionIntersects(a.departure, b.departure)
          : ignitionIntersects(a.transition, b.full) || ignitionIntersects(b.transition, a.full);
        if (intersects) hits.push(`${pair}: rendered meshes intersect`);
      }
    expect(hits).toEqual([]);
  } finally {
    for (const l of leads) {
      l.geometry.dispose();
      for (const s of [l.departure, l.transition, l.full]) s.g.dispose();
    }
  }
});
