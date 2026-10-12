/**
 * All five A5 mask ports are grouped on the one overhead console (distribution manifold with integral LED dome
 * light; AFMS 102NMAN0001 Rev F §1 p. 8, Fig 1 p. 10). No source dimensions the console or the port pitch, so these
 * assert the cluster relationship, not source coordinates.
 */
import { Box3, Euler, Matrix4, Quaternion, Vector3, type TubeGeometry } from "three";
import { describe, expect, it } from "vitest";
import { inFus } from "@/aircraft/sr22t/geometry";
import { CAT, OXY } from "@/aircraft/sr22t/parts";
import type { PartSpec } from "@/lib/catalogue";

const one = (name: string) => {
  const p = CAT.parts.find((p) => p.name === name);
  if (!p) throw new Error(`Missing part: ${name}`);
  return p;
};
const transform = (p: PartSpec) =>
  new Matrix4().compose(
    new Vector3(...(p.pos ?? [0, 0, 0])),
    new Quaternion().setFromEuler(new Euler(...(p.rot ?? [0, 0, 0]))),
    new Vector3(...(p.scale ?? [1, 1, 1])),
  );
const vertices = (p: PartSpec) => {
  const g = p.geo();
  try {
    const a = g.getAttribute("position");
    return Array.from({ length: a.count }, (_, i) =>
      new Vector3().fromBufferAttribute(a, i).applyMatrix4(transform(p)),
    );
  } finally {
    g.dispose();
  }
};
const worldBox = (p: PartSpec) => new Box3().setFromPoints(vertices(p));
const path = (p: PartSpec) => {
  const g = p.geo() as TubeGeometry;
  try {
    return g.parameters.path.getPoints(2000).map((v) => v.clone().applyMatrix4(transform(p)));
  } finally {
    g.dispose();
  }
};
const isTube = (p: PartSpec) => {
  const g = p.geo();
  try {
    return g.type === "TubeGeometry";
  } finally {
    g.dispose();
  }
};
const PORTS = [1, 2, 3, 4, 5].map((i) => `Oxygen outlet ${i}`);
const panel = () => one("Overhead distribution manifold");
/** The stated cluster envelope: all five ports within 0.20 m laterally, 0.05 m fore-aft and 0.05 m vertically. */
const ENVELOPE = new Vector3(0.05, 0.05, 0.2);

describe("SR22T oxygen mask ports form one overhead cluster (AFMS §1 p. 8, Fig 1 p. 10)", () => {
  it("all five ports sit on the console's lower face, inside a small envelope", () => {
    const face = worldBox(panel());
    const cluster = PORTS.map((n) => worldBox(one(n))).reduce((b, p) => b.union(p), new Box3());
    const size = cluster.getSize(new Vector3());
    for (const axis of ["x", "y", "z"] as const) expect(size[axis], axis).toBeLessThanOrEqual(ENVELOPE[axis]);
    for (const n of PORTS) {
      const port = worldBox(one(n));
      // Flush with the lower face, within the console's plan footprint.
      expect(port.max.y, n).toBeCloseTo(face.min.y, 9);
      expect(port.min.x, n).toBeGreaterThanOrEqual(face.min.x);
      expect(port.max.x, n).toBeLessThanOrEqual(face.max.x);
      expect(port.min.z, n).toBeGreaterThanOrEqual(face.min.z);
      expect(port.max.z, n).toBeLessThanOrEqual(face.max.z);
    }
  });

  it("the ports are side by side at one consistent pitch, numbered left to right", () => {
    const centres = PORTS.map((n) => new Vector3(...one(n).pos!));
    for (const c of centres) {
      expect(c.x).toBeCloseTo(centres[0].x, 9);
      expect(c.y).toBeCloseTo(centres[0].y, 9);
    }
    const gaps = centres.slice(1).map((c, i) => c.z - centres[i].z);
    for (const g of gaps) {
      expect(g).toBeCloseTo(gaps[0], 9);
      // Abreast, not overlapping: the pitch exceeds one port diameter.
      expect(g).toBeGreaterThan(worldBox(one(PORTS[0])).getSize(new Vector3()).z);
    }
    expect(centres.map((c) => c.toArray())).toEqual(OXY.outlets);
  });

  it("the console and every port stay inside the skin", () => {
    for (const p of [panel(), ...PORTS.map(one)])
      for (const v of vertices(p)) expect(inFus(v), `${p.name}: ${v.toArray()}`).toBe(true);
  });

  it("the supply runs continuously from the aft hose to the console, its only line", () => {
    const hose = path(one("Non-conductive oxygen hose")),
      supply = path(one("Center cabin low pressure oxygen line")),
      face = worldBox(panel());
    expect(hose.at(-1)!.distanceTo(supply[0])).toBeLessThan(1e-8);
    for (let i = 1; i < supply.length; i++) expect(supply[i].distanceTo(supply[i - 1])).toBeLessThan(0.01);
    expect(face.distanceToPoint(supply.at(-1)!)).toBeLessThan(1e-8);
    // The ports are fed inside the console: no other oxygen line starts or ends on it.
    const attached = CAT.parts
      .filter((p) => p.sys.includes("oxygen") && isTube(p))
      .filter((p) => {
        const v = path(p);
        return face.distanceToPoint(v[0]) < 1e-3 || face.distanceToPoint(v.at(-1)!) < 1e-3;
      })
      .map((p) => p.name);
    expect(attached).toEqual(["Center cabin low pressure oxygen line"]);
  });

  it("no outlet or outlet branch sits away from the console", () => {
    const oxygen = CAT.parts.filter((p) => p.sys.includes("oxygen"));
    const outlets = oxygen.filter((p) => /outlet/i.test(p.name ?? ""));
    expect(outlets.map((p) => p.name).sort()).toEqual([...PORTS].sort());
    const face = worldBox(panel());
    for (const p of outlets) expect(face.distanceToPoint(new Vector3(...p.pos!)), p.name).toBeLessThan(0.05);
    expect(oxygen.filter((p) => /feed|takeoff|tee/i.test(p.name ?? "")).map((p) => p.name)).toEqual([]);
    const pinned = CAT.pinned("oxygen").map((p) => p.name);
    for (const n of PORTS) expect(pinned).toContain(n);
  });
});
