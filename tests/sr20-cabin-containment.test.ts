/** Geometry audit against the actual SR20 loft, including curved duct surfaces rather than only anchors. */
import { Mesh, TubeGeometry, Vector3 } from "three";
import { expect, it } from "vitest";
import { CAT } from "@/aircraft/sr20/parts";
import { FUSE } from "@/aircraft/sr20/geometry";
import {
  CABIN_ENVIRONMENT_CAPS_DEPTH_FLOWS as FLOWS,
  CABIN_ENVIRONMENT_SKIN_PORTS,
} from "@/aircraft/sr20/cabin-environment-caps-depth-flow";
import { curveOf } from "@/lib/geometry";

it("audits cabin-domain internal meshes against the fuselage", () => {
  const bad: Record<string, { count: number; sample: number[] }> = {};
  for (const p of CAT.parts.filter(
    (p) => !p.ext && !p.parent && !p.plate && p.sys.some((s) => ["cabin", "doors", "caps", "environment"].includes(s)),
  )) {
    const geo = p.geo(),
      m = new Mesh(geo);
    m.position.set(...(p.pos ?? [0, 0, 0]));
    m.rotation.set(...(p.rot ?? [0, 0, 0]));
    m.scale.set(...(p.scale ?? [1, 1, 1]));
    m.updateMatrixWorld();
    const pos = geo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const v = new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      if (!FUSE.inside(v, -0.0001)) {
        const b = (bad[p.name ?? p.id] ??= { count: 0, sample: v.toArray() });
        b.count++;
      }
    }
    geo.dispose();
  }
  expect(bad).toEqual({});
});
it("audits complete cabin-domain duct and cable surfaces against the fuselage", () => {
  const bad: Record<string, { count: number; sample: number[] }> = {};
  for (const f of FLOWS.filter((f) => f.tube !== false)) {
    const curve = curveOf(f.pts, f.tension ?? 0.3),
      geo = new TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), f.r ?? 0.012, 12, false),
      pos = geo.getAttribute("position");
    const skinPort = CABIN_ENVIRONMENT_SKIN_PORTS[f.key];
    for (let i = 0; i < pos.count; i++) {
      const v = new Vector3().fromBufferAttribute(pos, i);
      // A duct legitimately crosses its own belly port. Allow only the local aperture, never the whole route.
      const atAperture = skinPort && v.distanceTo(new Vector3(...skinPort.point)) <= skinPort.reach;
      if (!FUSE.inside(v, -0.0001) && !atAperture) {
        const b = (bad[f.key] ??= { count: 0, sample: v.toArray() });
        b.count++;
      }
    }
    geo.dispose();
  }
  expect(bad).toEqual({});
});

it("restricts skin apertures to the real named belly hardware and its exact local loft surface", () => {
  for (const [key, port] of Object.entries(CABIN_ENVIRONMENT_SKIN_PORTS)) {
    const hardware = CAT.parts.filter((p) => p.name === port.part);
    expect(hardware, port.part).toHaveLength(1);
    expect(hardware[0].ext).toBe(true);
    expect(hardware[0].pos).toEqual(port.point);
    const point = new Vector3(...port.point);
    expect(FUSE.inside(point, -0.00001)).toBe(true);
    expect(FUSE.inside(point, 0.0001)).toBe(false);
    const flow = FLOWS.find((f) => f.key === key)!;
    expect(flow.ext).not.toBe(true);
    expect(flow.pts.some((p) => new Vector3(...(Array.isArray(p) ? p : p.toArray())).distanceTo(point) < 1e-8)).toBe(
      true,
    );
  }
});
