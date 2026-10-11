/** Landing gear: main and nose gear, wheels and pants, brakes and brake lines, parking brake, rudder pedals / toe brakes. */
import * as THREE from "three";
import { V, type Vec3 } from "@/lib/math";
import { loft, mergeGeos, sided } from "@/lib/geometry";
import { brakeAmount, brakeAnim, pressureAnim } from "@/lib/anims";
import { box, cyl, FW, pantGeo, tubeGeo, wingP } from "../geometry";
import { useSR22T } from "../store";
import { part } from "./catalogue";

/* ---------- landing gear (track 9.1 ft per POH Fig. 1-1: wheels at RBL/LBL 54.8, AMM 13773-002 Fig 6-00-2) ---------- */
export const MG = { x: 1.12, y: -1.2, z: 1.392 };
// AMM Fig 32-10-1 (PDF 1397), Fig 32-10-2 (PDF 1403): undimensioned, illustrative.
const MAIN_FAIRING_RADIUS = 0.06;
const MAIN_AXLE = { offset: 0.035, length: 0.24 };
const MAIN_PANT = { center: [MG.x, MG.y + 0.03, MG.z] as Vec3, radius: 0.19 };
// Place the spring 5 mm inside the axle's inboard end; its entire tube clears the fixed disc.
const mainStrutTip = (s: number): Vec3 => [MG.x, MG.y, s * (MG.z - MAIN_AXLE.offset - MAIN_AXLE.length / 2 + 0.005)];
// Nut rests on the fork outer face; illustrative 10 mm thickness retains pant clearance
// (AMM Fig 32-41-2 items 1/2/7, PDF 1449). Axle length follows the pin outer surface.
const NOSE_WHEEL: Vec3 = [0.02, 0, 0];
const NOSE_FORK_Z = 0.08;
const NOSE_FORK_RADIUS = 0.022;
const NOSE_NUT_THICKNESS = 0.01;
const NOSE_NUT_RADIUS = 0.025;
const noseForkGeo = (s: number) =>
  tubeGeo(
    [
      [-0.03, 0.095, 0],
      [-0.06, 0.06, s * NOSE_FORK_Z],
      [NOSE_WHEEL[0], NOSE_WHEEL[1], s * NOSE_FORK_Z],
    ],
    NOSE_FORK_RADIUS,
  );
// Seat on the rendered fork under the nut footprint; the bend bulges higher, but outside it.
const NOSE_FORK_OUTER_Z = (() => {
  const geo = noseForkGeo(1);
  const vertices = geo.getAttribute("position");
  let outer = -Infinity;
  for (let i = 0; i < vertices.count; i++) {
    const dx = vertices.getX(i) - NOSE_WHEEL[0],
      dy = vertices.getY(i) - NOSE_WHEEL[1];
    if (Math.hypot(dx, dy) <= NOSE_NUT_RADIUS) outer = Math.max(outer, vertices.getZ(i));
  }
  geo.dispose();
  return outer;
})();
const NOSE_NUT: Vec3 = [NOSE_WHEEL[0], NOSE_WHEEL[1], NOSE_WHEEL[2] + NOSE_FORK_OUTER_Z + NOSE_NUT_THICKNESS / 2];
const NOSE_PIN: Vec3 = [NOSE_NUT[0], NOSE_NUT[1], NOSE_NUT[2] + NOSE_NUT_THICKNESS / 5];
// POH 13772-007 7-25; AMM 13773-002 Rev 7 32-10 p. 1 (PDF 1392), Fig 32-10-2 (PDF 1403):
// the upper bracket holds the inner end in the wing; the leg exits through the WS 37 lower bracket.
// WS 27.5, 45% chord and the 0.06 m rise above lower skin are approximate drawing-derived placements.
const mainStrutPath = (s: number): Vec3[] => {
  const upper = wingP(s * 27.5 * 0.0254, 0.45, -1).add(V(0, 0.06, 0));
  const lower = wingP(s * 37 * 0.0254, 0.45, -1);
  return [upper.toArray() as Vec3, lower.toArray() as Vec3, [1.14, -0.9, s * (MG.z - 0.2)], mainStrutTip(s)];
};
// AMM Fig 32-10-1 items 4/8 (PDF 1397): lower wheel fairing encloses the spring/axle attachment.
// The retained streamlined pant receives an illustrative inboard skirt around the spring.
// Cross-section envelopes use the rendered cover terminal and axle anchors, with 10 mm overlap.
const mainFairingPath = (s: number) =>
  new THREE.CatmullRomCurve3(
    mainStrutPath(s)
      .slice(1)
      .map((p) => V(...p)),
    false,
    "catmullrom",
    0.15,
  );
