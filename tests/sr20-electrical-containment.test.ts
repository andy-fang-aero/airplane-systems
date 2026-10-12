import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAT } from "@/aircraft/sr20/parts";
import { insideSR20Airframe as inside } from "./sr20-airframe-helpers";
import {
  ELECTRICAL_AVIONICS_DEPTH_FLOWS as F,
  EXTERIOR_RF_PORTS,
} from "@/aircraft/sr20/electrical-avionics-depth-flow";
import { curveOf } from "@/lib/geometry";
import { toV } from "@/lib/math";
const ownedNames =
  /^(Master Control|Main Distribution|Essential Distribution|ALT [12] (?:field|drive)|BAT [12]|Ground power|Ground service|Starter relay|External power|MCU |MDB interconnect|CONV bus fuse|GSU |ADAHRS [12] mounting|GIA [12] \(|GEA 71|MD302 standby|GCU |GMC |GMA |GTX |Magnetometer|MAG [12] wiring|PFD (?:bezel|cooling)|MFD (?:bezel|cooling)|Marker beacon antenna|Integrated avionics cooling|Cabin speaker|Cabin microphone|GDL |GSR |Gateway |WX-500|GTS 800|KN 63|Avionics master relays|Harness TVS|Console transient|Convenience system controller|Wing harness|Tail harness|Engine sensor harness|Bolster master)/;
/** Only the small connector stub at a documented exterior antenna can leave the skin.
 * Whole flows, roof transitions and internal LRU endpoints are never exempted.
 */
const exteriorPort = (f: (typeof F)[number], p: THREE.Vector3) =>
  (EXTERIOR_RF_PORTS[f.key] ?? []).some(
    (port) => p.distanceTo(toV(port.end === "start" ? f.pts[0] : f.pts.at(-1)!)) <= port.length + (f.r ?? 0.012),
  );
const internalParts = CAT.parts.filter((p) => !p.ext && !p.parent && ownedNames.test(p.name ?? ""));
describe("SR20 electrical/avionics fits within the rendered airframe (schematic installation)", () => {
  it.each(internalParts.map((p) => [p.name!, p] as const))("%s keeps every transformed mesh vertex inside", (_, p) => {
    const geo = p.geo(),
      attr = geo.getAttribute("position");
    const mat = new THREE.Matrix4().compose(
      toV(p.pos ?? [0, 0, 0]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
      toV(p.scale ?? [1, 1, 1]),
    );
    const outside: string[] = [];
    for (let i = 0; i < attr.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(mat);
      if (!inside(v))
        outside.push(
          v
            .toArray()
            .map((n) => n.toFixed(5))
            .join(","),
        );
    }
    geo.dispose();
    expect(outside.slice(0, 5)).toEqual([]);
  });
  it.each(F.map((f) => [f.key, f] as const))("%s keeps the full rendered tube and sampled radius inside", (_, f) => {
    const curve = curveOf(f.pts, f.tension ?? 0.3),
      r = f.r ?? 0.012;
    const outside: string[] = [];
    // Dense arc-length sampling plus the exact TubeGeometry segmentation/radial count used by Flows.tsx.
    for (const p of curve.getSpacedPoints(1200))
      if (!inside(p, r + 0.001) && !exteriorPort(f, p))
        outside.push(
          p
            .toArray()
            .map((n) => n.toFixed(5))
            .join(","),
        );
    if (f.tube !== false) {
      const mesh = new THREE.TubeGeometry(curve, Math.max(24, Math.round(curve.getLength() * 28)), r, 6, false);
      const attr = mesh.getAttribute("position");
      for (let i = 0; i < attr.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(attr, i);
        if (!inside(p) && !exteriorPort(f, p))
          outside.push(
            p
              .toArray()
              .map((n) => n.toFixed(5))
              .join(","),
          );
      }
      mesh.dispose();
    }
    expect(outside.slice(0, 5)).toEqual([]);
  });
});
