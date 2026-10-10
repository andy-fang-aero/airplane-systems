import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
const BVH_OPTIONS = { indirect: true, setBoundingBox: true };
type Face = { triangle: THREE.Triangle; box: THREE.Box3 };
const faceCache = new WeakMap<Face[], MeshBVH>();
/**
 * BVH candidate selection only; callers retain their original exact distance and containment rules.
 * Treat `faces` as immutable after the first call: the BVH is cached in a WeakMap keyed by that array.
 */
export const faceCandidates = (faces: Face[], bounds: THREE.Box3) => {
  let tree = faceCache.get(faces);
  if (!tree) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float64Array(faces.flatMap(({ triangle: t }) => [...t.a, ...t.b, ...t.c])), 3),
    );
    tree = new MeshBVH(geometry, BVH_OPTIONS);
    faceCache.set(faces, tree);
  }
  const indices: number[] = [];
  tree.shapecast({
    intersectsBounds: (box) => box.intersectsBox(bounds),
    intersectsTriangle: (_triangle, index) => {
      if (faces[index].box.intersectsBox(bounds)) indices.push(index);
      return false;
    },
  });
  // Preserve original loop order, including its first-contact early returns.
  return indices.sort((a, b) => a - b).map((i) => faces[i]);
};