const mainFairingEnd = (s: number) => {
  const path = mainFairingPath(s);
  const height = MAIN_PANT.center[1] + MAIN_PANT.radius - MAIN_FAIRING_RADIUS;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (path.getPoint(mid).y > height) lo = mid;
    else hi = mid;
  }
  return hi;
};
// Convex section of the pant and its two attachment envelopes, resampled by radial angle.
// This keeps one continuous closed shell, rather than intersecting skirt and pant meshes.
const pantSection = (points: THREE.Vector2[]) => {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const chain = (list: THREE.Vector2[]) => {
    const result: THREE.Vector2[] = [];
    for (const point of list) {
      while (result.length >= 2 && turn(result.at(-2)!, result.at(-1)!, point) <= 0) result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  const hull = [...chain(sorted), ...chain([...sorted].reverse())];
  return Array.from({ length: 32 }, (_, i) => {
    const angle = (2 * Math.PI * i) / 32,
      dy = Math.cos(angle),
      dz = Math.sin(angle);
    let distance = Infinity;
    hull.forEach((a, j) => {
      const b = hull[(j + 1) % hull.length],
        ey = b.x - a.x,
        ez = b.y - a.y;
      const denominator = ey * dz - ez * dy;
      if (denominator < -1e-12) distance = Math.min(distance, (ey * a.y - ez * a.x) / denominator);
    });
    return new THREE.Vector2(distance * dy, distance * dz);
  });
};
const mainPantCache = new Map<number, THREE.BufferGeometry>();
const mainPantGeo = (s: number) => {
  const cached = mainPantCache.get(s);
  if (cached) return cached.clone();
  const base = pantGeo(0.92, MAIN_PANT.radius) as THREE.LatheGeometry;
  const profile = base.parameters.points;
  base.computeBoundingBox();
  const x0 = base.boundingBox!.min.x;
  const top = mainFairingPath(s).getPoint(mainFairingEnd(s));
  const lower = V(...mainStrutTip(s));
  const envelopes = [
    { center: top, radius: MAIN_FAIRING_RADIUS + 0.01 },
    { center: lower, radius: 0.04 + 0.01 },
  ];
  // Keep the original longitudinal stations; add detail only around the attachment skirt.
  const stations = [
    ...profile.map((p) => x0 + p.y),
    ...Array.from({ length: 33 }, (_, i) => top.x - MAIN_PANT.center[0] - 0.1 + (0.2 * i) / 32),
  ].sort((a, b) => a - b);
  const rings = stations.map((x) => {
    const u = ((x - x0) / 0.92) * (profile.length - 1),
      j = Math.min(Math.floor(u), profile.length - 2);
    const radius = THREE.MathUtils.lerp(profile[j].x, profile[j + 1].x, u - j);
    const points = Array.from({ length: 32 }, (_, k) => {
      const angle = (2 * Math.PI * k) / 32;
      return new THREE.Vector2(radius * Math.cos(angle), radius * 0.75 * Math.sin(angle));
    });
    for (const envelope of envelopes) {
      const dx = x + MAIN_PANT.center[0] - envelope.center.x;
      if (Math.abs(dx) >= envelope.radius) continue;
      const r = Math.sqrt(envelope.radius ** 2 - dx ** 2);
      for (let k = 0; k < 32; k++) {
        const angle = (2 * Math.PI * k) / 32;
        points.push(
          new THREE.Vector2(
            envelope.center.y - MAIN_PANT.center[1] + r * Math.cos(angle),
            s * envelope.center.z - MAIN_PANT.center[2] + r * Math.sin(angle),
          ),
        );
      }
    }
    return pantSection(points).map((p) => V(x, p.x, s * p.y));
  });
  base.dispose();
  // Mirroring the section reverses winding; keep both exterior skins facing outward.
  if (s > 0) rings.forEach((ring) => ring.reverse());
  const geo = loft(rings);
  mainPantCache.set(s, geo);
  return geo.clone();
};
// Brake anchors are schematic placements from AMM Figs 32-42-1/3/4/5 (PDF 1462/1469/1476/1481).
// Neither manual dimensions the brake hardware; all sizes and offsets below are illustrative.
export const PARK_VALVE: Vec3 = [FW - 0.12, -0.49, -0.08];
// AMM 13773-002 Rev 7 Fig 32-42-4 items 13/14 (PDF 1476): RH battery-bracket mount.
// Lateral offset approximate: undimensioned bracket placement, inset below the cowl shoulder.
const BRAKE_RESERVOIR: Vec3 = [FW + 0.06, 0.1, 0.3];
const masterCylinder = (z: number): Vec3 => [2.51, -0.58, z];
const supplyX = (i: number) => 2.459 + i * 0.007;
export const PARK_HANDLE: Vec3 = [2.16, -0.17, -0.17];
// POH 7-25: corresponding toes at the two stations, not both toes at one station.
const toeSide = (z: number) => (z === -0.36 || z === 0.14 ? -1 : 1);
const brakeTee = (s: number): Vec3 => [s < 0 ? 2.535 : 2.52, s < 0 ? -0.645 : -0.655, s * 0.2];
const discZ = (s: number) => s * (MG.z - 0.094);
const brakeCaliper = (s: number): Vec3 => [MG.x - 0.12, MG.y - 0.02, discZ(s) - s * 0.04];
const brakeUnion = (s: number): Vec3 => [MG.x - 0.16, MG.y - 0.02, discZ(s) - s * 0.065];
const brakeInlet = (s: number): Vec3 => [MG.x - 0.153, MG.y - 0.02, discZ(s) - s * 0.04];
const innerWing = (z: number, chord: number, depth: number): Vec3 =>
  wingP(z, chord, -1)
    .lerp(wingP(z, chord, 1), depth)
    .toArray() as Vec3;
const brakeBulkhead = (s: number): Vec3 => innerWing(s * 0.52, 0.57, 0.35);
const SUPPLY_SPLIT: Vec3 = [2.47, -0.54, 0.43];
const SUPPLY_FW: Vec3 = [FW, -0.37, 0.46];
// AMM Figs 32-42-3/4/5 (PDF1469/1476/1481): cabin → internal wing → covered strut.
// Offset .0435 m aft / .018 m outboard is illustrative, within nhz1's .06 m cover and clear of .04 m strut.
const coveredStrutRun = (s: number): Vec3[] => {
  const path = new THREE.CatmullRomCurve3(
    mainStrutPath(s)
      .slice(1)
      .map((p) => V(...p)),
    false,
    "catmullrom",
    0.15,
  );
  return Array.from(
    { length: 24 },
    (_, i) =>
      path
        .getPoint((i + 3) / 32)
        .add(V(-0.0435, 0, s * 0.018))
        .toArray() as Vec3,
  );
};
// AMM 32-42 PDF 1472 / Fig 32-42-4 sheet 4 (PDF 1479): LH forward, RH aft.
// The manual calls master-side ports "outlets" and gear-side ports "inlets".
export const PARK_VALVE_PORT = {
  lhMaster: [PARK_VALVE[0] + 0.025, PARK_VALVE[1], PARK_VALVE[2] - 0.045],
  rhMaster: [PARK_VALVE[0] - 0.025, PARK_VALVE[1], PARK_VALVE[2] + 0.045],
  lhLine: [PARK_VALVE[0] + 0.025, PARK_VALVE[1] - 0.04, PARK_VALVE[2]],
  rhLine: [PARK_VALVE[0] - 0.025, PARK_VALVE[1] - 0.04, PARK_VALVE[2]],
} satisfies Record<string, Vec3>;
const masterPort = (s: number) => (s < 0 ? PARK_VALVE_PORT.lhMaster : PARK_VALVE_PORT.rhMaster);
const linePort = (s: number) => (s < 0 ? PARK_VALVE_PORT.lhLine : PARK_VALVE_PORT.rhLine);
// Forward face per AMM 32-42 p. 22 (PDF 1471), Fig 32-42-4 (PDF 1479).
// Undimensioned housing/mount offsets are illustrative.
export const PARK_ARM: Vec3 = [PARK_VALVE[0] + 0.0535, PARK_VALVE[1], PARK_VALVE[2]];
// Inclined arm 24 and lower pin 17: AMM Fig 32-42-4 sheet 4, PDF 1479.
// 60° OFF inclination, additional 30° travel, 10 mm lever and hardware sizes illustrative.
export const parkArmAngle = (fraction: number) => -Math.PI / 3 - (fraction * Math.PI) / 6;
export const parkClevis = (fraction: number): Vec3 => {
  const angle = parkArmAngle(fraction);
  return [PARK_ARM[0] + 0.012, PARK_ARM[1] - 0.01 * Math.cos(angle), PARK_ARM[2] - 0.01 * Math.sin(angle)];
};
export const PARK_CLEVIS = parkClevis(0);
export const PARK_BRACKET: Vec3 = [PARK_VALVE[0], PARK_VALVE[1] + 0.0305, PARK_VALVE[2] + 0.009];
// 1.8 in of wire visible with arm OFF (AMM PDF 1475/1479); sheath end above stop.
export const PARK_STOP: Vec3 = [PARK_CLEVIS[0] - 0.004, PARK_ARM[1] + 0.02, PARK_CLEVIS[2]];
export const PARK_SHEATH: Vec3 = [PARK_STOP[0], PARK_STOP[1] + 0.0015 + 1.8 * 0.0254, PARK_STOP[2]];
export const PARK_CABLE: Vec3[] = [
  PARK_HANDLE,
  [2.32, -0.2, -0.21],
  [FW - 0.035, -0.3, -0.23],
  [FW - 0.035, PARK_SHEATH[1] + 0.025, -0.23],
  [PARK_SHEATH[0], PARK_SHEATH[1] + 0.025, PARK_SHEATH[2]],
  PARK_SHEATH,
];
// Inextensible free wire from stop to wrap. Pull travel is derived from the arm arc,
// not an independent translation (AMM Fig 32-42-4 PDF 1479; dimensions illustrative).
const wireEnd = (fraction: number): Vec3 => {
  const pin = parkClevis(fraction);
  return [pin[0] - 0.004, pin[1] + 0.005, pin[2]];
};
const freeWireLength = V(...PARK_STOP).distanceTo(V(...wireEnd(0)));
export const parkStop = (fraction: number): Vec3 => {
  const end = wireEnd(fraction);
  return [PARK_STOP[0], end[1] + Math.sqrt(freeWireLength ** 2 - (end[2] - PARK_STOP[2]) ** 2), PARK_STOP[2]];
};
export const parkWire = (fraction: number): Vec3[] => {
  const stop = parkStop(fraction);
  return [[PARK_SHEATH[0], PARK_SHEATH[1] + stop[1] - PARK_STOP[1], PARK_SHEATH[2]], stop, wireEnd(fraction)];
};
export const parkWrap = (fraction: number): Vec3[] => {
  const pin = parkClevis(fraction);
  return Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * Math.PI * 3;
    return [pin[0] - 0.004 + (i / 48) * 0.008, pin[1] + Math.cos(a) * 0.005, pin[2] + Math.sin(a) * 0.005];
  });
};
// Rebuild only at a switch transition; the fixed sheath never moves.
// Ownership survives Part rerenders, which replace userData, and never mutates the cached catalogue geometry.
const parkGeometries = new WeakMap<THREE.Mesh, { geometry: THREE.BufferGeometry; fraction: number }>();
const parkTubeAnim =
  (points: (fraction: number) => Vec3[], radius: number): NonNullable<Parameters<typeof part>[2]>["anim"] =>
  (m) => {
    const fraction = useSR22T.getState().s.gear.park ? 1 : 0;
    const owned = parkGeometries.get(m);
    if (owned?.fraction === fraction && owned.geometry === m.geometry) return;
    const old = m.geometry;
    m.geometry = tubeGeo(points(fraction), radius, 0);
    if (owned?.geometry === old) old.dispose();
    parkGeometries.set(m, { geometry: m.geometry, fraction });
  };

