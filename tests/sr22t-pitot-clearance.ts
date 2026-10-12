import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { tris } from "./mesh-clearance";
import { insideSolid } from "./winding-number";

/** Wire coordinates are world-space; matrix includes the obstacle's local and parent transforms. */
export const pitotClearance = (wire: MeshBVH, obstacle: THREE.BufferGeometry, matrix: THREE.Matrix4) => {
  obstacle.boundsTree = new MeshBVH(obstacle);
  const closest = wire.closestPointToGeometry(obstacle, matrix)!;
  const surfaceIntersection = wire.intersectsGeometry(obstacle, matrix);
  obstacle.computeBoundingBox();
  const bounds = obstacle.boundingBox!.clone().applyMatrix4(matrix);
  const mesh = tris(obstacle, matrix);
  const vertices = wire.geometry.attributes.position;
  const point = new THREE.Vector3();
  let contained = false;
  // Surface distance alone accepts a wire entirely inside a solid. Check every component's vertices,
  // using winding number so shared triangle seams and mirrored transforms do not defeat containment.
  for (let i = 0; i < vertices.count; i++) {
    point.fromBufferAttribute(vertices, i);
    if (bounds.containsPoint(point) && insideSolid(point, mesh)) {
      contained = true;
      break;
    }
  }
  return { closest, surfaceIntersection, contained };
};
