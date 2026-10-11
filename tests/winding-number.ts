import * as THREE from "three";

export type Tri = readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3];

const A = new THREE.Vector3(),
  B = new THREE.Vector3(),
  C = new THREE.Vector3(),
  X = new THREE.Vector3();

/**
 * Generalized winding number of a triangle soup about `p` (Jacobson et al. 2013): the summed signed solid angle of
 * every triangle over 4π. It is 1 inside a closed outward-wound mesh and 0 outside, with no ray, so shared edges and
 * vertices cannot be counted twice. It degrades gracefully where parity breaks:
 * - concatenated overlapping components add up (2 in the overlap) and a shared internal face cancels;
 * - an uncapped tube reads close to 1 along its interior, away from the open ends;
 * - a single open plate never exceeds ½ on either side.
 * Mirrored (negative-scale) parts reverse the winding, so callers compare the magnitude.
 */
export const windingNumber = (p: THREE.Vector3, mesh: readonly Tri[]) => {
  let sum = 0;
  for (const [a, b, c] of mesh) {
    A.subVectors(a, p);
    B.subVectors(b, p);
    C.subVectors(c, p);
    const la = A.length(),
      lb = B.length(),
      lc = C.length();
    // Van Oosterom & Strackee's solid angle of one triangle
    const num = A.dot(X.crossVectors(B, C));
    const den = la * lb * lc + A.dot(B) * lc + A.dot(C) * lb + B.dot(C) * la;
    sum += 2 * Math.atan2(num, den);
  }
  return sum / (4 * Math.PI);
};

/** Inside the solid volume a mesh bounds. The ½ threshold excludes the near side of a single open plate. */
export const insideSolid = (p: THREE.Vector3, mesh: readonly Tri[]) => Math.abs(windingNumber(p, mesh)) > 0.5 + 1e-6;