/** Named terminal anchors, in neutral pedal pose. Sizes/offsets schematic, AMM Figs 32-42-4/5. */
export const BRAKE_FITTINGS: Record<string, Vec3> = {
  ...PARK_VALVE_PORT,
  reservoir: [BRAKE_RESERVOIR[0], BRAKE_RESERVOIR[1] - 0.03, BRAKE_RESERVOIR[2]],
  reservoirUnion: [FW + 0.015, 0.065, 0.33],
  supplyFirewall: SUPPLY_FW,
  supplyTee: SUPPLY_SPLIT,
  lhTee: brakeTee(-1),
  rhTee: brakeTee(1),
  lhBulkhead: brakeBulkhead(-1),
  rhBulkhead: brakeBulkhead(1),
  lhUnion: brakeUnion(-1),
  rhUnion: brakeUnion(1),
  lhCaliper: brakeInlet(-1),
  rhCaliper: brakeInlet(1),
};
// Master-cylinder faces and manifold outlets are ports on the existing solids, not extra overlapping fittings.
[-0.36, -0.14, 0.14, 0.36].forEach((z, i) => {
  BRAKE_FITTINGS[`master${i}Supply`] = [masterCylinder(z)[0], masterCylinder(z)[1] + 0.05, z];
  BRAKE_FITTINGS[`master${i}Pressure`] = [masterCylinder(z)[0], masterCylinder(z)[1] - 0.05, z];
  BRAKE_FITTINGS[`supplyTee${i}`] = [supplyX(i), SUPPLY_SPLIT[1], SUPPLY_SPLIT[2]];
});
export const BRAKE_LINES: { from: string; to: string; pts: Vec3[]; name: string; side?: "L" | "R"; held: boolean }[] =
  [];
