/** Lower-lead clearance from the merged baffles: AMM 13773-002 Rev 7 Fig 74-20-1 PDF p. 2624;
 * Continental M-18 Fig 16-29 p. 16-33. Routes and 2 mm schematic margin are approximate.
 */
// This integration guard also applies to main's original leads; the negative control moves a lead into a real cylinder baffle.
import { describe, expect, it } from "vitest";
import { Curve, TubeGeometry, Vector3 } from "three";
import { CAT } from "@/aircraft/sr22t/parts";
import { IGNITION_LEADS } from "@/aircraft/sr22t/parts/engine-ignition";
import { gap, solid, type Shape } from "./sr22t-engine-gap";

const baffles = () =>
  CAT.parts
    .filter((p) =>
      /^(Side baffle|Aft baffle|Front baffle|Intercooler seal|Baffle seal|Inter-cylinder baffle|Cylinder baffle)$/.test(
        p.name ?? "",
      ),
    )
    .map(solid);
const clearance = (part: (typeof CAT.parts)[number], plates: Shape[]) => {
  const geometry = part.geo() as TubeGeometry;
  const path = geometry.parameters.path;
  const radius = geometry.parameters.radius;
  const closest = new Vector3();
  const hits: string[] = [];
  // Parameter spans are straight and equally subdivided. Half a 0.5 mm sample step is added to the margin,
  // conservatively bounding the unsampled centreline by distance's 1-Lipschitz property.
  const step = 0.0005;
  const count = Math.ceil(path.getLength() / step);
  // getPointAt is parametrised per corner, so bound by the longest span, not total arclength.
  const corners = path.getPoints(geometry.parameters.tubularSegments);
  const maxStep =
    Math.max(...corners.slice(1).map((p, i) => p.distanceTo(corners[i]))) * geometry.parameters.tubularSegments;
  const samples = Math.max(count, Math.ceil(maxStep / step));
  for (const b of plates) {
    let minimum = Infinity;
    for (let i = 0; i <= samples; i++) {
      const point = path.getPointAt(i / samples);
      if (b.box.distanceToPoint(point) > radius + 0.002 + step / 2) continue;
      for (const face of b.faces) {
        if (face.box.distanceToPoint(point) > radius + 0.002 + step / 2) continue;
        minimum = Math.min(minimum, point.distanceTo(face.triangle.closestPointToPoint(point, closest)));
      }
    }
    if (minimum < radius + 0.002 + step / 2) hits.push(`${b.name}: ${(minimum * 1000).toFixed(3)} mm centreline`);
  }
  geometry.dispose();
  // Exact rendered-surface audit catches edge/face crossings and complete containment over the entire tube.
  const wire = solid(part);
  for (const b of plates) if (gap(wire, b, 0.002) < 0.002) hits.push(`${b.name}: rendered surface below 2 mm`);
  return hits;
};

describe("SR22T lower leads clear every baffle", () => {
  it("every complete rendered lower-lead path clears every baffle by its tube radius plus 2 mm (AMM Fig 74-20-1 PDF 2624; M-18 Fig 16-29 p. 16-33)", () => {
    const plates = baffles();
    expect(plates).toHaveLength(20);
    const hits: string[] = [];
    for (const lead of IGNITION_LEADS.filter((l) => l.pos === "L")) {
      const part = CAT.parts.find(
        (p) => p.name?.startsWith("Ignition lead —") && p.note?.includes(`cylinder ${lead.cyl} lower plug`),
      )!;
      hits.push(...clearance(part, plates).map((hit) => `cylinder ${lead.cyl}: ${hit}`));
    }
    expect(hits).toEqual([]);
  }, 30000);
  it("rejects a rendered lower lead pushed into the cylinder baffle (M-18 Fig 16-29 p. 16-33)", () => {
    const plate = CAT.parts.find((p) => p.name === "Cylinder baffle" && p.note?.startsWith("Cylinder 1:"))!;
    const target = solid(plate).box.getCenter(new Vector3());
    const part = CAT.parts.find(
      (p) => p.name?.startsWith("Ignition lead —") && p.note?.includes("cylinder 1 lower plug"),
    )!;
    const original = part.geo() as TubeGeometry;
    const start = original.parameters.path.getPointAt(0.8);
    const shift = target.sub(start);
    const path = original.parameters.path;
    const movedPath = new (class extends Curve<Vector3> {
      constructor() {
        super();
      }
      override getPoint(t: number, out = new Vector3()) {
        return path.getPoint(t, out).add(shift);
      }
      override getPointAt(t: number, out = new Vector3()) {
        return this.getPoint(t, out);
      }
      override getTangent(t: number, out = new Vector3()) {
        return path.getTangent(t, out);
      }
      override getTangentAt(t: number, out = new Vector3()) {
        return this.getTangent(t, out);
      }
    })();
    const params = original.parameters;
    original.dispose();
    const moved = {
      ...part,
      geo: () =>
        new TubeGeometry(movedPath, params.tubularSegments, params.radius, params.radialSegments, false).translate(
          ...new Vector3(...part.pos!).negate().toArray(),
        ),
    };
    expect(clearance(moved, [solid(plate)])).not.toEqual([]);
  }, 30000);
});
