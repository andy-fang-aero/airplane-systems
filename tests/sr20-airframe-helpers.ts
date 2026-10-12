import * as THREE from "three";
import { af, FUSE, FIN, SSPAN, SY, WR, WTIP, fLE, fC, sLE, sC, wLE, wC, wingP } from "@/aircraft/sr20/geometry";

/** Physical consistency with the schematic airframe, not surveyed installation clearance. */
export function insideSR20Airframe(p: THREE.Vector3, margin = 0) {
  if (FUSE.inside(p, margin)) return true;
  if (Math.abs(p.z) >= WR && Math.abs(p.z) <= WTIP) {
    const xc = (wLE(p.z) - p.x) / wC(p.z);
    if (xc >= 0 && xc <= 1 && p.y >= wingP(p.z, xc, -1).y + margin && p.y <= wingP(p.z, xc, 1).y - margin) return true;
  }
  if (Math.abs(p.z) <= SSPAN) {
    const c = sC(p.z),
      xc = (sLE(p.z) - p.x) / c;
    if (xc >= 0 && xc <= 1) {
      const [hi, lo] = af(xc, 0.1, 0);
      if (p.y >= SY + lo * c + margin && p.y <= SY + hi * c - margin) return true;
    }
  }
  if (p.y >= FIN[0][0] && p.y <= FIN.at(-1)![0]) {
    const c = fC(p.y),
      xc = (fLE(p.y) - p.x) / c;
    if (xc >= 0 && xc <= 1 && Math.abs(p.z) + margin <= af(xc, Math.min(0.11, 0.1 / c), 0)[0] * c) return true;
  }
  return false;
}