const hydraulicRef = "POH 13772-007 7-25–7-26; AMM 13773-002 Rev 7 Figs 32-42-3/4/5, PDF 1469/1476/1479/1481";
// Every terminal is a named port or a rendered fitting; intermediate bends are continuous tube, not junctions.
function hydraulicPart(
  pts: Vec3[],
  radius: number,
  tension: number,
  opts: Parameters<typeof part>[2],
  side?: "L" | "R",
  held = false,
) {
  const anchor = (point: Vec3, end: string) => {
    const found = Object.entries(BRAKE_FITTINGS).find(([, p]) => V(...p).distanceTo(V(...point)) < 1e-8);
    if (found) return found[0];
    throw new Error(`Missing brake ${end} port for ${opts?.name}: ${point.join(",")}`);
  };
  const from = anchor(pts[0], "from"),
    to = anchor(pts[pts.length - 1], "to");
  // Geometry terminals use the same exported port anchors as junction fittings.
  pts = [BRAKE_FITTINGS[from], ...pts.slice(1, -1), BRAKE_FITTINGS[to]];
  const line = { from, to, pts, name: opts?.name ?? "Brake line", side, held };
  BRAKE_LINES.push(line);
  part(() => tubeGeo(line.pts, radius, tension), ["gear"], {
    ...opts,
    anim: side
      ? pressureAnim(() => {
          const gear = useSR22T.getState().s.gear;
          return held ? brakeAmount(gear, side) : Math.max(0, side === "R" ? gear.diff : -gear.diff);
        })
      : undefined,
  });
}
const masterValvePath = (s: number): Vec3[] => [
  brakeTee(s),
  [s < 0 ? 2.585 : 2.475, brakeTee(s)[1], s * 0.2],
  [s < 0 ? 2.585 : 2.475, brakeTee(s)[1], masterPort(s)[2]],
  [2.585, brakeTee(s)[1], masterPort(s)[2]],
  [2.585, PARK_VALVE[1], masterPort(s)[2]],
  masterPort(s),
];
const brakePath = (s: number): Vec3[] => [
  linePort(s),
  [2.51, PARK_VALVE[1] - 0.04, s < 0 ? -0.105 : -0.01],
  [2.51, s < 0 ? -0.66 : -0.665, s < 0 ? -0.105 : -0.01],
  [2.29, s < 0 ? -0.66 : -0.665, s < 0 ? -0.105 : -0.01],
  [2.29, s < 0 ? -0.66 : -0.665, s < 0 ? -0.16 : 0.095],
  [0.91, -0.65, s < 0 ? -0.16 : 0.095],
  brakeBulkhead(s),
];
const gearBrakePath = (s: number): Vec3[] => [
  brakeBulkhead(s),
  innerWing(s * 1.02, 0.58, 0.15),
  [1.126, -0.585, s * 1.02],
  [1.126, -0.585, s * 0.989],
  [1.126, -0.632, s * 0.989],
  ...coveredStrutRun(s),
  [MG.x - 0.17, -1.135, discZ(s) - s * 0.04],
  [MG.x - 0.17, MG.y - 0.02, discZ(s) - s * 0.065],
  brakeUnion(s),
];
// Annular disc and open piston bores (AMM Fig 32-42-1 items 9–12, PDF 1462).
// All dimensions are illustrative; the bore clears the existing nhz1 axle and strut.
const brakeDiscGeo = () => {
  const profile = new THREE.Shape();
  profile.absarc(0, 0, 0.12, 0, Math.PI * 2, false);
  const bore = new THREE.Path();
  bore.absarc(0, 0, 0.065, 0, Math.PI * 2, true);
  profile.holes.push(bore);
  return new THREE.ExtrudeGeometry(profile, { depth: 0.016, bevelEnabled: false, curveSegments: 32 }).translate(
    0,
    0,
    -0.008,
  );
};
const caliperGeo = (s: number) => {
  const housing = new THREE.Shape();
  housing.moveTo(-0.025, -0.04);
  housing.lineTo(0.025, -0.04);
  housing.lineTo(0.025, 0.04);
  housing.lineTo(-0.025, 0.04);
  housing.closePath();
  for (const y of [-0.018, 0.018]) {
    const bore = new THREE.Path();
    bore.absarc(0, y, 0.013, 0, Math.PI * 2, true);
    housing.holes.push(bore);
  }
  return mergeGeos([
    new THREE.ExtrudeGeometry(housing, { depth: 0.022, bevelEnabled: false, curveSegments: 24 }).translate(
      0.015,
      0.02,
      -0.011,
    ),
    box(0.02, 0.08, 0.067).translate(-0.02, 0.02, s * 0.0225),
    box(0.05, 0.08, 0.004).translate(0.015, 0.02, s * 0.054),
  ]);
};
[1, -1].forEach((s) => {
  part(() => tubeGeo(mainStrutPath(s), 0.04), ["gear"], {
    name: "Main gear strut",
    note: "Fiberglass composite leaf spring provides main-gear shock absorption; attaches between WS 27 and WS 37, between spar and shear web (POH 13772-007 7-25; AMM 13773-002 Rev 7 32-00, PDF 1390; 32-10 p. 1, PDF 1392, Fig 32-10-2, PDF 1403). Inner end at WS 27.5 / 45% chord, 0.06 m above lower skin, passes through the WS 37 lower fitting; Lower end meets the axle at wheel-center height, 5 mm outboard of the axle’s inboard end (approximately 0.15 m inboard of wheel center) (AMM Fig 32-10-1, PDF 1397); placement and cross-section approximate.",
    ext: true,
  });
  part(() => new THREE.TorusGeometry(0.13335, 0.05715, 16, 32).scale(1, 1, 4 / 3), ["gear"], {
    pos: [MG.x, MG.y, s * MG.z],
    color: "#2A2F33",
    name: "Main wheel",
    note: "15 × 6.00 × 6 tubeless tire: nominal 15 in diameter / 6 in width / 6 in rim; rounded profile approximate (POH 13772-007 7-25; AMM 13773-002 Rev 7 32-41, PDF 1442, Fig 32-41-1, PDF 1446). Inflate to 60–65 psi (POH 8-14).",
    ext: true,
  });
  part(() => mainPantGeo(s), ["gear"], {
    pos: [MAIN_PANT.center[0], MAIN_PANT.center[1], s * MAIN_PANT.center[2]],
    fairing: true,
    name: "Wheel pant",
    note: "Removable; access doors open for tire inflation and pressure checks (POH 13772-007 7-25, 8-14; AMM 13773-002 Rev 7 Fig 32-10-1, PDF 1397). Lower fairing has an inboard attachment skirt enclosing the spring and axle, derived from their anchors with an illustrative 10 mm overlap. Outline approximate.",
    ext: true,
  });
  part(brakeDiscGeo, ["gear"], {
    pos: [MG.x, MG.y, discZ(s)],
    color: "#9AA3AA",
    ext: true,
    name: "Brake disc",
    note: "One static disc per main wheel (POH 13772-007 7-25; AMM 13773-002 Rev 7 Fig 32-42-1, PDF 1462). Approximate 0.24 m OD, 0.13 m bore and 0.016 m thickness; open centre clears the fixed axle/strut. Inboard offset 0.094 m is illustrative; caliper and pads are separate parts. Wheel assemblies remain static.",
  });
  const side = s > 0 ? "R" : "L";
  hydraulicPart(
    masterValvePath(s),
    0.0025,
    0,
    {
      name: `Brake valve hose (${side})`,
      note: "Tee to master-side valve outlet (AMM wording); approximate routing (" + hydraulicRef + ").",
    },
    side,
  );
  hydraulicPart(
    brakePath(s),
    0.0025,
    0,
    {
      name: `Brake valve line (${side})`,
      note: "Gear-side valve inlet (AMM wording) to wing-root bulkhead; approximate routing (" + hydraulicRef + ").",
    },
    side,
    true,
  );
  hydraulicPart(
    gearBrakePath(s),
    0.0025,
    0,
    {
      name: `Brake line (${side})`,
      ext: true,
      note:
        "Bulkhead to strut channel, union; retained clearance-tested route. Entry approximately 6.0 inches below strut top; waypoints and diameter illustrative (" +
        hydraulicRef +
        ").",
    },
    side,
    true,
  );
});
export const NOSE_GEAR: Vec3 = [3.06, -0.52, 0];
export const NOSE_CASTER: Vec3 = [0.22, -0.68, 0];
part(
  () =>
    tubeGeo(
      [
        [0, 0, 0],
        [0.09, -0.34, 0],
        [0.22, -0.66, 0],
      ],
      0.035,
    ),
  ["gear"],
  {
    parent: "noseGear",
    name: "Nose gear strut",
    note: "Tubular steel leg attached to the steel engine mount; separate oleo reacts against the mount (POH 13772-007 7-25; AMM 13773-002 Rev 7 32-20 p. 1, PDF 1408, Fig 32-20-2, PDF 1416). Outline approximate.",
    ext: true,
  },
);
part(() => new THREE.TorusGeometry(0.11675, 0.05325, 16, 32).scale(1, 1, 0.11 / 0.1065), ["gear"], {
  parent: "caster",
  pos: NOSE_WHEEL,
  color: "#2A2F33",
  name: "Nose wheel",
  note: "5.00 × 5 tubeless tire; 5 in rim, retained approximate 0.34 m diameter / 0.11 m width (AMM 13773-002 Rev 7 Fig 32-41-2, PDF 1449, has no dimensions). Free-castering ±85°; steer with differential braking (POH 7-25). Inflate to 30–35 psi (POH 8-14).",
  ext: true,
});
part(() => pantGeo(0.7, 0.17), ["gear"], {
  parent: "caster",
  pos: [0.02, 0.02, 0],
  scale: [1, 1, 0.7],
  fairing: true,
  name: "Nose wheel pant",
  note: "Removable wheel pant with a tire-inflation access door (POH 13772-007 7-25; AMM 13773-002 Rev 7 Fig 32-20-1, PDF 1413). Outline approximate.",
  ext: true,
});
part(() => box(0.04, 0.025, 0.07), ["gear"], {
  pos: PARK_HANDLE,
  name: "PARK BRAKE handle",
  note: "Right side kick plate by the pilot's right knee. Set toe brakes, then pull aft; pushed in, valve poppets are held open. Never set in flight (POH 13772-007 7-26). AMM 13773-002 Rev 7 32-42, PDF 1450 says LH kick plate; POH governs. Handle shape and placement approximate.",
  pin: true,
});
[-0.36, -0.14, 0.14, 0.36].forEach((z) => {
  const parent = z < 0 ? "rig:pedL" : "rig:pedR";
  part(() => box(0.04, 0.18, 0.09), ["gear", "controls"], {
    chan: ["rudder"],
    parent,
    pos: [2.42, -0.52, z],
    rot: [0, 0, 0.35],
    name: "Rudder pedal / toe brake",
    note: "Top half is the toe brake. Either pilot's left or right toe brake applies that side's brake. Pushing a pedal forward pulls its rudder cable (POH Fig. 7-3).",
  });
  part(() => cyl(0.018, 0.1), ["gear"], {
    parent,
    pos: [2.51, -0.58, z],
    color: "#8C959C",
    name: "Brake master cylinder",
    note: "One per rudder pedal, forward of the pedal. Either pilot's corresponding toe brake pressurizes that side (POH 13772-007 7-25; AMM 13773-002 Rev 7 32-42, PDF 1450, Fig 32-42-4 item 15, PDF 1476). Position and dimensions approximate.",
  });
});

