"use client";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { dotTex, finishMat, ghostMat, mats, outlineMat, plateMat, seeMat, shellMat, solidMat } from "@/lib/materials";

const GREY = "#808080";

/**
 * One material of each shader program the scene components draw with (a program depends on the material type and options
 * such as transparency, sidedness, maps and clipping planes, never on the colour): the shared part, plate and shell
 * materials, and those Tanks, Flows, Screens, LightFX and WindowOutlines make for themselves.
 */
function variants(extra: THREE.Material[]): THREE.Object3D[] {
  const plane = new THREE.PlaneGeometry(0.01, 0.01),
    line = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0.01, 0, 0)]);
  const meshes = [
    ...Object.values(mats(GREY)),
    plateMat.on,
    plateMat.dim,
    shellMat,
    ghostMat(GREY),
    seeMat(GREY),
    solidMat,
    finishMat.polished,
    // Tanks: the tank shell and the fuel, cut at its level by a clipping plane
    new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      clippingPlanes: [new THREE.Plane()],
    }),
    // Screens, and LightFX's light beams
    new THREE.MeshBasicMaterial({ map: dotTex(), toneMapped: false }),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    ...extra,
  ].map((m) => new THREE.Mesh(plane, m));
  return [
    ...meshes,
    new THREE.LineLoop(line, outlineMat),
    new THREE.LineSegments(line, new THREE.LineBasicMaterial()),
    // Flows' particles and LightFX's glows
    new THREE.Points(
      line,
      new THREE.PointsMaterial({ map: dotTex(), transparent: true, depthWrite: false, sizeAttenuation: true }),
    ),
    new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: dotTex(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  ];
}

/**
 * Starts compiling the scene's shader programs before the model is built, so the GPU links them (in parallel, where
 * KHR_parallel_shader_compile is available) while the main thread builds geometry, and the first frame that draws the model
 * finds them ready instead of waiting on each link. The objects are compiled against the scene's lights but never added to
 * it. `extra`: materials of the airplane's own (e.g. its painted skin). `onStarted` gets the compile's promise once started.
 */
export function Precompile({
  extra = [],
  onStarted,
}: {
  extra?: THREE.Material[];
  onStarted?: (compiled: Promise<unknown>) => void;
}) {
  const gl = useThree((s) => s.gl),
    scene = useThree((s) => s.scene),
    camera = useThree((s) => s.camera);
  useEffect(() => {
    const group = new THREE.Group().add(...variants(extra));
    const compiled = gl
      .compileAsync(group, camera, scene)
      .catch((e: unknown) => console.warn("Shader precompile failed; programs compile on first use instead:", e))
      // the materials are never disposed, so their programs stay in the renderer's cache; only the group is dropped
      .finally(() => group.clear());
    onStarted?.(compiled);
  }, [gl, scene]); // once per scene: the variants and the callback don't change
  return null;
}
