/** CAPS activation: POH 13772-007 7-96; AMM 13773-002 Rev 7 Fig 95-00-1 (PDF p. 2853). */
import { Box3, Euler, Matrix4, Mesh, Quaternion, Triangle, Vector3, type TubeGeometry } from "three";
import { describe, expect, it } from "vitest";
import { AB, topY } from "@/aircraft/sr22t/geometry";
import { CAPS_CABLE, CAT, CAPS_HANDLE_POS } from "@/aircraft/sr22t/parts";
import { live } from "@/aircraft/sr22t/model";
import type { PartSpec } from "@/lib/catalogue";

const one = (name: string) => {
  const parts = CAT.parts.filter((p) => p.name === name);
  expect(parts, name).toHaveLength(1);
  return parts[0];
};
const v = (p: number[]) => new Vector3(...p);
const worldBox = (p: PartSpec) => {
  const geo = p.geo();
  try {
    const mesh = new Mesh(geo);
    mesh.position.set(...(p.pos ?? [0, 0, 0]));
    mesh.rotation.set(...(p.rot ?? [0, 0, 0]));
    mesh.scale.set(...(p.scale ?? [1, 1, 1]));
    mesh.updateMatrixWorld();
    return new Box3().setFromObject(mesh);
  } finally {
    geo.dispose();
  }
};
/** Exact point-to-triangle distance on the actual part, including its world transform. */
const surfaceDistance = (point: Vector3, p: PartSpec) => {
  const geo = p.geo();
  try {
    const mesh = new Mesh(geo);
    mesh.position.set(...(p.pos ?? [0, 0, 0]));
    mesh.rotation.set(...(p.rot ?? [0, 0, 0]));
    mesh.scale.set(...(p.scale ?? [1, 1, 1]));
    mesh.updateMatrixWorld();
    const attr = geo.getAttribute("position"),
      index = geo.getIndex();
    const vertex = (i: number) =>
      new Vector3().fromBufferAttribute(attr, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
    let distance = Infinity;
    for (let i = 0; i < (index?.count ?? attr.count); i += 3) {
      const tri = new Triangle(vertex(i), vertex(i + 1), vertex(i + 2));
      distance = Math.min(distance, tri.closestPointToPoint(point, new Vector3()).distanceTo(point));
    }
    return distance;
  } finally {
    geo.dispose();
  }
};
/** Boxes per tube strip: a whole curved tube's box would include empty space below its roof run. */
const tubeBoxes = (geo: TubeGeometry) => {
  const { radialSegments, tubularSegments } = geo.parameters;
  const attr = geo.getAttribute("position");
  return Array.from({ length: tubularSegments }, (_, i) => {
    const points = [];
    for (let ring = i; ring <= i + 1; ring++)
      for (let j = 0; j <= radialSegments; j++)
        points.push(new Vector3().fromBufferAttribute(attr, ring * (radialSegments + 1) + j));
    return new Box3().setFromPoints(points);
  });
};

/** World boxes for a part: one per strip for a tube, else its single box. */
const partBoxes = (p: PartSpec) => {
  const geo = p.geo();
  try {
    if (geo.type !== "TubeGeometry") return [worldBox(p)];
    const matrix = new Matrix4().compose(
      v(p.pos ?? [0, 0, 0]),
      new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
      v(p.scale ?? [1, 1, 1]),
    );
    return tubeBoxes(geo as TubeGeometry).map((b) => b.applyMatrix4(matrix));
  } finally {
    geo.dispose();
  }
};

describe("SR22T CAPS mechanical activation", () => {
  it("the stowed T-handle lies horizontally in its overhead recess (POH 7-96; operator correction)", () => {
    const handle = one("CAPS activation T-handle");
    const bounds = worldBox(handle),
      size = bounds.getSize(new Vector3());
    const geo = handle.geo();
    // First component is the stem: corresponding vertices in its two 21-vertex radial rings.
    const attr = geo.getAttribute("position");
    const axis = new Vector3()
      .fromBufferAttribute(attr, 0)
      .sub(new Vector3().fromBufferAttribute(attr, 21))
      .normalize()
      .applyEuler(new Euler(...(handle.rot ?? [0, 0, 0])));
    geo.dispose();
    expect(Math.abs(axis.dot(new Vector3(0, 1, 0)))).toBeLessThan(0.2);
    expect(size.y).toBeLessThan(Math.max(size.x, size.z) * 0.2);
    // Undimensioned display choices, recorded here rather than attributed to measured source dimensions.
    expect(handle.pos![1]).toBeCloseTo(0.63, 6);
    expect(handle.pos![2]).toBe(0);
    const pinSize = (name: string, expected: number[]) => {
      const actual = worldBox(one(name)).getSize(new Vector3()).toArray();
      expected.forEach((value, i) => expect(actual[i]).toBeCloseTo(value, 6));
    };
    pinSize("CAPS activation T-handle", [0.115, 0.024, 0.15]);
    pinSize("CAPS handle receptacle", [0.188, 0.03, 0.208]);
    pinSize("CAPS activation handle cover", [0.18, 0.006, 0.21]);
    pinSize("CAPS cover black forward tab", [0.03, 0.004, 0.025]);
    expect(one("CAPS activation handle cover").pos![0]).toBe(handle.pos![0]);
    expect(one("CAPS activation handle cover").pos![1]).toBeCloseTo(0.612, 6);
    expect(one("CAPS cover black forward tab").pos![0]).toBeCloseTo(handle.pos![0] + 0.1, 6);
    expect(one("CAPS cover black forward tab").pos![1]).toBeCloseTo(0.607, 6);
    CAPS_CABLE[0].forEach((value, i) => expect(value).toBeCloseTo([handle.pos![0] - 0.045, 0.642, 0][i], 6));
    expect(CAPS_CABLE[1]).toEqual([CAPS_CABLE[0][0], 0.7, 0]);
    expect(bounds.getCenter(new Vector3()).z).toBeCloseTo(0);
    expect(worldBox(one("CAPS handle receptacle")).containsBox(bounds)).toBe(true);
    expect(worldBox(one("CAPS activation handle cover")).max.y).toBeLessThan(bounds.min.y);
    expect(worldBox(one("CAPS activation handle cover")).max.y).toBeCloseTo(
      worldBox(one("CAPS handle receptacle")).min.y,
      6,
    );
    expect(one("CAPS cover black forward tab").color).toBe("#151515");
    expect(worldBox(one("CAPS cover black forward tab")).max.x).toBeGreaterThan(
      worldBox(one("CAPS activation handle cover")).max.x,
    );
  });

  it("the handle station is above and aft of the front-seat shoulder reference (POH 7-96; Fig 7-4 item 1)", () => {
    const handle = worldBox(one("CAPS activation T-handle"));
    const centre = handle.getCenter(new Vector3());
    for (const name of ["Pilot seat", "Front passenger seat"]) {
      // Each seat has a cushion and a reclined back; the higher part is the shoulder reference.
      const back = CAT.parts
        .filter((p) => p.name === name)
        .map(worldBox)
        .sort((a, b) => b.max.y - a.max.y)[0];
      expect(centre.x).toBeGreaterThanOrEqual(back.min.x);
      // The forward face bounds the occupant side of the reclined seat-back shoulder reference.
      expect(centre.x).toBeLessThan(back.max.x);
      expect(handle.min.y).toBeGreaterThan(back.max.y);
    }
    for (const name of ["CAPS handle receptacle", "CAPS activation handle cover"])
      expect(worldBox(one(name)).getCenter(new Vector3()).x).toBeCloseTo(CAPS_HANDLE_POS[0], 6);
    // The moved recess must also clear the adjacent overhead oxygen control panel and roll-cage hoops.
    const hardware = CAT.parts.filter((p) => p.sys.includes("oxygen") || p.name === "Composite roll cage");
    for (const name of [
      "CAPS activation T-handle",
      "CAPS handle receptacle",
      "CAPS activation handle cover",
      "CAPS cover black forward tab",
    ])
      for (const other of hardware)
        for (const b of partBoxes(other))
          expect(worldBox(one(name)).intersectsBox(b), `${name} / ${other.name ?? other.id}`).toBe(false);
    // Illustrative aft bend is pinned separately from the source-based shoulder relation.
    expect(CAPS_CABLE[2]).toEqual([0.85, 0.685, -0.06]);
    expect(CAPS_CABLE[3]).toEqual([0.82, 0.59, -0.12]);
    expect(CAPS_CABLE[2][0]).toBeLessThan(CAPS_CABLE[0][0]);
  });

  it("pulling extracts the handle downward and keeps the cable attached (POH 7-96)", () => {
    const handle = one("CAPS activation T-handle"),
      cable = one("CAPS activation cable");
    const meshes = [handle, cable, one("CAPS activation handle cover"), one("CAPS cover black forward tab")].map(
      (p) => {
        const m = new Mesh(p.geo());
        m.position.set(...(p.pos ?? [0, 0, 0]));
        return m;
      },
    );
    const previous = live.capsT;
    try {
      for (const t of [-1, 0, 0.075, 0.15, 1, -1]) {
        live.capsT = t;
        [handle, cable, one("CAPS activation handle cover"), one("CAPS cover black forward tab")].forEach((p, i) =>
          p.anim?.(meshes[i], 0),
        );
        const drop = CAPS_HANDLE_POS[1] - meshes[0].position.y;
        expect(drop).toBeCloseTo(t < 0 ? 0 : t === 0.075 ? 0.025 : t === 0 ? 0 : 0.05);
        expect(meshes[2].visible).toBe(t < 0);
        expect(meshes[3].visible).toBe(t < 0);
        const start = (meshes[1].geometry as TubeGeometry).parameters.path.getPoint(0);
        expect(start.y).toBeCloseTo(CAPS_CABLE[0][1] - drop);
        expect(surfaceDistance(start, { ...handle, pos: [CAPS_HANDLE_POS[0], meshes[0].position.y, 0] })).toBeLessThan(
          0.003,
        );
      }
    } finally {
      live.capsT = previous;
      meshes.forEach((m) => m.geometry.dispose());
    }
  });

  it("an activation cable joins the T-handle to the rocket igniter (POH 7-96; AMM Fig 95-00-1)", () => {
    const cable = one("CAPS activation cable"),
      igniter = one("Rocket igniter"),
      handle = one("CAPS activation T-handle");
    // Horizontal stem attachment stays within 5 cm of the handle centre.
    expect(v(CAPS_CABLE[0]).distanceTo(v(handle.pos!))).toBeLessThanOrEqual(0.05);
    expect(v(CAPS_CABLE.at(-1)!).distanceTo(v(igniter.pos!))).toBeLessThan(0.05);
    // Check contact against the actual rendered meshes, not against the cable's own constants.
    expect(surfaceDistance(v(CAPS_CABLE[0]), handle)).toBeLessThan(1e-6);
    expect(surfaceDistance(v(CAPS_CABLE.at(-1)!), igniter)).toBeLessThan(1e-6);
    expect(v(CAPS_CABLE[0]).y).toBeCloseTo(worldBox(handle).max.y, 6);
    expect(v(CAPS_CABLE.at(-1)!).x).toBeCloseTo(worldBox(igniter).max.x, 6);
    expect(worldBox(one("CAPS canister")).containsBox(worldBox(igniter))).toBe(true);
    const geo = cable.geo() as TubeGeometry;
    try {
      const path = geo.parameters.path;
      expect(path.getPoint(0).distanceTo(v(CAPS_CABLE[0]))).toBeLessThan(1e-6);
      expect(path.getPoint(1).distanceTo(v(CAPS_CABLE.at(-1)!))).toBeLessThan(1e-6);
    } finally {
      geo.dispose();
    }
  });

  it("the cable leaves the handle upward and runs aft without a forward hook (POH 7-96; AMM Fig 95-00-1)", () => {
    const geo = one("CAPS activation cable").geo() as TubeGeometry;
    try {
      const path = geo.parameters.path;
      let previous = path.getPoint(0);
      expect(previous.x).toBeLessThan(CAPS_HANDLE_POS[0]);
      expect(previous.z).toBeCloseTo(CAPS_HANDLE_POS[2], 6);
      const lead = path.getPoint(0.02);
      expect(lead.y).toBeGreaterThan(previous.y);
      expect(lead.x).toBeCloseTo(previous.x, 6);
      for (let i = 1; i <= 400; i++) {
        const point = path.getPoint(i / 400);
        expect(point.x).toBeLessThanOrEqual(previous.x + 1e-6);
        previous = point;
      }
      expect(geo.parameters.radius).toBe(0.003); // Illustrative radius; an open question.
    } finally {
      geo.dispose();
    }
  });

  it("the cable runs under the cabin roof (AMM Fig 95-00-1)", () => {
    const seatUnderside = Math.min(...CAT.parts.filter((p) => p.name === "Pilot seat").map((p) => worldBox(p).min.y));
    const check = (p: Vector3) => {
      if (p.x >= AB && p.x <= CAPS_CABLE[0][0]) {
        expect(p.y).toBeGreaterThan(seatUnderside);
        // Existing oxygen.ts uses a schematic headliner 0.07 m below the outer skin.
        expect(topY(p.x) - p.y).toBeGreaterThanOrEqual(0);
        expect(Math.abs(topY(p.x) - 0.07 - p.y)).toBeLessThanOrEqual(0.15);
      }
    };
    CAPS_CABLE.forEach((p) => check(v(p)));
    const geo = one("CAPS activation cable").geo() as TubeGeometry;
    try {
      for (let i = 0; i <= 400; i++) check(geo.parameters.path.getPoint(i / 400));
    } finally {
      geo.dispose();
    }
  });

  it("new activation parts clear other solids in world boxes (AMM Fig 95-00-1; schematic clearance)", () => {
    const cable = one("CAPS activation cable"),
      igniter = one("Rocket igniter");
    // Canister is an enclosing cover, plates are bulkhead penetrations, and moving parts use parent coordinates.
    expect(one("CAPS canister").fairing).toBe(true);
    const solids = CAT.parts.filter((p) => p !== cable && p !== igniter && !p.fairing && !p.plate && !p.parent);
    const geo = cable.geo() as TubeGeometry;
    try {
      // Allow surface contact at the two required attachments, but no positive-volume overlap.
      const cableBoxes = tubeBoxes(geo);
      for (const p of solids) {
        const otherGeo = p.geo();
        try {
          // Curved tube boxes must follow their strips: roll-cage and harness interiors are empty space.
          const boxes =
            otherGeo.type === "TubeGeometry" && !p.pos && !p.rot && !p.scale
              ? tubeBoxes(otherGeo as TubeGeometry)
              : p.name === "CAPS handle receptacle"
                ? (() => {
                    // Its open centre is empty: bound the actual rim triangles rather than enclosing the recess.
                    const attr = otherGeo.getAttribute("position"),
                      index = otherGeo.getIndex()!;
                    return Array.from({ length: index.count / 3 }, (_, i) =>
                      new Box3().setFromPoints(
                        [0, 1, 2].map((j) =>
                          new Vector3().fromBufferAttribute(attr, index.getX(i * 3 + j)).add(v(p.pos!)),
                        ),
                      ),
                    );
                  })()
                : [worldBox(p)];
          for (const b of boxes) {
            expect(worldBox(igniter).intersectsBox(b), `igniter / ${p.name ?? p.id}`).toBe(false);
            expect(
              cableBoxes.some((c) => c.clone().expandByScalar(-1e-6).intersectsBox(b.clone().expandByScalar(-1e-6))),
              `cable / ${p.name ?? p.id}`,
            ).toBe(false);
          }
        } finally {
          otherGeo.dispose();
        }
      }
      expect(
        cableBoxes.some((c) => c.clone().expandByScalar(-1e-6).intersectsBox(worldBox(igniter).expandByScalar(-1e-6))),
      ).toBe(false);
    } finally {
      geo.dispose();
    }
  });
});