/* ---------- gear detail: appended to preserve existing registration order ---------- */
// Drawing-derived shapes are illustrative: the AMM figures do not dimension these fittings/fairings.
const mainRef = "AMM 13773-002 Rev 7 32-10 p. 1, PDF 1392; Fig 32-10-2, PDF 1403";
const wheelRef = "AMM 13773-002 Rev 7 32-41 p. 1, PDF 1442; Fig 32-41-1, PDF 1446";
const noseRef = "AMM 13773-002 Rev 7 32-20 p. 1, PDF 1408; Fig 32-20-2, PDF 1416";
[1, -1].forEach((s) => {
  const upper = V(...mainStrutPath(s)[0]);
  const lower = wingP(s * 37 * 0.0254, 0.45, -1);
  part(() => box(0.2, 0.055, 0.09), ["gear"], {
    pos: upper.toArray() as Vec3,
    color: "#546F85",
    name: "Main gear upper attach fitting",
    note:
      "Clamps the inner strut end inside the lower wing depth; bolts to WS 27 and the lateral ribs. Center at WS 27.5 / 45% chord, 0.06 m above lower skin; 0.20 m chordwise width bridges the lateral ribs; placement and shape approximate (" +
      mainRef +
      ").",
  });
  part(
    () =>
      loft(
        sided(
          Array.from({ length: 9 }, (_, i) => {
            const z = lower.z + (i / 8 - 0.5) * 0.09 * s;
            const le = wingP(z, 0, 0).x,
              chord = le - wingP(z, 1, 0).x;
            return [
              [lower.x + 0.1, 0],
              [lower.x - 0.1, 0],
              [lower.x - 0.1, 0.045],
              [lower.x + 0.1, 0.045],
            ].map(([x, h]) =>
              wingP(z, (le - x) / chord, -1)
                .add(V(0, 0.001 + h, 0))
                .sub(lower),
            );
          }),
          s,
        ),
      ),
    ["gear"],
    {
      // Seated on the inner face of the lower skin, where a flat box centred on the skin crossing hung half
      // its depth below the wing. Its bottom follows the local lower skin with the lateral ribs' 1 mm inset, so it still
      // clamps the crossing; the 0.20 m chord, 0.09 m span and 45 mm depth are the retained illustrative sizes
      // (AMM 13773-002 Rev 7 Fig 32-10-2, PDF 1403).
      pos: lower.toArray() as Vec3,
      color: "#546F85",
      name: "Main gear lower attach fitting",
      note:
        "Clamps the strut where it passes through the lower wing skin at WS 37; bolts to WS 37 and the lateral ribs. 0.20 m chordwise width bridges the lateral ribs; seated on the lower skin's inner face with a 1 mm inset; shape and chord position approximate (" +
        mainRef +
        ").",
    },
  );
  [0.38, 0.52].forEach((chord) => {
    const a = wingP(s * 27 * 0.0254, chord, 0),
      b = wingP(s * 37 * 0.0254, chord, 0);
    const center = a.clone().add(b).multiplyScalar(0.5);
    // Loft both edges along their own local skins; 1 mm inset avoids solid-mode skin bleed.
    // Retained illustrative 25 mm thickness, AMM Fig 32-10-2 (PDF 1403).
    // Left-wing stations run outboard toward -z, so reverse their rings to keep the skins facing outward.
    const rings = sided(
      Array.from({ length: 17 }, (_, i) => {
        const z = a.z + ((b.z - a.z) * i) / 16;
        const c = 0.0125 / (wingP(z, 0, 0).x - wingP(z, 1, 0).x);
        return [
          [chord - c, -1],
          [chord + c, -1],
          [chord + c, 1],
          [chord - c, 1],
        ].map(([u, face]) =>
          wingP(z, u, face)
            .add(V(0, -face * 0.001, 0))
            .sub(center),
        );
      }),
      s,
    );
    part(() => loft(rings), ["gear"], {
      pos: center.toArray() as Vec3,
      color: "#AAB4BD",
      name: "Gear lateral rib",
      note:
        "One of two aluminum lateral ribs between WS 27 and WS 37. Follows the local lower-to-upper skins with an illustrative 1 mm inset; section and chord position approximate (" +
        mainRef +
        ").",
    });
  });
  part(
    () => {
      const path = mainFairingPath(s);
      const end = mainFairingEnd(s);
      return tubeGeo(
        Array.from({ length: 33 }, (_, i) => path.getPoint((end * i) / 32).toArray() as Vec3),
        MAIN_FAIRING_RADIUS,
        0,
      );
    },
    ["gear"],
    {
      name: "Main strut fairing",
      fairing: true,
      ext: true,
      note: "Exterior cover over the composite spring, starting at the WS 37 lower-skin exit and joining the lower wheel fairing’s inboard attachment skirt; the terminal ring is enclosed by the skirt with an illustrative 10 mm overlap; shape approximate (AMM 13773-002 Rev 7 Fig 32-10-1, PDF 1397, applicable to the modelled airplane).",
    },
  );
  part(() => cyl(0.0762, 0.115, "z", 32), ["gear"], {
    pos: [MG.x, MG.y, s * MG.z],
    color: "#BCC5CD",
    name: "Main wheel hub",
    ext: true,
    note: "Aluminum wheel with a nominal 6 in rim; width and shape approximate (POH 13772-007 7-25; " + wheelRef + ").",
  });
  part(() => cyl(0.023, MAIN_AXLE.length, "z"), ["gear"], {
    pos: [MG.x, MG.y, s * (MG.z - MAIN_AXLE.offset)],
    color: "#8C959C",
    name: "Main wheel axle",
    ext: true,
    note: "Axle fitted to the lower strut; dimensions approximate (" + mainRef + ").",
  });
  [-1, 1].forEach((side) =>
    part(() => cyl(0.033, 0.012, "z"), ["gear"], {
      pos: [MG.x, MG.y, s * MG.z + side * 0.051],
      color: "#67727D",
      name: "Main wheel sealed bearing",
      ext: true,
      note: "One of two sealed wheel bearings; dimensions approximate (" + wheelRef + ").",
    }),
  );
  part(() => cyl(0.027, 0.025, "z", 6), ["gear"], {
    pos: [MG.x, MG.y, s * (MG.z + 0.075)],
    color: "#BCC5CD",
    name: "Main axle nut",
    ext: true,
    note: "Secures wheel to axle with cotter pin; dimensions approximate (" + wheelRef + ").",
  });
  part(
    () =>
      tubeGeo(
        [
          [MG.x - 0.025, MG.y, s * (MG.z + 0.082)],
          [MG.x + 0.025, MG.y, s * (MG.z + 0.082)],
        ],
        0.003,
      ),
    ["gear"],
    {
      name: "Main axle cotter pin",
      color: "#BCC5CD",
      ext: true,
      note:
        "Passes through the axle inside the nut at an approximate 0.082 m outboard offset; shape approximate (" +
        wheelRef +
        ").",
    },
  );
  part(() => cyl(0.006, 0.025, "z"), ["gear"], {
    pos: [MG.x + 0.05, MG.y + 0.027, s * (MG.z + 0.065)],
    color: "#343C44",
    name: "Main tire valve stem",
    ext: true,
    note: "Tubeless inflation valve on the wheel; position and dimensions approximate (" + wheelRef + ").",
  });
  part(
    () =>
      tubeGeo(
        [
          [MG.x - 0.06, -1.12, s * (MG.z + 0.142)],
          [MG.x + 0.06, -1.12, s * (MG.z + 0.142)],
          [MG.x + 0.06, -1.05, s * (MG.z + 0.125)],
          [MG.x - 0.06, -1.05, s * (MG.z + 0.125)],
          [MG.x - 0.06, -1.12, s * (MG.z + 0.142)],
        ],
        0.003,
        0,
      ),
    ["gear"],
    {
      name: "Wheel pant access door",
      color: "#65717D",
      ext: true,
      note: "Door for tire inflation and pressure checking; outline and placement approximate (POH 13772-007 7-25; AMM 13773-002 Rev 7 Fig 32-10-1 item 9, PDF 1397).",
    },
  );
});
// Oleo is at the upper end of the steel leg, reacting against the mount, not telescoping at the fork.
part(
  () =>
    tubeGeo(
      [
        [0.035, -0.02, 0],
        [0.075, -0.17, 0],
      ],
      0.052,
    ),
  ["gear"],
  {
    parent: "noseGear",
    name: "Nose oleo cylinder",
    color: "#7F8B96",
    ext: true,
    note: "Nitrogen and hydraulic-fluid filled oleo; geometry approximate (" + noseRef + ").",
  },
);
part(
  () =>
    tubeGeo(
      [
        [0.015, 0.055, 0],
        [0.045, -0.08, 0],
      ],
      0.023,
    ),
  ["gear"],
  {
    parent: "noseGear",
    name: "Nose oleo piston rod",
    color: "#CDD6DE",
    ext: true,
    note: "Compression reacts against the engine mount; geometry approximate (" + noseRef + ").",
  },
);
part(
  () =>
    tubeGeo(
      [
        [0, 0, 0],
        [0.09, -0.34, 0],
        [0.22, -0.6, 0],
      ],
      0.058,
    ),
  ["gear"],
  {
    parent: "noseGear",
    name: "Nose strut fairing",
    fairing: true,
    ext: true,
    note: "Leg cover; outline approximate (AMM 13773-002 Rev 7 Fig 32-20-1 item 1, PDF 1413).",
  },
);
[-1, 1].forEach((s) => {
  part(() => noseForkGeo(s), ["gear"], {
    parent: "caster",
    name: "Nose wheel fork",
    color: "#9DA9B3",
    ext: true,
    note: "Fork arms hold an independent wheel axle; shape approximate (AMM 13773-002 Rev 7 Fig 32-20-4, PDF 1429; Fig 32-41-2, PDF 1449).",
  });
  part(() => cyl(0.028, 0.012, "z"), ["gear"], {
    parent: "caster",
    pos: [0.02, 0, s * 0.041],
    name: "Nose wheel sealed bearing",
    color: "#65717D",
    ext: true,
    note: "One of two sealed bearings; dimensions approximate (AMM 13773-002 Rev 7 32-41, PDF 1442).",
  });
  part(() => cyl(0.034, 0.005, "z"), ["gear"], {
    parent: "caster",
    pos: [0.02, 0, s * 0.05],
    name: "Nose wheel bearing seal",
    color: "#343C44",
    ext: true,
    note: "Wheel-bearing seal; shape approximate (AMM 13773-002 Rev 7 32-20, PDF 1408).",
  });
});
part(() => cyl(0.0635, 0.095, "z", 32), ["gear"], {
  parent: "caster",
  pos: NOSE_WHEEL,
  name: "Nose wheel hub",
  color: "#BCC5CD",
  ext: true,
  note: "Aluminum wheel, nominal 5 in rim; width and shape approximate (POH 13772-007 7-25; AMM 13773-002 Rev 7 32-41, PDF 1442; Fig 32-41-2, PDF 1449).",
});
part(() => cyl(0.02, 2 * (NOSE_PIN[2] + 0.003), "z"), ["gear"], {
  parent: "caster",
  pos: NOSE_WHEEL,
  name: "Nose wheel axle",
  color: "#8C959C",
  ext: true,
  note: "Independent axle through the fork, extended through the nut and cotter pin; length derived from pin center plus its 3 mm radius, dimensions approximate (AMM 13773-002 Rev 7 Fig 32-41-2 item 7, PDF 1449).",
});
part(() => cyl(NOSE_NUT_RADIUS, NOSE_NUT_THICKNESS, "z", 6), ["gear"], {
  parent: "caster",
  pos: NOSE_NUT,
  name: "Nose axle nut",
  color: "#BCC5CD",
  ext: true,
  note: "Axle-bolt nut resting on the fork outer face; 10 mm thickness illustrative, dimensions approximate (AMM 13773-002 Rev 7 Fig 32-41-2 item 2, PDF 1449).",
});
part(
  () =>
    tubeGeo(
      [
        [NOSE_PIN[0] - 0.028, NOSE_PIN[1], NOSE_PIN[2]],
        [NOSE_PIN[0] + 0.028, NOSE_PIN[1], NOSE_PIN[2]],
      ],
      0.003,
    ),
  ["gear"],
  {
    parent: "caster",
    name: "Nose axle cotter pin",
    color: "#BCC5CD",
    ext: true,
    note: "Locks the axle-bolt nut; ends protrude beyond its faces, length/shape approximate (AMM 13773-002 Rev 7 Fig 32-41-2 item 1, PDF 1449).",
  },
);
part(() => cyl(0.005, 0.02, "z"), ["gear"], {
  parent: "caster",
  pos: [NOSE_WHEEL[0] + 0.041, NOSE_WHEEL[1] + 0.023, NOSE_WHEEL[2] - 0.053],
  name: "Nose tire valve stem",
  color: "#343C44",
  ext: true,
  note: "Tubeless inflation valve on the LH wheel face, on the same side as the pant access door (AMM 13773-002 Rev 7 Fig 32-20-1 item 4, PDF 1413); position and dimensions approximate (32-41, PDF 1442; Fig 32-41-2, PDF 1449).",
});
part(
  () =>
    tubeGeo(
      [
        [-0.13, 0.04, -0.108],
        [-0.03, 0.04, -0.114],
        [-0.03, 0.1, -0.085],
        [-0.13, 0.1, -0.08],
        [-0.13, 0.04, -0.108],
      ],
      0.003,
      0,
    ),
  ["gear"],
  {
    parent: "caster",
    name: "Nose pant access door",
    color: "#65717D",
    ext: true,
    note: "Tire-inflation door on the LH face of the aft pant, aft of the axle; outline and position approximate (POH 13772-007 7-25; AMM 13773-002 Rev 7 Fig 32-20-1 item 4, PDF 1413, applicable to the modelled airplane).",
  },
);

/* ---------- brake detail: append new hardware after existing registrations ---------- */
const brakeRef = "AMM 13773-002 Rev 7 Fig 32-42-1, PDF 1462";
const cabinBrakeRef = "AMM 13773-002 Rev 7 32-42, PDF 1450, Fig 32-42-4, PDF 1476";
[1, -1].forEach((s) => {
  const caliper = brakeCaliper(s);
  part(() => caliperGeo(s), ["gear"], {
    pos: caliper,
    ext: true,
    pin: true,
    pinIn: [], // Keep catalogue pin; suppress floating label over the wheel pant.
    name: "Brake caliper",
    anim: brakeAnim(() => brakeAmount(useSR22T.getState().s.gear, s > 0 ? "R" : "L")),
    note:
      "Fixed single cylinder, dual piston caliper on the inboard torque plate (POH 13772-007 7-25; " +
      brakeRef +
      "). Open housing with two bores exposes the pistons; bridge passes aft of the disc OD, with pads between cylinder and back plate (items 5, 8, 10, 12). Dimensions/placement approximate; glow is a model cue for applied pressure, not temperature.",
  });
  part(() => box(0.02, 0.08, 0.008), ["gear"], {
    pos: [MG.x - 0.14, MG.y, discZ(s) - s * 0.055],
    ext: true,
    color: "#67727D",
    name: "Brake torque plate",
    note: "Fixed support for the caliper anchor bolts; approximate shape (" + brakeRef + ").",
  });
  [-1, 1].forEach((face) => {
    part(() => box(0.02, 0.066, 0.004), ["gear"], {
      pos: [MG.x - 0.105, MG.y, discZ(s) + face * 0.01],
      color: "#343C44",
      ext: true,
      name: "Brake pad",
      note:
        "Pad pair straddles the single disc inside each caliper; shape and placement approximate (AMM 13773-002 Rev 7 32-42, PDF 1450; " +
        brakeRef +
        ").",
    });
    part(() => cyl(0.012, 0.039, "z"), ["gear"], {
      pos: [MG.x - 0.105, MG.y + face * 0.018, discZ(s) - s * 0.0315],
      ext: true,
      color: "#BCC5CD",
      name: "Brake caliper piston",
      note: "Two pistons in the fixed caliper; illustrative shape and spacing (POH 13772-007 7-25; " + brakeRef + ").",
    });
  });
  part(() => cyl(0.009, 0.02, "y"), ["gear"], {
    pos: [MG.x - 0.105, MG.y + 0.05, discZ(s) - s * 0.04],
    ext: true,
    name: "Brake temperature sensor",
    note: "Sensor on each brake assembly feeds avionics caution/warning (POH 13772-007 7-25). Caution 270–293 °F, warning above 293 °F (AMM 13773-002 Rev 7 32-42, PDF 1450; Fig 32-42-2, PDF 1465). ENGINE INSTR: AMM says Main Bus 2; POH 7-78 says ESS BUS 2, which governs. Shape and placement approximate; brake temperature is not simulated.",
  });
  part(() => box(0.006, 0.012, 0.003), ["gear"], {
    pos: [MG.x - 0.085, MG.y, discZ(s) - s * 0.0525],
    color: "#FFFFFF",
    ext: true,
    name: "Brake temperature indicator",
    note: "Physical indicator on each caliper piston housing turns black above 450 °F (AMM 32-42, PDF 1461; AMM 13773-002 Rev 7). This threshold is separate from CAS caution/warning. Drawn white by default; the AMM describes a red indicator activating at 450 °F. Temperature is not simulated. Shape approximate.",
  });
  part(() => box(0.035, 0.035, 0.06), ["gear"], {
    pos: brakeTee(s),
    color: "#BCC5CD",
    name: "Brake tee fitting",
    note:
      "Joins pilot/copilot master cylinder plumbing for the corresponding brake; shape and placement approximate (" +
      cabinBrakeRef +
      ", item 8).",
  });
  part(() => box(0.024, 0.022, 0.02), ["gear"], {
    pos: masterPort(s),
    color: "#BCC5CD",
    name: "Brake elbow fitting",
    note:
      "Turns the corresponding hydraulic circuit at the parking valve; representative elbow, shape and placement approximate (" +
      cabinBrakeRef +
      ", item 1).",
  });
  part(() => cyl(0.007, 0.016, "x", 6), ["gear"], {
    pos: brakeUnion(s),
    ext: true,
    color: "#BCC5CD",
    name: "Brake union fitting",
    note:
      "Representative union at the rigid-line/flexible-hose junction; shape and placement approximate (" +
      cabinBrakeRef +
      ", item 2; AMM Fig 32-42-3, PDF 1469).",
  });
  part(() => cyl(0.017, 0.04, "z", 6), ["gear"], {
    pos: brakeBulkhead(s),
    color: "#BCC5CD",
    name: "Brake bulkhead fitting",
    note:
      "Line passes from fuselage into wing through bulkhead/composite bulkhead fittings; representative fitting, shape and placement approximate (" +
      cabinBrakeRef +
      ", items 6–7).",
  });
  part(() => cyl(0.005, 0.006, "x", 6), ["gear"], {
    pos: brakeInlet(s),
    name: "Brake caliper fitting",
    ext: true,
    note: "Flexible hose terminates on the caliper fitting; shape/placement illustrative (AMM 13773-002 Rev 7 Fig 32-42-5 items 9/10, PDF 1481).",
  });
  hydraulicPart(
    [brakeUnion(s), [MG.x - 0.16, MG.y - 0.02, discZ(s) - s * 0.04], brakeInlet(s)],
    0.006,
    0,
    {
      color: "#343C44",
      ext: true,
      name: "Brake hose",
      note: "Flexible hose at the caliper end of the strut brake line; shape and routing approximate (AMM 13773-002 Rev 7 Figs 32-42-3/5, PDF 1469/1481).",
    },
    s > 0 ? "R" : "L",
    true,
  );
});
part(() => cyl(0.005, 0.008, "y", 6), ["gear"], {
  pos: BRAKE_FITTINGS.reservoirUnion,
  name: "Brake reservoir feed union",
  note: "Union at reservoir-feed junction; illustrative shape/placement (AMM 13773-002 Rev 7 Fig 32-42-4 item 2, PDF 1476).",
});
part(() => new THREE.TorusGeometry(0.028, 0.002, 8, 20).rotateX(Math.PI / 2), ["gear"], {
  pos: BRAKE_RESERVOIR,
  name: "Brake reservoir clamp",
  note: "Reservoir clamped on battery bracket; approximate clamp (AMM 13773-002 Rev 7 Fig 32-42-4 item 14, PDF 1476).",
});
part(() => cyl(0.025, 0.06), ["gear"], {
  pos: BRAKE_RESERVOIR,
  pin: true,
  name: "Brake fluid reservoir",
  note:
    "MIL-PRF-87257 hydraulic fluid (POH 13772-007 7-25). Upper RH firewall in the engine compartment (" +
    cabinBrakeRef +
    ", item 13). Cylinder dimensions and placement approximate.",
});
part(
  () =>
    mergeGeos([
      box(0.09, 0.007, 0.07).translate(0, 0.025, 0),
      box(0.007, 0.052, 0.07).translate(-0.0415, -0.0045, 0),
      box(0.007, 0.052, 0.07).translate(0.0415, -0.0045, 0),
      // Base meets line-port tops and seat bottoms; narrow rear rail joins master elbows.
      cyl(0.006, 0.004, "x").translate(0.047, 0, 0),
      box(0.09, 0.011, 0.07).translate(0, -0.0295, 0),
      box(0.09, 0.022, 0.005).translate(0, 0, -0.0325),
      box(0.09, 0.022, 0.005).translate(0, 0, 0.0325),
    ]),
  ["gear"],
  {
    pos: PARK_VALVE,
    pin: true,
    name: "Parking brake valve",
    fairing: true,
    note:
      "Adjacent to firewall, LH side of outboard console rib (" +
      cabinBrakeRef +
      "). Illustrative cutaway base joins ports and seats; rear rails join master elbows and a forward pivot boss supports the arm (AMM 32-42 PDF 1471; Fig 32-42-4 PDF 1479). Both independent wheel circuits pass through it. Handle in holds poppets open; pulling out traps applied brake pressure (POH 13772-007 7-26). Shape and placement approximate.",
  },
);
part(() => box(0.009, 0.02, 0.01).translate(0, -0.01, 0), ["gear"], {
  pos: PARK_ARM,
  rot: [parkArmAngle(0), 0, 0],
  name: "Parking brake actuation arm",
  anim: (m) => {
    m.rotation.x = parkArmAngle(useSR22T.getState().s.gear.park ? 1 : 0);
  },
  note: "Cable-operated arm on the forward, firewall-facing valve face (AMM 13773-002 Rev 7 32-42 p. 22, PDF 1471; Fig 32-42-4, PDF 1479). Upper-end pivot and inset clevis attachment; dimensions, 60 degree OFF inclination and additional 30 degree rotation illustrative.",
});
part(() => tubeGeo(PARK_CABLE, 0.003, 0), ["gear"], {
  name: "Parking brake control cable",
  note: "Fixed sheath across firewall and over outboard console rib; POH right kick plate governs AMM LH wording. Radius and route approximate (POH 13772-007 7-26; AMM 13773-002 Rev 7 32-42 PDF 1474–1475, Fig 32-42-4 PDF 1479).",
});
part(() => tubeGeo(parkWire(0), 0.001, 0), ["gear"], {
  name: "Parking brake cable core",
  dynamicGeo: true,
  anim: parkTubeAnim(parkWire, 0.001),
  note: "Exposed moving wire from fixed sheath through stop to free-end clevis; upstream end slides inside sheath. Core travel derived from arm arc; radius and placement illustrative (AMM 13773-002 Rev 7 PDF 1475; Fig 32-42-4 sheet 4 items 17, 23–25, PDF 1479).",
});
part(() => new THREE.TorusGeometry(0.006, 0.0015, 8, 16).rotateX(Math.PI / 2), ["gear"], {
  pos: PARK_STOP,
  name: "Parking brake cable stop",
  anim: (m) => {
    m.position.set(...parkStop(useSR22T.getState().s.gear.park ? 1 : 0));
  },
  note: "OFF: 1.8 inch (4.6 cm) exposed cable from sheath to stop (AMM 13773-002 Rev 7 PDF 1475; Fig 32-42-4 PDF 1479). Shape approximate.",
});
part(() => cyl(0.004, 0.015, "x"), ["gear"], {
  pos: PARK_CLEVIS,
  anim: (m) => {
    m.position.set(...parkClevis(useSR22T.getState().s.gear.park ? 1 : 0));
  },
  name: "Parking brake clevis pin",
  note: "Cable wrapped 1–2 turns at clevis; approximate pin (AMM 13773-002 Rev 7 PDF 1475; Fig 32-42-4 sheets 4/5, PDF 1479/1480).",
});
// One-and-a-half turns; 5 mm centreline radius minus 1 mm wire radius contacts the 4 mm pin.
part(() => tubeGeo(parkWrap(0), 0.001, 0), ["gear"], {
  name: "Parking brake clevis cable wrap",
  dynamicGeo: true,
  anim: parkTubeAnim(parkWrap, 0.001),
  note: "Cable wraps 1–2 turns around free-end clevis; 1.5 turns shown. Wire and pin radii illustrative, wrap contacts pin (AMM 13773-002 Rev 7 32-42 PDF 1475; Fig 32-42-4 sheets 4/5 item 17, PDF 1479/1480).",
});
part(() => box(0.09, 0.004, 0.054), ["gear"], {
  pos: PARK_BRACKET,
  name: "Parking brake valve bracket",
  note: "Bracket on LH outboard console rib by firewall; shape approximate (AMM 13773-002 Rev 7 Fig 32-42-4 item 19, PDF 1479).",
});
for (const side of ["L", "R"] as const) {
  const port = side === "L" ? PARK_VALVE_PORT.lhLine : PARK_VALVE_PORT.rhLine;
  const y = PARK_VALVE[1] - 0.015;
  part(() => cyl(0.007, 0.006, "y"), ["gear"], {
    pos: [port[0], y, port[2]],
    name: "Parking brake poppet",
    anim: (m) => {
      m.position.y = y + (useSR22T.getState().s.gear.park ? 0 : 0.012);
    },
    note: "Poppets held open with handle IN; OUT holds applied pressure (POH 13772-007 7-26). One per side, arrangement/travel illustrative: Cirrus documents do not show internals.",
  });
  part(
    () =>
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.004, -0.003),
          new THREE.Vector2(0.01, -0.003),
          new THREE.Vector2(0.01, 0.003),
          new THREE.Vector2(0.004, 0.003),
          new THREE.Vector2(0.004, -0.003),
        ],
        24,
      ),
    ["gear"],
    {
      pos: [port[0], y - 0.006, port[2]],
      name: "Parking brake poppet seat",
      note: "Illustrative seat: poppet rests on its top face when PARK is pulled and lifts with handle IN; internal geometry unsourced (POH 13772-007 7-26 mechanism).",
    },
  );
  part(() => cyl(0.009, 0.01, "y", 6), ["gear"], {
    pos: port,
    name: "Brake valve line port",
    note: `${side === "L" ? "LH forward" : "RH aft"} gear-side inlet (AMM wording, opposite pressure flow), shape/spacing approximate (AMM 13773-002 Rev 7 PDF 1472; Fig 32-42-4 PDF 1479).`,
  });
}
part(() => box(0.028, 0.016, 0.025), ["gear"], {
  pos: [PARK_BRACKET[0] + 0.0305, PARK_BRACKET[1] + 0.002 + 0.008, PARK_ARM[2]],
  name: "Parking brake position sensor",
  note:
    "Mounted on bracket 19 adjacent to valve actuation arm (AMM Fig 32-42-4 sheet 4 items 19/26, PDF 1479); sends position to MFD through GEA 71 for PARK BRAKE CAS (" +
    cabinBrakeRef +
    "; POH 13772-007 3A-27). Shape and placement approximate.",
});
// One reservoir feed, then separate branches: AMM Fig 32-42-4 items 1, 6/7, 9, 13 (PDF 1476).
hydraulicPart([BRAKE_FITTINGS.reservoir, BRAKE_FITTINGS.reservoirUnion], 0.004, 0, {
  name: "Brake reservoir feed",
  note:
    "Single reservoir supply trunk, beside BAT 1 and clear of the mixing chamber, through the firewall fitting to the cylinder supply branches; radius 0.004 m, size/routing illustrative (POH 13772-007 7-25; " +
    cabinBrakeRef +
    ", items 9, 13).",
});
// One supply circuit, represented by adjacent pipe pieces at the upper bend and firewall fitting.
// Each piece's box stays local to its own engine/cabin routing (AMM Fig32-42-4 PDF1476).
hydraulicPart([BRAKE_FITTINGS.reservoirUnion, [FW + 0.015, -0.37, 0.46], SUPPLY_FW], 0.004, 0, {
  name: "Brake reservoir feed (engine)",
  note: "Engine-side continuation of the reservoir feed, beside BAT 1 to the named firewall bulkhead fitting. Radius 0.004 m and routing approximate (POH 13772-007 7-25; AMM 13773-002 Rev 7 Fig32-42-4 items6/7/9/13, PDF1476).",
});
hydraulicPart([SUPPLY_FW, [FW - 0.02, -0.37, 0.46], [2.47, -0.37, 0.46], SUPPLY_SPLIT], 0.004, 0, {
  name: "Brake reservoir feed (cabin)",
  note: "Cabin-side continuation of the single reservoir feed, from the firewall bulkhead fitting to the cylinder supply junction. Radius 0.004 m and waypoints approximate (POH 13772-007 7-25; AMM 13773-002 Rev 7 Fig 32-42-4 items 6/7/9, PDF1476).",
});
part(() => cyl(0.008, 0.012, "x", 6), ["gear"], {
  pos: SUPPLY_FW,
  name: "Brake supply firewall fitting",
  note:
    "Representative bulkhead fitting where the reservoir feed crosses the firewall; shape/placement approximate (" +
    cabinBrakeRef +
    ", items 6–7).",
});
part(() => box(0.036, 0.016, 0.02), ["gear"], {
  pos: SUPPLY_SPLIT,
  name: "Brake supply branch fitting",
  note:
    "Representative junction of the single reservoir feed and four cylinder supplies; geometry approximate (" +
    cabinBrakeRef +
    ").",
});
[-0.36, -0.14, 0.14, 0.36].forEach((z, i) => {
  const s = toeSide(z);
  const x = supplyX(i);
  const supplyY = -0.54 - i * 0.01;
  hydraulicPart(
    [
      BRAKE_FITTINGS[`supplyTee${i}`],
      [x, -0.54, z],
      [x, supplyY, z],
      [2.51, supplyY, z],
      BRAKE_FITTINGS[`master${i}Supply`],
    ],
    0.003,
    0,
    {
      name: "Brake reservoir supply line",
      note:
        "Supply branch to the top port of one master cylinder; routing and 0.003 m radius approximate (POH 13772-007 7-25; " +
        cabinBrakeRef +
        ").",
    },
  );
  hydraulicPart(
    [
      BRAKE_FITTINGS[`master${i}Pressure`],
      [s < 0 ? 2.535 : 2.485, -0.63, z],
      [s < 0 ? 2.535 : 2.485, s < 0 ? -0.63 : -0.61, z],
      [s < 0 ? 2.535 : 2.485, s < 0 ? -0.63 : -0.61, s < 0 ? -0.2 : z < 0 ? 0.19 : 0.21],
      [s < 0 ? 2.535 : 2.485, brakeTee(s)[1], s < 0 ? -0.2 : z < 0 ? 0.19 : 0.21],
      [brakeTee(s)[0], brakeTee(s)[1], s < 0 ? -0.2 : z < 0 ? 0.19 : 0.21],
      brakeTee(s),
    ],
    0.004,
    0,
    {
      name: "Brake master cylinder line",
      note:
        "Pressure branch from cylinder lower port to corresponding-side tee: pilot left (-0.36) and copilot left (+0.14) → L; pilot right (-0.14) and copilot right (+0.36) → R. Model station coordinates and 0.004 m radius approximate (POH 13772-007 7-25; " +
        cabinBrakeRef +
        ", item 8).",
    },
    s > 0 ? "R" : "L",
  );
});
